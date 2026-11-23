"""
crypto_symmetric.py
===================
AES-256-GCM authenticated encryption for document storage.
Key Encryption Key (KEK) wrapping for KMS-style key management.

Syllabus: Unit II — AES, Unit III — Access Control
"""
import os
import base64

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend


# ── AES-256-GCM ──────────────────────────────────────────────────────────────

def aes_gcm_encrypt(key: bytes, plaintext: bytes, aad: bytes = b"") -> dict:
    """
    Encrypt plaintext with AES-256-GCM.
    Returns dict with base64-encoded nonce, ciphertext, tag.
    aad = Additional Authenticated Data (not encrypted, but authenticated).
    """
    assert len(key) == 32, "Key must be 32 bytes for AES-256"
    nonce = os.urandom(12)          # 96-bit nonce (GCM standard)
    aesgcm = AESGCM(key)
    # AESGCM.encrypt appends the 16-byte tag to ciphertext
    ct_with_tag = aesgcm.encrypt(nonce, plaintext, aad or None)
    return {
        "nonce": base64.b64encode(nonce).decode(),
        "ciphertext": base64.b64encode(ct_with_tag[:-16]).decode(),
        "tag": base64.b64encode(ct_with_tag[-16:]).decode(),
    }


def aes_gcm_decrypt(key: bytes, nonce_b64: str, ciphertext_b64: str, tag_b64: str, aad: bytes = b"") -> bytes:
    """Decrypt AES-256-GCM ciphertext. Raises on authentication failure."""
    nonce = base64.b64decode(nonce_b64)
    ct = base64.b64decode(ciphertext_b64)
    tag = base64.b64decode(tag_b64)
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct + tag, aad or None)


# ── Key Encryption Key (KEK) wrapping ────────────────────────────────────────

def derive_kek(master_secret: bytes, context: str) -> bytes:
    """
    Derive a 32-byte Key Encryption Key from master secret using HKDF-SHA256.
    Each document gets a unique DEK; the DEK is wrapped with the KEK.
    """
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=context.encode(),
        backend=default_backend()
    )
    return hkdf.derive(master_secret)


def generate_dek() -> bytes:
    """Generate a random 256-bit Data Encryption Key."""
    return os.urandom(32)


def wrap_dek(kek: bytes, dek: bytes) -> dict:
    """Wrap (encrypt) a DEK with the KEK using AES-256-GCM."""
    return aes_gcm_encrypt(kek, dek)


def unwrap_dek(kek: bytes, wrapped: dict) -> bytes:
    """Unwrap (decrypt) a DEK using the KEK."""
    return aes_gcm_decrypt(kek, wrapped["nonce"], wrapped["ciphertext"], wrapped["tag"])
