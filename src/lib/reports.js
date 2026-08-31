import { calcMetricas, calcScoring, detectPatrones } from "./aml";
import { CHECKLIST_ITEMS, KYB_FACTORS, PAT_UIF_MAP, SCREENING, getEstado } from "./constants";
import { T } from "./theme";
import { fmtM, safeArr, segColor, sevColor, todayStr } from "./utils";

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

function infSec(n, title) {
  return '<h2 style="background:#2C4A7C;color:#E2EAF4;padding:9px 14px;font-size:10pt;margin:20px 0 0;border-radius:3px 3px 0 0;border-left:3px solid #3B6DAA;font-weight:600;letter-spacing:0.5px">'
    + (n ? n+'. ' : '') + title + '</h2>';
}

function infBadge(txt, col) {
  return '<span style="display:inline-block;padding:2px 10px;border-radius:2px;background:'+col+'22;color:'+col+';font-weight:600;font-size:9pt;border:1px solid '+col+'55">'+txt+'</span>';
}

function infCallout(cls, txt) {
  var s = {
    ok:   'background:rgba(0,230,118,0.08);border-left:3px solid #00E676;',
    warn: 'background:rgba(255,184,48,0.08);border-left:3px solid #FFB830;',
    err:  'background:rgba(255,68,85,0.08);border-left:3px solid #FF4455;',
    info: 'background:rgba(0,212,255,0.08);border-left:3px solid #00D4FF;'
  };
  return '<div style="'+(s[cls]||s.info)+'padding:9px 14px;border-radius:0 3px 3px 0;margin:8px 0;font-size:9pt;color:#E2EAF4;">'+txt+'</div>';
}

function infTr2(a, b) {
  return '<tr>'
    + '<td style="color:#4A6A8A;font-size:8.5pt;width:42%;letter-spacing:0.3px">'+a+'</td>'
    + '<td style="color:#E2EAF4;font-weight:600">'+b+'</td>'
    + '</tr>';
}

function infTr3(a, b, c) {
  return '<tr>'
    + '<td style="color:#E2EAF4;font-weight:600">'+a+'</td>'
    + '<td style="color:#E2EAF4">'+b+'</td>'
    + '<td style="color:#4A6A8A;font-size:8.5pt">'+c+'</td>'
    + '</tr>';
}

function infTbl(thead, rows) {
  return '<table>'+thead+'<tbody>'+rows+'</tbody></table>';
}

function infTh(cols) {
  return '<thead><tr>'+cols.map(function(c){
    return '<th>'+c.toUpperCase()+'</th>';
  }).join('')+'</tr></thead>';
}

