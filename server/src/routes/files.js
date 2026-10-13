/**
 * File manager API. The server stores only ciphertext and encrypted names.
 *
 * Upload flow (per version):
 *   POST /files            → creates File + Version, returns part URLs
 *   PUT  /uploads/:v/parts/:n (local driver)  or  PUT <pre-signed S3 URL>
 *   POST /uploads/:v/complete → marks ready, charges quota
 */
import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ah, ApiError, badRequest } from '../utils/errors.js';
import { randomToken } from '../utils/crypto.js';
import { storage, partUrls } from '../services/storage/index.js';
import { logActivity } from '../services/activity.js';
import { ownFile, ownFolder, ownVersion, purgeFiles, descendantFolderIds, fileView, folderView, versionView } from '../services/vault.js';

const r = Router();
r.use(requireAuth);

const oid = z.string().regex(/^[a-f0-9]{24}$/, 'invalid id');
const b64 = z.string().min(8).max(8192).regex(/^[A-Za-z0-9+/=_-]+$/, 'must be base64');
const idParam = z.object({ id: oid });
const CHUNK = 8 * 1024 * 1024;
const uploadMeta = {
  size: z.number().int().min(0).max(50 * 1024 ** 3),
  chunkSize: z.number().int().min(1024).max(CHUNK),
  chunkCount: z.number().int().min(1).max(10000),
  encFileKey: b64,
  noncePrefix: z.string().regex(/^[A-Za-z0-9+/=]{12}$/),
};
const checkChunks = (b) => {
  if (b.chunkCount !== Math.max(1, Math.ceil(b.size / b.chunkSize))) throw badRequest('chunkCount does not match size');
};

async function assertQuota(user, size) {
  const u = await prisma.user.findUnique({ where: { id: user.id } });
  if (u.storageUsed + size > u.storageQuota) throw new ApiError(413, 'QUOTA_EXCEEDED', 'Not enough storage space left');
}
const device = (req) => (req.session?.name || 'Unknown');

async function createVersion(req, file, b, number) {
  const v = await prisma.version.create({
    data: {
      fileId: file.id, ownerId: req.user.id, number, size: b.size, chunkSize: b.chunkSize, chunkCount: b.chunkCount,
      encFileKey: b.encFileKey, noncePrefix: b.noncePrefix, storageKey: randomToken(18), partsDone: [], device: device(req),
    },
  });
  return { version: versionView(v), parts: await partUrls(v, 'put', `/api/v1/uploads/${v.id}/parts`) };
}

/* ----- listing ----- */
r.get('/files', validate({
  query: z.object({ view: z.enum(['folder', 'all', 'recent', 'favorites', 'trash']).default('folder'), folder: oid.optional() }),
}), ah(async (req, res) => {
  const { view, folder } = req.validQuery;
  const ownerId = req.user.id;
  const live = { ownerId, status: 'ready', trashed: false };
  let files = []; let folders = [];
  if (view === 'folder') {
    if (folder) await ownFolder(req.user, folder);
    folders = await prisma.folder.findMany({ where: { ownerId, parentId: folder || null, trashed: false }, orderBy: { createdAt: 'asc' } });
    files = await prisma.file.findMany({ where: { ...live, folderId: folder || null }, orderBy: { updatedAt: 'desc' } });
  } else if (view === 'all') {
    folders = await prisma.folder.findMany({ where: { ownerId, trashed: false } });
    files = await prisma.file.findMany({ where: live, orderBy: { updatedAt: 'desc' } });
  } else if (view === 'recent') {
    files = await prisma.file.findMany({ where: live, orderBy: { updatedAt: 'desc' }, take: 40 });
  } else if (view === 'favorites') {
    files = await prisma.file.findMany({ where: { ...live, favorite: true }, orderBy: { updatedAt: 'desc' } });
    folders = [];
  } else {
    folders = await prisma.folder.findMany({ where: { ownerId, trashed: true }, orderBy: { trashedAt: 'desc' } });
    files = await prisma.file.findMany({ where: { ownerId, status: 'ready', trashed: true }, orderBy: { trashedAt: 'desc' } });
  }
  // Hide items whose ancestor folder is in the trash (outside trash/folder views).
  if (view === 'all' || view === 'recent' || view === 'favorites') {
    const trashedFolders = await prisma.folder.findMany({ where: { ownerId, trashed: true }, select: { id: true } });
    const hidden = new Set();
    for (const t of trashedFolders) (await descendantFolderIds(ownerId, t.id)).forEach((x) => hidden.add(x));
    files = files.filter((f) => !f.folderId || !hidden.has(f.folderId));
    folders = folders.filter((f) => !hidden.has(f.id));
  }
  // Number of live files directly inside each folder (shown on folder cards).
  const counts = folders.length ? await prisma.file.groupBy({ by: ['folderId'], where: { ...live, folderId: { in: folders.map((f) => f.id) } }, _count: { _all: true } }) : [];
  const countOf = Object.fromEntries(counts.map((c) => [c.folderId, c._count._all]));
  const u = await prisma.user.findUnique({ where: { id: ownerId } });
  res.json({ files: files.map(fileView), folders: folders.map((f) => ({ ...folderView(f), fileCount: countOf[f.id] || 0 })), storageUsed: u.storageUsed, storageQuota: u.storageQuota });
}));

