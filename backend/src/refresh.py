"""
Coordinate standings and fixture schedules using one shared match-day policy.

The coordinator checks persisted due times, prevents overlapping work in the
backend process, stores successful snapshots atomically, and records safe
failure state without discarding prior data. A small daemon worker wakes at
the next scheduled attempt; API reads only inspect local SQLite state and never
make provider requests.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from threading import Event, Lock, Thread
from zoneinfo import ZoneInfo

from models import FixturesResponse, FixturesStateResponse, StandingsStateResponse
from providers import ProviderError
from service import FixturesService, StandingsService
from storage import SQLiteFixturesRepository, SQLiteStandingsRepository

logger = logging.getLogger(__name__)
SAFE_FIXTURES_ERROR = "The latest fixtures refresh failed."
SAFE_REFRESH_ERROR = "The latest standings refresh failed."


class StandingsRefreshCoordinator:
    """
    Own refresh timing and freshness state for the EPL standings dataset.

    The service is process-local and designed for one backend worker process,
    matching the project's single-device deployment. SQLite carries successful
    data and scheduled times across restarts; the lock prevents overlap within
    the running process.
    """

    def __init__(
        self,
        service: StandingsService,
        repository: SQLiteStandingsRepository,
        *,
        refresh_interval: timedelta,
        failure_retry_interval: timedelta,
        policy: MatchDayRefreshPolicy | None = None,
        phase: timedelta = timedelta(0),
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        """
        Configure a single-provider standings refresh coordinator.

        Args:
            service: Application use case for retrieving normalized standings.
            repository: SQLite storage for season snapshots and refresh state.
            refresh_interval: Delay after success before the next quiet-period
                refresh is due.
            failure_retry_interval: Minimum delay after a failed attempt. A
                provider Retry-After value extends this delay when necessary.
            policy: Shared local match-day policy; absent for isolated fixed schedules.
            phase: Offset within the shared active cadence, not another interval.
            clock: Optional zero-argument UTC clock for deterministic tests.
        """
        self._policy = policy
        self._phase = phase
        self._service = service
        self._repository = repository
        self._refresh_interval = refresh_interval
        self._failure_retry_interval = failure_retry_interval
        self._clock = clock if clock is not None else lambda: datetime.now(UTC)
        self._refresh_lock = Lock()
        self._refreshing = False

    def get_state(self) -> StandingsStateResponse:
        """
        Return the latest local data and a freshness state without provider I/O.

        Returns:
            Last successful standings and refresh metadata suitable for the API.
        """
        now = self._now()
        standings, last_attempt_at, next_refresh_at, refresh_error = self._repository.read_state()

        if self._refreshing:
            status = "refreshing"
        elif standings is None and refresh_error:
            status = "error"
        elif standings is None:
            status = "pending"
        elif refresh_error or (next_refresh_at is not None and now >= next_refresh_at):
            status = "stale"
        else:
            status = "fresh"

        return StandingsStateResponse(
            standings=standings,
            refresh_status=status,
            last_attempt_at=last_attempt_at,
            last_success_at=standings.retrieved_at if standings else None,
            next_refresh_at=next_refresh_at,
            refresh_error=refresh_error,
        )

    def refresh_if_due(self) -> bool:
        """
        Retrieve standings only when the persisted backend schedule is due.

        Returns:
            True when this call performed a provider attempt; False when another
            refresh owns the lock or the next scheduled time has not arrived.
        """
        if not self._refresh_lock.acquire(blocking=False):
            return False

        try:
            # Phase 1: Reconcile local activity before deciding whether I/O is due.
            now = self._now()
            self._reconcile_schedule()
            _, _, next_refresh_at, _ = self._repository.read_state()
            if next_refresh_at is not None and now < next_refresh_at:
                return False

            try:
                # Phase 2: Persist the attempt before calling the provider.
                self._refreshing = True
                self._repository.record_attempt(
                    now,
                    now + self._failure_retry_interval,
                )

                try:
                    standings = self._service.get_standings()
                except ProviderError as exc:
                    failed_at = self._now()
                    retry_after = timedelta(seconds=exc.retry_after_seconds or 0)
                    next_attempt = max(
                        failed_at + self._failure_retry_interval,
                        failed_at + retry_after,
                    )
                    self._repository.record_failure(now, next_attempt, SAFE_REFRESH_ERROR)
                    logger.warning("Standings refresh failed (%s)", type(exc).__name__)
                except Exception as exc:
                    failed_at = self._now()
                    self._repository.record_failure(
                        now,
                        failed_at + self._failure_retry_interval,
                        SAFE_REFRESH_ERROR,
                    )
                    logger.error("Standings refresh failed (%s)", type(exc).__name__)
                else:
                    # Phase 3: Commit validated data and the next deadline together.
                    completed_at = self._now()
                    self._repository.record_success(
                        standings,
                        now,
                        (
                            self._policy.next_attempt(
                                completed_at, completed_at, self._refresh_interval, self._phase
                            )
                            if self._policy
                            else completed_at + self._refresh_interval
                        ),
                    )
            finally:
                self._refreshing = False

            return True
        finally:
            self._refresh_lock.release()

    def _reconcile_schedule(self) -> None:
        """
        Bring normal due times forward when fixture activity or settings change.

        Preserve failure retries and never delay an existing due attempt when
        activity ends. Persist adjustments so API freshness and restarts agree.
        """
        if self._policy is None or self._refreshing:
            return
        data, _, due, error = self._repository.read_state()
        if data is None or error:
            return
        proposed = self._policy.next_attempt(
            data.retrieved_at, self._now(), self._refresh_interval, self._phase
        )
        if due is None or proposed < due:
            self._repository.reschedule(proposed)

    def seconds_until_next_attempt(self) -> float:
        """
        Reconcile the schedule and calculate the worker's next sleep.

        Returns:
            Non-negative seconds until the persisted due time; zero means an
            immediate attempt. Policy reconciliation may update that due time.
        """
        self._reconcile_schedule()
        _, _, next_refresh_at, _ = self._repository.read_state()

        if next_refresh_at is None:
            return 0

        return max(0.0, (next_refresh_at - self._now()).total_seconds())

    def _now(self) -> datetime:
        """
        Read the injected clock and require an aware instant.

        Returns:
            The clock value normalized to UTC; naive values fail before storage.
        """
        now = self._clock()

        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("Refresh clock must return a timezone-aware datetime")

        return now.astimezone(UTC)


class FixturesRefreshCoordinator:
    """
    Own refresh timing and freshness state for the EPL fixtures dataset.

    The service is process-local and designed for one backend worker process,
    matching the project's single-device deployment. SQLite carries successful
    data and scheduled times across restarts; the lock prevents overlap within
    the running process.
    """

    def __init__(
        self,
        service: FixturesService,
        repository: SQLiteFixturesRepository,
        *,
        refresh_interval: timedelta,
        failure_retry_interval: timedelta,
        active_interval: timedelta = timedelta(minutes=5),
        policy: MatchDayRefreshPolicy | None = None,
        phase: timedelta = timedelta(0),
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        """
        Configure a single-provider fixtures refresh coordinator.

        Args:
            service: Application use case for retrieving normalized fixtures.
            repository: SQLite storage for season snapshots and refresh state.
            refresh_interval: Delay after success before the next quiet-period
                refresh is due.
            failure_retry_interval: Minimum delay after a failed attempt. A
                provider Retry-After value extends this delay when necessary.
            active_interval: Active cadence when no shared policy is injected.
            policy: Shared local match-day policy; defaults to this fixture repository.
            phase: Offset within the shared active cadence, not another interval.
            clock: Optional zero-argument UTC clock for deterministic tests.
        """
        self._policy = policy or MatchDayRefreshPolicy(
            lambda: repository.read_state()[0], active_interval
        )
        self._phase = phase
        self._service = service
        self._repository = repository
        self._refresh_interval = refresh_interval
        self._failure_retry_interval = failure_retry_interval
        self._clock = clock if clock is not None else lambda: datetime.now(UTC)
        self._refresh_lock = Lock()
        self._refreshing = False

    def get_state(self, *, team_id: int | None = None) -> FixturesStateResponse:
        """
        Return the latest local data and a freshness state without provider I/O.

        Args:
            team_id: Optional club identifier selecting its full saved season.
                This changes only the read view, never the provider schedule.

        Returns:
            Last successful fixtures and refresh metadata suitable for the API.
            With a team ID, include its full season; otherwise select two weeks.
        """
        now = self._now()
        fixtures, last_attempt_at, next_refresh_at, refresh_error = self._repository.read_state()

        if self._refreshing:
            status = "refreshing"
        elif fixtures is None and refresh_error:
            status = "error"
        elif fixtures is None:
            status = "pending"
        elif refresh_error or (next_refresh_at is not None and now >= next_refresh_at):
            status = "stale"
        else:
            status = "fresh"

        # Select a read-only view from this snapshot; neither branch changes storage or schedules.
        selected_fixtures = None
        if fixtures is not None:
            if team_id is not None:
                matches = tuple(
                    match for match in fixtures.matches if team_id in {match.home.id, match.away.id}
                )
            else:
                displayed_weeks = {fixtures.current_matchday, fixtures.current_matchday + 1}
                matches = tuple(
                    match for match in fixtures.matches if match.matchday in displayed_weeks
                )
            selected_fixtures = fixtures.model_copy(update={"matches": matches})

        return FixturesStateResponse(
            fixtures=selected_fixtures,
            refresh_status=status,
            last_attempt_at=last_attempt_at,
            last_success_at=fixtures.retrieved_at if fixtures else None,
            next_refresh_at=next_refresh_at,
            refresh_error=refresh_error,
        )

    def refresh_if_due(self) -> bool:
        """
        Retrieve fixtures only when the persisted backend schedule is due.

        Returns:
            True when this call performed a provider attempt; False when another
            refresh owns the lock or the next scheduled time has not arrived.
        """
        if not self._refresh_lock.acquire(blocking=False):
            return False

        try:
            # Phase 1: Reconcile local activity before deciding whether I/O is due.
            now = self._now()
            self._reconcile_schedule()
            _, _, next_refresh_at, _ = self._repository.read_state()
            if next_refresh_at is not None and now < next_refresh_at:
                return False

            try:
                # Phase 2: Persist the attempt before calling the provider.
                self._refreshing = True
                self._repository.record_attempt(
                    now,
                    now + self._failure_retry_interval,
                )

                try:
                    fixtures = self._service.get_fixtures()
                    previous, _, _, _ = self._repository.read_state()
                    if previous and previous.season_id == fixtures.season_id:
                        missing_ids = {match.id for match in previous.matches} - {
                            match.id for match in fixtures.matches
                        }
                        if missing_ids:
                            raise ProviderError("Incomplete fixture response")
                except ProviderError as exc:
                    failed_at = self._now()
                    retry_after = timedelta(seconds=exc.retry_after_seconds or 0)
                    next_attempt = max(
                        failed_at + self._failure_retry_interval,
                        failed_at + retry_after,
                    )
                    self._repository.record_failure(now, next_attempt, SAFE_FIXTURES_ERROR)
                    logger.warning("Fixtures refresh failed (%s)", type(exc).__name__)
                except Exception as exc:
                    failed_at = self._now()
                    self._repository.record_failure(
                        now,
                        failed_at + self._failure_retry_interval,
                        SAFE_FIXTURES_ERROR,
                    )
                    logger.error("Fixtures refresh failed (%s)", type(exc).__name__)
                else:
                    # Phase 3: Commit validated data and the next deadline together.
                    completed_at = self._now()
                    self._repository.record_success(
                        fixtures,
                        now,
                        next_fixture_refresh(
                            fixtures,
                            completed_at,
                            self._refresh_interval,
                            self._policy.active_interval,
                        ),
                    )
            finally:
                self._refreshing = False

            return True
        finally:
            self._refresh_lock.release()

    def _reconcile_schedule(self) -> None:
        """
        Bring normal due times forward when fixture activity or settings change.

        Preserve failure retries and never delay an existing due attempt when
        activity ends. Persist adjustments so API freshness and restarts agree.
        """
        if self._policy is None or self._refreshing:
            return
        data, _, due, error = self._repository.read_state()
        if data is None or error:
            return
        proposed = self._policy.next_attempt(
            data.retrieved_at, self._now(), self._refresh_interval, self._phase
        )
        if due is None or proposed < due:
            self._repository.reschedule(proposed)

    def seconds_until_next_attempt(self) -> float:
        """
        Reconcile the schedule and calculate the worker's next sleep.

        Returns:
            Non-negative seconds until the persisted due time; zero means an
            immediate attempt. Policy reconciliation may update that due time.
        """
        self._reconcile_schedule()
        _, _, next_refresh_at, _ = self._repository.read_state()

        if next_refresh_at is None:
            return 0

        return max(0.0, (next_refresh_at - self._now()).total_seconds())

    def _now(self) -> datetime:
        """
        Read the injected clock and require an aware instant.

        Returns:
            The clock value normalized to UTC; naive values fail before storage.
        """
        now = self._clock()

        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("Refresh clock must return a timezone-aware datetime")

        return now.astimezone(UTC)


class RefreshWorker:
    """
    Run both dataset schedules sequentially on one background thread.

    Fixtures run first so newly discovered match days can shorten the standings
    deadline in the same iteration. The stop event interrupts sleep immediately;
    start once per application lifespan and stop before closing dependencies.
    """

    def __init__(
        self,
        coordinator: StandingsRefreshCoordinator,
        fixtures: FixturesRefreshCoordinator | None = None,
    ) -> None:
        """
        Create the worker that sleeps until the earliest dataset is due.

        Args:
            coordinator: Standings schedule, executed after fixtures when present.
            fixtures: Optional independent fixtures schedule on this same thread.
        """
        self._coordinator = coordinator
        self._fixtures = fixtures
        self._stop_event = Event()
        self._thread = Thread(target=self._run, name="football-refresh", daemon=True)

    def start(self) -> None:
        """
        Start the worker; its first iteration refreshes missing or due data.
        """
        self._thread.start()

    def stop(self) -> None:
        """
        Signal shutdown and join before dependent resources may be closed.

        Notes:
            Called off the ASGI event loop. Provider operations use bounded
            timeouts; waiting here prevents closing SQLite under a live worker.
        """
        self._stop_event.set()
        self._thread.join()

    def _run(self) -> None:
        """
        Refresh when due, then sleep until due or application shutdown.
        """
        while not self._stop_event.is_set():
            try:
                # Refresh fixtures first, then standings, using their independent deadlines.
                if self._fixtures is not None:
                    self._fixtures.refresh_if_due()
                # Shutdown may arrive during fixture I/O; do not start another request.
                if self._stop_event.is_set():
                    break

                self._coordinator.refresh_if_due()
                wait_seconds = self._coordinator.seconds_until_next_attempt()
                if self._fixtures is not None:
                    wait_seconds = min(wait_seconds, self._fixtures.seconds_until_next_attempt())
            except Exception as exc:
                logger.error("Football refresh worker failed (%s)", type(exc).__name__)
                self._stop_event.wait(30)
                continue

            # Event.wait sleeps until the earliest deadline or an immediate stop signal.
            self._stop_event.wait(wait_seconds if wait_seconds > 0 else 1)


class MatchDayRefreshPolicy:
    """
    Select a shared active cadence from locally saved EPL fixture dates.

    Dates use Pacific calendar days, not a matchweek span or live-status guess.
    UTC-aligned slots allow datasets to share a cadence with different offsets.
    The policy performs no provider calls and owns no retry state.

    Attributes:
        active_interval: Shared positive interval used by both datasets.
    """

    def __init__(
        self, fixtures: Callable[[], FixturesResponse | None], active_interval: timedelta
    ) -> None:
        """
        Configure local fixture access and the one shared active interval.

        Args:
            fixtures: Reader for the complete saved season, not the two-week API view.
            active_interval: Positive time between active requests for each dataset.
        """
        if active_interval.total_seconds() <= 0:
            raise ValueError("Active interval must be positive")
        self._fixtures = fixtures
        self.active_interval = active_interval

    def next_attempt(
        self, after: datetime, now: datetime, quiet: timedelta, phase: timedelta = timedelta(0)
    ) -> datetime:
        """
        Calculate a normal due time without altering retry deadlines.

        Args:
            after: Latest successful retrieval or completion instant.
            now: Current UTC instant used to choose the activity mode.
            quiet: This dataset's quiet-period interval.
            phase: Dataset offset within the shared active cadence.

        Returns:
            Active slot after the success, or quiet deadline capped at the next
            scheduled match day's start plus this dataset's phase.
        """
        # Phase 1: Derive active Pacific dates from the saved full-season schedule.
        zone = ZoneInfo("America/Los_Angeles")
        today = now.astimezone(zone).date()
        data = self._fixtures()
        days = (
            {
                match.kickoff.astimezone(zone).date()
                for match in data.matches
                if match.kickoff is not None and match.status not in {"POSTPONED", "CANCELLED"}
            }
            if data
            else set()
        )
        # Phase 2: Pick the next staggered active slot, or the quiet-day boundary.
        if today in days:
            anchor = datetime(1970, 1, 1, tzinfo=UTC) + phase
            # On entry to a new match day, retain the staggered first slot even
            # when the last success belongs to a previous quiet day.
            if after.astimezone(zone).date() < today:
                after = datetime.combine(today, datetime.min.time(), tzinfo=zone).astimezone(
                    UTC
                ) - timedelta(microseconds=1)
            slots = (after - anchor) // self.active_interval + 1
            return anchor + slots * self.active_interval

        due = after + quiet
        future = [day for day in days if day > today]
        if future:
            boundary = datetime.combine(min(future), datetime.min.time(), tzinfo=zone).astimezone(
                UTC
            )
            due = min(due, boundary + phase)
        return due


def next_fixture_refresh(
    data: FixturesResponse, now: datetime, quiet: timedelta, active: timedelta
) -> datetime:
    """
    Calculate a fixture due time using the shared scheduled-day rule.

    Args:
        data: Complete season fixtures.
        now: UTC successful completion instant.
        quiet: Quiet fixture interval.
        active: Shared active interval.

    Returns:
        Next fixture slot or quiet deadline, including future-day boundaries.
    """
    return MatchDayRefreshPolicy(lambda: data, active).next_attempt(now, now, quiet)
