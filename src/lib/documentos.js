// ═══════════════════════════════════════════════════════════════════════════
// documentos.js — Cliente de adjuntos por legajo (T7b)
// ═══════════════════════════════════════════════════════════════════════════
// El archivo va del navegador directo a Supabase Storage usando una URL firmada
// que emite el servidor. Ni la service key ni el archivo pasan por la función
// serverless, así que no aplica su límite de tamaño de body.

import { authHeaders } from "./session.js";
import { uid } from "./utils.js";

// Tope de tamaño por archivo. Storage aguanta más, pero un legajo con adjuntos
// de 100 MB es inmanejable para cualquiera que después tenga que revisarlo.
var MAX_MB = 25;

async function headers() {
  return await authHeaders({ 'Content-Type': 'application/json' });
}

async function listarDocumentos(legajoId) {
  try {
    var url = '/api/documentos?action=list' + (legajoId ? '&legajoId=' + encodeURIComponent(legajoId) : '');
    var r = await fetch(url, { headers: await authHeaders() });
    if (!r.ok) return [];
    var d = await r.json();
    return (d && d.documentos) || [];
  } catch(e) { console.warn('[Docs] listar:', e.message); return []; }
}

// Sube y registra. Devuelve el documento creado o lanza con un mensaje legible.
async function subirDocumento(opts) {
  var file = opts.file;
  if (!file) throw new Error('No se seleccionó ningún archivo.');
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error('El archivo pesa ' + (file.size/1048576).toFixed(1) + ' MB. El máximo es ' + MAX_MB + ' MB.');
  }

  // 1. Pedir la URL firmada
  var r1 = await fetch('/api/documentos?action=upload_url', {
    method: 'POST', headers: await headers(),
    body: JSON.stringify({ legajoId: opts.legajoId, tipo: opts.tipo || '', nombre: file.name })
  });
  if (!r1.ok) throw new Error('No se pudo preparar la subida: ' + (await r1.text()));
  var firma = await r1.json();

  // 2. Subir el archivo directo a Storage
  var r2 = await fetch(firma.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  });
  if (!r2.ok) throw new Error('Falló la subida a Storage: ' + r2.status + ' ' + (await r2.text()));

  // 3. Registrar los metadatos
  var doc = {
    id: uid(),
    legajo_id: opts.legajoId,
    tipo: opts.tipo || '',
    nombre: file.name,
    path: firma.path,
    mime: file.type || '',
    tamano: file.size,
    fecha_doc: opts.fechaDoc || '',
    version: firma.version,
    subido_por: opts.usuario || 'N/D',
    notas: opts.notas || '',
  };
  var r3 = await fetch('/api/documentos?action=confirm', {
    method: 'POST', headers: await headers(), body: JSON.stringify({ doc: doc })
  });
  if (!r3.ok) throw new Error('El archivo se subió pero no se pudo registrar: ' + (await r3.text()));
  return doc;
}

async function urlDescarga(path) {
  var r = await fetch('/api/documentos?action=download_url', {
    method: 'POST', headers: await headers(), body: JSON.stringify({ path: path })
  });
  if (!r.ok) throw new Error('No se pudo generar el enlace de descarga.');
  var d = await r.json();
  return d.url;
}

async function borrarDocumento(id, path) {
  var r = await fetch('/api/documentos?action=delete', {
    method: 'POST', headers: await headers(), body: JSON.stringify({ id: id, path: path })
  });
  return r.ok;
}

function fmtTamano(bytes) {
  var b = Number(bytes) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(0) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

export { MAX_MB, listarDocumentos, subirDocumento, urlDescarga, borrarDocumento, fmtTamano };
