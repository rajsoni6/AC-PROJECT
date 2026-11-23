"""
create_tables.py — Create all tables in cloud PostgreSQL
Run: python create_tables.py
"""
import asyncio
import ssl

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.core.database import Base

# Import all models so Base knows about them
import app.models.user      # noqa
import app.models.election  # noqa

# Existing tables to delete
TABLES = [
    "audit_logs",
    "ballots",
    "bulletin_board",
    "voter_profiles",
    "elections",
    "users",
]

async def main():
    print("Connecting to cloud database...")

    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=True,
        connect_args={"ssl": ssl_ctx},
    )

    async with engine.begin() as conn:
        print("\nDeleting existing tables...")

        for table in TABLES:
            await conn.execute(
                text(f'DROP TABLE IF EXISTS public."{table}" CASCADE')
            )
            print(f"Deleted table: {table}")

        print("\nCreating all tables from SQLAlchemy models...")

        await conn.run_sync(Base.metadata.create_all)

        print("\nAll tables created successfully!")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
