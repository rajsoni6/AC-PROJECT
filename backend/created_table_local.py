"""Create VerifyVote tables in a local PostgreSQL database.

Run from the backend directory with: python created_table_local.py
The database URL is read from backend/.env (DATABASE_URL).
"""
import asyncio

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.core.database import Base

# Import models so SQLAlchemy registers all tables on Base.metadata.
import app.models.user  # noqa: F401
import app.models.election  # noqa: F401


async def main() -> None:
    database_url = make_url(settings.DATABASE_URL)
    if database_url.host not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError(
            "This script only connects to localhost. Set DATABASE_URL in backend/.env "
            "to your local PostgreSQL database before running it."
        )

    print(f"Creating VerifyVote tables in local database '{database_url.database}'...")
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=True,
        connect_args={"ssl": False},
    )
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        print("Local database tables are ready.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
