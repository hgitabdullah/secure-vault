import { ApiError } from '../utils/errors.js';

/**
 * validate({ body, params, query }) – run zod schemas and replace the
 * request data with the parsed (stripped & typed) values.
 */
export const validate = (schemas) => (req, _res, next) => {
  for (const part of ['body', 'params', 'query']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part] ?? {});
    if (!r.success) {
      const msg = r.error.issues.map((i) => `${i.path.join('.') || part}: ${i.message}`).join('; ');
      return next(new ApiError(400, 'VALIDATION_ERROR', msg));
    }
    if (part === 'query') req.validQuery = r.data; // req.query is a getter in some versions
    else req[part] = r.data;
  }
  next();
};
