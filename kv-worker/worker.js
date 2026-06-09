/**
 * Daily Protocol — Cloudflare Worker
 * KV namespace: PROTOCOL_KV
 * Routes:
 *   GET  /state?id=<device-id>  → returns state JSON
 *   POST /state?id=<device-id>  → saves state JSON, returns { ok: true }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // Sanitise key — alphanumeric, hyphens only
    const key = 'state:' + id.replace(/[^a-zA-Z0-9\-]/g, '').slice(0, 64);

    if (url.pathname === '/state') {
      if (request.method === 'GET') {
        const value = await env.PROTOCOL_KV.get(key);
        const data = value ? JSON.parse(value) : null;
        return new Response(JSON.stringify(data), {
          headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }

      if (request.method === 'POST') {
        const body = await request.json();
        // Store for 90 days
        await env.PROTOCOL_KV.put(key, JSON.stringify(body), { expirationTtl: 60 * 60 * 24 * 90 });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404, headers: CORS });
  }
};