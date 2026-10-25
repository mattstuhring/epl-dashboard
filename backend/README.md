# EPL Ambient Dashboard backend

The backend provides the dashboard's FastAPI API and isolates football-data.org v4 behind the `FootballProvider` protocol and `FootballDataAdapter`. A single lifespan-managed worker refreshes standings into SQLite; `GET /api/standings` reads that local state and never calls the provider. This keeps browser and kiosk polling independent of provider request usage. The standings quiet-period interval is 12 hours by default. Fixture/match refresh and activity-aware intervals are later work.

The detailed requirements and Codex instructions are maintained locally under the repository's root `docs/` and `AGENTS.md`; they are intentionally excluded from Git. This README stays with the source and covers routine setup, checks, and running the backend.

## Local setup

Use Python 3.12 or newer. Create a separate virtual environment on each machine; do not copy the Mac's `.venv` to the Pi because it is tied to its Python installation and operating system. From the repository root, enter `backend/`, verify the selected interpreter, then create the virtual environment if it does not already exist and install the project with its development tools:

```bash
cd backend
python --version
python -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
```

`pyproject.toml` is the dependency manifest. Installing the `dev` extra includes pytest, Ruff, Pyright, and `httpx2` for Starlette's test client. The outbound provider adapter uses `httpx`.

Create a local settings file from the example and add your football-data.org token to `FOOTBALL_DATA_TOKEN`:

```bash
cp .env.example .env
```

`backend/.env` is gitignored. Keep the token there or in the process environment; never put it in frontend variables, browser requests, logs, or committed files. The API can start without a token; the refresh state reports a safe error until a provider response is available. Run Uvicorn with `backend/` as its working directory so `.env` is found and the default relative database path resolves to `backend/data/epl-dashboard.sqlite3`. That SQLite file is also gitignored and persists across application restarts.

The settings also allow `DATABASE_PATH`, `STANDINGS_REFRESH_INTERVAL_SECONDS` (default `43200`, or 12 hours), and `STANDINGS_FAILURE_RETRY_SECONDS` (default `900`, or 15 minutes). The failure retry is a configurable implementation default for the standings proof of concept; a longer provider `Retry-After` value takes precedence. SQLite retains the latest successful snapshot for each season and keeps prior seasons.

## Run the API

From `backend/`, start the development server:

```bash
.venv/bin/uvicorn main:app --app-dir src --reload
```

The API listens on `http://127.0.0.1:8000`. Visit `/docs` for the generated OpenAPI documentation and `/api/standings` for standings plus refresh state. A background worker attempts the initial refresh at startup when no schedule exists. Repeated API reads do not cause provider requests. Run one Uvicorn worker because the current scheduler is process-local. Stop the development server with `Ctrl+C`; FastAPI closes the provider and database connection during shutdown while keeping the SQLite file for the next start. See [`frontend/README.md`](../frontend/README.md) for the browser setup.

## Serve the built frontend

Development still uses two servers: Vite serves the changing frontend and proxies `/api` to FastAPI. For a production-like local run, build the frontend once and let the same FastAPI process serve both the built page and API from one origin. FastAPI's `app.frontend()` serves the build and falls back to `index.html` for browser navigation paths used by client-side routing:

```bash
cd frontend
npm ci
npm run build
cd ../backend
.venv/bin/uvicorn main:app --app-dir src
```

Open `http://127.0.0.1:8000`. FastAPI serves `frontend/dist` at `/` and its bundled assets, while `/api/*` remains handled by the API. Missing assets still return 404; browser navigation paths use the SPA fallback. This uses FastAPI's `app.frontend()` API, so the declared FastAPI minimum is 0.138. The build output is ignored by Git and is not required to run backend tests or the API by itself. This validates local same-process serving; it does not yet configure startup on the Raspberry Pi.

## Tests and code checks

The automated tests use sanitized sample responses and injected dependencies. They run offline and do not need a provider token:

```bash
.venv/bin/pytest -p no:cacheprovider
.venv/bin/ruff check src tests
.venv/bin/ruff format --check src tests
.venv/bin/pyright
```

An authenticated browser smoke check with a locally configured token tests live provider access separately from these offline checks. The user has confirmed the Pi's 64-bit Debian 13/Python 3.13 runtime meets the project's version requirement, but Mac checks and provider mocks do not verify installing or operating this backend on the Pi.

The local-only project specification, handoff, and Python standard live in root `docs/` for Codex work. They are not present in source clones or Pi deployments; this README contains the standalone backend operations needed there.
