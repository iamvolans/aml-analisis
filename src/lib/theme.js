// ═══════════════════════════════════════════════════════════════════════════
// theme.js — FUENTE ÚNICA DE VERDAD DEL DISEÑO (Design Tokens) · v3 FINTECH
// ═══════════════════════════════════════════════════════════════════════════
// Todos los colores, tipografías y estilos de la app derivan de este archivo.
// Cambiar un valor acá re-pinta la aplicación completa.
//
// Dirección: "fintech institucional oscuro" — superficies elevadas por tono
// (no por bordes), acento azul eléctrico derivado del azul corporativo GOAT,
// Inter para UI y JetBrains Mono reservado para datos duros (CUITs, montos).
//
// NOTA: la paleta de los informes PDF (INF_*, y los CSS embebidos en
// reports.js) es INDEPENDIENTE y está bloqueada — no se toca desde acá.
// ═══════════════════════════════════════════════════════════════════════════

// ── Paleta principal de UI ───────────────────────────────────────────────────
var T = {
  // Superficies (elevación por profundidad de tono)
  BG:  '#0A0E14',   // fondo de app
  BG2: '#10161F',   // superficie 1: sidebar, cards
  BG3: '#161E2A',   // superficie 2: elementos elevados, hover
  BG4: '#1D2735',   // superficie 3: inputs, controles

  // Bordes (sutiles — la elevación la da el tono, no la línea)
  BORDER:  '#1A2330',
  BORDER2: '#243040',
  BORDER3: '#324255',

  // Texto (escala de énfasis)
  TEXT:  '#E8EDF4',
  TEXT2: '#94A6BD',
  TEXT3: '#5C7089',
  TEXT4: '#3A4A5E',

  // Semánticos
  GREEN: '#00D68F',
  CYAN:  '#3D7EFF',   // ← ACENTO PRIMARIO (links, activos, foco)
  AMBER: '#FFB020',
  RED:   '#FF4757',

  // Acento y derivados
  ACCENT:      '#3D7EFF',
  ACCENT_SOFT: 'rgba(61,126,255,0.12)',
  ACCENT_DIM:  'rgba(61,126,255,0.35)',
  VIOLET:      '#8B7CF6',   // reservado para features de IA

  // Tipografía
  SANS: "'Inter','SF Pro Display',-apple-system,'Segoe UI',sans-serif",
  MONO: "'JetBrains Mono','Fira Code','Consolas',monospace",

  // Escalas (T1b+: componentes consumen estas escalas)
  RADIUS:  { sm: 6, md: 10, lg: 16, pill: 999 },
  SPACE:   [0, 4, 8, 12, 16, 24, 32, 48],
  SHADOW:  { card: '0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.25)', pop: '0 8px 32px rgba(0,0,0,0.5)' },
  TRANS:   'all 0.15s ease'
};

// ── Paleta de acentos legacy (usada en vistas v2; migra a T en T2) ──────────
var C = {
  AO: '#0F1B33', AM: '#1E3A66', AC: '#3D7EFF', CEL: '#D6E4F0',
  VERDE: '#00D68F', AMARILLO: '#FFB020', NARANJA: '#FF8C42', ROJO: '#FF4757'
};

// ── Paleta del informe KYB dark (INF-01) — BLOQUEADA, no modificar ──────────
var INF_TX  = '#E2EAF4';
var INF_TX2 = '#8BA3C0';
var INF_TX3 = '#4A6A8A';
var INF_BG  = '#0D1520';
var INF_BG2 = '#111D2E';
var INF_BG3 = '#162035';
var INF_BD  = '#1E3050';
var INF_BD2 = '#253A5E';
var INF_BD3 = '#2E4870';

export { C, T, INF_TX, INF_TX2, INF_TX3, INF_BG, INF_BG2, INF_BG3, INF_BD, INF_BD2, INF_BD3 };
