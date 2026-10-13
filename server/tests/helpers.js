/**
 * Test helpers: in-memory MongoDB replica set (via connectDB), the Express app,
 * and a supertest-backed `http` adapter so tests use the REAL client crypto
 * (client/src/crypto) – uploads in tests are genuinely encrypted.
 */
import request from 'supertest';
import { connectDB, disconnectDB, prisma } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { createAccountKeys, deriveLoginKeys, unwrapKey } from '../../client/src/crypto/core.js';

export const FAST_KDF = { alg: 'argon2id', m: 1024, t: 1, p: 1 }; // fast params for tests only
export const ORIGIN = 'http://localhost:5174';
let app;

export async function setup() {
  // Fresh in-memory replica set per test file – never the real DB from .env.
  // TEST_DATABASE_URL (db name must contain "test"; it is WIPED) is for machines where mongod can't run.
  const testUrl = process.env.TEST_DATABASE_URL;
  for (const k of ['DATABASE_URL', 'MONGODB_URI', 'MONGO_URI']) delete process.env[k];
  if (testUrl) {
    if (!/\/[^/?]*test[^/?]*(\?|$)/i.test(testUrl)) throw new Error('TEST_DATABASE_URL database name must contain "test"');
    process.env.DATABASE_URL = testUrl;
  }
  await connectDB();
  if (testUrl) await prisma.$runCommandRaw({ dropDatabase: 1 });
  app = createApp();
  return app;
}
export async function teardown() { await disconnectDB(); }
export const db = () => prisma;
export const getApp = () => app;

/** Make an http adapter bound to a user's access token. */
export function adapter(state) {
  const auth = (r) => (state.token ? r.set('Authorization', `Bearer ${state.token}`) : r);
  const strip = (u) => u.replace(/^https?:\/\/[^/]+/, '');
  return {
    state,
    async json(method, path, body) {
      let r = auth(request(app)[method.toLowerCase()](`/api/v1${path}`));
      if (body !== undefined) r = r.send(body);
      const res = await r;
      if (res.status >= 400) {
        const e = new Error(res.body?.error?.message || `HTTP ${res.status}`); e.status = res.status; e.code = res.body?.error?.code; throw e;
      }
      return res.body;
    },
    async putBytes(url, bytes) {
      const res = await auth(request(app).put(strip(url))).set('Content-Type', 'application/octet-stream').send(Buffer.from(bytes));
      if (res.status >= 400) { const e = new Error(res.body?.error?.message); e.status = res.status; throw e; }
    },
    async getBytes(url) {
      const res = await auth(request(app).get(strip(url))).buffer(true).parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
      if (res.status >= 400) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      return new Uint8Array(res.body);
    },
  };
}

let n = 0;
/** Register a fresh user; returns { email, password, token, cookie, mk, http, recoveryKey, user }. */
export async function newUser(password = 'Sup3r-Secret-pass!') {
  const email = `user${Date.now()}${n++}@test.dev`;
  const keys = await createAccountKeys(password, FAST_KDF);
  const res = await request(app).post('/api/v1/auth/register').send({ email, name: 'Test User', ...keys.payload });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  const state = { token: res.body.accessToken };
  return {
    email, password, token: res.body.accessToken, cookie: res.headers['set-cookie'][0].split(';')[0],
    mk: keys.masterKey, recoveryKey: keys.recoveryKey, user: res.body.user, http: adapter(state), state,
  };
}

/** Full password login (returns raw supertest response + derived keys). */
export async function passwordLogin(email, password) {
  const pre = await request(app).post('/api/v1/auth/prelogin').send({ email });
  const { kek, authKey } = await deriveLoginKeys(password, pre.body.kdfSalt, pre.body.kdfParams);
  const res = await request(app).post('/api/v1/auth/login').send({ email, authKey });
  return { res, kek, authKey, unwrap: () => unwrapKey(kek, res.body.user.encMasterKey) };
}

/** A tiny in-memory "file" source for uploadFile(). */
export const memFile = (name, bytes, type = 'application/octet-stream') => ({
  name, type, size: bytes.length, slice: async (a, b) => bytes.slice(a, b),
});
export const join = (chunks) => Buffer.concat(chunks.map((c) => Buffer.from(c)));
export { request };
