// api/_auth.js — Autenticación compartida entre endpoints (T8a)
// ═══════════════════════════════════════════════════════════════════════════
// Los archivos de /api que empiezan con guión bajo no se sirven como rutas.
// Por las dudas, este módulo expone igual un handler que responde 404, así que
// aunque quedara ruteado no sería un endpoint utilizable.
//
// El rol SIEMPRE se lee de la tabla `perfiles`, nunca del body ni del JWT:
// un cliente no puede declararse supervisor.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_TOKEN    = process.env.APP_TOKEN || '123aml2026';

// Transición: mientras esté en true se sigue aceptando el token compartido.
// Poner ALLOW_APP_TOKEN=false en Vercel una vez verificado el login por usuario.
// ⚠️ El token compartido viaja dentro del bundle del navegador y es legible por
// cualquiera que abra la app, incluso sin credenciales.
//
// Se normaliza el valor: un control de seguridad no puede quedar abierto porque
// alguien escribió "False" o dejó un espacio al final. Cualquier forma razonable
// de "no" cierra la compuerta.
function esNo(v) {
  return ['false', '0', 'no', 'off'].indexOf(String(v == null ? '' : v).trim().toLowerCase()) >= 0;
}
const ALLOW_APP_TOKEN = !esNo(process.env.ALLOW_APP_TOKEN);

async function getAuthUser(req) {
  const userToken = req.headers['x-user-token'];
  if (!userToken || !SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${userToken}` }
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u?.id) return null;

    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/perfiles?id=eq.${u.id}&select=id,email,nombre,rol,activo`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    if (!pr.ok) return null;
    const perfiles = await pr.json();
    const perfil = perfiles?.[0];
    if (!perfil || perfil.activo === false) return null;

    return { id: u.id, email: perfil.email, nombre: perfil.nombre, rol: perfil.rol };
  } catch (e) {
    console.warn('[_auth] getAuthUser:', e.message);
    return null;
  }
}

// Devuelve { user } si pasa, o null habiendo respondido ya con 401.
// `user` puede ser null si entró por el token heredado durante la transición.
async function requireAuth(req, res) {
  const user = await getAuthUser(req);
  if (user) return { user, legacy: false };

  if (ALLOW_APP_TOKEN && req.headers['x-app-token'] === APP_TOKEN) {
    return { user: null, legacy: true };
  }

  res.status(401).json({
    error: 'No autorizado',
    detalle: req.headers['x-user-token']
      ? 'Sesión inválida o expirada. Volvé a iniciar sesión.'
      : 'Falta la sesión de usuario.'
  });
  return null;
}

// Los identificadores tienen que coincidir EXACTAMENTE con los que emite la UI
// de Usuarios y guarda la tabla `perfiles`. Un nombre distinto acá no rompe el
// login pero deja al rol sin permisos en silencio.
const ROLES_ESCRITURA = ['admin', 'oficial_cumplimiento', 'supervisor', 'analista'];
const ROLES_BORRADO   = ['admin', 'oficial_cumplimiento', 'supervisor'];

function puedeEscribir(ctx) {
  if (!ctx) return false;
  if (ctx.legacy) return true;               // transición
  return ROLES_ESCRITURA.indexOf(ctx.user.rol) >= 0;
}
function puedeBorrar(ctx) {
  if (!ctx) return false;
  if (ctx.legacy) return true;               // transición
  return ROLES_BORRADO.indexOf(ctx.user.rol) >= 0;
}

export { getAuthUser, requireAuth, puedeEscribir, puedeBorrar, ALLOW_APP_TOKEN };

export default function handler(req, res) {
  res.status(404).json({ error: 'No es un endpoint' });
}
