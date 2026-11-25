/**
 * Web search for NPCs. Provider is picked from env:
 *   TAVILY_API_KEY        -> Tavily (default; built for LLM grounding)
 *   BRAVE_SEARCH_API_KEY  -> Brave Search
 * Results can be restricted to a list of domains (the NPC's reference domains).
 */
const MAX_RESULTS = 5;

export function searchAvailable() {
  return Boolean(process.env.TAVILY_API_KEY || process.env.BRAVE_SEARCH_API_KEY);
}

export function hostMatches(host, domains) {
  if (!domains?.length) return true;
  const h = host.toLowerCase().replace(/^www\./, '');
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

function filterDomains(results, domains) {
  return results.filter((r) => {
    try {
      return hostMatches(new URL(r.url).hostname, domains);
    } catch {
      return false;
    }
  });
}

async function tavily(query, domains) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, max_results: MAX_RESULTS, include_domains: domains?.length ? domains : undefined }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const data = await res.json();
  return (data.results || []).map((r) => ({ title: r.title, url: r.url, snippet: String(r.content || '').slice(0, 500) }));
}

async function brave(query, domains) {
  const q = domains?.length ? `${query} ${domains.map((d) => `site:${d}`).join(' OR ')}` : query;
  const url = `https://api.search.brave.com/res/v1/web/search?count=${MAX_RESULTS}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'x-subscription-token': process.env.BRAVE_SEARCH_API_KEY },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Brave search failed (${res.status})`);
  const data = await res.json();
  return (data.web?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: String(r.description || '').replace(/<[^>]+>/g, '').slice(0, 500) }));
}

/** Returns up to 5 { title, url, snippet }. */
export async function webSearch(query, { domains = [] } = {}) {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) throw new Error('empty search query');
  let results;
  if (process.env.TAVILY_API_KEY) results = await tavily(q, domains);
  else if (process.env.BRAVE_SEARCH_API_KEY) results = await brave(q, domains);
  else throw new Error('web search is not configured (set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY)');
  return filterDomains(results, domains).slice(0, MAX_RESULTS);
}
