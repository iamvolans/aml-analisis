// ═══════════════════════════════════════════════════════════════════════════
// comite.js — Métricas de gestión para el Comité de Compliance (T9)
// ═══════════════════════════════════════════════════════════════════════════
// Todo lo que el sistema registra existe a nivel de caso individual. Este
// módulo lo agrega para responder las preguntas que hace un comité: cuánto
// entró, cuánto se resolvió, en qué plazo, quién lo hizo y qué se repite.
//
// Funciones puras: entran datos, sale un objeto. Sin fechas implícitas ni
// lectura del reloj salvo donde se declara — así el informe de un período
// cerrado da siempre lo mismo, se genere hoy o dentro de seis meses.

import { getEstadoCaso, getOrigen, hitosSLA } from "./casos.js";
import { senalesActivas } from "./aml.js";
import { parseFechaAR } from "./utils.js";

// ── Rangos de período ───────────────────────────────────────────────────────
var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
             'agosto','septiembre','octubre','noviembre','diciembre'];

function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// tipo: 'mes' | 'trimestre' | 'anio'. ref: Date dentro del período buscado.
function rangoPeriodo(tipo, ref) {
  var r = ref ? new Date(ref.getTime()) : new Date();
  var y = r.getFullYear(), m = r.getMonth();
  var desde, hasta, label;

  if (tipo === 'anio') {
    desde = new Date(y, 0, 1); hasta = new Date(y, 11, 31);
    label = 'Año ' + y;
  } else if (tipo === 'trimestre') {
    var q = Math.floor(m / 3);
    desde = new Date(y, q*3, 1); hasta = new Date(y, q*3+3, 0);
    label = 'T' + (q+1) + ' ' + y;
  } else {
    desde = new Date(y, m, 1); hasta = new Date(y, m+1, 0);
    label = MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + ' ' + y;
  }
  desde.setHours(0,0,0,0); hasta.setHours(23,59,59,999);
  return { desde: desde, hasta: hasta, label: label, tipo: tipo, isoDesde: iso(desde), isoHasta: iso(hasta) };
}

function enRango(fechaAR, rango) {
  var f = parseFechaAR(fechaAR);
  if (!f) return false;
  return f >= rango.desde && f <= rango.hasta;
}
function antesDe(fechaAR, limite) {
  var f = parseFechaAR(fechaAR);
  return f ? f < limite : false;
}
function diasEntre(aAR, bAR) {
  var a = parseFechaAR(aAR), b = parseFechaAR(bAR);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

// ── Estadística ─────────────────────────────────────────────────────────────
function mediana(arr) {
  if (!arr.length) return null;
  var s = arr.slice().sort(function(a,b){ return a-b; });
  var m = Math.floor(s.length/2);
  return s.length % 2 ? s[m] : Math.round((s[m-1]+s[m])/2 * 10) / 10;
}
function percentil(arr, p) {
  if (!arr.length) return null;
  var s = arr.slice().sort(function(a,b){ return a-b; });
  var i = Math.min(s.length - 1, Math.ceil(p/100 * s.length) - 1);
  return s[Math.max(0, i)];
}
function promedio(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce(function(a,b){ return a+b; }, 0) / arr.length * 10) / 10;
}

// ── Recorrido del caso ──────────────────────────────────────────────────────
// Fecha en que el caso entró a un estado, según su historial.
function fechaEstado(caso, estado) {
  var h = (caso.historial || []).find(function(x){ return x.estado === estado; });
  return h ? h.fecha : null;
}
function fechaCierreReal(caso) {
  if (caso.fechaCierre) return caso.fechaCierre;
  return fechaEstado(caso, 'CERRADA_SIN_ROS') || fechaEstado(caso, 'ROS_PRESENTADO');
}

