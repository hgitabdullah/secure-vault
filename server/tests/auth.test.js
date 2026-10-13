import { setup, teardown, newUser, passwordLogin, request, getApp, ORIGIN, FAST_KDF, db } from './helpers.js';
import { rewrapForPassword, parseRecoveryKey, recoveryKeys, unwrapKey, deriveLoginKeys, createAccountKeys } from '../../client/src/crypto/core.js';

beforeAll(setup);
afterAll(teardown);
const app = () => getApp();
const refresh = (cookie, headers = { 'X-Requested-With': 'securevault', Origin: ORIGIN }) =>
  request(app()).post('/api/v1/auth/refresh').set('Cookie', cookie).set(headers);

describe('registration', () => {
  test('creates an account, returns access token + httpOnly SameSite=Strict refresh cookie', async () => {
    const keys = await createAccountKeys('pass-Word-123!', FAST_KDF);
    const res = await request(app()).post('/api/v1/auth/register').send({ email: 'A@Example.com', name: 'A', ...keys.payload });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe('a@example.com');
    expect(res.body.user).not.toHaveProperty('authHash');
    const c = res.headers['set-cookie'][0];
    expect(c).toMatch(/HttpOnly/); expect(c).toMatch(/SameSite=Strict/); expect(c).toMatch(/Path=\/api\/v1\/auth/);
    const stored = await db().user.findUnique({ where: { email: 'a@example.com' } });
    expect(stored.authHash).toMatch(/^\$argon2id\$/); // server re-hashes the client auth key
    expect(stored.authHash).not.toContain(keys.payload.authKey);
  });
  test('rejects duplicate email with 409', async () => {
    const u = await newUser();
    const keys = await createAccountKeys('x-Password-1', FAST_KDF);
    const res = await request(app()).post('/api/v1/auth/register').send({ email: u.email, ...keys.payload });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
  test('validates input with zod (400)', async () => {
    const res = await request(app()).post('/api/v1/auth/register').send({ email: 'not-an-email', authKey: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
  test('NoSQL operator injection is stripped / rejected', async () => {
    const res = await request(app()).post('/api/v1/auth/login').send({ email: { $ne: null }, authKey: { $gt: '' } });
    expect(res.status).toBe(400);
  });
});

describe('login', () => {
  test('prelogin returns real salt for users and a stable fake salt for unknown emails', async () => {
    const u = await newUser();
    const a = await request(app()).post('/api/v1/auth/prelogin').send({ email: u.email });
    expect(a.body.kdfSalt).toBe(u.user.kdfSalt);
    const x1 = await request(app()).post('/api/v1/auth/prelogin').send({ email: 'ghost@nowhere.dev' });
    const x2 = await request(app()).post('/api/v1/auth/prelogin').send({ email: 'ghost@nowhere.dev' });
    expect(x1.body.kdfSalt).toBe(x2.body.kdfSalt);
    expect(x1.body.kdfParams.alg).toBe('argon2id');
  });
  test('correct password logs in and the master key unwraps', async () => {
    const u = await newUser();
    const { res, unwrap } = await passwordLogin(u.email, u.password);
    expect(res.status).toBe(200);
    expect(Buffer.from(await unwrap()).equals(Buffer.from(u.mk))).toBe(true);
  });
  test('wrong password → generic 401, logged as failed attempt', async () => {
    const u = await newUser();
    const { res } = await passwordLogin(u.email, 'wrong-password');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password');
    const act = await db().activity.findMany({ where: { userId: u.user.id, action: 'login.failed' } });
    expect(act.length).toBe(1);
  });
  test('unknown email → same generic 401', async () => {
    const { res } = await passwordLogin('nobody@test.dev', 'whatever');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password');
  });
  test('account locks after 10 failed attempts', async () => {
    const u = await newUser();
    for (let i = 0; i < 10; i++) await passwordLogin(u.email, 'bad');
    const { res } = await passwordLogin(u.email, u.password);
    expect(res.status).toBe(423);
  });
  test('rate limiter returns 429 on auth routes', async () => {
    process.env.TEST_RATE_LIMIT = '1';
    let last;
    for (let i = 0; i < 25; i++) last = await request(app()).post('/api/v1/auth/prelogin').send({ email: 'rl@test.dev' });
    delete process.env.TEST_RATE_LIMIT;
    expect(last.status).toBe(429);
  });
  test('protected routes need a valid token', async () => {
    expect((await request(app()).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app()).get('/api/v1/auth/me').set('Authorization', 'Bearer nope')).status).toBe(401);
  });
});

describe('sessions: refresh rotation, CSRF, logout', () => {
  test('refresh rotates the cookie; reusing the old cookie revokes the session', async () => {
    const u = await newUser();
    const r1 = await refresh(u.cookie);
    expect(r1.status).toBe(200);
    const newCookie = r1.headers['set-cookie'][0].split(';')[0];
    expect(newCookie).not.toBe(u.cookie);
    const reuse = await refresh(u.cookie); // stolen old token
    expect(reuse.status).toBe(401);
    expect((await refresh(newCookie)).status).toBe(401); // whole session revoked
  });
  test('no cookie → 204 (not signed in)', async () => {
    const r = await request(app()).post('/api/v1/auth/refresh').set('X-Requested-With', 'securevault');
    expect(r.status).toBe(204);
  });
  test('CSRF: missing custom header or foreign Origin is rejected', async () => {
    const u = await newUser();
    expect((await refresh(u.cookie, { Origin: ORIGIN })).status).toBe(403);
    expect((await refresh(u.cookie, { 'X-Requested-With': 'securevault', Origin: 'https://evil.example' })).status).toBe(403);
  });
  test('logout revokes the session and access token', async () => {
    const u = await newUser();
    const out = await request(app()).post('/api/v1/auth/logout').set('Cookie', u.cookie).set('X-Requested-With', 'securevault');
    expect(out.status).toBe(200);
    expect((await request(app()).get('/api/v1/auth/me').set('Authorization', `Bearer ${u.token}`)).status).toBe(401);
    expect((await refresh(u.cookie)).status).toBe(401);
  });
});

describe('account management', () => {
  test('update profile name', async () => {
    const u = await newUser();
    const r = await request(app()).patch('/api/v1/auth/me').set('Authorization', `Bearer ${u.token}`).send({ name: 'Jo Alex' });
    expect(r.body.user.name).toBe('Jo Alex');
  });
  test('change password re-wraps the SAME master key; old password stops working', async () => {
    const u = await newUser();
    const { authKey: currentAuthKey } = await deriveLoginKeys(u.password, u.user.kdfSalt, u.user.kdfParams);
    const payload = await rewrapForPassword(u.mk, 'New-Passw0rd!!', FAST_KDF);
    const r = await request(app()).post('/api/v1/auth/password').set('Authorization', `Bearer ${u.token}`).send({ currentAuthKey, ...payload });
    expect(r.status).toBe(200);
    expect((await passwordLogin(u.email, u.password)).res.status).toBe(401);
    const ok = await passwordLogin(u.email, 'New-Passw0rd!!');
    expect(ok.res.status).toBe(200);
    expect(Buffer.from(await ok.unwrap()).equals(Buffer.from(u.mk))).toBe(true);
  });
  test('change password requires the current password', async () => {
    const u = await newUser();
    const payload = await rewrapForPassword(u.mk, 'New-Passw0rd!!', FAST_KDF);
    const r = await request(app()).post('/api/v1/auth/password').set('Authorization', `Bearer ${u.token}`).send({ currentAuthKey: 'a'.repeat(64), ...payload });
    expect(r.status).toBe(401);
  });
  test('recovery key resets the password and keeps the master key; revokes sessions', async () => {
    const u = await newUser();
    const rk = parseRecoveryKey(u.recoveryKey);
    const { key, proof } = await recoveryKeys(rk);
    const bad = await request(app()).post('/api/v1/auth/recover/start').send({ email: u.email, recoveryProof: 'b'.repeat(64) });
    expect(bad.status).toBe(401);
    const start = await request(app()).post('/api/v1/auth/recover/start').send({ email: u.email, recoveryProof: proof });
    const mk = await unwrapKey(key, start.body.encMasterKeyRecovery);
    expect(Buffer.from(mk).equals(Buffer.from(u.mk))).toBe(true);
    const payload = await rewrapForPassword(mk, 'Recovered-Pass-1!', FAST_KDF);
    const r = await request(app()).post('/api/v1/auth/recover').send({ email: u.email, recoveryProof: proof, ...payload });
    expect(r.status).toBe(200);
    expect((await request(app()).get('/api/v1/auth/me').set('Authorization', `Bearer ${u.token}`)).status).toBe(401);
    const ok = await passwordLogin(u.email, 'Recovered-Pass-1!');
    expect(Buffer.from(await ok.unwrap()).equals(Buffer.from(u.mk))).toBe(true);
  });
  test('delete account requires password and removes everything', async () => {
    const u = await newUser();
    const wrong = await request(app()).delete('/api/v1/auth/me').set('Authorization', `Bearer ${u.token}`).send({ authKey: 'c'.repeat(64) });
    expect(wrong.status).toBe(401);
    const { authKey } = await deriveLoginKeys(u.password, u.user.kdfSalt, u.user.kdfParams);
    const r = await request(app()).delete('/api/v1/auth/me').set('Authorization', `Bearer ${u.token}`).send({ authKey });
    expect(r.status).toBe(200);
    expect(await db().user.findUnique({ where: { email: u.email } })).toBeNull();
  });
});

describe('security headers', () => {
  test('helmet sets CSP, nosniff, frame protections; no x-powered-by', async () => {
    const r = await request(app()).get('/api/v1/health');
    expect(r.headers['content-security-policy']).toMatch(/default-src 'none'/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
  test('CORS only allows the configured front-end origin', async () => {
    const ok = await request(app()).options('/api/v1/auth/login').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    const bad = await request(app()).options('/api/v1/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
  test('JSON bodies over 100kb are rejected with 413', async () => {
    const r = await request(app()).post('/api/v1/auth/prelogin').send({ email: 'a@b.co', pad: 'x'.repeat(200_000) });
    expect(r.status).toBe(413);
  });
});
