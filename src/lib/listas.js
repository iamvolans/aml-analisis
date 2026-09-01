// ═══════════════════════════════════════════════════════════════════════════
// listas.js — Normalización de listados oficiales de sanciones
// ═══════════════════════════════════════════════════════════════════════════
// Cada organismo publica en su propio formato y ninguno entra directo al motor
// de cotejo. Este módulo reconoce el formato y devuelve entradas homogéneas.
//
// La decisión de diseño que más incide en la detección: **cada alias se emite
// como una entrada propia**, vinculada a su titular. Un designado figura con su
// nombre oficial y con varias grafías alternativas —solo el REPET tiene 1.581
// alias sobre 606 personas—; cargando únicamente el nombre principal se pierde
// la mayoría de las coincidencias posibles.
//
// Formatos soportados:
//   repet-json  REPET (Argentina), personas y entidades, JSON de estructura ONU
//   onu-xml     Consolidada de Naciones Unidas, XML
//   ofac-csv    OFAC SDN y consolidada no-SDN, CSV de 12 columnas SIN cabecera
//   ue-csv      Consolidada de la Unión Europea, CSV con separador punto y coma
//
// Forma de cada entrada:
//   { nombre, doc, detalle, tipo, ref, aliasDe }
//   · tipo    'persona' | 'entidad' | 'buque' | 'aeronave' | ''
//   · ref     identificador del organismo (QDi.371, SDi.007, ent_num de OFAC)
//   · aliasDe nombre del titular cuando la entrada es un alias; '' si es principal

// ── Utilidades ──────────────────────────────────────────────────────────────
function limpio(x) {
  if (x === null || x === undefined) return '';
  var s = String(x).trim();
  // OFAC escribe '-0-' donde no hay dato. Sin esto quedarían miles de entradas
  // llamadas literalmente "-0-".
  if (s === '-0-' || s === '-0-.') return '';
  return s.replace(/\s+/g, ' ');
}

function unir() {
  var partes = [];
  for (var i = 0; i < arguments.length; i++) {
    var v = limpio(arguments[i]);
    if (v) partes.push(v);
  }
  return partes.join(' ');
}

// Lector de XML sin dependencias, suficiente para el subconjunto que publican
// estos organismos: sin CDATA, sin atributos en los elementos y con dos niveles
// de anidamiento como máximo. Se verificó contra los archivos reales.
function nodosXML(xml, etiqueta) {
  var out = [];
  var abre = '<' + etiqueta + '>', cierra = '</' + etiqueta + '>';
  var i = 0;
  while (true) {
    var a = xml.indexOf(abre, i);
    if (a < 0) break;
    var b = xml.indexOf(cierra, a);
    if (b < 0) break;
    out.push(xml.slice(a + abre.length, b));
    i = b + cierra.length;
  }
  return out;
}

function textoXML(frag, etiqueta) {
  var a = frag.indexOf('<' + etiqueta + '>');
  if (a < 0) return '';
  var b = frag.indexOf('</' + etiqueta + '>', a);
  if (b < 0) return '';
  return desescapar(frag.slice(a + etiqueta.length + 2, b));
}

