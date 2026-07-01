// finance/models/rates.js — UK tax rate tables, versioned by tax year + region.
// All monetary thresholds are INTEGER PENCE. Rates are basis points (100 bps = 1%).
// Currently seeded: 2026/27 rest-of-UK.
// To add a year: add an entry to RATE_TABLES keyed "YYYY/YY_ruk" or "YYYY/YY_scot".

// ── 2026/27 Rest-of-UK ─────────────────────────────────────────────────────
const RUK_2627 = {
  year: '2026/27',
  region: 'ruk',

  personal_allowance_pence:     1257000,  // £12,570
  pa_taper_threshold_pence:    10000000,  // £100,000 — taper starts
  pa_taper_floor_pence:        12514000,  // £125,140 — PA fully withdrawn

  // Higher-rate gross threshold (for cliff detection)
  higher_rate_threshold_pence:  5027000,  // £50,270

  // Income tax bands — thresholds are GROSS INCOME (pence).
  // Personal allowance is applied at computation time; any tax code works correctly.
  //   0%  : £0      → PA        (from tax code, e.g. 1257L = £12,570, 1288L = £12,880)
  //   20% : PA+1    → £50,270
  //   40% : £50,271 → £125,140
  //   45% : £125,141+
  it_bands: [
    { name: 'basic',      from:       0, to:  5027000, rate_bps: 2000 }, // 20% — gross £0–£50,270
    { name: 'higher',     from: 5027000, to: 12514000, rate_bps: 4000 }, // 40% — gross £50,270–£125,140
    { name: 'additional', from:12514000, to: Infinity,  rate_bps: 4500 }, // 45% — gross £125,140+
  ],

  // National Insurance (employee Class 1) — monthly-equivalent thresholds
  ni_pt_monthly_pence:  104750,  // £1,047.50 primary threshold  (£12,570/yr)
  ni_uel_monthly_pence: 418917,  // £4,189.17 upper earnings limit (£50,270/yr)
  ni_main_bps:  800,  // 8%  between PT and UEL
  ni_upper_bps: 200,  // 2%  above UEL

  // Student loan repayment thresholds (annual gross) and rates
  student_loan: {
    1:  { threshold_pence: 2432500, rate_bps: 900 },  // £24,325
    2:  { threshold_pence: 2827500, rate_bps: 900 },  // £28,275
    4:  { threshold_pence: 3189000, rate_bps: 900 },  // £31,890
    5:  { threshold_pence: 2500000, rate_bps: 900 },  // £25,000
    pg: { threshold_pence: 2127000, rate_bps: 600 },  // £21,270 postgrad
  },

  // Dividends
  dividend_allowance_pence: 50000,  // £500
  dividend_rates_bps: { basic: 875, higher: 3375, additional: 3935 },

  // High Income Child Benefit Charge
  hicbc_lower_pence: 6000000,  // £60,000 — taper starts
  hicbc_upper_pence: 8000000,  // £80,000 — fully clawed back
  child_benefit_first_pence:  124380,  // £1,243.80/yr first child
  child_benefit_other_pence:   82680,  // £826.80/yr each additional

  // Personal Savings Allowance (annual)
  psa_basic_pence:      100000,  // £1,000
  psa_higher_pence:      50000,  // £500
  psa_additional_pence:      0,  // £0

  // Marriage Allowance
  marriage_allowance_transfer_pence: 126000,  // £1,260

  // Pension Annual Allowance
  pension_aa_pence:               6000000,   // £60,000
  pension_aa_taper_threshold_pence: 26000000, // £260,000 adjusted income
  pension_aa_floor_pence:          1000000,   // £10,000 minimum AA
  mpaa_pence:                      1000000,   // £10,000 MPAA

  // Cliff-edge warning distance: alert when within £5,000 of a threshold
  cliff_warning_pence: 500000,
};

export const RATE_TABLES = { '2026/27_ruk': RUK_2627 };

/** Get rate table for a given tax year and region. Falls back to latest ruk. */
export function getRates(taxYear, region = 'ruk') {
  return RATE_TABLES[`${taxYear}_${region}`]
      || RATE_TABLES[`${taxYear}_ruk`]
      || RUK_2627;
}

/**
 * Derive UK tax year string from a date string (YYYY-MM-DD or YYYY-MM-01).
 * Tax year runs 6 April – 5 April.
 * taxYearFor("2026-08-01") → "2026/27"
 * taxYearFor("2026-04-05") → "2025/26"
 */
export function taxYearFor(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const afterStart = month > 4 || (month === 4 && day >= 6);
  const start = afterStart ? year : year - 1;
  return `${start}/${String(start + 1).slice(-2)}`;
}

/** Get rate table appropriate for a given date. */
export function getRatesForDate(dateStr, region = 'ruk') {
  return getRates(taxYearFor(dateStr), region);
}
