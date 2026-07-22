// api/auth.js — Autenticación y gestión de usuarios con Supabase Auth
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_TOKEN    = process.env.APP_TOKEN || '123aml2026';

async function sb(path, method = 'GET', body = null) {
  const url = path.startsWith('http') ? path : `${SUPABASE_URL}${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };
  const opts = { method, headers };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = ct.includes('json') ? await res.json() : await res.text();
    throw new Error(
      typeof err === 'object'
        ? (err.error_description || err.msg || err.message || JSON.stringify(err))
        : err
    );
  }
  return ct.includes('json') ? res.json() : null;
}

// ── RBAC SERVER-SIDE ─────────────────────────────────────────────────────────
// El cliente envía el access_token de Supabase Auth en el header x-user-token.
// Se valida contra /auth/v1/user y el rol se lee SIEMPRE de la tabla `perfiles`
// (nunca del body del request). El x-app-token compartido deja de ser suficiente
// para acciones privilegiadas.
async function getAuthUser(req) {
  const userToken = req.headers['x-user-token'];
  if (!userToken) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${userToken}` }
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u || !u.id) return null;
    const perfiles = await sb(`/rest/v1/perfiles?id=eq.${u.id}&select=*`);
    const perfil = perfiles?.[0];
    if (!perfil || !perfil.activo) return null;
    return { id: u.id, email: perfil.email, nombre: perfil.nombre, rol: perfil.rol };
  } catch (e) {
    return null;
  }
}

function esAdmin(u) { return !!u && u.rol === 'admin'; }
function puedeVerAudit(u) { return !!u && ['admin', 'oficial_cumplimiento', 'supervisor'].indexOf(u.rol) >= 0; }

