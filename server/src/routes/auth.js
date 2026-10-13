/**
 * Authentication routes.
 *
 * Zero-knowledge login flow:
 *  1. POST /prelogin  → client gets its KDF salt + params.
 *  2. Browser runs Argon2id(password, salt) → 64 bytes = KEK (kept) + authKey (sent).
 *  3. POST /login with authKey. Server checks argon2id(authKey) == authHash.
 *  4. If 2FA is enabled → { twoFactorRequired, ticket }; then POST /2fa/verify.
 *  5. Session issued: access JWT in body, rotating refresh token in httpOnly cookie.
 */
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfGuard } from '../middleware/security.js';
import { ah, ApiError, unauthorized, badRequest } from '../utils/errors.js';
import { hashSecret, verifySecret } from '../utils/hash.js';
import { fakeSalt, sealString, openString, sha256, randomToken } from '../utils/crypto.js';
import { startSession, rotateSession, clearRefresh, signAccess, signTicket, verifyTicket } from '../services/tokens.js';
import { logActivity } from '../services/activity.js';
import { storage } from '../services/storage/index.js';

const r = Router();
authenticator.options = { window: 1 };

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: env.authRateLimit, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').toLowerCase()}`,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
  skip: () => env.isTest && !process.env.TEST_RATE_LIMIT,
});

const b64 = z.string().min(8).max(4096).regex(/^[A-Za-z0-9+/=_-]+$/, 'must be base64');
const hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 hex chars');
const email = z.string().trim().toLowerCase().email().max(254);
const kdf = z.object({
  alg: z.enum(['argon2id', 'pbkdf2']),
  m: z.number().int().min(1024).max(1 << 20).optional(),
  t: z.number().int().min(1).max(10).optional(),
  p: z.number().int().min(1).max(4).optional(),
  iter: z.number().int().min(100000).max(5000000).optional(),
});
export const DEFAULT_KDF = { alg: 'argon2id', m: 65536, t: 3, p: 1 };

/** Public profile + key material the browser needs to unlock the vault. */
export const meView = (u) => ({
  id: u.id, email: u.email, name: u.name, kdfSalt: u.kdfSalt, kdfParams: u.kdfParams,
  encMasterKey: u.encMasterKey, totpEnabled: !!u.totp?.enabled,
  storageUsed: u.storageUsed, storageQuota: u.storageQuota, createdAt: u.createdAt,
});

r.post('/prelogin', authLimiter, validate({ body: z.object({ email }) }), ah(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { email: req.body.email } });
  // Unknown emails get a stable fake salt so attackers can't tell which accounts exist.
  res.json(u ? { kdfSalt: u.kdfSalt, kdfParams: u.kdfParams } : { kdfSalt: fakeSalt(req.body.email), kdfParams: DEFAULT_KDF });
}));

r.post('/register', authLimiter, validate({
  body: z.object({
    email, name: z.string().trim().max(80).default(''),
    authKey: hex64, kdfSalt: b64, kdfParams: kdf,
    encMasterKey: b64, encMasterKeyRecovery: b64, recoveryProof: hex64,
  }),
}), ah(async (req, res) => {
  const b = req.body;
  if (await prisma.user.findUnique({ where: { email: b.email }, select: { id: true } })) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  const user = await prisma.user.create({ data: {
    email: b.email, name: b.name, authHash: await hashSecret(b.authKey),
    kdfSalt: b.kdfSalt, kdfParams: b.kdfParams, encMasterKey: b.encMasterKey,
    encMasterKeyRecovery: b.encMasterKeyRecovery, recoveryHash: await hashSecret(b.recoveryProof),
    storageQuota: env.defaultQuota, totp: { enabled: false, backupCodes: [] },
  } });
  await logActivity(req, user.id, 'account.created');
  const { accessToken, session } = await startSession(req, res, user);
  await logActivity(req, user.id, 'login', session.name);
  res.status(201).json({ accessToken, user: meView(user) });
}));

