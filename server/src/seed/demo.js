/**
 * Seed a demo account (demo@securevault.app / Demo@12345) with folders and
 * properly ENCRYPTED sample files, by talking to the running API exactly like
 * the browser does (same crypto code from client/src/crypto).
 *
 * Usage:  npm run seed            (API must be running, API_URL defaults to http://localhost:5100)
 *         SEED_DEMO=1 npm start   (seeds automatically at boot)
 */
import { createNodeHttp } from './nodeHttp.js';
import { createAccountKeys, sealText, deriveLoginKeys, unwrapKey } from '../../../client/src/crypto/core.js';
import { uploadFile, createShare } from '../../../client/src/crypto/vault.js';

export const DEMO = { email: 'demo@securevault.app', password: 'Demo@12345', name: 'Jo Alex' };

const te = new TextEncoder();
const src = (name, type, data) => {
  const bytes = typeof data === 'string' ? te.encode(data) : data;
  return { name, type, size: bytes.length, slice: async (a, b) => bytes.slice(a, b) };
};

/** A tiny valid PNG (gradient) generated without dependencies. */
async function makePng(w = 320, h = 200) {
  const zlib = await import('node:zlib');
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 99 + (x / w) * 40; raw[o + 1] = 102 - (y / h) * 60 + (x / w) * 109; raw[o + 2] = 241 - (x / w) * 3;
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** Minimal one-page PDF. */
function makePdf(title) {
  const text = `BT /F1 24 Tf 72 720 Td (${title}) Tj ET BT /F1 12 Tf 72 690 Td (Encrypted with AES-256-GCM in your browser.) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return out;
}

export async function seedDemo(baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5100}`, log = console.log) {
  const http = createNodeHttp(baseUrl);
  let mk;
  try {
    const keys = await createAccountKeys(DEMO.password);
    await http.json('POST', '/auth/register', { email: DEMO.email, name: DEMO.name, ...keys.payload });
    mk = keys.masterKey;
  } catch (e) {
    if (e.code !== 'EMAIL_TAKEN') throw e;
    log('Demo account already exists – skipping seed');
    return false;
  }
  const http2 = http; // logged in via register response
  const login = async () => {
    const pre = await http2.json('POST', '/auth/prelogin', { email: DEMO.email });
    const { kek, authKey } = await deriveLoginKeys(DEMO.password, pre.kdfSalt, pre.kdfParams);
    const r = await http2.json('POST', '/auth/login', { email: DEMO.email, authKey });
    http2.state.token = r.accessToken;
    return unwrapKey(kek, r.user.encMasterKey);
  };
  mk = await login();

  const folder = async (name, parentId = null) => (await http.json('POST', '/folders', { encName: await sealText(mk, name), parentId })).folder.id;
  const work = await folder('Work Projects');
  const photos = await folder('Photos');
  const secrets = await folder('Secrets & IDs');
  const code = await folder('Source Code');
  await folder('Client Deliverables', work);

  const png = await makePng();
  const plan = await uploadFile(http, mk, src('Project-Plan-v3.pdf', 'application/pdf', makePdf('Project Plan v3')), { folderId: work });
  await uploadFile(http, mk, src('meeting-notes.md', 'text/markdown', '# Weekly sync\n\n- Ship SecureVault v1\n- Review threat model\n- Plan desktop sync app\n'), { folderId: work });
  await uploadFile(http, mk, src('sunset-gradient.png', 'image/png', png), { folderId: photos });
  await uploadFile(http, mk, src('passport-scan.png', 'image/png', await makePng(240, 160)), { folderId: secrets });
  await uploadFile(http, mk, src('production.env', 'text/plain', 'DATABASE_URL=mongodb+srv://example\nSTRIPE_KEY=sk_test_demo\n'), { folderId: secrets });
  await uploadFile(http, mk, src('server.js', 'text/javascript', "import express from 'express';\nconst app = express();\napp.get('/', (_q, r) => r.send('hello'));\napp.listen(3000);\n"), { folderId: code });
  const budget = await uploadFile(http, mk, src('budget-2026.csv', 'text/csv', 'month,income,expenses\nJan,4200,3100\nFeb,4300,2900\n'));
  await uploadFile(http, mk, src('budget-2026.csv', 'text/csv', 'month,income,expenses\nJan,4200,3100\nFeb,4300,2900\nMar,4500,3000\n'), { fileId: budget.id });
  await uploadFile(http, mk, src('todo.txt', 'text/plain', 'Buy domain\nDeploy to Render\nEnable 2FA\n'));
  await uploadFile(http, mk, src('cover-photo.png', 'image/png', await makePng(400, 220)));
  await http.json('PATCH', `/files/${plan.id}`, { favorite: true });
  await createShare(http, mk, { ...plan, name: 'Project-Plan-v3.pdf', mime: 'application/pdf' }, { label: 'Client review', maxDownloads: 5, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() });
  log(`Seeded demo account ${DEMO.email} / ${DEMO.password}`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemo().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
