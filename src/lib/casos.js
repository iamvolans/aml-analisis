// ═══════════════════════════════════════════════════════════════════════════
// casos.js — Modelo de Case Management con plazos regulatorios (T3)
// ═══════════════════════════════════════════════════════════════════════════
// Un "caso" es la unidad de trabajo de compliance: nace de una señal AML, de un
// screening, de un RFI o se crea a mano, y recorre un ciclo de vida con plazos
// contados. Es la pieza que convierte alertas sueltas en trazabilidad auditable.

import { T } from "./theme";
import { senalesActivas } from "./aml";
import { parseFechaAR, todayStr, uid } from "./utils";

// ─── PLAZOS ─────────────────────────────────────────────────────────────────
// ⚠️ PARAMETRIZABLE — VERIFICAR CONTRA LA NORMATIVA VIGENTE ANTES DE OPERAR.
//
// Los valores por defecto reflejan el régimen general de la Ley 25.246 y las
// resoluciones UIF: 15 días corridos para reportar desde que el sujeto obligado
// califica la operación como sospechosa, con un tope de 150 días corridos desde
// la fecha de la operación, y 48 horas para financiamiento del terrorismo.
//
// Estos plazos cambian por resolución y pueden diferir para PSPCP. Germán
// (Oficial de Cumplimiento titular) debería validar cada número contra la
// resolución aplicable antes de que el panel se use como control operativo.
// Cambiar un valor acá recalcula todos los contadores de la app.
var SLA = {
  ROS_CALIFICACION:    15,  // días corridos desde fechaCalificacion
  ROS_MAX_OPERACION:  150,  // días corridos desde la fecha de la operación
  ROS_FT_HORAS:        48,  // horas — financiamiento del terrorismo
  RFI_RESPUESTA:        7,  // días — política interna Rebit
  ESCALAMIENTO_COMITE: 10,  // días en análisis antes de elevar — política interna
  INICIO_ANALISIS:      2,  // días para tomar una caso nuevo — política interna
};

// Umbral para pintar un plazo como "próximo a vencer"
var DIAS_AVISO = 3;

// ─── CICLO DE VIDA ──────────────────────────────────────────────────────────
var ESTADOS_CASO = [
  { id:'NUEVA',             label:'Nueva',              col:T.TEXT2,  bg:'rgba(148,166,189,0.10)', abierto:true,  desc:'Sin asignar ni analizar' },
  { id:'EN_ANALISIS',       label:'En análisis',        col:T.ACCENT, bg:'rgba(61,126,255,0.10)',  abierto:true,  desc:'Analista trabajando el caso' },
  { id:'RFI_ENVIADO',       label:'RFI enviado',        col:T.AMBER,  bg:'rgba(255,184,48,0.10)',  abierto:true,  desc:'Esperando respuesta del cliente' },
  { id:'COMITE',            label:'En comité',          col:T.VIOLET, bg:'rgba(139,124,246,0.10)', abierto:true,  desc:'Elevado para decisión' },
  { id:'CERRADA_SIN_ROS',   label:'Cerrada sin ROS',    col:T.GREEN,  bg:'rgba(0,230,118,0.10)',   abierto:false, desc:'Descartada con fundamento' },
  { id:'ROS_PRESENTADO',    label:'ROS presentado',     col:T.RED,    bg:'rgba(255,68,85,0.10)',   abierto:false, desc:'Reportado conforme al régimen aplicable' },
];
function getEstadoCaso(id) { return ESTADOS_CASO.find(function(e){return e.id===id;}) || ESTADOS_CASO[0]; }

var ORIGENES = [
  { id:'SENAL',      label:'Señal AML',  icon:'🚨' },
  { id:'SCREENING',  label:'Screening',  icon:'🛡' },
  { id:'RFI',        label:'RFI',        icon:'📧' },
  { id:'MANUAL',     label:'Manual',     icon:'✍️' },
  { id:'VENCIMIENTO',label:'Vencimiento', icon:'📅' },
];
function getOrigen(id) { return ORIGENES.find(function(o){return o.id===id;}) || ORIGENES[3]; }

