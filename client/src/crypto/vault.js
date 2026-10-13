/**
 * High-level vault operations built on crypto/core.js.
 * Environment-agnostic: they take an `http` adapter, so the React app,
 * the seed script and the end-to-end tests all share this exact code.
 *
 * http adapter interface:
 *   json(method, path, body?)         → parsed JSON (throws on error)
 *   putBytes(url, bytes, direct)      → upload one encrypted chunk
 *   getBytes(url, direct)             → Uint8Array of one encrypted chunk
 * `direct` = true means a pre-signed S3/R2 URL (no auth header needed).
 */
import {
  CHUNK_SIZE, randomBytes, toB64, toB64Url, fromB64Url, sealText, openText, wrapKey, unwrapKey,
  encryptChunk, decryptChunk, chunkCountFor, seal, open, deriveSharePassword, shareWrapKey,
} from './core.js';

/**
 * Encrypt and upload a file (or a new version when `fileId` is given).
 * `source` = { name, type, size, slice(start, end) → Promise<Uint8Array> }.
 */
export async function uploadFile(http, mk, source, { folderId = null, fileId = null, onProgress, signal } = {}) {
  const fileKey = randomBytes(32); // a fresh AES-256 key for this file version
  const noncePrefix = toB64(randomBytes(8));
  const size = source.size;
  const chunkCount = chunkCountFor(size);
  const meta = { size, chunkSize: CHUNK_SIZE, chunkCount, encFileKey: await wrapKey(mk, fileKey), noncePrefix };
  const started = fileId
    ? await http.json('POST', `/files/${fileId}/versions`, meta)
    : await http.json('POST', '/files', {
      ...meta, folderId,
      encName: await sealText(mk, source.name),
      encMime: await sealText(mk, source.type || 'application/octet-stream'),
    });
  let sent = 0;
  for (const part of started.parts) {
    if (signal?.aborted) throw new Error('Upload cancelled');
    const start = part.n * CHUNK_SIZE;
    const plain = await source.slice(start, Math.min(size, start + CHUNK_SIZE));
    onProgress?.({ phase: 'encrypting', chunk: part.n + 1, chunkCount, sent, size });
    const cipher = await encryptChunk(fileKey, noncePrefix, part.n, chunkCount, plain);
    await http.putBytes(part.url, cipher, part.direct);
    if (part.direct) await http.json('POST', `/uploads/${started.version.id}/parts/${part.n}/done`);
    sent += plain.length;
    onProgress?.({ phase: 'uploading', chunk: part.n + 1, chunkCount, sent, size });
  }
  const done = await http.json('POST', `/uploads/${started.version.id}/complete`);
  return done.file;
}

/** Download + decrypt chunk by chunk. Returns an array of plaintext Uint8Array chunks. */
export async function downloadFile(http, mk, fileId, { versionId, onProgress } = {}) {
  const q = versionId ? `?version=${versionId}` : '';
  const { version, parts } = await http.json('GET', `/files/${fileId}/download${q}`);
  const fileKey = await unwrapKey(mk, version.encFileKey);
  return fetchAndDecrypt(http, fileKey, version, parts, onProgress);
}

async function fetchAndDecrypt(http, fileKey, v, parts, onProgress) {
  const out = []; let got = 0;
  for (const part of parts) {
    const cipher = await http.getBytes(part.url, part.direct);
    const plain = await decryptChunk(fileKey, v.noncePrefix, part.n, v.chunkCount, cipher);
    out.push(plain); got += plain.length;
    onProgress?.({ received: got, size: v.size });
  }
  if (got !== v.size) throw new Error('Decrypted size mismatch – file may be corrupted');
  return out;
}

/** Decrypt names/mime types for a list of files or folders (bad entries get a placeholder). */
export async function decryptNames(mk, items) {
  return Promise.all(items.map(async (it) => {
    const name = await openText(mk, it.encName).catch(() => '⚠ undecryptable');
    const mime = it.encMime ? await openText(mk, it.encMime).catch(() => 'application/octet-stream') : undefined;
    return { ...it, name, mime };
  }));
}

/**
 * Create a share link. Returns the full link path including the #k=<linkKey> fragment.
 * The link key is random; with a password, the FK is wrapped with SHA-256(linkKey||Argon2id(pw)).
 */
export async function createShare(http, mk, file, { password, expiresAt, maxDownloads, label } = {}) {
  const { version } = await http.json('GET', `/files/${file.id}/download`);
  const fileKey = await unwrapKey(mk, version.encFileKey);
  const linkKey = randomBytes(32);
  let passSalt; let passProof; let pwKey;
  if (password) {
    passSalt = toB64(randomBytes(16));
    const d = await deriveSharePassword(password, passSalt);
    pwKey = d.key; passProof = d.proof;
  }
  const wk = await shareWrapKey(linkKey, pwKey);
  const { share } = await http.json('POST', '/shares', {
    fileId: file.id, label,
    encName: await seal(linkKey, new TextEncoder().encode(file.name), 'sv-share-name'),
    encMime: await seal(linkKey, new TextEncoder().encode(file.mime || 'application/octet-stream'), 'sv-share-name'),
    encFileKey: await seal(wk, fileKey, 'sv-share-key'),
    passSalt, passProof, expiresAt: expiresAt || null, maxDownloads: maxDownloads || null,
  });
  return { share, path: `/s/${share.token}#k=${toB64Url(linkKey)}` };
}

/** Public side: read metadata of a share (decrypting name with the fragment key). */
export async function openShareMeta(http, token, linkKeyB64Url) {
  const meta = await http.json('GET', `/public/s/${token}`);
  const linkKey = fromB64Url(linkKeyB64Url);
  const td = new TextDecoder();
  const name = td.decode(await open(linkKey, meta.encName, 'sv-share-name'));
  const mime = td.decode(await open(linkKey, meta.encMime, 'sv-share-name'));
  return { ...meta, name, mime, linkKey };
}

/** Public side: download + decrypt a shared file. */
export async function downloadShare(http, token, linkKey, meta, password, onProgress) {
  let pwKey; let passProof;
  if (meta.hasPassword) {
    const d = await deriveSharePassword(password || '', meta.passSalt);
    pwKey = d.key; passProof = d.proof;
  }
  const dl = await http.json('POST', `/public/s/${token}/download`, passProof ? { passProof } : {});
  const fileKey = await open(await shareWrapKey(linkKey, pwKey), dl.encFileKey, 'sv-share-key');
  const parts = dl.parts.map((p) => (p.direct ? p : { ...p, url: `${p.url}?t=${encodeURIComponent(dl.ticket)}` }));
  return fetchAndDecrypt(http, fileKey, dl, parts, onProgress);
}
