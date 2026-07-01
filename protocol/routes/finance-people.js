// routes/finance-people.js — CRUD for household people

export async function routePeople(req, { db, household_id, url, m, json }) {
  const p = url.pathname;

  if (m === 'GET' && p === '/api/finance/people') {
    const { results } = await db.prepare(
      `SELECT id, display_name, is_earner, marriage_allowance_partner_id
       FROM people WHERE household_id = ? ORDER BY display_name`
    ).bind(household_id).all();
    return json(results);
  }

  if (m === 'POST' && p === '/api/finance/people') {
    const b = await req.json();
    if (!b.display_name?.trim()) return json({ error: 'display_name required' }, 400);
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO people (id, household_id, display_name, is_earner, marriage_allowance_partner_id)
       VALUES (?,?,?,?,?)`
    ).bind(id, household_id, b.display_name.trim(), b.is_earner === false ? 0 : 1,
      b.marriage_allowance_partner_id ?? null).run();
    return json({ id }, 201);
  }

  const personMatch = p.match(/^\/api\/finance\/people\/([^/]+)$/);
  if (personMatch) {
    const pid = personMatch[1];
    const owns = await db.prepare(
      'SELECT 1 FROM people WHERE id = ? AND household_id = ?'
    ).bind(pid, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);

    if (m === 'PATCH') {
      const b = await req.json();
      const fields = [], vals = [];
      if (b.display_name != null) { fields.push('display_name = ?'); vals.push(b.display_name.trim()); }
      if (b.is_earner    != null) { fields.push('is_earner = ?');    vals.push(b.is_earner ? 1 : 0); }
      if ('marriage_allowance_partner_id' in b) {
        fields.push('marriage_allowance_partner_id = ?');
        vals.push(b.marriage_allowance_partner_id ?? null);
      }
      if (!fields.length) return json({ error: 'nothing to update' }, 400);
      vals.push(pid, household_id);
      await db.prepare(`UPDATE people SET ${fields.join(', ')} WHERE id = ? AND household_id = ?`)
        .bind(...vals).run();
      return json({ ok: true });
    }

    if (m === 'DELETE') {
      // Only allow if person has no income sources
      const hasSources = await db.prepare(
        'SELECT 1 FROM income_sources WHERE person_id = ? LIMIT 1'
      ).bind(pid).first();
      if (hasSources) return json({ error: 'deactivate all income sources first' }, 409);
      await db.prepare('DELETE FROM people WHERE id = ? AND household_id = ?')
        .bind(pid, household_id).run();
      return json({ ok: true });
    }
  }

  return null;
}
