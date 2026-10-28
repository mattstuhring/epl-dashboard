"""
Isolate football-data.org v4 HTTP details from application code.

`FootballProvider` is the application-facing protocol used by services.
`FootballDataAdapter` implements it by authenticating, requesting the EPL
standings and season-matches endpoints, validating responses, and mapping the provider
schema into models owned by this application. Keeping this translation here
allows routes and the frontend contract to remain stable if the provider changes.
The adapter also owns bounded HTTP setup and translates transport/schema
failures into safe application exceptions without logging credentials or bodies.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from math import isfinite
from typing import Any, Protocol

import httpx

from models import Fixture, FixturesResponse, FixtureTeam, StandingsResponse, StandingsRow

logger = logging.getLogger(__name__)


class FootballProvider(Protocol):
    """
    Application port for the football data operations used by services.

    Services type against this protocol rather than a concrete adapter. Each
    implementation must return application-owned models and keep authentication,
    HTTP details, and provider response shapes behind this boundary.
    """

    def get_standings(self) -> StandingsResponse:
        """
        Retrieve and normalize the current EPL standings.

        Returns:
            A validated application-owned response for the current total table.
        """
        ...

    def get_fixtures(self) -> FixturesResponse:
        """
        Retrieve a complete normalized EPL season fixture list.

        Returns:
            Validated season identity, current matchweek and unique matches.
        """
        ...


class ProviderError(Exception):
    """
    Represent an upstream failure in a safe application-level form.

    Adapters raise this exception after translating transport or payload errors.
    Its message must not contain credentials, raw headers, or unfiltered provider
    response bodies because API handlers and operational logs may expose it.
    """

    def __init__(self, message: str, *, retry_after_seconds: float | None = None) -> None:
        """
        Initialize a sanitized message and optional provider retry guidance.

        Args:
            message: Safe application-facing error summary.
            retry_after_seconds: Optional delay requested by the provider before
                another attempt; no upstream response body or raw header is kept.
        """
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class ProviderConfigurationError(ProviderError):
    """
    Represent missing or unusable provider configuration.

    This narrower category lets the HTTP boundary return a configuration status
    distinct from a transient or malformed upstream response.
    """


class FootballDataAdapter:
    """
    Implement the football-data.org v4 standings and season-fixture integration.

    The adapter sends the server-held token in `X-Auth-Token`, uses a bounded
    synchronous HTTP client, and converts only the `TOTAL` EPL table into
    `StandingsResponse`; season matches become `FixturesResponse`. The client and clock can be injected for deterministic
    tests. It does not cache data or own persistence; the application refresh
    coordinator and SQLite repository own those concerns.
    """

    def __init__(
        self,
        token: str | None,
        *,
        base_url: str = "https://api.football-data.org/v4",
        timeout_seconds: float = 10.0,
        client: httpx.Client | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        """
        Configure credentials, endpoint, HTTP client, and retrieval clock.

        Args:
            token: Secret value obtained from validated server settings, or
                `None` when the provider is not configured.
            base_url: HTTPS root of the football-data.org v4 API. Endpoint paths
                are appended by this adapter.
            timeout_seconds: Maximum duration for an individual HTTP operation
                when the adapter creates its own client.
            client: Optional preconfigured HTTP client, commonly using a mock
                transport in tests. Ownership remains with the caller.
            clock: Optional zero-argument clock used to timestamp successful
                retrievals. It should return a timezone-aware UTC datetime.

        Notes:
            The adapter closes only a client that it creates itself. The caller
            remains responsible for the lifetime of an injected client.
        """
        self._token = token
        self._base_url = base_url.rstrip("/")
        self._client = client if client is not None else httpx.Client(timeout=timeout_seconds)
        self._owns_client = client is None
        self._clock = clock if clock is not None else lambda: datetime.now(UTC)

    def get_standings(self) -> StandingsResponse:
        """
        Fetch and validate the current EPL total standings table.

        Returns:
            A normalized standings response with a UTC retrieval timestamp.

        Notes:
            Sends the token only in the `X-Auth-Token` header. HTTP status,
            timeout, transport, and invalid-payload failures are translated to
            `ProviderError`; missing credentials use
            `ProviderConfigurationError`. Logs contain status/error categories,
            not the token, request headers, or response body.
        """
        if not self._token:
            raise ProviderConfigurationError("FOOTBALL_DATA_TOKEN is not configured")

        try:
            response = self._client.get(
                f"{self._base_url}/competitions/PL/standings",
                headers={"X-Auth-Token": self._token},
            )
            response.raise_for_status()
            payload = response.json()
            return self._map_standings(payload, self._clock())
        except ProviderError:
            raise
        except httpx.HTTPStatusError as exc:
            logger.warning("football-data.org returned HTTP status %d", exc.response.status_code)
            raise ProviderError(
                "Could not retrieve valid standings from the data provider",
                retry_after_seconds=_retry_after_seconds(
                    exc.response.headers.get("Retry-After"), self._clock()
                ),
            ) from exc
        except httpx.TimeoutException as exc:
            logger.warning("football-data.org standings request timed out")
            raise ProviderError(
                "Could not retrieve valid standings from the data provider"
            ) from exc
        except httpx.HTTPError as exc:
            logger.warning("football-data.org transport failed (%s)", type(exc).__name__)
            raise ProviderError(
                "Could not retrieve valid standings from the data provider"
            ) from exc
        except (ValueError, TypeError, KeyError) as exc:
            logger.warning(
                "football-data.org standings response was invalid (%s)", type(exc).__name__
            )
            raise ProviderError(
                "Could not retrieve valid standings from the data provider"
            ) from exc

    def get_fixtures(self) -> FixturesResponse:
        """
        Retrieve season fixtures in one bounded request, validating before storage.

        Returns:
            Complete normalized season with current matchweek and crest URLs.

        Notes:
            Missing identity, inconsistent seasons, duplicate matches or count
            mismatches fail the entire refresh to preserve last-known-good data.
        """
        if not self._token:
            raise ProviderConfigurationError("FOOTBALL_DATA_TOKEN is not configured")

        try:
            response = self._client.get(
                f"{self._base_url}/competitions/PL/matches",
                headers={"X-Auth-Token": self._token},
            )
            response.raise_for_status()
            return self._map_fixtures(response.json(), self._clock())
        except httpx.HTTPStatusError as exc:
            raise ProviderError(
                "Could not retrieve fixtures from the data provider",
                retry_after_seconds=_retry_after_seconds(
                    exc.response.headers.get("Retry-After"), self._clock()
                ),
            ) from exc
        except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError) as exc:
            raise ProviderError("Could not retrieve valid fixtures from the data provider") from exc

    @staticmethod
    def _map_fixtures(payload: Any, retrieved_at: datetime) -> FixturesResponse:
        """
        Translate one untrusted competition-match response into local contracts.

        Args:
            payload: Decoded JSON from the season-wide EPL matches endpoint.
            retrieved_at: Injected UTC retrieval instant.

        Returns:
            Validated season data suitable for an atomic SQLite upsert.
        """
        if not isinstance(payload, dict) or payload.get("competition", {}).get("code") != "PL":
            raise ValueError("Expected EPL competition")
        # Check response completeness before constructing any application models.
        rows = payload["matches"]
        if not isinstance(rows, list) or not rows:
            raise ValueError("No season identity available")
        if payload["resultSet"]["count"] != len(rows):
            raise ValueError("Incomplete match response")

        # Normalize stable match/team identifiers and retain missing scores as null.
        season = rows[0]["season"]
        matches = []
        for row in rows:
            if row["season"]["id"] != season["id"]:
                raise ValueError("Mixed seasons")
            matches.append(
                Fixture(
                    id=row["id"],
                    matchday=row["matchday"],
                    kickoff=row.get("utcDate"),
                    status=row["status"],
                    home=FixtureTeam(
                        id=row["homeTeam"]["id"],
                        name=row["homeTeam"]["name"],
                        crest=row["homeTeam"].get("crest"),
                    ),
                    away=FixtureTeam(
                        id=row["awayTeam"]["id"],
                        name=row["awayTeam"]["name"],
                        crest=row["awayTeam"].get("crest"),
                    ),
                    home_score=row["score"]["fullTime"].get("home"),
                    away_score=row["score"]["fullTime"].get("away"),
                )
            )
        # Reject duplicates before the coordinator can commit this season.
        if len({match.id for match in matches}) != len(matches):
            raise ValueError("Duplicate match identifiers")
        return FixturesResponse(
            season_id=season["id"],
            current_matchday=season["currentMatchday"],
            matches=tuple(matches),
            retrieved_at=retrieved_at,
        )

    @staticmethod
    def _map_standings(payload: Any, retrieved_at: datetime) -> StandingsResponse:
        """
        Validate and map an upstream payload into application-owned data.

        Args:
            payload: Decoded JSON value returned by the provider. It is treated
                as untrusted regardless of the static type supplied by HTTPX.
            retrieved_at: Timestamp assigned by the adapter's injected clock
                after a successful HTTP response.

        Returns:
            A validated response containing competition, season, and total-table
            data, with rows in the order supplied by the provider.

        Notes:
            The method is static so schema mapping can be tested without network
            setup. It selects `TOTAL` explicitly and accepts an empty total table
            as a valid response; missing or malformed required fields are errors.
        """
        # Validate the envelope before reading any nested provider fields.
        if not isinstance(payload, dict):
            raise ProviderError("Provider returned an invalid standings response")

        competition = payload.get("competition")
        season = payload.get("season")
        standings = payload.get("standings")

        if (
            not isinstance(competition, dict)
            or not isinstance(season, dict)
            or not isinstance(standings, list)
        ):
            raise ProviderError(
                "Provider response is missing competition, season, or standings data"
            )

        if competition.get("code") != "PL":
            raise ProviderError("Provider returned a non-EPL standings table")

        # The dashboard displays the league-wide table, not HOME or AWAY splits.
        total = next(
            (item for item in standings if isinstance(item, dict) and item.get("type") == "TOTAL"),
            None,
        )
        if not isinstance(total, dict) or not isinstance(total.get("table"), list):
            raise ProviderError("Provider response does not contain a total league table")

        # Normalize each team row so upstream field names stop at this boundary.
        rows: list[StandingsRow] = []
        for row in total["table"]:
            if not isinstance(row, dict) or not isinstance(row.get("team"), dict):
                raise ProviderError("Provider returned an invalid team standing")
            team = row["team"]
            rows.append(
                StandingsRow(
                    position=row["position"],
                    team_id=team["id"],
                    team_name=team["name"],
                    team_crest=FixtureTeam(
                        id=team["id"], name=team["name"], crest=team.get("crest")
                    ).crest,
                    played=row["playedGames"],
                    won=row["won"],
                    drawn=row["draw"],
                    lost=row["lost"],
                    goals_for=row["goalsFor"],
                    goals_against=row["goalsAgainst"],
                    goal_difference=row["goalDifference"],
                    points=row["points"],
                )
            )

        # Duplicate ranks or team identities must never replace a valid saved table.
        if len({row.team_id for row in rows}) != len(rows) or len(
            {row.position for row in rows}
        ) != len(rows):
            raise ProviderError("Provider returned duplicate standings rows")

        # Assemble the application contract only after every required row is valid.
        try:
            return StandingsResponse(
                competition_id=competition["id"],
                competition_code=competition["code"],
                competition_name=competition["name"],
                season_id=season["id"],
                season_start=season["startDate"],
                season_end=season["endDate"],
                current_matchday=season.get("currentMatchday"),
                rows=tuple(rows),
                retrieved_at=retrieved_at,
            )
        except (ValueError, TypeError, KeyError) as exc:
            raise ProviderError("Provider returned incomplete standings data") from exc

    def close(self) -> None:
        """
        Release the HTTP client if this adapter created it.

        Notes:
            Calling this method does not close an injected client; its creator
            retains ownership and must close it separately.
        """
        if self._owns_client:
            self._client.close()


def _retry_after_seconds(value: str | None, now: datetime) -> float | None:
    """
    Parse numeric or HTTP-date Retry-After values without exposing headers.

    Args:
        value: Optional provider header, consumed only at this HTTP boundary.
        now: Aware UTC clock used for absolute HTTP-date values.

    Returns:
        Non-negative delay in seconds, or None for missing/malformed guidance.
    """
    if value is None:
        return None

    try:
        seconds = float(value)
        return max(0.0, seconds) if isfinite(seconds) else None
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None

    if retry_at.tzinfo is None:
        retry_at = retry_at.replace(tzinfo=UTC)

    return max(0.0, (retry_at - now).total_seconds())
