// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */
import { plainTextFromHtml, boundedStringList } from './_job-text.mjs';

// Jobicy provider — board-wide remote-jobs aggregator feed
// (https://jobicy.com/api/v2/remote-jobs?count=50). Returns { jobs: [...] }.
//
// Wire in via a `job_boards:` entry with `provider: jobicy`.

const FEED_URL = 'https://jobicy.com/api/v2/remote-jobs?count=50';

/** @type {Provider} */
export default {
  id: 'jobicy',

  detect(entry) {
    return entry?.provider === 'jobicy' ? { url: FEED_URL } : null;
  },

  /**
   * Fetches and normalizes postings from the Jobicy public feed.
   * @param {{ name?: string }} entry - The job_boards entry being processed.
   * @param {{ fetchJson: (url: string, opts?: { redirect?: 'error'|'follow'|'manual' }) => Promise<any> }} ctx - HTTP context.
   * @returns {Promise<Array<{title: string, url: string, company: string, location: string, postedAt?: number}>>}
   */
  async fetch(entry, ctx) {
    // redirect:'error' prevents SSRF via server-side redirects
    const json = await ctx.fetchJson(FEED_URL, { redirect: 'error', maxBytes: 5_000_000 });
    if (!json || !Array.isArray(json.jobs)) {
      throw new Error(`jobicy: unexpected API response — expected { jobs: [...] }, got keys: [${json ? Object.keys(json).join(', ') : 'null'}]`);
    }

    return parseJobicyResponse(json, entry.name || 'Jobicy');
  },
};

/**
 * Parse a Jobicy API response. Exported for unit tests.
 *
 * @param {any} json - Raw response payload.
 * @param {string} defaultCompany - Fallback company name.
 * @returns {Array<{title: string, url: string, company: string, location: string}>}
 */
export function parseJobicyResponse(json, defaultCompany = 'Jobicy') {
  if (!json || !Array.isArray(json.jobs)) return [];

  const toEpochMs = (value) => {
    if (!value) return undefined;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  return json.jobs
    .map(j => {
      if (!j || typeof j !== 'object') return null;

      const title = typeof j.jobTitle === 'string' ? j.jobTitle.trim() : '';
      if (!title) return null;

      const rawUrl = typeof j.url === 'string' ? j.url.trim() : '';
      let url = null;
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === 'https:' && (parsed.hostname === 'jobicy.com' || parsed.hostname === 'www.jobicy.com')) {
          url = parsed.href;
        }
      } catch {
        // Invalid or malformed URL
      }
      if (!url) return null;

      const company = typeof j.companyName === 'string' && j.companyName.trim() ? j.companyName.trim() : defaultCompany;
      const location = typeof j.jobGeo === 'string' ? j.jobGeo.trim() : '';
      const postedAt = toEpochMs(j.pubDate);

      const job = {
        title,
        url,
        company,
        location,
        postedAt,
      };
      const description = plainTextFromHtml(j.jobDescription);
      if (description) job.description = description;
      const details = [];
      if (typeof j.jobLevel === 'string' && j.jobLevel.trim()) details.push(`level: ${j.jobLevel.trim().slice(0, 60)}`);
      const types = boundedStringList(j.jobType, 5, 50);
      const industries = boundedStringList(j.jobIndustry, 8, 60);
      if (types.length) details.push(`type: ${types.join(', ')}`);
      if (industries.length) details.push(`industry: ${industries.join(', ')}`);
      if (details.length) job.note = details.join('; ').slice(0, 500);
      return job;
    })
    .filter(j => j !== null);
}