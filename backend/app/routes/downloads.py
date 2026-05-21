import logging
import asyncio
import uuid
import yt_dlp
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from uuid import UUID

from app.supabase import supabase
from app.config import settings
from app.schemas.download import (
    StartDownloadRequest, 
    DownloadStartResponse, 
    DownloadProgressResponse, 
    CancelDownloadResponse
)

router = APIRouter(prefix="/download", tags=["download"])
logger = logging.getLogger(__name__)

# Global dictionary to track jobs: job_id -> dict with progress state
jobs = {}

class ProgressHook:
    def __init__(self, job_id: str):
        self.job_id = job_id
        
    def __call__(self, d):
        job = jobs.get(self.job_id)
        if not job:
            return
            
        if d['status'] == 'downloading':
            job['status'] = 'downloading'
            
            # Extract progress stats safely
            try:
                # Remove ANSI escape codes and % sign if it's a string, or calculate if bytes available
                if '_percent_str' in d:
                    pct_str = d['_percent_str'].replace('%', '').strip()
                    # ANSI escape code regex cleaning might be needed if yt-dlp outputs them
                    import re
                    pct_str = re.sub(r'\x1b[^m]*m', '', pct_str)
                    job['progress'] = float(pct_str)
            except Exception:
                pass

            job['downloaded_bytes'] = d.get('downloaded_bytes', 0)
            job['total_bytes'] = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            job['eta'] = d.get('eta')
            job['speed'] = d.get('speed')
            job['filename'] = d.get('filename')
            job['updated_at'] = datetime.utcnow()
            
        elif d['status'] == 'finished':
            job['status'] = 'finished'
            job['progress'] = 100.0
            job['filename'] = d.get('filename')
            job['updated_at'] = datetime.utcnow()

async def download_task(job_id: str, url: str):
    """Background task to run yt-dlp"""
    job = jobs.get(job_id)
    if not job:
        return
        
    job['status'] = 'starting'
    
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': f'{settings.DOWNLOADS_DIR}/%(title)s.%(ext)s',
        'quiet': True,
        'no_warnings': True,
        'progress_hooks': [ProgressHook(job_id)],
    }
    
    try:
        # Run yt-dlp in a separate thread so it doesn't block the async event loop
        def run_ydl():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
                
        await asyncio.to_thread(run_ydl)
        
        # Check if job was cancelled
        if jobs.get(job_id, {}).get('status') == 'cancelled':
            return
            
        job['status'] = 'completed'
        job['progress'] = 100.0
        job['updated_at'] = datetime.utcnow()
    except Exception as e:
        logger.error(f"Download failed for job {job_id}: {e}")
        job['status'] = 'failed'
        job['error'] = str(e)
        job['updated_at'] = datetime.utcnow()

@router.post("/start", response_model=DownloadStartResponse)
def start_download(request: StartDownloadRequest, background_tasks: BackgroundTasks):
    try:
        # Fetch the video URL from Supabase
        response = supabase.table("videos").select("url").eq("id", str(request.video_id)).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Video not found")
            
        video_url = response.data[0]["url"]
        
        # Create a job
        job_id = str(uuid.uuid4())
        now = datetime.utcnow()
        
        jobs[job_id] = {
            "job_id": job_id,
            "video_id": request.video_id,
            "status": "queued",
            "progress": 0.0,
            "downloaded_bytes": None,
            "total_bytes": None,
            "eta": None,
            "speed": None,
            "filename": None,
            "error": None,
            "created_at": now,
            "updated_at": now
        }
        
        background_tasks.add_task(download_task, job_id, video_url)
        
        return DownloadStartResponse(
            success=True,
            job_id=job_id,
            video_id=request.video_id,
            status="queued"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting download: {e}")
        raise HTTPException(status_code=500, detail="Failed to start download")

@router.get("/progress/{job_id}", response_model=DownloadProgressResponse)
def get_download_progress(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return DownloadProgressResponse(
        success=True,
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        downloaded_bytes=job["downloaded_bytes"],
        total_bytes=job["total_bytes"],
        eta=job["eta"],
        speed=job["speed"],
        filename=job["filename"],
        error=job["error"],
        created_at=job["created_at"],
        updated_at=job["updated_at"]
    )

@router.post("/cancel/{job_id}", response_model=CancelDownloadResponse)
def cancel_download(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job["status"] = "cancelled"
    job["updated_at"] = datetime.utcnow()
    
    # Note: Cancelling a running thread with yt-dlp is tricky in python.
    # The safest way without monkey-patching yt-dlp deeply is letting it finish or error out,
    # but we can set the status to cancelled so the frontend stops polling.
    
    return CancelDownloadResponse(
        success=True,
        job_id=job_id,
        status="cancelled"
    )
