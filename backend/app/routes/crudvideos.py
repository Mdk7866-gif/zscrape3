import logging
from fastapi import APIRouter, HTTPException
from uuid import UUID
from datetime import date

from app.supabase import supabase
from app.schemas.video import (
    VideoOut, 
    VideoDeleteResponse, 
    BulkVideoUploadRequest, 
    BulkVideoUploadResponse,
    BulkVideoItem
)
from app.routes.yt_dlpextractmetadataofvideo import extract_video_metadata

router = APIRouter(prefix="/video", tags=["video"])
logger = logging.getLogger(__name__)

@router.get("/fetchall", response_model=list[VideoOut])
def fetch_all_videos(folder_id: UUID):
    try:
        response = supabase.table("videos").select("*").eq("folder_id", str(folder_id)).order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching videos: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch videos")

@router.delete("/delete/{video_id}", response_model=VideoDeleteResponse)
def delete_video(video_id: UUID):
    try:
        response = supabase.table("videos").delete().eq("id", str(video_id)).execute()
        if len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Video not found")
        return VideoDeleteResponse(success=True, deleted=True, video_id=video_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting video: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete video")

from concurrent.futures import ThreadPoolExecutor

@router.post("/bulk-upload", response_model=BulkVideoUploadResponse)
def bulk_upload_videos(request: BulkVideoUploadRequest):
    results = []
    saved_count = 0
    duplicate_count = 0
    failed_count = 0

    def process_url(raw_url: str):
        url = raw_url.strip()
        if not url:
            return None
            
        metadata = extract_video_metadata(url)
        if not metadata:
            try:
                supabase.table("failed_save_urls").insert({
                    "folder_id": str(request.folder_id),
                    "url": url
                }).execute()
            except Exception:
                pass
            
            return BulkVideoItem(raw_url=raw_url, success=False, error="Failed to extract metadata")
            
        try:
            insert_data = {
                "folder_id": str(request.folder_id),
                "title": metadata["title"],
                "duration_seconds": metadata["duration_seconds"],
                "url": url,
                "platform": metadata["platform"],
                "thumbnail": metadata["thumbnail"],
                "upload_date": date.today().isoformat()
            }
            response = supabase.table("videos").insert(insert_data).execute()
            
            if response.data:
                return BulkVideoItem(
                    raw_url=raw_url, cleaned_url=url, success=True,
                    inserted_id=response.data[0]["id"], title=metadata["title"],
                    platform=metadata["platform"], thumbnail=metadata["thumbnail"]
                )
        except Exception as e:
            if "duplicate key value violates unique constraint" in str(e):
                return BulkVideoItem(raw_url=raw_url, cleaned_url=url, success=False, is_duplicate=True, error="Video URL already exists")
            try:
                supabase.table("failed_save_urls").insert({"folder_id": str(request.folder_id), "url": url}).execute()
            except Exception:
                pass
            return BulkVideoItem(raw_url=raw_url, cleaned_url=url, success=False, error="Database insertion error")
        return None

    # Use ThreadPoolExecutor to run extractions concurrently
    with ThreadPoolExecutor(max_workers=5) as executor:
        url_results = list(executor.map(process_url, request.urls))
        
    for res in url_results:
        if res:
            results.append(res)
            if res.success:
                saved_count += 1
            elif getattr(res, 'is_duplicate', False):
                duplicate_count += 1
            else:
                failed_count += 1

    return BulkVideoUploadResponse(
        success=True,
        folder_id=request.folder_id,
        total=len(request.urls),
        saved=saved_count,
        duplicates=duplicate_count,
        failed=failed_count,
        results=results
    )
