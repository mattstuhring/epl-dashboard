"""
Define normalized standings, fixture and refresh contracts for the dashboard.

These models are the boundary between the football-data.org adapter, the
application service, and the HTTP API. They validate untrusted provider values
and give the frontend a stable schema without exposing upstream JSON names.
Field descriptions are published through Pydantic's JSON Schema and FastAPI's
OpenAPI document, making each value's meaning visible to API consumers.
"""

from datetime import UTC, date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StandingsRow(BaseModel):
    """
    One club's normalized row in the league-wide total standings table.

    Stable identity and rank are validated before persistence. Points may be
    negative after deductions; match and goal counts must be non-negative.
    """

    model_config = ConfigDict(frozen=True)

    position: int = Field(ge=1, le=20, description="Current league position, starting at 1.")
    team_id: int = Field(gt=0, description="Stable football-data.org team identifier.")
    team_name: str = Field(min_length=1, description="Display name of the club.")
    team_crest: str | None = Field(default=None, description="Optional club crest URL.")
    played: int = Field(ge=0, description="League matches played in this season.")
    won: int = Field(ge=0, description="League matches won in this season.")
    drawn: int = Field(ge=0, description="League matches drawn in this season.")
    lost: int = Field(ge=0, description="League matches lost in this season.")
    goals_for: int = Field(ge=0, description="Goals scored in league matches this season.")
    goals_against: int = Field(ge=0, description="Goals conceded in league matches this season.")
    goal_difference: int = Field(description="Goals for minus goals against.")
    points: int = Field(description="League points currently awarded to the club.")


class StandingsResponse(BaseModel):
    """
    A complete normalized EPL table with competition and freshness context.

    The response represents the provider's `TOTAL` table for one season. Dates
    remain calendar dates; `retrieved_at` is an absolute UTC instant. A valid
    response may contain zero rows, which is distinct from a provider failure.
    """

    model_config = ConfigDict(frozen=True)

    competition_id: int = Field(description="Stable identifier for the competition.")
    competition_code: str = Field(description="Short competition code; `PL` identifies the EPL.")
    competition_name: str = Field(description="Display name of the competition.")
    season_id: int = Field(gt=0, description="Stable identifier for the competition season.")
    season_start: date = Field(description="Season start date, without a time or timezone.")
    season_end: date = Field(description="Season end date, without a time or timezone.")
    current_matchday: int | None = Field(
        description="Current matchday when supplied by the provider; otherwise null."
    )
    rows: tuple[StandingsRow, ...] = Field(
        description="League-wide total standings in provider-supplied table order."
    )
    retrieved_at: datetime = Field(
        description="UTC timestamp when this provider response was retrieved successfully."
    )

    @field_validator("retrieved_at")
    @classmethod
    def retrieved_at_is_utc(cls, value: datetime) -> datetime:
        """
        Require the retrieval instant to be timezone-aware and UTC-equivalent.

        Args:
            value: Candidate timestamp supplied when creating the response.

        Returns:
            The validated timestamp, unchanged.
        """
        if value.tzinfo is None or value.utcoffset() != timedelta(0):
            raise ValueError("retrieved_at must be a timezone-aware UTC timestamp")
        return value


class StandingsStateResponse(BaseModel):
    """
    Describe the last successful standings data and the backend refresh state.

    `standings` remains available when a refresh fails, allowing the dashboard
    to display stale but valid data. Refresh timestamps are UTC instants; the
    API never represents a failed refresh as an empty successful table.
    """

    model_config = ConfigDict(frozen=True)

    standings: StandingsResponse | None = Field(
        description="Last successfully retrieved standings, or null before the first success."
    )
    refresh_status: Literal["pending", "refreshing", "fresh", "stale", "error"] = Field(
        description="Current backend refresh state for the standings data."
    )
    last_attempt_at: datetime | None = Field(
        description="UTC instant when the latest provider refresh attempt began, if any."
    )
    last_success_at: datetime | None = Field(
        description="UTC instant of the latest successful provider response, if any."
    )
    next_refresh_at: datetime | None = Field(
        description="UTC instant when the backend should next attempt a refresh, if scheduled."
    )
    refresh_error: str | None = Field(
        description="Safe summary of the latest failure; never includes provider response details."
    )


