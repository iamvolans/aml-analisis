// ═══════════════════════════════════════════════════════════════════════════
// cobranza.js — Conciliación y control de convenios de recaudación
// ═══════════════════════════════════════════════════════════════════════════
// En un convenio de recaudación la entidad recibe cheques librados por terceros
// y liquida el producido a beneficiarios que el cliente instruye, bajo la
// modalidad de pago por cuenta y orden.
//
// ── POR QUÉ ESTE PRODUCTO NECESITA REGLAS PROPIAS ──────────────────────────
// El flujo es, por diseño, un embudo: muchos libradores hacia pocos
// beneficiarios, y sale casi lo mismo que entra. Las reglas generales que
// detectan esa forma —cuenta embudo, tránsito de fondos, muchos-a-pocos— se
// activarían en la totalidad de los convenios y describirían el modelo de
// negocio en lugar de una anomalía. Aplicarlas sin calibrar convertiría la
// cartera entera en ruido y llevaría al analista a dejar de mirar.
//
// Lo que sí distingue una operación regular de una irregular en esta modalidad
// no es la forma del flujo sino su ARITMÉTICA: que lo liquidado se corresponda
// con lo cobrado menos la comisión pactada. Un desvío ahí no admite lectura
// benigna, porque el convenio no habilita a liquidar fondos que no ingresaron
// ni a retener los que sí.
//
// Las reglas que SIGUEN aplicando sin cambios, porque detectan anomalías reales
// dentro de este modelo:
//   · circularidad — un librador que además es beneficiario;
//   · concentración de libradores — el origen de los documentos;
//   · fraccionamiento — documentos bajo umbral de un mismo librador;
//   · desvío del comportamiento histórico del propio convenio.

import { parseFechaAR } from "./utils.js";

// Reglas generales cuya forma es esperable en esta operatoria y que, por lo
// tanto, no se emiten para un convenio de recaudación.
var PATRONES_ESPERABLES = ['PAT-02', 'PAT-09', 'PAT-12'];

var COBRANZA = {
  // Tolerancia sobre la comisión pactada, en puntos porcentuales. Cubre
  // redondeos, gastos bancarios y diferencias de cambio de día.
  TOL_COMISION: 0.35,
  // Proporción del producido que puede permanecer sin liquidar sin que se
  // considere retención relevante.
  SALDO_RETENIDO: 0.25,
  // Participación desde la cual un beneficiario nuevo concentra el flujo
  CONC_BENEF_NUEVO: 40,
  // Comisión de referencia cuando el convenio no la tiene registrada
  COMISION_DEFECTO: 0.6,
};

function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
function pct(a, b) { return b > 0 ? (a / b) * 100 : 0; }

// ── Conciliación de un período ──────────────────────────────────────────────
// cheques      : operaciones de ingreso (documentos cobrados)
// liquidaciones: operaciones de egreso (pagos por cuenta y orden)
// comision     : porcentaje pactado en el convenio
function conciliar(cheques, liquidaciones, comision) {
  var com = comision === null || comision === undefined || comision === ''
    ? COBRANZA.COMISION_DEFECTO : num(comision);

  var cobrado  = (cheques || []).reduce(function(s, t){ return s + num(t.monto); }, 0);
  var liquidado = (liquidaciones || []).reduce(function(s, t){ return s + num(t.monto); }, 0);

  // Lo que corresponde liquidar según el convenio
  var comisionTeorica = cobrado * (com / 100);
  var esperado = cobrado - comisionTeorica;
  var saldo = esperado - liquidado;

  // Comisión que se desprende de las cifras reales
  var comisionImplicita = cobrado > 0 ? ((cobrado - liquidado) / cobrado) * 100 : null;

  return {
    comisionPactada: com,
    cobrado: cobrado,
    liquidado: liquidado,
    comisionTeorica: comisionTeorica,
    esperado: esperado,
    saldo: saldo,
    // Positivo: queda producido sin liquidar. Negativo: se liquidó de más.
    saldoPct: esperado > 0 ? pct(saldo, esperado) : 0,
    comisionImplicita: comisionImplicita,
    desvioComision: comisionImplicita === null ? null : comisionImplicita - com,
    cantCheques: (cheques || []).length,
    cantLiquidaciones: (liquidaciones || []).length,
  };
}

