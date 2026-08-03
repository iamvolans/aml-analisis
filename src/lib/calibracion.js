// ═══════════════════════════════════════════════════════════════════════════
// calibracion.js — Análisis de sensibilidad de los plazos (T9b)
// ═══════════════════════════════════════════════════════════════════════════
// Responde tres preguntas que no necesitan la resolución vigente para tener
// respuesta útil:
//
//   1. ¿Qué plazos manda de verdad? Un umbral que ningún caso llega a ejercitar
//      no está midiendo nada, esté bien o mal configurado.
//   2. ¿Qué pasaría si moviéramos este número? Cuántos casos cambiarían de
//      estado. Convierte "¿15 o 20 días?" en una conversación sobre datos.
//   3. ¿Dónde duele el incumplimiento? Qué hito concentra los vencimientos.
//
// Nada de esto dice cuál es el número legalmente correcto. Dice cuál es el
// impacto operativo de cada valor, que es la mitad que sí se puede medir.

import { SLA, ESTADOS_CASO, getEstadoCaso, hitosSLA, slaCritico } from "./casos.js";

// Qué parámetro del SLA gobierna cada hito
var HITO_A_PARAM = {
  inicio: 'INICIO_ANALISIS',
  comite: 'ESCALAMIENTO_COMITE',
  rfi:    'RFI_RESPUESTA',
  ros:    'ROS_CALIFICACION',
  tope:   'ROS_MAX_OPERACION'
};

var PARAMS = [
  { id:'INICIO_ANALISIS',    label:'Tomar el caso',            tipo:'INTERNO',    unidad:'días',
    desc:'Desde la apertura hasta que un analista lo toma.' },
  { id:'ESCALAMIENTO_COMITE',label:'Elevar a comité',          tipo:'INTERNO',    unidad:'días',
    desc:'Tiempo en análisis antes de elevar para decisión.' },
  { id:'RFI_RESPUESTA',      label:'Respuesta a RFI',          tipo:'INTERNO',    unidad:'días',
    desc:'Plazo que se le da al cliente para responder.' },
  { id:'ROS_CALIFICACION',   label:'Plazo de reporte',         tipo:'REGULATORIO',unidad:'días',
    desc:'Desde que el caso se califica como sospechoso.' },
  { id:'ROS_MAX_OPERACION',  label:'Tope desde la operación',  tipo:'REGULATORIO',unidad:'días',
    desc:'Límite duro contado desde la fecha de la operación.' },
  { id:'ROS_FT_HORAS',       label:'Reporte por FT',           tipo:'REGULATORIO',unidad:'horas',
    desc:'Financiamiento del terrorismo. Aún no está cableado a ningún hito.' }
];

// ── 1. Qué hitos se ejercitan realmente ─────────────────────────────────────
// Para cada parámetro: en cuántos casos abiertos aparece su hito, y en cuántos
// es el hito CRÍTICO (el más urgente, o sea el que efectivamente manda).
function ejercicio(casos, sla) {
  var S = sla || SLA;
  var abiertos = (casos || []).filter(function(c){ return getEstadoCaso(c.estado).abierto; });

  var conteo = {};
  PARAMS.forEach(function(p){ conteo[p.id] = { presente:0, critico:0, vencido:0 }; });

  abiertos.forEach(function(c){
    var hitos = hitosSLA(c, S);
    var crit = hitos.length ? hitos[0] : null;
    hitos.forEach(function(h){
      var par = HITO_A_PARAM[h.id];
      if (!par || !conteo[par]) return;
      conteo[par].presente++;
      if (h.estado === 'VENCIDO') conteo[par].vencido++;
      if (crit && crit.id === h.id) conteo[par].critico++;
    });
  });

  return PARAMS.map(function(p){
    return Object.assign({}, p, conteo[p.id], {
      valor: S[p.id],
      // Un parámetro que nunca es crítico no cambia ninguna decisión: moverlo
      // no altera lo que ve el analista.
      inerte: conteo[p.id].critico === 0
    });
  });
}

// ── 2. Sensibilidad: qué pasa al mover un parámetro ─────────────────────────
// Devuelve, para cada valor candidato, cuántos casos abiertos quedarían
// vencidos, próximos y en regla.
function sensibilidad(casos, param, valores, sla) {
  var base = sla || SLA;
  var abiertos = (casos || []).filter(function(c){ return getEstadoCaso(c.estado).abierto; });

  return (valores || []).map(function(v){
    var alt = Object.assign({}, base);
    alt[param] = v;
    var vencidos = 0, proximos = 0, ok = 0, sinPlazo = 0;
    abiertos.forEach(function(c){
      var s = slaCritico(c, alt);
      if (!s) { sinPlazo++; return; }
      if (s.estado === 'VENCIDO') vencidos++;
      else if (s.estado === 'PROXIMO') proximos++;
      else ok++;
    });
    return {
      valor: v, vencidos: vencidos, proximos: proximos, ok: ok, sinPlazo: sinPlazo,
      total: abiertos.length,
      actual: v === base[param]
    };
  });
}

// Valores candidatos alrededor del actual, sin repetir ni bajar de 1
function candidatos(actual) {
  var base = [0.5, 0.75, 1, 1.5, 2].map(function(f){ return Math.max(1, Math.round(actual * f)); });
  return base.filter(function(v, i){ return base.indexOf(v) === i; }).sort(function(a,b){ return a-b; });
}

// ── 3. Dónde se concentran los incumplimientos ──────────────────────────────
function concentracionVencidos(casos, sla) {
  var S = sla || SLA;
  var abiertos = (casos || []).filter(function(c){ return getEstadoCaso(c.estado).abierto; });
  var porHito = {};
  abiertos.forEach(function(c){
    hitosSLA(c, S).forEach(function(h){
      if (h.estado !== 'VENCIDO') return;
      var par = HITO_A_PARAM[h.id] || h.id;
      if (!porHito[par]) porHito[par] = { param: par, label: h.label, n: 0, diasMax: 0 };
      porHito[par].n++;
      porHito[par].diasMax = Math.max(porHito[par].diasMax, Math.abs(h.dias));
    });
  });
  return Object.keys(porHito).map(function(k){ return porHito[k]; })
    .sort(function(a,b){ return b.n - a.n; });
}

// ── 4. Distribución de edad de los casos abiertos ───────────────────────────
// Sirve para juzgar si un plazo es alcanzable: si la mediana de permanencia
// supera holgadamente el plazo, el problema no es el umbral sino la capacidad.
function edadCasos(casos, hoyStr) {
  var abiertos = (casos || []).filter(function(c){ return getEstadoCaso(c.estado).abierto; });
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var edades = abiertos.map(function(c){
    var p = (c.fechaApertura || '').split('/');
    if (p.length !== 3) return null;
    var f = new Date(p[2], p[1]-1, p[0]);
    return Math.round((hoy - f) / 86400000);
  }).filter(function(d){ return d !== null && d >= 0; });

  edades.sort(function(a,b){ return a-b; });
  var med = edades.length ? (edades.length % 2
      ? edades[(edades.length-1)/2]
      : Math.round((edades[edades.length/2 - 1] + edades[edades.length/2]) / 2)) : null;
  return {
    n: edades.length,
    mediana: med,
    max: edades.length ? edades[edades.length-1] : null,
    min: edades.length ? edades[0] : null
  };
}

export { PARAMS, HITO_A_PARAM, ejercicio, sensibilidad, candidatos, concentracionVencidos, edadCasos };
