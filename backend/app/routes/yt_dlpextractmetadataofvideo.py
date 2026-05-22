import yt_dlp
import logging

logger = logging.getLogger(__name__)

# Common User-Agent to avoid bot detection
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

def _get_platform(url: str) -> str:
    """Detect platform from URL."""
    url_lower = url.lower()
    if "twitter.com" in url_lower or "x.com" in url_lower:
        return "twitter"
    if "instagram.com" in url_lower:
        return "instagram"
    if "reddit.com" in url_lower or "redd.it" in url_lower:
        return "reddit"
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "youtube"
    if "tiktok.com" in url_lower:
        return "tiktok"
    if "facebook.com" in url_lower or "fb.watch" in url_lower:
        return "facebook"
    return "unknown"


def extract_video_metadata(url: str) -> dict | None:
    """
    Extracts metadata from a video URL using yt-dlp.
    Handles Twitter/X, Instagram, Reddit, YouTube, etc.
    Returns dict with title, duration_seconds, platform, thumbnail, url.
    """
    platform = _get_platform(url)

    # Platform-specific options
    base_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "extract_flat": False,
        "socket_timeout": 15,
        "retries": 1,
        "fragment_retries": 1,
        "file_access_retries": 1,
        "http_headers": {"User-Agent": _USER_AGENT},
    }

    # Twitter/X: only has merged streams, use "best"
    if platform == "twitter":
        base_opts["format"] = "best"

    # Instagram: similar, use "best"  
    elif platform == "instagram":
        base_opts["format"] = "best"
        base_opts["extractor_args"] = {"instagram": {"include_highlights": ["0"]}}

    # Reddit: needs mp4 format
    elif platform == "reddit":
        base_opts["format"] = "bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best"

    # YouTube and others: standard high quality
    else:
        base_opts["format"] = (
            "bestvideo[vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo[ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo+bestaudio"
            "/best"
        )

    try:
        with yt_dlp.YoutubeDL(base_opts) as ydl:
            info_dict = ydl.extract_info(url, download=False)
            if not info_dict:
                return None

            # Get the best thumbnail
            thumbnail = info_dict.get("thumbnail")
            thumbnails = info_dict.get("thumbnails", [])
            if thumbnails:
                # Try to get the highest resolution one
                sorted_thumbs = sorted(
                    [t for t in thumbnails if t.get("url")],
                    key=lambda t: (t.get("width") or 0) * (t.get("height") or 0),
                    reverse=True
                )
                if sorted_thumbs:
                    thumbnail = sorted_thumbs[0]["url"]

            return {
                "title": info_dict.get("title") or "Unknown Title",
                "duration_seconds": int(info_dict.get("duration") or 0),
                "platform": platform if platform != "unknown" else info_dict.get("extractor_key", "unknown").lower(),
                "thumbnail": thumbnail,
                "url": url,
                "upload_date": _parse_upload_date(info_dict.get("upload_date")),
                "file_size_bytes": info_dict.get("filesize") or info_dict.get("filesize_approx"),
            }
    except Exception as e:
        logger.error(f"Failed to extract metadata for {url}: {e}")
        return None


def _parse_upload_date(raw: str | None) -> str | None:
    """Convert yt-dlp's YYYYMMDD date string to an ISO date (YYYY-MM-DD), or None."""
    if not raw or len(raw) != 8:
        return None
    try:
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    except Exception:
        return None
