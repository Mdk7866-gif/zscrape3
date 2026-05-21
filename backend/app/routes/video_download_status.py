import logging
from fastapi import APIRouter, HTTPException
from uuid import UUID
from typing import Literal
from pydantic import BaseModel

from app.supabase import supabase

router = APIRouter(prefix="/video-status", tags=["video-download-status"])
logger = logging.getLogger(__name__)

StatusEnum = Literal["fresh", "pending", "downloaded", "cancelled", "failed"]


class UpdateStatusRequest(BaseModel):
    video_id: str
    status: StatusEnum


@router.get("/folder/{folder_id}")
def get_folder_statuses(folder_id: UUID):
    """
    Returns a dict of {video_id: status} for all videos in a folder
    that have a download status record. Videos not in the table are implicitly 'fresh'.
    """
    try:
        response = (
            supabase.table("video_download_status")
            .select("video_id, status, updated_at, videos!inner(folder_id)")
            .eq("videos.folder_id", str(folder_id))
            .execute()
        )
        return {row["video_id"]: {"status": row["status"], "updated_at": row["updated_at"]} for row in response.data}
    except Exception as e:
        logger.error(f"Error fetching statuses for folder {folder_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update")
def update_status(request: UpdateStatusRequest):
    """Upsert download status for a video. Creates or updates the row."""
    try:
        supabase.table("video_download_status").upsert(
            {"video_id": request.video_id, "status": request.status},
            on_conflict="video_id",
        ).execute()
        return {"success": True, "video_id": request.video_id, "status": request.status}
    except Exception as e:
        logger.error(f"Error updating status for video {request.video_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{video_id}")
def get_status(video_id: UUID):
    """Get download status for a single video. Returns 'fresh' if no record exists."""
    try:
        response = (
            supabase.table("video_download_status")
            .select("status, updated_at")
            .eq("video_id", str(video_id))
            .execute()
        )
        if not response.data:
            return {"video_id": str(video_id), "status": "fresh", "updated_at": None}
        return {
            "video_id": str(video_id),
            "status": response.data[0]["status"],
            "updated_at": response.data[0]["updated_at"],
        }
    except Exception as e:
        logger.error(f"Error getting status for video {video_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
