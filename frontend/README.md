# EPL Dashboard frontend

The React and TypeScript interface displays normalized standings and refresh state from the local FastAPI backend. It reads `/api/standings`; Vite proxies `/api` to `http://127.0.0.1:8000` during development. The page checks the local API 60 seconds after each completed request so it can display backend state changes. Those reads use SQLite and do not make provider requests. The backend performs standings refreshes on its own schedule. The table footer displays the last successful update and next scheduled attempt in `America/Los_Angeles` time. The favorite club starts as Manchester United when that team is present, can be changed in the sidebar, and is saved in this browser.

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


## Matchweek view and crests

Choose **Matchweeks** from the dashboard menu to see the provider-numbered current round and following round as chronological lists. Dates and kickoff times use Pacific time; scores preserve zero versus unknown values. In-play, halftime, final, postponed and other statuses are labelled. Favorite-team matches use the standings view's chosen favorite.

The view polls the local `/api/fixtures` endpoint 60 seconds after each completed local request while mounted; the backend owns provider polling. Loading, first-fetch errors, stale saved data and empty selected weeks are distinct states. A discreet footer shows the last successful update and next attempt using the same freshness component as standings.

On desktop windows at least 1100px wide, a static mint half-field illustration sits beneath both panels on the plain purple background. Its intentionally shallow proportions use 80–120px of height, with connected boxes, a center semicircle and corner arcs; no placement dots or goal nets. It is hidden in narrower layouts and adds no requests or animation. Fixture rows keep their existing sizing; smaller windows and unusually long schedules may still scroll normally.

Team crests are now displayed in both standings and fixtures. HTTPS images come from provider-supplied URLs, with initials when missing or failed. The browser may retrieve these images from the crest host; credentials are never sent with them. The backend fetches no image assets, and no additional frontend dependency is required. The selected view is saved in browser storage. View switching supports the optional carousel described below.


## Navigation and automatic rotation

New browsers start with rotation paused and a 60-second interval. Select a screen from the menu at any time; selecting any view (including the visible one) pauses rotation indefinitely. Use the small **soccer-ball toggle** beside the interval selector: a green background means auto-rotation is on; a muted ball means it is off. Hover text shows “Auto-rotate: On” or “Auto-rotate: Off”. Keyboard and screen-reader users can operate it as the Auto-rotate switch. There is no inactivity-based automatic resume and mouse movement alone does not change rotation.

Use **Every** to select 30 seconds, 1 minute, 2 minutes, or 5 minutes per view. Starting rotation, changing the interval, or advancing to a new view gives that view a full interval. The carousel wraps through League table, Matchweeks and Your club. It does not change backend provider schedules; existing local API polling continues as before.

The browser remembers the selected view, whether rotation is enabled, and the interval in local storage (`epl.view`, `epl.rotationEnabled`, `epl.rotationIntervalSeconds`). A reload restores that preference; if rotation was enabled, it starts a fresh interval. These preferences belong to the Chromium profile and disappear if that profile/storage is cleared. The documented temporary kiosk profile under `/tmp` may be cleared on reboot; use a persistent browser profile when preferences must survive that.

Physical buttons, rotary controls and presence-aware displays remain future work. No GPIO or extra hardware dependencies are needed for the initial carousel.


## Split standings layout

The League table view shows **Top** (positions 1–10) and **Bottom** (positions 11–20) in separate panels, with league ranks preserved and column headings repeated. Crests, statistics and favorite highlighting appear in either half; the global favorite selector and data freshness footer are shared. Empty rank groups are omitted if only partial standings are available.

At viewport widths above 1100 pixels the panels sit side by side. At narrower widths they stack for normal browser scrolling. The landscape layout was visually checked at 1440×1080 with twenty sample clubs; resolution, browser zoom and long names can affect the fit on another display. This is a presentation change and does not alter API requests or refresh schedules.

The shared position key marks Champions League places 1–4, Europa League place 5 and relegation places 18–20, using full-cell position colors with centered rank numbers and matching key swatches. These are configured display bands rather than calculated qualification outcomes.

Favorite club is a global browser preference beside the carousel controls, available in both views once club data loads. It highlights standings and fixtures without filtering out other clubs.


## Display scaling

The kiosk target is landscape **1920×1080 at 100% Chromium zoom**. The dashboard uses the available width with modest margins instead of a fixed 1180px column. On landscape windows at least 1200px wide and 800px high, data text and crests scale with width while row spacing responds to available height. Headers and controls remain compact; the page does not use CSS zoom or hide overflowing rows.

