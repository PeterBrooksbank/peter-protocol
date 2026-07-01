// test/finance/engine.test.js — golden-case tests for the UK tax engine
// All monetary assertions are in pence. Tolerances: ±1p for monthly-divided values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePersonIncome, parseTaxCode, cliffEdges } from '../../protocol/finance/engine/tax-engine.js';
import { getRates } from '../../protocol/finance/models/rates.js';

const DATE = '2026-08-01'; // 2026/27 tax year
const PERSON = { id: 'p1' };
const NO_SETTINGS = {};

// Helper to build a minimal source
function src(overrides) {
  return {
    id: 's1', name: 'Job', kind: 'employment',
    tax_code: '1257L', is_primary: 1,
    pension_method: 'none', pension_ee_type: 'pct', pension_ee_value: 0,
    pension_er_type: 'pct', pension_er_value: 0,
    student_loan_plan: 'none',
    gross_monthly_pence: 0,
    ...overrides,
  };
}

// ── parseTaxCode ──────────────────────────────────────────────────────────────

test('parseTaxCode: 1288L with override £12,882 uses exact pence', () => {
  const r = parseTaxCode('1288L', 1_288_200);
  assert.equal(r.type, 'L');
  assert.equal(r.allowance_pence, 1_288_200);
});

test('1288L override pays less tax than 1257L on £60k', () => {
  // 1288L gives £312 more allowance → £62.40/yr less tax (£312 × 20%)
  const std  = computePersonIncome(PERSON, [src({ gross_monthly_pence: 500_000 })], [], NO_SETTINGS, DATE);
  const over = computePersonIncome(PERSON, [src({
    gross_monthly_pence: 500_000,
    tax_code: '1288L',
    tax_code_allowance_pence: 1_288_200,
  })], [], NO_SETTINGS, DATE);
  assert.ok(over.total_income_tax_monthly_pence < std.total_income_tax_monthly_pence,
    '1288L should pay less tax than 1257L');
  // Difference: £312 × 20% = £62.40/yr → ~5p/mo
  const annualDiff = (std.total_income_tax_monthly_pence - over.total_income_tax_monthly_pence) * 12;
  assert.ok(Math.abs(annualDiff - 6240) <= 100, `annual saving should be ~£62.40, got ${annualDiff}p`);
});

test('parseTaxCode: 1257L → allowance £12,570', () => {
  const r = parseTaxCode('1257L');
  assert.equal(r.type, 'L');
  assert.equal(r.allowance_pence, 1_257_000);
});

test('parseTaxCode: BR → flat 20%, no allowance', () => {
  assert.deepEqual(parseTaxCode('BR'), { type: 'BR', allowance_pence: 0 });
});

test('parseTaxCode: D0 → flat 40%, no allowance', () => {
  assert.deepEqual(parseTaxCode('D0'), { type: 'D0', allowance_pence: 0 });
});

test('parseTaxCode: D1 → flat 45%, no allowance', () => {
  assert.deepEqual(parseTaxCode('D1'), { type: 'D1', allowance_pence: 0 });
});

test('parseTaxCode: 0T → no allowance, bands apply', () => {
  assert.deepEqual(parseTaxCode('0T'), { type: '0T', allowance_pence: 0 });
});

test('parseTaxCode: NT → no tax', () => {
  assert.deepEqual(parseTaxCode('NT'), { type: 'NT', allowance_pence: 0 });
});

test('parseTaxCode: K500 → negative allowance -£5,000', () => {
  const r = parseTaxCode('K500');
  assert.equal(r.type, 'K');
  assert.equal(r.allowance_pence, -500_000);
});

// ── Standard 1257L, £50k salary (below higher-rate threshold) ────────────────
// Annual: 5,000,000p. PA: 1,257,000p. Taxable: 3,743,000p.
// Tax: 3,743,000 × 20% = 748,600p/yr → 62,383p/mo
// NI monthly on 416,667p: (416,667 - 104,750) × 8% = 311,917 × 8% = 24,953p
// Net: 416,667 - 0 - 62,383 - 24,953 = 329,331p

