/** Tiny client for the admin API. Throws Error(message) with `.status` on failure. */
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const enc = encodeURIComponent;

export const api = {
  me: () => request('GET', '/api/admin/me'),
  login: (password) => request('POST', '/api/admin/login', { password }),
  logout: () => request('POST', '/api/admin/logout', {}),
  draft: () => request('GET', '/api/admin/draft'),

  createObject: (obj) => request('POST', '/api/admin/objects', obj),
  patchObject: (id, patch) => request('PATCH', `/api/admin/objects/${enc(id)}`, patch),
  deleteObject: (id) => request('DELETE', `/api/admin/objects/${enc(id)}`),

  publish: (note) => request('POST', '/api/admin/publish', { note }),
  versions: () => request('GET', '/api/admin/versions'),
  restore: (version) => request('POST', '/api/admin/restore', { version }),
  assets: () => request('GET', '/api/admin/assets'),
  addAsset: (asset) => request('POST', '/api/admin/assets', asset),

  createScene: (scene) => request('POST', '/api/admin/scenes', scene),
  updateScene: (id, patch) => request('PUT', `/api/admin/scenes/${enc(id)}`, patch),
  deleteScene: (id) => request('DELETE', `/api/admin/scenes/${enc(id)}`),
};
