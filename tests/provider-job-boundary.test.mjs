// tests/provider-job-boundary.test.mjs — untrusted provider records are bounded before filtering/persistence.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('\nProvider job boundary');

try {
  const { sanitizeProviderJob } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);
  const job = sanitizeProviderJob({
    title: ` Engineer ${'x'.repeat(500)}`,
    url: 'https://example.com/jobs/1',
    company: `Acme ${'c'.repeat(500)}`,
    location: `Remote ${'l'.repeat(800)}`,
    description: 'd'.repeat(30_000),
    note: 'n'.repeat(5_000),
  });
  if (job?.title.length === 300 && job.company.length === 300
      && job.location.length === 500 && job.description.length === 20_000
      && job.note.length === 2_000 && job.url === 'https://example.com/jobs/1') {
    pass('provider job boundary trims and caps persisted string fields');
  } else {
    fail(`provider job caps mismatch: ${JSON.stringify(Object.fromEntries(Object.entries(job || {}).map(([k,v]) => [k, typeof v === 'string' ? v.length : v])))}`);
  }
  if (sanitizeProviderJob({ title: 'Engineer', url: 'javascript:alert(1)' }) === null
      && sanitizeProviderJob({ title: 'Engineer', url: 'https://user:password@example.com/job' }) === null
      && sanitizeProviderJob({ title: 'Engineer', url: 'https://example.com/job\nInjected' }) === null
      && sanitizeProviderJob({ title: 'Engineer', url: 'https://example.com/jo\tb' }) === null
      && sanitizeProviderJob({ title: '', url: 'https://example.com' }) === null
      && sanitizeProviderJob(null) === null) {
    pass('provider job boundary rejects malformed records and unsafe URLs');
  } else {
    fail('provider job boundary accepted malformed input');
  }
  const controls = sanitizeProviderJob({
    title: 'Engineer\nInjected',
    url: 'https://example.com/job',
    company: 'Acme\tCorp',
    location: 'Remote\r\nGlobal',
  });
  if (controls?.title === 'Engineer Injected' && controls.company === 'Acme Corp' && controls.location === 'Remote Global') {
    pass('provider job boundary normalizes control characters before JSON output');
  } else {
    fail(`provider job control normalization: ${JSON.stringify(controls)}`);
  }
} catch (error) {
  fail(`provider job boundary tests crashed: ${error?.stack || error}`);
}
