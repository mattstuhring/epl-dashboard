from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from config import Settings
from main import create_app
from providers import FootballDataAdapter, ProviderError
from refresh import FixturesRefreshCoordinator, next_fixture_refresh
from service import FixturesService
from storage import SQLiteFixturesRepository

NOW = datetime(2026, 10, 24, 17, tzinfo=UTC)


def payload():
    def match(match_id, week, kickoff):
        return {
            "id": match_id,
            "matchday": week,
            "utcDate": kickoff,
            "status": "TIMED",
            "season": {"id": 2026, "currentMatchday": 8},
            "homeTeam": {
                "id": 66,
                "name": "Manchester United",
                "crest": "https://example.org/united.svg",
            },
            "awayTeam": {"id": 57, "name": "Arsenal", "crest": None},
            "score": {"fullTime": {"home": None, "away": None}},
        }

    return {
        "competition": {"code": "PL"},
        "resultSet": {"count": 3},
        "matches": [
            match(1, 8, "2026-10-24T17:00:00Z"),
            match(2, 9, "2026-10-31T17:00:00Z"),
            match(3, 10, "2026-11-07T17:00:00Z"),
        ],
    }


def data():
    return FootballDataAdapter._map_fixtures(payload(), NOW)


def test_maps_null_scores_crests_and_rejects_incomplete_or_duplicate_data():
    result = data()
    assert result.matches[0].home_score is None
    assert result.matches[0].home.crest == "https://example.org/united.svg"
    assert result.matches[0].kickoff.tzinfo == UTC
    broken = payload()
    broken["resultSet"]["count"] = 4
    with pytest.raises(ValueError):
        FootballDataAdapter._map_fixtures(broken, NOW)
    broken = payload()
    broken["matches"][1]["id"] = 1
    with pytest.raises(ValueError):
        FootballDataAdapter._map_fixtures(broken, NOW)


def test_provider_translates_failure_and_honors_retry_after():
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(429, headers={"Retry-After": "3600"})
        )
    ) as client:
        adapter = FootballDataAdapter("test-token", client=client, clock=lambda: NOW)
        with pytest.raises(ProviderError) as error:
            adapter.get_fixtures()
        assert error.value.retry_after_seconds == 3600
        assert "test-token" not in str(error.value)


def test_activity_quiet_and_boundary_scheduling():
    result = data()
    assert next_fixture_refresh(
        result, NOW, timedelta(hours=6), timedelta(minutes=30)
    ) == NOW + timedelta(minutes=30)
    quiet = datetime(2026, 10, 23, 0, tzinfo=UTC)
    assert next_fixture_refresh(
        result, quiet, timedelta(hours=6), timedelta(minutes=30)
    ) == quiet + timedelta(hours=6)
    before = datetime(2026, 10, 24, 6, tzinfo=UTC)
    assert next_fixture_refresh(
        result, before, timedelta(hours=6), timedelta(minutes=30)
    ) == datetime(2026, 10, 24, 7, tzinfo=UTC)


def test_atomic_fixture_upsert_retains_prior_seasons_across_restart(tmp_path: Path):
    path = tmp_path / "dashboard.sqlite3"
    repo = SQLiteFixturesRepository(path)
    repo.record_success(data(), NOW, NOW + timedelta(minutes=30))
    corrected = data().model_copy(
        update={
            "matches": (
                data()
                .matches[0]
                .model_copy(update={"status": "FINISHED", "home_score": 2, "away_score": 0}),
            )
        }
    )
    repo.record_success(corrected, NOW, NOW + timedelta(minutes=30))
    repo.close()
    repo = SQLiteFixturesRepository(path)
    saved, _, _, _ = repo.read_state()
    assert len(saved.matches) == 1
    assert saved.matches[0].home_score == 2
    repo.record_failure(NOW, NOW + timedelta(hours=1), "safe failure")
    assert repo.read_state()[0] == saved
    repo.close()