// ── Beneficiarios ───────────────────────────────────────────────────────────
// Los beneficiarios de las liquidaciones son, junto con los libradores, la
// población de terceros con la que la entidad no tiene vínculo contractual y
// que por eso concentra el interés del monitoreo.
function beneficiarios(liquidaciones) {
  var acum = {};
  (liquidaciones || []).forEach(function(t){
    var k = (t.contraparte_nombre || t.contraparte_cuit || '').trim();
    if (!k) return;
    if (!acum[k]) acum[k] = { nombre: k, doc: t.contraparte_cuit || '', monto: 0, ops: 0 };
    acum[k].monto += num(t.monto);
    acum[k].ops += 1;
  });
  var total = Object.keys(acum).reduce(function(s, k){ return s + acum[k].monto; }, 0);
  return Object.keys(acum).map(function(k){
    return Object.assign({}, acum[k], { part: pct(acum[k].monto, total) });
  }).sort(function(a, b){ return b.monto - a.monto; });
}

// Beneficiarios que no aparecen en los períodos previos del mismo convenio
function beneficiariosNuevos(actuales, periodosPrevios) {
  var historicos = {};
  (periodosPrevios || []).forEach(function(p){
    var m = p.metricas;
    if (!m || !m.cpOut) return;
    Object.keys(m.cpOut).forEach(function(k){ historicos[k.trim().toUpperCase()] = true; });
  });
  return (actuales || []).filter(function(b){
    return !historicos[b.nombre.trim().toUpperCase()];
  });
}

