// finance/engine/tax-engine.js — UK income tax engine (pure ESM, no DOM/network)
// Computes per-person income breakdowns, applying PAYE by tax code, NI, SL,
// pension method, dividends, and cliff-edge proximity detection.
//
// Design:
// - Per-source PAYE uses the tax code as given (honours what HMRC has issued).
// - Theoretical PA taper is also computed for cliff-edge accuracy and UI display.
// - NI uses monthly-equivalent bands (planning approximation).
// - Dividend tax is pooled per person, not per source.
// - Self-employment is treated like employment for NI (Class 4 approximation).
//
// All monetary values are integer pence.

import { getRatesForDate } from '../models/rates.js';

// ── Tax code parsing ──────────────────────────────────────────────────────────

/**
 * Parse a tax code into its type and personal allowance in pence.
 *  '1257L'  → { type: 'L',  allowance_pence: 1_257_000 }
 *  '1288L'  → { type: 'L',  allowance_pence: 1_288_000 }  (but actual may be £12,882 — use override)
 *  'BR'     → { type: 'BR', allowance_pence: 0 }
 *  'D0'     → { type: 'D0', allowance_pence: 0 }
 *  'D1'     → { type: 'D1', allowance_pence: 0 }
 *  '0T'     → { type: '0T', allowance_pence: 0 }
 *  'NT'     → { type: 'NT', allowance_pence: 0 }
 *  'K500'   → { type: 'K',  allowance_pence: -500_000 }  (adds taxable income)
 *
 * @param {string}      code                  Tax code string
 * @param {number|null} allowanceOverridePence Exact allowance in pence (overrides computed value).
 *                                             Use when the user knows their precise allowance
 *                                             (e.g. 1288L = £12,882 not £12,880).
 */
export function parseTaxCode(code, allowanceOverridePence = null) {
  const c = String(code ?? '1257L').trim().toUpperCase();
  let type, allowance_pence;
  if (c === 'BR') { type = 'BR'; allowance_pence = 0; }
  else if (c === 'D0') { type = 'D0'; allowance_pence = 0; }
  else if (c === 'D1') { type = 'D1'; allowance_pence = 0; }
  else if (c === 'NT') { type = 'NT'; allowance_pence = 0; }
  else if (c === '0T') { type = '0T'; allowance_pence = 0; }
  else {
    const k = c.match(/^K(\d+)$/);
    if (k) { type = 'K'; allowance_pence = -parseInt(k[1]) * 10 * 100; }
    else {
      // Standard nnnnL / nnnnM / nnnnN
      const l = c.match(/^(\d+)[A-Z]$/);
      if (l) { type = 'L'; allowance_pence = parseInt(l[1]) * 10 * 100; }
      else   { type = 'L'; allowance_pence = 1_257_000; } // safe fallback
    }
  }
  // User-supplied override takes precedence (e.g. 1288L actual allowance is £12,882 not £12,880)
  if (allowanceOverridePence !== null) allowance_pence = allowanceOverridePence;
  return { type, allowance_pence };
}

// ── Pension contribution amounts ──────────────────────────────────────────────

/** Compute monthly EE and ER pension amounts from source config. */
function pensionAmounts(source) {
  const contrib = (type, value) => {
    if (!value) return 0;
    return type === 'pct'
      ? Math.round(source.gross_monthly_pence * value / 10000)
      : value; // fixed pence/mo
  };
  return {
    ee: contrib(source.pension_ee_type, source.pension_ee_value),
    er: contrib(source.pension_er_type, source.pension_er_value),
  };
}

// ── Income tax on a single source ────────────────────────────────────────────

/**
 * Compute annual income tax.
 * Bands are defined at GROSS income thresholds; allowancePence is the zero-rate portion.
 * Tax = sum over bands of: max(0, min(gross, band.to) − max(allowance, band.from)) × rate
 * This correctly handles any PA (1257L, 1288L, K codes, tapered allowance etc.).
 */
