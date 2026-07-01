// finance/engine/projections.js — Account balance projection engine (pure ESM)
// No DOM/network. Takes a snapshot anchor and projects forward using the account's mode.
// All monetary values are integer pence.

/**
 * Count full calendar months between two date strings (YYYY-MM-DD or YYYY-MM-01).
 * monthsBetween("2026-01-01", "2026-07-01") → 6
 * Returns 0 if toDate <= fromDate.
 */
export function monthsBetween(fromDate, toDate) {
  const [fy, fm] = fromDate.slice(0, 7).split('-').map(Number);
  const [ty, tm] = toDate.slice(0, 7).split('-').map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

/**
 * Project an account balance forward to a target date.
 *
 * Modes:
 *  'manual'       — no projection; returns snapshot as-is.
 *  'pension'      — add monthly contributions each month, optionally compound at annualRateBps.
 *  'contribution' — same as pension (savings/ISA/investment).
 *  'amortising'   — subtract monthly payment, add interest each month (mortgage/student loan).
 *
 * @param {object} opts
 * @param {number}  opts.snapshotPence         Anchor balance in pence (always positive)
 * @param {string}  opts.snapshotDate          Anchor date (YYYY-MM-DD)
 * @param {string}  opts.toDate               Target date (YYYY-MM-DD), usually today
 * @param {string}  opts.mode                 'manual' | 'pension' | 'contribution' | 'amortising'
 * @param {number} [opts.monthlyContribPence]  Monthly contribution to add (pension/contribution)
 * @param {number} [opts.monthlyPaymentPence]  Monthly payment to subtract (amortising)
 * @param {number} [opts.annualRateBps]        Annual rate in basis points (growth or interest)
 * @returns {{ balance_pence: number, months_projected: number }}
 */
export function projectBalance({
  snapshotPence,
  snapshotDate,
  toDate,
  mode,
  monthlyContribPence  = 0,
  monthlyPaymentPence  = 0,
  annualRateBps        = 0,
}) {
  const months = monthsBetween(snapshotDate, toDate);

  if (months <= 0 || mode === 'manual') {
    return { balance_pence: snapshotPence, months_projected: 0 };
  }

  if (mode === 'amortising') {
    return amortise(snapshotPence, months, monthlyPaymentPence, annualRateBps);
  }

  // 'pension' | 'contribution'
  return grow(snapshotPence, months, monthlyContribPence, annualRateBps);
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Amortising projection (mortgage/student loan).
 * Each month: interest accrues on balance, then payment reduces it.
 */
function amortise(balancePence, months, monthlyPaymentPence, annualRateBps) {
  const monthlyRate = annualRateBps / 10000 / 12;
  let balance = balancePence;
  for (let i = 0; i < months; i++) {
    const interest = Math.round(balance * monthlyRate);
    balance = Math.max(0, balance + interest - monthlyPaymentPence);
  }
  return { balance_pence: balance, months_projected: months };
}

/**
 * Growth projection (pension/savings).
 * Each month: optional compound growth, then monthly contribution is added.
 */
function grow(balancePence, months, monthlyContribPence, annualRateBps) {
  // Monthly compounding rate: (1 + annual_rate)^(1/12) - 1
  const monthlyRate = annualRateBps > 0
    ? Math.pow(1 + annualRateBps / 10000, 1 / 12) - 1
    : 0;
  let balance = balancePence;
  for (let i = 0; i < months; i++) {
    balance = Math.round(balance * (1 + monthlyRate)) + monthlyContribPence;
  }
  return { balance_pence: balance, months_projected: months };
}
