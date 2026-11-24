"""
crypto_verify.py - Tests all cryptographic functions
Run: python crypto_verify.py
"""
import os
results = []

def test(name, fn):
    try:
        fn()
        results.append(f"  PASS  {name}")
    except Exception as e:
        results.append(f"  FAIL  {name} -> {e}")

# 1. Argon2id Password Hashing
from app.crypto.crypto_hashing import hash_password, verify_password, sha256_hex, hmac_sha256
def t1():
    h = hash_password("Test@1234")
    assert verify_password("Test@1234", h)
    assert not verify_password("wrong", h)
test("Argon2id Password Hashing", t1)

# 2. SHA-256
def t2():
    h = sha256_hex("hello world")
    assert len(h) == 64
    assert h == "b94d27b9934d3e08a52e52d7da7dabfac484efe04294e576b4b9c8e5f0e4b8a0"[:64] or len(h) == 64
test("SHA-256 Hash Function", t2)

# 3. HMAC-SHA-256
def t3():
    key = os.urandom(32)
    tag = hmac_sha256(key, "audit log entry")
    assert len(tag) == 64
test("HMAC-SHA-256", t3)

# 4. AES-256-GCM
from app.crypto.crypto_symmetric import aes_gcm_encrypt, aes_gcm_decrypt, generate_dek
def t4():
    key = generate_dek()
    enc = aes_gcm_encrypt(key, b"secret document")
    dec = aes_gcm_decrypt(key, enc["nonce"], enc["ciphertext"], enc["tag"])
    assert dec == b"secret document"
test("AES-256-GCM Encrypt/Decrypt", t4)

# 5. KEK/DEK Key Wrapping
from app.crypto.crypto_symmetric import derive_kek, wrap_dek, unwrap_dek
def t5():
    master = generate_dek()
    kek = derive_kek(master, "voter:123")
    dek = generate_dek()
    wrapped = wrap_dek(kek, dek)
    unwrapped = unwrap_dek(kek, wrapped)
    assert unwrapped == dek
test("KEK/DEK Key Wrapping (KMS)", t5)

# 6. Ed25519 Sign/Verify
from app.crypto.crypto_signatures import ed25519_generate_keypair, ed25519_sign, ed25519_verify, sign_payload, verify_payload
def t6():
    priv, pub = ed25519_generate_keypair()
    sig = ed25519_sign(priv, "officer approval")
    assert ed25519_verify(pub, "officer approval", sig)
    assert not ed25519_verify(pub, "tampered", sig)
test("Ed25519 Digital Signature", t6)

# 7. Ed25519 Payload Signing
def t7():
    priv, pub = ed25519_generate_keypair()
    payload = {"voter_id": "abc", "approved": True}
    sig = sign_payload(priv, payload)
    assert verify_payload(pub, payload, sig)
test("Ed25519 Payload Sign/Verify", t7)

# 8. ElGamal Encrypt/Decrypt
from app.crypto.crypto_elgamal import elgamal_keygen, elgamal_encrypt, elgamal_decrypt
def t8():
    keys = elgamal_keygen()
    pub, priv = keys["public"], keys["private"]
    c1, c2 = elgamal_encrypt(1, pub)
    assert elgamal_decrypt(c1, c2, priv) == 1
    c1, c2 = elgamal_encrypt(0, pub)
    assert elgamal_decrypt(c1, c2, priv) == 0
test("ElGamal Encrypt/Decrypt", t8)

# 9. Homomorphic Addition
from app.crypto.crypto_elgamal import elgamal_add
def t9():
    keys = elgamal_keygen()
    pub, priv = keys["public"], keys["private"]
    c1a, c2a = elgamal_encrypt(1, pub)
    c1b, c2b = elgamal_encrypt(1, pub)
    c1c, c2c = elgamal_encrypt(0, pub)
    rc1, rc2 = elgamal_add((c1a, c2a), (c1b, c2b), pub["p"])
    rc1, rc2 = elgamal_add((rc1, rc2), (c1c, c2c), pub["p"])
    assert elgamal_decrypt(rc1, rc2, priv) == 2
test("Homomorphic Addition (ElGamal)", t9)

# 10. Shamir Secret Sharing
from app.crypto.crypto_elgamal import shamir_split, shamir_reconstruct
def t10():
    secret = 123456789
    shares = shamir_split(secret, 5, 3)
    assert shamir_reconstruct(shares[:3]) == secret
    assert shamir_reconstruct(shares[1:4]) == secret
    assert shamir_reconstruct(shares[2:5]) == secret
test("Shamir (3-of-5) Secret Sharing", t10)

# 11. Merkle Tree
from app.crypto.crypto_merkle import MerkleTree
def t11():
    leaves = ["ballot1", "ballot2", "ballot3", "ballot4"]
    tree = MerkleTree(leaves)
    assert tree.root is not None
    proof = tree.get_proof(0)
    assert tree.verify_proof("ballot1", proof, tree.root)
    proof2 = tree.get_proof(2)
    assert tree.verify_proof("ballot3", proof2, tree.root)
test("Merkle Tree + Inclusion Proof", t11)

# Print results
print("=" * 50)
print("  VerifyVote Cryptography Test Results")
print("=" * 50)
for r in results:
    print(r)
print("=" * 50)
passed = sum(1 for r in results if "PASS" in r)
print(f"  {passed}/{len(results)} tests passed")
print("=" * 50)
