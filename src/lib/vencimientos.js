// ═══════════════════════════════════════════════════════════════════════════
// vencimientos.js — Calendario regulatorio (T4)
// ═══════════════════════════════════════════════════════════════════════════
// Tres familias de vencimientos:
//   1. ACTUALIZACIÓN DE LEGAJO — cada cuánto hay que refrescar el KYB según el
//      segmento de riesgo del cliente.
//   2. DOCUMENTOS — vigencia de cada pieza del checklist.
//   3. INSTITUCIONALES — obligaciones periódicas del sujeto obligado, que no
//      dependen de ningún cliente en particular.

import { T } from "./theme";
import { parseFechaAR } from "./utils";

// ─── 1. ACTUALIZACIÓN DE LEGAJO (meses) ─────────────────────────────────────
// ⚠️ PARAMETRIZABLE. Frecuencia de actualización de la debida diligencia según
// el segmento. Los valores por defecto siguen el criterio del plan v3 y deben
// coincidir con lo que declara el Manual PLAFT de GOAT S.A.
var ACTUALIZACION_LEGAJO = {
  'ALTO':        12,
  'MEDIO-ALTO':  18,
  'MEDIO':       24,
  'BAJO':        36,
};

// ─── 2. VIGENCIA DE DOCUMENTOS (meses) ──────────────────────────────────────
// ⚠️ PARAMETRIZABLE. Solo los ítems listados acá vencen; el resto (estatuto,
// inscripción registral, declaración de beneficiario final) se considera de
// vigencia permanente salvo cambio societario.
var VIGENCIA_DOCS = {
  'Constancia CUIT/AFIP':                   12,
  'Acta de directorio vigente':             36,
  'Poder / Autorizacion firmante':          36,
  'DNI / Pasaporte firmante':               60,
  'Estados contables (3 ejercicios)':       12,
  'Declaracion patrimonial DDJJ':           12,
  'Comprobante domicilio fiscal':           12,
  'Comprobante domicilio comercial':        12,
  'Certificado actividad / habilitacion':   12,
  'DDJJ AML (PEP/SO/UBO)':                  12,
  'Constancia IVA / Monotributo':           12,
  'Referencias bancarias / comerciales':    12,
};

// ─── 3. OBLIGACIONES INSTITUCIONALES ────────────────────────────────────────
// ⚠️ PARAMETRIZABLE Y PENDIENTE DE VALIDACIÓN NORMATIVA.
// Estas fechas son las del régimen general tal como se conocían al construir el
// módulo. Germán debe confirmarlas contra la resolución UIF vigente aplicable a
// PSPCP y ajustar mes/día acá. Mientras no estén validadas, el panel las muestra
// con una marca de advertencia.
//
// periodicidad: 'ANUAL' (usa mes+dia) | 'MENSUAL' (usa dia)
var INSTITUCIONALES = [
  { id:'autoevaluacion', label:'Informe de autoevaluación de riesgos LA/FT/FP',
    periodicidad:'ANUAL', mes:4, dia:30, validado:false,
    nota:'Autoevaluación anual de riesgos del sujeto obligado.' },
  { id:'revisor', label:'Informe del revisor externo independiente',
    periodicidad:'ANUAL', mes:7, dia:31, validado:false,
    nota:'Revisión externa del sistema de prevención.' },
  { id:'manual', label:'Revisión anual del Manual PLAFT',
    periodicidad:'ANUAL', mes:12, dia:31, validado:true,
    nota:'Política interna: revisión y aprobación anual del manual.' },
  { id:'capacitacion', label:'Capacitación anual del personal',
    periodicidad:'ANUAL', mes:11, dia:30, validado:true,
    nota:'Política interna: plan de capacitación PLAFT.' },
  { id:'rsm', label:'Reporte sistemático mensual (RSM)',
    periodicidad:'MENSUAL', dia:15, validado:false,
    nota:'Reporte sistemático mensual a la UIF.' },
];

// Ventana de aviso: qué se considera "próximo a vencer"
var DIAS_AVISO_VENC = 30;

// ─── FECHAS ─────────────────────────────────────────────────────────────────
function hoy0() { var d = new Date(); d.setHours(0,0,0,0); return d; }

// Suma meses respetando fin de mes: 31/01 + 1 mes = 28/02, no 03/03
function sumarMeses(fechaStr, meses) {
  var f = parseFechaAR(fechaStr);
  if (!f) return null;
  var dia = f.getDate();
  var d = new Date(f.getFullYear(), f.getMonth() + meses, 1);
  var ultimoDelMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDelMes));
  return d;
}
function diasHasta(d) {
  if (!d) return null;
  return Math.round((d.getTime() - hoy0().getTime()) / 86400000);
}
function fmtFecha(d) { return d ? d.toLocaleDateString('es-AR') : '—'; }
function estadoDe(dias) {
  return dias < 0 ? 'VENCIDO' : dias <= DIAS_AVISO_VENC ? 'PROXIMO' : 'OK';
}
function colorVenc(estado) {
  return estado === 'VENCIDO' ? T.RED : estado === 'PROXIMO' ? T.AMBER : T.GREEN;
}

// La fecha más reciente en formato es-AR de un conjunto de candidatas
function fechaMasReciente(candidatas) {
  var mejor = null, mejorTs = -Infinity;
  (candidatas || []).forEach(function(c){
    if (!c) return;
    var f = parseFechaAR(c);
    if (!f) return;
    if (f.getTime() > mejorTs) { mejorTs = f.getTime(); mejor = c; }
  });
  return mejor;
}

