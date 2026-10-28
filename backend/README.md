# EPL Ambient Dashboard backend

The backend provides the dashboard's FastAPI API and isolates football-data.org v4 behind the `FootballProvider` protocol and `FootballDataAdapter`. A single lifespan-managed worker refreshes standings and fixtures into separate SQLite datasets; `GET /api/standings` reads that local state and never calls the provider. This keeps browser and kiosk polling independent of provider request usage. The standings quiet-period interval is 12 hours by default; both datasets use a shared 5-minute cadence on scheduled match days. Fixtures include scores, statuses, crests, and independently scheduled refresh state.

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

The API listens on `http://127.0.0.1:8000`. Visit `/docs` for the generated OpenAPI documentation and `/api/standings` for standings plus refresh state. A background worker attempts the initial refresh at startup when no schedule exists. Repeated API reads do not cause provider requests. Run one Uvicorn worker because the current scheduler is process-local. Stop the development server with `Ctrl+C`; FastAPI stops and joins the worker before closing the provider and both dataset database connections during shutdown while keeping the SQLite file for the next start. See [`frontend/README.md`](../frontend/README.md) for the browser setup.

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

## Fixtures and matchweeks

`GET /api/fixtures` returns local persisted data for the provider-selected current matchweek and the following numbered matchweek. Matchweek 38 has no following round. Browser reads never contact the football provider. One worker owns both standings and fixture schedules, sleeping until the earliest due attempt.

The adapter retrieves the current season from `/v4/competitions/PL/matches` in one request. It validates season identity, reported match count and unique match IDs before committing a complete season snapshot. Corrections and rescheduled kickoffs replace the same season snapshot without duplicates; previous seasons remain stored. A response that drops previously known match IDs in the same season is rejected as incomplete. A response without season identity (including an empty list) preserves existing data and reports a refresh error.

Fixture refresh settings are optional environment variables:

- `FIXTURES_REFRESH_INTERVAL_SECONDS`: quiet-period delay, default `21600` (6 hours).
- `ACTIVE_REFRESH_INTERVAL_SECONDS`: shared active-day interval for standings and fixtures, default `300` (5 minutes).
- `FIXTURES_FAILURE_RETRY_SECONDS`: failure retry delay, default `900` (15 minutes); a longer provider `Retry-After` takes precedence.

An active day is any Pacific calendar date with a currently scheduled EPL fixture in the full saved season, regardless of weekday or displayed matchweek. Finished games still count for that day; postponed/cancelled games do not. Gaps between match days are quiet. Missing fixture data uses quiet intervals until a successful fixture fetch establishes activity. No game-end detection or live-status override is needed.

One worker checks fixtures first, then standings, and sleeps until the earliest persisted due time. Active requests use UTC-aligned 5-minute slots: fixtures at `:00`, `:05`, etc., and standings halfway between (`:02:30`, `:07:30`, etc.). The offset is derived from half the shared interval, not another setting. Empty datasets bootstrap immediately; normal recurring requests are then staggered. Quiet intervals remain 6 hours for fixtures and 12 hours for standings.

New fixture dates and entry into an active day can bring a normal due time forward. The next known match-day boundary also caps a quiet wait, preventing the worker from sleeping through it. At the end of activity, an already scheduled attempt is not postponed; after it succeeds, the quiet interval applies. Each dataset retains its own stored snapshot, attempt history and retry deadline. Policy reconciliation never shortens a recorded failure retry or Retry-After delay.

**Updating an existing Pi:** replace any old `FIXTURES_ACTIVE_INTERVAL_SECONDS` entry in `backend/.env` with `ACTIVE_REFRESH_INTERVAL_SECONDS=300`, then restart the service. The old key is no longer used. Existing snapshots remain intact and normal saved due times are reconsidered automatically; do not clear the database to activate this policy. Browser polling remains local and does not trigger provider requests. Scores are still subject to the data plan's upstream delay.

No data reset is needed when deploying this feature. Fixture tables are created alongside existing standings tables at startup. Existing standings snapshots without crests remain readable and acquire logos after their next successful refresh. Restart the backend after changing environment settings.

## Raspberry Pi 5 deployment

This procedure documents the verified manual deployment on a Raspberry Pi 5 (4 GB) running 64-bit Debian 13 (Trixie), `aarch64`, Python 3.13.5, and Node.js 24.22.1. It keeps the Pi available for other projects: the backend service and Chromium kiosk are started when needed and are not enabled to start automatically at boot. Commands below assume the Pi login is `mattstuhring` and the checkout is `~/Projects/epl-dashboard`; substitute your own home directory and account name where they differ.

### Before deploying

- Use a 64-bit Raspberry Pi OS or compatible Debian desktop with Python 3.12+, Git, and Chromium.
- Install a Node.js version supported by the project's Vite version (20.19+ or 22.12+); Node is needed to build the frontend, not to serve it.
- Configure SSH access to the GitHub repository. A repository read-only deploy key is suitable for a Pi that only pulls code. Confirm `git pull` can authenticate before beginning.
- Obtain a football-data.org token and keep it only in `backend/.env` on the Pi.
- Have the Pi desktop available for the Chromium kiosk launch. SSH is suitable for service and deployment commands; a kiosk browser needs the Pi's graphical desktop session.

