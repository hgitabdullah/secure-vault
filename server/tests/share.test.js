import { setup, teardown, newUser, request, getApp, memFile, join, db, adapter } from './helpers.js';
import { uploadFile, createShare, openShareMeta, downloadShare } from '../../client/src/crypto/vault.js';

beforeAll(setup);
afterAll(teardown);
const app = () => getApp();
const authed = (u, m, p) => request(app())[m](`/api/v1${p}`).set('Authorization', `Bearer ${u.token}`);
const anon = () => adapter({ token: null });
const parse = (path) => { const [, token, k] = path.match(/^\/s\/([^#]+)#k=(.+)$/); return { token, k }; };
const data = new TextEncoder().encode('top secret contract v7');

describe('share links', () => {
  let u; let file;
  beforeAll(async () => {
    u = await newUser();
    const f = await uploadFile(u.http, u.mk, memFile('contract.pdf', data, 'application/pdf'));
    file = { ...f, name: 'contract.pdf', mime: 'application/pdf' };
  });

  test('public link (no password): metadata + download decrypt with the #fragment key', async () => {
    const { share, path } = await createShare(u.http, u.mk, file, { label: 'client' });
    expect(share.status).toBe('active');
    const { token, k } = parse(path);
    const row = await db().share.findUnique({ where: { token } });
    expect(JSON.stringify(row)).not.toContain(k); // the key is never sent to the server
    const meta = await openShareMeta(anon(), token, k);
    expect(meta.name).toBe('contract.pdf');
    expect(meta.ownerName).toBe('Test User');
    const out = join(await downloadShare(anon(), token, meta.linkKey, meta));
    expect(Buffer.from(out).toString()).toBe('top secret contract v7');
  });
  test('wrong fragment key cannot decrypt', async () => {
    const { path } = await createShare(u.http, u.mk, file);
    const { token } = parse(path);
    await expect(openShareMeta(anon(), token, 'A'.repeat(43))).rejects.toThrow();
  });
  test('password-protected: wrong password 401, right password decrypts', async () => {
    const { path } = await createShare(u.http, u.mk, file, { password: 'hunter22' });
    const { token, k } = parse(path);
    const meta = await openShareMeta(anon(), token, k);
    expect(meta.hasPassword).toBe(true);
    await expect(downloadShare(anon(), token, meta.linkKey, meta, 'nope')).rejects.toMatchObject({ status: 401 });
    const out = join(await downloadShare(anon(), token, meta.linkKey, meta, 'hunter22'));
    expect(Buffer.from(out).toString()).toBe('top secret contract v7');
  });
  test('download limit: link stops after maxDownloads (410)', async () => {
    const { path } = await createShare(u.http, u.mk, file, { maxDownloads: 1 });
    const { token, k } = parse(path);
    const meta = await openShareMeta(anon(), token, k);
    await downloadShare(anon(), token, meta.linkKey, meta);
    const r = await request(app()).get(`/api/v1/public/s/${token}`);
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe('LINK_LIMIT');
  });
  test('expired link returns 410', async () => {
    const { path, share } = await createShare(u.http, u.mk, file, { expiresAt: new Date(Date.now() + 60e3).toISOString() });
    await db().share.update({ where: { id: share.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await request(app()).get(`/api/v1/public/s/${parse(path).token}`);
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe('LINK_EXPIRED');
  });
  test('cannot create a link with a past expiry', async () => {
    await expect(createShare(u.http, u.mk, file, { expiresAt: new Date(Date.now() - 60e3).toISOString() })).rejects.toMatchObject({ status: 400 });
  });
  test('revoke: link stops working; other users cannot revoke', async () => {
    const { path, share } = await createShare(u.http, u.mk, file);
    const bob = await newUser();
    expect((await authed(bob, 'delete', `/shares/${share.id}`)).status).toBe(404);
    expect((await authed(u, 'delete', `/shares/${share.id}`)).status).toBe(200);
    expect((await request(app()).get(`/api/v1/public/s/${parse(path).token}`)).status).toBe(410);
  });
  test('owner lists their links with status; others see none of them', async () => {
    const list = (await authed(u, 'get', '/shares')).body.shares;
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(new Set(list.map((s) => s.status))).toEqual(new Set(['active', 'limit', 'expired', 'revoked']));
    const bob = await newUser();
    expect((await authed(bob, 'get', '/shares')).body.shares).toHaveLength(0);
  });
  test('bob cannot share alice\'s file', async () => {
    const bob = await newUser();
    const r = await authed(bob, 'post', '/shares').send({ fileId: file.id, encName: 'AAAAAAAAAAAA', encMime: 'AAAAAAAAAAAA', encFileKey: 'AAAAAAAAAAAA' });
    expect(r.status).toBe(404);
  });
  test('chunk endpoint requires a valid download ticket', async () => {
    const { path } = await createShare(u.http, u.mk, file);
    const r = await request(app()).get(`/api/v1/public/s/${parse(path).token}/parts/0?t=forged`);
    expect(r.status).toBe(401);
  });
});
