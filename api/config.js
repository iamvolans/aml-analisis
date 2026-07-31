// api/config.js — Sirve configuración NO sensible desde variables de entorno de Vercel
// SEGURIDAD: las API keys NUNCA se envían al navegador. El cliente solo necesita
// saber si están configuradas (flags booleanos) — todas las llamadas a IA pasan
// por el proxy /api/ai, que usa las keys del lado del servidor.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token, x-user-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Este endpoint se consulta ANTES del login (para saber el proveedor de IA por
  // defecto), así que no puede exigir sesión de usuario. Sigue protegido por el
  // token compartido, lo cual es aceptable porque solo devuelve flags booleanos:
  // ninguna key ni dato de negocio sale por acá.
  const token = req.headers['x-app-token'];
  const APP_TOKEN = process.env.APP_TOKEN || '123aml2026';
  if (token !== APP_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  res.json({
    defaultProvider: process.env.AI_PROVIDER || 'claude',
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    hasSyncConfig: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    // true = el token compartido del bundle todavía sirve para llamar a la API.
    // La app muestra un aviso mientras siga así. Misma normalización que _auth.js.
    appTokenLegacy: ['false','0','no','off'].indexOf(
      String(process.env.ALLOW_APP_TOKEN == null ? '' : process.env.ALLOW_APP_TOKEN).trim().toLowerCase()
    ) < 0,
    // Diagnóstico: si la variable no está definida, esto lo dice sin revelar su valor
    appTokenVarDefinida: process.env.ALLOW_APP_TOKEN != null && String(process.env.ALLOW_APP_TOKEN).trim() !== ''
  });
}
