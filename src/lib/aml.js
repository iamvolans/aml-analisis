import { C, T } from "./theme.js";
import { U, franjaUmbral } from "./umbrales.js";
import { fmtM, uid, parseFechaAR } from "./utils.js";

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
  // Se guarda la OPERACIÓN y no solo su importe: el importe alcanza para contar
  // grupos, pero no para señalar después cuáles fueron las operaciones.
  ins.forEach(function(t) { var k=(t.fecha||'')+'__'+(t.contraparte_nombre||t.contraparte_cuit||'?'); if(!byDayDest[k]) byDayDest[k]=[]; byDayDest[k].push(t); });
  var splitGroups = Object.entries(byDayDest).filter(function(e) { return e[1].length >= U.FRACC_OPS_MISMO_DIA; });
  var splitDaysSet = {}; splitGroups.forEach(function(e) { splitDaysSet[e[0].split('__')[0]] = 1; });
  var splitDays = Object.keys(splitDaysSet).length;
  var roundCount = txns.filter(function(t) { return t.monto >= U.REDONDO_MULTIPLO && t.monto % U.REDONDO_MULTIPLO === 0; }).length;
  var cpAll = {}; txns.forEach(function(t) { var k=t.contraparte_nombre||t.contraparte_cuit||'Desconocido'; cpAll[k]=(cpAll[k]||0)+1; });

  // ── ¿Hay realmente datos de contraparte? ─────────────────────────────────
  // Si el archivo no traía columna de contraparte, todas las operaciones caen
  // bajo 'Desconocido' y los cálculos de concentración dan 100% — un artefacto
  // de lectura, no un hallazgo. Los patrones que dependen de la contraparte se
  // desactivan en ese caso (ver detectPatrones).
  var conCp = txns.filter(function(t){ return t.contraparte_nombre || t.contraparte_cuit; }).length;
  var cpIdentificable = txns.length > 0 && (conCp / txns.length) >= 0.5;
  var pctSinCp = txns.length > 0 ? Math.round((1 - conCp / txns.length) * 100) : 0;
  var totalUcp = Object.keys(cpAll).length;
  var oneShotCnt = Object.values(cpAll).filter(function(v) { return v === 1; }).length;
  var amtCount = {}; txns.forEach(function(t) { amtCount[t.monto]=(amtCount[t.monto]||0)+1; });
  var repeatedAmts = Object.entries(amtCount).filter(function(e) { return e[1] >= U.REPETIDOS_MIN; }).map(function(e) { return { monto:Number(e[0]), count:e[1] }; });
  var cpOutSet = new Set(Object.keys(cpOut));
  var circularCps = Object.keys(cpIn).filter(function(k) { return cpOutSet.has(k); });
  // PAT-10 — Near-threshold structuring: ops entre $680K–$799.999 agrupadas por contraparte
  var _fr = franjaUmbral();
  var NT_LOW = _fr.desde, NT_HIGH = _fr.hasta;
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
  var ntGroupsIn  = Object.entries(ntCpIn).filter(function(e) { return e[1] >= U.UMBRAL_MIN_OPS; });
  var ntGroupsOut = Object.entries(ntCpOut).filter(function(e) { return e[1] >= U.UMBRAL_MIN_OPS; });
  // ══ EVIDENCIA POR PATRÓN ══════════════════════════════════════════════════
  // Hasta acá el cálculo produce agregados y pierde el rastro de qué operación
  // sustenta cada hallazgo. Sin ese rastro, el analista recibe "124 ops entre
  // $680K y $799.999" y tiene que reconstruir a mano cuáles son.
  //
  // Se registran POSICIONES dentro del array de transacciones, no copias: las
  // métricas se persisten y guardar las operaciones enteras multiplicaría el
  // tamaño. La posición se resuelve contra las txns cuando se necesita ver el
  // detalle.
  //
  // Solo se registra evidencia donde señalar operaciones concretas es legítimo.
  // Los patrones estructurales —cuenta embudo, tránsito de fondos,
  // muchos-a-pocos— describen la FORMA del período completo y no un subconjunto
  // de operaciones: atribuirles unas pocas sería inventar una precisión que no
  // tienen.
  var TOPE_EVIDENCIA = 300;   // acota lo que se persiste por patrón
  var evidencia = {};
  function marcar(pat, indices) {
    if (!indices || !indices.length) return;
    var prev = evidencia[pat] || { ops: [], total: 0 };
    prev.total += indices.length;
    for (var i = 0; i < indices.length && prev.ops.length < TOPE_EVIDENCIA; i++) {
      if (prev.ops.indexOf(indices[i]) < 0) prev.ops.push(indices[i]);
    }
    evidencia[pat] = prev;
  }
  // Índice de cada operación dentro del array original
  var idx = new Map();
  txns.forEach(function(t, i){ idx.set(t, i); });
  function pos(lista) { return (lista || []).map(function(t){ return idx.get(t); })
    .filter(function(i){ return i !== undefined; }); }

  // PAT-01 — las operaciones que forman cada grupo de fraccionamiento
  splitGroups.forEach(function(e){ marcar('PAT-01', pos(e[1])); });

  // PAT-03 — operaciones con contrapartes que aparecen en ambos sentidos
  if (circularCps.length) {
    var setCirc = new Set(circularCps);
    marcar('PAT-03', pos(txns.filter(function(t){
      return setCirc.has(t.contraparte_nombre || t.contraparte_cuit || 'Desconocido');
    })));
  }

  // PAT-04 — operaciones de contrapartes que aparecen una sola vez
  var unicas = Object.keys(cpAll).filter(function(k){ return cpAll[k] === 1; });
  if (unicas.length) {
    var setUni = new Set(unicas);
    marcar('PAT-04', pos(txns.filter(function(t){
      return setUni.has(t.contraparte_nombre || t.contraparte_cuit || 'Desconocido');
    })));
  }

  // Montos múltiplos de 100.000 (variante "redondos" de PAT-07)
  marcar('PAT-07:redondos', pos(txns.filter(function(t){ return t.monto >= U.REDONDO_MULTIPLO && t.monto % U.REDONDO_MULTIPLO === 0; })));

  // Concentración: la contraparte dominante de CADA lado por separado. Mezclar
  // ambas haría que la señal de cash-in mostrara operaciones de salida.
  if (sortedIn[0]) {
    marcar('PAT-06:in', pos(ins.filter(function(t){
      return (t.contraparte_nombre || t.contraparte_cuit || 'Desconocido') === sortedIn[0][0]; })));
  }
  if (sortedOut[0]) {
    marcar('PAT-06:out', pos(outs.filter(function(t){
      return (t.contraparte_nombre || t.contraparte_cuit || 'Desconocido') === sortedOut[0][0]; })));
  }

  // Importes que se repiten (variante "repetidos" de PAT-07)
  if (repeatedAmts.length) {
    var setMontos = new Set(repeatedAmts.map(function(r){ return r.monto; }));
    marcar('PAT-17', pos(txns.filter(function(t){ return setMontos.has(t.monto); })));
  }

  // PAT-10 — operaciones en la franja inmediatamente inferior al umbral,
  // limitadas a las contrapartes que efectivamente forman grupo
  function enFranja(t) { return t.monto >= NT_LOW && t.monto < NT_HIGH; }
  var setNtIn  = new Set(ntGroupsIn.map(function(e){ return e[0]; }));
  var setNtOut = new Set(ntGroupsOut.map(function(e){ return e[0]; }));
  if (setNtIn.size) {
    marcar('PAT-10:in', pos(ins.filter(function(t){
      return enFranja(t) && setNtIn.has(t.contraparte_cuit || t.contraparte_nombre || 'Desconocido'); })));
  }
  if (setNtOut.size) {
    marcar('PAT-10:out', pos(outs.filter(function(t){
      return enFranja(t) && setNtOut.has(t.contraparte_cuit || t.contraparte_nombre || 'Desconocido'); })));
  }

  var dailyMap = {};
  txns.forEach(function(t) { var d=t.fecha||'N/D'; if(!dailyMap[d]) dailyMap[d]={d:d,in:0,out:0}; if(t.tipo==='IN') dailyMap[d].in+=t.monto; else dailyMap[d].out+=t.monto; });
  var dates = Object.keys(dailyMap).sort();
  var dailyVol = dates.map(function(d) { return dailyMap[d]; });
  var withHour = txns.filter(function(t) { return t.hora; });
  var atypical = withHour.filter(function(t) { var h=parseInt((t.hora||'').split(':')[0]); return h < U.HORARIO_DESDE || h >= U.HORARIO_HASTA; });
  // PAT-08 — operaciones fuera del horario habitual
  marcar('PAT-08', pos(atypical));
