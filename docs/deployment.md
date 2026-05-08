# LabMind — Deployment Guide

**Last updated:** 2026-05-08
**Target:** Frontend → Vercel, Backend → Railway (always-on)
**Current implementation phase:** Phase 3 complete (see `docs/process.md`)

---

## Overview

The project has two independently deployed services:

| Service | Platform | Root dir | Start command |
|---|---|---|---|
| Backend (FastAPI) | Railway | `backend/` | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Frontend (Next.js) | Vercel | `frontend/` | `npm run build` |

They communicate via HTTP — the frontend polls the backend every 4 seconds. Static images (processed GFP PNGs) are served directly by FastAPI's `/static` mount.

---

## Step 0 — Fix `.gitignore` Before Anything Else

The root `.gitignore` currently excludes `backend/data/` and `backend/static/`. Both are required at runtime and must be committed to git so Railway has them on deploy.

### What each path contains and what to do

| Path | Contents | Action |
|---|---|---|
| `backend/static/images/*.TIF` | 144 BBBC016 fluorescence TIF files (44 MB total) | **Commit** — remove from gitignore |
| `backend/static/images/processed/` | Runtime-generated GFP PNGs, cleared on every restart | **Keep ignored** — created at import time by `image_processing.py` |
| `backend/data/batches/batch_B1.json` | Pre-seeded historical batch (rates 0.05–0.15) | **Commit** — seeded demo data |
| `backend/data/batches/batch_B2.json` | Pre-seeded historical batch (rates ~0.84 best) | **Commit** — seeded demo data |
| `backend/data/state.json` | Current system state | **Commit** as IDLE defaults — overwritten on every startup anyway |
| `backend/data/proposals/pending.json` | Runtime-generated proposal | Keep ignored or commit a placeholder — created dynamically |

### Edit `.gitignore`

Replace the current data/static block:

```
# Data files
backend/data/
backend/static/
data/

# Image files
```

With this:

```
# Runtime-generated files only
backend/static/images/processed/
backend/data/state.json
backend/data/proposals/
data/
```

Then stage and commit the previously ignored files:

```bash
git add backend/static/images/*.TIF
git add backend/data/batches/batch_B1.json
git add backend/data/batches/batch_B2.json
git commit -m "add BBBC016 TIF files and seeded batch data"
```

> If you prefer not to commit 44 MB of binary files to git, the alternative is a Railway build script that downloads the BBBC016 dataset from the Broad Institute at build time. But for a demo, committing directly is simpler and avoids external download dependencies.

---

## Step 1 — Deploy Backend to Railway

### 1.1 Create the service

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select your repository
3. When prompted for the root directory, set it to `backend/`
4. Railway detects `Procfile` and `runtime.txt` automatically — no manual build command needed

### 1.2 Set environment variables

In Railway → your service → Variables, add:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-...`) |
| `FRONTEND_URL` | Leave blank for now — fill in after Vercel deploy (Step 2.3) |

`PORT` and `DATA_DIR` do not need to be set manually — Railway injects `PORT` automatically, and `DATA_DIR` defaults to `./data` in `main.py`.

### 1.3 Configure the service settings

In Railway → your service → Settings:

- **Health check path:** `/health`
- **Health check timeout:** 30s
- **Service type:** Web Service (always-on — required so there's no cold start during demo)

### 1.4 Get your Railway URL

After the first deploy succeeds, Railway assigns a URL in the form:
```
https://<service-name>.up.railway.app
```

Copy this URL — you need it for Step 2.

### 1.5 Verify backend is running

```bash
curl https://<your-railway-url>.up.railway.app/health
# Expected: {"status": "ok"}

curl https://<your-railway-url>.up.railway.app/api/status
# Expected: {"current_state": "IDLE", ...}
```

---

## Step 2 — Deploy Frontend to Vercel

### 2.1 Create the project

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select your repository
3. Set **Root Directory** to `frontend/`
4. Framework preset: **Next.js** (auto-detected)
5. Build command: `npm run build` (default)
6. Output directory: `.next` (default)

### 2.2 Set environment variables

In Vercel → your project → Settings → Environment Variables:

| Variable | Value | Environment |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `https://<your-railway-url>.up.railway.app` | Production, Preview, Development |

No trailing slash on the URL.

### 2.3 Update `next.config.ts` with your Railway hostname

`frontend/next.config.ts` currently has `labmind-api.up.railway.app` as a placeholder. Replace it with your actual Railway hostname:

