// ═══════════════════════════════════════════════════════════════════════════
// theme.js — FUENTE ÚNICA DE VERDAD DEL DISEÑO (Design Tokens) · v4 BI-TEMA
// ═══════════════════════════════════════════════════════════════════════════
// Dos temas que conviven: "oscuro" (fintech institucional, el original) y
// "claro" (fintech moderno tipo Stripe). El usuario alterna en caliente.
//
// ── CÓMO FUNCIONA ──────────────────────────────────────────────────────────
// `T` NO contiene colores: contiene referencias a variables CSS. `T.BG` vale
// literalmente 'var(--bg)'. Los valores reales se inyectan en :root, y cambiar
// de tema es reescribir esas variables — sin re-render, y sin que queden viejas
// las constantes que se calculan una sola vez al importar un módulo (ui.jsx,
// casos.js y otras ocho lo hacen).
//
// ⚠️ LÍMITE IMPORTANTE: var() se resuelve en CSS, NO en atributos SVG.
//    <line stroke={T.RED}/>         ✗ no pinta nada
//    <line style={{stroke:T.RED}}/> ✓ es CSS
//    <Line stroke={TR.RED}/>        ✓ recharts lo pasa como atributo → usar TR
// Para eso está `TR` (Tema Resuelto): mismas claves, valores reales, mutado en
// el lugar por aplicarTema(). Los componentes que lo usan se re-renderizan al
// cambiar el tema porque App re-renderiza. El test tema.test.js verifica que no
// se cuele un T. dentro de un atributo SVG.
//
// NOTA: la paleta de los informes PDF (INF_*, y los CSS embebidos en
// reports.js) es INDEPENDIENTE y está bloqueada — un informe impreso se lee
// igual sin importar con qué tema se generó.
// ═══════════════════════════════════════════════════════════════════════════

// ── Claves de color: definen qué variables CSS existen ──────────────────────
var CLAVES_COLOR = [
  'BG','BG2','BG3','BG4',
  'BORDER','BORDER2','BORDER3',
  'TEXT','TEXT2','TEXT3','TEXT4',
  'GREEN','CYAN','AMBER','RED','VIOLET','NARANJA',
  'ACCENT','ACCENT_SOFT','ACCENT_DIM',
  'HOVER_ROW','SCRIM','ON_ACCENT','ON_SEMANTIC','SHADOW_CARD','SHADOW_POP'
];

// ── TEMA OSCURO — "fintech institucional" (el original) ─────────────────────
// Superficies elevadas por tono, no por borde. Acento azul eléctrico.
var OSCURO = {
  BG:  '#0A0E14',
  BG2: '#10161F',
  BG3: '#161E2A',
  BG4: '#1D2735',

  BORDER:  '#1A2330',
  BORDER2: '#243040',
  BORDER3: '#324255',

  TEXT:  '#E8EDF4',
  TEXT2: '#94A6BD',
  TEXT3: '#5C7089',
  TEXT4: '#3A4A5E',

  GREEN:  '#00D68F',
  CYAN:   '#3D7EFF',
  AMBER:  '#FFB020',
  RED:    '#FF4757',
  VIOLET: '#8B7CF6',
  NARANJA:'#FF8C42',

  ACCENT:      '#3D7EFF',
  ACCENT_SOFT: 'rgba(61,126,255,0.12)',
  ACCENT_DIM:  'rgba(61,126,255,0.35)',

  HOVER_ROW:   'rgba(61,126,255,0.05)',
  SCRIM:       'rgba(4,7,12,0.55)',
  ON_ACCENT:   '#FFFFFF',
  // Texto sobre un fondo semántico sólido (verde/ámbar/rojo). En el tema oscuro
  // esos fondos son brillantes, así que el texto va OSCURO: blanco sobre el
  // verde #00D68F da 1,91:1 y sobre el ámbar #FFB020 da 1,83:1 — ilegible.
  ON_SEMANTIC: '#07130E',
  SHADOW_CARD: '0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.25)',
  SHADOW_POP:  '0 8px 32px rgba(0,0,0,0.5)'
};

// ── TEMA CLARO — "fintech moderno" ──────────────────────────────────────────
// Referencia: Stripe. Fondo gris azulado muy tenue, tarjetas BLANCAS que flotan
// con sombras suaves en vez de bordes duros, tipografía en azul marino profundo
// en lugar de negro puro, y semánticos oscurecidos para que tengan contraste
// real sobre blanco — los del tema oscuro se vuelven ilegibles.
var CLARO = {
  BG:  '#F6F9FC',
  BG2: '#FFFFFF',
  BG3: '#EFF3F9',
  BG4: '#FFFFFF',

  BORDER:  '#E6EBF1',
  BORDER2: '#D5DEE9',
  BORDER3: '#B4C2D4',

  TEXT:  '#0A2540',
  TEXT2: '#425466',
  TEXT3: '#6B7C93',
  TEXT4: '#93A1B5',

  GREEN:  '#0B8A5F',
  CYAN:   '#2563EB',
  AMBER:  '#B45309',
  RED:    '#D82C3C',
  VIOLET: '#6541D9',
  NARANJA:'#C2560B',

  ACCENT:      '#2563EB',
  ACCENT_SOFT: 'rgba(37,99,235,0.08)',
  ACCENT_DIM:  'rgba(37,99,235,0.28)',

  HOVER_ROW:   'rgba(37,99,235,0.045)',
  SCRIM:       'rgba(10,37,64,0.35)',
  ON_ACCENT:   '#FFFFFF',
  // Acá los semánticos son oscuros, así que el texto encima va blanco
  // (5,02:1 sobre ámbar, 4,83:1 sobre rojo, 4,36:1 sobre verde).
  ON_SEMANTIC: '#FFFFFF',
  // Firma visual de Stripe: sombras de dos capas, opacidad muy baja, teñidas
  // con el azul del texto en vez de negro puro.
  SHADOW_CARD: '0 1px 3px rgba(10,37,64,0.06), 0 4px 12px rgba(10,37,64,0.05)',
  SHADOW_POP:  '0 4px 12px rgba(10,37,64,0.10), 0 16px 48px rgba(10,37,64,0.14)'
};

