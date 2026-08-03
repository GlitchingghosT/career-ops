#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(import.meta.url);
const root = resolve(dirname(modulePath), '..');

export function launchHermes(args, {
  spawn = spawnSync,
  command = process.env.CAREER_OPS_HERMES_BIN || 'hermes',
} = {}) {
  const result = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error('career-ops: Hermes Agent is not installed or not on PATH.');
      console.error('Install or configure Hermes, then rerun npm run hermes.');
      return 127;
    }
    console.error(`career-ops: could not start Hermes Agent: ${result.error.message}`);
    return 1;
  }

  if (result.signal) {
    console.error(`career-ops: Hermes Agent terminated by signal ${result.signal}.`);
    return 1;
  }

  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  process.exit(launchHermes(process.argv.slice(2)));
}
