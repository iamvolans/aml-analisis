// ═══════════════════════════════════════════════════════════════════════════
// mismotitular.js — Movimientos entre cuentas del propio cliente
// ═══════════════════════════════════════════════════════════════════════════
// Una transferencia de la empresa hacia otra cuenta de su misma titularidad no
// tiene contraparte: el dinero no cambia de dueño. Computarla como si la
// tuviera distorsiona todo el análisis, y en un caso concreto produce un
// hallazgo grave y falso:
//
//   · CIRCULARIDAD — el cliente figura como origen Y destino de sus propios
//     fondos, que es exactamente la forma que el patrón busca detectar. La
//     señal se emite en severidad alta y puede terminar fundando un reporte
//     ante la autoridad sobre una operatoria que no tiene nada de irregular.
//   · CONCENTRACIÓN — la propia empresa aparece como la contraparte dominante.
//   · TRÁNSITO DE FONDOS — mover dinero entre cuentas propias produce una
//     relación entrada/salida cercana a uno.
//   · CONTRAPARTES ÚNICAS y EMBUDO — el recuento de terceros queda inflado.
//
// ── QUÉ HACE ESTE MÓDULO, Y QUÉ NO ────────────────────────────────────────
// Clasifica, no descarta. Los movimientos entre cuentas propias se apartan del
// cómputo de patrones basados en contraparte, pero se conservan íntegros y se
// informan por separado en las métricas, en los informes y en el ROS.
//
// La distinción importa: un volumen elevado de movimientos entre cuentas
// propias puede ser en sí mismo un hecho a analizar —fraccionamiento sobre la
// propia red de cuentas, por ejemplo—, y ocultarlo sería reemplazar un falso
// positivo por un falso negativo. Lo que corresponde es que el analista los
// vea como lo que son.

import { normalizar, sinSufijos } from "./screening.js";

// Deja un CUIT/CUIL comparable: solo dígitos.
function soloDigitos(x) {
  return String(x === null || x === undefined ? '' : x).replace(/\D/g, '');
}

// Denominación comparable: normalizada y sin la forma societaria.
// "GOAT S.A.", "GOAT SA" y "Goat Sociedad Anonima" deben resultar iguales.
//
// El normalizador de listas convierte "S.A." en "S A" —letras sueltas— y su
// removedor de sufijos reconoce "SA" pero no esa forma separada. Para el cotejo
// aproximado de listas la diferencia no molesta, porque el puntaje la absorbe;
// acá sí, porque se comparan claves exactas: "GOAT S A" y "GOAT" no coinciden y
// la operación quedaría computada como si fuera de un tercero.
var FORMAS_SOCIETARIAS = [
  'S A S', 'S A', 'S R L', 'S C A', 'S H', 'S C S',
  'SAS', 'SA', 'SRL', 'SCA', 'SH', 'SCS', 'SAU', 'SAPEM',
  'SOCIEDAD ANONIMA', 'SOCIEDAD ANONIMA UNIPERSONAL',
  'SOCIEDAD DE RESPONSABILIDAD LIMITADA',
  'LTDA', 'LTD', 'INC', 'CORP', 'LLC', 'SL', 'SPA',
];

function claveNombre(x) {
  var n = sinSufijos(normalizar(String(x || ''))).replace(/\s+/g, ' ').trim();
  // Se quitan las formas que hayan sobrevivido, de la más larga a la más corta
  // para que "S A S" no se reduzca antes por "S A".
  var cambio = true;
  while (cambio) {
    cambio = false;
    for (var i = 0; i < FORMAS_SOCIETARIAS.length; i++) {
      var f = FORMAS_SOCIETARIAS[i];
      if (n.length > f.length + 1 && n.slice(-(f.length + 1)) === ' ' + f) {
        n = n.slice(0, -(f.length + 1)).trim();
        cambio = true;
        break;
      }
    }
  }
  return n;
}

