// tests/fork-update-guard.test.mjs — maintained forks merge upstream; they do not overlay-copy it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nMaintained-fork update guard');

const marker = join(ROOT, 'FORK_MAINTENANCE.md');
const updater = readFileSync(join(ROOT, 'update-system.mjs'), 'utf8');

if (existsSync(marker)) pass('fork maintenance marker exists');
else fail('FORK_MAINTENANCE.md is missing');

if (updater.includes("const CANONICAL_REPO = 'https://github.com/santifer/career-ops.git'")) pass('canonical update source remains santifer/career-ops');
else fail('canonical update source was redirected');

const hasGuard = updater.includes('FORK_MAINTENANCE.md') && updater.includes('CAREER_OPS_ALLOW_OVERLAY_UPDATE') && updater.includes('git fetch upstream') && updater.includes('git merge upstream/main');
if (hasGuard) pass('overlay updater contains a maintained-fork guard and merge instructions');
else fail('overlay updater lacks the maintained-fork guard');

if (existsSync(marker) && hasGuard) {
  const lock = join(ROOT, '.update-lock');
  const beforeLock = existsSync(lock);
  const result = spawnSync(process.execPath, ['update-system.mjs', 'apply'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CAREER_OPS_ALLOW_OVERLAY_UPDATE: '' },
  });
  if (result.status !== 0 && /maintained fork/i.test(`${result.stdout}\n${result.stderr}`)) pass('apply fails closed with maintained-fork guidance');
  else fail(`apply guard result status=${result.status}: ${result.stdout} ${result.stderr}`);
  if (existsSync(lock) === beforeLock) pass('fork guard exits before creating an update lock');
  else fail('fork guard leaked or changed .update-lock');
}
