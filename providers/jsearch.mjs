// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Optional JSearch provider backed by RapidAPI.
// Configure with `provider: jsearch`, a query/location, and JSEARCH_API_KEY in
// the process environment. The credential is sent only as a request header.

const API_ORIGIN = 'https://jsearch.p.rapidapi.com';
const SEARCH_URL = `${API_ORIGIN}/search`;
const API_HOST = 'jsearch.p.rapidapi.com';

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');
const clampInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

/**
 * Build an allowlisted JSearch request URL. Credentials are deliberately absent.
 * @param {Record<string, any>} entry
 */
export function buildJSearchUrl(entry = {}) {
  const query = cleanText(entry.query);
  if (!query) throw new Error('jsearch: job_boards entry requires a non-empty query');

  const location = cleanText(entry.location);
  const search = location ? `${query} in ${location}` : query;
  const url = new URL(SEARCH_URL);
  url.searchParams.set('query', search);
  url.searchParams.set('page', String(clampInt(entry.page, 1, 1, 100)));
  url.searchParams.set('num_pages', String(clampInt(entry.max_pages, 1, 1, 10)));

  const country = cleanText(entry.country).toLowerCase();
  if (/^[a-z]{2}$/.test(country)) url.searchParams.set('country', country);
  const language = cleanText(entry.language).toLowerCase();
  if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(language)) url.searchParams.set('language', language);

  const datePosted = cleanText(entry.date_posted).toLowerCase();
  if (['all', 'today', '3days', 'week', 'month'].includes(datePosted)) {
    url.searchParams.set('date_posted', datePosted);
  }
  if (entry.remote_jobs_only === true) url.searchParams.set('remote_jobs_only', 'true');

  return url.href;
}

/**
 * Convert a salary amount to an annual figure.
 * @param {unknown} amount
 * @param {unknown} period
 * @returns {number|null}
 */
export function annualizeSalary(amount, period) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  const multipliers = {
    HOUR: 2080,
    DAY: 260,
    WEEK: 52,
    MONTH: 12,
    YEAR: 1,
    ANNUAL: 1,
  };
  const multiplier = multipliers[cleanText(period).toUpperCase()];
  return multiplier ? Math.round(value * multiplier) : null;
}

function secureResultUrl(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function normalizeLocation(job) {
  if (job?.job_is_remote === true) return 'Remote';
  const values = [job?.job_city, job?.job_state, job?.job_country]
    .map(cleanText)
    .filter(Boolean);
  const seen = new Set();
  return values.filter(value => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(', ');
}

/**
 * Parse a JSearch response into scanner jobs.
 * @param {any} json
 * @param {string} defaultCompany
 */
export function parseJSearchResponse(json, defaultCompany = 'JSearch') {
  if (!json || !Array.isArray(json.data)) return [];
  return json.data.map(job => {
    if (!job || typeof job !== 'object') return null;
    const title = cleanText(job.job_title);
    const url = secureResultUrl(job.job_apply_link) || secureResultUrl(job.job_google_link);
    if (!title || !url) return null;

    const result = {
      title,
      url,
      company: cleanText(job.employer_name) || defaultCompany,
      location: normalizeLocation(job),
    };

    const timestamp = Number(job.job_posted_at_timestamp);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      result.postedAt = timestamp < 1e12 ? Math.round(timestamp * 1000) : Math.round(timestamp);
    }
    const description = cleanText(job.job_description);
    if (description) result.description = description;

    const min = annualizeSalary(job.job_min_salary, job.job_salary_period);
    const max = annualizeSalary(job.job_max_salary, job.job_salary_period);
    const currency = cleanText(job.job_salary_currency).toUpperCase();
    if ((min || max) && /^[A-Z]{3}$/.test(currency)) {
      result.salary = {
        min: min || max,
        max: max || min,
        currency,
      };
    }
    return result;
  }).filter(Boolean);
}

/** @type {Provider} */
export default {
  id: 'jsearch',

  detect(entry) {
    return entry?.provider === 'jsearch' ? { url: SEARCH_URL } : null;
  },

  async fetch(entry, ctx) {
    const apiKey = cleanText(process.env.JSEARCH_API_KEY);
    if (!apiKey) {
      throw new Error('jsearch: JSEARCH_API_KEY is required; store it in .env or the process environment');
    }
    if (apiKey.length < 8 || apiKey.length > 500 || /[\x00-\x20\x7f]/.test(apiKey)) {
      throw new Error('jsearch: JSEARCH_API_KEY has an invalid shape');
    }

    const url = buildJSearchUrl(entry);
    const json = await ctx.fetchJson(url, {
      redirect: 'error',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': API_HOST,
      },
    });
    if (!json || !Array.isArray(json.data)) {
      throw new Error(`jsearch: unexpected API response — expected { data: [...] }, got keys: [${json && typeof json === 'object' ? Object.keys(json).join(', ') : 'null'}]`);
    }
    return parseJSearchResponse(json, entry.name || 'JSearch');
  },
};