test('£50k 1257L: income tax monthly ≈ £624/mo', () => {
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 416_667 })], [], NO_SETTINGS, DATE);
  // 748,600 / 12 = 62,383.33 → 62,383p
  assert.ok(Math.abs(result.total_income_tax_monthly_pence - 62_383) <= 1, `got ${result.total_income_tax_monthly_pence}`);
});

test('£50k 1257L: NI monthly ≈ 24,953p', () => {
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 416_667 })], [], NO_SETTINGS, DATE);
  assert.ok(Math.abs(result.total_ni_monthly_pence - 24_953) <= 1, `got ${result.total_ni_monthly_pence}`);
});

test('£40k 1257L: no cliff edges (well below all thresholds)', () => {
  // £40k/yr = 333,333p/mo — well below higher-rate threshold £50,270
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 333_333 })], [], NO_SETTINGS, DATE);
  assert.equal(result.cliff_edges.length, 0);
});

// ── £60k salary, 1257L, crosses higher-rate threshold ────────────────────────
// Annual: 7,200,000p. Taxable: 5,943,000p.
// Basic band: 3,770,000 × 20% = 754,000p
// Higher band: (5,943,000 - 3,770,000) × 40% = 2,173,000 × 40% = 869,200p
// Annual tax: 1,623,200p → monthly: 135,267p
// NI: main (418,917-104,750)×8% = 25,133p; upper (500,000-418,917)×2% = 1,622p → 26,755p

// £60k/yr = 500,000p/mo. Taxable: 4,743,000p. Basic 3,770,000×20%=754,000 + higher 973,000×40%=389,200 = 1,143,200/yr → 95,267/mo
test('£60k 1257L: income tax monthly ≈ 95,267p', () => {
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 500_000 })], [], NO_SETTINGS, DATE);
  assert.ok(Math.abs(result.total_income_tax_monthly_pence - 95_267) <= 1, `got ${result.total_income_tax_monthly_pence}`);
});

test('£60k 1257L: NI monthly ≈ 26,755p', () => {
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 500_000 })], [], NO_SETTINGS, DATE);
  assert.ok(Math.abs(result.total_ni_monthly_pence - 26_755) <= 1, `got ${result.total_ni_monthly_pence}`);
});

// ── D0 second job ─────────────────────────────────────────────────────────────
// £1,000/mo (£12k/yr) on D0 code. Tax = 40% = £400/mo.
// Monthly gross = 100,000p. NI: 100,000 < PT (104,750) → 0.

test('D0 second job £1k/mo: tax = 40%', () => {
  const result = computePersonIncome(PERSON, [src({ tax_code: 'D0', gross_monthly_pence: 100_000 })], [], NO_SETTINGS, DATE);
  assert.equal(result.total_income_tax_monthly_pence, 40_000);
});

test('D0 second job £1k/mo: NI = 0 (below primary threshold)', () => {
  const result = computePersonIncome(PERSON, [src({ tax_code: 'D0', gross_monthly_pence: 100_000 })], [], NO_SETTINGS, DATE);
  assert.equal(result.total_ni_monthly_pence, 0);
});

// ── Two sources: primary 1257L + D0 second job ───────────────────────────────

test('two sources: primary 1257L £60k + D0 £12k: totals combine', () => {
  const primary = src({ id: 's1', tax_code: '1257L', is_primary: 1, gross_monthly_pence: 500_000 });
  const second  = src({ id: 's2', tax_code: 'D0',   is_primary: 0, gross_monthly_pence: 100_000 });
  const result  = computePersonIncome(PERSON, [primary, second], [], NO_SETTINGS, DATE);

  // Primary tax: 95,267p; secondary D0 tax: 40,000p
  assert.ok(Math.abs(result.total_income_tax_monthly_pence - 135_267) <= 2, `got ${result.total_income_tax_monthly_pence}`);
  // ANI = (60,000 + 12,000) × 100p = 7,200,000p
  assert.equal(result.adjusted_net_income_pence, 7_200_000);
});