function annualTax(grossAnnual, allowancePence, rates) {
  let tax = 0;
  for (const band of rates.it_bands) {
    const start  = Math.max(allowancePence, band.from);
    const end    = band.to === Infinity ? grossAnnual : Math.min(grossAnnual, band.to);
    const inBand = Math.max(0, end - start);
    if (inBand <= 0) continue;
    tax += Math.round(inBand * band.rate_bps / 10000);
  }
  return tax;
}

// ── National Insurance ────────────────────────────────────────────────────────

/** Monthly employee NI on a monthly gross figure (after salary sacrifice). */
function monthlyNI(grossMonthly, rates) {
  const { ni_pt_monthly_pence: pt, ni_uel_monthly_pence: uel, ni_main_bps, ni_upper_bps } = rates;
  if (grossMonthly <= pt) return 0;
  const main  = Math.min(grossMonthly, uel) - pt;
  const upper = Math.max(0, grossMonthly - uel);
  return Math.round(main * ni_main_bps / 10000 + upper * ni_upper_bps / 10000);
}

// ── Student loan ──────────────────────────────────────────────────────────────

/** Annual student-loan repayment on an annual gross figure. */
function annualSL(annualGross, plan, rates) {
  if (!plan || plan === 'none') return 0;
  const sl = rates.student_loan[plan];
  if (!sl) return 0;
  return Math.round(Math.max(0, annualGross - sl.threshold_pence) * sl.rate_bps / 10000);
}

// ── Dividend tax ──────────────────────────────────────────────────────────────

/**
 * Annual dividend tax.
 * Dividends stack on top of non-dividend gross income in the gross-based bands.
 * @param {number} dividendAnnual  Total gross dividends (pence)
 * @param {number} nonDivGross     Non-dividend gross income after pension deductions, before PA (pence)
 * @param {object} rates
 */
function dividendTax(dividendAnnual, nonDivGross, rates) {
  const { dividend_allowance_pence: allowance, dividend_rates_bps: dr, it_bands } = rates;
  let remaining = Math.max(0, dividendAnnual - allowance);
  if (remaining <= 0) return 0;

  let pos = nonDivGross; // current position in gross income terms
  let tax = 0;

  for (const band of it_bands) {
    if (remaining <= 0) break;
    const space = band.to === Infinity
      ? remaining
      : Math.max(0, band.to - Math.max(band.from, pos));
    const inBand = Math.min(remaining, space);
    if (inBand <= 0) continue;
    const rate = band.name === 'basic' ? dr.basic
               : band.name === 'higher' ? dr.higher
               : dr.additional;
    tax += Math.round(inBand * rate / 10000);
    remaining -= inBand;
    pos += inBand;
  }
  return tax;
}

// ── Personal allowance taper ──────────────────────────────────────────────────

/** Compute the theoretical tapered personal allowance given adjusted net income. */
function taperedPA(adjustedNetIncome, rates) {
  const { pa_taper_threshold_pence: threshold, personal_allowance_pence: pa } = rates;
  if (adjustedNetIncome <= threshold) return pa;
  // £1 lost per £2 over threshold, rounded down to nearest £1
  const reduction = Math.floor((adjustedNetIncome - threshold) / 200) * 100;
  return Math.max(0, pa - reduction);
}

/** Compute the effective pension annual allowance (after taper). */
function effectivePensionAA(adjustedNetIncome, rates) {
  const { pension_aa_taper_threshold_pence: threshold, pension_aa_pence: aa, pension_aa_floor_pence: floor } = rates;
  if (adjustedNetIncome <= threshold) return aa;
  const reduction = Math.floor((adjustedNetIncome - threshold) / 200) * 100;
  return Math.max(floor, aa - reduction);
}

// ── HICBC ─────────────────────────────────────────────────────────────────────

