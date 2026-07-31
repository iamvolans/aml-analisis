// api/cron-screening.js — Corrida semanal automática de screening (T5b)
// ═══════════════════════════════════════════════════════════════════════════
// Lo dispara Vercel Cron según la configuración de vercel.json. Reutiliza el
// MISMO motor que la corrida manual (src/lib/screening.js): un solo algoritmo,
// para que lo que ve el analista y lo que hace el cron nunca diverjan.
//
// También se puede invocar a mano para probar:
//   curl -H "x-app-token: TU_APP_TOKEN" https://TU-APP.vercel.app/api/cron-screening
//
// Autorización: Vercel manda 'Authorization: Bearer $CRON_SECRET' si la variable
// CRON_SECRET está definida en el proyecto. Se acepta eso o el x-app-token.

import { correrScreening, hitsNuevos } from '../src/lib/screening.js';
import { nuevoCaso, refCaso } from '../src/lib/casos.js';
import { requireAuth } from './_auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_TOKEN    = process.env.APP_TOKEN || '123aml2026';
const CRON_SECRET  = process.env.CRON_SECRET || '';

// Solo las coincidencias de este nivel abren caso solas. Las MEDIA y BAJA
// quedan para revisión humana en la vista Screening.
const NIVEL_AUTO_CASO = 'ALTA';

async function sb(table, method = 'GET', body = null, qs = '') {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, opts);
  if (!r.ok) throw new Error(`Supabase ${table} ${method}: ${r.status} ${await r.text()}`);
  if (method === 'GET') return r.json();
  return null;
}

export default async function handler(req, res) {
  // El cron de Vercel manda Authorization: Bearer $CRON_SECRET. Para pruebas
  // manuales se acepta además una sesión de usuario válida, o el token
  // compartido mientras dure la transición.
  const auth = req.headers['authorization'] || '';
  let autorizado = !!(CRON_SECRET && auth === `Bearer ${CRON_SECRET}`);
  if (!autorizado) {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;  // requireAuth ya respondió 401
  }

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(503).json({ error: 'Supabase no configurado' });

  const inicio = Date.now();
  try {
    // ── Insumos ──────────────────────────────────────────────────────────────
    const [legajosRows, listasRows, descartesRows, runsRows, casosRows] = await Promise.all([
      sb('legajos', 'GET', null, '?select=data'),
      sb('screening_listas', 'GET', null, '?select=id,nombre,fuente,version,entradas'),
      sb('kv', 'GET', null, '?k=eq.screening_descartes&select=v'),
      sb('screening_runs', 'GET', null, '?select=id,data&order=fecha.desc&limit=1'),
      sb('casos', 'GET', null, '?select=id,data'),
    ]);

    const legajos   = (legajosRows || []).map(r => r.data).filter(Boolean);
    const listas    = listasRows || [];
    const descartes = descartesRows?.[0]?.v || {};
    const anterior  = runsRows?.[0]?.data || null;
    const casos     = (casosRows || []).map(r => r.data).filter(Boolean);

    if (!listas.length) {
      return res.json({ ok: false, motivo: 'Sin listados cargados — no se corrió el screening.' });
    }

    // ── Corrida ──────────────────────────────────────────────────────────────
    const run = correrScreening(legajos, listas, descartes, { soloActivos: true });
    run.ejecutadoPor = 'Sistema · cron semanal';
    run.automatica = true;

    await sb('screening_runs', 'POST', [{
      id: run.id, fecha: run.fecha, alcance: run.alcance,
      resumen: run.resumen, data: run
    }]);

    // ── Casos por coincidencias nuevas ───────────────────────────────────────
    // hitsNuevos devuelve vacío si no hay corrida previa: la primera vez se
    // revisa a mano en vez de abrir cientos de casos de una.
    const nuevos = hitsNuevos(run, anterior).filter(h => h.nivel === NIVEL_AUTO_CASO);

    const yaConCaso = new Set(casos.map(c => c.screeningKey).filter(Boolean));
    const aCrear = nuevos.filter(h => !yaConCaso.has(h.clave));

    let creados = 0;
    if (aCrear.length) {
      const filas = aCrear.map((h, i) => {
        const c = nuevoCaso({
          ref: refCaso(h.legajoNom, casos.length + i + 1),
          legajoId: h.legajoId,
          legajoNom: h.legajoNom,
          origen: 'SCREENING',
          prioridad: 'ALTA',
          titulo: 'Coincidencia nueva en lista: ' + h.sujeto,
          detalle:
            'Detectada por la corrida automática del ' + new Date(run.fecha).toLocaleDateString('es-AR') + '.\n\n' +
            'Sujeto evaluado: ' + h.sujeto + ' (' + h.rol + ')\n' +
            'Coincide con: ' + h.entradaNom + '\n' +
            'Lista: ' + h.lista + (h.listaVersion ? ' — ' + h.listaVersion : '') + '\n' +
            'Criterio: ' + h.criterio + ' · puntaje ' + h.score + ' · nivel ' + h.nivel +
            (h.entradaDetalle ? '\n\nDetalle de la entrada: ' + h.entradaDetalle : ''),
          screeningKey: h.clave,
        });
        c.historial[0].autor = 'Sistema · cron semanal';
        c.historial[0].nota = 'Caso abierto automáticamente por coincidencia nueva de screening';
        return {
          id: c.id, legajo_id: c.legajoId, ref: c.ref, estado: c.estado,
          prioridad: c.prioridad, origen: c.origen, analista: null,
          data: c, updated_at: new Date().toISOString()
        };
      });
      await sb('casos', 'POST', filas);
      creados = filas.length;
    }

    return res.json({
      ok: true,
      runId: run.id,
      fecha: run.fecha,
      legajosEvaluados: run.legajosEvaluados,
      listas: run.listas.map(l => ({ id: l.id, cantidad: l.cantidad, version: l.version })),
      resumen: run.resumen,
      primeraCorrida: !anterior,
      coincidenciasNuevas: nuevos.length,
      casosCreados: creados,
      duracionMs: Date.now() - inicio
    });

  } catch (e) {
    console.error('[cron-screening]', e);
    return res.status(500).json({ error: e.message });
  }
}
