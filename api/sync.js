// api/sync.js — Backend Supabase para Rebit AML Tool
// Reemplaza JSONBin con PostgreSQL serverless — sin límite de tamaño, sin last-write-wins

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_TOKEN   = process.env.APP_TOKEN || '123aml2026';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers['x-app-token'] !== APP_TOKEN)
    return res.status(401).json({ error: 'No autorizado' });

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(503).json({ error: 'Supabase no configurado. Agregá SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel.' });

  const action = req.query.action;

  try {

    // ── GET /api/sync — carga inicial (legajos + metadatos de períodos) ───────
    if (req.method === 'GET' && !action) {
      const [legajosRows, periodosRows] = await Promise.all([
        sb('legajos',  'GET', null, '?select=data&order=updated_at.desc'),
        sb('periodos', 'GET', null, '?select=id,legajo_id,nombre,created_at_str,data&order=created_at_str.asc')
      ]);
      return res.json({
        legajos: (legajosRows  || []).map(r => r.data),
        periodos: (periodosRows || []).map(r => ({
          id:             r.id,
          legajoId:       r.legajo_id,
          nombre:         r.nombre,
          createdAt:      r.created_at_str,
          txns:           [],   // lazy loaded
          estadoPeriodo:  r.data?.estadoPeriodo  || 'EN_REVISION',
          metricas:       r.data?.metricas       || null,
          scoring:        r.data?.scoring        || null,
          sigsResolucion: r.data?.sigsResolucion || {}
        }))
      });
    }

    // ── GET /api/sync?action=txns&id=XXX — carga txns de un período ──────────
    if (req.method === 'GET' && action === 'txns') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Falta id' });
      const rows = await sb('periodos_txns', 'GET', null, `?periodo_id=eq.${id}&select=txns`);
      return res.json({ txns: rows?.[0]?.txns || [] });
    }

    // ── GET /api/sync?action=kv&k=XXX — carga memos / RFIs ──────────────────
    if (req.method === 'GET' && action === 'kv') {
      const { k } = req.query;
      if (!k) return res.status(400).json({ error: 'Falta k' });
      const rows = await sb('kv', 'GET', null, `?k=eq.${encodeURIComponent(k)}&select=v`);
      return res.json({ v: rows?.[0]?.v ?? null });
    }

    // ── POST /api/sync — guarda legajos + metadatos de períodos ─────────────
    if (req.method === 'POST' && !action) {
      const { legajos, periodos, deletedLegajoIds, deletedPeriodoIds } = req.body || {};
      const now = new Date().toISOString();
      const ops = [];

      if (legajos?.length) {
        const rows = legajos.map(l => ({ id: l.id, data: l, updated_at: now }));
        ops.push(sb('legajos', 'POST', rows));
      }

      if (periodos?.length) {
        // Guardar metadata + datos pre-computados (sin txns)
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

      // Borrar legajos eliminados (cascade elimina también sus períodos y txns)
      if (deletedLegajoIds?.length) {
        for (const id of deletedLegajoIds) {
          ops.push(
            sb('legajos', 'DELETE', null, `?id=eq.${id}`).then(() =>
            sb('periodos', 'DELETE', null, `?legajo_id=eq.${id}`))
          );
        }
      }

      // Borrar períodos eliminados
      if (deletedPeriodoIds?.length) {
        for (const id of deletedPeriodoIds) {
          ops.push(sb('periodos_txns', 'DELETE', null, `?periodo_id=eq.${id}`));
          ops.push(sb('periodos',      'DELETE', null, `?id=eq.${id}`));
        }
      }

      await Promise.all(ops);
      return res.json({ ok: true });
    }

    // ── POST /api/sync?action=txns — guarda txns de un período ───────────────
    if (req.method === 'POST' && action === 'txns') {
      const { periodo_id, txns } = req.body || {};
      if (!periodo_id) return res.status(400).json({ error: 'Falta periodo_id' });
      await sb('periodos_txns', 'POST', [{ periodo_id, txns: txns || [] }]);
      return res.json({ ok: true });
    }

    // ── POST /api/sync?action=kv — guarda memos / RFIs ───────────────────────
    if (req.method === 'POST' && action === 'kv') {
      const { k, v } = req.body || {};
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
