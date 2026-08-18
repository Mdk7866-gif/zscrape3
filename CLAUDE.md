# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

zscrape3 is a video cataloging/downloading tool: users paste messy text containing links, an LLM (GPT-4o via LangGraph) extracts URLs, yt-dlp pulls metadata (and later the actual video) for each, and results are organized into folders backed by Supabase (Postgres). It's a two-service app — `backend` (FastAPI) and `frontendweb` (Next.js) — normally run together via `docker-compose.yml`.

## Commands

### Backend (`backend/`, Python 3.13, managed with `uv`)

```
uv sync                 # install deps (see pyproject.toml)
uv run dev              # runs app.main:start -> uvicorn with reload, port 8000
# or directly:
uv run uvicorn app.main:app --reload --port 8000

uv run ruff check .     # lint
uv run mypy .           # type check
```

There is no test suite in this repo currently.

Backend needs a `backend/.env` (see `backend/env.example` for the required keys: Supabase URL/secret key, OpenAI key/model, allowed CORS origins, downloads dir, max bulk URLs). `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are required with no default (app fails to start without them).

**YouTube downloads need two extra pieces of infrastructure** (see `app/ytdlp_common.py` for the full explanation):

1. **A JavaScript runtime** — `deno`, or `node >= 22`, on PATH. Without one yt-dlp cannot solve YouTube's player JS challenge, silently loses formats, and large downloads die partway with `HTTP Error 403: Forbidden`.
2. **The bgutil PO token provider** running on `http://127.0.0.1:4416`. Downloads still work without it, but silently degrade to 360p.

   For **local dev** (`uv run dev`), run it as a plain Node process in its own terminal, alongside the backend:
   ```
   node bgutil-provider/build/main.js
   ```
   `bgutil-provider/` at the repo root is a local install of https://github.com/Brainicism/bgutil-ytdlp-pot-provider (gitignored — not committed). To set it up from scratch: clone the repo at the tag matching the `bgutil-ytdlp-pot-provider` pin in `pyproject.toml` (currently `1.3.1`), run `npm install && npx tsc` inside its `server/` folder, then copy `build/`, `node_modules/`, and `package.json` into `bgutil-provider/` at the repo root.

   For **Docker** (`docker-compose up`), this is already wired up as the `bgutil-provider` service — no extra steps needed. Keep its image tag in `docker-compose.yml` version-matched with the `bgutil-ytdlp-pot-provider` pin in `pyproject.toml` — the plugin and provider must agree.

**Instagram/Facebook extraction needs `curl_cffi`** (pinned `>=0.13,<0.16` — yt-dlp only supports specific version ranges, checked at import time). Instagram's extractor requires browser-TLS impersonation to avoid a 403; without `curl_cffi` installed it silently falls back to a plain request and gets blocked.

If Instagram/Facebook URLs fail with an SSL certificate error (`CERTIFICATE_VERIFY_FAILED`) or a 403 whose response body is HTML mentioning "FortiGuard" / "URL is banned" / "Contact your Network Administrator", that's not a bug in this code — it's a campus/office network firewall (FortiGate) actively blocking those domains by policy, confirmed present on the NIT Warangal network. `nocheckcertificate` is set for instagram/facebook in `downloads.py` and `yt_dlpextractmetadataofvideo.py` (and `verify=False` on the thumbnail proxy client in `proxy.py`) so the app degrades gracefully to a real 403 instead of a raw SSL error when this happens, but no code change can bypass an active network block — only a different network or VPN does.

**If YouTube fails with `Sign in to confirm you're not a bot` or `HTTP Error 429`**, that means the server's IP has been rate-limited for anonymous traffic (happens after enough requests, e.g. heavy testing) — not a bug in the primary path. `extract_with_youtube_fallback()` in `app/ytdlp_common.py` handles this automatically: it tries the normal cookie-less, full-quality attempt first (`tv_simply`/`android_vr`), and only on a rate-limit-shaped error retries once using `backend/cookies.txt` with the `web_embedded`/`web_safari` clients (the only clients that are both cookie-compatible *and* not SABR-locked to 360p — verified by hand; plain `web` and `mweb` do support cookies but cap at 360p or worse). This requires `cookies.txt` to contain a real signed-in YouTube session (`LOGIN_INFO`, `SID`, `SAPISID`, etc. — exported via a browser extension while logged in), not just the anonymous cookies yt-dlp writes on its own. Without a signed-in session there, YouTube rate-limiting has no fallback and just fails.

