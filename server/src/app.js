/**
 * Express application (exported separately from the server so tests can use it).
 * Security middleware order matters: headers → CORS → parsers → sanitize → routes.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { mongoSanitize } from './middleware/security.js';
import { errorHandler } from './middleware/error.js';
import { logger } from './utils/logger.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import fileRoutes from './routes/files.js';
import { shares, publicShares } from './routes/shares.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render/Railway/Vercel proxies

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] }, // API serves JSON/bytes only
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: env.isProd,
  }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || env.clientOrigin.includes(origin)),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));
  app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () => logger.debug({ m: req.method, u: req.path, s: res.statusCode, ms: Date.now() - t }));
    next();
  });
  app.use(rateLimit({ windowMs: 60e3, limit: 1200, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => env.isTest }));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  app.use(mongoSanitize);

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true, storage: env.storageDriver }));
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/shares', shares);
  app.use('/api/v1/public/s', publicShares);
  app.use('/api/v1', accountRoutes);
  app.use('/api/v1', fileRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.use(errorHandler);
  return app;
}
