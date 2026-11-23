"""
crypto_hashing.py
=================
Password hashing and integrity fingerprinting.

Syllabus: Unit II — Hash Functions, MAC
"""
import hashlib
import hmac
import os

from passlib.context import CryptContext

# ── Argon2id via passlib (best-practice password hashing) ────────────────────
# Falls back to bcrypt if argon2-cffi not installed
try:
    pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
except Exception:
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Hash password with Argon2id (or bcrypt fallback)."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against stored hash."""
    return pwd_context.verify(plain, hashed)


# ── SHA-256 integrity fingerprint ────────────────────────────────────────────

def sha256_hex(data: bytes | str) -> str:
    """Return SHA-256 hex digest of data."""
    if isinstance(data, str):
        data = data.encode()
    return hashlib.sha256(data).hexdigest()


def sha256_bytes(data: bytes | str) -> bytes:
    if isinstance(data, str):
        data = data.encode()
    return hashlib.sha256(data).digest()


# ── HMAC-SHA-256 (audit log authentication) ──────────────────────────────────

def hmac_sha256(key: bytes, message: bytes | str) -> str:
    """Compute HMAC-SHA-256; returns hex string."""
    if isinstance(message, str):
        message = message.encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()
