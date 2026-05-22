// api/sync.js — Backend Supabase para Rebit AML Tool
// v2 — agrega soporte gzip (x-encoding: gzip-json) para superar límite 4.5MB Vercel

import { gunzipSync } from 'zlib';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_TOKEN   = process.env.APP_TOKEN || '123aml2026';

// ── Leer body con soporte gzip ───────────────────────────────────────────────
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
  if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'OPTIONS') return null;
  const raw = await getRawBody(req);
  if (!raw || !raw.length) return {};
  const enc = req.headers['x-encoding'];
  const buf = enc === 'gzip-json' ? gunzipSync(raw) : raw;
  return JSON.parse(buf.toString('utf8'));
}

// ── Helper Supabase REST ─────────────────────────────────────────────────────
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

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token, x-encoding');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers['x-app-token'] !== APP_TOKEN)
    return res.status(401).json({ error: 'No autorizado' });

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(503).json({ error: 'Supabase no configurado. Agregá SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel.' });

  // req.query no existe con bodyParser:false — parsear URL manualmente
  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action');
  const qId    = url.searchParams.get('id');
  const qK     = url.searchParams.get('k');

  try {

    // ── GET /api/sync — carga inicial (legajos + metadatos de períodos) ───────
    if (req.method === 'GET' && !action) {
      const [legajosRows, periodosRows] = await Promise.all([
        sb('legajos',  'GET', null, '?select=data&order=updated_at.desc'),
        sb('periodos', 'GET', null, '?select=id,legajo_id,nombre,created_at_str,data&order=created_at_str.asc')
      ]);
      return res.json({
        legajos:  (legajosRows  || []).map(r => r.data),
        periodos: (periodosRows || []).map(r => ({
          id:             r.id,
          legajoId:       r.legajo_id,
          nombre:         r.nombre,
          createdAt:      r.created_at_str,
          txns:           [],
          estadoPeriodo:  r.data?.estadoPeriodo  || 'EN_REVISION',
          metricas:       r.data?.metricas       || null,
          scoring:        r.data?.scoring        || null,
          sigsResolucion: r.data?.sigsResolucion || {}
        }))
      });
    }

    // ── GET /api/sync?action=txns&id=XXX ─────────────────────────────────────
    if (req.method === 'GET' && action === 'txns') {
      if (!qId) return res.status(400).json({ error: 'Falta id' });
      const rows = await sb('periodos_txns', 'GET', null, `?periodo_id=eq.${qId}&select=txns`);
      return res.json({ txns: rows?.[0]?.txns || [] });
    }

    // ── GET /api/sync?action=kv&k=XXX ────────────────────────────────────────
    if (req.method === 'GET' && action === 'kv') {
      if (!qK) return res.status(400).json({ error: 'Falta k' });
      const rows = await sb('kv', 'GET', null, `?k=eq.${encodeURIComponent(qK)}&select=v`);
      return res.json({ v: rows?.[0]?.v ?? null });
    }

    // ── Parsear body (con soporte gzip) ───────────────────────────────────────
    let body;
    try {
      body = await parseBody(req);
    } catch(e) {
      return res.status(400).json({ error: 'Error al parsear body: ' + e.message });
    }

    // ── POST /api/sync — guarda legajos + metadatos de períodos ──────────────
    if (req.method === 'POST' && !action) {
      const { legajos, periodos, deletedLegajoIds, deletedPeriodoIds } = body || {};
      const now = new Date().toISOString();
      const ops = [];

      if (legajos?.length) {
        const rows = legajos.map(l => ({ id: l.id, data: l, updated_at: now }));
        ops.push(sb('legajos', 'POST', rows));
      }

      if (periodos?.length) {
        const rows = periodos.map(p => ({
          id:             p.id,
          legajo_id:      p.legajoId,
          nombre:         p.nombre || '',
          created_at_str: p.createdAt || '',
          updated_at:     now,
          data: {
            estadoPeriodo:  p.estadoPeriodo  || 'EN_REVISION',
            metricas:       p.metricas       || null,
            scoring:        p.scoring        || null,
            sigsResolucion: p.sigsResolucion || {}
          }
        }));
        ops.push(sb('periodos', 'POST', rows));
      }

      if (deletedLegajoIds?.length) {
        for (const id of deletedLegajoIds) {
          ops.push(
            sb('legajos', 'DELETE', null, `?id=eq.${id}`).then(() =>
            sb('periodos', 'DELETE', null, `?legajo_id=eq.${id}`))
          );
        }
      }

      if (deletedPeriodoIds?.length) {
        for (const id of deletedPeriodoIds) {
          ops.push(sb('periodos_txns', 'DELETE', null, `?periodo_id=eq.${id}`));
          ops.push(sb('periodos',      'DELETE', null, `?id=eq.${id}`));
        }
      }

      await Promise.all(ops);
      return res.json({ ok: true });
    }

    // ── POST /api/sync?action=txns ────────────────────────────────────────────
    if (req.method === 'POST' && action === 'txns') {
      const { periodo_id, txns } = body || {};
      if (!periodo_id) return res.status(400).json({ error: 'Falta periodo_id' });
      await sb('periodos_txns', 'POST', [{ periodo_id, txns: txns || [] }]);
      return res.json({ ok: true });
    }

    // ── POST /api/sync?action=kv ──────────────────────────────────────────────
    if (req.method === 'POST' && action === 'kv') {
      const { k, v } = body || {};
      if (!k) return res.status(400).json({ error: 'Falta k' });
      await sb('kv', 'POST', [{ k, v, updated_at: new Date().toISOString() }]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Método o acción no reconocida' });

  } catch (e) {
    console.error('[Sync] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
