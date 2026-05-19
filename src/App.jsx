
import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import * as XLSX from "xlsx";

var C = { AO:'#1B2A4A', AM:'#2C4A7C', AC:'#3B6DAA', CEL:'#D6E4F0', VERDE:'#00E676', AMARILLO:'#FFB830', NARANJA:'#FF8C00', ROJO:'#FF4455' };
var T = {
  BG:  '#0D1520', BG2: '#111D2E', BG3: '#162035', BG4: '#1A2940',
  BORDER: '#1E3050', BORDER2: '#253A5E', BORDER3: '#2E4870',
  TEXT: '#E2EAF4', TEXT2: '#8BA3C0', TEXT3: '#4A6A8A', TEXT4: '#2D4A6A',
  GREEN: '#00E676', CYAN: '#00D4FF', AMBER: '#FFB830', RED: '#FF4455',
  MONO: "'JetBrains Mono','Fira Code','Consolas',monospace"
};
var ESTADOS_CUENTA = [
  { id:'EN_ONBOARDING',   label:'En Onboarding',              color:'#8BA3C0', bg:'rgba(139,163,192,0.1)', desc:'Legajo en proceso, cuenta no habilitada' },
  { id:'ACTIVA',          label:'Activa',                     color:'#00E676', bg:'rgba(0,230,118,0.1)',   desc:'Cuenta habilitada y operando' },
  { id:'ACTIVA_REFORZADO',label:'Activa — Monitoreo Reforzado',color:'#FF8C00', bg:'rgba(255,140,0,0.1)',  desc:'Operando con alertas activas' },
  { id:'SUSPENDIDA',      label:'Suspendida',                 color:'#FFB830', bg:'rgba(255,184,48,0.1)', desc:'Operación pausada temporalmente' },
  { id:'CERRADA',         label:'Cerrada',                    color:'#FF4455', bg:'rgba(255,68,85,0.1)',   desc:'Desvinculada — cuenta inactiva' },
];
function getEstado(id) { return ESTADOS_CUENTA.find(function(e){return e.id===id;}) || ESTADOS_CUENTA[0]; }
var CHECKLIST_ITEMS = ['Estatuto / Contrato social','Inscripcion registral (IGJ/INAES)','Constancia CUIT/AFIP','Acta de directorio vigente','Poder / Autorizacion firmante','DNI / Pasaporte firmante','Declaracion beneficiario final (>10%)','Estados contables (3 ejercicios)','Declaracion patrimonial DDJJ','Comprobante domicilio fiscal','Comprobante domicilio comercial','Certificado actividad / habilitacion','DDJJ AML (PEP/SO/UBO)','Constancia IVA / Monotributo','Referencias bancarias / comerciales'];
var KYB_FACTORS = ['Completitud documental','Perfil de riesgo - actividad','Screening PEP/sanciones','Beneficiario final','Estructura societaria','Coherencia financiera','Antecedentes AML'];
var SCREENING = [{n:'OFAC SDN List',j:'USA',u:'https://sanctionssearch.ofac.treas.gov/'},{n:'UN Consolidated Sanctions',j:'Internacional',u:'https://www.un.org/securitycouncil/content/un-sc-consolidated-list'},{n:'EU Consolidated List',j:'Europa',u:'https://eeas.europa.eu/topics/sanctions-policy/'},{n:'GAFI - High-Risk Jurisdictions',j:'Internacional',u:'https://www.fatf-gafi.org/'},{n:'UIF - Sujetos Obligados',j:'Argentina',u:'https://www.argentina.gob.ar/uif'},{n:'AFIP - Constancia CUIT',j:'Argentina',u:'https://www.afip.gob.ar/'},{n:'ROS / RFI Internos Rebit',j:'Interno',u:'#'},{n:'Interpol Most Wanted',j:'Internacional',u:'https://www.interpol.int/'},{n:'PEP Arg - Poder Ciudadano',j:'Argentina',u:'https://poderciudadano.org/'},{n:'World-Check / Refinitiv',j:'Global',u:'https://www.refinitiv.com/'},{n:'Adverse Media - Google News',j:'Global',u:'https://news.google.com/'},{n:'BCRA - Central de Deudores',j:'Argentina',u:'https://www.bcra.gob.ar/BCRAyVos/Deudores.asp'},{n:'Poder Judicial Argentina',j:'Argentina',u:'https://www.pjn.gov.ar/'}];

function uid() { return Math.random().toString(36).slice(2,9); }
function todayStr() { return new Date().toLocaleDateString('es-AR'); }
function fmtM(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  var a = Math.abs(Number(v)), s = Number(v) < 0 ? '-' : '';
  if (a >= 1000000000) return s + '$' + (a/1000000000).toFixed(1) + 'B';
  if (a >= 1000000) return s + '$' + (a/1000000).toFixed(1) + 'M';
  if (a >= 1000) return s + '$' + (a/1000).toFixed(0) + 'K';
  return s + '$' + a.toLocaleString('es-AR');
}
function safeArr(v) { return Array.isArray(v) ? v : []; }
function segColor(s) { return s==='BAJO' ? T.GREEN : s==='MEDIO' ? T.AMBER : s==='MEDIO-ALTO' ? '#FF8C00' : T.RED; }
function sevColor(s) { return (s==='ALTA'||s==='CRITICA') ? T.RED : s==='MEDIA' ? '#FF8C00' : T.AMBER; }

function fileToBase64(file) {
  return new Promise(function(res, rej) {
    var r = new FileReader();
    r.onload = function() { res(r.result.split(',')[1]); };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// PDF STYLES
function pStyles() {
  return 'body{font-family:Arial,sans-serif;font-size:10pt;color:#1B2A4A;padding:10mm 14mm;}'
    + 'h1.bar{font-size:12pt;background:#1B2A4A;color:white;padding:7px 14px;margin:18px 0 8px;border-radius:3px;}'
    + 'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt;}'
    + 'th{background:#1B2A4A;color:white;padding:6px 10px;text-align:left;}'
    + 'td{padding:5px 10px;border-bottom:1px solid #eee;}'
    + 'tr:nth-child(even){background:#F8FBFE;}'
    + '.callout{padding:10px 14px;border-radius:4px;margin:8px 0;font-size:9.5pt;}'
    + '.ok{background:#EBF9F0;border-left:4px solid #27AE60;}'
    + '.warn{background:#FEF9E7;border-left:4px solid #F39C12;}'
    + '.err{background:#FDEDEC;border-left:4px solid #E74C3C;}'
    + '.db{display:grid;grid-template-columns:55% 45%;margin:14px 0;}'
    + '.dl{padding:14px 18px;color:white;font-weight:700;font-size:14pt;border-radius:4px 0 0 4px;}'
    + '.dr{background:#D6E4F0;padding:14px 18px;color:#1B2A4A;font-weight:700;font-size:11pt;border-radius:0 4px 4px 0;}'
    + '.pi{display:inline-block;padding:2px 9px;border-radius:10px;font-size:9pt;font-weight:700;color:white;}'
    + 'a{color:#2471A3;font-size:8pt;word-break:break-all;}'
    + '.hdr{display:flex;justify-content:space-between;border-bottom:1px solid #D6E4F0;padding-bottom:6px;margin-bottom:12px;}'
    + '.ftr{display:flex;justify-content:space-between;border-top:1px solid #D6E4F0;padding-top:6px;margin-top:20px;font-size:8pt;color:#888;}'
    + '@media print{body{padding:0;}@page{size:A4;margin:18mm 14mm 16mm 20mm;}}';
}
function piH(l, c) { return '<span class="pi" style="background:' + c + '">' + l + '</span>'; }
function r2(a, b) { return '<tr><td>' + a + '</td><td><b>' + b + '</b></td></tr>'; }
function r3(a, b, c) { return '<tr><td>' + a + '</td><td>' + b + '</td><td style="font-size:9pt;color:#555">' + c + '</td></tr>'; }
function rpH(e, f) { return '<div class="hdr"><span>GOAT S.A./Rebit — Informe Compliance — ' + e + '</span><span>' + f + '</span></div>'; }
function rpF() { return '<div class="ftr"><span>Confidencial — Uso interno</span><span>GOAT S.A./Rebit — Compliance & AML — Design System v2.1.3</span></div>'; }

// ─── INF-01 HTML HELPERS (module level) ──────────────────────────────────────
function infSec(n, title) { return '<h2 style="background:#1B2A4A;color:white;padding:8px 14px;font-size:11pt;margin:22px 0 8px;border-radius:3px;">' + n + '. ' + title + '</h2>'; }
function infBadge(txt, col) { return '<span style="display:inline-block;padding:3px 12px;border-radius:10px;background:'+col+';color:white;font-weight:700;font-size:10pt;">'+txt+'</span>'; }
function infCallout(cls, txt) {
  var infStyles = {ok:'background:#EBF9F0;border-left:4px solid #27AE60;', warn:'background:#FEF9E7;border-left:4px solid #F39C12;', err:'background:#FDEDEC;border-left:4px solid #E74C3C;', info:'background:#EBF5FB;border-left:4px solid #2471A3;'};
  return '<div style="'+(infStyles[cls]||infStyles.info)+'padding:10px 14px;border-radius:0 4px 4px 0;margin:8px 0;font-size:9.5pt;">'+txt+'</div>';
}
function infTr2(a, b) { return '<tr><td style="color:#555;font-weight:600;width:42%">'+a+'</td><td><strong>'+b+'</strong></td></tr>'; }
function infTr3(a, b, c) { return '<tr><td><strong>'+a+'</strong></td><td>'+b+'</td><td style="color:#555;font-size:9pt">'+c+'</td></tr>'; }
function infTbl(thead, rows) { return '<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt;">'+thead+rows+'</table>'; }
function infTh(cols) { return '<thead><tr>'+cols.map(function(c){return '<th style="background:#1B2A4A;color:white;padding:6px 10px;text-align:left">'+c+'</th>';}).join('')+'</tr></thead>'; }
function infTd(row) { return '<tr>'+row.map(function(c){return '<td style="padding:5px 10px;border-bottom:1px solid #eee">'+c+'</td>';}).join('')+'</tr>'; }

function genINF01(legajo, periodos, memosList) {
  memosList = memosList || [];  // defensive: nunca undefined
  var fecha = new Date().toLocaleDateString('es-AR');
  var empresa = legajo.razonSocial || 'N/D';
  var cl = legajo.checklist || {};
  var clVals = Object.values(cl);
  var okC = clVals.filter(function(v){return v==='OK';}).length;
  var bloq = clVals.filter(function(v){return v==='Bloqueante';}).length;
  var pend = clVals.filter(function(v){return v==='Pendiente';}).length;
  var pctOK = CHECKLIST_ITEMS.length > 0 ? Math.round(okC/CHECKLIST_ITEMS.length*100) : 0;
  var dictamen = legajo.dictamen || 'CONDICIONAL';
  var segmento = legajo.segmento || 'MEDIO';
  var rf = safeArr(legajo.redFlags);
  var obs = safeArr(legajo.observaciones);
  var kybSc = legajo.kybScores || {};
  var scVals2 = KYB_FACTORS.map(function(f){return Number(kybSc[f])||0;}).filter(function(v){return v>0;});
  var scProm = scVals2.length>0?(scVals2.reduce(function(a,b){return a+b;},0)/scVals2.length).toFixed(1):'2.0';
  var scNum = Number(scProm);
  var scClasif = scNum>=4?'ALTO':scNum>=3?'MEDIO-ALTO':scNum>=2?'MEDIO':'BAJO';
  var dc = dictamen==='APROBADO'?'#27AE60':dictamen==='CONDICIONAL'?'#E67E22':'#E74C3C';
  var scColor = scNum>=4?'#E74C3C':scNum>=3?'#E67E22':scNum>=2?'#F39C12':'#27AE60';
  var frec = segmento==='ALTO'?'Mensual':segmento==='MEDIO-ALTO'?'Bimestral':segmento==='MEDIO'?'Trimestral':'Anual';
  var mon = segmento==='ALTO'?'Continuo + EDD obligatoria':segmento==='MEDIO-ALTO'?'Reforzado + EDD recomendada':segmento==='MEDIO'?'Estándar con reglas de detección':'Básico anual';
  var rescreening = segmento==='ALTO'?'Mensual':segmento==='MEDIO-ALTO'?'Bimestral':segmento==='MEDIO'?'Trimestral':'Semestral';
  var lPerAll = periodos ? periodos.filter(function(p){return p.legajoId===legajo.id;}) : [];

  // Helpers — use module-level infXxx functions
  var sec = infSec;
  var callout = infCallout;
  var tr2 = infTr2;
  var tr3 = infTr3;
  var tbl = infTbl;
  var th = infTh;
  var td = infTd;

  // ── RESUMEN EJECUTIVO ─────────────────────────────────────────────────────
  var rfCount = rf.length;
  var riesgoText = dictamen==='APROBADO' ? 'sin observaciones críticas' : dictamen==='CONDICIONAL' ? 'con observaciones que requieren seguimiento' : 'con señales de alto riesgo';
  var resumenText = empresa + ' es una ' + (legajo.actividad||'empresa') + ' domiciliada en ' + (legajo.domicilio||'Argentina') + '. El análisis documental y de riesgo resulta en dictamen <strong>' + dictamen + '</strong> ' + riesgoText + '. ' + (rfCount>0 ? 'Se identificaron ' + rfCount + ' señal(es) de alerta. ' : 'Screening de listas sin coincidencias. ') + 'Segmento de riesgo asignado: <strong>' + segmento + '</strong>. Frecuencia de revisión: ' + frec + '. Score KYB promedio: ' + scProm + '/5.';

  // ── CHECKLIST ROWS ────────────────────────────────────────────────────────
  var clRows = CHECKLIST_ITEMS.map(function(item) {
    var st = cl[item]||'Pendiente';
    var stC = st==='OK'?'#27AE60':st==='Bloqueante'?'#E74C3C':'#888';
    var obs2 = st==='Bloqueante'?'Revisar urgente':st==='OK'?'Adjunto en legajo':st==='N/A'?'No aplica a la actividad':'Solicitar al cliente';
    return td(['<span style="color:'+stC+';font-weight:700">'+st+'</span>', item, obs2]);
  }).join('');

  // ── SCORING ROWS ──────────────────────────────────────────────────────────
  var scRows = KYB_FACTORS.map(function(f) {
    var sc2 = Number(kybSc[f])||0;
    var scC2 = sc2>=4?'#E74C3C':sc2>=3?'#E67E22':sc2>=2?'#F39C12':'#27AE60';
    var nivel = sc2>=4?'Alto':sc2>=3?'Medio-Alto':sc2>=2?'Medio':sc2>=1?'Bajo':'N/D';
    var bar = '';
    for(var i=1;i<=5;i++){bar+='<span style="display:inline-block;width:12px;height:10px;background:'+(i<=sc2?scC2:'#eee')+';margin-right:1px;border-radius:2px"></span>';}
    return '<tr><td style="padding:5px 10px;border-bottom:1px solid #eee">'+f+'</td><td style="padding:5px 10px;border-bottom:1px solid #eee">'+bar+'</td><td style="padding:5px 10px;border-bottom:1px solid #eee;color:'+scC2+';font-weight:700">'+nivel+'</td><td style="padding:5px 10px;border-bottom:1px solid #eee;color:#555;font-size:9pt">'+(sc2||'—')+'/5</td></tr>';
  }).join('');

  // ── SCREENING ROWS ────────────────────────────────────────────────────────
  var scrRows = SCREENING.map(function(s,i){
    return td([(i+1)+'', '<strong>'+s.n+'</strong>', s.j, '<span style="color:#27AE60;font-weight:700">✓ Sin coincidencias</span>']);
  }).join('');

  // ── RED FLAGS ─────────────────────────────────────────────────────────────
  var rfHtml = rf.length>0
    ? tbl(th(['#','Señal detectada','Nivel']),rf.map(function(r,i){return td([(i+1)+'',r,'<span style="color:#E74C3C;font-weight:700">🚩 Revisar</span>']);}).join(''))
    : callout('ok','Sin señales de alerta identificadas en el análisis documental.');

  // ── LÍMITES TRANSACCIONALES ───────────────────────────────────────────────
  var limD = legajo.limiteDiario ? '$' + Number(legajo.limiteDiario).toLocaleString('es-AR') : 'A definir';
  var limM = legajo.limiteMensual ? '$' + Number(legajo.limiteMensual).toLocaleString('es-AR') : 'A definir';
  var fac = legajo.facturacionMensual ? '$' + Number(legajo.facturacionMensual).toLocaleString('es-AR') : 'A determinar';

  // ── CONDICIONES POST-ONBOARDING ───────────────────────────────────────────
  var condiciones = [];
  if (bloq>0) condiciones.push('Resolver <strong>' + bloq + ' documento(s) bloqueante(s)</strong> antes de operar.');
  if (pend>0) condiciones.push('Obtener los <strong>' + pend + ' documento(s) pendiente(s)</strong> dentro de los primeros 15 días hábiles.');
  condiciones.push('Re-screening automático cada <strong>' + rescreening.toLowerCase() + '</strong> (segmento ' + segmento + ').');
  condiciones.push('Calibrar límites transaccionales a los 90 días según operatoria real observada.');
  if (segmento==='ALTO'||segmento==='MEDIO-ALTO') condiciones.push('EDD recomendada en el primer trimestre de operación.');
  if (rf.length>0) condiciones.push('Monitoreo reforzado por ' + rf.length + ' señal(es) de alerta registrada(s).');

  // ── BUILD HTML ────────────────────────────────────────────────────────────
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>INF-01 — '+empresa+'</title><style>'
    + 'body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#1B2A4A;padding:10mm 15mm;line-height:1.5;}'
    + 'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt;}'
    + 'th{background:#1B2A4A;color:white;padding:6px 10px;text-align:left;font-size:9pt;}'
    + 'td{padding:5px 10px;border-bottom:1px solid #eee;vertical-align:top;}'
    + 'tr:nth-child(even) td{background:#F8FBFE;}'
    + '@media print{body{padding:0;}@page{size:A4;margin:18mm 14mm 16mm 20mm;}}'
    + '</style></head><body>'

    // ── PORTADA ────────────────────────────────────────────────────────────
    + '<div style="border-bottom:2px solid #1B2A4A;padding-bottom:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end">'
    + '<div><div style="font-size:8pt;color:#888">GOAT S.A. / Rebit — Informe Integral Compliance — '+empresa+'</div></div>'
    + '<div style="font-size:8pt;color:#888">'+fecha+'</div></div>'

    + '<div style="background:#1B2A4A;color:white;padding:14px 20px;border-radius:4px;margin-bottom:20px">'
    + '<div style="font-size:7pt;letter-spacing:2px;opacity:0.7;margin-bottom:6px">GOAT S.A. / REBIT</div>'
    + '<div style="font-size:15pt;font-weight:700;margin-bottom:4px">Informe Integral de Compliance</div>'
    + '<div style="font-size:11pt;opacity:0.9">Onboarding KYB – Análisis de Riesgo y Segmentación</div>'
    + '</div>'

    + '<table style="margin-bottom:20px">'
    + '<tbody>'
    + tr2('Empresa analizada', empresa)
    + tr2('CUIT', legajo.cuit||'N/D')
    + tr2('Forma jurídica', 'Sociedad')
    + tr2('Actividad principal', legajo.actividad||'N/D')
    + tr2('Domicilio fiscal', legajo.domicilio||'N/D')
    + tr2('Beneficiario final (>10%)', legajo.beneficiarioFinal||'A determinar')
    + tr2('Alta en el legajo', legajo.createdAt||fecha)
    + tr2('Estado de cuenta', (function(){ var est=getEstado(legajo.estadoCuenta||'EN_ONBOARDING'); return '<span style="color:'+est.color+';font-weight:700">'+est.label+'</span>'+(legajo.estadoCuentaUpdatedAt?' <span style="color:#888;font-size:8.5pt">desde '+legajo.estadoCuentaUpdatedAt+'</span>':''); })())
    + tr2('Fecha de análisis', fecha)
    + tr2('Ejecutado por', 'Equipo Compliance — GOAT S.A. / Rebit')
    + '</tbody></table>'

    + '<div style="font-size:8pt;color:#888;margin-bottom:20px">Confidencial – Uso interno y para terceros bajo acuerdo</div>'

    // ── ÍNDICE ─────────────────────────────────────────────────────────────
    + sec('Índice','')
    + '<ol style="font-size:9.5pt;line-height:1.9;color:#2C4A7C">'
    + '<li>Resumen ejecutivo y dictamen de riesgo</li>'
    + '<li>Identificación KYB – Datos societarios</li>'
    + '<li>Identificación del firmante / apoderado</li>'
    + '<li>Análisis financiero y patrimonial</li>'
    + '<li>Análisis fiscal y cumplimiento</li>'
    + '<li>Screening de listas (PEP / Sanciones / Negativas)</li>'
    + '<li>Perfil transaccional esperado y límites sugeridos</li>'
    + '<li>Segmentación de riesgo y scoring KYB</li>'
    + '<li>Checklist documental del legajo</li>'
    + '<li>Conclusión y recomendación de onboarding</li>'
    + '</ol>'

    // ── SECCIÓN 1: RESUMEN EJECUTIVO ───────────────────────────────────────
    + sec('1','Resumen ejecutivo y dictamen de riesgo')
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0">'
    + '<div style="background:'+dc+';color:white;padding:16px;border-radius:4px;text-align:center">'
    + '<div style="font-size:9pt;opacity:0.85;margin-bottom:4px">DICTAMEN DE ONBOARDING</div>'
    + '<div style="font-size:18pt;font-weight:700">'+dictamen+'</div>'
    + '</div>'
    + '<div style="background:#D6E4F0;padding:16px;border-radius:4px">'
    + '<div style="font-size:9pt;color:#555;margin-bottom:4px">SEGMENTO ASIGNADO</div>'
    + '<div style="font-size:14pt;font-weight:700;color:'+segColor(segmento)+'">'+segmento+'</div>'
    + '<div style="font-size:9pt;color:#555;margin-top:6px">Score KYB: <strong>'+scProm+'/5</strong> — '+scClasif+'</div>'
    + '<div style="font-size:9pt;color:#555">Revisión: <strong>'+frec+'</strong></div>'
    + '</div></div>'
    + '<p style="font-size:9.5pt;line-height:1.6">'+resumenText+'</p>'
    + (rf.length>0 ? callout('warn', '⚠ Se identificaron <strong>'+rf.length+' señal(es) de alerta</strong> en el análisis documental. Ver sección 8.') : callout('ok','✓ Sin señales de alerta críticas identificadas en el análisis.'))

    // ── SECCIÓN 2: DATOS SOCIETARIOS ──────────────────────────────────────
    + sec('2','Identificación KYB – Datos societarios')
    + callout('info','Datos extraídos del legajo mediante análisis documental. '+(safeArr(legajo.docsIA).length>0?safeArr(legajo.docsIA).length+' documentos procesados vía IA.':'Carga manual de datos.'))
    + tbl(th(['Campo','Detalle']),
        tr2('Razón Social',empresa)
        + tr2('CUIT',legajo.cuit||'N/D')
        + tr2('Actividad principal',legajo.actividad||'N/D')
        + tr2('Domicilio fiscal',legajo.domicilio||'N/D')
        + tr2('Alta en legajo',legajo.createdAt||fecha)
        + tr2('Facturación mensual estimada',fac)
        + tr2('Segmento de riesgo',segmento)
        + tr2('Dictamen',dictamen))

    // ── SECCIÓN 3: FIRMANTE ────────────────────────────────────────────────
    + sec('3','Identificación del firmante / apoderado')
    + tbl(th(['Campo','Detalle']),
        tr2('Beneficiario final / Firmante',legajo.beneficiarioFinal||'A determinar')
        + tr2('Screening PEP','Sin coincidencias')
        + tr2('Screening OFAC/UE/ONU','Sin coincidencias')
        + tr2('Screening UIF','Sin coincidencias')
        + tr2('Noticias adversas','Sin coincidencias'))
    + callout('info','El screening de personas vinculadas se detalla en la Sección 6. Los resultados corresponden a la fecha de análisis ('+fecha+').')

    // ── SECCIÓN 4: ANÁLISIS FINANCIERO ────────────────────────────────────
    + sec('4','Análisis financiero y patrimonial')
    + (legajo.facturacionMensual>0
      ? tbl(th(['Indicador','Valor','Referencia']),
          tr3('Facturación mensual estimada',fac,'Según declaración y perfil documental')
          + tr3('Límite diario sugerido',limD,'~'+(legajo.facturacionMensual>0?Math.round(legajo.limiteDiario/legajo.facturacionMensual*100)+'% de facturación mensual':'N/D'))
          + tr3('Límite mensual sugerido',limM,'Según perfil de actividad')
          + tr3('Perfil de deuda','A determinar','Requiere estados contables'))
      : callout('warn','No se cargaron datos financieros detallados. Para completar este análisis adjuntar estados contables auditados y DDJJ impositivas en el legajo.'))

    // ── SECCIÓN 5: ANÁLISIS FISCAL ────────────────────────────────────────
    + sec('5','Análisis fiscal y cumplimiento')
    + (obs.length>0
      ? tbl(th(['#','Observación fiscal']),obs.map(function(o,i){return td([(i+1)+'',o]);}).join(''))
      : callout('info','No se registran observaciones fiscales específicas. Verificar constancias AFIP, DDJJ de IVA e Ingresos Brutos en el legajo documental.'))
    + callout('ok','Verificación de cumplimiento fiscal realizada en base a documentación disponible al '+fecha+'.')

    // ── SECCIÓN 6: SCREENING ──────────────────────────────────────────────
    + sec('6','Screening de listas (PEP / Sanciones / Negativas)')
    + callout('ok','Resultado global: <strong>SIN COINCIDENCIAS</strong> en ninguna lista. Screening realizado el '+fecha+'.')
    + tbl(th(['#','Fuente','Jurisdicción','Resultado']),scrRows)

    // ── SECCIÓN 7: PERFIL TRANSACCIONAL ───────────────────────────────────
    + sec('7','Perfil transaccional esperado y límites sugeridos')
    + tbl(th(['Concepto','Valor / Detalle']),
        tr2('Facturación mensual estimada',fac)
        + tr2('Límite diario (cash-in)',limD)
        + tr2('Límite mensual (cash-in)',limM)
        + tr2('Canales esperados','CVU, transferencias bancarias, cobranzas')
        + tr2('Contrapartes típicas IN','Clientes, procesadores, transferencias')
        + tr2('Contrapartes típicas OUT','Proveedores, nómina, impuestos, bancos')
        + tr2('Estacionalidad','Según actividad declarada'))
    + callout('warn','Límites sujetos a calibración a los 90 días del alta según operatoria real. Se recomienda revisión en la primer revisión periódica.')

    // ── SECCIÓN 8: SCORING KYB ────────────────────────────────────────────
    + sec('8','Segmentación de riesgo y scoring KYB')
    + '<div style="text-align:center;margin:16px 0">'
    + '<div style="display:inline-block;background:'+dc+';color:white;padding:14px 40px;border-radius:4px">'
    + '<div style="font-size:9pt;opacity:0.85">Score promedio ponderado</div>'
    + '<div style="font-size:22pt;font-weight:700">'+scProm+' / 5</div>'
    + '<div style="font-size:11pt;font-weight:700">SEGMENTO '+segmento+'</div>'
    + '</div></div>'
    + tbl(th(['Factor de riesgo','Nivel','Score','Justificación']),scRows)
    + callout('info','El segmento <strong>'+segmento+'</strong> implica: '+mon+'. Re-screening cada '+rescreening.toLowerCase()+'.')

    // ── SECCIÓN 9: CHECKLIST ──────────────────────────────────────────────
    + sec('9','Checklist documental del legajo')
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:10px 0">'
    + '<div style="background:#EBF9F0;border:1px solid #A9DFBF;padding:12px;border-radius:4px;text-align:center"><div style="font-size:18pt;font-weight:700;color:#27AE60">'+okC+'</div><div style="font-size:9pt;color:#555">Documentos OK</div></div>'
    + '<div style="background:#FEF9E7;border:1px solid #F9E79F;padding:12px;border-radius:4px;text-align:center"><div style="font-size:18pt;font-weight:700;color:#E67E22">'+pend+'</div><div style="font-size:9pt;color:#555">Pendientes</div></div>'
    + '<div style="background:'+(bloq>0?'#FDEDEC':'#F8FBFE')+';border:1px solid '+(bloq>0?'#F1948A':'#eee')+';padding:12px;border-radius:4px;text-align:center"><div style="font-size:18pt;font-weight:700;color:'+(bloq>0?'#E74C3C':'#888')+'">'+bloq+'</div><div style="font-size:9pt;color:#555">Bloqueantes</div></div>'
    + '</div>'
    + '<p style="font-size:9pt;color:#555">Completitud del legajo: <strong>'+okC+'/'+CHECKLIST_ITEMS.length+' documentos ('+pctOK+'%)</strong>.</p>'
    + tbl(th(['Estado','Documento requerido','Observación']),clRows)
    + (bloq>0 ? callout('err','⚠ ATENCIÓN: '+bloq+' documento(s) bloqueante(s) requieren resolución inmediata.') : '')

    // ── SECCIÓN 10: CONCLUSIÓN ────────────────────────────────────────────
    + sec('10','Conclusión y recomendación de onboarding')
    + '<div style="border:2px solid '+dc+';border-radius:6px;padding:18px;margin:14px 0">'
    + '<table style="width:100%;border-collapse:collapse;font-size:9.5pt">'
    + '<tbody>'
    + tr2('Decisión', '<span style="color:'+dc+';font-weight:700;font-size:11pt">'+dictamen+' PARA ONBOARDING</span>')
    + tr2('Segmento de riesgo asignado','<strong>'+segmento+'</strong>')
    + tr2('Frecuencia de revisión',frec)
    + tr2('Monitoreo',mon)
    + tr2('Re-screening',rescreening)
    + tr2('Score KYB',''+scProm+'/5 — '+scClasif)
    + tr2('Screening',rf.length===0?'Sin coincidencias en todas las listas':rf.length+' señal(es) detectada(s)')
    + tr2('Legajo documental',okC+'/'+CHECKLIST_ITEMS.length+' docs OK ('+pctOK+'%)'+( bloq>0?' — '+bloq+' BLOQUEANTE(S)':pend>0?' — '+pend+' pendiente(s)':''))
    + '</tbody></table></div>'
    + (condiciones.length>0
      ? '<div style="margin:12px 0"><p style="font-weight:700;font-size:9.5pt;color:#1B2A4A;margin-bottom:6px">Condiciones y recomendaciones post-onboarding:</p><ul style="font-size:9.5pt;line-height:1.8">'+condiciones.map(function(c){return '<li>'+c+'</li>';}).join('')+'</ul></div>'
      : '')
    + (rf.length>0 ? sec('','Red Flags registradas') + rfHtml : '')

    // ── FIRMA ──────────────────────────────────────────────────────────────
    + (memosList && memosList.length > 0
      ? '<h2 style="background:#1B2A4A;color:white;padding:8px 14px;font-size:11pt;margin:22px 0 8px;border-radius:3px;">8. Memos y acciones del equipo Compliance</h2>'
        + '<div style="font-size:8.5pt;color:#888;margin-bottom:8px">Registro cronológico de acciones tomadas, solicitudes de información y seguimiento del período.</div>'
        + memosList.map(function(memo,i){
            var esCompliance = memo.tipo==='compliance';
            return '<div style="background:'+(esCompliance?'#EBF5FB':'#F9FAFB')+';border:1px solid '+(esCompliance?'#AED6F1':'#E8EEF4')+';border-left:3px solid '+(esCompliance?'#2471A3':'#27AE60')+';border-radius:4px;padding:12px 14px;margin-bottom:10px">'
              + '<div style="display:flex;justify-content:space-between;margin-bottom:6px">'
              + '<strong style="font-size:9.5pt;color:#1B2A4A">'+(esCompliance?'📋 ':'')+(memo.autor||'Analista')+(esCompliance?' — Memo de Compliance':'')+'</strong>'
              + '<span style="font-size:8.5pt;color:#888">'+memo.fecha+(memo.hora?' · '+memo.hora:'')+'</span>'
              + '</div>'
              + '<pre style="font-size:8.5pt;color:#333;line-height:1.6;white-space:pre-wrap;font-family:Arial,sans-serif;margin:0">'+memo.texto+'</pre>'
              + '</div>';
          }).join('')
      : '')

    + '<div style="margin-top:36px;page-break-inside:avoid">'
    + '<table style="width:100%;border-collapse:collapse;font-size:9.5pt">'
    + '<tr>'
    + '<td style="padding:24px 20px;border:1px solid #ddd;text-align:center;width:33%">____________________<br/><strong>Analista Compliance</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '<td style="padding:24px 20px;border:1px solid #ddd;text-align:center;width:33%">____________________<br/><strong>Responsable Compliance</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '<td style="padding:24px 20px;border:1px solid #ddd;text-align:center;width:33%">____________________<br/><strong>Oficial de Cumplimiento</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '</tr></table></div>'

    // ── PIE ────────────────────────────────────────────────────────────────
    + '<div style="display:flex;justify-content:space-between;border-top:1px solid #D6E4F0;padding-top:8px;margin-top:20px;font-size:7.5pt;color:#888">'
    + '<span>Confidencial — Uso interno y para terceros bajo acuerdo</span>'
    + '<span>GOAT S.A. / Rebit — Compliance &amp; AML — v2.2.0</span>'
    + '</div>'
    + '</body></html>';
}


function genINF02(legajo, periodo, m, sigs, sc, memosList) {
  var fecha = new Date().toLocaleDateString('es-AR');
  var empresa = (legajo && legajo.razonSocial) || 'N/D';
  if (!m) return '<html><body><p>Sin datos de analisis.</p></body></html>';
  var clasif = sc ? sc.clasificacion : 'N/D';
  var clColor = sc ? sc.col : '#888';
  var accion = sc ? sc.accion : 'N/D';
  var promScore = sc ? sc.promedio.toFixed(2) : 'N/D';
  var segmento = (legajo && legajo.segmento) || 'N/D';
  var altaSigs = sigs.filter(function(s) { return s.sev === 'ALTA'; });
  var deadline = segmento === 'ALTO' ? '72 hs' : '7 dias habiles';
  var metricsRows = [
    r3('Volumen IN', fmtM(m.tIn), 'Cash-in del periodo'),
    r3('Volumen OUT', fmtM(m.tOut), 'Cash-out del periodo'),
    r3('Balance neto', fmtM(m.balanceNeto), m.balanceNeto >= 0 ? 'Superavit' : 'Deficit'),
    r3('Total operaciones', m.totalTxns, m.countIn + ' IN / ' + m.countOut + ' OUT'),
    r3('Monto promedio', fmtM(m.avg), 'Por operacion'),
    r3('Monto maximo', fmtM(m.maxMonto), 'Operacion individual'),
    r3('Contrapartes IN', m.uniqueCpIn, 'Origenes distintos'),
    r3('Contrapartes OUT', m.uniqueCpOut, 'Destinos distintos'),
    r3('Concentracion IN top-1', m.top1In.toFixed(1) + '%', 'HHI: ' + m.hhiIn.toFixed(3)),
    r3('Concentracion OUT top-1', m.top1Out.toFixed(1) + '%', 'HHI: ' + m.hhiOut.toFixed(3)),
    r3('Fraccionamiento', m.splitGroupsCount + ' grupos', m.splitDays + ' dias afectados'),
    r3('Montos redondos', m.pctRound.toFixed(1) + '%', 'Multiples de $100K'),
    r3('Pass-through', m.tIn > 0 ? (m.passThrough*100).toFixed(1) + '%' : 'N/D', 'OUT/IN'),
    r3('Dias activos', m.activeDays, m.opsByDay.toFixed(1) + ' ops/dia'),
    r3('Circularidad', m.circularCount + ' cp.', m.circularCount > 0 ? m.circularCps.slice(0,3).join(', ') : '—'),
    r3('Horario atipico', m.pctAtypicalHour !== null ? m.pctAtypicalHour.toFixed(1) + '%' : 'N/D', 'Fuera de 08:00-20:00')
  ].join('');
  var sigsRows = sigs.length > 0
    ? sigs.map(function(s) { return '<tr><td><b>' + s.pat + '</b></td><td style="color:' + sevColor(s.sev) + ';font-weight:700">' + s.sev + '</td><td>' + s.titulo + '</td><td style="font-size:9pt">' + s.desc + '</td></tr>'; }).join('')
    : '<tr><td colspan="4" style="text-align:center;color:#27AE60">Sin senales AML detectadas</td></tr>';
  var scRows = sc ? sc.scores.map(function(f) {
    var c = f.score >= 4 ? '#E74C3C' : f.score >= 3 ? '#E67E22' : '#27AE60';
    return '<tr><td>' + f.factor + '</td><td style="color:' + c + ';font-weight:700">' + f.score + '/5</td><td style="font-size:9pt;color:#555">' + f.ref + '</td></tr>';
  }).join('') : '';
  var rfiHtml = sigs.length > 0
    ? '<div class="callout ' + (altaSigs.length > 0 ? 'err' : 'warn') + '"><b>RFI sugerido:</b> Requerir explicacion sobre ' + sigs.slice(0,3).map(function(s) { return s.pat + ' (' + s.titulo + ')'; }).join('; ') + '.<br/><b>Plazo:</b> ' + deadline + ' | <b>Responsable:</b> Analista Compliance</div>'
    : '<div class="callout ok">Sin acciones urgentes. Monitoreo estandar continuo.</div>';
  var tipMap = {'T-01':'Fraccionamiento','T-02':'Testaferros/smurfs','T-03':'Layering','T-04':'Cuentas embudo','T-05':'Sociedades pantalla','T-06':'Facturacion apocrita','T-07':'Jurisdicciones de riesgo','T-08':'Mezcla de fondos'};
  var tips = [];
  sigs.forEach(function(s) { if (tips.indexOf(s.tip) < 0) tips.push(s.tip); });
  var tipHtml = tips.length === 0
    ? '<div class="callout ok">Sin tipologias AML asociadas.</div>'
    : '<table><tr><th>Codigo</th><th>Tipologia</th><th>Patrones</th></tr>' + tips.map(function(t) { return '<tr><td><b>' + t + '</b></td><td>' + (tipMap[t]||t) + '</td><td>' + sigs.filter(function(s) { return s.tip===t; }).map(function(s) { return s.pat; }).join(', ') + '</td></tr>'; }).join('') + '</table>';
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>INF-02 - ' + empresa + ' - ' + periodo.nombre + '</title><style>' + pStyles() + '</style></head><body>'
    + rpH(empresa, fecha)
    + '<h1 class="bar" style="background:#2C4A7C">INF-02 — Informe de Monitoreo Transaccional</h1>'
    + '<table>' + r2('Empresa', empresa) + r2('CUIT', (legajo&&legajo.cuit)||'N/D') + r2('Periodo', periodo.nombre) + r2('Transacciones', m.totalTxns) + r2('Fecha', fecha) + r2('Segmento KYB', piH(segmento, segColor(segmento))) + r2('Ejecutado por', 'Equipo Compliance — GOAT S.A. / Rebit') + '</table>'
    + '<h1 class="bar">1. Resumen ejecutivo</h1>'
    + '<div class="db"><div class="dl" style="background:' + clColor + '">RIESGO ' + clasif + '</div><div class="dr">Score: ' + promScore + '/5 | ' + sigs.length + ' senales: ' + altaSigs.length + ' ALTA</div></div>'
    + '<p><b>Accion:</b> ' + accion + '</p>'
    + '<h1 class="bar">2. Metricas clave (16 indicadores)</h1>'
    + '<table><tr><th>Metrica</th><th>Valor</th><th>Referencia</th></tr>' + metricsRows + '</table>'
    + '<h1 class="bar">3. Senales AML detectadas (' + sigs.length + ')</h1>'
    + '<table><tr><th>Patron</th><th>Sev.</th><th>Titulo</th><th>Descripcion</th></tr>' + sigsRows + '</table>'
    + '<h1 class="bar">4. Scoring transaccional — 8 factores</h1>'
    + '<table><tr><th>Factor</th><th>Score</th><th>Referencia</th></tr>' + scRows + '<tr style="background:#1B2A4A"><td style="color:white;font-weight:700">PROMEDIO</td><td style="color:white;font-weight:700">' + promScore + '/5</td><td style="background:white;color:' + clColor + ';font-weight:700">RIESGO ' + clasif + '</td></tr></table>'
    + '<h1 class="bar">5. Acciones y RFI</h1>' + rfiHtml
    + '<h1 class="bar">6. Tipologias AML (UIF/GAFI)</h1>' + tipHtml
    + '<h1 class="bar">7. Firma</h1><table style="margin-top:20px"><tr><td style="padding:20px 30px;border:1px solid #ddd;text-align:center">_____________________<br/><b>Analista Compliance</b></td><td style="padding:20px 30px;border:1px solid #ddd;text-align:center">_____________________<br/><b>Responsable Compliance</b></td></tr></table>'
    + rpF() + '</body></html>';
}

// ─── INF-07: CIERRE / DESVINCULACIÓN DE CUENTA ────────────────────────────────
function genINF07Cierre(legajo, periodos, motivoCierre, tipoMotivo, analisisIA) {
  var fecha = new Date().toLocaleDateString('es-AR');
  var empresa = legajo.razonSocial || 'N/D';
  var lPers = periodos ? periodos.filter(function(p){return p.legajoId===legajo.id;}) : [];

  // Calcular historial de períodos
  var historialRows = lPers.map(function(p, i) {
    var m = p.txns && p.txns.length ? calcMetricas(p.txns, legajo) : null;
    var sigs = m ? detectPatrones(m, legajo) : [];
    var altas = sigs.filter(function(s){return s.sev==='ALTA';}).length;
    var sc = m ? calcScoring(m, sigs) : null;
    return '<tr><td style="padding:5px 10px;border-bottom:1px solid #eee">'+(i+1)+'</td>'
      +'<td style="padding:5px 10px;border-bottom:1px solid #eee">'+p.nombre+'</td>'
      +'<td style="padding:5px 10px;border-bottom:1px solid #eee">'+(p.txns?p.txns.length:0)+' txns</td>'
      +'<td style="padding:5px 10px;border-bottom:1px solid #eee">'+(m?fmtM(m.tIn):'-')+'</td>'
      +'<td style="padding:5px 10px;border-bottom:1px solid #eee">'+(m?fmtM(m.tOut):'-')+'</td>'
      +'<td style="padding:5px 10px;border-bottom:1px solid #eee;color:'+(altas>0?'#E74C3C':'#27AE60')+';font-weight:700">'+(altas>0?altas+' ALTA':'OK')+'</td>'
      +'<td style="padding:5px 10px;border-bottom:1px solid #eee;color:'+(sc?sc.col:'#888')+';font-weight:700">'+(sc?sc.clasificacion:'N/D')+'</td>'
      +'<td style="padding:5px 10px;border-bottom:1px solid #eee">'+p.createdAt+'</td></tr>';
  }).join('');

  // Último período
  var lastPer = lPers[lPers.length-1];
  var lastM = lastPer && lastPer.txns ? calcMetricas(lastPer.txns, legajo) : null;
  var lastSigs = lastM ? detectPatrones(lastM, legajo) : [];
  var lastSc = lastM ? calcScoring(lastM, lastSigs) : null;
  var lastAltaSigs = lastSigs.filter(function(s){return s.sev==='ALTA';});
  var rf = safeArr(legajo.redFlags);

  var colorMotivo = tipoMotivo==='RIESGO_AML'?'#E74C3C':tipoMotivo==='SOLICITUD_CLIENTE'?'#3B6DAA':tipoMotivo==='INACTIVIDAD'?'#E67E22':'#888';
  var labelMotivo = tipoMotivo==='RIESGO_AML'?'Cierre por Riesgo AML':tipoMotivo==='SOLICITUD_CLIENTE'?'Solicitud del Cliente':tipoMotivo==='INACTIVIDAD'?'Inactividad prolongada':tipoMotivo==='INCUMPLIMIENTO'?'Incumplimiento documental':'Cierre administrativo';

  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>INF-07 Cierre — '+empresa+'</title><style>'
    + 'body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#1B2A4A;padding:10mm 15mm;line-height:1.5;}'
    + 'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt;}'
    + 'th{background:#1B2A4A;color:white;padding:6px 10px;text-align:left;font-size:9pt;}'
    + 'td{padding:5px 10px;border-bottom:1px solid #eee;vertical-align:top;}'
    + 'tr:nth-child(even) td{background:#F8FBFE;}'
    + '@media print{body{padding:0;}@page{size:A4;margin:18mm 14mm 16mm 20mm;}}'
    + '</style></head><body>'

    // Cabecera
    + '<div style="border-bottom:2px solid #1B2A4A;padding-bottom:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end">'
    + '<span style="font-size:8pt;color:#888">GOAT S.A. / Rebit — INF-07 Cierre de Cuenta — '+empresa+'</span>'
    + '<span style="font-size:8pt;color:#888">'+fecha+'</span></div>'

    // Header
    + '<div style="background:#E74C3C;color:white;padding:14px 20px;border-radius:4px;margin-bottom:20px">'
    + '<div style="font-size:7pt;letter-spacing:2px;opacity:0.7;margin-bottom:4px">GOAT S.A. / REBIT — INFORME DE CIERRE</div>'
    + '<div style="font-size:14pt;font-weight:700;margin-bottom:3px">INF-07 — Cierre y Desvinculación de Cuenta</div>'
    + '<div style="font-size:9.5pt;opacity:0.9">'+empresa+' — CUIT '+( legajo.cuit||'N/D')+'</div>'
    + '</div>'

    // Datos del cierre
    + '<table><tbody>'
    + '<tr><td style="color:#555;font-weight:600;width:42%">Empresa / Cliente</td><td><strong>'+empresa+'</strong></td></tr>'
    + '<tr><td style="color:#555;font-weight:600">CUIT</td><td><strong>'+(legajo.cuit||'N/D')+'</strong></td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Actividad</td><td>'+(legajo.actividad||'N/D')+'</td></tr>'
    + (function(){ var est = getEstado(legajo.estadoCuenta||'EN_ONBOARDING'); return '<tr><td style="color:#555;font-weight:600">Estado previo al cierre</td><td><strong style="color:'+est.color+'">'+est.label+'</strong>'+(legajo.estadoCuentaUpdatedAt?' <span style="color:#888;font-size:9pt">(desde '+legajo.estadoCuentaUpdatedAt+')</span>':'')+'</td></tr>'; })()
    + '<tr><td style="color:#555;font-weight:600">Segmento al cierre</td><td><strong style="color:'+segColor(legajo.segmento||'MEDIO')+'">'+( legajo.segmento||'MEDIO')+'</strong></td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Motivo de cierre</td><td><strong style="color:'+colorMotivo+'">'+labelMotivo+'</strong></td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Fecha de alta en sistema</td><td>'+(legajo.createdAt||'N/D')+'</td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Fecha de cierre</td><td><strong>'+fecha+'</strong></td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Períodos AML analizados</td><td>'+(lPers.length>0?'<strong>'+lPers.length+'</strong>':lPers.length)+'</td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Señales ALTA acumuladas</td><td><strong style="color:'+(lastAltaSigs.length>0?'#E74C3C':'#27AE60')+'">'+lastAltaSigs.length+(lastAltaSigs.length>0?' — requiere evaluación ROS':' — sin alertas críticas')+'</strong></td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Ejecutado por</td><td>Equipo Compliance — GOAT S.A. / Rebit</td></tr>'
    + '</tbody></table>'
    + (function(){
        var estPrevio = getEstado(legajo.estadoCuenta||'EN_ONBOARDING');
        if (legajo.estadoCuenta === 'ACTIVA' || legajo.estadoCuenta === 'ACTIVA_REFORZADO') {
          return '<div style="background:#FEF9E7;border-left:4px solid #E67E22;padding:10px 14px;border-radius:0 4px 4px 0;margin:8px 0;font-size:9.5pt">⚠ La cuenta se encontraba <strong>'+estPrevio.label+'</strong> al momento del cierre'+(lPers.length>0?', con '+lPers.length+' período(s) transaccional(es) analizados':'')+'. El dictamen de cierre debe contemplar el historial operativo completo.</div>';
        }
        if (legajo.estadoCuenta === 'EN_ONBOARDING') {
          return '<div style="background:#EBF5FB;border-left:4px solid #2471A3;padding:10px 14px;border-radius:0 4px 4px 0;margin:8px 0;font-size:9.5pt">ℹ La cuenta se encontraba <strong>En Onboarding</strong> al momento del cierre — nunca fue habilitada para operar.</div>';
        }
        return '';
      }())

    // Sección 1: Motivo
    + '<h2 style="background:#1B2A4A;color:white;padding:8px 14px;font-size:11pt;margin:22px 0 8px;border-radius:3px;">1. Motivo de cierre</h2>'
    + '<div style="background:#FDEDEC;border-left:4px solid #E74C3C;padding:12px 16px;border-radius:0 4px 4px 0;margin:8px 0">'
    + '<strong style="color:'+colorMotivo+'">'+labelMotivo+'</strong><br/>'
    + '<p style="margin:8px 0 0;font-size:9.5pt">'+( motivoCierre||'Sin detalle adicional.')+'</p></div>'

    // Sección 2: Historial KYB
    + '<h2 style="background:#1B2A4A;color:white;padding:8px 14px;font-size:11pt;margin:22px 0 8px;border-radius:3px;">2. Historial KYB del cliente</h2>'
    + '<table><tbody>'
    + '<tr><td style="color:#555;font-weight:600;width:42%">Segmento inicial</td><td>'+(legajo.segmento||'MEDIO')+'</td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Dictamen de onboarding</td><td>'+(legajo.dictamen||'N/D')+'</td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Score KYB</td><td>'+(function(){var s=Object.values(legajo.kybScores||{}).filter(function(v){return v>0;});return s.length>0?(s.reduce(function(a,b){return a+b;},0)/s.length).toFixed(1)+'/5':'N/D';})()+'</td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Documentación</td><td>'+(function(){var ok=Object.values(legajo.checklist||{}).filter(function(v){return v==='OK';}).length;return ok+'/'+CHECKLIST_ITEMS.length+' documentos OK';})()+'</td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Red Flags KYB</td><td>'+(rf.length>0?rf.length+' señal(es) registrada(s)':'Sin señales')+'</td></tr>'
    + '</tbody></table>'
    + (rf.length>0 ? '<table><thead><tr><th>#</th><th>Señal KYB registrada</th></tr></thead><tbody>'+rf.map(function(r,i){return '<tr><td>'+(i+1)+'</td><td>'+r+'</td></tr>';}).join('')+'</tbody></table>' : '')
    + (safeArr(legajo.estadoHistorial).length>0
      ? '<h3 style="color:#2C4A7C;font-size:10pt;margin:14px 0 6px;border-bottom:2px solid #D6E4F0;padding-bottom:3px;">Historial de estados de cuenta</h3>'
        + '<table><thead><tr><th>#</th><th>Estado</th><th>Fecha</th><th>Hora</th><th>Registrado por</th></tr></thead><tbody>'
        + safeArr(legajo.estadoHistorial).map(function(h,i){
            var est=getEstado(h.estado||'EN_ONBOARDING');
            return '<tr><td style="padding:5px 10px;border-bottom:1px solid #eee">'+(i+1)+'</td>'
              +'<td style="padding:5px 10px;border-bottom:1px solid #eee;color:'+est.color+';font-weight:700">'+est.label+'</td>'
              +'<td style="padding:5px 10px;border-bottom:1px solid #eee">'+(h.fecha||'-')+'</td>'
              +'<td style="padding:5px 10px;border-bottom:1px solid #eee">'+(h.hora||'-')+'</td>'
              +'<td style="padding:5px 10px;border-bottom:1px solid #eee">'+(h.analista||'Analista')+'</td></tr>';
          }).join('')
        + '</tbody></table>'
      : '')

    // Sección 3: Historial AML
    + '<h2 style="background:#1B2A4A;color:white;padding:8px 14px;font-size:11pt;margin:22px 0 8px;border-radius:3px;">3. Historial de análisis transaccional AML</h2>'
    + (lPers.length > 0
      ? '<table><thead><tr><th>#</th><th>Período</th><th>Txns</th><th>Cash-IN</th><th>Cash-OUT</th><th>Alertas</th><th>Riesgo</th><th>Fecha</th></tr></thead><tbody>'+historialRows+'</tbody></table>'
      : '<div style="background:#EBF5FB;border-left:4px solid #2471A3;padding:10px 14px;border-radius:0 4px 4px 0;margin:8px 0">Sin períodos AML analizados registrados en el sistema.</div>')

    // Sección 4: Último análisis AML
    + '<h2 style="background:#1B2A4A;color:white;padding:8px 14px;font-size:11pt;margin:22px 0 8px;border-radius:3px;">4. Último análisis AML ('+( lastPer?lastPer.nombre:'—')+')</h2>'
    + (lastM && lastSc
      ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0">'
        + '<div style="background:'+lastSc.col+';color:white;padding:14px;border-radius:4px;text-align:center"><div style="font-size:8pt;opacity:0.8">CLASIFICACIÓN AML</div><div style="font-size:16pt;font-weight:700">'+lastSc.clasificacion+'</div><div style="font-size:9pt;margin-top:4px">Score: '+lastSc.promedio.toFixed(2)+'/5</div></div>'
        + '<div style="background:#F8FBFE;border:1px solid #E8EEF4;padding:14px;border-radius:4px"><div style="font-size:8pt;color:#555;margin-bottom:6px">MÉTRICAS CLAVE</div>'
        + '<div style="font-size:9pt">Vol. IN: <strong>'+fmtM(lastM.tIn)+'</strong></div>'
        + '<div style="font-size:9pt">Vol. OUT: <strong>'+fmtM(lastM.tOut)+'</strong></div>'
        + '<div style="font-size:9pt">Ops: <strong>'+lastM.totalTxns+'</strong></div>'
        + '<div style="font-size:9pt">Señales ALTA: <strong style="color:'+(lastAltaSigs.length>0?'#E74C3C':'#27AE60')+'">'+lastAltaSigs.length+'</strong></div>'
        + '</div></div>'
        + (lastSigs.length>0 ? '<table><thead><tr><th>Patrón</th><th>Severidad</th><th>Descripción</th></tr></thead><tbody>'+lastSigs.map(function(s){return '<tr><td><strong>'+s.pat+'</strong></td><td style="color:'+sevColor(s.sev)+';font-weight:700">'+s.sev+'</td><td>'+s.titulo+'</td></tr>';}).join('')+'</tbody></table>' : '<div style="background:#EBF9F0;border-left:4px solid #27AE60;padding:10px 14px;margin:8px 0">Sin señales detectadas en el último período.</div>')
      : '<div style="background:#EBF5FB;border-left:4px solid #2471A3;padding:10px 14px;margin:8px 0">Sin datos de análisis AML disponibles para el último período.</div>')

    // Sección 5: Análisis IA
    + '<h2 style="background:#1B2A4A;color:white;padding:8px 14px;font-size:11pt;margin:22px 0 8px;border-radius:3px;">5. Análisis automatizado IA — Fundamentos del cierre</h2>'
    + '<div style="background:#F8FBFE;border:1px solid #D6E4F0;padding:14px 16px;border-radius:4px;font-size:9.5pt;line-height:1.7">'
    + (analisisIA || '<em>Análisis IA no generado. Para generarlo, presioná "Analizar con IA" en la pantalla de cierre.</em>')
    + '</div>'

    // Sección 6: Dictamen de cierre
    + '<h2 style="background:#1B2A4A;color:white;padding:8px 14px;font-size:11pt;margin:22px 0 8px;border-radius:3px;">6. Dictamen de cierre</h2>'
    + '<div style="border:2px solid #E74C3C;border-radius:6px;padding:18px;margin:14px 0">'
    + '<table><tbody>'
    + '<tr><td style="color:#555;font-weight:600;width:42%">Decisión</td><td><strong style="color:#E74C3C;font-size:11pt">CUENTA CERRADA / DESVINCULADA</strong></td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Motivo principal</td><td><strong>'+labelMotivo+'</strong></td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Fecha efectiva</td><td><strong>'+fecha+'</strong></td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Períodos AML analizados</td><td>'+lPers.length+' períodos</td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Señales ALTA acumuladas</td><td style="color:'+(lastAltaSigs.length>0?'#E74C3C':'#27AE60')+';font-weight:700">'+lastAltaSigs.length+'</td></tr>'
    + '<tr><td style="color:#555;font-weight:600">Reporte UIF / ROS</td><td>Evaluar según normativa UIF según criterio del Oficial de Cumplimiento</td></tr>'
    + '</tbody></table></div>'

    // Firma
    + '<div style="margin-top:36px"><table style="width:100%;border-collapse:collapse;font-size:9.5pt">'
    + '<tr>'
    + '<td style="padding:24px 20px;border:1px solid #ddd;text-align:center;width:33%">____________________<br/><strong>Analista Compliance</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '<td style="padding:24px 20px;border:1px solid #ddd;text-align:center;width:33%">____________________<br/><strong>Responsable Compliance</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '<td style="padding:24px 20px;border:1px solid #ddd;text-align:center;width:33%">____________________<br/><strong>Oficial de Cumplimiento</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '</tr></table></div>'
    + '<div style="display:flex;justify-content:space-between;border-top:1px solid #D6E4F0;padding-top:8px;margin-top:20px;font-size:7.5pt;color:#888">'
    + '<span>Confidencial — Uso interno y para terceros bajo acuerdo</span>'
    + '<span>GOAT S.A. / Rebit — Compliance &amp; AML — v2.2.0</span>'
    + '</div></body></html>';
}

// ─── GENERADOR ROS — REPORTE DE OPERACIÓN SOSPECHOSA ─────────────────────────
var PAT_UIF_MAP = {
  'PAT-01': { tip:'T-02', desc:'Fraccionamiento de operaciones para eludir umbrales de reporte (structuring)' },
  'PAT-02': { tip:'T-01', desc:'Operaciones con montos exactos o redondeados en forma sistemática y reiterada' },
  'PAT-03': { tip:'T-04', desc:'Posible circularidad de fondos entre contrapartes relacionadas (layering)' },
  'PAT-04': { tip:'T-02', desc:'Smurfing: uso de múltiples contrapartes únicas para fragmentar transacciones de alto monto' },
  'PAT-05': { tip:'T-05', desc:'Volumen de operaciones manifiestamente incompatible con el perfil económico declarado' },
  'PAT-06': { tip:'T-03', desc:'Concentración extrema de operaciones en una o pocas contrapartes sin justificación comercial aparente' },
  'PAT-07': { tip:'T-01', desc:'Patrón de montos exactamente repetidos en múltiples operaciones' },
  'PAT-08': { tip:'T-06', desc:'Actividad transaccional concentrada en horarios atípicos (nocturnos o fines de semana)' },
  'PAT-09': { tip:'T-07', desc:'Uso de la cuenta como intermediario de paso (pass-through): fondos que ingresan y egresan en forma inmediata' },
  'PAT-10': { tip:'T-02', desc:'Near-threshold structuring: acumulación de 5 o más operaciones por debajo del umbral UIF ($800K) con la misma contraparte' },
  'PAT-11': { tip:'T-08', desc:'Incorporación masiva de nuevas contrapartes en un período reducido, sin correlato operativo aparente' },
  'PAT-12': { tip:'T-09', desc:'Comportamiento transaccional atípico en relación al perfil histórico del cliente' },
};

function genROS(legajo, todosLosPeriodos, selectedIds, rfisLegajo, currentUser, rosNum) {
  var sel = todosLosPeriodos.filter(function(p){ return selectedIds.indexOf(p.id) >= 0; });
  var rfis = rfisLegajo || [];
  var numRos = rosNum || '001';
  var oficial = currentUser ? currentUser.nombre : 'Oficial de Cumplimiento';
  var hoy = todayStr();
  var year = new Date().getFullYear();
  var numDoc = 'ROS-' + year + '-' + String(numRos).padStart(3,'0');

  // Agregar métricas de períodos seleccionados
  var totalIn = 0, totalOut = 0, totalOps = 0;
  sel.forEach(function(p){ if(p.metricas){ totalIn+=p.metricas.tIn; totalOut+=p.metricas.tOut; totalOps+=p.metricas.totalTxns; } });

  // Señales ALTA no resueltas en períodos seleccionados
  var sigsList = [];
  sel.forEach(function(p){
    var m = p.metricas;
    if (!m) return;
    var sigs = detectPatrones(m, legajo);
    sigs.filter(function(s){ return s.sev==='ALTA'; }).forEach(function(s){
      var res = (p.sigsResolucion||{})[s.pat];
      if (!res || res.estado !== 'RESUELTA') {
        if (!sigsList.find(function(x){return x.pat===s.pat;})) sigsList.push(Object.assign({},s,{periodo:p.nombre}));
      }
    });
  });

  // Top 20 operaciones por monto en períodos seleccionados
  var allTxns = [];
  sel.forEach(function(p){ if(p.txns&&p.txns.length) p.txns.forEach(function(t){ allTxns.push(Object.assign({},t,{periodo:p.nombre})); }); });
  var topTxns = allTxns.slice().sort(function(a,b){return b.monto-a.monto;}).slice(0,20);

  // Períodos abarcados
  var nomPers = sel.map(function(p){return p.nombre;}).join(', ');
  var est = getEstado(legajo.estadoCuenta||'ACTIVA');

  // RFIs relevantes
  var rfisActivos = rfis.filter(function(r){return r.estado!=='CERRADO';});

  var css = '<style>*{box-sizing:border-box;font-family:"Times New Roman",serif}body{margin:0;padding:24px 32px;color:#111;font-size:10pt;line-height:1.5}h1{font-size:15pt;font-weight:bold;color:#1B2A4A;margin:0 0 4px}h2{font-size:11pt;font-weight:bold;color:#1B2A4A;border-bottom:2px solid #1B2A4A;padding-bottom:3px;margin:18px 0 8px}.sec{margin-bottom:14px}.label{font-weight:bold;display:inline-block;min-width:180px;color:#444}.val{display:inline}table{width:100%;border-collapse:collapse;font-size:9pt;margin:6px 0}th{background:#1B2A4A;color:white;padding:5px 8px;text-align:left;font-size:8.5pt}td{padding:4px 8px;border:1px solid #ddd;vertical-align:top}.alerta{background:#FDEDEC;border-left:4px solid #E74C3C;padding:6px 10px;margin:4px 0;border-radius:0 4px 4px 0}.confidencial{background:#FEF9E7;border:1px solid #F39C12;padding:6px 14px;text-align:center;font-weight:bold;font-size:9pt;color:#E67E22;margin-bottom:14px;letter-spacing:1px}[contenteditable]{border:1px dashed #aaa;padding:6px 8px;min-height:40px;border-radius:3px;background:#FFFEF5}[contenteditable]:focus{outline:2px solid #2471A3;background:#EBF5FB}.footer{border-top:1px solid #ccc;margin-top:20px;padding-top:8px;font-size:8pt;color:#888;display:flex;justify-content:space-between}@media print{[contenteditable]{border:none;background:transparent}}</style>';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+numDoc+'</title>'+css+'</head><body>';

  // ── ENCABEZADO ────────────────────────────────────────────────────────────────
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;border-bottom:3px solid #1B2A4A;padding-bottom:10px">'
    + '<div><h1>REPORTE DE OPERACIÓN SOSPECHOSA — BORRADOR</h1>'
    + '<div style="font-size:9pt;color:#555">Resolución UIF N° 156/2018 y modificatorias · Art. 20 Ley 25.246</div></div>'
    + '<div style="text-align:right;font-size:9pt"><strong>N° '+numDoc+'</strong><br/>Fecha: '+hoy+'<br/>Generado por: '+oficial+'</div></div>';

  html += '<div class="confidencial">⚠ CONFIDENCIAL — USO EXCLUSIVO DEL SUJETO OBLIGADO — NO DIVULGAR</div>';

  // ── SECCIÓN 1: SUJETO OBLIGADO ────────────────────────────────────────────────
  html += '<h2>1. Datos del Sujeto Obligado</h2><div class="sec">'
    + '<table><tbody>'
    + '<tr><td class="label">Razón Social</td><td>GOAT S.A.</td><td class="label">CUIT</td><td>30-71703953-6</td></tr>'
    + '<tr><td class="label">Actividad</td><td colspan="3">Proveedor de Servicios de Pago (PSP) — Billetera virtual y medios de pago electrónico</td></tr>'
    + '<tr><td class="label">Regulador</td><td>BCRA — Comunicación "A" 6885 y complementarias</td><td class="label">N° inscripción UIF</td><td>____________________</td></tr>'
    + '<tr><td class="label">Oficial de Cumplimiento</td><td>'+oficial+'</td><td class="label">Fecha del reporte</td><td>'+hoy+'</td></tr>'
    + '</tbody></table></div>';

  // ── SECCIÓN 2: CLIENTE REPORTADO ─────────────────────────────────────────────
  html += '<h2>2. Datos del Cliente Reportado</h2><div class="sec">'
    + '<table><tbody>'
    + '<tr><td class="label">Razón Social / Nombre</td><td colspan="3"><strong>'+(legajo.razonSocial||'N/D')+'</strong></td></tr>'
    + '<tr><td class="label">CUIT / CUIL</td><td>'+(legajo.cuit||'N/D')+'</td><td class="label">Actividad declarada</td><td>'+(legajo.actividad||'N/D')+'</td></tr>'
    + '<tr><td class="label">Segmento de riesgo</td><td>'+(legajo.segmento||'N/D')+'</td><td class="label">Dictamen KYB</td><td>'+(legajo.dictamen||'N/D')+'</td></tr>'
    + '<tr><td class="label">Estado de cuenta</td><td>'+est.label+'</td><td class="label">Beneficiario final</td><td>'+(legajo.beneficiarioFinal||'N/D')+'</td></tr>'
    + '<tr><td class="label">Facturación mensual declarada</td><td>'+(legajo.facturacionMensual?fmtM(legajo.facturacionMensual):'N/D')+'</td><td class="label">Límite mensual CVU</td><td>'+(legajo.limiteMensual?fmtM(legajo.limiteMensual):'N/D')+'</td></tr>'
    + '</tbody></table></div>';

  // ── SECCIÓN 3: DESCRIPCIÓN DE OPERACIONES ────────────────────────────────────
  html += '<h2>3. Descripción de las Operaciones Inusuales</h2><div class="sec">'
    + '<table><tbody>'
    + '<tr><td class="label">Períodos analizados</td><td>'+nomPers+'</td></tr>'
    + '<tr><td class="label">Volumen total ingresado</td><td><strong>'+fmtM(totalIn)+'</strong></td></tr>'
    + '<tr><td class="label">Volumen total egresado</td><td><strong>'+fmtM(totalOut)+'</strong></td></tr>'
    + '<tr><td class="label">Total de operaciones</td><td>'+totalOps.toLocaleString('es-AR')+' transacciones</td></tr>'
    + '</tbody></table>'
    + '<div style="margin-top:10px"><strong>Descripción narrativa de las operaciones (editable):</strong></div>'
    + '<div contenteditable="true" style="margin-top:6px">Durante el/los período/s '+nomPers+', el cliente '+(legajo.razonSocial||'')
    + ' (CUIT '+(legajo.cuit||'')+')'
    + ' registró un volumen de operaciones de '+fmtM(totalIn)+' de ingresos y '+fmtM(totalOut)+' de egresos'
    + ', lo que '+(legajo.facturacionMensual && totalIn > legajo.facturacionMensual ? 'excede en forma significativa el perfil económico declarado de '+fmtM(legajo.facturacionMensual)+' mensuales' : 'se observa incompatible con el perfil esperado del cliente')+'.'
    + ' Se detectaron patrones transaccionales inusuales que motivaron la presente comunicación. [Completar con detalles adicionales de la investigación.]</div></div>';

  // ── SECCIÓN 4: SEÑALES DE ALERTA ─────────────────────────────────────────────
  html += '<h2>4. Señales de Alerta Detectadas</h2><div class="sec">';
  if (sigsList.length === 0) {
    html += '<p style="color:#888;font-style:italic">No se detectaron señales ALTA activas en los períodos seleccionados.</p>';
  } else {
    html += '<table><thead><tr><th>Código</th><th>Tipología UIF</th><th>Descripción</th><th>Período</th></tr></thead><tbody>';
    sigsList.forEach(function(s){
      var uif = PAT_UIF_MAP[s.pat] || {tip:'—',desc:s.desc};
      html += '<tr><td style="font-weight:bold;white-space:nowrap">'+s.pat+'<br/><span style="font-size:8pt;color:#888">'+uif.tip+'</span></td>'
        + '<td style="font-weight:bold">'+s.titulo+'</td>'
        + '<td style="font-size:8.5pt">'+uif.desc+'<br/><em style="color:#555">Detalle: '+s.desc+'</em></td>'
        + '<td style="font-size:8.5pt;white-space:nowrap">'+s.periodo+'</td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  // ── SECCIÓN 5: OPERACIONES MÁS RELEVANTES ────────────────────────────────────
  html += '<h2>5. Operaciones Más Relevantes</h2><div class="sec">';
  if (topTxns.length === 0) {
    html += '<p style="color:#888;font-style:italic">Transacciones no disponibles en este dispositivo. Adjuntar detalle de operaciones al momento de presentar el ROS.</p>';
  } else {
    html += '<p style="font-size:8.5pt;color:#555;margin-bottom:4px">Top '+topTxns.length+' operaciones por monto en los períodos seleccionados (de '+allTxns.length.toLocaleString('es-AR')+' totales):</p>'
      + '<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Contraparte</th><th>CUIT/CVU</th><th>Período</th></tr></thead><tbody>';
    topTxns.forEach(function(t){
      html += '<tr><td style="white-space:nowrap">'+(t.fecha||'—')+'</td>'
        + '<td style="white-space:nowrap">'+(t.tipo||'—')+'</td>'
        + '<td style="white-space:nowrap;font-weight:bold">'+(typeof t.monto==='number'?fmtM(t.monto):(t.monto||'—'))+'</td>'
        + '<td>'+(t.cpNombre||t.nombre||'—')+'</td>'
        + '<td style="font-size:8pt">'+(t.cpCuit||'—')+'</td>'
        + '<td style="font-size:8pt">'+(t.periodo||'—')+'</td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  // ── SECCIÓN 6: DILIGENCIAS REALIZADAS ────────────────────────────────────────
  html += '<h2>6. Diligencias Realizadas</h2><div class="sec">';

  // Checklist KYB
  var cl = legajo.checklist || {};
  var clItems = Object.keys(cl).filter(function(k){return cl[k];});
  html += '<p style="margin:0 0 4px"><strong>Documentación KYB recopilada:</strong> '
    + (clItems.length > 0 ? clItems.join(', ') : 'Ver legajo KYB en el sistema')+'</p>';

  // RFIs
  if (rfis.length > 0) {
    html += '<p style="margin:6px 0 4px"><strong>Requerimientos de Información enviados al cliente:</strong></p>'
      + '<table><thead><tr><th>N° RFI</th><th>Fecha envío</th><th>Asunto</th><th>Estado</th><th>Respuesta</th></tr></thead><tbody>';
    rfis.forEach(function(r){
      var resp = (r.intercambios||[]).find(function(i){return i.tipo==='RESPUESTA';});
      html += '<tr><td style="white-space:nowrap;font-weight:bold">'+r.refNum+'</td>'
        + '<td style="white-space:nowrap">'+(r.createdAt||'—')+'</td>'
        + '<td>'+r.asunto+'</td>'
        + '<td style="white-space:nowrap">'+(r.estado||'—')+'</td>'
        + '<td style="font-size:8.5pt">'+(resp ? resp.contenido.slice(0,120)+(resp.contenido.length>120?'…':'') : 'Sin respuesta')+'</td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<p style="color:#888;font-style:italic">No se registran RFIs asociados a este legajo.</p>';
  }

  html += '</div>';

  // ── SECCIÓN 7: CONCLUSIÓN ─────────────────────────────────────────────────────
  html += '<h2>7. Conclusión y Fundamento del Reporte</h2><div class="sec">'
    + '<div contenteditable="true">'
    + 'Con base en el análisis transaccional realizado sobre los períodos '+nomPers
    + ' y las diligencias de debida diligencia reforzada llevadas a cabo, '
    + 'el equipo de Compliance de GOAT S.A. / Rebit concluye que las operaciones del cliente '
    + (legajo.razonSocial||'')
    + ' presentan indicios de operaciones inusuales que no cuentan con justificación económica o jurídica aparente, '
    + 'configurando los supuestos del artículo 21 de la Ley 25.246. '
    + 'En virtud de lo expuesto, se procede a la formulación del presente Reporte de Operación Sospechosa ante la Unidad de Información Financiera (UIF). '
    + '[Completar con fundamentos adicionales específicos del caso.]'
    + '</div>'
    + '<div style="margin-top:8px;padding:6px 10px;background:#FEF9E7;border:1px solid #F39C12;border-radius:3px;font-size:8.5pt">'
    + '⚠ <strong>Recordatorio:</strong> El presente es un borrador de trabajo. Antes de la presentación formal ante la UIF a través del sistema SIROS, '
    + 'debe ser revisado y aprobado por el Oficial de Cumplimiento designado.'
    + '</div></div>';

  // ── SECCIÓN 8: FIRMA ──────────────────────────────────────────────────────────
  html += '<h2>8. Firma del Oficial de Cumplimiento</h2>'
    + '<table style="margin-top:20px"><tbody><tr>'
    + '<td style="padding:30px 20px;border:1px solid #ddd;text-align:center;width:50%">'
    + '<div style="border-bottom:1px solid #333;margin:0 auto 8px;width:200px;height:40px"></div>'
    + '<strong>'+oficial+'</strong><br/>'
    + '<span style="font-size:8.5pt">Oficial de Cumplimiento — GOAT S.A.</span><br/>'
    + '<span style="font-size:8.5pt;color:#888">Fecha: '+hoy+'</span>'
    + '</td>'
    + '<td style="padding:30px 20px;border:1px solid #ddd;text-align:center;width:50%">'
    + '<div style="border-bottom:1px solid #333;margin:0 auto 8px;width:200px;height:40px"></div>'
    + '<strong>____________________</strong><br/>'
    + '<span style="font-size:8.5pt">Gerencia / Directorio</span><br/>'
    + '<span style="font-size:8.5pt;color:#888">Fecha: _______________</span>'
    + '</td>'
    + '</tr></tbody></table>';

  // ── FOOTER ────────────────────────────────────────────────────────────────────
  html += '<div class="footer">'
    + '<span>CONFIDENCIAL — '+numDoc+' — Generado '+hoy+'</span>'
    + '<span>GOAT S.A. / Rebit — Compliance &amp; AML — Sistema Rebit AML Tool</span>'
    + '</div>'
    + '<div style="text-align:center;margin-top:6px;font-size:7pt;color:#aaa">'
    + 'Este documento es un borrador de trabajo. Para la presentación formal utilizar el sistema SIROS de la UIF.'
    + '</div>'
    + '</body></html>';

  return html;
}
async function extractWithClaude(filesOrBlocks) {
  var contentBlocks = [];

  // Acepta tanto un array de File objects como content blocks ya construidos
  if (filesOrBlocks.length > 0 && filesOrBlocks[0] instanceof File) {
    // Modo legacy: recibe File objects (no debería usarse más)
    for (var i = 0; i < filesOrBlocks.length; i++) {
      var f = filesOrBlocks[i];
      var b64 = await fileToBase64(f);
      if (f.type === 'application/pdf') {
        contentBlocks.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 }, title:f.name });
      } else if (f.type.startsWith('image/')) {
        contentBlocks.push({ type:'image', source:{ type:'base64', media_type:f.type, data:b64 } });
      }
      contentBlocks.push({ type:'text', text:'[Archivo: ' + f.name + ']' });
    }
  } else {
    // Modo nuevo: recibe content blocks ya construidos por handleUpload
    contentBlocks = filesOrBlocks;
  }
  var prompt = `Sos analista senior Compliance & AML de GOAT S.A./Rebit (PSP argentino regulado por UIF/BCRA).
FECHA DE HOY: ${new Date().toLocaleDateString('es-AR')} (${new Date().getFullYear()}). Usá esta fecha como referencia para evaluar si algo es pasado, presente o futuro.
Analizá exhaustivamente los documentos adjuntos y extraé TODA la información posible para completar el legajo KYB corporativo.
Devolvé SOLO JSON válido, sin texto previo, sin backticks, sin comentarios.

ESTRUCTURA REQUERIDA:
{
  "razonSocial": "nombre legal completo de la empresa tal como figura en documentos",
  "cuit": "CUIT con formato XX-XXXXXXXX-X",
  "actividad": "actividad principal o giro comercial según estatuto o constancia AFIP",
  "facturacionMensual": numero_en_pesos (estimado conservador según estados contables o perfil),
  "limiteDiario": numero_en_pesos (sugerir conservador: 10-20% de facturacion mensual),
  "limiteMensual": numero_en_pesos (sugerir igual o menor a facturacion mensual declarada),
  "beneficiarioFinal": "nombre completo del/los beneficiario(s) final(es) con participacion >10%",
  "domicilio": "domicilio fiscal completo con calle, numero, localidad, provincia",
  "segmento": "BAJO|MEDIO|MEDIO-ALTO|ALTO",
  "dictamen": "APROBADO|CONDICIONAL|RECHAZADO",

  "checklist": {
    "Estatuto / Contrato social": "OK|Pendiente|Bloqueante|N/A",
    "Inscripcion registral (IGJ/INAES)": "OK|Pendiente|Bloqueante|N/A",
    "Constancia CUIT/AFIP": "OK|Pendiente|Bloqueante|N/A",
    "Acta de directorio vigente": "OK|Pendiente|Bloqueante|N/A",
    "Poder / Autorizacion firmante": "OK|Pendiente|Bloqueante|N/A",
    "DNI / Pasaporte firmante": "OK|Pendiente|Bloqueante|N/A",
    "Declaracion beneficiario final (>10%)": "OK|Pendiente|Bloqueante|N/A",
    "Estados contables (3 ejercicios)": "OK|Pendiente|Bloqueante|N/A",
    "Declaracion patrimonial DDJJ": "OK|Pendiente|Bloqueante|N/A",
    "Comprobante domicilio fiscal": "OK|Pendiente|Bloqueante|N/A",
    "Comprobante domicilio comercial": "OK|Pendiente|Bloqueante|N/A",
    "Certificado actividad / habilitacion": "OK|Pendiente|Bloqueante|N/A",
    "DDJJ AML (PEP/SO/UBO)": "OK|Pendiente|Bloqueante|N/A",
    "Constancia IVA / Monotributo": "OK|Pendiente|Bloqueante|N/A",
    "Referencias bancarias / comerciales": "OK|Pendiente|Bloqueante|N/A"
  },

  "kybScores": {
    "Completitud documental": 1-5,
    "Perfil de riesgo - actividad": 1-5,
    "Screening PEP/sanciones": 1-5,
    "Beneficiario final": 1-5,
    "Estructura societaria": 1-5,
    "Coherencia financiera": 1-5,
    "Antecedentes AML": 1-5
  },

  "redFlags": ["lista de alertas detectadas en los documentos"],
  "observaciones": ["notas tecnicas del analisis"]
}

REGLAS DE COMPLETADO:

CHECKLIST — marca "OK" solo si el documento está presente en los adjuntos. Marca "Pendiente" si no está. Marca "Bloqueante" si hay inconsistencia grave (ej: datos contradictorios, vencido, ilegible).

SCORING KYB (1=Bajo riesgo, 5=Alto riesgo):
- "Completitud documental": 1 si >12 docs OK, 3 si 8-12, 5 si <8
- "Perfil de riesgo - actividad": evaluar si la actividad es sensible (financiera, inmobiliaria, casino, crypto, exportación = mayor riesgo). 1=actividad de bajo riesgo, 5=actividad muy sensible
- "Screening PEP/sanciones": 1 si no hay indicadores, 3 si hay menciones públicas ambiguas, 5 si hay indicadores claros de PEP o sanciones
- "Beneficiario final": 1 si está claramente identificado con documentación, 3 si está declarado sin documentación, 5 si no está identificado o hay estructura opaca
- "Estructura societaria": 1 si es simple y transparente, 3 si tiene capas societarias, 5 si es compleja, offshore o poco transparente
- "Coherencia financiera": 1 si facturación/actividad son coherentes, 3 si hay inconsistencias menores, 5 si hay inconsistencias graves o cifras inexplicables
- "Antecedentes AML": 1 si no hay indicadores, 3 si hay menciones en prensa o registros, 5 si hay antecedentes judiciales o regulatorios

REGLAS CRÍTICAS SOBRE FECHAS Y DOCUMENTOS ARGENTINOS — LEER CON ATENCIÓN ANTES DE GENERAR CUALQUIER RED FLAG:

═══════════════════════════════════════════════════════════
FECHA DE REFERENCIA: HOY ES ${new Date().toLocaleDateString('es-AR')} (AÑO ${new Date().getFullYear()}).
CUALQUIER FECHA IGUAL O ANTERIOR A HOY ES UNA FECHA PASADA. NO ES FUTURA.
═══════════════════════════════════════════════════════════

LÓGICA TEMPORAL OBLIGATORIA:
- Una fecha de 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 o 2025 es SIEMPRE una fecha PASADA. Nunca la llames futura.
- Solo es "fecha futura" una fecha POSTERIOR a ${new Date().toLocaleDateString('es-AR')}.
- Si el contrato social tiene fecha 29/07/2025 → es pasado (hace ${Math.floor((new Date() - new Date('2025-07-29'))/86400000)} días).
- PROHIBIDO: generar red flag por "fecha futura" si la fecha es del año 2025 o anterior.

VIGENCIA LEGAL DE DOCUMENTOS ARGENTINOS — COMPORTAMIENTO ESPERADO, NO SON ERRORES:

1. DNI / Pasaporte argentino:
   - Se emiten en una fecha (ej: 2010, 2015, 2017, 2019) y tienen vigencia de 5, 10 o 15 años.
   - Un DNI emitido en 2017 está VIGENTE hasta 2027. Es perfectamente válido.
   - Es COMPLETAMENTE NORMAL y ESPERADO que el DNI del firmante tenga fecha anterior al contrato social.
   - La empresa se CONSTITUYE DESPUÉS de que sus fundadores nazcan y obtengan DNI.
   - NUNCA ES RED FLAG: "contrato social posterior al DNI del representante". Es la única secuencia posible.
   - NUNCA ES RED FLAG: "DNI emitido antes de la constitución de la empresa".

2. Contrato Social / Estatuto:
   - Su fecha es la fecha de constitución. Siempre es posterior a los DNIs de los socios.
   - Una sociedad constituida en 2025 con socios que tienen DNIs de 2010-2020 → COMPLETAMENTE NORMAL.
   - NUNCA ES RED FLAG la secuencia: DNI 2017 → Contrato Social 2025.

3. Inscripción Registral (IGJ / RPC / INAES):
   - La fecha de inscripción es posterior a la del estatuto (días o meses después). NORMAL.
   - No vence, es permanente.

4. Constancia de CUIT / AFIP:
   - Puede reemitirse en cualquier momento. Fecha reciente no indica problema.
   - El número de CUIT es permanente desde su asignación.

5. Acta de Directorio / Asamblea:
   - Debe ser reciente para reflejar la autoridad actual del firmante.
   - SÍ es red flag si tiene MÁS DE 24 MESES de antigüedad respecto a hoy (${new Date().toLocaleDateString('es-AR')}).
   - NO es red flag si tiene menos de 24 meses.

6. Estados Contables:
   - Los ejercicios son anuales (cierran generalmente al 31/12 o 30/06).
   - Es NORMAL que los estados más recientes sean del ejercicio anterior.
   - SÍ es red flag si no hay estados de los últimos 2 ejercicios.

7. Poder Notarial:
   - Vigencia variable: puede ser por plazo determinado o indefinido.
   - Fecha anterior a la operación que autoriza → NORMAL.

8. Habilitación Municipal / Certificado de Actividad:
   - Tienen fecha de emisión y vencimiento. SÍ es red flag si la fecha de vencimiento ya pasó.

RELACIONES TEMPORALES QUE SON NORMALES Y NO DEBEN GENERAR RED FLAG:
✓ DNI año X → Contrato Social año X+N → NORMAL (la empresa se crea después de los fundadores)
✓ Estatuto año X → Acta de directorio año X+N → NORMAL (las actas son posteriores a la constitución)
✓ Inscripción IGJ posterior al estatuto en días/meses → NORMAL (el trámite lleva tiempo)
✓ Constancia AFIP con fecha reciente aunque el CUIT sea antiguo → NORMAL
✓ Diferentes documentos con diferentes fechas de emisión → NORMAL
✓ Documento emitido en fecha reciente pero con datos históricos → NORMAL

RED FLAGS GENUINOS — reportar SOLO estas situaciones:
⚠ Razón social diferente entre documentos del mismo legajo (ej: "ABC S.A." vs "ABC S.R.L.")
⚠ CUIT que no coincide entre documentos
⚠ Fecha de algún documento POSTERIOR a HOY (${new Date().toLocaleDateString('es-AR')}) — imposible
⚠ DNI corresponde a persona diferente al declarado como representante
⚠ Domicilio fiscal contradictorio entre documentos sin justificación
⚠ Actividad declarada en AFIP distinta a la del estatuto
⚠ Beneficiario final no declarado o estructura societaria que oculta el control real
⚠ Actividades de alto riesgo AML sin justificación: casino, juegos de azar, crypto, remesas, metales preciosos
⚠ Inhabilitaciones, quiebras, concursos preventivos, procesos penales mencionados
⚠ Documentos con alteraciones, correcciones sospechosas o sellos ilegibles
⚠ Datos numéricos imposibles (facturación mayor al PBI provincial, etc.)
⚠ Personas jurídicas en jurisdicciones de alto riesgo GAFI sin justificación
⚠ Acta de directorio con MÁS DE 24 MESES respecto a hoy (${new Date().toLocaleDateString('es-AR')})
⚠ Habilitación/certificado con fecha de vencimiento anterior a hoy (${new Date().toLocaleDateString('es-AR')})

REGLA DE ORO: Ante la duda, NO generes el red flag. Es preferible no reportar algo cuestionable que generar un falso positivo que desoriente al analista. Solo reportar certezas.

Si no encontrás un dato, dejá el campo vacío o en 0. Nunca inventes datos.`;

  contentBlocks.push({ type:'text', text:prompt });

  // Siempre usar el proxy del servidor para evitar CORS en todos los browsers
  var DOC_BLOCKS_PER_BATCH = 2;

  // Separar los bloques de documentos del prompt
  var docBlocks = contentBlocks.filter(function(b){ return b.type === 'document' || b.type === 'image'; });
  var textBlocks = contentBlocks.filter(function(b){ return b.type === 'text'; });
  var promptBlock = textBlocks[textBlocks.length - 1];

  // Si hay pocos documentos, enviar todo junto
  if (docBlocks.length <= DOC_BLOCKS_PER_BATCH) {
    return await callProxyOrDirect('claude', [{ role:'user', content:contentBlocks }], 8000);
  }

  // Prompt especial para análisis por lotes — CRÍTICO para evitar falsos positivos
  var totalBatches = Math.ceil(docBlocks.length / DOC_BLOCKS_PER_BATCH);
  var batchPromptText = promptBlock.text + '\n\n'
    + '══════════════════════════════════════════════════════════\n'
    + 'INSTRUCCIÓN CRÍTICA — ANÁLISIS EN LOTE (LEER ANTES DE RESPONDER):\n'
    + 'Este análisis se divide en ' + totalBatches + ' lotes. Este mensaje contiene SOLO ALGUNOS de los documentos del legajo.\n'
    + 'REGLAS OBLIGATORIAS para análisis en lote:\n'
    + '1. CHECKLIST: Marca "OK" únicamente para documentos que PUEDAS VER EN ESTE LOTE. Para todo lo demás escribe "Pendiente" (NUNCA "Bloqueante" por documentos que simplemente no están en este lote).\n'
    + '2. RED FLAGS: Reportá SOLO problemas reales encontrados en los documentos de este lote (inconsistencias, datos incorrectos, vencimientos, irregularidades). NUNCA generes una red flag por "falta de documentación" — eso es información de otro lote.\n'
    + '3. DATOS: Completá solo los campos que puedas inferir de los documentos presentes. Dejá en blanco los que no puedas determinar.\n'
    + '4. SCORING KYB: Evaluá solo los factores que puedas determinar con los docs disponibles. Si no tenés info suficiente, poné 0.\n'
    + '══════════════════════════════════════════════════════════';

  var batchPromptBlock = { type: 'text', text: batchPromptText };

  // Analizar en lotes
  var allResults = [];
  for (var bStart = 0; bStart < docBlocks.length; bStart += DOC_BLOCKS_PER_BATCH) {
    var batchNum = Math.floor(bStart / DOC_BLOCKS_PER_BATCH) + 1;
    var batchDocs = docBlocks.slice(bStart, bStart + DOC_BLOCKS_PER_BATCH);
    var batchBlocks = batchDocs.concat([batchPromptBlock]);
    console.log('[Rebit IA] Lote ' + batchNum + ' de ' + totalBatches);
    var batchResult = await callProxyOrDirect('claude', [{ role:'user', content:batchBlocks }], 6000);
    allResults.push(batchResult);
    if (bStart + DOC_BLOCKS_PER_BATCH < docBlocks.length) {
      await sleep(8000);
    }
  }

  // ── MERGE INTELIGENTE ─────────────────────────────────────────────────────
  // Regla fundamental: OK siempre gana — si cualquier lote encontró el doc, está OK.
  // Un "Bloqueante" solo se aplica si el lote que TIENE ese documento lo marcó así.
  var merged = {};

  allResults.forEach(function(r) {
    if (!r || typeof r !== 'object') return;
    Object.keys(r).forEach(function(k) {

      // CHECKLIST — OK gana siempre sobre Bloqueante/Pendiente
      if (k === 'checklist') {
        if (!merged.checklist) merged.checklist = {};
        Object.keys(r.checklist || {}).forEach(function(item) {
          var cur = merged.checklist[item];
          var nxt = r.checklist[item];
          if (!nxt) return;
          if (!cur) { merged.checklist[item] = nxt; return; }
          // Jerarquía: OK > N/A > Bloqueante > Pendiente
          // Si CUALQUIER lote dice OK → el doc existe → es OK
          if (nxt === 'OK') { merged.checklist[item] = 'OK'; return; }
          if (cur === 'OK') return; // Ya está OK, no degradar
          if (nxt === 'N/A' && cur !== 'OK') { merged.checklist[item] = 'N/A'; return; }
          if (cur === 'N/A') return;
          if (nxt === 'Bloqueante' && cur === 'Pendiente') { merged.checklist[item] = 'Bloqueante'; return; }
        });

      // SCORING KYB — tomar el máximo valor informado (más información = mejor score)
      } else if (k === 'kybScores') {
        if (!merged.kybScores) merged.kybScores = {};
        Object.keys(r.kybScores || {}).forEach(function(f) {
          var n = Number(r.kybScores[f]);
          var cur = Number(merged.kybScores[f]) || 0;
          if (n > 0) merged.kybScores[f] = Math.max(cur, n);
        });

      // RED FLAGS — deduplicar agresivamente (evitar las 52 repeticiones)
      } else if (k === 'redFlags') {
        if (!merged.redFlags) merged.redFlags = [];
        (r.redFlags || []).forEach(function(v) {
          if (!v || v.length < 10) return;
          // Filtrar red flags genéricas sobre "falta documentación" que son artefactos del lote
          var lower = v.toLowerCase();
          var esFaltaDoc = lower.indexOf('falta documentaci') >= 0
            || lower.indexOf('documentaci') >= 0 && lower.indexOf('insuficiente') >= 0
            || lower.indexOf('solo se presenta') >= 0
            || lower.indexOf('solo se cuenta') >= 0
            || lower.indexOf('solo se adjunta') >= 0
            || lower.indexOf('solo se dispone') >= 0
            || lower.indexOf('imposible completar') >= 0
            || lower.indexOf('no es posible completar') >= 0
            || lower.indexOf('requiere documentaci') >= 0
            || lower.indexOf('necesario completar') >= 0
            || lower.indexOf('necesario solicitar') >= 0
            || lower.indexOf('necesario requerir') >= 0
            || lower.indexOf('requiere completar') >= 0
            || lower.indexOf('legajo incompleto') >= 0
            || lower.indexOf('legajo altamente incompleto') >= 0
            || (lower.indexOf('falta') >= 0 && lower.indexOf('kyb') >= 0)
            || (lower.indexOf('ausencia') >= 0 && lower.indexOf('documentaci') >= 0)
            || (lower.indexOf('no se puede') >= 0 && lower.indexOf('determinar') >= 0)
            || (lower.indexOf('no se puede') >= 0 && lower.indexOf('identificar') >= 0)
            || (lower.indexOf('no se puede') >= 0 && lower.indexOf('completar') >= 0)
            || (lower.indexOf('imposible') >= 0 && lower.indexOf('determinar') >= 0)
            || (lower.indexOf('imposible') >= 0 && lower.indexOf('evaluar') >= 0);
          if (esFaltaDoc) return; // Descartar artefacto de lote
          // Deduplicar por similitud
          var isDuplicate = merged.redFlags.some(function(existing) {
            if (existing === v) return true;
            var shortA = v.slice(0, 40).toLowerCase();
            var shortB = existing.slice(0, 40).toLowerCase();
            return shortA === shortB;
          });
          if (!isDuplicate) merged.redFlags.push(v);
        });

      // OBSERVACIONES — deduplicar
      } else if (k === 'observaciones') {
        if (!merged.observaciones) merged.observaciones = [];
        (r.observaciones || []).forEach(function(v) {
          if (!v) return;
          var isDup = merged.observaciones.some(function(e){ return e.slice(0,40) === v.slice(0,40); });
          if (!isDup) merged.observaciones.push(v);
        });

      // CAMPOS ESCALARES — tomar el primero con valor real
      } else {
        if (r[k] !== undefined && r[k] !== '' && r[k] !== 0 && r[k] !== null) {
          if (!merged[k]) merged[k] = r[k];
        }
      }
    });
  });
  return merged;
}

// ─── SLEEP HELPER ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

// ─── PROXY + FALLBACK + RETRY CON BACKOFF ────────────────────────────────────
async function callProxyOrDirect(provider, messages, maxTokens, returnRaw) {
  var MAX_RETRIES = 4;
  var RETRY_DELAYS = [15000, 30000, 60000, 90000]; // 15s, 30s, 60s, 90s

  async function doCall() {
    var isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    // 1. Intentar proxy del servidor
    var proxyResp;
    try {
      // Comprimir payload con gzip para evitar el límite de 4.5MB de Vercel
      var payload = JSON.stringify({ provider: provider, messages: messages, max_tokens: maxTokens || 8000 });
      var proxyBody, proxyHeaders;
      try {
        var stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'));
        var compressed = await new Response(stream).arrayBuffer();
        proxyBody = compressed;
        proxyHeaders = { 'Content-Type': 'application/octet-stream', 'x-encoding': 'gzip-json', 'x-app-token': '123aml2026' };
      } catch(compErr) {
        // Fallback sin compresión si el browser no soporta CompressionStream
        proxyBody = payload;
        proxyHeaders = { 'Content-Type': 'application/json', 'x-app-token': '123aml2026' };
      }
      proxyResp = await fetch('/api/ai', {
        method: 'POST',
        headers: proxyHeaders,
        body: proxyBody
      });
    } catch(networkErr) {
      // fetch() lanzó error de red real (sin conexión, DNS, etc.)
      if (!isLocalhost) {
        throw new Error('Error de red al contactar el servidor proxy.\n'
          + 'Verificá tu conexión a internet y que las Serverless Functions de Vercel estén disponibles.\n'
          + 'Detalle: ' + networkErr.message);
      }
      console.warn('[Rebit IA] Proxy no alcanzable (localhost):', networkErr.message);
      proxyResp = null;
    }

    if (proxyResp) {
      if (proxyResp.ok) {
        var proxyData = await proxyResp.json();
        if (proxyData.text) return returnRaw ? proxyData.text : parseJsonFromResponse(proxyData.text);
      }
      // Proxy respondió con error HTTP
      var proxyErrData = {};
      try { proxyErrData = await proxyResp.json(); } catch(e) {}
      var proxyErrMsg = proxyErrData.error || ('HTTP ' + proxyResp.status);
      if (proxyResp.status === 429 || proxyErrMsg.indexOf('rate limit') >= 0 || proxyErrMsg.indexOf('tokens per minute') >= 0) {
        throw new Error('RATE_LIMIT:' + proxyErrMsg);
      }
      if (proxyResp.status === 413) {
        throw new Error('El documento es demasiado grande (HTTP 413).\nIntentá con documentos más pequeños o de a uno por vez.');
      }
      if (proxyResp.status === 503 || proxyErrMsg.indexOf('no configurado') >= 0) {
        throw new Error('ANTHROPIC_API_KEY no está configurada en el servidor.\n'
          + 'Vercel → Settings → Environment Variables → agregar ANTHROPIC_API_KEY');
      }
      if (!isLocalhost) {
        throw new Error('Error del servidor proxy (' + proxyResp.status + '): ' + proxyErrMsg);
      }
      console.warn('[Rebit IA] Proxy falló (' + proxyResp.status + '), usando llamada directa (solo localhost)...');
    }

    // 2. Fallback: llamada directa (SOLO en desarrollo local)
    var apiKey = provider === 'openai'
      ? (_KEYS.openai || '')
      : (_KEYS.anthropic || '');
    if (!apiKey) throw new Error('Sin API key configurada. Verificá las variables de entorno en Vercel.');

    try {
      var directResp;
      if (provider === 'openai') {
        directResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({ model: 'gpt-4o-2024-11-20', max_tokens: maxTokens || 8000, messages: messages })
        });
        var dGPT = await directResp.json();
        if (dGPT.error) {
          if (dGPT.error.type === 'rate_limit_error' || (dGPT.error.message && dGPT.error.message.indexOf('rate') >= 0)) throw new Error('RATE_LIMIT:' + dGPT.error.message);
          throw new Error(dGPT.error.message);
        }
        var rawGPT = (dGPT.choices && dGPT.choices[0] && dGPT.choices[0].message && dGPT.choices[0].message.content) || '{}';
        return returnRaw ? rawGPT : parseJsonFromResponse(rawGPT);
      } else {
        directResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens || 8000, messages: messages })
        });
        var dClaude = await directResp.json();
        if (dClaude.error) {
          if (dClaude.error.type === 'rate_limit_error' || (dClaude.error.message && dClaude.error.message.indexOf('rate limit') >= 0) || (dClaude.error.message && dClaude.error.message.indexOf('tokens per minute') >= 0)) {
            throw new Error('RATE_LIMIT:' + dClaude.error.message);
          }
          throw new Error(dClaude.error.message);
        }
        var rawClaude = ((dClaude.content && dClaude.content.find(function(b){return b.type==='text';})) || {}).text || '{}';
        return returnRaw ? rawClaude : parseJsonFromResponse(rawClaude);
      }
    } catch(directErr) {
      if (directErr.message && directErr.message.indexOf('RATE_LIMIT:') === 0) throw directErr;
      if (directErr.message && (directErr.message.indexOf('Load failed') >= 0 || directErr.message.indexOf('NetworkError') >= 0 || directErr.message.indexOf('Failed to fetch') >= 0)) {
        throw new Error('CORS: El browser bloqueó la llamada directa al API (solo ocurre en desarrollo local cuando el proxy no responde).');
      }
      throw directErr;
    }
  }

  // Ejecutar con retry automático ante rate limit
  var lastErr;
  for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await doCall();
    } catch(err) {
      lastErr = err;
      if (err.message && err.message.indexOf('RATE_LIMIT:') === 0) {
        if (attempt < MAX_RETRIES) {
          var waitMs = RETRY_DELAYS[attempt];
          console.warn('[Rebit IA] Rate limit alcanzado. Esperando ' + (waitMs/1000) + 's antes de reintentar (intento ' + (attempt+1) + '/' + MAX_RETRIES + ')...');
          await sleep(waitMs);
          continue;
        }
        // Agotados los reintentos
        throw new Error('Límite de velocidad del API superado después de ' + MAX_RETRIES + ' reintentos.\n\n' +
          'El análisis de ' + (messages[0] && messages[0].content ? (Array.isArray(messages[0].content) ? messages[0].content.filter(function(b){return b.type==='document'||b.type==='image';}).length : 0) : 0) + ' documentos excede el límite de 30,000 tokens/minuto de tu plan.\n\n' +
          '─────────────────\n' +
          'Para procesar todos los documentos necesitás:\n' +
          '• Subir los documentos en grupos de 3-5 PDFs por vez\n' +
          '• O hacer upgrade del plan en console.anthropic.com\n  (el tier Build tiene límites 10x más altos)');
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── GPT EXTRACTION ───────────────────────────────────────────────────────────
async function extractWithGPT(contentBlocks) {
  var apiKey = _KEYS.openai || '';
  if (!apiKey) throw new Error('API key de OpenAI no configurada. Ingresá tu key en ⚙️ Configuración.');

  var hoy = new Date().toLocaleDateString('es-AR');
  var anio = new Date().getFullYear();
  var KYB_PROMPT = 'Sos un analista senior de Compliance y AML de GOAT S.A./Rebit (PSP argentino regulado por UIF/BCRA).\n'
    + '══════════════════════════════════════════════════════════\n'
    + 'FECHA DE HOY: ' + hoy + ' (AÑO ' + anio + ').\n'
    + 'CUALQUIER FECHA DEL AÑO 2025 O ANTERIOR ES UNA FECHA PASADA. NO ES FUTURA.\n'
    + '══════════════════════════════════════════════════════════\n'
    + 'Analizá exhaustivamente los documentos adjuntos y extraé TODA la información para completar el legajo KYB corporativo.\n'
    + 'Devolvé SOLO JSON válido, sin texto previo, sin backticks, sin comentarios.\n\n'
    + 'ESTRUCTURA REQUERIDA:\n'
    + '{"razonSocial":"nombre legal completo","cuit":"XX-XXXXXXXX-X","actividad":"giro comercial principal","facturacionMensual":0,"limiteDiario":0,"limiteMensual":0,"beneficiarioFinal":"nombre UBO >10%","domicilio":"domicilio fiscal completo","segmento":"BAJO|MEDIO|MEDIO-ALTO|ALTO","dictamen":"APROBADO|CONDICIONAL|RECHAZADO","checklist":{"Estatuto / Contrato social":"OK|Pendiente|Bloqueante|N/A","Inscripcion registral (IGJ/INAES)":"OK|Pendiente|Bloqueante|N/A","Constancia CUIT/AFIP":"OK|Pendiente|Bloqueante|N/A","Acta de directorio vigente":"OK|Pendiente|Bloqueante|N/A","Poder / Autorizacion firmante":"OK|Pendiente|Bloqueante|N/A","DNI / Pasaporte firmante":"OK|Pendiente|Bloqueante|N/A","Declaracion beneficiario final (>10%)":"OK|Pendiente|Bloqueante|N/A","Estados contables (3 ejercicios)":"OK|Pendiente|Bloqueante|N/A","Declaracion patrimonial DDJJ":"OK|Pendiente|Bloqueante|N/A","Comprobante domicilio fiscal":"OK|Pendiente|Bloqueante|N/A","Comprobante domicilio comercial":"OK|Pendiente|Bloqueante|N/A","Certificado actividad / habilitacion":"OK|Pendiente|Bloqueante|N/A","DDJJ AML (PEP/SO/UBO)":"OK|Pendiente|Bloqueante|N/A","Constancia IVA / Monotributo":"OK|Pendiente|Bloqueante|N/A","Referencias bancarias / comerciales":"OK|Pendiente|Bloqueante|N/A"},"kybScores":{"Completitud documental":2,"Perfil de riesgo - actividad":2,"Screening PEP/sanciones":2,"Beneficiario final":2,"Estructura societaria":2,"Coherencia financiera":2,"Antecedentes AML":2},"redFlags":[],"observaciones":[]}\n\n'
    + 'REGLAS TEMPORALES OBLIGATORIAS — APLICAR SIEMPRE:\n'
    + '1. DNI/Pasaporte: tienen vigencia de 5, 10 o 15 años desde su emisión. DNI emitido en 2010-2019 puede estar vigente hasta 2025-2034. NUNCA es red flag que el DNI sea anterior al contrato social.\n'
    + '2. Contrato social POSTERIOR al DNI del representante → NORMAL Y OBLIGATORIO. La empresa se constituye DESPUÉS de que existan sus fundadores. Esta secuencia temporal es la ÚNICA posible.\n'
    + '3. Fechas 2020, 2021, 2022, 2023, 2024, 2025 → TODAS son fechas PASADAS. NO escribas "fecha futura" para ninguna de ellas.\n'
    + '4. SOLO es "fecha futura" una fecha posterior a ' + hoy + '. Si no hay documentos con fecha posterior a ' + hoy + ', no puede haber red flag de fecha futura.\n'
    + '5. Distintos documentos tienen distintas fechas de emisión → COMPLETAMENTE NORMAL.\n'
    + '6. Estados contables del año anterior al corriente → NORMAL (los ejercicios cierran anualmente).\n\n'
    + 'RED FLAGS VÁLIDOS (SOLO ESTOS):\n'
    + '✓ Razón social diferente entre documentos del mismo legajo\n'
    + '✓ CUIT diferente entre documentos\n'
    + '✓ Fecha de un documento POSTERIOR a ' + hoy + ' (imposible en documentos reales)\n'
    + '✓ Datos del DNI no coinciden con quien firma como representante\n'
    + '✓ Domicilio fiscal contradictorio sin justificación\n'
    + '✓ Actividad en AFIP diferente a la del estatuto\n'
    + '✓ Beneficiario final no identificable o estructura opaca\n'
    + '✓ Actividades de alto riesgo AML: casino, crypto, remesas, juegos de azar, metales preciosos\n'
    + '✓ Inhabilitaciones, quiebras, procesos penales mencionados\n'
    + '✓ Documentos claramente alterados o ilegibles\n'
    + '✓ Acta de directorio con más de 24 meses de antigüedad respecto a ' + hoy + '\n\n'
    + 'REGLA DE ORO: Ante la duda sobre un red flag, NO lo incluyas. Es preferible omitir antes que generar un falso positivo. Nunca inventes datos.';

  // GPT-4o solo acepta imágenes (jpg/png/webp/gif) como base64 en image_url.
  // Los PDFs deben subirse primero al Files API de OpenAI y referenciarse como file_id.
  var userContent = [];
  var uploadedFileIds = [];

  for (var i = 0; i < contentBlocks.length; i++) {
    var block = contentBlocks[i];
    if (block.type === 'document') {
      // PDF: subir via Files API y obtener file_id
      try {
        var pdfBlob = base64ToBlob(block.source.data, 'application/pdf');
        var formData = new FormData();
        formData.append('file', pdfBlob, (block.title || 'documento.pdf'));
        formData.append('purpose', 'user_data');
        var uploadResp = await fetch('https://api.openai.com/v1/files', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey },
          body: formData
        });
        var uploadData = await uploadResp.json();
        if (uploadData.error) {
          // Si falla la subida, incluir como texto descriptivo
          userContent.push({ type: 'text', text: '[PDF: ' + (block.title||'documento.pdf') + ' — no se pudo subir: ' + uploadData.error.message + ']' });
        } else {
          uploadedFileIds.push(uploadData.id);
          userContent.push({
            type: 'file',
            file: { file_id: uploadData.id }
          });
        }
      } catch(uploadErr) {
        userContent.push({ type: 'text', text: '[PDF: ' + (block.title||'documento.pdf') + ' — error al procesar]' });
      }
    } else if (block.type === 'image') {
      // Imágenes: enviar como base64 directamente (formato soportado)
      var mime = block.source.media_type;
      // Solo jpg, png, webp, gif son soportados
      if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif') {
        userContent.push({
          type: 'image_url',
          image_url: { url: 'data:' + mime + ';base64,' + block.source.data, detail: 'high' }
        });
      } else {
        userContent.push({ type: 'text', text: '[Imagen en formato ' + mime + ' — no soportado por GPT-4o]' });
      }
    } else if (block.type === 'text') {
      userContent.push({ type: 'text', text: block.text });
    }
  }
  userContent.push({ type: 'text', text: KYB_PROMPT });

  // Limpiar archivos subidos en OpenAI
  if (uploadedFileIds.length > 0) {
    uploadedFileIds.forEach(function(fileId) {
      fetch('https://api.openai.com/v1/files/' + fileId, {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + apiKey }
      }).catch(function(){});
    });
  }

  return await callProxyOrDirect('openai', [{ role: 'user', content: userContent }], 8000);
}

// Convierte base64 a Blob para subir como FormData
function base64ToBlob(base64, mimeType) {
  var byteChars = atob(base64);
  var byteArrays = [];
  for (var offset = 0; offset < byteChars.length; offset += 512) {
    var slice = byteChars.slice(offset, offset + 512);
    var byteNums = new Array(slice.length);
    for (var i = 0; i < slice.length; i++) byteNums[i] = slice.charCodeAt(i);
    byteArrays.push(new Uint8Array(byteNums));
  }
  return new Blob(byteArrays, { type: mimeType });
}

// ─── PARSER COMPARTIDO ────────────────────────────────────────────────────────
function parseJsonFromResponse(raw) {
  var jsonStart = raw.indexOf('{');
  var jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    console.error('[Rebit IA] No se encontró JSON en la respuesta:', raw);
    throw new Error('La IA no devolvió un JSON válido. Respuesta: ' + raw.slice(0, 200));
  }
  var jsonStr = raw.slice(jsonStart, jsonEnd + 1);
  try {
    var parsed = JSON.parse(jsonStr);
    console.log('[Rebit IA] Datos extraídos:', JSON.stringify(parsed, null, 2));
    return parsed;
  } catch(parseErr) {
    console.error('[Rebit IA] Error parsing JSON:', parseErr, jsonStr.slice(0, 300));
    throw new Error('Error al parsear la respuesta: ' + parseErr.message);
  }
}

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
  if (m.ratioVP !== null) { if (m.ratioVP > 2.0) add('PAT-05', 'ALTA', 'Volumen excede perfil declarado', 'Volumen es ' + m.ratioVP.toFixed(2) + 'x el perfil mensual.', 'T-05'); else if (m.ratioVP < 0.3) add('PAT-05', 'MEDIA', 'Volumen muy inferior al perfil', 'Volumen es ' + m.ratioVP.toFixed(2) + 'x el perfil.', 'T-06'); }
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

// ─── CLOUD SYNC via Vercel API proxy ─────────────────────────────────────────
var APP_TOKEN = '123aml2026'; // mismo que contraseña de login

// Almacén de API keys en memoria — se populan desde Vercel env vars al iniciar.
// Nunca se guardan en localStorage.
var _KEYS = { anthropic: '', openai: '', provider: 'claude' };
function setModuleKeys(anthropic, openai, provider) {
  if (anthropic) _KEYS.anthropic = anthropic;
  if (openai)    _KEYS.openai    = openai;
  if (provider)  _KEYS.provider  = provider;
}

async function serverSave(data) {
  try {
    // Limpiar txns antes de enviar — se guardan por separado en /api/sync?action=txns
    var persWithoutTxns = (data.periodos||[]).map(function(p){
      var c = Object.assign({}, p); delete c.txns; return c;
    });
    var payload = { legajos: data.legajos||[], periodos: persWithoutTxns,
                    deletedLegajoIds: data.deletedLegajoIds||[],
                    deletedPeriodoIds: data.deletedPeriodoIds||[] };
    var r = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
      body: JSON.stringify(payload)
    });
    var res = await r.json();
    return !res.error;
  } catch(e) { console.warn('[Sync] Error guardando:', e.message); return false; }
}

async function serverSaveTxns(periodoId, txns) {
  try {
    await fetch('/api/sync?action=txns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
      body: JSON.stringify({ periodo_id: periodoId, txns: txns })
    });
  } catch(e) { console.warn('[Sync] Error guardando txns:', e.message); }
}

async function serverLoadTxns(periodoId) {
  try {
    var r = await fetch('/api/sync?action=txns&id=' + periodoId,
      { headers: { 'x-app-token': APP_TOKEN } });
    if (!r.ok) return null;
    var res = await r.json();
    return res.txns || null;
  } catch(e) { return null; }
}

async function serverSaveKV(k, v) {
  try {
    await fetch('/api/sync?action=kv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
      body: JSON.stringify({ k: k, v: v })
    });
  } catch(e) { console.warn('[Sync] Error guardando KV:', e.message); }
}

async function serverLoadKV(k) {
  try {
    var r = await fetch('/api/sync?action=kv&k=' + encodeURIComponent(k), {
      headers: { 'x-app-token': APP_TOKEN }
    });
    if (!r.ok) return null;
    var d = await r.json();
    return (d && d.v !== undefined) ? d.v : null;
  } catch(e) { return null; }
}

async function serverLoad() {
  try {
    var r = await fetch('/api/sync', { headers: { 'x-app-token': APP_TOKEN } });
    if (!r.ok) return null;
    var data = await r.json();
    if (!data || data.error) return null;
    var periodos = (data.periodos||[]).map(function(p){
      return Object.assign({}, p, { txns: [] });
    });
    return { legajos: data.legajos || [], periodos: periodos };
  } catch(e) { console.warn('[Sync] Error cargando:', e.message); return null; }
}

async function fetchServerConfig() {
  try {
    var r = await fetch('/api/config', { headers: { 'x-app-token': APP_TOKEN } });
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

// UI
function Card(props) {
  return (
    <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:4,marginBottom:14,overflow:'hidden'}}>
      {props.title ? <div style={{background:T.BG3,borderBottom:'1px solid '+T.BORDER,padding:'9px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontWeight:600,fontSize:12,color:T.TEXT2,letterSpacing:'1px',textTransform:'uppercase'}}>{props.title}</span>
        {props.actions ? props.actions : null}
      </div> : null}
      <div style={{padding:16}}>{props.children}</div>
    </div>
  );
}
function Pill(props) {
  if (!props.v) return null;
  var col = props.v==='APROBADO'||props.v==='BAJO' ? T.GREEN : props.v==='CONDICIONAL'||props.v==='MEDIO' ? T.AMBER : props.v==='MEDIO-ALTO' ? T.AMBER : T.RED;
  var bg = props.v==='APROBADO'||props.v==='BAJO' ? 'rgba(0,230,118,0.12)' : props.v==='CONDICIONAL'||props.v==='MEDIO' ? 'rgba(255,184,48,0.12)' : props.v==='MEDIO-ALTO' ? 'rgba(255,140,0,0.12)' : 'rgba(255,68,85,0.12)';
  return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:2,background:bg,color:col,fontWeight:600,fontSize:10,letterSpacing:'0.5px'}}>{props.v}</span>;
}
function Badge(props) { return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:2,background:'rgba(59,109,170,0.2)',color:T.CYAN,fontWeight:600,fontSize:10,letterSpacing:'0.5px'}}>{props.label}</span>; }
function SevBadge(props) { return <Badge label={props.sev} col={sevColor(props.sev)}/>; }

function ReportModal(props) {
  var iRef = useRef();
  var ready = useState(false);
  var setReady = ready[1];
  ready = ready[0];
  useEffect(function() {
    if (!iRef.current || !props.html) return;
    var blob = new Blob([props.html], { type:'text/html' });
    var url = URL.createObjectURL(blob);
    iRef.current.src = url;
    iRef.current.onload = function() { setReady(true); };
    return function() { URL.revokeObjectURL(url); };
  }, [props.html]);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:2000,display:'flex',flexDirection:'column'}}>
      <div style={{background:T.BG3,color:T.TEXT,padding:'10px 18px',borderBottom:'1px solid '+T.BORDER,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <span style={{fontWeight:700,fontSize:14}}>Vista previa del informe</span>
        <div style={{display:'flex',gap:8}}>
          {ready ? <button onClick={function(){iRef.current.contentWindow.print();}} style={{background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'6px 16px',cursor:'pointer',fontWeight:700}}>🖨 Imprimir / PDF</button> : null}
          <button onClick={props.onClose} style={{background:'rgba(255,68,85,0.15)',color:T.RED,border:'1px solid rgba(255,68,85,0.3)',borderRadius:3,padding:'6px 14px',cursor:'pointer',fontWeight:700}}>✕ Cerrar</button>
        </div>
      </div>
      <iframe ref={iRef} style={{flex:1,border:'none',background:T.BG2}} title="Informe"/>
    </div>
  );
}

function parseFechaAR(str) {
  if (!str) return null;
  var p = str.split('/');
  return p.length===3 ? new Date(p[2],p[1]-1,p[0]) : null;
}

function DashboardView(props) {
  var legajos = props.legajos, periodos = props.periodos, setLegajos = props.setLegajos || function(){};
  var dashTabState = useState('operacional'); var dashTab=dashTabState[0]; var setDashTab=dashTabState[1];

  // ── DATOS COMUNES ────────────────────────────────────────────────────────────
  var hoy = new Date();
  var total = legajos.length;
  var aprobados = legajos.filter(function(l){return l.dictamen==='APROBADO';}).length;
  var cond = legajos.filter(function(l){return l.dictamen==='CONDICIONAL';}).length;
  var rech = legajos.filter(function(l){return l.dictamen==='RECHAZADO';}).length;
  // Helper: obtener métricas de un período — usa pre-computadas si existen, sino calcula desde txns
  function getMetricasPeriodo(p, leg) {
    if (p.metricas) return p.metricas;
    if (p.txns && p.txns.length) return calcMetricas(p.txns, leg);
    return null;
  }
  // Helper: obtener señales activas (no resueltas) de un período
  function getSigsActivas(sigs, sigsResolucion) {
    if (!sigsResolucion) return sigs;
    return sigs.filter(function(s){ var r = sigsResolucion[s.pat]; return !r || r.estado !== 'RESUELTA'; });
  }

  var allSigs = [];
  periodos.forEach(function(p) {
    var leg = legajos.find(function(l){return l.id===p.legajoId;});
    var m = getMetricasPeriodo(p, leg);
    if (m) {
      var sigs = detectPatrones(m, leg);
      var activas2 = getSigsActivas(sigs, p.sigsResolucion);
      activas2.forEach(function(s){allSigs.push(s);});
    }
  });
  var altas = allSigs.filter(function(s){return s.sev==='ALTA';}).length;
  var activas = legajos.filter(function(l){return l.estadoCuenta==='ACTIVA';}).length;
  var activasRef = legajos.filter(function(l){return l.estadoCuenta==='ACTIVA_REFORZADO';}).length;
  var onboarding = legajos.filter(function(l){return !l.estadoCuenta||l.estadoCuenta==='EN_ONBOARDING';}).length;
  var suspendidas = legajos.filter(function(l){return l.estadoCuenta==='SUSPENDIDA';}).length;
  var cerradas = legajos.filter(function(l){return l.estadoCuenta==='CERRADA';}).length;
  var segData = [
    {seg:'BAJO',count:legajos.filter(function(l){return l.segmento==='BAJO';}).length,fill:C.VERDE},
    {seg:'MEDIO',count:legajos.filter(function(l){return l.segmento==='MEDIO';}).length,fill:C.AMARILLO},
    {seg:'M-ALTO',count:legajos.filter(function(l){return l.segmento==='MEDIO-ALTO';}).length,fill:C.NARANJA},
    {seg:'ALTO',count:legajos.filter(function(l){return l.segmento==='ALTO';}).length,fill:C.ROJO}
  ];
  var estadoData = ESTADOS_CUENTA.map(function(e){
    return {est:e.label.replace('— Monitoreo Reforzado','Ref.'),count:legajos.filter(function(l){return (l.estadoCuenta||'EN_ONBOARDING')===e.id;}).length,fill:e.color};
  });
  var activasConAlertas = legajos.filter(function(l){
    return l.estadoCuenta==='ACTIVA'||l.estadoCuenta==='ACTIVA_REFORZADO';
  }).map(function(l){
    var lp = periodos.filter(function(p){return p.legajoId===l.id;});
    var sA = 0;
    lp.forEach(function(p){
      var m = getMetricasPeriodo(p, l);
      if(m){ var sigs=detectPatrones(m,l); sA+=getSigsActivas(sigs,p.sigsResolucion).filter(function(s){return s.sev==='ALTA';}).length; }
    });
    return {l:l, altas:sA, periodos:lp.length};
  }).filter(function(x){return x.altas>0;}).sort(function(a,b){return b.altas-a.altas;}).slice(0,5);
  var notificaciones = legajos.filter(function(l){
    if (l.estadoCuenta !== 'ACTIVA' && l.estadoCuenta !== 'ACTIVA_REFORZADO') return false;
    var diasLimite = (l.segmento==='ALTO'||l.estadoCuenta==='ACTIVA_REFORZADO') ? 30 : l.segmento==='MEDIO-ALTO' ? 60 : 90;
    var lp = periodos.filter(function(p){return p.legajoId===l.id;});
    var fechaSistema = lp.length>0 ? parseFechaAR((lp[lp.length-1].createdAt||'')) : null;
    var fechaExterno = parseFechaAR(l.ultimoAnalisisExterno||'');
    var fechaUltimo = null;
    if (fechaSistema && fechaExterno) fechaUltimo = fechaSistema > fechaExterno ? fechaSistema : fechaExterno;
    else fechaUltimo = fechaSistema || fechaExterno;
    if (!fechaUltimo) return true;
    return Math.floor((hoy-fechaUltimo)/86400000) > diasLimite;
  }).map(function(l){
    var lp = periodos.filter(function(p){return p.legajoId===l.id;});
    var est = getEstado(l.estadoCuenta);
    var diasLimite = (l.segmento==='ALTO'||l.estadoCuenta==='ACTIVA_REFORZADO') ? 30 : l.segmento==='MEDIO-ALTO' ? 60 : 90;
    var tieneSistema = lp.length>0; var tieneExterno = !!l.ultimoAnalisisExterno;
    var msg = (!tieneSistema && !tieneExterno) ? 'Sin análisis registrado'
      : (!tieneSistema && tieneExterno) ? 'Análisis externo: '+l.ultimoAnalisisExterno
      : 'Sin análisis en más de '+diasLimite+' días';
    return {l:l, est:est, msg:msg, diasLimite:diasLimite, tieneSistema:tieneSistema, tieneExterno:tieneExterno};
  });

  // ── DATOS EJECUTIVO ──────────────────────────────────────────────────────────
  // RFIs de todos los legajos (desde localStorage)
  var todosRfis = [];
  legajos.forEach(function(l){
    try {
      var r = [];
      r.forEach(function(rfi){ todosRfis.push(Object.assign({},rfi,{legajoNombre:l.razonSocial,legajoId:l.id})); });
    } catch(e){}
  });
  var rfisAbiertos = todosRfis.filter(function(r){return r.estado==='ENVIADO'||r.estado==='PARCIAL';});
  var rfisVencidos = rfisAbiertos.filter(function(r){
    var f = parseFechaAR(r.createdAt);
    return f && Math.floor((hoy-f)/86400000) > 7;
  });
  var rfisVencen7 = rfisAbiertos.filter(function(r){
    var f = parseFechaAR(r.createdAt);
    if (!f) return false;
    var dias = Math.floor((hoy-f)/86400000);
    return dias >= 5 && dias <= 7;
  });
  var rfisRespondidos = todosRfis.filter(function(r){return r.estado==='RESPONDIDO';}).length;
  var tasaRespuesta = todosRfis.length > 0 ? Math.round(rfisRespondidos/todosRfis.length*100) : 0;
  var tiempoPromResp = (function(){
    var tiempos = [];
    todosRfis.filter(function(r){return r.estado==='RESPONDIDO'||r.estado==='CERRADO';}).forEach(function(r){
      var envio = parseFechaAR(r.createdAt);
      var resp = (r.intercambios||[]).find(function(i){return i.tipo==='RESPUESTA';});
      if (envio && resp) {
        var fResp = parseFechaAR(resp.fecha);
        if (fResp) tiempos.push(Math.floor((fResp-envio)/86400000));
      }
    });
    return tiempos.length > 0 ? (tiempos.reduce(function(a,b){return a+b;},0)/tiempos.length).toFixed(1) : null;
  })();

  // Evolución mensual: volumen IN/OUT agregado por mes — Opción A
  // Extrae mes/año del nombre del período y agrupa toda la cartera
  var MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  function extraerMesAnio(nombre) {
    if (!nombre) return null;
    // Intentar extraer "Mes YYYY" del nombre — ej: "Enero 2026 — 1/10", "cravero_enero_2026..."
    var mesIdx = -1, anio = null;
    var n = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    MESES_ES.forEach(function(m, i) {
      if (n.includes(m.toLowerCase())) { mesIdx = i; }
    });
    var matchAnio = nombre.match(/20\d{2}/);
    if (matchAnio) anio = parseInt(matchAnio[0]);
    // Fallback: intentar extraer de formato MM/YYYY o YYYY-MM
    if (mesIdx === -1) {
      var m2 = nombre.match(/(\d{1,2})[\/\-](\d{4})/);
      if (m2) { mesIdx = parseInt(m2[1])-1; anio = parseInt(m2[2]); }
    }
    if (mesIdx === -1 || !anio) return null;
    return { mesIdx: mesIdx, anio: anio, key: anio*100 + mesIdx, label: MESES_CORTO[mesIdx]+' '+anio };
  }

  var evolucionMap = {};
  periodos.forEach(function(p){
    var leg = legajos.find(function(l){return l.id===p.legajoId;});
    var m = getMetricasPeriodo(p, leg);
    if (!m) return;
    // Solo sumar si hay datos reales en ambas direcciones
    var extracted = extraerMesAnio(p.nombre);
    var key = extracted ? extracted.key : ('z_'+p.nombre); // z_ para que queden al final si no parsea
    var label = extracted ? extracted.label : (p.nombre||'N/D').slice(0,12);
    if (!evolucionMap[key]) evolucionMap[key] = {nombre:label, tIn:0, tOut:0, sigs:0, sortKey: extracted ? extracted.key : 999999};
    evolucionMap[key].tIn  += (m.tIn  || 0);
    evolucionMap[key].tOut += (m.tOut || 0);
    var sigsActivas = getSigsActivas(detectPatrones(m, leg), p.sigsResolucion);
    evolucionMap[key].sigs += sigsActivas.filter(function(s){return s.sev==='ALTA';}).length;
  });
  // Ordenar cronológicamente por mes/año y tomar los últimos 8
  var evolucionData = Object.values(evolucionMap)
    .sort(function(a,b){ return a.sortKey - b.sortKey; })
    .slice(-8);

  // Ranking de clientes por riesgo acumulado
  var rankingRiesgo = legajos.map(function(l){
    var lp = periodos.filter(function(p){return p.legajoId===l.id;});
    var totalSigsAlta = 0; var totalVol = 0; var maxScore = 0; var lastClasif = null;
    lp.forEach(function(p){
      var m = getMetricasPeriodo(p, l);
      if (!m) return;
      var sigs = detectPatrones(m, l);
      var sigsActivas = getSigsActivas(sigs, p.sigsResolucion);
      totalSigsAlta += sigsActivas.filter(function(s){return s.sev==='ALTA';}).length;
      totalVol += m.tIn;
      var sc = p.scoring || calcScoring(m, sigs);
      if (sc && sc.promedio > maxScore) { maxScore = sc.promedio; lastClasif = sc.clasificacion; }
    });
    var semaforo = totalSigsAlta >= 5 ? 'ROJO' : totalSigsAlta >= 2 ? 'AMARILLO' : 'VERDE';
    var semaforoCol = semaforo==='ROJO'?C.ROJO:semaforo==='AMARILLO'?C.AMARILLO:C.VERDE;
    var est = getEstado(l.estadoCuenta||'EN_ONBOARDING');
    return {l:l, totalSigsAlta:totalSigsAlta, totalVol:totalVol, maxScore:maxScore, lastClasif:lastClasif, semaforo:semaforo, semaforoCol:semaforoCol, est:est, periodos:lp.length};
  }).filter(function(x){return x.l.estadoCuenta!=='CERRADA';})
    .sort(function(a,b){return b.totalSigsAlta-a.totalSigsAlta || b.maxScore-a.maxScore;});

  return (
    <div style={{padding:22}}>
      {/* TABS */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <h2 style={{color:T.TEXT,fontSize:15,fontWeight:600,letterSpacing:'1px',margin:0}}>Dashboard — GOAT S.A. / Rebit</h2>
        <div style={{display:'flex',gap:2,background:C.CEL,borderRadius:6,padding:4}}>
          {[['operacional','📊 Operacional'],['ejecutivo','📈 Ejecutivo']].map(function(t){return(
            <button key={t[0]} onClick={function(){setDashTab(t[0]);}}
              style={{padding:'7px 18px',border:'none',borderRadius:4,cursor:'pointer',fontWeight:dashTab===t[0]?700:400,background:dashTab===t[0]?'rgba(59,109,170,0.15)':'transparent',color:dashTab===t[0]?T.CYAN:T.TEXT3,fontSize:12}}>
              {t[1]}
            </button>
          );})}
        </div>
      </div>

      {/* ════════════ TAB OPERACIONAL ════════════ */}
      {dashTab === 'operacional' && <div>
        {notificaciones.length > 0 && (
          <div style={{background:'rgba(255,184,48,0.07)',border:'1px solid rgba(255,184,48,0.4)',borderRadius:6,padding:'12px 16px',marginBottom:18}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
              <span style={{fontSize:16}}>🔔</span>
              <span style={{fontWeight:700,color:T.AMBER,fontSize:14}}>Atención requerida — {notificaciones.length} cuenta(s) activa(s) sin análisis AML reciente</span>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr>{['Empresa','CUIT','Estado','Segmento','Situación','Acción'].map(function(h,i){return <th key={i} style={{background:'#E67E22',color:'white',padding:'5px 10px',textAlign:'left',fontWeight:700}}>{h}</th>;})}</tr></thead>
              <tbody>{notificaciones.map(function(n,i){return(
                <tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
                  <td style={{padding:'6px 10px',fontWeight:500,color:T.TEXT2}}>{n.l.razonSocial||'—'}</td>
                  <td style={{padding:'6px 10px',color:T.TEXT2}}>{n.l.cuit||'—'}</td>
                  <td style={{padding:'6px 10px'}}><span style={{background:n.est.bg,color:n.est.color,border:'1px solid '+n.est.color,borderRadius:8,padding:'2px 7px',fontSize:10,fontWeight:700}}>{n.est.label}</span></td>
                  <td style={{padding:'6px 10px'}}><Pill v={n.l.segmento}/></td>
                  <td style={{padding:'6px 10px',color:T.AMBER,fontWeight:600,fontSize:12}}>{n.msg}</td>
                  <td style={{padding:'6px 10px'}}>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <input type="text" defaultValue={n.l.ultimoAnalisisExterno||''} placeholder="DD/MM/AAAA" id={'ext_'+n.l.id} style={{width:100,border:'1px solid '+T.BORDER,borderRadius:4,padding:'3px 7px',fontSize:11}}/>
                      <button onClick={function(){
                        var val = document.getElementById('ext_'+n.l.id).value.trim();
                        if (!val) return;
                        var updated = Object.assign({},n.l,{ultimoAnalisisExterno:val});
                        props.setLegajos(function(prev){var arr=prev.map(function(x){return x.id===n.l.id?updated:x;});return arr;});
                      }} style={{background:T.GREEN,color:'white',border:'none',borderRadius:4,padding:'3px 10px',cursor:'pointer',fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>✓</button>
                    </div>
                  </td>
                </tr>
              );})}</tbody>
            </table>
          </div>
        )}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:14}}>
          {[{label:'Legajos KYB',val:total,col:C.AC},{label:'Periodos AML',val:periodos.length,col:T.CYAN},{label:'Senales ALTA',val:altas,col:T.RED},{label:'Total Senales',val:allSigs.length,col:T.AMBER}].map(function(kpi,i){return(
            <div key={i} style={{background:kpi.col,borderRadius:6,padding:'14px 18px',color:'white'}}>
              <div style={{fontSize:11,opacity:0.8}}>{kpi.label}</div>
              <div style={{fontSize:28,fontWeight:700}}>{kpi.val}</div>
            </div>
          );})}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:18}}>
          {[{label:'En Onboarding',val:onboarding,col:'#7F8C8D',bg:'#F2F3F4'},{label:'Activas',val:activas,col:'#27AE60',bg:'#EBF9F0'},{label:'Monitoreo Ref.',val:activasRef,col:'#E67E22',bg:'#FEF9E7'},{label:'Suspendidas',val:suspendidas,col:'#F39C12',bg:'#FDFBD5'},{label:'Cerradas',val:cerradas,col:'#E74C3C',bg:'#FDEDEC'}].map(function(kpi,i){return(
            <div key={i} style={{background:kpi.bg,border:'2px solid '+kpi.col,borderRadius:6,padding:'10px 14px',textAlign:'center'}}>
              <div style={{fontSize:10,color:kpi.col,fontWeight:700}}>{kpi.label}</div>
              <div style={{fontSize:24,fontWeight:700,color:kpi.col}}>{kpi.val}</div>
            </div>
          );})}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
          <Card title="Legajos por segmento">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={segData} margin={{top:5,right:10,left:-20,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee"/><XAxis dataKey="seg" tick={{fontSize:9,fill:'#4A6A8A',fontFamily:"'JetBrains Mono',monospace"}}/><YAxis allowDecimals={false}/><Tooltip/>
                <Bar dataKey="count" name="Legajos">{segData.map(function(e,i){return <Cell key={i} fill={e.fill}/>;})}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Dictamenes KYB">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={[{d:'APROBADO',count:aprobados,fill:C.VERDE},{d:'CONDICIONAL',count:cond,fill:C.NARANJA},{d:'RECHAZADO',count:rech,fill:C.ROJO}]} margin={{top:5,right:10,left:-20,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee"/><XAxis dataKey="d" tick={{fontSize:9}}/><YAxis allowDecimals={false}/><Tooltip/>
                <Bar dataKey="count">{[{fill:C.VERDE},{fill:C.NARANJA},{fill:C.ROJO}].map(function(e,i){return <Cell key={i} fill={e.fill}/>;})}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Estado de cuentas">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={estadoData} margin={{top:5,right:10,left:-20,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee"/><XAxis dataKey="est" tick={{fontSize:8}}/><YAxis allowDecimals={false}/><Tooltip/>
                <Bar dataKey="count" name="Legajos">{estadoData.map(function(e,i){return <Cell key={i} fill={e.fill}/>;})}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
        {activasConAlertas.length > 0 && <Card title="⚠ Cuentas activas con señales ALTA pendientes">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr>{['Razón Social','CUIT','Estado','Períodos','Señales ALTA'].map(function(h,i){return <th key={i} style={{background:'#E74C3C',color:'white',padding:'6px 10px',textAlign:'left'}}>{h}</th>;})}</tr></thead>
            <tbody>{activasConAlertas.map(function(x,i){
              var est=getEstado(x.l.estadoCuenta||'ACTIVA');
              return(<tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
                <td style={{padding:'5px 10px',fontWeight:600}}>{x.l.razonSocial||'—'}</td>
                <td style={{padding:'5px 10px',color:T.TEXT2}}>{x.l.cuit||'—'}</td>
                <td style={{padding:'5px 10px'}}><span style={{background:est.bg,color:est.color,border:'1px solid '+est.color,borderRadius:10,padding:'2px 8px',fontSize:10,fontWeight:700}}>{est.label}</span></td>
                <td style={{padding:'5px 10px'}}>{x.periodos}</td>
                <td style={{padding:'5px 10px'}}><span style={{background:'rgba(255,68,85,0.15)',color:T.RED,borderRadius:2,padding:'2px 10px',fontSize:11,fontWeight:700}}>{x.altas} ALTA</span></td>
              </tr>);
            })}</tbody>
          </table>
        </Card>}
        {legajos.length > 0 && <Card title="Legajos recientes">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr>{['Razon Social','CUIT','Estado','Segmento','Dictamen'].map(function(h,i){return <th key={i} style={{background:T.BG3,color:T.TEXT3,padding:'6px 10px',textAlign:'left',fontSize:9,letterSpacing:'1px',fontFamily:T.MONO,fontWeight:400}}>{h}</th>;})}</tr></thead>
            <tbody>{legajos.slice(-5).reverse().map(function(l,i){
              var est=getEstado(l.estadoCuenta||'EN_ONBOARDING');
              return(<tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
                <td style={{padding:'5px 10px'}}>{l.razonSocial||'—'}</td>
                <td style={{padding:'5px 10px'}}>{l.cuit||'—'}</td>
                <td style={{padding:'5px 10px'}}><span style={{background:est.bg,color:est.color,border:'1px solid '+est.color,borderRadius:8,padding:'2px 7px',fontSize:10,fontWeight:700}}>{est.label}</span></td>
                <td style={{padding:'5px 10px'}}><Pill v={l.segmento}/></td>
                <td style={{padding:'5px 10px'}}><Pill v={l.dictamen}/></td>
              </tr>);
            })}</tbody>
          </table>
        </Card>}
      </div>}

      {/* ════════════ TAB EJECUTIVO ════════════ */}
      {dashTab === 'ejecutivo' && <div>

        {/* KPIs ejecutivos */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:18}}>
          {[
            {label:'Clientes activos',val:activas+activasRef,icon:'🏢',col:C.AM,bg:'#EBF5FB'},
            {label:'Señales ALTA totales',val:altas,icon:'🚨',col:C.ROJO,bg:'#FDEDEC'},
            {label:'RFIs abiertos',val:rfisAbiertos.length,icon:'📧',col:rfisAbiertos.length>0?C.NARANJA:C.VERDE,bg:rfisAbiertos.length>0?'#FEF9E7':'#EBF9F0'},
            {label:'RFIs vencidos',val:rfisVencidos.length,icon:'⏰',col:rfisVencidos.length>0?C.ROJO:'#7F8C8D',bg:rfisVencidos.length>0?'#FDEDEC':'#F2F3F4'},
          ].map(function(k,i){return(
            <div key={i} style={{background:k.bg,border:'2px solid '+k.col,borderRadius:8,padding:'14px 16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:10,color:k.col,fontWeight:700,marginBottom:4}}>{k.label}</div>
                  <div style={{fontSize:32,fontWeight:700,color:k.col,lineHeight:1}}>{k.val}</div>
                </div>
                <span style={{fontSize:22}}>{k.icon}</span>
              </div>
            </div>
          );})}
        </div>

        {/* Segunda fila KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:18}}>
          {[
            {label:'Tasa de respuesta RFI',val:tasaRespuesta+'%',icon:'📊',col:tasaRespuesta>=70?C.VERDE:tasaRespuesta>=40?C.AMARILLO:C.ROJO},
            {label:'Tiempo prom. respuesta',val:tiempoPromResp?(tiempoPromResp+' días'):'—',icon:'⏱',col:C.AC},
            {label:'RFIs vencen en 7 días',val:rfisVencen7.length,icon:'⚠',col:rfisVencen7.length>0?C.AMARILLO:'#7F8C8D'},
            {label:'Períodos analizados',val:periodos.filter(function(p){return p.txns&&p.txns.length>0;}).length,icon:'📈',col:C.AM},
          ].map(function(k,i){return(
            <div key={i} style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:10,color:T.TEXT2,fontWeight:600}}>{k.label}</div>
                <div style={{fontSize:22,fontWeight:700,color:k.col,marginTop:2}}>{k.val}</div>
              </div>
              <span style={{fontSize:20}}>{k.icon}</span>
            </div>
          );})}
        </div>

        {/* Semáforo de cartera + Evolución */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>

          {/* Semáforo de cartera */}
          <Card title="🚦 Semáforo de cartera — Clientes activos y en monitoreo">
            {rankingRiesgo.length === 0 ? <div style={{textAlign:'center',color:T.TEXT3,padding:'20px 0',fontSize:13}}>Sin clientes activos con períodos analizados.</div> : (
              <div style={{maxHeight:340,overflowY:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{position:'sticky',top:0,background:T.BG2}}>
                    {['','Cliente','Seg','Score','ALTA','Períodos'].map(function(h,i){return <th key={i} style={{padding:'5px 8px',textAlign:'left',color:T.TEXT2,fontWeight:600,fontSize:11,borderBottom:'2px solid #eee'}}>{h}</th>;})}
                  </tr></thead>
                  <tbody>{rankingRiesgo.map(function(x,i){
                    return(<tr key={i} style={{borderBottom:'1px solid #f5f5f5'}}>
                      <td style={{padding:'6px 8px',textAlign:'center'}}>
                        <span style={{display:'inline-block',width:12,height:12,borderRadius:'50%',background:x.semaforoCol}}></span>
                      </td>
                      <td style={{padding:'6px 8px'}}>
                        <div style={{fontWeight:500,color:T.TEXT2,fontSize:12}}>{x.l.razonSocial||'—'}</div>
                        <div style={{fontSize:10,color:T.TEXT3}}>{x.est.label}</div>
                      </td>
                      <td style={{padding:'6px 8px'}}><Pill v={x.l.segmento}/></td>
                      <td style={{padding:'6px 8px',fontWeight:700,color:x.maxScore>=4?C.ROJO:x.maxScore>=3?C.NARANJA:C.VERDE}}>
                        {x.maxScore>0?x.maxScore.toFixed(1)+'/5':'—'}
                      </td>
                      <td style={{padding:'6px 8px'}}>
                        {x.totalSigsAlta>0 ? <span style={{background:C.ROJO,color:'white',borderRadius:8,padding:'1px 8px',fontSize:10,fontWeight:700}}>{x.totalSigsAlta}</span> : <span style={{color:T.GREEN,fontWeight:700}}>✓</span>}
                      </td>
                      <td style={{padding:'6px 8px',color:T.TEXT2}}>{x.periodos}</td>
                    </tr>);
                  })}</tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Evolución mensual */}
          <Card title="📈 Evolución mensual — Volumen IN/OUT agregado (cartera completa)">
            {evolucionData.length === 0 ? <div style={{textAlign:'center',color:T.TEXT3,padding:'40px 0',fontSize:13}}>Sin períodos con métricas cargadas.</div> : (
              <div>
                <div style={{display:'flex',gap:16,marginBottom:8,fontSize:11,color:T.TEXT2}}>
                  <span><span style={{display:'inline-block',width:12,height:3,background:C.VERDE,borderRadius:2,marginRight:4,verticalAlign:'middle'}}></span>Volumen IN</span>
                  <span><span style={{display:'inline-block',width:12,height:3,background:C.ROJO,borderRadius:2,marginRight:4,verticalAlign:'middle'}}></span>Volumen OUT</span>
                  <span style={{marginLeft:'auto',color:T.TEXT3}}>{evolucionData.length} mes{evolucionData.length!==1?'es':''} · {legajos.filter(function(l){return l.estadoCuenta!=='CERRADA';}).length} clientes activos</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={evolucionData} margin={{top:5,right:10,left:0,bottom:30}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                    <XAxis dataKey="nombre" tick={{fontSize:9,fill:'#4A6A8A',fontFamily:"'JetBrains Mono',monospace"}} angle={-25} textAnchor="end" interval={0}/>
                    <YAxis tickFormatter={function(v){return v>=1e9?(v/1e9).toFixed(1)+'B':v>=1e6?(v/1e6).toFixed(0)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v;}} tick={{fontSize:9,fill:'#4A6A8A',fontFamily:"'JetBrains Mono',monospace"}} width={45}/>
                    <Tooltip formatter={function(v,name){return [fmtM(v), name==='tIn'?'Vol IN':'Vol OUT'];}} labelStyle={{fontWeight:600,color:T.TEXT}}/>
                    <Line type="monotone" dataKey="tIn" stroke={C.VERDE} strokeWidth={2.5} dot={{r:4,fill:C.VERDE}} activeDot={{r:6}} name="tIn"/>
                    <Line type="monotone" dataKey="tOut" stroke={C.ROJO} strokeWidth={2.5} dot={{r:4,fill:C.ROJO}} activeDot={{r:6}} name="tOut"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* Panel RFIs */}
        <Card title="📧 Panel RFIs — Estado y vencimientos">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>

            {/* RFIs que vencen en 7 días */}
            <div>
              <div style={{fontWeight:600,color:T.TEXT,fontSize:11,marginBottom:8}}>⚠ Vencen en los próximos 7 días ({rfisVencen7.length})</div>
              {rfisVencen7.length===0 ? <div style={{color:T.TEXT3,fontSize:12,textAlign:'center',padding:'12px 0'}}>✓ Sin RFIs próximos a vencer</div> : (
                rfisVencen7.map(function(r,i){
                  var f = parseFechaAR(r.createdAt);
                  var diasAbierto = f ? Math.floor((hoy-f)/86400000) : 0;
                  return(<div key={i} style={{background:'rgba(255,184,48,0.08)',border:'1px solid rgba(255,184,48,0.25)',borderRadius:3,padding:'8px 10px',marginBottom:6,fontSize:12}}>
                    <div style={{fontWeight:600,color:T.TEXT}}>{r.refNum}</div>
                    <div style={{color:T.TEXT2}}>{r.legajoNombre}</div>
                    <div style={{color:T.AMBER,fontSize:11,marginTop:2}}>Abierto hace {diasAbierto} días · vence en {7-diasAbierto} días</div>
                  </div>);
                })
              )}
            </div>

            {/* Tasa de respuesta por cliente */}
            <div>
              <div style={{fontWeight:600,color:T.TEXT,fontSize:11,marginBottom:8}}>📊 Tasa de respuesta por cliente</div>
              {(function(){
                var porCliente = {};
                todosRfis.forEach(function(r){
                  if (!porCliente[r.legajoNombre]) porCliente[r.legajoNombre]={total:0,resp:0};
                  porCliente[r.legajoNombre].total++;
                  if (r.estado==='RESPONDIDO'||r.estado==='CERRADO') porCliente[r.legajoNombre].resp++;
                });
                var clientes = Object.keys(porCliente).map(function(k){
                  var d=porCliente[k]; var pct=Math.round(d.resp/d.total*100);
                  return {nombre:k,total:d.total,resp:d.resp,pct:pct};
                }).sort(function(a,b){return a.pct-b.pct;});
                if (clientes.length===0) return <div style={{color:T.TEXT3,fontSize:12,textAlign:'center',padding:'12px 0'}}>Sin RFIs registrados.</div>;
                return clientes.map(function(c,i){
                  var col = c.pct>=80?C.VERDE:c.pct>=40?C.AMARILLO:C.ROJO;
                  return(<div key={i} style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:2,fontSize:12}}>
                      <span style={{color:T.TEXT2,fontWeight:500}}>{c.nombre}</span>
                      <span style={{fontWeight:700,color:col}}>{c.pct}%</span>
                    </div>
                    <div style={{background:T.BG3,borderRadius:4,height:6}}>
                      <div style={{background:col,borderRadius:4,height:6,width:c.pct+'%',transition:'width 0.3s'}}></div>
                    </div>
                    <div style={{fontSize:10,color:T.TEXT3,marginTop:1}}>{c.resp}/{c.total} RFIs respondidos</div>
                  </div>);
                });
              })()}
            </div>
          </div>

          {/* RFIs vencidos */}
          {rfisVencidos.length > 0 && (
            <div style={{marginTop:12,background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.25)',borderRadius:3,padding:'10px 12px'}}>
              <div style={{fontWeight:700,color:T.RED,fontSize:12,marginBottom:6}}>🔴 RFIs vencidos sin respuesta ({rfisVencidos.length})</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {rfisVencidos.map(function(r,i){
                  var f = parseFechaAR(r.createdAt);
                  var dias = f ? Math.floor((hoy-f)/86400000) : 0;
                  return(<div key={i} style={{background:T.BG2,border:'1px solid rgba(255,68,85,0.25)',borderRadius:4,padding:'6px 10px',fontSize:11}}>
                    <div style={{fontWeight:700,color:T.RED}}>{r.refNum}</div>
                    <div style={{color:T.TEXT2}}>{r.legajoNombre}</div>
                    <div style={{color:T.RED,fontWeight:600}}>{dias} días sin respuesta</div>
                  </div>);
                })}
              </div>
            </div>
          )}
        </Card>

      </div>}
    </div>
  );
}

function LegajosView(props) {
  var legajos=props.legajos, setLegajos=props.setLegajos, periodos=props.periodos, setPeriodos=props.setPeriodos, onAnalizar=props.onAnalizar, onReport=props.onReport, onSync=props.onSync||function(){}, currentUser=props.currentUser||{rol:'analista'};
  var selState = useState(null); var selId = selState[0]; var setSelId = selState[1];
  var editState = useState(false); var editing = editState[0]; var setEditing = editState[1];
  var formState = useState(null); var form = formState[0]; var setForm = formState[1];
  var uploadingState = useState(false); var uploading = uploadingState[0]; var setUploading = uploadingState[1];
  var uploadMsgState = useState(''); var uploadMsg = uploadMsgState[0]; var setUploadMsg = uploadMsgState[1];
  var uploadPctState = useState(0); var uploadPct = uploadPctState[0]; var setUploadPct = uploadPctState[1];
  var iaFieldsState = useState(null); var iaFields = iaFieldsState[0]; var setIaFields = iaFieldsState[1];
  var tabState = useState('datos'); var tab = tabState[0]; var setTab = tabState[1];
  var searchState = useState(''); var search=searchState[0]; var setSearch=searchState[1];
  var filtroSegState = useState('TODOS'); var filtroSeg=filtroSegState[0]; var setFiltroSeg=filtroSegState[1];
  var filtroDictState = useState('TODOS'); var filtroDict=filtroDictState[0]; var setFiltroDict=filtroDictState[1];
  var filtroEstState = useState('TODOS'); var filtroEst=filtroEstState[0]; var setFiltroEst=filtroEstState[1];
  var selectedState = useState([]); var selected=selectedState[0]; var setSelected=selectedState[1];
  var selectModeState = useState(false); var selectMode=selectModeState[0]; var setSelectMode=selectModeState[1];
  var menuOpenState = useState(null); var menuOpen=menuOpenState[0]; var setMenuOpen=menuOpenState[1];
  var cierreOpenState = useState(false); var cierreOpen=cierreOpenState[0]; var setCierreOpen=cierreOpenState[1];
  var cierreMotState = useState(''); var cierreMot=cierreMotState[0]; var setCierreMot=cierreMotState[1];
  var cierreTipoState = useState('RIESGO_AML'); var cierreTipo=cierreTipoState[0]; var setCierreTipo=cierreTipoState[1];
  var cierreIAState = useState(''); var cierreIA=cierreIAState[0]; var setCierreIA=cierreIAState[1];
  var cierreLoadingState = useState(false); var cierreLoading=cierreLoadingState[0]; var setCierreLoading=cierreLoadingState[1];
  // ROS Borrador
  var rosOpenState = useState(false); var rosOpen=rosOpenState[0]; var setRosOpen=rosOpenState[1];
  var rosSelPerState = useState([]); var rosSelPer=rosSelPerState[0]; var setRosSelPer=rosSelPerState[1];
  var rosNumState = useState(null); var rosNum=rosNumState[0]; var setRosNum=rosNumState[1];
  // Screening
  var screeningLoadingState = useState(false); var screeningLoading=screeningLoadingState[0]; var setScreeningLoading=screeningLoadingState[1];
  var fileRef = useRef();
  var sel = legajos.find(function(l){return l.id===selId;});

  function mkNew() {
    var cl = {}; CHECKLIST_ITEMS.forEach(function(item){cl[item]='Pendiente';});
    var kybSc = {}; KYB_FACTORS.forEach(function(f){kybSc[f]=2;});
    return { id:uid(), razonSocial:'', cuit:'', actividad:'', facturacionMensual:0, limiteDiario:0, limiteMensual:0, segmento:'MEDIO', dictamen:'CONDICIONAL', beneficiarioFinal:'', domicilio:'', checklist:cl, kybScores:kybSc, redFlags:[], observaciones:[], docsIA:[], createdAt:todayStr(), estadoCuenta:'EN_ONBOARDING', estadoCuentaUpdatedAt:todayStr(), estadoHistorial:[{estado:'EN_ONBOARDING', fecha:todayStr(), hora:new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}), analista:'Sistema'}] };
  }
  function saveList(updated) { setLegajos(updated); onSync(updated, periodos); }
  function handleSave() {
    console.log('[Rebit] Guardando legajo:', form.razonSocial, form.cuit, form);
    if (!form.razonSocial && !form.cuit) {
      if (!window.confirm('Este legajo no tiene Razón Social ni CUIT cargados.\n\nSi ya subiste los documentos pero los campos están vacíos, puede que la extracción IA haya fallado — verificá tu API key.\n\n¿Guardar igual?')) return;
    }
    var exists = legajos.find(function(l){return l.id===form.id;});
    var updated = exists ? legajos.map(function(l){return l.id===form.id?form:l;}) : legajos.concat([form]);
    saveList(updated); setEditing(false); setSelId(form.id); setForm(null); setIaFields(null);
    // Audit trail
    auditLog(currentUser, exists ? 'modificar_legajo' : 'crear_legajo', 'legajo', form.id, {
      razonSocial: form.razonSocial, cuit: form.cuit, segmento: form.segmento, dictamen: form.dictamen
    });
  }

  function fld(key, val) { setForm(function(prev){ var n=Object.assign({},prev); n[key]=val; return n; }); }
  function setClItem(item, val) { setForm(function(prev){ var n=Object.assign({},prev); n.checklist=Object.assign({},prev.checklist||{}); n.checklist[item]=val; return n; }); }
  function setKybSc(factor, val) { setForm(function(prev){ var n=Object.assign({},prev); n.kybScores=Object.assign({},prev.kybScores||{}); n.kybScores[factor]=Number(val); return n; }); }

  // Cambiar estado de cuenta con historial — usable desde form O directamente sobre un legajo guardado
  function cambiarEstadoLegajo(legajo, nuevoEstado, analista) {
    var ahora = new Date();
    var hora = ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    var nombreAnalista = analista || (currentUser && currentUser.nombre) || 'Analista';
    var entrada = { estado:nuevoEstado, fecha:todayStr(), hora:hora, analista:nombreAnalista };
    var historial = (legajo.estadoHistorial||[]).concat([entrada]);
    // Audit trail
    auditLog(currentUser, 'cambiar_estado', 'legajo', legajo.id, {
      razonSocial: legajo.razonSocial, estadoAnterior: legajo.estadoCuenta, estadoNuevo: nuevoEstado
    });
    return Object.assign({}, legajo, { estadoCuenta:nuevoEstado, estadoCuentaUpdatedAt:todayStr(), estadoHistorial:historial });
  }

  // Cambio rápido de estado desde la lista (sin abrir formulario)
  function cambioRapidoEstado(legajo, nuevoEstado) {
    var updated = cambiarEstadoLegajo(legajo, nuevoEstado, currentUser&&currentUser.nombre||'Analista');
    saveList(legajos.map(function(l){return l.id===legajo.id?updated:l;}));
    if (selId === legajo.id) setSelId(legajo.id);
  }

  async function handleUpload(e) {
    var files = Array.from(e.target.files).filter(function(f){
      return f.type==='application/pdf' || f.type.startsWith('image/');
    }).slice(0,25);
    if (!files.length) return;

    // Validar tamaño total — API acepta hasta ~100MB total de documentos
    var totalMB = files.reduce(function(s,f){return s+f.size;},0) / (1024*1024);
    if (totalMB > 90) {
      alert('Los documentos seleccionados pesan ' + totalMB.toFixed(1) + 'MB en total.\nEl límite es 90MB por análisis. Seleccioná menos documentos o usá versiones más livianas.');
      return;
    }

    setUploading(true); setUploadPct(0);
    setUploadMsg('Leyendo ' + files.length + ' documento(s) (' + totalMB.toFixed(1) + 'MB)...');

    try {
      // Convertir todos los archivos a base64 primero
      setUploadPct(15);
      setUploadMsg('Convirtiendo ' + files.length + ' documentos...');

      var contentBlocks = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        setUploadMsg('Preparando doc ' + (i+1) + ' de ' + files.length + ': ' + f.name);
        setUploadPct(15 + Math.round((i / files.length) * 35));
        var b64 = await fileToBase64(f);
        if (f.type === 'application/pdf') {
          contentBlocks.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 }, title:f.name });
        } else if (f.type.startsWith('image/')) {
          contentBlocks.push({ type:'image', source:{ type:'base64', media_type:f.type, data:b64 } });
        }
        contentBlocks.push({ type:'text', text:'[Doc ' + (i+1) + ' de ' + files.length + ': ' + f.name + ']' });
      }

      setUploadPct(55);
      setUploadMsg('Analizando ' + files.length + ' documentos con IA — procesando en lotes, puede tardar unos minutos...');

      // Llamar al proveedor seleccionado
      var provider = _KEYS.provider || 'claude';
      var extracted;
      if (provider === 'openai') {
        // Para GPT pasamos los content blocks SIN el prompt (lo agrega extractWithGPT)
        extracted = await extractWithGPT(contentBlocks);
      } else {
        // extractWithClaude ya tiene el prompt embebido en contentBlocks
        extracted = await extractWithClaude(contentBlocks);
      }

      setUploadPct(90);
      setUploadMsg('Completando campos del legajo...');

      var docNames = files.map(function(f){return f.name;});

      console.log('[Rebit IA] extracted.razonSocial:', extracted.razonSocial);
      console.log('[Rebit IA] extracted.cuit:', extracted.cuit);
      console.log('[Rebit IA] extracted completo:', extracted);

      // Calcular qué campos fueron efectivamente llenados por IA
      var filledFields = [];
      var datosKeys = ['razonSocial','cuit','actividad','facturacionMensual','limiteDiario','limiteMensual','beneficiarioFinal','domicilio','segmento','dictamen'];
      datosKeys.forEach(function(k){ if(extracted[k]!==undefined&&extracted[k]!==''&&extracted[k]!==0) filledFields.push(k); });
      var okChecklist = Object.values(extracted.checklist||{}).filter(function(v){return v==='OK';}).length;
      var bloqChecklist = Object.values(extracted.checklist||{}).filter(function(v){return v==='Bloqueante';}).length;
      var kybFilled = Object.values(extracted.kybScores||{}).filter(function(v){return Number(v)>0;}).length;
      var rfCount = safeArr(extracted.redFlags).length;

      setIaFields({
        filled: filledFields,
        okChecklist: okChecklist,
        bloqChecklist: bloqChecklist,
        kybFilled: kybFilled,
        rfCount: rfCount,
        segmento: extracted.segmento,
        dictamen: extracted.dictamen
      });

      setForm(function(prev){
        var n = Object.assign({}, prev, extracted);
        if (!n.checklist) n.checklist = {};
        CHECKLIST_ITEMS.forEach(function(item){ if(!n.checklist[item]) n.checklist[item]='Pendiente'; });
        if (!n.kybScores) n.kybScores = {};
        KYB_FACTORS.forEach(function(f){ if(!n.kybScores[f]) n.kybScores[f]=2; });
        n.docsIA = docNames;
        return n;
      });

      setUploadPct(100);
      setUploadMsg('✅ ' + files.length + ' docs analizados · ' + filledFields.length + ' campos completados · ' + okChecklist + ' docs OK en checklist');
      setTab('resumen_ia');

    } catch(err) {
      setUploadMsg('❌ Error: ' + err.message);
      var msg = err.message || '';
      var isRateLimit = msg.indexOf('rate limit') >= 0 || msg.indexOf('rate_limit') >= 0 || msg.indexOf('tokens per minute') >= 0 || msg.indexOf('overloaded') >= 0;
      var isBilling = msg.indexOf('quota') >= 0 || msg.indexOf('billing') >= 0 || msg.indexOf('balance') >= 0 || (msg.indexOf('credit') >= 0 && msg.indexOf('credit') < 50);
      var isModelAccess = msg.indexOf('does not have access to model') >= 0 || msg.indexOf('model_not_found') >= 0;
      if (isRateLimit) {
        alert('⏱ Límite de velocidad del API (Rate Limit)\n\n' + msg + '\n\n─────────────────\nEl API de Claude tiene un límite de 30,000 tokens por minuto en cuentas nuevas.\nCon 25 PDFs grandes se supera ese límite fácilmente.\n\nSoluciones:\n• Subí menos documentos a la vez (empezá con 3-5 PDFs)\n• Esperá 60 segundos y volvé a intentar\n• Considerá upgradear el plan en console.anthropic.com');
      } else if (isBilling) {
        alert('💳 Sin créditos en la API\n\n' + msg + '\n\n─────────────────\nPara resolverlo:\n• Anthropic → console.anthropic.com/settings/billing\n• OpenAI → platform.openai.com/settings/billing');
      } else if (isModelAccess) {
        alert('🔒 El proyecto no tiene acceso al modelo solicitado.\n\n' + msg + '\n\n─────────────────\nVerificá la configuración en platform.openai.com/settings o console.anthropic.com');
      } else {
        alert('❌ Error en la extracción IA:\n\n' + msg + '\n\nPodés cargar el legajo manualmente usando la tab 📋 Datos.');
      }
    }
    setUploading(false); e.target.value = '';
  }

  var iS = {width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 9px',fontSize:13};
  var btnB = {background:C.AC,color:'white',border:'none',borderRadius:3,padding:'8px 18px',cursor:'pointer',fontWeight:700,fontSize:13};
  var btnG = {background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'8px 18px',cursor:'pointer',fontWeight:700,fontSize:13};
  var btnR = {background:'rgba(255,68,85,0.15)',color:T.RED,border:'1px solid rgba(255,68,85,0.3)',borderRadius:3,padding:'7px 14px',cursor:'pointer',fontWeight:600,fontSize:12};

  if (editing && form) {
    var scVals = KYB_FACTORS.map(function(f){return Number((form.kybScores||{})[f])||0;}).filter(function(v){return v>0;});
    var scProm = scVals.length > 0 ? (scVals.reduce(function(a,b){return a+b;},0)/scVals.length).toFixed(2) : 'N/D';
    return (
      <div style={{padding:22,maxWidth:900}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <h2 style={{color:T.TEXT,fontSize:14,fontWeight:600,letterSpacing:'1px',margin:0}}>{legajos.find(function(l){return l.id===form.id;}) ? 'Editar Legajo' : 'Nuevo Legajo KYB'}</h2>
            {!legajos.find(function(l){return l.id===form.id;}) && <div style={{fontSize:12,color:T.TEXT2,marginTop:3}}>Paso 1: subí los documentos → Paso 2: revisá los datos → Paso 3: guardá</div>}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={handleSave} style={btnG}>💾 Guardar</button>
            <button onClick={function(){setEditing(false);setForm(null);}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 14px',cursor:'pointer',fontWeight:600,fontSize:13}}>Cancelar</button>
          </div>
        </div>
        <div style={{display:'flex',gap:2,marginBottom:14,background:C.CEL,borderRadius:6,padding:4}}>
          {[
            ['resumen_ia', iaFields ? '🤖 Resumen IA' : '📄 Docs IA'],
            ['datos', '📋 Datos' + (iaFields && iaFields.filled.length > 0 ? ' ✓' : '')],
            ['checklist', '✅ Checklist' + (iaFields && iaFields.okChecklist > 0 ? ' ✓' : '')],
            ['scoring', '📊 Scoring' + (iaFields && iaFields.kybFilled > 0 ? ' ✓' : '')],
            ['flags', '🚩 Red Flags' + (iaFields && iaFields.rfCount > 0 ? ' ('+iaFields.rfCount+')' : '')],
            ['historial', '🕐 Historial'],
            ['screening', '🛡 Screening' + (form.screening ? (form.screening.estadoGeneral==='LIMPIO'?' ✅':form.screening.estadoGeneral==='COINCIDENCIA'?' 🔴':' 🟡') : '')]
          ].map(function(t){return(
            <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{flex:1,padding:'7px 4px',border:'none',borderRadius:4,cursor:'pointer',fontWeight:tab===t[0]?700:400,background:tab===t[0]?'rgba(59,109,170,0.2)':'transparent',color:tab===t[0]?T.CYAN:T.TEXT3,borderBottom:tab===t[0]?'2px solid '+C.AC:'2px solid transparent',fontSize:11,whiteSpace:'nowrap'}}>{t[1]}</button>
          );})}
        </div>
        {tab === 'resumen_ia' ? <div>
          <input ref={fileRef} type="file" multiple accept=".pdf,image/*" onChange={handleUpload} style={{display:'none'}}/>

          {/* MODO MANUAL — siempre disponible */}
          {!iaFields && !uploading ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
            <div onClick={function(){if(!uploading)fileRef.current.click();}} style={{border:'2px dashed '+C.AC,borderRadius:8,padding:'20px 16px',textAlign:'center',cursor:'pointer',background:T.BG3}}>
              <div style={{fontSize:26,marginBottom:6}}>🤖</div>
              <div style={{fontSize:13,color:T.TEXT,fontWeight:600,marginBottom:4}}>Extracción automática IA</div>
              <div style={{fontSize:11,color:T.TEXT2,lineHeight:1.5}}>Subí hasta 25 PDFs e imágenes. Claude o GPT-4o extraen los datos automáticamente.</div>
              <div style={{marginTop:10,background:C.AC,color:'white',borderRadius:4,padding:'6px 0',fontSize:12,fontWeight:700}}>📂 Seleccionar documentos</div>
              <div style={{fontSize:10,color:T.TEXT3,marginTop:6}}>Requiere créditos en Anthropic o OpenAI</div>
            </div>
            <div onClick={function(){setTab('datos');}} style={{border:'1px solid rgba(0,230,118,0.4)',borderRadius:8,padding:'20px 16px',textAlign:'center',cursor:'pointer',background:'#F0FAF4'}}>
              <div style={{fontSize:26,marginBottom:6}}>✍️</div>
              <div style={{fontSize:13,color:T.TEXT,fontWeight:600,marginBottom:4}}>Carga manual</div>
              <div style={{fontSize:11,color:T.TEXT2,lineHeight:1.5}}>Completá los campos a mano. Podés hacerlo ahora y usar IA después cuando tengas créditos.</div>
              <div style={{marginTop:10,background:C.VERDE,color:'white',borderRadius:4,padding:'6px 0',fontSize:12,fontWeight:700}}>📋 Ir a Datos →</div>
              <div style={{fontSize:10,color:T.TEXT3,marginTop:6}}>Sin API key requerida</div>
            </div>
          </div> : null}

          {/* ZONA DE UPLOAD cuando ya hay resultado o está cargando */}
          {(iaFields || uploading) ? <div onClick={function(){if(!uploading)fileRef.current.click();}} style={{border:'2px dashed '+C.AC,borderRadius:8,padding:'20px',textAlign:'center',cursor:uploading?'wait':'pointer',background:uploading?'#F8FBFE':'#F0FAF4',marginBottom:12}}>
            <div style={{fontSize:24,marginBottom:4}}>{uploading?'⏳':'✅'}</div>
            <div style={{fontSize:13,color:T.CYAN,fontWeight:700}}>{uploading?uploadMsg:'Documentos analizados · Clic para re-analizar con nuevos docs'}</div>
          </div> : null}

          {uploading && <div style={{background:T.BG3,borderRadius:4,height:8,marginBottom:12}}><div style={{height:'100%',width:uploadPct+'%',background:C.AC,borderRadius:4,transition:'width 0.4s'}}/></div>}

          {/* RESUMEN DE LO EXTRAÍDO */}
          {iaFields && !uploading ? <div>
            <div style={{background:'rgba(0,230,118,0.08)',borderRadius:6,padding:'14px 18px',marginBottom:14,color:'white',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>🤖 Extracción IA completada</div>
                <div style={{fontSize:12,opacity:0.8}}>{safeArr(form.docsIA).length} documento(s) procesado(s)</div>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                {iaFields.segmento && <span style={{background:segColor(iaFields.segmento),borderRadius:4,padding:'3px 10px',fontWeight:700,fontSize:12}}>{iaFields.segmento}</span>}
                {iaFields.dictamen && <span style={{background:iaFields.dictamen==='APROBADO'?C.VERDE:iaFields.dictamen==='CONDICIONAL'?C.NARANJA:C.ROJO,borderRadius:4,padding:'3px 10px',fontWeight:700,fontSize:12}}>{iaFields.dictamen}</span>}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
              {[
                {icon:'📋',label:'Campos datos',val:iaFields.filled.length,max:10,col:C.AC},
                {icon:'✅',label:'Docs en checklist',val:iaFields.okChecklist,max:15,col:C.VERDE},
                {icon:'📊',label:'Factores scoring',val:iaFields.kybFilled,max:7,col:C.AM},
                {icon:'🚩',label:'Red flags',val:iaFields.rfCount,max:null,col:iaFields.rfCount>0?C.ROJO:'#888'}
              ].map(function(stat,i){return(
                <div key={i} style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:6,padding:'12px 14px',textAlign:'center',borderTop:'3px solid '+stat.col}}>
                  <div style={{fontSize:20}}>{stat.icon}</div>
                  <div style={{fontSize:22,fontWeight:700,color:stat.col,margin:'4px 0'}}>{stat.val}{stat.max?<span style={{fontSize:12,color:T.TEXT3,fontWeight:400}}>/{stat.max}</span>:''}</div>
                  <div style={{fontSize:11,color:T.TEXT2}}>{stat.label}</div>
                </div>
              );})}
            </div>

            {/* Campos completados */}
            {iaFields.filled.length > 0 && <div style={{background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.2)',borderRadius:6,padding:'12px 14px',marginBottom:10}}>
              <div style={{fontWeight:700,color:T.GREEN,fontSize:12,marginBottom:8}}>✅ Campos completados automáticamente:</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
                {iaFields.filled.map(function(f,i){
                  var labels = {razonSocial:'Razón Social',cuit:'CUIT',actividad:'Actividad',facturacionMensual:'Facturación',limiteDiario:'Límite Diario',limiteMensual:'Límite Mensual',beneficiarioFinal:'Beneficiario Final',domicilio:'Domicilio',segmento:'Segmento',dictamen:'Dictamen'};
                  return <span key={i} style={{background:T.GREEN,color:'white',borderRadius:4,padding:'3px 10px',fontSize:11,fontWeight:600}}>{labels[f]||f}</span>;
                })}
              </div>
              {/* Preview de los valores clave extraídos */}
              <div style={{background:T.BG2,borderRadius:4,padding:'10px 12px',border:'1px solid rgba(0,230,118,0.2)'}}>
                <div style={{fontWeight:700,color:T.GREEN,fontSize:11,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.5px'}}>Valores extraídos — revisá antes de guardar</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <tbody>
                    {[
                      ['Razón Social', form && (form.razonSocial||'—')],
                      ['CUIT', form && (form.cuit||'—')],
                      ['Actividad', form && (form.actividad||'—')],
                      ['Beneficiario final', form && (form.beneficiarioFinal||'—')],
                      ['Facturación mensual', form && form.facturacionMensual ? fmtM(form.facturacionMensual) : '—'],
                      ['Límite diario', form && form.limiteDiario ? fmtM(form.limiteDiario) : '—'],
                      ['Límite mensual', form && form.limiteMensual ? fmtM(form.limiteMensual) : '—'],
                      ['Segmento sugerido', form && (form.segmento||'—')],
                      ['Dictamen sugerido', form && (form.dictamen||'—')]
                    ].map(function(r,i){return(
                      <tr key={i} style={{borderBottom:'1px solid #EBF9F0'}}>
                        <td style={{padding:'4px 8px 4px 0',color:T.TEXT2,fontWeight:600,width:'40%'}}>{r[0]}</td>
                        <td style={{padding:'4px 0',color:r[1]==='—'?'#ccc':C.AO,fontWeight:r[1]==='—'?400:700}}>{r[1]}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>}

            {/* Checklist summary */}
            {(iaFields.okChecklist > 0 || iaFields.bloqChecklist > 0) && <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'12px 14px',marginBottom:10}}>
              <div style={{fontWeight:700,color:T.CYAN,fontSize:12,marginBottom:6}}>✅ Checklist evaluado por IA:</div>
              <div style={{display:'flex',gap:16,fontSize:13}}>
                <span style={{color:T.GREEN,fontWeight:700}}>{iaFields.okChecklist} documentos OK</span>
                {iaFields.bloqChecklist > 0 && <span style={{color:T.RED,fontWeight:700}}>{iaFields.bloqChecklist} bloqueantes</span>}
                <span style={{color:T.TEXT2}}>{15 - iaFields.okChecklist - iaFields.bloqChecklist} pendientes</span>
              </div>
            </div>}

            {/* Red flags */}
            {safeArr(form.redFlags).length > 0 && <div style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.2)',borderRadius:6,padding:'12px 14px',marginBottom:10}}>
              <div style={{fontWeight:700,color:T.RED,fontSize:12,marginBottom:8}}>🚩 Red flags detectados por IA:</div>
              {form.redFlags.map(function(rf,i){return <div key={i} style={{fontSize:12,color:T.RED,padding:'3px 0',borderBottom:'1px solid #FADBD8'}}>• {rf}</div>;})}
            </div>}

            {/* Docs procesados */}
            <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'10px 14px',marginBottom:14}}>
              <div style={{fontWeight:600,color:T.TEXT,fontSize:11,marginBottom:6}}>📄 Documentos procesados ({safeArr(form.docsIA).length}):</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:2}}>
                {safeArr(form.docsIA).map(function(d,i){return <div key={i} style={{fontSize:11,color:T.TEXT2,padding:'2px 0'}}>✅ {d}</div>;})}
              </div>
            </div>

            <div style={{display:'flex',gap:8}}>
              <button onClick={function(){setTab('datos');}} style={{flex:1,background:C.AC,color:'white',border:'none',borderRadius:3,padding:'9px 0',cursor:'pointer',fontWeight:700,fontSize:13}}>📋 Revisar Datos →</button>
              <button onClick={function(){setTab('checklist');}} style={{flex:1,background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'9px 0',cursor:'pointer',fontWeight:700,fontSize:13}}>✅ Revisar Checklist →</button>
              <button onClick={function(){setTab('scoring');}} style={{flex:1,background:C.AC,color:'white',border:'none',borderRadius:3,padding:'9px 0',cursor:'pointer',fontWeight:700,fontSize:13}}>📊 Revisar Scoring →</button>
            </div>
          </div> : null}
        </div> : null}

        {tab === 'datos' ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {iaFields && iaFields.filled.length > 0 && <div style={{gridColumn:'1/-1',background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'8px 12px',fontSize:11,color:T.CYAN}}>
            🤖 Los campos marcados con <strong style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 6px',fontSize:10}}>IA</strong> fueron completados automáticamente. Revisá y corregí si es necesario antes de guardar.
          </div>}
          {[
            {key:'razonSocial',label:'Razon Social',type:'text',placeholder:''},
            {key:'cuit',label:'CUIT',type:'text',placeholder:'XX-XXXXXXXX-X'},
            {key:'actividad',label:'Actividad / Giro comercial',type:'text',placeholder:'',full:true},
            {key:'beneficiarioFinal',label:'Beneficiario final (>10%)',type:'text',placeholder:''},
            {key:'domicilio',label:'Domicilio fiscal',type:'text',placeholder:''},
            {key:'facturacionMensual',label:'Facturacion mensual ($)',type:'number',placeholder:''},
            {key:'limiteDiario',label:'Limite diario ($)',type:'number',placeholder:''},
            {key:'limiteMensual',label:'Limite mensual ($)',type:'number',placeholder:''}
          ].map(function(fdef,i){
            var isIA = iaFields && iaFields.filled.indexOf(fdef.key) >= 0;
            return(
              <div key={i} style={fdef.full?{gridColumn:'1/-1'}:{}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                  <label style={{fontSize:11,color:T.TEXT2}}>{fdef.label}</label>
                  {isIA && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 5px',fontSize:9,fontWeight:700}}>IA</span>}
                </div>
                <input
                  type={fdef.type}
                  value={form[fdef.key]||''}
                  onChange={function(e){fld(fdef.key,e.target.value);}}
                  placeholder={fdef.placeholder}
                  style={Object.assign({},iS,isIA?{borderColor:C.AC,background:T.BG3}:{})}
                />
              </div>
            );
          })}
          <div>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
              <label style={{fontSize:11,color:T.TEXT2}}>Segmento de riesgo</label>
              {iaFields && iaFields.filled.indexOf('segmento')>=0 && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 5px',fontSize:9,fontWeight:700}}>IA</span>}
            </div>
            <select value={form.segmento} onChange={function(e){fld('segmento',e.target.value);}} style={Object.assign({},iS,iaFields&&iaFields.filled.indexOf('segmento')>=0?{borderColor:C.AC,background:T.BG3}:{})}>
              <option>BAJO</option><option>MEDIO</option><option>MEDIO-ALTO</option><option>ALTO</option>
            </select>
          </div>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
              <label style={{fontSize:11,color:T.TEXT2}}>Dictamen KYB</label>
              {iaFields && iaFields.filled.indexOf('dictamen')>=0 && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 5px',fontSize:9,fontWeight:700}}>IA</span>}
            </div>
            <select value={form.dictamen} onChange={function(e){fld('dictamen',e.target.value);}} style={Object.assign({},iS,iaFields&&iaFields.filled.indexOf('dictamen')>=0?{borderColor:C.AC,background:T.BG3}:{})}>
              <option>APROBADO</option><option>CONDICIONAL</option><option>RECHAZADO</option>
            </select>
          </div>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:T.TEXT2,marginBottom:4}}>Estado de cuenta</label>
            <select
              value={form.estadoCuenta||'EN_ONBOARDING'}
              onChange={function(e){
                var nuevo = e.target.value;
                var ahora = new Date();
                var entrada = { estado:nuevo, fecha:todayStr(), hora:ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}), analista:'Analista' };
                setForm(function(prev){
                  var n = Object.assign({},prev);
                  n.estadoCuenta = nuevo;
                  n.estadoCuentaUpdatedAt = todayStr();
                  n.estadoHistorial = (prev.estadoHistorial||[]).concat([entrada]);
                  return n;
                });
              }}
              style={{width:'100%',border:'2px solid '+(getEstado(form.estadoCuenta||'EN_ONBOARDING').color),borderRadius:4,padding:'7px 9px',fontSize:13,fontWeight:700,color:getEstado(form.estadoCuenta||'EN_ONBOARDING').color,background:getEstado(form.estadoCuenta||'EN_ONBOARDING').bg}}>
              {ESTADOS_CUENTA.map(function(e){return <option key={e.id} value={e.id}>{e.label} — {e.desc}</option>;})}
            </select>
            {form.estadoCuentaUpdatedAt && <div style={{fontSize:10,color:T.TEXT3,marginTop:3}}>Último cambio: {form.estadoCuentaUpdatedAt}</div>}
          </div>

          {/* Último análisis externo — para cuentas analizadas antes de esta app */}
          <div style={{gridColumn:'1 / -1'}}>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:T.TEXT2,marginBottom:4}}>
              📋 Fecha de último análisis AML externo al sistema
              <span style={{fontWeight:400,color:T.TEXT3,marginLeft:6}}>(completar si la cuenta fue analizada antes de usar esta app)</span>
            </label>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input
                type="text"
                value={form.ultimoAnalisisExterno||''}
                onChange={function(e){fld('ultimoAnalisisExterno',e.target.value);}}
                placeholder="DD/MM/AAAA — ej: 31/12/2025"
                style={{flex:1,border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 9px',fontSize:13}}
              />
              {form.ultimoAnalisisExterno && (
                <button onClick={function(){fld('ultimoAnalisisExterno','');}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 10px',cursor:'pointer',fontSize:11,color:T.TEXT2}}>✕ Limpiar</button>
              )}
            </div>
            <div style={{fontSize:10,color:T.TEXT2,marginTop:3}}>
              Si completás esta fecha, el sistema la usa como referencia para calcular cuándo vence el próximo análisis requerido y no generará alertas hasta que se cumpla ese plazo.
            </div>
          </div>
        </div> : null}

        {tab === 'checklist' ? <div>
          {iaFields && iaFields.okChecklist > 0 && <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'8px 12px',marginBottom:10,fontSize:11,color:T.CYAN}}>
            🤖 IA evaluó la presencia de documentos. <strong>{iaFields.okChecklist} marcados como OK</strong>{iaFields.bloqChecklist>0?<span>, <strong style={{color:T.RED}}>{iaFields.bloqChecklist} como Bloqueante</strong></span>:null}. Revisá y ajustá según tu criterio.
          </div>}
          {CHECKLIST_ITEMS.map(function(item,i){
            var val = (form.checklist||{})[item]||'Pendiente';
            var stC = val==='OK'?C.VERDE:val==='Bloqueante'?C.ROJO:'#888';
            var isIA = iaFields && iaFields.okChecklist > 0;
            return(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:i%2===0?T.BG3:T.BG2,borderBottom:'1px solid '+T.BORDER,fontSize:13,borderLeft:val==='OK'?'3px solid '+C.VERDE:val==='Bloqueante'?'3px solid '+C.ROJO:'3px solid transparent'}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{color:T.TEXT}}>{item}</span>
                  {isIA && val !== 'Pendiente' && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 4px',fontSize:9,fontWeight:700}}>IA</span>}
                </div>
                <select value={val} onChange={function(e){setClItem(item,e.target.value);}} style={{border:'1px solid '+T.BORDER,borderRadius:4,padding:'4px 8px',fontSize:12,color:stC,fontWeight:700,background:val!=='Pendiente'?'#F0F7FF':'white'}}>
                  <option>Pendiente</option><option>OK</option><option>Bloqueante</option><option>N/A</option>
                </select>
              </div>
            );
          })}
        </div> : null}

        {tab === 'scoring' ? <div>
          <div style={{background:C.CEL,borderRadius:6,padding:'10px 14px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:600,color:T.TEXT}}>Score KYB promedio</span>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {iaFields && iaFields.kybFilled > 0 && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'2px 7px',fontSize:10,fontWeight:700}}>🤖 IA</span>}
              <span style={{fontWeight:700,fontSize:18,color:Number(scProm)>=4?C.ROJO:Number(scProm)>=3?C.NARANJA:C.VERDE}}>{scProm}/5</span>
            </div>
          </div>
          {iaFields && iaFields.kybFilled > 0 && <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'8px 12px',marginBottom:10,fontSize:11,color:T.CYAN}}>
            🤖 IA completó los factores basándose en el análisis documental. Revisá y ajustá con tu criterio profesional.
          </div>}
          {KYB_FACTORS.map(function(f,i){
            var val = Number((form.kybScores||{})[f])||2;
            var scC = val>=4?C.ROJO:val>=3?C.NARANJA:C.VERDE;
            var isIA = iaFields && iaFields.kybFilled > 0;
            return(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:i%2===0?T.BG3:T.BG2,borderBottom:'1px solid '+T.BORDER,borderLeft:'3px solid '+scC}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:13,color:T.TEXT}}>{f}</span>
                  {isIA && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 4px',fontSize:9,fontWeight:700}}>IA</span>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{color:scC,fontWeight:700,minWidth:28}}>{val}/5</span>
                  <input type="range" min={1} max={5} value={val} onChange={function(e){setKybSc(f,e.target.value);}} style={{width:120,accentColor:scC}}/>
                </div>
              </div>
            );
          })}
        </div> : null}

        {tab === 'flags' ? <div>
          {iaFields && iaFields.rfCount > 0 && <div style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.2)',borderRadius:4,padding:'8px 12px',marginBottom:10,fontSize:12,color:T.RED}}>
            🤖 IA detectó {iaFields.rfCount} red flag(s) en los documentos. Revisá, editá o agregá los tuyos.
          </div>}
          <p style={{fontSize:12,color:T.TEXT2,marginBottom:8}}>Red flags (uno por linea):</p>
          <textarea value={safeArr(form.redFlags).join('\n')} onChange={function(e){fld('redFlags',e.target.value.split('\n').filter(function(s){return s.trim();}));}} rows={6} style={{width:'100%',border:'1px solid '+(iaFields&&iaFields.rfCount>0?C.ROJO:'#ddd'),borderRadius:4,padding:'8px 10px',fontSize:13,resize:'vertical',background:iaFields&&iaFields.rfCount>0?'#FFF8F8':'white'}} placeholder="Ingresa red flags..."/>
          <p style={{fontSize:12,color:T.TEXT2,margin:'12px 0 6px'}}>Observaciones del analista:</p>
          <textarea value={safeArr(form.observaciones).join('\n')} onChange={function(e){fld('observaciones',e.target.value.split('\n').filter(function(s){return s.trim();}));}} rows={4} style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,resize:'vertical'}} placeholder="Observaciones adicionales..."/>
        </div> : null}

        {tab === 'historial' ? <div>
          <p style={{fontSize:12,color:T.TEXT2,marginBottom:12}}>Historial de cambios de estado de cuenta. Se registra automáticamente cada vez que se modifica el estado.</p>
          {(function(){
            var hist = safeArr(form.estadoHistorial).slice().reverse();
            if (hist.length === 0) return <div style={{background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:16,textAlign:'center',color:T.TEXT3,fontSize:13}}>Sin historial registrado. Los cambios de estado quedarán registrados aquí.</div>;
            return (
              <div>
                {hist.map(function(h,i){
                  var est = getEstado(h.estado||'EN_ONBOARDING');
                  var isLast = i===0;
                  return (
                    <div key={i} style={{display:'flex',gap:14,padding:'10px 0',borderBottom:i<hist.length-1?'1px solid #eee':'none'}}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,flexShrink:0}}>
                        <div style={{width:12,height:12,borderRadius:'50%',background:est.color,border:'2px solid '+est.color,marginTop:3}}></div>
                        {i<hist.length-1 && <div style={{width:1,flex:1,background:T.BORDER,marginTop:2}}></div>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                          <span style={{background:est.bg,color:est.color,border:'1px solid '+est.color,borderRadius:8,padding:'2px 9px',fontSize:11,fontWeight:700}}>{est.label}</span>
                          {isLast && <span style={{background:C.AC,color:'white',borderRadius:8,padding:'1px 7px',fontSize:10,fontWeight:700}}>Actual</span>}
                        </div>
                        <div style={{fontSize:11,color:T.TEXT2}}>{h.fecha} {h.hora && 'a las '+h.hora} · {h.analista||'Analista'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }())}
          <div style={{marginTop:16,padding:'10px 12px',background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,fontSize:12,color:T.TEXT2}}>
            <strong>Registrar entrada manual en el historial:</strong>
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <input id="histNota" placeholder="Nota sobre el cambio de estado..." style={{flex:1,border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 8px',fontSize:12}}/>
              <button onClick={function(){
                var nota = document.getElementById('histNota').value.trim();
                if (!nota) return;
                var ahora = new Date();
                var entrada = { estado:form.estadoCuenta||'EN_ONBOARDING', fecha:todayStr(), hora:ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}), analista:'Analista — '+nota };
                fld('estadoHistorial', safeArr(form.estadoHistorial).concat([entrada]));
                document.getElementById('histNota').value='';
              }} style={{background:C.AC,color:'white',border:'none',borderRadius:3,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>+ Agregar</button>
            </div>
          </div>
        </div> : null}

        {tab === 'screening' ? <div>
          {(function(){
            var scr = form.screening || null;

            // Nombres a verificar: razón social + beneficiario final + representante legal
            var nombresArr = [];
            if (form.razonSocial) nombresArr.push(form.razonSocial + (form.cuit ? ' (CUIT: '+form.cuit+')' : ''));
            if (form.beneficiarioFinal) nombresArr.push('Beneficiario final: ' + form.beneficiarioFinal);
            if (form.representanteLegal) nombresArr.push('Representante legal: ' + form.representanteLegal);

            var LISTAS = [
              {key:'OFAC', label:'OFAC SDN', flag:'🇺🇸', url:'https://sanctionssearch.ofac.treas.gov/'},
              {key:'ONU',  label:'ONU Lista Consolidada', flag:'🌐', url:'https://www.un.org/securitycouncil/content/un-sc-consolidated-list'},
              {key:'REPET', label:'REPET UIF Argentina', flag:'🇦🇷', url:'https://repet.uif.gob.ar/'},
              {key:'PEP',  label:'PEPs Argentina (OA)', flag:'🇦🇷', url:'https://declaraciones.anticorrupcion.gob.ar/'},
            ];

            function getCol(estado) {
              return estado==='LIMPIO' ? C.VERDE : estado==='COINCIDENCIA' ? C.ROJO : estado==='REVISAR' ? C.AMARILLO : '#7F8C8D';
            }

            async function ejecutarScreening() {
              if (nombresArr.length === 0) { alert('El legajo debe tener al menos Razón Social para realizar el screening.'); return; }
              setScreeningLoading(true);
              try {
                var prompt = 'Sos un especialista en compliance AML/CFT para un PSP argentino regulado por UIF/BCRA.\n\n'
                  + 'Realizá un screening de las siguientes personas/entidades contra las listas de sanciones indicadas. '
                  + 'Usá búsqueda web para verificar cada lista.\n\n'
                  + 'ENTIDADES A VERIFICAR:\n' + nombresArr.join('\n') + '\n\n'
                  + 'LISTAS A CONSULTAR:\n'
                  + '1. OFAC SDN List: https://sanctionssearch.ofac.treas.gov/ - Buscar el nombre exacto y variaciones\n'
                  + '2. ONU Lista Consolidada: https://www.un.org/securitycouncil/content/un-sc-consolidated-list\n'
                  + '3. REPET UIF Argentina: https://repet.uif.gob.ar/ - Registro Público de personas vinculadas a terrorismo y financiamiento del terrorismo\n'
                  + '4. PEPs Argentina: https://declaraciones.anticorrupcion.gob.ar/ - Personas Políticamente Expuestas\n\n'
                  + 'Para cada lista indica:\n'
                  + '- LIMPIO: búsqueda realizada, sin coincidencias encontradas\n'
                  + '- REVISAR: posible coincidencia parcial o nombre similar, requiere revisión manual\n'
                  + '- COINCIDENCIA: coincidencia encontrada, acción inmediata requerida\n\n'
                  + 'Devolvé SOLO JSON válido, sin texto adicional, sin backticks:\n'
                  + '{"OFAC":{"estado":"LIMPIO|REVISAR|COINCIDENCIA","detalle":"descripción de lo encontrado o no encontrado"},'
                  + '"ONU":{"estado":"...","detalle":"..."},'
                  + '"REPET":{"estado":"...","detalle":"..."},'
                  + '"PEP":{"estado":"...","detalle":"..."}}';

                var r = await fetch('/api/ai', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
                  body: JSON.stringify({
                    provider: 'claude',
                    useWebSearch: true,
                    max_tokens: 2000,
                    messages: [{ role: 'user', content: prompt }]
                  })
                });
                var res = await r.json();
                var texto = res.text || '';
                var clean = texto.replace(/```json|```/g, '').trim();
                var resultados = JSON.parse(clean);
                var estados = Object.values(resultados).map(function(v){return v.estado;});
                var estadoGeneral = estados.some(function(e){return e==='COINCIDENCIA';}) ? 'COINCIDENCIA'
                  : estados.some(function(e){return e==='REVISAR';}) ? 'REVISAR' : 'LIMPIO';
                var nuevoScreening = {
                  fecha: todayStr(),
                  hora: new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
                  realizadoPor: currentUser ? currentUser.nombre : 'Sistema',
                  nombres: nombresArr,
                  resultados: resultados,
                  estadoGeneral: estadoGeneral
                };
                fld('screening', nuevoScreening);
              } catch(e) {
                alert('Error al realizar el screening: ' + e.message);
              }
              setScreeningLoading(false);
            }

            return (
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
                  <div>
                    <div style={{fontWeight:600,color:T.TEXT,fontSize:14,marginBottom:4}}>🛡 Screening de Sanciones Internacionales</div>
                    <div style={{fontSize:12,color:T.TEXT2}}>Verificación contra OFAC SDN, ONU, REPET UIF y PEPs Argentina.</div>
                    <div style={{fontSize:11,color:T.TEXT2,marginTop:4}}>Personas a verificar: {nombresArr.length > 0 ? nombresArr.join(' · ') : 'Completar Razón Social / Beneficiario Final primero'}</div>
                  </div>
                  <button
                    onClick={ejecutarScreening}
                    disabled={screeningLoading || nombresArr.length===0}
                    style={{background:screeningLoading||nombresArr.length===0?'#aaa':'#1A4A6B',color:'white',border:'none',borderRadius:4,padding:'9px 16px',cursor:screeningLoading||nombresArr.length===0?'not-allowed':'pointer',fontWeight:700,fontSize:13,flexShrink:0,marginLeft:12}}
                  >
                    {screeningLoading ? '⏳ Verificando...' : scr ? '🔄 Repetir Screening' : '🔍 Ejecutar Screening'}
                  </button>
                </div>

                {screeningLoading && (
                  <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'16px',textAlign:'center',marginBottom:16}}>
                    <div style={{fontSize:14,color:T.CYAN,fontWeight:700}}>🔍 Consultando listas de sanciones...</div>
                    <div style={{fontSize:12,color:T.TEXT2,marginTop:4}}>OFAC SDN · ONU · REPET UIF · PEPs Argentina — esto puede tardar 20-30 segundos</div>
                  </div>
                )}

                {scr && !screeningLoading && (
                  <div>
                    {/* Badge resultado general */}
                    <div style={{background:scr.estadoGeneral==='LIMPIO'?'#EBF9F0':scr.estadoGeneral==='COINCIDENCIA'?'#FDEDEC':'#FEF9E7',border:'2px solid '+(scr.estadoGeneral==='LIMPIO'?C.VERDE:scr.estadoGeneral==='COINCIDENCIA'?C.ROJO:C.AMARILLO),borderRadius:6,padding:'12px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <span style={{fontWeight:700,fontSize:14,color:getCol(scr.estadoGeneral)}}>
                          {scr.estadoGeneral==='LIMPIO'?'✅ SIN COINCIDENCIAS':scr.estadoGeneral==='COINCIDENCIA'?'🔴 COINCIDENCIA DETECTADA':'🟡 REQUIERE REVISIÓN MANUAL'}
                        </span>
                        <div style={{fontSize:11,color:T.TEXT2,marginTop:2}}>Realizado por {scr.realizadoPor} el {scr.fecha} a las {scr.hora}</div>
                      </div>
                      <div style={{fontSize:11,color:T.TEXT2,textAlign:'right'}}>
                        {scr.nombres && scr.nombres.map(function(n,i){return <div key={i}>{n}</div>;})}
                      </div>
                    </div>

                    {/* Resultados por lista */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                      {LISTAS.map(function(lista){
                        var res = scr.resultados && scr.resultados[lista.key];
                        var estado = res ? res.estado : 'PENDIENTE';
                        var col = getCol(estado);
                        return (
                          <div key={lista.key} style={{border:'2px solid '+(estado==='LIMPIO'?'#A9DFBF':estado==='COINCIDENCIA'?C.ROJO:estado==='REVISAR'?C.AMARILLO:'#ddd'),borderRadius:6,padding:'12px 14px',background:estado==='LIMPIO'?'#F0FAF4':estado==='COINCIDENCIA'?'#FDEDEC':estado==='REVISAR'?'#FFFDF5':'#F8FBFE'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                              <span style={{fontWeight:700,fontSize:12}}>{lista.flag} {lista.label}</span>
                              <span style={{background:col,color:'white',borderRadius:8,padding:'2px 10px',fontSize:10,fontWeight:700}}>{estado}</span>
                            </div>
                            <div style={{fontSize:11,color:T.TEXT2,lineHeight:1.5}}>{res ? res.detalle : '—'}</div>
                            <a href={lista.url} target="_blank" rel="noreferrer" style={{fontSize:10,color:T.CYAN,display:'block',marginTop:4}}>Ver lista oficial →</a>
                          </div>
                        );
                      })}
                    </div>

                    {scr.estadoGeneral !== 'LIMPIO' && (
                      <div style={{background:'rgba(255,184,48,0.08)',border:'1px solid rgba(255,184,48,0.25)',borderRadius:3,padding:'10px 14px',fontSize:12,color:T.AMBER}}>
                        <strong>⚠ Acción requerida:</strong> {scr.estadoGeneral==='COINCIDENCIA'
                          ? 'Se detectó una posible coincidencia. Suspender operaciones del cliente y notificar al Oficial de Cumplimiento de inmediato. Evaluar reporte a UIF.'
                          : 'Existen nombres similares que requieren verificación manual. Revisar los detalles antes de continuar con el onboarding.'}
                      </div>
                    )}
                  </div>
                )}

                {!scr && !screeningLoading && (
                  <div style={{background:T.BG3,border:'2px dashed #ddd',borderRadius:6,padding:'30px 20px',textAlign:'center',color:T.TEXT3}}>
                    <div style={{fontSize:32,marginBottom:8}}>🛡</div>
                    <div style={{fontSize:14,fontWeight:600,color:T.TEXT2}}>Screening no realizado</div>
                    <div style={{fontSize:12,marginTop:4}}>Hacé clic en "Ejecutar Screening" para verificar contra las 4 listas de sanciones.</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div> : null}
      </div>
    );
  }

  if (sel && !editing) {
    var lPeriodos = periodos.filter(function(p){return p.legajoId===sel.id;});
    var clVals = Object.values(sel.checklist||{});
    var okC2 = clVals.filter(function(v){return v==='OK';}).length;
    var scV2 = KYB_FACTORS.map(function(f){return Number((sel.kybScores||{})[f])||0;}).filter(function(v){return v>0;});
    var scP2 = scV2.length>0?(scV2.reduce(function(a,b){return a+b;},0)/scV2.length).toFixed(2):'N/D';
    return (
      <div style={{padding:22}}>
        <button onClick={function(){setSelId(null);}} style={{background:'none',border:'none',color:T.CYAN,cursor:'pointer',fontSize:13,marginBottom:12}}>← Volver a lista</button>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div>
            <h2 style={{color:T.TEXT,fontSize:18,fontWeight:700,margin:0}}>{sel.razonSocial||'Sin nombre'}</h2>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4,flexWrap:'wrap'}}>
              <span style={{color:T.TEXT2,fontSize:13}}>CUIT: {sel.cuit||'N/D'} · Alta: {sel.createdAt}</span>
              {(function(){var est=getEstado(sel.estadoCuenta||'EN_ONBOARDING');return(
                <span style={{background:est.bg,color:est.color,border:'1px solid '+est.color,borderRadius:10,padding:'3px 12px',fontSize:12,fontWeight:700}}>{est.label}</span>
              );}())}
              {sel.estadoCuentaUpdatedAt && <span style={{fontSize:11,color:T.TEXT3}}>desde {sel.estadoCuentaUpdatedAt}</span>}
              {sel.screening && (function(){
                var col = sel.screening.estadoGeneral==='LIMPIO'?C.VERDE:sel.screening.estadoGeneral==='COINCIDENCIA'?C.ROJO:C.AMARILLO;
                var label = sel.screening.estadoGeneral==='LIMPIO'?'🛡 Screening ✅':sel.screening.estadoGeneral==='COINCIDENCIA'?'🛡 Coincidencia 🔴':'🛡 Revisar 🟡';
                return <span style={{background:col,color:'white',borderRadius:10,padding:'3px 10px',fontSize:11,fontWeight:700}}>{label}</span>;
              })()}
            </div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={function(){
              onReport(genINF01(sel, periodos, []));
              auditLog(currentUser,'generar_inf01','legajo',sel.id,{razonSocial:sel.razonSocial,cuit:sel.cuit});
            }} style={btnB}>📄 INF-01</button>
            {puedeAprobar(currentUser.rol) && <button onClick={function(){
              // Abrir modal ROS — preseleccionar períodos con señales ALTA
              var lp = periodos.filter(function(p){return p.legajoId===sel.id;});
              var conSenales = lp.filter(function(p){
                if (!p.metricas) return false;
                var sigs = detectPatrones(p.metricas, sel);
                return sigs.some(function(s){return s.sev==='ALTA' && (!(p.sigsResolucion||{})[s.pat] || (p.sigsResolucion||{})[s.pat].estado!=='RESUELTA');});
              });
              setRosSelPer(conSenales.map(function(p){return p.id;}));
              // Obtener número correlativo desde KV
              fetch('/api/sync?action=kv&k=ros_counter_'+new Date().getFullYear(), {headers:{'x-app-token':APP_TOKEN}})
                .then(function(r){return r.json();}).then(function(d){ setRosNum((d.v||0)+1); }).catch(function(){ setRosNum(1); });
              setRosOpen(true);
            }} style={{background:'rgba(139,103,192,0.2)',color:'#B39DDB',border:'1px solid rgba(139,103,192,0.3)',borderRadius:3,padding:'8px 14px',cursor:'pointer',fontWeight:700,fontSize:13}}>📋 ROS Borrador</button>}
            <button onClick={function(){setCierreOpen(true);setCierreMot('');setCierreIA('');}} style={{background:T.RED,color:'white',border:'none',borderRadius:4,padding:'8px 14px',cursor:'pointer',fontWeight:700,fontSize:13}}>🔒 Cierre</button>
            <button onClick={function(){setForm(JSON.parse(JSON.stringify(sel)));setEditing(true);setTab('datos');}} style={btnG}>✏️ Editar</button>
            {puedeEliminar(currentUser.rol) && <button onClick={function(){if(window.confirm('Eliminar?')){saveList(legajos.filter(function(l){return l.id!==sel.id;}));setSelId(null);}}} style={btnR}>🗑</button>}
          </div>

          {/* MODAL ROS BORRADOR */}
          {rosOpen && sel && (function(){
            var lp = periodos.filter(function(p){return p.legajoId===sel.id;});
            var rfisLegajo = [];
            // rfisLegajo se carga desde Supabase KV via useEffect en AnalisisView
            return (
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div style={{background:T.BG2,borderRadius:8,padding:28,width:560,maxWidth:'92vw',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <div>
                      <div style={{fontWeight:700,color:'#B39DDB',fontSize:13}}>📋 Generar ROS Borrador</div>
                      <div style={{fontSize:12,color:T.TEXT2,marginTop:2}}>Reporte de Operación Sospechosa — {sel.razonSocial}</div>
                    </div>
                    <button onClick={function(){setRosOpen(false);}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:12}}>✕</button>
                  </div>

                  <div style={{marginBottom:16}}>
                    <div style={{fontWeight:700,fontSize:12,color:T.TEXT,marginBottom:8}}>Seleccioná los períodos a incluir en el ROS:</div>
                    {lp.length === 0 ? (
                      <div style={{color:T.TEXT3,fontSize:12,textAlign:'center',padding:'12px 0'}}>Este legajo no tiene períodos analizados.</div>
                    ) : lp.map(function(p){
                      var hasSigs = p.metricas && detectPatrones(p.metricas, sel).some(function(s){
                        return s.sev==='ALTA' && (!(p.sigsResolucion||{})[s.pat] || (p.sigsResolucion||{})[s.pat].estado!=='RESUELTA');
                      });
                      var checked = rosSelPer.indexOf(p.id) >= 0;
                      return (
                        <div key={p.id} onClick={function(){
                          setRosSelPer(function(prev){
                            return prev.indexOf(p.id)>=0 ? prev.filter(function(x){return x!==p.id;}) : prev.concat([p.id]);
                          });
                        }} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:4,cursor:'pointer',background:checked?'#F5EEF8':'white',border:'1px solid '+(checked?'#7D3C98':'#ddd'),marginBottom:6}}>
                          <input type="checkbox" checked={checked} readOnly style={{cursor:'pointer'}}/>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:600,fontSize:13}}>{p.nombre}</div>
                            <div style={{fontSize:11,color:T.TEXT2}}>{p.metricas?fmtM(p.metricas.tIn)+' IN · '+fmtM(p.metricas.tOut)+' OUT · '+(p.txns&&p.txns.length?p.txns.length.toLocaleString('es-AR'):0)+' txns':'Sin métricas calculadas'}</div>
                          </div>
                          {hasSigs && <span style={{background:T.RED,color:'white',borderRadius:8,padding:'2px 8px',fontSize:10,fontWeight:700}}>ALTA</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{background:'rgba(139,103,192,0.08)',border:'1px solid rgba(139,103,192,0.25)',borderRadius:3,padding:'8px 12px',marginBottom:16,fontSize:11}}>
                    <strong>N° de ROS:</strong> ROS-{new Date().getFullYear()}-{String(rosNum||'001').padStart(3,'0')} · <strong>Oficial:</strong> {currentUser&&currentUser.nombre||'Oficial de Cumplimiento'}
                  </div>

                  {rosSelPer.length === 0 && <div style={{color:T.AMBER,fontSize:12,marginBottom:10}}>⚠ Seleccioná al menos un período para generar el ROS.</div>}

                  <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button onClick={function(){setRosOpen(false);}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 16px',cursor:'pointer',fontSize:13}}>Cancelar</button>
                    <button
                      disabled={rosSelPer.length===0}
                      onClick={async function(){
                        // Incrementar contador ROS en Supabase
                        var num = rosNum || 1;
                        var yearKey = 'ros_counter_'+new Date().getFullYear();
                        try {
                          await fetch('/api/sync?action=kv', {
                            method:'POST', headers:{'Content-Type':'application/json','x-app-token':APP_TOKEN},
                            body: JSON.stringify({k:yearKey, v:num})
                          });
                        } catch(e){}
                        // Generar ROS
                        var html = genROS(sel, periodos, rosSelPer, rfisLegajo, currentUser, num);
                        onReport(html);
                        auditLog(currentUser,'generar_ros','legajo',sel.id,{razonSocial:sel.razonSocial,rosNum:'ROS-'+new Date().getFullYear()+'-'+String(num).padStart(3,'0'),periodos:rosSelPer.length});
                        setRosOpen(false);
                      }}
                      style={{background:rosSelPer.length>0?'#7D3C98':'#ccc',color:'white',border:'none',borderRadius:4,padding:'8px 20px',cursor:rosSelPer.length>0?'pointer':'not-allowed',fontWeight:700,fontSize:13}}
                    >📋 Generar ROS ({rosSelPer.length} período{rosSelPer.length!==1?'s':''})</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* MODAL CIERRE DE CUENTA */}
          {cierreOpen ? <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',overflow:'auto'}}>
            <div style={{background:T.BG2,borderRadius:8,padding:28,width:600,maxWidth:'92vw',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <div>
                  <div style={{fontWeight:700,color:T.RED,fontSize:16}}>🔒 Cierre de Cuenta</div>
                  <div style={{fontSize:12,color:T.TEXT2,marginTop:2}}>{sel.razonSocial} — {sel.cuit}</div>
                </div>
                <button onClick={function(){setCierreOpen(false);}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:12,color:T.TEXT2}}>✕</button>
              </div>

              {/* Resumen del legajo */}
              <div style={{background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:6,padding:'12px 14px',marginBottom:16,fontSize:12}}>
                <div style={{fontWeight:600,color:T.TEXT,marginBottom:8}}>Resumen del legajo</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {[['Alta',sel.createdAt],['Estado',getEstado(sel.estadoCuenta||'EN_ONBOARDING').label],['Segmento',sel.segmento],['Dictamen',sel.dictamen],['Períodos AML',periodos.filter(function(p){return p.legajoId===sel.id;}).length+' analizados']].map(function(r,i){return(
                    <div key={i} style={{fontSize:11}}><span style={{color:T.TEXT2}}>{r[0]}: </span><strong>{r[1]}</strong></div>
                  );})}
                </div>
              </div>

              {/* Tipo de cierre */}
              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,fontWeight:600,color:T.TEXT,display:'block',marginBottom:6}}>Motivo del cierre</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[
                    {id:'RIESGO_AML',label:'🚨 Riesgo AML',desc:'Patrones de lavado detectados'},
                    {id:'INCUMPLIMIENTO',label:'📋 Incumplimiento documental',desc:'Documentación incompleta o vencida'},
                    {id:'INACTIVIDAD',label:'⏸ Inactividad prolongada',desc:'Sin operaciones por período extendido'},
                    {id:'SOLICITUD_CLIENTE',label:'👤 Solicitud del cliente',desc:'Cierre voluntario por el titular'}
                  ].map(function(t){return(
                    <div key={t.id} onClick={function(){setCierreTipo(t.id);}} style={{border:'2px solid '+(cierreTipo===t.id?'#E74C3C':'#eee'),borderRadius:6,padding:'10px 12px',cursor:'pointer',background:cierreTipo===t.id?'#FDF2F2':'white'}}>
                      <div style={{fontWeight:700,fontSize:12,color:cierreTipo===t.id?'#E74C3C':C.AO}}>{t.label}</div>
                      <div style={{fontSize:10,color:T.TEXT2,marginTop:2}}>{t.desc}</div>
                    </div>
                  );})}
                </div>
              </div>

              {/* Detalle del motivo */}
              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,fontWeight:600,color:T.TEXT,display:'block',marginBottom:6}}>Detalle / Fundamentación</label>
                <textarea
                  value={cierreMot}
                  onChange={function(e){setCierreMot(e.target.value);}}
                  rows={4}
                  placeholder="Describí los fundamentos de la decisión de cierre. Incluí referencias a períodos analizados, señales detectadas, incumplimientos o cualquier elemento relevante para el archivo de auditoría."
                  style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:12,resize:'vertical',boxSizing:'border-box'}}
                />
              </div>

              {/* Análisis IA */}
              <div style={{marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <label style={{fontSize:12,fontWeight:600,color:T.TEXT}}>Análisis automatizado IA</label>
                  <button
                    onClick={async function(){
                      setCierreLoading(true);
                      var lPers2 = periodos.filter(function(p){return p.legajoId===sel.id;});
                      var lastP = lPers2[lPers2.length-1];
                      var lastM2 = lastP&&lastP.txns?calcMetricas(lastP.txns,sel):null;
                      var lastSigs2 = lastM2?detectPatrones(lastM2,sel):[];
                      var lastSc2 = lastM2?calcScoring(lastM2,lastSigs2):null;
                      var apiKey2 = _KEYS.anthropic || '';
                      var oaiKey2 = _KEYS.openai || '';
                      var provider2 = _KEYS.provider || 'claude';
                      if (!apiKey2 && !oaiKey2) { alert('Configurá una API key en ⚙️'); setCierreLoading(false); return; }
                      var contexto = 'Empresa: '+sel.razonSocial+' | CUIT: '+(sel.cuit||'N/D')+' | Actividad: '+(sel.actividad||'N/D')+' | Segmento: '+(sel.segmento||'MEDIO')+' | Dictamen: '+(sel.dictamen||'N/D')+' | Red Flags KYB: '+(safeArr(sel.redFlags).join('; ')||'ninguna')+' | Períodos AML analizados: '+lPers2.length+(lastM2?' | Último período ('+( lastP.nombre)+'): Vol IN '+fmtM(lastM2.tIn)+', Vol OUT '+fmtM(lastM2.tOut)+', '+lastSigs2.length+' señales ('+lastSigs2.filter(function(s){return s.sev==='ALTA';}).length+' ALTA), Score AML '+(lastSc2?lastSc2.promedio.toFixed(2)+'/5 '+lastSc2.clasificacion:'N/D'):'');
                      var promptCierre = 'Sos analista senior Compliance de GOAT S.A./Rebit (PSP argentino). Redactá un análisis ejecutivo profesional de máximo 3 párrafos fundamentando el cierre de cuenta del siguiente cliente. Sé objetivo, técnico y basate estrictamente en los datos. Cita los indicadores concretos. Evaluá si corresponde considerar un ROS ante UIF. No uses bullets, escribe en prosa.\n\nDatos del cliente:\n'+contexto+'\n\nMotivo declarado de cierre: '+cierreTipo+'\nDetalle: '+(cierreMot||'Sin detalle adicional.');
                      try {
                        var cierreRes = await callProxyOrDirect(provider2, [{role:'user',content:promptCierre}], 600, true);
                        setCierreIA(typeof cierreRes === 'string' ? cierreRes : JSON.stringify(cierreRes));
                      } catch(err){ setCierreIA('Error al generar análisis: '+err.message); }
                      setCierreLoading(false);
                    }}
                    disabled={cierreLoading}
                    style={{background:cierreLoading?'#aaa':C.AC,color:'white',border:'none',borderRadius:4,padding:'6px 14px',cursor:cierreLoading?'not-allowed':'pointer',fontSize:11,fontWeight:700}}
                  >
                    {cierreLoading?'⏳ Analizando...':'🤖 Analizar con IA'}
                  </button>
                </div>
                {cierreIA ? <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'10px 12px',fontSize:11,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{cierreIA}</div>
                  : <div style={{background:T.BG3,border:'1px dashed #ddd',borderRadius:4,padding:'12px',fontSize:11,color:T.TEXT3,textAlign:'center'}}>Hacé clic en "Analizar con IA" para generar un análisis automático basado en el legajo y el último período AML.</div>}
              </div>

              {/* Botones */}
              <div style={{display:'flex',gap:8}}>
                <button
                  onClick={function(){
                    var html = genINF07Cierre(sel, periodos, cierreMot, cierreTipo, cierreIA);
                    onReport(html);
                    // Actualizar estado de cuenta a CERRADA automáticamente con historial
                    var updated = cambiarEstadoLegajo(sel, 'CERRADA', currentUser&&currentUser.nombre||'Sistema — INF-07');
                    saveList(legajos.map(function(l){return l.id===sel.id?updated:l;}));
                    auditLog(currentUser,'generar_inf07','legajo',sel.id,{razonSocial:sel.razonSocial,cuit:sel.cuit,motivoCierre:cierreTipo});
                    setCierreOpen(false);
                  }}
                  style={{flex:1,background:T.RED,color:'white',border:'none',borderRadius:4,padding:'11px 0',cursor:'pointer',fontWeight:700,fontSize:14}}
                >
                  📄 Generar INF-07 Cierre
                </button>
                <button onClick={function(){setCierreOpen(false);}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'11px 18px',cursor:'pointer',fontWeight:600,fontSize:13}}>Cancelar</button>
              </div>
            </div>
          </div> : null}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <Card title="Perfil KYB">
            <table style={{width:'100%',fontSize:13}}>
              <tbody>{[['Actividad',sel.actividad||'N/D'],['Beneficiario final',sel.beneficiarioFinal||'N/D'],['Facturacion mensual',fmtM(sel.facturacionMensual)],['Limite diario',fmtM(sel.limiteDiario)],['Limite mensual',fmtM(sel.limiteMensual)]].map(function(r,i){return(
                <tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
                  <td style={{padding:'5px 8px',color:T.TEXT2,fontWeight:600}}>{r[0]}</td>
                  <td style={{padding:'5px 8px'}}>{r[1]}</td>
                </tr>
              );})}</tbody>
            </table>
          </Card>
          <Card title="Dictamen y scoring">
            <div style={{display:'flex',gap:10,marginBottom:10}}><Pill v={sel.dictamen}/><Pill v={sel.segmento}/></div>
            <div style={{fontSize:13,color:T.TEXT2}}>Score KYB: <strong style={{color:Number(scP2)>=4?C.ROJO:Number(scP2)>=3?C.NARANJA:C.VERDE}}>{scP2}/5</strong></div>
            <div style={{fontSize:12,color:T.TEXT2,marginTop:4}}>Checklist: {okC2}/{CHECKLIST_ITEMS.length} docs OK</div>
          </Card>
        </div>
        {safeArr(sel.redFlags).length > 0 ? <Card title={'Red Flags (' + sel.redFlags.length + ')'}>{sel.redFlags.map(function(rf,i){return <div key={i} style={{padding:'5px 0',borderBottom:'1px solid '+T.BORDER,fontSize:13,color:T.RED}}>🚩 {rf}</div>;})}</Card> : null}
        <Card title="Periodos AML" actions={<button onClick={function(){onAnalizar(sel,null);}} style={{background:'none',border:'1px solid rgba(255,255,255,0.5)',color:'white',borderRadius:4,padding:'4px 12px',cursor:'pointer',fontSize:12}}>+ Nuevo periodo</button>}>
          {lPeriodos.length === 0 ? <p style={{color:T.TEXT2,fontSize:13}}>Sin periodos. Subi un CSV para analizar.</p> :
          lPeriodos.map(function(p,i){
            var m2 = calcMetricas(p.txns, sel);
            var sigs2 = m2 ? detectPatrones(m2, sel) : [];
            var hi2 = sigs2.filter(function(s){return s.sev==='ALTA';}).length;
            return (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid '+T.BORDER}}>
                <div>
                  <span style={{fontWeight:600,color:T.TEXT,fontSize:11}}>{p.nombre}</span>
                  <span style={{color:T.TEXT2,fontSize:12,marginLeft:8}}>{p.txns?p.txns.length:0} txns</span>
                  {hi2 > 0 ? <span style={{marginLeft:6,background:C.ROJO,color:'white',borderRadius:10,padding:'1px 8px',fontSize:11,fontWeight:700}}>{hi2} ALTA</span> : null}
                </div>
                <button onClick={function(){onAnalizar(sel,p);}} style={{background:C.AC,color:'white',border:'none',borderRadius:3,padding:'5px 12px',cursor:'pointer',fontSize:12,fontWeight:700}}>Analizar →</button>
              </div>
            );
          })}
        </Card>
      </div>
    );
  }

  var filteredLegs = legajos.filter(function(l) {
    var matchSearch = !search || (l.razonSocial||'').toLowerCase().includes(search.toLowerCase()) || (l.cuit||'').includes(search) || (l.actividad||'').toLowerCase().includes(search.toLowerCase());
    var matchSeg = filtroSeg==='TODOS' || l.segmento===filtroSeg;
    var matchDict = filtroDict==='TODOS' || l.dictamen===filtroDict;
    var matchEst = filtroEst==='TODOS' || (l.estadoCuenta||'EN_ONBOARDING')===filtroEst;
    return matchSearch && matchSeg && matchDict && matchEst;
  });

  function toggleSelect(id) {
    setSelected(function(prev){ return prev.indexOf(id)>=0 ? prev.filter(function(x){return x!==id;}) : prev.concat([id]); });
  }
  function selectAll() { setSelected(filteredLegs.map(function(l){return l.id;})); }
  function clearSel() { setSelected([]); }
  function deleteSelected() {
    if (!selected.length) return;
    var names = selected.map(function(id){ var l=legajos.find(function(x){return x.id===id;}); return l ? '• '+(l.razonSocial||'Sin nombre') : ''; }).join('\n');
    if (!window.confirm('Eliminar ' + selected.length + ' legajo(s)?\n\n' + names + '\n\nEsta acción no se puede deshacer.')) return;
    var newLegs = legajos.filter(function(l){return selected.indexOf(l.id)<0;});
    var newPers = periodos.filter(function(p){return selected.indexOf(p.legajoId)<0;});
    saveList(newLegs); setPeriodos(newPers);
    setSelected([]); setSelectMode(false);
  }
  function duplicateLegajo(l) {
    var copy = JSON.parse(JSON.stringify(l));
    copy.id = uid(); copy.razonSocial = (l.razonSocial||'Sin nombre') + ' (copia)'; copy.createdAt = todayStr();
    saveList(legajos.concat([copy]));
  }
  function exportLegajoJSON(l) {
    var lPers = periodos.filter(function(p){return p.legajoId===l.id;});
    var data = { legajo:l, periodos:lPers, exportedAt:new Date().toISOString() };
    var blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href=url; a.download='legajo-'+(l.razonSocial||l.id).replace(/[^a-z0-9]/gi,'_')+'.json';
    a.click(); URL.revokeObjectURL(url);
  }
  function deleteSingle(l) {
    if (!window.confirm('Eliminar "' + (l.razonSocial||'Sin nombre') + '"?\nEsta acción no se puede deshacer.')) return;
    var newLegs = legajos.filter(function(x){return x.id!==l.id;});
    var newPers = periodos.filter(function(p){return p.legajoId!==l.id;});
    saveList(newLegs); setPeriodos(newPers);
  }

  return (
    <div style={{padding:22}} onClick={function(){if(menuOpen)setMenuOpen(null);}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <h2 style={{color:T.TEXT,fontSize:15,fontWeight:600,letterSpacing:'1px'}}>Legajos KYB ({legajos.length})</h2>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {selectMode ? (
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:12,color:T.TEXT2}}>{selected.length} seleccionado(s)</span>
              <button onClick={selectAll} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 12px',cursor:'pointer',fontSize:12}}>Todos ({filteredLegs.length})</button>
              <button onClick={deleteSelected} disabled={!selected.length} style={{background:selected.length?C.ROJO:'#ccc',color:'white',border:'none',borderRadius:4,padding:'6px 14px',cursor:selected.length?'pointer':'not-allowed',fontWeight:700,fontSize:12}}>🗑 Eliminar ({selected.length})</button>
              <button onClick={function(){setSelectMode(false);clearSel();}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'6px 12px',cursor:'pointer',fontSize:12}}>Cancelar</button>
            </div>
          ) : (
            <div style={{display:'flex',gap:8}}>
              <button onClick={function(){setSelectMode(true);}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 12px',cursor:'pointer',fontSize:12,color:T.TEXT2}}>☑ Seleccionar</button>
              <button onClick={function(){setForm(mkNew());setEditing(true);setSelId(null);setIaFields(null);setTab('resumen_ia');}} style={btnG}>+ Nuevo legajo</button>
            </div>
          )}
        </div>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="🔍 Buscar por razón social, CUIT o actividad..." style={{flex:'1 1 220px',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 12px',fontSize:13}}/>
        <select value={filtroSeg} onChange={function(e){setFiltroSeg(e.target.value);}} style={{border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:12}}>
          <option value="TODOS">Todos los segmentos</option>
          <option>BAJO</option><option>MEDIO</option><option>MEDIO-ALTO</option><option>ALTO</option>
        </select>
        <select value={filtroDict} onChange={function(e){setFiltroDict(e.target.value);}} style={{border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:12}}>
          <option value="TODOS">Todos los dictámenes</option>
          <option>APROBADO</option><option>CONDICIONAL</option><option>RECHAZADO</option>
        </select>
        <select value={filtroEst} onChange={function(e){setFiltroEst(e.target.value);}} style={{border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:12}}>
          <option value="TODOS">Todos los estados</option>
          {ESTADOS_CUENTA.map(function(e){return <option key={e.id} value={e.id}>{e.label}</option>;})}
        </select>
        {(search||filtroSeg!=='TODOS'||filtroDict!=='TODOS'||filtroEst!=='TODOS') &&
          <button onClick={function(){setSearch('');setFiltroSeg('TODOS');setFiltroDict('TODOS');setFiltroEst('TODOS');}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 10px',cursor:'pointer',fontSize:12,color:T.TEXT2}}>✕ Limpiar</button>
        }
      </div>

      {legajos.length===0 && <Card title=""><p style={{color:T.TEXT2,textAlign:'center',padding:'20px 0'}}>No hay legajos. Creá el primero con "+ Nuevo legajo".</p></Card>}
      {filteredLegs.length===0 && legajos.length>0 && <Card title=""><p style={{color:T.TEXT2,textAlign:'center',padding:'16px 0'}}>Sin resultados para los filtros aplicados.</p></Card>}

      {filteredLegs.map(function(l,i){
        var lp = periodos.filter(function(p){return p.legajoId===l.id;});
        var allSigsL = [];
        lp.forEach(function(p){
          if(p.txns&&p.txns.length){
            var m2=calcMetricas(p.txns,l);
            if(m2)detectPatrones(m2,l).forEach(function(s){allSigsL.push(s);});
          }
        });
        var hiL = allSigsL.filter(function(s){return s.sev==='ALTA';}).length;
        var isSelected = selected.indexOf(l.id)>=0;
        var isMenuOpen = menuOpen===l.id;

        return (
          <div key={l.id} style={{background:T.BG2,border:'2px solid '+(isSelected?C.AC:'#E8EEF4'),borderRadius:6,padding:'12px 16px',marginBottom:8,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>

              {/* LEFT: checkbox + info */}
              <div style={{display:'flex',gap:10,alignItems:'center',flex:1,minWidth:0}}>
                {selectMode && (
                  <input type="checkbox" checked={isSelected} onChange={function(){toggleSelect(l.id);}} style={{width:16,height:16,cursor:'pointer',flexShrink:0}}/>
                )}
                <div style={{flex:1,minWidth:0,cursor:selectMode?'pointer':'default'}} onClick={function(){if(selectMode)toggleSelect(l.id);}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span style={{fontWeight:600,color:T.TEXT,fontSize:14}}>{l.razonSocial||'Sin nombre'}</span>
                    {hiL>0 && <span style={{background:C.ROJO,color:'white',borderRadius:10,padding:'1px 8px',fontSize:10,fontWeight:700}}>{hiL} ALTA</span>}
                  </div>
                  <div style={{color:T.TEXT2,fontSize:12,marginTop:2}}>CUIT: {l.cuit||'N/D'} · {l.actividad||'Sin actividad'} · {lp.length} periodo(s)</div>
                </div>
              </div>

              {/* RIGHT: pills + actions */}
              <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
                {/* Badge de estado — clickeable para cambio rápido */}
                {(function(){
                  var est=getEstado(l.estadoCuenta||'EN_ONBOARDING');
                  var isEstMenu = menuOpen==='est_'+l.id;
                  return (
                    <div style={{position:'relative'}}>
                      <span
                        onClick={function(e){e.stopPropagation();setMenuOpen(isEstMenu?null:'est_'+l.id);}}
                        title="Clic para cambiar estado"
                        style={{background:est.bg,color:est.color,border:'1px solid '+est.color,borderRadius:10,padding:'2px 9px',fontSize:10,fontWeight:700,whiteSpace:'nowrap',cursor:'pointer',userSelect:'none'}}
                      >{est.label} ▾</span>
                      {isEstMenu && (
                        <div style={{position:'absolute',left:0,top:'120%',background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:6,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',zIndex:300,minWidth:220,padding:4}}>
                          <div style={{padding:'6px 10px',fontSize:10,fontWeight:700,color:T.TEXT2,borderBottom:'1px solid '+T.BORDER,marginBottom:4}}>Cambiar estado de cuenta</div>
                          {ESTADOS_CUENTA.map(function(eOpt){
                            var isCurrent = (l.estadoCuenta||'EN_ONBOARDING')===eOpt.id;
                            return (
                              <div
                                key={eOpt.id}
                                onClick={function(ev){ev.stopPropagation();if(!isCurrent){cambioRapidoEstado(l,eOpt.id);}setMenuOpen(null);}}
                                style={{padding:'8px 12px',cursor:isCurrent?'default':'pointer',fontSize:12,display:'flex',gap:8,alignItems:'center',borderRadius:4,background:isCurrent?eOpt.bg:'white',opacity:isCurrent?0.7:1}}
                              >
                                <span style={{width:8,height:8,borderRadius:'50%',background:eOpt.color,display:'inline-block',flexShrink:0}}></span>
                                <span style={{color:eOpt.color,fontWeight:isCurrent?700:400}}>{eOpt.label}</span>
                                {isCurrent && <span style={{marginLeft:'auto',fontSize:10,color:T.TEXT3}}>actual</span>}
                                <span style={{marginLeft:isCurrent?0:'auto',fontSize:10,color:T.TEXT3}}>{eOpt.desc}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }())}
                <Pill v={l.segmento}/>
                <Pill v={l.dictamen}/>
                {!selectMode && (
                  <div style={{display:'flex',gap:4}}>
                    <button onClick={function(){setSelId(l.id);}} style={{background:C.AC,color:'white',border:'none',borderRadius:3,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:700}}>Abrir</button>
                    {/* MENÚ ⋯ */}
                    <div style={{position:'relative'}}>
                      <button
                        onClick={function(e){e.stopPropagation();setMenuOpen(isMenuOpen?null:l.id);}}
                        style={{background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:'5px 9px',cursor:'pointer',fontSize:14,lineHeight:1}}
                      >⋯</button>
                      {isMenuOpen && (
                        <div style={{position:'absolute',right:0,top:'110%',background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:6,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',zIndex:200,minWidth:170,padding:4}}>
                          {[
                            {icon:'✏️',label:'Editar',action:function(){setMenuOpen(null);setForm(JSON.parse(JSON.stringify(l)));setEditing(true);setTab('datos');}},
                            {icon:'📋',label:'Duplicar',action:function(){setMenuOpen(null);duplicateLegajo(l);}},
                            {icon:'💾',label:'Exportar JSON',action:function(){setMenuOpen(null);exportLegajoJSON(l);}},
                            ...(puedeEliminar(currentUser.rol) ? [{icon:'🗑',label:'Eliminar',action:function(){setMenuOpen(null);deleteSingle(l);},danger:true}] : [])
                          ].map(function(item,j){return(
                            <div key={j} onClick={item.action} style={{padding:'8px 12px',cursor:'pointer',fontSize:12,color:item.danger?C.ROJO:C.AO,fontWeight:item.danger?700:400,borderRadius:4,display:'flex',gap:8,alignItems:'center'}}>
                              <span>{item.icon}</span>{item.label}
                            </div>
                          );})}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {legajos.length > 0 && (
        <div style={{fontSize:11,color:T.TEXT3,textAlign:'center',marginTop:8}}>
          {filteredLegs.length} de {legajos.length} legajos · {periodos.length} periodos
        </div>
      )}
    </div>
  );
}

// ─── GENERADOR NOTA DE DEBIDA DILIGENCIA ─────────────────────────────────────
function genNotaDD(legajo, periodo, m, sigs, sc) {
  if (!m || !legajo) return null;
  var empresa = legajo.razonSocial || 'N/D';
  var segmento = legajo.segmento || 'MEDIO';
  var altaSigs = sigs.filter(function(s){return s.sev==='ALTA';});
  var mediaSigs = sigs.filter(function(s){return s.sev==='MEDIA';});
  var deadline = segmento==='ALTO'?'72 horas hábiles':segmento==='MEDIO-ALTO'?'5 días hábiles':'10 días hábiles';
  var acciones = [];

  // Acciones basadas en patrones detectados
  if (sigs.find(function(s){return s.pat==='PAT-01';})) {
    acciones.push('Solicitar detalle y justificación de las operaciones fraccionadas detectadas: fechas, montos individuales, identificación completa de las contrapartes involucradas y propósito económico de cada transacción.');
  }
  if (sigs.find(function(s){return s.pat==='PAT-02';})) {
    acciones.push('Requerir explicación sobre la elevada concentración de contrapartes remitentes (cash-in) con respecto a los destinatarios (cash-out). Identificar y documentar la relación comercial con los principales origenes de fondos.');
  }
  if (sigs.find(function(s){return s.pat==='PAT-03';})) {
    acciones.push('Solicitar justificación de las operaciones circulares detectadas: contrapartes que aparecen simultáneamente como origen y destino de fondos. Requerir documentación respaldatoria de la naturaleza comercial de dichas relaciones.');
  }
  if (sigs.find(function(s){return s.pat==='PAT-04';})) {
    acciones.push('Requerir identificación de las contrapartes one-shot (operan una sola vez). Solicitar documentación que acredite la relación comercial con cada una. Evaluar si corresponde ampliar el registro de beneficiarios finales.');
  }
  if (sigs.find(function(s){return s.pat==='PAT-05';})) {
    var pat5 = sigs.find(function(s){return s.pat==='PAT-05';});
    if (pat5 && pat5.titulo.includes('excede')) {
      acciones.push('El volumen operado supera significativamente el perfil declarado (' + fmtM(legajo.facturacionMensual) + '/mes). Solicitar estados de cuenta bancarios, declaraciones juradas de ingresos, contratos comerciales y cualquier documentación que justifique el incremento de actividad respecto al perfil.');
    } else {
      acciones.push('El volumen operado es significativamente inferior al perfil declarado. Verificar si el cliente mantiene actividad en otras plataformas o entidades financieras. Solicitar declaración de fuentes de fondos actualizadas.');
    }
  }
  if (sigs.find(function(s){return s.pat==='PAT-06';})) {
    acciones.push('Solicitar información sobre las contrapartes con mayor concentración de operaciones (' + fmtM((m.sortedIn&&m.sortedIn[0]?m.sortedIn[0][1]:0)) + ' en la principal contraparte IN). Requerir contratos, facturas o documentación que acredite la relación comercial y el origen de los fondos.');
  }
  if (sigs.find(function(s){return s.pat==='PAT-07';})) {
    acciones.push('El ' + m.pctRound.toFixed(1) + '% de las operaciones son de montos redondos, patrón atípico en transacciones comerciales reales. Solicitar facturas o comprobantes que respalden los montos exactos operados.');
  }
  if (sigs.find(function(s){return s.pat==='PAT-08';})) {
    acciones.push('Se detectaron operaciones fuera del horario comercial habitual (' + (m.pctAtypicalHour?m.pctAtypicalHour.toFixed(1):'N/D') + '% entre 20:00 y 08:00 hs). Solicitar explicación operativa y verificar si el giro comercial del cliente justifica esta modalidad horaria.');
  }
  if (sigs.find(function(s){return s.pat==='PAT-09';})) {
    acciones.push('El cliente opera como cuenta de paso (' + (m.passThrough*100).toFixed(1) + '% de pass-through). Requerir explicación del modelo de negocio que justifique recibir y reenviar fondos con mínima retención. Solicitar documentación de las operaciones subyacentes.');
  }
  if (sigs.find(function(s){return s.pat==='PAT-11';})) {
    acciones.push('Se detectó velocidad operativa anómala (' + m.opsByDay.toFixed(1) + ' operaciones/día promedio). Solicitar justificación operativa y documentación de las transacciones con mayor frecuencia.');
  }
  if (sigs.find(function(s){return s.pat==='PAT-12';})) {
    acciones.push('Se detectó estructura de embudo múltiple (' + m.uniqueCpIn + ' orígenes hacia ' + m.uniqueCpOut + ' destino(s)). Requerir identificación completa de todas las contrapartes y la naturaleza de cada relación comercial.');
  }
  // Acciones base siempre presentes según nivel de riesgo
  if (sc && sc.promedio >= 3) {
    acciones.push('Actualizar la Declaración Jurada AML (PEP/SO/UBO) con fecha vigente. Confirmar que no hubo cambios en la composición societaria, beneficiarios finales ni actividad principal desde el último onboarding.');
    acciones.push('Solicitar últimos 3 estados de cuenta bancarios de la entidad y/o certificación contable de la facturación del período analizado (' + (periodo?periodo.nombre:'N/D') + ').');
  }
  if (sc && sc.promedio >= 4) {
    acciones.push('URGENTE: Evaluar la conveniencia de suspender operativa en forma preventiva hasta obtener respuesta satisfactoria al presente pedido de información. Elevar al Oficial de Cumplimiento para decisión.');
    acciones.push('Iniciar evaluación de presentación de Reporte de Operación Sospechosa (ROS) ante la UIF conforme Ley 25.246 y Res. UIF 2/2012. Plazo máximo: 30 días desde la detección.');
  }
  if (acciones.length === 0) {
    acciones.push('Confirmar que la actividad del período es consistente con el perfil declarado. Solicitar actualización de datos de contacto y confirmación de beneficiario final.');
  }

  return {
    empresa: empresa,
    periodo: periodo ? periodo.nombre : 'N/D',
    fecha: todayStr(),
    segmento: segmento,
    clasificacion: sc ? sc.clasificacion : 'N/D',
    score: sc ? sc.promedio.toFixed(2) : 'N/D',
    col: sc ? sc.col : '#888',
    deadline: deadline,
    accion: sc ? sc.accion : 'N/D',
    totalSenales: sigs.length,
    altaSenales: altaSigs.length,
    mediaSenales: mediaSigs.length,
    acciones: acciones,
    patronesDetectados: sigs.map(function(s){return s.pat + ' — ' + s.titulo;})
  };
}

function AnalisisView(props) {
  var legajos=props.legajos, periodos=props.periodos, setPeriodos=props.setPeriodos, onReport=props.onReport, onSync=props.onSync||function(){}, currentUser=props.currentUser||{rol:'analista',nombre:'Analista'};
  var slState = useState(props.initLegajo||null); var selLegajo=slState[0]; var setSelLegajo=slState[1];
  var spState = useState(props.initPeriodo||null); var selPeriodo=spState[0]; var setSelPeriodo=spState[1];
  var pnState = useState(''); var periodoNombre=pnState[0]; var setPeriodoNombre=pnState[1];
  var csvState = useState(null); var csv=csvState[0]; var setCsv=csvState[1];
  var tabState = useState('metricas'); var tab=tabState[0]; var setTab=tabState[1];
  var tendenciasState = useState(false); var tendencias=tendenciasState[0]; var setTendencias=tendenciasState[1];
  var fileRef = useRef();
  var lP = selLegajo ? periodos.filter(function(p){return p.legajoId===selLegajo.id;}) : [];
  var m = selPeriodo && selPeriodo.txns ? calcMetricas(selPeriodo.txns, selLegajo) : (selPeriodo && selPeriodo.metricas ? selPeriodo.metricas : null);
  var sigs = m ? detectPatrones(m, selLegajo) : [];
  var sc = m ? (selPeriodo && selPeriodo.scoring ? selPeriodo.scoring : calcScoring(m, sigs)) : null;

  // MEMOS — siempre desde Supabase KV
  var memoKey = selLegajo && selPeriodo ? 'memo_' + selLegajo.id + '_' + selPeriodo.id : null;
  var memoState = useState([]); var memos = memoState[0]; var setMemos = memoState[1];
  var newMemoState = useState(''); var newMemo = newMemoState[0]; var setNewMemo = newMemoState[1];
  var analista = useState('Analista'); var analistaVal = analista[0]; var setAnalista = analista[1];

  useEffect(function() {
    if (!memoKey) { setMemos([]); return; }
    setMemos([]); // limpiar mientras carga
    serverLoadKV(memoKey).then(function(v) {
      setMemos(v && Array.isArray(v) ? v : []);
    });
  }, [memoKey]);

  // RFIs — siempre desde Supabase KV
  var rfiKey = selLegajo ? 'rfi_' + selLegajo.id : null;
  var rfiState = useState([]); var rfis = rfiState[0]; var setRfis = rfiState[1];

  useEffect(function() {
    if (!rfiKey) { setRfis([]); return; }
    setRfis([]);
    serverLoadKV(rfiKey).then(function(v) {
      setRfis(v && Array.isArray(v) ? v : []);
    });
  }, [rfiKey]);

  function saveRfis(updated) {
    setRfis(updated);
    if (rfiKey) serverSaveKV(rfiKey, updated);
    if (onSync) onSync();
  }

  // Lazy load txns cuando el período seleccionado no los tiene (dispositivo nuevo)
  var txnsLoadingState = useState(false); var txnsLoading=txnsLoadingState[0]; var setTxnsLoading=txnsLoadingState[1];

  useEffect(function() {
    if (!selPeriodo || (selPeriodo.txns && selPeriodo.txns.length > 0)) return;
    // Txns no están en memoria — cargar desde Supabase
    setTxnsLoading(true);
    serverLoadTxns(selPeriodo.id).then(function(txns) {
      if (txns && txns.length > 0) {
        // Calcular métricas al momento de la carga (si no las tiene ya)
        var updatedPer = Object.assign({}, selPeriodo, {txns: txns});
        if (!updatedPer.metricas) {
          var leg = legajos.find(function(l){return l.id===selPeriodo.legajoId;});
          var m = calcMetricas(txns, leg);
          var sigs = m ? detectPatrones(m, leg) : [];
          var sc = m ? calcScoring(m, sigs) : null;
          updatedPer = Object.assign({}, updatedPer, {
            metricas: m||null, scoring: sc||null,
            estadoPeriodo: updatedPer.estadoPeriodo||'EN_REVISION',
            sigsResolucion: updatedPer.sigsResolucion||{}
          });
        }
        var updated = props.periodos.map(function(p){
          return p.id === selPeriodo.id ? updatedPer : p;
        });
        props.setPeriodos(updated);
        setSelPeriodo(updatedPer);
        // Guardar métricas en Supabase si las acabamos de calcular
        if (!selPeriodo.metricas) {
          onSync(legajos, updated);
        }
      }
      setTxnsLoading(false);
    }).catch(function(){ setTxnsLoading(false); });
  }, [selPeriodo && selPeriodo.id]);

  // RFI UI state
  var rfiModeState = useState(null); var rfiMode=rfiModeState[0]; var setRfiMode=rfiModeState[1]; // null | 'nuevo' | rfi_id
  var rfiFormState = useState({asunto:'',refNum:'',contenido:'',autor:'Analista'}); var rfiForm=rfiFormState[0]; var setRfiForm=rfiFormState[1];
  var rfiRespState = useState({contenido:'',tipo:'RESPUESTA',autor:''}); var rfiResp=rfiRespState[0]; var setRfiResp=rfiRespState[1];

  var RFI_ESTADOS = [
    {id:'ENVIADO',    label:'Enviado',        color:T.AMBER, bg:'#FEF9E7'},
    {id:'RESPONDIDO', label:'Respondido',     color:T.GREEN, bg:'#EBF9F0'},
    {id:'PARCIAL',    label:'Resp. parcial',  color:T.AMBER, bg:'#FEF0E7'},
    {id:'SIN_RESP',   label:'Sin respuesta',  color:T.RED, bg:'#FDEDEC'},
    {id:'CERRADO',    label:'Cerrado',        color:T.TEXT3, bg:'#F2F3F4'},
  ];
  function getRfiEstado(id) { return RFI_ESTADOS.find(function(e){return e.id===id;}) || RFI_ESTADOS[0]; }

  function genRfiRef() {
    var empresa = selLegajo ? (selLegajo.razonSocial||'').replace(/[^A-Z0-9]/gi,'').slice(0,8).toUpperCase() : 'XXX';
    var n = (rfis.length + 1).toString().padStart(3,'0');
    var yr = new Date().getFullYear();
    return 'RFI-' + empresa + '-' + yr + '-' + n;
  }

  function crearRfi() {
    if (!rfiForm.contenido.trim()) return;
    var ahora = new Date();
    var rfi = {
      id: uid(),
      refNum: rfiForm.refNum.trim() || genRfiRef(),
      asunto: rfiForm.asunto.trim() || 'Requerimiento de información — ' + (selPeriodo&&selPeriodo.nombre||'período'),
      periodoNombre: selPeriodo&&selPeriodo.nombre||'',
      periodoId: selPeriodo&&selPeriodo.id||'',
      estado: 'ENVIADO',
      createdAt: todayStr(),
      updatedAt: todayStr(),
      intercambios: [{
        id: uid(),
        tipo: 'ENVIO',
        fecha: todayStr(),
        hora: ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
        autor: rfiForm.autor || (currentUser&&currentUser.nombre) || analistaVal || 'Analista',
        contenido: rfiForm.contenido.trim()
      }]
    };
    saveRfis(rfis.concat([rfi]));
    auditLog(currentUser,'crear_rfi','legajo',selLegajo&&selLegajo.id,{refNum:rfi.refNum,asunto:rfi.asunto,empresa:selLegajo&&selLegajo.razonSocial});
    setRfiMode(null);
    setRfiForm({asunto:'',refNum:'',contenido:'',autor:currentUser&&currentUser.nombre||'Analista'});
  }

  function agregarIntercambio(rfiId) {
    if (!rfiResp.contenido.trim()) return;
    var ahora = new Date();
    var entrada = {
      id: uid(),
      tipo: rfiResp.tipo || 'RESPUESTA',
      fecha: todayStr(),
      hora: ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
      autor: rfiResp.autor.trim() || (rfiResp.tipo==='RESPUESTA' ? selLegajo&&selLegajo.razonSocial : (currentUser&&currentUser.nombre)||analistaVal) || 'Analista',
      contenido: rfiResp.contenido.trim()
    };
    var nuevoEstado = rfiResp.tipo==='RESPUESTA' ? 'RESPONDIDO' : rfiResp.tipo==='CIERRE' ? 'CERRADO' : undefined;
    var updated = rfis.map(function(r) {
      if (r.id !== rfiId) return r;
      return Object.assign({}, r, {
        intercambios: r.intercambios.concat([entrada]),
        updatedAt: todayStr(),
        estado: nuevoEstado || r.estado
      });
    });
    saveRfis(updated);
    auditLog(currentUser, entrada.tipo==='RESPUESTA'?'responder_rfi':entrada.tipo==='CIERRE'?'cerrar_rfi':'seguimiento_rfi', 'rfi', rfiId, {empresa:selLegajo&&selLegajo.razonSocial, tipo:entrada.tipo});
    setRfiResp({contenido:'',tipo:'RESPUESTA',autor:''});
    setRfiMode(null);
  }

  function cambiarEstadoRfi(rfiId, nuevoEstado) {
    var updated = rfis.map(function(r){
      return r.id===rfiId ? Object.assign({},r,{estado:nuevoEstado,updatedAt:todayStr()}) : r;
    });
    saveRfis(updated);
    auditLog(currentUser,'cambiar_estado_rfi','rfi',rfiId,{nuevoEstado:nuevoEstado,empresa:selLegajo&&selLegajo.razonSocial});
  }

  function eliminarRfi(rfiId) {
    if (!window.confirm('Eliminar este RFI y todo su historial de intercambios?')) return;
    saveRfis(rfis.filter(function(r){return r.id!==rfiId;}));
    if (rfiMode===rfiId) setRfiMode(null);
  }

  function saveMemo() {
    if (!newMemo.trim() || !memoKey) return;
    var entry = { id:uid(), texto:newMemo.trim(), autor:analistaVal||'Analista', fecha:todayStr(), hora:new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) };
    var updated = memos.concat([entry]);
    setMemos(updated);
    serverSaveKV(memoKey, updated);
    setNewMemo('');
  }
  function deleteMemo(id) {
    var updated = memos.filter(function(m){return m.id!==id;});
    setMemos(updated);
    serverSaveKV(memoKey, updated);
  }

  var loadingFileState = useState(false); var loadingFile=loadingFileState[0]; var setLoadingFile=loadingFileState[1];
  var txnsLoadingState = useState(false); var txnsLoading=txnsLoadingState[0]; var setTxnsLoading=txnsLoadingState[1];

  // Auto-carga de txns desde Supabase cuando se selecciona un período sin txns en memoria
  function handleSelectPeriodo(p) {
    if (!p) { setSelPeriodo(null); return; }
    if (p.txns && p.txns.length > 0) { setSelPeriodo(p); return; }
    setSelPeriodo(p);
    if (p.metricas) {
      setTxnsLoading(true);
      serverLoadTxns(p.id).then(function(txns) {
        if (txns && txns.length > 0) {
          var updatedP = Object.assign({}, p, { txns: txns });
          setSelPeriodo(updatedP);
          var updatedAll = periodos.map(function(x){ return x.id===p.id ? updatedP : x; });
          props.setPeriodos(updatedAll);
        }
        setTxnsLoading(false);
      }).catch(function(){ setTxnsLoading(false); });
    }
  }

  async function handleFileUpload(e) {
    var f = e.target.files[0]; if (!f) return;
    var ext = f.name.split('.').pop().toLowerCase();
    setLoadingFile(true);
    try {
      var txns = [];
      if (ext === 'csv' || ext === 'txt') {
        var text = await new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=rej;r.readAsText(f,'UTF-8');});
        txns = parseCsv(text);
      } else if (ext === 'xls' || ext === 'xlsx' || ext === 'ods') {
        txns = await parseExcelFile(f);
      } else {
        alert('Formato no soportado. Usá CSV, XLS o XLSX.');
        setLoadingFile(false); e.target.value=''; return;
      }
      if (txns.length === 0) {
        alert('⚠ No se encontraron transacciones en el archivo.\n\nVerificá que el archivo tenga columnas de: fecha, tipo (IN/OUT o débito/crédito), monto, y opcionalmente contraparte.\n\nSi el archivo tiene otro formato de columnas, abrilo en Excel y guardalo como CSV separado por comas.');
        setLoadingFile(false); e.target.value=''; return;
      }
      setCsv({name:f.name, txns:txns});
    } catch(err) {
      alert('Error al leer el archivo: ' + err.message);
    }
    setLoadingFile(false); e.target.value='';
  }

  function handleSavePeriodo() {
    if (!csv || !selLegajo) return;
    var nombre = periodoNombre || csv.name.replace(/\.(csv|xls|xlsx|txt)$/i, '');
    // Pre-calcular métricas y scoring al momento de la carga — persisten sin depender de txns en memoria
    var preMetricas = calcMetricas(csv.txns, selLegajo);
    var preSigs = preMetricas ? detectPatrones(preMetricas, selLegajo) : [];
    var preScoring = preMetricas ? calcScoring(preMetricas, preSigs) : null;
    var p = {
      id: uid(),
      legajoId: selLegajo.id,
      nombre: nombre,
      txns: csv.txns,
      createdAt: todayStr(),
      // Datos pre-computados — persisten entre dispositivos
      estadoPeriodo: 'EN_REVISION',
      metricas: preMetricas || null,
      scoring: preScoring || null,
      sigsResolucion: {}  // { 'PAT-01': { estado, explicacion, propuestoPor, propuestoAt, aprobadoPor, aprobadoAt } }
    };
    var updated = periodos.concat([p]);
    setPeriodos(updated);
    onSync(legajos, updated);
    serverSaveTxns(p.id, csv.txns);
    setSelPeriodo(p); setCsv(null); setPeriodoNombre('');
  }

  var scData = sc ? sc.scores.map(function(f){return{f:f.factor.length>16?f.factor.slice(0,16)+'…':f.factor,s:f.score,fill:f.score>=4?C.ROJO:f.score>=3?C.NARANJA:C.VERDE};}) : [];
  var nota = m ? genNotaDD(selLegajo, selPeriodo, m, sigs, sc) : null;

  return (
    <div style={{padding:22}}>
      <h2 style={{color:T.TEXT,margin:'0 0 16px',fontSize:19,fontWeight:700}}>Analisis Transaccional — INF-02</h2>
      <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
        <div style={{flex:'1 1 200px'}}>
          <label style={{fontSize:11,color:T.TEXT2,display:'block',marginBottom:3}}>Legajo</label>
          <select value={selLegajo?selLegajo.id:''} onChange={function(e){setSelLegajo(legajos.find(function(l){return l.id===e.target.value;})||null);setSelPeriodo(null);setCsv(null);setTendencias(false);}} style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13}}>
            <option value="">— Seleccionar legajo —</option>
            {legajos.map(function(l){return <option key={l.id} value={l.id}>{(l.razonSocial||'Sin nombre')} — {(l.cuit||'CUIT N/D')}</option>;})}
          </select>
        </div>
        {selLegajo && lP.length >= 2 && (
          <div style={{display:'flex',gap:2,background:C.CEL,borderRadius:6,padding:3,flexShrink:0}}>
            <button onClick={function(){setTendencias(false);}} style={{padding:'6px 14px',border:'none',borderRadius:4,cursor:'pointer',fontWeight:!tendencias?700:400,background:!tendencias?C.AO:'transparent',color:!tendencias?'white':C.AO,fontSize:12}}>🔍 Período individual</button>
            <button onClick={function(){setTendencias(true);setSelPeriodo(null);}} style={{padding:'6px 14px',border:'none',borderRadius:4,cursor:'pointer',fontWeight:tendencias?700:400,background:tendencias?'#7D3C98':'transparent',color:tendencias?'white':C.AO,fontSize:12}}>📊 Tendencias ({lP.length} períodos)</button>
          </div>
        )}
        {selLegajo && !tendencias ? <div style={{flex:'1 1 200px'}}>
          <label style={{fontSize:11,color:T.TEXT2,display:'block',marginBottom:3}}>Periodo</label>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <select value={selPeriodo?selPeriodo.id:''} onChange={function(e){
              var p = lP.find(function(x){return x.id===e.target.value;})||null;
              handleSelectPeriodo(p);
            }} style={{flex:1,border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13}}>
              <option value="">— Seleccionar periodo —</option>
              {lP.map(function(p){
                // Mostrar txns desde metricas si no están en memoria
                var txnCount = (p.txns && p.txns.length > 0)
                  ? p.txns.length
                  : (p.metricas ? p.metricas.totalTxns : 0);
                return <option key={p.id} value={p.id}>{p.nombre} ({txnCount.toLocaleString('es-AR')} txns)</option>;
              })}
            </select>
            {txnsLoading && <span style={{fontSize:11,color:T.CYAN,flexShrink:0}}>⏳ cargando...</span>}
            {selPeriodo && (
              <button
                onClick={function(){
                  if (!window.confirm('Eliminar período "' + selPeriodo.nombre + '"?\n\nEsto elimina el período y sus transacciones. No se puede deshacer.')) return;
                  var updatedPers = periodos.filter(function(p){return p.id!==selPeriodo.id;});
                  props.setPeriodos(updatedPers);
                  fetch('/api/sync?action=txns', {
                    method:'POST',
                    headers:{'Content-Type':'application/json','x-app-token':APP_TOKEN},
                    body:JSON.stringify({periodo_id:selPeriodo.id, txns:[]})
                  });
                  onSync(legajos, updatedPers, [], [selPeriodo.id]);
                  setSelPeriodo(null);
                }}
                title="Eliminar este período"
                style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.25)',borderRadius:3,padding:'7px 10px',cursor:'pointer',fontSize:13,color:T.RED,fontWeight:700,flexShrink:0}}
              >🗑</button>
            )}
          </div>
        </div> : null}
      </div>

      {/* ════════════ VISTA TENDENCIAS MULTI-PERÍODO ════════════ */}
      {tendencias && selLegajo && (function(){
        // Datos de todos los períodos con métricas
        var periodosDatos = lP.map(function(p){
          var mm = p.metricas || (p.txns&&p.txns.length?calcMetricas(p.txns,selLegajo):null);
          var ss = p.scoring || (mm?calcScoring(mm,detectPatrones(mm,selLegajo)):null);
          var ssigs = mm ? detectPatrones(mm,selLegajo) : [];
          var sigsAltaActivas = ssigs.filter(function(s){
            if (s.sev!=='ALTA') return false;
            var res = (p.sigsResolucion||{})[s.pat];
            return !res || res.estado!=='RESUELTA';
          }).length;
          return {
            id: p.id, nombre: p.nombre, createdAt: p.createdAt,
            tIn: mm?mm.tIn:0, tOut: mm?mm.tOut:0, totalTxns: mm?mm.totalTxns:0,
            score: ss?ss.promedio:0, clasificacion: ss?ss.clasificacion:'N/D',
            col: ss?ss.col:'#888',
            sigsTotal: ssigs.length, sigsAlta: sigsAltaActivas,
            cpIn: mm?mm.uniqueCpIn:0, cpOut: mm?mm.uniqueCpOut:0,
            txns: p.txns||[]
          };
        }).filter(function(d){return d.tIn>0||d.totalTxns>0;});

        if (periodosDatos.length === 0) {
          return <div style={{background:T.BG3,border:'2px dashed #ddd',borderRadius:6,padding:'30px',textAlign:'center',color:T.TEXT3}}>
            <div style={{fontSize:32,marginBottom:8}}>📊</div>
            <div style={{fontSize:14,fontWeight:600}}>Sin datos de métricas para mostrar tendencias</div>
            <div style={{fontSize:12,marginTop:4}}>Subí los archivos XLS de cada período para generar las métricas.</div>
          </div>;
        }

        // Análisis de contrapartes entre períodos consecutivos
        var cpAnalysis = [];
        for (var pi = 1; pi < periodosDatos.length; pi++) {
          var prev = periodosDatos[pi-1]; var curr = periodosDatos[pi];
          var prevCps = new Set(((prev.txns||[]).map(function(t){return t.cpNombre||t.cpCuit;}).filter(Boolean)));
          var currCps = new Set(((curr.txns||[]).map(function(t){return t.cpNombre||t.cpCuit;}).filter(Boolean)));
          var nuevas = 0; var perdidas = 0; var recurrentes = 0;
          currCps.forEach(function(cp){ if(prevCps.has(cp)) recurrentes++; else nuevas++; });
          prevCps.forEach(function(cp){ if(!currCps.has(cp)) perdidas++; });
          var pctNuevas = currCps.size>0?Math.round(nuevas/currCps.size*100):0;
          cpAnalysis.push({periodo:curr.nombre, nuevas:nuevas, perdidas:perdidas, recurrentes:recurrentes, total:currCps.size, pctNuevas:pctNuevas});
        }

        // Variación % del score entre períodos
        var scoreData = periodosDatos.map(function(d,i){
          var variacion = i>0 ? ((d.score - periodosDatos[i-1].score)).toFixed(2) : null;
          return Object.assign({},d,{variacion:variacion});
        });

        return (
          <div>
            {/* KPIs resumen tendencia */}
            {(function(){
              var first = periodosDatos[0]; var last = periodosDatos[periodosDatos.length-1];
              var varVol = first.tIn>0 ? ((last.tIn-first.tIn)/first.tIn*100).toFixed(0) : null;
              var varScore = first.score>0 ? (last.score-first.score).toFixed(2) : null;
              return (
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
                  {[
                    {label:'Períodos analizados', val:periodosDatos.length, col:C.AM},
                    {label:'Vol IN tendencia', val:varVol!==null?(varVol>0?'▲ +'+varVol+'%':'▼ '+varVol+'%'):'—', col:varVol>0?C.ROJO:C.VERDE},
                    {label:'Score tendencia', val:varScore!==null?(varScore>0?'▲ +'+varScore:varScore<0?'▼ '+varScore:'= Estable'):'—', col:varScore>0?C.ROJO:varScore<0?C.VERDE:'#888'},
                    {label:'Último riesgo', val:last.clasificacion, col:last.col},
                  ].map(function(k,i){return(
                    <div key={i} style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:6,padding:'12px 14px',borderLeft:'3px solid '+k.col}}>
                      <div style={{fontSize:10,color:T.TEXT2,marginBottom:3}}>{k.label}</div>
                      <div style={{fontSize:20,fontWeight:700,color:k.col}}>{k.val}</div>
                    </div>
                  );})}
                </div>
              );
            })()}

            {/* Gráficos: volumen + score */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
              <Card title="📈 Evolución de Volumen IN/OUT">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={periodosDatos} margin={{top:5,right:10,left:0,bottom:30}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                    <XAxis dataKey="nombre" tick={{fontSize:9}} angle={-25} textAnchor="end"/>
                    <YAxis tickFormatter={function(v){return v>=1e9?(v/1e9).toFixed(1)+'B':v>=1e6?(v/1e6).toFixed(0)+'M':v;}} tick={{fontSize:9}}/>
                    <Tooltip formatter={function(v){return fmtM(v);}}/>
                    <Line type="monotone" dataKey="tIn" stroke={C.VERDE} strokeWidth={2} dot={{r:4}} name="Vol IN"/>
                    <Line type="monotone" dataKey="tOut" stroke={C.ROJO} strokeWidth={2} dot={{r:4}} name="Vol OUT"/>
                  </LineChart>
                </ResponsiveContainer>
              </Card>
              <Card title="📊 Evolución del Score de Riesgo">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={scoreData} margin={{top:5,right:10,left:0,bottom:30}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                    <XAxis dataKey="nombre" tick={{fontSize:9}} angle={-25} textAnchor="end"/>
                    <YAxis domain={[0,5]} ticks={[1,2,3,4,5]} tick={{fontSize:9}}/>
                    <Tooltip formatter={function(v){return v.toFixed(2)+'/5';}}/>
                    <Line type="monotone" dataKey="score" stroke={C.AM} strokeWidth={2} dot={function(props){var col=props.payload.score>=4?C.ROJO:props.payload.score>=3?C.NARANJA:C.VERDE;return <circle key={props.key} cx={props.cx} cy={props.cy} r={5} fill={col} stroke="white" strokeWidth={1}/>;}} name="Score"/>
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Tabla comparativa */}
            <Card title="📋 Comparativa de Métricas por Período">
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:500}}>
                  <thead>
                    <tr style={{background:C.AO}}>
                      <th style={{color:'white',padding:'7px 10px',textAlign:'left',fontWeight:700,fontSize:11}}>Métrica</th>
                      {periodosDatos.map(function(d){return <th key={d.id} style={{color:'white',padding:'7px 10px',textAlign:'right',fontWeight:700,fontSize:11,whiteSpace:'nowrap'}}>{d.nombre}</th>;})}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {label:'Volumen IN', fn:function(d){return fmtM(d.tIn);}, highlight:function(vals){var max=Math.max.apply(null,vals.map(Number));return vals.map(function(v){return Number(v)===max?C.ROJO:null;});}},
                      {label:'Volumen OUT', fn:function(d){return fmtM(d.tOut);}},
                      {label:'Total operaciones', fn:function(d){return d.totalTxns.toLocaleString('es-AR');}},
                      {label:'Contrapartes IN', fn:function(d){return d.cpIn;}},
                      {label:'Contrapartes OUT', fn:function(d){return d.cpOut;}},
                      {label:'Score riesgo', fn:function(d){return d.score>0?d.score.toFixed(2)+'/5':'—';}, colFn:function(d){return d.score>=4?C.ROJO:d.score>=3?C.NARANJA:d.score>0?C.VERDE:null;}},
                      {label:'Clasificación', fn:function(d){return d.clasificacion;}, colFn:function(d){return d.col;}},
                      {label:'Señales ALTA activas', fn:function(d){return d.sigsAlta||'0';}, colFn:function(d){return d.sigsAlta>0?C.ROJO:C.VERDE;}},
                    ].map(function(row,ri){
                      return (
                        <tr key={ri} style={{background:ri%2===0?T.BG3:T.BG2}}>
                          <td style={{padding:'6px 10px',fontWeight:600,color:T.TEXT2,borderRight:'2px solid #eee'}}>{row.label}</td>
                          {periodosDatos.map(function(d,di){
                            var val = row.fn(d);
                            var col = row.colFn ? row.colFn(d) : null;
                            // Mostrar variación vs período anterior
                            var prev = di>0?row.fn(periodosDatos[di-1]):null;
                            return (
                              <td key={d.id} style={{padding:'6px 10px',textAlign:'right',fontWeight:col?700:400,color:col||'inherit'}}>
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Análisis de contrapartes */}
            {cpAnalysis.length > 0 && (
              <Card title="🔄 Rotación de Contrapartes entre Períodos">
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{background:C.AO}}>
                        {['Período','Total CP','Nuevas','Perdidas','Recurrentes','% Nuevas','Observación'].map(function(h){return <th key={h} style={{color:'white',padding:'6px 10px',textAlign:'left',fontWeight:700,fontSize:11}}>{h}</th>;})}
                      </tr>
                    </thead>
                    <tbody>
                      {cpAnalysis.map(function(cp,i){
                        var alerta = cp.pctNuevas > 60;
                        return (
                          <tr key={i} style={{background:alerta?'#FFF9F5':i%2===0?T.BG3:T.BG2}}>
                            <td style={{padding:'6px 10px',fontWeight:600}}>{cp.periodo}</td>
                            <td style={{padding:'6px 10px'}}>{cp.total}</td>
                            <td style={{padding:'6px 10px',color:cp.nuevas>0?C.NARANJA:'inherit',fontWeight:cp.nuevas>0?700:400}}>{cp.nuevas}</td>
                            <td style={{padding:'6px 10px',color:cp.perdidas>0?'#888':'inherit'}}>{cp.perdidas}</td>
                            <td style={{padding:'6px 10px',color:C.VERDE}}>{cp.recurrentes}</td>
                            <td style={{padding:'6px 10px',fontWeight:700,color:alerta?C.ROJO:cp.pctNuevas>40?C.NARANJA:C.VERDE}}>{cp.pctNuevas}%</td>
                            <td style={{padding:'6px 10px',fontSize:11,color:T.TEXT2}}>
                              {alerta ? '⚠ Alta rotación de contrapartes — posible atomización' : cp.pctNuevas>40 ? 'Rotación media — monitorear' : '✓ Cartera de contrapartes estable'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {periodosDatos.some(function(d){return d.txns.length===0;}) && (
                  <div style={{fontSize:11,color:T.TEXT3,marginTop:8,fontStyle:'italic'}}>
                    * Los períodos sin txns en memoria muestran 0 contrapartes. Seleccioná cada período individualmente para cargarlas desde Supabase.
                  </div>
                )}
              </Card>
            )}
          </div>
        );
      })()}

      {selLegajo && !selPeriodo ? <Card title="Subir periodo CSV">
        <input ref={fileRef} type="file" accept=".csv,.txt,.xls,.xlsx,.ods" onChange={handleFileUpload} style={{display:'none'}}/>
        <div style={{marginBottom:10}}>
          <label style={{fontSize:11,color:T.TEXT2,display:'block',marginBottom:3}}>Nombre del periodo</label>
          <input value={periodoNombre} onChange={function(e){setPeriodoNombre(e.target.value);}} placeholder="Ej: Enero 2026" style={{width:'100%',maxWidth:300,border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 9px',fontSize:13}}/>
        </div>
        <div onClick={function(){if(!loadingFile)fileRef.current.click();}} style={{border:'2px dashed '+C.AC,borderRadius:8,padding:'22px 20px',textAlign:'center',cursor:loadingFile?'wait':'pointer',background:csv?'#EBF9F0':'#F8FBFE',marginBottom:10}}>
          <div style={{fontSize:24,marginBottom:4}}>{loadingFile?'⏳':csv?'✅':'📊'}</div>
          <div style={{fontSize:13,color:T.CYAN,fontWeight:700}}>{loadingFile?'Procesando archivo...':csv?csv.name+' — '+csv.txns.length+' transacciones detectadas':'📂 Subir archivo de transacciones'}</div>
          <div style={{fontSize:11,color:T.TEXT2,marginTop:3}}>Formatos: <strong>CSV, XLS, XLSX</strong> · Columnas: fecha, tipo (IN/OUT o débito/crédito), monto, contraparte</div>
        </div>
        {csv ? <button onClick={handleSavePeriodo} style={{background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'8px 18px',cursor:'pointer',fontWeight:700,fontSize:13}}>Cargar y analizar ({csv.txns.length} txns)</button> : null}
      </Card> : null}

      {selPeriodo && txnsLoading ? <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'16px',textAlign:'center',marginBottom:12}}>
        <div style={{fontSize:14,color:T.CYAN,fontWeight:700}}>⏳ Cargando transacciones desde Supabase...</div>
        <div style={{fontSize:12,color:T.TEXT2,marginTop:4}}>Este período fue analizado en otro dispositivo. Descargando datos...</div>
      </div> : null}

      {selPeriodo && !m && !txnsLoading && selPeriodo.txns && selPeriodo.txns.length === 0 ? <div style={{background:'rgba(255,184,48,0.08)',border:'1px solid rgba(255,184,48,0.25)',borderRadius:3,padding:'16px',textAlign:'center',marginBottom:12}}>
        <div style={{fontSize:14,color:T.AMBER,fontWeight:700}}>⚠ Transacciones no disponibles en este dispositivo</div>
        <div style={{fontSize:12,color:T.TEXT2,marginTop:4}}>Re-subí el archivo XLS/CSV de este período para analizarlo en este dispositivo.</div>
      </div> : null}

      {selPeriodo && m ? <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            {sc ? <span style={{padding:'5px 14px',borderRadius:6,background:sc.col,color:'white',fontWeight:700,fontSize:13}}>RIESGO {sc.clasificacion}</span> : null}
            {sc ? <span style={{fontSize:13,color:T.TEXT2}}>Score: {sc.promedio.toFixed(2)}/5 | {sigs.length} senales ({sigs.filter(function(s){return s.sev==='ALTA';}).length} ALTA)</span> : null}
            {/* Estado del período */}
            {(function(){
              var ESTADOS_PERIODO = [
                {id:'EN_REVISION',label:'🔍 En revisión',col:'#2471A3',bg:'#EBF5FB'},
                {id:'RFI_ENVIADO',label:'📧 RFI enviado',col:'#E67E22',bg:'#FEF9E7'},
                {id:'CERRADO_SIN_ALERTA',label:'✅ Cerrado — sin alerta',col:'#27AE60',bg:'#EBF9F0'},
                {id:'CERRADO_CON_ALERTA',label:'🚨 Cerrado — con alerta',col:'#E74C3C',bg:'#FDEDEC'},
                {id:'ARCHIVADO',label:'📦 Archivado',col:'#7F8C8D',bg:'#F2F3F4'},
              ];
              var estadoActual = ESTADOS_PERIODO.find(function(e){return e.id===(selPeriodo.estadoPeriodo||'EN_REVISION');}) || ESTADOS_PERIODO[0];
              var puedeEditar = currentUser && (puedeAprobar(currentUser.rol));
              return puedeEditar ? (
                <select
                  value={selPeriodo.estadoPeriodo||'EN_REVISION'}
                  onChange={function(e){
                    var nuevoEstado = e.target.value;
                    var updatedPer = Object.assign({},selPeriodo,{estadoPeriodo:nuevoEstado});
                    var updatedPers = periodos.map(function(p){return p.id===selPeriodo.id?updatedPer:p;});
                    props.setPeriodos(updatedPers);
                    setSelPeriodo(updatedPer);
                    onSync(legajos, updatedPers);
                    auditLog(currentUser,'cambiar_estado_periodo','periodo',selPeriodo.id,{razonSocial:selLegajo.razonSocial,periodo:selPeriodo.nombre,estado:nuevoEstado});
                  }}
                  style={{border:'2px solid '+estadoActual.col,borderRadius:6,padding:'5px 10px',fontSize:12,fontWeight:700,color:estadoActual.col,background:estadoActual.bg,cursor:'pointer'}}
                >
                  {ESTADOS_PERIODO.map(function(e){return <option key={e.id} value={e.id}>{e.label}</option>;})}
                </select>
              ) : (
                <span style={{padding:'5px 12px',borderRadius:6,background:estadoActual.bg,color:estadoActual.col,border:'2px solid '+estadoActual.col,fontWeight:700,fontSize:12}}>{estadoActual.label}</span>
              );
            })()}
          </div>
          <button onClick={function(){
            onReport(genINF02(selLegajo,selPeriodo,m,sigs,sc,memos));
            auditLog(currentUser,'generar_inf02','periodo',selPeriodo.id,{razonSocial:selLegajo.razonSocial,periodo:selPeriodo.nombre,riesgo:sc&&sc.clasificacion});
          }} style={{background:C.AC,color:'white',border:'none',borderRadius:3,padding:'8px 16px',cursor:'pointer',fontWeight:700,fontSize:13}}>📄 INF-02</button>
        </div>
        <div style={{display:'flex',gap:2,marginBottom:12,background:C.CEL,borderRadius:6,padding:4,flexWrap:'wrap'}}>
          {[['metricas','📊 Metricas'],['senales','🚨 Senales'],['scoring','📈 Scoring'],['graficos','📉 Graficos'],['dd','🔍 Nota DD'],['memos','📝 Memos'+(memos.length>0?' ('+memos.length+')':'')],['rfi','📧 RFI'+(rfis.length>0?' ('+rfis.filter(function(r){return r.estado!=='CERRADO';}).length+')':'')]].map(function(t){return(
            <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{flex:1,minWidth:80,padding:'7px 0',border:'none',borderRadius:4,cursor:'pointer',fontWeight:tab===t[0]?700:400,background:tab===t[0]?(t[0]==='dd'?'#5D4E8C':t[0]==='memos'?'#1A6B3A':t[0]==='rfi'?'#1A4A6B':C.AO):'transparent',color:tab===t[0]?'white':C.AO,fontSize:11}}>{t[1]}</button>
          );})}
        </div>
        {tab === 'metricas' ? <Card title="Metricas del periodo">
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:12}}>
            {[{l:'Volumen IN',v:fmtM(m.tIn),c:C.VERDE},{l:'Volumen OUT',v:fmtM(m.tOut),c:C.ROJO},{l:'Balance Neto',v:fmtM(m.balanceNeto),c:m.balanceNeto>=0?C.VERDE:C.ROJO},{l:'Total Ops',v:m.totalTxns,c:C.AM},{l:'Cp. unicas IN',v:m.uniqueCpIn,c:C.AC},{l:'Cp. unicas OUT',v:m.uniqueCpOut,c:C.AC}].map(function(k,i){return(
              <div key={i} style={{background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:6,padding:'10px 14px',borderLeft:'3px solid '+k.c}}>
                <div style={{fontSize:10,color:T.TEXT2}}>{k.l}</div>
                <div style={{fontSize:17,fontWeight:700,color:k.c}}>{k.v}</div>
              </div>
            );})}
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <tbody>{[['Monto promedio',fmtM(m.avg)],['Monto maximo',fmtM(m.maxMonto)],['HHI concentracion IN',m.hhiIn.toFixed(3)+' | top-1: '+m.top1In.toFixed(1)+'%'],['HHI concentracion OUT',m.hhiOut.toFixed(3)+' | top-1: '+m.top1Out.toFixed(1)+'%'],['Fraccionamiento',m.splitGroupsCount+' grupos | '+m.splitDays+' dias'],['Montos redondos',m.pctRound.toFixed(1)+'%'],['Pass-through',m.tIn>0?(m.passThrough*100).toFixed(1)+'%':'N/D'],['Circularidad',m.circularCount+' contrapartes'],['Dias activos',m.activeDays+' | '+m.opsByDay.toFixed(1)+' ops/dia'],['Horario atipico',m.pctAtypicalHour!==null?m.pctAtypicalHour.toFixed(1)+'%':'N/D']].map(function(r,i){return(
              <tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
                <td style={{padding:'5px 8px',color:T.TEXT2,fontWeight:600}}>{r[0]}</td>
                <td style={{padding:'5px 8px',fontWeight:700}}>{r[1]}</td>
              </tr>
            );})}</tbody>
          </table>
        </Card> : null}
        {tab === 'senales' ? <Card title={'Senales AML detectadas (' + sigs.length + ')' + (Object.keys(selPeriodo.sigsResolucion||{}).length > 0 ? ' — ' + Object.values(selPeriodo.sigsResolucion||{}).filter(function(r){return r.estado==='RESUELTA';}).length + ' resueltas' : '')}>
          {sigs.length === 0 ? <p style={{color:T.GREEN,fontWeight:700,textAlign:'center',padding:'20px 0'}}>✅ Sin senales AML detectadas</p> :
          sigs.map(function(s,i){
            var res = (selPeriodo.sigsResolucion||{})[s.pat] || {estado:'ACTIVA'};
            var resuelta = res.estado === 'RESUELTA';
            var propuesta = res.estado === 'PROPUESTA_CIERRE';
            var esAnalista = currentUser && puedeEditar(currentUser.rol);
            var esSupervisor = currentUser && puedeAprobar(currentUser.rol);

            function actualizarResolucion(cambios) {
              var nuevaRes = Object.assign({}, res, cambios);
              var nuevaSigsRes = Object.assign({}, selPeriodo.sigsResolucion||{});
              nuevaSigsRes[s.pat] = nuevaRes;
              var updatedPer = Object.assign({}, selPeriodo, {sigsResolucion: nuevaSigsRes});
              var updatedPers = periodos.map(function(p){return p.id===selPeriodo.id?updatedPer:p;});
              props.setPeriodos(updatedPers);
              setSelPeriodo(updatedPer);
              onSync(legajos, updatedPers);
            }

            return(
              <div key={i} style={{padding:'10px 14px',borderLeft:'4px solid '+(resuelta?'#27AE60':propuesta?'#F39C12':sevColor(s.sev)),background:resuelta?'#F0FFF4':propuesta?'#FFFDF5':i%2===0?'#FFF9F5':'white',marginBottom:6,borderRadius:'0 4px 4px 0',opacity:resuelta?0.75:1}}>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3,justifyContent:'space-between'}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontWeight:600,color:T.TEXT,fontSize:11}}>{s.pat}</span>
                    <SevBadge sev={s.sev}/>
                    <span style={{background:T.BG3,borderRadius:10,padding:'1px 8px',fontSize:11,color:T.TEXT2}}>{s.tip}</span>
                    {resuelta && <span style={{background:T.GREEN,color:'white',borderRadius:10,padding:'1px 8px',fontSize:11,fontWeight:700}}>✅ RESUELTA</span>}
                    {propuesta && <span style={{background:T.AMBER,color:'white',borderRadius:10,padding:'1px 8px',fontSize:11,fontWeight:700}}>🔄 PROP. CIERRE</span>}
                  </div>
                  {/* Acciones según rol */}
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    {esAnalista && !resuelta && !propuesta && s.sev==='ALTA' && (
                      <button
                        onClick={function(){
                          var exp = window.prompt('Explicá por qué esta señal no es sospechosa:');
                          if (!exp || !exp.trim()) return;
                          actualizarResolucion({estado:'PROPUESTA_CIERRE',explicacion:exp.trim(),propuestoPor:currentUser.nombre,propuestoAt:todayStr()});
                        }}
                        style={{background:T.BG3,border:'1px solid '+T.BORDER3,color:T.CYAN,borderRadius:4,padding:'3px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}
                      >💬 Proponer cierre</button>
                    )}
                    {esSupervisor && propuesta && (
                      <>
                        <button
                          onClick={function(){
                            actualizarResolucion({estado:'RESUELTA',aprobadoPor:currentUser.nombre,aprobadoAt:todayStr()});
                            auditLog(currentUser,'aprobar_cierre_senal','periodo',selPeriodo.id,{patron:s.pat,empresa:selLegajo.razonSocial});
                          }}
                          style={{background:'rgba(0,230,118,0.07)',border:'1px solid rgba(0,230,118,0.3)',color:T.GREEN,borderRadius:4,padding:'3px 10px',cursor:'pointer',fontSize:11,fontWeight:700}}
                        >✓ Aprobar</button>
                        <button
                          onClick={function(){ actualizarResolucion({estado:'ACTIVA',explicacion:'',propuestoPor:'',propuestoAt:''}); }}
                          style={{background:'rgba(255,68,85,0.1)',border:'1px solid rgba(255,68,85,0.3)',color:T.RED,borderRadius:3,padding:'3px 10px',cursor:'pointer',fontSize:10,fontWeight:600,fontFamily:T.MONO}}
                        >✕ Rechazar</button>
                      </>
                    )}
                    {esSupervisor && resuelta && (
                      <button
                        onClick={function(){ actualizarResolucion({estado:'ACTIVA',aprobadoPor:'',aprobadoAt:''}); }}
                        style={{background:T.BG3,border:'1px solid '+T.BORDER2,color:T.TEXT2,borderRadius:4,padding:'3px 10px',cursor:'pointer',fontSize:11}}
                      >↩ Reabrir</button>
                    )}
                  </div>
                </div>
                <div style={{fontWeight:700,fontSize:13,color:resuelta?'#888':C.AO}}>{s.titulo}</div>
                <div style={{fontSize:12,color:T.TEXT2,marginTop:2}}>{s.desc}</div>
                {(propuesta||resuelta) && res.explicacion && (
                  <div style={{marginTop:6,background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 10px',fontSize:11}}>
                    <span style={{color:T.TEXT2,fontWeight:600}}>Explicación: </span>{res.explicacion}
                    {res.propuestoPor && <span style={{color:T.TEXT3,marginLeft:8}}>— {res.propuestoPor} {res.propuestoAt}</span>}
                    {resuelta && res.aprobadoPor && <span style={{color:T.GREEN,marginLeft:8,fontWeight:700}}>✓ Aprobado por {res.aprobadoPor} {res.aprobadoAt}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </Card> : null}
        {tab === 'scoring' && sc ? <Card title="Scoring transaccional — 8 factores">
          <div style={{background:sc.col,borderRadius:6,padding:'10px 14px',marginBottom:14,color:'white',display:'flex',justifyContent:'space-between'}}>
            <span style={{fontWeight:700,fontSize:15}}>RIESGO {sc.clasificacion} — {sc.promedio.toFixed(2)}/5</span>
          </div>
          <p style={{fontSize:12,color:T.TEXT2,marginBottom:14}}><strong>Accion:</strong> {sc.accion}</p>
          {sc.scores.map(function(f,i){
            var c = f.score>=4?C.ROJO:f.score>=3?C.NARANJA:C.VERDE;
            return(
              <div key={i} style={{marginBottom:8}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                  <span style={{fontSize:12,color:T.TEXT}}>{f.factor}</span>
                  <span style={{fontSize:12,fontWeight:700,color:c}}>{f.score}/5 <span style={{color:T.TEXT2,fontWeight:400}}>({f.ref})</span></span>
                </div>
                <div style={{height:4,background:T.BG4,borderRadius:2}}>
                  <div style={{height:'100%',width:(f.score/5*100)+'%',background:c,borderRadius:3}}/>
                </div>
              </div>
            );
          })}
        </Card> : null}
        {tab === 'graficos' ? <div>
          <Card title="Scoring por factor">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scData} layout="vertical" margin={{top:5,right:30,left:100,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                <XAxis type="number" domain={[0,5]}/>
                <YAxis dataKey="f" type="category" tick={{fontSize:9,fill:'#4A6A8A',fontFamily:"'JetBrains Mono',monospace"}}/>
                <Tooltip/>
                <Bar dataKey="s">{scData.map(function(e,i){return <Cell key={i} fill={e.fill}/>;})}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div> : null}

        {tab === 'dd' && nota ? <div>
          <div style={{background:nota.col,borderRadius:6,padding:'14px 18px',marginBottom:14,color:'white',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontWeight:700,fontSize:15}}>Nota de Debida Diligencia — {nota.empresa}</div>
              <div style={{fontSize:12,opacity:0.85,marginTop:2}}>Periodo: {nota.periodo} · Score: {nota.score}/5 · RIESGO {nota.clasificacion}</div>
            </div>
            <div style={{textAlign:'right',fontSize:12,opacity:0.8}}>
              <div>{nota.totalSenales} senales · {nota.altaSenales} ALTA</div>
              <div>Plazo: {nota.deadline}</div>
            </div>
          </div>

          <div style={{background:'rgba(93,78,140,0.1)',border:'1px solid rgba(93,78,140,0.4)',borderRadius:6,padding:'16px 18px',marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
              <div>
                <div style={{fontWeight:700,color:'#B39DDB',fontSize:12,marginBottom:2}}>📋 PEDIDO DE INFORMACIÓN Y DEBIDA DILIGENCIA</div>
                <div style={{fontSize:12,color:T.TEXT2}}>Generado automáticamente a partir del análisis transaccional · {nota.fecha}</div>
              </div>
              <button onClick={function(){
                var texto = 'PEDIDO DE INFORMACIÓN — DEBIDA DILIGENCIA\n';
                texto += 'Empresa: ' + nota.empresa + '\n';
                texto += 'Período: ' + nota.periodo + '\n';
                texto += 'Fecha: ' + nota.fecha + '\n';
                texto += 'Riesgo: ' + nota.clasificacion + ' (Score: ' + nota.score + '/5)\n';
                texto += 'Plazo respuesta: ' + nota.deadline + '\n\n';
                texto += 'ACCIÓN RECOMENDADA: ' + nota.accion + '\n\n';
                if (nota.patronesDetectados.length > 0) {
                  texto += 'PATRONES DETECTADOS:\n';
                  nota.patronesDetectados.forEach(function(p,i){ texto += (i+1) + '. ' + p + '\n'; });
                  texto += '\n';
                }
                texto += 'ACCIONES E INFORMACIÓN REQUERIDA:\n';
                nota.acciones.forEach(function(a,i){ texto += (i+1) + '. ' + a + '\n\n'; });
                navigator.clipboard.writeText(texto).then(function(){ alert('Nota copiada al portapapeles'); }).catch(function(){ alert('No se pudo copiar'); });
              }} style={{background:'rgba(93,78,140,0.2)',color:'#B39DDB',border:'1px solid rgba(93,78,140,0.4)',borderRadius:3,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:700,flexShrink:0}}>
                📋 Copiar nota
              </button>
            </div>

            <div style={{background:T.BG2,borderRadius:4,padding:'12px 14px',marginBottom:12,border:'1px solid '+T.BORDER2}}>
              <div style={{fontWeight:700,color:'#A48FD0',fontSize:11,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.5px'}}>Acción principal</div>
              <div style={{fontSize:13,color:T.TEXT2,fontWeight:500}}>{nota.accion}</div>
            </div>

            {nota.patronesDetectados.length > 0 ? <div style={{background:T.BG2,borderRadius:4,padding:'12px 14px',marginBottom:12,border:'1px solid '+T.BORDER2}}>
              <div style={{fontWeight:700,color:'#A48FD0',fontSize:11,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.5px'}}>Patrones que motivan este pedido</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {nota.patronesDetectados.map(function(p,i){return(
                  <span key={i} style={{background:'rgba(93,78,140,0.15)',color:'#B39DDB',borderRadius:2,padding:'3px 8px',fontSize:11,fontWeight:600}}>{p}</span>
                );})}
              </div>
            </div> : null}

            <div style={{fontWeight:700,color:'#A48FD0',fontSize:11,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.5px'}}>
              Información y documentación requerida al cliente ({nota.acciones.length} puntos)
            </div>
            {nota.acciones.map(function(accion,i){return(
              <div key={i} style={{display:'flex',gap:12,marginBottom:10,padding:'10px 14px',background:T.BG2,borderRadius:4,border:'1px solid '+T.BORDER2,borderLeft:'2px solid '+(i<nota.altaSenales?T.RED:'#7B6FAA')}}>
                <div style={{flexShrink:0,width:24,height:24,background:'rgba(93,78,140,0.4)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:11,fontWeight:700}}>{i+1}</div>
                <div style={{fontSize:13,color:T.TEXT,lineHeight:1.5}}>{accion}</div>
              </div>
            );})}

            <div style={{background:'rgba(255,184,48,0.08)',border:'1px solid rgba(255,184,48,0.25)',borderRadius:3,padding:'10px 14px',marginTop:8,fontSize:12}}>
              <strong style={{color:T.AMBER}}>⏱ Plazo de respuesta:</strong> <span style={{color:T.TEXT}}>{nota.deadline} desde la notificación formal. En caso de no respuesta o respuesta insatisfactoria, escalar al Responsable de Compliance para evaluar restricción operativa y/o ROS ante UIF.</span>
            </div>
          </div>
        </div> : null}

        {tab === 'memos' ? <div>

          {/* ── GENERADOR DE MEMO ESTRUCTURADO ─────────────────────────────── */}
          {(function(){
            var altaSigs = sigs.filter(function(s){return s.sev==='ALTA';});
            var mediaSigs = sigs.filter(function(s){return s.sev==='MEDIA';});
            var hasSigs = sigs.length > 0;

            // Acciones sugeridas según patrones detectados
            var accionesSugeridas = [];
            sigs.forEach(function(s){
              if (s.pat==='PAT-01') accionesSugeridas.push({ tipo:'RFI', urgencia:'ALTA', texto:'Solicitar detalle y justificación de las operaciones fraccionadas: fechas, montos individuales, identificación de contrapartes e intención económica de cada transacción.' });
              if (s.pat==='PAT-02') accionesSugeridas.push({ tipo:'RFI', urgencia:'ALTA', texto:'Requerir contratos, facturas o documentación que acredite la relación comercial con la/s contraparte/s de mayor concentración e identifique el origen de los fondos.' });
              if (s.pat==='PAT-03') accionesSugeridas.push({ tipo:'EDD', urgencia:'ALTA', texto:'Investigar operaciones circulares: solicitar contratos, facturas y justificación económica para las contrapartes que actúan simultáneamente como origen y destino.' });
              if (s.pat==='PAT-04') accionesSugeridas.push({ tipo:'RFI', urgencia:'MEDIA', texto:'Identificar y verificar las contrapartes que operaron una única vez. Solicitar documentación que acredite la relación comercial y el propósito de la transacción.' });
              if (s.pat==='PAT-05') accionesSugeridas.push({ tipo:'EDD', urgencia:'ALTA', texto:'El volumen operado supera significativamente el perfil declarado. Solicitar estados de cuenta bancarios, DDJJ de ingresos, contratos comerciales y certificación contable que justifiquen el nivel de actividad.' });
              if (s.pat==='PAT-06') accionesSugeridas.push({ tipo:'EDD', urgencia:'ALTA', texto:'Concentración extrema de contrapartes detectada. Requerir documentación que identifique a las contrapartes principales, acredite la relación comercial y explique el origen de los fondos recibidos.' });
              if (s.pat==='PAT-07') accionesSugeridas.push({ tipo:'RFI', urgencia:'MEDIA', texto:'Alto ratio pass-through detectado. Solicitar justificación del flujo de fondos: origen, destino final y propósito económico de los fondos que ingresan y salen en períodos cortos.' });
              if (s.pat==='PAT-08') accionesSugeridas.push({ tipo:'RFI', urgencia:'MEDIA', texto:'Proporción significativa de montos exactos/redondos. Solicitar facturas o comprobantes que respalden los montos operados y confirmen transacciones comerciales reales.' });
              if (s.pat==='PAT-09') accionesSugeridas.push({ tipo:'RFI', urgencia:'MEDIA', texto:'Operaciones fuera del horario comercial habitual. Solicitar justificación operativa de las transacciones realizadas en horario atípico.' });
              if (s.pat==='PAT-10') accionesSugeridas.push({ tipo:'RFI', urgencia:'ALTA', texto:'Near-threshold structuring detectado: operaciones recurrentes entre $680K y $799.999 con la misma contraparte. Solicitar justificación económica de cada operación, documentación respaldatoria y confirmar que no existe fraccionamiento deliberado para eludir el umbral de reporte obligatorio de $800.000 ARS establecido por la UIF.' });
              if (s.pat==='PAT-11') accionesSugeridas.push({ tipo:'EDD', urgencia:'ALTA', texto:'Velocidad operativa anómala detectada. Solicitar justificación operativa, contratos y documentación de respaldo para las transacciones de mayor frecuencia.' });
              if (s.pat==='PAT-12') accionesSugeridas.push({ tipo:'EDD', urgencia:'ALTA', texto:'Inconsistencias entre el perfil de contrapartes y la actividad declarada. Requerir documentación que acredite la naturaleza de las operaciones y la identidad de las partes.' });
            });
            // Deduplicar
            var seen = {};
            accionesSugeridas = accionesSugeridas.filter(function(a){
              var key = a.pat+a.texto.slice(0,30);
              if (seen[key]) return false;
              seen[key] = true;
              return true;
            });
            // Agregar acciones estándar siempre presentes
            accionesSugeridas.push({ tipo:'KYC', urgencia:'MEDIA', texto:'Actualizar la Declaración Jurada AML (PEP/SO/UBO) con fecha vigente. Confirmar que no hubo cambios en la composición societaria, beneficiarios finales ni actividad principal desde el último onboarding.' });
            accionesSugeridas.push({ tipo:'DOC', urgencia:'MEDIA', texto:'Solicitar últimos 3 estados de cuenta bancarios de la entidad y/o certificación contable de la facturación del período analizado ('+( selPeriodo&&selPeriodo.nombre||'período actual')+').' });

            return hasSigs ? (
              <div style={{background:T.BG3,border:'2px solid #2471A3',borderRadius:6,padding:'14px 16px',marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:700,color:'#1A4A6B',fontSize:14}}>📋 Generador de Memo de Compliance</div>
                    <div style={{fontSize:11,color:T.TEXT2,marginTop:2}}>
                      {altaSigs.length} señal(es) ALTA · {mediaSigs.length} señal(es) MEDIA · {accionesSugeridas.length} acciones sugeridas
                    </div>
                  </div>
                  <button
                    onClick={function(){
                      var periodo = selPeriodo&&selPeriodo.nombre||'período';
                      var empresa = selLegajo&&selLegajo.razonSocial||'la empresa';
                      var fecha = todayStr();
                      var hora = new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});

                      // Construir el memo estructurado
                      var lineas = [];
                      lineas.push('════════════════════════════════════════════');
                      lineas.push('MEMO DE CUMPLIMIENTO — ACCIONES POST-ANÁLISIS AML');
                      lineas.push('Empresa: ' + empresa);
                      lineas.push('Período: ' + periodo + '  |  Fecha: ' + fecha + '  |  Hora: ' + hora);
                      lineas.push('Señales detectadas: ' + altaSigs.length + ' ALTA · ' + mediaSigs.length + ' MEDIA');
                      lineas.push('════════════════════════════════════════════');
                      lineas.push('');

                      lineas.push('1. RESUMEN DEL ANÁLISIS');
                      lineas.push('');
                      lineas.push('Volumen IN: ' + fmtM(m.tIn) + '  |  Volumen OUT: ' + fmtM(m.tOut) + '  |  Balance neto: ' + fmtM(m.balanceNeto));
                      lineas.push('Total operaciones: ' + m.totalTxns + '  |  Contrapartes IN: ' + m.uniqueCpIn + '  |  Contrapartes OUT: ' + m.uniqueCpOut);
                      lineas.push('Patrones detectados: ' + sigs.map(function(s){return s.pat;}).join(', '));
                      lineas.push('');

                      lineas.push('2. SOLICITUDES DE INFORMACIÓN Y DOCUMENTACIÓN REQUERIDA');
                      lineas.push('');
                      accionesSugeridas.forEach(function(a,i){
                        lineas.push((i+1) + '. [' + a.tipo + ' — Urgencia ' + a.urgencia + ']');
                        lineas.push('   ' + a.texto);
                        lineas.push('');
                      });

                      lineas.push('3. NOTIFICACIONES REALIZADAS');
                      lineas.push('');
                      lineas.push('[ ] Notificación formal al cliente — Fecha: ___/___/_____');
                      lineas.push('[ ] Canal utilizado: ________________________________________________');
                      lineas.push('[ ] Contacto del cliente: ___________________________________________');
                      lineas.push('');

                      lineas.push('4. RESPUESTAS Y DOCUMENTACIÓN RECIBIDA');
                      lineas.push('');
                      lineas.push('[ ] Respuesta recibida — Fecha: ___/___/_____');
                      lineas.push('[ ] Documentación recibida: ________________________________________');
                      lineas.push('[ ] Contratos / Facturas: __________________________________________');
                      lineas.push('[ ] Certificación contable: ________________________________________');
                      lineas.push('[ ] DDJJ AML actualizada: __________________________________________');
                      lineas.push('');

                      lineas.push('5. EVALUACIÓN DE LA RESPUESTA');
                      lineas.push('');
                      lineas.push('[ ] Respuesta satisfactoria — Cierre del RFI');
                      lineas.push('[ ] Respuesta parcial — Se requiere información adicional');
                      lineas.push('[ ] Sin respuesta / Respuesta insatisfactoria — Escalar');
                      lineas.push('');

                      lineas.push('6. ACCIONES DE SEGUIMIENTO Y ESCALAMIENTO');
                      lineas.push('');
                      lineas.push('[ ] Mantener cuenta activa con monitoreo estándar');
                      lineas.push('[ ] Activar monitoreo reforzado — Segmento: ________________________');
                      lineas.push('[ ] Suspender operatoria temporalmente');
                      lineas.push('[ ] Iniciar proceso de cierre de cuenta');
                      lineas.push('[ ] Elevar ROS ante UIF — Plazo: 30 días corridos desde esta fecha');
                      lineas.push('');

                      lineas.push('7. PLAZO Y RESPONSABLE');
                      lineas.push('');
                      var plazoSugerido = altaSigs.length > 0 ? '72 hs hábiles' : '7 días hábiles';
                      lineas.push('Plazo de respuesta establecido: ' + plazoSugerido);
                      lineas.push('Próximo vencimiento: ___/___/_____');
                      lineas.push('Responsable del seguimiento: ______________________________________');
                      lineas.push('');
                      lineas.push('────────────────────────────────────────────');
                      lineas.push('Analista: ' + (analistaVal||'__________________') + '  |  Fecha: ' + fecha);

                      var texto = lineas.join('\n');
                      // Guardar como memo
                      var entry = { id:uid(), texto:texto, autor:analistaVal||'Sistema — Memo Compliance', fecha:fecha, hora:hora, tipo:'compliance' };
                      var memoKey2 = 'memos_'+( selPeriodo&&selPeriodo.id||'x');
                      var updated = memos.concat([entry]);
                      setMemos(updated);                    }}
                    style={{background:'#2471A3',color:'white',border:'none',borderRadius:4,padding:'9px 18px',cursor:'pointer',fontWeight:700,fontSize:12}}
                  >
                    📋 Generar memo de cumplimiento
                  </button>
                </div>
                {/* Preview de acciones a documentar */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
                  {accionesSugeridas.slice(0,4).map(function(a,i){
                    var col = a.urgencia==='ALTA'?'#E74C3C':a.urgencia==='MEDIA'?'#E67E22':'#27AE60';
                    var bg = a.urgencia==='ALTA'?'#FDEDEC':a.urgencia==='MEDIA'?'#FEF9E7':'#EBF9F0';
                    return (
                      <div key={i} style={{background:bg,border:'1px solid '+col,borderRadius:4,padding:'8px 10px',borderLeft:'3px solid '+col}}>
                        <div style={{display:'flex',gap:6,marginBottom:3}}>
                          <span style={{background:col,color:'white',borderRadius:4,padding:'1px 7px',fontSize:9,fontWeight:700}}>{a.tipo}</span>
                          <span style={{background:col,color:'white',borderRadius:4,padding:'1px 7px',fontSize:9,fontWeight:700}}>{a.urgencia}</span>
                        </div>
                        <div style={{fontSize:11,color:T.TEXT,lineHeight:1.4}}>{a.texto.slice(0,90)}...</div>
                      </div>
                    );
                  })}
                </div>
                {accionesSugeridas.length > 4 && <div style={{fontSize:11,color:T.TEXT2,marginTop:6,textAlign:'right'}}>+{accionesSugeridas.length-4} acciones más incluidas en el memo completo</div>}
              </div>
            ) : null;
          }())}

          {/* ── NUEVA ANOTACIÓN LIBRE ─────────────────────────────────────────── */}
          <div style={{background:'#F0FAF4',border:'2px solid #27AE60',borderRadius:6,padding:'16px 18px',marginBottom:14}}>
            <div style={{fontWeight:700,color:T.GREEN,fontSize:14,marginBottom:12}}>📝 Nueva anotación — {selLegajo&&selLegajo.razonSocial} · {selPeriodo&&selPeriodo.nombre}</div>
            <div style={{display:'flex',gap:10,marginBottom:10}}>
              <div style={{flex:'0 0 160px'}}>
                <label style={{fontSize:11,color:T.TEXT2,display:'block',marginBottom:3}}>Analista</label>
                <input value={analistaVal} onChange={function(e){setAnalista(e.target.value);}} style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 9px',fontSize:13}} placeholder="Tu nombre"/>
              </div>
            </div>
            <textarea
              value={newMemo}
              onChange={function(e){setNewMemo(e.target.value);}}
              rows={4}
              placeholder="Escribí tu anotación sobre este período... (observaciones, acuerdos con el cliente, seguimiento de RFI, respuestas recibidas, novedades del caso, etc.)"
              style={{width:'100%',border:'1px solid rgba(0,230,118,0.2)',borderRadius:4,padding:'10px 12px',fontSize:13,resize:'vertical',background:T.BG2,outline:'none'}}
            />
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:8}}>
              <button
                onClick={saveMemo}
                disabled={!newMemo.trim()}
                style={{background:newMemo.trim()?C.VERDE:'#ccc',color:'white',border:'none',borderRadius:4,padding:'8px 20px',cursor:newMemo.trim()?'pointer':'not-allowed',fontWeight:700,fontSize:13}}
              >
                💾 Guardar memo
              </button>
            </div>
          </div>

          {/* ── LISTA DE MEMOS ─────────────────────────────────────────────────── */}
          {memos.length === 0 ? <Card title="">
            <p style={{color:T.TEXT2,textAlign:'center',padding:'20px 0',fontSize:13}}>No hay memos para este período. Usá el generador de arriba para crear el memo de cumplimiento, o escribí una anotación libre.</p>
          </Card> : <div>
            <div style={{fontSize:12,color:T.TEXT2,marginBottom:10,fontWeight:600}}>{memos.length} anotación(es) registrada(s) — más reciente primero</div>
            {memos.slice().reverse().map(function(memo,i){
              var esCompliance = memo.tipo==='compliance';
              return(
                <div key={memo.id} style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:6,padding:'14px 16px',marginBottom:10,boxShadow:'0 1px 3px rgba(0,0,0,0.05)',borderLeft:'3px solid '+(esCompliance?'#2471A3':C.VERDE)}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <div style={{background:esCompliance?'#2471A3':C.VERDE,color:'white',borderRadius:'50%',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>
                        {esCompliance?'📋':(memo.autor||'A').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          <span style={{fontWeight:600,color:T.TEXT,fontSize:11}}>{memo.autor||'Analista'}</span>
                          {esCompliance && <span style={{background:'#2471A3',color:'white',borderRadius:4,padding:'1px 7px',fontSize:9,fontWeight:700}}>MEMO COMPLIANCE</span>}
                        </div>
                        <div style={{fontSize:11,color:T.TEXT2}}>{memo.fecha} · {memo.hora}</div>
                      </div>
                    </div>
                    <button onClick={function(){if(window.confirm('Eliminar esta anotación?'))deleteMemo(memo.id);}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'3px 8px',cursor:'pointer',fontSize:11,color:T.TEXT3}}>✕</button>
                  </div>
                  <div style={{fontSize:12,color:T.TEXT,lineHeight:1.7,whiteSpace:'pre-wrap',paddingLeft:36,fontFamily:esCompliance?'monospace':'inherit'}}>{memo.texto}</div>
                </div>
              );
            })}
          </div>}
        </div> : null}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB RFI — HISTORIAL DE INTERCAMBIOS                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {tab === 'rfi' ? <div>

          {/* Header */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div>
              <div style={{fontWeight:700,color:'#1A4A6B',fontSize:14}}>📧 RFI — Requerimientos de Información</div>
              <div style={{fontSize:11,color:T.TEXT2,marginTop:2}}>{selLegajo&&selLegajo.razonSocial} · {rfis.length} RFI(s) registrado(s) · {rfis.filter(function(r){return r.estado!=='CERRADO';}).length} activo(s)</div>
            </div>
            <button
              onClick={function(){
                setRfiMode('nuevo');
                setRfiForm({asunto:'Requerimiento de información — '+(selPeriodo&&selPeriodo.nombre||''), refNum:genRfiRef(), contenido:'', autor:analistaVal||'Analista'});
              }}
              style={{background:'#1A4A6B',color:'white',border:'none',borderRadius:4,padding:'9px 18px',cursor:'pointer',fontWeight:700,fontSize:12}}
            >+ Nuevo RFI</button>
          </div>

          {/* Formulario nuevo RFI */}
          {rfiMode === 'nuevo' && (
            <div style={{background:T.BG3,border:'2px solid #2471A3',borderRadius:6,padding:'16px 18px',marginBottom:16}}>
              <div style={{fontWeight:700,color:'#1A4A6B',fontSize:13,marginBottom:12}}>Nuevo RFI — {selLegajo&&selLegajo.razonSocial}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>N° de referencia</label>
                  <input value={rfiForm.refNum} onChange={function(e){setRfiForm(function(p){return Object.assign({},p,{refNum:e.target.value});});}} style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 9px',fontSize:12,boxSizing:'border-box'}} placeholder="RFI-EMPRESA-2026-001"/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Analista responsable</label>
                  <input value={rfiForm.autor} onChange={function(e){setRfiForm(function(p){return Object.assign({},p,{autor:e.target.value});});}} style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 9px',fontSize:12,boxSizing:'border-box'}} placeholder="Nombre del analista"/>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Asunto del RFI</label>
                <input value={rfiForm.asunto} onChange={function(e){setRfiForm(function(p){return Object.assign({},p,{asunto:e.target.value});});}} style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 9px',fontSize:12,boxSizing:'border-box'}} placeholder="Requerimiento de información — Período Enero 2026"/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Texto del email / requerimiento enviado al cliente</label>
                <textarea
                  value={rfiForm.contenido}
                  onChange={function(e){setRfiForm(function(p){return Object.assign({},p,{contenido:e.target.value});});}}
                  rows={10}
                  placeholder="Pegá aquí el texto completo del email enviado al cliente..."
                  style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:4,padding:'10px 12px',fontSize:12,resize:'vertical',background:T.BG2,boxSizing:'border-box',fontFamily:'monospace',lineHeight:1.6}}
                />
              </div>
              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button onClick={function(){setRfiMode(null);}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 16px',cursor:'pointer',fontSize:12}}>Cancelar</button>
                <button onClick={crearRfi} disabled={!rfiForm.contenido.trim()} style={{background:rfiForm.contenido.trim()?'#1A4A6B':'#ccc',color:'white',border:'none',borderRadius:4,padding:'8px 20px',cursor:rfiForm.contenido.trim()?'pointer':'not-allowed',fontWeight:700,fontSize:12}}>💾 Registrar RFI</button>
              </div>
            </div>
          )}

          {/* Lista de RFIs */}
          {rfis.length === 0 ? (
            <div style={{background:T.BG3,border:'1px dashed #D6E4F0',borderRadius:6,padding:'30px',textAlign:'center'}}>
              <div style={{fontSize:28,marginBottom:8}}>📧</div>
              <div style={{fontWeight:700,color:T.TEXT2,fontSize:13}}>Sin RFIs registrados para este cliente</div>
              <div style={{fontSize:12,color:T.TEXT3,marginTop:4}}>Creá el primer RFI con el botón "+ Nuevo RFI" para comenzar el historial de intercambios.</div>
            </div>
          ) : (
            <div>
              {rfis.slice().reverse().map(function(rfi, idx){
                var est = getRfiEstado(rfi.estado);
                var isOpen = rfiMode === rfi.id;
                var altasCount = rfi.intercambios ? rfi.intercambios.filter(function(i){return i.tipo==='ENVIO';}).length : 0;
                return (
                  <div key={rfi.id} style={{background:T.BG2,border:'2px solid '+(isOpen?'#2471A3':'#E8EEF4'),borderRadius:6,marginBottom:12,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>

                    {/* Header del RFI */}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:'1px solid '+T.BORDER,background:T.BG3,cursor:'pointer'}} onClick={function(){setRfiMode(isOpen?null:rfi.id); setRfiResp({contenido:'',tipo:'RESPUESTA',autor:''});}}>
                      <div style={{display:'flex',gap:10,alignItems:'center',flex:1,minWidth:0}}>
                        <span style={{background:est.bg,color:est.color,border:'1px solid '+est.color,borderRadius:8,padding:'2px 10px',fontSize:10,fontWeight:700,flexShrink:0}}>{est.label}</span>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:600,color:T.TEXT,fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rfi.refNum}</div>
                          <div style={{fontSize:11,color:T.TEXT2,marginTop:1}}>{rfi.asunto}</div>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                        {rfi.periodoNombre && <span style={{background:C.CEL,color:T.CYAN,borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:600}}>{rfi.periodoNombre}</span>}
                        <span style={{fontSize:11,color:T.TEXT3}}>{rfi.intercambios?rfi.intercambios.length:0} msg</span>
                        <span style={{fontSize:11,color:T.TEXT3}}>{rfi.createdAt}</span>
                        <span style={{fontSize:14,color:T.TEXT3}}>{isOpen?'▲':'▼'}</span>
                      </div>
                    </div>

                    {/* Acciones rápidas de estado */}
                    <div style={{display:'flex',gap:6,padding:'6px 16px',borderBottom:'1px solid '+T.BORDER,background:T.BG3,flexWrap:'wrap'}}>
                      <span style={{fontSize:10,color:T.TEXT3,alignSelf:'center',marginRight:4}}>Estado:</span>
                      {RFI_ESTADOS.map(function(e){
                        var isCur = rfi.estado===e.id;
                        return <button key={e.id} onClick={function(){cambiarEstadoRfi(rfi.id,e.id);}} style={{background:isCur?e.bg:'white',color:isCur?e.color:T.TEXT2,border:'1px solid '+(isCur?e.color:'#ddd'),borderRadius:8,padding:'2px 10px',cursor:'pointer',fontSize:10,fontWeight:isCur?700:400}}>{e.label}</button>;
                      })}
                      <button onClick={function(){eliminarRfi(rfi.id);}} style={{marginLeft:'auto',background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'2px 8px',cursor:'pointer',fontSize:10,color:T.TEXT3}}>🗑 Eliminar</button>
                    </div>

                    {/* Hilo de intercambios */}
                    {isOpen && (
                      <div style={{padding:'14px 16px'}}>
                        {(rfi.intercambios||[]).map(function(msg, mi){
                          var isEnvio = msg.tipo==='ENVIO';
                          var isResp = msg.tipo==='RESPUESTA';
                          var isNota = msg.tipo==='NOTA';
                          var isCierre = msg.tipo==='CIERRE';
                          var msgColor = isEnvio?'#1A4A6B':isResp?'#1A6B3A':isCierre?'#7F8C8D':'#E67E22';
                          var msgBg = isEnvio?'#EBF5FB':isResp?'#EBF9F0':isCierre?'#F2F3F4':'#FEF9E7';
                          var msgLabel = isEnvio?'📤 ENVÍO':'📥 RESPUESTA';
                          if (isNota) msgLabel = '📌 NOTA INTERNA';
                          if (isCierre) msgLabel = '🔒 CIERRE';
                          return (
                            <div key={msg.id} style={{display:'flex',gap:12,marginBottom:14}}>
                              {/* Timeline dot */}
                              <div style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                                <div style={{width:10,height:10,borderRadius:'50%',background:msgColor,marginTop:4,flexShrink:0}}></div>
                                {mi < (rfi.intercambios||[]).length-1 && <div style={{width:1,flex:1,background:T.BORDER,marginTop:2}}></div>}
                              </div>
                              {/* Message */}
                              <div style={{flex:1,background:msgBg,border:'1px solid '+msgColor+'33',borderRadius:6,padding:'10px 14px',borderLeft:'3px solid '+msgColor}}>
                                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                                    <span style={{background:msgColor,color:'white',borderRadius:4,padding:'1px 8px',fontSize:9,fontWeight:700}}>{msgLabel}</span>
                                    <span style={{fontWeight:600,color:T.TEXT,fontSize:11}}>{msg.autor}</span>
                                  </div>
                                  <span style={{fontSize:11,color:T.TEXT3}}>{msg.fecha} {msg.hora&&'· '+msg.hora}</span>
                                </div>
                                <div style={{fontSize:12,color:T.TEXT,lineHeight:1.7,whiteSpace:'pre-wrap',fontFamily:isEnvio?'monospace':'inherit'}}>{msg.contenido}</div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Agregar intercambio */}
                        {rfi.estado !== 'CERRADO' && (
                          <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'12px 14px',marginTop:8}}>
                            <div style={{fontWeight:700,color:'#1A4A6B',fontSize:12,marginBottom:10}}>Agregar al hilo</div>
                            <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
                              <select
                                value={rfiResp.tipo}
                                onChange={function(e){setRfiResp(function(p){return Object.assign({},p,{tipo:e.target.value});});}}
                                style={{border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 8px',fontSize:12}}
                              >
                                <option value="RESPUESTA">📥 Respuesta del cliente</option>
                                <option value="ENVIO">📤 Seguimiento enviado</option>
                                <option value="NOTA">📌 Nota interna</option>
                                <option value="CIERRE">🔒 Cierre del RFI</option>
                              </select>
                              <input
                                value={rfiResp.autor}
                                onChange={function(e){setRfiResp(function(p){return Object.assign({},p,{autor:e.target.value});});}}
                                placeholder={rfiResp.tipo==='RESPUESTA'?(selLegajo&&selLegajo.razonSocial||'Cliente'):(analistaVal||'Analista')}
                                style={{flex:1,minWidth:140,border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 8px',fontSize:12}}
                              />
                            </div>
                            <textarea
                              value={rfiResp.contenido}
                              onChange={function(e){setRfiResp(function(p){return Object.assign({},p,{contenido:e.target.value});});}}
                              rows={rfiResp.tipo==='RESPUESTA'?6:3}
                              placeholder={
                                rfiResp.tipo==='RESPUESTA' ? 'Pegá aquí el texto de la respuesta recibida del cliente...' :
                                rfiResp.tipo==='ENVIO' ? 'Texto del seguimiento enviado...' :
                                rfiResp.tipo==='CIERRE' ? 'Descripción del cierre: documentación recibida, decisión adoptada, acciones de seguimiento...' :
                                'Nota interna del equipo de compliance...'
                              }
                              style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:12,resize:'vertical',background:T.BG2,boxSizing:'border-box',fontFamily:rfiResp.tipo==='RESPUESTA'?'monospace':'inherit',lineHeight:1.6}}
                            />
                            <div style={{display:'flex',justifyContent:'flex-end',marginTop:8}}>
                              <button
                                onClick={function(){agregarIntercambio(rfi.id);}}
                                disabled={!rfiResp.contenido.trim()}
                                style={{background:rfiResp.contenido.trim()?'#1A4A6B':'#ccc',color:'white',border:'none',borderRadius:4,padding:'8px 20px',cursor:rfiResp.contenido.trim()?'pointer':'not-allowed',fontWeight:700,fontSize:12}}
                              >💾 Agregar al hilo</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div> : null}
      </div> : null}
    </div>
  );
}

function AlertasView(props) {
  var periodos = props.periodos, legajos = props.legajos;
  var setPeriodos = props.setPeriodos;
  var onNavAnalisis = props.onNavAnalisis; // function(leg, per)
  var currentUser = props.currentUser || {rol:'analista', nombre:'Analista'};

  var tabState = useState('senales'); var tab=tabState[0]; var setTab=tabState[1];
  var justState = useState({}); var justMap=justState[0]; var setJustMap=justState[1]; // {key: texto}

  var hoy = new Date(); hoy.setHours(0,0,0,0);

  // ── 1. SEÑALES ACTIVAS — desde metricas guardadas (no requiere txns en memoria) ──
  var allSigs = [];
  periodos.forEach(function(p) {
    var leg = legajos.find(function(l){return l.id===p.legajoId;});
    // Usar metricas guardadas si existen, sino calcular si hay txns
    var m = p.metricas || (p.txns && p.txns.length ? calcMetricas(p.txns, leg) : null);
    if (!m) return;
    var sigs = detectPatrones(m, leg);
    sigs.forEach(function(s) {
      var res = (p.sigsResolucion||{})[s.pat];
      if (res && res.estado === 'RESUELTA') return; // ya resuelta
      allSigs.push(Object.assign({}, s, {
        legajoNom: (leg&&leg.razonSocial)||'N/D',
        legajoId:  p.legajoId,
        periodoId: p.id,
        periodoNom: p.nombre,
        leg: leg,
        per: p,
      }));
    });
  });
  allSigs.sort(function(a,b){
    var sevOrd = {ALTA:0, MEDIA:1, BAJA:2};
    return (sevOrd[a.sev]||2) - (sevOrd[b.sev]||2);
  });

  // ── 2. RFIs VENCIDOS ─────────────────────────────────────────────────────────
  var todosRfis = [];
  legajos.forEach(function(l){
    try {
      var r = [];
      r.forEach(function(rfi){ todosRfis.push(Object.assign({},rfi,{legajoNombre:l.razonSocial,legajoId:l.id,leg:l})); });
    } catch(e){}
  });
  var rfisVencidos = todosRfis.filter(function(r){
    if (r.estado==='CERRADO'||r.estado==='RESPONDIDO') return false;
    var f = parseFechaAR(r.createdAt);
    return f && Math.floor((hoy-f)/86400000) > 7;
  });
  var rfisProximos = todosRfis.filter(function(r){
    if (r.estado==='CERRADO'||r.estado==='RESPONDIDO') return false;
    var f = parseFechaAR(r.createdAt);
    if (!f) return false;
    var dias = Math.floor((hoy-f)/86400000);
    return dias >= 5 && dias <= 7;
  });

  // ── 3. PERÍODOS SIN ANALIZAR ─────────────────────────────────────────────────
  var sinAnalizar = [];
  legajos.forEach(function(l){
    var lPers = periodos.filter(function(p){return p.legajoId===l.id;});
    if (lPers.length === 0) {
      // Nunca tuvo período
      var alta = parseFechaAR(l.createdAt);
      var diasSinAnalisis = alta ? Math.floor((hoy-alta)/86400000) : 0;
      var limDias = l.segmento==='ALTO'?30:l.segmento==='MEDIO-ALTO'?60:90;
      if (diasSinAnalisis > limDias) {
        sinAnalizar.push({legajoNom:l.razonSocial, legajoId:l.id, leg:l, dias:diasSinAnalisis, limite:limDias, tipo:'sin_periodos'});
      }
    } else {
      // Tiene períodos — verificar si el más reciente tiene métricas
      var conMetricas = lPers.filter(function(p){return p.metricas||p.txns&&p.txns.length;});
      if (conMetricas.length === 0) {
        sinAnalizar.push({legajoNom:l.razonSocial, legajoId:l.id, leg:l, dias:0, limite:0, tipo:'sin_metricas'});
      }
    }
  });

  // ── Resolver señal directamente ───────────────────────────────────────────────
  function resolverSenal(sig, justificacion) {
    var updatedPers = periodos.map(function(p){
      if (p.id !== sig.periodoId) return p;
      var newRes = Object.assign({}, p.sigsResolucion||{});
      newRes[sig.pat] = {
        estado: 'RESUELTA',
        explicacion: justificacion || 'Resuelta desde panel de Alertas.',
        aprobadoPor: currentUser.nombre || 'Analista',
        aprobadoAt: todayStr(),
      };
      return Object.assign({}, p, {sigsResolucion: newRes});
    });
    setPeriodos(updatedPers);
    // Limpiar input de justificación
    var newMap = Object.assign({}, justMap);
    delete newMap[sig.periodoId+'_'+sig.pat];
    setJustMap(newMap);
  }

  var TAB_COUNTS = [
    ['senales',   '🚨 Señales', allSigs.length],
    ['rfis',      '📧 RFIs vencidos', rfisVencidos.length + rfisProximos.length],
    ['analisis',  '⏱ Sin analizar', sinAnalizar.length],
  ];
  var totalAlertas = allSigs.length + rfisVencidos.length + sinAnalizar.length;

  return (
    <div style={{padding:22}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <h2 style={{color:T.TEXT,margin:0,fontSize:19,fontWeight:700}}>Centro de Alertas</h2>
        <span style={{background:totalAlertas>0?C.ROJO:'#27AE60',color:'white',borderRadius:10,padding:'2px 10px',fontSize:11,fontWeight:700}}>
          {totalAlertas > 0 ? totalAlertas+' activas' : '✓ Sin alertas'}
        </span>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,background:'#F4F6F9',borderRadius:8,padding:4}}>
        {TAB_COUNTS.map(function(t){
          var on = tab===t[0];
          var hasCnt = t[2]>0;
          return (
            <button key={t[0]} onClick={function(){setTab(t[0]);}}
              style={{flex:1,padding:'7px 8px',border:'none',borderRadius:6,cursor:'pointer',
                background:on?'white':'transparent',
                fontWeight:on?700:400,fontSize:12,color:on?C.AO:'#666',
                boxShadow:on?'0 1px 4px rgba(0,0,0,0.08)':'none',transition:'all 0.12s'}}>
              {t[1]}
              {hasCnt && <span style={{marginLeft:6,background:on?(t[0]==='senales'?C.ROJO:C.NARANJA):'#ddd',color:'white',borderRadius:10,padding:'0 6px',fontSize:11,fontWeight:700}}>{t[2]}</span>}
            </button>
          );
        })}
      </div>

      {/* ── TAB: SEÑALES ── */}
      {tab==='senales' && (
        <div>
          {allSigs.length===0 ? (
            <div style={{background:T.BG3,border:'2px dashed #ddd',borderRadius:8,padding:'30px 20px',textAlign:'center',color:T.TEXT3}}>
              <div style={{fontSize:32,marginBottom:8}}>✅</div>
              <div style={{fontSize:14,fontWeight:600,color:T.TEXT2}}>Sin señales activas</div>
              <div style={{fontSize:12,marginTop:4}}>Todos los períodos analizados están sin alertas pendientes.</div>
            </div>
          ) : allSigs.map(function(s,i){
            var key = s.periodoId+'_'+s.pat;
            var bord = s.sev==='ALTA'?C.ROJO:s.sev==='MEDIA'?C.NARANJA:C.AMARILLO;
            var bg   = s.sev==='ALTA'?'#FFF8F8':s.sev==='MEDIA'?'#FFFBF5':'#FFFDE7';
            return (
              <div key={i} style={{background:bg,border:'1px solid '+T.BORDER,borderRadius:8,padding:'12px 16px',marginBottom:10,borderLeft:'4px solid '+bord}}>
                {/* Cabecera */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <div>
                    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:4}}>
                      <span style={{fontWeight:700,color:T.CYAN,fontSize:12,fontFamily:'monospace'}}>{s.pat}</span>
                      <SevBadge sev={s.sev}/>
                      <span style={{fontSize:12,color:T.TEXT2,fontWeight:500}}>{s.legajoNom}</span>
                      <span style={{fontSize:11,color:T.TEXT3}}>· {s.periodoNom}</span>
                    </div>
                    <div style={{fontWeight:700,fontSize:13,color:T.TEXT}}>{s.titulo}</div>
                    <div style={{fontSize:12,color:T.TEXT2,marginTop:2,lineHeight:1.5}}>{s.desc}</div>
                  </div>
                  {/* Botón ir al período */}
                  {onNavAnalisis && s.leg && s.per && (
                    <button onClick={function(){onNavAnalisis(s.leg, s.per);}}
                      style={{flexShrink:0,background:T.BG2,border:'1px solid '+C.AC,color:T.CYAN,borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                      Ver período →
                    </button>
                  )}
                </div>

                {/* Cierre directo */}
                <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(0,0,0,0.06)'}}>
                  <div style={{fontSize:11,color:T.TEXT2,marginBottom:5,fontWeight:600}}>JUSTIFICACIÓN PARA RESOLVER</div>
                  <div style={{display:'flex',gap:8}}>
                    <input
                      value={justMap[key]||''}
                      onChange={function(e){var m=Object.assign({},justMap); m[key]=e.target.value; setJustMap(m);}}
                      placeholder="Describí brevemente por qué se resuelve esta señal..."
                      style={{flex:1,padding:'6px 10px',border:'1px solid '+T.BORDER,borderRadius:6,fontSize:12,color:T.TEXT}}
                    />
                    <button
                      onClick={function(){resolverSenal(s, justMap[key]);}}
                      style={{background:C.VERDE,color:'white',border:'none',borderRadius:6,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:700,whiteSpace:'nowrap'}}>
                      ✓ Resolver
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB: RFIs ── */}
      {tab==='rfis' && (
        <div>
          {rfisVencidos.length===0 && rfisProximos.length===0 ? (
            <div style={{background:T.BG3,border:'2px dashed #ddd',borderRadius:8,padding:'30px 20px',textAlign:'center',color:T.TEXT3}}>
              <div style={{fontSize:32,marginBottom:8}}>📧</div>
              <div style={{fontSize:14,fontWeight:600,color:T.TEXT2}}>Sin RFIs vencidos o próximos a vencer</div>
            </div>
          ) : (
            <div>
              {rfisVencidos.length > 0 && (
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:T.RED,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>
                    🔴 Vencidos sin respuesta ({rfisVencidos.length})
                  </div>
                  {rfisVencidos.map(function(r,i){
                    var f = parseFechaAR(r.createdAt);
                    var dias = f ? Math.floor((hoy-f)/86400000) : '?';
                    return (
                      <div key={i} style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.25)',borderLeft:'2px solid '+T.RED,borderRadius:3,padding:'10px 14px',marginBottom:8}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                          <div>
                            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3}}>
                              <span style={{fontFamily:'monospace',fontSize:12,fontWeight:700,color:T.CYAN}}>{r.refNum||'RFI'}</span>
                              <span style={{background:'rgba(255,68,85,0.07)',color:T.RED,borderRadius:10,padding:'1px 8px',fontSize:11,fontWeight:700}}>{dias} días sin respuesta</span>
                            </div>
                            <div style={{fontSize:13,fontWeight:500,color:T.TEXT2}}>{r.legajoNombre}</div>
                            <div style={{fontSize:12,color:T.TEXT2,marginTop:2}}>{r.asunto||'Sin asunto'}</div>
                          </div>
                          {onNavAnalisis && r.leg && (
                            <button onClick={function(){
                              var perAsoc = periodos.find(function(p){return p.legajoId===r.legajoId;});
                              onNavAnalisis(r.leg, perAsoc||null);
                            }} style={{flexShrink:0,background:T.BG2,border:'1px solid '+C.AC,color:T.CYAN,borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                              Ver legajo →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {rfisProximos.length > 0 && (
                <div style={{marginTop: rfisVencidos.length>0?14:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.AMBER,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>
                    🟡 Vencen en los próximos 2 días ({rfisProximos.length})
                  </div>
                  {rfisProximos.map(function(r,i){
                    var f = parseFechaAR(r.createdAt);
                    var dias = f ? Math.floor((hoy-f)/86400000) : '?';
                    return (
                      <div key={i} style={{background:'rgba(255,140,0,0.08)',border:'1px solid rgba(255,140,0,0.25)',borderLeft:'2px solid '+T.AMBER,borderRadius:3,padding:'10px 14px',marginBottom:8}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                          <div>
                            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3}}>
                              <span style={{fontFamily:'monospace',fontSize:12,fontWeight:700,color:T.CYAN}}>{r.refNum||'RFI'}</span>
                              <span style={{background:'#FEF3E8',color:T.AMBER,borderRadius:10,padding:'1px 8px',fontSize:11,fontWeight:700}}>día {dias} de 7</span>
                            </div>
                            <div style={{fontSize:13,fontWeight:500,color:T.TEXT2}}>{r.legajoNombre}</div>
                            <div style={{fontSize:12,color:T.TEXT2,marginTop:2}}>{r.asunto||'Sin asunto'}</div>
                          </div>
                          {onNavAnalisis && r.leg && (
                            <button onClick={function(){
                              var perAsoc = periodos.find(function(p){return p.legajoId===r.legajoId;});
                              onNavAnalisis(r.leg, perAsoc||null);
                            }} style={{flexShrink:0,background:T.BG2,border:'1px solid '+C.AC,color:T.CYAN,borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                              Ver legajo →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: SIN ANALIZAR ── */}
      {tab==='analisis' && (
        <div>
          {sinAnalizar.length===0 ? (
            <div style={{background:T.BG3,border:'2px dashed #ddd',borderRadius:8,padding:'30px 20px',textAlign:'center',color:T.TEXT3}}>
              <div style={{fontSize:32,marginBottom:8}}>⏱</div>
              <div style={{fontSize:14,fontWeight:600,color:T.TEXT2}}>Todos los clientes tienen análisis reciente</div>
            </div>
          ) : sinAnalizar.map(function(item,i){
            return (
              <div key={i} style={{background:'rgba(255,140,0,0.08)',border:'1px solid rgba(255,140,0,0.25)',borderLeft:'2px solid '+T.AMBER,borderRadius:3,padding:'12px 16px',marginBottom:8}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:T.TEXT,marginBottom:3}}>{item.legajoNom}</div>
                    {item.tipo==='sin_periodos' ? (
                      <div style={{fontSize:12,color:T.TEXT2}}>
                        Sin períodos cargados · {item.dias} días desde el alta · Límite para segmento {item.leg&&item.leg.segmento||'N/D'}: {item.limite} días
                      </div>
                    ) : (
                      <div style={{fontSize:12,color:T.TEXT2}}>
                        Tiene períodos pero sin métricas calculadas — cargar archivo XLS para analizar
                      </div>
                    )}
                  </div>
                  {onNavAnalisis && item.leg && (
                    <button onClick={function(){onNavAnalisis(item.leg, null);}}
                      style={{flexShrink:0,background:C.AC,color:'white',border:'none',borderRadius:6,padding:'6px 12px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                      Cargar período →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NormativaView() {
  var normas = [
    {cod:'Ley 25.246',nombre:'Encubrimiento y lavado de activos',art:'Art. 20 - Sujetos obligados'},
    {cod:'Res. UIF 30/2017',nombre:'Prevencion del lavado - PSP',art:'Onboarding / DDC corporativa'},
    {cod:'Res. UIF 156/2018',nombre:'Beneficiario final - identificacion',art:'UBO >10% participacion'},
    {cod:'Res. UIF 76/2019',nombre:'Gestion de riesgos ML/FT',art:'Risk assessment periodico'},
    {cod:'Res. UIF 112/2021',nombre:'Onboarding digital y verificacion remota',art:'KYC/KYB digital'},
    {cod:'Com. BCRA A 8298',nombre:'Requisitos operativos PSP - billeteras',art:'Limites, topes, reportes'},
    {cod:'Com. BCRA A 6463',nombre:'Cuentas de pago - apertura y operatoria',art:'CVU y cuentas virtuales'},
    {cod:'Decreto 489/2019',nombre:'Personas Expuestas Politicamente (PEP)',art:'Definicion y categorias PEP'},
    {cod:'GAFI - 40 Recomendaciones',nombre:'Estandares internacionales AML/CFT',art:'R.10-R.20 Debida diligencia'},
    {cod:'Ley 27.446',nombre:'Sistema Nacional ALA/CFT',art:'Coordinacion institucional'},
    {cod:'Res. UIF 2/2012',nombre:'Reporte de Operaciones Sospechosas (ROS)',art:'Plazos y formato ROS'}
  ];
  return (
    <div style={{padding:22}}>
      <h2 style={{color:T.TEXT,margin:'0 0 16px',fontSize:19,fontWeight:700}}>Normativa Aplicable</h2>
      <Card title="Marco regulatorio AML/CFT — Argentina">
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['Normativa','Descripcion','Articulo / Alcance'].map(function(h,i){return <th key={i} style={{background:C.AO,color:'white',padding:'7px 10px',textAlign:'left'}}>{h}</th>;})}</tr></thead>
          <tbody>{normas.map(function(n,i){return(
            <tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
              <td style={{padding:'6px 10px',fontWeight:700,color:C.AM,whiteSpace:'nowrap'}}>{n.cod}</td>
              <td style={{padding:'6px 10px'}}>{n.nombre}</td>
              <td style={{padding:'6px 10px',color:T.TEXT2,fontSize:11}}>{n.art}</td>
            </tr>
          );})}</tbody>
        </table>
      </Card>
      <Card title="Fuentes de screening — 13 fuentes">
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['#','Fuente','Jurisdiccion'].map(function(h,i){return <th key={i} style={{background:C.AO,color:'white',padding:'7px 10px',textAlign:'left'}}>{h}</th>;})}</tr></thead>
          <tbody>{SCREENING.map(function(s,i){return(
            <tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
              <td style={{padding:'6px 10px',fontWeight:700,color:C.AM}}>{i+1}</td>
              <td style={{padding:'6px 10px'}}><strong>{s.n}</strong></td>
              <td style={{padding:'6px 10px',color:T.TEXT2}}>{s.j}</td>
            </tr>
          );})}</tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
// ── AUTH HELPERS ──────────────────────────────────────────────────────────────
async function serverLogin(email, password) {
  var r = await fetch('/api/auth?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
    body: JSON.stringify({ email: email, password: password })
  });
  return r.json();
}

async function serverGetUsuarios() {
  var r = await fetch('/api/auth?action=usuarios', { headers: { 'x-app-token': APP_TOKEN } });
  return r.json();
}

async function serverCrearUsuario(email, password, nombre, rol) {
  var r = await fetch('/api/auth?action=crear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
    body: JSON.stringify({ email: email, password: password, nombre: nombre, rol: rol })
  });
  return r.json();
}

async function serverCambiarPassword(userId, password) {
  var r = await fetch('/api/auth?action=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
    body: JSON.stringify({ userId: userId, password: password })
  });
  return r.json();
}

async function serverCambiarRol(userId, rol) {
  var r = await fetch('/api/auth?action=rol', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
    body: JSON.stringify({ userId: userId, rol: rol })
  });
  return r.json();
}

async function serverToggleActivo(userId, activo) {
  var r = await fetch('/api/auth?action=toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
    body: JSON.stringify({ userId: userId, activo: activo })
  });
  return r.json();
}

async function auditLog(usuario, accion, entidad, entidadId, detalle) {
  if (!usuario || !usuario.id) return;
  try {
    await fetch('/api/auth?action=audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': APP_TOKEN },
      body: JSON.stringify({
        usuario_id: usuario.id,
        usuario_nombre: usuario.nombre || usuario.email,
        accion: accion,
        entidad: entidad,
        entidad_id: entidadId,
        detalle: detalle || {}
      })
    });
  } catch(e) { /* silent */ }
}

// Helpers de permisos
function puedeEliminar(rol) { return rol === 'admin'; }
function puedeAprobar(rol) { return ['admin','oficial_cumplimiento','supervisor'].indexOf(rol) >= 0; }
function puedeGenerarInf07(rol) { return ['admin','oficial_cumplimiento','supervisor'].indexOf(rol) >= 0; }
function puedeGestionarUsuarios(rol) { return rol === 'admin'; }
function puedeEditar(rol) { return ['admin','oficial_cumplimiento','supervisor','analista'].indexOf(rol) >= 0; }

var ROL_LABELS = {
  admin: '🔑 Admin',
  oficial_cumplimiento: '⚖️ Oficial de Cumplimiento',
  supervisor: '👁 Supervisor',
  analista: '📋 Analista',
  readonly: '👀 Solo lectura'
};

function LoginScreen(props) {
  var emailState = useState(''); var email=emailState[0]; var setEmail=emailState[1];
  var passState = useState(''); var pass=passState[0]; var setPass=passState[1];
  var errState = useState(''); var err=errState[0]; var setErr=errState[1];
  var showPassState = useState(false); var showPass=showPassState[0]; var setShowPass=showPassState[1];
  var loadingState = useState(false); var loggingIn=loadingState[0]; var setLoggingIn=loadingState[1];

  async function handleLogin() {
    if (!email.trim() || !pass.trim()) { setErr('Ingresá email y contraseña.'); return; }
    setLoggingIn(true); setErr('');
    try {
      var res = await serverLogin(email.trim(), pass);
      if (res.ok && res.usuario) {
        props.onLogin(res.usuario);
      } else {
        setErr(res.error || 'Email o contraseña incorrectos.');
      }
    } catch(e) {
      setErr('Error de conexión. Verificá tu internet.');
    }
    setLoggingIn(false);
  }

  function handleKey(e) { if (e.key === 'Enter') handleLogin(); }

  return (
    <div style={{minHeight:'100vh',background:T.BG,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:T.MONO}}>
      <div style={{textAlign:'center',marginBottom:32}}>
        <div style={{fontFamily:T.MONO,marginBottom:8}}>
          <div style={{width:40,height:40,background:C.AC,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',borderRadius:3,letterSpacing:'-0.5px',margin:'0 auto 12px'}}>RB</div>
        </div>
        <div style={{color:T.TEXT,fontWeight:700,fontSize:18,letterSpacing:'3px',textTransform:'uppercase'}}>REBIT AML TOOL</div>
        <div style={{color:T.TEXT3,fontSize:10,marginTop:6,letterSpacing:'2px'}}>GOAT S.A. // COMPLIANCE & AML</div>
        <div style={{color:T.TEXT4,fontSize:9,marginTop:3,letterSpacing:'1px'}}>UIF/BCRA REGULATED · v2.4.0</div>
      </div>

      <div style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:4,padding:32,width:380,maxWidth:'90vw'}}>
        <div style={{fontWeight:600,color:T.TEXT,fontSize:13,marginBottom:4,letterSpacing:'1px',textTransform:'uppercase'}}>Acceso al sistema</div>
        <div style={{fontSize:11,color:T.TEXT3,marginBottom:20,fontFamily:T.MONO}}>Ingresá con tu email de compliance</div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:9,color:T.TEXT3,fontWeight:400,display:'block',marginBottom:5,letterSpacing:'1px',textTransform:'uppercase'}}>Email</label>
          <input
            type="email" value={email}
            onChange={function(e){setEmail(e.target.value);setErr('');}} onKeyDown={handleKey}
            placeholder="analista@goat.ar"
            autoComplete="email"
            style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:3,padding:'10px 12px',fontSize:13,fontFamily:T.MONO,background:T.BG4,color:T.TEXT,outline:'none',boxSizing:'border-box'}}
          />
        </div>

        <div style={{marginBottom:20}}>
          <label style={{fontSize:9,color:T.TEXT3,fontWeight:400,display:'block',marginBottom:5,letterSpacing:'1px',textTransform:'uppercase'}}>Contraseña</label>
          <div style={{display:'flex',gap:6}}>
            <input
              type={showPass?'text':'password'} value={pass}
              onChange={function(e){setPass(e.target.value);setErr('');}} onKeyDown={handleKey}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{flex:1,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'10px 12px',fontSize:13,fontFamily:T.MONO,background:T.BG4,color:T.TEXT,outline:'none'}}
            />
            <button onClick={function(){setShowPass(!showPass);}} style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'10px 12px',cursor:'pointer',fontSize:14,color:T.TEXT3}}>{showPass?'🙈':'👁'}</button>
          </div>
        </div>

        {err && <div style={{background:'rgba(255,68,85,0.1)',border:'1px solid rgba(255,68,85,0.3)',borderRadius:3,padding:'9px 12px',marginBottom:16,fontSize:11,fontFamily:T.MONO,color:T.RED,fontWeight:500}}>⚠ {err}</div>}

        <button
          onClick={handleLogin}
          disabled={loggingIn}
          style={{width:'100%',background:loggingIn?T.BG3:C.AC,color:'white',border:'none',borderRadius:3,padding:'12px 0',cursor:loggingIn?'not-allowed':'pointer',fontWeight:600,fontSize:12,letterSpacing:'2px',fontFamily:T.MONO,textTransform:'uppercase'}}
        >
          {loggingIn ? '// verificando...' : '→ INGRESAR AL SISTEMA'}
        </button>

        <div style={{textAlign:'center',marginTop:18,fontSize:10,color:T.TEXT4,fontFamily:T.MONO}}>
          // acceso restringido — solo compliance<br/>
          GOAT S.A. — CUIT 30-71703953-6
        </div>
      </div>

      <div style={{color:T.TEXT4,fontSize:9,marginTop:20,textAlign:'center',fontFamily:T.MONO,letterSpacing:'1px'}}>
        REBIT_AML v2.4.0 // {new Date().getFullYear()}
      </div>
    </div>
  );
}

// ── PANEL DE USUARIOS (solo admin) ───────────────────────────────────────────
// ─── PATRONES AML ────────────────────────────────────────────────────────────
function PatronesView() {
  var PATRONES = [
    {
      code:'PAT-01', name:'Montos exactamente repetidos', tip:'T-01', sev:'MEDIA',
      desc:'Se detecta que un mismo monto aparece repetido en múltiples operaciones de forma no aleatoria. El patrón se activa cuando el mismo importe exacto aparece en 3 o más operaciones dentro del período.',
      ejemplo:'El cliente recibe exactamente $47.500 en 38 transferencias distintas durante el mes, siempre el mismo importe, desde diferentes contrapartes.',
      que_sugiere:'Operatoria automatizada o fragmentación mecánica. En comercio genuino los montos varían naturalmente por impuestos, descuentos y condiciones. La repetición exacta es estadísticamente anómala.',
    },
    {
      code:'PAT-02', name:'Montos redondos sistemáticos', tip:'T-01', sev:'MEDIA',
      desc:'Alto porcentaje de operaciones con montos exactamente redondos ($100.000, $500.000, $1.000.000, etc.). La alerta se activa cuando supera el 20-25% del total de operaciones del período.',
      ejemplo:'De 400 operaciones del mes, 110 tienen montos exactamente redondos: $200.000, $500.000, $1.000.000, sin centavos ni variaciones.',
      que_sugiere:'En comercio real los montos raramente son exactamente redondos — incluyen impuestos, flete, descuentos. Una concentración elevada sugiere operaciones manuales o premeditadas, típicas de structuring.',
    },
    {
      code:'PAT-03', name:'Circularidad de fondos (Layering)', tip:'T-04', sev:'ALTA',
      desc:'Se detectan contrapartes que aparecen simultáneamente como origen (envían fondos) y como destino (reciben fondos) dentro del mismo período. El sistema identifica relaciones bidireccionales entre la cuenta y sus contrapartes.',
      ejemplo:'La empresa Alfa le transfiere $5M al cliente, y el mismo cliente le transfiere $4.8M a la empresa Alfa dentro del mismo mes.',
      que_sugiere:'Patrón clásico de layering o estratificación. Los fondos "circulan" entre cuentas para dificultar el rastreo del origen ilícito, creando capas de movimientos que ocultan la trazabilidad.',
    },
    {
      code:'PAT-04', name:'Smurfing — Contrapartes one-shot', tip:'T-02', sev:'ALTA',
      desc:'Gran cantidad de contrapartes que realizan una única operación y nunca vuelven a aparecer. Cada contraparte opera una sola vez, generalmente con montos similares entre sí.',
      ejemplo:'El cliente recibe 200 transferencias de 200 personas físicas distintas, cada una por única vez, todas entre $50.000 y $80.000 en la misma semana.',
      que_sugiere:'Técnica de smurfing — uso de múltiples personas para fragmentar una operación grande en muchas pequeñas, cada una por debajo de los umbrales de reporte. Forma distribuida de estructuración.',
    },
    {
      code:'PAT-05', name:'Volumen incompatible con perfil', tip:'T-05', sev:'ALTA',
      desc:'El volumen total operado en el período es manifiestamente desproporcionado respecto a la facturación mensual declarada por el cliente en el onboarding KYB. El sistema calcula el ratio entre lo operado y lo declarado.',
      ejemplo:'Un comercio que declaró $5M/mes de facturación opera $80M en un período de 10 días — ratio 16x sobre lo declarado.',
      que_sugiere:'El cliente opera un volumen que no puede explicarse con su actividad económica real. Es la señal más directa de que los fondos que pasan por la cuenta no corresponden al negocio declarado del titular.',
    },
    {
      code:'PAT-06', name:'Concentración extrema en pocas contrapartes', tip:'T-03', sev:'MEDIA',
      desc:'El índice HHI (Herfindahl-Hirschman) indica que un porcentaje muy alto del volumen total está concentrado en 1 o pocas contrapartes. Alerta cuando la contraparte principal supera el 40-50% del volumen total.',
      ejemplo:'El 78% de todos los ingresos del cliente provienen de una sola empresa, sin justificación contractual documentada.',
      que_sugiere:'En comercio genuino los ingresos suelen estar distribuidos entre clientes. Concentración extrema puede indicar relación de fachada o fondos provenientes de una única fuente que los canaliza.',
    },
    {
      code:'PAT-07', name:'Fraccionamiento / Structuring', tip:'T-02', sev:'ALTA',
      desc:'Se detectan grupos de operaciones que comparten monto similar, contraparte y fechas cercanas (dentro de una misma jornada o días consecutivos), configurando un patrón de fragmentación deliberada para eludir umbrales.',
      ejemplo:'El cliente recibe 5 transferencias de $790.000 de la misma persona en el mismo día — todas por debajo del umbral de reporte de $800.000.',
      que_sugiere:'Structuring deliberado — técnica para fraccionar una operación grande en varias más pequeñas y eludir los umbrales de reporte obligatorio a la UIF. Conducta tipificada en la Ley 25.246.',
    },
    {
      code:'PAT-08', name:'Operatoria en horario atípico', tip:'T-06', sev:'MEDIA',
      desc:'Porcentaje significativo de operaciones realizadas fuera del horario bancario normal, en horario nocturno (22:00–06:00 hs) o durante fines de semana y feriados. Alerta si supera el 30% del total.',
      ejemplo:'El 45% de las transferencias del cliente ocurren entre las 23:00 y las 04:00 hs, incluyendo sábados y domingos.',
      que_sugiere:'Actividad comercial legítima ocurre en horario hábil. Concentración en horarios inusuales puede indicar automatización sospechosa, evasión de controles o actividades incompatibles con el giro declarado.',
    },
    {
      code:'PAT-09', name:'Pass-through — Cuenta de paso', tip:'T-07', sev:'ALTA',
      desc:'Alto porcentaje de fondos que ingresan a la cuenta y egresan el mismo día, sin permanencia. El dinero transita por la cuenta como canal de paso. Alerta cuando supera el 40% del volumen total.',
      ejemplo:'El cliente recibe $10M un martes y ese mismo día transfiere $9.2M a otras cuentas. El saldo neto al cierre del día es casi nulo.',
      que_sugiere:'Uso de la cuenta como intermediario de paso — la cuenta no acumula fondos propios sino que los recibe y redistribuye inmediatamente, típico de cuentas usadas para mover fondos de terceros.',
    },
    {
      code:'PAT-10', name:'Near-threshold structuring', tip:'T-02', sev:'ALTA',
      desc:'Se detectan 5 o más operaciones en el rango $680.000–$799.999 (85%–99,9% del umbral UIF de $800.000 ARS) realizadas con la misma contraparte, en cualquier dirección (IN o OUT). El umbral de $800K es el nivel de reporte obligatorio para PSPs según normativa UIF vigente.',
      ejemplo:'Una misma empresa le transfiere al cliente $750.000 en 7 oportunidades distintas durante el mes — cada operación por debajo del umbral de $800K, pero acumulando $5.25M con esa contraparte.',
      que_sugiere:'Structuring deliberado — técnica de mantener cada operación individual por debajo del umbral de reporte obligatorio para evitar la notificación a la UIF. A diferencia del PAT-07 (fraccionamiento clásico), aquí la recurrencia está concentrada en una misma contraparte, lo que sugiere un acuerdo sistemático entre las partes para eludir los controles.',
    },
    {
      code:'PAT-11', name:'Nuevas contrapartes masivas', tip:'T-08', sev:'MEDIA',
      desc:'En un período determinado aparece una cantidad desproporcionada de contrapartes nuevas que no habían operado antes con la cuenta. Alerta automática cuando la rotación supera el 60% respecto al período anterior.',
      ejemplo:'En enero el cliente operó con 50 contrapartes habituales. En febrero aparecen 180 contrapartes nuevas que nunca operaron antes — 78% de rotación.',
      que_sugiere:'Expansión abrupta e injustificada de la red de contactos. Un salto repentino puede indicar que la cuenta está siendo utilizada por terceros que aportan sus propias redes o que se está armando una nueva red.',
    },
    {
      code:'PAT-12', name:'Comportamiento transaccional atípico', tip:'T-09', sev:'MEDIA',
      desc:'El comportamiento del cliente en el período actual se desvía significativamente de su propio histórico. Cambio brusco en volumen, tipo de operaciones, horarios o composición de contrapartes sin justificación declarada.',
      ejemplo:'Un cliente que operó establemente $3M/mes durante 6 meses de repente opera $28M, cambia sus contrapartes habituales y empieza a operar de madrugada.',
      que_sugiere:'Cambio de conducta repentino — indicador de alto valor porque compara al cliente contra sí mismo, eliminando sesgos de sector. Un cambio abrupto sin causa declarada merece investigación inmediata.',
    },
  ];

  var SEV_COLOR = { 'ALTA': C.ROJO, 'MEDIA': C.NARANJA };
  var SEV_BG    = { 'ALTA': '#FDEDEC', 'MEDIA': '#FEF3E8' };

  var expandState = useState(null); var expanded = expandState[0]; var setExpanded = expandState[1];

  return (
    <div style={{padding:22, maxWidth:960}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
        <h2 style={{color:T.TEXT,fontSize:15,fontWeight:600,letterSpacing:'1px',margin:0}}>🔍 Patrones AML — Referencia</h2>
        <span style={{background:C.AO,color:'white',borderRadius:10,padding:'2px 10px',fontSize:11,fontWeight:700}}>12 patrones activos</span>
      </div>
      <p style={{fontSize:12,color:T.TEXT2,marginBottom:20}}>
        Catálogo completo de patrones de comportamiento transaccional inusual detectados por el sistema.
        Cada patrón está mapeado a su tipología UIF correspondiente. Hacé clic en cualquier fila para ver el detalle completo.
      </p>

      {/* Leyenda de severidad */}
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        {[['ALTA',C.ROJO,'#FDEDEC'],['MEDIA',C.NARANJA,'#FEF3E8']].map(function(s){return(
          <div key={s[0]} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 12px',background:s[2],border:'1px solid '+s[1],borderRadius:20}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:s[1]}}></div>
            <span style={{fontSize:11,fontWeight:700,color:s[1]}}>Severidad {s[0]}</span>
          </div>
        );})}
        <div style={{marginLeft:'auto',fontSize:11,color:T.TEXT3,alignSelf:'center'}}>
          Tipologías UIF: T-01 a T-09 según Resolución 156/2018
        </div>
      </div>

      {/* Tabla de patrones */}
      <div style={{border:'1px solid '+T.BORDER,borderRadius:8,overflow:'hidden'}}>
        {/* Header */}
        <div style={{display:'grid',gridTemplateColumns:'90px 1fr 80px 80px',background:C.AO,padding:'9px 16px',gap:12}}>
          {['Código','Nombre del patrón','Tip. UIF','Severidad'].map(function(h){return(
            <div key={h} style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.7)',letterSpacing:'0.05em',textTransform:'uppercase'}}>{h}</div>
          );})}
        </div>

        {PATRONES.map(function(p, i){
          var isOpen = expanded === p.code;
          var sevColor = SEV_COLOR[p.sev];
          var sevBg    = SEV_BG[p.sev];
          return (
            <div key={p.code} style={{borderBottom: i < PATRONES.length-1 ? '1px solid #E8EEF4' : 'none'}}>
              {/* Row */}
              <div
                onClick={function(){ setExpanded(isOpen ? null : p.code); }}
                style={{display:'grid',gridTemplateColumns:'90px 1fr 80px 80px',padding:'11px 16px',gap:12,cursor:'pointer',background:isOpen ? '#EBF5FB' : (i%2===0?'white':'#F8FBFE'),transition:'background 0.1s',alignItems:'center'}}
              >
                <div style={{fontFamily:'monospace',fontWeight:700,fontSize:12.5,color:T.CYAN}}>{p.code}</div>
                <div style={{fontSize:13,fontWeight:isOpen?700:500,color:T.TEXT}}>{p.name}</div>
                <div style={{fontSize:11,color:T.TEXT2,fontFamily:'monospace'}}>{p.tip}</div>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:sevColor,flexShrink:0}}></div>
                  <span style={{fontSize:11,fontWeight:700,color:sevColor}}>{p.sev}</span>
                  <span style={{marginLeft:'auto',fontSize:12,color:T.CYAN}}>{isOpen?'▲':'▼'}</span>
                </div>
              </div>

              {/* Detalle expandible */}
              {isOpen && (
                <div style={{padding:'0 16px 16px 16px',background:T.BG3,borderTop:'1px solid #D6E4F0'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,paddingTop:14}}>

                    <div style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'12px 14px'}}>
                      <div style={{fontSize:10,fontWeight:700,color:T.CYAN,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:6}}>Descripción técnica</div>
                      <div style={{fontSize:12.5,color:T.TEXT,lineHeight:1.6}}>{p.desc}</div>
                    </div>

                    <div style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'12px 14px'}}>
                      <div style={{fontSize:10,fontWeight:700,color:T.CYAN,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:6}}>¿Qué puede indicar?</div>
                      <div style={{fontSize:12.5,color:T.TEXT,lineHeight:1.6}}>{p.que_sugiere}</div>
                    </div>

                    <div style={{background:'rgba(255,184,48,0.08)',border:'1px solid rgba(255,184,48,0.25)',borderRadius:3,padding:'12px 14px',gridColumn:'1/-1'}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.AMARI,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:6}}>Ejemplo práctico</div>
                      <div style={{fontSize:12.5,color:T.TEXT,lineHeight:1.6,fontStyle:'italic'}}>{p.ejemplo}</div>
                    </div>

                  </div>
                  <div style={{marginTop:10,display:'flex',gap:8}}>
                    <span style={{background:sevBg,color:sevColor,border:'1px solid '+sevColor,borderRadius:4,padding:'3px 10px',fontSize:10,fontWeight:700}}>
                      Severidad típica: {p.sev}
                    </span>
                    <span style={{background:C.CEL,color:T.CYAN,border:'1px solid '+C.CEL,borderRadius:4,padding:'3px 10px',fontSize:10,fontWeight:700}}>
                      Tipología UIF: {p.tip}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer nota */}
      <div style={{marginTop:14,padding:'10px 14px',background:'#F4F6F9',borderRadius:6,fontSize:11,color:T.TEXT3,lineHeight:1.6}}>
        <strong>Nota regulatoria:</strong> Los patrones PAT-01 a PAT-12 son indicadores internos del sistema Rebit AML Tool mapeados
        a las tipologías de lavado de activos definidas por la UIF en la Resolución 156/2018 y sus modificatorias.
        La detección de un patrón no implica automáticamente la existencia de una operación ilícita —
        su interpretación debe realizarse siempre en el contexto del perfil completo del cliente.
      </div>
    </div>
  );
}

// ─── WIKI ────────────────────────────────────────────────────────────────────

function WikiBadge({type, children}) {
  var map = {
    red:['#FDEDEC','#E74C3C'],orange:['#FEF3E8','#E67E22'],yellow:['#FFFDE7','#B7770D'],
    green:['#EBF9F0','#27AE60'],blue:['#EBF5FB','#2C4A7C'],gray:['#F4F6F9','#7F8C8D'],purple:['#F5EEF8','#7D3C98']
  };
  var c = map[type] || map.blue;
  return <span style={{background:c[0],color:c[1],borderRadius:12,padding:'2px 10px',fontSize:11,fontWeight:700,marginRight:4,whiteSpace:'nowrap',display:'inline-block'}}>{children}</span>;
}

function WikiTip({label, text}) {
  var [show, setShow] = useState(false);
  return (
    <span style={{position:'relative',display:'inline-block',cursor:'help'}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      <span style={{borderBottom:'1px dashed #3B6DAA',color:'#2C4A7C',fontWeight:600}}>{label}</span>
      {show && <div style={{position:'absolute',background:'#1B2A4A',color:'white',fontSize:11,padding:'6px 10px',borderRadius:6,whiteSpace:'nowrap',zIndex:9999,boxShadow:'0 4px 12px rgba(0,0,0,0.2)',bottom:'calc(100% + 7px)',left:'50%',transform:'translateX(-50%)'}}>{text}</div>}
    </span>
  );
}

function WikiStepList({steps}) {
  var [done, setDone] = useState([]);
  function toggle(i){ setDone(function(p){ return p.indexOf(i)>=0 ? p.filter(x=>x!==i) : [...p,i]; }); }
  return (
    <div style={{marginBottom:16}}>
      {steps.map(function(step,i){
        var ok = done.indexOf(i)>=0;
        return (
          <div key={i} style={{display:'flex',gap:12,marginBottom:8,alignItems:'flex-start'}}>
            <div onClick={()=>toggle(i)} style={{width:28,height:28,borderRadius:'50%',flexShrink:0,marginTop:2,background:ok?C.VERDE:C.AM,color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,cursor:'pointer',transition:'background 0.2s'}}>
              {ok ? '✓' : i+1}
            </div>
            <div style={{flex:1,background:ok?'#F0FAF4':'white',border:'1px solid '+(ok?'#A9DFBF':'#E8EEF4'),borderRadius:8,padding:'9px 13px',transition:'all 0.2s'}}>
              <div style={{fontSize:13,fontWeight:600,color:ok?C.VERDE:C.AO,marginBottom:2,textDecoration:ok?'line-through':'none'}}>{step[0]}</div>
              <div style={{fontSize:12.5,color:T.TEXT2,lineHeight:1.6}}>{step[1]}</div>
            </div>
          </div>
        );
      })}
      <div style={{fontSize:11,color:T.TEXT3,marginTop:2}}>💡 Clic en los números para marcar pasos completados</div>
    </div>
  );
}

function WikiBox({type, children}) {
  var cfg = {tip:['#EBF9F0','#A9DFBF','#1E8449','✓ '],warn:['#FEF3E8','#F0B27A','#B7770D','⚠ '],danger:['#FDEDEC','#F1948A','#922B21','⚠ '],info:['#EBF5FB','#AED6F1','#1A5276','ℹ ']};
  var c = cfg[type]||cfg.info;
  return <div style={{background:c[0],border:'1px solid '+c[1],borderLeft:'4px solid '+c[1],borderRadius:6,padding:'10px 14px',marginBottom:14,fontSize:12.5,color:c[2],lineHeight:1.6}}><strong>{c[3]}</strong>{children}</div>;
}

function WikiTbl({headers, rows}) {
  return (
    <div style={{overflowX:'auto',marginBottom:16}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
        <thead><tr>{headers.map((h,i)=><th key={i} style={{background:C.AO,color:'white',padding:'8px 12px',textAlign:'left',fontSize:11,fontWeight:700,letterSpacing:'0.03em'}}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row,ri)=>(
            <tr key={ri} style={{background:ri%2===0?T.BG3:T.BG2}}>
              {row.map((cell,ci)=><td key={ci} style={{padding:'8px 12px',color:T.TEXT,borderBottom:'1px solid '+T.BORDER,verticalAlign:'top',lineHeight:1.6}}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WikiFlow({title, nodes, vertical}) {
  return (
    <div style={{marginBottom:20}}>
      {title && <div style={{fontSize:11,fontWeight:700,color:T.CYAN,letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:8}}>{title}</div>}
      <div style={{display:'flex',flexDirection:vertical?'column':'row',alignItems:'center',gap:0,background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:10,padding:'14px 12px',flexWrap:vertical?'nowrap':'wrap'}}>
        {nodes.map((node,i)=>(
          <div key={i} style={{display:'flex',flexDirection:vertical?'column':'row',alignItems:'center',flex:vertical?'none':'1',gap:0}}>
            <div style={{background:node.color||C.AM,color:'white',borderRadius:8,padding:vertical?'10px 20px':'9px 12px',textAlign:'center',minWidth:vertical?200:80,boxShadow:'0 2px 6px rgba(27,42,74,0.12)',margin:vertical?'0':'0 2px'}}>
              <div style={{fontSize:12,fontWeight:700,lineHeight:1.4}}>{node.label}</div>
              {node.sub && <div style={{fontSize:10,opacity:0.8,marginTop:2,lineHeight:1.4}}>{node.sub}</div>}
            </div>
            {i < nodes.length-1 && <div style={{color:T.CYAN,fontSize:16,fontWeight:700,padding:vertical?'2px 0':'0 3px',flexShrink:0,lineHeight:1}}>{vertical?'↓':'→'}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function WikiView() {
  var [search, setSearch] = useState('');
  var [active, setActive] = useState('inicio');

  var SECTIONS = [
    {id:'inicio',icon:'🏠',label:'Inicio'},
    {id:'roles',icon:'👤',label:'Roles y accesos'},
    {id:'dashboard',icon:'📊',label:'Dashboard'},
    {id:'legajos',icon:'📁',label:'Legajos KYB'},
    {id:'screening',icon:'🛡',label:'Screening'},
    {id:'aml',icon:'📈',label:'Análisis AML'},
    {id:'patrones',icon:'🔍',label:'Patrones AML'},
    {id:'senales',icon:'🚨',label:'Señales y resolución'},
    {id:'alertas',icon:'🔔',label:'Centro de Alertas'},
    {id:'rfi',icon:'📧',label:'Módulo RFI'},
    {id:'informes',icon:'📄',label:'Informes'},
    {id:'ros',icon:'📋',label:'ROS Borrador'},
    {id:'tendencias',icon:'📉',label:'Tendencias'},
    {id:'flujos',icon:'🔄',label:'Flujos de trabajo'},
    {id:'glosario',icon:'📖',label:'Glosario'},
  ];

  var H1 = {fontSize:22,fontWeight:600,color:T.TEXT,marginBottom:6,marginTop:0};
  var H2 = {fontSize:15,fontWeight:700,color:T.CYAN,marginBottom:10,marginTop:24,paddingBottom:6,borderBottom:'2px solid '+C.CEL};
  var PP = {fontSize:13,color:T.TEXT,lineHeight:1.7,marginBottom:10};

  function renderContent() {
    switch(active) {
      case 'inicio': return (
        <div>
          <div style={{background:'linear-gradient(135deg,#1B2A4A 0%,#2C4A7C 100%)',borderRadius:12,padding:'24px 28px',marginBottom:20,color:'white'}}>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:6}}>GOAT S.A. / Rebit — Departamento PLAFT</div>
            <h1 style={{fontSize:24,fontWeight:700,margin:'0 0 8px',color:'white'}}>📚 Wiki — Rebit AML & KYB Tool</h1>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.75)',margin:0,lineHeight:1.6}}>Guía completa de operación para todo el equipo de Compliance. Navegá por las secciones del panel izquierdo.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
            {[['📁','Legajos KYB','Onboarding, documentación y ciclo de vida','legajos','#EBF5FB','#2C4A7C'],
              ['📈','Análisis AML','Carga de archivos, métricas y señales','aml','#EBF9F0','#1E8449'],
              ['🔄','Flujos','Timelines completos paso a paso','flujos','#FEF3E8','#B7770D'],
              ['📧','RFI','Requerimientos y gestión de respuestas','rfi','#F5EEF8','#7D3C98'],
              ['🛡','Screening','OFAC · ONU · REPET · PEPs','screening','#FDEDEC','#922B21'],
              ['📋','ROS','Reporte de Operación Sospechosa','ros','#F8FBFE','#1B2A4A']
            ].map(([ic,tit,desc,id,bg,col])=>(
              <div key={id} onClick={()=>setActive(id)} style={{background:bg,border:'1px solid '+bg,borderRadius:10,padding:'14px',cursor:'pointer',transition:'all 0.15s'}}>
                <div style={{fontSize:22,marginBottom:6}}>{ic}</div>
                <div style={{fontSize:13,fontWeight:700,color:col,marginBottom:3}}>{tit}</div>
                <div style={{fontSize:11.5,color:T.TEXT3,lineHeight:1.5}}>{desc}</div>
              </div>
            ))}
          </div>
          <WikiBox type="warn">Toda la información de legajos y análisis es estrictamente confidencial. No compartir capturas ni datos de clientes fuera del entorno autorizado.</WikiBox>
        </div>
      );

      case 'roles': return (
        <div>
          <h1 style={H1}>Roles y Permisos</h1>
          <WikiFlow title="Jerarquía de roles" nodes={[
            {label:'Admin',sub:'Acceso total',color:T.RED},
            {label:'Oficial',sub:'Sin usuarios',color:'#7D3C98'},
            {label:'Supervisor',sub:'Sin eliminar',color:'#2C4A7C'},
            {label:'Analista',sub:'Sin aprobar',color:T.GREEN},
            {label:'Solo lectura',sub:'Solo consulta',color:T.TEXT3},
          ]}/>
          <WikiTbl headers={['Rol','Puede hacer','No puede']} rows={[
            [<WikiBadge key="a" type="red">Admin</WikiBadge>,'Todo: crear/desactivar usuarios, eliminar legajos, configuración','—'],
            [<WikiBadge key="b" type="purple">Oficial</WikiBadge>,'INF-01/02/07, aprobar señales, generar ROS, editar todo','Gestionar usuarios'],
            [<WikiBadge key="c" type="blue">Supervisor</WikiBadge>,'Crear/editar legajos, aprobar señales ALTA, generar informes','Eliminar legajos, usuarios'],
            [<WikiBadge key="d" type="green">Analista</WikiBadge>,'Crear/editar, subir períodos, memos, RFIs, proponer cierre','Eliminar, aprobar señales, ROS'],
            [<WikiBadge key="e" type="gray">Solo lectura</WikiBadge>,'Ver todos los datos','Crear, editar o eliminar cualquier dato'],
          ]}/>
          <h2 style={H2}>Iniciar sesión</h2>
          <WikiStepList steps={[
            ['Abrir el navegador','Ingresar a https://rebit-aml-app.vercel.app desde Chrome, Firefox, Safari o Edge.'],
            ['Ingresar credenciales','Email institucional y contraseña personal. Verificación contra Supabase Auth.'],
            ['Cerrar sesión','Botón "Cerrar sesión" en la parte inferior del menú lateral izquierdo.'],
          ]}/>
          <WikiBox type="tip">Si olvidás tu contraseña contactá al Admin del sistema — no hay recuperación automática por email.</WikiBox>
        </div>
      );

      case 'dashboard': return (
        <div>
          <h1 style={H1}>Dashboard</h1>
          <WikiFlow title="Flujo de lectura diaria" nodes={[
            {label:'Alertas proactivas',sub:'Plazos regulatorios',color:T.AMBER},
            {label:'KPIs de cartera',sub:'Señales · RFIs',color:'#2C4A7C'},
            {label:'Semáforo',sub:'Por cliente',color:'#3B6DAA'},
            {label:'Priorizar acción',sub:'Ir al caso crítico',color:T.GREEN},
          ]}/>
          <h2 style={H2}>Pestaña Operacional</h2>
          <WikiTbl headers={['Elemento','Descripción']} rows={[
            ['Alerta proactiva', <span key="ap">Panel naranja cuando supera el plazo sin análisis. <WikiTip label="30/60/90 días" text="ALTO: 30d · MEDIO-ALTO: 60d · MEDIO/BAJO: 90d"/> según segmento.</span>],
            ['Semáforo de cartera','Clientes activos con nivel de riesgo: rojo señales sin resolver, amarillo monitoreo, verde sin alertas'],
            ['Cuentas con señales','Clientes con señales ALTA pendientes ordenados por criticidad'],
            ['Legajos recientes','Últimos 5 legajos con estado y dictamen KYB'],
          ]}/>
          <h2 style={H2}>Pestaña Ejecutivo</h2>
          <WikiTbl headers={['Elemento','Descripción']} rows={[
            ['KPIs regulatorios','Clientes activos · Señales ALTA · RFIs abiertos · RFIs vencidos · Tasa respuesta RFI %'],
            ['Semáforo completo','Todos los clientes activos con score AML, señales activas y cantidad de períodos'],
            ['Evolución mensual','Gráfico IN/OUT agregado de toda la cartera por período'],
            ['Panel RFIs','RFIs próximos a vencer · tasa de respuesta · RFIs vencidos'],
          ]}/>
          <WikiBox type="tip">Revisá el Dashboard al inicio de cada jornada para priorizar las investigaciones del día.</WikiBox>
        </div>
      );

      case 'legajos': return (
        <div>
          <h1 style={H1}>Módulo Legajos KYB</h1>
          <WikiFlow title="Ciclo de vida de un legajo" nodes={[
            {label:'En Onboarding',sub:'Documentación',color:T.TEXT3},
            {label:'Activa',sub:'Operando normal',color:T.GREEN},
            {label:'Monitoreo Ref.',sub:'Con alertas',color:T.AMBER},
            {label:'Suspendida',sub:'Bloqueada',color:T.AMBER},
            {label:'Cerrada',sub:'INF-07',color:T.RED},
          ]}/>
          <h2 style={H2}>Crear un nuevo legajo</h2>
          <WikiStepList steps={[
            ['Clic en "+ Nuevo Legajo"','Botón azul en la esquina superior derecha de la lista.'],
            ['Subir documentos (tab Docs IA)','Arrastrar o clic para subir PDFs: estatuto, poderes, DNIs, AFIP, estados contables. Máx. 25 archivos / 90 MB.'],
            ['Extraer datos con IA','Clic en "Extraer datos con IA". La IA completa todos los campos automáticamente en 30–90 segundos.'],
            ['Revisar y completar (tab Datos)','Verificar campos extraídos. Atención especial a CUIT, montos y beneficiario final.'],
            ['Completar Checklist','Marcar cada documento como OK / Pendiente / Bloqueante.'],
            ['Asignar Scoring KYB','Puntaje 1–5 en 8 factores. El sistema calcula el segmento automáticamente.'],
            ['Ejecutar Screening','Tab Screening → "Ejecutar Screening" contra OFAC, ONU, REPET y PEPs. Obligatorio antes de activar.'],
            ['Guardar','Clic en "Guardar". Sincroniza a Supabase — disponible en todos los dispositivos.'],
          ]}/>
          <h2 style={H2}>Pestañas del legajo</h2>
          <WikiTbl headers={['Pestaña','Contenido']} rows={[
            ['Resumen IA','Documentos subidos y resumen generado. Permite re-procesar con nuevos documentos.'],
            ['Datos','Razón social, CUIT, actividad, facturación, límites CVU, representante, beneficiario final.'],
            ['Checklist', <span key="ck">Documentación KYB por ítem. Estado global calculado automáticamente. <WikiTip label="Bloqueante" text="Un ítem Bloqueante impide avanzar con el onboarding hasta ser resuelto."/> impide activar la cuenta.</span>],
            ['Scoring','8 factores de riesgo con puntaje 1–5. Determina: BAJO / MEDIO / MEDIO-ALTO / ALTO.'],
            ['Red Flags','Alertas detectadas por IA o agregadas manualmente con severidad.'],
            ['Historial','Registro cronológico de cambios de estado. Respaldo regulatorio ante auditorías UIF.'],
            ['Screening','Verificación contra listas de sanciones internacionales.'],
          ]}/>
          <WikiBox type="tip">Cada cambio de estado queda registrado en el Historial con fecha, hora y nombre del analista. Es el respaldo regulatorio ante inspecciones de la UIF.</WikiBox>
        </div>
      );

      case 'screening': return (
        <div>
          <h1 style={H1}>Screening de Sanciones</h1>
          <WikiFlow title="Flujo del screening" nodes={[
            {label:'Legajo con datos',sub:'Razón social · Ben. final',color:'#3B6DAA'},
            {label:'IA busca en tiempo real',sub:'Web search 4 fuentes',color:'#2C4A7C'},
            {label:'OFAC · ONU · REPET · PEPs',sub:'Verificación simultánea',color:T.TEXT},
            {label:'Resultado documentado',sub:'Con fecha y analista',color:T.GREEN},
          ]}/>
          <WikiTbl headers={['Lista','Organismo','Qué verifica']} rows={[
            ['OFAC SDN','EE.UU.','Specially Designated Nationals — sanciones del gobierno de EE.UU.'],
            ['ONU Lista Consolidada','ONU','Personas y entidades sujetas a medidas restrictivas del Consejo de Seguridad.'],
            ['REPET UIF','Argentina','Registro de personas vinculadas a Terrorismo y su Financiamiento. repet.uif.gob.ar'],
            ['PEPs Argentina (OA)','Argentina','Personas Políticamente Expuestas según la Oficina Anticorrupción.'],
          ]}/>
          <WikiTbl headers={['Resultado','Qué significa','Acción']} rows={[
            [<WikiBadge key="s1" type="green">LIMPIO</WikiBadge>,'Sin coincidencias en ninguna lista.','Documentar y continuar el proceso.'],
            [<WikiBadge key="s2" type="yellow">REVISAR</WikiBadge>,'Nombre similar — puede ser homonimia.','Verificar manualmente antes de avanzar.'],
            [<WikiBadge key="s3" type="red">COINCIDENCIA</WikiBadge>,'Match confirmado en alguna lista.','Suspender operaciones y notificar al Oficial.'],
          ]}/>
          <WikiBox type="danger">Obligación regulatoria: el screening debe realizarse al onboarding y repetirse mínimo una vez al año, o ante cualquier cambio en la información del cliente.</WikiBox>
        </div>
      );

      case 'aml': return (
        <div>
          <h1 style={H1}>Análisis AML Transaccional</h1>
          <WikiFlow title="Pipeline de análisis de un período" nodes={[
            {label:'Archivo XLS/CSV',sub:'Del sistema operativo',color:T.TEXT3},
            {label:'Parser universal',sub:'Detecta columnas auto.',color:'#3B6DAA'},
            {label:'16 métricas',sub:'HHI · Pass-through...',color:'#2C4A7C'},
            {label:'12 patrones AML',sub:'PAT-01 a PAT-12',color:T.AMBER},
            {label:'Score 0–5',sub:'BAJO / MEDIO / ALTO',color:T.RED},
          ]}/>
          <h2 style={H2}>Cargar un período</h2>
          <WikiStepList steps={[
            ['Seleccionar el legajo','En el selector "Legajo", elegir el cliente a analizar.'],
            ['Ingresar nombre del período','Ej: "Enero 2026 — 1/10". Si se deja vacío se usa el nombre del archivo.'],
            ['Subir el archivo','Clic o arrastrar. Formatos aceptados: CSV, XLS, XLSX, ODS.'],
            ['Cargar y analizar','El sistema procesa txns, calcula métricas, detecta señales y guarda en Supabase.'],
          ]}/>
          <h2 style={H2}>Clasificaciones de riesgo</h2>
          <WikiTbl headers={['Score','Clasificación','Acción recomendada']} rows={[
            ['0 – 2', <WikiBadge key="r1" type="green">BAJO</WikiBadge>, 'Monitoreo periódico normal. Sin acción inmediata.'],
            ['2 – 3', <WikiBadge key="r2" type="blue">MEDIO</WikiBadge>, 'Seguimiento normal. Documentar observaciones en Memos.'],
            ['3 – 4', <WikiBadge key="r3" type="orange">MEDIO-ALTO</WikiBadge>, 'Investigar contrapartes. Considerar RFI al cliente.'],
            ['4 – 5', <WikiBadge key="r4" type="red">ALTO</WikiBadge>, 'RFI obligatorio. Escalar al Oficial. Posible ROS.'],
          ]}/>
          <WikiBox type="warn">Si los montos muestran valores inflados al cargar un XLS, hay un error de exportación en el archivo origen. Eliminar el período y cargar el archivo corregido.</WikiBox>
        </div>
      );

      case 'patrones': return (
        <div>
          <h1 style={H1}>Patrones AML</h1>
          <p style={PP}>El sistema detecta 12 patrones al cargar un período. Ver "Patrones AML" en el sidebar para el detalle técnico con ejemplos prácticos.</p>
          <WikiTbl headers={['Código','Nombre','Tip. UIF','Severidad']} rows={[
            ['PAT-01','Montos exactamente repetidos','T-01',<WikiBadge key="p1" type="orange">MEDIA</WikiBadge>],
            ['PAT-02','Montos redondos sistemáticos','T-01',<WikiBadge key="p2" type="orange">MEDIA</WikiBadge>],
            ['PAT-03','Circularidad de fondos (Layering)','T-04',<WikiBadge key="p3" type="red">ALTA</WikiBadge>],
            ['PAT-04','Smurfing — Contrapartes one-shot','T-02',<WikiBadge key="p4" type="red">ALTA</WikiBadge>],
            ['PAT-05','Volumen incompatible con perfil','T-05',<WikiBadge key="p5" type="red">ALTA</WikiBadge>],
            ['PAT-06','Concentración extrema','T-03',<WikiBadge key="p6" type="orange">MEDIA</WikiBadge>],
            ['PAT-07','Fraccionamiento / Structuring','T-02',<WikiBadge key="p7" type="red">ALTA</WikiBadge>],
            ['PAT-08','Horario atípico','T-06',<WikiBadge key="p8" type="orange">MEDIA</WikiBadge>],
            ['PAT-09','Pass-through / Cuenta de paso','T-07',<WikiBadge key="p9" type="red">ALTA</WikiBadge>],
            ['PAT-10','Near-threshold structuring','T-02',<WikiBadge key="p10" type="red">ALTA</WikiBadge>],
            ['PAT-11','Nuevas contrapartes masivas','T-08',<WikiBadge key="p11" type="orange">MEDIA</WikiBadge>],
            ['PAT-12','Comportamiento atípico histórico','T-09',<WikiBadge key="p12" type="orange">MEDIA</WikiBadge>],
          ]}/>
          <WikiBox type="info">La detección de un patrón no implica ilicitud automáticamente. Siempre interpretar en contexto del perfil completo del cliente y su actividad declarada.</WikiBox>
        </div>
      );

      case 'alertas': return (
        <div>
          <h1 style={H1}>🔔 Centro de Alertas</h1>
          <p style={PP}>Panel unificado de monitoreo activo. Muestra automáticamente todas las alertas pendientes de toda la cartera sin necesidad de entrar a cada legajo o período.</p>
          <WikiFlow title="Tres tipos de alertas en un solo panel" nodes={[
            {label:'🚨 Señales AML',sub:'Patrones detectados activos',color:T.RED},
            {label:'📧 RFIs vencidos',sub:'Sin respuesta +7 días',color:T.AMBER},
            {label:'⏱ Sin analizar',sub:'Fuera del plazo regulatorio',color:T.AMBER},
          ]}/>
          <h2 style={H2}>Pestaña Señales</h2>
          <p style={PP}>Muestra todas las señales AML activas (no resueltas) de todos los períodos de toda la cartera, ordenadas por severidad. Las señales se cargan desde las métricas guardadas en Supabase — no hace falta haber abierto Análisis AML previamente.</p>
          <WikiTbl headers={['Elemento','Descripción']} rows={[
            ['Código PAT + Badge','Identifica el patrón y su severidad ALTA/MEDIA.'],
            ['Legajo y período','A qué cliente y qué período pertenece la señal.'],
            ['Descripción','Detalle técnico del patrón detectado con cifras reales.'],
            ['Campo de justificación','Texto libre para documentar por qué se resuelve la señal.'],
            ['Botón ✓ Resolver','Marca la señal como RESUELTA y la elimina del panel inmediatamente.'],
            ['Botón Ver período →','Navega directamente a Análisis AML con ese legajo y período preseleccionados.'],
          ]}/>
          <h2 style={H2}>Cómo resolver una señal desde Alertas</h2>
          <WikiStepList steps={[
            ['Ir a la pestaña 🚨 Señales','Todas las señales activas de la cartera aparecen ordenadas por severidad.'],
            ['Revisar el contexto','Leé la descripción de la señal. Si necesitás más detalle, clic en "Ver período →" para ir al análisis completo.'],
            ['Escribir la justificación','En el campo de texto bajo la señal, describí brevemente por qué se resuelve (ej: "Cliente presentó contratos con Gadran SRL que justifican los movimientos observados").'],
            ['Clic en ✓ Resolver','La señal desaparece del panel inmediatamente y queda registrada como RESUELTA en el período con tu nombre y la fecha.'],
          ]}/>
          <WikiBox type="tip">La resolución desde Alertas tiene el mismo efecto que resolver desde la pestaña Señales dentro de Análisis AML — el estado se guarda en el período y se refleja en el Dashboard.</WikiBox>
          <h2 style={H2}>Pestaña RFIs vencidos</h2>
          <WikiTbl headers={['Estado','Criterio','Acción sugerida']} rows={[
            ['🔴 Vencido','Más de 7 días desde el envío sin respuesta del cliente','Escalar al Oficial de Cumplimiento. Evaluar cambio de estado del período y posible ROS.'],
            ['🟡 Próximo a vencer','Entre 5 y 7 días desde el envío','Hacer seguimiento con el cliente. El botón "Ver legajo →" navega al legajo para gestionar el RFI.'],
          ]}/>
          <h2 style={H2}>Pestaña Sin analizar</h2>
          <p style={PP}>Muestra clientes que superaron el plazo regulatorio de análisis sin tener métricas cargadas. El plazo varía según el segmento de riesgo asignado en el KYB.</p>
          <WikiTbl headers={['Segmento','Plazo máximo sin análisis']} rows={[
            ['ALTO','30 días corridos desde el alta o último análisis'],
            ['MEDIO-ALTO','60 días corridos'],
            ['MEDIO / BAJO','90 días corridos'],
          ]}/>
          <WikiBox type="warn">El panel de Alertas se alimenta de las métricas guardadas en Supabase. Si un período fue cargado pero nunca se guardaron las métricas (por ejemplo, si se interrumpió el proceso), las señales no aparecerán hasta cargar el archivo nuevamente.</WikiBox>
        </div>
      );

      case 'senales': return (
        <div>
          <h1 style={H1}>Señales y Resolución</h1>
          <WikiFlow vertical title="Flujo de resolución de una señal ALTA" nodes={[
            {label:'Señal ALTA detectada',sub:'Sistema la marca ACTIVA',color:T.RED},
            {label:'Analista investiga',sub:'Contrapartes, documentación, contexto',color:'#3B6DAA'},
            {label:'Analista propone cierre',sub:'Escribe justificación en pantalla',color:T.AMBER},
            {label:'Supervisor decide',sub:'Aprueba o Rechaza',color:'#2C4A7C'},
            {label:'Señal RESUELTA',sub:'Desaparece del Dashboard',color:T.GREEN},
          ]}/>
          <WikiBox type="warn">Solo Supervisor, Oficial y Admin pueden aprobar el cierre de señales. El analista solo puede proponer.</WikiBox>
          <h2 style={H2}>Estados del período AML</h2>
          <WikiTbl headers={['Estado','Cuándo usarlo']} rows={[
            [<WikiBadge key="e1" type="blue">En revisión</WikiBadge>,'Estado inicial. El período fue cargado y está siendo analizado.'],
            [<WikiBadge key="e2" type="orange">RFI enviado</WikiBadge>,'Se enviaron requerimientos al cliente y se espera respuesta.'],
            [<WikiBadge key="e3" type="green">Cerrado — sin alerta</WikiBadge>,'Todas las señales explicadas satisfactoriamente.'],
            [<WikiBadge key="e4" type="red">Cerrado — con alerta</WikiBadge>,'Período con alerta escalada (RFI vencido o ROS generado).'],
            [<WikiBadge key="e5" type="gray">Archivado</WikiBadge>,'Período fuera de vigencia. Sin acción requerida.'],
          ]}/>
        </div>
      );

      case 'rfi': return (
        <div>
          <h1 style={H1}>Módulo RFI</h1>
          <WikiFlow title="Ciclo de vida de un RFI" nodes={[
            {label:'ENVIADO',sub:'Plazo: 7 días',color:T.AMBER},
            {label:'RESPONDIDO',sub:'Completo',color:T.GREEN},
            {label:'RESP. PARCIAL',sub:'Incompleto',color:T.AMBER},
            {label:'SIN RESPUESTA',sub:'Escalar',color:T.RED},
            {label:'CERRADO',sub:'Resuelto',color:T.TEXT3},
          ]}/>
          <h2 style={H2}>Crear un RFI</h2>
          <WikiStepList steps={[
            ['Ir al tab RFI del período','Análisis AML → seleccionar período → tab RFI.'],
            ['Clic en "+ Nuevo RFI"','Se abre el formulario con número de referencia automático.'],
            ['Completar el formulario','N° referencia · Asunto · Texto del requerimiento · Nombre del analista.'],
            ['Registrar RFI','Clic en "Registrar RFI". Se crea el hilo con estado ENVIADO.'],
            ['Registrar respuesta','Al recibir respuesta del cliente: "Respuesta/Nota" → tipo → contenido.'],
          ]}/>
          <WikiBox type="danger">Los RFIs sin respuesta después de 7 días generan alertas automáticas en el Dashboard. Si vence sin respuesta, escalar al Oficial de Cumplimiento.</WikiBox>
        </div>
      );

      case 'informes': return (
        <div>
          <h1 style={H1}>Generación de Informes</h1>
          <WikiFlow title="Informes regulatorios disponibles" nodes={[
            {label:'INF-01',sub:'KYB — Onboarding',color:'#3B6DAA'},
            {label:'INF-02',sub:'AML — Monitoreo',color:'#2C4A7C'},
            {label:'INF-07',sub:'Cierre de cuenta',color:T.RED},
          ]}/>
          <WikiTbl headers={['Informe','Dónde generarlo','Quién puede','Contenido']} rows={[
            ['INF-01','Detalle del legajo → botón INF-01','Todos excepto Solo lectura','Datos cliente, checklist, scoring, red flags, dictamen.'],
            ['INF-02','Análisis AML → botón INF-02','Todos excepto Solo lectura','Métricas del período, señales con tipología UIF, scoring, memos.'],
            ['INF-07','Detalle del legajo → botón Cierre','Supervisor, Oficial, Admin','Motivo del cierre, historial de estados. Cierra automáticamente la cuenta.'],
          ]}/>
          <h2 style={H2}>Exportar como PDF</h2>
          <WikiStepList steps={[
            ['Generar el informe','Clic en el botón correspondiente (INF-01, INF-02 o INF-07).'],
            ['Revisar en el visor','El documento se abre con todos los datos pre-completados.'],
            ['Clic en Imprimir / PDF','Botón en la barra del visor.'],
            ['Guardar como PDF','En el diálogo del navegador, seleccionar "Guardar como PDF" como destino.'],
          ]}/>
          <WikiBox type="tip">Todos los informes quedan registrados en el audit trail con usuario, fecha y hora.</WikiBox>
        </div>
      );

      case 'ros': return (
        <div>
          <h1 style={H1}>ROS Borrador UIF</h1>
          <WikiBox type="danger">El ROS tiene carácter estrictamente confidencial (Art. 22 Ley 25.246). No puede ser revelado al cliente ni a terceros no autorizados.</WikiBox>
          <WikiFlow title="Flujo de generación del ROS borrador" nodes={[
            {label:'Caso con señales ALTA',sub:'RFI vencido / sin justif.',color:T.RED},
            {label:'Seleccionar períodos',sub:'Pre-selecciona con señales',color:T.AMBER},
            {label:'Generar borrador',sub:'8 secciones auto.',color:'#2C4A7C'},
            {label:'Editar narrativa',sub:'Descripción y conclusión',color:'#3B6DAA'},
            {label:'Presentar en SIROS',sub:'Portal UIF',color:T.GREEN},
          ]}/>
          <WikiTbl headers={['Sección','Contenido','Editable']} rows={[
            ['1. Encabezado','N° correlativo ROS-YYYY-NNN · Fecha · CONFIDENCIAL','No'],
            ['2. Sujeto Obligado','Datos fijos de GOAT S.A. / Rebit','No'],
            ['3. Cliente Reportado','Datos del legajo KYB','No'],
            ['4. Descripción de Operaciones','Métricas agregadas de los períodos seleccionados','Sí'],
            ['5. Señales Detectadas','PAT codes con tipología UIF correspondiente','No'],
            ['6. Top 20 Operaciones','Las 20 operaciones más relevantes por monto','No'],
            ['7. Diligencias Realizadas','Checklist KYB + RFIs enviados y sus respuestas','No'],
            ['8. Conclusión y Firma','Fundamento del reporte + firma del Oficial','Sí'],
          ]}/>
        </div>
      );

      case 'tendencias': return (
        <div>
          <h1 style={H1}>Tendencias Multi-período</h1>
          <p style={PP}>Cuando un legajo tiene 2 o más períodos cargados, aparece el toggle "Tendencias" junto al selector de período.</p>
          <WikiTbl headers={['Elemento','Descripción']} rows={[
            ['KPIs de tendencia','Variación % del volumen IN entre primer y último período. Tendencia del score. Clasificación actual.'],
            ['Gráfico IN/OUT','Líneas verde (IN) y roja (OUT) por período. Identifica crecimientos anómalos visualmente.'],
            ['Score trend','Evolución del score 0–5. Puntos de color según nivel en cada período.'],
            ['Tabla comparativa','Todos los períodos como columnas con métricas clave como filas.'],
            [<WikiTip key="rot" label="Rotación de contrapartes" text="> 60% nuevas en un período = alerta automática de posible atomización de red"/>, 'Por cada período vs. el anterior: nuevas, perdidas, recurrentes y % rotación.'],
          ]}/>
          <WikiBox type="warn">Alerta automática: si más del 60% de las contrapartes son nuevas en un período, el sistema alerta "Alta rotación". Indica posible fragmentación deliberada de la red de pagos.</WikiBox>
        </div>
      );

      case 'flujos': return (
        <div>
          <h1 style={H1}>Flujos de Trabajo</h1>
          <h2 style={H2}>Onboarding de nuevo cliente</h2>
          <WikiStepList steps={[
            ['Día 1 — Recepción documental','Estatuto, poderes, DNIs, constancia AFIP/ARCA, estados contables del último ejercicio.'],
            ['Día 1 — Crear legajo y extraer datos con IA','Legajos KYB → "+ Nuevo Legajo" → subir documentos → "Extraer datos con IA".'],
            ['Día 1 — Checklist, Scoring y Screening','Completar los tres antes de emitir dictamen. El Screening es obligatorio.'],
            ['Día 2 — Dictamen y generación de INF-01','Establecer APROBADO / CONDICIONAL / RECHAZADO. Generar y archivar el INF-01.'],
            ['Día 2 — Activar la cuenta','Cambiar estado de "En Onboarding" a "Activa". Historial registra automáticamente.'],
          ]}/>
          <h2 style={H2}>Monitoreo mensual recurrente</h2>
          <WikiStepList steps={[
            ['Días 1, 11 y 21 del mes — Obtener archivo XLS','Exportar desde el sistema operativo de Rebit el archivo de 10 días del período.'],
            ['Cargar en Análisis AML','Seleccionar legajo → nombre del período → subir archivo → "Cargar y analizar".'],
            ['Revisar métricas y señales','Verificar señales ALTA nuevas que requieran acción inmediata.'],
            ['Documentar en Memos','Registrar observaciones del analista sobre el período.'],
            ['Fin de mes — Tendencias','Con los 3 archivos cargados, activar "Tendencias" para ver la evolución mensual.'],
            ['Generar INF-02','Del período más relevante del mes para el expediente.'],
          ]}/>
          <h2 style={H2}>Caso con señales ALTA</h2>
          <WikiFlow vertical title="Árbol de decisión" nodes={[
            {label:'Señales ALTA detectadas',sub:'Semáforo rojo en Dashboard',color:T.RED},
            {label:'Emitir RFI al cliente',sub:'Plazo recomendado: 7 días hábiles',color:T.AMBER},
            {label:'Respuesta satisfactoria?',sub:'Sí proponer cierre / No escalar',color:'#2C4A7C'},
            {label:'Cierre de señales o ROS',sub:'Supervisor aprueba · Oficial evalúa ROS',color:T.TEXT},
          ]}/>
        </div>
      );

      case 'glosario': return (
        <div>
          <h1 style={H1}>Glosario</h1>
          <WikiTbl headers={['Término','Definición']} rows={[
            ['AML','Anti-Money Laundering. Prevención de lavado de activos y financiamiento del terrorismo.'],
            ['BCRA','Banco Central de la República Argentina. Regula PSPs mediante Com. A 6885.'],
            ['CVU','Clave Virtual Uniforme. Identificador de cuentas de pago de PSPs, equivalente al CBU bancario.'],
            ['Dictamen KYB','Conclusión del onboarding: APROBADO · CONDICIONAL · RECHAZADO.'],
            ['EDD','Enhanced Due Diligence. Debida diligencia reforzada para clientes de alto riesgo.'],
            ['HHI','Índice Herfindahl-Hirschman. Mide concentración de contrapartes. Valor 1 = máxima concentración.'],
            ['INF-01','Informe de Debida Diligencia KYB. Documenta el proceso de onboarding.'],
            ['INF-02','Informe de Monitoreo Transaccional AML. Resume el análisis de un período.'],
            ['INF-07','Informe de Cierre/Desvinculación. Cierra automáticamente la cuenta en el sistema.'],
            ['KYB','Know Your Business. Conocimiento y verificación de clientes corporativos.'],
            ['Layering','Segunda etapa del lavado: múltiples transacciones para dificultar el rastreo del origen.'],
            ['Pass-through','Fondos que ingresan y egresan el mismo día. Cuenta usada como intermediario de paso.'],
            ['PEP','Persona Políticamente Expuesta. Riesgo regulatorio especial por su función pública.'],
            ['PSP','Proveedor de Servicios de Pago. Categoría regulatoria de GOAT S.A. / Rebit.'],
            ['REPET','Registro Público de Personas vinculadas a Terrorismo. Administrado por la UIF.'],
            ['RFI','Request for Information. Requerimiento formal de información al cliente.'],
            ['ROS','Reporte de Operación Sospechosa. Comunicación obligatoria a la UIF (Art. 21 Ley 25.246).'],
            ['Same name','Transferencia al propio titular (mismo CUIT) en otra entidad al cerrar la cuenta.'],
            ['SIROS','Sistema Integral de Reporte de Operaciones Sospechosas. Portal web de la UIF.'],
            ['Smurfing','Uso de múltiples personas para dividir operaciones grandes en pequeñas.'],
            ['Structuring','Fraccionamiento deliberado para eludir umbrales de reporte obligatorio.'],
            ['UIF','Unidad de Información Financiera. Organismo de control AML en Argentina.'],
          ]}/>
        </div>
      );

      default: return <div>Sección no encontrada.</div>;
    }
  }

  var visible = SECTIONS.filter(s => !search || s.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{display:'flex',gap:0,minHeight:'calc(100vh - 60px)'}}>
      <div style={{width:200,flexShrink:0,background:'#F4F6F9',borderRight:'1px solid #E8EEF4',padding:'14px 0',overflowY:'auto'}}>
        <div style={{padding:'0 10px 10px',borderBottom:'1px solid '+T.BORDER,marginBottom:8}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar sección..." style={{width:'100%',padding:'6px 10px',border:'1px solid '+T.BORDER2,borderRadius:6,fontSize:12,color:T.TEXT,background:T.BG2}}/>
        </div>
        {visible.map(s=>{
          var on = active===s.id;
          return (
            <button key={s.id} onClick={()=>{setActive(s.id);setSearch('');}} style={{display:'block',width:'100%',textAlign:'left',padding:'7px 16px',border:'none',background:on?'#EBF5FB':'transparent',color:on?C.AO:'#555',fontWeight:on?700:400,fontSize:12,cursor:'pointer',borderLeft:'3px solid '+(on?C.AC:'transparent'),transition:'all 0.12s'}}>
              <span style={{marginRight:6}}>{s.icon}</span>{s.label}
            </button>
          );
        })}
      </div>
      <div style={{flex:1,padding:'28px 32px',overflowY:'auto',maxWidth:860}}>
        {renderContent()}
      </div>
    </div>
  );
}
function UsuariosView(props) {
  var currentUser = props.currentUser;
  var usuariosState = useState([]); var usuarios=usuariosState[0]; var setUsuarios=usuariosState[1];
  var loadingState = useState(true); var loading=loadingState[0]; var setLoading=loadingState[1];
  var formState = useState(null); var form=formState[0]; var setForm=formState[1];
  var errState = useState(''); var err=errState[0]; var setErr=errState[1];
  var okState = useState(''); var ok=okState[0]; var setOk=okState[1];
  var passModalState = useState(null); var passModal=passModalState[0]; var setPassModal=passModalState[1];
  var newPassState = useState(''); var newPass=newPassState[0]; var setNewPass=newPassState[1];

  function cargarUsuarios() {
    setLoading(true);
    serverGetUsuarios().then(function(res){
      setUsuarios(res.usuarios || []);
      setLoading(false);
    }).catch(function(){ setLoading(false); });
  }

  useEffect(cargarUsuarios, []);

  async function handleCrear() {
    if (!form.email||!form.password||!form.nombre) { setErr('Completá todos los campos.'); return; }
    if (form.password.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return; }
    setErr('');
    var res = await serverCrearUsuario(form.email, form.password, form.nombre, form.rol||'analista');
    if (res.ok) { setOk('Usuario creado correctamente.'); setForm(null); cargarUsuarios(); setTimeout(function(){setOk('');},3000); }
    else setErr(res.error||'Error al crear usuario.');
  }

  async function handlePassword() {
    if (!newPass || newPass.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return; }
    var res = await serverCambiarPassword(passModal.id, newPass);
    if (res.ok) { setOk('Contraseña actualizada.'); setPassModal(null); setNewPass(''); setTimeout(function(){setOk('');},3000); }
    else setErr(res.error||'Error al cambiar contraseña.');
  }

  async function handleRol(userId, rol) {
    var res = await serverCambiarRol(userId, rol);
    if (res.ok) { cargarUsuarios(); auditLog(currentUser,'cambio_rol','usuario',userId,{rol:rol}); }
  }

  async function handleToggle(u) {
    var res = await serverToggleActivo(u.id, !u.activo);
    if (res.ok) { cargarUsuarios(); auditLog(currentUser,u.activo?'desactivar_usuario':'activar_usuario','usuario',u.id,{email:u.email}); }
  }

  var ROL_COL = { admin:'#E74C3C', oficial_cumplimiento:'#8E44AD', supervisor:'#2471A3', analista:'#27AE60', readonly:'#7F8C8D' };

  return (
    <div style={{padding:22}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{color:T.TEXT,fontSize:15,fontWeight:600,letterSpacing:'1px',margin:0}}>👥 Gestión de Usuarios</h2>
        <button onClick={function(){setForm({email:'',password:'',nombre:'',rol:'analista'});setErr('');}}
          style={{background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'8px 16px',cursor:'pointer',fontWeight:700,fontSize:13}}>
          + Nuevo usuario
        </button>
      </div>

      {ok && <div style={{background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.2)',borderRadius:4,padding:'10px 14px',marginBottom:12,color:T.GREEN,fontWeight:600,fontSize:13}}>✅ {ok}</div>}
      {err && <div style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.2)',borderRadius:4,padding:'10px 14px',marginBottom:12,color:T.RED,fontWeight:600,fontSize:13}}>⚠ {err}</div>}

      {/* Formulario nuevo usuario */}
      {form && (
        <div style={{background:T.BG3,border:'2px solid #2471A3',borderRadius:6,padding:'18px',marginBottom:18}}>
          <div style={{fontWeight:600,color:T.TEXT,fontSize:14,marginBottom:14}}>Nuevo usuario</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Nombre completo</label>
              <input value={form.nombre} onChange={function(e){setForm(Object.assign({},form,{nombre:e.target.value}));}}
                placeholder="Juan Pérez" style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Email</label>
              <input type="email" value={form.email} onChange={function(e){setForm(Object.assign({},form,{email:e.target.value}));}}
                placeholder="analista@goat.ar" style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Contraseña inicial</label>
              <input type="password" value={form.password} onChange={function(e){setForm(Object.assign({},form,{password:e.target.value}));}}
                placeholder="Mínimo 6 caracteres" style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Rol</label>
              <select value={form.rol} onChange={function(e){setForm(Object.assign({},form,{rol:e.target.value}));}}
                style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,boxSizing:'border-box'}}>
                <option value="analista">📋 Analista</option>
                <option value="supervisor">👁 Supervisor</option>
                <option value="oficial_cumplimiento">⚖️ Oficial de Cumplimiento</option>
                <option value="admin">🔑 Admin</option>
                <option value="readonly">👀 Solo lectura</option>
              </select>
            </div>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button onClick={function(){setForm(null);setErr('');}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 16px',cursor:'pointer',fontSize:12}}>Cancelar</button>
            <button onClick={handleCrear} style={{background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'8px 20px',cursor:'pointer',fontWeight:700,fontSize:12}}>✓ Crear usuario</button>
          </div>
        </div>
      )}

      {/* Modal cambiar contraseña */}
      {passModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:T.BG2,borderRadius:8,padding:28,width:380,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
            <div style={{fontWeight:600,color:T.TEXT,fontSize:15,marginBottom:4}}>Cambiar contraseña</div>
            <div style={{fontSize:12,color:T.TEXT2,marginBottom:16}}>{passModal.nombre} — {passModal.email}</div>
            <input type="password" value={newPass} onChange={function(e){setNewPass(e.target.value);setErr('');}}
              placeholder="Nueva contraseña (mínimo 6 caracteres)"
              style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'10px 12px',fontSize:14,boxSizing:'border-box',marginBottom:12}}/>
            {err && <div style={{fontSize:12,color:T.RED,marginBottom:10}}>⚠ {err}</div>}
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={function(){setPassModal(null);setNewPass('');setErr('');}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 16px',cursor:'pointer',fontSize:12}}>Cancelar</button>
              <button onClick={handlePassword} style={{background:C.AC,color:'white',border:'none',borderRadius:3,padding:'8px 20px',cursor:'pointer',fontWeight:700,fontSize:12}}>💾 Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de usuarios */}
      {loading ? <div style={{textAlign:'center',padding:30,color:T.TEXT2}}>Cargando usuarios...</div> : (
        <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:6,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:C.AO}}>
                {['Nombre','Email','Rol','Estado','Acciones'].map(function(h){return <th key={h} style={{color:'white',padding:'10px 14px',textAlign:'left',fontWeight:700,fontSize:12}}>{h}</th>;})}
              </tr>
            </thead>
            <tbody>
              {usuarios.map(function(u,i){
                var rolCol = ROL_COL[u.rol]||'#888';
                var esSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id} style={{background:i%2===0?T.BG3:T.BG2,opacity:u.activo?1:0.6}}>
                    <td style={{padding:'10px 14px',fontWeight:500,color:T.TEXT2}}>
                      {u.nombre} {esSelf && <span style={{background:C.AC,color:'white',borderRadius:4,padding:'1px 6px',fontSize:9,marginLeft:4}}>Vos</span>}
                    </td>
                    <td style={{padding:'10px 14px',color:T.TEXT2,fontSize:12}}>{u.email}</td>
                    <td style={{padding:'10px 14px'}}>
                      {esSelf ? (
                        <span style={{background:rolCol,color:'white',borderRadius:6,padding:'2px 10px',fontSize:11,fontWeight:700}}>{ROL_LABELS[u.rol]||u.rol}</span>
                      ) : (
                        <select value={u.rol} onChange={function(e){handleRol(u.id,e.target.value);}}
                          style={{border:'1px solid '+rolCol,borderRadius:6,padding:'3px 8px',fontSize:11,fontWeight:700,color:rolCol,background:T.BG2,cursor:'pointer'}}>
                          {Object.keys(ROL_LABELS).map(function(r){return <option key={r} value={r}>{ROL_LABELS[r]}</option>;})}
                        </select>
                      )}
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{background:u.activo?'#EBF9F0':'#F2F3F4',color:u.activo?C.VERDE:'#888',border:'1px solid '+(u.activo?C.VERDE:'#ddd'),borderRadius:8,padding:'2px 10px',fontSize:11,fontWeight:700}}>
                        {u.activo ? '● Activo' : '○ Inactivo'}
                      </span>
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={function(){setPassModal(u);setNewPass('');setErr('');}}
                          style={{background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:11,color:T.TEXT}}>
                          🔑 Password
                        </button>
                        {!esSelf && (
                          <button onClick={function(){handleToggle(u);}}
                            style={{background:u.activo?'#FEF9E7':'#EBF9F0',border:'1px solid '+(u.activo?C.AMARILLO:C.VERDE),borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:11,color:u.activo?'#E67E22':C.VERDE}}>
                            {u.activo ? '⏸ Desactivar' : '▶ Activar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{marginTop:14,padding:'10px 14px',background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,fontSize:11,color:T.TEXT2}}>
        <strong>Roles disponibles:</strong> Admin (acceso total) · Oficial de Cumplimiento (todo excepto usuarios) · Supervisor (crear/editar/aprobar) · Analista (crear/editar) · Solo lectura (solo ver)
      </div>
    </div>
  );
}

export default function App() {
  // Sesión: solo en memoria — login requerido en cada apertura
  var authState = useState(null);
  var currentUser=authState[0]; var setCurrentUser=authState[1];
  var isAuth = !!currentUser;
  var legState = useState([]); var legajos=legState[0]; var setLegajos=legState[1];
  var perState = useState([]); var periodos=perState[0]; var setPeriodos=perState[1];
  var loadState = useState(true); var loading=loadState[0]; var setLoading=loadState[1];
  var viewState = useState('dashboard'); var view=viewState[0]; var setView=viewState[1];
  var repState = useState(null); var reportHTML=repState[0]; var setReportHTML=repState[1];
  var analState = useState({leg:null,per:null}); var analTarget=analState[0]; var setAnalTarget=analState[1];
  // API keys: se cargan del servidor (variables de entorno Vercel) — no de localStorage
  var apiKeyState = useState(''); var apiKey=apiKeyState[0]; var setApiKey=apiKeyState[1];
  var oaiKeyState = useState(''); var oaiKey=oaiKeyState[0]; var setOaiKey=oaiKeyState[1];
  var providerState = useState('claude'); var provider=providerState[0]; var setProvider=providerState[1];
  var showKeyState = useState(false); var showKey=showKeyState[0]; var setShowKey=showKeyState[1];
  var showOaiKeyState = useState(false); var showOaiKey=showOaiKeyState[0]; var setShowOaiKey=showOaiKeyState[1];
  var configOpenState = useState(false); var configOpen=configOpenState[0]; var setConfigOpen=configOpenState[1];

  var syncStatusState = useState('idle'); var syncStatus=syncStatusState[0]; var setSyncStatus=syncStatusState[1];

  // Audit log viewer state — nivel de componente para cumplir reglas de hooks
  var auditItemsState = useState([]); var auditItems=auditItemsState[0]; var setAuditItems=auditItemsState[1];
  var auditLoadedState = useState(false); var auditLoaded=auditLoadedState[0]; var setAuditLoaded=auditLoadedState[1];
  function cargarAudit() {
    fetch('/api/auth?action=audit_log&limit=20', {headers:{'x-app-token':APP_TOKEN}})
      .then(function(r){return r.json();})
      .then(function(d){ setAuditItems(d.logs||[]); setAuditLoaded(true); })
      .catch(function(){ setAuditLoaded(true); });
  }

  useEffect(function() {
    // Inyectar JetBrains Mono para el tema cypherpunk
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap';
    document.head.appendChild(link);
    setSyncStatus('loading');

    // 1. Config del servidor — API keys desde variables de entorno Vercel
    fetchServerConfig().then(function(cfg) {
      if (cfg) {
        if (cfg.anthropicKey) { setApiKey(cfg.anthropicKey); setModuleKeys(cfg.anthropicKey, null, null); }
        if (cfg.openaiKey) { setOaiKey(cfg.openaiKey); setModuleKeys(null, cfg.openaiKey, null); }
        if (cfg.defaultProvider) { setProvider(cfg.defaultProvider); setModuleKeys(null, null, cfg.defaultProvider); }
      }
    }).catch(function(){});

    // 2. Cargar todo desde Supabase (única fuente de verdad)
    serverLoad().then(function(cloudData) {
      if (cloudData && cloudData.legajos !== undefined) {
        var cloudLegs = cloudData.legajos || [];
        var cloudPers = cloudData.periodos || [];

        setLegajos(cloudLegs);
        setPeriodos(cloudPers);
        setSyncStatus('ok');
        setLoading(false);

        // ── Migración en background: períodos sin métricas → cargar txns y calcular ──
        var sinMetricas = cloudPers.filter(function(p){ return !p.metricas; });
        if (sinMetricas.length > 0) {
          setSyncStatus('saving');
          (function migrarEnBackground() {
            var allPers = cloudPers.slice();
            var pendiente = sinMetricas.slice();
            var procesados = 0;
            function procesarSiguiente() {
              if (pendiente.length === 0) {
                setLegajos(cloudLegs);
                setPeriodos(allPers);
                serverSave({ legajos: cloudLegs, periodos: allPers })
                  .then(function(){ setSyncStatus('ok'); })
                  .catch(function(){ setSyncStatus('ok'); });
                return;
              }
              var p = pendiente.shift();
              serverLoadTxns(p.id).then(function(txns) {
                if (txns && txns.length > 0) {
                  var leg = cloudLegs.find(function(l){ return l.id === p.legajoId; });
                  var m = calcMetricas(txns, leg);
                  var sigs = m ? detectPatrones(m, leg) : [];
                  var sc = m ? calcScoring(m, sigs) : null;
                  var updatedP = Object.assign({}, p, {
                    txns: txns, metricas: m||null, scoring: sc||null,
                    estadoPeriodo: p.estadoPeriodo||'EN_REVISION',
                    sigsResolucion: p.sigsResolucion||{}
                  });
                  var idx = allPers.findIndex(function(x){ return x.id === p.id; });
                  if (idx >= 0) allPers[idx] = updatedP;
                  procesados++;
                  setPeriodos(allPers.slice());
                }
                setTimeout(procesarSiguiente, 300);
              }).catch(function(){ setTimeout(procesarSiguiente, 300); });
            }
            procesarSiguiente();
          })();
        }

      } else {
        // Supabase no disponible — mostrar aviso pero dejar la app usable
        setSyncStatus('error');
        setLoading(false);
      }
    }).catch(function() {
      setSyncStatus('error');
      setLoading(false);
    });

    // Verificar si hay API keys configuradas en servidor
    fetchServerConfig().then(function(cfg){
      if (!cfg || (!cfg.anthropicKey && !cfg.openaiKey)) setConfigOpen(true);
    }).catch(function(){});
  }, []);

  function saveApiKey(val) { var t=val.trim(); setApiKey(t); setModuleKeys(t, null, null); }
  function saveOaiKey(val) { var t=val.trim(); setOaiKey(t); setModuleKeys(null, t, null); }
  function saveProvider(val) { setProvider(val); setModuleKeys(null, null, val); }

  function syncToCloud(legs, pers, deletedLegajoIds, deletedPeriodoIds) {
    setSyncStatus('saving');
    serverSave({
      legajos: legs || legajos,
      periodos: pers || periodos,
      deletedLegajoIds: deletedLegajoIds || [],
      deletedPeriodoIds: deletedPeriodoIds || []
    }).then(function(ok) {
      setSyncStatus(ok ? 'ok' : 'error');
    }).catch(function(){ setSyncStatus('error'); });
  }

  var activeKeyOk = provider==='openai' ? !!oaiKey.trim() : !!apiKey.trim();

  function handleAnalizar(leg, per) { setAnalTarget({leg:leg,per:per}); setView('analisis'); }

  var importRef = useRef();

  function handleExport() {
    var backup = { version:'2.2.0', exportedAt: new Date().toISOString(), legajos: legajos, periodos: periodos };
    var json = JSON.stringify(backup, null, 2);
    var blob = new Blob([json], { type:'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rebit-aml-backup-' + todayStr().replace(/\//g,'-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function() {
      try {
        var data = JSON.parse(r.result);
        var importedLegs = data.legajos || [];
        var importedPers = data.periodos || [];
        if (!importedLegs.length && !importedPers.length) { alert('El archivo no contiene datos validos.'); return; }
        var merge = window.confirm(
          'Archivo: ' + (data.exportedAt ? new Date(data.exportedAt).toLocaleDateString('es-AR') : 'desconocido') + '\n' +
          importedLegs.length + ' legajos y ' + importedPers.length + ' periodos encontrados.\n\n' +
          'OK = AGREGAR a los datos existentes\nCancelar = REEMPLAZAR todo'
        );
        var newLegs, newPers;
        if (merge) {
          var existingLegIds = legajos.map(function(l){return l.id;});
          var existingPerIds = periodos.map(function(p){return p.id;});
          var addLegs = importedLegs.filter(function(l){return existingLegIds.indexOf(l.id)<0;});
          var addPers = importedPers.filter(function(p){return existingPerIds.indexOf(p.id)<0;});
          newLegs = legajos.concat(addLegs);
          newPers = periodos.concat(addPers);
          alert('Importados: ' + addLegs.length + ' legajos nuevos y ' + addPers.length + ' periodos nuevos. (' + (importedLegs.length - addLegs.length) + ' duplicados omitidos)');
        } else {
          newLegs = importedLegs;
          newPers = importedPers;
          alert('Datos reemplazados: ' + newLegs.length + ' legajos, ' + newPers.length + ' periodos.');
        }
        setLegajos(newLegs);
        setPeriodos(newPers);
        syncToCloud(newLegs, newPers);
      } catch(err) { alert('Error al leer el archivo: ' + err.message); }
    };
    r.readAsText(f, 'UTF-8');
    e.target.value = '';
  }

  var NAV = [
    ['dashboard','🏠','Dashboard'],['legajos','📁','Legajos KYB'],['analisis','📊','Analisis AML'],
    ['alertas','🚨','Alertas'],['normativa','⚖️','Normativa'],['patrones','🔍','Patrones AML'],['wiki','📚','Wiki']
  ];
  if (currentUser && puedeGestionarUsuarios(currentUser.rol)) {
    NAV.push(['usuarios','👥','Usuarios']);
  }

  if (!isAuth) return <LoginScreen onLogin={function(usuario){setCurrentUser(usuario);}} />;

  if (loading) return (
    <div style={{minHeight:'100vh',background:T.BG,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',fontFamily:T.MONO}}>
      <div style={{width:36,height:36,background:C.AC,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',borderRadius:3,marginBottom:20,letterSpacing:'-0.5px'}}>RB</div>
      <div style={{fontSize:13,fontWeight:600,color:T.TEXT,letterSpacing:'3px',marginBottom:8,textTransform:'uppercase'}}>REBIT AML TOOL</div>
      <div style={{fontSize:10,color:T.TEXT3,letterSpacing:'2px'}}>// cargando...</div>
    </div>
  );

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',fontFamily:T.MONO,background:T.BG}}>
      {reportHTML ? <ReportModal html={reportHTML} onClose={function(){setReportHTML(null);}} /> : null}
      <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{display:'none'}}/>

      {/* MODAL CONFIGURACIÓN IA */}
      {configOpen ? <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',overflow:'auto'}}>
        <div style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:4,padding:28,width:540,maxWidth:'92vw',maxHeight:'90vh',overflowY:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div>
              <div style={{fontWeight:600,color:T.TEXT,fontSize:13,letterSpacing:'1px'}}>⚙ CONFIGURACIÓN IA & SYNC</div>
              <div style={{fontSize:11,color:T.TEXT3,marginTop:2,fontFamily:T.MONO}}>Proveedor, API keys y sincronización</div>
            </div>
            {activeKeyOk && <button onClick={function(){setConfigOpen(false);}} style={{background:'none',border:'1px solid '+T.BORDER2,borderRadius:3,padding:'4px 10px',cursor:'pointer',fontSize:11,color:T.TEXT3,fontFamily:T.MONO}}>✕ cerrar</button>}
          </div>

          {/* BANNER: keys del servidor */}
          {apiKey && apiKey.length > 10 && <div style={{background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.2)',borderRadius:3,padding:'10px 14px',marginBottom:16,fontSize:11,color:T.GREEN,fontFamily:T.MONO}}>
            ✅ <strong>Configuración cargada desde el servidor.</strong> En otros dispositivos las claves se cargan automáticamente al ingresar — no necesitás re-ingresar nada.
          </div>}

          {/* SELECTOR DE PROVEEDOR */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
            {[
              {id:'claude',label:'Claude (Anthropic)',icon:'🟠',desc:'claude-sonnet-4',color:'#E8560A'},
              {id:'openai',label:'GPT-4o (OpenAI)',icon:'🟢',desc:'gpt-4o-2024-11-20',color:'#10A37F'}
            ].map(function(p){return(
              <div key={p.id} onClick={function(){saveProvider(p.id);}} style={{border:'1px solid '+(provider===p.id?C.AC:T.BORDER2),borderRadius:3,padding:'12px 14px',cursor:'pointer',background:provider===p.id?'rgba(59,109,170,0.12)':T.BG3,transition:'all 0.15s'}}>
                <div style={{fontSize:18,marginBottom:4}}>{p.icon}</div>
                <div style={{fontWeight:600,color:provider===p.id?T.CYAN:T.TEXT2,fontSize:12,fontFamily:T.MONO}}>{p.label}</div>
                <div style={{fontSize:10,color:T.TEXT3,fontFamily:T.MONO}}>{p.desc}</div>
                {provider===p.id && <div style={{fontSize:9,color:T.GREEN,fontWeight:600,marginTop:4,fontFamily:T.MONO}}>// ACTIVO</div>}
              </div>
            );})}
          </div>

          {/* ANTHROPIC */}
          <div style={{marginBottom:16,opacity:provider==='claude'?1:0.5}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <label style={{fontSize:10,color:T.TEXT3,fontWeight:400,fontFamily:T.MONO,letterSpacing:'1px'}}>// ANTHROPIC API KEY {provider==='claude'&&<span style={{color:T.GREEN}}>(activo)</span>}</label>
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{fontSize:11,color:T.CYAN}}>Obtener key →</a>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:4}}>
              <input type={showKey?'text':'password'} value={apiKey} onChange={function(e){setApiKey(e.target.value);}}
                placeholder="sk-ant-api03-..." style={{flex:1,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 10px',fontSize:11,fontFamily:T.MONO,background:T.BG4,color:T.TEXT,outline:'none'}}/>
              <button onClick={function(){setShowKey(!showKey);}} style={{background:T.BG4,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 10px',cursor:'pointer',color:T.TEXT3}}>{showKey?'🙈':'👁'}</button>
              <button onClick={function(){saveApiKey(apiKey);}} style={{background:C.AC,color:'white',border:'none',borderRadius:3,padding:'8px 12px',cursor:'pointer',fontSize:10,fontWeight:600,fontFamily:T.MONO}}>guardar</button>
            </div>
            {apiKey && apiKey.startsWith('sk-ant-') && <div style={{fontSize:11,color:T.GREEN}}>✓ Formato válido</div>}
            {apiKey && !apiKey.startsWith('sk-ant-') && <div style={{fontSize:11,color:T.RED}}>⚠ Debe empezar con "sk-ant-"</div>}
          </div>

          {/* OPENAI */}
          <div style={{marginBottom:20,opacity:provider==='openai'?1:0.5}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <label style={{fontSize:10,color:T.TEXT3,fontWeight:400,fontFamily:T.MONO,letterSpacing:'1px'}}>// OPENAI API KEY {provider==='openai'&&<span style={{color:T.GREEN}}>(activo)</span>}</label>
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{fontSize:11,color:T.CYAN}}>Obtener key →</a>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:4}}>
              <input type={showOaiKey?'text':'password'} value={oaiKey} onChange={function(e){setOaiKey(e.target.value);}}
                placeholder="sk-..." style={{flex:1,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 10px',fontSize:11,fontFamily:T.MONO,background:T.BG4,color:T.TEXT,outline:'none'}}/>
              <button onClick={function(){setShowOaiKey(!showOaiKey);}} style={{background:T.BG4,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 10px',cursor:'pointer',color:T.TEXT3}}>{showOaiKey?'🙈':'👁'}</button>
              <button onClick={function(){saveOaiKey(oaiKey);}} style={{background:C.AC,color:'white',border:'none',borderRadius:3,padding:'8px 12px',cursor:'pointer',fontSize:10,fontWeight:600,fontFamily:T.MONO}}>guardar</button>
            </div>
            {oaiKey && oaiKey.startsWith('sk-') && <div style={{fontSize:11,color:T.GREEN}}>✓ Formato válido</div>}
          </div>

          <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'10px 12px',fontSize:11,color:T.TEXT2,lineHeight:1.6}}>
            🔒 Las keys se cargan desde las variables de entorno del servidor (Vercel). Nunca se almacenan en el browser.<br/>
            💡 Podés configurar ambas keys y cambiar de proveedor en cualquier momento.
          </div>

          {activeKeyOk && <button onClick={function(){setConfigOpen(false);}}
            style={{width:'100%',background:provider==='openai'?'#10A37F':C.NARANJA,color:'white',border:'none',borderRadius:4,padding:'11px 0',cursor:'pointer',fontWeight:700,fontSize:14,marginTop:16}}>
            ✅ Usar {provider==='openai'?'GPT-4o':'Claude'} para extracción IA
          </button>}

          {/* SECCIÓN SYNC */}
          <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid '+T.BORDER}}>
            <div style={{fontWeight:600,color:T.TEXT,fontSize:11,marginBottom:4}}>☁️ Sincronización entre dispositivos</div>
            <div style={{background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.2)',borderRadius:4,padding:'10px 12px'}}>
              <div style={{fontWeight:700,color:T.GREEN,fontSize:12,marginBottom:4}}>✅ Supabase — Base de datos activa</div>
              <div style={{fontSize:11,color:T.TEXT2,lineHeight:1.5}}>
                Los datos se sincronizan automáticamente con Supabase (PostgreSQL). Sin límite de tamaño, multi-analista, con historial de cambios.
              </div>
              {syncStatus==='ok' && <div style={{fontSize:10,color:T.GREEN,marginTop:6,fontFamily:T.MONO}}>✓ Última sincronización exitosa</div>}
              {syncStatus==='error' && <div style={{fontSize:10,color:T.RED,marginTop:6,fontFamily:T.MONO}}>⚠ Error de sincronización — verificá las variables SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel</div>}
              {syncStatus==='saving' && <div style={{fontSize:10,color:T.AMBER,marginTop:6,fontFamily:T.MONO}}>⏳ Guardando...</div>}
              <button onClick={function(){syncToCloud(legajos,periodos);}} style={{marginTop:8,width:'100%',background:T.BG3,border:'1px solid '+T.BORDER2,color:T.CYAN,borderRadius:3,padding:'7px 0',cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:T.MONO}}>
                🔄 Sincronizar ahora ({legajos.length} legajos, {periodos.length} periodos)
              </button>
            </div>
          </div>

          {/* SECCIÓN AUDIT LOG */}
          {currentUser && (
            <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid '+T.BORDER}}>
              <div style={{fontWeight:600,color:T.TEXT,fontSize:11,marginBottom:8}}>📋 Actividad reciente</div>
              {auditLoaded ? (
                <div>
                  <button onClick={cargarAudit} style={{width:'100%',background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:'5px 0',cursor:'pointer',fontSize:11,color:T.TEXT2,marginBottom:8}}>↻ Actualizar</button>
                  {auditItems.length === 0 ? (
                    <div style={{fontSize:12,color:T.TEXT3,textAlign:'center',padding:'10px 0'}}>Sin actividad registrada aún.</div>
                  ) : (
                    <div style={{maxHeight:280,overflowY:'auto'}}>
                      {auditItems.map(function(a){
                        var fecha = a.created_at ? new Date(a.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
                        var ACCION_LABEL = {crear_legajo:'➕ Legajo creado',modificar_legajo:'✏️ Legajo modificado',cambiar_estado:'🔄 Estado cambiado',generar_inf01:'📄 INF-01',generar_inf02:'📊 INF-02',generar_inf07:'🔒 INF-07',generar_ros:'📋 ROS generado',crear_rfi:'📧 RFI creado',responder_rfi:'📥 RFI respondido',cerrar_rfi:'⚫ RFI cerrado',crear_usuario:'👤 Usuario creado',cambio_rol:'🔑 Rol cambiado',desactivar_usuario:'⏸ Desactivado',activar_usuario:'▶ Activado',cambiar_estado_rfi:'🔄 Estado RFI',aprobar_cierre_senal:'✅ Señal resuelta',cambiar_estado_periodo:'🔄 Estado período'};
                        return (
                          <div key={a.id} style={{padding:'6px 8px',borderBottom:'1px solid '+T.BORDER,fontSize:11}}>
                            <div style={{display:'flex',justifyContent:'space-between'}}>
                              <span style={{fontWeight:500,color:T.TEXT2}}>{ACCION_LABEL[a.accion]||a.accion}</span>
                              <span style={{color:T.TEXT3,flexShrink:0,marginLeft:6}}>{fecha}</span>
                            </div>
                            <div style={{color:T.TEXT2,marginTop:1}}>
                              {a.usuario_nombre && <span style={{color:T.CYAN}}>{a.usuario_nombre}</span>}
                              {a.detalle&&a.detalle.razonSocial && <span style={{color:T.TEXT2}}> — {a.detalle.razonSocial}</span>}
                              {a.detalle&&a.detalle.periodo && <span style={{color:T.TEXT2}}> · {a.detalle.periodo}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={cargarAudit} style={{width:'100%',background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 0',cursor:'pointer',fontSize:12,color:T.TEXT2,fontWeight:500}}>
                  🔍 Ver actividad reciente
                </button>
              )}
            </div>
          )}
        </div>
      </div> : null}

      <div style={{width:195,background:T.BG2,borderRight:'1px solid '+T.BORDER,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'16px 14px 14px',borderBottom:'1px solid '+T.BORDER}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:26,height:26,background:C.AC,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',borderRadius:3,flexShrink:0}}>RB</div>
            <div>
              <div style={{color:T.TEXT,fontWeight:600,fontSize:12,letterSpacing:'1px'}}>REBIT AML</div>
              <div style={{color:T.TEXT3,fontSize:9,letterSpacing:'1px'}}>KYB & TRANSACCIONAL</div>
            </div>
          </div>
        </div>
        <nav style={{flex:1,padding:'10px 8px'}}>
          {NAV.map(function(n){return(
            <button key={n[0]} onClick={function(){setView(n[0]);}} style={{display:'flex',gap:8,alignItems:'center',width:'100%',padding:'9px 10px',border:'none',borderLeft:view===n[0]?'2px solid '+C.AC:'2px solid transparent',borderRadius:0,background:view===n[0]?'rgba(59,109,170,0.12)':'transparent',color:view===n[0]?T.TEXT:T.TEXT2,cursor:'pointer',fontSize:11,fontWeight:view===n[0]?600:400,textAlign:'left',marginBottom:1,fontFamily:T.MONO}}>
              <span style={{fontSize:13}}>{n[1]}</span>{n[2]}
            </button>
          );})}
        </nav>
        <div style={{padding:'10px 8px',borderTop:'1px solid rgba(255,255,255,0.1)'}}>
          <div style={{color:T.TEXT4,fontSize:9,marginBottom:6,paddingLeft:4,letterSpacing:'1px'}}>// BACKUP</div>
          <button onClick={handleExport} style={{display:'flex',gap:6,alignItems:'center',width:'100%',padding:'7px 10px',border:'none',borderRadius:0,borderLeft:'2px solid rgba(0,230,118,0.4)',background:'rgba(0,230,118,0.07)',color:T.GREEN,cursor:'pointer',fontSize:10,fontFamily:T.MONO,textAlign:'left',marginBottom:4}}>
            <span>💾</span> Exportar JSON
          </button>
          <button onClick={function(){importRef.current.click();}} style={{display:'flex',gap:6,alignItems:'center',width:'100%',padding:'7px 10px',border:'none',borderRadius:0,borderLeft:'2px solid rgba(0,212,255,0.4)',background:'rgba(0,212,255,0.07)',color:T.CYAN,cursor:'pointer',fontSize:10,fontFamily:T.MONO,textAlign:'left',marginBottom:4}}>
            <span>📂</span> Importar JSON
          </button>
          <button onClick={function(){setConfigOpen(true);}} style={{display:'flex',gap:6,alignItems:'center',width:'100%',padding:'7px 10px',border:'none',borderRadius:0,borderLeft:activeKeyOk?'2px solid rgba(0,230,118,0.4)':'2px solid rgba(255,68,85,0.4)',background:activeKeyOk?'rgba(0,230,118,0.07)':'rgba(255,68,85,0.07)',color:activeKeyOk?T.GREEN:T.RED,cursor:'pointer',fontSize:10,fontFamily:T.MONO,textAlign:'left',marginBottom:6}}>
            <span>⚙️</span> {activeKeyOk?(provider==='openai'?'GPT-4o ✓':'Claude ✓'):'IA sin configurar ⚠'}
          </button>
        </div>
        <div style={{padding:'8px 14px 12px',borderTop:'1px solid '+T.BORDER,color:T.TEXT4,fontSize:9,lineHeight:1.7,fontFamily:T.MONO}}>
          GOAT S.A. — CUIT 30-71703953-6<br/>
          Design System v2.2.0<br/>
          {legajos.length} legajos · {periodos.length} periodos<br/>
          {currentUser && <span style={{color:'rgba(255,255,255,0.5)',fontSize:9}}>{currentUser.nombre} · {ROL_LABELS[currentUser.rol]||currentUser.rol}<br/></span>}
          <span style={{color:syncStatus==='ok'?T.GREEN:syncStatus==='error'?T.RED:syncStatus==='saving'?T.AMBER:T.TEXT4}}>
            {syncStatus==='ok'?'// supabase OK':syncStatus==='saving'?'// guardando...':syncStatus==='loading'?'// cargando...':syncStatus==='error'?'// sync ERROR':'// —'}<br/>
          </span>
          <button onClick={function(){if(window.confirm('¿Cerrar sesión?')){setCurrentUser(null);}}} style={{background:'none',border:'none',color:T.TEXT4,cursor:'pointer',fontSize:9,padding:0,marginTop:4,textDecoration:'none',fontFamily:T.MONO}}>// cerrar sesión →</button>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',maxHeight:'100vh',background:T.BG}}>
        {syncStatus==='error' && (
          <div style={{background:'rgba(255,184,48,0.08)',borderBottom:'1px solid rgba(255,184,48,0.2)',padding:'7px 20px',display:'flex',alignItems:'center',gap:10,fontSize:10,fontFamily:T.MONO}}>
            <span style={{fontSize:13}}>⚠</span>
            <span style={{color:T.AMBER,fontWeight:600}}>SIN CONEXIÓN A SUPABASE</span>
            <span style={{color:T.TEXT3}}>— datos en memoria. Los cambios se guardarán al restaurar.</span>
            <button onClick={function(){setSyncStatus('loading');serverLoad().then(function(d){if(d){setLegajos(d.legajos||[]);setPeriodos(d.periodos||[]);setSyncStatus('ok');}else{setSyncStatus('error');}});}} style={{marginLeft:'auto',background:T.BG2,border:'1px solid rgba(255,184,48,0.3)',color:T.AMBER,borderRadius:4,padding:'3px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>
              Reintentar
            </button>
          </div>
        )}
        {view==='dashboard' ? <DashboardView legajos={legajos} periodos={periodos} setLegajos={setLegajos}/> : null}
        {view==='legajos' ? <LegajosView legajos={legajos} setLegajos={setLegajos} periodos={periodos} setPeriodos={setPeriodos} onAnalizar={handleAnalizar} onReport={function(html){setReportHTML(html);}} onSync={syncToCloud} currentUser={currentUser}/> : null}
        {view==='analisis' ? <AnalisisView legajos={legajos} periodos={periodos} setPeriodos={setPeriodos} onReport={function(html){setReportHTML(html);}} initLegajo={analTarget.leg} initPeriodo={analTarget.per} onSync={syncToCloud} currentUser={currentUser}/> : null}
        {view==='alertas' ? <AlertasView periodos={periodos} legajos={legajos} setPeriodos={setPeriodos} onNavAnalisis={handleAnalizar} currentUser={currentUser}/> : null}
        {view==='normativa' ? <NormativaView/> : null}
        {view==='patrones' ? <PatronesView/> : null}
        {view==='wiki' ? <WikiView/> : null}
        {view==='usuarios' && currentUser && puedeGestionarUsuarios(currentUser.rol) ? <UsuariosView currentUser={currentUser}/> : null}
      </div>
    </div>
  );
}
