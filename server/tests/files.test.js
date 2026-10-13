import crypto from 'node:crypto';
import { setup, teardown, newUser, request, getApp, memFile, join, db } from './helpers.js';
import { uploadFile, downloadFile, decryptNames } from '../../client/src/crypto/vault.js';
import { sealText, CHUNK_SIZE } from '../../client/src/crypto/core.js';

beforeAll(setup);
afterAll(teardown);
const app = () => getApp();
const authed = (u, m, p) => request(app())[m](`/api/v1${p}`).set('Authorization', `Bearer ${u.token}`);

describe('upload / download (zero-knowledge)', () => {
  let u;
  beforeAll(async () => { u = await newUser(); });

  test('multi-chunk upload round-trips byte-exact and the server only stores ciphertext', async () => {
    const data = crypto.randomBytes(CHUNK_SIZE + 5000); // 2 chunks
    const f = await uploadFile(u.http, u.mk, memFile('secret.bin', new Uint8Array(data)));
    expect(f.size).toBe(data.length);
    const v = await db().version.findFirst({ where: { fileId: f.id } });
    expect(v.chunkCount).toBe(2);
    expect(v.storedBytes).toBe(data.length + 2 * 16); // GCM tags
    const row = await db().file.findUnique({ where: { id: f.id } });
    expect(row.encName).not.toContain('secret.bin');
    const out = join(await downloadFile(u.http, u.mk, f.id));
    expect(out.equals(data)).toBe(true);
  });
  test('empty and tiny files work', async () => {
    const f = await uploadFile(u.http, u.mk, memFile('empty.txt', new Uint8Array(0), 'text/plain'));
    expect(join(await downloadFile(u.http, u.mk, f.id)).length).toBe(0);
  });
  test('listing returns encrypted names that decrypt with the master key', async () => {
    const r = await authed(u, 'get', '/files?view=folder');
    const names = (await decryptNames(u.mk, r.body.files)).map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['secret.bin', 'empty.txt']));
  });
  test('storage usage is charged on completion', async () => {
    const me = await authed(u, 'get', '/auth/me');
    expect(me.body.user.storageUsed).toBe(CHUNK_SIZE + 5000);
  });
  test('chunk validation: out-of-range part, oversized chunk, completing with missing parts', async () => {
    const meta = { size: 100, chunkSize: CHUNK_SIZE, chunkCount: 1, encFileKey: await sealText(u.mk, 'k'), noncePrefix: 'AAAAAAAAAAA=', encName: await sealText(u.mk, 'x'), encMime: await sealText(u.mk, 'y') };
    const s = await authed(u, 'post', '/files').send(meta);
    expect(s.status).toBe(201);
    const vid = s.body.version.id;
    expect((await authed(u, 'put', `/uploads/${vid}/parts/5`).set('Content-Type', 'application/octet-stream').send(Buffer.alloc(50))).status).toBe(400);
    expect((await authed(u, 'post', `/uploads/${vid}/complete`)).status).toBe(409);
    expect((await authed(u, 'post', '/files').send({ ...meta, chunkCount: 3 })).status).toBe(400);
  });
  test('chunks over the 8 MiB limit are rejected (413)', async () => {
    const meta = { size: CHUNK_SIZE, chunkSize: CHUNK_SIZE, chunkCount: 1, encFileKey: await sealText(u.mk, 'k'), noncePrefix: 'AAAAAAAAAAA=', encName: await sealText(u.mk, 'x'), encMime: await sealText(u.mk, 'y') };
    const s = await authed(u, 'post', '/files').send(meta);
    const r = await authed(u, 'put', `/uploads/${s.body.version.id}/parts/0`).set('Content-Type', 'application/octet-stream').send(Buffer.alloc(CHUNK_SIZE + 4096));
    expect(r.status).toBe(413);
  });
});

describe('quota', () => {
  test('uploads beyond the quota are refused with 413 QUOTA_EXCEEDED', async () => {
    const u = await newUser();
    await db().user.update({ where: { id: u.user.id }, data: { storageQuota: 1000 } });
    await uploadFile(u.http, u.mk, memFile('a.txt', new Uint8Array(600)));
    await expect(uploadFile(u.http, u.mk, memFile('b.txt', new Uint8Array(600)))).rejects.toMatchObject({ status: 413, code: 'QUOTA_EXCEEDED' });
  });
  test('permanent delete frees quota', async () => {
    const u = await newUser();
    const f = await uploadFile(u.http, u.mk, memFile('a.txt', new Uint8Array(700)));
    expect((await authed(u, 'get', '/auth/me')).body.user.storageUsed).toBe(700);
    await authed(u, 'delete', `/files/${f.id}?permanent=true`);
    expect((await authed(u, 'get', '/auth/me')).body.user.storageUsed).toBe(0);
  });
});

