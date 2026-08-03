#!/usr/bin/env node

/**
 * validate-portals.mjs — schema/shape validator for portals.yml.
 *
 * Usage:
 *   node validate-portals.mjs
 *   node validate-portals.mjs --file templates/portals.example.yml
 *   node validate-portals.mjs --self-test
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PROVIDERS_DIR = join(ROOT, 'providers');
const DEFAULT_PORTALS_PATH = process.env.CAREER_OPS_PORTALS || 'portals.yml';

function add(list, path, message) {
  list.push({ path, message });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function validateUrl(value, path, errors) {
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string') {
    add(errors, path, 'must be a string URL');
    return;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    add(errors, path, `invalid URL: ${value}`);
    return;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    add(errors, path, `unsupported URL protocol: ${parsed.protocol}`);
  }
}

function validateKeywordList(value, path, errors) {
  if (value === undefined || value === null) return;
  const arr = Array.isArray(value) ? value : [value];
  for (const [idx, item] of arr.entries()) {
    if (typeof item !== 'string') {
      add(errors, `${path}[${idx}]`, 'keyword must be a string');
      continue;
    }
    if (item.trim() === '') {
      add(errors, `${path}[${idx}]`, 'keyword must not be empty');
    }
  }
}

function validateContentFilter(value, path, errors, warnings, titlePositive = new Set()) {
  if (!isObject(value)) {
    add(errors, path, 'content filter must be an object');
    return;
  }
  if (value.require_description !== undefined && typeof value.require_description !== 'boolean') {
    add(errors, `${path}.require_description`, 'must be a boolean when set');
  }
  validateKeywordList(value.positive, `${path}.positive`, errors);
  validateKeywordList(value.negative, `${path}.negative`, errors);
  if (value.by_title_keyword === undefined) return;
  if (!isObject(value.by_title_keyword)) {
    add(errors, `${path}.by_title_keyword`, 'by_title_keyword must be an object keyed by title_filter.positive keyword');
    return;
  }
  for (const [kw, rule] of Object.entries(value.by_title_keyword)) {
    const rulePath = `${path}.by_title_keyword.${kw}`;
    if (!titlePositive.has(kw.trim().toLowerCase())) {
      add(warnings, rulePath, `"${kw}" does not match any title_filter.positive keyword and will never apply`);
    }
    if (!isObject(rule)) {
      add(errors, rulePath, 'must be an object with positive/negative keyword lists');
      continue;
    }
    validateKeywordList(rule.positive, `${rulePath}.positive`, errors);
    validateKeywordList(rule.negative, `${rulePath}.negative`, errors);
  }
}

function validateParser(parser, path, errors) {
  if (parser === undefined || parser === null) return;
  if (!isObject(parser)) {
    add(errors, path, 'parser must be an object');
    return;
  }
  if (typeof parser.command !== 'string' || parser.command.trim() === '') {
    add(errors, `${path}.command`, 'parser.command must be a non-empty string');
  }
  if (parser.script !== undefined && (typeof parser.script !== 'string' || parser.script.trim() === '')) {
    add(errors, `${path}.script`, 'parser.script must be a non-empty string when set');
  }
  if (parser.args !== undefined && !Array.isArray(parser.args)) {
    add(errors, `${path}.args`, 'parser.args must be an array when set');
  }
  if (parser.timeout_ms !== undefined && (!Number.isFinite(Number(parser.timeout_ms)) || Number(parser.timeout_ms) <= 0)) {
    add(errors, `${path}.timeout_ms`, 'parser.timeout_ms must be a positive number when set');
  }
  if (parser.max_buffer_bytes !== undefined && (!Number.isFinite(Number(parser.max_buffer_bytes)) || Number(parser.max_buffer_bytes) <= 0)) {
    add(errors, `${path}.max_buffer_bytes`, 'parser.max_buffer_bytes must be a positive number when set');
  }
}

async function loadProviderIds() {
  const ids = new Set();
  if (existsSync(PROVIDERS_DIR)) {
    const files = readdirSync(PROVIDERS_DIR)
      .filter(f => f.endsWith('.mjs') && !f.startsWith('_'))
      .sort();
    for (const file of files) {
      const mod = await import(pathToFileURL(join(PROVIDERS_DIR, file)).href);
      if (mod.default?.id) ids.add(mod.default.id);
    }
  }

  // scan.mjs accepts explicit provider-plugin ids even when a plugin is
  // disabled or missing credentials (the runtime installs an actionable
  // inactive-provider stub). Keep validation aligned with that contract.
  try {
    const { discoverPlugins, pluginRoots, resolveSuccessorIds } = await import('./plugins/_engine.mjs');
    const manifests = discoverPlugins(pluginRoots(ROOT), resolveSuccessorIds(ROOT));
    for (const manifest of manifests) {
      if (manifest.hooks.includes('provider')) ids.add(manifest.id);
    }
  } catch (err) {
    // A stripped-down checkout may not include plugin infrastructure. Core
    // provider validation should continue to work in that environment.
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  }
  return ids;
}

export async function validatePortalsConfig(config, { providerIds = new Set() } = {}) {
  const errors = [];
  const warnings = [];

  if (!isObject(config)) {
    add(errors, '<root>', 'portals config must be a YAML object');
    return { errors, warnings };
  }

  if (config.title_filter !== undefined) {
    if (!isObject(config.title_filter)) {
      add(errors, 'title_filter', 'title_filter must be an object');
    } else {
      validateKeywordList(config.title_filter.positive, 'title_filter.positive', errors);
      validateKeywordList(config.title_filter.negative, 'title_filter.negative', errors);
      validateKeywordList(config.title_filter.seniority_boost, 'title_filter.seniority_boost', errors);
    }
  }

  if (config.dedup_company_role !== undefined && typeof config.dedup_company_role !== 'boolean') {
    add(errors, 'dedup_company_role', 'must be a boolean when set');
  }
  if (config.dedup_cross_source !== undefined && typeof config.dedup_cross_source !== 'boolean') {
    add(errors, 'dedup_cross_source', 'must be a boolean when set');
  }
  if (config.max_required_experience_years !== undefined
      && (!Number.isFinite(Number(config.max_required_experience_years)) || Number(config.max_required_experience_years) < 0)) {
    add(errors, 'max_required_experience_years', 'must be a non-negative number when set');
  }

  if (config.location_filter !== undefined) {
    if (!isObject(config.location_filter)) {
      add(errors, 'location_filter', 'location_filter must be an object');
    } else {
      validateKeywordList(config.location_filter.always_allow, 'location_filter.always_allow', errors);
      validateKeywordList(config.location_filter.allow, 'location_filter.allow', errors);
      validateKeywordList(config.location_filter.block, 'location_filter.block', errors);
    }
  }

  if (config.content_filter !== undefined) {
    const titlePositive = new Set(
      (Array.isArray(config.title_filter?.positive) ? config.title_filter.positive : [])
        .filter(k => typeof k === 'string')
        .map(k => k.trim().toLowerCase())
    );
    validateContentFilter(config.content_filter, 'content_filter', errors, warnings, titlePositive);
  }

  if (config.visa_filter !== undefined) {
    if (!isObject(config.visa_filter)) {
      add(errors, 'visa_filter', 'visa_filter must be an object');
    } else {
      if (config.visa_filter.enabled !== undefined && typeof config.visa_filter.enabled !== 'boolean') {
        add(errors, 'visa_filter.enabled', 'must be a boolean when set');
      }
      if (config.visa_filter.require_mention !== undefined && typeof config.visa_filter.require_mention !== 'boolean') {
        add(errors, 'visa_filter.require_mention', 'must be a boolean when set');
      }
      validateKeywordList(config.visa_filter.positive, 'visa_filter.positive', errors);
      validateKeywordList(config.visa_filter.negative, 'visa_filter.negative', errors);
    }
  }

  if (config.search_queries !== undefined && !Array.isArray(config.search_queries)) {
    add(errors, 'search_queries', 'search_queries must be an array when set');
  } else if (Array.isArray(config.search_queries)) {
    for (const [idx, query] of config.search_queries.entries()) {
      const base = `search_queries[${idx}]`;
      if (!isObject(query)) {
        add(errors, base, 'search query entry must be an object');
        continue;
      }
      if (query.enabled === false) continue;
      if (typeof query.name !== 'string' || !query.name.trim()) add(errors, `${base}.name`, 'enabled search query must have a non-empty string name');
      if (typeof query.query !== 'string' || !query.query.trim()) add(errors, `${base}.query`, 'enabled search query must have a non-empty string query');
    }
  }

  if (config.job_boards !== undefined && !Array.isArray(config.job_boards)) {
    add(errors, 'job_boards', 'job_boards must be an array when set');
  } else if (Array.isArray(config.job_boards)) {
    const titlePositive = new Set(
      (Array.isArray(config.title_filter?.positive) ? config.title_filter.positive : [])
        .filter(k => typeof k === 'string')
        .map(k => k.trim().toLowerCase())
    );
    for (const [idx, board] of config.job_boards.entries()) {
      const base = `job_boards[${idx}]`;
      if (!isObject(board)) {
        add(errors, base, 'job board entry must be an object');
        continue;
      }
      if (board.enabled === false) continue;
      if (typeof board.name !== 'string' || !board.name.trim()) add(errors, `${base}.name`, 'enabled job board must have a non-empty string name');
      if (typeof board.provider !== 'string' || !board.provider.trim()) {
        add(errors, `${base}.provider`, 'enabled job board must have a non-empty provider');
      } else if (!providerIds.has(board.provider)) {
        add(errors, `${base}.provider`, `unknown provider "${board.provider}"`);
      }
      if (board.content_filter !== undefined) validateContentFilter(board.content_filter, `${base}.content_filter`, errors, warnings, titlePositive);
    }
  }

  const companies = config.tracked_companies;
  if (companies !== undefined && !Array.isArray(companies)) {
    add(errors, 'tracked_companies', 'tracked_companies must be an array when set');
  }

  const seenEnabledNames = new Map();
  if (Array.isArray(companies)) {
    for (const [idx, company] of companies.entries()) {
      const base = `tracked_companies[${idx}]`;
      if (!isObject(company)) {
        add(errors, base, 'company entry must be an object');
        continue;
      }
      if (company.enabled === false) continue;

      if (typeof company.name !== 'string' || company.name.trim() === '') {
        add(errors, `${base}.name`, 'enabled company must have a non-empty string name');
      } else {
        const normalized = normalizeName(company.name);
        if (seenEnabledNames.has(normalized)) {
          add(warnings, `${base}.name`, `duplicate enabled company name also seen at ${seenEnabledNames.get(normalized)}`);
        } else {
          seenEnabledNames.set(normalized, `${base}.name`);
        }
      }

      validateUrl(company.careers_url, `${base}.careers_url`, errors);
      validateUrl(company.api, `${base}.api`, errors);

      if (company.provider !== undefined) {
        if (typeof company.provider !== 'string' || company.provider.trim() === '') {
          add(errors, `${base}.provider`, 'provider must be a non-empty string when set');
        } else if (!providerIds.has(company.provider)) {
          add(errors, `${base}.provider`, `unknown provider "${company.provider}"`);
        }
      }

      validateParser(company.parser, `${base}.parser`, errors);
    }
  }

  return { errors, warnings };
}

function formatIssue(issue) {
  return `${issue.path}: ${issue.message}`;
}

async function validateFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }
  const providerIds = await loadProviderIds();
  const parsed = yaml.load(readFileSync(filePath, 'utf-8'));
  return validatePortalsConfig(parsed, { providerIds });
}

async function runSelfTest() {
  const tmp = mkdtempSync(join(tmpdir(), 'career-ops-validate-portals-self-test-'));
  try {
    const file = join(tmp, 'bad.yml');
    writeFileSync(file, `
title_filter:
  positive: ["AI", ""]
tracked_companies:
  - name: "Acme"
    provider: "not-real"
    careers_url: "https://jobs.lever.co/acme"
`, 'utf-8');
    const result = await validateFile(file);
    if (result.errors.length !== 2) {
      throw new Error(`expected 2 errors, got ${result.errors.length}`);
    }
    console.log('validate-portals self-test OK');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    await runSelfTest();
    return;
  }

  const fileFlag = args.indexOf('--file');
  const filePath = resolve(fileFlag === -1 ? DEFAULT_PORTALS_PATH : args[fileFlag + 1] || '');
  if (!filePath) {
    console.error('Usage: node validate-portals.mjs [--file portals.yml] [--self-test]');
    process.exit(1);
  }

  let result;
  try {
    result = await validateFile(filePath);
  } catch (err) {
    console.error(`validate-portals failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`validate-portals: ${filePath}`);
  for (const warning of result.warnings) console.log(`warning: ${formatIssue(warning)}`);
  for (const error of result.errors) console.log(`error: ${formatIssue(error)}`);
  console.log(`${result.errors.length} errors, ${result.warnings.length} warnings`);

  if (result.errors.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`validate-portals failed: ${err.message}`);
  process.exit(1);
});
