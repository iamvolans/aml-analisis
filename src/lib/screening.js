// ═══════════════════════════════════════════════════════════════════════════
// screening.js — Motor de matching contra listas restrictivas (T5)
// ═══════════════════════════════════════════════════════════════════════════
// Reemplaza la dependencia de IA con búsqueda web por matching determinístico
// local. La diferencia importa: un inspector puede reproducir exactamente este
// resultado a partir del listado y del algoritmo. Una respuesta de un modelo
// con web search no es reproducible ni auditable.
//
// Todo el matching corre en el navegador contra el listado cargado en Supabase.
// No hay llamadas a terceros durante una corrida.

import { uid } from "./utils.js";
// Nota: los imports de este módulo y de su cierre transitivo (casos, aml, utils,
// theme) llevan extensión .js explícita a propósito. Vite la acepta, pero Node
// ESM la EXIGE, y api/cron-screening.js importa este archivo desde una función
// serverless. Sin la extensión el cron falla con ERR_MODULE_NOT_FOUND.

// ─── UMBRALES ───────────────────────────────────────────────────────────────
// ⚠️ PARAMETRIZABLE. Bajarlos aumenta falsos positivos; subirlos, falsos
// negativos. En screening PLAFT conviene pecar de sensible y descartar a mano.
var UMBRALES = {
  ALTA:   0.95,  // coincidencia prácticamente segura
  MEDIA:  0.85,  // requiere revisión del analista
  BAJA:   0.78,  // posible, se informa pero con baja prioridad
};

// Sufijos societarios que se quitan para comparar razones sociales
var SUFIJOS = [
  'SOCIEDAD ANONIMA UNIPERSONAL','SOCIEDAD ANONIMA','SOCIEDAD DE RESPONSABILIDAD LIMITADA',
  'SOCIEDAD POR ACCIONES SIMPLIFICADA','SOCIEDAD EN COMANDITA POR ACCIONES',
  'SAS','SRL','SCA','SCS','SH','SA','LTDA','LIMITADA','INC','LLC','CORP','LTD','SL','SPA',
];

// ─── NORMALIZACIÓN ──────────────────────────────────────────────────────────
function normalizar(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // saca tildes y diéresis
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')                       // puntuación fuera
    .replace(/\s+/g, ' ')
    .trim();
}

