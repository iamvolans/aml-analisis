// ═══════════════════════════════════════════════════════════════════════════
// session.js — Sesión del usuario y cabeceras de autenticación (T8a)
// ═══════════════════════════════════════════════════════════════════════════
// Todas las llamadas a /api pasan por authHeaders(). Es async porque puede
// necesitar refrescar el access_token antes de devolverlo.
//
// Los JWT de Supabase vencen en ~1 hora. Sin refresco, una sesión de trabajo
// larga empezaría a fallar en silencio a mitad de camino, que es exactamente
// cuando peor viene.
//
// Ni el access_token ni el refresh_token se persisten: viven solo en memoria.
// Recargar la página obliga a loguearse de nuevo, que es el comportamiento que
// corresponde para una herramienta de compliance en una máquina compartida.

// Token compartido heredado. Sigue enviándose durante la transición, pero el
// servidor puede dejar de aceptarlo con ALLOW_APP_TOKEN=false en Vercel.
// ⚠️ Este valor se compila dentro del bundle del navegador: NO es un secreto.
var APP_TOKEN = '123aml2026';

var _access   = '';
var _refresh  = '';
var _expiraEn = 0;       // timestamp en ms
var _pendiente = null;   // promesa de refresco en curso (evita refrescos en paralelo)
var _onCaida  = null;    // callback cuando la sesión ya no se puede recuperar

// Margen antes del vencimiento real: se refresca un minuto antes para que
// ninguna request salga con un token que vence en el camino.
var MARGEN_MS = 60 * 1000;

function setSesion(s) {
  _access   = (s && s.token) || '';
  _refresh  = (s && s.refreshToken) || '';
  var seg   = (s && Number(s.expiresIn)) || 3600;
  _expiraEn = Date.now() + seg * 1000;
}

function limpiarSesion() {
  _access = ''; _refresh = ''; _expiraEn = 0; _pendiente = null;
}

function haySesion() { return !!_access; }

// Se registra desde App.jsx para poder mandar al login si el refresco falla
function onSesionCaida(cb) { _onCaida = cb; }

async function refrescar() {
  if (_pendiente) return _pendiente;          // varias requests a la vez → un solo refresco
  if (!_refresh) return null;
  _pendiente = fetch('/api/auth?action=refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
    body: JSON.stringify({ refresh_token: _refresh })
  }).then(async function(r){
    if (!r.ok) throw new Error('refresh ' + r.status);
    var d = await r.json();
    if (!d || !d.token) throw new Error('refresh sin token');
    setSesion({ token: d.token, refreshToken: d.refreshToken || _refresh, expiresIn: d.expiresIn });
    return d.token;
  }).catch(function(e){
    console.warn('[Sesión] No se pudo refrescar:', e.message);
    limpiarSesion();
    if (_onCaida) _onCaida();
    return null;
  }).finally(function(){ _pendiente = null; });
  return _pendiente;
}

async function getUserToken() {
  if (!_access) return '';
  if (Date.now() < _expiraEn - MARGEN_MS) return _access;
  var nuevo = await refrescar();
  return nuevo || _access;
}

// Cabeceras para cualquier llamada a /api. Aceptar un objeto extra evita
// repetir 'Content-Type' en cada call site.
async function authHeaders(extra) {
  var h = Object.assign({ 'x-app-token': APP_TOKEN }, extra || {});
  var t = await getUserToken();
  if (t) h['x-user-token'] = t;
  return h;
}

// Compatibilidad con el flujo anterior (solo access_token, sin refresco)
function setUserToken(t) { setSesion({ token: t, expiresIn: 3600 }); }

export { APP_TOKEN, setSesion, limpiarSesion, haySesion, onSesionCaida, getUserToken, authHeaders, setUserToken };
