import asyncio
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import yt_dlp
from fastapi import HTTPException

from app.config import settings
from app.supabase import supabase


@dataclass
class DownloadJob:
    job_id: str
    video_id: str
    url: str
    status: str = "queued"  # queued | downloading | completed | canceled | failed
    progress: float = 0.0
    downloaded_bytes: int | None = None
    total_bytes: int | None = None
    eta: int | None = None
    speed: float | None = None
    filename: str | None = None
    error: str | None = None
    created_at: datetime = datetime.now(timezone.utc)
    updated_at: datetime = datetime.now(timezone.utc)
    cancel_requested: bool = False


_JOBS: dict[str, DownloadJob] = {}
_TASKS: dict[str, asyncio.Task] = {}
_JOB_LOCK = asyncio.Lock()


def _downloads_dir(folder_id: str, job_id: str) -> Path:
    base = Path(settings.DOWNLOADS_DIR)
    path = base / folder_id / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _video_suffix(job: DownloadJob) -> str:
    return f"{job.job_id}.%(ext)s"


def _progress_hook(job_id: str):
    def hook(d: dict[str, Any]):
        job = _JOBS.get(job_id)
        if not job:
            return

        job.updated_at = datetime.now(timezone.utc)
        status = d.get("status")

        if job.cancel_requested:
            raise yt_dlp.utils.DownloadError("Download cancelled by user")

        if status == "downloading":
            job.status = "downloading"
            downloaded = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            job.downloaded_bytes = int(downloaded)
            job.total_bytes = int(total) if total else None
            if total:
                job.progress = round((downloaded / total) * 100, 2)
            job.eta = d.get("eta")
            job.speed = d.get("speed")
            job.filename = d.get("filename") or job.filename
        elif status == "finished":
            job.status = "processing"
            if d.get("filename") and not job.filename:
                job.filename = d.get("filename")

    return hook


def _download_sync(job_id: str, folder_id: str, url: str) -> None:
    job = _JOBS[job_id]
    output_dir = _downloads_dir(folder_id, job_id)

    ydl_opts: dict[str, Any] = {
        "outtmpl": str(output_dir / _video_suffix(job)),
        "format": "bestvideo+bestaudio/best",
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "progress_hooks": [_progress_hook(job_id)],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])


async def _run_job(job_id: str, folder_id: str, url: str) -> None:
    job = _JOBS[job_id]
    try:
        job.status = "downloading"
        await asyncio.to_thread(_download_sync, job_id, folder_id, url)
        if job.cancel_requested:
            job.status = "canceled"
        else:
            job.status = "completed"
            job.progress = 100.0
    except Exception as exc:
        if job.cancel_requested:
            job.status = "canceled"
            job.error = None
        else:
            job.status = "failed"
            job.error = str(exc)
    finally:
        job.updated_at = datetime.now(timezone.utc)


async def start_download_for_video(video_id: UUID) -> dict[str, Any]:
    video = await fetch_video_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    job_id = str(uuid4())
    job = DownloadJob(
        job_id=job_id,
        video_id=str(video_id),
        url=video["url"],
        status="queued",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    async with _JOB_LOCK:
        _JOBS[job_id] = job
        task = asyncio.create_task(_run_job(job_id, str(video["folder_id"]), video["url"]))
        _TASKS[job_id] = task

    return asdict(job)


async def fetch_video_by_id(video_id: UUID) -> dict[str, Any] | None:
    def _query():
        return (
            supabase.table("videos")
            .select("*")
            .eq("id", str(video_id))
            .limit(1)
            .execute()
        )

    result = await asyncio.to_thread(_query)
    return result.data[0] if result.data else None


async def get_job(job_id: str) -> dict[str, Any] | None:
    job = _JOBS.get(job_id)
    return asdict(job) if job else None


async def cancel_job(job_id: str) -> dict[str, Any]:
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Download job not found")

    job.cancel_requested = True
    job.updated_at = datetime.now(timezone.utc)

    task = _TASKS.get(job_id)
    if task and not task.done():
        # yt-dlp will stop on the progress hook exception.
        task.cancel()

    job.status = "canceled"
    return asdict(job)
