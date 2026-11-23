"""
security.py — JWT token creation/verification + RBAC dependency
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User, Role

bearer_scheme = HTTPBearer()


def create_access_token(subject: str, role: str, extra: dict = None) -> str:
    payload = {
        "sub": subject,
        "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": datetime.utcnow(),
        **(extra or {})
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str) -> str:
    payload = {
        "sub": subject,
        "type": "refresh",
        "exp": datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


# ── RBAC role guards ──────────────────────────────────────────────────────────

def require_role(*roles: Role):
    """Dependency factory: restrict endpoint to specific roles."""
    async def _check(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in roles]}"
            )
        return current_user
    return _check


# Convenience role dependencies
require_voter = require_role(Role.VOTER)
require_officer = require_role(Role.ELECTION_OFFICER, Role.SUPER_ADMIN)
require_trustee = require_role(Role.TRUSTEE, Role.SUPER_ADMIN)
require_admin = require_role(Role.SUPER_ADMIN)
require_any = require_role(Role.VOTER, Role.ELECTION_OFFICER, Role.TRUSTEE, Role.SUPER_ADMIN)