function sinSufijos(norm) {
  var out = norm;
  for (var i = 0; i < SUFIJOS.length; i++) {
    var re = new RegExp('(^|\\s)' + SUFIJOS[i] + '(\\s|$)', 'g');
    out = out.replace(re, ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Solo dígitos: sirve para comparar CUIT/CUIL/DNI sin importar el formato
function soloDigitos(str) { return String(str||'').replace(/\D/g, ''); }

// Conectores que no aportan identidad: si dos razones sociales solo comparten
// "DE" y "LA", eso no es una coincidencia.
var VACIOS = {'DE':1,'DEL':1,'LA':1,'LAS':1,'LOS':1,'EL':1,'Y':1,'E':1,'EN':1,'DA':1,'DO':1};

function tokens(norm) {
  var t = norm.split(' ').filter(function(x){ return x.length > 1; });
  var sinVacios = t.filter(function(x){ return !VACIOS[x]; });
  return sinVacios.length ? sinVacios : t;  // no vaciar nombres muy cortos
}

// ─── SIMILITUD ──────────────────────────────────────────────────────────────
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  var prev = new Array(b.length + 1);
  for (var j = 0; j <= b.length; j++) prev[j] = j;
  for (var i = 1; i <= a.length; i++) {
    var cur = [i];
    for (var k = 1; k <= b.length; k++) {
      var costo = a.charCodeAt(i-1) === b.charCodeAt(k-1) ? 0 : 1;
      cur[k] = Math.min(prev[k] + 1, cur[k-1] + 1, prev[k-1] + costo);
    }
    prev = cur;
  }
  return prev[b.length];
}

function ratio(a, b) {
  var max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - (levenshtein(a, b) / max);
}

function jaccard(ta, tb) {
  if (!ta.length || !tb.length) return 0;
  var setB = {}; tb.forEach(function(t){ setB[t] = true; });
  var inter = 0;
  var vistos = {};
  ta.forEach(function(t){ if (setB[t] && !vistos[t]) { inter++; vistos[t] = true; } });
  var union = {};
  ta.concat(tb).forEach(function(t){ union[t] = true; });
  return inter / Object.keys(union).length;
}

// token_set_ratio: tolera orden distinto y palabras de más en cualquiera de los
// dos lados. "PEREZ JUAN" vs "JUAN CARLOS PEREZ" da alto, que es lo que se
// espera en nombres de personas.
function tokenSetRatio(na, nb) {
  var ta = tokens(na), tb = tokens(nb);
  if (!ta.length || !tb.length) return 0;
  var setB = {}; tb.forEach(function(t){ setB[t] = true; });
  var setA = {}; ta.forEach(function(t){ setA[t] = true; });
  var inter = [], restA = [], restB = [];
  Object.keys(setA).sort().forEach(function(t){ if (setB[t]) inter.push(t); else restA.push(t); });
  Object.keys(setB).sort().forEach(function(t){ if (!setA[t]) restB.push(t); });
  var t0 = inter.join(' ');
  var t1 = (inter.concat(restA)).join(' ');
  var t2 = (inter.concat(restB)).join(' ');
  return Math.max(ratio(t0, t1), ratio(t0, t2), ratio(t1, t2));
}

// Cobertura tolerante a tipeos: qué proporción de los tokens de cada lado tiene
// contraparte razonable en el otro. "TRANSPORTES" y "TRANSPORTE" cuentan como
// cubiertos; "NORTE" y "SUR" no.
function cubiertos(ta, tb) {
  var n = 0;
  for (var i = 0; i < ta.length; i++) {
    for (var k = 0; k < tb.length; k++) {
      if (ta[i] === tb[k] || ratio(ta[i], tb[k]) >= 0.85) { n++; break; }
    }
  }
  return n;
}

// Similitud combinada, con una compuerta barata adelante para no correr
// Levenshtein contra listados de miles de entradas sin necesidad.
//
// token_set_ratio por sí solo devuelve 1.0 cuando un nombre es subconjunto del
// otro ("JUAN PEREZ" dentro de "JUAN CARLOS PEREZ GOMEZ"). Para screening eso
// tiene que reportarse, pero NO con el mismo puntaje que una coincidencia
// exacta: el analista necesita distinguir "es el mismo nombre" de "el nombre
// está contenido". Por eso se penaliza según la cobertura de tokens.
function similitud(na, nb) {
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  var ta = tokens(na), tb = tokens(nb);
  var j = jaccard(ta, tb);
  if (j === 0) {
    // Sin ningún token en común, solo vale la pena si son cadenas cortas y muy
    // parecidas (error de tipeo en un apellido único)
    if (Math.abs(na.length - nb.length) > 4) return 0;
    var r0 = ratio(na, nb);
    return r0 >= UMBRALES.BAJA ? r0 : 0;
  }
  if (j < 0.2) return 0;

  var base = Math.max(j, tokenSetRatio(na, nb));
  var cobertura = (cubiertos(ta, tb) + cubiertos(tb, ta)) / (ta.length + tb.length);
  if (cobertura >= 0.999) return base;         // se cubren mutuamente: sin castigo
  return base * (0.82 + 0.18 * cobertura);
}

function nivelDe(score) {
  return score >= UMBRALES.ALTA ? 'ALTA'
       : score >= UMBRALES.MEDIA ? 'MEDIA'
       : score >= UMBRALES.BAJA ? 'BAJA' : null;
}

// ─── SUJETOS A SCREENEAR ────────────────────────────────────────────────────
// Un legajo no es una sola persona: hay que chequear la sociedad y también a
// quienes la representan y controlan.
function sujetosDe(legajo) {
  var out = [];
  function add(nombre, doc, rol) {
    if (!nombre || !String(nombre).trim()) return;
    // "vinculados" suele venir como lista separada por comas o saltos de línea
    String(nombre).split(/[,;\n]/).forEach(function(parte){
      var n = parte.trim();
      if (n.length < 3) return;
      out.push({ nombre: n, doc: doc || '', rol: rol });
    });
  }
  add(legajo.razonSocial, legajo.cuit, 'Sociedad');
  add(legajo.representanteLegal, '', 'Representante legal');
  add(legajo.presidente, '', 'Presidente');
  add(legajo.beneficiarioFinal, '', 'Beneficiario final');
  add(legajo.vinculados, '', 'Vinculado');
  return out;
}

// ─── INDEXADO POR BLOQUES ───────────────────────────────────────────────────
// Comparar cada sujeto contra cada entrada es O(n·m): con 200 legajos y 5.000
// entradas son 2 millones de comparaciones, varias de ellas con Levenshtein
// completo. Inviable en el navegador.
//
// En vez de eso se indexa el listado por claves de bloqueo derivadas de cada
// token: sus primeros 4 caracteres y sus últimos 4. Solo se comparan a fondo
// las entradas que comparten alguna clave con el sujeto.
//
// Límite conocido y aceptado: un error de tipeo que altere simultáneamente el
// principio Y el final de todos los tokens de un nombre no entra al bloque y no
// se detecta. Es el compromiso estándar en resolución de entidades; sin él el
// screening no corre en tiempo razonable.
function clavesBloqueo(tks) {
  var out = {};
  for (var i = 0; i < tks.length; i++) {
    var t = tks[i];
    out['P' + t.slice(0, 4)] = true;
    if (t.length > 4) out['S' + t.slice(-4)] = true;
  }
  return Object.keys(out);
}

function construirIndice(entradas) {
  var idx = {};
  for (var i = 0; i < entradas.length; i++) {
    var ks = clavesBloqueo(tokens(entradas[i].normSin || entradas[i].norm));
    for (var k = 0; k < ks.length; k++) {
      if (!idx[ks[k]]) idx[ks[k]] = [];
      idx[ks[k]].push(i);
    }
  }
  return idx;
}

// Índice adicional por documento: el match por CUIT/DNI es exacto y no depende
// del nombre, así que va por su propia vía.
function construirIndiceDoc(entradas) {
  var idx = {};
  for (var i = 0; i < entradas.length; i++) {
    if (entradas[i].doc) {
      if (!idx[entradas[i].doc]) idx[entradas[i].doc] = [];
      idx[entradas[i].doc].push(i);
    }
  }
  return idx;
}

// ─── MATCHING ───────────────────────────────────────────────────────────────
// Una entrada de listado: { id, nombre, doc, lista, detalle }
// Precalcula las formas normalizadas y los índices una sola vez por corrida.
function prepararListado(entradas, listaId) {
  var lista = (entradas || []).map(function(e, i){
    var nom = e.nombre || e.name || e.denominacion || '';
    var norm = normalizar(nom);
    return {
      id: e.id || (listaId + '-' + i),
      nombre: nom,
      norm: norm,
      normSin: sinSufijos(norm),
      doc: soloDigitos(e.doc || e.documento || e.cuit || e.identificacion || ''),
      lista: listaId,
      detalle: e.detalle || e.observaciones || e.tipo || '',
    };
  }).filter(function(e){ return e.norm.length >= 3; });
  return { entradas: lista, indice: construirIndice(lista), indiceDoc: construirIndiceDoc(lista) };
}

// Devuelve los hits de un sujeto contra un listado ya preparado e indexado
function matchearSujeto(sujeto, preparada) {
  var lista = preparada.entradas;
  var norm = normalizar(sujeto.nombre);
  var normSin = sinSufijos(norm);
  var doc = soloDigitos(sujeto.doc);
  var hits = [];
  var yaVisto = {};

  // 1. Documento — la señal más fuerte, no depende de la grafía del nombre
  if (doc && preparada.indiceDoc[doc]) {
    preparada.indiceDoc[doc].forEach(function(i){
      yaVisto[i] = true;
      hits.push({ entrada: lista[i], score: 1, nivel: 'ALTA', criterio: 'DOCUMENTO' });
    });
  }

  // 2-4. Candidatos por bloque de nombre
  var ks = clavesBloqueo(tokens(normSin || norm));
  var cands = {};
  for (var a = 0; a < ks.length; a++) {
    var bucket = preparada.indice[ks[a]];
    if (!bucket) continue;
    for (var b = 0; b < bucket.length; b++) cands[bucket[b]] = true;
  }

  Object.keys(cands).forEach(function(key){
    var i = Number(key);
    if (yaVisto[i]) return;
    var e = lista[i];
    if (norm === e.norm) {
      hits.push({ entrada: e, score: 1, nivel: 'ALTA', criterio: 'EXACTO' });
      return;
    }
    if (normSin && normSin === e.normSin) {
      hits.push({ entrada: e, score: 0.98, nivel: 'ALTA', criterio: 'EXACTO_SIN_SUFIJO' });
      return;
    }
    var sc = similitud(normSin || norm, e.normSin || e.norm);
    var niv = nivelDe(sc);
    if (niv) hits.push({ entrada: e, score: Number(sc.toFixed(4)), nivel: niv, criterio: 'APROXIMADO' });
  });

  hits.sort(function(a,b){ return b.score - a.score; });
  return hits;
}

// Clave estable de un hit, para poder descartarlo y que no vuelva a aparecer
function claveHit(legajoId, sujetoNombre, entradaId) {
  return legajoId + '::' + normalizar(sujetoNombre) + '::' + entradaId;
}

// ─── CORRIDA COMPLETA ───────────────────────────────────────────────────────
// listas: [{ id, nombre, fuente, version, entradas: [...] }]
// descartes: { claveHit: {motivo, autor, fecha} }
function correrScreening(legajos, listas, descartes, opts) {
  opts = opts || {};
  var soloActivos = opts.soloActivos !== false;
  var d = descartes || {};
  var inicio = Date.now();

  var preparadas = (listas || []).map(function(l){
    return { meta: l, prep: prepararListado(l.entradas, l.id) };
  });

  var objetivo = (legajos || []).filter(function(l){
    if (!soloActivos) return true;
    var est = l.estadoCuenta || 'EN_ONBOARDING';
    return est !== 'CERRADA';
  });

  var hits = [];
  objetivo.forEach(function(leg){
    sujetosDe(leg).forEach(function(suj){
      preparadas.forEach(function(pl){
        matchearSujeto(suj, pl.prep).forEach(function(h){
          var clave = claveHit(leg.id, suj.nombre, h.entrada.id);
          if (d[clave]) return; // descartado por un analista, no reaparece
          hits.push({
            clave: clave,
            legajoId: leg.id,
            legajoNom: leg.razonSocial || 'Sin nombre',
            sujeto: suj.nombre,
            rol: suj.rol,
            entradaId: h.entrada.id,
            entradaNom: h.entrada.nombre,
            entradaDetalle: h.entrada.detalle,
            lista: pl.meta.nombre || pl.meta.id,
            listaVersion: pl.meta.version || '',
            score: h.score,
            nivel: h.nivel,
            criterio: h.criterio,
          });
        });
      });
    });
  });

  hits.sort(function(a,b){ return b.score - a.score; });

  return {
    id: uid(),
    fecha: new Date().toISOString(),
    alcance: soloActivos ? 'Cartera activa' : 'Cartera completa',
    legajosEvaluados: objetivo.length,
    duracionMs: Date.now() - inicio,
    listas: preparadas.map(function(p){
      return { id: p.meta.id, nombre: p.meta.nombre, fuente: p.meta.fuente,
               version: p.meta.version, cantidad: p.prep.entradas.length };
    }),
    umbrales: Object.assign({}, UMBRALES),
    hits: hits,
    resumen: {
      total: hits.length,
      alta: hits.filter(function(h){return h.nivel==='ALTA';}).length,
      media: hits.filter(function(h){return h.nivel==='MEDIA';}).length,
      baja: hits.filter(function(h){return h.nivel==='BAJA';}).length,
      descartados: Object.keys(d).length,
    }
  };
}

// ─── DIFF ENTRE CORRIDAS ────────────────────────────────────────────────────
// Coincidencias presentes en la corrida actual y ausentes en la anterior. Es lo
// que necesita el cron para no reabrir cada semana los mismos casos.
//
// Si no hay corrida anterior devuelve lista vacía a propósito: la primera vez
// que se carga un listado, TODO es "nuevo" y generar cientos de casos de golpe
// no ayuda a nadie. La primera revisión se hace a mano.
function hitsNuevos(runActual, runAnterior) {
  if (!runActual || !runActual.hits) return [];
  if (!runAnterior || !runAnterior.hits) return [];
  var previos = {};
  runAnterior.hits.forEach(function(h){ previos[h.clave] = true; });
  return runActual.hits.filter(function(h){ return !previos[h.clave]; });
}

// ─── PARSEO DE LISTADOS ─────────────────────────────────────────────────────
// Acepta el CSV/JSON oficial sin pedir un formato propio: busca las columnas
// por nombre entre varios alias habituales.
var ALIAS_NOMBRE = ['nombre','nombres','nombre_completo','nombre_y_apellido','apellido_y_nombre','apellido_nombre','apellidos_y_nombres','denominacion','denominacion_social','razon_social','razonsocial','name','fullname','full_name','sujeto','persona','titular','entidad','beneficiario'];
var ALIAS_DOC    = ['documento','doc','nro_documento','numero_documento','numero_de_documento','nro_de_documento','n_de_documento','numero_de_doc','n_documento','nro_doc','numero','nro','cuit','cuil','cuit_cuil','nro_cuit','numero_cuit','dni','nro_dni','identificacion','id_documento','tax_id','identificador'];
var ALIAS_TIPODOC= ['tipo_documento','tipo_de_documento','tipo_doc','tipodoc','clase_documento','tipo_identificacion','tipo_de_identificacion'];
var ALIAS_DET    = ['detalle','observaciones','observacion','tipo','motivo','resolucion','descripcion','lista','origen','fuente','nacionalidad','alias'];

function buscarCampo(fila, alias) {
  var claves = Object.keys(fila);
  for (var i = 0; i < claves.length; i++) {
    var k = claves[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    if (alias.indexOf(k) >= 0) return fila[claves[i]];
  }
  return '';
}

// Sugiere qué columna corresponde a cada campo. Devuelve el nombre EXACTO de la
// cabecera para poder mostrarlo y dejar que el usuario lo corrija.
function sugerirMapeo(headers) {
  function buscar(alias) {
    for (var i = 0; i < headers.length; i++) {
      var k = headers[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
      if (alias.indexOf(k) >= 0) return headers[i];
    }
    return '';
  }
  return {
    nombre:  buscar(ALIAS_NOMBRE) || (headers[0] || ''),
    doc:     buscar(ALIAS_DOC),
    tipoDoc: buscar(ALIAS_TIPODOC),
    detalle: buscar(ALIAS_DET),
  };
}

// Construye las entradas con un mapeo explícito de columnas.
function filasAEntradasMapeo(filas, mapeo) {
  return (filas || []).map(function(f){
    var det = [];
    if (mapeo.tipoDoc && f[mapeo.tipoDoc]) det.push(f[mapeo.tipoDoc]);
    if (mapeo.detalle && f[mapeo.detalle]) det.push(f[mapeo.detalle]);
    return {
      nombre: mapeo.nombre ? f[mapeo.nombre] : '',
      doc: mapeo.doc ? f[mapeo.doc] : '',
      detalle: det.join(' · '),
    };
  }).filter(function(e){ return e.nombre && String(e.nombre).trim().length >= 3; });
}

function filasAEntradas(filas) {
  return (filas || []).map(function(f){
    return {
      nombre: buscarCampo(f, ALIAS_NOMBRE),
      doc: buscarCampo(f, ALIAS_DOC),
      detalle: buscarCampo(f, ALIAS_DET),
    };
  }).filter(function(e){ return e.nombre && String(e.nombre).trim().length >= 3; });
}

export {
  UMBRALES, normalizar, sinSufijos, soloDigitos, similitud, tokenSetRatio, nivelDe,
  sujetosDe, prepararListado, matchearSujeto, claveHit, correrScreening,
  filasAEntradas, filasAEntradasMapeo, sugerirMapeo, buscarCampo, clavesBloqueo, hitsNuevos
};
