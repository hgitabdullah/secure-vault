import { authenticator } from 'otplib';
import { setup, teardown, newUser, passwordLogin, request, getApp } from './helpers.js';

beforeAll(setup);
afterAll(teardown);
const app = () => getApp();
const authed = (u, m, p) => request(app())[m](`/api/v1${p}`).set('Authorization', `Bearer ${u.token}`);

describe('TOTP two-factor authentication', () => {
  let u; let secret; let backup;
  beforeAll(async () => { u = await newUser(); });

  test('setup returns secret, otpauth URI and QR data URL', async () => {
    const r = await authed(u, 'post', '/auth/2fa/setup');
    expect(r.status).toBe(200);
    expect(r.body.otpauth).toMatch(/^otpauth:\/\/totp\/SecureVault/);
    expect(r.body.qr).toMatch(/^data:image\/png;base64,/);
    secret = r.body.secret;
  });
  test('enable rejects a wrong code, accepts a valid one and returns 10 backup codes', async () => {
    expect((await authed(u, 'post', '/auth/2fa/enable').send({ code: '000000' })).status).toBe(400);
    const r = await authed(u, 'post', '/auth/2fa/enable').send({ code: authenticator.generate(secret) });
    expect(r.status).toBe(200);
    expect(r.body.backupCodes).toHaveLength(10);
    backup = r.body.backupCodes;
    expect((await authed(u, 'get', '/auth/me')).body.user.totpEnabled).toBe(true);
  });
  test('login now requires a second factor (no session until verified)', async () => {
    const { res } = await passwordLogin(u.email, u.password);
    expect(res.body.twoFactorRequired).toBe(true);
    expect(res.body.accessToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    const bad = await request(app()).post('/api/v1/auth/2fa/verify').send({ ticket: res.body.ticket, code: '123456' });
    expect(bad.status).toBe(401);
    const ok = await request(app()).post('/api/v1/auth/2fa/verify').send({ ticket: res.body.ticket, code: authenticator.generate(secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
  });
  test('a forged/expired ticket is rejected', async () => {
    const r = await request(app()).post('/api/v1/auth/2fa/verify').send({ ticket: 'abc.def.ghi', code: '123456' });
    expect(r.status).toBe(401);
  });
  test('backup codes work exactly once', async () => {
    const t1 = (await passwordLogin(u.email, u.password)).res.body.ticket;
    expect((await request(app()).post('/api/v1/auth/2fa/verify').send({ ticket: t1, code: backup[0] })).status).toBe(200);
    const t2 = (await passwordLogin(u.email, u.password)).res.body.ticket;
    expect((await request(app()).post('/api/v1/auth/2fa/verify').send({ ticket: t2, code: backup[0] })).status).toBe(401);
  });
  test('disable requires a valid code', async () => {
    expect((await authed(u, 'post', '/auth/2fa/disable').send({ code: '000000' })).status).toBe(400);
    expect((await authed(u, 'post', '/auth/2fa/disable').send({ code: authenticator.generate(secret) })).status).toBe(200);
    const { res } = await passwordLogin(u.email, u.password);
    expect(res.body.accessToken).toBeTruthy();
  });
  test('TOTP secret is encrypted at rest', async () => {
    const v = await newUser();
    const s = (await authed(v, 'post', '/auth/2fa/setup')).body.secret;
    await authed(v, 'post', '/auth/2fa/enable').send({ code: authenticator.generate(s) });
    const { db } = await import('./helpers.js');
    const row = await db().user.findUnique({ where: { id: v.user.id } });
    expect(row.totp.encSecret).not.toContain(s);
  });
});