Note `extract_with_youtube_fallback()` checks the URL directly for `youtube.com`/`youtu.be` rather than trusting a caller-supplied `platform` string — `downloads.py`'s own `_get_platform()` has no explicit `"youtube"` case (falls through to `"other"`), so relying on that string silently skipped the fallback for real downloads (metadata extraction has a `"youtube"` case and worked fine) until this was caught by testing. Another reminder that the platform-detection duplication across files (noted below) is a real footgun, not just a style nit.

### Frontend (`frontendweb/`, Next.js 16 / React 19)

```
npm run dev       # next dev, http://localhost:3000
npm run build
npm run start
npm run lint       # eslint
```

Frontend talks to the backend via `NEXT_PUBLIC_API_URL` (defaults to `http://127.0.0.1:8000` when unset).

**Important:** `frontendweb/AGENTS.md` (auto-loaded) warns that this Next.js version has breaking API/convention changes from what's in your training data — check `node_modules/next/dist/docs/` before writing Next.js code that relies on assumed conventions.

### Docker

`docker-compose.yml` at the repo root builds/runs both services (backend on 8000, frontend on 3000, sharing `zscrape3-network`). Backend mounts `./backend/downloads` and reads `./backend/.env`.

## Architecture

### Data model (Supabase/Postgres — see `backend/zscrape3database.dbml` and `zscrape3_database.sql`)

- `folders` — top-level organizational unit (unique `name`).
- `videos` — belongs to a folder (`folder_id`), unique on `(folder_id, url)`. Stores extracted metadata: title, duration, platform, thumbnail, upload_date, file_size_bytes.
- `failed_save_urls` — URLs that failed metadata extraction during bulk upload, per folder, so users can retry/inspect them.
- `video_download_status` — one row per video (unique `video_id`), enum status `fresh|pending|downloaded|cancelled|failed`. A video with no row is implicitly `fresh`.

The backend talks to Supabase directly via the `supabase-py` client (`app/supabase.py`), using the **service role/secret key** — there is no ORM/migrations layer in this repo; schema changes are applied to Supabase out of band and should be reflected back into the `.dbml`/`.sql` files.

### Backend request flow (`backend/app/`)