// ── Reglas propias del producto ─────────────────────────────────────────────
// Se emiten con prefijo COB para distinguirlas de las reglas generales.
function reglasCobranza(datos) {
  var c = datos.conciliacion;
  var benef = datos.beneficiarios || [];
  var nuevos = datos.beneficiariosNuevos || [];
  var tienePrevios = !!(datos.periodosPrevios && datos.periodosPrevios.length);
  var sigs = [];

  function add(pat, sev, titulo, desc, tip) {
    sigs.push({ pat: pat, sev: sev, titulo: titulo, desc: desc, tip: tip || 'T-04' });
  }

  if (!c || c.cobrado <= 0) {
    if (c && c.liquidado > 0) {
      add('COB-01', 'ALTA', 'Liquidación sin cobranza registrada',
          'Se liquidaron ' + Math.round(c.liquidado).toLocaleString('es-AR') +
          ' sin documentos cobrados en el período. El convenio no habilita a liquidar fondos que no ingresaron.');
    }
    return sigs;
  }

  // ── Sobreliquidación ──
  // No admite lectura benigna: salió más de lo que el producido permite.
  if (c.saldo < 0) {
    var exceso = Math.abs(c.saldo);
    var sev = pct(exceso, c.esperado) > 5 ? 'ALTA' : 'MEDIA';
    add('COB-01', sev, 'Liquidado por encima del producido',
        'Cobrado ' + Math.round(c.cobrado).toLocaleString('es-AR') + ', comisión pactada ' +
        c.comisionPactada + '%, corresponde liquidar ' + Math.round(c.esperado).toLocaleString('es-AR') +
        '. Se liquidaron ' + Math.round(c.liquidado).toLocaleString('es-AR') + ': un exceso de ' +
        Math.round(exceso).toLocaleString('es-AR') + '. Verificar adelantos documentados o documentos no registrados.');
  }

  // ── Desvío de comisión ──
  if (c.desvioComision !== null && Math.abs(c.desvioComision) > COBRANZA.TOL_COMISION && c.saldo >= 0) {
    add('COB-02', 'MEDIA', 'Comisión efectiva fuera de lo pactado',
        'La comisión que surge de las cifras es ' + c.comisionImplicita.toFixed(2) +
        '% contra un ' + c.comisionPactada + '% pactado (' +
        (c.desvioComision > 0 ? '+' : '') + c.desvioComision.toFixed(2) +
        ' puntos, tolerancia ' + COBRANZA.TOL_COMISION + '). Puede responder a producido sin liquidar ' +
        'o a una diferencia en la aplicación del convenio.');
  }

  // ── Retención de producido ──
  if (c.saldo > 0 && c.saldoPct > COBRANZA.SALDO_RETENIDO * 100) {
    add('COB-03', 'MEDIA', 'Producido cobrado sin liquidar',
        'Queda sin liquidar el ' + c.saldoPct.toFixed(1) + '% del producido (' +
        Math.round(c.saldo).toLocaleString('es-AR') + ' sobre ' +
        Math.round(c.esperado).toLocaleString('es-AR') + '), por encima del ' +
        (COBRANZA.SALDO_RETENIDO * 100) + '% habitual. Verificar si corresponde a saldo a favor del ' +
        'cliente o a fondos retenidos sin instrucción.');
  }

  // ── Beneficiario nuevo que concentra ──
  // Solo con historial: sin períodos previos todos los beneficiarios son nuevos.
  if (tienePrevios) {
    nuevos.forEach(function(b){
      if (b.part < COBRANZA.CONC_BENEF_NUEVO) return;
      add('COB-04', b.part >= 70 ? 'ALTA' : 'MEDIA', 'Beneficiario nuevo concentra la liquidación',
          '"' + b.nombre + '" no recibió liquidaciones en los períodos previos y concentra el ' +
          b.part.toFixed(1) + '% del producido liquidado (umbral ' + COBRANZA.CONC_BENEF_NUEVO +
          '%). En pago por cuenta y orden, un destinatario nuevo que concentra el flujo requiere ' +
          'verificar la instrucción que lo respalda.', 'T-03');
    });
  }

  // ── Beneficiario único ──
  if (benef.length === 1 && c.liquidado > 0 && benef[0].ops > 1) {
    add('COB-05', 'MEDIA', 'Destinatario único de las liquidaciones',
        'La totalidad del producido se liquidó a "' + benef[0].nombre + '" en ' + benef[0].ops +
        ' operación(es). Verificar que la instrucción del convenio contemple ese destinatario.', 'T-02');
  }

  return sigs;
}

// ── Análisis completo del período de un convenio ────────────────────────────
function analizarConvenio(datos) {
  var cheques = datos.cheques || [];
  var liquidaciones = datos.liquidaciones || [];
  var conc = conciliar(cheques, liquidaciones, datos.comision);
  var ben = beneficiarios(liquidaciones);
  var nuevos = beneficiariosNuevos(ben, datos.periodosPrevios);
  return {
    conciliacion: conc,
    beneficiarios: ben,
    beneficiariosNuevos: nuevos,
    senales: reglasCobranza({
      conciliacion: conc, beneficiarios: ben, beneficiariosNuevos: nuevos,
      periodosPrevios: datos.periodosPrevios,
    }),
  };
}

// Une ambos archivos en un único conjunto de operaciones, para que el motor
// general evalúe circularidad, concentración de libradores y fraccionamiento
// sobre el flujo completo.
function unificarOperaciones(cheques, liquidaciones) {
  var out = [];
  (cheques || []).forEach(function(t){ out.push(Object.assign({}, t, { tipo: 'IN' })); });
  (liquidaciones || []).forEach(function(t){ out.push(Object.assign({}, t, { tipo: 'OUT' })); });
  return out;
}

function esRecaudacion(legajo) {
  return !!(legajo && legajo.tipoOperatoria === 'RECAUDACION');
}

export {
  COBRANZA, PATRONES_ESPERABLES, conciliar, beneficiarios, beneficiariosNuevos,
  reglasCobranza, analizarConvenio, unificarOperaciones, esRecaudacion,
};
