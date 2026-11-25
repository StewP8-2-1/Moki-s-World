/**
 * Web scraper for NPC reference material: fetch a public page and extract readable text.
 * Uses Mozilla Readability over linkedom (works in serverless, no headless browser), with a
 * plain tag-strip fallback. JavaScript-rendered pages will come back thin — that's expected.
 */
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { safeFetch } from './safeFetch.js';

export const MAX_TEXT = 12000;

const clean = (s) => String(s || '')
  .replace(/\r/g, '')
  .replace(/[ \t\f\v ]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

function stripTags(html) {
  return html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** HTML -> { title, text }. Exported for tests. */
export function extractText(html, url) {
  try {
    const { document } = parseHTML(html);
    const title = clean(document.querySelector('title')?.textContent || '');
    const article = new Readability(document, { charThreshold: 200 }).parse();
    const text = clean(article?.textContent || '');
    if (text.length > 200) return { title: clean(article.title) || title, text };
    return { title, text: clean(stripTags(html)) };
  } catch {
    return { title: '', text: clean(stripTags(html)) };
  }
}

/** Fetch + extract. Returns { url, title, text, truncated, fetchedAt }. */
export async function scrapeUrl(url, { maxChars = MAX_TEXT } = {}) {
  const res = await safeFetch(url);
  const isHtml = /html|xml/i.test(res.contentType) || /^\s*</.test(res.body);
  const { title, text } = isHtml ? extractText(res.body, res.url) : { title: '', text: clean(res.body) };
  return {
    url: res.url,
    title: title || new URL(res.url).hostname,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    fetchedAt: new Date().toISOString(),
  };
}
