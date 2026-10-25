"""
Load and validate configuration for backend integrations and behavior.

`Settings` is the single source for environment-backed values, including the
football-data.org credential and request settings. FastAPI dependencies obtain
the cached settings instance through `get_settings`, while tests can construct
independent settings directly. Pydantic Settings parses environment variables
and the gitignored local `.env` file, then validates them before route or
provider code consumes them. This keeps configuration parsing consistent and
lets credential fields use a redacting secret type.
"""

from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Validated backend settings loaded from environment or local `.env`.

    Attributes:
        football_data_token: Optional server-side API credential. `SecretStr` redacts the value.
        football_data_base_url: HTTPS root URL for the football-data.org v4 API.
        football_data_timeout_seconds: Positive upper-bounded timeout for each provider request.
        favorite_team_id: Optional positive provider team identifier selected for favorite-team behavior in a later application milestone.
        database_path: Local SQLite database path for durable refresh state.
        standings_refresh_interval_seconds: Quiet-period interval for standings.
        standings_failure_retry_seconds: Minimum wait before retrying a failed standings refresh; provider Retry-After can extend this wait.
    """

    # The token is optional locally; the provider adapter reports its absence on use.
    football_data_token: SecretStr | None = Field(
        default=None,
        description="Optional football-data.org credential kept on the server.",
    )

    # Require TLS and keep credentials out of URL strings and query parameters.
    football_data_base_url: str = Field(
        default="https://api.football-data.org/v4",
        description="HTTPS root URL for the football-data.org v4 API.",
    )

    # Keep an upstream stall from holding a request indefinitely.
    football_data_timeout_seconds: float = Field(
        default=10.0,
        gt=0,
        le=60,
        description="Per-request provider timeout in seconds; must be greater than 0 and at most 60.",
    )

    # This remains unset until the favorite team is configured by the user.
    favorite_team_id: int | None = Field(
        default=None,
        gt=0,
        description="Optional positive provider team ID used for favorite-team behavior.",
    )

    # Keep dashboard state local to the backend project and outside version control.
    database_path: str = Field(
        default="data/epl-dashboard.sqlite3",
        description="Path to the local SQLite database used for durable dashboard state.",
    )

    # Quiet-period default approved for standings; activity windows are added with fixtures.
    standings_refresh_interval_seconds: int = Field(
        default=43_200,
        gt=0,
        description="Seconds between successful standings refreshes during quiet periods.",
    )

    # A configurable recovery default; Retry-After always takes precedence when longer.
    standings_failure_retry_seconds: int = Field(
        default=900,
        gt=0,
        description="Minimum delay before another standings attempt after a refresh failure.",
    )

    # Read one local development file; deployed environments use variables.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("football_data_base_url")
    @classmethod
    def validate_provider_base_url(cls, value: str) -> str:
        """
        Require a credential-free HTTPS provider URL without query data.

        Args:
            value: Configured provider API root URL.

        Returns:
            The URL without trailing slashes, ready for endpoint construction.

        Notes:
            Provider credentials belong in the authentication header, never in
            URL user information or query parameters.
        """
        parsed_url = urlsplit(value)

        if parsed_url.scheme != "https" or not parsed_url.netloc:
            raise ValueError("football_data_base_url must be an HTTPS URL")

        if (
            parsed_url.username is not None
            or parsed_url.password is not None
            or parsed_url.query
            or parsed_url.fragment
        ):
            raise ValueError("football_data_base_url must not include credentials or query data")
        return value.rstrip("/")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return the cached settings instance used by the running process.

    Returns:
        Validated configuration loaded from the environment and optional local
        `.env` file on the first call.

    Notes:
        The cache gives dependencies in one process a consistent configuration.
        Tests that change environment values should clear the cache first.
    """
    return Settings()
