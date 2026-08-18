import { C, T } from "./theme.js";
import { fmtM, uid } from "./utils.js";

function calcMetricas(txns, perfil) {
  if (!txns || !txns.length) return null;
  var ins = txns.filter(function(t) { return t.tipo === 'IN'; });
  var outs = txns.filter(function(t) { return t.tipo === 'OUT'; });
  var tIn = ins.reduce(function(s,t) { return s+t.monto; }, 0);
  var tOut = outs.reduce(function(s,t) { return s+t.monto; }, 0);
  var tVol = tIn + tOut;
  var montos = txns.map(function(t) { return t.monto; }).sort(function(a,b) { return a-b; });
  var avg = tVol / txns.length;
  var cpIn = {}, cpOut = {};
  ins.forEach(function(t) { var k=t.contraparte_nombre||t.contraparte_cuit||'Desconocido'; cpIn[k]=(cpIn[k]||0)+t.monto; });
  outs.forEach(function(t) { var k=t.contraparte_nombre||t.contraparte_cuit||'Desconocido'; cpOut[k]=(cpOut[k]||0)+t.monto; });
  var sortedIn = Object.entries(cpIn).sort(function(a,b) { return b[1]-a[1]; });
  var sortedOut = Object.entries(cpOut).sort(function(a,b) { return b[1]-a[1]; });
  function hhi(obj, total) { return total > 0 ? Object.values(obj).reduce(function(s,v) { return s+Math.pow(v/total,2); }, 0) : 0; }
  var hhiIn = hhi(cpIn, tIn), hhiOut = hhi(cpOut, tOut);
  var byDayDest = {};
  ins.forEach(function(t) { var k=(t.fecha||'')+'__'+(t.contraparte_nombre||t.contraparte_cuit||'?'); if(!byDayDest[k]) byDayDest[k]=[]; byDayDest[k].push(t.monto); });
  var splitGroups = Object.entries(byDayDest).filter(function(e) { return e[1].length >= 3; });
  var splitDaysSet = {}; splitGroups.forEach(function(e) { splitDaysSet[e[0].split('__')[0]] = 1; });
  var splitDays = Object.keys(splitDaysSet).length;
  var roundCount = txns.filter(function(t) { return t.monto >= 100000 && t.monto % 100000 === 0; }).length;
  var cpAll = {}; txns.forEach(function(t) { var k=t.contraparte_nombre||t.contraparte_cuit||'Desconocido'; cpAll[k]=(cpAll[k]||0)+1; });
  var totalUcp = Object.keys(cpAll).length;
  var oneShotCnt = Object.values(cpAll).filter(function(v) { return v === 1; }).length;
  var amtCount = {}; txns.forEach(function(t) { amtCount[t.monto]=(amtCount[t.monto]||0)+1; });
  var repeatedAmts = Object.entries(amtCount).filter(function(e) { return e[1] >= 3; }).map(function(e) { return { monto:Number(e[0]), count:e[1] }; });
  var cpOutSet = new Set(Object.keys(cpOut));
  var circularCps = Object.keys(cpIn).filter(function(k) { return cpOutSet.has(k); });
  // PAT-10 — Near-threshold structuring: ops entre $680K–$799.999 agrupadas por contraparte
  var NT_LOW = 680000, NT_HIGH = 800000;
  var ntCpIn = {}, ntCpOut = {};
  ins.forEach(function(t) {
    if (t.monto >= NT_LOW && t.monto < NT_HIGH) {
      var k = t.contraparte_cuit || t.contraparte_nombre || 'Desconocido';
      ntCpIn[k] = (ntCpIn[k]||0) + 1;
    }
  });
  outs.forEach(function(t) {
    if (t.monto >= NT_LOW && t.monto < NT_HIGH) {
      var k = t.contraparte_cuit || t.contraparte_nombre || 'Desconocido';
      ntCpOut[k] = (ntCpOut[k]||0) + 1;
    }
  });
  var ntGroupsIn  = Object.entries(ntCpIn).filter(function(e) { return e[1] >= 5; });
  var ntGroupsOut = Object.entries(ntCpOut).filter(function(e) { return e[1] >= 5; });
  var dailyMap = {};
  txns.forEach(function(t) { var d=t.fecha||'N/D'; if(!dailyMap[d]) dailyMap[d]={d:d,in:0,out:0}; if(t.tipo==='IN') dailyMap[d].in+=t.monto; else dailyMap[d].out+=t.monto; });
  var dates = Object.keys(dailyMap).sort();
  var dailyVol = dates.map(function(d) { return dailyMap[d]; });
  var withHour = txns.filter(function(t) { return t.hora; });
  var atypical = withHour.filter(function(t) { var h=parseInt((t.hora||'').split(':')[0]); return h < 8 || h >= 20; });
return { tIn:tIn, tOut:tOut, tVol:tVol, balanceNeto:tIn-tOut, countIn:ins.length, countOut:outs.length, totalTxns:txns.length, avg:avg, maxMonto:montos[montos.length-1]||0, minMonto:montos[0]||0, cpIn:cpIn, cpOut:cpOut, sortedIn:sortedIn, sortedOut:sortedOut, uniqueCpIn:Object.keys(cpIn).length, uniqueCpOut:Object.keys(cpOut).length, top1In:tIn>0?(sortedIn[0]?sortedIn[0][1]:0)/tIn*100:0, top1Out:tOut>0?(sortedOut[0]?sortedOut[0][1]:0)/tOut*100:0, hhiIn:hhiIn, hhiOut:hhiOut, ratioCpEmbudo:Object.keys(cpIn).length/(Object.keys(cpOut).length||1), ratioIO:tVol>0?tIn/tVol:0.5, ratioVP:perfil&&perfil.facturacionMensual>0?tVol/Number(perfil.facturacionMensual):null, splitDays:splitDays, splitGroupsCount:splitGroups.length, pctRound:txns.length>0?roundCount/txns.length*100:0, pctOneShot:totalUcp>0?oneShotCnt/totalUcp*100:0, repeatedAmts:repeatedAmts, circularCps:circularCps, circularCount:circularCps.length, activeDays:dates.length, opsByDay:txns.length/(dates.length||1), dates:dates, dailyVol:dailyVol, passThrough:tIn>0?tOut/tIn:0, pctAtypicalHour:withHour.length>0?atypical.length/withHour.length*100:null, ntGroupsIn:ntGroupsIn, ntGroupsOut:ntGroupsOut };
}

