// tax-rates.js — UK tax rate tables, versioned by tax year + region.
// Engine picks the correct table based on income entry effective date.
// All monetary thresholds stored as INTEGER PENCE.
// Rates stored as basis points (bps) where 100 bps = 1%.
// Currently seeded: 2026/27, rest-of-UK (England, Wales, Northern Ireland).
//
// To add a new year: add an entry to RATE_TABLES with key "YYYY/YY_ruk".
// To add Scotland: add entries with key "YYYY/YY_scot".

(function () {
  'use strict';

  // ── 2026/27 Rest-of-UK ─────────────────────────────────────────────────────
  // Source: gov.uk — 2026/27 tax year (6 April 2026 – 5 April 2027)
  // Income tax bands (apply to non-savings, non-dividend income)
  const RUK_2627 = {
    year: '2026/27',
    region: 'ruk',

    // Personal Allowance
    personal_allowance_pence: 1257000,  // £12,570
    // PA taper: £1 lost per £2 over this threshold; PA = 0 at £125,140
    pa_taper_threshold_pence: 10000000, // £100,000
    pa_taper_floor_pence:     12514000, // £125,140

    // Income tax bands (boundaries are INCLUSIVE upper limits, annual, pence)
    // Applied to taxable non-savings income (gross − PA − pension-ss/net-pay)
    it_bands: [
      { name: 'basic',      from:        0, to:  3727000, rate_bps:  2000 }, // 20% up to £37,270
      { name: 'higher',     from:  3727000, to: 12514000, rate_bps:  4000 }, // 40% up to £125,140
      { name: 'additional', from: 12514000, to: Infinity,  rate_bps:  4500 }, // 45% above
    ],

    // National Insurance (employee, Class 1) — computed on MONTHLY gross
    // NI is calculated per pay period; we use monthly-equivalent bands.
    // 2026/27: Primary threshold £12,570/yr (£1,047.50/mo), UEL £50,270/yr (£4,189.17/mo)
    ni_primary_threshold_monthly_pence:  104750,  // £1,047.50
    ni_upper_earnings_limit_monthly_pence: 418917, // £4,189.17
    ni_rate_main_bps:   800,  // 8% on earnings between PT and UEL
    ni_rate_upper_bps:  200,  // 2% on earnings above UEL

    // Student loan thresholds (annual, pence) & rates
    student_loan: {
      plan1: { threshold_pence: 2432500, rate_bps: 900 },  // £24,325
      plan2: { threshold_pence: 2827500, rate_bps: 900 },  // £28,275
      plan4: { threshold_pence: 3189000, rate_bps: 900 },  // £31,890
      plan5: { threshold_pence: 2500000, rate_bps: 900 },  // £25,000
      pg:    { threshold_pence: 2127000, rate_bps: 600 },  // £21,270 (PG)
    },

    // Dividend allowance & rates
    dividend_allowance_pence: 50000, // £500
    dividend_rates_bps: {
      basic:      875,   // 8.75%
      higher:    3375,   // 33.75%
      additional: 3935,  // 39.35%
    },

    // High Income Child Benefit Charge
    // Tapers from 0 at £60,000 to full clawback at £80,000
    hicbc_lower_pence: 6000000,  // £60,000
    hicbc_upper_pence: 8000000,  // £80,000
    // Annual child benefit amounts (per child — first child higher)
    child_benefit_first_pence:  124380, // £1,243.80/yr (£25.60/wk × 48.6)
    child_benefit_other_pence:   82680, // £826.80/yr

    // Personal Savings Allowance (pence per year)
    psa_basic_rate_pence:   100000,  // £1,000
    psa_higher_rate_pence:   50000,  // £500
    psa_additional_rate_pence:   0,  // £0

    // Marriage Allowance: transfer from non-taxpayer to basic-rate taxpayer
    marriage_allowance_transfer_pence: 126000, // £1,260

    // Pension Annual Allowance
    pension_annual_allowance_pence: 6000000,    // £60,000
    pension_aa_taper_threshold_pence: 26000000, // £260,000 (adjusted income)
    pension_aa_taper_floor_pence: 1000000,      // £10,000 minimum AA
    // Money Purchase Annual Allowance (triggered after flexible drawdown)
    mpaa_pence: 1000000, // £10,000

    // Cliff-edge proximity warning distance (for UI alerts)
    cliff_warning_distance_pence: 500000, // £5,000 away
  };

  // ── Rate table registry ────────────────────────────────────────────────────
  const RATE_TABLES = {
    '2026/27_ruk': RUK_2627,
  };

  /**
   * Get rate table for a given tax year string and region.
   * @param {string} taxYear  e.g. "2026/27"
   * @param {string} region   "ruk" | "scot"
   * @returns {object} rate table, falling back to nearest ruk year if not found
   */
  function getRates(taxYear, region = 'ruk') {
    const key = `${taxYear}_${region}`;
    if (RATE_TABLES[key]) return RATE_TABLES[key];
    // Fallback: try ruk for same year
    const rkKey = `${taxYear}_ruk`;
    if (RATE_TABLES[rkKey]) return RATE_TABLES[rkKey];
    // Final fallback: most recent ruk table
    return RUK_2627;
  }

  /**
   * Derive the UK tax year string from a YYYY-MM-DD or YYYY-MM-01 date string.
   * Tax year runs 6 April – 5 April.
   * taxYearFor("2026-08-01") → "2026/27"
   * taxYearFor("2026-03-01") → "2025/26"
   */
  function taxYearFor(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const isAfterTaxYearStart = month > 4 || (month === 4 && day >= 6);
    const startYear = isAfterTaxYearStart ? year : year - 1;
    const endYear = startYear + 1;
    return `${startYear}/${String(endYear).slice(-2)}`;
  }

  /**
   * Get rate table appropriate for a given date.
   * @param {string} dateStr  YYYY-MM-DD or YYYY-MM-01
   * @param {string} region   "ruk" | "scot"
   */
  function getRatesForDate(dateStr, region = 'ruk') {
    return getRates(taxYearFor(dateStr), region);
  }

  if (typeof window !== 'undefined') {
    window.taxRates = { getRates, getRatesForDate, taxYearFor, RATE_TABLES };
  }

  if (typeof module !== 'undefined') {
    module.exports = { getRates, getRatesForDate, taxYearFor, RATE_TABLES };
  }
})();
