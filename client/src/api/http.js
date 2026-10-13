/**
 * Fetch wrapper for the SecureVault API.
 *  - Adds the in-memory access token.
 *  - On 401 it transparently calls /auth/refresh once (the refresh token is
 *    an httpOnly cookie the JavaScript can't read) and retries.
 *  - Also exposes the `http` adapter used by crypto/vault.js.
 */
import { useAuth } from '../stores/auth.js';

export const API = '/api/v1';

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

let refreshing = null;
/** Rotate the refresh cookie and get a new access token (deduplicated). */
export function refreshSession() {
  if (!refreshing) {
    refreshing = fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'securevault' } })
      .then(async (r) => {
        if (r.status === 204 || !r.ok) throw new HttpError(r.status === 204 ? 401 : r.status, 'SESSION_EXPIRED', 'Session expired');
        const data = await r.json();
        useAuth.getState().setSession(data.accessToken, data.user);
        return data;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function raw(url, init = {}, retry = true) {
  const token = useAuth.getState().accessToken;
  const headers = { 'X-Requested-With': 'securevault', ...(init.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  if (res.status === 401 && retry && token && !/\/auth\/(login|prelogin|register|refresh|2fa\/verify|recover)/.test(url)) {
    try { await refreshSession(); } catch { useAuth.getState().clear(); throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again'); }
    return raw(url, init, false);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new HttpError(res.status, body.error?.code || 'HTTP_ERROR', body.error?.message || `Request failed (${res.status})`);
  }
  return res;
}

/** JSON request helper: api('POST', '/files', body) */
export async function api(method, path, body) {
  const res = await raw(API + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

/** Adapter consumed by crypto/vault.js (upload/download of encrypted chunks). */
export const http = {
  json: (method, path, body) => api(method, path, body),
  async putBytes(url, bytes, direct) {
    if (direct) {
      const r = await fetch(url, { method: 'PUT', body: bytes });
      if (!r.ok) throw new HttpError(r.status, 'UPLOAD_FAILED', 'Chunk upload failed');
      return;
    }
    await raw(url, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'application/octet-stream' } });
  },
  async getBytes(url, direct) {
    const r = direct ? await fetch(url) : await raw(url);
    if (!r.ok) throw new HttpError(r.status, 'DOWNLOAD_FAILED', 'Chunk download failed');
    return new Uint8Array(await r.arrayBuffer());
  },
};
