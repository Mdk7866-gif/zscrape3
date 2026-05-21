import logging
import os
import re
import shutil
import tempfile
import threading
import uuid
from datetime import datetime
from typing import Optional

import yt_dlp
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.supabase import supabase

router = APIRouter(prefix="/download", tags=["download"])
logger = logging.getLogger(__name__)

# ── Global job store ──────────────────────────────────────────────────────────
# job_id -> dict with all state
jobs: dict[str, dict] = {}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _delete_path(path: str) -> None:
    try:
        if os.path.isfile(path):
            os.remove(path)
        elif os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass


def _safe_filename(name: str) -> str:
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    name = name.strip().replace(" ", "_")
    return name[:100] or "video"


# ── Blocking download (runs in thread pool) ───────────────────────────────────

def _download_sync(job: dict) -> None:
    """
    Runs in a background thread. Downloads the video using yt-dlp into a
    per-job temp directory, then sets job['file_path'] and job['filename']
    on success.
    """
    job_id = job["job_id"]
    url = job["url"]
    cancel_event: threading.Event = job["cancel_event"]

    tmp_dir = tempfile.mkdtemp(prefix="zscrape_dl_")
    job["tmp_dir"] = tmp_dir
    job["status"] = "downloading"

    out_tmpl = os.path.join(tmp_dir, "%(title)s.%(ext)s")

    def _progress_hook(d: dict) -> None:
        if cancel_event.is_set():
            raise yt_dlp.utils.DownloadError("Cancelled by user")

        if d["status"] == "downloading":
            downloaded = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            job["downloaded_bytes"] = downloaded
            job["total_bytes"] = total
            job["speed"] = d.get("speed") or 0.0
            job["eta"] = d.get("eta") or 0
            # Cap at 94% — last 6% is for ffmpeg merge
            job["progress"] = min(94, int(downloaded / total * 94)) if total else 0
            job["updated_at"] = datetime.utcnow()

        elif d["status"] == "finished":
            # Single stream finished, ffmpeg merging may still happen
            job["progress"] = 96
            job["updated_at"] = datetime.utcnow()

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "format": (
            "bestvideo[vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo[vcodec^=avc]+bestaudio[ext=m4a]"
            "/bestvideo[ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo+bestaudio"
            "/best"
        ),
        "outtmpl": out_tmpl,
        "noplaylist": True,
        "merge_output_format": "mp4",
        "progress_hooks": [_progress_hook],
        "postprocessors": [{"key": "FFmpegVideoConvertor", "preferedformat": "mp4"}],
        "socket_timeout": 60,
        "retries": 5,
        "fragment_retries": 5,
    }

    try:
        if cancel_event.is_set():
            job["status"] = "cancelled"
            _delete_path(tmp_dir)
            return

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        if info is None:
            raise ValueError("yt-dlp returned no info")

        # Resolve the final output file path
        file_path: Optional[str] = None
        try:
            file_path = info["requested_downloads"][0]["filepath"]
        except (KeyError, IndexError, TypeError):
            pass

        if not file_path or not os.path.exists(file_path):
            # Fallback: find the largest file in tmp_dir
            files = [
                os.path.join(tmp_dir, f)
                for f in os.listdir(tmp_dir)
                if os.path.isfile(os.path.join(tmp_dir, f))
            ]
            if not files:
                raise ValueError("No output file found after download")
            file_path = max(files, key=os.path.getsize)

        if cancel_event.is_set():
            job["status"] = "cancelled"
            _delete_path(file_path)
            _delete_path(tmp_dir)
            return

        raw_title = info.get("title") or "video"
        ext = os.path.splitext(file_path)[1] or ".mp4"
        job["filename"] = _safe_filename(raw_title) + ext
        job["file_path"] = file_path
        job["status"] = "completed"
        job["progress"] = 100
        job["updated_at"] = datetime.utcnow()
        logger.info(f"Download completed: {file_path}")

    except yt_dlp.utils.DownloadError as e:
        err_str = str(e)
        if "Cancelled" in err_str or cancel_event.is_set():
            job["status"] = "cancelled"
        else:
            job["status"] = "failed"
            job["error"] = err_str
            logger.error(f"yt-dlp error for job {job_id}: {err_str}")
        _delete_path(tmp_dir)

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["updated_at"] = datetime.utcnow()
        logger.error(f"Download error for job {job_id}: {e}")
        _delete_path(tmp_dir)


# ── Routes ────────────────────────────────────────────────────────────────────

from pydantic import BaseModel

class StartDownloadRequest(BaseModel):
    video_id: str


@router.post("/start")
def start_download(request: StartDownloadRequest):
    # Fetch the video URL from Supabase
    try:
        response = supabase.table("videos").select("url").eq("id", request.video_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Video not found")
        video_url = response.data[0]["url"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    job_id = str(uuid.uuid4())
    now = datetime.utcnow()

    job = {
        "job_id": job_id,
        "video_id": request.video_id,
        "url": video_url,
        "status": "queued",
        "progress": 0,
        "downloaded_bytes": 0,
        "total_bytes": 0,
        "eta": 0,
        "speed": 0.0,
        "filename": None,
        "file_path": None,
        "tmp_dir": None,
        "error": None,
        "cancel_event": threading.Event(),
        "created_at": now,
        "updated_at": now,
    }
    jobs[job_id] = job

    # Start download in a background daemon thread
    t = threading.Thread(target=_download_sync, args=(job,), daemon=True)
    t.start()

    return {"success": True, "job_id": job_id, "status": "queued"}


@router.get("/progress/{job_id}")
def get_download_progress(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "success": True,
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "downloaded_bytes": job["downloaded_bytes"],
        "total_bytes": job["total_bytes"],
        "eta": job["eta"],
        "speed": job["speed"],
        "error": job["error"],
    }


@router.post("/cancel/{job_id}")
def cancel_download(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job["cancel_event"].set()
    job["status"] = "cancelled"
    job["updated_at"] = datetime.utcnow()

    return {"success": True, "job_id": job_id, "status": "cancelled"}


@router.get("/file/{job_id}")
def serve_file(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] == "failed":
        raise HTTPException(status_code=422, detail=job.get("error", "Download failed"))
    if job["status"] == "cancelled":
        raise HTTPException(status_code=410, detail="Download was cancelled")
    if job["status"] != "completed":
        raise HTTPException(status_code=425, detail=f"File not ready yet (status: {job['status']})")

    file_path = job.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    filename = job.get("filename") or os.path.basename(file_path)
    tmp_dir = job.get("tmp_dir")

    def cleanup():
        _delete_path(file_path)
        if tmp_dir:
            _delete_path(tmp_dir)
        jobs.pop(job_id, None)

    return FileResponse(
        path=file_path,
        media_type="video/mp4",
        filename=filename,
        background=BackgroundTask(cleanup),
    )
