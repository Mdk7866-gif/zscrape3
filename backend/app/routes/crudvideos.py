import logging
from fastapi import APIRouter, HTTPException
from uuid import UUID
from datetime import date

from app.supabase import supabase
from app.admin_auth import AdminFlag, assert_folder_visible, assert_video_visible
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
def fetch_all_videos(folder_id: UUID, admin: AdminFlag):
    """Fetch all videos in a folder ordered by created_at descending (newest first)."""
    # 404s rather than leaking that an admin folder exists at this ID.
    assert_folder_visible(folder_id, admin)
    try:
        response = (
            supabase.table("videos")
            .select("*")
            .eq("folder_id", str(folder_id))
            .order("created_at", desc=True)
            .execute()
        )
        return response.data
    except Exception as e:
        logger.error(f"Error fetching videos: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch videos")


@router.delete("/delete/{video_id}", response_model=VideoDeleteResponse)
def delete_video(video_id: UUID, admin: AdminFlag):
    assert_video_visible(video_id, admin)
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


from fastapi.responses import StreamingResponse
import json

@router.post("/bulk-upload")
def bulk_upload_videos(request: BulkVideoUploadRequest, admin: AdminFlag):
    """
    Process multiple video URLs concurrently, extract metadata, and insert into Supabase.
    Returns a stream of JSON lines (NDJSON) to provide live progress to the client.
    """
    # Checked before the stream opens — once StreamingResponse starts, raising
    # an HTTPException can no longer produce a proper error status.
    assert_folder_visible(request.folder_id, admin)

    def event_stream():
        urls = []
        for url in request.urls:
            if url not in urls:
                urls.append(url)
                
        total = len(urls)
        yield json.dumps({"type": "start", "total": total}) + "\n"

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
        saved_count = 0
        duplicate_count = 0
        failed_count = 0

        # Preload URLs already recorded as failed for this folder so retries don't create duplicates
        try:
            existing_failed_res = (
                supabase.table("failed_save_urls")
                .select("url")
                .eq("folder_id", str(request.folder_id))
                .execute()
            )
            existing_failed_urls = {row["url"] for row in (existing_failed_res.data or [])}
        except Exception:
            existing_failed_urls = set()

        def fetch_meta(u: str) -> tuple[str, dict | None]:
            return u, extract_video_metadata(u)

        def clear_from_failed(u: str) -> None:
            """Remove a URL from failed_save_urls once it succeeds on retry."""
            if u not in existing_failed_urls:
                return
            try:
                supabase.table("failed_save_urls") \
                    .delete() \
                    .eq("folder_id", str(request.folder_id)) \
                    .eq("url", u) \
                    .execute()
                existing_failed_urls.discard(u)
            except Exception as e:
                logger.warning(f"Could not clear {u} from failed_save_urls: {e}")

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(fetch_meta, url): url for url in urls}
            processed = 0

            for future in as_completed(futures):
                raw_url, metadata = future.result()
                processed += 1

                if metadata is None:
                    if raw_url not in existing_failed_urls:
                        try:
                            supabase.table("failed_save_urls").insert({
                                "folder_id": str(request.folder_id),
                                "url": raw_url,
                            }).execute()
                            existing_failed_urls.add(raw_url)
                        except Exception:
                            pass
                    failed_count += 1
                    yield json.dumps({"type": "progress", "processed": processed, "total": total, "status": "failed"}) + "\n"
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
                        "file_size_bytes": metadata.get("file_size_bytes"),
                    }
                    response = supabase.table("videos").insert(insert_data).execute()

                    if response.data:
                        inserted_id = response.data[0]["id"]
                        next_number += 1
                        saved_count += 1

                        try:
                            supabase.table("video_download_status").insert({
                                "video_id": inserted_id,
                                "status": "fresh",
                            }).execute()
                        except Exception as e:
                            logger.warning(f"Could not insert download status for {inserted_id}: {e}")

                        clear_from_failed(raw_url)
                        yield json.dumps({"type": "progress", "processed": processed, "total": total, "status": "saved"}) + "\n"
                except Exception as e:
                    err_msg = str(e).lower()
                    if "duplicate" in err_msg or "23505" in err_msg:
                        duplicate_count += 1
                        clear_from_failed(raw_url)
                        yield json.dumps({"type": "progress", "processed": processed, "total": total, "status": "duplicate"}) + "\n"
                    else:
                        logger.error(f"Error inserting video {raw_url}: {e}")
                        failed_count += 1
                        yield json.dumps({"type": "progress", "processed": processed, "total": total, "status": "failed"}) + "\n"

        yield json.dumps({"type": "complete", "saved": saved_count, "duplicates": duplicate_count, "failed": failed_count}) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
