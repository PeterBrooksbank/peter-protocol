import { test } from 'node:test';
import assert from 'node:assert/strict';
import { penceToDisplay, penceToCompact, parsePence, monthlyToAnnual, annualToMonthly, sumPence } from '../../protocol/finance/models/money.js';

test('penceToDisplay: zero', () => assert.equal(penceToDisplay(0), '£0.00'));
test('penceToDisplay: positive', () => assert.equal(penceToDisplay(123456), '£1,234.56'));
test('penceToDisplay: negative', () => assert.equal(penceToDisplay(-50), '-£0.50'));
test('penceToDisplay: exactly £1', () => assert.equal(penceToDisplay(100), '£1.00'));
test('penceToDisplay: large', () => assert.equal(penceToDisplay(10000000), '£100,000.00'));

test('penceToCompact: drops .00', () => assert.equal(penceToCompact(120000), '£1,200'));
test('penceToCompact: shows pence', () => assert.equal(penceToCompact(120050), '£1,200.50'));
test('penceToCompact: zero', () => assert.equal(penceToCompact(0), '£0'));

test('parsePence: integer string', () => assert.equal(parsePence('1234'), 123400));
test('parsePence: decimal', () => assert.equal(parsePence('1234.56'), 123456));
test('parsePence: £ and commas', () => assert.equal(parsePence('£1,234.56'), 123456));
test('parsePence: negative', () => assert.equal(parsePence('-50.00'), -5000));
test('parsePence: just pence', () => assert.equal(parsePence('.99'), 99));
test('parsePence: numeric input', () => assert.equal(parsePence(100), 10000));
test('parsePence: empty → null', () => assert.equal(parsePence(''), null));
test('parsePence: non-numeric → null', () => assert.equal(parsePence('abc'), null));
test('parsePence: null → null', () => assert.equal(parsePence(null), null));
test('parsePence: rounding', () => assert.equal(parsePence('1.006'), 101));

test('monthlyToAnnual: £500/mo → £6,000/yr', () => assert.equal(monthlyToAnnual(50000), 600000));
test('annualToMonthly: £60,000/yr → £5,000/mo', () => assert.equal(annualToMonthly(6000000), 500000));
test('annualToMonthly: rounds', () => assert.equal(annualToMonthly(1000000), 83333));

test('sumPence: values', () => assert.equal(sumPence([100, 200, 300]), 600));
test('sumPence: nulls', () => assert.equal(sumPence([100, null, undefined, 200]), 300));
test('sumPence: empty', () => assert.equal(sumPence([]), 0));
