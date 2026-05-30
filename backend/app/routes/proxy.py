import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/proxy", tags=["proxy"])

# Domains that are known to block browser hotlinking
BLOCKED_DOMAINS = (
    "fbcdn.net",        # Instagram / Facebook CDN
    "cdninstagram.com", # Older Instagram CDN
)

ALLOWED_HOSTS = (
    "fbcdn.net",
    "cdninstagram.com",
    "scontent",
)

_CLIENT = httpx.AsyncClient(
    follow_redirects=True,
    timeout=15.0,
    http2=True,
    headers={
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.instagram.com/",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
    },
)

def _is_allowed(url: str) -> bool:
    lower = url.lower()
    return any(host in lower for host in ALLOWED_HOSTS)

@router.get("/image")
async def proxy_image(url: str = Query(..., description="Fully URL-encoded thumbnail URL to proxy")):
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid URL scheme")

    if not _is_allowed(url):
        # Instead of blocking, just return a redirect to the original URL if we don't need to proxy it
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url)

    try:
        # Stream the response instead of holding in memory
        upstream = await _CLIENT.get(url)
        upstream.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch upstream image: {exc}")

    content_type = upstream.headers.get("content-type", "image/jpeg")

    async def _stream():
        async for chunk in upstream.aiter_bytes(chunk_size=8192):
            yield chunk

    return StreamingResponse(
        _stream(),
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=3600",
        },
    )
