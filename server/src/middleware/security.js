import { env } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

/**
 * NoSQL-injection guard (equivalent to express-mongo-sanitize): remove any
 * object key that starts with "$" or contains "." from body/params/query,
 * so a payload like {"email":{"$ne":null}} can't become a Mongo operator.
 */
function clean(obj) {
  if (!obj || typeof obj !== 'object' || Buffer.isBuffer(obj)) return obj;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('$') || k.includes('.')) delete obj[k];
    else clean(obj[k]);
  }
  return obj;
}
export function mongoSanitize(req, _res, next) {
  clean(req.body); clean(req.params);
  if (req.query) clean(req.query);
  next();
}

/**
 * CSRF protection for cookie-authenticated routes (/auth/refresh, /auth/logout).
 * The refresh cookie is SameSite=Strict AND we require the Origin header
 * to be our front-end plus a custom header that cross-site forms can't send.
 */
export function csrfGuard(req, _res, next) {
  const origin = req.headers.origin;
  if (origin && !env.clientOrigin.includes(origin)) return next(forbidden('Bad origin'));
  if (req.headers['x-requested-with'] !== 'securevault') return next(forbidden('Missing CSRF header'));
  next();
}
