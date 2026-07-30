import { T } from "./theme.js";

function uid() { return Math.random().toString(36).slice(2,9); }

function todayStr() { return new Date().toLocaleDateString('es-AR'); }

function fmtM(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  var a = Math.abs(Number(v)), s = Number(v) < 0 ? '-' : '';
  if (a >= 1000000000) return s + '$' + (a/1000000000).toFixed(1) + 'B';
  if (a >= 1000000) return s + '$' + (a/1000000).toFixed(1) + 'M';
  if (a >= 1000) return s + '$' + (a/1000).toFixed(0) + 'K';
  return s + '$' + a.toLocaleString('es-AR');
}

function safeArr(v) { return Array.isArray(v) ? v : []; }

function segColor(s) { return s==='BAJO' ? T.GREEN : s==='MEDIO' ? T.AMBER : s==='MEDIO-ALTO' ? '#FF8C00' : T.RED; }

function sevColor(s) { return (s==='ALTA'||s==='CRITICA') ? T.RED : s==='MEDIA' ? '#FF8C00' : T.AMBER; }

function fileToBase64(file) {
  return new Promise(function(res, rej) {
    var r = new FileReader();
    r.onload = function() { res(r.result.split(',')[1]); };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── SLEEP HELPER ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

// Convierte base64 a Blob para subir como FormData
function base64ToBlob(base64, mimeType) {
  var byteChars = atob(base64);
  var byteArrays = [];
  for (var offset = 0; offset < byteChars.length; offset += 512) {
    var slice = byteChars.slice(offset, offset + 512);
    var byteNums = new Array(slice.length);
    for (var i = 0; i < slice.length; i++) byteNums[i] = slice.charCodeAt(i);
    byteArrays.push(new Uint8Array(byteNums));
  }
  return new Blob(byteArrays, { type: mimeType });
}

// ─── PARSER COMPARTIDO ────────────────────────────────────────────────────────
function parseJsonFromResponse(raw) {
  var jsonStart = raw.indexOf('{');
  var jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    console.error('[Rebit IA] No se encontró JSON en la respuesta:', raw);
    throw new Error('La IA no devolvió un JSON válido. Respuesta: ' + raw.slice(0, 200));
  }
  var jsonStr = raw.slice(jsonStart, jsonEnd + 1);
  try {
    var parsed = JSON.parse(jsonStr);
    console.log('[Rebit IA] Datos extraídos:', JSON.stringify(parsed, null, 2));
    return parsed;
  } catch(parseErr) {
    console.error('[Rebit IA] Error parsing JSON:', parseErr, jsonStr.slice(0, 300));
    throw new Error('Error al parsear la respuesta: ' + parseErr.message);
  }
}

function parseFechaAR(str) {
  if (!str) return null;
  var p = str.split('/');
  return p.length===3 ? new Date(p[2],p[1]-1,p[0]) : null;
}

export { uid, todayStr, fmtM, safeArr, segColor, sevColor, fileToBase64, sleep, base64ToBlob, parseJsonFromResponse, parseFechaAR };
