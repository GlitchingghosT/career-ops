#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, chmodSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nHermes entry point');

const launcher = join(ROOT, 'bin', 'career-ops-hermes');
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');

if (packageJson.scripts?.hermes === 'bash bin/career-ops-hermes') pass('package.json exposes npm run hermes');
else fail(`package.json hermes script is ${JSON.stringify(packageJson.scripts?.hermes)}`);

if (existsSync(launcher)) pass('Hermes launcher exists');
else fail('Hermes launcher is missing');

if (existsSync(launcher) && (statSync(launcher).mode & 0o111) !== 0) pass('Hermes launcher is executable');
else fail('Hermes launcher is not executable');

if (agents.includes('## Hermes Agent') && agents.includes('npm run hermes')) pass('AGENTS.md documents Hermes invocation');
else fail('AGENTS.md is missing Hermes invocation guidance');

if (existsSync(launcher)) {
  const emptyPath = mkdtempSync(join(tmpdir(), 'career-ops-empty-path-'));
  const fakePath = mkdtempSync(join(tmpdir(), 'career-ops-fake-hermes-'));
  try {
    const missing = spawnSync('/bin/bash', [launcher], {
      cwd: tmpdir(),
      env: { ...process.env, PATH: emptyPath },
      encoding: 'utf8',
    });
    if (missing.status === 127 && /Hermes Agent is not installed/.test(missing.stderr)) {
      pass('launcher fails clearly when Hermes is unavailable');
    } else {
      fail(`missing-Hermes result status=${missing.status} stderr=${JSON.stringify(missing.stderr)}`);
    }

    const fakeHermes = join(fakePath, 'hermes');
    writeFileSync(fakeHermes, '#!/usr/bin/env bash\nprintf "cwd=%s\\n" "$PWD"\nprintf "arg=%s\\n" "$@"\n');
    chmodSync(fakeHermes, 0o755);
    const forwarded = spawnSync('/bin/bash', [launcher, 'chat', '-q', 'scan Lagos'], {
      cwd: tmpdir(),
      env: { ...process.env, PATH: `${fakePath}${delimiter}/usr/bin${delimiter}/bin` },
      encoding: 'utf8',
    });
    if (forwarded.status === 0 && forwarded.stdout.includes(`cwd=${ROOT}`)) pass('launcher normalizes cwd to repository root');
    else fail(`launcher cwd forwarding failed: ${JSON.stringify(forwarded.stdout)}`);
    if (forwarded.stdout.includes('arg=chat') && forwarded.stdout.includes('arg=-q') && forwarded.stdout.includes('arg=scan Lagos')) {
      pass('launcher forwards Hermes arguments unchanged');
    } else {
      fail(`launcher argument forwarding failed: ${JSON.stringify(forwarded.stdout)}`);
    }
  } finally {
    rmSync(emptyPath, { recursive: true, force: true });
    rmSync(fakePath, { recursive: true, force: true });
  }
}