describe('folders', () => {
  let u; let a; let b;
  beforeAll(async () => { u = await newUser(); });
  test('create, nest, rename', async () => {
    a = (await authed(u, 'post', '/folders').send({ encName: await sealText(u.mk, 'Work') })).body.folder;
    b = (await authed(u, 'post', '/folders').send({ encName: await sealText(u.mk, 'Sub'), parentId: a.id })).body.folder;
    expect(b.parentId).toBe(a.id);
    const r = await authed(u, 'patch', `/folders/${a.id}`).send({ encName: await sealText(u.mk, 'Work 2') });
    expect((await decryptNames(u.mk, [r.body.folder]))[0].name).toBe('Work 2');
    const list = await authed(u, 'get', `/files?view=folder&folder=${a.id}`);
    expect(list.body.folders.map((f) => f.id)).toEqual([b.id]);
  });
  test('cannot move a folder into itself or its descendant', async () => {
    expect((await authed(u, 'patch', `/folders/${a.id}`).send({ parentId: b.id })).status).toBe(400);
    expect((await authed(u, 'patch', `/folders/${a.id}`).send({ parentId: a.id })).status).toBe(400);
  });
  test('upload into folder, move file to root, rename and favorite', async () => {
    const f = await uploadFile(u.http, u.mk, memFile('in.txt', new Uint8Array([1, 2, 3])), { folderId: b.id });
    expect(f.folderId).toBe(b.id);
    const moved = await authed(u, 'patch', `/files/${f.id}`).send({ folderId: null, favorite: true, encName: await sealText(u.mk, 'renamed.txt') });
    expect(moved.body.file.folderId).toBeNull();
    const favs = await authed(u, 'get', '/files?view=favorites');
    expect((await decryptNames(u.mk, favs.body.files))[0].name).toBe('renamed.txt');
  });
  test('trashing a folder hides its files from "all"; permanent delete removes contents', async () => {
    const f = await uploadFile(u.http, u.mk, memFile('deep.txt', new Uint8Array([9])), { folderId: b.id });
    await authed(u, 'delete', `/folders/${a.id}`);
    const all = await authed(u, 'get', '/files?view=all');
    expect(all.body.files.find((x) => x.id === f.id)).toBeUndefined();
    const trash = await authed(u, 'get', '/files?view=trash');
    expect(trash.body.folders.map((x) => x.id)).toContain(a.id);
    await authed(u, 'post', `/folders/${a.id}/restore`);
    expect((await authed(u, 'get', '/files?view=all')).body.files.find((x) => x.id === f.id)).toBeTruthy();
    expect((await authed(u, 'delete', `/folders/${a.id}?permanent=true`)).status).toBe(200);
    expect(await db().file.findUnique({ where: { id: f.id } })).toBeNull();
    expect(await db().folder.findUnique({ where: { id: b.id } })).toBeNull();
  });
});

describe('trash', () => {
  test('trash → restore → trash → empty trash', async () => {
    const u = await newUser();
    const f = await uploadFile(u.http, u.mk, memFile('t.txt', new Uint8Array(10)));
    await authed(u, 'delete', `/files/${f.id}`);
    expect((await authed(u, 'get', '/files?view=folder')).body.files).toHaveLength(0);
    expect((await authed(u, 'get', '/files?view=trash')).body.files).toHaveLength(1);
    await authed(u, 'post', `/files/${f.id}/restore`);
    expect((await authed(u, 'get', '/files?view=folder')).body.files).toHaveLength(1);
    await authed(u, 'delete', `/files/${f.id}`);
    const r = await authed(u, 'delete', '/trash');
    expect(r.body.freed).toBe(10);
    expect((await authed(u, 'get', '/files?view=trash')).body.files).toHaveLength(0);
  });
});

