// routes/finance-statements.js — statement import, transaction review + matching

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const normalise = s => s.toLowerCase().replace(/\s+/g, ' ').trim();

export async function routeStatements(req, { db, email, household_id, url, m, json }) {
  const p = url.pathname;

  // ── POST /api/finance/statements/import ───────────────────────────────────
  // Body: { account_id, bank, filename, period_month, rows: [{date, description, amount}] }
  // amount is a float from the CSV parser; we convert to integer pence here.
  if (m === 'POST' && p === '/api/finance/statements/import') {
    const { account_id, bank, filename, period_month, rows } = await req.json();
    const owns = await db.prepare(
      'SELECT 1 FROM accounts WHERE id = ? AND household_id = ?'
    ).bind(account_id, household_id).first();
    if (!owns) return json({ error: 'account not found' }, 404);

    const stmtId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO statements (id, household_id, account_id, uploaded_by, bank, filename, period_month)
      VALUES (?,?,?,?,?,?,?)
    `).bind(stmtId, household_id, account_id, email, bank ?? null, filename ?? null, period_month ?? null).run();

    const stmts = [];
    for (const r of rows) {
      const amountPence = Math.round(r.amount * 100);
      const dedupeHash = await sha256(`${r.date}|${amountPence}|${normalise(r.description)}`);
      // Default txn_class based on sign: positive = income, negative = expense
      const txnClass = amountPence >= 0 ? 'income' : 'expense';
      stmts.push(
        db.prepare(`
          INSERT OR IGNORE INTO transactions
            (id, household_id, account_id, statement_id, date, description, amount_pence,
             txn_class, reconciled, dedupe_hash)
          VALUES (?,?,?,?,?,?,?,?,0,?)
        `).bind(
          crypto.randomUUID(), household_id, account_id, stmtId,
          r.date, r.description, amountPence, txnClass, dedupeHash,
        )
      );
    }

    const results = await db.batch(stmts);
    const imported = results.filter(r => (r.meta?.changes ?? 0) > 0).length;
    return json({ statement_id: stmtId, imported, skipped: rows.length - imported }, 201);
  }

  // ── GET /api/finance/transactions?month=YYYY-MM ───────────────────────────
  if (m === 'GET' && p === '/api/finance/transactions') {
    const month = url.searchParams.get('month');
    const stmtId = url.searchParams.get('statement_id');
    const where = ['t.household_id = ?'];
    const binds = [household_id];
    if (month)  { where.push("substr(t.date,1,7) = ?"); binds.push(month); }
    if (stmtId) { where.push('t.statement_id = ?');     binds.push(stmtId); }
    const { results } = await db.prepare(`
      SELECT t.id, t.date, t.description, t.amount_pence,
             t.budget_line_id, t.category_id, t.txn_class, t.statement_id, t.reconciled,
             bl.name AS line_name,
             bc.name AS cat_name
      FROM transactions t
      LEFT JOIN budget_lines bl       ON bl.id = t.budget_line_id
      LEFT JOIN budget_categories bc  ON bc.id = t.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.date DESC, ABS(t.amount_pence) DESC
    `).bind(...binds).all();
    return json(results);
  }

  // ── POST /api/finance/transactions/match — bulk assign ────────────────────
  // Body: { assignments: [{ id, budget_line_id, category_id, txn_class }] }
  if (m === 'POST' && p === '/api/finance/transactions/match') {
    const { assignments } = await req.json();
    if (!Array.isArray(assignments) || !assignments.length)
      return json({ error: 'assignments required' }, 400);

    const stmts = assignments.map(a =>
      db.prepare(`
        UPDATE transactions
        SET budget_line_id = ?, category_id = ?, txn_class = ?
        WHERE id = ? AND household_id = ?
      `).bind(
        a.budget_line_id ?? null,
        a.category_id    ?? null,
        a.txn_class      ?? 'expense',
        a.id,
        household_id,
      )
    );
    await db.batch(stmts);
    return json({ ok: true, updated: stmts.length });
  }

  // ── PATCH /api/finance/transactions/:id ───────────────────────────────────
  const txnMatch = p.match(/^\/api\/finance\/transactions\/([^/]+)$/);
  if (txnMatch && m === 'PATCH') {
    const tid = txnMatch[1];
    const owns = await db.prepare(
      'SELECT 1 FROM transactions WHERE id = ? AND household_id = ?'
    ).bind(tid, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);
    const b = await req.json();
    const fields = [], vals = [];
    if ('budget_line_id' in b) { fields.push('budget_line_id = ?'); vals.push(b.budget_line_id ?? null); }
    if ('category_id'    in b) { fields.push('category_id = ?');    vals.push(b.category_id    ?? null); }
    if ('txn_class'      in b) { fields.push('txn_class = ?');      vals.push(b.txn_class); }
    if ('reconciled'     in b) { fields.push('reconciled = ?');     vals.push(b.reconciled ? 1 : 0); }
    if (!fields.length) return json({ error: 'nothing to update' }, 400);
    vals.push(tid);
    await db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true });
  }

  return null;
}
