// routes/finance-accounts.js — CRUD for accounts + snapshots

const ACCOUNT_TYPES = new Set([
  'current','savings','isa','investment','pension','student_loan','mortgage','other',
]);
const PROJECTION_MODES = new Set(['manual','pension','amortising','contribution']);
const LIABILITY_TYPES  = new Set(['student_loan','mortgage']);

export async function routeAccounts(req, { db, household_id, url, m, json }) {
  const p = url.pathname;

  // ── GET /api/finance/accounts ─────────────────────────────────────────────
  if (m === 'GET' && p === '/api/finance/accounts') {
    const { results } = await db.prepare(`
      SELECT
        a.id, a.owner_person_id, a.type, a.is_liability,
        a.provider, a.nickname, a.projection_mode,
        a.linked_income_source_id, a.linked_budget_line_id,
        a.interest_rate_bps, a.growth_rate_bps, a.monthly_contribution_pence,
        a.opened_date, a.closed_date, a.meta,
        pp.display_name AS owner_name,
        s.balance_pence AS snapshot_balance_pence,
        s.as_of_date    AS snapshot_date,
        -- For pension mode: look up monthly contrib from linked income entry
        CASE
          WHEN a.projection_mode = 'pension' AND a.linked_income_source_id IS NOT NULL
          THEN (
            SELECT e.pension_ee_pence + e.pension_er_pence
            FROM income_entries e
            WHERE e.income_source_id = a.linked_income_source_id
            ORDER BY e.effective_from DESC LIMIT 1
          )
          ELSE a.monthly_contribution_pence
        END AS projected_monthly_contrib_pence
      FROM accounts a
      LEFT JOIN people pp ON pp.id = a.owner_person_id
      LEFT JOIN (
        SELECT account_id, balance_pence, as_of_date,
               ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY as_of_date DESC) AS rn
        FROM snapshots
      ) s ON s.account_id = a.id AND s.rn = 1
      WHERE a.household_id = ? AND a.closed_date IS NULL
      ORDER BY a.type, a.nickname
    `).bind(household_id).all();
    return json(results);
  }

  // ── POST /api/finance/accounts ────────────────────────────────────────────
  if (m === 'POST' && p === '/api/finance/accounts') {
    const b = await req.json();
    if (!b.nickname?.trim())      return json({ error: 'nickname required' }, 400);
    if (!ACCOUNT_TYPES.has(b.type)) return json({ error: 'invalid type' }, 400);
    if (b.projection_mode && !PROJECTION_MODES.has(b.projection_mode))
      return json({ error: 'invalid projection_mode' }, 400);

    // Validate owner
    if (b.owner_person_id) {
      const okp = await db.prepare(
        'SELECT 1 FROM people WHERE id = ? AND household_id = ?'
      ).bind(b.owner_person_id, household_id).first();
      if (!okp) return json({ error: 'person not found' }, 404);
    }

    const id = crypto.randomUUID();
    const isLiability = LIABILITY_TYPES.has(b.type) ? 1 : (b.is_liability ? 1 : 0);

    await db.prepare(`
      INSERT INTO accounts
        (id, household_id, owner_person_id, type, is_liability,
         provider, nickname, projection_mode,
         linked_income_source_id, linked_budget_line_id,
         interest_rate_bps, growth_rate_bps, monthly_contribution_pence,
         opened_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, household_id,
      b.owner_person_id ?? null,
      b.type,
      isLiability,
      b.provider ?? null,
      b.nickname.trim(),
      b.projection_mode ?? 'manual',
      b.linked_income_source_id ?? null,
      b.linked_budget_line_id ?? null,
      b.interest_rate_bps ?? null,
      b.growth_rate_bps ?? null,
      b.monthly_contribution_pence ?? null,
      b.opened_date ?? new Date().toISOString().slice(0, 10),
    ).run();

    // Optional opening snapshot
    if (b.opening_balance_pence != null) {
      await db.prepare(
        'INSERT INTO snapshots (id, account_id, as_of_date, balance_pence, note) VALUES (?,?,?,?,?)'
      ).bind(
        crypto.randomUUID(), id,
        b.opening_date ?? new Date().toISOString().slice(0, 10),
        b.opening_balance_pence,
        'Opening balance',
      ).run();
    }

    return json({ id }, 201);
  }

  // ── Account-level routes /api/finance/accounts/:id ────────────────────────
  const accMatch = p.match(/^\/api\/finance\/accounts\/([^/]+)$/);
  if (accMatch) {
    const aid = accMatch[1];
    const owns = await db.prepare(
      'SELECT 1 FROM accounts WHERE id = ? AND household_id = ?'
    ).bind(aid, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);

    if (m === 'PATCH') {
      const b = await req.json();
      const fields = [], vals = [];
      const editable = ['provider','nickname','projection_mode','linked_income_source_id',
                        'linked_budget_line_id','interest_rate_bps','growth_rate_bps',
                        'monthly_contribution_pence','closed_date'];
      for (const k of editable) {
        if (k in b) { fields.push(`${k} = ?`); vals.push(b[k] ?? null); }
      }
      if (!fields.length) return json({ error: 'nothing to update' }, 400);
      vals.push(aid);
      await db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`)
        .bind(...vals).run();
      return json({ ok: true });
    }

    if (m === 'DELETE') {
      await db.prepare('UPDATE accounts SET closed_date = ? WHERE id = ?')
        .bind(new Date().toISOString().slice(0, 10), aid).run();
      return json({ ok: true });
    }
  }

  // ── POST /api/finance/snapshots ───────────────────────────────────────────
  if (m === 'POST' && p === '/api/finance/snapshots') {
    const b = await req.json();
    const owns = await db.prepare(
      'SELECT 1 FROM accounts WHERE id = ? AND household_id = ?'
    ).bind(b.account_id, household_id).first();
    if (!owns) return json({ error: 'account not found' }, 404);
    await db.prepare(
      'INSERT INTO snapshots (id, account_id, as_of_date, balance_pence, note) VALUES (?,?,?,?,?)'
    ).bind(
      crypto.randomUUID(), b.account_id,
      b.as_of_date ?? new Date().toISOString().slice(0, 10),
      b.balance_pence,
      b.note ?? null,
    ).run();
    return json({ ok: true });
  }

  return null;
}
