// functions/api/_probe.js  → visit https://protocol.peterbrooksbank.com/api/_probe
export async function onRequest({ env }) {
  return new Response(JSON.stringify({
    hasDB: !!env.FINANCE_DB,
    bindings: Object.keys(env)
  }), { headers: { 'Content-Type': 'application/json' } });
}