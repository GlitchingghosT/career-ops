// tests/providers/jsearch.test.mjs — optional RapidAPI JSearch provider.
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — jsearch');

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/jsearch.mjs')).href);
  const provider = mod.default;
  const { buildJSearchUrl, parseJSearchResponse, annualizeSalary } = mod;

  if (provider.id === 'jsearch') pass('jsearch.id is "jsearch"');
  else fail(`jsearch.id is ${JSON.stringify(provider.id)}`);

  const hit = provider.detect({ provider: 'jsearch', query: 'frontend developer', location: 'Lagos, Nigeria' });
  if (hit?.url === 'https://jsearch.p.rapidapi.com/search') pass('jsearch.detect() claims explicit provider config without credentials in URL');
  else fail(`jsearch.detect() returned ${JSON.stringify(hit)}`);

  if (provider.detect({ provider: 'remoteok' }) === null) pass('jsearch.detect() ignores other provider ids');
  else fail('jsearch.detect() should ignore other provider ids');

  const requestUrl = new URL(buildJSearchUrl({
    query: 'React developer',
    location: 'Lagos, Nigeria',
    country: 'ng',
    language: 'en',
    page: 2,
    max_pages: 99,
    date_posted: 'month',
    remote_jobs_only: false,
  }));
  if (requestUrl.origin === 'https://jsearch.p.rapidapi.com' && requestUrl.pathname === '/search') pass('buildJSearchUrl locks requests to the RapidAPI JSearch host');
  else fail(`buildJSearchUrl produced ${requestUrl.href}`);
  if (requestUrl.searchParams.get('query') === 'React developer in Lagos, Nigeria' && requestUrl.searchParams.get('country') === 'ng') pass('buildJSearchUrl composes Nigeria query and country');
  else fail(`buildJSearchUrl query/country mismatch: ${requestUrl.search}`);
  if (requestUrl.searchParams.get('num_pages') === '10' && requestUrl.searchParams.get('page') === '2') pass('buildJSearchUrl caps pagination at 10 pages');
  else fail(`buildJSearchUrl pagination mismatch: ${requestUrl.search}`);
  if (!requestUrl.searchParams.has('api_key') && !requestUrl.href.includes('secret')) pass('buildJSearchUrl never puts credentials in the URL');
  else fail('buildJSearchUrl leaked a credential parameter');

  const salaryCases = [
    [5, 'HOUR', 10400],
    [1000, 'MONTH', 12000],
    [250, 'WEEK', 13000],
    [50, 'DAY', 13000],
    [15000, 'YEAR', 15000],
    [10, 'UNKNOWN', null],
    [1e308, 'HOUR', null],
  ];
  for (const [amount, period, expected] of salaryCases) {
    const actual = annualizeSalary(amount, period);
    if (actual === expected) pass(`annualizeSalary handles ${period}`);
    else fail(`annualizeSalary(${amount}, ${period}) = ${actual}, expected ${expected}`);
  }

  const jobs = parseJSearchResponse({ data: [
    {
      job_title: '  Junior React Developer  ',
      employer_name: ' Acme NG ',
      job_city: 'Lagos',
      job_state: 'Lagos',
      job_country: 'Nigeria',
      job_is_remote: false,
      job_apply_link: 'https://careers.example.com/jobs/123',
      job_posted_at_timestamp: 1785733200,
      job_description: 'Build accessible React interfaces.',
      job_min_salary: 5,
      job_max_salary: 8,
      job_salary_period: 'HOUR',
      job_salary_currency: 'USD',
    },
    {
      job_title: 'Remote Node.js Developer',
      employer_name: '',
      job_is_remote: true,
      job_google_link: 'https://www.google.com/search?q=remote-node-job',
    },
    { job_title: '', job_apply_link: 'https://example.com/blank' },
    { job_title: 'Unsafe', job_apply_link: 'http://example.com/job' },
    { job_title: 'Credential URL', job_apply_link: 'https://user:pass@example.com/job' },
    { job_title: 'Oversized URL', job_apply_link: `https://example.com/${'x'.repeat(3000)}` },
  ] }, 'JSearch');

  if (jobs.length === 2) pass('parseJSearchResponse drops blank-title and non-HTTPS records');
  else fail(`parseJSearchResponse returned ${jobs.length} jobs`);
  if (jobs[0]?.title === 'Junior React Developer' && jobs[0]?.company === 'Acme NG' && jobs[0]?.location === 'Lagos, Nigeria') pass('parseJSearchResponse normalizes Nigerian job identity and location');
  else fail(`Nigerian job normalization mismatch: ${JSON.stringify(jobs[0])}`);
  if (jobs[0]?.postedAt === 1785733200000 && jobs[0]?.description === 'Build accessible React interfaces.') pass('parseJSearchResponse preserves posting time and description');
  else fail(`posting metadata mismatch: ${JSON.stringify(jobs[0])}`);
  if (jobs[0]?.salary?.min === 10400 && jobs[0]?.salary?.max === 16640 && jobs[0]?.salary?.currency === 'USD') pass('parseJSearchResponse annualizes hourly salary');
  else fail(`salary normalization mismatch: ${JSON.stringify(jobs[0]?.salary)}`);
  if (jobs[1]?.location === 'Remote' && jobs[1]?.company === 'JSearch') pass('parseJSearchResponse handles remote jobs and fallback company');
  else fail(`remote job normalization mismatch: ${JSON.stringify(jobs[1])}`);

  const invalidTimestamp = parseJSearchResponse({ data: [{
    job_title: 'Developer', employer_name: 'Acme', job_apply_link: 'https://example.com/job', job_posted_at_timestamp: 1e20,
  }] });
  if (invalidTimestamp.length === 1 && invalidTimestamp[0].postedAt === undefined) pass('parseJSearchResponse omits timestamps outside the JavaScript Date range');
  else fail(`invalid timestamp survived: ${JSON.stringify(invalidTimestamp)}`);

  const oversizedRecords = Array.from({ length: 1001 }, (_, i) => ({
    job_title: `Developer ${i}`, employer_name: 'Acme', job_apply_link: `https://example.com/jobs/${i}`,
  }));
  if (parseJSearchResponse({ data: oversizedRecords }).length === 1000) pass('parseJSearchResponse caps records at 1000');
  else fail('parseJSearchResponse did not cap record count');

  if (parseJSearchResponse({ data: [{ job_title: 'Developer', job_apply_link: `https://example.com/${'x'.repeat(3000)}` }] }).length === 0) pass('parseJSearchResponse rejects oversized result URLs');
  else fail('parseJSearchResponse retained an oversized result URL');

  const expandingUrl = `https://example.com/${'\u{1F600}'.repeat(450)}`;
  if (expandingUrl.length < 2048 && parseJSearchResponse({ data: [{ job_title: 'Developer', job_apply_link: expandingUrl }] }).length === 0) pass('parseJSearchResponse rejects URLs that exceed the cap after percent-encoding');
  else fail('parseJSearchResponse retained an expanded normalized URL');

  const oversizedStrings = parseJSearchResponse({ data: [{
    job_title: `Developer ${'x'.repeat(1000)}`,
    employer_name: 'A'.repeat(1000),
    job_city: 'L'.repeat(1000),
    job_country: 'Nigeria',
    job_apply_link: 'https://example.com/oversized',
    job_description: 'D'.repeat(50000),
  }] });
  if (oversizedStrings[0]?.title.length <= 300 && oversizedStrings[0]?.company.length <= 300 && oversizedStrings[0]?.location.length <= 500 && oversizedStrings[0]?.description.length <= 20000) pass('parseJSearchResponse bounds retained strings');
  else fail(`JSearch strings were not bounded: ${JSON.stringify({ title: oversizedStrings[0]?.title.length, company: oversizedStrings[0]?.company.length, location: oversizedStrings[0]?.location.length, description: oversizedStrings[0]?.description.length })}`);

  const originalKey = process.env.JSEARCH_API_KEY;
  delete process.env.JSEARCH_API_KEY;
  try {
    let message = '';
    try {
      await provider.fetch({ provider: 'jsearch', query: 'developer', location: 'Lagos, Nigeria' }, { fetchJson: async () => ({ data: [] }) });
    } catch (error) {
      message = String(error?.message || error);
    }
    if (/JSEARCH_API_KEY/.test(message) && !/rapidapi[_-]?key/i.test(message.replace('JSEARCH_API_KEY', ''))) pass('jsearch.fetch() fails clearly without exposing a credential');
    else fail(`missing-key error was ${JSON.stringify(message)}`);
  } finally {
    if (originalKey === undefined) delete process.env.JSEARCH_API_KEY;
    else process.env.JSEARCH_API_KEY = originalKey;
  }

  process.env.JSEARCH_API_KEY = 'bad\r\nX-Injected: yes';
  try {
    let called = false;
    let message = '';
    try {
      await provider.fetch(
        { provider: 'jsearch', query: 'developer', location: 'Lagos, Nigeria' },
        { fetchJson: async () => { called = true; return { data: [] }; } },
      );
    } catch (error) {
      message = String(error?.message || error);
    }
    if (!called && /invalid shape/.test(message) && !message.includes('X-Injected')) pass('jsearch.fetch() rejects control characters before building request headers');
    else fail(`unsafe API key handling: called=${called} message=${JSON.stringify(message)}`);
  } finally {
    delete process.env.JSEARCH_API_KEY;
  }

  const secret = 'test-secret-not-for-logs';
  process.env.JSEARCH_API_KEY = secret;
  try {
    let captured;
    const fetched = await provider.fetch(
      { provider: 'jsearch', query: 'developer', location: 'Lagos, Nigeria', max_pages: 1 },
      { fetchJson: async (url, options) => { captured = { url, options }; return { data: [] }; } },
    );
    if (Array.isArray(fetched) && captured?.options?.headers?.['X-RapidAPI-Key'] === secret && captured?.options?.headers?.['X-RapidAPI-Host'] === 'jsearch.p.rapidapi.com') pass('jsearch.fetch() sends credentials only in request headers');
    else fail(`jsearch.fetch() headers mismatch: ${JSON.stringify(captured)}`);
    if (captured?.options?.redirect === 'error' && captured?.options?.maxBytes === 2000000 && !captured.url.includes(secret)) pass('jsearch.fetch() rejects redirects, caps response bytes, and keeps the key out of URLs');
    else fail('jsearch.fetch() redirect/key handling is unsafe');
  } finally {
    delete process.env.JSEARCH_API_KEY;
  }
} catch (error) {
  fail(`jsearch provider could not be imported/tested: ${error?.stack || error}`);
}
