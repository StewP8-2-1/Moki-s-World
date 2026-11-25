/** Small helpers shared by every function in /api. */

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers });
}

export function error(status, message) {
  return json({ error: message }, status);
}

/** Wrap a handler so thrown errors become JSON responses instead of crashes. */
export function handle(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      return error(status, status >= 500 && !err.status ? 'Internal server error' : err.message);
    }
  };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}
