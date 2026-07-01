// protocol/worker.js — Cloudflare Worker: auth + route dispatch
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { routeSettings } from './routes/finance-settings.js';
import { routePeople }   from './routes/finance-people.js';
import { routeIncome }   from './routes/finance-income.js';
import { routeAccounts } from './routes/finance-accounts.js';
import { routeBudget }    from './routes/finance-budget.js';
import { routeStatements } from './routes/finance-statements.js';
// Phase 5: import { routeDashboard } from './routes/finance-dashboard.js';

const TEAM_DOMAIN = 'https://rough-band-262a.cloudflareaccess.com'\;
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Static assets
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // Health probe — no auth
    if (url.pathname === '/api/_probe') {
      return json({ hasDB: !!env.FINANCE_DB, bindings: Object.keys(env) });
    }

    const db = env.FINANCE_DB;
    const email = await identify(request);
    if (!email) return json({ error: 'unauthorised' }, 403);

    const membership = await db.prepare(
      'SELECT household_id, person_id, role FROM memberships WHERE user_email = ?'
    ).bind(email).first();
    if (!membership) return json({ error: 'no household' }, 403);

    const ctx = {
      db,
      email,
      household_id: membership.household_id,
      person_id:    membership.person_id,
      role:         membership.role,
      url,
      m: request.method,
      json,
    };

    for (const handler of [routeSettings, routePeople, routeIncome, routeAccounts, routeBudget, routeStatements]) {
      const res = await handler(request, ctx);
      if (res !== null) return res;
    }

    return json({ error: 'not found' }, 404);
  },
};
