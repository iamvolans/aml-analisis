import * as XLSX from "xlsx";


// ─── UNIVERSAL TRANSACTION FILE PARSER (CSV + XLS + XLSX) ────────────────────
function normalizeRows(rows) {
  // rows = array of arrays (headers in row[0], data in rest)
  if (!rows || rows.length < 2) return [];
  var hdrs = rows[0].map(function(h) {
    return String(h||'').toLowerCase().trim()
      .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i')
      .replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n')
      .replace(/[^a-z0-9_]/g,'_').replace(/__+/g,'_').replace(/^_|_$/g,'');
  });
  function fc() {
    var keys = [];
    for (var ai = 0; ai < arguments.length; ai++) keys.push(arguments[ai]);
    for (var k=0; k<keys.length; k++) {
      for (var j=0; j<hdrs.length; j++) {
        if (hdrs[j] === keys[k] || hdrs[j].includes(keys[k])) return j;
      }
    }
    return -1;
  }
  var iF=fc('fecha','date','fec'), iH=fc('hora','time','hh');
  var iT=fc('tipo','type','direction','sentido','operacion','op');
  var iM=fc('monto','amount','importe','valor','total','credito','debito','credit','debit');
  var iCN=fc('contraparte_nombre','cpname','cp_nombre','contraparte','beneficiario','nombre','razon_social','denominacion');
  var iCC=fc('contraparte_cuit','cvalue','cp_cuit','cuit','cuil');
  var iCh=fc('canal','channel','medio');
  var iR=fc('referencia','concepto','descripcion','detalle','ref','glosa');

  function nT(v) {
    var s=String(v||'').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_\-\.]/g,'');
    if (s==='IN'||s==='CR'||s==='C'||s==='DEPOSIT'||s==='DEPOSITO'||s.includes('CRED')||s.includes('INGR')||s.includes('COBR')||s==='1'||s==='ENTRADA'||s==='HABER'||s==='ACREDITADO'||s==='ACREDIT') return 'IN';
    if (s==='OUT'||s==='DB'||s==='D'||s==='WITHDRAW'||s==='WITHDRAWAL'||s.includes('DEB')||s.includes('EGRE')||s.includes('PAG')||s==='0'||s==='SALIDA'||s==='DEBE'||s==='DEBITADO'||s==='DEBIT') return 'OUT';
    // Si no hay columna tipo explícita, inferir por monto (positivo=IN, negativo=OUT)
    return null;
  }
  function getVal(row, idx) { return idx>=0 && idx<row.length ? String(row[idx]||'').trim() : ''; }
  function parseMonto(v) {
    // Si SheetJS ya entregó un número JS (raw:true), usarlo directo sin conversión a string
    if (typeof v === 'number') { return isNaN(v) ? null : v; }
    var s = String(v || '').trim().replace(/[$\s]/g, '');
    if (!s) return null;
    // Detección inteligente de separadores:
    // Si tiene ambos (ej: 1.234,56 europeo ó 1,234.56 americano)
    var lastDot   = s.lastIndexOf('.');
    var lastComma = s.lastIndexOf(',');
    if (lastDot > -1 && lastComma > -1) {
      if (lastDot > lastComma) {
        // Formato americano: 1,234.56 → eliminar comas
        s = s.replace(/,/g, '');
      } else {
        // Formato europeo: 1.234,56 → eliminar puntos y reemplazar coma
        s = s.replace(/\./g, '').replace(',', '.');
      }
    } else if (lastComma > -1) {
      // Solo coma: si va seguida de 1-2 dígitos al final, es decimal; si no, es miles
      if (/,\d{1,2}$/.test(s)) { s = s.replace(',', '.'); }
      else { s = s.replace(/,/g, ''); }
    }
    // Solo punto o sin separadores: parseFloat directo (punto = decimal)
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  var txns = [];
  for (var i=1; i<rows.length; i++) {
    var row = rows[i];
    if (!row || !row.some(function(c){return c!==null&&c!==undefined&&c!=='';}) ) continue;

    // Usar el valor raw del array (número JS de SheetJS) sin pasar por getVal/String
    var montoRaw = (iM >= 0 && iM < row.length) ? row[iM] : '';
    var monto = parseMonto(montoRaw);
    if (monto === null || monto === 0) continue;

    var tipo = iT>=0 ? nT(getVal(row,iT)) : null;
    // Si no hay columna tipo, inferir por signo del monto
    if (!tipo) {
      tipo = monto > 0 ? 'IN' : 'OUT';
    }
    monto = Math.abs(monto);

    // Fecha: puede venir como número serial de Excel (días desde 1/1/1900)
    var fechaRaw = getVal(row, iF);
    var fechaStr = fechaRaw;
    if (iF>=0 && !isNaN(Number(fechaRaw)) && Number(fechaRaw) > 1000) {
      // Número serial de Excel → fecha
      try {
        var excelDate = XLSX.SSF.parse_date_code(Number(fechaRaw));
        fechaStr = excelDate.d + '/' + excelDate.m + '/' + excelDate.y;
      } catch(e) { fechaStr = fechaRaw; }
    }

    txns.push({
      fecha: fechaStr,
      hora: getVal(row, iH),
      tipo: tipo,
      monto: monto,
      contraparte_nombre: getVal(row, iCN),
      contraparte_cuit: getVal(row, iCC),
      canal: getVal(row, iCh),
      referencia: getVal(row, iR)
    });
  }
  return txns;
}