// ═══════════════════════════════════════════════════════════════════════════
// LÍNEA BASE DE COMPORTAMIENTO (T6)
// ═══════════════════════════════════════════════════════════════════════════
// Los patrones PAT-01..12 evalúan un período contra umbrales fijos. Los PAT-13
// a 15 lo evalúan contra el propio historial del cliente: lo que para uno es
// normal, para otro es una anomalía. Sin esto, un cliente que siempre opera
// fuerte nunca se destaca y uno chico que duplica su volumen tampoco.
//
// ⚠️ PARAMETRIZABLE — calibrar con datos reales antes de operar.
var COMPORTAMIENTO = {
  MIN_PERIODOS:      2,    // línea base mínima para que los patrones activen
  VENTANA:           6,    // cuántos períodos previos promediar
  DESVIO_VOLUMEN:    3,    // PAT-13: múltiplo del volumen promedio
  DESVIO_VOLUMEN_ALTA: 5,  // idem, umbral de severidad ALTA
  CONC_NUEVA:        40,   // PAT-14: % del flujo en una contraparte nueva
  SALTO_HORARIO:     25,   // PAT-15: salto en puntos porcentuales de ops atípicas
};

function _mediana(arr) {
  if (!arr.length) return 0;
  var s = arr.slice().sort(function(a,b){ return a-b; });
  var mid = Math.floor(s.length/2);
  return s.length % 2 ? s[mid] : (s[mid-1]+s[mid])/2;
}