class FixtureTeam(BaseModel):
    """
    Identify a club and its optional display crest in a fixture.

    The adapter validates each team at the provider boundary. Unsafe image
    schemes are omitted so the frontend can use its decorative fallback.
    """

    id: int = Field(gt=0, description="Stable provider team identifier.")
    name: str = Field(min_length=1, description="Club display name.")
    crest: str | None = Field(default=None, description="Optional HTTPS club crest URL.")

    @field_validator("crest")
    @classmethod
    def safe_crest(cls, value: str | None) -> str | None:
        """
        Omit non-HTTPS images so browser requests cannot use unsafe schemes.

        Args:
            value: Optional upstream image URL.

        Returns:
            HTTPS URL or null, allowing a text fallback.
        """
        return value if value and value.startswith("https://") else None


class Fixture(BaseModel):
    """
    Describe one EPL match throughout its scheduled, in-play and final states.

    Match ID survives score corrections and rescheduling. Unknown kickoff and
    score values remain null; zero is a genuine reported score.
    """

    id: int = Field(gt=0, description="Stable match identifier used for corrections.")
    matchday: int = Field(ge=1, le=38, description="Provider-assigned EPL matchweek.")
    kickoff: datetime | None = Field(description="UTC kickoff, or null when unknown.")
    status: str = Field(min_length=1, description="Provider status; unknown states remain visible.")
    home: FixtureTeam = Field(description="Home club.")
    away: FixtureTeam = Field(description="Away club.")
    home_score: int | None = Field(
        ge=0, description="Reported home score; null means unavailable and zero is a valid score."
    )
    away_score: int | None = Field(
        ge=0, description="Reported away score; null means unavailable and zero is a valid score."
    )

    @field_validator("kickoff")
    @classmethod
    def aware_kickoff(cls, value: datetime | None) -> datetime | None:
        """
        Require explicit timezone information on supplied kickoff instants.

        Args:
            value: Parsed kickoff timestamp, if known.

        Returns:
            UTC-normalized timestamp, or null.
        """
        if value is not None:
            if value.tzinfo is None:
                raise ValueError("kickoff must be timezone-aware")
            return value.astimezone(UTC)
        return None


class FixturesResponse(BaseModel):
    """
    Store one complete season's fixture state for atomic correction and retention.

    The API selects a pair of weeks or one club’s fixtures; retaining the season locally
    allows activity scheduling without making extra per-week provider requests.
    """

    season_id: int = Field(gt=0, description="Provider season identifier.")
    current_matchday: int = Field(ge=1, le=38, description="Provider-selected current matchweek.")
    matches: tuple[Fixture, ...] = Field(description="Unique validated matches in this season.")
    retrieved_at: datetime = Field(description="UTC successful retrieval instant.")

    @field_validator("retrieved_at")
    @classmethod
    def aware_retrieval(cls, value: datetime) -> datetime:
        """
        Require a UTC retrieval timestamp for stored fixture freshness.

        Args:
            value: Parsed retrieval instant.

        Returns:
            Validated UTC timestamp.
        """
        if value.tzinfo is None or value.utcoffset() != timedelta(0):
            raise ValueError("retrieved_at must be UTC")
        return value


class FixturesStateResponse(BaseModel):
    """
    Publish a selected fixture view with independent refresh metadata.

    The coordinator selects display weeks or a club’s fixtures from the stored full season. Failed
    attempts keep that snapshot available alongside a sanitized failure status.
    """

    fixtures: FixturesResponse | None = Field(
        description="Selected matchweeks or club season, null before first success."
    )
    refresh_status: Literal["pending", "refreshing", "fresh", "stale", "error"] = Field(
        description="Fixture refresh status."
    )
    last_attempt_at: datetime | None = Field(description="UTC latest attempt start.")
    last_success_at: datetime | None = Field(description="UTC latest successful refresh.")
    next_refresh_at: datetime | None = Field(description="UTC next scheduled attempt.")
    refresh_error: str | None = Field(description="Sanitized latest fixture failure.")