function parseCsv(text) {
  var lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  function parseRow(row) {
    var cols=[], cur='', inQ=false;
    for (var i=0; i<row.length; i++) {
      var ch=row[i];
      if (ch==='"'){inQ=!inQ;continue;}
      if ((ch===','||ch===';')&&!inQ){cols.push(cur.trim());cur='';}
      else cur+=ch;
    }
    cols.push(cur.trim()); return cols;
  }
  var rows = lines.map(parseRow);
  var result = normalizeRows(rows);
  // Fallback si normalizeRows no detectó nada: retornar vacío con debug
  if (result.length === 0) console.warn('[Rebit CSV] No se encontraron transacciones. Headers:', rows[0]);
  return result;
}

function parseExcelFile(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, { type:'array', cellDates:false });
        var sheetName = workbook.SheetNames[0];
        var sheet = workbook.Sheets[sheetName];
        // Convertir a array de arrays (raw=true para preservar números)
        var rows = XLSX.utils.sheet_to_json(sheet, { header:1, raw:true, defval:'' });
        console.log('[Rebit Excel] Filas leídas:', rows.length, '| Headers:', rows[0]);
        var txns = normalizeRows(rows);
        console.log('[Rebit Excel] Transacciones parseadas:', txns.length);
        resolve(txns);
      } catch(err) {
        reject(new Error('Error al leer el archivo Excel: ' + err.message));
      }
    };
    reader.onerror = function() { reject(new Error('No se pudo leer el archivo.')); };
    reader.readAsArrayBuffer(file);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LECTOR DE TABLAS GENÉRICO (T5 — listados de screening)
// ═══════════════════════════════════════════════════════════════════════════
// parseCsv/parseExcelFile arriba están hechos para archivos de TRANSACCIONES:
// pasan por normalizeRows, que busca fecha/monto/tipo/contraparte y descarta
// todo lo demás. Para un listado de nombres eso devuelve vacío.
//
// Estas funciones no interpretan nada: devuelven las filas tal como vienen,
// como objetos con las cabeceras del archivo por clave.

// Detecta el separador contando ocurrencias fuera de comillas en la cabecera.
// Importante para listas de sanciones: suelen venir con "APELLIDO, NOMBRE" en
// un archivo separado por punto y coma, y asumir la coma parte los nombres.
function detectarSeparador(linea) {
  var cands = [',', ';', '\t', '|'];
  var mejor = ',', mejorN = -1;
  cands.forEach(function(sep){
    var n = 0, inQ = false;
    for (var i = 0; i < linea.length; i++) {
      var ch = linea[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === sep && !inQ) n++;
    }
    if (n > mejorN) { mejorN = n; mejor = sep; }
  });
  return mejor;
}

function partirLinea(linea, sep) {
  var cols = [], cur = '', inQ = false;
  for (var i = 0; i < linea.length; i++) {
    var ch = linea[i];
    if (ch === '"') {
      if (inQ && linea[i+1] === '"') { cur += '"'; i++; }  // comilla escapada
      else inQ = !inQ;
      continue;
    }
    if (ch === sep && !inQ) { cols.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

// Devuelve { headers: [...], filas: [{header: valor}] }
function parseTabla(text) {
  if (!text) return { headers: [], filas: [] };
  var limpio = text.replace(/^\uFEFF/, '');           // BOM de Excel
  var lineas = limpio.split(/\r?\n/).filter(function(l){ return l.trim().length; });
  if (lineas.length < 2) return { headers: [], filas: [] };
  var sep = detectarSeparador(lineas[0]);
  var headers = partirLinea(lineas[0], sep).map(function(h, i){
    return h || ('columna_' + (i+1));
  });
  var filas = [];
  for (var i = 1; i < lineas.length; i++) {
    var cols = partirLinea(lineas[i], sep);
    var obj = {};
    var vacia = true;
    headers.forEach(function(h, k){
      var v = cols[k] !== undefined ? cols[k] : '';
      obj[h] = v;
      if (v !== '') vacia = false;
    });
    if (!vacia) filas.push(obj);
  }
  return { headers: headers, filas: filas };
}

function parseTablaExcel(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:false });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var arr = XLSX.utils.sheet_to_json(sheet, { header:1, raw:false, defval:'' });
        if (!arr.length) return resolve({ headers: [], filas: [] });
        var headers = (arr[0] || []).map(function(h, i){
          return String(h || '').trim() || ('columna_' + (i+1));
        });
        var filas = [];
        for (var i = 1; i < arr.length; i++) {
          var obj = {}, vacia = true;
          headers.forEach(function(h, k){
            var v = arr[i][k] !== undefined && arr[i][k] !== null ? String(arr[i][k]).trim() : '';
            obj[h] = v;
            if (v !== '') vacia = false;
          });
          if (!vacia) filas.push(obj);
        }
        resolve({ headers: headers, filas: filas });
      } catch(err) { reject(new Error('Error al leer el Excel: ' + err.message)); }
    };
    reader.onerror = function(){ reject(new Error('No se pudo leer el archivo.')); };
    reader.readAsArrayBuffer(file);
  });
}

// JSON: array de objetos, o un objeto con el array adentro
function parseTablaJson(texto) {
  var json = JSON.parse(texto);
  var arr = Array.isArray(json) ? json
    : (json.datos || json.data || json.registros || json.entradas || json.items || []);
  if (!Array.isArray(arr) || !arr.length) return { headers: [], filas: [] };
  var set = {};
  arr.forEach(function(o){ if (o && typeof o === 'object') Object.keys(o).forEach(function(k){ set[k] = true; }); });
  var headers = Object.keys(set);
  var filas = arr.filter(function(o){ return o && typeof o === 'object'; }).map(function(o){
    var out = {};
    headers.forEach(function(h){ out[h] = o[h] !== undefined && o[h] !== null ? String(o[h]) : ''; });
    return out;
  });
  return { headers: headers, filas: filas };
}

export { normalizeRows, parseCsv, parseExcelFile, parseTabla, parseTablaExcel, parseTablaJson, detectarSeparador };
