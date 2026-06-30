// functions/api/finance/[[route]].js
import { jwtVerify, createRemoteJWKSet } from 'jose';

const TEAM_DOMAIN = 'https://rough-band-262a.cloudflareaccess.com'; // ← step 2
const AUD = 'cc34bd0e84f761afdcc352b50c82a4b02117f7a9d2ee998c1587dc2f606d652d';                        // ← step 2
const JWKS = createRemoteJWKSet(new URL(`${TEAM_DOMAIN}/cdn-cgi/access/certs`));

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function identify(request) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;                       // no Access in front = no entry
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: TEAM_DOMAIN, audience: AUD });
    return payload.email;
  } catch { return null; }
}

const scope = (db, email) =>
  db.prepare('SELECT household_id, person_id, role FROM memberships WHERE user_email = ?')
    .bind(email).first();                         // null = valid Google login, but not a member

const normalise = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
async function hash(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env, params }) {
  const db = env.FINANCE_DB;
  const route = '/' + (Array.isArray(params.route) ? params.route.join('/') : (params.route || ''));
  const method = request.method;

  const email = await identify(request);
  if (!email) return json({ error: 'unauthorised' }, 403);
  const ctx = await scope(db, email);
  if (!ctx) return json({ error: 'no household' }, 403);
  const { household_id } = ctx;

  // GET /accounts — assets + liabilities, each with its latest snapshot balance
  if (method === 'GET' && route === '/accounts') {
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

  // POST /snapshots — record a manual balance
  if (method === 'POST' && route === '/snapshots') {
    const b = await request.json();
    const owns = await db.prepare('SELECT 1 FROM accounts WHERE id = ? AND household_id = ?')
                         .bind(b.account_id, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);  // can't write to another household's account
    await db.prepare(`INSERT INTO snapshots (id, account_id, as_of_date, balance, contribution_since_last, note)
                      VALUES (?,?,?,?,?,?)`)
            .bind(crypto.randomUUID(), b.account_id, b.as_of_date, b.balance,
                  b.contribution_since_last ?? null, b.note ?? null).run();
    return json({ ok: true });
  }

  // POST /income-entries — a raise is just a new effective-dated row
  if (method === 'POST' && route === '/income-entries') {
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

  // POST /transactions/import — INSERT OR IGNORE on dedupe_hash makes re-imports safe
  if (method === 'POST' && route === '/transactions/import') {
    const { account_id, statement_id, rows } = await request.json();
    const owns = await db.prepare('SELECT 1 FROM accounts WHERE id = ? AND household_id = ?')
                         .bind(account_id, household_id).first();
    if (!owns) return json({ error: 'not found' }, 404);
    const stmts = [];
    for (const r of rows) {
      const dh = await hash(`${r.date}|${r.amount}|${normalise(r.description)}`);
      stmts.push(db.prepare(`INSERT OR IGNORE INTO transactions
        (id, household_id, account_id, date, description, amount, statement_id, dedupe_hash)
        VALUES (?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), household_id, account_id, r.date, r.description,
              r.amount, statement_id ?? null, dh));
    }
    const res = await db.batch(stmts);            // one round trip for the whole statement
    return json({ imported: res.length });
  }

  return json({ error: 'not found' }, 404);
}