// ── £100k salary: approaching PA taper (within £5k warning distance) ─────────

test('£100k salary: cliff warning for PA taper', () => {
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 833_333 })], [], NO_SETTINGS, DATE);
  const taper = result.cliff_edges.find(c => c.id === 'pa_taper_start');
  // ANI = 9,999,996p, threshold = 10,000,000p, distance ≈ 4p
  assert.ok(taper, 'should have pa_taper_start cliff warning');
  assert.equal(taper.direction, 'approaching');
});

// ── £110k salary: PA tapered ──────────────────────────────────────────────────
// ANI = 13,200,000p. Exceeds taper threshold by 3,200,000p (£32k).
// PA reduction = floor(3,200,000 / 200) × 100 = 1,600,000p
// Theoretical PA = 1,257,000 - 1,600,000 = 0 (cannot go below 0, tapered out)
// Wait: 3,200,000 / 2 = 1,600,000 reduction. 1,257,000 - 1,600,000 < 0 → 0.
// Actually at £110k: reduction = (110,000 - 100,000) / 2 = £5,000 → PA = £12,570 - £5,000 = £7,570

test('£110k salary: theoretical PA tapered to £7,570', () => {
  // 110k/yr = 916,667p/mo
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 916_667 })], [], NO_SETTINGS, DATE);
  // ANI ≈ 11,000,004p. Taper: (11,000,004 - 10,000,000) / 2 = 500,002 → round down to 500,000
  // PA = 1,257,000 - 500,000 = 757,000p = £7,570
  assert.ok(Math.abs(result.theoretical_pa_pence - 757_000) <= 200, `got ${result.theoretical_pa_pence}`);
});

test('£103k salary: past PA taper start cliff (within £5k warning)', () => {
  // £103k/yr = 858,333p/mo. ANI ≈ 10,300,000. 300,000p past threshold — within £5k window.
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 858_333 })], [], NO_SETTINGS, DATE);
  const taper = result.cliff_edges.find(c => c.id === 'pa_taper_start');
  assert.ok(taper, 'should have pa_taper_start');
  assert.equal(taper.direction, 'past');
});

// ── Salary sacrifice: £105k gross, 5% SS → ANI = £99,750, no taper ───────────
// Monthly: 875,000p. SS 5%: 43,750p/mo → 525,000p/yr
// ANI = 10,500,000 - 525,000 = 9,975,000p < 10,000,000 → no taper
// NI on SS-reduced gross: (875,000 - 43,750) = 831,250p/mo

test('salary sacrifice: reduces ANI, no taper when under £100k', () => {
  const s = src({ gross_monthly_pence: 875_000, pension_method: 'salary_sacrifice',
                  pension_ee_type: 'pct', pension_ee_value: 500 }); // 5%
  const result = computePersonIncome(PERSON, [s], [], NO_SETTINGS, DATE);
  assert.ok(result.adjusted_net_income_pence < 10_000_000, 'ANI should be below £100k threshold');
  assert.equal(result.theoretical_pa_pence, 1_257_000); // full PA, no taper
});

test('salary sacrifice: reduces NI base', () => {
  const withSS  = computePersonIncome(PERSON, [src({ gross_monthly_pence: 875_000, pension_method: 'salary_sacrifice', pension_ee_type: 'pct', pension_ee_value: 500 })], [], NO_SETTINGS, DATE);
  const withoutSS = computePersonIncome(PERSON, [src({ gross_monthly_pence: 875_000 })], [], NO_SETTINGS, DATE);
  assert.ok(withSS.total_ni_monthly_pence < withoutSS.total_ni_monthly_pence, 'SS should reduce NI');
});

// ── Net pay pension: reduces taxable income, not NI base ─────────────────────