// ── Identidades del titular ─────────────────────────────────────────────────
// Además del CUIT y la razón social del legajo, el analista puede declarar
// otras cuentas propias: la misma empresa puede figurar en un extracto con una
// grafía distinta, o operar cuentas a su nombre en otra entidad.
function identidadesDe(legajo) {
  var docs = {}, nombres = {};
  if (!legajo) return { docs: docs, nombres: nombres, declaradas: [] };

  var addDoc = function(d){ var k = soloDigitos(d); if (k.length >= 8) docs[k] = true; };
  var addNom = function(n){ var k = claveNombre(n); if (k.length >= 3) nombres[k] = true; };

  addDoc(legajo.cuit);
  addNom(legajo.razonSocial);

  // Cuentas propias declaradas por el analista. Se admite texto libre con una
  // por línea, en formato "denominación, CUIT" o solo uno de los dos.
  var declaradas = [];
  var crudo = legajo.cuentasPropias || '';
  String(crudo).split(/[\n;]+/).forEach(function(linea){
    var t = linea.trim();
    if (!t) return;
    declaradas.push(t);
    t.split(',').forEach(function(parte){
      var p = parte.trim();
      if (!p) return;
      if (soloDigitos(p).length >= 8) addDoc(p);
      else addNom(p);
    });
  });

  return { docs: docs, nombres: nombres, declaradas: declaradas };
}

// ── Clasificación de una operación ──────────────────────────────────────────
// Devuelve el motivo por el cual la operación se considera de titularidad
// propia, o null si tiene contraparte de tercero.
//
// El documento manda sobre el nombre: dos empresas pueden llamarse parecido,
// pero un CUIT idéntico no admite discusión. A la inversa, un CUIT distinto
// descarta la coincidencia aunque el nombre sea igual, porque son personas
// jurídicas diferentes.
function motivoMismoTitular(txn, ident) {
  if (!txn || !ident) return null;
  var doc = soloDigitos(txn.contraparte_cuit);
  var nom = claveNombre(txn.contraparte_nombre);

  if (doc) {
    // Con documento presente, el documento decide y el nombre no interviene.
    return ident.docs[doc] ? 'documento' : null;
  }
  if (nom && ident.nombres[nom]) return 'denominación';
  return null;
}

// ── Reparto de un conjunto de operaciones ───────────────────────────────────
function separarMismoTitular(txns, legajo) {
  var ident = identidadesDe(legajo);
  var terceros = [], propias = [];
  var motivos = { documento: 0, 'denominación': 0 };
  var montoIn = 0, montoOut = 0;

  (txns || []).forEach(function(t){
    var motivo = motivoMismoTitular(t, ident);
    if (!motivo) { terceros.push(t); return; }
    propias.push(Object.assign({}, t, { _mismoTitular: motivo }));
    motivos[motivo] = (motivos[motivo] || 0) + 1;
    var m = Number(t.monto) || 0;
    if (t.tipo === 'OUT') montoOut += m; else montoIn += m;
  });

  return {
    terceros: terceros,
    propias: propias,
    resumen: {
      cantidad: propias.length,
      pct: (txns || []).length ? (propias.length / txns.length) * 100 : 0,
      montoIn: montoIn,
      montoOut: montoOut,
      montoTotal: montoIn + montoOut,
      porDocumento: motivos.documento || 0,
      porDenominacion: motivos['denominación'] || 0,
      identidades: ident.declaradas,
    },
  };
}

// Texto para los informes. Se redacta afirmando lo que se hizo, no omitiéndolo:
// un lector tiene que poder saber que hubo operaciones apartadas del cómputo y
// por qué.
function leyendaMismoTitular(resumen) {
  if (!resumen || !resumen.cantidad) return '';
  var det = [];
  if (resumen.porDocumento) det.push(resumen.porDocumento + ' por coincidencia de CUIT');
  if (resumen.porDenominacion) det.push(resumen.porDenominacion + ' por coincidencia de denominación');
  return 'Se identificaron ' + resumen.cantidad + ' operación(es) (' + resumen.pct.toFixed(1) +
    '% del total) correspondientes a movimientos entre cuentas de titularidad del propio cliente' +
    (det.length ? ' (' + det.join(' y ') + ')' : '') +
    ', por un total de ' + Math.round(resumen.montoTotal).toLocaleString('es-AR') +
    '. Estos movimientos no importan transferencia de fondos a terceros, de modo que se excluyen ' +
    'del cómputo de los patrones basados en contraparte —concentración, circularidad, ' +
    'fraccionamiento y tránsito de fondos— y se informan por separado.';
}

export {
  soloDigitos, claveNombre, identidadesDe, motivoMismoTitular,
  separarMismoTitular, leyendaMismoTitular,
};