/** Annual High Income Child Benefit Charge. */
function hicbcCharge(adjustedNetIncome, numChildren, rates) {
  const { hicbc_lower_pence: lo, hicbc_upper_pence: hi,
          child_benefit_first_pence: cbFirst, child_benefit_other_pence: cbOther } = rates;
  if (adjustedNetIncome <= lo || numChildren < 1) return 0;
  const totalCB = cbFirst + Math.max(0, numChildren - 1) * cbOther;
  if (adjustedNetIncome >= hi) return totalCB;
  return Math.round(totalCB * (adjustedNetIncome - lo) / (hi - lo));
}

// ── Cliff-edge detection ──────────────────────────────────────────────────────

/**
 * Return cliff-edge warnings for a person based on their adjusted net income.
 * Only includes cliffs within the warning distance defined in the rate table.
 *
 * @param {number} ani              Adjusted net income (pence)
 * @param {object} householdSettings { claim_child_benefit, num_children, uses_tax_free_childcare }
 * @param {object} rates
 * @returns {Array<{id, label, threshold_pence, distance_pence, direction}>}
 */
export function cliffEdges(ani, householdSettings = {}, rates) {
  const { cliff_warning_pence: warn } = rates;
  const { claim_child_benefit, num_children, uses_tax_free_childcare } = householdSettings;
  const edges = [];

  const check = (id, label, threshold) => {
    const dist = threshold - ani;
    if (Math.abs(dist) <= warn) {
      edges.push({ id, label, threshold_pence: threshold, distance_pence: dist,
                   direction: dist > 0 ? 'approaching' : 'past' });
    }
  };

  // Always-on cliffs
  check('higher_rate',   'Higher rate (40%) threshold',         rates.higher_rate_threshold_pence);
  check('pa_taper_start','Personal allowance taper begins',     rates.pa_taper_threshold_pence);
  check('pa_taper_end',  'Personal allowance fully withdrawn',  rates.pa_taper_floor_pence);
  check('additional_rate','Additional rate (45%) threshold',    rates.pa_taper_floor_pence);
  check('psa_reduced',   'Personal savings allowance: £1,000 → £500', rates.higher_rate_threshold_pence);
  check('psa_lost',      'Personal savings allowance lost',     rates.pa_taper_floor_pence);
  check('pension_aa_taper','Pension annual allowance taper begins', rates.pension_aa_taper_threshold_pence);

  // Situational cliffs
  if (num_children > 0 && uses_tax_free_childcare) {
    check('childcare', 'Tax-free childcare / free hours lost', rates.pa_taper_threshold_pence);
  }
  if (claim_child_benefit && num_children > 0) {
    check('hicbc_start', 'High Income Child Benefit Charge begins', rates.hicbc_lower_pence);
    check('hicbc_full',  'Child benefit fully clawed back',          rates.hicbc_upper_pence);
  }

  return edges;
}

// ── Main computation ──────────────────────────────────────────────────────────

/**
 * Compute a full income breakdown for one person.
 *
 * @param {object}  person   — { id }
 * @param {Array}   sources  — income_source records, each with:
 *   { id, name, kind, tax_code, is_primary,
 *     pension_method, pension_ee_type, pension_ee_value, pension_er_type, pension_er_value,
 *     student_loan_plan, gross_monthly_pence }
 * @param {Array}   events   — income_event records for the current tax year:
 *   { kind, gross_pence }  (kind: 'bonus'|'dividend'|'other')
 * @param {object}  householdSettings — { claim_child_benefit, num_children, uses_tax_free_childcare }
 * @param {string}  dateStr  — YYYY-MM-DD for rate table lookup
 * @param {string}  region   — 'ruk' | 'scot'
 * @returns {object}         — full breakdown (see shape below)
 */
