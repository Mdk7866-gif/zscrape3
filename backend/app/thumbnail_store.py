"""
Permanent storage for Instagram/Facebook thumbnails.

Meta's CDN serves thumbnails from signed, time-limited URLs: the `oe` query
param is a hex Unix timestamp and the signature dies with it (observed lifetime
is ~4.5 days, after which the CDN returns `403 URL signature expired` and
`/proxy/image` turns that into a 502). Storing that URL in `videos.thumbnail`
therefore persists a short-lived credential as if it were a permanent address.

The fix is to keep the bytes instead of the URL. Only Instagram/Facebook need
this — YouTube/Reddit/Twitter thumbnails are unsigned static URLs that never
expire, so they keep their original URL and never touch storage.

Objects are keyed `{folder_id}/{video_id}.jpg`. Putting the folder id in the
path prefix is what makes cleanup reliable: deleting a folder is "remove
everything under this prefix", which needs no lookup of the video rows and so
cannot orphan files when a row is already gone.
"""

import logging
from urllib.parse import parse_qs, urlparse

import httpx

from app.supabase import supabase

logger = logging.getLogger(__name__)

BUCKET = "video-thumbnails"

# Platforms whose thumbnail URLs expire and therefore need caching.
CACHED_PLATFORMS = ("instagram", "facebook")

# Refresh slightly before the deadline so a thumbnail doesn't expire between
# the check and the user actually looking at the page.
_EXPIRY_GRACE_SECONDS = 6 * 3600

_MAX_BYTES = 10 * 1024 * 1024

# Same browser-ish headers /proxy/image uses — the Meta CDN is picky about
# Referer, and `verify=False` is needed on networks whose TLS-inspecting
# middlebox (e.g. Fortinet) MITMs Meta's domains specifically. Scoped to this
# client, which only ever talks to the Meta CDN.
_FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": "https://www.instagram.com/",
}

_bucket_ready = False


def _object_path(folder_id: str, video_id: str) -> str:
    return f"{folder_id}/{video_id}.jpg"


def is_stored_thumbnail(url: str | None) -> bool:
    """True if this URL already points at our own bucket (nothing to refresh)."""
    return bool(url) and f"/{BUCKET}/" in (url or "")


def thumbnail_expiry_epoch(url: str | None) -> int | None:
    """
    Read Meta's `oe` expiry (a hex Unix timestamp) out of a CDN URL.

    Returns None when there's no `oe` at all, which is treated by callers as
    "unknown, assume it needs refreshing" rather than "valid forever".
    """
    if not url:
        return None
    try:
        oe = parse_qs(urlparse(url).query).get("oe", [None])[0]
        return int(oe, 16) if oe else None
    except (ValueError, TypeError):
        return None


def is_thumbnail_expired(url: str | None, now: float) -> bool:
    """
    Whether a thumbnail URL needs regenerating. Pure arithmetic — no network
    call — which is what lets the regenerate endpoint re-extract only the
    genuinely dead rows instead of every Instagram video in the folder.
    """
    if is_stored_thumbnail(url):
        return False  # already permanent
    if not url:
        return True
    expiry = thumbnail_expiry_epoch(url)
    if expiry is None:
        return True  # no readable expiry — can't prove it's still good
    return expiry - _EXPIRY_GRACE_SECONDS <= now


def ensure_bucket() -> None:
    """
    Create the public bucket on first use. Idempotent: a bucket that already
    exists makes create_bucket raise, which is the normal path after the first
    ever call and is not an error.
    """
    global _bucket_ready
    if _bucket_ready:
        return
    try:
        supabase.storage.create_bucket(BUCKET, options={"public": True})
        logger.info(f"Created public storage bucket {BUCKET!r}")
    except Exception as e:
        # Already exists is the overwhelmingly common case; anything else will
        # surface as a clear failure on the upload that follows.
        logger.debug(f"create_bucket({BUCKET!r}) not performed: {e}")
    _bucket_ready = True


def store_thumbnail(folder_id: str, video_id: str, source_url: str) -> str | None:
    """
    Download a thumbnail and upload it to our bucket, returning the permanent
    public URL (or None if it couldn't be fetched/stored).

    The bytes are stored as-is rather than re-encoded: re-encoding would add a
    Pillow dependency to save ~100KB per image, which isn't a trade worth making
    at this scale.
    """
    if not source_url:
        return None

    try:
        # verify=False: see _FETCH_HEADERS note above.
        with httpx.Client(follow_redirects=True, timeout=20.0, verify=False) as client:
            resp = client.get(source_url, headers=_FETCH_HEADERS)
            resp.raise_for_status()
            data = resp.content
    except Exception as e:
        logger.warning(f"Could not download thumbnail for video {video_id}: {e}")
        return None

    if not data or len(data) > _MAX_BYTES:
        logger.warning(f"Thumbnail for video {video_id} empty or too large ({len(data)} bytes)")
        return None

    ensure_bucket()
    path = _object_path(folder_id, video_id)
    try:
        supabase.storage.from_(BUCKET).upload(
            path,
            data,
            {
                "content-type": resp.headers.get("content-type", "image/jpeg"),
                "cache-control": "31536000",
                # Regenerating the same video must replace the old object,
                # not fail on "already exists".
                "upsert": "true",
            },
        )
        return supabase.storage.from_(BUCKET).get_public_url(path)
    except Exception as e:
        logger.error(f"Failed to upload thumbnail for video {video_id}: {e}")
        return None


def delete_video_thumbnail(folder_id: str, video_id: str) -> None:
    """Remove one video's stored thumbnail. Safe to call when none exists."""
    try:
        supabase.storage.from_(BUCKET).remove([_object_path(folder_id, video_id)])
    except Exception as e:
        logger.warning(f"Could not delete stored thumbnail for video {video_id}: {e}")


def delete_folder_thumbnails(folder_id: str) -> int:
    """
    Remove every stored thumbnail belonging to a folder.

    Driven purely by the `{folder_id}/` path prefix, so it stays correct even if
    the folder's video rows have already been deleted — which is exactly the
    case when this is called during folder deletion.
    """
    try:
        objects = supabase.storage.from_(BUCKET).list(folder_id)
    except Exception as e:
        logger.warning(f"Could not list stored thumbnails for folder {folder_id}: {e}")
        return 0

    paths = [f"{folder_id}/{o['name']}" for o in objects or [] if o.get("name")]
    if not paths:
        return 0

    try:
        supabase.storage.from_(BUCKET).remove(paths)
        logger.info(f"Deleted {len(paths)} stored thumbnail(s) for folder {folder_id}")
        return len(paths)
    except Exception as e:
        logger.warning(f"Could not delete stored thumbnails for folder {folder_id}: {e}")
        return 0
