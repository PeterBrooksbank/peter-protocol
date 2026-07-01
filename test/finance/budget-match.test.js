// test/finance/budget-match.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRule, findMatch, autoMatch, deriveRule } from '../../protocol/finance/engine/budget-match.js';

// ── applyRule ─────────────────────────────────────────────────────────────────

test('applyRule: exact match', () => assert.equal(applyRule('NETFLIX.COM', 'NETFLIX'), true));
test('applyRule: case-insensitive', () => assert.equal(applyRule('netflix.com', 'Netflix'), true));
test('applyRule: partial match within description', () => assert.equal(applyRule('AMAZON MKTPL 1234 LONDON', 'AMAZON'), true));
test('applyRule: rule longer than description → false', () => assert.equal(applyRule('TESCO', 'TESCO SUPERSTORE'), false));
test('applyRule: no match', () => assert.equal(applyRule('COUNCIL TAX DIRECT DEBIT', 'NETFLIX'), false));
test('applyRule: null rule → false', () => assert.equal(applyRule('NETFLIX', null), false));
test('applyRule: empty rule → false', () => assert.equal(applyRule('NETFLIX', ''), false));
test('applyRule: whitespace-only rule → false', () => assert.equal(applyRule('NETFLIX', '   '), false));
test('applyRule: rule trims leading/trailing spaces', () => assert.equal(applyRule('NETFLIX', '  NETFLIX  '), true));

// ── findMatch ─────────────────────────────────────────────────────────────────

const lines = [
  { id: 'l1', name: 'Netflix',     match_rule: 'NETFLIX' },
  { id: 'l2', name: 'Groceries',   match_rule: 'TESCO' },
  { id: 'l3', name: 'Broadband',   match_rule: 'BROADBAND' },
  { id: 'l4', name: 'No rule',     match_rule: null },
];

test('findMatch: returns first matching line', () => {
  const m = findMatch('NETFLIX STREAMING MONTHLY', lines);
  assert.equal(m?.id, 'l1');
});

test('findMatch: second line in list', () => {
  const m = findMatch('TESCO METRO LONDON 1234', lines);
  assert.equal(m?.id, 'l2');
});

test('findMatch: no match returns null', () => {
  assert.equal(findMatch('AMAZON PRIME 12345', lines), null);
});

test('findMatch: empty description returns null', () => {
  assert.equal(findMatch('', lines), null);
});

test('findMatch: empty lines array returns null', () => {
  assert.equal(findMatch('NETFLIX', []), null);
});

test('findMatch: line with null rule is skipped', () => {
  const withNullFirst = [{ id: 'null', match_rule: null }, lines[0]];
  assert.equal(findMatch('NETFLIX', withNullFirst)?.id, 'l1');
});

test('findMatch: first match wins when multiple lines could match', () => {
  const overlap = [
    { id: 'a', match_rule: 'TESCO' },
    { id: 'b', match_rule: 'TESCO METRO' },
  ];
  assert.equal(findMatch('TESCO METRO LONDON', overlap)?.id, 'a');
});

// ── autoMatch ─────────────────────────────────────────────────────────────────

test('autoMatch: annotates each transaction with matched_line or null', () => {
  const txns = [
    { id: 't1', description: 'NETFLIX PAYMENT' },
    { id: 't2', description: 'AMAZON PRIME' },
    { id: 't3', description: 'TESCO SUPERSTORE 456' },
  ];
  const result = autoMatch(txns, lines);
  assert.equal(result[0].matched_line?.id, 'l1');
  assert.equal(result[1].matched_line, null);
  assert.equal(result[2].matched_line?.id, 'l2');
});

test('autoMatch: preserves all original transaction fields', () => {
  const txns = [{ id: 't1', description: 'NETFLIX', amount_pence: -1099, date: '2026-07-01' }];
  const [r] = autoMatch(txns, lines);
  assert.equal(r.id, 't1');
  assert.equal(r.amount_pence, -1099);
  assert.equal(r.date, '2026-07-01');
});

// ── deriveRule ────────────────────────────────────────────────────────────────

test('deriveRule: strips long digit sequences', () => {
  const rule = deriveRule('TESCO METRO 123456 LONDON');
  assert.ok(!rule.includes('123456'), `should strip digits, got: ${rule}`);
});

test('deriveRule: trims and caps at 50 chars', () => {
  const long = 'A'.repeat(100);
  assert.ok(deriveRule(long).length <= 50);
});