export function computePersonIncome(
  person,
  sources,
  events = [],
  householdSettings = {},
  dateStr = new Date().toISOString().slice(0, 10),
  region = 'ruk',
) {
  const rates = getRatesForDate(dateStr, region);
  const basicRateMultiplier = 10000 / rates.it_bands[0].rate_bps; // for grossing up RAS

  // ── 1. Pension amounts and pre-tax gross per source ───────────────────────
  const enriched = sources.map(s => {
    const { ee, er } = pensionAmounts(s);
    // Salary sacrifice and net pay both reduce income before income tax.
    // Relief-at-source: full gross is taxable; pension paid from net.
    const taxableMonthly = (s.pension_method === 'salary_sacrifice' || s.pension_method === 'net_pay')
      ? Math.max(0, s.gross_monthly_pence - ee)
      : s.gross_monthly_pence;
    // Salary sacrifice also saves NI (lower NI base).
    const niMonthly = s.pension_method === 'salary_sacrifice'
      ? Math.max(0, s.gross_monthly_pence - ee)
      : s.gross_monthly_pence;
    return { ...s, ee, er, taxableMonthly, niMonthly };
  });

  // ── 2. Annual totals by kind ──────────────────────────────────────────────
  const byKind = { employment: 0, self_employment: 0, rental: 0, dividends: 0, benefits: 0, other: 0 };
  let annualPensionDeduction = 0; // reduces adjusted net income

  for (const s of enriched) {
    byKind[s.kind] = (byKind[s.kind] || 0) + s.gross_monthly_pence * 12;
    const annualEE = s.ee * 12;
    if (s.pension_method === 'salary_sacrifice' || s.pension_method === 'net_pay') {
      annualPensionDeduction += annualEE;
    } else if (s.pension_method === 'relief_at_source') {
      // RAS grossed-up contribution is the allowable deduction
      annualPensionDeduction += Math.round(annualEE * basicRateMultiplier);
    }
  }

  // One-off events feed into annual totals
  let eventBonusPence = 0, eventDividendPence = 0, eventOtherPence = 0;
  for (const e of events) {
    if (e.kind === 'bonus')    eventBonusPence    += e.gross_pence;
    else if (e.kind === 'dividend') eventDividendPence += e.gross_pence;
    else                       eventOtherPence    += e.gross_pence;
  }

  const totalNonDivAnnual = byKind.employment + byKind.self_employment + byKind.rental
    + byKind.benefits + byKind.other + eventBonusPence + eventOtherPence;
  const totalDivAnnual = byKind.dividends + eventDividendPence;

  // ── 3. Adjusted net income + theoretical PA ───────────────────────────────
  // ANI for cliff/taper detection: total income minus pension deductions.
  // Dividends are included but don't benefit from pension deductions.
  const ani = Math.max(0, totalNonDivAnnual - annualPensionDeduction) + totalDivAnnual;
  const theoreticalPA = taperedPA(ani, rates);

  // ── 4. Per-source breakdown ───────────────────────────────────────────────
  const sourceBreakdowns = enriched.map(s => {
    const { type, allowance_pence } = parseTaxCode(s.tax_code, s.tax_code_allowance_pence ?? null);
    const annualGross = s.taxableMonthly * 12;

    let tax_monthly = 0;
    let ni_monthly  = 0;
    let sl_monthly  = 0;

    if (s.kind === 'employment' || s.kind === 'self_employment') {
      // Income tax by code type
      switch (type) {
        case 'NT': tax_monthly = 0; break;
        case 'BR': tax_monthly = Math.round(s.taxableMonthly * 2000 / 10000); break;
        case 'D0': tax_monthly = Math.round(s.taxableMonthly * 4000 / 10000); break;
        case 'D1': tax_monthly = Math.round(s.taxableMonthly * 4500 / 10000); break;
        default:   tax_monthly = Math.round(annualTax(annualGross, allowance_pence, rates) / 12);
      }
      // NI on NI-gross (salary sacrifice reduces NI base)
      ni_monthly = monthlyNI(s.niMonthly, rates);
      // Student loan on full gross (regardless of pension method)
      sl_monthly = Math.round(annualSL(s.gross_monthly_pence * 12, s.student_loan_plan, rates) / 12);

    } else if (s.kind === 'rental') {
      // Income tax but no NI or SL
      switch (type) {
        case 'NT': tax_monthly = 0; break;
        case 'BR': tax_monthly = Math.round(s.taxableMonthly * 2000 / 10000); break;
        default:   tax_monthly = Math.round(annualTax(annualGross, allowance_pence, rates) / 12);
      }
    }
    // dividends handled below; benefits/other: no automatic tax (override available)

    const net_monthly = s.gross_monthly_pence - s.ee - tax_monthly - ni_monthly - sl_monthly;

    return {
      source_id:               s.id,
      source_name:             s.name,
      kind:                    s.kind,
      tax_code:                s.tax_code,
      gross_monthly_pence:     s.gross_monthly_pence,
      pension_ee_monthly_pence: s.ee,
      pension_er_monthly_pence: s.er,
      income_tax_monthly_pence: tax_monthly,
      ni_monthly_pence:         ni_monthly,
      student_loan_monthly_pence: sl_monthly,
      net_monthly_pence:        net_monthly,
    };
  });

  // ── 5. Dividend tax (pooled, annual) ──────────────────────────────────────
  // Dividends stack on top of non-div gross in the gross-based bands.
  const nonDivGross = Math.max(0, totalNonDivAnnual - annualPensionDeduction);
  const divTaxAnnual = totalDivAnnual > 0 ? dividendTax(totalDivAnnual, nonDivGross, rates) : 0;

  // ── 6. HICBC ──────────────────────────────────────────────────────────────
  const hicbcAnnual = householdSettings.claim_child_benefit
    ? hicbcCharge(ani, householdSettings.num_children || 0, rates)
    : 0;

  // ── 7. Person totals (monthly) ────────────────────────────────────────────
  const totalGross   = sourceBreakdowns.reduce((a, s) => a + s.gross_monthly_pence, 0);
  const totalPensEE  = sourceBreakdowns.reduce((a, s) => a + s.pension_ee_monthly_pence, 0);
  const totalPensER  = sourceBreakdowns.reduce((a, s) => a + s.pension_er_monthly_pence, 0);
  const totalTax     = sourceBreakdowns.reduce((a, s) => a + s.income_tax_monthly_pence, 0)
                     + Math.round(divTaxAnnual / 12);
  const totalNI      = sourceBreakdowns.reduce((a, s) => a + s.ni_monthly_pence, 0);
  const totalSL      = sourceBreakdowns.reduce((a, s) => a + s.student_loan_monthly_pence, 0);
  const totalHICBC   = Math.round(hicbcAnnual / 12);
  const totalNet     = totalGross - totalPensEE - totalTax - totalNI - totalSL - totalHICBC;

  // ── 8. Pension AA check ───────────────────────────────────────────────────
  const annualContribs = (totalPensEE + totalPensER) * 12;
  const effectiveAA    = effectivePensionAA(ani, rates);

  // ── 9. Cliff edges ────────────────────────────────────────────────────────
  const cliffs = cliffEdges(ani, householdSettings, rates);

  return {
    person_id: person.id,
    sources: sourceBreakdowns,

    // Monthly totals
    total_gross_monthly_pence:        totalGross,
    total_pension_ee_monthly_pence:   totalPensEE,
    total_pension_er_monthly_pence:   totalPensER,
    total_income_tax_monthly_pence:   totalTax,
    total_ni_monthly_pence:           totalNI,
    total_student_loan_monthly_pence: totalSL,
    total_hicbc_monthly_pence:        totalHICBC,
    total_net_monthly_pence:          totalNet,

    // Annual / planning figures
    adjusted_net_income_pence:     ani,
    theoretical_pa_pence:          theoreticalPA,
    dividend_tax_annual_pence:     divTaxAnnual,
    hicbc_annual_pence:            hicbcAnnual,
    annual_pension_contrib_pence:  annualContribs,
    effective_pension_aa_pence:    effectiveAA,
    pension_aa_exceeded:           annualContribs > effectiveAA,

    cliff_edges: cliffs,
    tax_year:    rates.year,
    region:      rates.region,
  };
}