const ERR_SESION = 'Sesión inválida o expirada. Volvé a ingresar al sistema.';
const ERR_PERMISO = 'No tenés permisos para esta acción.';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers['x-app-token'] !== APP_TOKEN)
    return res.status(401).json({ error: 'No autorizado' });
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(503).json({ error: 'Supabase no configurado' });

  const action = req.query.action;

  try {
    // ── LOGIN ────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'login') {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

      const authRes = await sb(
        `/auth/v1/token?grant_type=password`,
        'POST',
        { email, password }
      );

      const userId = authRes.user?.id;
      if (!userId) throw new Error('No se pudo autenticar');

      // Obtener perfil
      const perfiles = await sb(`/rest/v1/perfiles?id=eq.${userId}&select=*`);
      const perfil = perfiles?.[0];
      if (!perfil) throw new Error('Perfil no encontrado. Contactá al administrador.');
      if (!perfil.activo) throw new Error('Usuario desactivado. Contactá al administrador.');

      return res.json({
        ok: true,
        token: authRes.access_token || null, // JWT de Supabase Auth — habilita acciones con RBAC
        usuario: {
          id:     userId,
          email:  perfil.email,
          nombre: perfil.nombre,
          rol:    perfil.rol
        }
      });
    }

    // ── LISTAR AUDIT LOG (admin / oficial de cumplimiento / supervisor) ──────
    if (req.method === 'GET' && action === 'audit_log') {
      const authU = await getAuthUser(req);
      if (!authU) return res.status(401).json({ error: ERR_SESION });
      if (!puedeVerAudit(authU)) return res.status(403).json({ error: ERR_PERMISO });
      const { entidad_id, limit } = req.query;
      var qs = '/rest/v1/audit_log?select=*&order=created_at.desc&limit=' + (limit||50);
      if (entidad_id) qs += '&entidad_id=eq.' + entidad_id;
      const logs = await sb(qs);
      return res.json({ logs: logs || [] });
    }

    // ── LISTAR USUARIOS (solo admin) ─────────────────────────────────────────
    if (req.method === 'GET' && action === 'usuarios') {
      const authU = await getAuthUser(req);
      if (!authU) return res.status(401).json({ error: ERR_SESION });
      if (!esAdmin(authU)) return res.status(403).json({ error: ERR_PERMISO });
      const perfiles = await sb(
        '/rest/v1/perfiles?select=id,email,nombre,rol,activo,created_at&order=created_at.asc'
      );
      return res.json({ usuarios: perfiles || [] });
    }

    // ── CREAR USUARIO (solo admin) ───────────────────────────────────────────
    if (req.method === 'POST' && action === 'crear') {
      const authU = await getAuthUser(req);
      if (!authU) return res.status(401).json({ error: ERR_SESION });
      if (!esAdmin(authU)) return res.status(403).json({ error: ERR_PERMISO });
      const { email, password, nombre, rol } = req.body || {};
      if (!email || !password || !nombre) return res.status(400).json({ error: 'Faltan datos' });

      const authUser = await sb('/auth/v1/admin/users', 'POST', {
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, rol: rol || 'analista' }
      });

      // Upsert del perfil (el trigger lo crea pero puede necesitar actualización de nombre/rol)
      await sb('/rest/v1/perfiles', 'POST', [{
        id:     authUser.id,
        email:  email,
        nombre: nombre,
        rol:    rol || 'analista',
        activo: true
      }]);

      return res.json({ ok: true, id: authUser.id });
    }

    // ── CAMBIAR CONTRASEÑA (admin, o el propio usuario) ──────────────────────
    if (req.method === 'POST' && action === 'password') {
      const authU = await getAuthUser(req);
      if (!authU) return res.status(401).json({ error: ERR_SESION });
      const { userId, password } = req.body || {};
      if (!userId || !password) return res.status(400).json({ error: 'Faltan datos' });
      if (!esAdmin(authU) && authU.id !== userId) return res.status(403).json({ error: ERR_PERMISO });
      await sb(`/auth/v1/admin/users/${userId}`, 'PUT', { password });
      return res.json({ ok: true });
    }

    // ── CAMBIAR ROL (solo admin) ─────────────────────────────────────────────
    if (req.method === 'POST' && action === 'rol') {
      const authU = await getAuthUser(req);
      if (!authU) return res.status(401).json({ error: ERR_SESION });
      if (!esAdmin(authU)) return res.status(403).json({ error: ERR_PERMISO });
      const { userId, rol } = req.body || {};
      if (!userId || !rol) return res.status(400).json({ error: 'Faltan datos' });
      if (authU.id === userId && rol !== 'admin') return res.status(400).json({ error: 'No podés quitarte el rol de admin a vos mismo.' });
      await sb(`/rest/v1/perfiles?id=eq.${userId}`, 'PATCH', { rol });
      return res.json({ ok: true });
    }

    // ── ACTIVAR / DESACTIVAR USUARIO (solo admin) ────────────────────────────
    if (req.method === 'POST' && action === 'toggle') {
      const authU = await getAuthUser(req);
      if (!authU) return res.status(401).json({ error: ERR_SESION });
      if (!esAdmin(authU)) return res.status(403).json({ error: ERR_PERMISO });
      const { userId, activo } = req.body || {};
      if (!userId || activo === undefined) return res.status(400).json({ error: 'Faltan datos' });
      if (authU.id === userId && !activo) return res.status(400).json({ error: 'No podés desactivar tu propio usuario.' });
      await sb(`/rest/v1/perfiles?id=eq.${userId}`, 'PATCH', { activo });
      // Ban/unban en Supabase Auth
      await sb(`/auth/v1/admin/users/${userId}`, 'PUT', {
        ban_duration: activo ? 'none' : '876000h'
      });
      return res.json({ ok: true });
    }

    // ── AUDIT LOG (escritura: cualquier usuario autenticado) ─────────────────
    // La identidad se toma SIEMPRE del token verificado, nunca del body —
    // así el audit trail conserva valor probatorio ante UIF/BCRA.
    if (req.method === 'POST' && action === 'audit') {
      const authU = await getAuthUser(req);
      if (!authU) return res.status(401).json({ error: ERR_SESION });
      const { accion, entidad, entidad_id, detalle } = req.body || {};
      await sb('/rest/v1/audit_log', 'POST', [{
        usuario_id: authU.id,
        usuario_nombre: authU.nombre || authU.email,
        accion,
        entidad,
        entidad_id,
        detalle: detalle || {}
      }]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Acción no reconocida' });

  } catch (e) {
    console.error('[Auth] Error:', e.message);
    return res.status(400).json({ error: e.message });
  }
}