describe('versions', () => {
  test('upload new version, list, download old, restore', async () => {
    const u = await newUser();
    const v1 = new TextEncoder().encode('version one');
    const v2 = new TextEncoder().encode('version two!!');
    const f = await uploadFile(u.http, u.mk, memFile('doc.txt', v1));
    await uploadFile(u.http, u.mk, memFile('doc.txt', v2), { fileId: f.id });
    const list = (await authed(u, 'get', `/files/${f.id}/versions`)).body;
    expect(list.versions.map((v) => v.number)).toEqual([2, 1]);
    expect(list.currentVersionId).toBe(list.versions[0].id);
    expect(join(await downloadFile(u.http, u.mk, f.id)).toString()).toBe('version two!!');
    const old = list.versions[1];
    expect(join(await downloadFile(u.http, u.mk, f.id, { versionId: old.id })).toString()).toBe('version one');
    const r = await authed(u, 'post', `/files/${f.id}/versions/${old.id}/restore`);
    expect(r.body.file.currentVersionId).toBe(old.id);
    expect(join(await downloadFile(u.http, u.mk, f.id)).toString()).toBe('version one');
    expect((await authed(u, 'get', '/auth/me')).body.user.storageUsed).toBe(v1.length + v2.length);
  });
});

describe('authorization (ownership checks everywhere)', () => {
  let alice; let bob; let file; let folder; let vid;
  beforeAll(async () => {
    alice = await newUser(); bob = await newUser();
    folder = (await authed(alice, 'post', '/folders').send({ encName: await sealText(alice.mk, 'Private') })).body.folder;
    file = await uploadFile(alice.http, alice.mk, memFile('alice.txt', new Uint8Array([1, 2, 3])));
    vid = file.currentVersionId;
  });
  test.each([
    ['get', () => `/files/${file.id}/download`], ['patch', () => `/files/${file.id}`], ['delete', () => `/files/${file.id}`],
    ['post', () => `/files/${file.id}/restore`], ['get', () => `/files/${file.id}/versions`], ['get', () => `/uploads/${vid}/parts/0`],
    ['patch', () => `/folders/${folder.id}`], ['delete', () => `/folders/${folder.id}`], ['get', () => `/files?view=folder&folder=${folder.id}`],
  ])('bob gets 404 on %s %s', async (m, p) => {
    const r = await authed(bob, m, p()).send(m === 'patch' ? { favorite: true } : undefined);
    expect(r.status).toBe(404);
  });
  test('bob cannot upload into alice\'s folder or add a version to her file', async () => {
    await expect(uploadFile(bob.http, bob.mk, memFile('x', new Uint8Array(1)), { folderId: folder.id })).rejects.toMatchObject({ status: 404 });
    await expect(uploadFile(bob.http, bob.mk, memFile('x', new Uint8Array(1)), { fileId: file.id })).rejects.toMatchObject({ status: 404 });
  });
  test('bob cannot move his file into alice\'s folder', async () => {
    const f = await uploadFile(bob.http, bob.mk, memFile('b', new Uint8Array(1)));
    expect((await authed(bob, 'patch', `/files/${f.id}`).send({ folderId: folder.id })).status).toBe(404);
  });
  test('invalid ids are rejected cleanly', async () => {
    expect((await authed(bob, 'get', '/files/not-an-id/download')).status).toBe(400);
  });
  test('alice\'s file is untouched', async () => {
    const row = await db().file.findUnique({ where: { id: file.id } });
    expect(row.trashed).toBe(false); expect(row.favorite).toBe(false);
  });
});

describe('devices & activity', () => {
  test('list devices, revoke another device → its token stops working', async () => {
    const u = await newUser();
    const { passwordLogin } = await import('./helpers.js');
    const second = await passwordLogin(u.email, u.password);
    const devices = (await authed(u, 'get', '/devices')).body.devices;
    expect(devices).toHaveLength(2);
    expect(devices.filter((d) => d.current)).toHaveLength(1);
    const other = devices.find((d) => !d.current);
    expect((await authed(u, 'delete', `/devices/${other.id}`)).status).toBe(200);
    expect((await request(app()).get('/api/v1/auth/me').set('Authorization', `Bearer ${second.res.body.accessToken}`)).status).toBe(401);
    const bob = await newUser();
    const bd = (await authed(bob, 'get', '/devices')).body.devices[0];
    expect((await authed(u, 'delete', `/devices/${bd.id}`)).status).toBe(404);
  });
  test('activity log records logins and file actions', async () => {
    const u = await newUser();
    await uploadFile(u.http, u.mk, memFile('a', new Uint8Array(1)));
    const items = (await authed(u, 'get', '/activity')).body.items.map((i) => i.action);
    expect(items).toEqual(expect.arrayContaining(['account.created', 'login', 'file.upload']));
  });
});
