// api/documentos.js — Adjuntos de legajo sobre Supabase Storage (T7b)
// ═══════════════════════════════════════════════════════════════════════════
// El navegador NUNCA ve la service key ni sube a través de esta función: el
// servidor firma una URL de subida de vida corta y el archivo va directo del
// navegador a Storage. Así no se toca el límite de body de la función y la
// credencial no sale del servidor.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
import { requireAuth } from './_auth.js';

const BUCKET       = 'documentos';

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

async function storage(path, method = 'POST', body = null) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1${path}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Storage ${method} ${path}: ${r.status} ${txt}`);
  try { return JSON.parse(txt); } catch(e) { return {}; }
}

// Nombre de archivo seguro para una ruta de Storage
function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'archivo';
}

export default async function handler(req, res) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;  // requireAuth ya respondió 401
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: 'Supabase no configurado' });
  }

  const action = req.query.action;

  try {
    // ── Listar documentos de un legajo ──────────────────────────────────────
    if (req.method === 'GET' && action === 'list') {
      const legajoId = req.query.legajoId;
      const qs = legajoId
        ? `?select=*&legajo_id=eq.${encodeURIComponent(legajoId)}&order=subido_at.desc`
        : '?select=*&order=subido_at.desc&limit=500';
      const rows = await sb('documentos', 'GET', null, qs);
      return res.json({ documentos: rows || [] });
    }

    const body = req.body || {};

    // ── URL firmada de subida ───────────────────────────────────────────────
    // Devuelve además la versión que le corresponde al documento: subir el
    // mismo tipo no pisa el anterior, lo versiona.
    if (req.method === 'POST' && action === 'upload_url') {
      const { legajoId, tipo, nombre } = body;
      if (!legajoId || !nombre) return res.status(400).json({ error: 'Faltan legajoId o nombre' });

      const previos = await sb('documentos', 'GET', null,
        `?select=version&legajo_id=eq.${encodeURIComponent(legajoId)}&tipo=eq.${encodeURIComponent(tipo || '')}&order=version.desc&limit=1`);
      const version = (previos && previos[0] ? previos[0].version : 0) + 1;

      const path = `${slug(legajoId)}/${slug(tipo || 'general')}/v${version}_${Date.now()}_${slug(nombre)}`;
      const firma = await storage(`/object/upload/sign/${BUCKET}/${path}`, 'POST', { expiresIn: 600 });

      return res.json({
        path,
        version,
        uploadUrl: `${SUPABASE_URL}/storage/v1${firma.url}`
      });
    }

    // ── Registrar el documento una vez subido ───────────────────────────────
    if (req.method === 'POST' && action === 'confirm') {
      const { doc } = body;
      if (!doc?.id || !doc?.legajo_id || !doc?.path) {
        return res.status(400).json({ error: 'Faltan campos del documento' });
      }
      // La versión nueva pasa a ser la vigente del tipo; las anteriores quedan
      // registradas pero marcadas como no vigentes. No se borra nada.
      if (doc.tipo) {
        await sb('documentos', 'PATCH', { vigente: false },
          `?legajo_id=eq.${encodeURIComponent(doc.legajo_id)}&tipo=eq.${encodeURIComponent(doc.tipo)}`);
      }
      await sb('documentos', 'POST', [Object.assign({ vigente: true, subido_at: new Date().toISOString() }, doc)]);
      return res.json({ ok: true });
    }

    // ── URL firmada de descarga ─────────────────────────────────────────────
    if (req.method === 'POST' && action === 'download_url') {
      const { path } = body;
      if (!path) return res.status(400).json({ error: 'Falta path' });
      const firma = await storage(`/object/sign/${BUCKET}/${path}`, 'POST', { expiresIn: 300 });
      return res.json({ url: `${SUPABASE_URL}/storage/v1${firma.signedURL}` });
    }

    // ── Eliminar ────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'delete') {
      const { id, path } = body;
      if (!id) return res.status(400).json({ error: 'Falta id' });
      if (path) {
        try { await storage(`/object/${BUCKET}/${path}`, 'DELETE'); } catch(e) { /* ya no estaba */ }
      }
      await sb('documentos', 'DELETE', null, `?id=eq.${encodeURIComponent(id)}`);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Método o acción no reconocida' });

  } catch (e) {
    console.error('[documentos]', e);
    return res.status(500).json({ error: e.message });
  }
}
