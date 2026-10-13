# Security

## 1. Threat model

| Asset | Protected against | How |
|---|---|---|
| File contents & names | Server/database/storage breach, curious operator, storage provider | Encrypted in browser (AES-256-GCM); server stores ciphertext only |
| Master key | Server breach, network attacker | Never leaves browser unencrypted; wrapped with password-derived KEK |
| Password | Server breach, offline cracking | Never sent; Argon2id (64 MiB, t=3) in browser → auth key, which the server hashes again with Argon2id |
| Session | XSS token theft, CSRF, stolen refresh token | Access JWT in memory (15 min); refresh token httpOnly + SameSite=Strict, rotated each use, reuse ⇒ revoke |
| Account | Brute force, credential stuffing | Rate limit per IP+email, lockout after 10 failures, TOTP 2FA, backup codes |
| Share links | Link interception (server side), guessing | Key in URL fragment (never sent to server); 96-bit random token; optional password; expiry + download limit |
| Other users' data | Broken access control | Every query filters by `ownerId`; non-owned ids return 404 |

**Out of scope / limitations:** a compromised browser or device (malware, malicious extension) can read decrypted data; a malicious server could serve modified JavaScript (mitigate with SRI/reproducible builds/desktop app); metadata visible to the server includes file sizes, timestamps, folder structure and counts; whoever has a full share URL (incl. fragment) and password can download.

## 2. Cryptography details

| Item | Algorithm | Parameters |
|---|---|---|
| Password KDF | Argon2id (hash-wasm) | m = 64 MiB, t = 3, p = 1, 16-byte random salt, 64-byte output. Fallback: PBKDF2-SHA256, 600 000 iterations |
| KEK / authKey | split of KDF output | bytes 0-31 = KEK, 32-63 = authKey (hex) |
| Server password storage | Argon2id | m = 19 MiB, t = 2 (OWASP minimum), random salt — hashes the authKey |
| Master key (MK) | random 256-bit | `encMasterKey = AES-GCM(KEK, MK, AAD "sv-key")` |
| Recovery key (RK) | random 256-bit, shown as 52 base32 chars | wrap key = SHA-256("sv-rk-enc"‖RK); proof = SHA-256("sv-rk-auth"‖RK) (stored Argon2id-hashed) |
| File key (FK) | random 256-bit per **version** | `encFileKey = AES-GCM(MK, FK, AAD "sv-key")` |
| Names / MIME | AES-256-GCM with MK | random 96-bit IV, AAD "sv-text" |
| File chunks | AES-256-GCM with FK | 8 MiB plaintext; IV = 8-byte random prefix ‖ uint32 chunk index; AAD = `sv-chunk:<index>:<count>` (prevents reordering, truncation, cross-file swapping) |
| Share key | random 256-bit link key K in `#k=` | wrap key = K, or SHA-256(K ‖ Argon2id(password, salt; m=19 MiB, t=2)); password proof = second half of that Argon2id output (server stores Argon2id(proof)) |
| TOTP secret | AES-256-GCM with server key | `SERVER_ENC_KEY` env var; backup codes stored as SHA-256 |
| Refresh token | 256-bit random | stored as SHA-256 |

All AES-GCM blobs are `base64(iv ‖ ciphertext ‖ tag)`. GCM's tag makes any tampering fail decryption.

**Password change** re-derives KEK and re-wraps MK only. **Recovery** decrypts MK with RK in the browser, then re-wraps it with a new password, and signs out all sessions.

## 3. Application security controls

| Control | Implementation |
|---|---|
| Security headers | `helmet` — CSP `default-src 'none'; frame-ancestors 'none'` on the API, nosniff, Referrer-Policy, HSTS in production, `x-powered-by` disabled |
| Front-end CSP | No inline scripts (theme bootstrap is an external file); set CSP at your static host — see DEPLOYMENT.md |
| CORS | Allow-list from `CLIENT_ORIGIN`, credentials enabled only for it |
| Rate limiting | `express-rate-limit`: global 1200/min/IP; auth routes 20 / 15 min per IP+email; public share routes 60 / 15 min |
| Lockout | 10 failed logins → 15-minute lock (423) |
| Input validation | `zod` schemas on every body/params/query; ObjectId regex; base64 regex; size bounds |
| NoSQL injection | sanitizer strips `$`-prefixed / dotted keys (equivalent to express-mongo-sanitize) + zod + Prisma typed queries |
| CSRF | Cookie only sent to `/api/v1/auth` with SameSite=Strict; `/refresh` and `/logout` additionally require `X-Requested-With: securevault` and a matching `Origin` |
| Size limits | JSON 100 KB; chunk uploads ≤ 8 MiB + 1 KiB; chunk count must match size |
| Access control | `ownFile/ownFolder/ownVersion` helpers; every list/update filters by `ownerId`; foreign ids → 404 |
| Sessions | Session row checked on every request → device revoke is immediate |
| Account enumeration | `/prelogin` returns a deterministic fake salt for unknown emails; generic login errors |
| Logging | `pino` structured logs with redaction of auth headers & cookies; `Activity` audit log (login, failed login, 2FA, uploads, shares, device revokes…) |
| Secrets | Only via env vars; `.env.example` contains no secrets; dev generates random secrets per boot |
| Previews | Decrypted blobs rendered via object URLs; PDFs in a sandboxed iframe |

## 4. OWASP Top 10 (2021) mapping

| Risk | Mitigation in SecureVault |
|---|---|
| A01 Broken Access Control | Ownership filter on every route; tested with a two-user test matrix (`files.test.js`, `share.test.js`) |
| A02 Cryptographic Failures | Client-side AES-256-GCM, Argon2id, per-file keys, TLS in production, encrypted TOTP secrets, hashed refresh tokens |
| A03 Injection | zod validation, sanitizer, Prisma parameterised queries, React escaping |
| A04 Insecure Design | Zero-knowledge architecture, threat model above, recovery-key design |
| A05 Security Misconfiguration | helmet, strict CORS, generic 500 messages (no stack traces), env-based config |
| A06 Vulnerable Components | Lockfiles; run `npm audit` in CI (see DEVELOPMENT.md) |
| A07 Identification & Auth Failures | Rate limits, lockout, 2FA + backup codes, rotating refresh tokens with reuse detection, device management |
| A08 Software & Data Integrity | GCM auth tags on every blob/chunk, chunk AAD binding, lockfiles |
| A09 Logging & Monitoring | pino logs + per-user activity log with sign-in alerts |
| A10 SSRF | API never fetches user-supplied URLs; storage keys are generated server-side |

## 5. Roadmap
- **Passkeys (WebAuthn)** via `@simplewebauthn/server` + `/browser` — second factor and passwordless unlock (PRF extension for key wrapping).
- Email alerts for new-device sign-ins (Resend/Postmark) — today they appear in the activity log.
- Redis-backed rate limiting for multi-instance deployments.
- Subresource Integrity and a signed desktop app to reduce "malicious JS" risk.
- Public-key sharing between SecureVault users (X25519).

## 6. Reporting
Please report vulnerabilities privately to the maintainer rather than opening a public issue.
