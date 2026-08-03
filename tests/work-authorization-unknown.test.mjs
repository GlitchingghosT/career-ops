#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nTri-state work authorization');

const profile = readFileSync(join(ROOT, 'config/profile.example.yml'), 'utf8');
const oferta = readFileSync(join(ROOT, 'modes/oferta.md'), 'utf8');
const apply = readFileSync(join(ROOT, 'modes/apply.md'), 'utf8');
const batch = readFileSync(join(ROOT, 'batch/batch-prompt.md'), 'utf8');

const checks = [
  [profile.includes('work_authorization:') && profile.includes('status: "unknown"') && profile.includes('require_confirmation_per_application: true'), 'profile template exposes explicit unknown work authorization'],
  [oferta.includes('❓ **Confirmation required**') && oferta.includes('work_authorization.status') && oferta.includes('never a hard blocker until the candidate confirms'), 'interactive evaluation treats unknown authorization as confirmation required'],
  [apply.includes('work_authorization.status') && apply.includes('confirmation required') && apply.includes('never auto-answer'), 'application mode never auto-answers unknown work authorization'],
  [batch.includes('confirmation_required') && (batch.match(/work_auth: "\{confirmation_required \| sponsors \| not_needed \| unstated \| no_sponsorship\}"/g) || []).length === 2 && batch.includes('❓ Confirmation required') && batch.includes('never a hard blocker until the candidate confirms'), 'batch evaluation preserves the unknown authorization tier in both machine schemas'],
];

for (const [ok, label] of checks) {
  if (ok) pass(label);
  else fail(label);
}
