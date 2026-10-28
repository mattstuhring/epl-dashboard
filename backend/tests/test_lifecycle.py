"""
Verify that partial startup releases owned resources without provider network calls.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
from config import Settings
from storage import SQLiteFixturesRepository, SQLiteStandingsRepository


def test_provider_startup_failure_closes_both_databases(tmp_path: Path, monkeypatch) -> None:
    closed: list[str] = []
    standings_close = SQLiteStandingsRepository.close
    fixtures_close = SQLiteFixturesRepository.close

    def close_standings(self) -> None:
        closed.append("standings")
        standings_close(self)

    def close_fixtures(self) -> None:
        closed.append("fixtures")
        fixtures_close(self)

    def failed_provider(settings: Settings):
        raise RuntimeError("Injected startup failure")

    monkeypatch.setattr(SQLiteStandingsRepository, "close", close_standings)
    monkeypatch.setattr(SQLiteFixturesRepository, "close", close_fixtures)
    app = main.create_app(
        settings=Settings(_env_file=None),
        database_path=tmp_path / "startup.sqlite3",
        provider_factory=failed_provider,
    )
    with pytest.raises(RuntimeError, match="Injected startup failure"), TestClient(app):
        pass
    assert closed == ["fixtures", "standings"]
