"""
Verify scheduled standings refresh state, persistence, and the local API.

The tests inject provider responses and a UTC clock so they can prove that API
reads do not consume provider calls, due scheduling is deterministic, failures
retain last-known-good data, and SQLite state survives repository restarts.
"""

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from threading import Event, Thread
from time import monotonic, sleep

import pytest
from fastapi.testclient import TestClient
from test_standings import RETRIEVED_AT, SAMPLE

from config import Settings
from main import create_app
from models import StandingsResponse
from providers import FootballDataAdapter, ProviderError
from refresh import RefreshWorker, StandingsRefreshCoordinator
from service import StandingsService
from storage import SQLiteStandingsRepository

REFRESH_INTERVAL = timedelta(hours=12)
FAILURE_RETRY_INTERVAL = timedelta(minutes=15)


class FakeClock:
    """
    Provide a mutable UTC instant for refresh policy tests.
    """

    def __init__(self, current: datetime = RETRIEVED_AT) -> None:
        """
        Initialize the fake clock at an aware instant.
        """
        self.current = current

    def __call__(self) -> datetime:
        """
        Return the current fake instant.
        """
        return self.current

    def advance(self, duration: timedelta) -> None:
        """
        Move the fake instant forward by the requested duration.
        """
        self.current += duration


class SequenceProvider:
    """
    Return queued standings results or raise queued provider failures.
    """

    def __init__(self, *results: StandingsResponse | Exception) -> None:
        """
        Configure outcomes and initialize the provider call counter.
        """
        self._results = list(results)
        self.calls = 0

    def get_standings(self) -> StandingsResponse:
        """
        Return the next configured result for deterministic refresh tests.
        """
        self.calls += 1
        result = self._results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class BlockingProvider:
    """
    Hold a fake provider request open to test refresh overlap protection.
    """

    def __init__(self, response: StandingsResponse) -> None:
        """
        Configure the returned table and synchronization events.
        """
        self.response = response
        self.started = Event()
        self.release = Event()
        self.calls = 0

    def get_standings(self) -> StandingsResponse:
        """
        Block until released, then return the configured table.
        """
        self.calls += 1
        self.started.set()
        self.release.wait(timeout=2)
        return self.response


def sample_standings() -> StandingsResponse:
    """
    Build one normalized response from the sanitized provider fixture.
    """
    return FootballDataAdapter._map_standings(SAMPLE, RETRIEVED_AT)


def make_coordinator(
    provider: SequenceProvider | BlockingProvider,
    repository: SQLiteStandingsRepository,
    clock: FakeClock,
) -> StandingsRefreshCoordinator:
    """
    Create the production coordinator with short deterministic intervals.
    """
    return StandingsRefreshCoordinator(
        StandingsService(provider),
        repository,
        refresh_interval=REFRESH_INTERVAL,
        failure_retry_interval=FAILURE_RETRY_INTERVAL,
        clock=clock,
    )


def test_api_reads_local_snapshot_without_making_provider_calls(tmp_path: Path) -> None:
    provider = SequenceProvider(sample_standings())
    clock = FakeClock()
    app = create_app(
        settings=Settings(),
        database_path=tmp_path / "dashboard.sqlite3",
        provider_factory=lambda settings: provider,
        clock=clock,
        start_refresh_worker=False,
    )

    with TestClient(app) as client:
        coordinator: StandingsRefreshCoordinator = app.state.standings_refresh
        assert coordinator.refresh_if_due()

        first = client.get("/api/standings")
        second = client.get("/api/standings")

    assert provider.calls == 1
    assert first.status_code == 200
    assert first.json()["refresh_status"] == "fresh"
    assert first.json()["standings"]["rows"][0]["team_name"] == "Manchester United FC"
    assert second.json() == first.json()


def test_api_reports_pending_then_safe_error_without_a_successful_snapshot(tmp_path: Path) -> None:
    provider = SequenceProvider(ProviderError("raw provider body must not be exposed"))
    clock = FakeClock()
    app = create_app(
        settings=Settings(),
        database_path=tmp_path / "dashboard.sqlite3",
        provider_factory=lambda settings: provider,
        clock=clock,
        start_refresh_worker=False,
    )

    with TestClient(app) as client:
        assert client.get("/api/standings").json()["refresh_status"] == "pending"
        coordinator: StandingsRefreshCoordinator = app.state.standings_refresh
        assert coordinator.refresh_if_due()
        response = client.get("/api/standings")

    payload = response.json()
    assert response.status_code == 200
    assert payload["standings"] is None
    assert payload["refresh_status"] == "error"
    assert "raw provider body" not in response.text


def test_fastapi_serves_built_frontend_and_keeps_api_routes_available(tmp_path: Path) -> None:
    frontend_dist = tmp_path / "frontend-dist"
    assets = frontend_dist / "assets"
    assets.mkdir(parents=True)
    (frontend_dist / "index.html").write_text(
        '<!doctype html><html><script src="/assets/app.js"></script></html>',
        encoding="utf-8",
    )
    (assets / "app.js").write_text("console.log('dashboard')", encoding="utf-8")

    provider = SequenceProvider()
    app = create_app(
        settings=Settings(),
        database_path=tmp_path / "dashboard.sqlite3",
        provider_factory=lambda settings: provider,
        start_refresh_worker=False,
        frontend_dist_path=frontend_dist,
    )

    with TestClient(app) as client:
        page = client.get("/")
        asset = client.get("/assets/app.js")
        client_route = client.get("/settings", headers={"accept": "text/html"})
        missing_asset = client.get("/assets/missing.js")
        api_response = client.get("/api/standings")

    assert page.status_code == 200
    assert "assets/app.js" in page.text
    assert asset.status_code == 200
    assert "dashboard" in asset.text
    assert client_route.status_code == 200
    assert client_route.text == page.text
    assert missing_asset.status_code == 404
    assert api_response.status_code == 200
    assert api_response.json()["refresh_status"] == "pending"


