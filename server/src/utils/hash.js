/**
 * Server-side Argon2id (via hash-wasm, pure WebAssembly – no native build).
 * The client already derived its auth key with Argon2id; we hash it AGAIN so
 * a leaked database can't be used to log in ("defence in depth").
 */
import crypto from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

const PARAMS = process.env.NODE_ENV === 'test'
  ? { iterations: 1, memorySize: 1024, parallelism: 1 }
  : { iterations: 2, memorySize: 19456, parallelism: 1 }; // OWASP recommended minimum

export const hashSecret = (password) => argon2id({
  password, salt: crypto.randomBytes(16), hashLength: 32, outputType: 'encoded', ...PARAMS,
});
export const verifySecret = (hash, password) => argon2Verify({ password, hash }).catch(() => false);
