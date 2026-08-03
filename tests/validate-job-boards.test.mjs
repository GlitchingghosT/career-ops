// tests/validate-job-boards.test.mjs — schema coverage for broad-source configuration.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('\nPortal validator — job boards and search queries');

try {
  const { validatePortalsConfig } = await import(pathToFileURL(join(ROOT, 'validate-portals.mjs')).href);
  const providerIds = new Set(['cryptocurrencyjobs', 'echojobs']);
  const invalid = await validatePortalsConfig({
    max_required_experience_years: 'many',
    dedup_cross_source: 'yes',
    search_queries: [null, { name: '', query: 42, enabled: true }],
    job_boards: [
      null,
      { name: '', provider: 'missing-provider', enabled: true },
      { name: 'Crypto', provider: 'cryptocurrencyjobs', content_filter: 'bad' },
      { name: 'Echo', provider: 'echojobs', content_filter: { require_description: 'yes', positive: [''] } },
    ],
  }, { providerIds });
  const paths = new Set(invalid.errors.map(error => error.path));
  const expected = [
    'max_required_experience_years',
    'dedup_cross_source',
    'search_queries[0]', 'search_queries[1].name', 'search_queries[1].query',
    'job_boards[0]', 'job_boards[1].name', 'job_boards[1].provider',
    'job_boards[2].content_filter', 'job_boards[3].content_filter.require_description',
    'job_boards[3].content_filter.positive[0]',
  ];
  if (expected.every(path => paths.has(path))) pass('validator rejects malformed job boards, providers, filters, and search queries');
  else fail(`validator missed paths: ${expected.filter(path => !paths.has(path)).join(', ')}; got ${[...paths].join(', ')}`);

  const valid = await validatePortalsConfig({
    search_queries: [{ name: 'Nigeria web roles', query: 'site:example.com developer Nigeria', enabled: true }],
    job_boards: [{
      name: 'Crypto', provider: 'cryptocurrencyjobs', enabled: true,
      content_filter: { require_description: true, positive: ['react'], negative: ['solidity'] },
    }],
  }, { providerIds });
  if (valid.errors.length === 0) pass('validator accepts a valid per-board content filter');
  else fail(`valid board config was rejected: ${JSON.stringify(valid.errors)}`);
} catch (error) {
  fail(`job-board validator tests crashed: ${error?.stack || error}`);
}
