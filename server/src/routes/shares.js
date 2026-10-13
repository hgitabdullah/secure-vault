/**
 * Secure share links.
 *
 * The owner's browser generates a random link key K and puts it in the URL
 * fragment (#k=...). Browsers never send the fragment to servers, so the
 * server stores the file key wrapped with K and still can't decrypt.
 * With a password, the wrapping key is SHA-256(K || Argon2id(password)), and
 * the server additionally checks an Argon2id-derived proof before releasing
 * the ciphertext.
 */
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, ApiError, notFound, badRequest } from '../utils/errors.js';
import { randomToken } from '../utils/crypto.js';
import { hashSecret, verifySecret } from '../utils/hash.js';
import { storage, partUrls } from '../services/storage/index.js';
import { signTicket, verifyTicket } from '../services/tokens.js';
import { logActivity } from '../services/activity.js';
import { ownFile } from '../services/vault.js';

const oid = z.string().regex(/^[a-f0-9]{24}$/);
const b64 = z.string().min(8).max(8192).regex(/^[A-Za-z0-9+/=_-]+$/);
const tokenParam = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{10,40}$/) });

export const shareStatus = (s) => {
  if (s.revoked) return 'revoked';
  if (s.expiresAt && s.expiresAt < new Date()) return 'expired';
  if (s.maxDownloads && s.downloads >= s.maxDownloads) return 'limit';
  return 'active';
};
const ownerView = (s) => ({
  id: s.id, token: s.token, fileId: s.fileId, label: s.label, hasPassword: !!s.passHash, expiresAt: s.expiresAt,
  maxDownloads: s.maxDownloads, downloads: s.downloads, status: shareStatus(s), createdAt: s.createdAt,
});

/* ---------- owner routes ---------- */
export const shares = Router();
shares.use(requireAuth);

shares.post('/', validate({
  body: z.object({
    fileId: oid, encName: b64, encMime: b64, encFileKey: b64, label: z.string().max(80).optional(),
    passSalt: b64.optional(), passProof: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    expiresAt: z.coerce.date().nullable().optional(), maxDownloads: z.number().int().min(1).max(100000).nullable().optional(),
  }),
}), ah(async (req, res) => {
  const b = req.body;
  const file = await ownFile(req.user, b.fileId);
  if (file.trashed || !file.currentVersionId) throw badRequest('File is not available');
  if (!!b.passSalt !== !!b.passProof) throw badRequest('passSalt and passProof go together');
  if (b.expiresAt && b.expiresAt < new Date()) throw badRequest('Expiry must be in the future');
  const s = await prisma.share.create({
    data: {
      ownerId: req.user.id, fileId: file.id, versionId: file.currentVersionId, token: randomToken(12),
      label: b.label, encName: b.encName, encMime: b.encMime, encFileKey: b.encFileKey,
      passSalt: b.passSalt, passHash: b.passProof ? await hashSecret(b.passProof) : null,
      expiresAt: b.expiresAt || null, maxDownloads: b.maxDownloads || null,
    },
  });
  await logActivity(req, req.user.id, 'share.create', b.passProof ? 'Password protected' : '');
  res.status(201).json({ share: ownerView(s) });
}));

shares.get('/', ah(async (req, res) => {
  const list = await prisma.share.findMany({ where: { ownerId: req.user.id }, orderBy: { createdAt: 'desc' }, include: { file: true } });
  res.json({ shares: list.map((s) => ({ ...ownerView(s), fileEncName: s.file.encName, fileEncMime: s.file.encMime, fileTrashed: s.file.trashed })) });
}));

shares.delete('/:id', validate({ params: z.object({ id: oid }) }), ah(async (req, res) => {
  const s = await prisma.share.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
  if (!s) throw notFound('Share link');
  await prisma.share.update({ where: { id: s.id }, data: { revoked: true } });
  await logActivity(req, req.user.id, 'share.revoke');
  res.json({ ok: true });
}));

/* ---------- public routes (no account needed) ---------- */
export const publicShares = Router();
const publicLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: () => env.isTest && !process.env.TEST_RATE_LIMIT,
});

async function liveShare(token) {
  const s = await prisma.share.findUnique({ where: { token }, include: { version: true, owner: true } });
  if (!s) throw notFound('Share link');
  const st = shareStatus(s);
  if (st !== 'active') throw new ApiError(410, 'LINK_' + st.toUpperCase(), st === 'expired' ? 'This link has expired' : st === 'limit' ? 'Download limit reached' : 'This link was revoked');
  return s;
}

publicShares.get('/:token', publicLimiter, validate({ params: tokenParam }), ah(async (req, res) => {
  const s = await liveShare(req.params.token);
  res.json({
    encName: s.encName, encMime: s.encMime, size: s.version.size, ownerName: s.owner.name || 'A SecureVault user',
    hasPassword: !!s.passHash, passSalt: s.passSalt, expiresAt: s.expiresAt,
    downloadsLeft: s.maxDownloads ? s.maxDownloads - s.downloads : null,
  });
}));

publicShares.post('/:token/download', publicLimiter, validate({
  params: tokenParam, body: z.object({ passProof: z.string().regex(/^[0-9a-f]{64}$/).optional() }),
}), ah(async (req, res) => {
  const s = await liveShare(req.params.token);
  if (s.passHash && !(req.body.passProof && (await verifySecret(s.passHash, req.body.passProof)))) {
    throw new ApiError(401, 'WRONG_PASSWORD', 'Incorrect password');
  }
  // Atomic increment guarded by the limit so parallel requests can't exceed it.
  const where = { id: s.id, downloads: s.downloads };
  const upd = await prisma.share.updateMany({ where, data: { downloads: { increment: 1 } } });
  if (!upd.count) throw new ApiError(409, 'RETRY', 'Please try again');
  const v = s.version;
  const ticket = signTicket(s.ownerId, 'share-dl', 600, { vid: v.id });
  const parts = await partUrls(v, 'get', `/api/v1/public/s/${s.token}/parts`);
  res.json({
    encFileKey: s.encFileKey, noncePrefix: v.noncePrefix, chunkSize: v.chunkSize, chunkCount: v.chunkCount, size: v.size,
    ticket, parts,
  });
}));

publicShares.get('/:token/parts/:n', validate({
  params: tokenParam.extend({ n: z.coerce.number().int().min(0).max(9999) }), query: z.object({ t: z.string().max(1000) }),
}), ah(async (req, res) => {
  const s = await prisma.share.findUnique({ where: { token: req.params.token }, include: { version: true } });
  if (!s || s.revoked) throw notFound('Share link');
  let t;
  try { t = verifyTicket(req.validQuery.t, 'share-dl'); } catch { throw new ApiError(401, 'TICKET_EXPIRED', 'Download ticket expired'); }
  if (t.vid !== s.versionId || req.params.n >= s.version.chunkCount) throw notFound('Part');
  const buf = await storage.getPart(s.version.storageKey, req.params.n);
  res.set('Content-Type', 'application/octet-stream').set('Cache-Control', 'no-store').send(buf);
}));
