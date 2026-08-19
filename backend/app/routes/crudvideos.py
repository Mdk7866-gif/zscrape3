import logging
import time
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
    BulkVideoItem,
    RegenerateThumbnailsRequest,
)
from app.routes.yt_dlpextractmetadataofvideo import extract_video_metadata
from app.thumbnail_store import (
    CACHED_PLATFORMS,
    delete_video_thumbnail,
    is_thumbnail_expired,
    store_thumbnail,
)
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

        # Deleting a single video never triggers the folder-level cleanup, so
        # its cached thumbnail would be orphaned in storage forever without this.
        deleted_row = response.data[0]
        if deleted_row.get("folder_id"):
            delete_video_thumbnail(str(deleted_row["folder_id"]), str(video_id))
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


def _fetch_cached_platform_videos(folder_id: UUID) -> list[dict]:
    """Instagram/Facebook rows in a folder — the only ones with expiring thumbnails."""
    response = (
        supabase.table("videos")
        .select("id, url, thumbnail, platform")
        .eq("folder_id", str(folder_id))
        .in_("platform", list(CACHED_PLATFORMS))
        .execute()
    )
    return response.data or []


@router.get("/thumbnail-status")
def thumbnail_status(folder_id: UUID, admin: AdminFlag):
    """
    How many Instagram/Facebook thumbnails in this folder are dead or dying.

    Pure arithmetic on each URL's `oe` expiry — no network calls — so the UI can
    poll this cheaply to decide whether to offer the regenerate action at all.
    """
    assert_folder_visible(folder_id, admin)
    try:
        videos = _fetch_cached_platform_videos(folder_id)
    except Exception as e:
        logger.error(f"Error checking thumbnail status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check thumbnail status")

    now = time.time()
    expired = sum(1 for v in videos if is_thumbnail_expired(v.get("thumbnail"), now))
    return {
        "folder_id": str(folder_id),
        "total": len(videos),
        "expired": expired,
    }


@router.post("/regenerate-thumbnails")
def regenerate_thumbnails(request: RegenerateThumbnailsRequest, admin: AdminFlag):
    """
    Re-extract expired Instagram/Facebook thumbnails and store them permanently.

    Meta's CDN thumbnail URLs are signed and expire in ~4.5 days, so the URL
    saved at upload time eventually 403s and the card goes blank. This mints a
    fresh URL via yt-dlp, then uploads the actual bytes to our storage bucket so
    the replacement never expires — each video needs this at most once.

    Only rows whose `oe` expiry has actually passed are re-extracted (unless
    `force`): each one is a real Instagram API hit, and Instagram rate-limits
    aggressively, so re-fetching a whole folder blindly is a good way to get
    blocked. Streams NDJSON so a large folder shows progress instead of hanging,
    and so one deleted post fails alone rather than aborting the batch.
    """
    # Checked before the stream opens — once StreamingResponse starts, an
    # HTTPException can no longer produce a proper error status.
    assert_folder_visible(request.folder_id, admin)

    def event_stream():
        try:
            videos = _fetch_cached_platform_videos(request.folder_id)
        except Exception as e:
            logger.error(f"Error loading videos for thumbnail regeneration: {e}")
            yield json.dumps({"type": "error", "message": "Could not load videos for this folder."}) + "\n"
            return

        now = time.time()
        targets = [
            v for v in videos
            if request.force or is_thumbnail_expired(v.get("thumbnail"), now)
        ]

        total = len(targets)
        yield json.dumps({"type": "start", "total": total, "checked": len(videos)}) + "\n"
        if not total:
            yield json.dumps({"type": "complete", "updated": 0, "failed": 0, "total": 0}) + "\n"
            return

        def regenerate(video: dict) -> tuple[dict, str | None]:
            """Fresh URL from yt-dlp, then persist the bytes. Runs off-thread."""
            metadata = extract_video_metadata(video["url"])
            if not metadata or not metadata.get("thumbnail"):
                return video, None
            stored = store_thumbnail(
                str(request.folder_id), str(video["id"]), metadata["thumbnail"]
            )
            # If the upload failed, fall back to the fresh CDN URL: it still
            # expires, but it's better than leaving the user with a dead one.
            return video, stored or metadata["thumbnail"]

        updated = 0
        failed = 0
        processed = 0

        # Deliberately not a `with` block: its __exit__ calls shutdown(wait=True),
        # which on client disconnect would keep working through every queued video
        # — minutes of extra Instagram traffic for a run the user just cancelled.
        # The finally below cancels what hasn't started instead.
        executor = ThreadPoolExecutor(max_workers=5)
        try:
            futures = [executor.submit(regenerate, v) for v in targets]

            for future in as_completed(futures):
                processed += 1
                try:
                    video, new_thumbnail = future.result()
                except Exception as e:
                    logger.warning(f"Thumbnail regeneration crashed: {e}")
                    failed += 1
                    yield json.dumps({"type": "progress", "processed": processed, "total": total, "status": "failed"}) + "\n"
                    continue

                if not new_thumbnail:
                    # Post deleted, private, or extraction blocked.
                    failed += 1
                    yield json.dumps({"type": "progress", "processed": processed, "total": total, "status": "failed"}) + "\n"
                    continue

                try:
                    supabase.table("videos").update(
                        {"thumbnail": new_thumbnail}
                    ).eq("id", str(video["id"])).execute()
                    updated += 1
                    yield json.dumps({"type": "progress", "processed": processed, "total": total, "status": "updated"}) + "\n"
                except Exception as e:
                    logger.error(f"Could not update thumbnail for video {video['id']}: {e}")
                    failed += 1
                    yield json.dumps({"type": "progress", "processed": processed, "total": total, "status": "failed"}) + "\n"
        except GeneratorExit:
            # The client disconnected — cancelled from the UI, or navigated away.
            # Videos already finished keep their new thumbnails (each is written
            # as it completes), so there is nothing to roll back.
            logger.info(
                f"Thumbnail regeneration cancelled for folder {request.folder_id} "
                f"after {processed}/{total} ({updated} updated)"
            )
            raise
        finally:
            # cancel_futures drops everything not yet started; in-flight work
            # (at most max_workers) is left to finish rather than abandoned
            # mid-upload. wait=False so cancelling returns immediately.
            executor.shutdown(wait=False, cancel_futures=True)

        yield json.dumps({"type": "complete", "updated": updated, "failed": failed, "total": total}) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
