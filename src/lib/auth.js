import { APP_TOKEN, _USER_TOKEN } from "./session";

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
// ── AUTH HELPERS ──────────────────────────────────────────────────────────────
async function serverLogin(email, password) {
  var r = await fetch('/api/auth?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
    body: JSON.stringify({ email: email, password: password })
  });
  return r.json();
}

async function serverGetUsuarios() {
  var r = await fetch('/api/auth?action=usuarios', { headers: { 'x-app-token': APP_TOKEN, 'x-user-token': _USER_TOKEN } });
  return r.json();
}

async function serverCrearUsuario(email, password, nombre, rol) {
  var r = await fetch('/api/auth?action=crear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN, 'x-user-token': _USER_TOKEN },
    body: JSON.stringify({ email: email, password: password, nombre: nombre, rol: rol })
  });
  return r.json();
}

async function serverCambiarPassword(userId, password) {
  var r = await fetch('/api/auth?action=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN, 'x-user-token': _USER_TOKEN },
    body: JSON.stringify({ userId: userId, password: password })
  });
  return r.json();
}

async function serverCambiarRol(userId, rol) {
  var r = await fetch('/api/auth?action=rol', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN, 'x-user-token': _USER_TOKEN },
    body: JSON.stringify({ userId: userId, rol: rol })
  });
  return r.json();
}

async function serverToggleActivo(userId, activo) {
  var r = await fetch('/api/auth?action=toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN, 'x-user-token': _USER_TOKEN },
    body: JSON.stringify({ userId: userId, activo: activo })
  });
  return r.json();
}

async function auditLog(usuario, accion, entidad, entidadId, detalle) {
  if (!usuario || !usuario.id) return;
  try {
    await fetch('/api/auth?action=audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN, 'x-user-token': _USER_TOKEN },
      body: JSON.stringify({
        usuario_id: usuario.id,
        usuario_nombre: usuario.nombre || usuario.email,
        accion: accion,
        entidad: entidad,
        entidad_id: entidadId,
        detalle: detalle || {}
      })
    });
  } catch(e) { /* silent */ }
}

// Helpers de permisos
function puedeEliminar(rol) { return rol === 'admin'; }

function puedeAprobar(rol) { return ['admin','oficial_cumplimiento','supervisor'].indexOf(rol) >= 0; }

function puedeGenerarInf07(rol) { return ['admin','oficial_cumplimiento','supervisor'].indexOf(rol) >= 0; }

function puedeGestionarUsuarios(rol) { return rol === 'admin'; }

function puedeEditar(rol) { return ['admin','oficial_cumplimiento','supervisor','analista'].indexOf(rol) >= 0; }

var ROL_LABELS = {
  admin: '🔑 Admin',
  oficial_cumplimiento: '⚖️ Oficial de Cumplimiento',
  supervisor: '👁 Supervisor',
  analista: '📋 Analista',
  readonly: '👀 Solo lectura'
};

export { serverLogin, serverGetUsuarios, serverCrearUsuario, serverCambiarPassword, serverCambiarRol, serverToggleActivo, auditLog, puedeEliminar, puedeAprobar, puedeGenerarInf07, puedeGestionarUsuarios, puedeEditar, ROL_LABELS };