### First deployment

Clone the repository on the Pi using the configured SSH URL, then build the frontend there. `npm ci` installs the versions from the committed lockfile; `npm run build` creates `frontend/dist`, which FastAPI serves at runtime.

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone git@github.com:mattstuhring/epl-dashboard.git
cd epl-dashboard/frontend
npm ci
npm run build
```

Create the backend environment on the Pi itself; never copy the Mac's `.venv` because virtual environments are machine-specific. Create `backend/.env` from the example and set `FOOTBALL_DATA_TOKEN` there. Keep the token private and do not place it in Git, frontend settings, or the systemd unit.

```bash
cd ~/Projects/epl-dashboard/backend
python3 --version
python3 -m venv .venv
.venv/bin/python -m pip install -e .
cp .env.example .env
```

Use an editor to add the token to `backend/.env`, then install a systemd unit at `/etc/systemd/system/epl-dashboard.service`. Replace `mattstuhring` with the Pi account name in `User`, `WorkingDirectory`, `EnvironmentFile`, and `ExecStart`:

```ini
[Unit]
Description=EPL Ambient Dashboard
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=mattstuhring
WorkingDirectory=/home/mattstuhring/Projects/epl-dashboard/backend
EnvironmentFile=/home/mattstuhring/Projects/epl-dashboard/backend/.env
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/mattstuhring/Projects/epl-dashboard/backend/.venv/bin/uvicorn main:app --app-dir src --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Load the unit and start it manually. Do not run `systemctl enable` if you want to preserve the current on-demand startup behavior:

```bash
sudo systemctl daemon-reload
sudo systemctl start epl-dashboard
systemctl status epl-dashboard --no-pager
```

Check the local page/API from the Pi at `http://127.0.0.1:8000` and `http://127.0.0.1:8000/api/standings`. The service binds to loopback, so it is intended for the local kiosk rather than direct LAN access. SQLite is stored under `backend/data/` and persists across service restarts and code updates.

On the Pi desktop, open a terminal and launch Chromium in kiosk mode:

```bash
chromium --user-data-dir=/tmp/epl-dashboard-kiosk --kiosk --noerrdialogs --disable-infobars http://127.0.0.1:8000
```

Run that command inside the graphical desktop session, not an ordinary SSH terminal. Close Chromium to leave kiosk mode. To stop the backend when switching projects, use `sudo systemctl stop epl-dashboard` from SSH or a Pi terminal. To resume, start the service and launch Chromium again. The service and browser currently do not auto-start after a reboot.

### Deploy an update

After pushing the desired commit from the development machine, connect to the Pi and run the following from its checkout. This stops the app while replacing code, rebuilds the frontend, updates backend dependencies, and starts the service again. The local `.env`, virtual environment, build output, and SQLite data are not tracked by Git and remain on the Pi.

```bash
sudo systemctl stop epl-dashboard
cd ~/Projects/epl-dashboard
git pull --ff-only
cd frontend
npm ci
npm run build
cd ../backend
.venv/bin/python -m pip install -e .
sudo systemctl start epl-dashboard
systemctl status epl-dashboard --no-pager
```

After the service is running, reload the dashboard on the Pi desktop:

```bash
chromium --user-data-dir=/tmp/epl-dashboard-kiosk --kiosk --noerrdialogs --disable-infobars http://127.0.0.1:8000
```

### If the update has a problem

- If the backend did not start, inspect its recent service messages:

  ```bash
  sudo journalctl -u epl-dashboard -n 100 --no-pager
  ```

- Run only one backend process at a time. The systemd service starts the refresh scheduler, so do not launch Uvicorn separately while that service is running. If you need to restart the service, use `sudo systemctl restart epl-dashboard`.

## Tests and code checks

The automated tests use sanitized sample responses and injected dependencies. They run offline and do not need a provider token:

```bash
.venv/bin/pytest -p no:cacheprovider
.venv/bin/ruff check src tests
.venv/bin/ruff format --check src tests
.venv/bin/pyright
```

An authenticated browser smoke check with a locally configured token tests live provider access separately from offline checks. On 2026-10-25, the backend was installed and run on the Pi 5 (Debian 13.7, aarch64, Python 3.13.5) as a manually started systemd service; /api/standings returned standings data and successful refresh state. Sustained operation and resource use have not been measured, and boot startup is intentionally disabled on this Pi.

### Resource ownership

The application lifespan registers cleanup immediately after opening each resource, including during partial startup failures. Blocking setup and cleanup run off the ASGI event loop. Shutdown waits for the refresh worker before closing its provider and repositories; do not run multiple Uvicorn workers against these process-local schedules.

### Club fixture read

`GET /api/clubs/{team_id}/fixtures` returns one club's full locally stored EPL season with the existing fixture freshness envelope. The ID must be positive. Unknown clubs return an empty match list; before the first saved season the fixture payload is null. This read neither contacts the provider nor changes schedules. `/api/fixtures` continues returning only current/next matchweeks.
