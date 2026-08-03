// tests/company-role-dedup-config.test.mjs — high-recall users may preserve distinct requisitions.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('\nCompany-role dedup configuration');

try {
  const { companyRoleDedupEnabled } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);
  if (companyRoleDedupEnabled({}) === true && companyRoleDedupEnabled(null) === true) {
    pass('company-role dedup remains enabled by default');
  } else {
    fail('company-role dedup default changed');
  }
  if (companyRoleDedupEnabled({ dedup_company_role: false }) === false) {
    pass('dedup_company_role:false preserves distinct same-title requisitions');
  } else {
    fail('dedup_company_role:false was ignored');
  }
} catch (error) {
  fail(`company-role dedup config tests crashed: ${error?.stack || error}`);
}
