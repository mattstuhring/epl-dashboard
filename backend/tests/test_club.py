"""
Verify club reads use the full saved season without triggering provider refreshes.
"""

from datetime import timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from test_fixtures import NOW, data

from config import Settings
from main import create_app
from storage import SQLiteFixturesRepository


def test_club_route_reads_full_saved_season_and_validates_identity(tmp_path: Path) -> None:
    path = tmp_path / "club.sqlite3"
    repository = SQLiteFixturesRepository(path)
    repository.record_success(data(), NOW, NOW + timedelta(hours=6))
    repository.close()
    application = create_app(
        settings=Settings(_env_file=None, football_data_token=None),
        database_path=path,
        start_refresh_worker=False,
        clock=lambda: NOW,
    )
    with TestClient(application) as client:
        club = client.get("/api/clubs/66/fixtures").json()
        weeks = client.get("/api/fixtures").json()
        assert len(club["fixtures"]["matches"]) == 3
        assert len(weeks["fixtures"]["matches"]) == 2
        assert club["last_attempt_at"] == weeks["last_attempt_at"]
        assert client.get("/api/clubs/999/fixtures").json()["fixtures"]["matches"] == []
        assert client.get("/api/clubs/0/fixtures").status_code == 422
