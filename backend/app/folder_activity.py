"""Best-effort audit state for the latest meaningful folder activity."""

import logging
from datetime import datetime, timezone

from app.supabase import supabase

logger = logging.getLogger(__name__)

FOLDER_CREATED = "Folder created"
VIDEO_ADDED = "Video added"
VIDEO_ADD_FAILED = "Video add failed"
VIDEO_DOWNLOADED = "Video downloaded"
VIDEO_DOWNLOAD_FAILED = "Download failed"
VIDEO_DOWNLOAD_CANCELLED = "Download cancelled"


def record_folder_activity(folder_id: str, activity: str) -> None:
    """Record activity without allowing audit telemetry to break the primary action."""
    try:
        supabase.table("folders").update({
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "last_activity": activity,
        }).eq("id", folder_id).execute()
    except Exception as exc:
        logger.warning("Could not record folder activity for %s: %s", folder_id, exc)
