"""
Define normalized, provider-independent standings data contracts.

These models are the boundary between the football-data.org adapter, the
application service, and the HTTP API. They validate untrusted provider values
and give the frontend a stable schema without exposing upstream JSON names.
Field descriptions are published through Pydantic's JSON Schema and FastAPI's
OpenAPI document, making each value's meaning visible to API consumers.
"""

from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StandingsRow(BaseModel):
    """
    One club's normalized row in the league-wide total standings table.
    """

    model_config = ConfigDict(frozen=True)

    position: int = Field(description="Current league position, starting at 1.")
    team_id: int = Field(description="Stable football-data.org team identifier.")
    team_name: str = Field(description="Display name of the club.")
    played: int = Field(description="League matches played in this season.")
    won: int = Field(description="League matches won in this season.")
    drawn: int = Field(description="League matches drawn in this season.")
    lost: int = Field(description="League matches lost in this season.")
    goals_for: int = Field(description="Goals scored in league matches this season.")
    goals_against: int = Field(description="Goals conceded in league matches this season.")
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
    season_id: int = Field(description="Stable identifier for the competition season.")
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