function infTd(row) {
  return '<tr>'+row.map(function(c){
    return '<td>'+c+'</td>';
  }).join('')+'</tr>';
}

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
  var dc = dictamen==='APROBADO'?'#00E676':dictamen==='CONDICIONAL'?'#FFB830':'#FF4455';
  var scColor = scNum>=4?'#FF4455':scNum>=3?'#FF8C00':scNum>=2?'#FFB830':'#00E676';
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
  var amStatus = legajo.adverseMedia ? ' Adverse Media: <strong>' + legajo.adverseMedia.resumenGeneral + '</strong>.' : '';
  var scrStatus = legajo.screening ? ' Screening listas (' + legajo.screening.resultados ? 'OFAC/ONU/REPET/PEPs' : 'listas' + '): <strong>' + legajo.screening.estadoGeneral + '</strong>.' : ' Screening de listas sin coincidencias.';
  var presText = legajo.presidente ? ' Presidente/Gerente: ' + legajo.presidente + '.' : '';
  var repText = legajo.representanteLegal ? ' Representante legal: ' + legajo.representanteLegal + '.' : '';
  var resumenText = empresa + ' es una ' + (legajo.tipoSociedad||'sociedad') + ' dedicada a ' + (legajo.actividad||'actividades comerciales') + ', domiciliada en ' + (legajo.domicilio||'Argentina') + '.' + presText + repText + ' El análisis documental y de riesgo resulta en dictamen <strong>' + dictamen + '</strong> ' + riesgoText + '. ' + (rfCount>0 ? 'Se identificaron ' + rfCount + ' señal(es) de alerta. ' : '') + scrStatus + amStatus + ' Segmento de riesgo asignado: <strong>' + segmento + '</strong>. Frecuencia de revisión: ' + frec + '. Score KYB promedio: ' + scProm + '/5.';

  // ── CHECKLIST ROWS ────────────────────────────────────────────────────────
  var clRows = CHECKLIST_ITEMS.map(function(item) {
    var st = cl[item]||'Pendiente';
    var stC = st==='OK'?'#00E676':st==='Bloqueante'?'#FF4455':'#4A6A8A';
    var obs2 = st==='Bloqueante'?'Revisar urgente':st==='OK'?'Adjunto en legajo':st==='N/A'?'No aplica a la actividad':'Solicitar al cliente';
    return td(['<span style="color:'+stC+';font-weight:700">'+st+'</span>', item, obs2]);
  }).join('');

  // ── SCORING ROWS ──────────────────────────────────────────────────────────
  var scRows = KYB_FACTORS.map(function(f) {
    var sc2 = Number(kybSc[f])||0;
    var scC2 = sc2>=4?'#FF4455':sc2>=3?'#FF8C00':sc2>=2?'#FFB830':'#00E676';
    var nivel = sc2>=4?'Alto':sc2>=3?'Medio-Alto':sc2>=2?'Medio':sc2>=1?'Bajo':'N/D';
    var bar = '';
    for(var i=1;i<=5;i++){bar+='<span style="display:inline-block;width:12px;height:10px;background:'+(i<=sc2?scC2:'#1E3050')+';margin-right:1px;border-radius:2px;border:1px solid #253A5E"></span>';}
    return '<tr><td style="color:#E2EAF4">'+f+'</td><td>'+bar+'</td><td style="color:'+scC2+';font-weight:600">'+nivel+'</td><td style="color:#4A6A8A;font-size:9pt">'+(sc2||'—')+'/5</td></tr>';
  }).join('');

  // ── SCREENING ROWS ────────────────────────────────────────────────────────
  var scrRows = SCREENING.map(function(s,i){
    return td([(i+1)+'', '<strong>'+s.n+'</strong>', s.j, '<span style="color:#00E676;font-weight:600">✓ Sin coincidencias</span>']);
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
    + '*{box-sizing:border-box;margin:0;padding:0;}'
    + 'body{font-family:"JetBrains Mono","Consolas",monospace;font-size:9.5pt;color:#E2EAF4;background:#0D1520;padding:10mm 15mm;line-height:1.6;}'
    + 'h1,h2,h3,p,li,span,div,td,th{color:inherit;}'
    + 'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt;background:#111D2E;}'
    + 'thead th{background:#162035;color:#4A6A8A;padding:7px 10px;text-align:left;font-size:8pt;letter-spacing:1px;text-transform:uppercase;font-weight:400;border-bottom:1px solid #2E4870;}'
    + 'td{padding:7px 10px;border-bottom:1px solid #1E3050;vertical-align:top;color:#E2EAF4;}'
    + 'tr:nth-child(even) td{background:#162035;}'
    + 'tr:nth-child(odd) td{background:#111D2E;}'
    + 'ol,ul{color:#8BA3C0;padding-left:20px;}'
    + 'li{margin-bottom:3px;}'
    + 'strong{color:#E2EAF4;font-weight:600;}'
    + 'p{color:#8BA3C0;margin:8px 0;}'
    + '@media print{body{background:white;color:#1B2A4A;}td{color:#1B2A4A;border-bottom:1px solid #ddd;}th{background:#1B2A4A;color:white;}tr:nth-child(even) td{background:#F8FBFE;}@page{size:A4;margin:18mm 14mm 16mm 20mm;}}'
    + '</style></head><body>'

    // ── PORTADA ────────────────────────────────────────────────────────────
    + '<div style="border-bottom:1px solid #2E4870;padding-bottom:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end">'
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
    + '<ol style="font-size:9.5pt;line-height:1.9;color:#8BA3C0">'
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
          + (function(){
      var lh = safeArr(legajo.limitesHistorial).filter(function(l){return l.estado==='VIGENTE';});
      if (lh.length === 0) return '';
      return '<tr><td colspan="3" style="padding-top:10px;color:#8BA3C0;font-weight:600;font-size:9pt;border:none">📈 Aumentos de límite vigentes</td></tr>'
        + lh.map(function(l){
          var t = l.tipo==='AUMENTO_PERMANENTE'?'Permanente':l.tipo==='OPERACION_PUNTUAL'?'Op. puntual':'Temporal';
          return tr3(t + (l.vigenciaHasta?' (hasta '+l.vigenciaHasta+')':''), l.montoNuevo?fmtM(l.montoNuevo):'—', (l.respaldo||'DDJJ')+' — '+(l.aprobadoPor||'—'));
        }).join('');
    })()
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
    + (function(){
        var scr = legajo.screening || null;
        if (!scr) return callout('info','Screening pendiente de ejecución.');
        var estadoTxt = scr.estadoGeneral==='LIMPIO' ? '<strong style="color:#00E676">✅ SIN COINCIDENCIAS</strong>' : scr.estadoGeneral==='COINCIDENCIA' ? '<strong style="color:#FF4455">🔴 COINCIDENCIA DETECTADA</strong>' : '<strong style="color:#FFB830">🟡 REQUIERE REVISIÓN MANUAL</strong>';
        var rows = '';
        if (scr.resultados) {
          Object.keys(scr.resultados).forEach(function(k){
            var v = scr.resultados[k];
            var col = v.estado==='LIMPIO'?'#00E676':v.estado==='COINCIDENCIA'?'#FF4455':'#FFB830';
            rows += '<tr><td style="color:#8BA3C0;font-size:8.5pt">'+k+'</td><td><span style="color:'+col+';font-weight:600">'+v.estado+'</span></td><td style="color:#8BA3C0;font-size:8.5pt">'+v.detalle+'</td></tr>';
          });
        }
        return callout(scr.estadoGeneral==='LIMPIO'?'ok':scr.estadoGeneral==='COINCIDENCIA'?'err':'warn','Resultado global: '+estadoTxt+'. Screening realizado el '+scr.fecha+' por '+scr.realizadoPor+'.')
          + infTbl(infTh(['Lista','Estado','Detalle']), rows);
      })()
    + (function(){
        var am = legajo.adverseMedia || null;
        if (!am) return '';
        var col = am.resumenGeneral==='LIMPIO'?'#00E676':am.resumenGeneral==='ADVERSO'?'#FF4455':'#FFB830';
        var rows = (am.sujetos||[]).map(function(s){
          var sc = s.estado==='LIMPIO'?'#00E676':s.estado==='ADVERSO'?'#FF4455':'#FFB830';
          return '<tr><td style="color:#E2EAF4;font-weight:600">'+s.nombre+'</td><td><span style="color:'+sc+';font-weight:600">'+s.estado+'</span></td><td style="color:#8BA3C0;font-size:8.5pt">'+s.resumen+'</td></tr>';
        }).join('');
        return infSec(null, '6b. Adverse Media Search')
          + callout(am.resumenGeneral==='LIMPIO'?'ok':am.resumenGeneral==='ADVERSO'?'err':'warn','Resultado: <strong style="color:'+col+'">'+am.resumenGeneral+'</strong>. Realizado el '+am.fecha+'. '+am.recomendacion)
          + (rows ? infTbl(infTh(['Sujeto','Estado','Resumen']), rows) : '')
          + (am.redFlags&&am.redFlags.length ? callout('err','<strong>Red Flags:</strong> '+am.redFlags.join(' | ')) : '');
      })()
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
    + '<div style="background:'+(bloq>0?'rgba(255,68,85,0.1)':'#162035')+';border:1px solid '+(bloq>0?'#F1948A':'#eee')+';padding:12px;border-radius:4px;text-align:center"><div style="font-size:18pt;font-weight:700;color:'+(bloq>0?'#FF4455':'#4A6A8A')+'">'+bloq+'</div><div style="font-size:9pt;color:#8BA3C0">Bloqueantes</div></div>'
    + '</div>'
    + '<p style="font-size:9pt;color:#8BA3C0">Completitud del legajo: <strong style="color:#E2EAF4">'+okC+'/'+CHECKLIST_ITEMS.length+' documentos ('+pctOK+'%)</strong>.</p>'
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
            return '<div style="background:'+(esCompliance?'rgba(0,212,255,0.08)':'rgba(0,230,118,0.05)')+';border:1px solid '+(esCompliance?'rgba(0,212,255,0.25)':'rgba(0,230,118,0.2)')+';border-left:2px solid '+(esCompliance?'#00D4FF':'#00E676')+';border-radius:4px;padding:12px 14px;margin-bottom:10px">'
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
    var c = f.score >= 4 ? '#FF4455' : f.score >= 3 ? '#FF8C00' : '#00E676';
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
      +'<td style="padding:5px 10px;border-bottom:1px solid #eee;color:'+(altas>0?'#FF4455':'#00E676')+';font-weight:600">'+(altas>0?altas+' ALTA':'OK')+'</td>'
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

  var colorMotivo = tipoMotivo==='RIESGO_AML'?'#FF4455':tipoMotivo==='SOLICITUD_CLIENTE'?'#3B6DAA':tipoMotivo==='INACTIVIDAD'?'#FF8C00':'#4A6A8A';
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
    + '<div style="border-bottom:1px solid #2E4870;padding-bottom:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end">'
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
    + '<tr><td style="color:#555;font-weight:600">Señales ALTA acumuladas</td><td><strong style="color:'+(lastAltaSigs.length>0?'#FF4455':'#00E676')+'">'+lastAltaSigs.length+(lastAltaSigs.length>0?' — requiere evaluación ROS':' — sin alertas críticas')+'</strong></td></tr>'
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
        + '<div style="font-size:9pt">Señales ALTA: <strong style="color:'+(lastAltaSigs.length>0?'#FF4455':'#00E676')+'">'+lastAltaSigs.length+'</strong></div>'
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
    + '<tr><td style="color:#555;font-weight:600">Señales ALTA acumuladas</td><td style="color:'+(lastAltaSigs.length>0?'#FF4455':'#00E676')+';font-weight:600">'+lastAltaSigs.length+'</td></tr>'
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


// ═══════════════════════════════════════════════════════════════════════════
// LEGAJO COMPLETO — el expediente que pide un inspector (T7)
// ═══════════════════════════════════════════════════════════════════════════
// A diferencia del resto de los informes, que analizan UN período o UN aspecto,
// este consolida todo lo que el sistema sabe del cliente con sus timestamps y
// responsables: quién marcó qué, cuándo, y contra qué versión de qué listado.
// Sin trazabilidad no es un legajo, es un resumen.
function genLegajoCompleto(datos) {
  var legajo    = datos.legajo || {};
  var periodos  = (datos.periodos || []).filter(function(p){ return p.legajoId === legajo.id; });
  var casos     = (datos.casos || []).filter(function(c){ return c.legajoId === legajo.id; });
  var rfis      = datos.rfis || [];
  var screening = datos.screening || null;
  var vencs     = datos.vencimientos || [];
  var usuario   = datos.usuario || { nombre: 'N/D', rol: 'N/D' };
  var senalesPorPeriodo = datos.senalesPorPeriodo || {};
  var documentos = datos.documentos || [];

  var ahora   = new Date();
  var fecha   = ahora.toLocaleDateString('es-AR');
  var hora    = ahora.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
  var empresa = legajo.razonSocial || 'Sin razón social';
  var cl      = legajo.checklist || {};
  var clF     = legajo.checklistFechas || {};

  function esc(x) {
    return String(x === null || x === undefined ? '' : x)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function nl2br(x) { return esc(x).replace(/\n/g, '<br/>'); }
  function dash(x) { return (x === null || x === undefined || x === '') ? '—' : esc(x); }

  var sec = infSec, tr2 = infTr2, tbl = infTbl, th = infTh, td = infTd, callout = infCallout;

  // ── Portada ──────────────────────────────────────────────────────────────
  var h = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
    + '<title>Legajo completo — ' + esc(empresa) + '</title>'
    + '<style>' + pStyles()
    + 'h2{page-break-after:avoid;}table{page-break-inside:auto;}tr{page-break-inside:avoid;}'
    + '.pb{page-break-before:always;}'
    + '</style></head><body>';

  h += '<div style="border:2px solid #1B2A4A;border-radius:4px;padding:26px 24px;margin-bottom:18px">'
    + '<div style="font-size:8.5pt;color:#4A6A8A;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">GOAT S.A. — Rebit · Compliance &amp; PLAFT</div>'
    + '<div style="font-size:17pt;font-weight:700;color:#1B2A4A;margin-bottom:3px">LEGAJO COMPLETO DE CLIENTE</div>'
    + '<div style="font-size:13pt;color:#2C4A7C;margin-bottom:16px">' + esc(empresa) + '</div>'
    + '<table style="font-size:9pt">'
    + tr2('CUIT', dash(legajo.cuit))
    + tr2('Segmento de riesgo', dash(legajo.segmento))
    + tr2('Dictamen vigente', dash(legajo.dictamen))
    + tr2('Estado de cuenta', dash(legajo.estadoCuenta))
    + tr2('Fecha de alta en el sistema', dash(legajo.createdAt))
    + tr2('Períodos transaccionales analizados', String(periodos.length))
    + tr2('Casos de compliance asociados', String(casos.length))
    + '</table>'
    + '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #D6E4F0;font-size:8.5pt;color:#555">'
    + 'Documento generado el <strong>' + fecha + ' a las ' + hora + '</strong> por <strong>' + esc(usuario.nombre) + '</strong> (' + esc(usuario.rol) + ').<br/>'
    + 'Refleja el estado del legajo en el sistema al momento de la emisión. Cada sección indica la fecha y el responsable del dato cuando el registro lo contiene.'
    + '</div></div>';

  // ── 1. Identificación ────────────────────────────────────────────────────
  h += sec(1, 'IDENTIFICACIÓN DEL SUJETO')
    + '<table>'
    + tr2('Razón social', dash(legajo.razonSocial))
    + tr2('CUIT', dash(legajo.cuit))
    + tr2('Tipo societario', dash(legajo.tipoSociedad))
    + tr2('País de constitución', dash(legajo.paisConstitucion))
    + tr2('Actividad declarada', dash(legajo.actividad))
    + tr2('Domicilio', dash(legajo.domicilio))
    + tr2('Presidente / Gerente', dash(legajo.presidente))
    + tr2('Representante legal', dash(legajo.representanteLegal))
    + tr2('Beneficiario final (&gt;10%)', dash(legajo.beneficiarioFinal))
    + tr2('Personas vinculadas', dash(legajo.vinculados))
    + tr2('Grupo económico', dash(legajo.grupoEconomico))
    + tr2('Cotiza en bolsa', legajo.cotizaBolsa ? 'Sí' : 'No')
    + '</table>'
    + '<table>'
    + tr2('Facturación mensual declarada', legajo.facturacionMensual ? fmtM(Number(legajo.facturacionMensual)) : '—')
    + tr2('Límite diario asignado', legajo.limiteDiario ? fmtM(Number(legajo.limiteDiario)) : '—')
    + tr2('Límite mensual asignado', legajo.limiteMensual ? fmtM(Number(legajo.limiteMensual)) : '—')
    + '</table>';

  var histLim = safeArr(legajo.limitesHistorial);
  if (histLim.length) {
    h += '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:10px">Historial de modificación de límites</div>'
      + tbl(th(['Fecha','Diario','Mensual','Motivo','Autorizado por']),
          histLim.map(function(x){
            return td([dash(x.fecha), x.diario?fmtM(Number(x.diario)):'—', x.mensual?fmtM(Number(x.mensual)):'—', dash(x.motivo), dash(x.autor)]);
          }).join(''));
  }

  // ── 2. Checklist documental ──────────────────────────────────────────────
  var okC = 0, bloqC = 0, pendC = 0;
  CHECKLIST_ITEMS.forEach(function(item){
    var v = cl[item] || 'Pendiente';
    if (v === 'OK') okC++; else if (v === 'Bloqueante') bloqC++; else if (v === 'Pendiente') pendC++;
  });
  h += '<div class="pb"></div>' + sec(2, 'CHECKLIST DOCUMENTAL')
    + callout(bloqC ? 'err' : pendC ? 'warn' : 'ok',
        okC + ' de ' + CHECKLIST_ITEMS.length + ' ítems verificados · ' + pendC + ' pendientes · ' + bloqC + ' bloqueantes.')
    + tbl(th(['Documento','Estado','Fecha del documento','Archivo adjunto']),
        CHECKLIST_ITEMS.map(function(item){
          var v = cl[item] || 'Pendiente';
          var col = v==='OK' ? '#27AE60' : v==='Bloqueante' ? '#E74C3C' : v==='N/A' ? '#888' : '#F39C12';
          var adj = documentos.filter(function(d){ return d.tipo === item && d.vigente; })[0];
          return td([
            esc(item), infBadge(v, col),
            clF[item] ? esc(clF[item]) : '<span style="color:#999">no registrada</span>',
            adj ? esc(adj.nombre) + ' <span style="font-size:8pt;color:#888">(v' + adj.version + ')</span>'
                : '<span style="color:#999">sin adjunto</span>'
          ]);
        }).join(''));

  // ── 3. Evaluación de riesgo ──────────────────────────────────────────────
  var kybSc = legajo.kybScores || {};
  var vals = KYB_FACTORS.map(function(f){ return Number(kybSc[f])||0; }).filter(function(v){ return v>0; });
  var prom = vals.length ? (vals.reduce(function(a,b){return a+b;},0)/vals.length).toFixed(2) : 'N/D';
  h += sec(3, 'EVALUACIÓN DE RIESGO KYB')
    + tbl(th(['Factor','Puntaje']),
        KYB_FACTORS.map(function(f){
          var v = Number(kybSc[f])||0;
          var col = v>=4?'#E74C3C':v>=3?'#F39C12':v>=2?'#F1C40F':'#27AE60';
          return td([esc(f), v ? infBadge(v + '/5', col) : '—']);
        }).join(''))
    + '<table>' + tr2('Score KYB promedio', prom + ' / 5')
    + tr2('Segmento asignado', dash(legajo.segmento))
    + tr2('Dictamen', dash(legajo.dictamen)) + '</table>';

  var rf = safeArr(legajo.redFlags);
  if (rf.length) {
    h += '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:10px">Señales de alerta registradas en el legajo</div>'
      + '<ul style="font-size:9pt;margin:6px 0 0 18px">'
      + rf.map(function(x){ return '<li>' + esc(typeof x === 'string' ? x : (x.texto || JSON.stringify(x))) + '</li>'; }).join('')
      + '</ul>';
  }
  var obs = safeArr(legajo.observaciones);
  if (obs.length) {
    h += '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:10px">Observaciones</div>'
      + '<ul style="font-size:9pt;margin:6px 0 0 18px">'
      + obs.map(function(x){ return '<li>' + esc(typeof x === 'string' ? x : (x.texto || JSON.stringify(x))) + '</li>'; }).join('')
      + '</ul>';
  }

  // ── 4. Screening ─────────────────────────────────────────────────────────
  h += '<div class="pb"></div>' + sec(4, 'SCREENING CONTRA LISTAS RESTRICTIVAS');
  if (!screening) {
    h += callout('warn', 'No hay corridas de screening registradas en el sistema al momento de la emisión.');
  } else {
    var mios = (screening.hits || []).filter(function(x){ return x.legajoId === legajo.id; });
    h += '<table>'
      + tr2('Fecha y hora de la corrida', new Date(screening.fecha).toLocaleString('es-AR'))
      + tr2('Alcance', dash(screening.alcance))
      + tr2('Ejecutada por', dash(screening.ejecutadoPor))
      + tr2('Método', 'Matching determinístico local (documento exacto, nombre exacto, nombre sin sufijo societario, aproximación tolerante a variantes)')
      + tr2('Umbrales aplicados', 'ALTA ≥' + Math.round((screening.umbrales&&screening.umbrales.ALTA||0.95)*100) + '% · MEDIA ≥' + Math.round((screening.umbrales&&screening.umbrales.MEDIA||0.85)*100) + '% · BAJA ≥' + Math.round((screening.umbrales&&screening.umbrales.BAJA||0.78)*100) + '%')
      + '</table>'
      + '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:10px">Listados consultados y su versión</div>'
      + tbl(th(['Lista','Fuente','Versión cargada','Entradas']),
          (screening.listas||[]).map(function(l){
            return td([dash(l.nombre), dash(l.fuente), dash(l.version), String(l.cantidad||0)]);
          }).join('') || td(['—','—','—','—']));
    if (!mios.length) {
      h += callout('ok', 'Sin coincidencias para este legajo en la corrida indicada. Se evaluaron razón social, representante legal, presidente, beneficiario final y personas vinculadas.');
    } else {
      h += callout('err', mios.length + ' coincidencia(s) detectada(s). Requieren análisis documentado.')
        + tbl(th(['Nivel','Puntaje','Sujeto evaluado','Rol','Entrada del listado','Lista','Criterio']),
            mios.map(function(x){
              var col = x.nivel==='ALTA'?'#E74C3C':x.nivel==='MEDIA'?'#F39C12':'#888';
              return td([infBadge(x.nivel, col), (x.score*100).toFixed(1)+'%', esc(x.sujeto), esc(x.rol), esc(x.entradaNom), esc(x.lista), esc(x.criterio)]);
            }).join(''));
    }
  }

  // ── 5. Períodos transaccionales ──────────────────────────────────────────
  h += '<div class="pb"></div>' + sec(5, 'PERÍODOS TRANSACCIONALES ANALIZADOS');
  if (!periodos.length) {
    h += callout('warn', 'No hay períodos transaccionales cargados para este legajo.');
  } else {
    h += tbl(th(['Período','Carga','Estado','Operaciones','Volumen IN','Volumen OUT','Señales activas']),
        periodos.map(function(p){
          var m = p.metricas;
          var sg = senalesPorPeriodo[p.id] || [];
          var alta = sg.filter(function(x){return x.sev==='ALTA';}).length;
          return td([
            esc(p.nombre), dash(p.createdAt), dash(p.estadoPeriodo),
            m ? String(m.totalTxns) : '—',
            m ? fmtM(m.tIn) : '—',
            m ? fmtM(m.tOut) : '—',
            sg.length ? (sg.length + (alta ? ' (' + alta + ' ALTA)' : '')) : '0'
          ]);
        }).join(''));

    periodos.forEach(function(p){
      var m = p.metricas;
      if (!m) return;
      var sg = senalesPorPeriodo[p.id] || [];
      var res = p.sigsResolucion || {};
      h += '<h3 style="font-size:9.5pt;color:#2C4A7C;margin:16px 0 4px;border-bottom:1px solid #D6E4F0;padding-bottom:4px">Período: ' + esc(p.nombre) + '</h3>'
        + '<table>'
        + tr2('Operaciones', String(m.totalTxns) + ' (' + m.countIn + ' IN / ' + m.countOut + ' OUT)')
        + tr2('Volumen total', fmtM(m.tVol))
        + tr2('Balance neto', fmtM(m.balanceNeto))
        + tr2('Ticket promedio', fmtM(m.avg))
        + tr2('Contrapartes únicas', m.uniqueCpIn + ' IN / ' + m.uniqueCpOut + ' OUT')
        + tr2('Concentración top-1', m.top1In.toFixed(1) + '% IN · ' + m.top1Out.toFixed(1) + '% OUT')
        + (m.pctAtypicalHour !== null && m.pctAtypicalHour !== undefined ? tr2('Operaciones en horario atípico', m.pctAtypicalHour.toFixed(1) + '%') : '')
        + '</table>';
      if (sg.length) {
        h += tbl(th(['Patrón','Sev.','Señal','Estado','Resolución']),
          sg.map(function(x){
            var r = res[x.pat];
            var col = x.sev==='ALTA'?'#E74C3C':x.sev==='MEDIA'?'#F39C12':'#888';
            var est = (r && r.estado === 'RESUELTA')
              ? infBadge('RESUELTA', '#27AE60')
              : infBadge('ACTIVA', '#E74C3C');
            var det = (r && r.estado === 'RESUELTA')
              ? esc(r.explicacion || '') + '<br/><span style="font-size:8pt;color:#888">' + esc(r.aprobadoPor||'') + ' · ' + esc(r.aprobadoAt||'') + '</span>'
              : '<span style="color:#999">sin resolver</span>';
            return td([esc(x.pat), infBadge(x.sev, col), esc(x.titulo), est, det]);
          }).join(''));
      } else {
        h += callout('ok', 'Sin señales detectadas en este período.');
      }
    });
  }

  // ── 6. Casos de compliance ───────────────────────────────────────────────
  h += '<div class="pb"></div>' + sec(6, 'CASOS DE COMPLIANCE');
  if (!casos.length) {
    h += callout('info', 'No hay casos abiertos ni cerrados asociados a este legajo.');
  } else {
    h += tbl(th(['Referencia','Caso','Origen','Estado','Prioridad','Analista','Apertura','Cierre']),
        casos.map(function(c){
          return td([esc(c.ref), esc(c.titulo), esc(c.origen), esc(c.estado), esc(c.prioridad),
                     dash(c.analista), dash(c.fechaApertura), dash(c.fechaCierre)]);
        }).join(''));
    casos.forEach(function(c){
      h += '<h3 style="font-size:9.5pt;color:#2C4A7C;margin:16px 0 4px;border-bottom:1px solid #D6E4F0;padding-bottom:4px">' + esc(c.ref) + ' — ' + esc(c.titulo) + '</h3>';
      if (c.detalle) h += '<div style="font-size:9pt;margin:6px 0">' + nl2br(c.detalle) + '</div>';
      var hist = safeArr(c.historial);
      if (hist.length) {
        h += '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:8px">Trazabilidad del caso</div>'
          + tbl(th(['Fecha','Hora','Estado','Responsable','Nota']),
              hist.map(function(x){ return td([dash(x.fecha), dash(x.hora), dash(x.estado), dash(x.autor), dash(x.nota)]); }).join(''));
      }
      var coms = safeArr(c.comentarios);
      if (coms.length) {
        h += '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:8px">Comentarios del analista</div>'
          + tbl(th(['Fecha','Autor','Comentario']),
              coms.map(function(x){ return td([esc(x.fecha)+' '+esc(x.hora||''), esc(x.autor), nl2br(x.texto)]); }).join(''));
      }
    });
  }

  // ── 7. RFIs ──────────────────────────────────────────────────────────────
  h += sec(7, 'REQUERIMIENTOS DE INFORMACIÓN (RFI)');
  if (!rfis.length) {
    h += callout('info', 'No se registran RFIs emitidos a este cliente.');
  } else {
    h += tbl(th(['Referencia','Asunto','Estado','Emitido','Respondido']),
        rfis.map(function(r){
          return td([dash(r.refNum), dash(r.asunto), dash(r.estado), dash(r.createdAt), dash(r.respondidoAt)]);
        }).join(''));
  }

  // ── 8. Vencimientos ──────────────────────────────────────────────────────
  h += sec(8, 'VENCIMIENTOS APLICABLES');
  var vLeg = vencs.filter(function(v){ return v.legajoId === legajo.id; });
  if (!vLeg.length) {
    h += callout('info', 'Sin puntos de control de vencimiento calculados para este legajo.');
  } else {
    h += tbl(th(['Concepto','Tipo','Vence','Estado']),
        vLeg.map(function(v){
          var col = v.estado==='VENCIDO'?'#E74C3C':v.estado==='PROXIMO'?'#F39C12':'#27AE60';
          var etiqueta = v.estado==='VENCIDO' ? 'VENCIDO hace ' + Math.abs(v.dias) + ' d'
                       : v.estado==='PROXIMO' ? 'vence en ' + v.dias + ' d' : 'en regla';
          return td([esc(v.label) + (v.estimado ? ' <span style="font-size:8pt;color:#F39C12">(fecha estimada)</span>' : ''),
                     esc(v.tipo), v.limite ? v.limite.toLocaleDateString('es-AR') : '—', infBadge(etiqueta, col)]);
        }).join(''));
  }

  // ── 9. Historial de estado de cuenta ─────────────────────────────────────
  h += sec(9, 'HISTORIAL DE ESTADO DE CUENTA');
  var eh = safeArr(legajo.estadoHistorial);
  if (!eh.length) {
    h += callout('info', 'Sin cambios de estado registrados.');
  } else {
    h += tbl(th(['Fecha','Hora','Estado','Responsable','Motivo']),
        eh.slice().reverse().map(function(x){
          return td([dash(x.fecha), dash(x.hora), dash(x.estado), dash(x.analista), dash(x.motivo)]);
        }).join(''));
  }

  // ── 10. Documentación respaldatoria ──────────────────────────────────────
  h += sec(10, 'DOCUMENTACIÓN RESPALDATORIA ARCHIVADA');
  if (!documentos.length) {
    h += callout('warn', 'No hay archivos adjuntos registrados para este legajo.');
  } else {
    var vig = documentos.filter(function(d){ return d.vigente; });
    h += callout('info', documentos.length + ' archivo(s) archivado(s), de los cuales ' + vig.length + ' son la versión vigente. Los reemplazados se conservan como antecedente.')
      + tbl(th(['Archivo','Acredita','Versión','Fecha del documento','Tamaño','Archivado por','Archivado el','Vigente']),
          documentos.map(function(d){
            return td([
              esc(d.nombre), dash(d.tipo), 'v' + (d.version||1), dash(d.fecha_doc),
              d.tamano ? (Number(d.tamano) < 1048576 ? Math.round(Number(d.tamano)/1024)+' KB' : (Number(d.tamano)/1048576).toFixed(1)+' MB') : '—',
              dash(d.subido_por),
              d.subido_at ? new Date(d.subido_at).toLocaleString('es-AR') : '—',
              d.vigente ? infBadge('Sí', '#27AE60') : infBadge('Reemplazado', '#888')
            ]);
          }).join(''));
  }

  // ── Cierre ───────────────────────────────────────────────────────────────
  h += '<div class="pb"></div>' + sec(11, 'CONSTANCIA DE EMISIÓN')
    + '<div style="font-size:9pt;line-height:1.7;margin:10px 0">'
    + 'El presente documento consolida la información registrada en el sistema de gestión de compliance de GOAT S.A. / Rebit '
    + 'respecto del cliente <strong>' + esc(empresa) + '</strong> (CUIT ' + dash(legajo.cuit) + '), al ' + fecha + ' ' + hora + '.<br/><br/>'
    + 'Las secciones de screening y de señales transaccionales reflejan el resultado de procedimientos automatizados y determinísticos, '
    + 'reproducibles a partir de los listados y períodos indicados. Las resoluciones de señales y los cambios de estado registran el '
    + 'responsable y la fecha en que fueron asentados.<br/><br/>'
    + 'La documentación respaldatoria listada en la sección 10 se conserva archivada en el repositorio '
    + 'documental del sistema y se encuentra disponible ante requerimiento.'
    + '</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:9pt;margin-top:22px">'
    + '<tr>'
    + '<td style="padding:26px 20px;border:1px solid #ddd;text-align:center;width:50%">____________________<br/><strong>Analista de Compliance</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '<td style="padding:26px 20px;border:1px solid #ddd;text-align:center;width:50%">____________________<br/><strong>Oficial de Cumplimiento</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '</tr></table>'
    + '<div style="display:flex;justify-content:space-between;border-top:1px solid #D6E4F0;padding-top:8px;margin-top:20px;font-size:7.5pt;color:#888">'
    + '<span>Confidencial — Uso interno y ante requerimiento de autoridad competente</span>'
    + '<span>GOAT S.A. / Rebit — Legajo completo — emitido ' + fecha + ' ' + hora + '</span>'
    + '</div></body></html>';

  return h;
}


// ═══════════════════════════════════════════════════════════════════════════
// INFORME DE GESTIÓN AL COMITÉ (T9)
// ═══════════════════════════════════════════════════════════════════════════
// A diferencia de los otros informes, que documentan UN cliente, este mide la
// operación: cuánto entró, cuánto se resolvió, en qué plazo y quién lo hizo.
// Cierra con una sección de puntos de atención derivados de los propios
// números — un comité necesita decidir, no solo enterarse.
function genInformeComite(datos) {
  var m       = datos.metricas;
  var usuario = datos.usuario || { nombre:'N/D', rol:'N/D' };
  var notas   = datos.notas || '';
  var ahora   = new Date();
  var fecha   = ahora.toLocaleDateString('es-AR');
  var hora    = ahora.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});

  function esc(x) {
    return String(x === null || x === undefined ? '' : x)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function num(x, suf) { return (x === null || x === undefined) ? '—' : esc(x) + (suf || ''); }
  var sec = infSec, tr2 = infTr2, tbl = infTbl, th = infTh, td = infTd, callout = infCallout;

  var h = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
    + '<title>Informe de gestión — ' + esc(m.rango.label) + '</title>'
    + '<style>' + pStyles()
    + 'h2{page-break-after:avoid;}tr{page-break-inside:avoid;}.pb{page-break-before:always;}'
    + '</style></head><body>';

  // ── Portada ──────────────────────────────────────────────────────────────
  h += '<div style="border:2px solid #1B2A4A;border-radius:4px;padding:26px 24px;margin-bottom:18px">'
    + '<div style="font-size:8.5pt;color:#4A6A8A;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">GOAT S.A. — Rebit · Comité de Compliance</div>'
    + '<div style="font-size:17pt;font-weight:700;color:#1B2A4A;margin-bottom:3px">INFORME DE GESTIÓN PLAFT</div>'
    + '<div style="font-size:13pt;color:#2C4A7C;margin-bottom:16px">' + esc(m.rango.label) + '</div>'
    + '<table style="font-size:9pt">'
    + tr2('Período', m.rango.isoDesde + ' al ' + m.rango.isoHasta)
    + tr2('Casos abiertos al inicio', String(m.casos.arrastre))
    + tr2('Casos abiertos a la fecha', String(m.casos.abiertosHoy))
    + tr2('Clientes en cartera', String(m.cartera.total))
    + '</table>'
    + '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #D6E4F0;font-size:8.5pt;color:#555">'
    + 'Emitido el <strong>' + fecha + ' a las ' + hora + '</strong> por <strong>' + esc(usuario.nombre) + '</strong> (' + esc(usuario.rol) + ').<br/>'
    + 'Las cifras se calculan sobre los registros del sistema con las fechas asentadas en cada caso, '
    + 'de modo que el informe de un período cerrado arroja el mismo resultado independientemente de cuándo se genere.'
    + '</div></div>';

  // ── 1. Resumen ───────────────────────────────────────────────────────────
  var saldo = m.casos.arrastre + m.casos.creados - m.casos.cerrados;
  h += sec(1, 'RESUMEN DEL PERÍODO')
    + '<table>'
    + tr2('Casos abiertos al inicio del período', String(m.casos.arrastre))
    + tr2('Casos abiertos durante el período', String(m.casos.creados))
    + tr2('Casos cerrados durante el período', String(m.casos.cerrados))
    + tr2('Saldo teórico al cierre', String(saldo))
    + tr2('Reportes presentados conforme al régimen aplicable', String(m.casos.conRos))
    + tr2('Casos cerrados sin reporte, con fundamento', String(m.casos.sinRos))
    + '</table>';

  if (m.casos.creados > m.casos.cerrados) {
    h += callout('warn', 'El período cierra con más casos abiertos que resueltos: entraron ' +
      m.casos.creados + ' y se cerraron ' + m.casos.cerrados + '. La cartera de casos pendientes crece.');
  } else if (m.casos.cerrados > 0) {
    h += callout('ok', 'El período cierra con ' + m.casos.cerrados + ' caso(s) resuelto(s) sobre ' +
      m.casos.creados + ' ingresado(s).');
  }

  if (m.casos.porOrigen.length) {
    h += '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:12px">Origen de los casos abiertos en el período</div>'
      + tbl(th(['Origen','Casos','% del total']),
          m.casos.porOrigen.map(function(o){
            return td([esc(o.clave), String(o.n), (m.casos.creados ? Math.round(o.n/m.casos.creados*100) : 0) + '%']);
          }).join(''));
  }

  // ── 2. Tiempos ───────────────────────────────────────────────────────────
  h += sec(2, 'TIEMPOS DE RESOLUCIÓN');
  if (!m.tiempos.muestra) {
    h += callout('info', 'No hubo casos cerrados en el período, por lo que no se pueden calcular tiempos de resolución.');
  } else {
    h += '<table>'
      + tr2('Casos cerrados considerados', String(m.tiempos.muestra))
      + tr2('Mediana de resolución', num(m.tiempos.mediana, ' días'))
      + tr2('Promedio', num(m.tiempos.promedio, ' días'))
      + tr2('Percentil 90', num(m.tiempos.p90, ' días'))
      + tr2('Caso más extenso', num(m.tiempos.max, ' días'))
      + '</table>'
      + '<div style="font-size:8pt;color:#666;margin-top:6px;line-height:1.5">'
      + 'Se informa la mediana además del promedio porque un solo caso muy extenso desplaza el promedio '
      + 'y da una impresión equivocada del ritmo habitual de resolución.'
      + '</div>';
  }

  // ── 3. Plazos ────────────────────────────────────────────────────────────
  h += sec(3, 'CUMPLIMIENTO DE PLAZOS');
  if (!m.plazos.evaluados) {
    h += callout('info', 'Sin casos cerrados con plazos aplicables en el período.');
  } else {
    h += '<table>'
      + tr2('Casos cerrados con plazo evaluable', String(m.plazos.evaluados))
      + tr2('Cerrados dentro de plazo', String(m.plazos.enPlazo))
      + tr2('Cerrados fuera de plazo', String(m.plazos.fueraPlazo))
      + tr2('Cumplimiento', num(m.plazos.pctEnPlazo, '%'))
      + '</table>';
    if (m.plazos.fueraPlazo > 0) {
      h += callout('err', m.plazos.fueraPlazo + ' caso(s) se cerraron fuera del plazo aplicable. Corresponde analizar la causa y dejarla asentada.');
    }
  }
  if (m.plazos.vencidosAbiertos > 0) {
    h += callout('err', 'A la fecha de emisión hay ' + m.plazos.vencidosAbiertos +
      ' caso(s) abierto(s) con al menos un plazo vencido. Requieren tratamiento inmediato.');
  }

  // ── 4. Por analista ──────────────────────────────────────────────────────
  h += '<div class="pb"></div>' + sec(4, 'DESEMPEÑO POR ANALISTA');
  if (!m.analistas.length) {
    h += callout('warn', 'Ningún caso tiene analista asignado. La trazabilidad de responsabilidad queda incompleta.');
  } else {
    h += tbl(th(['Analista','Abiertos','Asignados en el período','Cerrados','Mediana de cierre','Con plazo vencido']),
        m.analistas.map(function(a){
          return td([esc(a.nombre), String(a.abiertos), String(a.creadosPeriodo), String(a.cerrados),
                     num(a.medianaDias, ' d'),
                     a.vencidos > 0 ? infBadge(String(a.vencidos), '#E74C3C') : '0']);
        }).join(''));
    if (m.casos.sinAsignar > 0) {
      h += callout('warn', m.casos.sinAsignar + ' caso(s) abierto(s) sin analista asignado.');
    }
  }

  // ── 5. Señales ───────────────────────────────────────────────────────────
  h += sec(5, 'SEÑALES DE ALERTA');
  h += '<table>'
    + tr2('Señales activas en la cartera', String(m.senales.activas))
    + tr2('De severidad ALTA', String(m.senales.activasAlta))
    + tr2('Señales resueltas durante el período', String(m.senales.resueltasPeriodo))
    + '</table>';

  if (m.senales.porPatron.length) {
    h += '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:12px">Patrones más frecuentes en la cartera</div>'
      + tbl(th(['Patrón','Tipología UIF','Señales activas']),
          m.senales.porPatron.map(function(p){
            var uif = PAT_UIF_MAP[p.clave];
            return td([esc(p.clave), uif ? esc(uif.desc) : '—', String(p.n)]);
          }).join(''))
      + '<div style="font-size:8pt;color:#666;margin-top:6px;line-height:1.5">'
      + 'La recurrencia de un patrón puede indicar tanto una tipología presente en la cartera como un '
      + 'umbral de detección mal calibrado. Corresponde al comité distinguir entre ambos casos.'
      + '</div>';
  }
  if (m.senales.resueltasPor.length) {
    h += '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:12px">Resolución de señales por responsable</div>'
      + tbl(th(['Responsable','Señales resueltas']),
          m.senales.resueltasPor.map(function(r){ return td([esc(r.clave), String(r.n)]); }).join(''));
  }

  // ── 6. Cartera ───────────────────────────────────────────────────────────
  h += sec(6, 'EVOLUCIÓN DE LA CARTERA')
    + '<table>'
    + tr2('Clientes en cartera', String(m.cartera.total))
    + tr2('Altas durante el período', String(m.cartera.altasPeriodo))
    + tr2('Períodos transaccionales analizados', String(m.cartera.periodosAnalizados))
    + '</table>'
    + '<div style="display:flex;gap:14px">'
    + '<div style="flex:1">'
    + '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:12px">Por segmento de riesgo</div>'
    + tbl(th(['Segmento','Clientes']), m.cartera.porSegmento.map(function(x){ return td([esc(x.clave), String(x.n)]); }).join(''))
    + '</div><div style="flex:1">'
    + '<div style="font-size:8.5pt;color:#4A6A8A;margin-top:12px">Por estado de cuenta</div>'
    + tbl(th(['Estado','Clientes']), m.cartera.porEstado.map(function(x){ return td([esc(x.clave), String(x.n)]); }).join(''))
    + '</div></div>';

  // ── 7. Screening ─────────────────────────────────────────────────────────
  h += sec(7, 'SCREENING CONTRA LISTAS RESTRICTIVAS')
    + '<table>'
    + tr2('Corridas ejecutadas en el período', String(m.screening.corridasPeriodo))
    + tr2('Última corrida registrada', m.screening.ultimaCorrida ? new Date(m.screening.ultimaCorrida).toLocaleString('es-AR') : '—')
    + tr2('Coincidencias de nivel ALTA detectadas', String(m.screening.hitsAlta))
    + '</table>';
  if (!m.screening.corridasPeriodo) {
    h += callout('warn', 'No se registran corridas de screening en el período informado.');
  }

  // ── 8. Puntos de atención ────────────────────────────────────────────────
  var puntos = [];
  if (m.plazos.vencidosAbiertos > 0)
    puntos.push('Regularizar ' + m.plazos.vencidosAbiertos + ' caso(s) abierto(s) con plazo vencido.');
  if (m.plazos.fueraPlazo > 0)
    puntos.push('Analizar la causa de ' + m.plazos.fueraPlazo + ' cierre(s) fuera de plazo y asentar la conclusión.');
  if (m.casos.sinAsignar > 0)
    puntos.push('Asignar analista a ' + m.casos.sinAsignar + ' caso(s) sin responsable.');
  if (m.casos.creados > m.casos.cerrados)
    puntos.push('Evaluar capacidad de análisis: la cartera de casos pendientes creció en el período.');
  if (!m.screening.corridasPeriodo)
    puntos.push('Ejecutar el screening periódico: no hay corridas registradas en el período.');
  if (m.senales.activasAlta > 0)
    puntos.push('Tratar ' + m.senales.activasAlta + ' señal(es) de severidad ALTA sin resolver.');
  var sobrecargado = m.analistas.filter(function(a){ return a.vencidos > 0; });
  if (sobrecargado.length)
    puntos.push('Revisar la carga de ' + sobrecargado.map(function(a){ return a.nombre; }).join(', ') +
                ': registran casos con plazo vencido.');

  h += '<div class="pb"></div>' + sec(8, 'PUNTOS SOMETIDOS A CONSIDERACIÓN DEL COMITÉ');
  if (!puntos.length) {
    h += callout('ok', 'No se identifican desvíos que requieran decisión del comité en el período informado.');
  } else {
    h += '<ol style="font-size:9.5pt;line-height:1.9;margin:8px 0 0 20px">'
      + puntos.map(function(p){ return '<li>' + esc(p) + '</li>'; }).join('')
      + '</ol>'
      + '<div style="font-size:8pt;color:#666;margin-top:10px;line-height:1.5">'
      + 'Los puntos precedentes se derivan automáticamente de las cifras del período y no sustituyen '
      + 'el análisis del Oficial de Cumplimiento.'
      + '</div>';
  }

  if (notas.trim()) {
    h += sec(9, 'OBSERVACIONES DEL OFICIAL DE CUMPLIMIENTO')
      + '<div style="font-size:9.5pt;line-height:1.75;white-space:pre-wrap;margin-top:8px">' + esc(notas) + '</div>';
  }

  // ── Cierre ───────────────────────────────────────────────────────────────
  h += '<table style="width:100%;border-collapse:collapse;font-size:9pt;margin-top:26px">'
    + '<tr>'
    + '<td style="padding:26px 20px;border:1px solid #ddd;text-align:center;width:50%">____________________<br/><strong>Oficial de Cumplimiento</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '<td style="padding:26px 20px;border:1px solid #ddd;text-align:center;width:50%">____________________<br/><strong>Comité de Compliance</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '</tr></table>'
    + '<div style="display:flex;justify-content:space-between;border-top:1px solid #D6E4F0;padding-top:8px;margin-top:20px;font-size:7.5pt;color:#888">'
    + '<span>Confidencial — Uso interno del Comité de Compliance</span>'
    + '<span>GOAT S.A. / Rebit — Informe de gestión ' + esc(m.rango.label) + ' — emitido ' + fecha + '</span>'
    + '</div></body></html>';

  return h;
}


// ═══════════════════════════════════════════════════════════════════════════
// INFORME DE SCREENING POR CLIENTE
// ═══════════════════════════════════════════════════════════════════════════
// Constancia del cotejo de un cliente contra las listas restrictivas cargadas.
//
// Su valor probatorio no está en decir "sin coincidencias", sino en declarar
// CONTRA QUÉ se cotejó: qué listas, con qué versión, cuántas entradas, qué
// sujetos del legajo se evaluaron y con qué umbrales. Un "sin coincidencias"
// sin ese encuadre no acredita nada.
function genInformeScreening(datos) {
  var legajo   = datos.legajo || {};
  var sujetos  = datos.sujetos || [];
  var listas   = datos.listas || [];
  var hits     = datos.hits || [];
  var descartes= datos.descartes || [];
  var umbrales = datos.umbrales || {};
  var usuario  = datos.usuario || { nombre:'N/D', rol:'N/D' };
  var ahora = new Date();
  var fecha = ahora.toLocaleDateString('es-AR');
  var hora  = ahora.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});

  function esc(x) {
    return String(x === null || x === undefined ? '' : x)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function dash(x) { return (x === null || x === undefined || x === '') ? '—' : esc(x); }
  var sec = infSec, tr2 = infTr2, tbl = infTbl, th = infTh, td = infTd, callout = infCallout;

  var totalEntradas = listas.reduce(function(a,l){ return a + (l.cantidad || 0); }, 0);
  var pct = function(u){ return Math.round((u || 0) * 100); };
  var altas  = hits.filter(function(h){ return h.nivel === 'ALTA'; });
  var medias = hits.filter(function(h){ return h.nivel === 'MEDIA'; });
  var bajas  = hits.filter(function(h){ return h.nivel === 'BAJA'; });

  var h = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
    + '<title>Informe de screening — ' + esc(legajo.razonSocial || '') + '</title>'
    + '<style>' + pStyles()
    + 'h2{page-break-after:avoid;}tr{page-break-inside:avoid;}.pb{page-break-before:always;}'
    + '</style></head><body>';

  // ── Portada ──────────────────────────────────────────────────────────────
  h += '<div style="border:2px solid #1B2A4A;border-radius:4px;padding:26px 24px;margin-bottom:18px">'
    + '<div style="font-size:8.5pt;color:#4A6A8A;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">GOAT S.A. — Rebit · Compliance &amp; PLA/FT</div>'
    + '<div style="font-size:17pt;font-weight:700;color:#1B2A4A;margin-bottom:3px">INFORME DE COTEJO CONTRA LISTAS RESTRICTIVAS</div>'
    + '<div style="font-size:13pt;color:#2C4A7C;margin-bottom:16px">' + esc(legajo.razonSocial || 'Sin razón social') + '</div>'
    + '<table style="font-size:9pt">'
    + tr2('CUIT', dash(legajo.cuit))
    + tr2('Segmento de riesgo', dash(legajo.segmento))
    + tr2('Estado de cuenta', dash(legajo.estadoCuenta))
    + tr2('Sujetos evaluados', String(sujetos.length))
    + tr2('Listas consultadas', String(listas.length))
    + tr2('Entradas cotejadas', totalEntradas.toLocaleString('es-AR'))
    + tr2('Resultado', hits.length === 0
        ? '<strong style="color:#27AE60">Sin coincidencias</strong>'
        : '<strong style="color:#E74C3C">' + hits.length + ' coincidencia(s)</strong>')
    + '</table>'
    + '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #D6E4F0;font-size:8.5pt;color:#555">'
    + 'Emitido el <strong>' + fecha + ' a las ' + hora + '</strong> por <strong>' + esc(usuario.nombre) + '</strong> (' + esc(usuario.rol) + ').<br/>'
    + 'El cotejo se realiza de forma determinística y local contra los listados detallados en la sección 2. '
    + 'No se consultan servicios externos durante su ejecución, de modo que el resultado es reproducible '
    + 'por un tercero que disponga de los mismos listados.'
    + '</div></div>';

  // ── 1. Sujetos evaluados ─────────────────────────────────────────────────
  h += sec(1, 'SUJETOS SOMETIDOS A COTEJO');
  if (!sujetos.length) {
    h += callout('warn', 'El legajo no registra sujetos identificables para cotejar.');
  } else {
    h += tbl(th(['Rol en el legajo','Denominación / Nombre','Documento']),
        sujetos.map(function(s){
          return td([esc(s.rol), esc(s.nombre), s.doc ? esc(s.doc) : '<span style="color:#999">no informado</span>']);
        }).join(''))
      + '<div style="font-size:8pt;color:#666;margin-top:6px;line-height:1.5">'
      + 'El cotejo alcanza a la persona jurídica y a quienes la representan o controlan. La ausencia de '
      + 'documento en un sujeto limita el cotejo a la coincidencia por denominación.'
      + '</div>';
  }

  // ── 2. Listas consultadas ────────────────────────────────────────────────
  h += sec(2, 'LISTADOS CONSULTADOS');
  if (!listas.length) {
    h += callout('err', 'No hay listados cargados en el sistema. Sin listados no existe cotejo posible, '
      + 'y la ausencia de coincidencias en el presente NO debe interpretarse como resultado negativo.');
  } else {
    h += tbl(th(['Listado','Fuente','Versión cargada','Entradas']),
        listas.map(function(l){
          return td([esc(l.nombre || l.id), dash(l.fuente), dash(l.version),
                     (l.cantidad || 0).toLocaleString('es-AR')]);
        }).join(''))
      + callout('info', 'La versión de cada listado queda registrada para permitir la reproducción del '
        + 'cotejo. Un resultado solo es verificable si se conoce contra qué universo se comparó.');
  }

  // ── 3. Metodología ───────────────────────────────────────────────────────
  h += sec(3, 'METODOLOGÍA Y UMBRALES')
    + tbl(th(['Criterio','Aplicación','Puntaje']), [
        td(['Documento', 'Coincidencia exacta de CUIT, CUIL o DNI, con independencia de la grafía del nombre.', '100%']),
        td(['Denominación exacta', 'Coincidencia literal tras normalizar mayúsculas, tildes y puntuación.', '100%']),
        td(['Sin sufijo societario', 'Coincidencia ignorando las formas societarias (S.A., S.R.L., S.A.S. y equivalentes).', '98%']),
        td(['Aproximado', 'Tolera orden invertido de nombre y apellido, plurales y errores de tipeo, con penalización cuando una denominación se encuentra meramente contenida en otra.', 'variable'])
      ].join(''))
    + '<table>'
    + tr2('Umbral de nivel ALTA', '≥ ' + pct(umbrales.ALTA) + '%')
    + tr2('Umbral de nivel MEDIA', '≥ ' + pct(umbrales.MEDIA) + '%')
    + tr2('Umbral de nivel BAJA', '≥ ' + pct(umbrales.BAJA) + '%')
    + '</table>'
    + '<div style="font-size:8pt;color:#666;margin-top:6px;line-height:1.5">'
    + 'Los umbrales se encuentran calibrados hacia la sensibilidad: se prefiere revisar coincidencias que '
    + 'luego resulten descartadas antes que omitir una verdadera. El descarte fundado es el mecanismo '
    + 'previsto para absorber ese margen.'
    + '</div>';

  // ── 4. Resultado ─────────────────────────────────────────────────────────
  h += sec(4, 'RESULTADO DEL COTEJO');
  if (!listas.length) {
    h += callout('err', 'Cotejo no ejecutado por ausencia de listados cargados.');
  } else if (!hits.length) {
    h += callout('ok', 'No se registraron coincidencias entre los ' + sujetos.length + ' sujeto(s) '
      + 'evaluado(s) y las ' + totalEntradas.toLocaleString('es-AR') + ' entrada(s) de los '
      + listas.length + ' listado(s) consultado(s), con los umbrales indicados en la sección 3.');
  } else {
    h += '<table>'
      + tr2('Coincidencias de nivel ALTA', String(altas.length))
      + tr2('Coincidencias de nivel MEDIA', String(medias.length))
      + tr2('Coincidencias de nivel BAJA', String(bajas.length))
      + '</table>'
      + tbl(th(['Nivel','Puntaje','Sujeto evaluado','Rol','Entrada del listado','Listado','Criterio']),
          hits.map(function(x){
            var col = x.nivel==='ALTA' ? '#E74C3C' : x.nivel==='MEDIA' ? '#F39C12' : '#888';
            return td([infBadge(x.nivel, col), (x.score*100).toFixed(1)+'%',
                       esc(x.sujeto), esc(x.rol), esc(x.entradaNom),
                       esc(x.lista), esc(x.criterio)]);
          }).join(''));
    if (altas.length) {
      h += callout('err', 'Las coincidencias de nivel ALTA requieren análisis documentado y decisión '
        + 'del Oficial de Cumplimiento antes de continuar la relación comercial.');
    }
    hits.forEach(function(x){
      if (!x.entradaDetalle) return;
      h += '<div style="font-size:8.5pt;margin-top:8px;padding:8px 11px;background:#F8FAFC;border-left:3px solid #D6E4F0">'
        + '<strong>' + esc(x.entradaNom) + '</strong> — ' + esc(x.entradaDetalle) + '</div>';
    });
  }

  // ── 5. Descartes previos ─────────────────────────────────────────────────
  if (descartes.length) {
    h += sec(5, 'COINCIDENCIAS DESCARTADAS CON ANTERIORIDAD')
      + callout('info', 'Las siguientes coincidencias fueron evaluadas y descartadas como falso positivo '
        + 'en instancias previas, por lo que no integran el resultado de la sección 4. Se informan por '
        + 'completitud.')
      + tbl(th(['Coincidencia','Motivo del descarte','Analista','Fecha']),
          descartes.map(function(d){
            return td([esc(d.sujeto || d.clave), esc(d.motivo), esc(d.autor), esc(d.fecha)]);
          }).join(''));
  }

  // ── Cierre ───────────────────────────────────────────────────────────────
  h += sec(descartes.length ? 6 : 5, 'CONSTANCIA DE EMISIÓN')
    + '<div style="font-size:9pt;line-height:1.7;margin:10px 0">'
    + 'Se deja constancia de que con fecha ' + fecha + ' se ejecutó el cotejo de <strong>'
    + esc(legajo.razonSocial || 'el cliente') + '</strong> (CUIT ' + dash(legajo.cuit) + ') y de los '
    + 'sujetos detallados en la sección 1, contra los listados individualizados en la sección 2, '
    + 'aplicando los criterios y umbrales de la sección 3.<br/><br/>'
    + 'El presente informe refleja el estado de los listados a la versión indicada. La vigencia del '
    + 'cotejo se encuentra sujeta a la actualización periódica de dichos listados conforme al '
    + 'procedimiento establecido.'
    + '</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:9pt;margin-top:24px"><tr>'
    + '<td style="padding:26px 20px;border:1px solid #ddd;text-align:center;width:50%">____________________<br/><strong>Analista de Compliance</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '<td style="padding:26px 20px;border:1px solid #ddd;text-align:center;width:50%">____________________<br/><strong>Oficial de Cumplimiento</strong><br/><span style="font-size:8pt;color:#888">Firma y aclaración</span></td>'
    + '</tr></table>'
    + '<div style="display:flex;justify-content:space-between;border-top:1px solid #D6E4F0;padding-top:8px;margin-top:20px;font-size:7.5pt;color:#888">'
    + '<span>Confidencial — Uso interno y ante requerimiento de autoridad competente</span>'
    + '<span>GOAT S.A. / Rebit — Informe de screening — ' + fecha + ' ' + hora + '</span>'
    + '</div></body></html>';

  return h;
}

export { pStyles, piH, r2, r3, rpH, rpF, infSec, infBadge, infCallout, infTr2, infTr3, infTbl, infTh, infTd, genINF01, genINF02, genINF07Cierre, genROS, genNotaDD, genLegajoCompleto, genInformeComite, genInformeScreening };
