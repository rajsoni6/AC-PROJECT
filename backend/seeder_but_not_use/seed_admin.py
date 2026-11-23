"""
seed_admin.py — Creates the default Super Admin account
Run once: python seed_admin.py
"""
import asyncio
import app.models.user
import app.models.election
from app.core.database import engine, Base
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select
from app.models.user import User, Role
from app.crypto import hash_password, ed25519_generate_keypair

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

ADMIN_EMAIL    = "admin@verifyvote.com"
ADMIN_PASSWORD = "Admin@1234"
ADMIN_NAME     = "Super Admin"


async def seed():
    # Create tables if not exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Check if admin already exists
        r = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        existing = r.scalar_one_or_none()

        if existing:
            with open("seed_result.txt", "w") as f:
                f.write(f"Super Admin already exists!\n")
                f.write(f"Email    : {ADMIN_EMAIL}\n")
                f.write(f"Password : {ADMIN_PASSWORD}\n")
                f.write(f"Role     : super_admin\n")
            return

        _, pub_pem = ed25519_generate_keypair()
        admin = User(
            email=ADMIN_EMAIL,
            full_name=ADMIN_NAME,
            password_hash=hash_password(ADMIN_PASSWORD),
            role=Role.SUPER_ADMIN,
            public_key_pem=pub_pem,
            is_active=True,
        )
        db.add(admin)
        await db.commit()

    with open("seed_result.txt", "w") as f:
        f.write("Super Admin created successfully!\n")
        f.write(f"Email    : {ADMIN_EMAIL}\n")
        f.write(f"Password : {ADMIN_PASSWORD}\n")
        f.write(f"Role     : super_admin\n")
        f.write(f"\nLogin at: http://localhost:3000/login\n")

    await engine.dispose()


asyncio.run(seed())
