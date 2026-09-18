# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project overview

zscrape3 is a video cataloging/downloading tool: users paste messy text containing links, an LLM (GPT-5.6 Luna via LangGraph) extracts URLs, yt-dlp pulls metadata (and later the actual video) for each, and results are organized into folders backed by Supabase (Postgres). It's a two-service app — `backend` (FastAPI) and `frontendweb` (Next.js) — normally run together via `docker-compose.yml`.

## Context-document maintenance

Keep this file, `README.md`, and `zscrape3_database.sql` accurate whenever a change affects the architecture, user-visible behavior, operational setup, or database schema. Update only the documents that the change actually affects; `zscrape3_database.sql` must not invent a table or column for browser-only state. When a schema change is needed, apply the SQL manually in Supabase before deploying code that requires it, then reflect the final schema here and in the DBML source.

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

   Don't trust its startup log alone — it can print a normal-looking `Started POT server ... on address 0.0.0.0:4416` while having actually bound only `[::]:4416` (IPv6), leaving it unreachable at `127.0.0.1` (seen when a stale process was already holding the IPv6 socket). Confirm with `curl http://127.0.0.1:4416/ping` (expect `200`) before trusting downloads will get full quality — the symptom otherwise is downloads silently capping around 10MB with `HTTP Error 403: Forbidden` even though the provider "looks" up.

   For **Docker** (`docker-compose up`), this is already wired up as the `bgutil-provider` service — no extra steps needed. Keep its image tag in `docker-compose.yml` version-matched with the `bgutil-ytdlp-pot-provider` pin in `pyproject.toml` — the plugin and provider must agree.

**Instagram/Facebook extraction needs `curl_cffi`** (pinned `>=0.13,<0.16` — yt-dlp only supports specific version ranges, checked at import time). Instagram's extractor requires browser-TLS impersonation to avoid a 403; without `curl_cffi` installed it silently falls back to a plain request and gets blocked.

If Instagram/Facebook URLs fail with an SSL certificate error (`CERTIFICATE_VERIFY_FAILED`) or a 403 whose response body is HTML mentioning "FortiGuard" / "URL is banned" / "Contact your Network Administrator", that's not a bug in this code — it's a campus/office network firewall (FortiGate) actively blocking those domains by policy, confirmed present on the NIT Warangal network. `nocheckcertificate` is set for instagram/facebook in `downloads.py` and `yt_dlpextractmetadataofvideo.py` (and `verify=False` on the thumbnail proxy client in `proxy.py`) so the app degrades gracefully to a real 403 instead of a raw SSL error when this happens, but no code change can bypass an active network block — only a different network or VPN does.

**If YouTube fails with `Sign in to confirm you're not a bot`, `Sign in to confirm your age`, or `HTTP Error 429`**, that means the server's IP has been rate-limited for anonymous traffic or the video is age-restricted — not a bug in the primary path. `extract_with_youtube_fallback()` in `app/ytdlp_common.py` handles this automatically: it tries the normal cookie-less, full-quality attempt first (`tv_simply`/`android_vr`), and on rate-limit or age-gate errors retries once using `backend/cookies.txt` with the `web_embedded`/`web_safari`/`web`/`mweb` clients. Note that `docker-compose.yml` mounts `cookies.txt` with write access so `yt-dlp` can update session cookies without raising a read-only filesystem error. This requires `cookies.txt` to contain a real signed-in YouTube session (`LOGIN_INFO`, `SID`, `SAPISID`, etc. — exported via a browser extension while logged in), not just anonymous guest cookies. Without a signed-in session there, age-restricted videos and rate-limits cannot bypass authentication.

Note `extract_with_youtube_fallback()` checks the URL directly for `youtube.com`/`youtu.be` rather than trusting a caller-supplied `platform` string — `downloads.py`'s own `_get_platform()` has no explicit `"youtube"` case (falls through to `"other"`), so relying on that string silently skipped the fallback for real downloads (metadata extraction has a `"youtube"` case and worked fine) until this was caught by testing. Another reminder that the platform-detection duplication across files (noted below) is a real footgun, not just a style nit.

