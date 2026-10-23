"""Shared platform classification based on the hostname, never URL text."""

from urllib.parse import urlsplit

_DOMAINS = {
    "twitter": ("twitter.com", "x.com"),
    "instagram": ("instagram.com",),
    "facebook": ("facebook.com", "fb.watch"),
    "reddit": ("reddit.com", "redd.it"),
    "youtube": ("youtube.com", "youtu.be"),
    "tiktok": ("tiktok.com",),
}


def get_platform(url: str, default: str = "other") -> str:
    try:
        parsed = urlsplit(url)
        if parsed.scheme.lower() not in ("http", "https"):
            return default
        host = (parsed.hostname or "").lower().rstrip(".")
    except ValueError:
        return default
    for platform, domains in _DOMAINS.items():
        if any(host == domain or host.endswith(f".{domain}") for domain in domains):
            return platform
    return default
