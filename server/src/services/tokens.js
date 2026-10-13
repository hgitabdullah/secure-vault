import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { randomToken, sha256 } from '../utils/crypto.js';

export const REFRESH_COOKIE = 'sv_rt';
const cookieOpts = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: env.refreshTtlDays * 864e5,
});

export const signAccess = (user, session) =>
  jwt.sign({ sub: user.id, sid: session.id }, env.jwtSecret, {
    algorithm: 'HS256', expiresIn: env.accessTtlSec, audience: 'access',
  });

/** Short-lived ticket used between "password OK" and "2FA code OK". */
export const signTicket = (user, aud = 'mfa', ttl = 300, extra = {}) =>
  jwt.sign({ sub: typeof user === 'string' ? user : user.id, ...extra }, env.jwtSecret, { algorithm: 'HS256', expiresIn: ttl, audience: aud });
export const verifyTicket = (t, aud) => jwt.verify(t, env.jwtSecret, { algorithms: ['HS256'], audience: aud });

function deviceName(ua = '') {
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : /node|supertest/i.test(ua) ? 'API client' : 'Browser';
  return `${br} on ${os}`;
}

/**
 * Create a new session (= device) and set the rotating refresh cookie.
 * Cookie value is "<sessionId>.<random>"; only sha256(random) is stored.
 */
export async function startSession(req, res, user) {
  const secret = randomToken();
  const ua = req.headers['user-agent'] || '';
  const session = await prisma.session.create({ data: {
    userId: user.id, refreshHash: sha256(secret), ua: ua.slice(0, 300), ip: req.ip || '',
    name: deviceName(ua), expiresAt: new Date(Date.now() + env.refreshTtlDays * 864e5),
  } });
  res.cookie(REFRESH_COOKIE, `${session.id}.${secret}`, cookieOpts());
  return { session, accessToken: signAccess(user, session) };
}

/**
 * Rotate: validate the cookie, issue a new secret. If an old (already
 * rotated) secret is presented, someone stole it → revoke the session.
 */
export async function rotateSession(req, res) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw || !raw.includes('.')) return null;
  const [sid, secret] = raw.split('.');
  if (!/^[a-f0-9]{24}$/.test(sid)) return null;
  const session = await prisma.session.findUnique({ where: { id: sid } });
  if (!session || session.revoked || session.expiresAt < new Date()) return null;
  if (session.refreshHash !== sha256(secret)) {
    // reuse detected
    await prisma.session.update({ where: { id: sid }, data: { revoked: true } });
    return null;
  }
  const next = randomToken();
  const updated = await prisma.session.update({ where: { id: sid }, data: { refreshHash: sha256(next), lastSeen: new Date() } });
  res.cookie(REFRESH_COOKIE, `${sid}.${next}`, cookieOpts());
  return updated;
}

export const clearRefresh = (res) => res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