### Frontend (`frontendweb/`, Next.js 16 / React 19)

```
npm run dev       # next dev, http://localhost:3000
npm run build
npm run start
npm run lint       # eslint
```

Frontend talks to the backend via `NEXT_PUBLIC_API_URL` (defaults to `http://127.0.0.1:8000` when unset).

Only real UI dependency beyond Next/React/Tailwind is `react-icons` (platform brand logos — see `lib/platforms.ts` under Landing page below).

**Important:** `frontendweb/AGENTS.md` (auto-loaded) warns that this Next.js version has breaking API/convention changes from what's in your training data — check `node_modules/next/dist/docs/` before writing Next.js code that relies on assumed conventions.

### Docker

`docker-compose.yml` at the repo root builds/runs both services (backend on 8000, frontend on 3000, sharing `zscrape3-network`). Backend mounts `./backend/downloads` and reads `./backend/.env`.

The frontend Dockerfile builds from `node:20-alpine` and runs `npm ci`, which requires `frontendweb/package-lock.json` to be byte-exact in sync with `package.json`. If the lockfile was last regenerated with a different (usually newer) local npm version, `npm ci` fails with `EUSAGE` / "Missing: ... from lock file" — commonly hitting `@emnapi/runtime`/`@emnapi/core`, optional wasm fallback deps of sharp and lightningcss that different npm versions resolve into the lockfile differently. Fix by regenerating the lockfile inside the same image the Dockerfile builds from, not locally: `docker run --rm -v "$PWD/frontendweb":/app -w /app node:20-alpine npm install --package-lock-only` (on Windows Git Bash, prefix with `MSYS_NO_PATHCONV=1` or the `/app` mount path gets mangled).

## Architecture

### Data model (Supabase/Postgres — see `backend/zscrape3database.dbml` and `zscrape3_database.sql`)

- `folders` — top-level organizational unit (unique `name`). `is_admin` splits the table into two workspaces: `false` = public, `true` = the private admin workspace (see "Admin workspace" below).
- `videos` — belongs to a folder (`folder_id`), unique on `(folder_id, url)`. Stores extracted metadata: title, duration, platform, thumbnail, upload_date, file_size_bytes.
- `failed_save_urls` — URLs that failed metadata extraction during bulk upload, per folder, so users can retry/inspect them.
- `video_download_status` — one row per video (unique `video_id`), enum status `fresh|pending|downloaded|cancelled|failed`. A video with no row is implicitly `fresh`.

The user-selected local download folder is deliberately **not** a database field or backend setting. It is a browser-owned File System Access handle stored locally in IndexedDB; the browser, not Supabase, controls permission to the user's filesystem.

The backend talks to Supabase directly via the `supabase-py` client (`app/supabase.py`), using the **service role/secret key** — there is no ORM/migrations layer in this repo; schema changes are applied to Supabase out of band and should be reflected back into the `.dbml`/`.sql` files. Hand-written migrations live in `migrations/` for reference; they must be run manually in the Supabase SQL editor (the Python client cannot execute DDL). **Apply the SQL before deploying code that depends on the new column** — the dev server hot-reloads, so editing a route first takes the running app down.

`app/supabase.py` passes a custom `httpx.Client(http2=False)` into `create_client()`. `supabase-py` pulls in `httpx[http2]` by default, and httpx's sync HTTP/2 backend intermittently raises `httpcore.ReadError: [WinError 10035] A non-blocking socket operation could not be completed immediately` on Windows when it reuses a pooled connection that's gone slightly idle — surfaces as a random 500 from *any* route that touches Supabase (most visibly `assert_folder_visible()`, since nearly every folder/video route calls it), which then succeeds immediately on retry because the retry opens a fresh connection instead of reusing the bad one. If this shows up again, it's this, not a bug in the calling route — don't chase it as a per-route issue.

