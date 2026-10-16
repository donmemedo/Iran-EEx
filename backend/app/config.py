"""Application settings, loaded from the environment."""
from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The placeholder that shipped in earlier versions of .env.example and compose. A
# deployment still using it signs tokens anyone can forge. (Shorter guesses fail the
# 32-character check anyway.)
KNOWN_WEAK_SECRET = "change-me-in-production-eex-iran"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    project_name: str = "EEx Iran API"
    api_prefix: str = "/api/v1"
    # "production" is the safe default: strict secret check and no API docs.
    environment: Literal["development", "production"] = "production"
    # SQLite by default so the API runs with zero infrastructure; compose overrides it.
    database_url: str = "sqlite:///./eex.db"
    jwt_secret: str = ""
    access_token_expire_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Demo data and the demo users (with a published password) are opt-in.
    seed_on_startup: bool = False
    # bcrypt work factor. Tests lower it; production keeps the library default.
    bcrypt_rounds: int = 12
    # Largest request body the API accepts. Every endpoint takes small JSON.
    max_body_bytes: int = 64 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @model_validator(mode="after")
    def _require_strong_secret(self) -> "Settings":
        weak = self.jwt_secret == KNOWN_WEAK_SECRET or len(self.jwt_secret) < 32
        if weak and not self.is_development:
            raise ValueError(
                "JWT_SECRET must be a random value of at least 32 characters "
                "(generate one with: openssl rand -hex 32). "
                "Set ENVIRONMENT=development to run locally without one."
            )
        if weak:
            # Development only: a per-process secret, so a weak value can never leak
            # into tokens. Tokens stop working on restart, which is fine locally.
            import secrets

            self.jwt_secret = secrets.token_hex(32)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