/* ----- upload a new file ----- */
r.post('/files', validate({
  body: z.object({ folderId: oid.nullable().optional(), encName: b64, encMime: b64, ...uploadMeta }),
}), ah(async (req, res) => {
  const b = req.body;
  checkChunks(b);
  if (b.folderId) await ownFolder(req.user, b.folderId);
  await assertQuota(req.user, b.size);
  const file = await prisma.file.create({ data: { ownerId: req.user.id, folderId: b.folderId || null, encName: b.encName, encMime: b.encMime, size: b.size } });
  const out = await createVersion(req, file, b, 1);
  res.status(201).json({ file: fileView(file), ...out });
}));

/* ----- upload a new version of an existing file ----- */
r.post('/files/:id/versions', validate({ params: idParam, body: z.object(uploadMeta) }), ah(async (req, res) => {
  const file = await ownFile(req.user, req.params.id);
  if (file.trashed) throw badRequest('File is in the trash');
  checkChunks(req.body);
  await assertQuota(req.user, req.body.size);
  const last = await prisma.version.findFirst({ where: { fileId: file.id }, orderBy: { number: 'desc' } });
  res.status(201).json(await createVersion(req, file, req.body, (last?.number || 0) + 1));
}));

/* ----- chunk upload/download through the API (local storage driver) ----- */
const partParams = z.object({ vid: oid, n: z.coerce.number().int().min(0).max(9999) });
r.put('/uploads/:vid/parts/:n', express.raw({ type: '*/*', limit: env.maxChunkBytes }), validate({ params: partParams }), ah(async (req, res) => {
  const v = await ownVersion(req.user, req.params.vid);
  const n = req.params.n;
  if (v.status !== 'uploading') throw badRequest('Upload already completed');
  if (n >= v.chunkCount) throw badRequest('Part number out of range');
  if (!Buffer.isBuffer(req.body) || req.body.length < 16 || req.body.length > v.chunkSize + 16) throw badRequest('Invalid chunk size');
  await storage.putPart(v.storageKey, n, req.body);
  // A retried part overwrites the same object; only record it once.
  if (!v.partsDone.includes(n)) {
    await prisma.version.update({ where: { id: v.id }, data: { partsDone: { push: n }, storedBytes: { increment: req.body.length } } });
  }
  res.json({ ok: true, n });
}));

/** For S3 direct uploads the browser reports each finished part here. */
r.post('/uploads/:vid/parts/:n/done', validate({ params: partParams }), ah(async (req, res) => {
  const v = await ownVersion(req.user, req.params.vid);
  if (v.status !== 'uploading' || req.params.n >= v.chunkCount) throw badRequest('Invalid part');
  if (!v.partsDone.includes(req.params.n)) await prisma.version.update({ where: { id: v.id }, data: { partsDone: { push: req.params.n } } });
  res.json({ ok: true });
}));

r.post('/uploads/:vid/complete', validate({ params: z.object({ vid: oid }) }), ah(async (req, res) => {
  const v = await ownVersion(req.user, req.params.vid);
  if (v.status !== 'uploading') throw badRequest('Upload already completed');
  const done = new Set(v.partsDone);
  for (let i = 0; i < v.chunkCount; i++) if (!done.has(i)) throw new ApiError(409, 'INCOMPLETE_UPLOAD', `Part ${i} is missing`);
  await assertQuota(req.user, v.size);
  await prisma.version.update({ where: { id: v.id }, data: { status: 'ready' } });
  const file = await prisma.file.update({
    where: { id: v.fileId },
    data: { status: 'ready', currentVersionId: v.id, size: v.size, versionCount: { increment: 1 } },
  });
  await prisma.user.update({ where: { id: req.user.id }, data: { storageUsed: { increment: v.size } } });
  await logActivity(req, req.user.id, v.number > 1 ? 'file.version' : 'file.upload', `${v.size} bytes`);
  res.json({ file: fileView(file) });
}));

