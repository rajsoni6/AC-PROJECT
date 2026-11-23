# VerifyVote — Secure Electronic Voting System

Full-stack cryptographic e-voting system.
**Frontend:** React (black & white theme) | **Backend:** FastAPI (Python) | **DB:** PostgreSQL

---

## Cryptographic Pipeline

| Step | Operation | Crypto Used |
|------|-----------|-------------|
| 1 | Voter Registration | Argon2id password hashing, Ed25519 keygen |
| 2–3 | Document Upload & Storage | AES-256-GCM, SHA-256, KEK/DEK (KMS pattern) |
| 4–5 | Officer Verification | AES-256-GCM decrypt, Ed25519 approval signature |
| 6 | Anonymous Credential | RSA Blind Signature, ZKP, SHA-256 nullifier |
| 7 | QR Code | Ed25519 signed token, secure encoding |
| 8 | Election Creation | ElGamal keygen, Ed25519 config signature |
| 9 | Trustee Key Distribution | Shamir (3-of-5) Secret Sharing |
| 10 | Voter Login & QR Verify | Ed25519 verify, ZKP eligibility |
| 11 | Candidate Selection | RBAC + ABAC policy check |
| 12–13 | Ballot Encryption & Submit | Exponential ElGamal, ZKP, SHA-256, nullifier, atomic TX |
| 14 | Bulletin Board | SHA-256 commitments, Merkle Tree, Ed25519 |
| 15 | Voter Receipt | Ed25519 signed, SHA-256 commitment |
| 16 | Election Closing | SHA-256 snapshot hash, Ed25519 |
| 17 | Trustee Approval | Shamir reconstruct, Ed25519, 3-of-5 |
| 18–19 | Homomorphic Tally | Exponential ElGamal, ZKP tally proof |
| 20 | Result Publication | Ed25519, SHA-256, PKI |
| 21 | Audit & Forensics | SHA-256, HMAC-SHA-256, Ed25519 |

---

## Project Structure

```
verifyvote/
├── backend/
│   ├── main.py                        ← FastAPI entry point
│   ├── requirements.txt
│   ├── .env
│   └── app/
│       ├── crypto/                    ← ALL crypto logic (imported by API routes)
│       │   ├── crypto_hashing.py      — Argon2id, SHA-256, HMAC-SHA-256
│       │   ├── crypto_symmetric.py    — AES-256-GCM, KEK/DEK
│       │   ├── crypto_signatures.py   — Ed25519, RSA Blind Signature
│       │   ├── crypto_elgamal.py      — ElGamal, Shamir, ZKP (Schnorr)
│       │   └── crypto_merkle.py       — Merkle Tree
│       ├── api/
│       │   ├── auth.py                — Register, Login, JWT
│       │   ├── voter.py               — Document upload, QR, vote casting
│       │   ├── officer.py             — Voter verification, approval
│       │   ├── admin.py               — Elections, tally, results, audit
│       │   └── public.py              — Bulletin board, Merkle proofs
│       ├── models/
│       │   ├── user.py                — User, VoterProfile (RBAC roles)
│       │   └── election.py            — Election, Candidate, Ballot, BulletinEntry, AuditLog
│       ├── schemas/
│       │   └── auth.py
│       └── core/
│           ├── config.py
│           ├── database.py            — Async SQLAlchemy + PostgreSQL
│           └── security.py            — JWT, RBAC guards
└── frontend/
    └── src/
        ├── App.js                     ← Router with all role-based routes
        ├── api/index.js               ← Axios client
        ├── context/AuthContext.js     ← Auth state
        ├── components/
        │   ├── Layout.js              ← Sidebar with role-based nav
        │   └── ProtectedRoute.js      ← RBAC route guard
        └── pages/
            ├── Register.js / Login.js
            ├── Dashboard.js
            ├── BulletinBoard.js       ← Public Merkle verification
            ├── voter/
            │   ├── DocumentUpload.js  ← AES-256-GCM upload
            │   ├── QRCode.js          ← Blind signature credential
            │   ├── Elections.js       ← ABAC eligibility
            │   ├── CastVote.js        ← ElGamal + ZKP + nullifier
            │   └── Receipt.js         ← Ed25519 signed receipt
            ├── officer/
            │   └── Verifications.js   ← Approve/reject + Ed25519 sign
            └── admin/
                ├── Elections.js
                ├── CreateElection.js  ← ElGamal + Shamir + Ed25519
                ├── Trustees.js        ← Shamir threshold approval
                ├── Results.js         ← Homomorphic tally + publish
                └── Audit.js           ← SHA-256 + HMAC + Ed25519 log
```

---

## Setup & Run

### 1. PostgreSQL
```sql
CREATE DATABASE verifyvote;
```

### 2. Backend
```bash
cd backend

# Edit .env — set DATABASE_URL and generate a SECRET_KEY
# DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/verifyvote
# SECRET_KEY=your-very-long-random-secret

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### 3. Frontend
```bash
cd frontend
npm install
npm start
```
App: http://localhost:3000

---

## Roles (RBAC)

| Role | Access |
|------|--------|
| `voter` | Register, upload docs, get QR, vote, view receipt |
| `election_officer` | Verify voter documents, sign approvals |
| `trustee` | View key shares, approve tally decryption |
| `super_admin` | All of the above + create elections, tally, publish results, audit |

## ABAC Policy (Voter → Election)

Each election has an eligibility policy:
```json
{ "nationality": "Indian", "min_age": 18, "constituency": "North Delhi" }
```
Voters are checked against their profile attributes before being allowed to vote.
