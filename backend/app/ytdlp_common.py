"""Shared yt-dlp settings for YouTube's JS-challenge / PO-token requirements.

YouTube now forces SABR streaming on the web clients, so yt-dlp falls back to
`android_vr` — whose stream URLs are capped at ~10 MB. Anything larger dies
partway through with "HTTP Error 403: Forbidden" (small files and audio-only
streams slip under the cap, which is why only *some* downloads failed).

Three things are needed to get full-quality downloads back:

1. A JavaScript runtime (deno or node >= 22) so yt-dlp can solve the player JS
   challenge. Without one it logs "No supported JavaScript runtime could be
   found" and silently loses formats.
2. The `tv_simply` player client, whose stream URLs are *not* capped.
3. A GVS PO token. Without one, `tv_simply` still works but drops to 360p.
   Supplied by the bgutil provider (see POT_PROVIDER_URL below).
"""

import logging
import os

import yt_dlp

logger = logging.getLogger(__name__)

# backend/cookies.txt — shared by every platform that needs auth (Reddit,
# and now YouTube once its IP/anon-traffic rate limit kicks in). yt-dlp only
# applies the cookies matching the domain of the current request, so one
# Netscape-format file safely covers multiple sites at once.
COOKIE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cookies.txt")
HAS_COOKIES = os.path.exists(COOKIE_PATH)

# yt-dlp probes these in order and uses whichever is installed.
JS_RUNTIMES = {"deno": {}, "node": {}}

# tv_simply serves uncapped stream URLs; android_vr is kept as a fallback for
# videos tv_simply cannot serve. Listing both does not cost quality — yt-dlp
# still picks the best available format across clients. Neither supports
# cookies (yt-dlp skips them outright if a cookiejar is set), which is why
# the primary attempt below stays cookie-less.
YOUTUBE_PLAYER_CLIENTS = ["tv_simply", "android_vr"]

# Used only for the rate-limit retry (see extract_with_youtube_fallback).
# Both support cookies and, unlike most cookie-compatible clients, aren't
# SABR-locked to a 360p pre-merged format — confirmed by hand, full 1080p.
# web_creator also reaches 1080p but requires the account to own a channel,
# so it's left out to keep the fallback broadly reliable.
YOUTUBE_COOKIE_FALLBACK_CLIENTS = ["web_embedded", "web_safari", "web", "mweb"]

# Substrings (lowercased) yt-dlp uses when YouTube rate-limits or bot-checks
# an anonymous request. Signed-in cookies get a separate, much less
# aggressive rate limit, which is what the fallback trades on.
_YOUTUBE_RATELIMIT_MARKERS = ("sign in to confirm", "not a bot", "429")

# Where the bgutil PO token provider is reachable. Empty means "use the
# plugin's own default" (http://127.0.0.1:4416), which is right for local dev.
# In Docker this is set to the provider service, e.g. http://bgutil-provider:4416.
POT_PROVIDER_URL = os.getenv("POT_PROVIDER_URL", "").strip()


def apply_youtube_opts(opts: dict) -> dict:
    """Merge the YouTube JS-runtime / player-client / PO-token settings into `opts`.

    Merges into any existing ``extractor_args`` rather than replacing it, so
    platform-specific args set by the caller (instagram, tiktok, …) survive.
    Safe to apply unconditionally: yt-dlp ignores extractor args that don't
    match the extractor actually handling the URL.

    Deliberately does NOT attach cookies here — the primary attempt stays
    cookie-less (tv_simply/android_vr, uncapped, no auth needed). Cookies are
    only added by extract_with_youtube_fallback() on retry, since yt-dlp
    unconditionally skips tv_simply/android_vr the moment any cookiejar is
    set, even for domains that aren't YouTube.
    """
    opts["js_runtimes"] = JS_RUNTIMES

    extractor_args = opts.setdefault("extractor_args", {})
    extractor_args["youtube"] = {"player_client": list(YOUTUBE_PLAYER_CLIENTS)}
    if POT_PROVIDER_URL:
        extractor_args["youtubepot-bgutilhttp"] = {"base_url": [POT_PROVIDER_URL]}

    return opts


def _looks_like_youtube_ratelimit(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(marker in msg for marker in _YOUTUBE_RATELIMIT_MARKERS)


def extract_with_youtube_fallback(opts: dict, url: str, platform: str, *, download: bool):
    """Run yt-dlp's extract_info, retrying once with signed-in cookies if
    YouTube rate-limits the primary (cookie-less, full-quality) attempt.

    A no-op passthrough for every platform other than YouTube, or when no
    cookies.txt is present to retry with — those cases just raise as before.
    `platform` is accepted but not trusted alone: callers' platform-detection
    functions disagree on whether YouTube maps to "youtube" or falls through
    to a generic "other" bucket, so this also checks the URL directly.
    """
    is_youtube = platform == "youtube" or "youtube.com" in url.lower() or "youtu.be" in url.lower()
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=download)
    except Exception as e:
        if not is_youtube or not HAS_COOKIES or not _looks_like_youtube_ratelimit(e):
            raise
        logger.warning(f"YouTube rate-limited {url!r}, retrying with signed-in cookies: {e}")

        fallback_opts = dict(opts)
        fallback_opts["cookiefile"] = COOKIE_PATH
        fallback_opts["extractor_args"] = {
            **(opts.get("extractor_args") or {}),
            "youtube": {"player_client": list(YOUTUBE_COOKIE_FALLBACK_CLIENTS)},
        }
        with yt_dlp.YoutubeDL(fallback_opts) as ydl:
            return ydl.extract_info(url, download=download)
