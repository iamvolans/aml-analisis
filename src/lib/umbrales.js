// ═══════════════════════════════════════════════════════════════════════════
// umbrales.js — Parámetros de detección transaccional
// ═══════════════════════════════════════════════════════════════════════════
// Todos los umbrales del motor viven acá, con su fundamento y su estado de
// aprobación. Antes estaban dispersos dentro de detectPatrones y repetidos
// dentro de calcScoring: `pctRound > 70`, `passThrough > 0.90` y otros tres
// figuraban dos veces, de modo que ajustar la detección sin ajustar el scoring
// los desincronizaba en silencio.
//
// Cada entrada declara:
//   valor     el número que aplica
//   unidad    para que el informe pueda expresarlo
//   desc      qué mide y por qué ese corte
//   origen    'NORMATIVO' si deriva de una norma, 'INTERNO' si lo define GOAT
//   aprobado  fecha de aprobación por el Comité, vacío si está pendiente
//
// Un umbral sin aprobar no es un error: es una condición que debe poder
// declararse. El informe al Comité y el manual los leen de acá.

var UMBRALES_DEF = {

  // ── PAT-01 · Fraccionamiento ─────────────────────────────────────────────
  FRACC_OPS_MISMO_DIA: {
    valor: 3, unidad: 'operaciones', origen: 'INTERNO', aprobado: '',
    desc: 'Operaciones de una misma contraparte en un mismo día que constituyen '
        + 'un grupo de fraccionamiento. Con dos no hay patrón; con tres, la '
        + 'repetición deja de ser casual.',
  },
  FRACC_DIAS_ALTA: {
    valor: 3, unidad: 'días', origen: 'INTERNO', aprobado: '',
    desc: 'Días distintos con grupos de fraccionamiento a partir de los cuales la '
        + 'señal se eleva a severidad alta. Un solo día admite explicación '
        + 'operativa; tres indican método.',
  },

  // ── PAT-02 · Cuenta embudo ───────────────────────────────────────────────
  EMBUDO_RATIO: {
    valor: 5, unidad: 'orígenes por destino', origen: 'INTERNO', aprobado: '',
    desc: 'Relación entre contrapartes de entrada y de salida. Cinco orígenes por '
        + 'cada destino describe una concentración que no responde a una '
        + 'operatoria comercial corriente.',
  },
  EMBUDO_MIN_CP_IN: {
    valor: 5, unidad: 'contrapartes', origen: 'INTERNO', aprobado: '',
    desc: 'Mínimo de contrapartes de entrada para evaluar el embudo. Por debajo, '
        + 'la relación es estadísticamente inestable.',
  },

  // ── PAT-04 · Contrapartes de operación única ─────────────────────────────
  ONESHOT_PCT: {
    valor: 60, unidad: '%', origen: 'INTERNO', aprobado: '',
    desc: 'Proporción de contrapartes que aparecen una sola vez. Una cartera '
        + 'comercial estable repite contrapartes; una dispersión mayor sugiere '
        + 'interposición de terceros.',
  },
  ONESHOT_MIN_CP: {
    valor: 8, unidad: 'contrapartes', origen: 'INTERNO', aprobado: '',
    desc: 'Mínimo de contrapartes para evaluar la dispersión. Con pocas, un solo '
        + 'caso desplaza el porcentaje.',
  },

  // ── PAT-05 · Volumen contra perfil declarado ─────────────────────────────
  PERFIL_EXCESO: {
    valor: 2.0, unidad: 'veces', origen: 'INTERNO', aprobado: '',
    desc: 'Múltiplo del perfil mensual declarado a partir del cual el volumen se '
        + 'considera excedido.',
  },
  PERFIL_DEFECTO: {
    valor: 0.3, unidad: 'veces', origen: 'INTERNO', aprobado: '',
    desc: 'Fracción del perfil por debajo de la cual el volumen resulta '
        + 'llamativamente inferior a lo declarado, lo que también amerita '
        + 'revisión: puede indicar que la actividad real está en otro lado.',
  },

  // ── PAT-06 · Concentración por contraparte ───────────────────────────────
  CONC_HHI_ALTA: {
    valor: 0.80, unidad: 'índice', origen: 'INTERNO', aprobado: '',
    desc: 'Índice Herfindahl-Hirschman a partir del cual la concentración se '
        + 'considera extrema. El índice pondera todas las contrapartes, no solo '
        + 'la principal.',
  },
  CONC_HHI_MEDIA: {
    valor: 0.50, unidad: 'índice', origen: 'INTERNO', aprobado: '',
    desc: 'Índice a partir del cual la concentración se considera alta.',
  },
  CONC_TOP1_ALTA: {
    valor: 80, unidad: '%', origen: 'INTERNO', aprobado: '',
    desc: 'Participación de la contraparte principal que por sí sola configura '
        + 'concentración extrema, con independencia del índice.',
  },

  // ── PAT-07 · Montos redondos y repetidos ─────────────────────────────────
  REDONDOS_ALTA: {
    valor: 70, unidad: '%', origen: 'INTERNO', aprobado: '',
    desc: 'Proporción de operaciones por importes múltiplos de $100.000. Una '
        + 'operatoria comercial genuina produce importes con centavos.',
  },
  REDONDOS_MEDIA: {
    valor: 30, unidad: '%', origen: 'INTERNO', aprobado: '',
    desc: 'Proporción a partir de la cual los importes redondos son frecuentes.',
  },
  REDONDO_MULTIPLO: {
    valor: 100000, unidad: '$', origen: 'INTERNO', aprobado: '',
    desc: 'Múltiplo que define un importe como redondo. Debe revisarse junto con '
        + 'el poder adquisitivo: un valor congelado pierde sentido con el tiempo.',
  },
  REPETIDOS_MIN: {
    valor: 3, unidad: 'ocurrencias', origen: 'INTERNO', aprobado: '',
    desc: 'Veces que debe repetirse un importe exacto para constituir señal.',
  },

  // ── PAT-08 · Horario atípico ─────────────────────────────────────────────
  HORARIO_PCT: {
    valor: 30, unidad: '%', origen: 'INTERNO', aprobado: '',
    desc: 'Proporción de operaciones fuera del horario habitual.',
  },
  HORARIO_DESDE: {
    valor: 8, unidad: 'hora', origen: 'INTERNO', aprobado: '',
    desc: 'Hora a partir de la cual la operatoria se considera habitual.',
  },
  HORARIO_HASTA: {
    valor: 20, unidad: 'hora', origen: 'INTERNO', aprobado: '',
    desc: 'Hora hasta la cual la operatoria se considera habitual.',
  },

  // ── PAT-09 · Tránsito de fondos ──────────────────────────────────────────
  TRANSITO_ALTA: {
    valor: 0.90, unidad: 'proporción', origen: 'INTERNO', aprobado: '',
    desc: 'Relación entre lo que sale y lo que entra. Cerca de uno, la cuenta '
        + 'funciona como paso y no como destino de los fondos.',
  },
  TRANSITO_MEDIA: {
    valor: 0.70, unidad: 'proporción', origen: 'INTERNO', aprobado: '',
    desc: 'Relación a partir de la cual la rotación es elevada.',
  },

  // ── PAT-10 · Operaciones bajo el umbral de reporte ───────────────────────
  UMBRAL_REPORTE: {
    valor: 800000, unidad: '$', origen: 'NORMATIVO', aprobado: '',
    desc: 'Umbral de reporte a partir del cual una operación resulta informable. '
        + 'PENDIENTE DE VALIDACIÓN: debe confirmarse contra la resolución '
        + 'vigente y actualizarse cuando cambie. Un valor desactualizado hace '
        + 'que la franja de detección apunte al lugar equivocado.',
  },
  UMBRAL_MARGEN: {
    valor: 0.15, unidad: 'proporción', origen: 'INTERNO', aprobado: '',
    desc: 'Franja inmediatamente inferior al umbral que se vigila, expresada como '
        + 'fracción de aquel. Con 0,15 sobre $800.000, la franja va de $680.000 '
        + 'a $799.999.',
  },
  UMBRAL_MIN_OPS: {
    valor: 5, unidad: 'operaciones', origen: 'INTERNO', aprobado: '',
    desc: 'Operaciones de una misma contraparte dentro de la franja que '
        + 'constituyen señal. Una o dos pueden ser casualidad del precio.',
  },

  // ── PAT-11 · Velocidad operativa ─────────────────────────────────────────
  VELOCIDAD_OPS_DIA: {
    valor: 50, unidad: 'operaciones por día', origen: 'INTERNO', aprobado: '',
    desc: 'Promedio diario de operaciones que se aparta de una operatoria '
        + 'administrada manualmente.',
  },

  // ── PAT-12 · Muchos orígenes hacia pocos destinos ────────────────────────
  MUCHOS_POCOS_CP_IN: {
    valor: 20, unidad: 'contrapartes', origen: 'INTERNO', aprobado: '',
    desc: 'Contrapartes de entrada a partir de las cuales se evalúa el embudo '
        + 'múltiple.',
  },
  MUCHOS_POCOS_CP_OUT: {
    valor: 5, unidad: 'contrapartes', origen: 'INTERNO', aprobado: '',
    desc: 'Contrapartes de salida por debajo de las cuales la dispersión de '
        + 'orígenes contrasta con la concentración de destinos.',
  },

  // ── Circularidad ─────────────────────────────────────────────────────────
  CIRCULAR_MIN: {
    valor: 1, unidad: 'contrapartes', origen: 'INTERNO', aprobado: '',
    desc: 'Contrapartes que figuran como origen y destino a la vez para '
        + 'constituir señal.',
  },
  CIRCULAR_SCORE_ALTO: {
    valor: 2, unidad: 'contrapartes', origen: 'INTERNO', aprobado: '',
    desc: 'Contrapartes circulares a partir de las cuales el factor de scoring '
        + 'toma su valor máximo.',
  },

  // ── Scoring: volumen contra perfil ───────────────────────────────────────
  // Estos cortes son propios del scoring y NO coinciden con los de detección:
  // el scoring gradúa el riesgo y la detección decide si hay señal.
  SCORE_PERFIL_ALTO: {
    valor: 3, unidad: 'veces', origen: 'INTERNO', aprobado: '',
    desc: 'Múltiplo del perfil que lleva el factor de scoring a su máximo.',
  },
  SCORE_PERFIL_MEDIO: {
    valor: 1.5, unidad: 'veces', origen: 'INTERNO', aprobado: '',
    desc: 'Múltiplo del perfil que eleva el factor de scoring.',
  },
  SCORE_PERFIL_BAJO: {
    valor: 0.1, unidad: 'veces', origen: 'INTERNO', aprobado: '',
    desc: 'Fracción del perfil por debajo de la cual el factor de scoring se '
        + 'eleva por defecto de actividad.',
  },
};

// Valores planos, para uso en las condiciones. Se derivan de la definición
// única de arriba: no puede haber divergencia entre el valor que se aplica y el
// que se documenta.
var U = {};
Object.keys(UMBRALES_DEF).forEach(function(k){ U[k] = UMBRALES_DEF[k].valor; });

// Franja de vigilancia bajo el umbral de reporte, derivada y no escrita a mano
function franjaUmbral() {
  var alto = U.UMBRAL_REPORTE;
  return { desde: Math.round(alto * (1 - U.UMBRAL_MARGEN)), hasta: alto };
}

// Umbrales sin aprobación asentada, para que el informe pueda declararlo
function sinAprobar() {
  return Object.keys(UMBRALES_DEF).filter(function(k){ return !UMBRALES_DEF[k].aprobado; });
}

export { UMBRALES_DEF, U, franjaUmbral, sinAprobar };
