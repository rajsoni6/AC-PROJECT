# VerifyVote — Complete Project Documentation

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Cryptographic Functions](#3-cryptographic-functions)
4. [Database Schema](#4-database-schema)
5. [API Reference](#5-api-reference)
6. [Access Control](#6-access-control)
7. [Voting Pipeline](#7-voting-pipeline)
8. [How to Run](#8-how-to-run)
9. [Test Results](#9-test-results)

---

## 1. Project Overview

**VerifyVote** is a cryptographically secure electronic voting system.

| Item        | Technology |
|-------------|-----------|
| Frontend    | React (White & Black theme) |
| Backend     | Python FastAPI |
| Database    | PostgreSQL |
| Auth        | JWT (HS256) |
| Access Control | RBAC + ABAC |

### User Roles
| Role | Description |
|------|-------------|
| `voter` | Registers, uploads ID, votes |
| `election_officer` | Verifies voter documents |
| `trustee` | Holds key share for threshold decryption |
| `super_admin` | Creates elections, manages all users |

---

## 2. System Architecture

```
verifyvote/
├── backend/
│   ├── main.py                     Entry point — wires routes only
│   ├── app/
│   │   ├── crypto/                 ALL crypto logic (imported by routes)
│   │   │   ├── crypto_hashing.py   Argon2id, SHA-256, HMAC-SHA-256
│   │   │   ├── crypto_symmetric.py AES-256-GCM, KEK/DEK wrapping
│   │   │   ├── crypto_signatures.py Ed25519, RSA Blind Signature
│   │   │   ├── crypto_elgamal.py   ElGamal, Shamir, ZKP (Schnorr)
│   │   │   └── crypto_merkle.py    Merkle Tree + inclusion proofs
│   │   ├── api/
│   │   │   ├── auth.py             Register, Login, User management
│   │   │   ├── voter.py            Document upload, QR, Vote casting
│   │   │   ├── officer.py          Voter verification + approval
│   │   │   ├── admin.py            Elections, Tally, Results, Audit
│   │   │   └── public.py           Bulletin board, Merkle proofs
│   │   ├── models/
│   │   │   ├── user.py             User, VoterProfile
│   │   │   └── election.py         Election, Candidate, Ballot, AuditLog
│   │   └── core/
│   │       ├── config.py           Settings from .env
│   │       ├── database.py         Async SQLAlchemy + PostgreSQL
│   │       └── security.py         JWT + RBAC guards
└── frontend/
    └── src/
        ├── pages/
        │   ├── voter/              DocumentUpload, QRCode, Elections, CastVote, Receipt
        │   ├── officer/            Verifications
        │   ├── admin/              Elections, CreateElection, Trustees, Results, Audit, ManageUsers
        │   ├── Dashboard.js
        │   ├── Login.js
        │   ├── Register.js
        │   └── BulletinBoard.js
        └── components/
            ├── Layout.js           Sidebar with SVG icons (no emojis)
            └── ProtectedRoute.js   RBAC route guard
```

---

## 3. Cryptographic Functions

### 3.1 Password Hashing — `crypto_hashing.py`

**Function:** `hash_password(plain: str) -> str`
- Algorithm: **Argon2id** (via passlib), fallback to bcrypt
- Why: Argon2id is memory-hard, resistant to GPU/ASIC attacks
- Usage: Called on every voter/user registration

**Function:** `verify_password(plain: str, hashed: str) -> bool`
- Constant-time comparison to prevent timing attacks

**Function:** `sha256_hex(data: bytes | str) -> str`
- Returns 64-character hex SHA-256 digest
- Used for: document integrity, ballot commitments, audit fingerprints, nullifiers

**Function:** `hmac_sha256(key: bytes, message: bytes | str) -> str`
- Returns HMAC-SHA-256 hex tag
- Used for: audit log authentication (tamper detection)

---

### 3.2 Symmetric Encryption — `crypto_symmetric.py`

**Function:** `aes_gcm_encrypt(key: bytes, plaintext: bytes, aad: bytes) -> dict`
- Algorithm: **AES-256-GCM** (Authenticated Encryption)
- Key size: 256 bits (32 bytes)
- Nonce: 96-bit random (generated per encryption)
- Returns: `{nonce, ciphertext, tag}` — all base64 encoded
- AAD: Additional Authenticated Data (not encrypted, but authenticated)

**Function:** `aes_gcm_decrypt(key, nonce_b64, ciphertext_b64, tag_b64, aad) -> bytes`
- Raises exception if authentication tag fails (tamper detection)

**Function:** `derive_kek(master_secret: bytes, context: str) -> bytes`
- Algorithm: **HKDF-SHA256**
- Derives a 32-byte Key Encryption Key from master secret
- Each voter gets a unique KEK via context string

**Function:** `generate_dek() -> bytes`
- Generates a random 256-bit Data Encryption Key
- Each document gets its own unique DEK

**Function:** `wrap_dek(kek, dek) -> dict` / `unwrap_dek(kek, wrapped) -> bytes`
- Wraps/unwraps DEK using KEK with AES-256-GCM
- Implements KMS (Key Management Service) pattern

**Flow:**
```
Document → AES-256-GCM(DEK) → Encrypted Document
DEK      → AES-256-GCM(KEK) → Wrapped DEK (stored in DB)
KEK      → HKDF(master_key, voter_id) → derived per voter
```

---

### 3.3 Digital Signatures — `crypto_signatures.py`

**Function:** `ed25519_generate_keypair() -> (priv_pem, pub_pem)`
- Algorithm: **Ed25519** (Edwards-curve Digital Signature Algorithm)
- Key size: 256-bit (32 bytes private, 32 bytes public)
- Fast, secure, deterministic

**Function:** `ed25519_sign(private_key_pem, message) -> str`
- Returns base64-encoded 64-byte signature

**Function:** `ed25519_verify(public_key_pem, message, signature_b64) -> bool`
- Returns True only if signature is valid

**Function:** `sign_payload(private_key_pem, payload: dict) -> str`
- Serializes dict to canonical JSON (sorted keys) then signs
- Used for: election config, officer approvals, receipts, results

**Function:** `rsa_blind_sign(private_key_pem, blinded_message) -> bytes`
- RSA Blind Signature for anonymous credential generation
- Officer signs without seeing the actual credential content

**Used in:**
- Officer approval signatures (Step 5)
- QR credential signing (Step 7)
- Election config signature (Step 8)
- Ballot entry signatures (Step 14)
- Vote receipt signatures (Step 15)
- Result publication signatures (Step 20)
- Audit log signatures (Step 21)

---

### 3.4 ElGamal + Shamir + ZKP — `crypto_elgamal.py`

**Function:** `elgamal_keygen() -> {public, private}`
- Group: 2048-bit MODP Group (RFC 3526)
- Public key: `h = g^x mod p`
- Private key: `x` (random in [2, q-1])

**Function:** `elgamal_encrypt(m: int, pub) -> (c1, c2)`
- Exponential ElGamal: `c1 = g^r mod p`, `c2 = g^m * h^r mod p`
- Homomorphic: `Enc(m1) * Enc(m2) = Enc(m1 + m2)`
- Used for: encrypting votes (0 or 1 per candidate)

**Function:** `elgamal_decrypt(c1, c2, priv) -> int`
- Decrypts by solving: `g^m = c2 * (c1^x)^-1 mod p`
- Solves discrete log for small m (vote count)

**Function:** `elgamal_add(ct1, ct2, p) -> (c1, c2)`
- Homomorphic addition: multiply ciphertexts component-wise
- Tallies all votes without decrypting individual ballots

**Function:** `shamir_split(secret, n, t) -> [(x, y), ...]`
- Splits secret into `n` shares; any `t` reconstruct it
- Uses random polynomial of degree `t-1` over prime field M521
- Used for: splitting ElGamal private key among trustees

**Function:** `shamir_reconstruct(shares) -> int`
- Lagrange interpolation to reconstruct secret from `t` shares

**Function:** `zkp_prove_vote(m, r, pub) -> proof`
- Chaum-Pedersen ZKP (Schnorr-style)
- Proves vote is valid (0 or 1) without revealing which

**Function:** `zkp_verify_vote(proof, c1, c2, pub) -> bool`
- Verifies the ZKP proof

---

### 3.5 Merkle Tree — `crypto_merkle.py`

**Class:** `MerkleTree(leaves: list[str])`
- Builds a binary Merkle tree from ballot commitments
- Each leaf is SHA-256 hashed
- Duplicate last node if odd count

**Property:** `tree.root -> str`
- SHA-256 root hash of all ballots
- Any tampering changes the root

**Method:** `get_proof(index) -> list[dict]`
- Returns sibling hashes needed to prove inclusion

**Method:** `verify_proof(leaf_data, proof, root) -> bool`
- Verifies a ballot is included in the tree
- Used by voters to verify their vote was counted

---

## 4. Database Schema

### `users` table
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | VARCHAR | Unique, indexed |
| full_name | VARCHAR | Display name |
| password_hash | VARCHAR | Argon2id hash |
| role | ENUM | voter/election_officer/trustee/super_admin |
| is_active | BOOLEAN | Account status |
| public_key_pem | TEXT | Ed25519 public key |

### `voter_profiles` table
| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID | FK to users |
| date_of_birth | VARCHAR | ABAC attribute |
| nationality | VARCHAR | ABAC attribute |
| constituency | VARCHAR | ABAC attribute |
| document_hash | VARCHAR(64) | SHA-256 of original document |
| encrypted_document_* | TEXT | AES-256-GCM encrypted document |
| wrapped_dek | JSON | KEK-wrapped Data Encryption Key |
| verification_status | ENUM | pending/approved/rejected |
| officer_signature | TEXT | Ed25519 approval signature |
| credential_nullifier | VARCHAR(64) | SHA-256 nullifier |
| qr_code_data | TEXT | Base64 QR image + metadata |

### `elections` table
| Column | Type | Description |
|--------|------|-------------|
| title | VARCHAR | Election name |
| status | ENUM | draft/published/open/closed/tallying/completed |
| eligibility_policy | JSON | ABAC rules {nationality, min_age, constituency} |
| elgamal_public_key | JSON | {p, g, q, h} as strings |
| trustee_shares | JSON | Shamir shares per trustee |
| threshold | INT | Minimum trustees for decryption |
| config_signature | TEXT | Ed25519 signature of election config |
| final_result | JSON | Tally results per candidate |
| result_signature | TEXT | Ed25519 signature of results |
| final_snapshot_hash | VARCHAR(64) | SHA-256 of all ballot commitments |

### `ballots` table
| Column | Type | Description |
|--------|------|-------------|
| election_id | UUID | FK to elections |
| nullifier | VARCHAR(64) | SHA-256 — prevents double voting |
| encrypted_votes | JSON | [{candidate_id, c1, c2}] ElGamal ciphertexts |
| commitment | VARCHAR(64) | SHA-256 of encrypted votes |
| merkle_index | INT | Position in Merkle tree |

### `bulletin_board` table
| Column | Type | Description |
|--------|------|-------------|
| ballot_id | UUID | FK to ballots |
| commitment | VARCHAR(64) | SHA-256 ballot commitment |
| merkle_root | VARCHAR(64) | Current Merkle root |
| entry_signature | TEXT | Ed25519 signed entry |

### `audit_logs` table
| Column | Type | Description |
|--------|------|-------------|
| action | VARCHAR | Event type |
| evidence_hash | VARCHAR(64) | SHA-256 of event data |
| hmac_tag | VARCHAR(64) | HMAC-SHA-256 authentication tag |
| signature | TEXT | Ed25519 signature |

---

## 5. API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register voter |
| POST | `/api/v1/auth/login` | Login, get JWT |
| GET  | `/api/v1/auth/me` | Current user info |
| POST | `/api/v1/auth/admin/add-user` | Admin: add officer/trustee |
| GET  | `/api/v1/auth/admin/users` | Admin: list all users |
| PATCH| `/api/v1/auth/admin/users/{id}/toggle` | Admin: enable/disable user |

### Voter
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/voter/upload-document` | Upload ID (AES-256-GCM) |
| GET  | `/api/v1/voter/qrcode` | Get anonymous QR credential |
| GET  | `/api/v1/voter/elections` | List eligible elections (ABAC) |
| GET  | `/api/v1/voter/elections/{id}` | Election details + candidates |
| POST | `/api/v1/voter/vote/{election_id}` | Cast encrypted vote |
| GET  | `/api/v1/voter/receipts` | My vote receipts |

### Officer
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/v1/officer/pending-verifications` | List voters by status |
| POST | `/api/v1/officer/verify/{voter_id}` | Approve or reject voter |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/admin/elections` | Create election (ElGamal + Shamir) |
| GET  | `/api/v1/admin/elections` | List all elections |
| POST | `/api/v1/admin/elections/{id}/publish` | Publish election |
| POST | `/api/v1/admin/elections/{id}/open` | Open voting |
| POST | `/api/v1/admin/elections/{id}/close` | Close + snapshot hash |
| GET  | `/api/v1/admin/elections/{id}/shares` | Trustee key shares |
| POST | `/api/v1/admin/elections/{id}/tally` | Threshold tally |
| GET  | `/api/v1/admin/elections/{id}/result` | Get result |
| POST | `/api/v1/admin/elections/{id}/publish-result` | Publish result |
| GET  | `/api/v1/admin/audit` | Audit log |

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/v1/public/elections` | Public election list |
| GET  | `/api/v1/public/bulletin/{election_id}` | Bulletin board + Merkle root |
| POST | `/api/v1/public/bulletin/{election_id}/verify` | Verify ballot inclusion |

---

## 6. Access Control

### RBAC (Role-Based Access Control)
Enforced via JWT token role claim + FastAPI dependencies:

```python
require_admin   -> super_admin only
require_officer -> election_officer + super_admin
require_trustee -> trustee + super_admin
require_voter   -> voter only
```

### ABAC (Attribute-Based Access Control)
Voter eligibility for elections is checked against policy:

```json
{
  "nationality": "Indian",
  "min_age": 18,
  "constituency": "North Delhi"
}
```

Voter profile attributes checked:
- `nationality` must match (if policy set)
- `date_of_birth` must satisfy minimum age
- `constituency` must match (if policy set)
- Empty policy field = any value accepted

---

## 7. Voting Pipeline

```
Step 1:  VOTER REGISTRATION
         -> Argon2id password hash
         -> Ed25519 keypair generated
         -> JWT issued

Step 2:  DOCUMENT UPLOAD
         -> SHA-256 integrity fingerprint
         -> AES-256-GCM encryption with unique DEK
         -> DEK wrapped with KEK (HKDF-derived)
         -> Stored encrypted in PostgreSQL

Step 3:  SECURE STORAGE
         -> AES-256-GCM ciphertext in DB
         -> Wrapped DEK in DB (never plaintext)

Step 4:  OFFICER VERIFICATION
         -> Officer decrypts document (AES-256-GCM)
         -> Reviews voter identity

Step 5:  ELIGIBILITY APPROVAL
         -> SHA-256 audit fingerprint
         -> Ed25519 officer signature on approval payload

Step 6:  ANONYMOUS CREDENTIAL
         -> RSA Blind Signature (officer signs without seeing content)
         -> ZKP eligibility proof
         -> SHA-256 nullifier generated

Step 7:  QR CODE
         -> Ed25519 signed credential token
         -> Base64 encoded QR image

Step 8:  ELECTION CREATION
         -> ElGamal keygen (2048-bit MODP group)
         -> Ed25519 signs election configuration
         -> Shamir splits private key x into (3-of-5) shares

Step 9:  TRUSTEE DISTRIBUTION
         -> Each trustee receives one Shamir share
         -> No single trustee can decrypt alone

Step 10: VOTER LOGIN + QR VERIFY
         -> Password verified (Argon2id)
         -> Ed25519 QR credential verified
         -> ZKP eligibility check

Step 11: CANDIDATE SELECTION
         -> RBAC: voter role required
         -> ABAC: eligibility policy checked

Step 12: BALLOT ENCRYPTION
         -> Exponential ElGamal per candidate (1=selected, 0=others)
         -> ZKP proves vote is 0 or 1 (Schnorr)
         -> SHA-256 ballot commitment

Step 13: BALLOT SUBMISSION
         -> TLS 1.3 transport
         -> SHA-256 nullifier checked (double-vote prevention)
         -> PostgreSQL atomic transaction

Step 14: BULLETIN BOARD
         -> SHA-256 commitment posted
         -> Merkle tree rebuilt with new ballot
         -> Ed25519 signed bulletin entry

Step 15: VOTER RECEIPT
         -> Ed25519 signed receipt
         -> SHA-256 commitment for self-verification

Step 16: ELECTION CLOSING
         -> SHA-256 final snapshot hash of all commitments
         -> Ed25519 snapshot signature

Step 17: TRUSTEE APPROVAL
         -> 3-of-5 trustees approve
         -> Ed25519 trustee signatures

Step 18: HOMOMORPHIC TALLY
         -> ElGamal ciphertexts multiplied (homomorphic addition)
         -> No individual vote decrypted
         -> ZKP tally verification

Step 19: THRESHOLD DECRYPTION
         -> Shamir reconstruct private key x from 3 shares
         -> Lagrange interpolation over M521 prime field
         -> ElGamal decrypt the tally sum

Step 20: RESULT PUBLICATION
         -> Ed25519 signs final result
         -> SHA-256 result integrity hash
         -> PKI: public key available for verification

Step 21: AUDIT & FORENSICS
         -> SHA-256 evidence hash per event
         -> HMAC-SHA-256 log authentication
         -> Ed25519 signatures on all log entries
```

---

## 8. How to Run

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 19

### Step 1: Database Setup
```sql
-- In pgAdmin 4 Query Tool:
CREATE DATABASE verifyvote;
```

### Step 2: Backend Setup
```cmd
cd verifyvote\backend

# Install dependencies
pip install -r requirements.txt

# Create tables + seed Super Admin
python create_tables.py
python seed_admin.py

# Start server
python -m uvicorn main:app --reload --port 8000
```

### Step 3: Frontend Setup
```cmd
cd verifyvote\frontend
npm install
npm start
```

### Step 4: Access
| URL | Description |
|-----|-------------|
| http://localhost:3000 | Frontend application |
| http://localhost:8000/docs | Swagger API documentation |
| http://localhost:8000/redoc | ReDoc API documentation |

### Default Credentials
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@verifyvote.com | Admin@1234 |
| Voter | Register at /register | Your choice |

---

## 9. Test Results

### Cryptographic Function Tests
Run: `python crypto_verify.py`

```
==================================================
  VerifyVote Cryptography Test Results
==================================================
  PASS  Argon2id Password Hashing
  PASS  SHA-256 Hash Function
  PASS  HMAC-SHA-256
  PASS  AES-256-GCM Encrypt/Decrypt
  PASS  KEK/DEK Key Wrapping (KMS)
  PASS  Ed25519 Digital Signature
  PASS  Ed25519 Payload Sign/Verify
  PASS  ElGamal Encrypt/Decrypt
  PASS  Homomorphic Addition (ElGamal)
  PASS  Shamir (3-of-5) Secret Sharing
  PASS  Merkle Tree + Inclusion Proof
==================================================
  11/11 tests passed
==================================================
```

### Frontend Build
```
Compiled successfully.
119.95 kB (gzip) — zero warnings
```

### Database Tables Created
```
audit_logs, ballots, bulletin_board,
candidates, elections, users, voter_profiles
```