var PALETAS = { oscuro: OSCURO, claro: CLARO };

var TEMAS = [
  { id:'oscuro', label:'Oscuro', desc:'Fintech institucional' },
  { id:'claro',  label:'Claro',  desc:'Fintech moderno' }
];

function varDe(clave) { return '--' + clave.toLowerCase().replace(/_/g, '-'); }

// ── T: tokens que apuntan a variables CSS ──────────────────────────────────
var T = {};
CLAVES_COLOR.forEach(function(k) { T[k] = 'var(' + varDe(k) + ')'; });

// Alias para no romper T.SHADOW.card / T.SHADOW.pop, que ya se usa en 30 lugares
T.SHADOW = { card: T.SHADOW_CARD, pop: T.SHADOW_POP };

// Tokens que NO dependen del tema
T.SANS   = "'Inter','SF Pro Display',-apple-system,'Segoe UI',sans-serif";
T.MONO   = "'JetBrains Mono','Fira Code','Consolas',monospace";
T.RADIUS = { sm: 6, md: 10, lg: 16, pill: 999 };
T.SPACE  = [0, 4, 8, 12, 16, 24, 32, 48];
T.TRANS  = 'all 0.15s ease';

// ── TR: mismos tokens con valores REALES ───────────────────────────────────
// Solo para atributos SVG y props de recharts, donde var() no se resuelve.
var TR = {};
CLAVES_COLOR.forEach(function(k) { TR[k] = OSCURO[k]; });
TR.SANS = T.SANS; TR.MONO = T.MONO;

// ── Paleta legacy ───────────────────────────────────────────────────────────
var C  = { AC: T.ACCENT,  VERDE: T.GREEN,  AMARILLO: T.AMBER,  NARANJA: T.NARANJA,  ROJO: T.RED };
var CR = { AC: TR.ACCENT, VERDE: TR.GREEN, AMARILLO: TR.AMBER, NARANJA: TR.NARANJA, ROJO: TR.RED };

// ── Aplicación del tema ─────────────────────────────────────────────────────
var TEMA_KEY = 'rebit_tema';
var _temaActual = 'oscuro';

function temaActual() { return _temaActual; }

function temaGuardado() {
  try {
    var v = window.localStorage.getItem(TEMA_KEY);
    if (v === 'claro' || v === 'oscuro') return v;
  } catch (e) { /* modo privado o storage bloqueado */ }
  // Sin preferencia guardada se respeta la del sistema operativo
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'claro';
  } catch (e) { /* sin soporte */ }
  return 'oscuro';
}

function aplicarTema(nombre) {
  var pal = PALETAS[nombre] || OSCURO;
  _temaActual = PALETAS[nombre] ? nombre : 'oscuro';

  if (typeof document !== 'undefined' && document.documentElement) {
    var root = document.documentElement;
    CLAVES_COLOR.forEach(function(k) { root.style.setProperty(varDe(k), pal[k]); });
    // Hace que los controles nativos (scrollbars, date pickers, autofill) sigan
    // el tema en vez de quedar siempre oscuros.
    root.style.colorScheme = _temaActual === 'claro' ? 'light' : 'dark';
    root.setAttribute('data-tema', _temaActual);
  }

  // Mutación EN EL LUGAR: quien tenga la referencia a TR ve los valores nuevos
  CLAVES_COLOR.forEach(function(k) { TR[k] = pal[k]; });
  CR.AC = pal.ACCENT; CR.VERDE = pal.GREEN; CR.AMARILLO = pal.AMBER;
  CR.NARANJA = pal.NARANJA; CR.ROJO = pal.RED;

  try { window.localStorage.setItem(TEMA_KEY, _temaActual); } catch (e) { /* ignorar */ }
  return _temaActual;
}

// ── Paleta del informe KYB dark (INF-01) — BLOQUEADA, no depende del tema ───
var INF_TX  = '#E2EAF4';
var INF_TX2 = '#8BA3C0';
var INF_TX3 = '#4A6A8A';
var INF_BG  = '#0D1520';
var INF_BG2 = '#111D2E';
var INF_BG3 = '#162035';
var INF_BD  = '#1E3050';
var INF_BD2 = '#253A5E';
var INF_BD3 = '#2E4870';

export {
  C, CR, T, TR, PALETAS, TEMAS, CLAVES_COLOR, varDe,
  aplicarTema, temaActual, temaGuardado,
  INF_TX, INF_TX2, INF_TX3, INF_BG, INF_BG2, INF_BG3, INF_BD, INF_BD2, INF_BD3
};
