// tests/portal-content-filter.test.mjs — per-board stack filters layer over global filters.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('\nPer-board content filtering');

try {
  const { buildContentFilter, buildCombinedContentFilter } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);

  const strict = buildContentFilter({ require_description: true, positive: ['react', 'typescript'] });
  if (strict('Build React interfaces') === true && strict('Go protocol engineer') === false && strict('') === false && strict(undefined) === false) {
    pass('content_filter require_description fails closed and still enforces positives');
  } else {
    fail('content_filter require_description behavior is incorrect');
  }

  const combined = buildCombinedContentFilter(
    { negative: ['wordpress'] },
    { require_description: true, positive: ['react', 'typescript', 'javascript', 'node.js', 'front-end', 'frontend', 'full-stack', 'full stack'], negative: ['solidity', 'smart contract', 'protocol engineer', 'rust'] },
    { positive: ['Software Engineer', 'Frontend Developer'] },
  );
  const cases = [
    [{ title: 'Frontend Developer', description: 'Build React and TypeScript interfaces' }, true],
    [{ title: 'Software Engineer', description: 'Develop Solidity smart contracts' }, false],
    [{ title: 'Software Engineer', description: 'Indexer and protocol engineering' }, false],
    [{ title: 'Software Engineer', description: '' }, false],
    [{ title: 'Frontend Developer', description: 'Maintain WordPress and React pages' }, false],
  ];
  if (cases.every(([job, expected]) => combined(job) === expected)) pass('combined filter layers global and per-board rules');
  else fail(`combined content filter cases failed: ${JSON.stringify(cases.map(([job, expected]) => ({ expected, actual: combined(job), job })))}`);
} catch (error) {
  fail(`per-board content filter tests crashed: ${error?.stack || error}`);
}
