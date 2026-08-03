#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nPrivate user layer');

const privatePaths = [
  'cv.md',
  'config/profile.yml',
  'modes/_profile.md',
  'modes/_brief.md',
  'modes/_custom.md',
  'portals.yml',
  'article-digest.md',
  '.hermes/plans/private-plan.md',
];

for (const path of privatePaths) {
  const result = spawnSync('git', ['check-ignore', '--no-index', '--quiet', path], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status === 0) pass(`${path} is protected by .gitignore`);
  else fail(`${path} is NOT protected by .gitignore`);
}
