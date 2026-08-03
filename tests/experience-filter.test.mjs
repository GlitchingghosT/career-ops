// tests/experience-filter.test.mjs — reject hard professional-experience requirements, not curiosity.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('\nRequired experience filter');

try {
  const { buildRequiredExperienceFilter } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);
  const filter = buildRequiredExperienceFilter(2);
  const cases = [
    ['', true],
    [undefined, true],
    ['0–3 years of professional software experience and 5+ years of curiosity exploring computers', true],
    ['1-2 years of commercial development experience', true],
    ['At least 3 years of relevant experience building production applications', false],
    ['Minimum of 4 years experience as a software engineer', false],
    ['5+ years of professional frontend experience', false],
    ['5+ years of software engineering experience', false],
    ['5+ years of experience in front-end development', false],
    ['At least 5 years relevant professional experience', false],
    ['0-3 years of curiosity and 5 years of professional experience', false],
    ['0-3 years of professional experience; at least 5 years of relevant experience', false],
    ['0-3 years professional; at least 5 relevant', false],
    ['We use at least 5 relevant technologies in production', true],
    ['Five years of curiosity and personal projects', true],
  ];
  if (cases.every(([description, expected]) => filter(description) === expected)) {
    pass('experience filter distinguishes hard professional minimums from ranges and curiosity');
  } else {
    fail(`experience filter cases: ${JSON.stringify(cases.map(([description, expected]) => ({ description, expected, actual: filter(description) })))}`);
  }
  if (buildRequiredExperienceFilter(null)('10+ years of professional experience') === true) {
    pass('experience filter is disabled when no numeric ceiling is configured');
  } else {
    fail('absent experience ceiling should pass all jobs');
  }
} catch (error) {
  fail(`experience filter tests crashed: ${error?.stack || error}`);
}
