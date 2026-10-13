/**
 * Database connection (Prisma + MongoDB).
 *
 * Prisma's MongoDB connector needs a *replica set* (it uses transactions).
 * If DATABASE_URL (or MONGO_URI) is not set we start an in-memory single-node
 * replica set with mongodb-memory-server, point DATABASE_URL at it and run
 * `prisma db push` to create the unique indexes. Data is lost on restart.
 *
 * `prisma` is an ESM live binding: modules that import it see the client
 * as soon as connectDB() has created it.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

export let prisma = null;
let replSet = null;
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function connectDB() {
  let url = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (url && !url.includes('?') && !url.split('://')[1]?.includes('/')) {
    url = `${url.replace(/\/+$/, '')}/securevault`;
  } else if (url && url.includes('?') && !url.split('?')[0].split('://')[1]?.includes('/')) {
    const [base, query] = url.split('?');
    url = `${base.replace(/\/+$/, '')}/securevault?${query}`;
  }
  if (!url) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    url = replSet.getUri('securevault');
    process.env.DATABASE_URL = url; // must be set BEFORE new PrismaClient()
    logger.warn('DATABASE_URL not set – using in-memory MongoDB replica set (data is NOT persisted)');
    pushSchema(url);
  } else {
    process.env.DATABASE_URL = url;
  }
  prisma = new PrismaClient();
  await prisma.$connect();
  logger.info('MongoDB connected via Prisma');
  return prisma;
}

/** Sync indexes (e.g. unique email) to the database. Same as `npx prisma db push`. */
export function pushSchema(url) {
  const bin = path.join(serverRoot, 'node_modules/.bin/prisma');
  execFileSync(bin, ['db', 'push', '--skip-generate'], {
    cwd: serverRoot, env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore',
  });
}

export async function disconnectDB() {
  const { storage } = await import('../services/storage/index.js');
  await storage.close();
  if (prisma) await prisma.$disconnect();
  if (replSet) await replSet.stop();
}
