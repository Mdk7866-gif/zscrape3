# Docker Commands Reference

Build, run, and push the Docker images for the **zscrape3** application.

## Prerequisites

- Run everything from the project root: `c:\Users\ASUS\OneDrive\Desktop\zscrape3`
- **Docker Engine must be running.** If you get an error about a connection pipe (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`), open Docker Desktop and wait for it to finish starting.
- `backend/.env` must exist (copy from `backend/env.example`). It is **not** baked into the image — it is read at runtime.

### Images in this project

| Image | Source | Pushed? |
|---|---|---|
| `mdk7866/zscrape3-backend` | built from `./backend` | yes |
| `mdk7866/zscrape3-frontend` | built from `./frontendweb` | yes |
| `brainicism/bgutil-ytdlp-pot-provider:1.3.1` | pulled from Docker Hub | no — third-party, just pulled |

The third service supplies YouTube PO tokens. Keep its tag version-matched with the `bgutil-ytdlp-pot-provider` pin in `backend/pyproject.toml`.

---

## ⚠️ Read before your first push

Two things will silently bite you otherwise.

**1. Secrets must not end up inside the images.** `backend/.env` and `backend/cookies.txt` are both excluded via `backend/.dockerignore`. `cookies.txt` holds a real signed-in YouTube/Reddit session — if it were copied into an image pushed to Docker Hub, anyone pulling it would get your session. Docker Hub repos default to **public**, so verify the exclusions held before pushing:

```bash
docker run --rm mdk7866/zscrape3-backend:latest ls -la /app
```

Neither `.env` nor `cookies.txt` should appear. If either does, your `.dockerignore` didn't apply — stop and fix it before pushing.

**2. The frontend's backend URL is frozen at build time.** Next.js inlines `NEXT_PUBLIC_*` variables into the JavaScript bundle when `npm run build` runs. Setting `NEXT_PUBLIC_API_URL` on the *container* does nothing for code running in the browser. Pass it as a `--build-arg` (see below) with the address the **user's browser** can reach — not the compose service name.

---

## 1. Authentication

Log in to Docker Hub (account `mdk7866`):

```bash
docker login
```

*(If you're already logged in this just verifies the stored credentials.)*

---

## 2. Build the images

### Backend

```bash
docker build -t mdk7866/zscrape3-backend:latest ./backend
```

This is the slow one — it installs ffmpeg, build tools, and a pinned Deno binary (needed by yt-dlp to solve YouTube's player challenge). Expect several minutes on a cold build.

### Frontend

For local use, where the browser reaches the backend on localhost:

```bash
docker build -t mdk7866/zscrape3-frontend:latest ./frontendweb
```

For a deployed frontend, bake in the public backend URL:

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com \
  -t mdk7866/zscrape3-frontend:latest ./frontendweb
```

Whatever you pass here is what the shipped bundle calls forever. To change it, rebuild.

### Or build both via Compose

```bash
docker compose build
```

Compose reads the image names and the `NEXT_PUBLIC_API_URL` build arg from `docker-compose.yml`, so this tags both images identically to the commands above.

---

## 3. Run locally

```bash
docker compose up -d
```

- Frontend → http://localhost:3000
- Backend → http://localhost:8000 (docs at `/docs`)

Useful while it's up:

```bash
docker compose logs -f backend      # follow backend logs
docker compose logs -f              # all services
docker compose ps                   # what's running
docker compose down                 # stop and remove containers
docker compose up -d --build        # rebuild changed images, then start
```

Downloads land in `./backend/downloads` (bind-mounted, so they survive `down`).

---

## 4. Push to Docker Hub

```bash
docker push mdk7866/zscrape3-backend:latest
docker push mdk7866/zscrape3-frontend:latest
```

Do the `ls -la /app` check from the warning section above first if you've touched `.dockerignore` or the Dockerfiles.

### Version tags (recommended over bare `latest`)

`latest` is a moving target — once it's overwritten there is no way back. Tag a real version alongside it so you can roll back:

```bash
docker tag mdk7866/zscrape3-backend:latest mdk7866/zscrape3-backend:v1.0.0
docker tag mdk7866/zscrape3-frontend:latest mdk7866/zscrape3-frontend:v1.0.0

docker push mdk7866/zscrape3-backend:v1.0.0
docker push mdk7866/zscrape3-frontend:v1.0.0
```

---

## 5. Pull and run elsewhere

On the target machine you need `docker-compose.yml`, a `backend/.env`, and (optionally) `backend/cookies.txt`. Then:

```bash
docker compose pull
docker compose up -d
```

`pull` fetches the pushed images instead of rebuilding. If `backend/cookies.txt` doesn't exist, either create an empty file or delete that volume line from `docker-compose.yml` — Docker will otherwise create a *directory* by that name and yt-dlp will fail to read it.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Frontend loads but every request fails, console shows calls to `127.0.0.1:8000` | The frontend image was built without `--build-arg NEXT_PUBLIC_API_URL`. Rebuild with it. |
| `denied: requested access to the resource is denied` on push | Not logged in, or the image name doesn't start with your Docker Hub username. Run `docker login`. |
| Backend exits immediately | Missing `SUPABASE_URL` / `SUPABASE_SECRET_KEY`. Check `backend/.env` and `docker compose logs backend`. |
| YouTube downloads cap at 360p | `bgutil-provider` isn't reachable. Confirm it's up (`docker compose ps`) and that the backend has `POT_PROVIDER_URL=http://bgutil-provider:4416`. |
| YouTube dies partway with `HTTP Error 403` | No JS runtime in the image — the Deno install step failed. Check the build log. |
| Instagram/Facebook 403 with a FortiGuard message | Network-level block, not a code or Docker issue. Use a different network. |
| Build fails downloading Deno | The pinned `DENO_VERSION` in `backend/Dockerfile` was withdrawn. Bump it, or override: `docker build --build-arg DENO_VERSION=v2.9.5 ...` |
| Need to reclaim disk space | `docker image prune` (dangling only) or `docker system prune -a` (**removes all unused images**). |