r.post('/login', authLimiter, validate({ body: z.object({ email, authKey: hex64 }) }), ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  const generic = new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  if (!user) throw generic;
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(423, 'LOCKED', 'Too many failed attempts. Try again in a few minutes.');
  }
  if (!(await verifySecret(user.authHash, req.body.authKey))) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({ where: { id: user.id }, data: failed >= 10
      ? { failedLogins: 0, lockedUntil: new Date(Date.now() + 15 * 60e3) } : { failedLogins: failed } });
    await logActivity(req, user.id, 'login.failed');
    throw generic;
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  if (user.totp?.enabled) {
    return res.json({ twoFactorRequired: true, ticket: signTicket(user, 'mfa') });
  }
  const { accessToken, session } = await startSession(req, res, user);
  await logActivity(req, user.id, 'login', `New sign-in: ${session.name} (${req.ip})`);
  res.json({ accessToken, user: meView(user) });
}));

/** Check a TOTP code or a single-use backup code. Consumes backup codes. */
async function checkSecondFactor(user, code) {
  const c = String(code).replace(/\s|-/g, '');
  if (/^\d{6}$/.test(c) && user.totp.encSecret) {
    return authenticator.check(c, openString(user.totp.encSecret));
  }
  const h = sha256(c.toLowerCase());
  const codes = user.totp.backupCodes || [];
  if (codes.includes(h)) {
    await prisma.user.update({ where: { id: user.id }, data: { totp: { ...user.totp, backupCodes: codes.filter((x) => x !== h) } } });
    return true;
  }
  return false;
}

r.post('/2fa/verify', authLimiter, validate({ body: z.object({ ticket: z.string().max(1000), code: z.string().min(6).max(20) }) }),
  ah(async (req, res) => {
    let t;
    try { t = verifyTicket(req.body.ticket, 'mfa'); } catch { throw unauthorized('Login expired, please sign in again'); }
    const user = await prisma.user.findUnique({ where: { id: t.sub } });
    if (!user?.totp?.enabled) throw unauthorized();
    if (!(await checkSecondFactor(user, req.body.code))) {
      await logActivity(req, user.id, '2fa.failed');
      throw new ApiError(401, 'INVALID_CODE', 'Invalid verification code');
    }
    const { accessToken, session } = await startSession(req, res, user);
    await logActivity(req, user.id, 'login', `New sign-in with 2FA: ${session.name} (${req.ip})`);
    res.json({ accessToken, user: meView(user) });
  }));

r.post('/refresh', csrfGuard, ah(async (req, res) => {
  // No cookie at all = simply "not signed in" (204), not an error.
  if (!req.cookies?.sv_rt) return res.status(204).end();
  const session = await rotateSession(req, res);
  if (!session) { clearRefresh(res); throw unauthorized('Session expired'); }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw unauthorized();
  res.json({ accessToken: signAccess(user, session), user: meView(user) });
}));

r.post('/logout', csrfGuard, ah(async (req, res) => {
  const raw = req.cookies?.sv_rt;
  const sid = raw?.split('.')[0];
  if (sid && /^[a-f0-9]{24}$/.test(sid)) await prisma.session.updateMany({ where: { id: sid }, data: { revoked: true } });
  clearRefresh(res);
  res.json({ ok: true });
}));

/* ---------- Recovery key ---------- */
r.post('/recover/start', authLimiter, validate({ body: z.object({ email, recoveryProof: hex64 }) }), ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!user || !(await verifySecret(user.recoveryHash, req.body.recoveryProof))) {
    throw new ApiError(401, 'INVALID_RECOVERY', 'Recovery key does not match this account');
  }
  res.json({ encMasterKeyRecovery: user.encMasterKeyRecovery });
}));

r.post('/recover', authLimiter, validate({
  body: z.object({ email, recoveryProof: hex64, authKey: hex64, kdfSalt: b64, kdfParams: kdf, encMasterKey: b64 }),
}), ah(async (req, res) => {
  const b = req.body;
  const user = await prisma.user.findUnique({ where: { email: b.email } });
  if (!user || !(await verifySecret(user.recoveryHash, b.recoveryProof))) {
    throw new ApiError(401, 'INVALID_RECOVERY', 'Recovery key does not match this account');
  }
  await prisma.user.update({ where: { id: user.id }, data: {
    authHash: await hashSecret(b.authKey), kdfSalt: b.kdfSalt, kdfParams: b.kdfParams, encMasterKey: b.encMasterKey,
    failedLogins: 0, lockedUntil: null,
  } });
  await prisma.session.updateMany({ where: { userId: user.id }, data: { revoked: true } }); // sign out everywhere
  await logActivity(req, user.id, 'password.recovered');
  res.json({ ok: true });
}));

