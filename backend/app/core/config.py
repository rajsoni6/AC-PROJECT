"""
config.py — Application settings loaded from .env
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/verifyvote"
    SECRET_KEY: str = "change-this-secret"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    DOCUMENT_ENCRYPTION_KEY: str = "0" * 64  # 32-byte hex

    class Config:
        env_file = ".env"


settings = Settings()
