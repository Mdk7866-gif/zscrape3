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
from pydantic import BaseModel
from starlette.background import BackgroundTask

from app.supabase import supabase
from app.ytdlp_common import apply_youtube_opts

router = APIRouter(prefix="/download", tags=["download"])
logger = logging.getLogger(__name__)

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# Resolve cookie path once at module load — avoids repeated filesystem calls per request
_COOKIE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "cookies.txt")
_HAS_COOKIES = os.path.exists(_COOKIE_PATH)

# ── Global job store ──────────────────────────────────────────────────────────
jobs: dict[str, dict] = {}


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


def _get_platform(url: str) -> str:
    url_lower = url.lower()
    if "twitter.com" in url_lower or "x.com" in url_lower:
        return "twitter"
    if "instagram.com" in url_lower:
        return "instagram"
    if "facebook.com" in url_lower or "fb.watch" in url_lower:
        return "facebook"
    if "reddit.com" in url_lower or "redd.it" in url_lower:
        return "reddit"
    if "tiktok.com" in url_lower:
        return "tiktok"
    return "other"


def _get_ydl_opts(platform: str, out_tmpl: str, progress_hook, cancel_event) -> dict:
    """
    Returns yt-dlp options tuned per platform.
    Key rule: NEVER use FFmpegVideoConvertor (re-encodes, slow, may output AV1).
    Use FFmpegVideoRemuxer to simply re-wrap into mp4 container (fast, lossless).
    """
    base = {
        "quiet": True,
        "no_warnings": True,
        "outtmpl": out_tmpl,
        "noplaylist": True,
        "merge_output_format": "mp4",
        "progress_hooks": [progress_hook],
        # Remux only (no re-encode), keeps original codec but puts it in mp4
        "postprocessors": [{"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"}],
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        "file_access_retries": 3,
        "http_headers": {"User-Agent": _USER_AGENT},
        "concurrent_fragment_downloads": 4,  # faster fragment downloads
        "geo_bypass": True,
    }


    if platform in ("instagram", "facebook"):
        # These platforms pre-merge video+audio. Prefer h264 mp4.
        base["format"] = "bestvideo[vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]+bestaudio/best[ext=mp4]/best"
    elif platform == "tiktok":
        # TikTok: MUST use merged streams - separate audio/video can lose audio.
        # Use the pre-merged "best" stream first, fall back to explicit merge.
        base["format"] = "best[ext=mp4]/bestvideo[vcodec^=avc][ext=mp4]+bestaudio/bestvideo+bestaudio/best"
        base["extractor_args"] = {"tiktok": {"webpage_download": ["1"]}}
    elif platform == "reddit":
        # Reddit uses DASH with auth — pick h264 mp4, fallback to best.
        # Use 3 concurrent fragments; Reddit CDN handles it fine with cookies.
        base["format"] = "bestvideo[vcodec^=avc][ext=mp4]+bestaudio/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best"
        base["concurrent_fragment_downloads"] = 3
        if _HAS_COOKIES:
            base["cookiefile"] = _COOKIE_PATH
    else:
        # YouTube, etc — strongly prefer h264 mp4 for max compatibility
        base["format"] = (
            "bestvideo[vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo[vcodec^=avc]+bestaudio"
            "/bestvideo[ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo+bestaudio"
            "/best"
        )

    if platform == "instagram":
        base["extractor_args"] = {"instagram": {"include_highlights": ["0"]}}

    # Must come last: merges the YouTube JS-runtime / player-client / PO-token
    # settings into whatever extractor_args the branches above set.
    return apply_youtube_opts(base)


# ── Blocking download worker ───────────────────────────────────────────────────

