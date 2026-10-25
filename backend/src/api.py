"""
Expose the dashboard's persisted standings and refresh status over HTTP.

Routes return normalized application models read from local SQLite state. They
never create a provider client or call football-data.org; the application-level
refresh worker owns that work on a backend schedule, independently of browser
requests. The response keeps the last successful table available when a later
provider refresh fails.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from models import StandingsStateResponse
from refresh import StandingsRefreshCoordinator

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
