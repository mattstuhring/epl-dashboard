"""
Offline tests for provider mapping and the standings HTTP contract.
"""

from datetime import UTC, datetime

import httpx
import pytest
from pydantic import ValidationError

from config import Settings
from models import StandingsResponse
from providers import FootballDataAdapter, ProviderError
from service import StandingsService

RETRIEVED_AT = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)

SAMPLE = {
    "competition": {"id": 2021, "code": "PL", "name": "Premier League"},
    "season": {
        "id": 733,
        "startDate": "2025-08-15",
        "endDate": "2026-05-24",
        "currentMatchday": 6,
    },
    "standings": [
        {"type": "HOME", "table": []},
        {
            "type": "TOTAL",
            "table": [
                {
                    "position": 1,
                    "team": {"id": 66, "name": "Manchester United FC"},
                    "playedGames": 6,
                    "won": 5,
                    "draw": 1,
                    "lost": 0,
                    "goalsFor": 12,
                    "goalsAgainst": 3,
                    "goalDifference": 9,
                    "points": 16,
                }
            ],
        },
    ],
}


def test_adapter_maps_total_table_and_uses_auth_header() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=SAMPLE)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        adapter = FootballDataAdapter("test-token", client=client, clock=lambda: RETRIEVED_AT)
        result = adapter.get_standings()

    assert requests[0].url.path == "/v4/competitions/PL/standings"
    assert requests[0].headers["X-Auth-Token"] == "test-token"
    assert result.competition_code == "PL"
    assert result.rows[0].team_id == 66
    assert result.rows[0].points == 16
    assert result.retrieved_at == RETRIEVED_AT


def test_adapter_rejects_missing_total_table() -> None:
    with pytest.raises(ProviderError, match="total league table"):
        FootballDataAdapter._map_standings({**SAMPLE, "standings": []}, RETRIEVED_AT)


def test_adapter_preserves_a_legitimate_empty_total_table() -> None:
    payload = {
        **SAMPLE,
        "standings": [{"type": "TOTAL", "table": []}],
    }
    result = FootballDataAdapter._map_standings(payload, RETRIEVED_AT)

    assert result.rows == ()


def test_adapter_translates_malformed_provider_rows() -> None:
    malformed_row = {"team": {"id": 66, "name": "Manchester United FC"}}
    malformed = {**SAMPLE, "standings": [{"type": "TOTAL", "table": [malformed_row]}]}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=malformed))

    with httpx.Client(transport=transport) as client:
        adapter = FootballDataAdapter("test-token", client=client)
        with pytest.raises(ProviderError, match="Could not retrieve valid standings"):
            adapter.get_standings()


@pytest.mark.parametrize(
    ("response", "retry_after_seconds"),
    [
        (httpx.Response(429, headers={"Retry-After": "60"}), 60),
        (httpx.Response(503), None),
    ],
)
def test_adapter_translates_upstream_http_failures(
    response: httpx.Response,
    retry_after_seconds: float | None,
) -> None:
    transport = httpx.MockTransport(lambda request: response)

    with httpx.Client(transport=transport) as client:
        adapter = FootballDataAdapter("test-token", client=client)
        with pytest.raises(ProviderError, match="Could not retrieve valid standings") as error:
            adapter.get_standings()
        assert error.value.retry_after_seconds == retry_after_seconds


def test_adapter_translates_request_timeout() -> None:
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("request timed out", request=request)

    with httpx.Client(transport=httpx.MockTransport(timeout)) as client:
        adapter = FootballDataAdapter("test-token", client=client)
        with pytest.raises(ProviderError, match="Could not retrieve valid standings"):
            adapter.get_standings()


def test_settings_reject_invalid_values() -> None:
    with pytest.raises(ValidationError):
        Settings(football_data_timeout_seconds=0)
    with pytest.raises(ValidationError):
        Settings(favorite_team_id=0)
    with pytest.raises(ValidationError):
        Settings(football_data_base_url="http://example.test")
    with pytest.raises(ValidationError):
        Settings(football_data_base_url="https://user:password@example.test")

    with pytest.raises(ValidationError):
        Settings(standings_refresh_interval_seconds=0)


def test_standings_service_delegates_to_provider() -> None:
    response = FootballDataAdapter._map_standings(SAMPLE, RETRIEVED_AT)

    class FakeProvider:
        def __init__(self) -> None:
            self.called = False

        def get_standings(self) -> StandingsResponse:
            self.called = True
            return response

    provider = FakeProvider()
    service = StandingsService(provider)

    assert service.get_standings() == response
    assert provider.called


@pytest.mark.parametrize("fault", ["competition", "duplicate", "negative"])
def test_adapter_rejects_invalid_standings_identity_and_totals(fault: str) -> None:
    from copy import deepcopy

    payload = deepcopy(SAMPLE)
    if fault == "competition":
        payload["competition"]["code"] = "PD"
    elif fault == "duplicate":
        payload["standings"][1]["table"] *= 2
    else:
        payload["standings"][1]["table"][0]["won"] = -1

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        adapter = FootballDataAdapter("test-token", client=client, clock=lambda: RETRIEVED_AT)
        with pytest.raises(ProviderError):
            adapter.get_standings()
