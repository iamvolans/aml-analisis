// ═══════════════════════════════════════════════════════════════════════════
// theme.js — FUENTE ÚNICA DE VERDAD DEL DISEÑO (Design Tokens)
// ═══════════════════════════════════════════════════════════════════════════
// Todos los colores, tipografías y estilos de la app derivan de este archivo.
// Cambiar un valor acá re-pinta la aplicación completa.
//
// T0: centraliza los tokens existentes (paleta v2, sin cambio visual).
// T1: se expande con la paleta fintech (superficies elevadas #0A0E14→#1D2735,
//     acento #3D7EFF, escala tipográfica Inter, espaciado 8px, radios, sombras)
//     y todos los componentes pasan a consumir exclusivamente estos tokens.
// ═══════════════════════════════════════════════════════════════════════════

var C = { AO:'#1B2A4A', AM:'#2C4A7C', AC:'#3B6DAA', CEL:'#D6E4F0', VERDE:'#00E676', AMARILLO:'#FFB830', NARANJA:'#FF8C00', ROJO:'#FF4455' };

var T = {
  BG:  '#0D1520', BG2: '#111D2E', BG3: '#162035', BG4: '#1A2940',
  BORDER: '#1E3050', BORDER2: '#253A5E', BORDER3: '#2E4870',
  TEXT: '#E2EAF4', TEXT2: '#8BA3C0', TEXT3: '#4A6A8A', TEXT4: '#2D4A6A',
  GREEN: '#00E676', CYAN: '#00D4FF', AMBER: '#FFB830', RED: '#FF4455',
  MONO: "'JetBrains Mono','Fira Code','Consolas',monospace"
};

// ─── INF-01 HTML HELPERS (module level) ──────────────────────────────────────
// ── Paleta del informe KYB (dark theme) ─────────────────────────────────
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