At 1080p, club names/statistics are 17px and crests about 28px, with both ten-row panels and freshness details visible. Smaller windows keep the existing stacked/scrolling layout as needed. Display resolution, desktop scaling, browser zoom and unusually long data/error messages can affect the fit; local browser verification is separate from testing the physical Pi display.

The title and supporter signature share one row on wide screens and wrap on narrow windows. Screen selection, rotation and favorite controls are in the overlay sidebar. Subtitles are static football-themed flavor text; data-driven insight subtitles remain deferred.

The landscape presentation uses slightly wider side margins, inward-facing club/crest alignment around each matchup, and lighter score treatments. Kickoff times are quieter than reported scores.

### Dashboard menu and display behavior

Open the menu beside the brand to choose a screen, toggle automatic rotation, change its interval, or select your club. Opening the menu suspends rotation temporarily; closing it resumes an enabled carousel with a full interval. Choosing a screen pauses rotation until you enable it again. Escape, the close button, or the shaded backdrop dismisses the menu.

Both datasets remain loaded while switching screens and continue polling the local API once per minute. This does not trigger provider requests. Screen changes have a brief fade, disabled for reduced-motion preferences; background data updates retain the existing tables. A full browser reload still restarts the app. Hover or focus the compact freshness summary for exact Pacific timestamps. “Next check” is the scheduled backend attempt, not a guarantee of new provider data.

Under **Supporter signature**, edit your surname (up to 24 characters) and shirt number (up to two digits). Changes appear immediately on both screens and save automatically in this browser. The signature displays the surname in uppercase; clearing a field hides that part. STUHRING and 9 are initial defaults. Preferences are specific to the browser profile and site address; configure them separately on the Pi. Clearing browser storage resets them. The crest and club name still follow your favorite club.

## Readability and verification

Use `npm run format` to apply the frontend formatting convention and `npm run format:check` to verify it. Run `npm run lint`, `npm test`, and `npm run build` for linting, offline behavior tests and TypeScript/production-build checks. Prettier is a development dependency, not part of the browser bundle.

Components own presentation and interaction; hooks own polling and saved preferences; `api.ts` owns local HTTP reads. Polls are serialized, cancelled on unmount and aborted after a 15-second local request timeout. Failed reads retain the last successful response. Menu selection and backend provider schedules remain independent.

## Your club

Select **Your club** in the sidebar for your favorite's next EPL matchup and countdown, last five completed results, season record and matchweek timeline. Changing Favorite club updates the screen. Kickoff times are Pacific; countdowns run locally. Unconfirmed times show Kickoff TBC; a kickoff that has passed shows Awaiting match update until provider status changes. Reported in-play/half-time states show saved scores, without an invented match clock. This view reads `/api/clubs/{team_id}/fixtures` from the same saved season and refresh schedule as Matchweeks, without additional provider calls. Cup fixtures, venue and head-to-head are not included.

Next whistle places both clubs around the countdown and shows each team's position and W/D/L totals from the existing saved standings. Records are matched by team ID and season; missing data is explicit and does not trigger additional provider calls.

Recent form shows five rows with W/D/L, home/away clubs and score, and matchweek. The subtitle sits beside its heading on wide windows. The season so far places played/remaining totals beside its heading above a six-row, seven-column result grid (38 games and four unused spaces). Completed (FINISHED/AWARDED) games use Recent form's W/D/L colors and letters, in chronological completion order; unknown final scores show `?`, and unplayed cells are grey. Counts use the full saved season. Postponed/in-play games remain to play.

The open season-run timeline beneath both cards follows the API's current matchweek, with Week 1/current week/Week 38 labels, mint past-week dots, a mint football marking the current week and grey future-week dots. Its static player uses a locally bundled asset. Week progress is separate from actual completed-game totals, which may differ after postponements. The 38-dot timeline does not claim that every game in a past matchweek has finished. The headings wrap on narrower windows; normal document scrolling remains available. Freshness appears at the right of The season run heading, with exact Pacific timestamps on hover or focus. It describes the shared saved fixtures used by all club sections; the redundant played/to-go summary and separate club footer notice are omitted.

## Visual identity

The After dark presentation uses a purple canvas, light data panels, mint accents and locally hosted Barlow/Barlow Condensed type. `App.css` owns existing responsive layout geometry; `broadcast.css` applies the visual identity; `index.css` holds shared tokens. `fonts.css` loads bundled fonts from `src/assets/fonts`, where their SIL Open Font License notices are retained. No Google Fonts request is needed at runtime. The club countdown is displayed as labelled days/hours/minutes blocks, with existing unknown-time and provider-status messages unchanged.