### Admin workspace

A password-gated private workspace: the admin creates folders / adds URLs / downloads exactly like a normal user, but that content is invisible to everyone else. `ADMIN_PASSWORD` in `backend/.env` gates it (empty disables admin login — fails closed).

- `app/admin_auth.py` — session tokens (in-memory, 12h TTL, lost on restart like the download job store) plus the visibility helpers `assert_folder_visible()` / `assert_video_visible()`. Non-admins hitting admin content get **404, not 403**, so folder UUIDs can't be probed for existence.
- `routes/admin.py` (`/admin/*`) — `login` (constant-time compare via `secrets.compare_digest`), `logout`, and `session` (lets the frontend revalidate a stored token after a reload).
- **Presence of a valid `X-Admin-Token` header selects the workspace.** `/folder/fetchall` filters `.eq("is_admin", admin)`, so the same endpoint returns public folders without a token and admin folders with one; "exit admin" is just dropping the token. `/folder/create` sets `is_admin` from the session — never from client input.
- Every folder- and video-scoped route calls one of the assert helpers: `crudvideos`, `failed_urls`, `video_download_status`, and `/download/start`. `/download/progress` and `/download/file` are deliberately *not* gated — they take an opaque job UUID only the caller who started the job ever learns. **Any new folder/video-scoped route must add its own check**; the guard is per-route, not global middleware.
- Frontend: `lib/api.ts` (`apiFetch` attaches the token from `sessionStorage`; the password itself is never stored client-side) and `components/AdminContext.tsx` (`useAdmin()` → `isAdmin`/`checking`/`login`/`logout`). Components that load folder- or video-scoped data must include `isAdmin` in their effect deps and skip while `checking` is true, or they'll fetch the wrong workspace on first paint.
- Known minor limitation: `folders.name` is globally unique, so creating a public folder whose name matches an existing admin folder returns "already exists" — a small name-only leak, kept because relaxing the constraint is riskier than the leak.

### Backend request flow (`backend/app/`)

- `main.py` — FastAPI app, CORS from `settings.allowed_origins_list`, mounts `api_router`.
- `routes/router.py` — combines all route modules; each module owns one URL prefix/domain: `chatgpturlchecker` (`/chatgpturlchecker`), `downloads` (`/download`), `failed_urls` (`/failed-urls`), `crudfolders` (`/folder`), `crudvideos` (`/video`), `proxy` (`/proxy`), `video_download_status` (`/video-status`).
- `routes/chatgpturlchecker.py` — a minimal LangGraph single-node graph that calls `gpt-5.6-luna` with structured output to pull every URL (valid or not) out of pasted text, including WhatsApp-style timestamp/sender prefixes and Reddit `/s/<share-id>` links. It dedupes, then round-robin interleaves results by platform so the bulk-upload queue processes different platforms in parallel rather than one platform at a time.
- `routes/yt_dlpextractmetadataofvideo.py` — shared yt-dlp metadata extraction (`extract_video_metadata`) and share-link resolver (`resolve_share_url`), not itself a route; per-platform yt-dlp `format`/option tuning (Instagram, Reddit, Twitter/X, YouTube-and-other). Reddit share links with a real `/s/<share-id>` path segment and Google share links (`share.google/...`) get resolved via manual redirect followers before platform detection and extraction. The resolver must never replace the original URL with an empty or non-HTTP redirect result, and `downloads.py` must call it too before invoking yt-dlp; yt-dlp cannot reliably follow Reddit share links itself. Reddit gets `backend/cookies.txt` directly for auth; YouTube goes through `extract_with_youtube_fallback()` (see `ytdlp_common.py` below), which only reaches for cookies on a rate-limit or age-gate failure.

  **Instagram duration used to come back as 0** (frontend showed `--:--` — see below). yt-dlp's Instagram extractor sources `duration` from a single field (`video_duration`) in Instagram's own API response, and on some Reels that field is simply absent. Confirmed by probing real Reels: when it's missing, *nothing else in the returned info has the duration either* — Instagram's DASH uses `SegmentBase` (one byte-ranged file per representation), so the format dicts carry no `fragments` to sum, no `filesize`, and the manifest's `mediaPresentationDuration` is parsed by yt-dlp internally but never exposed on the formats.

  So duration recovery is a three-step chain in `extract_video_metadata()`: `info_dict["duration"]` → `_derive_duration_from_fragments()` (free, sums fragment durations, but only applies to SegmentTemplate/SegmentList DASH and HLS — **not** Instagram) → `_probe_duration_with_ffprobe()`, which range-reads the media container's own header (~2s, a few hundred KB, never the whole file). The ffprobe step is what actually fixes Instagram. It's platform-agnostic and only fires when the duration is otherwise unknown, so the cost is paid only on videos that would otherwise display `--:--`. It needs `ffprobe` on PATH — already guaranteed by the ffmpeg install yt-dlp's remuxer requires, and by the `ffmpeg` apt package in `backend/Dockerfile`, so it is not a new dependency; if it's missing the step no-ops rather than erroring.

  Note this only affects videos at extraction time — rows already saved with `duration_seconds = 0` keep that value and need re-adding to pick up the fix.
