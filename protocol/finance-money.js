// finance-money.js — Pence/£ conversion helpers (pure, no deps)
// All monetary values in the app are stored and computed as integer pence.
// Only convert to/from £ at display and input boundaries.

(function () {
  'use strict';

  /**
   * Convert a pence integer to a formatted £ string.
   * penceToDisplay(123456) → "£1,234.56"
   * penceToDisplay(-50)    → "-£0.50"
   * penceToDisplay(0)      → "£0.00"
   */
  function penceToDisplay(pence) {
    if (typeof pence !== 'number' || !isFinite(pence)) return '£0.00';
    const abs = Math.abs(pence);
    const pounds = Math.floor(abs / 100);
    const pennies = abs % 100;
    const formatted = pounds.toLocaleString('en-GB') + '.' + String(pennies).padStart(2, '0');
    return (pence < 0 ? '-' : '') + '£' + formatted;
  }

  /**
   * Convert a pence integer to a compact display (no pence if .00).
   * penceToCompact(123456) → "£1,234.56"
   * penceToCompact(120000) → "£1,200"
   */
  function penceToCompact(pence) {
    if (typeof pence !== 'number' || !isFinite(pence)) return '£0';
    if (pence % 100 === 0) {
      const abs = Math.abs(pence / 100);
      const formatted = abs.toLocaleString('en-GB');
      return (pence < 0 ? '-' : '') + '£' + formatted;
    }
    return penceToDisplay(pence);
  }

  /**
   * Parse a user-entered £ string to integer pence.
   * Returns null if the input cannot be parsed.
   *
   * Handles: "1234.56", "£1,234.56", "1234", ".50", "1,200", "-50.00"
   * Rejects:  "", "abc", "1.2.3"
   */
  function parsePence(str) {
    if (typeof str !== 'string' && typeof str !== 'number') return null;
    const s = String(str).trim().replace(/£/g, '').replace(/,/g, '');
    if (s === '' || s === '-') return null;
    // Must be a valid decimal number (any number of decimal places — Math.round handles rounding)
    if (!/^-?\d*\.?\d+$|^-?\d+\.?\d*$/.test(s)) return null;
    const f = parseFloat(s);
    if (!isFinite(f)) return null;
    return Math.round(f * 100);
  }

  /**
   * Parse an annual £ figure entered by the user to monthly pence.
   * parseAnnualToPence("60000") → 500000 (£5,000/mo in pence)
   */
  function parseAnnualToPence(str) {
    const annual = parsePence(str);
    if (annual === null) return null;
    return Math.round(annual / 12);
  }

  /**
   * Convert monthly pence to annual pence.
   */
  function monthlyToAnnual(monthlyPence) {
    return monthlyPence * 12;
  }

  /**
   * Convert annual pence to monthly pence (rounded to nearest penny).
   */
  function annualToMonthly(annualPence) {
    return Math.round(annualPence / 12);
  }

  /**
   * Format pence as an annual £ figure for display.
   * penceMonthlyToAnnualDisplay(500000) → "£60,000"
   */
  function penceMonthlyToAnnualDisplay(monthlyPence) {
    return penceToCompact(monthlyToAnnual(monthlyPence));
  }

  /**
   * Safe addition of multiple pence values (avoids float drift).
   * sumPence([100, 200, 300]) → 600
   */
  function sumPence(arr) {
    return arr.reduce((acc, v) => acc + (v || 0), 0);
  }

  if (typeof window !== 'undefined') {
    window.financeMoney = {
      penceToDisplay,
      penceToCompact,
      parsePence,
      parseAnnualToPence,
      monthlyToAnnual,
      annualToMonthly,
      penceMonthlyToAnnualDisplay,
      sumPence,
    };
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      penceToDisplay,
      penceToCompact,
      parsePence,
      parseAnnualToPence,
      monthlyToAnnual,
      annualToMonthly,
      penceMonthlyToAnnualDisplay,
      sumPence,
    };
  }
})();
