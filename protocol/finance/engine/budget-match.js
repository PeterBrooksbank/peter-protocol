// finance/engine/budget-match.js — match-rule engine (pure ESM)
// Rules are simple case-insensitive substrings — safe, predictable, no regex.

/**
 * Test whether a transaction description matches a budget line's match rule.
 * @param {string} description  Transaction description (raw)
 * @param {string} rule         Budget line match rule (e.g. "NETFLIX")
 * @returns {boolean}
 */
export function applyRule(description, rule) {
  if (!rule?.trim()) return false;
  return description.toLowerCase().includes(rule.toLowerCase().trim());
}

/**
 * Find the first budget line whose match rule applies to the description.
 * Lines are tested in the order provided — put more specific rules first.
 * @returns {object|null} The first matching line, or null.
 */
export function findMatch(description, budgetLines) {
  if (!description || !budgetLines?.length) return null;
  for (const line of budgetLines) {
    if (applyRule(description, line.match_rule)) return line;
  }
  return null;
}

/**
 * Auto-match a batch of transactions against all budget lines.
 * Returns each transaction annotated with a `matched_line` field (or null).
 * @param {Array<{description: string}>} transactions
 * @param {Array<{match_rule: string}>}  budgetLines
 * @returns {Array<{...txn, matched_line: object|null}>}
 */
export function autoMatch(transactions, budgetLines) {
  return transactions.map(txn => ({
    ...txn,
    matched_line: findMatch(txn.description, budgetLines),
  }));
}

/**
 * Derive a sensible match rule from a raw transaction description.
 * Strips payment references, card numbers, long digit runs, and noise words
 * to leave the payee name.
 * @param {string} description
 * @returns {string}
 */
export function deriveRule(description) {
  return description
    .replace(/\d{4,}/g, '')           // strip long digit sequences (refs, card numbers)
    .replace(/\b\d{1,3}[\/\-]\d{1,3}[\/\-]\d{2,4}\b/g, '') // strip dates
    .replace(/\b(ON|AT|TO|BY|VIA|REF|TXN|STO|BP|DD|SO|FPI|FPO)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}