return { evidencia:evidencia, cpIdentificable:cpIdentificable, pctSinCp:pctSinCp, tIn:tIn, tOut:tOut, tVol:tVol, balanceNeto:tIn-tOut, countIn:ins.length, countOut:outs.length, totalTxns:txns.length, avg:avg, maxMonto:montos[montos.length-1]||0, minMonto:montos[0]||0, cpIn:cpIn, cpOut:cpOut, sortedIn:sortedIn, sortedOut:sortedOut, uniqueCpIn:Object.keys(cpIn).length, uniqueCpOut:Object.keys(cpOut).length, top1In:tIn>0?(sortedIn[0]?sortedIn[0][1]:0)/tIn*100:0, top1Out:tOut>0?(sortedOut[0]?sortedOut[0][1]:0)/tOut*100:0, hhiIn:hhiIn, hhiOut:hhiOut, ratioCpEmbudo:Object.keys(cpIn).length/(Object.keys(cpOut).length||1), ratioIO:tVol>0?tIn/tVol:0.5, ratioVP:perfil&&perfil.facturacionMensual>0?tVol/Number(perfil.facturacionMensual):null, splitDays:splitDays, splitGroupsCount:splitGroups.length, pctRound:txns.length>0?roundCount/txns.length*100:0, pctOneShot:totalUcp>0?oneShotCnt/totalUcp*100:0, repeatedAmts:repeatedAmts, circularCps:circularCps, circularCount:circularCps.length, activeDays:dates.length, opsByDay:txns.length/(dates.length||1), dates:dates, dailyVol:dailyVol, passThrough:tIn>0?tOut/tIn:0, pctAtypicalHour:withHour.length>0?atypical.length/withHour.length*100:null, ntGroupsIn:ntGroupsIn, ntGroupsOut:ntGroupsOut };
}

