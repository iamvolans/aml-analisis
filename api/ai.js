// api/ai.js — Proxy seguro para llamadas a Claude y GPT-4o
// Las API keys nunca llegan al browser — todo pasa por este servidor

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '35mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const token = req.headers['x-app-token'];
  const APP_TOKEN = process.env.APP_TOKEN || '123aml2026';
  if (token !== APP_TOKEN) return res.status(401).json({ error: 'No autorizado' });

  const { provider, messages, max_tokens = 8000, useWebSearch = false, system } = req.body;
  if (!messages) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(503).json({ error: 'OpenAI no configurado en el servidor' });

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-2024-11-20', max_tokens, messages })
      });
      const data = await r.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      const text = data.choices?.[0]?.message?.content || '';
      return res.json({ text });

    } else {
      // Claude (default)
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(503).json({ error: 'Anthropic no configurado en el servidor' });

      const body = {
        model: 'claude-sonnet-4-20250514',
        max_tokens,
        messages
      };
      if (system) body.system = system;

      // Agregar web search cuando se solicita (para screening de listas de sanciones)
      if (useWebSearch) {
        body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
        body.max_tokens = Math.max(max_tokens, 4000);
      }

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...(useWebSearch ? { 'anthropic-beta': 'web-search-2025-03-05' } : {})
        },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      // Extraer texto de todos los bloques (puede haber tool_use y tool_result)
      const text = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      return res.json({ text });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Error del servidor: ' + err.message });
  }
}
