// finance/models/dates.js — display formatting for ISO month/date strings.
// Parsing/computation stays in engine/projections.js; this is display-only.

/**
 * Format a "YYYY-MM" month string for display.
 * formatMonth('2026-07')                       → "Jul 2026"
 * formatMonth('2026-07', { month: 'long' })    → "July 2026"
 * formatMonth('2026-07', { year: false })      → "Jul"
 */
export function formatMonth(monthStr, { month = 'short', year = true } = {}) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  const opts = { month };
  if (year) opts.year = 'numeric';
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', opts);
}

/**
 * Format an ISO "YYYY-MM-DD" date string for display.
 * formatDate('2026-07-01') → "1 Jul 2026"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
