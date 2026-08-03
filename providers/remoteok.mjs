// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */
import { plainTextFromHtml, boundedStringList } from './_job-text.mjs';

// RemoteOK provider — board-wide aggregator feed (https://remoteok.com/api).
// Returns the latest ~100 remote postings as a JSON array; index 0 is a
// {last_updated, legal} metadata object and is skipped. scan.mjs applies the
// configured title_filter / location_filter to the returned rows.
//
// Wire in via a `job_boards:` entry with `provider: remoteok`.
// RemoteOK API ToS asks for a follow link-back when republishing — N/A for
// private scanning, but don't redistribute this feed publicly without it.

const FEED_URL = 'https://remoteok.com/api';

/** @type {Provider} */
export default {
  id: 'remoteok',

  /**
   * Fetches and normalizes postings from the RemoteOK public feed.
   * @param {{ name?: string }} entry - The job_boards entry being processed.
   * @param {{ fetchJson: (url: string, opts?: { redirect?: 'error'|'follow'|'manual' }) => Promise<any> }} ctx - HTTP context.
   * @returns {Promise<Array<{title: string, url: string, company: string, location: string}>>}
   */
  async fetch(entry, ctx) {
    // redirect:'error' prevents SSRF via server-side redirects
    const data = await ctx.fetchJson(FEED_URL, { redirect: 'error', maxBytes: 8_000_000 });
    if (!Array.isArray(data)) {
      throw new Error(`remoteok: unexpected API response — expected a JSON array, got ${data === null ? 'null' : typeof data}`);
    }

    return data
      .filter(j => j && typeof j === 'object'
        && typeof j.position === 'string' && j.position.trim() !== ''
        && typeof j.url === 'string' && /^https?:\/\//i.test(j.url.trim()))
      .map(j => {
        const job = {
          title: j.position.trim(),
          url: j.url.trim(),
          company: typeof j.company === 'string' && j.company.trim() ? j.company.trim() : (entry.name || 'RemoteOK'),
          location: typeof j.location === 'string' ? j.location.trim() : '',
        };
        const description = plainTextFromHtml(j.description);
        if (description) job.description = description;
        if (Number.isFinite(j.epoch) && j.epoch > 0) job.postedAt = j.epoch * 1000;
        const min = Number(j.salary_min);
        const max = Number(j.salary_max);
        if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) job.salary = { min, max, currency: 'USD' };
        const skills = boundedStringList(j.tags, 15, 60);
        if (skills.length) job.note = `skills: ${skills.join(', ')}`.slice(0, 500);
        return job;
      });
  },
};
