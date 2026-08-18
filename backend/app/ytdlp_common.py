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

import os

# yt-dlp probes these in order and uses whichever is installed.
JS_RUNTIMES = {"deno": {}, "node": {}}

# tv_simply serves uncapped stream URLs; android_vr is kept as a fallback for
# videos tv_simply cannot serve. Listing both does not cost quality — yt-dlp
# still picks the best available format across clients.
YOUTUBE_PLAYER_CLIENTS = ["tv_simply", "android_vr"]

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
    """
    opts["js_runtimes"] = JS_RUNTIMES

    extractor_args = opts.setdefault("extractor_args", {})
    extractor_args["youtube"] = {"player_client": list(YOUTUBE_PLAYER_CLIENTS)}
    if POT_PROVIDER_URL:
        extractor_args["youtubepot-bgutilhttp"] = {"base_url": [POT_PROVIDER_URL]}

    return opts
