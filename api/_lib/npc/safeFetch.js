/**
 * Server-side fetch for untrusted URLs (NPC scraper / live page fetch), with SSRF protection:
 * - only http(s), only default-ish ports (80/443/8080/8443)
 * - every hop's hostname is DNS-resolved and rejected if any address is private, loopback,
 *   link-local, CGNAT, multicast or otherwise non-public (IPv4 and IPv6)
 * - redirects are followed manually (max 3) so each hop is re-checked
 * - timeout, response size cap and content-type allowlist
 * Note: there is a small DNS-rebinding window between our lookup and fetch's own lookup;
 * acceptable for read-only GETs of public pages from a serverless function.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const TEXT_TYPES = /^(text\/(html|plain|markdown)|application\/(xhtml\+xml|json|xml))/i;
export const USER_AGENT = 'MokisWorldNPC/1.0 (reference fetcher)';

export class FetchBlockedError extends Error {}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

export function isPublicIp(ip) {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return !V4_BLOCKS.some(([base, mask]) => ((n & mask) >>> 0) === base);
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    if (v === '::' || v === '::1') return false;
    if (/^f[cd]/.test(v)) return false;        // fc00::/7 unique local
    if (/^fe[89ab]/.test(v)) return false;     // fe80::/10 link-local
    if (/^ff/.test(v)) return false;           // multicast
    if (/^2001:0?db8:/.test(v)) return false;  // documentation
    if (/^64:ff9b:/.test(v)) return false;     // NAT64 (could map to private v4)
    return true;
  }
  return false;
}

export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError(`invalid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchBlockedError(`only http(s) URLs are allowed: ${raw}`);
  if (url.username || url.password) throw new FetchBlockedError('URLs with credentials are not allowed');
  if (!ALLOWED_PORTS.has(url.port)) throw new FetchBlockedError(`port ${url.port} is not allowed`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) throw new FetchBlockedError(`host not allowed: ${host}`);
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true }).catch(() => {
    throw new FetchBlockedError(`could not resolve ${host}`);
  });
  if (!addrs.length || addrs.some((a) => !isPublicIp(a.address))) throw new FetchBlockedError(`host resolves to a non-public address: ${host}`);
  return url;
}

/** Reads the body up to MAX_BYTES, then stops. */
async function readCapped(res) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      chunks.push(value.subarray(0, value.byteLength - (total - MAX_BYTES)));
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

/** GET a public URL. Returns { url (final), status, contentType, body }. Throws FetchBlockedError / Error. */
export async function safeFetch(raw, { timeoutMs = TIMEOUT_MS } = {}) {
  let url = await assertPublicUrl(raw);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (hop === MAX_REDIRECTS) throw new Error('too many redirects');
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).href);
      continue;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.href}`);
    if (contentType && !TEXT_TYPES.test(contentType)) throw new Error(`unsupported content type "${contentType}"`);
    return { url: url.href, status: res.status, contentType, body: await readCapped(res) };
  }
  throw new Error('too many redirects');
}
