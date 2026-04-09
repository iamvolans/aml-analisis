// api/config.js — Sirve configuración segura desde variables de entorno de Vercel
// El cliente nunca necesita ingresar keys manualmente en ningún dispositivo
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
    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
    openaiKey: process.env.OPENAI_API_KEY || '',
    defaultProvider: process.env.AI_PROVIDER || 'claude',
    hasSyncConfig: !!(process.env.JSONBIN_MASTER_KEY && process.env.JSONBIN_BIN_ID)
  });
}
