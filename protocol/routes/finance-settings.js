// routes/finance-settings.js — GET/PATCH household finance settings

export async function routeSettings(req, { db, household_id, url, m, json }) {
  const p = url.pathname;

  if (m === 'GET' && p === '/api/finance/settings') {
    const row = await db.prepare(
      `SELECT name, claim_child_benefit, num_children, uses_tax_free_childcare
       FROM households WHERE id = ?`
    ).bind(household_id).first();
    return json(row ?? {});
  }

  if (m === 'PATCH' && p === '/api/finance/settings') {
    const b = await req.json();
    const fields = [], vals = [];
    if (b.name               != null) { fields.push('name = ?');                    vals.push(String(b.name)); }
    if (b.claim_child_benefit!= null) { fields.push('claim_child_benefit = ?');     vals.push(b.claim_child_benefit ? 1 : 0); }
    if (b.num_children       != null) { fields.push('num_children = ?');            vals.push(Math.max(0, parseInt(b.num_children) || 0)); }
    if (b.uses_tax_free_childcare != null) { fields.push('uses_tax_free_childcare = ?'); vals.push(b.uses_tax_free_childcare ? 1 : 0); }
    if (!fields.length) return json({ error: 'nothing to update' }, 400);
    vals.push(household_id);
    await db.prepare(`UPDATE households SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true });
  }

  return null;
}
