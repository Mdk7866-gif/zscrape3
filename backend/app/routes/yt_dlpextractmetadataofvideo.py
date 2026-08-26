import json
import logging
import shutil
import subprocess
import urllib.request
import urllib.error
from urllib.parse import parse_qs, urlparse

try:
    from curl_cffi import requests as _curl_requests
except ImportError:
    _curl_requests = None

from app.ytdlp_common import (
    apply_youtube_opts,
    extract_with_youtube_fallback,
    COOKIE_PATH as _COOKIE_PATH,
    HAS_COOKIES as _HAS_COOKIES,
)

logger = logging.getLogger(__name__)

# Ships with the ffmpeg install yt-dlp's remuxer already requires (and with the
# `ffmpeg` apt package in backend/Dockerfile), so this is not a new dependency.
_FFPROBE = shutil.which("ffprobe")

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

def _resolve_google_share_url(url: str) -> str:
    """
    Google share links (e.g. share.google/XXXXX) redirect via Google Search/Image pages.
    Use curl_cffi with browser impersonation to follow redirects and extract imgrefurl or final target URL.
    """
    if "share.google" not in url.lower():
        return url
    if not _curl_requests:
        logger.warning(f"curl_cffi is missing, cannot resolve Google share link {url!r}")
        return url
    try:
        r = _curl_requests.get(url, impersonate="chrome124", allow_redirects=True, timeout=10)
        final_url = str(r.url)
        if "google.com/imgres" in final_url:
            parsed = urlparse(final_url)
            qs = parse_qs(parsed.query)
            if "imgrefurl" in qs and qs["imgrefurl"]:
                final_url = qs["imgrefurl"][0]
        logger.info(f"Resolved Google share URL {url!r} -> {final_url!r}")
        return final_url
    except Exception as e:
        logger.warning(f"Could not resolve Google share URL {url!r}: {e}. Using original.")
        return url


def _resolve_reddit_share_url(url: str) -> str:
    """
    Reddit share links (e.g. /r/Sub/s/XXXXXXX) are redirects to the real post.
    Follow the redirect chain and return the final destination URL.
    If resolution fails, return the original URL unchanged.
    """
    if "/s/" not in url:
        return url  # Not a share link, skip
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": _USER_AGENT},
            method="HEAD",
        )
        # Don't auto-follow so we can log each hop; actually we DO want to follow
        with urllib.request.urlopen(req, timeout=10) as response:
            resolved = response.url
        logger.info(f"Resolved Reddit share URL {url!r} -> {resolved!r}")
        return resolved
    except Exception as e:
        logger.warning(f"Could not resolve Reddit share URL {url!r}: {e}. Using original.")
        return url


def extract_video_metadata(url: str) -> dict | None:
    """
    Extracts metadata from a video URL using yt-dlp.
    Handles Twitter/X, Instagram, Reddit, YouTube, etc.
    Returns dict with title, duration_seconds, platform, thumbnail, url.
    """
    # Short / share link resolution (Google share, Reddit share, etc.) must happen BEFORE
    # platform detection so platform-specific format options apply to the real target URL.
    if "share.google" in url.lower():
        url = _resolve_google_share_url(url)
    elif "reddit.com" in url.lower() or "redd.it" in url.lower():
        url = _resolve_reddit_share_url(url)

    platform = _get_platform(url)

    # Platform-specific options
    base_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "extract_flat": False,
        "socket_timeout": 10,
        "retries": 1,
        "fragment_retries": 1,
        "file_access_retries": 1,
        "http_headers": {"User-Agent": _USER_AGENT},
        "geo_bypass": True,
    }


    # Temporarily override: only pass cookies for Reddit
    # DO NOT set a format for Reddit — Reddit uses DASH (separate video+audio streams).
    # format="best" fails for DASH-only posts because there is no pre-merged stream.
    # Leaving format unset lets yt-dlp use its own smart default, which handles DASH correctly.
    if platform in ("instagram", "facebook"):
        # Some networks run TLS-inspecting middleboxes (e.g. Fortinet) that MITM
        # Meta's domains specifically, presenting a cert no trust store recognizes.
        # Nothing else is affected by this — it's scoped to instagram/facebook only.
        base_opts["nocheckcertificate"] = True

    if platform == "instagram":
        base_opts["format"] = "best"
        base_opts["extractor_args"] = {"instagram": {"include_highlights": ["0"]}}

    elif platform == "reddit":
        # No format restriction — yt-dlp default handles Reddit DASH without failing.
        # This is the only safe option: "best" errors on DASH-only posts (no pre-merged stream).
        # Only Reddit needs the cookie file for auth.
        if _HAS_COOKIES:
            base_opts["cookiefile"] = _COOKIE_PATH

    elif platform == "twitter":
        # Twitter/X has merged streams, "best" is fine
        base_opts["format"] = "best"

    else:
        # YouTube and others: standard high quality
        base_opts["format"] = (
            "bestvideo[vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo[ext=mp4]+bestaudio[ext=m4a]"
            "/bestvideo+bestaudio"
            "/best"
        )

    # Must come last: merges the YouTube JS-runtime / player-client / PO-token
    # settings into whatever extractor_args the branches above set.
    apply_youtube_opts(base_opts)

    try:
        info_dict = extract_with_youtube_fallback(base_opts, url, platform, download=False)
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

        duration = (
            info_dict.get("duration")
            or _derive_duration_from_fragments(info_dict)
            or _probe_duration_with_ffprobe(info_dict)
        )

        return {
            "title": info_dict.get("title") or "Unknown Title",
            # round, not truncate: a 4.97s reel is 0:05, not 0:04.
            "duration_seconds": round(duration or 0),
            "platform": platform if platform != "unknown" else info_dict.get("extractor_key", "unknown").lower(),
            "thumbnail": thumbnail,
            "url": url,
            "upload_date": _parse_upload_date(info_dict.get("upload_date")),
            "file_size_bytes": info_dict.get("filesize") or info_dict.get("filesize_approx"),
        }
    except Exception as e:
        logger.error(f"Failed to extract metadata for {url}: {e}")
        return None


