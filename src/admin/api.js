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

export const api = {
  me: () => request('GET', '/api/admin/me'),
  login: (password) => request('POST', '/api/admin/login', { password }),
  logout: () => request('POST', '/api/admin/logout', {}),
  draft: () => request('GET', '/api/admin/draft'),
};