// Períodos del mismo legajo anteriores al actual, con métricas disponibles.
// Se ordenan por createdAt; si empatan, se usa el orden del array.
function lineaBase(periodo, legajo, periodos) {
  if (!periodo || !periodos || !periodos.length) return null;
  var delLegajo = periodos.filter(function(p){ return p.legajoId === periodo.legajoId; });
  var idx = delLegajo.findIndex(function(p){ return p.id === periodo.id; });
  if (idx < 0) return null;
  var previos = delLegajo.slice(Math.max(0, idx - COMPORTAMIENTO.VENTANA), idx)
    .map(function(p){ return p.metricas || null; })
    .filter(Boolean);
  if (previos.length < COMPORTAMIENTO.MIN_PERIODOS) return null;

  var vols  = previos.map(function(x){ return x.tVol || 0; });
  var txns  = previos.map(function(x){ return x.totalTxns || 0; });
  var horas = previos.map(function(x){ return x.pctAtypicalHour; }).filter(function(v){ return v !== null && v !== undefined; });

  // Contrapartes ya vistas: son las "habituales" del cliente
  var habituales = {};
  previos.forEach(function(x){
    Object.keys(x.cpIn || {}).forEach(function(k){ habituales[k] = true; });
    Object.keys(x.cpOut || {}).forEach(function(k){ habituales[k] = true; });
  });

  return {
    nPeriodos: previos.length,
    // Mediana en vez de promedio: un solo período atípico previo no corre la
    // línea base y hace que la anomalía siguiente pase desapercibida.
    volMediano:  _mediana(vols),
    txnsMediano: _mediana(txns),
    pctHorarioMediano: horas.length ? _mediana(horas) : null,
    habituales: habituales,
    cantHabituales: Object.keys(habituales).length,
  };
}