test('net pay pension: reduces taxable income but not NI base', () => {
  const withNP    = computePersonIncome(PERSON, [src({ gross_monthly_pence: 500_000, pension_method: 'net_pay',         pension_ee_type: 'pct', pension_ee_value: 500 })], [], NO_SETTINGS, DATE);
  const withSS    = computePersonIncome(PERSON, [src({ gross_monthly_pence: 500_000, pension_method: 'salary_sacrifice', pension_ee_type: 'pct', pension_ee_value: 500 })], [], NO_SETTINGS, DATE);
  // Net pay: NI on full £5k/mo. SS: NI on £4,750/mo. So NI should be higher for net pay.
  assert.ok(withNP.total_ni_monthly_pence > withSS.total_ni_monthly_pence, 'net pay NI > salary sacrifice NI');
  // But both reduce taxable income for income tax by the same £ amount
  assert.equal(withNP.total_income_tax_monthly_pence, withSS.total_income_tax_monthly_pence);
});

// ── Student loan plan 2, £40k salary ─────────────────────────────────────────
// Annual: 4,800,000p. SL plan2 threshold: 2,827,500p.
// Above threshold: 4,800,000 - 2,827,500 = 1,972,500p × 9% = 177,525p/yr → 14,794p/mo

test('student loan plan 2: repayment on £40k salary', () => {
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 400_000, student_loan_plan: '2' })], [], NO_SETTINGS, DATE);
  assert.ok(Math.abs(result.total_student_loan_monthly_pence - 14_794) <= 1, `got ${result.total_student_loan_monthly_pence}`);
});

test('student loan plan 1: different threshold', () => {
  // Plan 1 threshold: £24,325. For £40k: (4,800,000 - 2,432,500) × 9% = 213,075p/yr → 17,756p/mo
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 400_000, student_loan_plan: '1' })], [], NO_SETTINGS, DATE);
  assert.ok(Math.abs(result.total_student_loan_monthly_pence - 17_756) <= 1, `got ${result.total_student_loan_monthly_pence}`);
});

// ── Dividends: £8k dividends on top of £40k salary ───────────────────────────
// Non-div taxable: 4,800,000 - 1,257,000 = 3,543,000p (all in basic band)
// Dividend: 800,000p. Allowance: 50,000p. Taxable divs: 750,000p.
// Band space at basic rate: 3,770,000 - 3,543,000 = 227,000p
// Divs in basic band: 227,000p × 8.75% = 19,863p
// Divs in higher band: (750,000 - 227,000) = 523,000p × 33.75% = 176,513p
// Total div tax: 196,375p

test('dividends: £8k divs on £40k salary, dividend tax computed correctly', () => {
  const divSrc = src({ id: 's2', kind: 'dividends', tax_code: '1257L',
                       pension_method: 'none', gross_monthly_pence: 66_667 }); // £800k/12 ≈ 66,667
  const salSrc = src({ id: 's1', gross_monthly_pence: 400_000 });
  const result = computePersonIncome(PERSON, [salSrc, divSrc], [], NO_SETTINGS, DATE);
  assert.ok(result.dividend_tax_annual_pence > 0, 'dividend tax should be positive');
  // Rough check: ~£196k annual tax ≈ within 5% tolerance
  assert.ok(Math.abs(result.dividend_tax_annual_pence - 196_375) <= 10_000, `got ${result.dividend_tax_annual_pence}`);
});

// ── HICBC: £70k salary, 2 children ───────────────────────────────────────────
// Annual CB: 124,380 + 82,680 = 207,060p
// ANI = 8,400,000p. Between £60k and £80k → taper.
// Fraction: (8,400,000 - 6,000,000) / (8,000,000 - 6,000,000) = 2,400,000 / 2,000,000 = 1.2 → capped at 1.0?
// Wait 8,400,000 > 8,000,000 → fully clawed back: 207,060p/yr

