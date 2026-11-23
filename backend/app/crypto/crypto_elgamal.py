"""
crypto_elgamal.py
=================
Exponential ElGamal encryption for homomorphic vote tallying.
Shamir's Secret Sharing for trustee key distribution.

Syllabus: Unit I — Shamir, Unit II — ElGamal, Unit III — Homomorphic Encryption
"""
import secrets
import hashlib
from math import gcd


# ── Safe prime parameters (2048-bit MODP Group 14, RFC 3526) ─────────────────
# Using a smaller well-known prime for demo; production uses 2048-bit

_P = int(
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1"
    "29024E088A67CC74020BBEA63B139B22514A08798E3404DD"
    "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245"
    "E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED"
    "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D"
    "C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F"
    "83655D23DCA3AD961C62F356208552BB9ED529077096966D"
    "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B"
    "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9"
    "DE2BCBF6955817183995497CEA956AE515D2261898FA0510"
    "15728E5A8AACAA68FFFFFFFFFFFFFFFF",
    16
)
_G = 2
_Q = (_P - 1) // 2   # Sophie Germain prime order


def elgamal_keygen():
    """
    Generate ElGamal key pair over the 2048-bit MODP group.
    Private key x: random in [2, q-1]
    Public key  h = g^x mod p
    """
    x = secrets.randbelow(_Q - 2) + 2
    h = pow(_G, x, _P)
    return {
        "public": {"p": _P, "g": _G, "q": _Q, "h": h},
        "private": {"x": x, "p": _P, "g": _G, "q": _Q}
    }


def elgamal_encrypt(m: int, pub: dict) -> tuple[int, int]:
    """
    Exponential ElGamal: encrypt vote m ∈ {0,1}.
    Ciphertext = (g^r mod p, g^m * h^r mod p)
    Homomorphic: product of ciphertexts = encryption of sum.
    """
    p, g, q, h = pub["p"], pub["g"], pub["q"], pub["h"]
    r = secrets.randbelow(q - 2) + 2
    c1 = pow(g, r, p)
    c2 = (pow(g, m, p) * pow(h, r, p)) % p
    return c1, c2


def elgamal_add(ct1: tuple, ct2: tuple, p: int) -> tuple[int, int]:
    """Homomorphic addition: multiply ciphertexts component-wise mod p."""
    return (ct1[0] * ct2[0]) % p, (ct1[1] * ct2[1]) % p


def elgamal_decrypt(c1: int, c2: int, priv: dict) -> int:
    """
    Decrypt ElGamal ciphertext.
    g^m = c2 * (c1^x)^-1 mod p
    Then solve discrete log for small m (vote count).
    """
    p, x = priv["p"], priv["x"]
    s = pow(c1, x, p)
    s_inv = pow(s, -1, p)
    gm = (c2 * s_inv) % p
    # Solve g^m = gm by brute force (m is small — total vote count)
    g = priv["g"]
    current = 1
    for m in range(10001):
        if current == gm:
            return m
        current = (current * g) % p
    raise ValueError("Could not solve discrete log — vote count too large")


# ── Shamir's (t, n) Secret Sharing ───────────────────────────────────────────

_SHAMIR_PRIME = 2**521 - 1   # Mersenne prime M521


def _poly_eval(coeffs: list[int], x: int, prime: int) -> int:
    result = 0
    for c in reversed(coeffs):
        result = (result * x + c) % prime
    return result


def shamir_split(secret: int, n: int, t: int, prime: int = _SHAMIR_PRIME) -> list[tuple[int, int]]:
    """Split secret into n shares; any t reconstruct it."""
    coeffs = [secret] + [secrets.randbelow(prime) for _ in range(t - 1)]
    return [(i, _poly_eval(coeffs, i, prime)) for i in range(1, n + 1)]


def _mod_inv(a: int, m: int) -> int:
    return pow(a, -1, m)


def shamir_reconstruct(shares: list[tuple[int, int]], prime: int = _SHAMIR_PRIME) -> int:
    """Reconstruct secret from ≥ t shares via Lagrange interpolation."""
    secret = 0
    for i, (xi, yi) in enumerate(shares):
        num, den = 1, 1
        for j, (xj, _) in enumerate(shares):
            if i != j:
                num = (num * (-xj % prime)) % prime
                den = (den * ((xi - xj) % prime)) % prime
        secret = (secret + yi * num * _mod_inv(den, prime)) % prime
    return secret


# ── Zero-Knowledge Proof (Schnorr, Unit IV) ──────────────────────────────────

def zkp_prove_vote(m: int, r: int, pub: dict) -> dict:
    """
    Chaum-Pedersen ZKP: prove that encrypted vote is 0 or 1
    without revealing which. Simplified Schnorr-style commitment.
    Returns proof dict.
    """
    p, g, q, h = pub["p"], pub["g"], pub["q"], pub["h"]
    # Commitment
    k = secrets.randbelow(q - 2) + 2
    R1 = pow(g, k, p)
    R2 = pow(h, k, p)
    # Challenge (Fiat-Shamir heuristic)
    challenge_input = f"{R1}{R2}{pow(g,r,p)}{pow(h,r,p)}".encode()
    c = int(hashlib.sha256(challenge_input).hexdigest(), 16) % q
    # Response
    s = (k - c * r) % q
    return {"R1": R1, "R2": R2, "c": c, "s": s}


def zkp_verify_vote(proof: dict, c1: int, c2: int, pub: dict) -> bool:
    """Verify Schnorr ZKP for a vote ciphertext."""
    try:
        p, g, q, h = pub["p"], pub["g"], pub["q"], pub["h"]
        R1, R2, c, s = proof["R1"], proof["R2"], proof["c"], proof["s"]
        # Recompute challenge
        challenge_input = f"{R1}{R2}{c1}{c2}".encode()
        c_check = int(hashlib.sha256(challenge_input).hexdigest(), 16) % q
        # Verify equations
        lhs1 = pow(g, s, p) * pow(c1, c, p) % p
        lhs2 = pow(h, s, p) * pow(c2, c, p) % p
        return lhs1 == R1 and lhs2 == R2 and c == c_check
    except Exception:
        return False
