# EPL Ambient Dashboard

**Every point tells a part of the story.**

Following a football season often means moving between tables, fixture lists, match pages, and score updates. The EPL Ambient Dashboard brings that context into one calm, always-visible view of the English Premier League, so fans can see how the season is unfolding at a glance.

It is a personal project built to answer a simple question: can a focused dashboard make it easier to stay connected to the league without repeatedly opening apps and websites? The aim is a clear, configurable display that feels at home on a screen in the room, with a chosen club shown in the context of the wider competition.

## What it provides

The dashboard turns football data into a readable view of the league's ongoing story. League position, upcoming and current matches, and match outcomes belong together: each point, fixture, and result adds context to the season.

- **At-a-glance context:** A layout intended to be readable from across a room and useful without interaction.
- **Personal focus:** A configurable favorite club, initially Manchester United, helps bring the wider league into focus.
- **Local and resilient:** Designed to run at home and remain useful when the external data service is temporarily unavailable.
- **Considerate data use:** A central refresh process retrieves provider data; displaying or refreshing the page reads the dashboard's local application data.
- **League-specific:** The project focuses on the English Premier League and its season-wide context.

## How it works

1. **Football data is collected** from football-data.org on a schedule managed by the application.
2. **The application organizes it** into a coherent view of the Premier League season.
3. **The dashboard presents the story** through league and match context, ready to glance at on a screen.

Opening or refreshing the dashboard reads the application's latest available information; it does not trigger a separate football-data.org request for every browser visit.

## Design goals

- Keep memory, CPU use, disk use, and retained data modest enough for a Raspberry Pi 5 with 4 GB of memory.
- Prefer lightweight, well-supported dependencies and a small number of application processes.
- Use local persistence and straightforward operations instead of adding infrastructure that the dashboard does not need.
- Make it practical to run with essentially no ongoing hosting cost on hardware you already own, when a suitable no-cost data plan is available.

## Technology and dependencies

- **React and TypeScript** build the browser dashboard and its typed UI components.
- **Vite** runs the frontend development server and creates the optimized production assets.
- **Python 3.12+ and FastAPI** power the local application API and coordinate its lifecycle and data refresh work.
- **Pydantic and pydantic-settings**, used by FastAPI and the application, validate API data and load typed configuration.
- **httpx** makes requests to the football-data.org API.
- **SQLite** stores application data locally without a separate database service.
- **pytest, Ruff, and Pyright** support backend testing, linting, and type checking; **Vitest and Oxlint** support frontend tests and linting.

The intended deployment is a small modular application rather than a collection of separately operated services. The built frontend can be served by the FastAPI application, keeping the dashboard on one local origin with no required cloud application hosting.

## Run locally

You need Python 3.12+, Node.js 20.19+ or 22.12+, and a football-data.org API token for live data. From the repository root, set up the backend in one terminal:

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -e .
cp .env.example .env
```

Edit `backend/.env` and set `FOOTBALL_DATA_TOKEN` to your token, then start the API from the `backend/` directory:

```bash
.venv/bin/uvicorn main:app --app-dir src --reload
```

In a second terminal, start the frontend:

```bash
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. Keep both servers running while using the page. More setup and troubleshooting details are in the [backend README](backend/README.md) and [frontend README](frontend/README.md).

## Raspberry Pi kiosk hosting

My primary hosting goal is a locally hosted kiosk on a Raspberry Pi 5 with 4 GB of memory. In this setup, the Pi runs the dashboard application and displays it full-screen in Chromium; FastAPI serves both the local API and the built frontend. The dashboard does not need a paid cloud host, and the service can be started and stopped as needed so the Pi remains available for other projects.

The main requirements are:
- 64-bit Raspberry Pi OS or compatible desktop Linux
- Python
- Node.js
- Git
- football-data.org API token. Provider plan availability and request limits determine whether data access can also remain free.

For general Raspberry Pi kiosk concepts and setup options, see the official [Raspberry Pi kiosk mode guide](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/). The guide covers kiosk setup, and this project runs its own local dashboard application on the Pi.

## Project structure

- [`backend/`](backend/README.md) — Python application, API, provider integration, local storage, and backend development guidance.
- [`frontend/`](frontend/README.md) — React dashboard, frontend build, and frontend development guidance.
