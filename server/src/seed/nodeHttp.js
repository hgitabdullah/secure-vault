/**
 * Node implementation of the `http` adapter used by client/src/crypto/vault.js,
 * so scripts can drive the API with the exact same crypto code as the browser.
 */
export function createNodeHttp(baseUrl) {
  const state = { token: null, cookie: null };
  const api = `${baseUrl}/api/v1`;
  const headers = (extra = {}) => ({
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...(state.cookie ? { Cookie: state.cookie } : {}),
    'X-Requested-With': 'securevault', ...extra,
  });
  const fail = async (res) => {
    const body = await res.json().catch(() => ({}));
    const e = new Error(body.error?.message || `HTTP ${res.status}`);
    e.status = res.status; e.code = body.error?.code; throw e;
  };
  return {
    state,
    async json(method, path, body) {
      const res = await fetch(api + path, {
        method, headers: headers(body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined,
      });
      const sc = res.headers.get('set-cookie');
      if (sc) state.cookie = sc.split(';')[0];
      if (!res.ok) await fail(res);
      return res.json();
    },
    async putBytes(url, bytes, direct) {
      const res = await fetch(direct ? url : baseUrl + url, { method: 'PUT', headers: direct ? {} : headers({ 'Content-Type': 'application/octet-stream' }), body: bytes });
      if (!res.ok) await fail(res);
    },
    async getBytes(url, direct) {
      const res = await fetch(direct ? url : baseUrl + url, { headers: direct ? {} : headers() });
      if (!res.ok) await fail(res);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
