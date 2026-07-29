import { r2 } from "./reports";
import { APP_TOKEN } from "./session";

async function gzipPayload(obj) {
  var json = JSON.stringify(obj);
  try {
    var stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    var buf = await new Response(stream).arrayBuffer();
    return { body: buf, headers: { 'Content-Type': 'application/octet-stream', 'x-encoding': 'gzip-json', 'x-app-token': APP_TOKEN } };
  } catch(e) {
    return { body: json, headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN } };
  }
}

// Helper: fetch con retry automático (para 502/503/504/522)
async function fetchRetry(url, opts, maxRetries) {
  maxRetries = maxRetries || 3;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      var r = await fetch(url, opts);
      if (r.ok) return r;
      // Reintentar solo en errores de servidor transitorios
      if (r.status >= 500 && attempt < maxRetries) {
        var wait = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s, 8s
        console.warn('[Sync] HTTP ' + r.status + ' — reintentando en ' + (wait/1000) + 's (' + (attempt+1) + '/' + maxRetries + ')');
        await new Promise(function(res){ setTimeout(res, wait); });
        continue;
      }
      // Error no recuperable o último intento
      var errText = '';
      try { var ct = r.headers.get('content-type')||''; errText = ct.includes('json') ? (await r.json()).error||'' : 'HTTP '+r.status; } catch(e2) { errText = 'HTTP '+r.status; }
      return { ok: false, status: r.status, _error: errText, json: function(){ return Promise.resolve({error: errText}); } };
    } catch(e) {
      if (attempt < maxRetries) {
        var w = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn('[Sync] Red caída — reintentando en ' + (w/1000) + 's (' + (attempt+1) + '/' + maxRetries + ')');
        await new Promise(function(res){ setTimeout(res, w); });
      } else { throw e; }
    }
  }
}

async function serverSave(data) {
  try {
    // Stripear txns de períodos (se guardan por separado)
    var persClean = (data.periodos||[]).map(function(p){
      var c = Object.assign({}, p);
      delete c.txns;
      return c;
    });

    // Stripear campos pesados de legajos (docsIA contiene respuestas completas de Claude)
    var legsClean = (data.legajos||[]).map(function(l){
      var c = Object.assign({}, l);
      // Mantener solo metadata de docsIA, no el contenido completo
      if (c.docsIA && c.docsIA.length > 0) {
        c.docsIA = c.docsIA.map(function(d){
          if (typeof d === 'string') return d; // Ya es solo nombre
          return { name: d.name||d, type: d.type, size: d.size, processedAt: d.processedAt, fieldsFound: d.fieldsFound };
        });
      }
      // Stripear campos pesados del screening y adverse media (guardar solo resultado, no prompts/raw)
      if (c.screening && c.screening._raw) delete c.screening._raw;
      if (c.adverseMedia && c.adverseMedia._raw) delete c.adverseMedia._raw;
      // Limitar observaciones a 50 caracteres cada una para no inflar el payload
      if (c.observaciones && c.observaciones.length > 20) {
        c.observaciones = c.observaciones.slice(-20); // solo las últimas 20
      }
      return c;
    });

    var delLegs = data.deletedLegajoIds || [];
    var delPers = data.deletedPeriodoIds || [];

    // Enviar en chunks para no superar 4.5MB de Vercel
    var CHUNK_LEGS = 5;
    var CHUNK_PERS = 8;
    var allOk = true;

    // Deletions primero (payload chico)
    if (delLegs.length || delPers.length) {
      var gz0 = await gzipPayload({ legajos:[], periodos:[], deletedLegajoIds:delLegs, deletedPeriodoIds:delPers });
      var r0 = await fetchRetry('/api/sync', { method:'POST', headers:gz0.headers, body:gz0.body });
      if (!r0.ok) { console.warn('[Sync] Error borrando:', r0._error); allOk = false; }
    }

    // Legajos en chunks de 5
    for (var li = 0; li < legsClean.length; li += CHUNK_LEGS) {
      var chunk = legsClean.slice(li, li + CHUNK_LEGS);
      var gz1 = await gzipPayload({ legajos: chunk, periodos: [], deletedLegajoIds: [], deletedPeriodoIds: [] });
      var r1 = await fetchRetry('/api/sync', { method:'POST', headers:gz1.headers, body:gz1.body });
      if (!r1.ok) { console.warn('[Sync] Error legs chunk', li, r1._error); allOk = false; }
    }

    // Periodos en chunks de 8
    for (var pi = 0; pi < persClean.length; pi += CHUNK_PERS) {
      var chunk2 = persClean.slice(pi, pi + CHUNK_PERS);
      var gz2 = await gzipPayload({ legajos: [], periodos: chunk2, deletedLegajoIds: [], deletedPeriodoIds: [] });
      var r2 = await fetchRetry('/api/sync', { method:'POST', headers:gz2.headers, body:gz2.body });
      if (!r2.ok) { console.warn('[Sync] Error pers chunk', pi, r2._error); allOk = false; }
    }

    if (!allOk) console.warn('[Sync] Sync parcial — algunos chunks fallaron');
    return allOk;
  } catch(e) { console.warn('[Sync] Error guardando:', e.message); return false; }
}

