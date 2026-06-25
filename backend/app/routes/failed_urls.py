import logging
from fastapi import APIRouter, HTTPException
from uuid import UUID
from pydantic import BaseModel

from app.supabase import supabase
from app.schemas.failed_url import FailedUrlOut, FailedUrlDeleteResponse

router = APIRouter(prefix="/failed-urls", tags=["failed-urls"])
logger = logging.getLogger(__name__)

class SaveBulkFailedUrlsRequest(BaseModel):
    folder_id: UUID
    urls: list[str]

class SaveBulkFailedUrlsResponse(BaseModel):
    success: bool
    saved: int
    failed: int

@router.get("/fetchall", response_model=list[FailedUrlOut])
def fetch_all_failed_urls(folder_id: UUID):
    try:
        response = supabase.table("failed_save_urls").select("*").eq("folder_id", str(folder_id)).order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching failed urls: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch failed URLs")

@router.delete("/delete/{failed_url_id}", response_model=FailedUrlDeleteResponse)
def delete_failed_url(failed_url_id: UUID):
    try:
        response = supabase.table("failed_save_urls").delete().eq("id", str(failed_url_id)).execute()
        if len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Failed URL not found")
        return FailedUrlDeleteResponse(success=True, deleted=True, failed_url_id=failed_url_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting failed url: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete failed URL")

@router.delete("/delete-all")
def delete_all_failed_urls(folder_id: UUID):
    """Delete all failed URLs for a specific folder."""
    try:
        response = supabase.table("failed_save_urls").delete().eq("folder_id", str(folder_id)).execute()
        return {"success": True, "deleted": len(response.data)}
    except Exception as e:
        logger.error(f"Error deleting all failed urls for folder {folder_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete all failed URLs")

@router.post("/save-bulk", response_model=SaveBulkFailedUrlsResponse)
def save_bulk_failed_urls(request: SaveBulkFailedUrlsRequest):
    saved = 0
    failed = 0

    # Fetch all URLs already recorded as failed for this folder in one query
    try:
        existing_res = supabase.table("failed_save_urls") \
            .select("url") \
            .eq("folder_id", str(request.folder_id)) \
            .execute()
        existing_urls = {row["url"] for row in (existing_res.data or [])}
    except Exception as e:
        logger.error(f"Error fetching existing failed urls for folder {request.folder_id}: {e}")
        existing_urls = set()

    for url in request.urls:
        clean_url = url.strip()
        # Skip if this URL is already in the failed list for this folder
        if clean_url in existing_urls:
            logger.info(f"Skipping duplicate failed URL: {clean_url}")
            continue
        try:
            supabase.table("failed_save_urls").insert({
                "folder_id": str(request.folder_id),
                "url": clean_url
            }).execute()
            existing_urls.add(clean_url)  # Track in-memory to catch dupes within the same batch
            saved += 1
        except Exception as e:
            logger.error(f"Error saving failed url {url}: {e}")
            failed += 1

    return SaveBulkFailedUrlsResponse(success=True, saved=saved, failed=failed)

