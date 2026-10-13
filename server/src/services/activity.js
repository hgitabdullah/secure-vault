import { prisma } from '../config/db.js';

/** Append an entry to the user's activity (audit) log. Never include secrets. */
export function logActivity(req, userId, action, detail = '') {
  return prisma.activity.create({
    data: { userId, action, detail, ip: req.ip || '', ua: (req.headers['user-agent'] || '').slice(0, 200) },
  });
}