// Un caso cerrado se considera EN PLAZO si al cerrar no tenía ningún hito
// vencido. Se reconstruye con las fechas selladas, no con el reloj de hoy.
function cerradoEnPlazo(caso) {
  var cierre = parseFechaAR(fechaCierreReal(caso));
  if (!cierre) return null;
  // Se evalúa el caso "congelado" el día del cierre pero aún abierto, para que
  // hitosSLA calcule los plazos que corrían en ese momento.
  var congelado = Object.assign({}, caso, { estado: 'EN_ANALISIS' });
  var hitos = hitosSLA(congelado);
  if (!hitos.length) return null;
  return hitos.every(function(h){ return h.limite >= cierre; });
}

// ═══════════════════════════════════════════════════════════════════════════
// MÉTRICAS DEL PERÍODO
// ═══════════════════════════════════════════════════════════════════════════
function metricasComite(datos) {
  var casos    = datos.casos || [];
  var legajos  = datos.legajos || [];
  var periodos = datos.periodos || [];
  var runs     = datos.screeningRuns || [];
  var rango    = datos.rango || rangoPeriodo('mes');

  // ── Casos ────────────────────────────────────────────────────────────────
  var creados = casos.filter(function(c){ return enRango(c.fechaApertura, rango); });
  var cerrados = casos.filter(function(c){
    var f = fechaCierreReal(c);
    return f && enRango(f, rango);
  });
  // Foto al inicio: abiertos antes del período y no cerrados antes del período
  var arrastre = casos.filter(function(c){
    if (!antesDe(c.fechaApertura, rango.desde)) return false;
    var f = fechaCierreReal(c);
    return !f || !antesDe(f, rango.desde);
  });
  var abiertosHoy = casos.filter(function(c){ return getEstadoCaso(c.estado).abierto; });

  function contar(lista, campo, getter) {
    var m = {};
    lista.forEach(function(c){
      var k = getter ? getter(c) : (c[campo] || 'N/D');
      m[k] = (m[k] || 0) + 1;
    });
    return Object.keys(m).map(function(k){ return { clave:k, n:m[k] }; })
      .sort(function(a,b){ return b.n - a.n; });
  }

  var conRos    = cerrados.filter(function(c){ return c.estado === 'ROS_PRESENTADO'; });
  var sinRos    = cerrados.filter(function(c){ return c.estado === 'CERRADA_SIN_ROS'; });

  // ── Tiempos de resolución ────────────────────────────────────────────────
  var duraciones = cerrados.map(function(c){ return diasEntre(c.fechaApertura, fechaCierreReal(c)); })
                           .filter(function(d){ return d !== null && d >= 0; });

  // ── Cumplimiento de plazos ───────────────────────────────────────────────
  var evaluados = cerrados.map(cerradoEnPlazo).filter(function(v){ return v !== null; });
  var enPlazo   = evaluados.filter(Boolean).length;
  var vencidosAbiertos = abiertosHoy.filter(function(c){
    return hitosSLA(c).some(function(h){ return h.estado === 'VENCIDO'; });
  });

  // ── Por analista ─────────────────────────────────────────────────────────
  var nombres = {};
  casos.forEach(function(c){ if (c.analista) nombres[c.analista] = true; });
  var analistas = Object.keys(nombres).map(function(nom){
    var suyos       = casos.filter(function(c){ return c.analista === nom; });
    var suyCerrados = cerrados.filter(function(c){ return c.analista === nom; });
    var dur = suyCerrados.map(function(c){ return diasEntre(c.fechaApertura, fechaCierreReal(c)); })
                         .filter(function(d){ return d !== null && d >= 0; });
    return {
      nombre: nom,
      abiertos: suyos.filter(function(c){ return getEstadoCaso(c.estado).abierto; }).length,
      creadosPeriodo: creados.filter(function(c){ return c.analista === nom; }).length,
      cerrados: suyCerrados.length,
      medianaDias: mediana(dur),
      vencidos: vencidosAbiertos.filter(function(c){ return c.analista === nom; }).length
    };
  }).sort(function(a,b){ return b.cerrados - a.cerrados || b.abiertos - a.abiertos; });

  var sinAsignar = abiertosHoy.filter(function(c){ return !c.analista; }).length;

  // ── Señales ──────────────────────────────────────────────────────────────
  var legIndex = {};
  legajos.forEach(function(l){ legIndex[l.id] = l; });
  var senalesActivasTot = [], porPatron = {};
  periodos.forEach(function(p){
    var leg = legIndex[p.legajoId];
    if (!leg) return;
    senalesActivas(p, leg, periodos).forEach(function(s){
      senalesActivasTot.push(s);
      porPatron[s.pat] = (porPatron[s.pat] || 0) + 1;
    });
  });
  // Resueltas dentro del período, con su responsable
  var resueltas = [];
  periodos.forEach(function(p){
    var res = p.sigsResolucion || {};
    Object.keys(res).forEach(function(pat){
      var r = res[pat];
      if (r && r.estado === 'RESUELTA' && enRango(r.aprobadoAt, rango)) {
        resueltas.push({ pat: pat, por: r.aprobadoPor || 'N/D', fecha: r.aprobadoAt });
      }
    });
  });

  // ── Cartera ──────────────────────────────────────────────────────────────
  var altasPeriodo = legajos.filter(function(l){ return enRango(l.createdAt, rango); });

  // ── Screening ────────────────────────────────────────────────────────────
  var runsPeriodo = runs.filter(function(r){
    if (!r.fecha) return false;
    var f = new Date(r.fecha);
    return f >= rango.desde && f <= rango.hasta;
  });

  return {
    rango: rango,
    generado: datos.generado || null,   // se pasa explícito: no se lee el reloj acá

    casos: {
      arrastre: arrastre.length,
      creados: creados.length,
      cerrados: cerrados.length,
      abiertosHoy: abiertosHoy.length,
      sinAsignar: sinAsignar,
      conRos: conRos.length,
      sinRos: sinRos.length,
      porOrigen: contar(creados, null, function(c){ return getOrigen(c.origen).label; }),
      porPrioridad: contar(creados, 'prioridad'),
      porEstado: contar(abiertosHoy, null, function(c){ return getEstadoCaso(c.estado).label; })
    },

    tiempos: {
      muestra: duraciones.length,
      mediana: mediana(duraciones),
      promedio: promedio(duraciones),
      p90: percentil(duraciones, 90),
      max: duraciones.length ? Math.max.apply(null, duraciones) : null
    },

    plazos: {
      evaluados: evaluados.length,
      enPlazo: enPlazo,
      fueraPlazo: evaluados.length - enPlazo,
      pctEnPlazo: evaluados.length ? Math.round(enPlazo / evaluados.length * 100) : null,
      vencidosAbiertos: vencidosAbiertos.length
    },

    analistas: analistas,

    senales: {
      activas: senalesActivasTot.length,
      activasAlta: senalesActivasTot.filter(function(s){ return s.sev === 'ALTA'; }).length,
      resueltasPeriodo: resueltas.length,
      porPatron: Object.keys(porPatron).map(function(k){ return { clave:k, n:porPatron[k] }; })
                       .sort(function(a,b){ return b.n - a.n; }).slice(0, 8),
      resueltasPor: contar(resueltas, 'por')
    },

    cartera: {
      total: legajos.length,
      altasPeriodo: altasPeriodo.length,
      porSegmento: contar(legajos, 'segmento'),
      porEstado: contar(legajos, null, function(l){ return l.estadoCuenta || 'EN_ONBOARDING'; }),
      periodosAnalizados: periodos.filter(function(p){ return enRango(p.createdAt, rango); }).length
    },

    screening: {
      corridasPeriodo: runsPeriodo.length,
      ultimaCorrida: runs.length ? runs[0].fecha : null,
      hitsAlta: runsPeriodo.reduce(function(a,r){ return a + ((r.resumen && r.resumen.alta) || 0); }, 0)
    }
  };
}

export {
  rangoPeriodo, metricasComite, mediana, percentil, promedio,
  diasEntre, fechaCierreReal, cerradoEnPlazo, enRango, MESES
};