/* ---------- Authenticated account routes ---------- */
r.get('/me', requireAuth, (req, res) => res.json({ user: meView(req.user) }));

r.patch('/me', requireAuth, validate({ body: z.object({ name: z.string().trim().min(1).max(80) }) }), ah(async (req, res) => {
  const u = await prisma.user.update({ where: { id: req.user.id }, data: { name: req.body.name } });
  await logActivity(req, u.id, 'profile.updated');
  res.json({ user: meView(u) });
}));

/** Change password: the client proves the old auth key and sends the master key re-wrapped under the new KEK. No file is re-encrypted. */
r.post('/password', requireAuth, validate({
  body: z.object({ currentAuthKey: hex64, authKey: hex64, kdfSalt: b64, kdfParams: kdf, encMasterKey: b64 }),
}), ah(async (req, res) => {
  const u = req.user; const b = req.body;
  if (!(await verifySecret(u.authHash, b.currentAuthKey))) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  const nu = await prisma.user.update({ where: { id: u.id }, data: {
    authHash: await hashSecret(b.authKey), kdfSalt: b.kdfSalt, kdfParams: b.kdfParams, encMasterKey: b.encMasterKey,
  } });
  await prisma.session.updateMany({ where: { userId: u.id, id: { not: req.session.id } }, data: { revoked: true } });
  await logActivity(req, u.id, 'password.changed', 'Other devices were signed out');
  res.json({ user: meView(nu) });
}));

r.post('/2fa/setup', requireAuth, ah(async (req, res) => {
  const u = req.user;
  if (u.totp?.enabled) throw badRequest('2FA is already enabled');
  const secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: u.id }, data: { totp: { enabled: false, backupCodes: [], pendingSecret: sealString(secret) } } });
  const otpauth = authenticator.keyuri(u.email, 'SecureVault', secret);
  res.json({ secret, otpauth, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) });
}));

r.post('/2fa/enable', requireAuth, validate({ body: z.object({ code: z.string().regex(/^\d{6}$/) }) }), ah(async (req, res) => {
  const u = req.user;
  if (!u.totp?.pendingSecret) throw badRequest('Start 2FA setup first');
  const secret = openString(u.totp.pendingSecret);
  if (!authenticator.check(req.body.code, secret)) throw new ApiError(400, 'INVALID_CODE', 'Invalid verification code');
  const codes = Array.from({ length: 10 }, () => randomToken(6).replace(/[-_]/g, 'x').slice(0, 8).toLowerCase());
  await prisma.user.update({ where: { id: u.id }, data: { totp: { enabled: true, encSecret: sealString(secret), pendingSecret: null, backupCodes: codes.map(sha256) } } });
  await logActivity(req, u.id, '2fa.enabled');
  res.json({ backupCodes: codes });
}));

r.post('/2fa/disable', requireAuth, validate({ body: z.object({ code: z.string().min(6).max(20) }) }), ah(async (req, res) => {
  const u = req.user;
  if (!u.totp?.enabled) throw badRequest('2FA is not enabled');
  if (!(await checkSecondFactor(u, req.body.code))) throw new ApiError(400, 'INVALID_CODE', 'Invalid verification code');
  await prisma.user.update({ where: { id: u.id }, data: { totp: { enabled: false, backupCodes: [] } } });
  await logActivity(req, u.id, '2fa.disabled');
  res.json({ ok: true });
}));

r.delete('/me', requireAuth, validate({ body: z.object({ authKey: hex64 }) }), ah(async (req, res) => {
  const u = req.user;
  if (!(await verifySecret(u.authHash, req.body.authKey))) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
  const versions = await prisma.version.findMany({ where: { ownerId: u.id }, select: { storageKey: true } });
  for (const v of versions) await storage.remove(v.storageKey).catch(() => {});
  const w = { ownerId: u.id };
  await prisma.share.deleteMany({ where: w });
  await prisma.version.deleteMany({ where: w });
  await prisma.file.deleteMany({ where: w });
  await prisma.folder.deleteMany({ where: w });
  await prisma.session.deleteMany({ where: { userId: u.id } });
  await prisma.activity.deleteMany({ where: { userId: u.id } });
  await prisma.user.delete({ where: { id: u.id } });
  clearRefresh(res);
  res.json({ ok: true });
}));

export default r;
