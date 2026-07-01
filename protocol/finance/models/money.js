// finance/models/money.js — Pence/£ conversion helpers (pure ESM)
// All monetary values are stored and computed as integer pence.
// Convert to/from £ only at display and input boundaries.

/** penceToDisplay(123456) → "£1,234.56"  |  penceToDisplay(-50) → "-£0.50" */
export function penceToDisplay(pence) {
  if (typeof pence !== 'number' || !isFinite(pence)) return '£0.00';
  const abs = Math.abs(pence);
  const formatted = Math.floor(abs / 100).toLocaleString('en-GB') + '.' + String(abs % 100).padStart(2, '0');
  return (pence < 0 ? '-' : '') + '£' + formatted;
}

/** Compact display — drops ".00" when pence is whole pounds.
 *  penceToCompact(120000) → "£1,200"  |  penceToCompact(120050) → "£1,200.50" */
export function penceToCompact(pence) {
  if (typeof pence !== 'number' || !isFinite(pence)) return '£0';
  if (pence % 100 === 0) {
    const abs = Math.abs(pence / 100);
    return (pence < 0 ? '-' : '') + '£' + abs.toLocaleString('en-GB');
  }
  return penceToDisplay(pence);
}

/** Parse a user-entered £ string to integer pence. Returns null if unparseable.
 *  Handles: "1234.56", "£1,234.56", "1234", ".99", "-50.00", numeric input */
export function parsePence(str) {
  if (typeof str !== 'string' && typeof str !== 'number') return null;
  const s = String(str).trim().replace(/£/g, '').replace(/,/g, '');
  if (s === '' || s === '-') return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.?\d*$/.test(s)) return null;
  const f = parseFloat(s);
  if (!isFinite(f)) return null;
  return Math.round(f * 100);
}

/** Parse an annual £ figure to monthly pence.  parseAnnualToPence("60000") → 500000 */
export function parseAnnualToPence(str) {
  const annual = parsePence(str);
  return annual === null ? null : Math.round(annual / 12);
}

export const monthlyToAnnual = (p) => p * 12;
export const annualToMonthly = (p) => Math.round(p / 12);
export const penceMonthlyToAnnualDisplay = (p) => penceToCompact(monthlyToAnnual(p));

/** Safe sum — treats null/undefined entries as 0. */
export const sumPence = (arr) => arr.reduce((a, v) => a + (v || 0), 0);
