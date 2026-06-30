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

    return json({ error: 'not found' }, 404);
  }
};