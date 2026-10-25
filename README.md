# EPL Ambient Dashboard

**Every point tells a part of the story.**

Following a football season often means moving between tables, fixture lists, match pages, and score updates. The EPL Ambient Dashboard brings that context into one calm, always-visible view of the English Premier League, so fans can see how the season is unfolding at a glance.

It is a personal project built to answer a simple question: can a focused dashboard make it easier to stay connected to the league without repeatedly opening apps and websites? The aim is a clear, configurable display that feels at home on a screen in the room, with a chosen club shown in the context of the wider competition.

## What it provides

The dashboard turns football data into a readable view of the league's ongoing story. League position, upcoming and current matches, and match outcomes belong together: each point, fixture, and result adds context to the season.

- **At-a-glance context:** A layout intended to be readable from across a room and useful without interaction.
- **Personal focus:** A configurable favorite club, initially Manchester United, helps bring the wider league into focus.
- **Local and resilient:** The application keeps its data locally and can continue showing the latest successful information when the external provider is unavailable.
- **Considerate data use:** A central refresh process retrieves provider data; displaying or refreshing the page reads the dashboard's local application data.
- **League-specific:** The project focuses on the English Premier League and its season-wide context.

## How it works

The application periodically retrieves football data from football-data.org, translates it into the dashboard's own data model, and stores useful state locally. The browser reads that state from the application and presents it as a single dashboard. Keeping provider access behind the backend makes the provider replaceable, protects credentials from the browser, and lets refresh behavior evolve without coupling it to page visits.

Times are stored in UTC and shown in the configured local timezone. Local persistence supports last-known-good data and season retention, while the dashboard communicates when its information was last updated. The refresh policy is designed to adapt to the football calendar and the information being shown.

## Design goals

- Keep memory, CPU use, disk use, and retained data modest enough for a Raspberry Pi 5 with 4 GB of memory.
- Prefer lightweight, well-supported dependencies and a small number of application processes.
- Use local persistence and straightforward operations instead of adding infrastructure that the dashboard does not need.
- Keep provider integration, application logic, and display concerns separated enough to test and change independently.
- Keep provider credentials on the server and out of source control and browser code.
- Grow the product iteratively while keeping the running system understandable and maintainable.

## Technology and dependencies

- **React and TypeScript** build the browser dashboard and its typed UI components.
- **Vite** runs the frontend development server and creates the optimized production assets.
- **Python 3.12+ and FastAPI** power the local application API and coordinate its lifecycle and data refresh work.
- **Pydantic and pydantic-settings**, used by FastAPI and the application, validate API data and load typed configuration.
- **httpx** handles asynchronous requests to the football-data.org API behind a replaceable provider boundary.
- **SQLite** stores application data locally without a separate database service.
- **pytest, Ruff, and Pyright** support backend testing, linting, and type checking; **Vitest and Oxlint** support frontend tests and linting.

The intended deployment is a small modular application rather than a collection of separately operated services. The built frontend can be served by the FastAPI application, keeping the dashboard on one local origin with no required cloud application hosting.

## Run locally

For a local run, you need Python 3.12 or newer, a Node.js version supported by the frontend's Vite version, and a football-data.org API token. Configure the token for the backend, start the backend application, then start the frontend development server and open its local address in a browser. The backend and frontend READMEs contain the setup commands and project-specific development details: [backend](backend/README.md) and [frontend](frontend/README.md).

## Raspberry Pi kiosk hosting

The primary hosting goal is a cost-effective, locally hosted kiosk on a Raspberry Pi 5 (4 GB), using free software and avoiding paid application hosting. The football-data.org plan and its request limits should be checked against the project's needs; the app is designed to keep provider requests centrally managed and modest.

At a high level, prepare a 64-bit Raspberry Pi OS or compatible Debian desktop, install a supported Python runtime and Git, and obtain Node.js for building the frontend. Check out the project on the Pi, configure the provider token locally, install the backend dependencies, and build the frontend there. Run the application as a local service and open its local address in Chromium kiosk mode. The browser and service can be started and stopped when needed, leaving the Pi available for other projects; optional startup-at-boot behavior can be configured for a dedicated kiosk setup.

## Project structure

- [`backend/`](backend/README.md) — Python application, API, provider integration, local storage, and backend development guidance.
- [`frontend/`](frontend/README.md) — React dashboard, frontend build, and frontend development guidance.
