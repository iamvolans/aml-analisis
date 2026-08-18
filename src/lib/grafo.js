// ═══════════════════════════════════════════════════════════════════════════
// grafo.js — Contrapartes compartidas entre legajos (T6)
// ═══════════════════════════════════════════════════════════════════════════
// Cada legajo se analiza por separado, así que una contraparte que aparece en
// tres clientes distintos no la ve nadie. Este módulo cruza toda la cartera:
// es donde aparecen las estructuras que no se ven mirando un legajo a la vez.
//
// Las contrapartes vienen de p.metricas.cpIn / cpOut, que persisten en Supabase,
// así que no hace falta hidratar las transacciones.

import { normalizar } from "./screening.js";

// ⚠️ PARAMETRIZABLE
var GRAFO = {
  MIN_LEGAJOS_ALERTA: 3,   // a partir de cuántos legajos compartidos se alerta
  MIN_LEGAJOS_MOSTRAR: 2,  // desde cuántos se dibuja en el grafo
};

// Las claves de cpIn/cpOut son "nombre || cuit" tal como vinieron del archivo.
// Se normalizan para que "ACME S.A." y "ACME SA" cuenten como la misma.
//
// El paso extra sobre las siglas es necesario: normalizar() convierte la
// puntuación en espacios, así que "S.A." queda como "S A" y no coincide con
// "SA". Se vuelven a pegar las corridas de letras sueltas.
//
// Deliberadamente NO se quitan los sufijos societarios acá (a diferencia del
// screening): "PUENTE SA" y "PUENTE SRL" son personas jurídicas distintas y
// fusionarlas inventaría una red que no existe. En un registro con valor
// regulatorio, un falso vínculo cuesta más caro que uno que no se detectó.
function claveCp(raw) {
  var n = normalizar(raw);
  return n.replace(/\b[A-Z](?:\s+[A-Z]\b)+/g, function(m){ return m.replace(/\s+/g, ''); });
}

// Contrapartes genéricas que no identifican a nadie y ensucian el grafo
var IGNORAR = { 'DESCONOCIDO':1, 'DESCONOCIDA':1, 'N D':1, 'ND':1, 'SIN DATOS':1, 'VARIOS':1, '':1 };

// ─── ANÁLISIS ───────────────────────────────────────────────────────────────
// Devuelve las contrapartes que tocan más de un legajo, con el detalle de a
// cuáles y por cuánto volumen.
function contrapartesCompartidas(legajos, periodos, minLegajos) {
  var min = minLegajos || GRAFO.MIN_LEGAJOS_MOSTRAR;
  var legIndex = {};
  (legajos || []).forEach(function(l){ legIndex[l.id] = l; });

  // clave → { label, porLegajo: {legajoId: {monto, ops, periodos}} }
  var mapa = {};

  (periodos || []).forEach(function(p){
    var m = p.metricas;
    if (!m || !legIndex[p.legajoId]) return;
    function acumular(obj) {
      Object.keys(obj || {}).forEach(function(raw){
        var k = claveCp(raw);
        if (!k || IGNORAR[k] || k.length < 3) return;
        if (!mapa[k]) mapa[k] = { clave: k, label: raw, porLegajo: {} };
        if (!mapa[k].porLegajo[p.legajoId]) {
          mapa[k].porLegajo[p.legajoId] = { monto: 0, periodos: 0 };
        }
        mapa[k].porLegajo[p.legajoId].monto += obj[raw];
        mapa[k].porLegajo[p.legajoId].periodos += 1;
      });
    }
    acumular(m.cpIn);
    acumular(m.cpOut);
  });

  var out = [];
  Object.keys(mapa).forEach(function(k){
    var nodo = mapa[k];
    var ids = Object.keys(nodo.porLegajo);
    if (ids.length < min) return;
    var montoTotal = ids.reduce(function(a,id){ return a + nodo.porLegajo[id].monto; }, 0);
    out.push({
      clave: nodo.clave,
      label: nodo.label,
      legajos: ids.map(function(id){
        return {
          id: id,
          nombre: (legIndex[id] && legIndex[id].razonSocial) || 'Sin nombre',
          segmento: (legIndex[id] && legIndex[id].segmento) || 'N/D',
          monto: nodo.porLegajo[id].monto,
          periodos: nodo.porLegajo[id].periodos,
        };
      }).sort(function(a,b){ return b.monto - a.monto; }),
      cantLegajos: ids.length,
      montoTotal: montoTotal,
      alerta: ids.length >= GRAFO.MIN_LEGAJOS_ALERTA,
    });
  });

  out.sort(function(a,b){
    if (b.cantLegajos !== a.cantLegajos) return b.cantLegajos - a.cantLegajos;
    return b.montoTotal - a.montoTotal;
  });
  return out;
}

