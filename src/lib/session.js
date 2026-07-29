// ─── CLOUD SYNC via Vercel API proxy ─────────────────────────────────────────
var APP_TOKEN = '123aml2026'; // mismo que contraseña de login

// Token de sesión del usuario (JWT de Supabase Auth) — se setea al hacer login.
// Habilita las acciones con RBAC server-side (usuarios, roles, audit log).
// Solo en memoria: nunca se persiste en localStorage.
var _USER_TOKEN = '';

function setUserToken(t) { _USER_TOKEN = t || ''; }

export { APP_TOKEN, _USER_TOKEN, setUserToken };
