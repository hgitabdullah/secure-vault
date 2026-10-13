# REST API

Base URL: `/api/v1` · JSON unless noted · Auth: `Authorization: Bearer <accessToken>` (🔒) unless marked **public**.

Errors always look like:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "email: Invalid email" } }
```
Common codes: `VALIDATION_ERROR` 400, `BAD_REQUEST` 400, `UNAUTHORIZED` 401, `INVALID_CREDENTIALS` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `EMAIL_TAKEN` 409, `INCOMPLETE_UPLOAD` 409, `LINK_EXPIRED`/`LINK_LIMIT`/`LINK_REVOKED` 410, `QUOTA_EXCEEDED`/`PAYLOAD_TOO_LARGE` 413, `LOCKED` 423, `RATE_LIMITED` 429.

Types: `b64` = base64 string of AES-GCM blob (`iv‖ct‖tag`), `hex64` = 64 hex chars, `id` = 24-char ObjectId.

---

## Health
### `GET /health` — public
`200 { "ok": true, "storage": "local" }`

## Auth (`/auth`)

### `POST /auth/prelogin` — public, rate-limited
Body `{ email }` → `200 { kdfSalt, kdfParams: { alg, m, t, p } }` (fake but stable salt for unknown emails).

### `POST /auth/register` — public, rate-limited
```json
{ "email": "jo@example.com", "name": "Jo Alex", "authKey": "hex64", "kdfSalt": "b64",
  "kdfParams": { "alg": "argon2id", "m": 65536, "t": 3, "p": 1 },
  "encMasterKey": "b64", "encMasterKeyRecovery": "b64", "recoveryProof": "hex64" }
```
→ `201 { accessToken, user }` + `Set-Cookie: sv_rt=…; HttpOnly; SameSite=Strict; Path=/api/v1/auth`. `409 EMAIL_TAKEN`.

`user` object (also returned by `/auth/me`):
```json
{ "id": "…", "email": "…", "name": "…", "kdfSalt": "…", "kdfParams": {…}, "encMasterKey": "b64",
  "totpEnabled": false, "storageUsed": 0, "storageQuota": 10737418240, "createdAt": "…" }
```

### `POST /auth/login` — public, rate-limited
Body `{ email, authKey }` → `200 { accessToken, user }` + cookie, **or** `200 { twoFactorRequired: true, ticket }`. `401 INVALID_CREDENTIALS`, `423 LOCKED`.

### `POST /auth/2fa/verify` — public, rate-limited
Body `{ ticket, code }` (6-digit TOTP or backup code) → `200 { accessToken, user }` + cookie. `401 INVALID_CODE`.

### `POST /auth/refresh` — cookie, CSRF-guarded
Headers `X-Requested-With: securevault` (+ allowed `Origin`). → `200 { accessToken, user }` with rotated cookie; `204` if no cookie; `401` if expired/revoked/reused; `403` CSRF failure.

### `POST /auth/logout` — cookie, CSRF-guarded
→ `200 { ok: true }`, revokes the session and clears the cookie.

### `POST /auth/recover/start` — public
Body `{ email, recoveryProof }` → `200 { encMasterKeyRecovery }`. `401 INVALID_RECOVERY`.

### `POST /auth/recover` — public
Body `{ email, recoveryProof, authKey, kdfSalt, kdfParams, encMasterKey }` → `200 { ok: true }`; all sessions revoked.

### `GET /auth/me` 🔒 → `200 { user }`
### `PATCH /auth/me` 🔒 — Body `{ name }` → `200 { user }`
### `DELETE /auth/me` 🔒 — Body `{ authKey }` → `200 { ok: true }` (deletes all data). `401` wrong password.

### `POST /auth/password` 🔒
Body `{ currentAuthKey, authKey, kdfSalt, kdfParams, encMasterKey }` → `200 { user }`; other sessions revoked.

### `POST /auth/2fa/setup` 🔒 → `200 { secret, otpauth, qr }` (`qr` = PNG data URL)
### `POST /auth/2fa/enable` 🔒 — Body `{ code }` → `200 { backupCodes: string[10] }`
### `POST /auth/2fa/disable` 🔒 — Body `{ code }` (TOTP or backup) → `200 { ok: true }`

## Devices & activity

### `GET /devices` 🔒
`200 { devices: [{ id, name, ip, lastSeen, createdAt, current }] }`
### `DELETE /devices/:id` 🔒 → `200 { ok: true }` (that device's tokens stop working immediately)
### `GET /activity?page=1` 🔒
`200 { page, items: [{ id, action, detail, ip, ua, createdAt }] }` (30 per page, newest first). Actions include `login`, `login.failed`, `2fa.*`, `file.upload`, `file.version`, `file.trash`, `file.restore`, `file.delete`, `file.rename`, `file.move`, `folder.*`, `share.create`, `share.revoke`, `password.changed`, `password.recovered`, `device.revoked`, `trash.empty`.

## Files

### `GET /files?view=folder|all|recent|favorites|trash&folder=<id>` 🔒
```json
{ "files": [{ "id", "folderId", "encName", "encMime", "size", "favorite", "trashed", "trashedAt",
              "versionCount", "currentVersionId", "createdAt", "updatedAt", "lastOpenedAt" }],
  "folders": [{ "id", "parentId", "encName", "trashed", "trashedAt", "createdAt", "updatedAt", "fileCount" }],
  "storageUsed": 123, "storageQuota": 10737418240 }
