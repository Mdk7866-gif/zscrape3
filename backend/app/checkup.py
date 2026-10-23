"""Run with `uv run python -m app.checkup` from backend/. Never writes data."""

import importlib.metadata
import shutil
import subprocess
import urllib.request

from yt_dlp.cookies import YoutubeDLCookieJar
from yt_dlp.networking.impersonate import ImpersonateTarget

from app.ytdlp_common import COOKIE_PATH, POT_PROVIDER_URL, _create_ytdlp


def main() -> int:
    failures = 0

    def report(level: str, label: str, message: str) -> None:
        nonlocal failures
        failures += level == "FAIL"
        print(f"[{level}] {label}: {message}")

    for executable in ("ffmpeg", "ffprobe"):
        path = shutil.which(executable)
        report("OK" if path else "FAIL", executable,
               "available" if path else "install FFmpeg and restart the backend")

    runtime = False
    for executable in ("deno", "node"):
        path = shutil.which(executable)
        if not path:
            continue
        try:
            version = subprocess.run(
                [path, "--version"], capture_output=True, text=True, timeout=5, check=True,
            ).stdout.splitlines()[0]
            if executable == "deno" or int(version.lstrip("v").split(".")[0]) >= 22:
                report("OK", "YouTube JavaScript runtime", version)
                runtime = True
                break
        except (OSError, subprocess.SubprocessError, ValueError, IndexError):
            continue
    if not runtime:
        report("WARN", "YouTube JavaScript runtime", "install Deno or Node >= 22")

    try:
        with _create_ytdlp({
            "quiet": True, "no_warnings": True,
            "impersonate": ImpersonateTarget(client="chrome", version="124"),
        }):
            report("OK", "Reddit browser TLS / yt-dlp plugins",
                   f"yt-dlp {importlib.metadata.version('yt-dlp')}; Chrome 124 available")
    except Exception as exc:
        report("FAIL", "Reddit browser TLS / yt-dlp plugins",
               f"{type(exc).__name__}; run uv sync and recheck")

    try:
        jar = YoutubeDLCookieJar(COOKIE_PATH)
        jar.load()
        signed_in = any(
            c.name == "reddit_session" and not c.is_expired()
            and (c.domain.lstrip(".") == "reddit.com"
                 or c.domain.endswith(".reddit.com"))
            for c in jar
        )
        report("OK" if signed_in else "WARN", "Reddit cookies",
               "unexpired session present (server validity not verified)" if signed_in
               else "no unexpired Reddit session; export signed-in cookies if required")
    except (OSError, ValueError):
        report("WARN", "Cookies", "missing or unreadable; export a Netscape cookies.txt")

    provider = POT_PROVIDER_URL or "http://127.0.0.1:4416"
    try:
        with urllib.request.urlopen(f"{provider.rstrip('/')}/ping", timeout=3) as response:
            if response.status != 200:
                raise OSError("unexpected provider status")
        report("OK", "YouTube token provider", "reachable")
    except Exception:
        report("WARN", "YouTube token provider",
               "unreachable; start bgutil-provider for full-quality YouTube downloads")

    try:
        from app.supabase import supabase

        supabase.table("folders").select("id").limit(1).execute()
        report("OK", "Supabase", "configuration and read access work")
    except Exception as exc:
        report("FAIL", "Supabase", f"{type(exc).__name__}; check backend/.env and connectivity")

    print("External sites can still reject requests; this check does not download videos.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
