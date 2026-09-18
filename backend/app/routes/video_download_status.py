import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from uuid import UUID
from typing import Literal
from pydantic import BaseModel

from app.supabase import supabase
from app.admin_auth import AdminFlag, assert_folder_visible, assert_video_visible
from app.folder_activity import (
    VIDEO_DOWNLOADED, VIDEO_DOWNLOAD_FAILED, VIDEO_DOWNLOAD_CANCELLED, record_folder_activity,
)

router = APIRouter(prefix="/video-status", tags=["video-download-status"])
logger = logging.getLogger(__name__)

StatusEnum = Literal["fresh", "pending", "downloaded", "cancelled", "failed"]


class UpdateStatusRequest(BaseModel):
    video_id: str
    status: StatusEnum


@router.get("/folder/{folder_id}")
def get_folder_statuses(folder_id: UUID, admin: AdminFlag):
    """
    Returns a dict of {video_id: status} for all videos in a folder
    that have a download status record. Videos not in the table are implicitly 'fresh'.
    """
    assert_folder_visible(folder_id, admin)
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
def update_status(request: UpdateStatusRequest, admin: AdminFlag):
    """Upsert status and record only real terminal status transitions as activity."""
    assert_video_visible(request.video_id, admin)
    try:
        existing = (
            supabase.table("video_download_status")
            .select("status")
            .eq("video_id", request.video_id)
            .execute()
        )
        previous_status = existing.data[0]["status"] if existing.data else "fresh"

        video = (
            supabase.table("videos")
            .select("folder_id")
            .eq("id", request.video_id)
            .execute()
        )
        if not video.data:
            raise HTTPException(status_code=404, detail="Video not found")
        folder_id = str(video.data[0]["folder_id"])
        supabase.table("video_download_status").upsert(
            {
                "video_id": request.video_id,
                "status": request.status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="video_id",
        ).execute()

        activity_by_status = {
            "downloaded": VIDEO_DOWNLOADED,
            "failed": VIDEO_DOWNLOAD_FAILED,
            "cancelled": VIDEO_DOWNLOAD_CANCELLED,
        }
        activity = activity_by_status.get(request.status)
        if activity and previous_status != request.status:
            record_folder_activity(folder_id, activity)

        return {"success": True, "video_id": request.video_id, "folder_id": folder_id, "status": request.status}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating status for video {request.video_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{video_id}")
def get_status(video_id: UUID, admin: AdminFlag):
    """Get download status for a single video. Returns 'fresh' if no record exists."""
    assert_video_visible(video_id, admin)
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