function detectPatrones(m, perfil, base) {
  if (!m) return [];
  var sigs = [];
  function add(pat, sev, titulo, desc, tip) { sigs.push({ id:uid(), pat:pat, sev:sev, titulo:titulo, desc:desc, tip:tip }); }
  if (m.splitGroupsCount > 0) add('PAT-01', m.splitDays >= 3 ? 'ALTA' : 'MEDIA', 'Fraccionamiento (structuring)', m.splitGroupsCount + ' grupo(s) con 3+ ops al mismo destino en igual dia (' + m.splitDays + ' dias afectados).', 'T-01');
  if (m.ratioCpEmbudo > 5 && m.uniqueCpIn > 5) add('PAT-02', 'ALTA', 'Cuenta embudo (funnel account)', 'Ratio IN:OUT = ' + m.uniqueCpIn + ':' + m.uniqueCpOut + ' = ' + m.ratioCpEmbudo.toFixed(1) + ':1 (umbral 5:1).', 'T-04');
  if (m.circularCount > 0) add('PAT-03', 'ALTA', 'Posible circularidad (layering)', m.circularCount + ' contraparte(s) como origen Y destino.', 'T-03');
  if (m.pctOneShot > 60 && m.uniqueCpIn > 8) add('PAT-04', 'ALTA', 'Smurfing — contrapartes one-shot', m.pctOneShot.toFixed(1) + '% de contrapartes aparecen 1 sola vez (umbral 60%).', 'T-02');
  if (m.ratioVP !== null) {
    // Verificar si hay aumento de límite vigente que cubra este período
    var limVigente = null;
    if (perfil && perfil.limitesHistorial) {
      limVigente = perfil.limitesHistorial.find(function(lim) {
        if (lim.estado !== 'VIGENTE') return false;
        if (lim.tipo === 'AUMENTO_PERMANENTE') return true;
        // Para temporales, verificar fechas
        if (!lim.vigenciaDesde) return true; // sin fecha = siempre vigente
        var hoy = new Date().toISOString().slice(0,10);
        return hoy >= lim.vigenciaDesde && (!lim.vigenciaHasta || hoy <= lim.vigenciaHasta);
      });
    }
    if (m.ratioVP > 2.0) {
      if (limVigente) {
        // Hay aumento vigente — bajar severidad a INFO y anotar
        var limRef = limVigente.tipo === 'AUMENTO_PERMANENTE' ? 'permanente' : 'temporal hasta ' + (limVigente.vigenciaHasta||'indefinido');
        var nuevoLim = limVigente.montoNuevo ? fmtM(limVigente.montoNuevo) : 'sin tope definido';
        add('PAT-05', 'BAJA', 'Volumen excede perfil original (aumento vigente)', 'Ratio ' + m.ratioVP.toFixed(2) + 'x, pero existe aumento ' + limRef + ' a ' + nuevoLim + '. Motivo: ' + (limVigente.motivo||'—') + '. Aprobado por: ' + (limVigente.aprobadoPor||'—') + '.', 'T-05');
      } else {
        add('PAT-05', 'ALTA', 'Volumen excede perfil declarado', 'Volumen es ' + m.ratioVP.toFixed(2) + 'x el perfil mensual.', 'T-05');
      }
    } else if (m.ratioVP < 0.3) {
      add('PAT-05', 'MEDIA', 'Volumen muy inferior al perfil', 'Volumen es ' + m.ratioVP.toFixed(2) + 'x el perfil.', 'T-06');
    }
  }
  if (m.hhiIn > 0.80 || m.top1In > 80) add('PAT-06', 'ALTA', 'Concentracion extrema — cash-in', 'Top-1: ' + m.top1In.toFixed(1) + '% | HHI: ' + m.hhiIn.toFixed(3) + '.', 'T-02');
  else if (m.hhiIn > 0.50) add('PAT-06', 'MEDIA', 'Concentracion alta — cash-in', 'Top-1: ' + m.top1In.toFixed(1) + '%.', 'T-02');
  if (m.hhiOut > 0.80 || m.top1Out > 80) add('PAT-06', 'ALTA', 'Concentracion extrema — cash-out', 'Top-1: ' + m.top1Out.toFixed(1) + '%.', 'T-02');
  else if (m.hhiOut > 0.50) add('PAT-06', 'MEDIA', 'Concentracion alta — cash-out', 'Top-1: ' + m.top1Out.toFixed(1) + '%.', 'T-02');
  if (m.pctRound > 70) add('PAT-07', 'ALTA', 'Alta proporcion montos redondos', m.pctRound.toFixed(1) + '% de ops son multiples de $100K.', 'T-01');
  else if (m.pctRound > 30) add('PAT-07', 'MEDIA', 'Montos redondos frecuentes', m.pctRound.toFixed(1) + '%.', 'T-01');
  if (m.repeatedAmts.length > 0) add('PAT-07', 'MEDIA', 'Montos exactamente repetidos', m.repeatedAmts.length + ' monto(s) con 3+ ocurrencias.', 'T-01');
  if (m.pctAtypicalHour !== null && m.pctAtypicalHour > 30) add('PAT-08', 'MEDIA', 'Operaciones en horario atipico', m.pctAtypicalHour.toFixed(1) + '% fuera de 08:00-20:00.', 'T-05');
  if (m.passThrough > 0.90 && m.tIn > 0) add('PAT-09', 'ALTA', 'Pass-through — alta rotacion de fondos', 'Cash-out = ' + (m.passThrough*100).toFixed(1) + '% del cash-in.', 'T-04');
  // PAT-10 — Near-threshold structuring (contraparte recurrente)
  if (m.ntGroupsIn && m.ntGroupsIn.length > 0) {
    m.ntGroupsIn.forEach(function(g) {
      add('PAT-10', 'ALTA', 'Near-threshold structuring — cash-in',
        'Contraparte "' + g[0] + '": ' + g[1] + ' ops entre $680K–$799.999 (debajo umbral UIF $800K). Posible evasion de reporte obligatorio.', 'T-02');
    });
  }
  if (m.ntGroupsOut && m.ntGroupsOut.length > 0) {
    m.ntGroupsOut.forEach(function(g) {
      add('PAT-10', 'ALTA', 'Near-threshold structuring — cash-out',
        'Contraparte "' + g[0] + '": ' + g[1] + ' ops entre $680K–$799.999 (debajo umbral UIF $800K). Posible evasion de reporte obligatorio.', 'T-02');
    });
  }
  if (m.opsByDay > 50) add('PAT-11', 'ALTA', 'Velocidad operativa anomala', m.opsByDay.toFixed(1) + ' ops/dia (umbral: 50/dia).', 'T-04');
  if (m.uniqueCpIn > 20 && m.uniqueCpOut < 5 && m.tOut > 0) add('PAT-12', 'ALTA', 'Embudo multiple (muchos-a-pocos)', m.uniqueCpIn + ' origenes hacia ' + m.uniqueCpOut + ' destino(s).', 'T-04');

  // ── Patrones de comportamiento (T6) — requieren línea base del cliente ────
  if (base) {
    // PAT-13 — Desvío contra el propio volumen habitual
    if (base.volMediano > 0) {
      var factor = m.tVol / base.volMediano;
      if (factor >= COMPORTAMIENTO.DESVIO_VOLUMEN) {
        add('PAT-13',
          factor >= COMPORTAMIENTO.DESVIO_VOLUMEN_ALTA ? 'ALTA' : 'MEDIA',
          'Desvio contra la linea base del cliente',
          'Volumen ' + factor.toFixed(1) + 'x su mediana historica (' + fmtM(base.volMediano) +
          ' sobre ' + base.nPeriodos + ' periodo(s) previos). Umbral: ' + COMPORTAMIENTO.DESVIO_VOLUMEN + 'x.',
          'T-09');
      }
    }

    // PAT-14 — Contraparte nueva que concentra el flujo
    if (m.tVol > 0 && base.cantHabituales > 0) {
      var flujoCp = {};
      Object.keys(m.cpIn || {}).forEach(function(k){ flujoCp[k] = (flujoCp[k]||0) + m.cpIn[k]; });
      Object.keys(m.cpOut || {}).forEach(function(k){ flujoCp[k] = (flujoCp[k]||0) + m.cpOut[k]; });
      var nuevasConc = Object.keys(flujoCp)
        .filter(function(k){ return !base.habituales[k]; })
        .map(function(k){ return { cp: k, pct: flujoCp[k] / m.tVol * 100 }; })
        .filter(function(x){ return x.pct >= COMPORTAMIENTO.CONC_NUEVA; })
        .sort(function(a,b){ return b.pct - a.pct; });
      if (nuevasConc.length) {
        var top = nuevasConc[0];
        add('PAT-14',
          top.pct >= 60 ? 'ALTA' : 'MEDIA',
          'Contraparte nueva concentra el flujo',
          '"' + top.cp + '" no aparece en los ' + base.nPeriodos + ' periodo(s) previos y concentra ' +
          top.pct.toFixed(1) + '% del volumen' +
          (nuevasConc.length > 1 ? ' (' + nuevasConc.length + ' contrapartes nuevas superan el umbral)' : '') +
          '. Umbral: ' + COMPORTAMIENTO.CONC_NUEVA + '%.',
          'T-03');
      }
    }

    // PAT-15 — Cambio abrupto en la distribución horaria
    if (base.pctHorarioMediano !== null && m.pctAtypicalHour !== null && m.pctAtypicalHour !== undefined) {
      var salto = m.pctAtypicalHour - base.pctHorarioMediano;
      if (salto >= COMPORTAMIENTO.SALTO_HORARIO) {
        add('PAT-15',
          salto >= 40 ? 'ALTA' : 'MEDIA',
          'Cambio abrupto de distribucion horaria',
          'Operaciones en horario atipico pasaron de ' + base.pctHorarioMediano.toFixed(1) + '% a ' +
          m.pctAtypicalHour.toFixed(1) + '% (+' + salto.toFixed(1) + ' puntos). Umbral: +' +
          COMPORTAMIENTO.SALTO_HORARIO + ' puntos.',
          'T-06');
      }
    }
  }

  return sigs;
}