- `routes/crudvideos.py` (`/video/bulk-upload`) — accepts a list of URLs, extracts metadata **concurrently** (`ThreadPoolExecutor`, 5 workers) via the above helper, and streams NDJSON progress lines back to the client as each URL resolves (saved/duplicate/failed), inserting into `videos` + `video_download_status` (defaulting to `fresh`) and `failed_save_urls` on failure. Preloads the folder's existing `failed_save_urls` once per request so retried URLs don't create duplicate failure rows, and clears a URL out of `failed_save_urls` the moment a retry succeeds (or turns out to already be saved as a duplicate) — so `FailedUrlShowPopUpCard` on the frontend never shows a URL that has actually succeeded.
- `routes/downloads.py` (`/download/*`) — actual file downloads. Runs a blocking yt-dlp download in a background thread per job, tracked in an **in-process `jobs` dict** (no persistence — job state is lost on server restart). It resolves Reddit/Google share links through `resolve_share_url()` before platform detection and yt-dlp, even though the database preserves the exact URL the user pasted. Per-platform `format`/postprocessor tuning again lives here (kept in sync conceptually with `yt_dlpextractmetadataofvideo.py`'s platform detection, but duplicated, not shared — see the footgun noted below). Key invariant called out in comments: always use `FFmpegVideoRemuxer`, never `FFmpegVideoConvertor` (avoid re-encoding). The actual `extract_info(download=True)` call goes through `extract_with_youtube_fallback()`, same as metadata extraction. Progress is polled (`GET /download/progress/{job_id}`), and `GET /download/file/{job_id}` streams the finished file then deletes the temp dir via a `BackgroundTask`.
- `routes/video_download_status.py` (`/video-status/*`) — persists the per-video status shown above so download progress survives page reloads/navigation.
- `routes/proxy.py` (`/proxy/image`) — proxies thumbnail images for domains that block hotlinking (Instagram/Facebook CDN); redirects straight through for anything not on the allowlist.

  **A 502 out of this route usually means the thumbnail URL expired, not that the proxy broke.** Meta's CDN URLs are signed and time-limited: the `oe` query param is a hex Unix timestamp (~4.5 days of life, measured), and once it passes fbcdn returns `403 URL signature expired`. `raise_for_status()` then turns that into a blanket 502, so Instagram/Facebook cards silently go blank a few days after being added while YouTube/Reddit/Twitter (unsigned, non-expiring URLs) are unaffected. Decode `oe` before investigating anything else — `int(oe, 16)` as an epoch tells you immediately whether the URL was already dead.

### Thumbnail persistence (`app/thumbnail_store.py`)

The real fix for the above is to stop treating a 4-day signed credential as a permanent address: store the image bytes, not the URL. `thumbnail_store.py` owns a Supabase Storage bucket (`video-thumbnails`, public, auto-created on first use via `create_bucket` — no dashboard setup needed) and is used only for `CACHED_PLATFORMS = ("instagram", "facebook")`, since no other platform's thumbnails expire.

- **Objects are keyed `{folder_id}/{video_id}.jpg`.** The folder id being the path *prefix* is load-bearing: deleting a folder is "remove everything under this prefix", which needs no lookup of the video rows and therefore can't orphan files when the rows are already gone.
- **Nothing cascades into storage** — Postgres has no idea these objects exist. Both delete paths clean up explicitly, and both are required: `crudfolders.py` `delete_folder` purges the whole prefix, and `crudvideos.py` `delete_video` removes the single object (folder-level cleanup never fires for a one-off video delete, so without it that image leaks forever). **Any new route that deletes videos must do the same.**
- `is_thumbnail_expired()` is pure arithmetic on `oe` — no network call — which is what lets `/video/regenerate-thumbnails` re-extract only the genuinely dead rows. That matters: each regeneration is a real Instagram API hit, and re-fetching a whole folder blindly is a good way to get rate-limited. It also treats a missing/unparseable `oe` as expired (can't prove it's still good) and an already-stored bucket URL as never-expiring.
- Bytes are stored as-is rather than re-encoded; WebP would save ~100KB/image but costs a Pillow dependency, which isn't worth it at this scale.

`POST /video/regenerate-thumbnails` (folder-scoped, **calls `assert_folder_visible`**) mints a fresh URL via yt-dlp then uploads the bytes, streaming NDJSON like `bulk-upload` so a slow folder shows progress and one deleted post fails alone instead of aborting the batch.

**Its cancel path is why that route builds its `ThreadPoolExecutor` without a `with` block.** The UI cancels by aborting the fetch, which closes the generator and raises `GeneratorExit`; `with` would then call `shutdown(wait=True)` on the way out and grind through every queued video anyway — measured at 40/40 tasks still running after cancel, i.e. minutes of extra Instagram traffic for a run the user just stopped. The explicit `finally: executor.shutdown(wait=False, cancel_futures=True)` drops unstarted work (40 → 7 tasks) and returns immediately. Cancelling is safe by construction: each video's `thumbnail` is written as it completes, never batched at the end, so a cancelled run just stops early with its finished work saved. The frontend counts `updated`/`failed` from the progress events rather than the `complete` event, since a cancelled run never receives one. `GET /video/thumbnail-status` returns `{total, expired}` cheaply so the UI can hide the action when there's nothing to fix. Note `bulk-upload` deliberately still saves the raw CDN URL — caching at insert time would add a download+upload to the perf-sensitive bulk path, so new videos get cached lazily on the first regenerate instead.
- `schemas/*.py` — Pydantic request/response models per domain, imported by the matching route module.

### Frontend structure (`frontendweb/src/`)

- App Router pages: `app/page.tsx` (landing), `app/folder/[id]/page.tsx` (per-folder video list/management). `app/layout.tsx` wraps everything in `ThemeProvider` → `AdminProvider` → `DownloadQueueProvider` and renders the fixed ambient background (grid + blurred color blobs) behind the app.
- `components/DownloadQueueContext.tsx` — the core client-side download orchestrator, provided app-wide. Maintains an in-memory job queue (`jobs`) separate from persisted DB statuses (`dbStatuses`), runs **one download at a time** (queue runner effect gates on `activeCount === 0`), polls `/download/progress/{job_id}` every 500ms while a job is downloading, and on completion either writes the file via the File System Access API or falls back to a plain `<a download>` click. A selected directory handle is stored locally in IndexedDB and restored on a later visit only if the browser still grants `readwrite` permission; if access is revoked or storage fails, the folder bar and alert modal explain the recovery action and downloads safely use the browser default. Never send a local path or handle to the backend. Every state transition (`pending`/`downloaded`/`cancelled`/`failed`) is synced back to the backend's `video-status` endpoints so progress survives reloads.
- `components/VideoDataCard.tsx`, `FailedUrlShowPopUpCard.tsx`, `ChatgptUrlCheckerPopUpCard.tsx` — video list items, failed-URL review UI, and the paste-text-and-extract-URLs flow, respectively (each pairs with a backend route of the same concern above). `VideoDataCard`'s `formatDuration()` treats `duration_seconds <= 0` as unknown (`--:--`) rather than a literal `0:00` — a real video's duration is never actually zero, that value means the backend's extractor couldn't determine it (see the Instagram note above).
- `components/Sidebar.tsx`, `Navbar.tsx`, `Footer.tsx` — layout chrome; folder list/navigation lives in the sidebar.
- `components/RegenerateThumbnailsButton.tsx` — navbar action that repairs expired Instagram/Facebook thumbnails (see "Thumbnail persistence" above). It's mounted in the global `Navbar`, so it derives the folder id from `usePathname()` and renders `null` off `/folder/[id]`, and also when the folder has no expired thumbnails — the action should never be offered when it would do nothing. It signals completion via a `window` event (`THUMBNAILS_UPDATED_EVENT`) because the folder page lives outside the navbar's tree; the folder page listens and refetches.
- **Network errors are translated centrally in `lib/api.ts`, not per component.** The whole app is useless offline (yt-dlp, Supabase, OpenAI), so a dropped connection is the single likeliest failure — but fetch reports it as a bare `TypeError: Failed to fetch`, which tells the user nothing about whether it's their wifi, the server, or a bug. `apiFetch` catches that and throws a `NetworkError` distinguishing offline (`navigator.onLine === false`) from "backend unreachable", passing `AbortError` through untouched so deliberate cancellations aren't reported as connectivity problems. Every call site already does `err instanceof Error ? err.message : …`, so this reaches the UI everywhere for free. `asFriendlyError(err)` is the equivalent for `catch` blocks around **streaming reads** — `apiFetch` only guards the initial request, and the long-running NDJSON endpoints (`bulk-upload`, `regenerate-thumbnails`) reject the *reader* with a bare TypeError if the connection drops mid-stream.
- `components/AlertMessagePopUp.tsx`, `ConformationMessagePopUp.tsx` — shared alert/confirm modal primitives used across the CRUD flows. Both (plus `AdminAskPasswordPopUp.tsx`, `ChatgptUrlCheckerPopUpCard.tsx`, `FailedUrlShowPopUpCard.tsx`) get their Escape-to-dismiss, background-scroll-lock, and focus-trap behavior from the shared `lib/useModal.ts` hook rather than each reimplementing it — a new popup should use it too, not hand-roll `onKeyDown`.

#### Theme system

- `components/ThemeProvider.tsx` — light/dark/system, chosen value persisted to `localStorage` (`zscrape_theme`). Dark mode is a `.dark` class on `<html>`, not a media query, so the in-app toggle can override the OS preference; `ThemeProvider.THEME_SCRIPT` is inlined into `<head>` in `app/layout.tsx` and runs before first paint (reads storage, sets the class) so there's no light-then-dark flash on load. `components/ThemeToggle.tsx` is the three-way segmented control in the navbar.
- `app/globals.css` defines the palette as semantic CSS custom properties (`--bg`, `--surface`, `--fg`, `--muted`, `--accent`, `--ok`/`--warn`/`--danger`, …) mapped into Tailwind v4 via `@theme inline`, redefined once under `.dark`. **Components must use the semantic Tailwind classes (`bg-surface`, `text-muted`, `border-line`, `bg-accent-soft`, …), never raw palette colors like `zinc-200` or `blue-600`** — that's what makes both themes fall out of one file instead of a `dark:` variant on every element. `@custom-variant dark (&:where(.dark, .dark *))` is what makes Tailwind honor the class instead of only `prefers-color-scheme`.

#### Layout-shift discipline

The app targets zero CLS; this is a deliberate, enforced convention, not incidental:

- Loading states use fixed-size skeletons (the `skeleton` utility in `globals.css`) shaped exactly like the real content they precede — e.g. the folder page's loading grid and `FailedUrlShowPopUpCard`'s loading rows match their loaded counterparts' dimensions.
- Thumbnails reserve their box via `aspect-video` before the image loads (`VideoDataCard.tsx`); card action areas (`min-h-[...]`) are height-locked across all their states (fresh/downloading/completed/failed/…) so a status change never resizes the card and shifts everything after it in the grid.
- Progress bars animate `transform: scaleX(...)`, never `width` — see `VideoDataCard.tsx`, `HeroShowcase.tsx`, `ChatgptUrlCheckerPopUpCard.tsx`.
- `components/Reveal.tsx` (scroll-in animation on the landing page) only ever animates `opacity`/`transform`; the element occupies its final box from first paint.
- `scrollbar-gutter: stable` is set globally in `globals.css` so a page crossing the viewport height doesn't shift everything sideways by gaining a scrollbar.

#### Landing page (`app/page.tsx` + `components/home/`)

The landing page is a server component — no hooks of its own — so it paints instantly; everything animated is a small client-island import: `Reveal` (scroll-reveal), `home/CountUp.tsx` (animated stat counters), `home/SpotlightCard.tsx` (cursor-tracking glow on feature cards, written via a CSS custom property so the mousemove handler never triggers a React re-render), and `home/HeroShowcase.tsx` (the looping paste → extract → download mock in the hero, height-locked across its three stages so the loop never resizes the hero).

Platform branding is centralized in `lib/platforms.ts` (`name`, `slug` — matches the backend's `platform` string, see `_get_platform()` below — `react-icons` brand icon, and official brand color) and rendered via `components/PlatformBadge.tsx` — a circular chip with the icon on its own solid brand-color background rather than the theme surface or a translucent tint, so it stays legible both in dark mode (black-heavy marks like X, TikTok) and on top of an arbitrary photo (`VideoDataCard.tsx`'s on-thumbnail badge, looked up via `getPlatform(video.platform)`), where a semi-transparent theme-colored badge has no guaranteed contrast. Also used by the landing page's "Works with" marquee and `HeroShowcase`'s mock platform chips — add new platforms in one place, `lib/platforms.ts`. `lib/version.ts` is likewise the one place `APP_VERSION` lives (shown in `Navbar.tsx` and the landing page's changelog badge).

### Cross-cutting notes

- `app/ytdlp_common.py` holds the YouTube-specific yt-dlp settings (JS runtime, `tv_simply` player client, PO token provider URL) shared by both yt-dlp call sites. Its `apply_youtube_opts()` is called **last** in each options builder because it merges into `extractor_args` rather than replacing it, preserving the per-platform args set above it. If YouTube downloads start 403-ing partway through again, that file is the place to look — YouTube changes this roughly every few months.
- Platform detection (twitter/x, instagram, facebook, reddit, tiktok, youtube-or-other) is reimplemented independently in at least three places (`chatgpturlchecker.py`, `yt_dlpextractmetadataofvideo.py`, `downloads.py`) with slightly different platform sets — when changing platform behavior, check all three.
- Download job state (`downloads.py`'s `jobs` dict) is purely in-memory; restarting the backend orphans any in-flight downloads (frontend will see 404s on progress polling and mark them cancelled).
- Bulk operations (`bulk-upload`) are the main perf-sensitive path — metadata extraction is deliberately parallelized (5 workers) and results stream back as NDJSON rather than waiting for the whole batch.