// ─── EVIDENCIA DE UNA SEÑAL ─────────────────────────────────────────────────
// Convierte las posiciones registradas en las operaciones concretas. Las txns
// se cargan bajo demanda, de modo que esto se resuelve recién cuando el
// analista abre el detalle o genera un caso.
function operacionesDeSenal(senal, txns) {
  if (!senal || !txns || !txns.length) return [];
  var ops = (senal.ops || [])
    .map(function(i){ return { _i: i, t: txns[i] }; })
    .filter(function(x){ return !!x.t; })
    .map(function(x){ return Object.assign({ _i: x._i }, x.t); });

  // El criterio de agrupación depende de lo que la señal quiere mostrar. En el
  // orden original del archivo las operaciones relacionadas quedan dispersas y
  // el analista tiene que rastrearlas a ojo, que es el trabajo que esta función
  // viene a evitar.
  var porMonto = senal.orden === 'monto';
  var cp = function(t){ return (t.contraparte_nombre || t.contraparte_cuit || '').toUpperCase(); };
  var fec = function(t){ return parseFechaAR(t.fecha); };

  return ops.sort(function(a, b) {
    if (porMonto) {
      // Los importes iguales van juntos, del más repetido al menos: es lo que
      // la señal está afirmando.
      var ma = Number(a.monto) || 0, mb = Number(b.monto) || 0;
      if (ma !== mb) return mb - ma;
      var c1 = cp(a), c2 = cp(b);
      if (c1 !== c2) return c1 < c2 ? -1 : 1;
    } else {
      var ca = cp(a), cb2 = cp(b);
      if (ca !== cb2) return ca < cb2 ? -1 : 1;
    }
    var fa = fec(a), fb = fec(b);
    if (fa && fb && fa - fb !== 0) return fa - fb;
    return (Number(a.monto) || 0) - (Number(b.monto) || 0);
  });
}

// Completa la evidencia de señales que se emitieron desde métricas guardadas
// sin ella —períodos analizados antes de que existiera el registro por
// operación—.
//
// Deliberadamente NO se recalculan las señales: hacerlo cambiaría cuáles
// aparecen en el informe respecto de las que el analista vio y resolvió. Se
// recalculan las métricas solo para extraer la evidencia, y se copia sobre las
// señales existentes emparejando por patrón y título.
function enriquecerEvidencia(senales, txns, legajo) {
  if (!senales || !senales.length || !txns || !txns.length) return senales || [];
  var yaTiene = senales.some(function(s){ return (s.ops || []).length; });
  if (yaTiene) return senales;

  var frescas;
  try {
    frescas = detectPatrones(calcMetricas(txns, legajo), legajo || {});
  } catch (e) { return senales; }

  var porClave = {};
  frescas.forEach(function(f){ porClave[f.pat + '::' + f.titulo] = f; });

  return senales.map(function(s){
    var f = porClave[s.pat + '::' + s.titulo];
    if (!f) return s;
    return Object.assign({}, s, {
      ops: f.ops || [], opsTotal: f.opsTotal || 0,
      orden: f.orden, estructural: f.estructural,
    });
  });
}