// ─── FECHA BASE DE ACTUALIZACIÓN ────────────────────────────────────────────
// El legajo se considera "actualizado" en la más reciente de: el último período
// analizado, el último cambio de estado de cuenta, o el alta. Derivado de datos
// que ya existen, así que funciona sobre la cartera actual sin migración.
function baseActualizacion(legajo, periodos) {
  var delLegajo = (periodos || [])
    .filter(function(p){ return p.legajoId === legajo.id; })
    .map(function(p){ return p.createdAt; });
  return fechaMasReciente(delLegajo.concat([legajo.estadoCuentaUpdatedAt, legajo.createdAt]));
}

// ─── VENCIMIENTOS POR LEGAJO ────────────────────────────────────────────────
function vencimientosDeLegajo(legajo, periodos) {
  var out = [];
  var base = baseActualizacion(legajo, periodos);
  if (!base) return out;

  // a) Actualización periódica del legajo
  var meses = ACTUALIZACION_LEGAJO[legajo.segmento] || ACTUALIZACION_LEGAJO['MEDIO'];
  var limite = sumarMeses(base, meses);
  if (limite) {
    var d = diasHasta(limite);
    out.push({
      clave: 'ACT::' + legajo.id,
      tipo: 'LEGAJO',
      label: 'Actualización de legajo',
      detalle: 'Segmento ' + (legajo.segmento||'N/D') + ' — cada ' + meses + ' meses',
      legajoId: legajo.id,
      legajoNom: legajo.razonSocial || 'Sin nombre',
      base: base, limite: limite, dias: d, estado: estadoDe(d),
    });
  }

  // b) Documentos del checklist con vigencia limitada
  var checklist = legajo.checklist || {};
  var fechas = legajo.checklistFechas || {};
  Object.keys(VIGENCIA_DOCS).forEach(function(item){
    if (checklist[item] !== 'OK') return; // solo los presentes vencen
    var fechaDoc = fechas[item] || base;  // sin fecha cargada, se asume la base
    var lim = sumarMeses(fechaDoc, VIGENCIA_DOCS[item]);
    if (!lim) return;
    var dd = diasHasta(lim);
    out.push({
      clave: 'DOC::' + legajo.id + '::' + item,
      tipo: 'DOCUMENTO',
      label: item,
      detalle: 'Vigencia ' + VIGENCIA_DOCS[item] + ' meses' + (fechas[item] ? '' : ' — fecha estimada'),
      estimado: !fechas[item],
      legajoId: legajo.id,
      legajoNom: legajo.razonSocial || 'Sin nombre',
      base: fechaDoc, limite: lim, dias: dd, estado: estadoDe(dd),
    });
  });

  return out;
}

// ─── VENCIMIENTOS INSTITUCIONALES ───────────────────────────────────────────
// Próxima ocurrencia de cada obligación recurrente.
function vencimientosInstitucionales() {
  var h = hoy0();
  return INSTITUCIONALES.map(function(o){
    var lim;
    if (o.periodicidad === 'MENSUAL') {
      lim = new Date(h.getFullYear(), h.getMonth(), o.dia);
      if (lim < h) lim = new Date(h.getFullYear(), h.getMonth() + 1, o.dia);
    } else {
      lim = new Date(h.getFullYear(), o.mes - 1, o.dia);
      if (lim < h) lim = new Date(h.getFullYear() + 1, o.mes - 1, o.dia);
    }
    var d = diasHasta(lim);
    return {
      clave: 'INST::' + o.id,
      tipo: 'INSTITUCIONAL',
      label: o.label,
      detalle: (o.periodicidad === 'MENSUAL' ? 'Mensual, día ' + o.dia : 'Anual') + ' — ' + o.nota,
      validado: o.validado,
      legajoId: '', legajoNom: '',
      base: '', limite: lim, dias: d, estado: estadoDe(d),
    };
  });
}

// ─── AGREGADO ───────────────────────────────────────────────────────────────
function todosLosVencimientos(legajos, periodos) {
  var out = [];
  (legajos || []).forEach(function(l){
    out = out.concat(vencimientosDeLegajo(l, periodos));
  });
  out = out.concat(vencimientosInstitucionales());
  out.sort(function(a,b){ return a.dias - b.dias; });
  return out;
}

// ─── GENERACIÓN DE CASOS ────────────────────────────────────────────────────
// Igual que con las señales: devuelve el preview, no crea nada. Solo los ya
// vencidos generan caso; los próximos son aviso, no incumplimiento.
function vencimientosPendientesDeCaso(vencimientos, casos) {
  var yaHay = {};
  (casos || []).forEach(function(c){ if (c.vencKey) yaHay[c.vencKey] = true; });
  return (vencimientos || []).filter(function(v){
    return v.estado === 'VENCIDO' && !yaHay[v.clave];
  }).map(function(v){
    return {
      vencKey: v.clave,
      legajoId: v.legajoId,
      legajoNom: v.legajoNom || 'Institucional',
      origen: 'VENCIMIENTO',
      prioridad: v.tipo === 'INSTITUCIONAL' ? 'ALTA' : 'MEDIA',
      titulo: 'Vencido: ' + v.label,
      detalle: v.detalle + '\n\nVenció el ' + fmtFecha(v.limite) +
               ' (' + Math.abs(v.dias) + ' días atrás).' +
               (v.estimado ? '\n\nAtención: la fecha base es estimada porque el documento no tiene fecha cargada en el checklist.' : ''),
      fechaOperacion: '',
      _venc: v,
    };
  });
}

export {
  ACTUALIZACION_LEGAJO, VIGENCIA_DOCS, INSTITUCIONALES, DIAS_AVISO_VENC,
  sumarMeses, diasHasta, fmtFecha, estadoDe, colorVenc,
  baseActualizacion, vencimientosDeLegajo, vencimientosInstitucionales,
  todosLosVencimientos, vencimientosPendientesDeCaso
};
