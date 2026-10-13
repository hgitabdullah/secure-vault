/**
 * Centralised configuration. Every value comes from environment variables
 * (see .env.example). Nothing secret is hard-coded: in development we
 * generate random secrets at boot so the app still runs out of the box.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const isProd = process.env.NODE_ENV === 'production';
const randomSecret = () => crypto.randomBytes(32).toString('hex');

function required(name, devFallback) {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`Missing required env var ${name}`);
  return devFallback;
}

export const env = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT || 5100),
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || '',
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5174').split(',').map((s) => s.trim()),
  publicApiUrl: process.env.PUBLIC_API_URL || '',
  jwtSecret: required('JWT_SECRET', randomSecret()),
  /** 32-byte hex key used to encrypt TOTP secrets at rest. */
  serverEncKey: required('SERVER_ENC_KEY', randomSecret()),
  accessTtlSec: Number(process.env.ACCESS_TTL_SEC || 900), // 15 minutes
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS || 30),
  defaultQuota: Number(process.env.DEFAULT_QUOTA_BYTES || 10 * 1024 ** 3), // 10 GiB
  maxChunkBytes: 8 * 1024 * 1024 + 1024, // 8 MiB of plaintext + GCM tag + slack
  storageDriver: process.env.STORAGE_DRIVER || (process.env.S3_BUCKET ? 's3' : 'local'),
  // fileURLToPath (not URL.pathname): on Windows .pathname gives "/C:/..." which breaks fs paths
  localStorageDir: process.env.LOCAL_STORAGE_DIR || fileURLToPath(new URL('../../storage', import.meta.url)),
  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT, // e.g. https://<account>.r2.cloudflarestorage.com
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT || 20),
};
