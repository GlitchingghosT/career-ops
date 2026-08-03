// tests/scan-json-stdout.test.mjs — scan.mjs must keep stdout clean so that
// --json output stays machine-parseable (issue #1906).
//
// scan.mjs loads dotenv at module top level. dotenv v17 prints a startup
// banner to stdout, gated on the `quiet` option rather than on isTTY, so it
// fires even when stdout is a pipe. scan-ats-full.mjs imports scan.mjs, which
// means the import alone is enough to put that banner on the stdout channel
// that --json reserves for a single JSON object. Consumers that accumulate
// stdout and JSON.parse it then fail on the leading banner.
//
// Both checks run scan.mjs in a child process: stdout has to be measured on a
// real pipe, and the parent's own stdout carries the suite log.
import { pass, fail, warn, run, NODE, ROOT } from './helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

console.log('\nscan.mjs — --json stdout stays machine-parseable (#1906)');

try {
  const scanUrl = JSON.stringify(pathToFileURL(join(ROOT, 'scan.mjs')).href);

  // dotenv is an optional import in scan.mjs. If it is not installed the
  // banner cannot fire and both checks below would pass without proving
  // anything, so say so rather than reporting a green that means nothing.
  const dotenvPresent = run(NODE, ['-e', 'await import("dotenv")']) !== null;

  if (!dotenvPresent) {
    warn('dotenv is not installed — cannot verify the stdout channel stays clean');
  } else {
    // Importing scan.mjs must be silent on stdout. scan.mjs guards its CLI
    // entry point, so the import runs module top level only.
    const importOut = run(NODE, ['-e', `await import(${scanUrl})`]);
    if (importOut === '') {
      pass('importing scan.mjs writes nothing to stdout');
    } else if (importOut === null) {
      fail('importing scan.mjs failed');
    } else {
      fail(`importing scan.mjs wrote to stdout: ${JSON.stringify(importOut.slice(0, 80))}`);
    }

    const tmp = mkdtempSync(join(tmpdir(), 'career-ops-json-'));
    try {
      const portals = join(tmp, 'portals.yml');
      writeFileSync(portals, 'tracked_companies: []\njob_boards: []\n');
      const jsonOut = execFileSync(NODE, [join(ROOT, 'scan.mjs'), '--dry-run', '--json'], {
        cwd: tmp,
        env: { ...process.env, CAREER_OPS_PORTALS: portals },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const parsed = JSON.parse(jsonOut);
      if (typeof parsed.date === 'string' && parsed.dryRun === true
          && Array.isArray(parsed.offers) && parsed.counts?.newAdded === 0) {
        pass('real scan.mjs --dry-run --json emits one machine-parseable result object');
      } else {
        fail(`real --json result has wrong shape: ${JSON.stringify(parsed).slice(0, 200)}`);
      }
    } catch (e) {
      fail(`real scan.mjs --json contract failed: ${e.message}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
} catch (e) {
  fail(`scan --json stdout tests crashed: ${e.message}`);
}
