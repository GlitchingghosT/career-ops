#!/usr/bin/env node

import { readFileSync, writeFileSync, renameSync, unlinkSync, lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT_PATH = resolve(ROOT, 'article-digest.md');
const MAX_INPUT_BYTES = 2 * 1024 * 1024;

export function sameFileIdentity(before, opened) {
  if (!before || !opened) return false;
  const comparable = ['dev', 'ino'].every(key =>
    (typeof before[key] === 'number' || typeof before[key] === 'bigint') &&
    (typeof opened[key] === 'number' || typeof opened[key] === 'bigint'));
  return !comparable || (before.dev === opened.dev && before.ino === opened.ino);
}

// Open once, compare the descriptor identity with the lstat result, and read
// no more than MAX_INPUT_BYTES + 1. O_NOFOLLOW closes the final-component
// symlink race where the platform supports it; dev/ino comparison also detects
// parent/path replacement that resolves to a different regular file.
export function readPortfolioCatalogFile(inputPath) {
  const initial = lstatSync(inputPath);
  if (initial.isSymbolicLink()) throw new Error('portfolio: symbolic links are not allowed as catalog inputs');
  if (!initial.isFile()) throw new Error('portfolio: catalog input must be a regular file');

  let fd;
  try {
    fd = openSync(inputPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error('portfolio: symbolic links are not allowed as catalog inputs');
    throw error;
  }
  try {
    const opened = fstatSync(fd);
    if (!sameFileIdentity(initial, opened)) throw new Error('portfolio: catalog input changed while opening');
    if (!opened.isFile()) throw new Error('portfolio: catalog input must be a regular file');
    if (opened.size > MAX_INPUT_BYTES) throw new Error(`portfolio: input exceeds ${MAX_INPUT_BYTES} bytes`);

    const buffer = Buffer.allocUnsafe(MAX_INPUT_BYTES + 1);
    let total = 0;
    while (total <= MAX_INPUT_BYTES) {
      const bytesRead = readSync(fd, buffer, total, MAX_INPUT_BYTES + 1 - total, null);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > MAX_INPUT_BYTES) throw new Error(`portfolio: input exceeds ${MAX_INPUT_BYTES} bytes`);
    return buffer.subarray(0, total).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

const clean = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const markdownText = (value) => clean(value)
  .replace(/\\/g, '\\\\')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\[/g, '\\[')
  .replace(/\]/g, '\\]');

function isLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!host || isIP(host) !== 0 || !host.includes('.')) return true;
  return ['.localhost', '.local', '.internal', '.lan', '.home', '.test', '.invalid']
    .some(suffix => host.endsWith(suffix));
}

function httpsUrl(value, field, required = true) {
  const raw = clean(value);
  if (!raw && !required) return null;
  if (!raw) throw new Error(`portfolio: ${field} is required`);
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error(`portfolio: ${field} must be a valid HTTPS URL`); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || isLocalHostname(parsed.hostname)) {
    throw new Error(`portfolio: ${field} must be a public HTTPS URL without embedded credentials`);
  }
  return parsed.href.replace(/\/$/, '');
}

/**
 * Validate and normalize a portfolio catalog.
 * @param {any} catalog
 */
export function parsePortfolioCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.projects) || catalog.projects.length === 0) {
    throw new Error('portfolio: catalog must contain a non-empty projects array');
  }
  const slugs = new Set();
  const orders = new Set();
  const projects = catalog.projects.map((project, index) => {
    if (!project || typeof project !== 'object') throw new Error(`portfolio: project ${index + 1} must be an object`);
    const slug = clean(project.slug);
    const title = markdownText(project.title);
    const description = markdownText(project.description);
    const contribution = markdownText(project.contribution);
    const order = Number(project.order);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`portfolio: project ${index + 1} has an invalid slug`);
    if (!title || !description || !contribution) throw new Error(`portfolio: ${slug || `project ${index + 1}`} requires title, description, and contribution`);
    if (!Number.isInteger(order) || order < 1) throw new Error(`portfolio: ${slug} requires a positive integer order`);
    if (slugs.has(slug)) throw new Error(`portfolio: duplicate slug ${slug}`);
    if (orders.has(order)) throw new Error(`portfolio: duplicate order ${order}`);
    slugs.add(slug); orders.add(order);

    const stack = Array.isArray(project.stack)
      ? [...new Set(project.stack.map(markdownText).filter(Boolean))]
      : [];
    if (stack.length === 0) throw new Error(`portfolio: ${slug} requires a non-empty stack`);

    return {
      slug,
      order,
      title,
      description,
      contribution,
      stack,
      source: httpsUrl(project.source, `${slug}.source`),
      live: httpsUrl(project.live, `${slug}.live`, false),
      status: markdownText(project.status) || null,
    };
  });
  return projects.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

/** @param {ReturnType<typeof parsePortfolioCatalog>} projects */
export function renderArticleDigest(projects) {
  const lines = [
    '# Article Digest — Verified Portfolio Evidence',
    '',
    'Generated from the public portfolio catalog. Treat the listed source and live links as the verification boundary; do not infer metrics, authorship, or production status beyond this file.',
    '',
  ];
  for (const project of projects) {
    lines.push(
      `## ${project.title}`,
      '',
      project.description,
      '',
      `**Verified contribution:** ${project.contribution}`,
      '',
      `**Stack:** ${project.stack.join(', ')}`,
      '',
      `**Source:** ${project.source}`,
    );
    if (project.live) lines.push('', `**Live/preview:** ${project.live}`);
    if (project.status) lines.push('', `**Status:** ${project.status}`);
    lines.push('', '---', '');
  }
  return `${lines.join('\n').trim()}\n`;
}

function parseArgs(argv) {
  let input = process.env.CAREER_OPS_PORTFOLIO_CATALOG || '';
  let check = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') input = argv[++i] || '';
    else if (argv[i] === '--check') check = true;
    else if (argv[i] === '--help' || argv[i] === '-h') return { help: true };
    else throw new Error(`portfolio: unknown argument ${argv[i]}`);
  }
  if (!input) throw new Error('portfolio: --input <path-to-projects.json> is required');
  return { input: resolve(input), check, help: false };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node sync-portfolio.mjs --input <projects.json> [--check]');
    return;
  }
  const catalog = JSON.parse(readPortfolioCatalogFile(args.input));
  const output = renderArticleDigest(parsePortfolioCatalog(catalog));
  if (args.check) {
    const current = (() => { try { return readFileSync(OUTPUT_PATH, 'utf8'); } catch { return ''; } })();
    if (current !== output) {
      console.error('article-digest.md is out of date; run portfolio:sync without --check');
      process.exitCode = 1;
    } else {
      console.log('article-digest.md is current');
    }
    return;
  }
  const temp = resolve(ROOT, `.article-digest.${process.pid}.tmp`);
  try {
    writeFileSync(temp, output, { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, OUTPUT_PATH);
  } finally {
    try { unlinkSync(temp); } catch {}
  }
  console.log(`Updated article-digest.md with ${catalog.projects.length} verified projects`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