// ─── LAYOUT ─────────────────────────────────────────────────────────────────
// Disposición determinística en vez de simulación de fuerzas: los legajos van
// en un anillo y cada contraparte se ubica en el centroide de los legajos que
// toca, separándose de sus vecinas con unas pocas iteraciones de repulsión.
//
// Determinístico importa acá: el mismo dato dibuja siempre el mismo grafo, así
// que una captura de pantalla en un legajo es reproducible.
function layoutGrafo(compartidas, ancho, alto) {
  var W = ancho || 900, H = alto || 560;
  var cx = W/2, cy = H/2;
  var R = Math.min(W, H) * 0.40;

  // Legajos involucrados
  var legIds = [];
  var vistos = {};
  compartidas.forEach(function(c){
    c.legajos.forEach(function(l){ if (!vistos[l.id]) { vistos[l.id] = true; legIds.push(l); } });
  });

  var nodosLeg = legIds.map(function(l, i){
    var ang = (i / Math.max(1, legIds.length)) * Math.PI * 2 - Math.PI/2;
    return {
      tipo: 'legajo', id: l.id, label: l.nombre, segmento: l.segmento,
      x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R, ang: ang,
      grado: compartidas.filter(function(c){ return c.legajos.some(function(x){ return x.id===l.id; }); }).length,
    };
  });
  var posLeg = {};
  nodosLeg.forEach(function(n){ posLeg[n.id] = n; });

  var nodosCp = compartidas.map(function(c){
    var xs = 0, ys = 0;
    c.legajos.forEach(function(l){ xs += posLeg[l.id].x; ys += posLeg[l.id].y; });
    return {
      tipo: 'cp', id: c.clave, label: c.label, cant: c.cantLegajos,
      alerta: c.alerta, montoTotal: c.montoTotal, ref: c,
      x: xs / c.legajos.length, y: ys / c.legajos.length,
    };
  });

  // Repulsión entre contrapartes para que no queden encimadas
  for (var it = 0; it < 60; it++) {
    for (var i = 0; i < nodosCp.length; i++) {
      for (var j = i+1; j < nodosCp.length; j++) {
        var a = nodosCp[i], b = nodosCp[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.sqrt(dx*dx + dy*dy) || 0.01;
        var minD = 62;
        if (d < minD) {
          var f = (minD - d) / d * 0.5;
          a.x -= dx * f; a.y -= dy * f;
          b.x += dx * f; b.y += dy * f;
        }
      }
      // No dejar que se escapen del lienzo
      nodosCp[i].x = Math.max(70, Math.min(W-70, nodosCp[i].x));
      nodosCp[i].y = Math.max(40, Math.min(H-40, nodosCp[i].y));
    }
  }

  var aristas = [];
  compartidas.forEach(function(c){
    var cp = nodosCp.find(function(n){ return n.id === c.clave; });
    c.legajos.forEach(function(l){
      aristas.push({ x1: cp.x, y1: cp.y, x2: posLeg[l.id].x, y2: posLeg[l.id].y,
                     alerta: c.alerta, cpId: c.clave, legId: l.id });
    });
  });

  return { W: W, H: H, nodosLeg: nodosLeg, nodosCp: nodosCp, aristas: aristas };
}

export { GRAFO, contrapartesCompartidas, layoutGrafo, claveCp };
