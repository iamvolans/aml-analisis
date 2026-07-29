import { C, T } from "./theme";
import { fmtM, uid } from "./utils";

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

function detectPatrones(m, perfil) {
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

export { calcMetricas, detectPatrones, calcScoring };
