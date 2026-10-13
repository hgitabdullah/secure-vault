/** Devices (sessions) and activity log. */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, notFound } from '../utils/errors.js';
import { logActivity } from '../services/activity.js';

const r = Router();
r.use(requireAuth);
const id = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });

r.get('/devices', ah(async (req, res) => {
  const list = await prisma.session.findMany({
    where: { userId: req.user.id, revoked: false, expiresAt: { gt: new Date() } }, orderBy: { lastSeen: 'desc' },
  });
  res.json({ devices: list.map((s) => ({ id: s.id, name: s.name, ip: s.ip, lastSeen: s.lastSeen, createdAt: s.createdAt, current: s.id === req.session.id })) });
}));

r.delete('/devices/:id', validate({ params: id }), ah(async (req, res) => {
  const s = await prisma.session.findFirst({ where: { id: req.params.id, userId: req.user.id, revoked: false } });
  if (!s) throw notFound('Device');
  await prisma.session.update({ where: { id: s.id }, data: { revoked: true } });
  await logActivity(req, req.user.id, 'device.revoked', s.name);
  res.json({ ok: true });
}));

r.get('/activity', validate({ query: z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }) }), ah(async (req, res) => {
  const page = req.validQuery.page; const per = 30;
  const items = await prisma.activity.findMany({
    where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * per, take: per,
  });
  res.json({ items: items.map((a) => ({ id: a.id, action: a.action, detail: a.detail, ip: a.ip, ua: a.ua, createdAt: a.createdAt })), page });
}));

export default r;
