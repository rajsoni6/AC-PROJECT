"""
crypto_elgamal.py
=================
Exponential ElGamal encryption for homomorphic vote tallying.
Shamir's Secret Sharing for trustee key distribution.

Syllabus: Unit I — Shamir, Unit II — ElGamal, Unit III — Homomorphic Encryption
"""
import secrets
import hashlib
import hmac
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


def zkp_group_parameters() -> dict:
    """Public group values used by the voter's eligibility proof."""
    return {"p": str(_P), "g": str(_G), "q": str(_Q)}


def derive_eligibility_secret(key: bytes, voter_id: str) -> int:
    """Derive a stable per-voter credential secret from the server signing seed."""
    digest = hmac.new(key, f"verifyvote-eligibility:{voter_id}".encode(), hashlib.sha256).digest()
    return int.from_bytes(digest, "big") % (_Q - 1) + 1


def verify_eligibility_proof(proof: dict, public_key: int, context: str) -> bool:
    """Verify a Schnorr proof of possession for a signed approved credential."""
    try:
        nonce = str(proof["nonce"])
        commitment = int(proof["commitment"])
        response = int(proof["response"])
        p, g, q = _P, _G, _Q
        if len(nonce) != 64 or any(ch not in "0123456789abcdef" for ch in nonce.lower()):
            return False
        if not (0 < commitment < p and 0 <= response < q and 0 < public_key < p):
            return False
        challenge_text = f"eligibility-v1:{context}:{nonce}:{commitment}:{public_key}"
        challenge = int(hashlib.sha256(challenge_text.encode()).hexdigest(), 16) % q
        return pow(g, response, p) == (commitment * pow(public_key, challenge, p)) % p
    except Exception:
        return False


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


def elgamal_encrypt(m: int, pub: dict, return_randomness: bool = False):
    """
    Exponential ElGamal: encrypt vote m ∈ {0,1}.
    Ciphertext = (g^r mod p, g^m * h^r mod p)
    Homomorphic: product of ciphertexts = encryption of sum.
    """
    p, g, q, h = pub["p"], pub["g"], pub["q"], pub["h"]
    r = secrets.randbelow(q - 2) + 2
    c1 = pow(g, r, p)
    c2 = (pow(g, m, p) * pow(h, r, p)) % p
    return (c1, c2, r) if return_randomness else (c1, c2)


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

# ElGamal private exponents are elements of Z_q; use a field large enough to
# preserve the full exponent when splitting/reconstructing it.
_SHAMIR_PRIME = _P


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

def _challenge_q(q: int, message: str) -> int:
    return int(hashlib.sha256(message.encode()).hexdigest(), 16) % q


def zkp_prove_vote(m: int, r: int, pub: dict, c1: int | None = None, c2: int | None = None) -> dict:
    """Fiat-Shamir Chaum-Pedersen OR proof that an ElGamal vote encrypts 0 or 1."""
    if m not in (0, 1):
        raise ValueError("Vote must be 0 or 1")
    p, g, q, h = (int(pub[k]) for k in ("p", "g", "q", "h"))
    c1 = pow(g, r, p) if c1 is None else int(c1)
    c2 = (pow(g, m, p) * pow(h, r, p)) % p if c2 is None else int(c2)
    y1 = c1
    y2 = [c2, (c2 * pow(g, -1, p)) % p]

    fake = 1 - m
    challenges = [0, 0]
    responses = [0, 0]
    commitments = [[0, 0], [0, 0]]
    fake_c = secrets.randbelow(q)
    fake_s = secrets.randbelow(q)
    fake_a = (pow(g, fake_s, p) * pow(y1, fake_c, p)) % p
    fake_b = (pow(h, fake_s, p) * pow(y2[fake], fake_c, p)) % p
    real_w = secrets.randbelow(q)
    real_a = pow(g, real_w, p)
    real_b = pow(h, real_w, p)
    commitments[fake] = [fake_a, fake_b]
    commitments[m] = [real_a, real_b]
    transcript = ":".join(str(v) for pair in commitments for v in pair)
    total_c = _challenge_q(q, f"vote-or:{p}:{g}:{q}:{h}:{c1}:{c2}:{transcript}")
    challenges[fake] = fake_c
    challenges[m] = (total_c - fake_c) % q
    responses[fake] = fake_s
    responses[m] = (real_w - challenges[m] * r) % q
    return {"commitments": commitments, "challenges": challenges, "responses": responses}


def zkp_verify_vote(proof: dict, c1: int, c2: int, pub: dict) -> bool:
    """Verify a zero-knowledge proof that a ciphertext encrypts a bit."""
    try:
        p, g, q, h = (int(pub[k]) for k in ("p", "g", "q", "h"))
        c1, c2 = int(c1), int(c2)
        commitments = [[int(v) for v in pair] for pair in proof["commitments"]]
        challenges = [int(v) for v in proof["challenges"]]
        responses = [int(v) for v in proof["responses"]]
        if len(commitments) != 2 or any(len(pair) != 2 for pair in commitments):
            return False
        if len(challenges) != 2 or len(responses) != 2:
            return False
        transcript = ":".join(str(v) for pair in commitments for v in pair)
        total_c = _challenge_q(q, f"vote-or:{p}:{g}:{q}:{h}:{c1}:{c2}:{transcript}")
        if (sum(challenges) % q) != total_c:
            return False
        y2 = [c2, (c2 * pow(g, -1, p)) % p]
        for bit in (0, 1):
            a, b = commitments[bit]
            c, s = challenges[bit], responses[bit]
            if pow(g, s, p) * pow(c1, c, p) % p != a:
                return False
            if pow(h, s, p) * pow(y2[bit], c, p) % p != b:
                return False
        return True
    except Exception:
        return False


def zkp_prove_encryption_of_one(randomness: int, c1: int, c2: int, pub: dict) -> dict:
    """Prove the homomorphic sum of all candidate ciphertexts encrypts exactly one."""
    p, g, q, h = (int(pub[k]) for k in ("p", "g", "q", "h"))
    y2 = (int(c2) * pow(g, -1, p)) % p
    w = secrets.randbelow(q)
    a, b = pow(g, w, p), pow(h, w, p)
    c = _challenge_q(q, f"one:{p}:{g}:{q}:{h}:{c1}:{c2}:{a}:{b}")
    s = (w - c * int(randomness)) % q
    return {"a": a, "b": b, "c": c, "s": s}


def zkp_verify_encryption_of_one(proof: dict, c1: int, c2: int, pub: dict) -> bool:
    """Verify a Chaum-Pedersen proof that a ciphertext encrypts one."""
    try:
        p, g, q, h = (int(pub[k]) for k in ("p", "g", "q", "h"))
        c1, c2 = int(c1), int(c2)
        a, b, c, s = (int(proof[k]) for k in ("a", "b", "c", "s"))
        if c != _challenge_q(q, f"one:{p}:{g}:{q}:{h}:{c1}:{c2}:{a}:{b}"):
            return False
        y2 = (c2 * pow(g, -1, p)) % p
        return (
            pow(g, s, p) * pow(c1, c, p) % p == a
            and pow(h, s, p) * pow(y2, c, p) % p == b
        )
    except Exception:
        return False