function desescapar(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

// Lector de CSV que respeta comillas y separador configurable
function filasCSV(texto, sep) {
  var filas = [], campo = '', fila = [], enComillas = false;
  var t = texto.charCodeAt(0) === 0xFEFF ? texto.slice(1) : texto;
  for (var i = 0; i < t.length; i++) {
    var c = t[i];
    if (enComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === sep) {
      fila.push(campo); campo = '';
    } else if (c === '\n') {
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(function(f){ return f.some(function(x){ return String(x).trim() !== ''; }); });
}

// ── Detección de formato ────────────────────────────────────────────────────
function detectarFormato(nombreArchivo, texto) {
  var n = String(nombreArchivo || '').toLowerCase();
  var cabeza = String(texto || '').slice(0, 3000);

  if (cabeza.indexOf('<CONSOLIDATED_LIST') >= 0) return 'onu-xml';
  if (/^\s*[\[{]/.test(cabeza) && cabeza.indexOf('REFERENCE_NUMBER') >= 0) return 'repet-json';
  if (cabeza.indexOf('Naal_wholename') >= 0 || cabeza.indexOf('Entity_logical_id') >= 0) return 'ue-csv';

  // OFAC no trae cabecera: se reconoce por la forma de la primera fila —número,
  // nombre entre comillas y doce columnas— más el relleno '-0-'.
  if (cabeza.indexOf('-0-') >= 0) {
    var pf = filasCSV(cabeza, ',')[0];
    if (pf && pf.length >= 10 && /^\d+$/.test(String(pf[0]).trim())) return 'ofac-csv';
  }
  if (/sdn|cons_prim|ofac/.test(n)) return 'ofac-csv';
  if (/repet/.test(n)) return 'repet-json';
  return null;
}

// ── REPET (JSON con estructura de Naciones Unidas) ──────────────────────────
function normalizarREPET(texto) {
  var datos = typeof texto === 'string' ? JSON.parse(texto) : texto;
  var arr = Array.isArray(datos) ? datos
          : (Object.keys(datos).map(function(k){ return datos[k]; })
                   .filter(Array.isArray)[0] || []);
  var out = [], avisos = [];

  arr.forEach(function(r) {
    var esEntidad = !!r.ENTITY_ALIAS || (!r.SECOND_NAME && !r.INDIVIDUAL_ALIAS);
    var nombre = unir(r.FIRST_NAME, r.SECOND_NAME, r.THIRD_NAME, r.FOURTH_NAME);
    if (!nombre) return;

    var ref = limpio(r.REFERENCE_NUMBER);
    var detalle = [];
    if (limpio(r.UN_LIST_TYPE)) detalle.push('Régimen: ' + limpio(r.UN_LIST_TYPE));
    if (limpio(r.LISTED_ON)) detalle.push('Listado el ' + limpio(r.LISTED_ON));
    if (limpio(r.COMMENTS1)) detalle.push(limpio(r.COMMENTS1).slice(0, 300));

    // Documentos: se emite una entrada por cada documento, para que el cotejo
    // por número funcione con cualquiera de ellos.
    var docs = (r.INDIVIDUAL_DOCUMENT || []).map(function(d){ return limpio(d.NUMBER); })
                 .filter(Boolean);

    out.push({
      nombre: nombre, doc: docs[0] || '', detalle: detalle.join(' · '),
      tipo: esEntidad ? 'entidad' : 'persona', ref: ref, aliasDe: ''
    });
    docs.slice(1).forEach(function(d){
      out.push({ nombre: nombre, doc: d, detalle: detalle.join(' · '),
                 tipo: esEntidad ? 'entidad' : 'persona', ref: ref, aliasDe: '' });
    });

    var alias = r.INDIVIDUAL_ALIAS || r.ENTITY_ALIAS || [];
    alias.forEach(function(a) {
      var an = limpio(a.ALIAS_NAME);
      // Los alias de calidad baja suelen ser iniciales o fragmentos: generarían
      // ruido sin aportar detección.
      if (!an || an.length < 4) return;
      if (String(a.QUALITY || '').toLowerCase() === 'low') return;
      out.push({
        nombre: an, doc: docs[0] || '',
        detalle: 'Alias de ' + nombre + (ref ? ' (' + ref + ')' : ''),
        tipo: esEntidad ? 'entidad' : 'persona', ref: ref, aliasDe: nombre
      });
    });
  });

  return { entradas: out, avisos: avisos };
}

// ── Naciones Unidas (XML consolidado) ───────────────────────────────────────
function normalizarONU(texto) {
  var out = [];

  function procesar(frag, esEntidad) {
    var nombre = unir(
      textoXML(frag, 'FIRST_NAME'), textoXML(frag, 'SECOND_NAME'),
      textoXML(frag, 'THIRD_NAME'), textoXML(frag, 'FOURTH_NAME'));
    if (!nombre) return;

    var ref = textoXML(frag, 'REFERENCE_NUMBER');
    var detalle = [];
    var reg = textoXML(frag, 'UN_LIST_TYPE');
    if (reg) detalle.push('Régimen: ' + reg);
    var alta = textoXML(frag, 'LISTED_ON');
    if (alta) detalle.push('Listado el ' + alta);
    var com = textoXML(frag, 'COMMENTS1');
    if (com) detalle.push(com.slice(0, 300));

    var docs = nodosXML(frag, esEntidad ? 'ENTITY_DOCUMENT' : 'INDIVIDUAL_DOCUMENT')
      .map(function(d){ return limpio(textoXML(d, 'NUMBER')); }).filter(Boolean);

    out.push({ nombre: nombre, doc: docs[0] || '', detalle: detalle.join(' · '),
               tipo: esEntidad ? 'entidad' : 'persona', ref: ref, aliasDe: '' });

    nodosXML(frag, esEntidad ? 'ENTITY_ALIAS' : 'INDIVIDUAL_ALIAS').forEach(function(a) {
      var an = limpio(textoXML(a, 'ALIAS_NAME'));
      if (!an || an.length < 4) return;
      if (textoXML(a, 'QUALITY').toLowerCase() === 'low') return;
      out.push({ nombre: an, doc: docs[0] || '',
                 detalle: 'Alias de ' + nombre + (ref ? ' (' + ref + ')' : ''),
                 tipo: esEntidad ? 'entidad' : 'persona', ref: ref, aliasDe: nombre });
    });
  }

  nodosXML(texto, 'INDIVIDUAL').forEach(function(f){ procesar(f, false); });
  nodosXML(texto, 'ENTITY').forEach(function(f){ procesar(f, true); });
  return { entradas: out, avisos: [] };
}

// ── OFAC (CSV de 12 columnas, sin cabecera) ─────────────────────────────────
// Orden: ent_num, nombre, tipo, programa, cargo, indicativo, tipo_buque,
//        tonelaje, GRT, bandera, propietario, observaciones
function normalizarOFAC(texto) {
  var filas = filasCSV(texto, ',');
  var out = [], avisos = [], buques = 0;

  filas.forEach(function(f) {
    if (f.length < 4) return;
    var nombre = limpio(f[1]);
    if (!nombre) return;
    var tipoRaw = limpio(f[2]).toLowerCase();
    var tipo = tipoRaw === 'individual' ? 'persona'
             : tipoRaw === 'vessel' ? 'buque'
             : tipoRaw === 'aircraft' ? 'aeronave' : 'entidad';
    if (tipo === 'buque' || tipo === 'aeronave') buques++;

    var detalle = [];
    var prog = limpio(f[3]);
    if (prog) detalle.push('Programa: ' + prog);
    var cargo = limpio(f[4]);
    if (cargo) detalle.push(cargo);
    var obs = limpio(f[11]);
    if (obs) detalle.push(obs.slice(0, 300));

    // Los documentos de OFAC se publican en un archivo aparte (add.csv / alt.csv)
    out.push({ nombre: nombre, doc: '', detalle: detalle.join(' · '),
               tipo: tipo, ref: limpio(f[0]), aliasDe: '' });
  });

  if (buques) {
    avisos.push(buques + ' registro(s) corresponden a buques o aeronaves. Se incorporan '
      + 'identificados por tipo, de modo que puedan distinguirse en el informe.');
  }
  avisos.push('OFAC publica los alias y documentos en archivos complementarios '
    + '(alt.csv y add.csv). Cargarlos amplía la cobertura del cotejo.');
  return { entradas: out, avisos: avisos };
}

// ── Unión Europea (CSV con punto y coma) ────────────────────────────────────
// El archivo repite cada entidad por combinación de nombre y dirección: 43.851
// filas corresponden a 2.671 entidades. Se deduplica por nombre y titular.
function normalizarUE(texto) {
  var filas = filasCSV(texto, ';');
  if (!filas.length) return { entradas: [], avisos: ['Archivo vacío.'] };

  var cab = filas[0].map(function(c){ return limpio(c); });
  // El archivo de la UE repite algunas cabeceras: Entity_logical_id aparece seis
  // veces, una por cada bloque de datos. Se toma SIEMPRE la primera aparición;
  // quedarse con la última hacía que todas las filas compartieran identificador
  // y que el archivo entero se interpretara como una sola entidad.
  var col = {};
  cab.forEach(function(c, i){ if (col[c] === undefined) col[c] = i; });
  var iId  = col['Entity_logical_id'];
  var iTipo= col['Subject_type'];
  var iProg= col['Programme'];
  var iWn  = col['Naal_wholename'];
  var iAp  = col['Naal_lastname'];
  var iNo  = col['Naal_firstname'];
  var iDoc = col['Iden_number'];

  var vistos = {}, out = [], principal = {};

  filas.slice(1).forEach(function(f) {
    var nombre = limpio(iWn !== undefined ? f[iWn] : '') || unir(f[iNo], f[iAp]);
    if (!nombre || nombre.length < 3) return;
    var id = limpio(f[iId]);
    var tipo = limpio(f[iTipo]).toUpperCase() === 'P' ? 'persona' : 'entidad';
    var doc = iDoc !== undefined ? limpio(f[iDoc]) : '';

    // El primer nombre que aparece para una entidad se toma como principal; los
    // siguientes son variantes y se registran como alias de aquel.
    if (!principal[id]) principal[id] = nombre;

    var clave = id + '|' + nombre.toUpperCase() + '|' + doc;
    if (vistos[clave]) return;
    vistos[clave] = true;

    var detalle = [];
    var prog = limpio(f[iProg]);
    if (prog) detalle.push('Programa: ' + prog);
    var esAlias = principal[id] !== nombre;
    if (esAlias) detalle.push('Variante de ' + principal[id]);

    out.push({ nombre: nombre, doc: doc, detalle: detalle.join(' · '),
               tipo: tipo, ref: id, aliasDe: esAlias ? principal[id] : '' });
  });

  return {
    entradas: out,
    avisos: ['El archivo repite cada entidad por variante de nombre y dirección; '
      + 'se consolidaron ' + filas.length + ' filas en ' + out.length + ' entradas únicas.']
  };
}

// ── Punto de entrada ────────────────────────────────────────────────────────
var FORMATOS = {
  'repet-json': { label: 'REPET (Argentina)', fn: normalizarREPET },
  'onu-xml':    { label: 'Naciones Unidas',   fn: normalizarONU },
  'ofac-csv':   { label: 'OFAC (Estados Unidos)', fn: normalizarOFAC },
  'ue-csv':     { label: 'Unión Europea',     fn: normalizarUE },
};

function normalizarLista(nombreArchivo, texto) {
  var formato = detectarFormato(nombreArchivo, texto);
  if (!formato) {
    return { formato: null, label: null, entradas: [], avisos: [
      'No se reconoció el formato del archivo. Se puede cargar de todos modos '
      + 'mediante el mapeo manual de columnas.'] };
  }
  var def = FORMATOS[formato];
  var r;
  try {
    r = def.fn(texto);
  } catch (e) {
    return { formato: formato, label: def.label, entradas: [], avisos: [
      'El archivo tiene el formato de ' + def.label + ' pero no pudo procesarse: ' + e.message] };
  }
  var principales = r.entradas.filter(function(x){ return !x.aliasDe; }).length;
  return {
    formato: formato,
    label: def.label,
    entradas: r.entradas,
    principales: principales,
    alias: r.entradas.length - principales,
    avisos: r.avisos || []
  };
}

export {
  detectarFormato, normalizarLista, normalizarREPET, normalizarONU,
  normalizarOFAC, normalizarUE, filasCSV, nodosXML, textoXML, limpio, FORMATOS
};
