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
from concurrent.futures import ThreadPoolExecutor, as_completed

router = APIRouter(prefix="/video", tags=["video"])
logger = logging.getLogger(__name__)


@router.get("/fetchall", response_model=list[VideoOut])
def fetch_all_videos(folder_id: UUID):
    """Fetch all videos in a folder ordered by created_at ascending (so numbering is consistent)."""
    try:
        response = (
            supabase.table("videos")
            .select("*")
            .eq("folder_id", str(folder_id))
            .order("created_at", desc=False)
            .execute()
        )
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


@router.post("/bulk-upload", response_model=BulkVideoUploadResponse)
def bulk_upload_videos(request: BulkVideoUploadRequest):
    """
    1. Fetch metadata for all URLs concurrently (slow network step).
    2. Count existing videos in folder to assign sequential numbering.
    3. Insert videos sequentially with numbered titles.
    4. Insert initial 'fresh' download status for each saved video.
    """
    saved_count = 0
    duplicate_count = 0
    failed_count = 0
    results: list[BulkVideoItem] = []

    # ── Step 1: Fetch metadata concurrently ─────────────────────────────────
    urls = [u.strip() for u in request.urls if u.strip()]

    def fetch_meta(url: str):
        return url, extract_video_metadata(url)

    url_meta_pairs: list[tuple[str, dict | None]] = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch_meta, url): url for url in urls}
        # Preserve input order
        ordered = [None] * len(urls)
        for future in as_completed(futures):
            url, meta = future.result()
            idx = urls.index(url)
            ordered[idx] = (url, meta)
        url_meta_pairs = [p for p in ordered if p is not None]

    # ── Step 2: Count existing videos for numbering ──────────────────────────
    try:
        count_res = (
            supabase.table("videos")
            .select("id", count="exact")
            .eq("folder_id", str(request.folder_id))
            .execute()
        )
        existing_count = count_res.count or 0
    except Exception:
        existing_count = 0

    next_number = existing_count + 1

    # ── Step 3: Insert videos sequentially with numbering ────────────────────
    for raw_url, metadata in url_meta_pairs:
        if metadata is None:
            # Log failed URL
            try:
                supabase.table("failed_save_urls").insert({
                    "folder_id": str(request.folder_id),
                    "url": raw_url,
                }).execute()
            except Exception:
                pass
            results.append(BulkVideoItem(raw_url=raw_url, success=False, error="Failed to extract metadata"))
            failed_count += 1
            continue

        numbered_title = f"{next_number}) {metadata['title']}"

        try:
            insert_data = {
                "folder_id": str(request.folder_id),
                "title": numbered_title,
                "duration_seconds": metadata["duration_seconds"],
                "url": raw_url,
                "platform": metadata["platform"],
                "thumbnail": metadata["thumbnail"],
                "upload_date": metadata.get("upload_date") or date.today().isoformat(),
            }
            response = supabase.table("videos").insert(insert_data).execute()

            if response.data:
                inserted_id = response.data[0]["id"]
                next_number += 1
                saved_count += 1

                # Insert initial 'fresh' download status
                try:
                    supabase.table("video_download_status").insert({
                        "video_id": inserted_id,
                        "status": "fresh",
                    }).execute()
                except Exception as e:
                    logger.warning(f"Could not insert download status for {inserted_id}: {e}")

                results.append(BulkVideoItem(
                    raw_url=raw_url,
                    cleaned_url=raw_url,
                    success=True,
                    inserted_id=inserted_id,
                    title=numbered_title,
                    platform=metadata["platform"],
                    thumbnail=metadata["thumbnail"],
                ))
            else:
                failed_count += 1
                results.append(BulkVideoItem(raw_url=raw_url, success=False, error="No data returned"))

        except Exception as e:
            err_str = str(e)
            if "duplicate key value violates unique constraint" in err_str:
                duplicate_count += 1
                results.append(BulkVideoItem(
                    raw_url=raw_url, cleaned_url=raw_url,
                    success=False, is_duplicate=True, error="Video URL already exists in your library",
                ))
            else:
                try:
                    supabase.table("failed_save_urls").insert({
                        "folder_id": str(request.folder_id),
                        "url": raw_url,
                    }).execute()
                except Exception:
                    pass
                failed_count += 1
                results.append(BulkVideoItem(raw_url=raw_url, success=False, error="Database insertion error"))

    return BulkVideoUploadResponse(
        success=True,
        folder_id=request.folder_id,
        total=len(urls),
        saved=saved_count,
        duplicates=duplicate_count,
        failed=failed_count,
        results=results,
    )