async function serverSaveTxns(periodoId, txns) {
  try {
    var gz = await gzipPayload({ periodo_id: periodoId, txns: txns });
    var r = await fetchRetry('/api/sync?action=txns', { method: 'POST', headers: gz.headers, body: gz.body });
    if (!r.ok) {
      throw new Error(r._error || 'HTTP ' + r.status);
    }
    console.log('[Sync] Txns guardadas OK — período:', periodoId, '— cantidad:', (txns||[]).length);
    return true;
  } catch(e) {
    console.error('[Sync] Error guardando txns:', e.message);
    throw e;
  }
}

async function serverLoadTxns(periodoId) {
  try {
    var r = await fetchRetry('/api/sync?action=txns&id=' + periodoId,
      { headers: { 'x-app-token': APP_TOKEN } }, 2);
    if (!r.ok) {
      console.error('[Sync] Error cargando txns:', r._error || r.status, '— período:', periodoId);
      return null;
    }
    var res = await r.json();
    var txns = res.txns || null;
    if (txns) {
      console.log('[Sync] Txns cargadas OK — período:', periodoId, '— cantidad:', txns.length);
    } else {
      console.warn('[Sync] Sin txns en Supabase para período:', periodoId);
    }
    return txns;
  } catch(e) {
    console.error('[Sync] Error cargando txns:', e.message, '— período:', periodoId);
    return null;
  }
}

async function serverSaveKV(k, v) {
  try {
    await fetch('/api/sync?action=kv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
      body: JSON.stringify({ k: k, v: v })
    });
  } catch(e) { console.warn('[Sync] Error guardando KV:', e.message); }
}

async function serverLoadKV(k) {
  try {
    var r = await fetch('/api/sync?action=kv&k=' + encodeURIComponent(k), {
      headers: { 'x-app-token': APP_TOKEN }
    });
    if (!r.ok) return null;
    var d = await r.json();
    return (d && d.v !== undefined) ? d.v : null;
  } catch(e) { return null; }
}

// Trae todos los KV cuya clave empieza con un prefijo (ej: 'rfi_') en UNA sola
// query — usado por Dashboard y Alertas para agregar RFIs de todos los legajos.
async function serverLoadKVPrefix(prefix) {
  try {
    var r = await fetchRetry('/api/sync?action=kv_prefix&p=' + encodeURIComponent(prefix),
      { headers: { 'x-app-token': APP_TOKEN } }, 2);
    if (!r.ok) return [];
    var d = await r.json();
    return (d && d.items) || [];
  } catch(e) { return []; }
}

async function serverLoad() {
  try {
    var r = await fetchRetry('/api/sync', { headers: { 'x-app-token': APP_TOKEN } }, 3);
    if (!r.ok) return null;
    var data = await r.json();
    if (!data || data.error) return null;
    var periodos = (data.periodos||[]).map(function(p){
      return Object.assign({}, p, { txns: [] });
    });
    return { legajos: data.legajos || [], periodos: periodos };
  } catch(e) { console.warn('[Sync] Error cargando:', e.message); return null; }
}

async function fetchServerConfig() {
  try {
    var r = await fetch('/api/config', { headers: { 'x-app-token': APP_TOKEN } });
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

export { gzipPayload, fetchRetry, serverSave, serverSaveTxns, serverLoadTxns, serverSaveKV, serverLoadKV, serverLoadKVPrefix, serverLoad, fetchServerConfig };