function calcScoring(m, sigs) {
  if (!m) return null;
  var hhi = Math.max(m.hhiIn, m.hhiOut);
  var r = m.ratioIO;
  var rvpScore = m.ratioVP === null ? 2 : (m.ratioVP > 3 || m.ratioVP < 0.1 ? 5 : (m.ratioVP > 1.5 || m.ratioVP < 0.3 ? 3 : 1));
  var sc = [
    { factor:'Volumen vs perfil', score:rvpScore, ref:m.ratioVP ? m.ratioVP.toFixed(2)+'x' : 'N/D' },
    { factor:'Concentracion cp.', score:hhi>0.70?5:(hhi>0.30?3:1), ref:'HHI '+hhi.toFixed(2) },
    { factor:'Fraccionamiento', score:m.splitDays>=3?5:(m.splitDays>=1?3:1), ref:m.splitDays+' dias' },
    { factor:'Montos redondos', score:m.pctRound>70?5:(m.pctRound>30?3:1), ref:m.pctRound.toFixed(0)+'%' },
    { factor:'Bidireccionalidad', score:r<0.05||r>0.95?5:(r<0.15||r>0.85?3:1), ref:'IO '+r.toFixed(2) },
    { factor:'Velocidad rotacion', score:m.passThrough>0.90?5:(m.passThrough>0.70?3:1), ref:m.tIn>0?(m.passThrough*100).toFixed(0)+'%':'N/D' },
    { factor:'Cp. de riesgo', score:m.circularCount>2?5:(m.circularCount>0?3:1), ref:m.circularCount+' circ.' },
    { factor:'Consistencia temporal', score:m.pctAtypicalHour!==null&&m.pctAtypicalHour>30?4:2, ref:m.pctAtypicalHour!==null?m.pctAtypicalHour.toFixed(0)+'% noct.':'N/D' }
  ];
  var prom = sc.reduce(function(s,f) { return s+f.score; }, 0) / sc.length;
  var col = prom >= 4 ? C.ROJO : (prom >= 3 ? C.NARANJA : (prom >= 2 ? C.AMARILLO : C.VERDE));
  var clasif = prom >= 4 ? 'ALTO' : (prom >= 3 ? 'MEDIO-ALTO' : (prom >= 2 ? 'MEDIO' : 'BAJO'));
  var accion = prom >= 4 ? 'BLOQUEO inmediato + elevar ROS a UIF (plazo 30 dias)' : prom >= 3 ? 'RFI urgente + EDD (72 hs)' : prom >= 2 ? 'RFI al cliente (7 dias habiles)' : 'Monitoreo estandar';
  return { scores:sc, promedio:prom, col:col, clasificacion:clasif, accion:accion };
}

