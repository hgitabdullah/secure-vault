/**
 * SecureVault crypto core – the heart of the zero-knowledge design.
 *
 * Runs in the browser (Web Crypto API) AND in Node 20 (globalThis.crypto),
 * so the seed script and tests use exactly the same code as the app.
 *
 * Key hierarchy
 * ─────────────
 *   password ──Argon2id(salt)──► 64 bytes ─┬─ KEK (32 B)      never leaves the device
 *                                          └─ authKey (32 B)  sent to server as hex (server re-hashes it)
 *   MK  (random 32 B master key)      stored as encMasterKey = AES-GCM(KEK, MK)
 *   RK  (random 32 B recovery key)    stored as encMasterKeyRecovery = AES-GCM(SHA256("sv-rk-enc"|RK), MK)
 *   FK  (random 32 B per file version) stored as encFileKey = AES-GCM(MK, FK)
 *   names / mime types                 stored as AES-GCM(MK, utf8)
 *
 * Every AES-GCM blob is base64(iv[12] || ciphertext || tag[16]).
 * File contents are split into 8 MiB chunks; chunk i uses
 *   iv = noncePrefix[8] || uint32be(i)   and   AAD = "sv-chunk:<i>:<count>"
 * so chunks can't be reordered, swapped between files or truncated unnoticed.
 */
import { argon2id } from 'hash-wasm';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const CHUNK_SIZE = 8 * 1024 * 1024;
export const DEFAULT_KDF = { alg: 'argon2id', m: 65536, t: 3, p: 1 }; // 64 MiB, 3 passes

/* ---------- encoding helpers ---------- */
export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
export function toB64(bytes) {
  let s = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const toB64Url = (b) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64Url = (s) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
export const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
export const sha256 = async (bytes) => new Uint8Array(await subtle.digest('SHA-256', bytes));

/* ---------- key derivation ---------- */
/**
 * Derive 64 bytes from a password. Argon2id is memory-hard (resists GPU
 * cracking). PBKDF2-SHA256 (600k iterations) is a fallback if WASM is unavailable.
 */
export async function deriveBytes(password, saltB64, params = DEFAULT_KDF) {
  const salt = fromB64(saltB64);
  if (params.alg === 'pbkdf2') {
    const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: params.iter || 600000 }, base, 512);
    return new Uint8Array(bits);
  }
  return argon2id({
    password, salt, parallelism: params.p, iterations: params.t, memorySize: params.m, hashLength: 64, outputType: 'binary',
  });
}

/** password → { kek (raw bytes), authKey (hex for the server) } */
export async function deriveLoginKeys(password, saltB64, params) {
  const out = await deriveBytes(password, saltB64, params);
  return { kek: out.slice(0, 32), authKey: toHex(out.slice(32)) };
}

/* ---------- AES-256-GCM ---------- */
const importAes = (raw) => subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

/** Encrypt bytes with a raw 32-byte key → base64(iv||ct). */
export async function seal(keyBytes, data, aad) {
  const iv = randomBytes(12);
  const opts = { name: 'AES-GCM', iv, ...(aad ? { additionalData: enc.encode(aad) } : {}) };
  const ct = new Uint8Array(await subtle.encrypt(opts, await importAes(keyBytes), data));
  return toB64(concat(iv, ct));
}
/** Decrypt base64(iv||ct). Throws if the key is wrong or data was tampered with (GCM tag check). */
export async function open(keyBytes, b64, aad) {
  const all = fromB64(b64);
  const opts = { name: 'AES-GCM', iv: all.subarray(0, 12), ...(aad ? { additionalData: enc.encode(aad) } : {}) };
  return new Uint8Array(await subtle.decrypt(opts, await importAes(keyBytes), all.subarray(12)));
}
export const sealText = (key, text) => seal(key, enc.encode(text), 'sv-text');
export const openText = async (key, b64) => dec.decode(await open(key, b64, 'sv-text'));
export const wrapKey = (kek, key) => seal(kek, key, 'sv-key');
export const unwrapKey = (kek, b64) => open(kek, b64, 'sv-key');

/* ---------- file chunks ---------- */
function chunkIv(prefix, index) {
  const iv = new Uint8Array(12);
  iv.set(prefix, 0);
  new DataView(iv.buffer).setUint32(8, index);
  return iv;
}
export const chunkCountFor = (size, chunkSize = CHUNK_SIZE) => Math.max(1, Math.ceil(size / chunkSize));

export async function encryptChunk(fileKey, noncePrefixB64, index, count, plain) {
  const iv = chunkIv(fromB64(noncePrefixB64), index);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`sv-chunk:${index}:${count}`) }, await importAes(fileKey), plain);
  return new Uint8Array(ct);
}
export async function decryptChunk(fileKey, noncePrefixB64, index, count, cipher) {
  const iv = chunkIv(fromB64(noncePrefixB64), index);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`sv-chunk:${index}:${count}`) }, await importAes(fileKey), cipher);
  return new Uint8Array(pt);
}

/* ---------- account bootstrap ---------- */
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
/** 32 random bytes shown as 52 base32 characters in groups of 4. */
export function formatRecoveryKey(bytes) {
  let bits = 0; let val = 0; let out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out.match(/.{1,4}/g).join('-');
}
export function parseRecoveryKey(str) {
  const clean = str.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let bits = 0; let val = 0; const out = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('Invalid recovery key');
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  if (out.length !== 32) throw new Error('Recovery key must be 52 characters');
  return new Uint8Array(out);
}
/** Recovery key → AES key for wrapping MK + a separate proof the server can hash. */
export async function recoveryKeys(rk) {
  return {
    key: await sha256(concat(enc.encode('sv-rk-enc'), rk)),
    proof: toHex(await sha256(concat(enc.encode('sv-rk-auth'), rk))),
  };
}

/** Everything the server needs to create an account (no secrets in plaintext). */
export async function createAccountKeys(password, kdfParams = DEFAULT_KDF) {
  const kdfSalt = toB64(randomBytes(16));
  const { kek, authKey } = await deriveLoginKeys(password, kdfSalt, kdfParams);
  const masterKey = randomBytes(32);
  const rk = randomBytes(32);
  const r = await recoveryKeys(rk);
  return {
    masterKey,
    recoveryKey: formatRecoveryKey(rk),
    payload: {
      authKey, kdfSalt, kdfParams,
      encMasterKey: await wrapKey(kek, masterKey),
      encMasterKeyRecovery: await wrapKey(r.key, masterKey),
      recoveryProof: r.proof,
    },
  };
}

/** New password → new salt/KEK/authKey and MK re-wrapped. Files are untouched. */
export async function rewrapForPassword(masterKey, newPassword, kdfParams = DEFAULT_KDF) {
  const kdfSalt = toB64(randomBytes(16));
  const { kek, authKey } = await deriveLoginKeys(newPassword, kdfSalt, kdfParams);
  return { authKey, kdfSalt, kdfParams, encMasterKey: await wrapKey(kek, masterKey) };
}

/* ---------- share links ---------- */
/** Share password → { key, proof }. Salt is random per link. */
export async function deriveSharePassword(password, saltB64) {
  const out = await deriveBytes(password, saltB64, { alg: 'argon2id', m: 19456, t: 2, p: 1 });
  return { key: out.slice(0, 32), proof: toHex(out.slice(32)) };
}
/** Effective wrapping key: link key alone, or SHA-256(linkKey || passwordKey). */
export const shareWrapKey = async (linkKey, pwKey) => (pwKey ? sha256(concat(linkKey, pwKey)) : linkKey);
