"""
Assemble the FastAPI application and own backend refresh resources.

This module composes validated settings, the provider adapter, application
service, SQLite repository, and one scheduled refresh worker. The worker starts
and stops with the ASGI application lifespan, while request handlers read only
the local repository. When a Vite production build exists, the same FastAPI
process serves its static files after registering the API routes. Development
still uses Vite's separate server and API proxy. This keeps provider calls
independent from browser traffic and gives tests control over each boundary.
"""

import logging
from collections.abc import AsyncGenerator, Callable
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI

from api import router
from config import Settings, get_settings
from providers import FootballDataAdapter, FootballProvider
from refresh import FixturesRefreshCoordinator, RefreshWorker, StandingsRefreshCoordinator
from service import FixturesService, StandingsService
from storage import SQLiteFixturesRepository, SQLiteStandingsRepository


def create_app(
    settings: Settings | None = None,
    *,
    database_path: str | Path | None = None,
    provider_factory: Callable[[Settings], FootballProvider] | None = None,
    clock: Callable[[], datetime] | None = None,
    start_refresh_worker: bool = True,
    frontend_dist_path: str | Path | None = None,
) -> FastAPI:
    """
    Create the API and its lifespan-managed refresh coordinator.

    Args:
        settings: Optional validated settings instance; otherwise cached process settings are loaded from environment and the local `.env` file.
        database_path: Optional SQLite path override for isolated tests.
        provider_factory: Optional factory for injecting a fake or alternate provider in tests. Production defaults to `FootballDataAdapter`.
        clock: Optional UTC clock used by the refresh coordinator in tests.
        start_refresh_worker: Whether app startup starts background refreshes. Tests may disable the worker and trigger the coordinator directly.
        frontend_dist_path: Optional Vite build directory override. By default,
            the repository's `frontend/dist` directory is served when built.

    Returns:
        FastAPI application with the standings API and managed local resources.

    Notes:
        The application is intended to run as one backend process. That process
        owns one scheduler and one SQLite connection; do not start multiple
        Uvicorn workers against the same refresh schedule.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
        """
        Manage resources whose lifetime matches the running API process.

        Startup opens the SQLite repository, constructs the provider and
        standings refresh coordinator, and starts the optional background
        worker. Request handlers use the coordinator to read local state; the
        worker owns scheduled provider calls. Shutdown stops the worker before
        closing its provider and repository dependencies.

        Args:
            application: FastAPI application receiving lifespan-managed state.

        Yields:
            No value; yielding transfers control to FastAPI while the
            application is accepting requests.
        """
        # Step 1: Open SQLite; repository construction creates missing tables
        # and the singleton refresh-control row while preserving existing data.
        path = database_path or resolved_settings.database_path
        repository = SQLiteStandingsRepository(path)

        # Step 2: Build the configured provider, or inject the test provider.
        if provider_factory is None:
            token = resolved_settings.football_data_token
            provider: FootballProvider = FootballDataAdapter(
                token.get_secret_value() if token else None,
                base_url=resolved_settings.football_data_base_url,
                timeout_seconds=resolved_settings.football_data_timeout_seconds,
            )
        else:
            provider = provider_factory(resolved_settings)

        # Step 3: Wire provider access to local persistence and refresh policy.
        coordinator = StandingsRefreshCoordinator(
            StandingsService(provider),
            repository,
            refresh_interval=timedelta(
                seconds=resolved_settings.standings_refresh_interval_seconds
            ),
            failure_retry_interval=timedelta(
                seconds=resolved_settings.standings_failure_retry_seconds
            ),
            clock=clock,
        )
        # Fixtures use independent persisted due times on the same worker.
        fixtures_repository = SQLiteFixturesRepository(path)
        fixtures_coordinator = FixturesRefreshCoordinator(
            FixturesService(provider),
            fixtures_repository,
            refresh_interval=timedelta(seconds=resolved_settings.fixtures_refresh_interval_seconds),
            active_interval=timedelta(seconds=resolved_settings.fixtures_active_interval_seconds),
            failure_retry_interval=timedelta(
                seconds=resolved_settings.fixtures_failure_retry_seconds
            ),
            clock=clock,
        )
        application.state.fixtures_refresh = fixtures_coordinator
        worker = RefreshWorker(coordinator, fixtures_coordinator)

        # Step 4: Make the coordinator available to API routes for local reads.
        application.state.standings_refresh = coordinator

        # Step 5: Start the scheduled provider worker when enabled.
        if start_refresh_worker:
            worker.start()

        try:
            yield
        finally:
            # Shutdown: stop the worker before closing resources it may be using.
            if start_refresh_worker:
                worker.stop()

            # Close provider networking, then close the SQLite connection.
            close_provider = getattr(provider, "close", None)
            if callable(close_provider):
                close_provider()
            repository.close()
            fixtures_repository.close()

    application = FastAPI(title="EPL Dashboard API", version="0.2.0", lifespan=lifespan)
    application.include_router(router, prefix="/api")

    # Register the frontend after the API; FastAPI checks path operations first.
    frontend_dist = (
        Path(frontend_dist_path)
        if frontend_dist_path is not None
        else Path(__file__).resolve().parents[2] / "frontend" / "dist"
    )
    if (frontend_dist / "index.html").is_file():
        application.frontend(
            "/",
            directory=frontend_dist,
            fallback="index.html",
        )

    return application


app = create_app()