r.get('/uploads/:vid/parts/:n', validate({ params: partParams }), ah(async (req, res) => {
  const v = await ownVersion(req.user, req.params.vid);
  if (v.status !== 'ready' || req.params.n >= v.chunkCount) throw badRequest('Invalid part');
  const buf = await storage.getPart(v.storageKey, req.params.n);
  res.set('Content-Type', 'application/octet-stream').set('Cache-Control', 'no-store').send(buf);
}));

/* ----- download metadata (key + part URLs) ----- */
r.get('/files/:id/download', validate({ params: idParam, query: z.object({ version: oid.optional() }) }), ah(async (req, res) => {
  const file = await ownFile(req.user, req.params.id);
  const vid = req.validQuery.version || file.currentVersionId;
  const v = await prisma.version.findFirst({ where: { id: vid, fileId: file.id, status: 'ready' } });
  if (!v) throw new ApiError(404, 'NOT_FOUND', 'Version not found');
  await prisma.file.update({ where: { id: file.id }, data: { lastOpenedAt: new Date() } });
  res.json({ version: versionView(v), parts: await partUrls(v, 'get', `/api/v1/uploads/${v.id}/parts`) });
}));

/* ----- rename / move / favourite ----- */
r.patch('/files/:id', validate({
  params: idParam,
  body: z.object({ encName: b64.optional(), folderId: oid.nullable().optional(), favorite: z.boolean().optional() }),
}), ah(async (req, res) => {
  const file = await ownFile(req.user, req.params.id);
  const b = req.body; const data = {};
  if (b.encName) data.encName = b.encName;
  if (b.favorite !== undefined) data.favorite = b.favorite;
  if (b.folderId !== undefined) {
    if (b.folderId) await ownFolder(req.user, b.folderId);
    data.folderId = b.folderId;
  }
  const f = await prisma.file.update({ where: { id: file.id }, data });
  if (b.encName) await logActivity(req, req.user.id, 'file.rename');
  if (b.folderId !== undefined) await logActivity(req, req.user.id, 'file.move');
  res.json({ file: fileView(f) });
}));

/* ----- trash / restore / permanent delete ----- */
r.delete('/files/:id', validate({ params: idParam, query: z.object({ permanent: z.enum(['true', 'false']).optional() }) }), ah(async (req, res) => {
  const file = await ownFile(req.user, req.params.id);
  if (req.validQuery.permanent === 'true') {
    await purgeFiles(req.user.id, [file.id]);
    await logActivity(req, req.user.id, 'file.delete', 'Permanently deleted');
  } else {
    await prisma.file.update({ where: { id: file.id }, data: { trashed: true, trashedAt: new Date() } });
    await logActivity(req, req.user.id, 'file.trash');
  }
  res.json({ ok: true });
}));

r.post('/files/:id/restore', validate({ params: idParam }), ah(async (req, res) => {
  const file = await ownFile(req.user, req.params.id);
  // If its folder is gone/trashed, restore into the root.
  let folderId = file.folderId;
  if (folderId) {
    const fo = await prisma.folder.findFirst({ where: { id: folderId, ownerId: req.user.id, trashed: false } });
    if (!fo) folderId = null;
  }
  const f = await prisma.file.update({ where: { id: file.id }, data: { trashed: false, trashedAt: null, folderId } });
  await logActivity(req, req.user.id, 'file.restore');
  res.json({ file: fileView(f) });
}));

r.delete('/trash', ah(async (req, res) => {
  const ownerId = req.user.id;
  const tf = await prisma.folder.findMany({ where: { ownerId, trashed: true }, select: { id: true } });
  const folderIds = new Set();
  for (const f of tf) (await descendantFolderIds(ownerId, f.id)).forEach((x) => folderIds.add(x));
  const files = await prisma.file.findMany({
    where: { ownerId, OR: [{ trashed: true }, { folderId: { in: [...folderIds] } }] }, select: { id: true },
  });
  const freed = await purgeFiles(ownerId, files.map((f) => f.id));
  await prisma.folder.deleteMany({ where: { ownerId, id: { in: [...folderIds] } } });
  await logActivity(req, ownerId, 'trash.empty');
  res.json({ ok: true, freed });
}));