var PRIORIDADES = [
  { id:'ALTA',  label:'Alta',  col:T.RED,   ord:0 },
  { id:'MEDIA', label:'Media', col:T.AMBER, ord:1 },
  { id:'BAJA',  label:'Baja',  col:T.TEXT3, ord:2 },
];
function getPrioridad(id) { return PRIORIDADES.find(function(p){return p.id===id;}) || PRIORIDADES[1]; }

// ─── FECHAS ─────────────────────────────────────────────────────────────────
function hoy0() { var d = new Date(); d.setHours(0,0,0,0); return d; }

function sumarDias(fechaStr, dias) {
  var f = parseFechaAR(fechaStr);
  if (!f) return null;
  var d = new Date(f.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}
function fmtFecha(d) {
  if (!d) return '—';
  return d.toLocaleDateString('es-AR');
}
function diasHasta(d) {
  if (!d) return null;
  return Math.round((d.getTime() - hoy0().getTime()) / 86400000);
}

// ─── HITOS DE PLAZO ─────────────────────────────────────────────────────────
// Devuelve los plazos aplicables al caso según su estado, ordenados por urgencia.
// Un caso cerrado no tiene hitos activos.
function hitosSLA(caso) {
  if (!caso) return [];
  var est = getEstadoCaso(caso.estado);
  if (!est.abierto) return [];

  var hitos = [];
  function add(id, label, fechaBase, dias, nota) {
    var limite = sumarDias(fechaBase, dias);
    if (!limite) return;
    var rest = diasHasta(limite);
    hitos.push({
      id: id, label: label, limite: limite, dias: rest, nota: nota || '',
      estado: rest < 0 ? 'VENCIDO' : rest <= DIAS_AVISO ? 'PROXIMO' : 'OK'
    });
  }

  if (caso.estado === 'NUEVA') {
    add('inicio', 'Tomar el caso', caso.fechaApertura, SLA.INICIO_ANALISIS, 'Política interna');
  }
  if (caso.estado === 'EN_ANALISIS') {
    add('comite', 'Elevar a comité', caso.fechaApertura, SLA.ESCALAMIENTO_COMITE, 'Política interna');
  }
  if (caso.estado === 'RFI_ENVIADO' && caso.fechaRfi) {
    add('rfi', 'Respuesta del cliente', caso.fechaRfi, SLA.RFI_RESPUESTA, 'Política interna');
  }
  // Plazo de reporte: corre desde que el caso se calificó como sospechoso
  if (caso.fechaCalificacion) {
    add('ros', 'Plazo de reporte', caso.fechaCalificacion, SLA.ROS_CALIFICACION, 'Desde la calificación');
  }
  // Tope duro desde la operación — corre siempre mientras el caso esté abierto
  if (caso.fechaOperacion) {
    add('tope', 'Tope desde la operación', caso.fechaOperacion, SLA.ROS_MAX_OPERACION, 'Plazo máximo');
  }

  hitos.sort(function(a,b){ return a.dias - b.dias; });
  return hitos;
}

// El hito más urgente — es lo que se muestra en la tabla
function slaCritico(caso) {
  var h = hitosSLA(caso);
  return h.length ? h[0] : null;
}

function colorSLA(estado) {
  return estado === 'VENCIDO' ? T.RED : estado === 'PROXIMO' ? T.AMBER : T.GREEN;
}

// ─── CONSTRUCCIÓN ───────────────────────────────────────────────────────────
function nuevoCaso(campos) {
  var ahora = new Date();
  var base = {
    id: uid(),
    ref: '',
    legajoId: '',
    legajoNom: '',
    origen: 'MANUAL',
    estado: 'NUEVA',
    prioridad: 'MEDIA',
    titulo: '',
    detalle: '',
    analista: '',
    // Referencias al hecho que originó el caso
    periodoId: '',
    periodoNom: '',
    pat: '',
    sev: '',
    // Fechas (todas en formato es-AR DD/MM/AAAA)
    fechaApertura: todayStr(),
    fechaOperacion: '',      // fecha del período que originó el caso
    fechaCalificacion: '',   // se sella al calificar como sospechoso
    fechaRfi: '',            // se sella al pasar a RFI_ENVIADO
    fechaCierre: '',
    vencKey: '',            // clave del vencimiento que originó el caso (T4)
    comentarios: [],
    historial: [{
      estado: 'NUEVA',
      fecha: todayStr(),
      hora: ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
      autor: 'Sistema',
      nota: 'Caso abierto'
    }]
  };
  return Object.assign(base, campos || {});
}

function refCaso(legajoNom, n) {
  var emp = (legajoNom||'').replace(/[^A-Z0-9]/gi,'').slice(0,6).toUpperCase() || 'GRAL';
  return 'CASO-' + emp + '-' + new Date().getFullYear() + '-' + String(n).padStart(3,'0');
}

// Clave de deduplicación: un caso por (período, patrón)
function claveSenal(periodoId, pat) { return periodoId + '::' + pat; }

// ─── GENERACIÓN AUTOMÁTICA DESDE SEÑALES ────────────────────────────────────
// Devuelve los casos que FALTAN crear para las señales ALTA activas. No crea
// nada por sí solo: la vista muestra el preview y el usuario confirma. En un
// sistema con trazabilidad regulatoria no conviene que se materialicen registros
// sin que quede claro quién los originó y cuándo.
function casosPendientesDeCrear(legajos, periodos, casosExistentes) {
  var yaHay = {};
  (casosExistentes||[]).forEach(function(c){
    if (c.periodoId && c.pat) yaHay[claveSenal(c.periodoId, c.pat)] = true;
  });

  var pendientes = [];
  (periodos||[]).forEach(function(p){
    var leg = (legajos||[]).find(function(l){return l.id===p.legajoId;});
    if (!leg) return;
    senalesActivas(p, leg).forEach(function(s){
      if (s.sev !== 'ALTA') return;
      if (yaHay[claveSenal(p.id, s.pat)]) return;
      pendientes.push({
        legajoId: leg.id,
        legajoNom: leg.razonSocial || 'Sin nombre',
        origen: 'SENAL',
        prioridad: 'ALTA',
        titulo: s.titulo,
        detalle: s.desc + (s.tip ? '\n\nAcción sugerida: ' + s.tip : ''),
        periodoId: p.id,
        periodoNom: p.nombre || '',
        pat: s.pat,
        sev: s.sev,
        fechaOperacion: p.createdAt || '',
      });
    });
  });
  return pendientes;
}

// ─── TRANSICIONES ───────────────────────────────────────────────────────────
// Cambiar de estado sella las fechas que disparan cada contador.
function cambiarEstadoCaso(caso, nuevoEstado, autor, nota) {
  var ahora = new Date();
  var n = Object.assign({}, caso, { estado: nuevoEstado });

  // Al elevar a comité se considera calificado como sospechoso: arranca el
  // plazo de reporte. Si ya estaba sellado no se pisa.
  if (nuevoEstado === 'COMITE' && !n.fechaCalificacion) n.fechaCalificacion = todayStr();
  if (nuevoEstado === 'RFI_ENVIADO' && !n.fechaRfi) n.fechaRfi = todayStr();
  if (nuevoEstado === 'CERRADA_SIN_ROS' || nuevoEstado === 'ROS_PRESENTADO') n.fechaCierre = todayStr();

  n.historial = (caso.historial||[]).concat([{
    estado: nuevoEstado,
    fecha: todayStr(),
    hora: ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
    autor: autor || 'Analista',
    nota: nota || ''
  }]);
  return n;
}

export {
  SLA, DIAS_AVISO,
  ESTADOS_CASO, getEstadoCaso, ORIGENES, getOrigen, PRIORIDADES, getPrioridad,
  hitosSLA, slaCritico, colorSLA, fmtFecha, diasHasta, sumarDias,
  nuevoCaso, refCaso, claveSenal, casosPendientesDeCrear, cambiarEstadoCaso
};
