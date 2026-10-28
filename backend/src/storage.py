"""
Persist normalized dashboard datasets and refresh metadata in the local SQLite database.

This module gives the refresh service an atomic, provider-independent storage
boundary. Successful dataset snapshots are upserted by season identifier so a new
season becomes current without deleting previous seasons. Attempt metadata is
stored separately, allowing a failed request to update its status while leaving
the last successful table and timestamp untouched.
"""

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock

from models import FixturesResponse, StandingsResponse


class SQLiteDatasetRepository[Data: StandingsResponse | FixturesResponse]:
    """
    Store the latest successful snapshot for each season of a typed dataset.

    A single connection is protected by a lock because the background worker
    and FastAPI request threads share this repository. Each write uses a
    transaction; callers own this instance and should close it at app shutdown.
    """

    def __init__(self, database_path: str | Path, model: type[Data], namespace: str) -> None:
        """
        Open the configured SQLite file and ensure the minimal schema exists.

        Args:
            database_path: Local database file path. Parent directories are
                created as needed; `:memory:` is supported for isolated tests.
            model: Validated model used to decode persisted snapshots.
            namespace: Internal standings or fixtures table prefix, never user input.
        """
        self._model = model
        if namespace not in {"standings", "fixtures"}:
            raise ValueError("Unknown dataset")
        self._namespace = namespace
        self._lock = RLock()
        path_text = str(database_path)

        if path_text != ":memory:":
            Path(path_text).parent.mkdir(parents=True, exist_ok=True)

        self._connection = sqlite3.connect(path_text, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        try:
            self._initialize_schema()
        except Exception:
            # Constructor failure must not leak an open connection to an unusable repository.
            self._connection.close()
            raise

    def _initialize_schema(self) -> None:
        """
        Create this dataset's snapshot and refresh-control tables if missing.
        """
        with self._lock, self._connection:
            self._connection.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self._namespace}_by_season (
                    season_id INTEGER PRIMARY KEY,
                    retrieved_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            self._connection.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self._namespace}_refresh_control (
                    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
                    last_attempt_at TEXT,
                    next_refresh_at TEXT,
                    refresh_error TEXT
                )
                """
            )
            self._connection.execute(
                f"""
                INSERT OR IGNORE INTO {self._namespace}_refresh_control (singleton_id)
                VALUES (1)
                """
            )

    def read_state(
        self,
    ) -> tuple[Data | None, datetime | None, datetime | None, str | None]:
        """
        Return the latest successful table and persisted refresh metadata.

        Returns:
            A tuple of the typed dataset snapshot, latest attempt time, next refresh time, and a
            safe refresh error summary. Previous-season rows remain stored.
        """
        with self._lock:
            row = self._connection.execute(
                f"""
                SELECT payload_json
                FROM {self._namespace}_by_season
                ORDER BY retrieved_at DESC
                LIMIT 1
                """
            ).fetchone()
            control = self._connection.execute(
                f"""
                SELECT last_attempt_at, next_refresh_at, refresh_error
                FROM {self._namespace}_refresh_control
                WHERE singleton_id = 1
                """
            ).fetchone()

        data = self._model.model_validate_json(row["payload_json"]) if row else None
        last_attempt_at = _parse_datetime(control["last_attempt_at"])
        next_refresh_at = _parse_datetime(control["next_refresh_at"])
        return data, last_attempt_at, next_refresh_at, control["refresh_error"]

    def reschedule(self, next_refresh_at: datetime) -> None:
        """
        Update only the normal due time, preserving saved data and attempt history.

        Args:
            next_refresh_at: UTC deadline selected by the activity policy.
        """
        with self._lock, self._connection:
            self._connection.execute(
                f"UPDATE {self._namespace}_refresh_control SET next_refresh_at = ? WHERE singleton_id = 1",
                (_serialize_datetime(next_refresh_at),),
            )

    def record_attempt(self, attempted_at: datetime, next_refresh_at: datetime) -> None:
        """
        Record the start of a provider attempt without changing the saved dataset.

        Args:
            attempted_at: UTC instant the attempt began.
            next_refresh_at: UTC instant for the next scheduled attempt.
        """
        with self._lock, self._connection:
            self._connection.execute(
                f"""
                UPDATE {self._namespace}_refresh_control
                SET last_attempt_at = ?, next_refresh_at = ?, refresh_error = NULL
                WHERE singleton_id = 1
                """,
                (_serialize_datetime(attempted_at), _serialize_datetime(next_refresh_at)),
            )

    def record_success(
        self,
        standings: Data,
        attempted_at: datetime,
        next_refresh_at: datetime,
    ) -> None:
        """
        Atomically upsert one season and clear the latest refresh failure.

        Args:
            standings: Fully validated dataset to persist for its season.
            attempted_at: UTC instant the successful provider attempt began.
            next_refresh_at: UTC instant for the next scheduled attempt.
        """
        with self._lock, self._connection:
            self._connection.execute(
                f"""
                INSERT INTO {self._namespace}_by_season (season_id, retrieved_at, payload_json)
                VALUES (?, ?, ?)
                ON CONFLICT(season_id) DO UPDATE SET
                    retrieved_at = excluded.retrieved_at,
                    payload_json = excluded.payload_json
                """,
                (
                    standings.season_id,
                    _serialize_datetime(standings.retrieved_at),
                    standings.model_dump_json(),
                ),
            )
            self._connection.execute(
                f"""
                UPDATE {self._namespace}_refresh_control
                SET last_attempt_at = ?, next_refresh_at = ?, refresh_error = NULL
                WHERE singleton_id = 1
                """,
                (_serialize_datetime(attempted_at), _serialize_datetime(next_refresh_at)),
            )

    def record_failure(
        self,
        attempted_at: datetime,
        next_refresh_at: datetime,
        safe_error: str,
    ) -> None:
        """
        Persist failure timing while preserving all successful season data.

        Args:
            attempted_at: UTC instant the failed provider attempt began.
            next_refresh_at: UTC instant for the next scheduled attempt.
            safe_error: Sanitized summary suitable for the local dashboard API.
        """
        with self._lock, self._connection:
            self._connection.execute(
                f"""
                UPDATE {self._namespace}_refresh_control
                SET last_attempt_at = ?, next_refresh_at = ?, refresh_error = ?
                WHERE singleton_id = 1
                """,
                (
                    _serialize_datetime(attempted_at),
                    _serialize_datetime(next_refresh_at),
                    safe_error,
                ),
            )

    def close(self) -> None:
        """
        Close the repository's SQLite connection.
        """
        with self._lock:
            self._connection.close()


def _serialize_datetime(value: datetime) -> str:
    """
    Serialize an aware time as an ISO UTC string for SQLite ordering.

    Args:
        value: A timezone-aware instant supplied by the coordinator.

    Returns:
        UTC ISO text with consistent offset syntax for chronological ordering.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("SQLite refresh timestamps must be timezone-aware")
    return value.astimezone(UTC).isoformat()


def _parse_datetime(value: str | None) -> datetime | None:
    """
    Parse a stored ISO timestamp into a timezone-aware datetime.

    Args:
        value: Repository-written ISO timestamp, or null before an attempt exists.

    Returns:
        The persisted aware instant, or None when no timestamp was recorded.
    """
    return datetime.fromisoformat(value) if value else None


class SQLiteStandingsRepository(SQLiteDatasetRepository[StandingsResponse]):
    """
    Store standings using the shared dataset transaction and retention rules.
    """

    def __init__(self, database_path: str | Path) -> None:
        """
        Open standings tables, preserving compatibility with existing Pi data.

        Args:
            database_path: SQLite file or :memory: for tests.
        """
        super().__init__(database_path, StandingsResponse, "standings")


class SQLiteFixturesRepository(SQLiteDatasetRepository[FixturesResponse]):
    """
    Upsert complete fixture seasons without overwriting standings tables.
    """

    def __init__(self, database_path: str | Path) -> None:
        """
        Open fixture storage alongside the existing standings dataset.

        Args:
            database_path: SQLite file or :memory: for tests.
        """
        super().__init__(database_path, FixturesResponse, "fixtures")
