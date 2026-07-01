// routes/finance-income.js — income sources, entries, events

export async function routeIncome(req, { db, household_id, url, m, json }) {
  const p = url.pathname;

  // ── GET /api/finance/income?month=YYYY-MM ──────────────────────────────────
  // Returns structured { settings, people: [{...sources: [{...entry}], events}] }
  if (m === 'GET' && p === '/api/finance/income') {
    const month = url.searchParams.get('month');
    if (!month) return json({ error: 'month required' }, 400);
    const effectiveCutoff = month + '-01'; // entries effective on/before first of month

    const [settings, { results: rows }, { results: eventRows }] = await Promise.all([
      db.prepare(
        `SELECT name, claim_child_benefit, num_children, uses_tax_free_childcare
         FROM households WHERE id = ?`
      ).bind(household_id).first(),

      db.prepare(`
        SELECT p.id  AS person_id,
               p.display_name,
               p.is_earner,
               p.marriage_allowance_partner_id,
               s.id AS source_id,
               s.name AS source_name,
               s.kind,
               s.tax_code,
               s.tax_code_allowance_pence,
               s.is_primary,
               s.pension_method,
               s.pension_ee_type,
               s.pension_ee_value,
               s.pension_er_type,
               s.pension_er_value,
               s.student_loan_plan,
               e.id AS entry_id,
               e.effective_from,
               e.gross_monthly_pence,
               e.income_tax_pence,
               e.ni_pence,
               e.pension_ee_pence,
               e.pension_er_pence,
               e.student_loan_pence,
               e.net_monthly_pence,
               e.has_overrides,
               e.note AS entry_note
        FROM people p
        LEFT JOIN income_sources s
          ON s.person_id = p.id AND s.is_active = 1
        LEFT JOIN income_entries e
          ON e.id = (
            SELECT e2.id FROM income_entries e2
            WHERE e2.income_source_id = s.id
              AND e2.effective_from <= ?
            ORDER BY e2.effective_from DESC LIMIT 1
          )
        WHERE p.household_id = ?
        ORDER BY p.display_name, s.name
      `).bind(effectiveCutoff, household_id).all(),

      db.prepare(`
        SELECT ie.id, ie.person_id, ie.income_source_id,
               ie.event_date, ie.kind,
               ie.gross_pence, ie.tax_pence, ie.ni_pence, ie.net_pence, ie.note
        FROM income_events ie
        JOIN people p ON p.id = ie.person_id
        WHERE p.household_id = ?
        ORDER BY ie.event_date DESC
      `).bind(household_id).all(),
    ]);

    // Group flat rows into people → sources structure
    const peopleMap = new Map();
    for (const r of rows) {
      if (!peopleMap.has(r.person_id)) {
        peopleMap.set(r.person_id, {
          id: r.person_id,
          display_name: r.display_name,
          is_earner: r.is_earner,
          marriage_allowance_partner_id: r.marriage_allowance_partner_id,
          sources: [],
          events: [],
        });
      }
      if (r.source_id) {
        peopleMap.get(r.person_id).sources.push({
          id: r.source_id,
          name: r.source_name,
          kind: r.kind,
          tax_code: r.tax_code,
          tax_code_allowance_pence: r.tax_code_allowance_pence,
          is_primary: r.is_primary,
          pension_method: r.pension_method,
          pension_ee_type: r.pension_ee_type,
          pension_ee_value: r.pension_ee_value,
          pension_er_type: r.pension_er_type,
          pension_er_value: r.pension_er_value,
          student_loan_plan: r.student_loan_plan,
          entry: r.entry_id ? {
            id: r.entry_id,
            effective_from: r.effective_from,
            gross_monthly_pence: r.gross_monthly_pence,
            income_tax_pence: r.income_tax_pence,
            ni_pence: r.ni_pence,
            pension_ee_pence: r.pension_ee_pence,
            pension_er_pence: r.pension_er_pence,
            student_loan_pence: r.student_loan_pence,
            net_monthly_pence: r.net_monthly_pence,
            has_overrides: r.has_overrides,
            note: r.entry_note,
          } : null,
        });
      }
    }

    // Attach events to people
    for (const ev of eventRows) {
      if (peopleMap.has(ev.person_id)) {
        peopleMap.get(ev.person_id).events.push(ev);
      }
    }

    return json({ settings: settings ?? {}, people: [...peopleMap.values()] });
  }

  // ── POST /api/finance/income-sources ──────────────────────────────────────
  if (m === 'POST' && p === '/api/finance/income-sources') {
    const b = await req.json();
    const okp = await db.prepare(
      'SELECT 1 FROM people WHERE id = ? AND household_id = ?'
    ).bind(b.person_id, household_id).first();
    if (!okp) return json({ error: 'person not found' }, 404);

    // Only one primary source per person
    if (b.is_primary) {
      await db.prepare(
        'UPDATE income_sources SET is_primary = 0 WHERE person_id = ?'
      ).bind(b.person_id).run();
    }

    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO income_sources
        (id, person_id, name, kind, tax_code, tax_code_allowance_pence, is_primary,
         pension_method, pension_ee_type, pension_ee_value,
         pension_er_type, pension_er_value, student_loan_plan, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)
    `).bind(
      id, b.person_id, b.name, b.kind ?? 'employment',
      b.tax_code ?? '1257L', b.tax_code_allowance_pence ?? null, b.is_primary ? 1 : 0,
      b.pension_method ?? 'none',
      b.pension_ee_type ?? 'pct', b.pension_ee_value ?? 0,
      b.pension_er_type ?? 'pct', b.pension_er_value ?? 0,
      b.student_loan_plan ?? 'none',
    ).run();
    return json({ id }, 201);
  }

  // ── Source-level routes (/api/finance/income-sources/:id) ─────────────────
  const srcMatch = p.match(/^\/api\/finance\/income-sources\/([^/]+)(\/.*)?$/);
  if (srcMatch) {
    const sid = srcMatch[1];
    const sub = srcMatch[2] ?? '';
    const owns = await db.prepare(`
      SELECT s.person_id FROM income_sources s
      JOIN people pp ON pp.id = s.person_id
      WHERE s.id = ? AND pp.household_id = ?
    `).bind(sid, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);

    // GET history
    if (m === 'GET' && sub === '/history') {
      const { results } = await db.prepare(
        'SELECT * FROM income_entries WHERE income_source_id = ? ORDER BY effective_from DESC'
      ).bind(sid).all();
      return json(results);
    }

    // PATCH source config
    if (m === 'PATCH' && sub === '') {
      const b = await req.json();
      const fields = [], vals = [];
      const allow = ['name', 'kind', 'tax_code', 'is_primary', 'pension_method',
                     'pension_ee_type', 'pension_ee_value', 'pension_er_type',
                     'pension_er_value', 'student_loan_plan', 'is_active'];
      for (const k of allow) {
        if (b[k] != null) { fields.push(`${k} = ?`); vals.push(b[k]); }
      }
      if ('tax_code_allowance_pence' in b) {
        fields.push('tax_code_allowance_pence = ?');
        vals.push(b.tax_code_allowance_pence ?? null);
      }
      if (!fields.length) return json({ error: 'nothing to update' }, 400);

      // Enforce single primary per person
      if (b.is_primary) {
        await db.prepare(
          'UPDATE income_sources SET is_primary = 0 WHERE person_id = ?'
        ).bind(owns.person_id).run();
      }

      vals.push(sid);
      await db.prepare(`UPDATE income_sources SET ${fields.join(', ')} WHERE id = ?`)
        .bind(...vals).run();
      return json({ ok: true });
    }
  }

  // ── POST /api/finance/income-entries ──────────────────────────────────────
  if (m === 'POST' && p === '/api/finance/income-entries') {
    const b = await req.json();
    const owns = await db.prepare(`
      SELECT 1 FROM income_sources s JOIN people pp ON pp.id = s.person_id
      WHERE s.id = ? AND pp.household_id = ?
    `).bind(b.income_source_id, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO income_entries
        (id, income_source_id, effective_from,
         gross_monthly_pence, income_tax_pence, ni_pence,
         pension_ee_pence, pension_er_pence, student_loan_pence,
         net_monthly_pence, has_overrides, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, b.income_source_id, b.effective_from,
      b.gross_monthly_pence, b.income_tax_pence ?? 0, b.ni_pence ?? 0,
      b.pension_ee_pence ?? 0, b.pension_er_pence ?? 0, b.student_loan_pence ?? 0,
      b.net_monthly_pence, b.has_overrides ? 1 : 0, b.note ?? null,
    ).run();
    return json({ id }, 201);
  }

  // ── PATCH /api/finance/income-entries/:id ─────────────────────────────────
  const entryMatch = p.match(/^\/api\/finance\/income-entries\/([^/]+)$/);
  if (entryMatch && m === 'PATCH') {
    const eid = entryMatch[1];
    const owns = await db.prepare(`
      SELECT 1 FROM income_entries e
      JOIN income_sources s ON s.id = e.income_source_id
      JOIN people pp ON pp.id = s.person_id
      WHERE e.id = ? AND pp.household_id = ?
    `).bind(eid, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);
    const b = await req.json();
    const fields = [], vals = [];
    const cols = ['effective_from', 'gross_monthly_pence', 'income_tax_pence',
                  'ni_pence', 'pension_ee_pence', 'pension_er_pence',
                  'student_loan_pence', 'net_monthly_pence', 'note'];
    for (const c of cols) {
      if (b[c] != null) { fields.push(`${c} = ?`); vals.push(b[c]); }
    }
    if ('has_overrides' in b) { fields.push('has_overrides = ?'); vals.push(b.has_overrides ? 1 : 0); }
    if (!fields.length) return json({ error: 'nothing to update' }, 400);
    vals.push(eid);
    await db.prepare(`UPDATE income_entries SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true });
  }

  // ── Income events ─────────────────────────────────────────────────────────
  if (m === 'POST' && p === '/api/finance/income-events') {
    const b = await req.json();
    const okp = await db.prepare(
      'SELECT 1 FROM people WHERE id = ? AND household_id = ?'
    ).bind(b.person_id, household_id).first();
    if (!okp) return json({ error: 'person not found' }, 404);
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO income_events
        (id, person_id, income_source_id, event_date, kind,
         gross_pence, tax_pence, ni_pence, net_pence, note)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, b.person_id, b.income_source_id ?? null, b.event_date,
      b.kind ?? 'bonus', b.gross_pence,
      b.tax_pence ?? 0, b.ni_pence ?? 0, b.net_pence, b.note ?? null,
    ).run();
    return json({ id }, 201);
  }

  const evtMatch = p.match(/^\/api\/finance\/income-events\/([^/]+)$/);
  if (evtMatch) {
    const eid = evtMatch[1];
    const owns = await db.prepare(`
      SELECT 1 FROM income_events ie JOIN people p ON p.id = ie.person_id
      WHERE ie.id = ? AND p.household_id = ?
    `).bind(eid, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);

    if (m === 'PATCH') {
      const b = await req.json();
      const fields = [], vals = [];
      for (const c of ['event_date','kind','gross_pence','tax_pence','ni_pence','net_pence','note']) {
        if (b[c] != null) { fields.push(`${c} = ?`); vals.push(b[c]); }
      }
      if (!fields.length) return json({ error: 'nothing to update' }, 400);
      vals.push(eid);
      await db.prepare(`UPDATE income_events SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
      return json({ ok: true });
    }

    if (m === 'DELETE') {
      await db.prepare('DELETE FROM income_events WHERE id = ?').bind(eid).run();
      return json({ ok: true });
    }
  }

  return null;
}
