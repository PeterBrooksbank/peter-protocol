// test/finance/projections.test.js — golden tests for account balance projections
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectBalance, monthsBetween } from '../../protocol/finance/engine/projections.js';

// ── monthsBetween ─────────────────────────────────────────────────────────────

test('monthsBetween: same month → 0', () =>
  assert.equal(monthsBetween('2026-01-01', '2026-01-01'), 0));

test('monthsBetween: 6 months forward', () =>
  assert.equal(monthsBetween('2026-01-01', '2026-07-01'), 6));

test('monthsBetween: 12 months = 1 year', () =>
  assert.equal(monthsBetween('2025-07-01', '2026-07-01'), 12));

test('monthsBetween: cross year boundary', () =>
  assert.equal(monthsBetween('2026-10-01', '2027-03-01'), 5));

test('monthsBetween: toDate before fromDate → 0', () =>
  assert.equal(monthsBetween('2026-07-01', '2026-01-01'), 0));

test('monthsBetween: works with YYYY-MM-DD mid-month dates', () =>
  assert.equal(monthsBetween('2026-01-15', '2026-04-20'), 3));

// ── Manual mode ───────────────────────────────────────────────────────────────

test('manual mode: always returns snapshot, no projection', () => {
  const r = projectBalance({ snapshotPence: 5_000_000, snapshotDate: '2026-01-01',
    toDate: '2026-07-01', mode: 'manual' });
  assert.equal(r.balance_pence, 5_000_000);
  assert.equal(r.months_projected, 0);
});

test('manual mode: even with rates provided, returns snapshot unchanged', () => {
  const r = projectBalance({ snapshotPence: 1_000_000, snapshotDate: '2026-01-01',
    toDate: '2026-12-01', mode: 'manual', annualRateBps: 500 });
  assert.equal(r.balance_pence, 1_000_000);
});

// ── Pension / contribution (grow) ─────────────────────────────────────────────

test('pension: 0% growth, linear contributions', () => {
  // £50k opening + £1k/mo × 6 months = £56k
  const r = projectBalance({
    snapshotPence: 5_000_000, snapshotDate: '2026-01-01',
    toDate: '2026-07-01', mode: 'pension',
    monthlyContribPence: 100_000, annualRateBps: 0,
  });
  assert.equal(r.balance_pence, 5_600_000); // 5_000_000 + 6 × 100_000
  assert.equal(r.months_projected, 6);
});

test('pension: 7% annual growth, no contributions', () => {
  // £50k at 7%/yr for 12 months = £50k × 1.07 = £53,500
  const r = projectBalance({
    snapshotPence: 5_000_000, snapshotDate: '2026-07-01',
    toDate: '2027-07-01', mode: 'pension',
    monthlyContribPence: 0, annualRateBps: 700,
  });
  // Allow ±50p for floating-point rounding over 12 monthly steps
  assert.ok(Math.abs(r.balance_pence - 5_350_000) <= 50,
    `expected ~5,350,000, got ${r.balance_pence}`);
  assert.equal(r.months_projected, 12);
});

test('pension: 7% growth + £1k/mo contributions for 12 months', () => {
  // Rough check: should be between linear (£62k) and full compound (>£62k)
  const r = projectBalance({
    snapshotPence: 5_000_000, snapshotDate: '2026-07-01',
    toDate: '2027-07-01', mode: 'pension',
    monthlyContribPence: 100_000, annualRateBps: 700,
  });
  assert.ok(r.balance_pence > 6_200_000, 'should exceed linear total'); // > £62k
  assert.ok(r.balance_pence < 6_600_000, 'should be less than unrealistically high'); // sanity cap
});

test('contribution mode: same math as pension', () => {
  const pension = projectBalance({ snapshotPence: 1_000_000, snapshotDate: '2026-01-01',
    toDate: '2026-07-01', mode: 'pension', monthlyContribPence: 50_000, annualRateBps: 500 });
  const contrib = projectBalance({ snapshotPence: 1_000_000, snapshotDate: '2026-01-01',
    toDate: '2026-07-01', mode: 'contribution', monthlyContribPence: 50_000, annualRateBps: 500 });
  assert.equal(pension.balance_pence, contrib.balance_pence);
});

test('pension: 0 months elapsed returns snapshot', () => {
  const r = projectBalance({ snapshotPence: 2_000_000, snapshotDate: '2026-07-01',
    toDate: '2026-07-15', mode: 'pension', monthlyContribPence: 100_000 });
  assert.equal(r.balance_pence, 2_000_000);
  assert.equal(r.months_projected, 0);
});

// ── Amortising (mortgage) ─────────────────────────────────────────────────────
// £300k mortgage, £1,500/mo payment, 4.25% annual (0.354167%/mo)

test('mortgage: 1 month amortisation', () => {
  // Month 1: interest = 30,000,000 × (0.0425/12) = 30,000,000 × 0.00354167 ≈ 106,250
  // principal = 150,000 - 106,250 = 43,750
  // balance = 30,000,000 - 43,750 = 29,956,250
  const r = projectBalance({
    snapshotPence: 30_000_000, snapshotDate: '2026-01-01',
    toDate: '2026-02-01', mode: 'amortising',
    monthlyPaymentPence: 150_000, annualRateBps: 425,
  });
  assert.ok(Math.abs(r.balance_pence - 29_956_250) <= 10,
    `expected ~29,956,250, got ${r.balance_pence}`);
  assert.equal(r.months_projected, 1);
});

test('mortgage: 12 months reduces balance', () => {
  const r = projectBalance({
    snapshotPence: 30_000_000, snapshotDate: '2026-01-01',
    toDate: '2027-01-01', mode: 'amortising',
    monthlyPaymentPence: 150_000, annualRateBps: 425,
  });
  // After 12 months at £1,500/mo, balance should be noticeably lower than £300k
  assert.ok(r.balance_pence < 29_500_000, 'balance should decrease over 12 months');
  assert.ok(r.balance_pence > 29_000_000, 'balance should not decrease too fast');
  assert.equal(r.months_projected, 12);
});

test('mortgage: 0% rate → pure principal reduction', () => {
  // No interest: £300k − 12 × £1,500 = £282k
  const r = projectBalance({
    snapshotPence: 30_000_000, snapshotDate: '2026-01-01',
    toDate: '2027-01-01', mode: 'amortising',
    monthlyPaymentPence: 150_000, annualRateBps: 0,
  });
  assert.equal(r.balance_pence, 28_200_000); // 30,000,000 - 12 × 150,000
});

test('mortgage: balance never goes below 0', () => {
  // Overpay a very small balance
  const r = projectBalance({
    snapshotPence: 100_000, snapshotDate: '2026-01-01',
    toDate: '2026-06-01', mode: 'amortising',
    monthlyPaymentPence: 150_000, annualRateBps: 425,
  });
  assert.equal(r.balance_pence, 0);
});

test('student loan: amortising mode works the same way', () => {
  // £20k, £300/mo, 6.25%
  const r = projectBalance({
    snapshotPence: 2_000_000, snapshotDate: '2026-01-01',
    toDate: '2027-01-01', mode: 'amortising',
    monthlyPaymentPence: 30_000, annualRateBps: 625,
  });
  assert.ok(r.balance_pence < 2_000_000, 'balance should decrease');
  assert.ok(r.balance_pence > 1_500_000, 'balance should not drop too fast');
});
