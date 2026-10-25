# EPL Dashboard frontend

The React and TypeScript interface displays normalized standings and refresh state from the local FastAPI backend. It reads `/api/standings`; Vite proxies `/api` to `http://127.0.0.1:8000` during development. The page checks the local API every 60 seconds so it can display backend state changes. Those reads use SQLite and do not make provider requests. The backend performs standings refreshes on its own schedule. The table footer displays the last successful update and next scheduled attempt in `America/Los_Angeles` time. The favorite club starts as Manchester United when that team is present, can be changed from the table toolbar, and is saved in this browser.

The detailed requirements and Codex instructions are maintained locally under the repository's root `docs/` and `AGENTS.md`; they are intentionally excluded from Git. This README stays with the source and covers routine setup, checks, and running the frontend.

## Local development

From the repository root, install backend dependencies and create a local, gitignored `backend/.env` file:

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
cp .env.example .env
```

Add the token to `backend/.env`, then start FastAPI from the `backend` directory in one terminal:

```bash
.venv/bin/uvicorn main:app --app-dir src --reload
```

Use Node.js 20.19+ or 22.12+ with the project's Vite 8 toolchain. From the repository root in a second terminal, install the versions recorded in `package-lock.json` and start the frontend:

```bash
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. Keep the backend server running while using the Vite proxy. Stop each development server with `Ctrl+C`. No provider token is needed to run the frontend tests. Without a token, the backend refresh state reports a safe configuration error and the page shows it.

## Verification

From `frontend/`, run:

```bash
npm test
npm run lint
npm run build
```

The automated UI tests use representative in-memory API responses and do not prove that the provider token, account access, or live provider schema works. On 2026-10-25, the production frontend build and a manual Chromium kiosk session were verified on the Raspberry Pi 5 running 64-bit Debian 13.7, aarch64, and Python 3.13.5. Sustained operation, resource use, and boot autostart have not been tested; the backend service and kiosk browser are manually started on this Pi.

## Built frontend with FastAPI

For a production-like local run, create the Vite build with `npm ci && npm run build`, then start the backend as described in [`backend/README.md`](../backend/README.md). When `frontend/dist/index.html` exists, FastAPI's `app.frontend()` serves the built page, its assets, and client-side navigation fallback at the same origin as `/api/*`. The generated `dist/` directory is gitignored, so rebuild after frontend source changes and restart Chromium to load the new bundle. Vite remains the development server for hot reload. The root README describes the intended Raspberry Pi hosting strategy at a high level.