class Provider:
    def __init__(self):
        self.calls = 0
        self.result = data()

    def get_fixtures(self):
        self.calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def test_refresh_preserves_data_on_failure_and_missing_matches(tmp_path: Path):
    provider = Provider()
    clock = [NOW]
    repo = SQLiteFixturesRepository(tmp_path / "db.sqlite3")
    coordinator = FixturesRefreshCoordinator(
        FixturesService(provider),
        repo,
        refresh_interval=timedelta(hours=6),
        failure_retry_interval=timedelta(minutes=15),
        clock=lambda: clock[0],
    )
    assert coordinator.refresh_if_due()
    assert not coordinator.refresh_if_due()
    assert coordinator.get_state().next_refresh_at == NOW + timedelta(minutes=5)
    clock[0] += timedelta(minutes=30)
    provider.result = data().model_copy(update={"matches": ()})
    coordinator.refresh_if_due()
    assert coordinator.get_state().refresh_status == "stale"
    assert len(repo.read_state()[0].matches) == 3
    clock[0] += timedelta(minutes=15)
    provider.result = ProviderError("private upstream content", retry_after_seconds=3600)
    coordinator.refresh_if_due()
    assert coordinator.get_state().next_refresh_at == clock[0] + timedelta(hours=1)
    assert "private" not in coordinator.get_state().refresh_error
    repo.close()


def test_api_reads_only_stored_current_and_next_weeks(tmp_path: Path):
    provider = Provider()
    app = create_app(
        settings=Settings(),
        database_path=tmp_path / "db.sqlite3",
        provider_factory=lambda settings: provider,
        clock=lambda: NOW,
        start_refresh_worker=False,
    )
    with TestClient(app) as client:
        assert client.get("/api/fixtures").json()["fixtures"] is None
        app.state.fixtures_refresh.refresh_if_due()
        for _ in range(2):
            response = client.get("/api/fixtures").json()
            assert {match["matchday"] for match in response["fixtures"]["matches"]} == {8, 9}
        assert provider.calls == 1


def test_previous_fixture_seasons_survive_rollover(tmp_path: Path):
    import sqlite3

    path = tmp_path / "db.sqlite3"
    repo = SQLiteFixturesRepository(path)
    repo.record_success(data(), NOW, NOW + timedelta(hours=6))
    next_season = data().model_copy(
        update={"season_id": 2027, "retrieved_at": NOW + timedelta(days=365)}
    )
    repo.record_success(next_season, NOW, NOW + timedelta(hours=6))
    assert repo.read_state()[0].season_id == 2027
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT count(*) FROM fixtures_by_season").fetchone()[0] == 2
    repo.close()


def test_local_day_window_handles_daylight_saving_transition():
    result = data().model_copy(
        update={
            "matches": (
                data()
                .matches[0]
                .model_copy(update={"kickoff": datetime(2026, 11, 1, 17, tzinfo=UTC)}),
            )
        }
    )
    before_end = datetime(2026, 11, 2, 7, 50, tzinfo=UTC)
    assert next_fixture_refresh(
        result, before_end, timedelta(hours=6), timedelta(minutes=30)
    ) == datetime(2026, 11, 2, 8, tzinfo=UTC)


def test_single_worker_services_both_schedules_on_same_thread():
    from threading import Event, get_ident

    from refresh import RefreshWorker

    class Schedule:
        def __init__(self):
            self.ready = Event()
            self.thread_id = None

        def refresh_if_due(self):
            self.thread_id = get_ident()
            self.ready.set()

        def seconds_until_next_attempt(self):
            return 3600

    standings = Schedule()
    fixtures = Schedule()
    worker = RefreshWorker(standings, fixtures)
    worker.start()
    try:
        assert fixtures.ready.wait(2)
        assert standings.ready.is_set()
        assert standings.thread_id == fixtures.thread_id
    finally:
        worker.stop()
