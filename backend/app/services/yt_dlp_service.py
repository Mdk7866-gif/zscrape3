import asyncio
from datetime import datetime
from functools import partial
from typing import Any
from urllib.parse import urlparse

import httpx
import yt_dlp


YDL_OPTS: dict[str, Any] = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "extract_flat": False,
    "noplaylist": True,
    "socket_timeout": 30,
    "sleep_interval": 1.0,
    "max_sleep_interval": 3.0,
    "sleep_interval_requests": 1.0,
    "retries": 5,
    "fragment_retries": 5,
    "extractor_retries": 3,
}


class DownloadCancelled(Exception):
    pass


def _parse_upload_date(raw: str | None) -> str | None:
    if not raw or len(raw) != 8:
        return None
    try:
        return datetime.strptime(raw, "%Y%m%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _parse_qualities(formats: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    qualities: list[str] = []
    for fmt in formats:
        height = fmt.get("height")
        vcodec = fmt.get("vcodec", "none")
        if not height or vcodec == "none":
            continue
        label = f"{height}p"
        if label not in seen:
            seen.add(label)
            qualities.append(label)
    qualities.sort(key=lambda q: int(q[:-1]))
    return qualities


async def resolve_url(url: str) -> str:
    """Follow redirect-heavy URLs when needed."""
    normalized = url.strip()
    if not normalized:
        return normalized

    # Keep it simple: resolve only for known redirect-heavy cases.
    host = urlparse(normalized).netloc.lower()
    if "reddit.com" not in host:
        return normalized

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            resp = await client.get(normalized)
            return str(resp.url)
    except Exception:
        return normalized


def _extract_info_sync(url: str) -> dict[str, Any]:
    with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
        info = ydl.extract_info(url, download=False)

    if info is None:
        raise ValueError("yt-dlp returned no information for this URL")

    if info.get("_type") == "playlist":
        entries = info.get("entries") or []
        if not entries:
            raise ValueError("Playlist URL provided but no entries found")
        info = entries[0]

    formats: list[dict[str, Any]] = info.get("formats") or []

    return {
        "title": info.get("title") or "Unknown title",
        "duration_seconds": int(info["duration"]) if info.get("duration") is not None else None,
        "url": info.get("webpage_url") or url,
        "platform": info.get("extractor_key") or info.get("extractor") or "unknown",
        "thumbnail": info.get("thumbnail"),
        "upload_date": _parse_upload_date(info.get("upload_date")),
        "available_qualities": _parse_qualities(formats),
    }


async def extract_video_metadata(url: str) -> dict[str, Any]:
    resolved = await resolve_url(url)
    return await asyncio.to_thread(partial(_extract_info_sync, resolved))


async def extract_many(urls: list[str], concurrency: int = 5) -> list[dict[str, Any]]:
    semaphore = asyncio.Semaphore(concurrency)

    async def _one(url: str) -> dict[str, Any]:
        async with semaphore:
            try:
                data = await extract_video_metadata(url)
                return {"url": url, "success": True, "data": data}
            except Exception as exc:
                return {"url": url, "success": False, "error": str(exc)}

    return await asyncio.gather(*[_one(url) for url in urls])
