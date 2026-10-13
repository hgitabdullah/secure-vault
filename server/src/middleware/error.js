import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

/** Uniform JSON errors: { error: { code, message } }. No stack traces leak to clients. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request too large' } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } });
  }
  if (err.name === 'CastError') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
  const status = err.status || 500;
  if (status >= 500) logger.error({ err }, 'Unhandled error');
  res.status(status).json({
    error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Something went wrong' : err.message },
  });
}
