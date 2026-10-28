from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from test_fixtures import data
from test_refresh import sample_standings

from config import Settings
from main import create_app
from providers import ProviderError
from refresh import MatchDayRefreshPolicy

ACTIVE = timedelta(minutes=5)
QUIET = timedelta(hours=12)
ZONE = ZoneInfo("America/Los_Angeles")


def test_uses_actual_days_not_round_spans_weekdays_or_live_status():
    fixtures = data()
    policy = MatchDayRefreshPolicy(lambda: fixtures, ACTIVE)
    # A weekday catch-up game belonging to a different round still activates today.
    day = datetime(2026, 10, 28, 17, tzinfo=UTC)
    fixtures = fixtures.model_copy(
        update={
            "matches": (
                fixtures.matches[1].model_copy(update={"kickoff": day, "status": "FINISHED"}),
            )
        }
    )
    assert policy.next_attempt(day, day, QUIET) == day + ACTIVE
    yesterday = day - timedelta(days=1)
    assert policy.next_attempt(yesterday, yesterday, QUIET) == yesterday + QUIET
    fixtures = fixtures.model_copy(
        update={"matches": (fixtures.matches[0].model_copy(update={"status": "POSTPONED"}),)}
    )
    assert policy.next_attempt(day, day, QUIET) == day + QUIET
    fixtures = fixtures.model_copy(
        update={
            "matches": (
                fixtures.matches[0].model_copy(update={"status": "IN_PLAY", "kickoff": yesterday}),
            )
        }
    )
    assert policy.next_attempt(day, day, QUIET) == day + QUIET


def test_pacific_midnight_stagger_and_dst_day_end():
    kickoff = datetime(2026, 11, 1, 17, tzinfo=UTC)
    fixtures = data().model_copy(
        update={"matches": (data().matches[0].model_copy(update={"kickoff": kickoff}),)}
    )
    policy = MatchDayRefreshPolicy(lambda: fixtures, ACTIVE)
    before = datetime(2026, 11, 1, 6, 59, tzinfo=UTC)
    midnight = datetime(2026, 11, 1, 7, tzinfo=UTC)
    assert policy.next_attempt(before, before, QUIET) == midnight
    assert policy.next_attempt(before, midnight, QUIET, ACTIVE / 2) == midnight + ACTIVE / 2
    # Fall-back day lasts 25 hours; 07:55 UTC on Nov 2 is still the same local day.
    late = datetime(2026, 11, 2, 7, 55, tzinfo=UTC)
    assert policy.next_attempt(late, late, QUIET) == late + ACTIVE
    end = datetime(2026, 11, 2, 8, tzinfo=UTC)
    assert policy.next_attempt(end, end, QUIET) == end + QUIET


class Provider:
    def __init__(self, clock):
        self.clock = clock
        self.fixture_data = data()
        self.fixture_calls = 0
        self.standings_calls = 0
        self.error = None

    def get_fixtures(self):
        self.fixture_calls += 1
        return self.fixture_data.model_copy(update={"retrieved_at": self.clock[0]})

    def get_standings(self):
        self.standings_calls += 1
        if self.error:
            raise self.error
        return sample_standings().model_copy(update={"retrieved_at": self.clock[0]})


def test_both_schedules_adapt_preserve_retries_and_survive_restart(tmp_path):
    now = datetime(2026, 10, 24, 17, tzinfo=UTC)
    clock = [now]
    provider = Provider(clock)
    path = tmp_path / "dashboard.sqlite3"

    def app():
        return create_app(
            settings=Settings(active_refresh_interval_seconds=300),
            database_path=path,
            clock=lambda: clock[0],
            provider_factory=lambda settings: provider,
            start_refresh_worker=False,
        )

    with TestClient(app()) as client:
        fixtures = client.app.state.fixtures_refresh
        standings = client.app.state.standings_refresh
        fixtures.refresh_if_due()
        standings.refresh_if_due()
        assert fixtures.get_state().next_refresh_at == now + ACTIVE
        assert standings.get_state().next_refresh_at == now + ACTIVE / 2
        clock[0] += ACTIVE / 2
        assert standings.refresh_if_due()
        assert not fixtures.refresh_if_due()
        provider.error = ProviderError("private", retry_after_seconds=3600)
        clock[0] += ACTIVE
        standings.refresh_if_due()
        retry_at = standings.get_state().next_refresh_at
        assert retry_at == clock[0] + timedelta(hours=1)
        assert standings.get_state().standings is not None
        standings.seconds_until_next_attempt()
        assert standings.get_state().next_refresh_at == retry_at
    with TestClient(app()) as client:
        assert not client.app.state.standings_refresh.refresh_if_due()
        assert (
            client.get("/api/standings").json()["refresh_error"]
            == "The latest standings refresh failed."
        )


def test_quiet_deadline_shortens_after_new_fixture_dates_without_browser_calls(tmp_path):
    clock = [datetime(2026, 10, 28, 17, tzinfo=UTC)]
    provider = Provider(clock)
    app = create_app(
        settings=Settings(),
        database_path=tmp_path / "db.sqlite3",
        clock=lambda: clock[0],
        provider_factory=lambda settings: provider,
        start_refresh_worker=False,
    )
    with TestClient(app) as client:
        fixtures = app.state.fixtures_refresh
        standings = app.state.standings_refresh
        fixtures.refresh_if_due()
        standings.refresh_if_due()
        assert standings.get_state().next_refresh_at == clock[0] + QUIET
        provider.fixture_data = data().model_copy(
            update={
                "matches": tuple(
                    match.model_copy(update={"kickoff": clock[0]}) for match in data().matches
                )
            }
        )
        clock[0] += timedelta(hours=6)
        fixtures.refresh_if_due()
        assert standings.seconds_until_next_attempt() == 0
        standings.refresh_if_due()
        assert standings.get_state().next_refresh_at - clock[0] <= ACTIVE
        calls = (provider.fixture_calls, provider.standings_calls)
        client.get("/api/fixtures")
        client.get("/api/standings")
        assert (provider.fixture_calls, provider.standings_calls) == calls


def test_end_of_match_day_keeps_pending_attempt_then_returns_to_quiet(tmp_path):
    clock = [datetime(2026, 10, 25, 6, 59, tzinfo=UTC)]
    provider = Provider(clock)
    app = create_app(
        settings=Settings(),
        database_path=tmp_path / "db.sqlite3",
        clock=lambda: clock[0],
        provider_factory=lambda settings: provider,
        start_refresh_worker=False,
    )
    with TestClient(app):
        fixtures = app.state.fixtures_refresh
        standings = app.state.standings_refresh
        fixtures.refresh_if_due()
        standings.refresh_if_due()
        clock[0] = datetime(2026, 10, 25, 7, tzinfo=UTC)
        assert fixtures.refresh_if_due()
        assert fixtures.get_state().next_refresh_at == clock[0] + timedelta(hours=6)
        assert not standings.refresh_if_due()
        clock[0] += timedelta(minutes=2, seconds=30)
        assert standings.refresh_if_due()
        assert standings.get_state().next_refresh_at == clock[0] + QUIET


def test_no_fixtures_uses_quiet_rate_and_gaps_are_not_active():
    now = datetime(2026, 10, 25, 17, tzinfo=UTC)
    policy = MatchDayRefreshPolicy(lambda: None, ACTIVE)
    assert policy.next_attempt(now, now, QUIET) == now + QUIET
    policy = MatchDayRefreshPolicy(data, ACTIVE)
    # The season has games on Oct 24 and Oct 31, not the dates between them.
    assert policy.next_attempt(now, now, QUIET) == now + QUIET
