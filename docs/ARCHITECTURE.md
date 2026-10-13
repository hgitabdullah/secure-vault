# Architecture

## 1. Big picture

```
┌──────────────────────────── Browser ────────────────────────────┐
│ React app (Vite)                                                │
│  • Web Crypto (AES-256-GCM) + hash-wasm (Argon2id)              │
│  • Master key lives ONLY in memory (Zustand store)              │
│  • Encrypts names + 8 MiB file chunks before they leave         │
└───────┬──────────────────────────────────────────┬──────────────┘
        │ HTTPS JSON  (Bearer access JWT)           │ encrypted chunks
        ▼                                           ▼
┌──────────────────────┐                ┌──────────────────────────┐
│ Express API (Node 20)│  pre-signed    │ Object storage           │
│ helmet, CORS, zod,   │──── URLs ─────▶│ local disk (dev) or      │
│ rate-limit, Prisma   │                │ S3 / Cloudflare R2       │
└─────────┬────────────┘                └──────────────────────────┘
          │ Prisma (MongoDB connector, replica set)
          ▼
┌──────────────────────┐
│ MongoDB (Atlas)      │  users, sessions, folders, files,
│                      │  versions, shares, activity
└──────────────────────┘
```

- **Client** (`client/`): UI, key derivation, encryption/decryption, chunked upload/download.
- **API** (`server/`): authentication, sessions, metadata (encrypted), quotas, share-link rules, audit log. It **never** receives a plaintext file, filename or key.
- **Database**: MongoDB via Prisma. Prisma's MongoDB connector requires a replica set; Atlas clusters are replica sets. For local dev, `mongodb-memory-server`'s `MongoMemoryReplSet` is started automatically and `prisma db push` creates the indexes.
- **Storage driver** (`server/src/services/storage`): `local` stores each encrypted chunk at `storage/<storageKey>/<n>` and proxies bytes through authenticated API routes. `s3` returns 5-minute pre-signed PUT/GET URLs so the browser talks to S3/R2 directly.

## 2. Key flows

### Sign-up
1. Browser generates a random 16-byte salt and runs **Argon2id(password)** → 64 bytes → `KEK` (32) + `authKey` (32).
2. Generates random **master key (MK)** and **recovery key (RK)**.
3. Sends `authKey`, salt, KDF params, `AES-GCM(KEK, MK)`, `AES-GCM(SHA256(RK), MK)` and a recovery proof. The server Argon2id-hashes the auth key and recovery proof again.
4. The recovery key is shown once; the session is only activated after the user confirms they saved it.

### Login
`POST /auth/prelogin` (salt) → derive keys locally → `POST /auth/login` (authKey) → optional `POST /auth/2fa/verify` → access token + refresh cookie → unwrap MK with KEK in the browser.

On page reload the refresh cookie restores the *session* but not the *master key*, so the user sees **Unlock vault** and re-enters the password (no 2FA needed). Keys are never persisted to storage.

### Upload (per file, per version)
1. Random `FK` (file key) + 8-byte nonce prefix.
2. `POST /files` with encrypted name/mime, size, chunk count, `AES-GCM(MK, FK)` → server creates `File` + `Version` and returns part URLs.
3. For each 8 MiB chunk *i*: `AES-GCM(FK, iv = prefix‖i, AAD = "sv-chunk:i:count")` → `PUT` part.
4. `POST /uploads/:vid/complete` → server checks all parts arrived, quota, marks ready, charges storage.

### Download / preview
`GET /files/:id/download` returns the version's wrapped key and part URLs → fetch → decrypt each chunk → `Blob` → object URL for preview or save.

### Sharing
Browser creates random link key `K`; uploads `FK` wrapped with `K` (or with `SHA256(K‖Argon2id(password))`) plus name/mime encrypted with `K`. The link is `/s/<token>#k=<K>`; fragments are never sent to servers. The public page reads `K` from `location.hash`, fetches metadata, verifies password proof server-side, gets a 10-minute download ticket, and decrypts locally.

## 3. Folder structure

```
server/src
├── app.js                 Express app + middleware order
├── index.js               boot: connect DB, listen, optional seed
├── config/env.js          env vars (+ safe dev fallbacks)
├── config/db.js           Prisma client, in-memory replica set fallback
├── middleware/            auth (JWT + live session check), validate (zod), security (sanitize, CSRF), error
├── routes/                auth.js · account.js · files.js · shares.js
├── services/              tokens (JWT/refresh rotation) · storage/{local,s3} · vault (ownership/purge) · activity
├── seed/                  demo.js (seed via API using client crypto) · nodeHttp.js
└── utils/                 logger (pino) · hash (Argon2id) · crypto (server secrets) · errors

client/src
├── crypto/core.js         primitives: KDF, AES-GCM, chunk crypto, recovery key, share keys
├── crypto/vault.js        flows: uploadFile, downloadFile, createShare, downloadShare
├── api/http.js            fetch wrapper (+ silent refresh) & http adapter
├── api/auth.js            register, login, 2FA, unlock, password change, recovery
├── stores/                Zustand: auth (in-memory keys), ui (toasts/uploads/dialogs), theme
├── hooks/                 TanStack Query hooks, uploader, actions, decrypted file
├── components/            layout, file UI, dialogs, ui/ primitives
└── pages/                 route screens
```

## 4. Why these choices

| Choice | Reason |
|---|---|
| Encrypt in the browser | Zero-knowledge: the server can't leak what it never had |
| Argon2id (hash-wasm) | Memory-hard KDF, OWASP recommended; WASM works in browser *and* Node (shared code) |
| Per-file keys | Sharing one file never exposes others; key rotation per version |
| Chunked AES-GCM | Large files without loading everything into memory at once; per-chunk integrity |
| Access token in memory + httpOnly refresh cookie | XSS can't steal a long-lived token; CSRF blocked by SameSite=Strict + Origin + custom header |
| Prisma | Typed schema, clear models for learners, easy to switch providers |
| Pluggable storage | Local disk for zero-setup dev, S3/R2 for production |
