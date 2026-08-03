// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */
import { plainTextFromHtml, boundedStringList } from './_job-text.mjs';

// Working Nomads provider — board-wide aggregator feed
// (https://www.workingnomads.com/api/exposed_jobs/). Returns a JSON array of
// postings; scan.mjs applies the configured title_filter / location_filter.
//
// Wire in via a `job_boards:` entry with `provider: workingnomads`.

const FEED_URL = 'https://www.workingnomads.com/api/exposed_jobs/';

/** @type {Provider} */
export default {
  id: 'workingnomads',

  /**
   * Fetches and normalizes postings from the Working Nomads public feed.
   * @param {{ name?: string }} entry - The job_boards entry being processed.
   * @param {{ fetchJson: (url: string, opts?: { redirect?: 'error'|'follow'|'manual' }) => Promise<any> }} ctx - HTTP context.
   * @returns {Promise<Array<{title: string, url: string, company: string, location: string}>>}
   */
  async fetch(entry, ctx) {
    // redirect:'error' prevents SSRF via server-side redirects
    const data = await ctx.fetchJson(FEED_URL, { redirect: 'error', maxBytes: 8_000_000 });
    if (!Array.isArray(data)) {
      throw new Error(`workingnomads: unexpected API response — expected a JSON array, got ${data === null ? 'null' : typeof data}`);
    }

    return data
      .filter(j => j && typeof j === 'object'
        && typeof j.title === 'string' && j.title.trim() !== ''
        && typeof j.url === 'string' && /^https?:\/\//i.test(j.url.trim()))
      .map(j => {
        const job = {
          title: j.title.trim(),
          url: j.url.trim(),
          company: typeof j.company_name === 'string' && j.company_name.trim() ? j.company_name.trim() : (entry.name || 'Working Nomads'),
          location: typeof j.location === 'string' ? j.location.trim() : '',
        };
        const description = plainTextFromHtml(j.description);
        if (description) job.description = description;
        const postedAt = Date.parse(j.pub_date);
        if (!Number.isNaN(postedAt)) job.postedAt = postedAt;
        const details = [];
        if (typeof j.category_name === 'string' && j.category_name.trim()) details.push(`category: ${j.category_name.trim().slice(0, 80)}`);
        const rawTags = typeof j.tags === 'string' ? j.tags.split(',') : j.tags;
        const skills = boundedStringList(rawTags, 15, 60);
        if (skills.length) details.push(`skills: ${skills.join(', ')}`);
        if (details.length) job.note = details.join('; ').slice(0, 500);
        return job;
      });
  },
};
