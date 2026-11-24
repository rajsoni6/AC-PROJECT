"""
config.py — Application settings loaded from .env
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/verifyvote"
    SECRET_KEY: str = "change-this-secret"
    # Persistent 32-byte Ed25519 seed as 64 hex characters. Falls back to a
    # key derived from SECRET_KEY for local development.
    SYSTEM_SIGNING_KEY: str | None = None
    # Keep this key outside the database and stable across restarts/backups.
    TRUSTEE_SHARE_ENCRYPTION_KEY: str | None = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    DOCUMENT_ENCRYPTION_KEY: str = "0" * 64  # 32-byte hex

    class Config:
        env_file = ".env"


settings = Settings()
