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
        usuario: {
          id:     userId,
          email:  perfil.email,
          nombre: perfil.nombre,
          rol:    perfil.rol
        }
      });
    }

    // ── LISTAR AUDIT LOG ─────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'audit_log') {
      const { entidad_id, limit } = req.query;
      var qs = '/rest/v1/audit_log?select=*&order=created_at.desc&limit=' + (limit||50);
      if (entidad_id) qs += '&entidad_id=eq.' + entidad_id;
      const logs = await sb(qs);
      return res.json({ logs: logs || [] });
    }

    // ── LISTAR USUARIOS (solo admin) ─────────────────────────────────────────
    if (req.method === 'GET' && action === 'usuarios') {
      const perfiles = await sb(
        '/rest/v1/perfiles?select=id,email,nombre,rol,activo,created_at&order=created_at.asc'
      );
      return res.json({ usuarios: perfiles || [] });
    }

    // ── CREAR USUARIO ────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'crear') {
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

    // ── CAMBIAR CONTRASEÑA ───────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'password') {
      const { userId, password } = req.body || {};
      if (!userId || !password) return res.status(400).json({ error: 'Faltan datos' });
      await sb(`/auth/v1/admin/users/${userId}`, 'PUT', { password });
      return res.json({ ok: true });
    }

    // ── CAMBIAR ROL ──────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'rol') {
      const { userId, rol } = req.body || {};
      if (!userId || !rol) return res.status(400).json({ error: 'Faltan datos' });
      await sb(`/rest/v1/perfiles?id=eq.${userId}`, 'PATCH', { rol });
      return res.json({ ok: true });
    }

    // ── ACTIVAR / DESACTIVAR USUARIO ─────────────────────────────────────────
    if (req.method === 'POST' && action === 'toggle') {
      const { userId, activo } = req.body || {};
      if (!userId || activo === undefined) return res.status(400).json({ error: 'Faltan datos' });
      await sb(`/rest/v1/perfiles?id=eq.${userId}`, 'PATCH', { activo });
      // Ban/unban en Supabase Auth
      await sb(`/auth/v1/admin/users/${userId}`, 'PUT', {
        ban_duration: activo ? 'none' : '876000h'
      });
      return res.json({ ok: true });
    }

    // ── AUDIT LOG ────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'audit') {
      const { usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle } = req.body || {};
      await sb('/rest/v1/audit_log', 'POST', [{
        usuario_id,
        usuario_nombre,
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
