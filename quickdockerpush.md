# Section 1: build + push Docker images

Run from: `c:\Users\ASUS\OneDrive\Desktop\zscrape3`

```bash
docker build -t mdk7866/zscrape3-backend:latest ./backend
docker build -t mdk7866/zscrape3-frontend:latest ./frontendweb
docker push mdk7866/zscrape3-backend:latest
docker push mdk7866/zscrape3-frontend:latest
```

---

# Section 2: running the website locally (3 servers)

## Terminal 1 — bgutil PO-token provider

Run from: `c:\Users\ASUS\OneDrive\Desktop\zscrape3`

```bash
node bgutil-provider/build/main.js
```

Check if it's running (in any terminal):

```bash
curl.exe http://127.0.0.1:4416/ping
```

HTTP 200 = running. No response = not running, start it.

## Terminal 2 — backend

Run from: `c:\Users\ASUS\OneDrive\Desktop\zscrape3\backend`

```bash
uv run dev
```

## Terminal 3 — frontend

Run from: `c:\Users\ASUS\OneDrive\Desktop\zscrape3\frontendweb`

```bash
npm run dev
```

## Stopping the servers

Click into each terminal and press `Ctrl+C`. All three (provider, backend, frontend) stop
this way — none of them run in the background on their own.
