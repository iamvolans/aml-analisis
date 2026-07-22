// api/config.js — Sirve configuración NO sensible desde variables de entorno de Vercel
// SEGURIDAD: las API keys NUNCA se envían al navegador. El cliente solo necesita
// saber si están configuradas (flags booleanos) — todas las llamadas a IA pasan
// por el proxy /api/ai, que usa las keys del lado del servidor.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Validar token de app (mismo que contraseña de login)
  const token = req.headers['x-app-token'];
  const APP_TOKEN = process.env.APP_TOKEN || '123aml2026';
  if (token !== APP_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  res.json({
    defaultProvider: process.env.AI_PROVIDER || 'claude',
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    hasSyncConfig: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  });
}