```typescript
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '<your-service-name>.up.railway.app',  // ← your actual hostname
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
      },
    ],
  },
};
```

Commit and push this change — Vercel will redeploy automatically.

### 2.4 Get your Vercel URL

After the deploy succeeds, Vercel assigns a URL:
```
https://<project-name>.vercel.app
```

---

## Step 3 — Wire CORS (back to Railway)

Now that you have the Vercel URL, go back to Railway → Variables and set:

| Variable | Value |
|---|---|
| `FRONTEND_URL` | `https://<project-name>.vercel.app` |

Railway redeploys automatically. The CORS middleware in `main.py` uses this value:

```python
allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")]
```

Without this set correctly, the browser will block all API calls from the frontend with CORS errors.

---

## Step 4 — Verify End-to-End

1. Open your Vercel URL in a browser
2. You should see the **Welcome page** (IDLE state)
3. B1 and B2 should already appear in **History** and **Analysis** pages
4. Click **Begin Experiment Batch** — state should move to RUNNING
5. Click **Run Analysis** — watch the PROCESSING log stream (one line per experiment, ~0.4s apart)
6. After ~30–60 seconds, proposal should appear with real GFP images and Claude analysis text
7. Test chat with a constraint: `"exclude concentrations above 0.3 mg/mL"` — state should move to EDITING
8. Click **Regenerate Proposal** — should regenerate and return to PROPOSAL_READY
9. Click **Approve Batch** — cycle completes, History page should now show 3 batches

---

## What Resets on What Event

| Event | What happens |
|---|---|
| **Backend restarts** (Railway redeploy, crash) | Processed PNGs cleared; state.json reverted to IDLE only if caught mid-run (PROCESSING, ANALYZING, etc.); **all batch files preserved** |
| **Frontend restarts** (Vercel redeploy) | No effect on backend state |
| **Reset Demo button** (`POST /api/reset`) | Full wipe: state → IDLE, B3+ batch files deleted, pending.json deleted. B1 and B2 preserved as historical baseline |
| **Clean slate** | Manually delete `data/batches/batch_B2.json` on Railway, then click Reset Demo or restart |

---

## Local Development

Run both services simultaneously in separate terminals:

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # first time only
pip install -r requirements.txt                      # first time only
cp .env.example .env                                 # first time only — fill in ANTHROPIC_API_KEY
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install                                          # first time only
cp .env.local.example .env.local                    # first time only — already points to localhost:8000
npm run dev
# Opens at http://localhost:3000
```

The `.env.local.example` already has `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` so no changes needed for local dev.

---

## Runtime-Generated vs. Committed Files

| File / Directory | Committed to git | Generated at |
|---|---|---|
| `backend/static/images/*.TIF` | Yes (after Step 0) | — |
| `backend/static/images/processed/*.png` | No | Each `POST /api/simulate` cycle |
| `backend/data/batches/batch_B1.json` | Yes | — (seeded) |
| `backend/data/batches/batch_B2.json` | Yes | — (seeded) |
| `backend/data/batches/batch_B3+.json` | No | Each `POST /api/approve` |
| `backend/data/proposals/pending.json` | No | Each agent analysis loop |
| `backend/data/state.json` | No (or commit IDLE defaults) | Managed by `StateManager` |

---

## Troubleshooting

**`curl /health` returns 502 / connection refused**
Railway deploy is still in progress or failed. Check Railway build logs — common causes are a missing dependency in `requirements.txt` or an import error on startup.

**CORS error in browser console (`Access-Control-Allow-Origin`)**
`FRONTEND_URL` env var on Railway is not set or has a trailing slash. Confirm the value is exactly `https://<project-name>.vercel.app` with no trailing `/`.

**Images not loading (broken image in comparison panel)**
`next.config.ts` still has the placeholder hostname. Update it to match your actual Railway URL and redeploy Vercel.

**Processing log never appears / state stuck at RUNNING**
TIF files are missing on Railway — the `backend/static/images/` directory is empty. This means Step 0 (committing TIF files and removing them from `.gitignore`) was not done. Verify with Railway's file browser or by checking `GET /api/status` after triggering simulate.

**History / Analysis pages show only B1**
`batch_B2.json` has `"status": "pending"` instead of `"complete"`. Open `backend/data/batches/batch_B2.json`, change line 4 from `"pending"` to `"complete"`, commit, and redeploy.

**B1 and B2 missing from History after deploy**
`batch_B1.json` and `batch_B2.json` were not committed (Step 0 not done). `StateManager` creates the `data/batches/` directory on startup but cannot recreate the seeded files.
