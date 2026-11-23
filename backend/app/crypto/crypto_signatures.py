"""
crypto_signatures.py
====================
Ed25519 digital signatures for officers, voters, receipts, results.
RSA blind signature stub for anonymous credential flow.

Syllabus: Unit II — Digital Signatures, Unit IV — Blind Signature
"""
import base64
import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey, Ed25519PublicKey
)
from cryptography.hazmat.primitives import serialization
from cryptography.exceptions import InvalidSignature


# ── Ed25519 Key Generation ────────────────────────────────────────────────────

def ed25519_generate_keypair() -> tuple[str, str]:
    """
    Generate Ed25519 key pair.
    Returns (private_key_pem, public_key_pem) as PEM strings.
    """
    private_key = Ed25519PrivateKey.generate()
    priv_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()
    ).decode()
    pub_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode()
    return priv_pem, pub_pem


def ed25519_sign(private_key_pem: str, message: bytes | str) -> str:
    """Sign message with Ed25519 private key. Returns base64 signature."""
    if isinstance(message, str):
        message = message.encode()
    priv = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
    sig = priv.sign(message)
    return base64.b64encode(sig).decode()


def ed25519_verify(public_key_pem: str, message: bytes | str, signature_b64: str) -> bool:
    """Verify Ed25519 signature. Returns True if valid."""
    if isinstance(message, str):
        message = message.encode()
    try:
        pub = serialization.load_pem_public_key(public_key_pem.encode())
        sig = base64.b64decode(signature_b64)
        pub.verify(sig, message)
        return True
    except (InvalidSignature, Exception):
        return False


def sign_payload(private_key_pem: str, payload: dict) -> str:
    """Serialize dict to canonical JSON and sign with Ed25519."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return ed25519_sign(private_key_pem, canonical)


def verify_payload(public_key_pem: str, payload: dict, signature_b64: str) -> bool:
    """Verify a signed dict payload."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return ed25519_verify(public_key_pem, canonical, signature_b64)


# ── RSA Blind Signature (Unit IV) ────────────────────────────────────────────
# Used in anonymous credential generation (Part 3)

from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes as _hashes
from cryptography.hazmat.backends import default_backend
import os


def rsa_blind_keygen(bits: int = 2048):
    """Generate RSA key pair for blind signature scheme."""
    priv = rsa.generate_private_key(65537, bits, default_backend())
    priv_pem = priv.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()
    ).decode()
    pub_pem = priv.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode()
    return priv_pem, pub_pem


def rsa_blind_sign(private_key_pem: str, blinded_message: bytes) -> bytes:
    """
    Officer signs a blinded message (voter's credential request).
    Returns raw signature bytes.
    """
    priv = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
    # RSA raw signing: m^d mod n
    n = priv.private_numbers().public_numbers.n
    d = priv.private_numbers().d
    m_int = int.from_bytes(blinded_message, "big")
    sig_int = pow(m_int, d, n)
    byte_len = (n.bit_length() + 7) // 8
    return sig_int.to_bytes(byte_len, "big")


def rsa_blind_unblind(blinded_sig: bytes, r: int, n: int) -> bytes:
    """Voter unblinds the signature: sig = blinded_sig / r mod n."""
    sig_int = int.from_bytes(blinded_sig, "big")
    r_inv = pow(r, -1, n)
    unblinded = (sig_int * r_inv) % n
    byte_len = (n.bit_length() + 7) // 8
    return unblinded.to_bytes(byte_len, "big")