// ─── RECURRENCIA ────────────────────────────────────────────────────────────
// Cada señal se lee por separado, y una contraparte que aparece en la evidencia
// de varias a la vez no resulta visible en esa lectura. Cruzar la evidencia
// permite responder algo que hoy hay que hacer a ojo: quién concentra los
// hallazgos del período.
function contrapartesRecurrentes(senales, txns, minPatrones) {
  var min = minPatrones || 2;
  if (!senales || !txns || !txns.length) return [];
  var acum = {};
  senales.forEach(function(s){
    if (s.estructural) return;
    var vistas = {};
    operacionesDeSenal(s, txns).forEach(function(t){
      var k = (t.contraparte_nombre || t.contraparte_cuit || '').trim();
      if (!k) return;
      if (!acum[k]) acum[k] = { nombre: k, patrones: [], ops: 0, monto: 0, sev: {} };
      if (!vistas[k]) {
        vistas[k] = true;
        acum[k].patrones.push(s.pat + ' — ' + s.titulo);
        acum[k].sev[s.sev] = (acum[k].sev[s.sev] || 0) + 1;
      }
      acum[k].ops += 1;
      acum[k].monto += Number(t.monto) || 0;
    });
  });
  return Object.keys(acum)
    .map(function(k){ return acum[k]; })
    .filter(function(x){ return x.patrones.length >= min; })
    .sort(function(a, b){
      if (b.patrones.length !== a.patrones.length) return b.patrones.length - a.patrones.length;
      return b.monto - a.monto;
    });
}

// Señales que se repiten período tras período y se resuelven siempre igual.
// Cuando ocurre, o el umbral no se ajusta a ese cliente, o hay algo que la
// resolución no está mirando. En cualquiera de los dos casos, informarlo vale
// más que volver a resolver lo mismo.
function senalesRecurrentes(periodos, legajo, minPeriodos) {
  var min = minPeriodos || 3;
  var pers = (periodos || []).filter(function(p){ return p.legajoId === legajo.id && p.metricas; });
  if (pers.length < min) return [];

  var acum = {};
  pers.forEach(function(p){
    var res = p.sigsResolucion || {};
    var m = metricasDe(p, legajo);
    if (!m) return;
    detectPatrones(m, legajo, null).forEach(function(s){
      var clave = s.pat + '::' + s.titulo;
      if (!acum[clave]) acum[clave] = { pat: s.pat, titulo: s.titulo, periodos: [], resueltas: 0, fundamentos: {} };
      var e = acum[clave];
      e.periodos.push(p.nombre || p.id);
      var r = resolucionDe(res, s);
      if (r && r.estado === 'RESUELTA') {
        e.resueltas += 1;
        var f = (r.explicacion || '').trim().toLowerCase();
        if (f) e.fundamentos[f] = (e.fundamentos[f] || 0) + 1;
      }
    });
  });

  return Object.keys(acum)
    .map(function(k){ return acum[k]; })
    .filter(function(e){
      if (e.periodos.length < min) return false;
      // Solo interesa cuando además se resolvió siempre con el mismo argumento
      var usos = Object.keys(e.fundamentos).map(function(f){ return e.fundamentos[f]; });
      return usos.some(function(n){ return n >= min; });
    })
    .map(function(e){
      var top = Object.keys(e.fundamentos).sort(function(a,b){ return e.fundamentos[b]-e.fundamentos[a]; })[0];
      return {
        pat: e.pat, titulo: e.titulo,
        vecesDetectada: e.periodos.length,
        vecesResuelta: e.resueltas,
        periodos: e.periodos,
        fundamentoRepetido: top,
        vecesFundamento: e.fundamentos[top],
      };
    })
    .sort(function(a, b){ return b.vecesFundamento - a.vecesFundamento; });
}

// ─── HUELLA DE LA EVIDENCIA ─────────────────────────────────────────────────
// Una resolución afirma que un hallazgo tiene explicación. Esa afirmación se
// hizo sobre operaciones concretas, pero si el período se vuelve a cargar con
// otro archivo, la señal puede seguir activa sobre movimientos DISTINTOS y la
// resolución quedaría cubriendo algo que ya no es lo que se analizó.
//
// La huella permite advertirlo: se calcula al resolver y se compara al mostrar.
// No es una firma criptográfica —no busca detectar manipulación— sino un
// resumen barato que cambia cuando cambian las operaciones.
function huellaEvidencia(senal, txns) {
  var ops = operacionesDeSenal(senal, txns);
  if (!ops.length) return null;
  var suma = 0, h = 0;
  ops.forEach(function(t){
    suma += Number(t.monto) || 0;
    var clave = (t.fecha || '') + '|' + (t.monto || '') + '|' +
                (t.contraparte_nombre || t.contraparte_cuit || '');
    for (var i = 0; i < clave.length; i++) {
      h = ((h << 5) - h + clave.charCodeAt(i)) | 0;   // hash de 32 bits
    }
  });
  return { n: ops.length, suma: Math.round(suma), hash: h };
}

// Compara la huella asentada al resolver contra la evidencia actual.
// Devuelve null cuando no hay con qué comparar: una resolución anterior a esta
// función, o un período sin transacciones cargadas. Ausencia de dato no es
// discrepancia, y confundirlas alarmaría sobre todo lo viejo.
function evidenciaCambio(resolucion, senal, txns) {
  if (!resolucion || !resolucion.huella) return null;
  var actual = huellaEvidencia(senal, txns);
  if (!actual) return null;
  var h = resolucion.huella;
  if (h.n === actual.n && h.suma === actual.suma && h.hash === actual.hash) return null;
  return {
    antes: h, ahora: actual,
    detalle: 'Se resolvió sobre ' + h.n + ' operación(es) por ' +
             h.suma.toLocaleString('es-AR') + '. Hoy la señal se sustenta en ' +
             actual.n + ' operación(es) por ' + actual.suma.toLocaleString('es-AR') + '.',
  };
}

