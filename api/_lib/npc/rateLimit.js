/**
 * Fixed-window rate limits for the public NPC chat, stored in Neon (table npc_rate), so they hold
 * across serverless instances. IPs are hashed before storage.
 *   per IP:  NPC_RATE_PER_IP messages per NPC_RATE_WINDOW_S (default 20 per 600 s)
 *   global:  NPC_DAILY_LIMIT messages per 24 h across all players (default 2000) — a cost ceiling
 */
import { createHash } from 'node:crypto';
import { HttpError } from '../http.js';

const envInt = (name, def) => {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : request.headers.get('x-real-ip') || 'unknown').trim();
}

const hashIp = (ip) => createHash('sha256').update(`${process.env.AUTH_SECRET || 'moki'}:${ip}`).digest('hex').slice(0, 32);

/** Increment a counter; returns the count within the current window. */
async function hit(sql, key, windowSeconds) {
  const rows = await sql`
    INSERT INTO npc_rate (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN npc_rate.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE npc_rate.count + 1 END,
      window_start = CASE WHEN npc_rate.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE npc_rate.window_start END
    RETURNING count`;
  return rows[0].count;
}

/** Throws 429 when either limit is exceeded. */
export async function enforceRateLimit(sql, request) {
  const perIp = envInt('NPC_RATE_PER_IP', 20);
  const windowS = envInt('NPC_RATE_WINDOW_S', 600);
  const daily = envInt('NPC_DAILY_LIMIT', 2000);

  const [ipCount, dayCount] = await Promise.all([
    hit(sql, `ip:${hashIp(clientIp(request))}`, windowS),
    hit(sql, 'global:day', 86400),
  ]);
  // Occasionally clear out stale per-IP rows.
  if (Math.random() < 0.02) await sql`DELETE FROM npc_rate WHERE key LIKE 'ip:%' AND window_start < now() - interval '1 day'`;

  if (dayCount > daily) throw new HttpError(429, 'The NPCs are resting for today — come back tomorrow!');
  if (ipCount > perIp) throw new HttpError(429, 'Whoa, slow down! Try again in a few minutes.');
}
