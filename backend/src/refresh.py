"""
Coordinate scheduled standings refreshes independently of browser requests.

The coordinator checks persisted due times, prevents overlapping work in the
backend process, stores successful snapshots atomically, and records safe
failure state without discarding prior data. A small daemon worker wakes at
the next scheduled attempt; API reads only inspect local SQLite state and never
make provider requests.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from threading import Event, Lock, Thread

from models import StandingsStateResponse
from providers import ProviderError
from service import StandingsService
from storage import SQLiteStandingsRepository

logger = logging.getLogger(__name__)
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
            clock: Optional zero-argument UTC clock for deterministic tests.
        """
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
            now = self._now()
            _, _, next_refresh_at, _ = self._repository.read_state()
            if next_refresh_at is not None and now < next_refresh_at:
                return False

            try:
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
                    completed_at = self._now()
                    self._repository.record_success(
                        standings,
                        now,
                        completed_at + self._refresh_interval,
                    )
            finally:
                self._refreshing = False

            return True
        finally:
            self._refresh_lock.release()

    def seconds_until_next_attempt(self) -> float:
        """
        Return a bounded wait duration for the scheduler worker.
        """
        _, _, next_refresh_at, _ = self._repository.read_state()

        if next_refresh_at is None:
            return 0

        return max(0.0, (next_refresh_at - self._now()).total_seconds())

    def _now(self) -> datetime:
        """
        Read the injected clock and require an aware instant.
        """
        now = self._clock()

        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("Refresh clock must return a timezone-aware datetime")

        return now.astimezone(UTC)


class StandingsRefreshWorker:
    """
    Run the standings coordinator on one low-overhead background thread.
    """

    def __init__(self, coordinator: StandingsRefreshCoordinator) -> None:
        """
        Create a worker that owns no resources beyond its stop event/thread.
        """
        self._coordinator = coordinator
        self._stop_event = Event()
        self._thread = Thread(target=self._run, name="standings-refresh", daemon=True)

    def start(self) -> None:
        """
        Start the worker; its first iteration refreshes missing or due data.
        """
        self._thread.start()

    def stop(self) -> None:
        """
        Signal shutdown and wait for an in-flight request to finish.
        """
        self._stop_event.set()
        self._thread.join(timeout=65)

    def _run(self) -> None:
        """
        Refresh when due, then sleep until due or application shutdown.
        """
        while not self._stop_event.is_set():
            try:
                self._coordinator.refresh_if_due()
                wait_seconds = self._coordinator.seconds_until_next_attempt()
            except Exception as exc:
                logger.error("Standings refresh worker failed (%s)", type(exc).__name__)
                self._stop_event.wait(30)
                continue

            self._stop_event.wait(wait_seconds if wait_seconds > 0 else 1)