/* ----- versions ----- */
r.get('/files/:id/versions', validate({ params: idParam }), ah(async (req, res) => {
  const file = await ownFile(req.user, req.params.id);
  const vs = await prisma.version.findMany({ where: { fileId: file.id, status: 'ready' }, orderBy: { number: 'desc' } });
  res.json({ currentVersionId: file.currentVersionId, versions: vs.map(versionView) });
}));

r.post('/files/:id/versions/:vid/restore', validate({ params: z.object({ id: oid, vid: oid }) }), ah(async (req, res) => {
  const file = await ownFile(req.user, req.params.id);
  const v = await prisma.version.findFirst({ where: { id: req.params.vid, fileId: file.id, status: 'ready' } });
  if (!v) throw new ApiError(404, 'NOT_FOUND', 'Version not found');
  const f = await prisma.file.update({ where: { id: file.id }, data: { currentVersionId: v.id, size: v.size } });
  await logActivity(req, req.user.id, 'file.version.restore', `Version ${v.number}`);
  res.json({ file: fileView(f) });
}));

/* ----- folders ----- */
r.get('/folders', ah(async (req, res) => {
  const folders = await prisma.folder.findMany({ where: { ownerId: req.user.id, trashed: false } });
  res.json({ folders: folders.map(folderView) });
}));

r.post('/folders', validate({ body: z.object({ encName: b64, parentId: oid.nullable().optional() }) }), ah(async (req, res) => {
  if (req.body.parentId) await ownFolder(req.user, req.body.parentId);
  const f = await prisma.folder.create({ data: { ownerId: req.user.id, parentId: req.body.parentId || null, encName: req.body.encName } });
  await logActivity(req, req.user.id, 'folder.create');
  res.status(201).json({ folder: folderView(f) });
}));

r.patch('/folders/:id', validate({ params: idParam, body: z.object({ encName: b64.optional(), parentId: oid.nullable().optional() }) }), ah(async (req, res) => {
  const folder = await ownFolder(req.user, req.params.id);
  const data = {};
  if (req.body.encName) data.encName = req.body.encName;
  if (req.body.parentId !== undefined) {
    if (req.body.parentId) {
      await ownFolder(req.user, req.body.parentId);
      const sub = await descendantFolderIds(req.user.id, folder.id);
      if (sub.includes(req.body.parentId)) throw badRequest('Cannot move a folder into itself');
    }
    data.parentId = req.body.parentId;
  }
  const f = await prisma.folder.update({ where: { id: folder.id }, data });
  res.json({ folder: folderView(f) });
}));

r.delete('/folders/:id', validate({ params: idParam, query: z.object({ permanent: z.enum(['true', 'false']).optional() }) }), ah(async (req, res) => {
  const folder = await ownFolder(req.user, req.params.id);
  if (req.validQuery.permanent === 'true') {
    const ids = await descendantFolderIds(req.user.id, folder.id);
    const files = await prisma.file.findMany({ where: { ownerId: req.user.id, folderId: { in: ids } }, select: { id: true } });
    await purgeFiles(req.user.id, files.map((f) => f.id));
    await prisma.folder.deleteMany({ where: { ownerId: req.user.id, id: { in: ids } } });
    await logActivity(req, req.user.id, 'folder.delete', 'Permanently deleted');
  } else {
    await prisma.folder.update({ where: { id: folder.id }, data: { trashed: true, trashedAt: new Date() } });
    await logActivity(req, req.user.id, 'folder.trash');
  }
  res.json({ ok: true });
}));

r.post('/folders/:id/restore', validate({ params: idParam }), ah(async (req, res) => {
  const folder = await ownFolder(req.user, req.params.id);
  let parentId = folder.parentId;
  if (parentId && !(await prisma.folder.findFirst({ where: { id: parentId, ownerId: req.user.id, trashed: false } }))) parentId = null;
  const f = await prisma.folder.update({ where: { id: folder.id }, data: { trashed: false, trashedAt: null, parentId } });
  res.json({ folder: folderView(f) });
}));

export default r;