def _download_sync(job: dict) -> None:
    job_id = job["job_id"]
    url = job["url"]
    cancel_event: threading.Event = job["cancel_event"]
    platform = _get_platform(url)

    tmp_dir = tempfile.mkdtemp(prefix="zscrape_dl_")
    job["tmp_dir"] = tmp_dir
    job["status"] = "downloading"
    job["phase"] = "starting"

    db_title = job.get("db_title") or "video"
    safe_title = _safe_filename(db_title)
    out_tmpl = os.path.join(tmp_dir, f"{safe_title}.%(ext)s")

    # Track stream counts to weight progress correctly
    _stream_ctx = {"total_streams": 1, "current_stream": 0}

    def _progress_hook(d: dict) -> None:
        if cancel_event.is_set():
            raise yt_dlp.utils.DownloadError("Cancelled by user")

        if d["status"] == "downloading":
            downloaded = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0

            # Detect whether we're downloading video or audio stream
            info = d.get("info_dict") or {}
            vcodec = (info.get("vcodec") or "").lower()
            acodec = (info.get("acodec") or "").lower()

            if vcodec == "none" and acodec and acodec != "none":
                # Pure audio stream (2nd pass in 2-stream download)
                job["phase"] = "audio"
                # Weight: audio = 50→95%
                pct = int(downloaded / total * 45) if total else 0
                job["progress"] = min(95, 50 + pct)
            else:
                # Video stream (or merged single stream)
                job["phase"] = "video"
                if platform in ("twitter", "instagram", "facebook", "tiktok"):
                    # Single merged stream → full 0→95%
                    job["progress"] = min(95, int(downloaded / total * 95)) if total else 0
                else:
                    # Separate streams → video = 0→50%
                    job["progress"] = min(50, int(downloaded / total * 50)) if total else 0

            job["downloaded_bytes"] = downloaded
            job["total_bytes"] = total
            job["speed"] = d.get("speed") or 0.0
            job["eta"] = d.get("eta") or 0
            job["updated_at"] = datetime.utcnow()

        elif d["status"] == "finished":
            job["phase"] = "merging"
            job["progress"] = 97
            job["updated_at"] = datetime.utcnow()

    ydl_opts = _get_ydl_opts(platform, out_tmpl, _progress_hook, cancel_event)

    try:
        if cancel_event.is_set():
            job["status"] = "cancelled"
            _delete_path(tmp_dir)
            return

        logger.info(f"Starting download for job {job_id}, platform={platform}, url={url}")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        if info is None:
            raise ValueError("yt-dlp returned no info")

        # Resolve final file path
        file_path: Optional[str] = None
        try:
            file_path = info["requested_downloads"][0]["filepath"]
        except (KeyError, IndexError, TypeError):
            pass

        if not file_path or not os.path.exists(file_path):
            files = [
                os.path.join(tmp_dir, f)
                for f in os.listdir(tmp_dir)
                if os.path.isfile(os.path.join(tmp_dir, f))
                   and not f.endswith((".part", ".ytdl"))
            ]
            if not files:
                raise ValueError("No output file found after download")
            # Pick the largest file (the merged one)
            file_path = max(files, key=os.path.getsize)

        if cancel_event.is_set():
            job["status"] = "cancelled"
            _delete_path(tmp_dir)
            return

        ext = os.path.splitext(file_path)[1] or ".mp4"
        job["filename"] = os.path.basename(file_path)
        job["file_path"] = file_path
        job["status"] = "completed"
        job["phase"] = "done"
        job["progress"] = 100
        job["updated_at"] = datetime.utcnow()

        try:
            actual_size = os.path.getsize(file_path)
            job["actual_size"] = actual_size
            supabase.table("videos").update({"file_size_bytes": actual_size}).eq("id", str(job["video_id"])).execute()
        except Exception as e:
            logger.warning(f"Could not update file_size_bytes for {job['video_id']}: {e}")

        logger.info(f"Download completed: {file_path}")

    except yt_dlp.utils.DownloadError as e:
        err_str = str(e)
        if "Cancelled" in err_str or cancel_event.is_set():
            job["status"] = "cancelled"
        else:
            job["status"] = "failed"
            job["error"] = err_str
            logger.error(f"yt-dlp error for job {job_id}: {err_str}")
        job["phase"] = "done"
        job["updated_at"] = datetime.utcnow()
        _delete_path(tmp_dir)

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["phase"] = "done"
        job["updated_at"] = datetime.utcnow()
        logger.error(f"Download error for job {job_id}: {e}")
        _delete_path(tmp_dir)


# ── Routes ────────────────────────────────────────────────────────────────────

class StartDownloadRequest(BaseModel):
    video_id: str


@router.post("/start")
def start_download(request: StartDownloadRequest):
    # Check if this video already has an active job
    for existing_job in jobs.values():
        if (existing_job.get("video_id") == request.video_id and
                existing_job.get("status") in ("queued", "downloading")):
            return {
                "success": True,
                "job_id": existing_job["job_id"],
                "status": existing_job["status"],
                "already_running": True,
            }

    try:
        response = supabase.table("videos").select("url, title").eq("id", request.video_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Video not found")
        video_url = response.data[0]["url"]
        db_title = response.data[0]["title"]
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
        "db_title": db_title,
        "status": "queued",
        "phase": "starting",
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

    t = threading.Thread(target=_download_sync, args=(job,), daemon=True)
    t.start()

    return {"success": True, "job_id": job_id, "status": "queued", "already_running": False}


@router.get("/progress/{job_id}")
def get_download_progress(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "success": True,
        "job_id": job_id,
        "status": job["status"],
        "phase": job["phase"],
        "progress": job["progress"],
        "downloaded_bytes": job["downloaded_bytes"],
        "total_bytes": job["total_bytes"],
        "actual_size": job.get("actual_size"),
        "eta": job["eta"],
        "speed": job["speed"],
        "error": job["error"],
        "filename": job.get("filename"),
    }


@router.post("/cancel/{job_id}")
def cancel_download(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return {"success": True, "job_id": job_id, "status": "cancelled"}

    job["cancel_event"].set()
    job["status"] = "cancelled"
    job["phase"] = "done"
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
