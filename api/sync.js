// api/sync.js — Backend Supabase para Rebit AML Tool
// Soporta payloads comprimidos con gzip (x-encoding: gzip-json)

import { gunzipSync } from 'zlib';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_TOKEN   = process.env.APP_TOKEN || '123aml2026';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  if (req.method === 'GET' || req.method === 'DELETE') return null;
  const raw = await getRawBody(req);
  if (!raw.length) return null;
  const enc = req.headers['x-encoding'];
  const buf = enc === 'gzip-json' ? gunzipSync(raw) : raw;
  return JSON.parse(buf.toString('utf8'));
}

// ── Helper Supabase REST ──────────────────────────────────────────────────────
async function sb(table, method = 'GET', body = null, qs = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${qs}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };
  const opts = { method, headers };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 204 || method === 'DELETE') return null;
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const err = ct.includes('json') ? await res.json() : await res.text();
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  return ct.includes('json') ? res.json() : null;
}

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token, x-encoding');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers['x-app-token'] !== APP_TOKEN)
    return res.status(401).json({ error: 'No autorizado' });

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(503).json({ error: 'Supabase no configurado. Agregá SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel.' });

  const action = new URL(req.url, 'http://localhost').searchParams.get('action');

  try {
    // ── GET legajos + periodos ──────────────────────────────────────────────
    if (req.method === 'GET' && !action) {
      const [legajos, periodos] = await Promise.all([
        sb('legajos', 'GET', null, '?select=*&order=created_at.asc'),
        sb('periodos', 'GET', null, '?select=id,legajo_id,nombre,estado,metrics,signals,scoring,created_at,updated_at&order=created_at.asc')
      ]);
      return res.json({
        legajos: (legajos||[]).map(r => ({ ...r.data, id: r.id, createdAt: r.created_at, updatedAt: r.updated_at })),
        periodos: (periodos||[]).map(r => ({ ...r.data, id: r.id, legajoId: r.legajo_id, nombre: r.nombre, estado: r.estado, metrics: r.metrics, signals: r.signals, scoring: r.scoring, createdAt: r.created_at }))
      });
    }

    // ── GET txns ───────────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'txns') {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'Falta id' });
      const rows = await sb('txns', 'GET', null, `?periodo_id=eq.${id}&select=txns`);
      return res.json({ txns: rows?.[0]?.txns || null });
    }

    // ── GET kv ─────────────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'kv') {
      const k = new URL(req.url, 'http://localhost').searchParams.get('k');
      if (!k) return res.status(400).json({ error: 'Falta k' });
      const rows = await sb('kv_store', 'GET', null, `?k=eq.${encodeURIComponent(k)}&select=v`);
      return res.json({ v: rows?.[0]?.v ?? null });
    }

    // ── Parsear body (con soporte gzip) ────────────────────────────────────
    let body;
    try {
      body = await parseBody(req);
    } catch(e) {
      return res.status(400).json({ error: 'Error al parsear body: ' + e.message });
    }

    // ── POST legajos + periodos ────────────────────────────────────────────
    if (req.method === 'POST' && !action) {
      const { legajos = [], periodos = [], deletedLegajoIds = [], deletedPeriodoIds = [] } = body || {};
      await Promise.all([
        ...deletedLegajoIds.map(id => sb('legajos', 'DELETE', null, `?id=eq.${id}`)),
        ...deletedPeriodoIds.map(id => sb('periodos', 'DELETE', null, `?id=eq.${id}`)),
      ]);
      if (legajos.length) {
        const rows = legajos.map(l => ({ id: l.id, data: { ...l, id: undefined }, created_at: l.createdAt, updated_at: new Date().toISOString() }));
        await sb('legajos', 'POST', rows);
      }
      if (periodos.length) {
        const rows = periodos.map(p => ({ id: p.id, legajo_id: p.legajoId, nombre: p.nombre, estado: p.estado||'EN_REVISION', metrics: p.metrics||null, signals: p.signals||null, scoring: p.scoring||null, data: { ...p, id: undefined, legajoId: undefined }, created_at: p.createdAt, updated_at: new Date().toISOString() }));
        await sb('periodos', 'POST', rows);
      }
      return res.json({ ok: true });
    }

    // ── POST txns ──────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'txns') {
      const { periodo_id, txns } = body || {};
      if (!periodo_id) return res.status(400).json({ error: 'Falta periodo_id' });
      await sb('txns', 'POST', [{ periodo_id, txns: txns || [], updated_at: new Date().toISOString() }]);
      return res.json({ ok: true });
    }

    // ── POST kv ────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'kv') {
      const { k, v } = body || {};
      if (!k) return res.status(400).json({ error: 'Falta k' });
      await sb('kv_store', 'POST', [{ k, v, updated_at: new Date().toISOString() }]);
      return res.json({ ok: true });
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (req.method === 'DELETE' && action === 'txns') {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id');
      if (id) await sb('txns', 'DELETE', null, `?periodo_id=eq.${id}`);
      return res.json({ ok: true });
    }

    return res.status(404).json({ error: 'Ruta no encontrada' });

  } catch(e) {
    console.error('[sync] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