- `main.py` — FastAPI app, CORS from `settings.allowed_origins_list`, mounts `api_router`.
- `routes/router.py` — combines all route modules; each module owns one URL prefix/domain: `chatgpturlchecker` (`/chatgpturlchecker`), `downloads` (`/download`), `failed_urls` (`/failed-urls`), `crudfolders` (`/folder`), `crudvideos` (`/video`), `proxy` (`/proxy`), `video_download_status` (`/video-status`).
- `routes/chatgpturlchecker.py` — a minimal LangGraph single-node graph that calls `gpt-4o` with structured output to pull every URL (valid or not) out of pasted text, dedupes, then round-robin interleaves results by platform so the bulk-upload queue processes different platforms in parallel rather than one platform at a time.
- `routes/yt_dlpextractmetadataofvideo.py` — shared yt-dlp metadata extraction (`extract_video_metadata`), not itself a route; per-platform yt-dlp `format`/option tuning (Instagram, Reddit, Twitter/X, YouTube-and-other). Reddit share links (`/s/...`) get resolved via a manual redirect follow before extraction. Reddit gets `backend/cookies.txt` directly for auth; YouTube goes through `extract_with_youtube_fallback()` (see `ytdlp_common.py` below), which only reaches for cookies on a rate-limit-shaped failure.
- `routes/crudvideos.py` (`/video/bulk-upload`) — accepts a list of URLs, extracts metadata **concurrently** (`ThreadPoolExecutor`, 5 workers) via the above helper, and streams NDJSON progress lines back to the client as each URL resolves (saved/duplicate/failed), inserting into `videos` + `video_download_status` (defaulting to `fresh`) and `failed_save_urls` on failure. Preloads the folder's existing `failed_save_urls` once per request so retried URLs don't create duplicate failure rows, and clears a URL out of `failed_save_urls` the moment a retry succeeds (or turns out to already be saved as a duplicate) — so `FailedUrlShowPopUpCard` on the frontend never shows a URL that has actually succeeded.
- `routes/downloads.py` (`/download/*`) — actual file downloads. Runs a blocking yt-dlp download in a background thread per job, tracked in an **in-process `jobs` dict** (no persistence — job state is lost on server restart). Per-platform `format`/postprocessor tuning again lives here (kept in sync conceptually with `yt_dlpextractmetadataofvideo.py`'s platform detection, but duplicated, not shared — see the footgun noted below). Key invariant called out in comments: always use `FFmpegVideoRemuxer`, never `FFmpegVideoConvertor` (avoid re-encoding). The actual `extract_info(download=True)` call goes through `extract_with_youtube_fallback()`, same as metadata extraction. Progress is polled (`GET /download/progress/{job_id}`), and `GET /download/file/{job_id}` streams the finished file then deletes the temp dir via a `BackgroundTask`.
- `routes/video_download_status.py` (`/video-status/*`) — persists the per-video status shown above so download progress survives page reloads/navigation.
- `routes/proxy.py` (`/proxy/image`) — proxies thumbnail images for domains that block hotlinking (Instagram/Facebook CDN); redirects straight through for anything not on the allowlist.
- `schemas/*.py` — Pydantic request/response models per domain, imported by the matching route module.

### Frontend structure (`frontendweb/src/`)

- App Router pages: `app/page.tsx` (landing), `app/folder/[id]/page.tsx` (per-folder video list/management).
- `components/DownloadQueueContext.tsx` — the core client-side download orchestrator, provided app-wide. Maintains an in-memory job queue (`jobs`) separate from persisted DB statuses (`dbStatuses`), runs **one download at a time** (queue runner effect gates on `activeCount === 0`), polls `/download/progress/{job_id}` every 500ms while a job is downloading, and on completion either writes the file via the File System Access API (if the user picked a directory with `pickDownloadDir`) or falls back to a plain `<a download>` click. Every state transition (`pending`/`downloaded`/`cancelled`/`failed`) is synced back to the backend's `video-status` endpoints so progress survives reloads.
- `components/VideoDataCard.tsx`, `FailedUrlShowPopUpCard.tsx`, `ChatgptUrlCheckerPopUpCard.tsx` — video list items, failed-URL review UI, and the paste-text-and-extract-URLs flow, respectively (each pairs with a backend route of the same concern above).
- `components/Sidebar.tsx`, `Navbar.tsx`, `Footer.tsx` — layout chrome; folder list/navigation lives in the sidebar.
- `components/AlertMessagePopUp.tsx`, `ConformationMessagePopUp.tsx` — shared alert/confirm modal primitives used across the CRUD flows.

### Cross-cutting notes

- `app/ytdlp_common.py` holds the YouTube-specific yt-dlp settings (JS runtime, `tv_simply` player client, PO token provider URL) shared by both yt-dlp call sites. Its `apply_youtube_opts()` is called **last** in each options builder because it merges into `extractor_args` rather than replacing it, preserving the per-platform args set above it. If YouTube downloads start 403-ing partway through again, that file is the place to look — YouTube changes this roughly every few months.
- Platform detection (twitter/x, instagram, facebook, reddit, tiktok, youtube-or-other) is reimplemented independently in at least three places (`chatgpturlchecker.py`, `yt_dlpextractmetadataofvideo.py`, `downloads.py`) with slightly different platform sets — when changing platform behavior, check all three.
- Download job state (`downloads.py`'s `jobs` dict) is purely in-memory; restarting the backend orphans any in-flight downloads (frontend will see 404s on progress polling and mark them cancelled).
- Bulk operations (`bulk-upload`) are the main perf-sensitive path — metadata extraction is deliberately parallelized (5 workers) and results stream back as NDJSON rather than waiting for the whole batch.