// ─── CRITERIO ÚNICO DE SEÑAL ACTIVA ──────────────────────────────────────────
// Antes cada vista contaba distinto: Análisis y Alertas desde p.metricas, el
// Dashboard con fallback a p.scoring.senales, y Legajos exigía txns en memoria
// (subreportaba). Estos dos helpers son la fuente única de verdad.
//
// Orden de preferencia de la fuente de métricas:
//   1. p.metricas   — persistido en Supabase, disponible siempre
//   2. p.txns       — solo si están hidratadas en memoria
// Una señal está ACTIVA si no tiene resolución o su estado no es RESUELTA.

function metricasDe(periodo, legajo) {
  if (!periodo) return null;
  if (periodo.metricas) return periodo.metricas;
  if (periodo.txns && periodo.txns.length) return calcMetricas(periodo.txns, legajo);
  return null;
}

// El tercer parámetro es el array COMPLETO de períodos. Sin él los patrones de
// comportamiento (PAT-13/14/15) no activan, porque no hay contra qué comparar.
// Todos los call sites lo tienen en scope: pasarlo siempre.
function senalesActivas(periodo, legajo, periodos) {
  var m = metricasDe(periodo, legajo);
  if (!m) return [];
  var base = periodos ? lineaBase(periodo, legajo, periodos) : null;
  var res = (periodo && periodo.sigsResolucion) || {};
  return detectPatrones(m, legajo, base).filter(function(s) {
    var r = res[s.pat];
    return !r || r.estado !== 'RESUELTA';
  });
}

function contarAlta(periodo, legajo, periodos) {
  return senalesActivas(periodo, legajo, periodos).filter(function(s){ return s.sev === 'ALTA'; }).length;
}

export { calcMetricas, detectPatrones, calcScoring, metricasDe, senalesActivas, contarAlta, lineaBase, COMPORTAMIENTO };
