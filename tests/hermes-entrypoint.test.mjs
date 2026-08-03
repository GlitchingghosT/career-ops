#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nHermes entry point');

const launcher = join(ROOT, 'bin', 'career-ops-hermes');
const nodeLauncher = join(ROOT, 'bin', 'career-ops-hermes.mjs');
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
const { launchHermes } = await import(pathToFileURL(nodeLauncher).href);

if (packageJson.scripts?.hermes === 'node bin/career-ops-hermes.mjs') pass('package.json exposes a cross-platform npm run hermes');
else fail(`package.json hermes script is ${JSON.stringify(packageJson.scripts?.hermes)}`);

if (existsSync(launcher)) pass('Hermes launcher exists');
else fail('Hermes launcher is missing');

if (existsSync(nodeLauncher)) pass('cross-platform Hermes launcher exists');
else fail('cross-platform Hermes launcher is missing');

if (process.platform === 'win32' || (existsSync(launcher) && (statSync(launcher).mode & 0o111) !== 0)) pass('Unix Hermes wrapper is executable where mode bits apply');
else fail('Unix Hermes wrapper is not executable');

if (agents.includes('## Hermes Agent') && agents.includes('npm run hermes')) pass('AGENTS.md documents Hermes invocation');
else fail('AGENTS.md is missing Hermes invocation guidance');

if (existsSync(nodeLauncher)) {
  const emptyPath = mkdtempSync(join(tmpdir(), 'career-ops-empty-path-'));
  try {
    const missing = spawnSync(process.execPath, [nodeLauncher], {
      cwd: tmpdir(),
      env: { ...process.env, PATH: emptyPath },
      encoding: 'utf8',
    });
    if (missing.status === 127 && /Hermes Agent is not installed/.test(missing.stderr)) {
      pass('launcher fails clearly when Hermes is unavailable');
    } else {
      fail(`missing-Hermes result status=${missing.status} stderr=${JSON.stringify(missing.stderr)}`);
    }

    let captured;
    const forwardedStatus = launchHermes(['chat', '-q', 'scan Lagos'], {
      command: 'fake-hermes',
      spawn: (command, args, options) => {
        captured = { command, args, options };
        return { status: 0 };
      },
    });
    if (forwardedStatus === 0 && captured?.options?.cwd === ROOT) pass('launcher normalizes cwd to repository root');
    else fail(`launcher cwd forwarding failed: ${JSON.stringify(captured)}`);
    if (captured?.command === 'fake-hermes' && JSON.stringify(captured?.args) === JSON.stringify(['chat', '-q', 'scan Lagos'])) {
      pass('launcher forwards Hermes arguments unchanged');
    } else {
      fail(`launcher argument forwarding failed: ${JSON.stringify(captured)}`);
    }
  } finally {
    rmSync(emptyPath, { recursive: true, force: true });
  }
}