test('HICBC: £84k salary fully claws back 2-child benefit', () => {
  const settings = { claim_child_benefit: true, num_children: 2, uses_tax_free_childcare: false };
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 700_000 })], [], settings, DATE);
  assert.equal(result.hicbc_annual_pence, 207_060); // fully clawed back
});

test('HICBC: £70k salary partially claws back', () => {
  const settings = { claim_child_benefit: true, num_children: 2, uses_tax_free_childcare: false };
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 583_333 })], [], settings, DATE);
  assert.ok(result.hicbc_annual_pence > 0 && result.hicbc_annual_pence < 207_060, 'partial clawback');
});

test('HICBC: not triggered when below £60k', () => {
  const settings = { claim_child_benefit: true, num_children: 2, uses_tax_free_childcare: false };
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 400_000 })], [], settings, DATE);
  assert.equal(result.hicbc_annual_pence, 0);
});

// ── Pension AA taper ──────────────────────────────────────────────────────────
// £270k ANI → above taper threshold (£260k). Reduction = (270k - 260k) / 2 = £5k
// Effective AA = 6,000,000 - 500,000 = 5,500,000p = £55,000

test('pension AA taper: £270k ANI → effective AA = £55k', () => {
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 2_250_000 })], [], NO_SETTINGS, DATE);
  assert.equal(result.effective_pension_aa_pence, 5_500_000);
});

test('pension AA taper: below £260k → full £60k AA', () => {
  const result = computePersonIncome(PERSON, [src({ gross_monthly_pence: 1_000_000 })], [], NO_SETTINGS, DATE);
  assert.equal(result.effective_pension_aa_pence, 6_000_000);
});

test('pension AA exceeded flag', () => {
  // £60k/yr contributions on £270k salary → should flag exceeded AA (if > 55k effective)
  const s = src({ gross_monthly_pence: 2_250_000, pension_method: 'salary_sacrifice',
                  pension_ee_type: 'pct', pension_ee_value: 1600, // 16% EE
                  pension_er_type: 'pct', pension_er_value:  800, // 8%  ER
                });
  const result = computePersonIncome(PERSON, [s], [], NO_SETTINGS, DATE);
  // EE monthly: 2,250,000 × 16% = 360,000p. ER: 2,250,000 × 8% = 180,000p. Total/mo: 540,000p.
  // Annual: 6,480,000p. Effective AA ≈ 5,500,000p (after taper). Exceeded.
  assert.ok(result.pension_aa_exceeded, 'should flag exceeded');
});

// ── cliffEdges standalone ─────────────────────────────────────────────────────

test('cliffEdges: £97k ANI → approaching PA taper warning', () => {
  const rates = getRates('2026/27', 'ruk');
  const edges = cliffEdges(9_700_000, NO_SETTINGS, rates);
  const taper = edges.find(c => c.id === 'pa_taper_start');
  assert.ok(taper, 'should warn about PA taper');
  assert.equal(taper.direction, 'approaching');
});

test('cliffEdges: HICBC not shown without claim_child_benefit setting', () => {
  const rates = getRates('2026/27', 'ruk');
  const edges = cliffEdges(6_100_000, NO_SETTINGS, rates);
  assert.ok(!edges.find(c => c.id === 'hicbc_start'), 'no HICBC without setting');
});

test('cliffEdges: HICBC shown with setting', () => {
  const rates = getRates('2026/27', 'ruk');
  const settings = { claim_child_benefit: true, num_children: 1, uses_tax_free_childcare: false };
  const edges = cliffEdges(6_100_000, settings, rates);
  assert.ok(edges.find(c => c.id === 'hicbc_start'), 'HICBC should appear');
});

test('cliffEdges: no warnings far from all thresholds', () => {
  const rates = getRates('2026/27', 'ruk');
  const edges = cliffEdges(3_000_000, NO_SETTINGS, rates); // £30k ANI — well below all
  assert.equal(edges.length, 0);
});
