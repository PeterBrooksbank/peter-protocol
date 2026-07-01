// test/tax-rates.test.js — tests for tax-rates.js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getRates, getRatesForDate, taxYearFor, RATE_TABLES } = require('../protocol/tax-rates.js');

// ── taxYearFor ─────────────────────────────────────────────────────────────

test('taxYearFor: after 6 April → current year start', () => {
  assert.equal(taxYearFor('2026-04-06'), '2026/27');
});

test('taxYearFor: August → same year start', () => {
  assert.equal(taxYearFor('2026-08-01'), '2026/27');
});

test('taxYearFor: January → previous year start', () => {
  assert.equal(taxYearFor('2027-01-01'), '2026/27');
});

test('taxYearFor: 5 April (last day of old year)', () => {
  assert.equal(taxYearFor('2026-04-05'), '2025/26');
});

test('taxYearFor: 6 April exactly (first day of new year)', () => {
  assert.equal(taxYearFor('2026-04-06'), '2026/27');
});

// ── getRates ──────────────────────────────────────────────────────────────

test('getRates: known year + region returns table', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.year, '2026/27');
  assert.equal(r.region, 'ruk');
});

test('getRates: unknown region falls back to ruk', () => {
  const r = getRates('2026/27', 'scot');
  assert.equal(r.region, 'ruk');
});

test('getRates: unknown year falls back to most recent ruk', () => {
  const r = getRates('2030/31', 'ruk');
  assert.ok(r.personal_allowance_pence > 0);
});

// ── getRatesForDate ───────────────────────────────────────────────────────

test('getRatesForDate: date in 2026/27 tax year', () => {
  const r = getRatesForDate('2026-06-30');
  assert.equal(r.year, '2026/27');
});

// ── Spot-check 2026/27 ruk values ─────────────────────────────────────────

test('2026/27 ruk: personal allowance', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.personal_allowance_pence, 1257000); // £12,570
});

test('2026/27 ruk: PA taper threshold £100k', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.pa_taper_threshold_pence, 10000000);
});

test('2026/27 ruk: PA taper floor £125,140', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.pa_taper_floor_pence, 12514000);
});

test('2026/27 ruk: basic rate 20%', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.it_bands[0].rate_bps, 2000);
});

test('2026/27 ruk: higher rate 40%', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.it_bands[1].rate_bps, 4000);
});

test('2026/27 ruk: additional rate 45%', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.it_bands[2].rate_bps, 4500);
});

test('2026/27 ruk: NI main rate 8%', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.ni_rate_main_bps, 800);
});

test('2026/27 ruk: dividend allowance £500', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.dividend_allowance_pence, 50000);
});

test('2026/27 ruk: plan 2 SL threshold', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.student_loan.plan2.threshold_pence, 2827500); // £28,275
});

test('2026/27 ruk: HICBC lower £60k', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.hicbc_lower_pence, 6000000);
});

test('2026/27 ruk: pension annual allowance £60k', () => {
  const r = getRates('2026/27', 'ruk');
  assert.equal(r.pension_annual_allowance_pence, 6000000);
});
