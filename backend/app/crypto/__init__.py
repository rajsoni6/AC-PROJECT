"""
__init__.py — Crypto package exports
All cryptographic logic lives here; main.py imports from this package.
"""
from .crypto_hashing import hash_password, verify_password, sha256_hex, sha256_bytes, hmac_sha256
from .crypto_symmetric import aes_gcm_encrypt, aes_gcm_decrypt, derive_kek, generate_dek, wrap_dek, unwrap_dek
from .crypto_signatures import (
    ed25519_generate_keypair, ed25519_sign, ed25519_verify,
    sign_payload, verify_payload,
    rsa_blind_keygen, rsa_blind_sign, rsa_blind_unblind
)
from .crypto_elgamal import (
    elgamal_keygen, elgamal_encrypt, elgamal_add, elgamal_decrypt,
    shamir_split, shamir_reconstruct,
    zkp_prove_vote, zkp_verify_vote
)
from .crypto_merkle import MerkleTree
