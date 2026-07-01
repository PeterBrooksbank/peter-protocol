import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRates, getRatesForDate, taxYearFor, RATE_TABLES } from '../../protocol/finance/models/rates.js';

test('taxYearFor: 6 April → new year', () => assert.equal(taxYearFor('2026-04-06'), '2026/27'));
test('taxYearFor: August → same start', () => assert.equal(taxYearFor('2026-08-01'), '2026/27'));
test('taxYearFor: January → previous start', () => assert.equal(taxYearFor('2027-01-01'), '2026/27'));
test('taxYearFor: 5 April → old year', () => assert.equal(taxYearFor('2026-04-05'), '2025/26'));

test('getRates: known year', () => assert.equal(getRates('2026/27', 'ruk').year, '2026/27'));
test('getRates: unknown region falls back to ruk', () => assert.equal(getRates('2026/27', 'scot').region, 'ruk'));
test('getRates: unknown year falls back to latest', () => assert.ok(getRates('2030/31').personal_allowance_pence > 0));
test('getRatesForDate: date in 2026/27', () => assert.equal(getRatesForDate('2026-06-30').year, '2026/27'));

// 2026/27 spot checks
const R = getRates('2026/27', 'ruk');
test('PA = £12,570', () => assert.equal(R.personal_allowance_pence, 1_257_000));
test('PA taper threshold = £100k', () => assert.equal(R.pa_taper_threshold_pence, 10_000_000));
test('PA taper floor = £125,140', () => assert.equal(R.pa_taper_floor_pence, 12_514_000));
test('higher rate threshold = £50,270', () => assert.equal(R.higher_rate_threshold_pence, 5_027_000));
test('basic band upper = £50,270 gross', () => assert.equal(R.it_bands[0].to, 5_027_000));
test('higher band upper = £125,140 gross', () => assert.equal(R.it_bands[1].to, 12_514_000));
test('basic rate 20%', () => assert.equal(R.it_bands[0].rate_bps, 2000));
test('higher rate 40%', () => assert.equal(R.it_bands[1].rate_bps, 4000));
test('additional rate 45%', () => assert.equal(R.it_bands[2].rate_bps, 4500));
test('NI main rate 8%', () => assert.equal(R.ni_main_bps, 800));
test('dividend allowance £500', () => assert.equal(R.dividend_allowance_pence, 50_000));
test('SL plan 2 threshold', () => assert.equal(R.student_loan[2].threshold_pence, 2_827_500));
test('HICBC lower £60k', () => assert.equal(R.hicbc_lower_pence, 6_000_000));
test('pension AA £60k', () => assert.equal(R.pension_aa_pence, 6_000_000));
