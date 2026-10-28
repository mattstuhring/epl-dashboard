"""
Expose the dashboard's persisted standings, matchweeks and refresh status over HTTP.

Routes return normalized application models read from local SQLite state. They
never create a provider client or call football-data.org; the application-level
refresh worker owns that work on a backend schedule, independently of browser
requests. The response keeps the last successful table available when a later
provider refresh fails.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request

from models import FixturesStateResponse, StandingsStateResponse
from refresh import FixturesRefreshCoordinator, StandingsRefreshCoordinator

router = APIRouter()


def get_standings_refresh(
    request: Request,
) -> StandingsRefreshCoordinator:
    """
    Return the refresh coordinator created by the application lifespan.

    Args:
        request: Current FastAPI request carrying application state.

    Returns:
        The process-owned coordinator shared by all API clients.
    """
    return request.app.state.standings_refresh


@router.get("/standings", response_model=StandingsStateResponse)
def get_standings(
    coordinator: Annotated[StandingsRefreshCoordinator, Depends(get_standings_refresh)],
) -> StandingsStateResponse:
    """
    Return local standings and backend refresh metadata.

    Args:
        coordinator: Process-level coordinator provided by application state.

    Returns:
        The latest successful standings, latest attempt/success times, and a
        freshness state. Before the first success, `standings` is null and the
        status communicates whether initial retrieval is pending, active, or
        failed.
    """
    return coordinator.get_state()


def get_fixtures_refresh(request: Request) -> FixturesRefreshCoordinator:
    """
    Resolve the process-owned fixture coordinator through FastAPI dependency injection.

    Args:
        request: Current request carrying lifespan-managed application state.

    Returns:
        The shared coordinator; resolving it does not fetch provider data.
    """
    return request.app.state.fixtures_refresh


@router.get("/fixtures", response_model=FixturesStateResponse)
def get_fixtures(
    coordinator: Annotated[FixturesRefreshCoordinator, Depends(get_fixtures_refresh)],
) -> FixturesStateResponse:
    """
    Read the current and next numbered matchweeks without provider requests.

    Args:
        coordinator: Lifespan-owned coordinator injected by FastAPI.

    Returns:
        Last successful fixture weeks and independent refresh metadata.
    """
    return coordinator.get_state()


@router.get("/clubs/{team_id}/fixtures", response_model=FixturesStateResponse)
def get_club_fixtures(
    team_id: Annotated[int, Path(gt=0)],
    coordinator: Annotated[FixturesRefreshCoordinator, Depends(get_fixtures_refresh)],
) -> FixturesStateResponse:
    """
    Read one club's saved EPL season for countdowns, results and recent form.

    Args:
        team_id: Positive provider club identifier, usually the browser favorite.
        coordinator: Lifespan-owned fixture coordinator, injected by FastAPI.

    Returns:
        Filtered full-season fixtures with the existing dataset freshness state.
        Unknown clubs have no matches; before initial retrieval fixtures is null.
        No provider request or schedule change is performed by this read.
    """
    return coordinator.get_state(team_id=team_id)
