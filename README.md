# zscrape3

Video URL manager: paste messy text containing links, an LLM (GPT-4o via LangGraph) extracts the URLs, yt-dlp pulls metadata for each, and results are organized into folders backed by Supabase (Postgres). Videos can then be downloaded to disk with live progress tracking. A password-gated **admin workspace** provides a second, private set of folders that only the admin can see.

Two services — `backend` (FastAPI) and `frontendweb` (Next.js) — normally run together via `docker-compose.yml`. See [`CLAUDE.md`](./CLAUDE.md) for commands, environment setup, and a full architecture write-up (including the YouTube/Instagram anti-bot workarounds).

## Directory structure

```
zscrape3/
├── README.md                    — this file
├── CLAUDE.md                    — architecture & command reference (start here for dev setup)
├── docker-compose.yml           — backend + frontend + PO-token provider services
├── zscrape3_database.sql        — Supabase schema (SQL)
├── quickdockerpush.md           — build/push Docker images; run the 3 local-dev servers
├── website_setup_guide(v-2).pdf
│
├── migrations/                  — hand-written SQL migrations, run manually in the
│   └── 001_add_folders_is_admin.sql    Supabase SQL editor (no migrations tooling here)
│
├── backend/                     — FastAPI service (Python 3.13, managed with uv)
│   ├── app/
│   │   ├── main.py                             — FastAPI app entrypoint, CORS, /health
│   │   ├── config.py                            — pydantic-settings, reads backend/.env
│   │   ├── supabase.py                          — Supabase client (service-role key)
│   │   ├── admin_auth.py                        — admin session tokens + folder/video
│   │   │                                            visibility guards (404, not 403)
│   │   ├── ytdlp_common.py                      — shared YouTube yt-dlp settings: JS runtime,
│   │   │                                            PO-token provider, cookie-based rate-limit fallback
│   │   ├── routes/
│   │   │   ├── router.py                        — combines all route modules into api_router
│   │   │   ├── admin.py                         — /admin/*         — login / logout / session
│   │   │   ├── chatgpturlchecker.py             — POST /chatgpturlchecker — LangGraph + GPT-4o URL extraction
│   │   │   ├── crudfolders.py                   — /folder/*        — folder CRUD
│   │   │   ├── crudvideos.py                    — /video/*         — video CRUD + bulk-upload (NDJSON stream)
│   │   │   ├── downloads.py                     — /download/*      — actual video downloads (background jobs)
│   │   │   ├── failed_urls.py                   — /failed-urls/*   — failed-URL review/retry list
│   │   │   ├── proxy.py                         — /proxy/image     — thumbnail proxy (Meta CDN hotlink bypass)
│   │   │   ├── video_download_status.py         — /video-status/*  — persisted per-video download status
│   │   │   └── yt_dlpextractmetadataofvideo.py  — shared yt-dlp metadata extraction (not a route)
│   │   └── schemas/                             — Pydantic request/response models
│   │       ├── download.py
│   │       ├── failed_url.py
│   │       ├── folder.py
│   │       ├── url_checker.py
│   │       └── video.py
│   ├── downloads/                — scratch dir for in-progress downloads (Docker volume mount)
│   ├── cookies.txt                — Netscape-format cookies for Reddit + YouTube auth (gitignored)
│   ├── env.example                — template for backend/.env
│   ├── zscrape3database.dbml      — schema diagram source
│   ├── Dockerfile
│   ├── pyproject.toml             — dependencies (uv)
│   └── uv.lock
│
├── frontendweb/                 — Next.js 16 / React 19 app
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                 — landing page (server component; animated bits
│   │   │   │                                are client islands from components/home/)
│   │   │   ├── layout.tsx               — root layout: Theme/Admin/DownloadQueue providers,
│   │   │   │                                ambient background, pre-paint theme script
│   │   │   ├── globals.css              — semantic color tokens (light/dark), CLS-safe
│   │   │   │                                utilities (skeleton, clamp-2, reveal, bg-grid)
│   │   │   └── folder/[id]/page.tsx     — per-folder video list/management
│   │   ├── lib/
│   │   │   ├── api.ts                   — apiFetch wrapper; attaches the admin token
│   │   │   ├── useModal.ts              — shared Escape/scroll-lock/focus-trap for popups
│   │   │   ├── platforms.ts             — platform name/slug + react-icons brand logo + brand
│   │   │   │                                color, and getPlatform() to look one up by slug
│   │   │   └── version.ts               — single source of truth for APP_VERSION
│   │   └── components/
│   │       ├── DownloadQueueContext.tsx        — client-side download queue/orchestrator (app-wide)
│   │       ├── VideoDataCard.tsx               — single video list item
│   │       ├── ChatgptUrlCheckerPopUpCard.tsx  — paste-text → extract URLs → bulk-upload flow
│   │       ├── FailedUrlShowPopUpCard.tsx      — failed-URL review/retry popup
│   │       ├── AdminContext.tsx                — admin session state (useAdmin hook)
│   │       ├── AdminAskPasswordPopUp.tsx       — admin login prompt
│   │       ├── ThemeProvider.tsx               — light/dark/system theme (useTheme hook)
│   │       ├── ThemeToggle.tsx                 — segmented theme switch, shown in the navbar
│   │       ├── Reveal.tsx                      — scroll-reveal wrapper (opacity/transform only)
│   │       ├── PlatformBadge.tsx               — circular brand-colored platform logo chip
│   │       │                                     (video cards' on-thumbnail badge + landing page)
│   │       ├── Sidebar.tsx                     — folder list/navigation
│   │       ├── Navbar.tsx
│   │       ├── Footer.tsx
│   │       ├── AlertMessagePopUp.tsx           — shared alert modal
│   │       ├── ConformationMessagePopUp.tsx    — shared confirm modal
│   │       └── home/                           — landing-page-only client islands
│   │           ├── HeroShowcase.tsx                — looping paste→extract→download mock
│   │           ├── CountUp.tsx                     — animated stat counters
│   │           └── SpotlightCard.tsx               — cursor-tracking glow on feature cards
│   ├── public/                   — static assets (svg icons)
│   ├── AGENTS.md                  — Next.js version notes for AI coding agents (auto-loaded)
│   ├── Dockerfile
│   ├── package.json              — deps: next/react/tailwind + react-icons (platform logos)
│   ├── next.config.ts
│   ├── eslint.config.mjs
│   └── tsconfig.json
│
└── bgutil-provider/              — local install of the YouTube PO-token provider
                                     (gitignored, not committed — see CLAUDE.md for setup)
```

`node_modules/`, `.venv/`, `.next/`, `__pycache__/`, and other generated/dependency directories are omitted above — they're gitignored and rebuilt by `npm install` / `uv sync`.
