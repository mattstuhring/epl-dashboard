"""
Implement provider-independent use cases for EPL standings and fixtures.

The service sits between the refresh coordinator and a `FootballProvider`, so
the rest of the application depends on application-owned models rather than
provider details. It remains intentionally small: the coordinator owns timing
and the SQLite repository owns durable state. The provider is injected to keep
this use case deterministic in tests and replaceable without changing API code.
"""

from models import FixturesResponse, StandingsResponse
from providers import FootballProvider


class StandingsService:
    """
    Retrieve standings through the provider-independent application port.

    Attributes:
        _provider: Implementation of the application's football data protocol.
    """

    def __init__(self, provider: FootballProvider) -> None:
        """
        Create the use case with an explicitly supplied provider.

        Args:
            provider: Source implementing `FootballProvider`, usually the
                football-data.org adapter in the running application.
        """
        self._provider = provider

    def get_standings(self) -> StandingsResponse:
        """
        Return the latest normalized standings from the provider.

        Returns:
            Application-owned competition, season, row, and retrieval-time data.

        Notes:
            The provider translates transport errors and upstream payloads at
            its boundary. This method deliberately contains no HTTP or storage
            behavior; the refresh coordinator decides when to call it.
        """
        return self._provider.get_standings()


class FixturesService:
    """
    Retrieve fixture data through the same provider boundary as standings.
    """

    def __init__(self, provider: FootballProvider) -> None:
        """
        Inject the provider without taking ownership of its HTTP resources.

        Args:
            provider: Application provider shared with the standings service.
        """
        self._provider = provider

    def get_fixtures(self) -> FixturesResponse:
        """
        Retrieve normalized season matches for scheduled persistence.

        Returns:
            Validated fixtures; provider failures propagate to the coordinator.
        """
        return self._provider.get_fixtures()
