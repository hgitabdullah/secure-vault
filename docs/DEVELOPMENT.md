# Development guide

## Prerequisites
- Node.js **20+** and npm
- (optional) a MongoDB **replica set** — e.g. a free Atlas cluster. Not needed locally: the API starts an in-memory replica set.
- (optional) Google Chrome/Chromium for the Playwright e2e test.

## Setup

```bash
git clone <repo> securevault && cd securevault
cd server && npm install && cp .env.example .env     # postinstall runs `prisma generate`
cd ../client && npm install
```

## Running

| Command | Where | What |
|---|---|---|
| `npm start` | server | API on `PORT` (5100) |
| `SEED_DEMO=1 npm start` | server | API + seed `demo@securevault.app / Demo@12345` |
| `npm run dev` | server | API with `node --watch` |
| `npm run seed` | server | Seed the demo account into a running API (`API_URL`) |
| `npm run dev` | client | Vite dev server on 5174, proxies `/api` → 5100 |
| `npm run build` / `npx vite build` | client | Production build to `client/dist` |

## Prisma

The schema lives in `server/prisma/schema.prisma` (MongoDB provider).

```bash
cd server
npx prisma generate      # after any schema change (also runs on npm install)
npx prisma db push       # sync indexes to the database in DATABASE_URL (Atlas)
npx prisma studio        # data browser
npx prisma format        # format the schema
```

- There are no migrations with MongoDB; `db push` creates collections' unique indexes.
- In local in-memory mode, `config/db.js` sets `DATABASE_URL` to the `MongoMemoryReplSet` URI and runs `prisma db push --skip-generate` automatically before creating the `PrismaClient`.
- Prisma imports are done through `import { prisma } from '../config/db.js'` (an ESM live binding that is set once `connectDB()` runs).

## Environment variables (`server/.env`)

| Var | Default | Notes |
|---|---|---|
| `PORT` | 5100 | |
| `DATABASE_URL` | *(empty → in-memory)* | MongoDB replica-set URI (`MONGO_URI` also accepted) |
| `CLIENT_ORIGIN` | http://localhost:5174 | comma-separated allow-list for CORS/CSRF |
| `JWT_SECRET`, `SERVER_ENC_KEY` | random per boot in dev | **required in production** |
| `ACCESS_TTL_SEC` | 900 | access token lifetime |
| `REFRESH_TTL_DAYS` | 30 | |
| `DEFAULT_QUOTA_BYTES` | 10 GiB | per new user |
| `STORAGE_DRIVER` | local | `local` or `s3` |
| `LOCAL_STORAGE_DIR` | server/storage | |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | | for S3/R2 |
| `AUTH_RATE_LIMIT` | 20 | auth attempts / 15 min / IP+email |
| `LOG_LEVEL` | info | pino level |

Client: `VITE_API_PROXY` changes the dev proxy target.

## Testing

```bash
cd server && npm test        # Jest + Supertest (ESM via --experimental-vm-modules)
cd client && npm run e2e     # needs API on 5100 + Vite on 5174
cd client && node tests/e2e/screenshots.mjs   # regenerate docs/screenshots (demo account must exist)
```

**Server tests** (`server/tests`, 69 tests): each file starts its own in-memory replica set via `tests/helpers.js`, registers users with the *real client crypto* (`client/src/crypto`) and fast Argon2 params, and drives the API through a supertest-backed `http` adapter.

| File | Covers |
|---|---|
| `auth.test.js` | register, duplicate, validation, NoSQL injection, prelogin anti-enumeration, login, lockout, rate-limit 429, refresh rotation + reuse detection, CSRF, logout, profile, password change (same MK), recovery, delete account, helmet/CORS/body limits |
| `twofa.test.js` | setup/QR, enable, login requires 2FA, bad ticket, backup codes single-use, disable, encrypted TOTP secret |
| `files.test.js` | multi-chunk round trip, ciphertext-only storage, empty files, names, quota, chunk validation, folders (nest, rename, move, cycles, trash/restore/permanent), trash/empty, versions, authorization matrix, devices, activity |
| `share.test.js` | public link, wrong key, password, download limit, expiry, revoke, listing, cross-user, ticket check |

**E2E** (`client/tests/e2e/e2e.mjs`): Chromium registers a new user, saves the recovery key, uploads a 10 MiB (2-chunk) binary + text file, previews, downloads & compares SHA-256, creates a password share, opens it in a fresh browser context (wrong then right password), compares SHA-256, navigates every page, reload → unlock, and fails on any console error.

## Linting

```bash
cd server && npm run lint    # ESLint 8 (.eslintrc.json)
cd client && npm run lint    # ESLint 9 flat config (react, hooks, refresh)
```

## Conventions
- ES modules everywhere; small single-purpose modules with JSDoc headers explaining *why*.
- Every route: `validate({ body/params/query })` with zod + ownership helper.
- Never log or persist keys, passwords or file contents.
- Suggested CI: `npm ci`, `npm run lint`, `npm test`, `npx vite build`, `npm audit --audit-level=high`.