def test_failed_due_refresh_keeps_last_successful_data_and_schedules_retry(
    tmp_path: Path,
) -> None:
    provider = SequenceProvider(
        sample_standings(),
        ProviderError("upstream failure", retry_after_seconds=3600),
    )
    clock = FakeClock()
    repository = SQLiteStandingsRepository(tmp_path / "dashboard.sqlite3")
    coordinator = make_coordinator(provider, repository, clock)

    assert coordinator.refresh_if_due()
    clock.advance(REFRESH_INTERVAL)
    assert coordinator.refresh_if_due()
    state = coordinator.get_state()

    assert provider.calls == 2
    assert state.refresh_status == "stale"
    assert state.standings == sample_standings()
    assert state.last_success_at == RETRIEVED_AT
    assert state.last_attempt_at == RETRIEVED_AT + REFRESH_INTERVAL
    assert state.next_refresh_at == RETRIEVED_AT + REFRESH_INTERVAL + timedelta(hours=1)
    assert state.refresh_error is not None

    repository.close()


def test_refresh_is_not_due_until_persisted_interval_has_elapsed(tmp_path: Path) -> None:
    provider = SequenceProvider(sample_standings(), sample_standings())
    clock = FakeClock()
    repository = SQLiteStandingsRepository(tmp_path / "dashboard.sqlite3")
    coordinator = make_coordinator(provider, repository, clock)

    assert coordinator.refresh_if_due()
    clock.advance(REFRESH_INTERVAL - timedelta(seconds=1))
    assert coordinator.refresh_if_due() is False
    clock.advance(timedelta(seconds=1))
    assert coordinator.refresh_if_due()
    assert provider.calls == 2

    repository.close()


def test_repository_retains_snapshots_for_prior_seasons(tmp_path: Path) -> None:
    database_path = tmp_path / "dashboard.sqlite3"
    repository = SQLiteStandingsRepository(database_path)
    current = sample_standings()
    next_season = current.model_copy(
        update={"season_id": current.season_id + 1, "retrieved_at": RETRIEVED_AT + REFRESH_INTERVAL}
    )
    repository.record_success(current, RETRIEVED_AT, RETRIEVED_AT + REFRESH_INTERVAL)
    repository.record_success(
        next_season,
        RETRIEVED_AT + REFRESH_INTERVAL,
        RETRIEVED_AT + REFRESH_INTERVAL * 2,
    )
    repository.close()

    with sqlite3.connect(database_path) as connection:
        season_count = connection.execute("SELECT COUNT(*) FROM standings_by_season").fetchone()[0]

    assert season_count == 2


def test_successful_snapshot_and_schedule_survive_repository_restart(tmp_path: Path) -> None:
    database_path = tmp_path / "dashboard.sqlite3"
    repository = SQLiteStandingsRepository(database_path)
    standings = sample_standings()
    next_refresh_at = RETRIEVED_AT + REFRESH_INTERVAL
    repository.record_success(standings, RETRIEVED_AT, next_refresh_at)
    repository.close()

    reopened_repository = SQLiteStandingsRepository(database_path)
    restored, last_attempt_at, restored_next_refresh_at, refresh_error = (
        reopened_repository.read_state()
    )
    reopened_repository.close()

    assert restored == standings
    assert last_attempt_at == RETRIEVED_AT
    assert restored_next_refresh_at == next_refresh_at
    assert refresh_error is None


def test_refresh_lock_prevents_overlapping_provider_requests(tmp_path: Path) -> None:
    provider = BlockingProvider(sample_standings())
    clock = FakeClock()
    repository = SQLiteStandingsRepository(tmp_path / "dashboard.sqlite3")
    coordinator = make_coordinator(provider, repository, clock)
    refresh_thread = Thread(target=coordinator.refresh_if_due)
    refresh_thread.start()

    assert provider.started.wait(timeout=1)
    assert coordinator.refresh_if_due() is False
    provider.release.set()
    refresh_thread.join(timeout=2)

    assert provider.calls == 1
    repository.close()


def test_background_worker_performs_initial_refresh(tmp_path: Path) -> None:
    provider = SequenceProvider(sample_standings())
    repository = SQLiteStandingsRepository(tmp_path / "dashboard.sqlite3")
    coordinator = make_coordinator(provider, repository, FakeClock())
    worker = RefreshWorker(coordinator)
    deadline = monotonic() + 2

    worker.start()
    while provider.calls == 0 and monotonic() < deadline:
        sleep(0.01)
    worker.stop()

    assert provider.calls == 1
    assert coordinator.get_state().refresh_status == "fresh"
    repository.close()


def test_settings_reject_nonpositive_refresh_intervals() -> None:
    with pytest.raises(ValueError):
        Settings(standings_failure_retry_seconds=-1)
