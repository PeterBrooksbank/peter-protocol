// protocol/worker.js
import { jwtVerify, createRemoteJWKSet } from 'jose';

const TEAM_DOMAIN = 'https://rough-band-262a.cloudflareaccess.com';
const AUD = 'cc34bd0e84f761afdcc352b50c82a4b02117f7a9d2ee998c1587dc2f606d652d';
const JWKS = createRemoteJWKSet(new URL(`${TEAM_DOMAIN}/cdn-cgi/access/certs`));

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

async function identify(request) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: TEAM_DOMAIN, audience: AUD });
    return payload.email;
  } catch { return null; }
}
const scope = (db, email) =>
  db.prepare('SELECT household_id, person_id, role FROM memberships WHERE user_email = ?')
    .bind(email).first();

const normalise = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
async function sha(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Anything not /api/* is a static asset — hand it back to the assets binding.
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // Probe — no auth, just confirms the worker + binding are live.
    if (url.pathname === '/api/_probe') {
      return json({ hasDB: !!env.FINANCE_DB, bindings: Object.keys(env) });
    }

    const db = env.FINANCE_DB;
    const email = await identify(request);
    if (!email) return json({ error: 'unauthorised' }, 403);
    const ctx = await scope(db, email);
    if (!ctx) return json({ error: 'no household' }, 403);
    const { household_id } = ctx;
    const p = url.pathname;
    const m = request.method;

    if (m === 'GET' && p === '/api/finance/accounts') {
      const { results } = await db.prepare(`
        SELECT a.*, s.balance, s.as_of_date
        FROM accounts a
        LEFT JOIN (
          SELECT account_id, balance, as_of_date,
                 ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY as_of_date DESC) rn
          FROM snapshots
        ) s ON s.account_id = a.id AND s.rn = 1
        WHERE a.household_id = ? AND a.closed_date IS NULL
      `).bind(household_id).all();
      return json(results);
    }

    if (m === 'POST' && p === '/api/finance/snapshots') {
      const b = await request.json();
      const owns = await db.prepare('SELECT 1 FROM accounts WHERE id = ? AND household_id = ?')
                           .bind(b.account_id, household_id).first();
      if (!owns) return json({ error: 'not found' }, 404);
      await db.prepare(`INSERT INTO snapshots (id, account_id, as_of_date, balance, contribution_since_last, note)
                        VALUES (?,?,?,?,?,?)`)
              .bind(crypto.randomUUID(), b.account_id, b.as_of_date, b.balance,
                    b.contribution_since_last ?? null, b.note ?? null).run();
      return json({ ok: true });
    }

    if (m === 'POST' && p === '/api/finance/income-entries') {
      const b = await request.json();
      await db.prepare(`INSERT INTO income_entries (id, income_source_id, effective_from,
          gross_monthly, income_tax, national_insurance, pension_employee, pension_employer,
          student_loan, other_deductions, net_monthly, note)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), b.income_source_id, b.effective_from, b.gross_monthly,
              b.income_tax ?? 0, b.national_insurance ?? 0, b.pension_employee ?? 0,
              b.pension_employer ?? 0, b.student_loan ?? 0, b.other_deductions ?? 0,
              b.net_monthly, b.note ?? null).run();
      return json({ ok: true });
    }

    if (m === 'POST' && p === '/api/finance/accounts') {
      const b = await request.json();
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO accounts
        (id, household_id, owner_person_id, type, is_liability, provider, nickname, meta, opened_date)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(id, household_id, b.owner_person_id ?? null, b.type,
              b.is_liability ? 1 : 0, b.provider ?? null, b.nickname,
              b.meta ? JSON.stringify(b.meta) : null, b.opened_date ?? null).run();
      // optional opening balance → first snapshot
      if (b.balance != null) {
        await db.prepare(`INSERT INTO snapshots (id, account_id, as_of_date, balance)
                          VALUES (?,?,date('now'),?)`)
                .bind(crypto.randomUUID(), id, b.balance).run();
      }
      return json({ id });
    }

    if (m === 'POST' && p === '/api/finance/transactions/import') {
      const { account_id, statement_id, rows } = await request.json();
      const owns = await db.prepare('SELECT 1 FROM accounts WHERE id = ? AND household_id = ?')
                           .bind(account_id, household_id).first();
      if (!owns) return json({ error: 'not found' }, 404);
      const stmts = [];
      for (const r of rows) {
        const dh = await sha(`${r.date}|${r.amount}|${normalise(r.description)}`);
        stmts.push(db.prepare(`INSERT OR IGNORE INTO transactions
          (id, household_id, account_id, date, description, amount, statement_id, dedupe_hash)
          VALUES (?,?,?,?,?,?,?,?)`)
          .bind(crypto.randomUUID(), household_id, account_id, r.date, r.description,
                r.amount, statement_id ?? null, dh));
      }
      const res = await db.batch(stmts);
      return json({ imported: res.length });
    }

    // GET /api/finance/budget?month=YYYY-MM — planned vs actual per category
    if (m === 'GET' && p === '/api/finance/budget') {
      const month = url.searchParams.get('month');
      if (!month) return json({ error: 'month required' }, 400);
      const { results } = await db.prepare(`
        SELECT c.id, c.name, c.kind, c.planned_monthly, c.rollover_enabled,
          CASE WHEN c.kind = 'expense'
               THEN -COALESCE(SUM(t.amount), 0)
               ELSE  COALESCE(SUM(t.amount), 0) END AS actual
        FROM categories c
        LEFT JOIN transactions t
          ON t.category_id = c.id AND t.household_id = c.household_id
         AND substr(t.date, 1, 7) = ?
        WHERE c.household_id = ?
        GROUP BY c.id
        ORDER BY c.kind, c.name
      `).bind(month, household_id).all();
      return json(results);
    }

    if (m === 'GET' && p === '/api/finance/categories') {
      const { results } = await db.prepare(
        'SELECT * FROM categories WHERE household_id = ? ORDER BY kind, name'
      ).bind(household_id).all();
      return json(results);
    }

    if (m === 'POST' && p === '/api/finance/categories') {
      const b = await request.json();
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO categories (id, household_id, name, kind, planned_monthly, rollover_enabled)
                        VALUES (?,?,?,?,?,?)`)
        .bind(id, household_id, b.name, b.kind ?? 'expense',
              b.planned_monthly ?? 0, b.rollover_enabled ? 1 : 0).run();
      return json({ id });
    }

    // PATCH / DELETE /api/finance/categories/:id
    const catMatch = p.match(/^\/api\/finance\/categories\/([^/]+)$/);
    if (catMatch) {
      const catId = catMatch[1];
      const owns = await db.prepare('SELECT 1 FROM categories WHERE id = ? AND household_id = ?')
                           .bind(catId, household_id).first();
      if (!owns) return json({ error: 'not found' }, 404);

      if (m === 'PATCH') {
        const b = await request.json();
        const fields = [], vals = [];
        if (b.name != null)             { fields.push('name = ?');             vals.push(b.name); }
        if (b.planned_monthly != null)  { fields.push('planned_monthly = ?');  vals.push(b.planned_monthly); }
        if (b.rollover_enabled != null) { fields.push('rollover_enabled = ?'); vals.push(b.rollover_enabled ? 1 : 0); }
        if (!fields.length) return json({ error: 'nothing to update' }, 400);
        vals.push(catId, household_id);
        await db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ? AND household_id = ?`)
                .bind(...vals).run();
        return json({ ok: true });
      }
      if (m === 'DELETE') {
        await db.prepare('UPDATE transactions SET category_id = NULL WHERE category_id = ? AND household_id = ?')
                .bind(catId, household_id).run();
        await db.prepare('DELETE FROM categories WHERE id = ? AND household_id = ?')
                .bind(catId, household_id).run();
        return json({ ok: true });
      }
    }

    return json({ error: 'not found' }, 404);
  }
};