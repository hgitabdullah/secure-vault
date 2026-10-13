import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { ah, unauthorized } from '../utils/errors.js';

/**
 * Require a valid short-lived access token (Authorization: Bearer ...).
 * We also check the session still exists so that "sign out device"
 * takes effect immediately, not after the token expires.
 */
export const requireAuth = ah(async (req, _res, next) => {
  if (req.user) return next(); // already authenticated by an outer router
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'], audience: 'access' });
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const session = await prisma.session.findUnique({ where: { id: payload.sid } });
  if (!session || session.revoked) throw unauthorized('Session revoked');
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw unauthorized();
  req.user = user;
  req.session = session;
  if (Date.now() - session.lastSeen.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeen: new Date() } });
  }
  next();
});
