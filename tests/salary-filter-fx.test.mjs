// tests/salary-filter-fx.test.mjs — dated, opt-in FX conversion for annual salary ranges.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nSalary filter — dated FX conversion');

try {
  const { buildSalaryFilter } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);
  const now = new Date('2026-08-03T12:00:00Z');
  const config = {
    min: 10400,
    max: 0,
    currency: 'USD',
    on_currency_mismatch: 'pass',
    exchange_rates: {
      base: 'USD',
      as_of: '2026-08-01',
      max_age_days: 30,
      source: 'user-supplied test fixture',
      rates: { USD: 1, NGN: 1530, EUR: 0.92 },
    },
  };
  const filter = buildSalaryFilter(config, now);

  if (filter({ min: 16000000, max: 16000000, currency: 'NGN' }) === true) pass('fresh NGN rate converts a salary above the USD floor');
  else fail('fresh NGN rate rejected a salary above the USD floor');

  if (filter({ min: 15000000, max: 15300000, currency: 'NGN' }) === false) pass('fresh NGN rate rejects a salary wholly below the USD floor');
  else fail('fresh NGN rate passed a salary wholly below the USD floor');

  if (filter({ min: 10000, max: 10000, currency: 'EUR' }) === true) pass('fresh EUR rate converts through the configured USD base');
  else fail('fresh EUR rate failed cross-currency conversion');

  if (filter({ min: 9000, max: 10000, currency: 'USD' }) === false) pass('same-currency filtering remains unchanged');
  else fail('same-currency salary below the floor passed');

  const missingRatePass = buildSalaryFilter({ ...config, exchange_rates: { ...config.exchange_rates, rates: { USD: 1 } } }, now);
  if (missingRatePass({ min: 20000000, max: 25000000, currency: 'NGN' }) === true) pass('missing FX rate passes for manual review when configured');
  else fail('missing FX rate was rejected despite pass-on-mismatch policy');

  const stalePass = buildSalaryFilter({ ...config, exchange_rates: { ...config.exchange_rates, as_of: '2026-01-01' } }, now);
  if (stalePass({ min: 20000000, max: 25000000, currency: 'NGN' }) === true) pass('stale FX rates pass for manual review when configured');
  else fail('stale FX rate was used to reject a job');

  const legacyReject = buildSalaryFilter({ min: 10400, max: 0, currency: 'USD' }, now);
  if (legacyReject({ min: 20000000, max: 25000000, currency: 'NGN' }) === false) pass('legacy config still rejects known currency mismatches');
  else fail('legacy currency-mismatch behavior changed');

  const explicitPass = buildSalaryFilter({ min: 10400, max: 0, currency: 'USD', on_currency_mismatch: 'pass' }, now);
  if (explicitPass({ min: 20000000, max: 25000000, currency: 'NGN' }) === true) pass('explicit mismatch policy keeps unknown conversions for review');
  else fail('explicit pass-on-mismatch policy rejected an unknown conversion');
} catch (error) {
  fail(`salary FX filter could not be tested: ${error?.stack || error}`);
}