// Resumen textual de las operaciones implicadas, para el detalle de un caso o
// de un informe.
function resumenEvidencia(senal, txns) {
  var ops = operacionesDeSenal(senal, txns);
  if (!ops.length) return '';
  var total = ops.reduce(function(a, t){ return a + (Number(t.monto) || 0); }, 0);
  var fechas = ops.map(function(t){ return t.fecha; }).filter(Boolean).sort();
  var cps = {};
  ops.forEach(function(t){
    var k = t.contraparte_nombre || t.contraparte_cuit || 'Sin identificar';
    cps[k] = (cps[k] || 0) + 1;
  });
  var listaCps = Object.keys(cps).sort(function(a,b){ return cps[b]-cps[a]; });
  return ops.length + ' operación(es) por ' + Math.round(total).toLocaleString('es-AR') +
    (fechas.length ? ', entre el ' + fechas[0] + ' y el ' + fechas[fechas.length-1] : '') +
    ', con ' + listaCps.length + ' contraparte(s): ' +
    listaCps.slice(0, 5).join(', ') + (listaCps.length > 5 ? ' y otras' : '') + '.';
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

  // ── Convenios de recaudación ─────────────────────────────────────────────
  // El flujo de un convenio es, por diseño, un embudo: muchos libradores hacia
  // pocos beneficiarios, y sale casi lo mismo que entra menos la comisión. Las
  // reglas que detectan esa forma se activarían en TODOS los convenios y
  // describirían el modelo de negocio en lugar de una anomalía.
  //
  // Se suprimen únicamente esas tres. Circularidad, concentración de
  // libradores, fraccionamiento y desvío conductual siguen aplicando, porque
  // detectan anomalías reales dentro del modelo. El control aritmético propio
  // de la modalidad lo aportan las reglas COB de lib/cobranza.js.
  var esRecaud = !!(perfil && perfil.tipoOperatoria === 'RECAUDACION');
  var ESPERABLES_RECAUD = ['PAT-02', 'PAT-09', 'PAT-12'];

  // Patrones que se apoyan en la identidad de la contraparte. Si el archivo no
  // trajo esa columna, todas las operaciones quedan bajo un mismo rótulo y los
  // cálculos de concentración, embudo, circularidad y fraccionamiento describen
  // el fallo de lectura, no la operatoria. Se emite en su lugar una única señal
  // que apunta al problema real.
  var DEPENDEN_DE_CP = ['PAT-01','PAT-02','PAT-03','PAT-04','PAT-06','PAT-09','PAT-10','PAT-11','PAT-12','PAT-14'];
  var sinCp = m.cpIdentificable === false;
  var sigs = [];
  // Patrones que describen la FORMA del período completo. Señalarles operaciones
  // concretas sería atribuirles una precisión que no tienen: lo que detectan es
  // la estructura del flujo, no un subconjunto de movimientos.
  // PAT-05 compara el volumen del período contra el perfil declarado: es una
  // razón de nivel período, no un subconjunto de operaciones.
  var ESTRUCTURALES = ['PAT-02', 'PAT-05', 'PAT-09', 'PAT-11', 'PAT-12', 'PAT-13', 'PAT-15', 'PAT-16'];

  // Cada señal viaja con las posiciones de las operaciones que la sustentan,
  // para que el analista no tenga que reconstruir a mano a qué se refería.
  // claveEv permite que dos señales del mismo código lleven evidencia distinta:
  // PAT-07 emite "montos redondos" y "montos repetidos", y PAT-06 y PAT-10
  // tienen variante de entrada y de salida. Sin esta distinción, una señal de
  // cash-in mostraría operaciones de salida.
  // Cómo conviene agrupar la evidencia de cada señal. Para casi todas, por
  // contraparte: es el eje del hallazgo. Para las de importe —montos repetidos,
  // montos redondos— agrupar por contraparte dispersa justamente lo que la
  // señal quiere mostrar, que son los importes que se repiten.
  var ORDEN_POR_MONTO = ['PAT-17', 'PAT-07:redondos'];

  function add(pat, sev, titulo, desc, tip, claveEv) {
    var ev = (m.evidencia && m.evidencia[claveEv || pat]) || null;
    sigs.push({
      id: uid(), pat: pat, sev: sev, titulo: titulo, desc: desc, tip: tip,
      ops: ev ? ev.ops : [],
      opsTotal: ev ? ev.total : 0,
      orden: ORDEN_POR_MONTO.indexOf(claveEv || pat) >= 0 ? 'monto' : 'contraparte',
      // true = el patrón describe la forma del período y no operaciones puntuales
      estructural: ESTRUCTURALES.indexOf(pat) >= 0,
    });
  }
  if (m.splitGroupsCount > 0) add('PAT-01', m.splitDays >= U.FRACC_DIAS_ALTA ? 'ALTA' : 'MEDIA', 'Fraccionamiento (structuring)', m.splitGroupsCount + ' grupo(s) con 3+ ops al mismo destino en igual dia (' + m.splitDays + ' dias afectados).', 'T-01');
  if (m.ratioCpEmbudo > U.EMBUDO_RATIO && m.uniqueCpIn > U.EMBUDO_MIN_CP_IN) add('PAT-02', 'ALTA', 'Cuenta embudo (funnel account)', 'Ratio IN:OUT = ' + m.uniqueCpIn + ':' + m.uniqueCpOut + ' = ' + m.ratioCpEmbudo.toFixed(1) + ':1 (umbral 5:1).', 'T-04');
  if (m.circularCount >= U.CIRCULAR_MIN) add('PAT-03', 'ALTA', 'Posible circularidad (layering)', m.circularCount + ' contraparte(s) como origen Y destino.', 'T-03');
  if (m.pctOneShot > U.ONESHOT_PCT && m.uniqueCpIn > U.ONESHOT_MIN_CP) add('PAT-04', 'ALTA', 'Smurfing — contrapartes one-shot', m.pctOneShot.toFixed(1) + '% de contrapartes aparecen 1 sola vez (umbral 60%).', 'T-02');
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
    if (m.ratioVP > U.PERFIL_EXCESO) {
      if (limVigente) {
        // Hay aumento vigente — bajar severidad a INFO y anotar
        var limRef = limVigente.tipo === 'AUMENTO_PERMANENTE' ? 'permanente' : 'temporal hasta ' + (limVigente.vigenciaHasta||'indefinido');
        var nuevoLim = limVigente.montoNuevo ? fmtM(limVigente.montoNuevo) : 'sin tope definido';
        add('PAT-05', 'BAJA', 'Volumen excede perfil original (aumento vigente)', 'Ratio ' + m.ratioVP.toFixed(2) + 'x, pero existe aumento ' + limRef + ' a ' + nuevoLim + '. Motivo: ' + (limVigente.motivo||'—') + '. Aprobado por: ' + (limVigente.aprobadoPor||'—') + '.', 'T-05');
      } else {
        add('PAT-05', 'ALTA', 'Volumen excede perfil declarado', 'Volumen es ' + m.ratioVP.toFixed(2) + 'x el perfil mensual.', 'T-05');
      }
    } else if (m.ratioVP < U.PERFIL_DEFECTO) {
      add('PAT-16', 'MEDIA', 'Volumen muy inferior al perfil', 'Volumen es ' + m.ratioVP.toFixed(2) + 'x el perfil.', 'T-05');
    }
  }
  if (m.hhiIn > U.CONC_HHI_ALTA || m.top1In > U.CONC_TOP1_ALTA) add('PAT-06', 'ALTA', 'Concentracion extrema — cash-in', 'Top-1: ' + m.top1In.toFixed(1) + '% | HHI: ' + m.hhiIn.toFixed(3) + '.', 'T-02', 'PAT-06:in');
  else if (m.hhiIn > U.CONC_HHI_MEDIA) add('PAT-06', 'MEDIA', 'Concentracion alta — cash-in', 'Top-1: ' + m.top1In.toFixed(1) + '%.', 'T-02', 'PAT-06:in');
  if (m.hhiOut > U.CONC_HHI_ALTA || m.top1Out > U.CONC_TOP1_ALTA) add('PAT-06', 'ALTA', 'Concentracion extrema — cash-out', 'Top-1: ' + m.top1Out.toFixed(1) + '%.', 'T-02', 'PAT-06:out');
  else if (m.hhiOut > U.CONC_HHI_MEDIA) add('PAT-06', 'MEDIA', 'Concentracion alta — cash-out', 'Top-1: ' + m.top1Out.toFixed(1) + '%.', 'T-02', 'PAT-06:out');
  if (m.pctRound > U.REDONDOS_ALTA) add('PAT-07', 'ALTA', 'Alta proporcion montos redondos', m.pctRound.toFixed(1) + '% de ops son multiples de $100K.', 'T-01', 'PAT-07:redondos');
  else if (m.pctRound > U.REDONDOS_MEDIA) add('PAT-07', 'MEDIA', 'Montos redondos frecuentes', m.pctRound.toFixed(1) + '%.', 'T-01', 'PAT-07:redondos');
  if (m.repeatedAmts.length > 0) add('PAT-17', 'MEDIA', 'Montos exactamente repetidos', m.repeatedAmts.length + ' monto(s) con ' + U.REPETIDOS_MIN + '+ ocurrencias.', 'T-01', 'PAT-17');
  if (m.pctAtypicalHour !== null && m.pctAtypicalHour > U.HORARIO_PCT) add('PAT-08', 'MEDIA', 'Operaciones en horario atipico', m.pctAtypicalHour.toFixed(1) + '% fuera de 08:00-20:00.', 'T-05');
  if (m.passThrough > U.TRANSITO_ALTA && m.tIn > 0) add('PAT-09', 'ALTA', 'Pass-through — alta rotacion de fondos', 'Cash-out = ' + (m.passThrough*100).toFixed(1) + '% del cash-in.', 'T-04');
  // PAT-10 — Near-threshold structuring (contraparte recurrente)
  if (m.ntGroupsIn && m.ntGroupsIn.length > 0) {
    m.ntGroupsIn.forEach(function(g) {
      add('PAT-10', 'ALTA', 'Near-threshold structuring — cash-in',
        'Contraparte "' + g[0] + '": ' + g[1] + ' ops entre $680K–$799.999 (debajo umbral UIF $800K). Posible evasion de reporte obligatorio.', 'T-02', 'PAT-10:in');
    });
  }
  if (m.ntGroupsOut && m.ntGroupsOut.length > 0) {
    m.ntGroupsOut.forEach(function(g) {
      add('PAT-10', 'ALTA', 'Near-threshold structuring — cash-out',
        'Contraparte "' + g[0] + '": ' + g[1] + ' ops entre $680K–$799.999 (debajo umbral UIF $800K). Posible evasion de reporte obligatorio.', 'T-02', 'PAT-10:out');
    });
  }
  if (m.opsByDay > U.VELOCIDAD_OPS_DIA) add('PAT-11', 'ALTA', 'Velocidad operativa anomala', m.opsByDay.toFixed(1) + ' ops/dia (umbral: 50/dia).', 'T-04');
  if (m.uniqueCpIn > U.MUCHOS_POCOS_CP_IN && m.uniqueCpOut < U.MUCHOS_POCOS_CP_OUT && m.tOut > 0) add('PAT-12', 'ALTA', 'Embudo multiple (muchos-a-pocos)', m.uniqueCpIn + ' origenes hacia ' + m.uniqueCpOut + ' destino(s).', 'T-04');

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

  if (esRecaud) {
    sigs = sigs.filter(function(s){ return ESPERABLES_RECAUD.indexOf(s.pat) < 0; });
  }

  if (sinCp) {
    // Se descartan las señales que no pueden sostenerse sin contraparte y se
    // informa la causa, en vez de presentar un artefacto como hallazgo.
    sigs = sigs.filter(function(s){ return DEPENDEN_DE_CP.indexOf(s.pat) < 0; });
    sigs.unshift({
      id: uid(), pat: 'DATA-01', sev: 'ALTA',
      titulo: 'El archivo no identifica las contrapartes',
      desc: 'El ' + (m.pctSinCp || 100) + '% de las operaciones no tiene contraparte identificable. ' +
            'Sin ese dato no pueden evaluarse concentración, fraccionamiento, circularidad ni embudo: ' +
            'los cálculos agruparían todas las operaciones bajo un único rótulo y arrojarían una ' +
            'concentración del 100% que es un artefacto de lectura, no un hallazgo. ' +
            'Verificar que el archivo incluya la columna de contraparte (ordenante o beneficiario) ' +
            'y volver a cargar el período.',
      tip: 'T-00'
    });
  }

  return sigs;
}

