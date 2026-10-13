/**
 * Server-side crypto helpers. Note: the server NEVER sees file keys or the
 * user's master key. These helpers are only for server-owned secrets:
 * hashing refresh tokens and encrypting TOTP secrets at rest.
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const key = () => crypto.createHash('sha256').update(env.serverEncKey).digest();

/** AES-256-GCM encrypt a short string with the server key → "iv.tag.ct" (base64url). */
export function sealString(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}
export function openString(sealed) {
  const [iv, tag, ct] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
/** Constant-time string comparison. */
export function safeEqual(a, b) {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
/** Deterministic fake salt for unknown emails so /prelogin can't enumerate accounts. */
export const fakeSalt = (email) =>
  crypto.createHmac('sha256', env.jwtSecret).update(email).digest().subarray(0, 16).toString('base64');
