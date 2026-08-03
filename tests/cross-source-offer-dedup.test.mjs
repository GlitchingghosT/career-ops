// tests/cross-source-offer-dedup.test.mjs — collapse aggregator mirrors, preserve requisitions.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('\nCross-source offer dedup');

try {
  const { dedupeCrossSourceOffers } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);
  const baseDescription = 'Build React and TypeScript products with Node.js APIs. '.repeat(20);
  const mirroredDescription = baseDescription + 'Apply through our remote jobs partner.';
  const result = dedupeCrossSourceOffers([
    { company: 'Acme', title: 'Product Engineer', url: 'https://one.example/job', source: 'remoteok-api', description: baseDescription },
    { company: 'Acme', title: 'Product Engineer', url: 'https://two.example/job', source: 'weworkremotely-api', description: mirroredDescription, salary: { min: 60000, max: 90000, currency: 'USD' } },
    { company: 'Acme', title: 'Product Engineer', url: 'https://three.example/job', source: 'remoteok-api', description: baseDescription },
    { company: 'Acme', title: 'Product Engineer', url: 'https://four.example/job', source: 'hackernews-api', description: 'A genuinely different requisition focused on distributed databases. '.repeat(20) },
  ]);
  if (result.offers.length === 3 && result.duplicates === 1
      && result.offers.some(offer => offer.url === 'https://two.example/job' && offer.salary?.min === 60000)
      && result.offers.some(offer => offer.url === 'https://three.example/job')) {
    pass('cross-source mirrors collapse to the richer record while same-source/different-body offers remain');
  } else {
    fail(`cross-source dedup result = ${JSON.stringify(result)}`);
  }
  const missing = dedupeCrossSourceOffers([
    { company: 'Acme', title: 'Engineer', url: 'https://one.example/a', source: 'a' },
    { company: 'Acme', title: 'Engineer', url: 'https://two.example/b', source: 'b' },
  ]);
  if (missing.offers.length === 2 && missing.duplicates === 0) pass('missing descriptions never trigger cross-source dedup');
  else fail('missing descriptions were over-deduplicated');
} catch (error) {
  fail(`cross-source dedup tests crashed: ${error?.stack || error}`);
}
