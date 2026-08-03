// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// MyJobMag Nigeria provider — official public summarized RSS feed.
// The provider intentionally retains only metadata and canonical links; it does
// not mirror feed descriptions because MyJobMag's terms do not grant a broad
// content-republication license.

const FEED_URL = 'https://www.myjobmag.com/jobsxml.xml';
const TRUSTED_HOSTS = new Set(['myjobmag.com', 'www.myjobmag.com']);

function fromCodePoint(cp) {
  try { return String.fromCodePoint(cp); } catch { return ''; }
}

function decodeXmlEntities(value) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractText(inner, maxLength = 300) {
  const cdata = inner.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const text = cdata ? cdata[1] : decodeXmlEntities(inner);
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function tagText(block, tag, maxLength = 300) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? extractText(match[1], maxLength) : '';
}

function cleanJobUrl(value) {
  if (!value) return '';
  const raw = value.trim();
  if (!raw || raw.length > 2048) return '';
  try {
    const parsed = new URL(raw);
    const normalized = parsed.href;
    const trustedPath = parsed.pathname.startsWith('/job/') || parsed.pathname.startsWith('/jobs/');
    return parsed.protocol === 'https:' && TRUSTED_HOSTS.has(parsed.hostname.toLowerCase()) &&
      !parsed.username && !parsed.password && trustedPath && normalized.length <= 2048 ? normalized : '';
  } catch {
    return '';
  }
}

function splitRoleCompany(value) {
  const text = value.trim();
  const index = text.toLowerCase().lastIndexOf(' at ');
  if (index > 0 && index < text.length - 4) {
    return {
      title: text.slice(0, index).trim().slice(0, 300),
      company: text.slice(index + 4).trim().slice(0, 300),
    };
  }
  return { title: text.slice(0, 300), company: 'MyJobMag' };
}

function parseDate(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 8.64e15 ? parsed : undefined;
}

/**
 * Parse the official summarized MyJobMag Nigeria RSS feed.
 * @param {unknown} xml
 * @returns {Array<{title:string,url:string,company:string,location:string,postedAt?:number}>}
 */
export function parseMyJobMagFeed(xml) {
  if (typeof xml !== 'string' || !xml) return [];
  const blocks = (xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || []).slice(0, 200);
  const jobs = [];
  for (const item of blocks) {
    const url = cleanJobUrl(tagText(item, 'link', 2049));
    const rawTitle = tagText(item, 'title', 700);
    if (!url || !rawTitle) continue;
    const { title, company } = splitRoleCompany(rawTitle);
    if (!title) continue;
    const job = { title, url, company, location: 'Nigeria' };
    const postedAt = parseDate(tagText(item, 'pubDate', 100));
    if (postedAt !== undefined) job.postedAt = postedAt;
    jobs.push(job);
  }
  return jobs;
}

/** @type {Provider} */
export default {
  id: 'myjobmag',

  detect(entry) {
    return entry?.provider === 'myjobmag' ? { url: FEED_URL } : null;
  },

  async fetch(_entry, ctx) {
    const xml = await ctx.fetchText(FEED_URL, { redirect: 'error', maxBytes: 1_000_000 });
    return parseMyJobMagFeed(xml);
  },
};