```
`folder` view lists direct children of `folder` (root when omitted). `all` returns every live file/folder (used for client-side search). Items inside trashed folders are hidden outside the trash.

### `POST /files` 🔒 — start upload of a new file
```json
{ "folderId": null, "encName": "b64", "encMime": "b64", "size": 10485883,
  "chunkSize": 8388608, "chunkCount": 2, "encFileKey": "b64", "noncePrefix": "12-char b64" }
```
→ `201 { file, version: { id, number, size, chunkSize, chunkCount, encFileKey, noncePrefix, status, device, createdAt }, parts: [{ n, url, direct }] }`.
`direct: false` → `url` is an API path (`/api/v1/uploads/:vid/parts/:n`, needs the Bearer token); `direct: true` → pre-signed S3/R2 URL. `413 QUOTA_EXCEEDED`; `400` if `chunkCount ≠ ceil(size/chunkSize)`.

### `POST /files/:id/versions` 🔒 — start a new version
Body `{ size, chunkSize, chunkCount, encFileKey, noncePrefix }` → `201 { version, parts }`.

### `PUT /uploads/:vid/parts/:n` 🔒 — local driver
Body: raw `application/octet-stream` encrypted chunk (16 B … chunkSize+16 B). → `200 { ok, n }`. `413` if too large.

### `POST /uploads/:vid/parts/:n/done` 🔒 — S3 driver
Marks a directly-uploaded part as received → `200 { ok }`.

### `POST /uploads/:vid/complete` 🔒
→ `200 { file }`. `409 INCOMPLETE_UPLOAD` if a part is missing.

### `GET /files/:id/download?version=<vid>` 🔒
→ `200 { version, parts: [{ n, url, direct }] }` (current version when omitted).

### `GET /uploads/:vid/parts/:n` 🔒 — local driver
→ `200` raw encrypted chunk.

### `PATCH /files/:id` 🔒
Body any of `{ encName, folderId (id|null), favorite }` → `200 { file }`.

### `DELETE /files/:id` 🔒 → move to trash. `?permanent=true` → erase file, versions, chunks, shares; frees quota.
### `POST /files/:id/restore` 🔒 → `200 { file }` (to root if its folder is gone)
### `DELETE /trash` 🔒 → `200 { ok, freed }` (permanently empties trash, incl. trashed folders' contents)

### `GET /files/:id/versions` 🔒
→ `200 { currentVersionId, versions: [version…] }` newest first.
### `POST /files/:id/versions/:vid/restore` 🔒 → `200 { file }`

## Folders

### `GET /folders` 🔒 → `200 { folders }` (all live folders; for breadcrumbs & move dialog)
### `POST /folders` 🔒 — Body `{ encName, parentId? }` → `201 { folder }`
### `PATCH /folders/:id` 🔒 — Body `{ encName?, parentId? }` → `200 { folder }`; `400` when moving into itself/descendant
### `DELETE /folders/:id` 🔒 — trash; `?permanent=true` erases the folder tree and its files
### `POST /folders/:id/restore` 🔒 → `200 { folder }`

## Shares (owner)

### `POST /shares` 🔒
```json
{ "fileId": "id", "encName": "b64", "encMime": "b64", "encFileKey": "b64", "label": "Client review",
  "passSalt": "b64?", "passProof": "hex64?", "expiresAt": "ISO date | null", "maxDownloads": 5 }
```
→ `201 { share: { id, token, fileId, label, hasPassword, expiresAt, maxDownloads, downloads, status, createdAt } }`. The link key is **not** sent; the client builds `/s/<token>#k=<key>`.

### `GET /shares` 🔒 → `200 { shares: [share + fileEncName, fileEncMime, fileTrashed] }`; `status` ∈ `active|expired|limit|revoked`
### `DELETE /shares/:id` 🔒 → revoke → `200 { ok: true }`

## Shares (public)

### `GET /public/s/:token` — public, rate-limited
→ `200 { encName, encMime, size, ownerName, hasPassword, passSalt, expiresAt, downloadsLeft }` · `404` · `410 LINK_*`.

### `POST /public/s/:token/download` — public, rate-limited
Body `{ passProof? }` → increments the counter and returns
`200 { encFileKey, noncePrefix, chunkSize, chunkCount, size, ticket, parts }`. `401 WRONG_PASSWORD`.

### `GET /public/s/:token/parts/:n?t=<ticket>` — public
→ raw encrypted chunk (local driver). Ticket = 10-minute JWT bound to the version. `401 TICKET_EXPIRED`.