function calcScoring(m, sigs) {
  if (!m) return null;
  var hhi = Math.max(m.hhiIn, m.hhiOut);
  var r = m.ratioIO;
  var rvpScore = m.ratioVP === null ? 2 : (m.ratioVP > U.SCORE_PERFIL_ALTO || m.ratioVP < U.SCORE_PERFIL_BAJO ? 5 : (m.ratioVP > U.SCORE_PERFIL_MEDIO || m.ratioVP < U.PERFIL_DEFECTO ? 3 : 1));
  var sc = [
    { factor:'Volumen vs perfil', score:rvpScore, ref:m.ratioVP ? m.ratioVP.toFixed(2)+'x' : 'N/D' },
    { factor:'Concentracion cp.', score:hhi>0.70?5:(hhi>0.30?3:1), ref:'HHI '+hhi.toFixed(2) },
    { factor:'Fraccionamiento', score:m.splitDays>=U.FRACC_DIAS_ALTA?5:(m.splitDays>=1?3:1), ref:m.splitDays+' dias' },
    { factor:'Montos redondos', score:m.pctRound>U.REDONDOS_ALTA?5:(m.pctRound>U.REDONDOS_MEDIA?3:1), ref:m.pctRound.toFixed(0)+'%' },
    { factor:'Bidireccionalidad', score:r<0.05||r>0.95?5:(r<0.15||r>0.85?3:1), ref:'IO '+r.toFixed(2) },
    { factor:'Velocidad rotacion', score:m.passThrough>U.TRANSITO_ALTA?5:(m.passThrough>U.TRANSITO_MEDIA?3:1), ref:m.tIn>0?(m.passThrough*100).toFixed(0)+'%':'N/D' },
    { factor:'Cp. de riesgo', score:m.circularCount>U.CIRCULAR_SCORE_ALTO?5:(m.circularCount>=U.CIRCULAR_MIN?3:1), ref:m.circularCount+' circ.' },
    { factor:'Consistencia temporal', score:m.pctAtypicalHour!==null&&m.pctAtypicalHour>U.HORARIO_PCT?4:2, ref:m.pctAtypicalHour!==null?m.pctAtypicalHour.toFixed(0)+'% noct.':'N/D' }
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
// Clave con la que se guarda la resolución de una señal.
//
// Antes se usaba solo el código de patrón, pero un mismo patrón puede emitir
// señales distintas en el mismo período: PAT-06 produce una para cash-in y otra
// para cash-out. Con la clave vieja, resolver una resolvía la otra en silencio.
//
// Las resoluciones ya guardadas usan la clave vieja, así que la lectura la
// contempla como alternativa: lo anterior sigue funcionando y lo nuevo es
// preciso.
function claveResolucion(s) {
  return s.pat + '::' + (s.titulo || '');
}

// Señales que cambiaron de código al separarse los patrones ambiguos. Una
// resolución asentada antes del cambio quedó guardada con el código viejo; sin
// esta tabla reaparecería como activa, y el analista tendría que resolver de
// nuevo algo que ya resolvió.
var CLAVES_HISTORICAS = {
  'PAT-16::Volumen muy inferior al perfil': 'PAT-05::Volumen muy inferior al perfil',
  'PAT-17::Montos exactamente repetidos':   'PAT-07::Montos exactamente repetidos',
};
function resolucionDe(res, s) {
  if (!res) return null;
  var clave = claveResolucion(s);
  var historica = CLAVES_HISTORICAS[clave];
  return res[clave] || (historica ? res[historica] : null) || res[s.pat] || null;
}

function senalesActivas(periodo, legajo, periodos) {
  var m = metricasDe(periodo, legajo);
  if (!m) return [];
  var base = periodos ? lineaBase(periodo, legajo, periodos) : null;
  var res = (periodo && periodo.sigsResolucion) || {};
  return detectPatrones(m, legajo, base).filter(function(s) {
    var r = resolucionDe(res, s);
    return !r || r.estado !== 'RESUELTA';
  });
}

// ── Períodos duplicados ─────────────────────────────────────────────────────
// Cargar dos veces el mismo archivo crea dos períodos independientes, y cada uno
// emite su propio juego de señales. En la bandeja se ven como la misma alerta
// repetida, cuando en realidad son períodos distintos con idéntico contenido.
function periodosDuplicados(periodos) {
  var porClave = {};
  (periodos || []).forEach(function(p){
    // Mismo legajo, mismo nombre y mismas métricas agregadas = mismo período
    var m = p.metricas;
    var firma = p.legajoId + '|' + (p.nombre || '') + '|' +
                (m ? [m.totalTxns, Math.round(m.tIn), Math.round(m.tOut)].join(',') : 'sin-metricas');
    if (!porClave[firma]) porClave[firma] = [];
    porClave[firma].push(p);
  });
  return Object.keys(porClave)
    .filter(function(k){ return porClave[k].length > 1; })
    .map(function(k){
      var grupo = porClave[k].slice().sort(function(a,b){
        return String(a.createdAt||'').localeCompare(String(b.createdAt||''));
      });
      return {
        firma: k,
        legajoId: grupo[0].legajoId,
        nombre: grupo[0].nombre,
        copias: grupo.length,
        // Se conserva el primero; los demás son los redundantes
        conservar: grupo[0],
        redundantes: grupo.slice(1)
      };
    })
    .sort(function(a,b){ return b.copias - a.copias; });
}

function contarAlta(periodo, legajo, periodos) {
  return senalesActivas(periodo, legajo, periodos).filter(function(s){ return s.sev === 'ALTA'; }).length;
}

export { calcMetricas, detectPatrones, enriquecerEvidencia, huellaEvidencia, evidenciaCambio, contrapartesRecurrentes, senalesRecurrentes, calcScoring, metricasDe, senalesActivas, contarAlta, lineaBase, COMPORTAMIENTO, claveResolucion, resolucionDe, CLAVES_HISTORICAS, periodosDuplicados, operacionesDeSenal, resumenEvidencia };