def _derive_duration_from_fragments(info_dict: dict) -> float | None:
    """
    First fallback for when yt-dlp's top-level `duration` is missing: sum the
    per-fragment durations yt-dlp already parsed out of a segmented manifest.

    Free (no network) but only applies to manifests that actually enumerate
    fragments — SegmentTemplate/SegmentList DASH and HLS. It does NOT cover
    Instagram, whose DASH uses SegmentBase (one byte-ranged file per
    representation), so its formats carry no `fragments` at all; that case
    falls through to _probe_duration_with_ffprobe().
    """
    best_total = 0.0
    for fmt in info_dict.get("formats") or []:
        fragments = fmt.get("fragments")
        if not fragments:
            continue
        total = sum(frag.get("duration") or 0 for frag in fragments)
        # A video format's fragments sum to the real duration; audio-only or
        # thumbnail-storyboard "formats" have their own (usually shorter or
        # equal) fragment durations, so the longest total wins.
        if total > best_total:
            best_total = total
    return best_total or None


def _probe_duration_with_ffprobe(info_dict: dict) -> float | None:
    """
    Last-resort duration recovery: read it from the media file's own header.

    Instagram's extractor sources `duration` from one field of Instagram's API
    response (`video_duration`), and for some Reels that field is simply absent.
    Nothing else in the extracted info carries it either — the DASH formats have
    no `fragments` to sum (SegmentBase), no `filesize`, and the manifest's
    `mediaPresentationDuration` is parsed by yt-dlp but never exposed on the
    format dicts. The container header is the only remaining source.

    ffprobe range-reads just that header (~2s, a few hundred KB), never the whole
    file. Only fires when the duration is otherwise unknown, so the cost is paid
    only on the videos that would show "--:--".
    """
    if not _FFPROBE:
        return None

    url = info_dict.get("url") or next(
        (f.get("url") for f in info_dict.get("requested_formats") or [] if f.get("url")),
        None,
    )
    if not url:
        return None

    try:
        proc = subprocess.run(
            [
                _FFPROBE, "-v", "error",
                "-user_agent", _USER_AGENT,
                "-show_entries", "format=duration",
                "-of", "json", url,
            ],
            capture_output=True,
            text=True,
            timeout=25,
        )
        if proc.returncode != 0:
            logger.warning(f"ffprobe could not read duration (rc={proc.returncode}): {proc.stderr.strip()[:200]}")
            return None
        # Missing/unknown duration comes back as "N/A", which float() rejects.
        return float(json.loads(proc.stdout)["format"]["duration"]) or None
    except Exception as e:
        logger.warning(f"ffprobe duration probe failed: {e}")
        return None


def _parse_upload_date(raw: str | None) -> str | None:
    """Convert yt-dlp's YYYYMMDD date string to an ISO date (YYYY-MM-DD), or None."""
    if not raw or len(raw) != 8:
        return None
    try:
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    except Exception:
        return None
