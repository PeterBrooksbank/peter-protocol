// test/finance-money.test.js — tests for finance-money.js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../protocol/finance-money.js');

// ── penceToDisplay ─────────────────────────────────────────────────────────

test('penceToDisplay: zero', () => {
  assert.equal(m.penceToDisplay(0), '£0.00');
});

test('penceToDisplay: positive pounds and pence', () => {
  assert.equal(m.penceToDisplay(123456), '£1,234.56');
});

test('penceToDisplay: negative', () => {
  assert.equal(m.penceToDisplay(-50), '-£0.50');
});

test('penceToDisplay: exactly £1', () => {
  assert.equal(m.penceToDisplay(100), '£1.00');
});

test('penceToDisplay: large amount', () => {
  assert.equal(m.penceToDisplay(10000000), '£100,000.00');
});

// ── penceToCompact ─────────────────────────────────────────────────────────

test('penceToCompact: no pence → drops .00', () => {
  assert.equal(m.penceToCompact(120000), '£1,200');
});

test('penceToCompact: has pence → shows decimals', () => {
  assert.equal(m.penceToCompact(120050), '£1,200.50');
});

test('penceToCompact: zero', () => {
  assert.equal(m.penceToCompact(0), '£0');
});

// ── parsePence ─────────────────────────────────────────────────────────────

test('parsePence: plain integer string', () => {
  assert.equal(m.parsePence('1234'), 123400);
});

test('parsePence: decimal string', () => {
  assert.equal(m.parsePence('1234.56'), 123456);
});

test('parsePence: with £ sign and commas', () => {
  assert.equal(m.parsePence('£1,234.56'), 123456);
});

test('parsePence: negative', () => {
  assert.equal(m.parsePence('-50.00'), -5000);
});

test('parsePence: just pence', () => {
  assert.equal(m.parsePence('.99'), 99);
});

test('parsePence: numeric input', () => {
  assert.equal(m.parsePence(100), 10000);
});

test('parsePence: empty string → null', () => {
  assert.equal(m.parsePence(''), null);
});

test('parsePence: non-numeric → null', () => {
  assert.equal(m.parsePence('abc'), null);
});

test('parsePence: null input → null', () => {
  assert.equal(m.parsePence(null), null);
});

test('parsePence: rounding to nearest penny', () => {
  // 1.006 * 100 = 100.6 → rounds to 101
  assert.equal(m.parsePence('1.006'), 101);
});

// ── monthlyToAnnual / annualToMonthly ──────────────────────────────────────

test('monthlyToAnnual: £500/mo → £6,000/yr', () => {
  assert.equal(m.monthlyToAnnual(50000), 600000);
});

test('annualToMonthly: £60,000/yr → £5,000/mo', () => {
  assert.equal(m.annualToMonthly(6000000), 500000);
});

test('annualToMonthly: rounds correctly', () => {
  // £10,000/yr = £833.33.../mo → 83333 pence
  assert.equal(m.annualToMonthly(1000000), 83333);
});

// ── sumPence ───────────────────────────────────────────────────────────────

test('sumPence: array of values', () => {
  assert.equal(m.sumPence([100, 200, 300]), 600);
});

test('sumPence: handles undefined/null entries', () => {
  assert.equal(m.sumPence([100, null, undefined, 200]), 300);
});

test('sumPence: empty array', () => {
  assert.equal(m.sumPence([]), 0);
});
