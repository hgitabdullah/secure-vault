/**
 * Shared helpers for the file manager: ownership-checked lookups, folder
 * tree walking and permanent deletion with storage accounting.
 */
import { prisma } from '../config/db.js';
import { storage } from './storage/index.js';
import { notFound } from '../utils/errors.js';

/** Fetch a file only if it belongs to the user (A01: broken access control). */
export async function ownFile(user, id) {
  const f = await prisma.file.findFirst({ where: { id, ownerId: user.id } });
  if (!f) throw notFound('File');
  return f;
}
export async function ownFolder(user, id) {
  const f = await prisma.folder.findFirst({ where: { id, ownerId: user.id } });
  if (!f) throw notFound('Folder');
  return f;
}
export async function ownVersion(user, id) {
  const v = await prisma.version.findFirst({ where: { id, ownerId: user.id } });
  if (!v) throw notFound('Upload');
  return v;
}

/** All descendant folder ids of `rootId` (inclusive), breadth first. */
export async function descendantFolderIds(ownerId, rootId) {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    const kids = await prisma.folder.findMany({ where: { ownerId, parentId: ids[i] }, select: { id: true } });
    ids.push(...kids.map((k) => k.id));
  }
  return ids;
}

/** Permanently delete files: storage objects, versions, shares, then quota. */
export async function purgeFiles(ownerId, fileIds) {
  if (!fileIds.length) return 0;
  const versions = await prisma.version.findMany({ where: { ownerId, fileId: { in: fileIds } } });
  let freed = 0;
  for (const v of versions) {
    if (v.status === 'ready') freed += v.size;
    await storage.remove(v.storageKey).catch(() => {});
  }
  await prisma.share.deleteMany({ where: { ownerId, fileId: { in: fileIds } } });
  await prisma.version.deleteMany({ where: { ownerId, fileId: { in: fileIds } } });
  await prisma.file.deleteMany({ where: { ownerId, id: { in: fileIds } } });
  if (freed) await prisma.user.update({ where: { id: ownerId }, data: { storageUsed: { decrement: freed } } });
  return freed;
}

export const fileView = (f) => ({
  id: f.id, folderId: f.folderId, encName: f.encName, encMime: f.encMime, size: f.size,
  favorite: f.favorite, trashed: f.trashed, trashedAt: f.trashedAt, versionCount: f.versionCount,
  currentVersionId: f.currentVersionId, createdAt: f.createdAt, updatedAt: f.updatedAt, lastOpenedAt: f.lastOpenedAt,
});
export const folderView = (f) => ({
  id: f.id, parentId: f.parentId, encName: f.encName, trashed: f.trashed, trashedAt: f.trashedAt,
  createdAt: f.createdAt, updatedAt: f.updatedAt,
});
export const versionView = (v) => ({
  id: v.id, number: v.number, size: v.size, chunkSize: v.chunkSize, chunkCount: v.chunkCount,
  encFileKey: v.encFileKey, noncePrefix: v.noncePrefix, status: v.status, device: v.device, createdAt: v.createdAt,
});
