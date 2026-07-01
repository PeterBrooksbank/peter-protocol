// routes/finance-budget.js — budget categories, lines, and actuals

export async function routeBudget(req, { db, household_id, url, m, json }) {
  const p = url.pathname;

  // ── GET /api/finance/budget?month=YYYY-MM ──────────────────────────────────
  if (m === 'GET' && p === '/api/finance/budget') {
    const month = url.searchParams.get('month');
    if (!month) return json({ error: 'month required' }, 400);

    const [{ results: rows }, uncatRow] = await Promise.all([
      db.prepare(`
        SELECT
          bc.id   AS cat_id,   bc.name AS cat_name, bc.kind, bc.sort,
          bl.id   AS line_id,  bl.name AS line_name,
          bl.planned_monthly_pence, bl.match_rule, bl.is_active,
          COALESCE(
            SUM(CASE WHEN t.txn_class NOT IN ('transfer','ignore') THEN ABS(t.amount_pence) ELSE 0 END),
            0
          ) AS actual_pence,
          COUNT(CASE WHEN t.txn_class NOT IN ('transfer','ignore') THEN 1 END) AS txn_count
        FROM budget_categories bc
        LEFT JOIN budget_lines bl
          ON bl.category_id = bc.id AND bl.is_active = 1
        LEFT JOIN transactions t
          ON t.budget_line_id = bl.id
          AND t.household_id  = bc.household_id
          AND substr(t.date, 1, 7) = ?
        WHERE bc.household_id = ?
        GROUP BY bc.id, bl.id
        ORDER BY bc.sort, bc.name, bl.name
      `).bind(month, household_id).all(),

      db.prepare(`
        SELECT COUNT(*) AS count FROM transactions
        WHERE household_id = ?
          AND substr(date, 1, 7) = ?
          AND budget_line_id IS NULL
          AND txn_class = 'expense'
      `).bind(household_id, month).first(),
    ]);

    // Group flat rows → { categories: [{...lines}], uncategorised_count }
    const catMap = new Map();
    for (const r of rows) {
      if (!catMap.has(r.cat_id)) {
        catMap.set(r.cat_id, { id: r.cat_id, name: r.cat_name, kind: r.kind, sort: r.sort, lines: [] });
      }
      if (r.line_id) {
        catMap.get(r.cat_id).lines.push({
          id:                    r.line_id,
          name:                  r.line_name,
          planned_monthly_pence: r.planned_monthly_pence,
          match_rule:            r.match_rule,
          actual_pence:          r.actual_pence,
          txn_count:             r.txn_count,
        });
      }
    }

    return json({
      categories:         [...catMap.values()],
      uncategorised_count: uncatRow?.count ?? 0,
    });
  }

  // ── Budget categories ──────────────────────────────────────────────────────
  if (m === 'GET' && p === '/api/finance/budget-categories') {
    const { results } = await db.prepare(
      'SELECT * FROM budget_categories WHERE household_id = ? ORDER BY sort, name'
    ).bind(household_id).all();
    return json(results);
  }

  if (m === 'POST' && p === '/api/finance/budget-categories') {
    const b = await req.json();
    if (!b.name?.trim()) return json({ error: 'name required' }, 400);
    const id = crypto.randomUUID();
    const maxSort = await db.prepare(
      'SELECT COALESCE(MAX(sort), 0) AS m FROM budget_categories WHERE household_id = ?'
    ).bind(household_id).first();
    await db.prepare(
      'INSERT INTO budget_categories (id, household_id, name, kind, sort) VALUES (?,?,?,?,?)'
    ).bind(id, household_id, b.name.trim(), b.kind ?? 'expense', (maxSort?.m ?? 0) + 1).run();
    return json({ id }, 201);
  }

  const catMatch = p.match(/^\/api\/finance\/budget-categories\/([^/]+)$/);
  if (catMatch) {
    const cid = catMatch[1];
    const owns = await db.prepare(
      'SELECT 1 FROM budget_categories WHERE id = ? AND household_id = ?'
    ).bind(cid, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);

    if (m === 'PATCH') {
      const b = await req.json();
      const fields = [], vals = [];
      if (b.name != null) { fields.push('name = ?'); vals.push(b.name.trim()); }
      if (b.kind != null) { fields.push('kind = ?'); vals.push(b.kind); }
      if (b.sort != null) { fields.push('sort = ?'); vals.push(b.sort); }
      if (!fields.length) return json({ error: 'nothing to update' }, 400);
      vals.push(cid);
      await db.prepare(`UPDATE budget_categories SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      // Nullify transactions in this category, then delete lines, then category
      await db.prepare('UPDATE transactions SET category_id = NULL, budget_line_id = NULL WHERE category_id = ? AND household_id = ?').bind(cid, household_id).run();
      await db.prepare('DELETE FROM budget_lines WHERE category_id = ?').bind(cid).run();
      await db.prepare('DELETE FROM budget_categories WHERE id = ?').bind(cid).run();
      return json({ ok: true });
    }
  }

  // ── Budget lines ───────────────────────────────────────────────────────────
  if (m === 'GET' && p === '/api/finance/budget-lines') {
    const { results } = await db.prepare(`
      SELECT bl.*, bc.name AS category_name, bc.kind AS category_kind
      FROM budget_lines bl
      JOIN budget_categories bc ON bc.id = bl.category_id
      WHERE bl.household_id = ? AND bl.is_active = 1
      ORDER BY bc.sort, bc.name, bl.name
    `).bind(household_id).all();
    return json(results);
  }

  if (m === 'POST' && p === '/api/finance/budget-lines') {
    const b = await req.json();
    if (!b.name?.trim())    return json({ error: 'name required' }, 400);
    if (!b.category_id)     return json({ error: 'category_id required' }, 400);
    const okc = await db.prepare(
      'SELECT 1 FROM budget_categories WHERE id = ? AND household_id = ?'
    ).bind(b.category_id, household_id).first();
    if (!okc) return json({ error: 'category not found' }, 404);
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO budget_lines
        (id, household_id, category_id, name, planned_monthly_pence, match_rule, paid_by_person_id, is_active)
      VALUES (?,?,?,?,?,?,?,1)
    `).bind(
      id, household_id, b.category_id, b.name.trim(),
      b.planned_monthly_pence ?? 0,
      b.match_rule ?? null,
      b.paid_by_person_id ?? null,
    ).run();
    return json({ id }, 201);
  }

  const lineMatch = p.match(/^\/api\/finance\/budget-lines\/([^/]+)$/);
  if (lineMatch) {
    const lid = lineMatch[1];
    const owns = await db.prepare(
      'SELECT 1 FROM budget_lines WHERE id = ? AND household_id = ?'
    ).bind(lid, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);

    if (m === 'PATCH') {
      const b = await req.json();
      const fields = [], vals = [];
      const editable = ['name','planned_monthly_pence','match_rule','paid_by_person_id','is_active'];
      for (const k of editable) {
        if (k in b) { fields.push(`${k} = ?`); vals.push(b[k] ?? null); }
      }
      if (!fields.length) return json({ error: 'nothing to update' }, 400);
      vals.push(lid);
      await db.prepare(`UPDATE budget_lines SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      await db.prepare('UPDATE transactions SET budget_line_id = NULL WHERE budget_line_id = ? AND household_id = ?').bind(lid, household_id).run();
      await db.prepare('DELETE FROM budget_lines WHERE id = ?').bind(lid).run();
      return json({ ok: true });
    }
  }

  return null;
}
