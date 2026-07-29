import { useState, useEffect } from "react";
import { BarChart, Bar, LineChart, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Pill, StatCard, chartGrid, chartAxis, chartTooltip } from "../components/ui";
import { calcScoring, detectPatrones, metricasDe } from "../lib/aml";
import { getEstadoCaso, slaCritico, colorSLA } from "../lib/casos";
import { ESTADOS_CUENTA, getEstado } from "../lib/constants";
import { serverLoadKVPrefix } from "../lib/sync";
import { C, T } from "../lib/theme";
import { fmtM, parseFechaAR } from "../lib/utils";

function DashboardView(props) {
  var legajos = props.legajos, periodos = props.periodos, setLegajos = props.setLegajos || function(){};
  var casos = props.casos || [];
  var onVerCaso = props.onVerCaso;

  // Casos con plazo vencido o próximo — el panel que un inspector mira primero
  var casosAbiertos = casos.filter(function(c){ return getEstadoCaso(c.estado).abierto; });
  var casosUrgentes = casosAbiertos.map(function(c){
    return { c: c, sla: slaCritico(c) };
  }).filter(function(x){
    return x.sla && (x.sla.estado==='VENCIDO' || x.sla.estado==='PROXIMO');
  }).sort(function(a,b){ return a.sla.dias - b.sla.dias; });
  var dashTabState = useState('operacional'); var dashTab=dashTabState[0]; var setDashTab=dashTabState[1];

  // RFIs de TODOS los legajos — cargados desde Supabase KV (claves 'rfi_<legajoId>')
  // en una sola query. Antes había un loop muerto heredado de localStorage que
  // dejaba todosRfis siempre vacío (los vencimientos nunca alertaban).
  var rfisKVState = useState([]); var rfisKV=rfisKVState[0]; var setRfisKV=rfisKVState[1];
  useEffect(function() {
    if (!legajos.length) { setRfisKV([]); return; }
    var cancelado = false;
    serverLoadKVPrefix('rfi_').then(function(items) {
      if (cancelado) return;
      var acc = [];
      (items || []).forEach(function(it) {
        var legId = (it.k || '').slice(4); // quita el prefijo 'rfi_'
        var leg = legajos.find(function(l){ return l.id === legId; });
        var arr = Array.isArray(it.v) ? it.v : [];
        arr.forEach(function(rfi) {
          acc.push(Object.assign({}, rfi, { legajoNombre: (leg && leg.razonSocial) || 'N/D', legajoId: legId }));
        });
      });
      setRfisKV(acc);
    });
    return function() { cancelado = true; };
  }, [legajos.length]);

  // ── DATOS COMUNES ────────────────────────────────────────────────────────────
  var hoy = new Date();
  var total = legajos.length;
  var aprobados = legajos.filter(function(l){return l.dictamen==='APROBADO';}).length;
  var cond = legajos.filter(function(l){return l.dictamen==='CONDICIONAL';}).length;
  var rech = legajos.filter(function(l){return l.dictamen==='RECHAZADO';}).length;
  // Helper: obtener métricas de un período — usa pre-computadas si existen, sino calcula desde txns
  function getMetricasPeriodo(p, leg) { return metricasDe(p, leg); }
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
  // RFIs de todos los legajos (desde Supabase KV — ver efecto rfisKV arriba)
  var todosRfis = rfisKV;
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
        <h2 style={{fontSize:17,fontWeight:700,color:T.TEXT,letterSpacing:'-0.3px',margin:0,fontFamily:T.SANS}}>Dashboard <span style={{color:T.TEXT3,fontWeight:400,fontSize:13}}>· GOAT S.A. / Rebit</span></h2>
        <div style={{display:'flex',gap:2,background:T.BG3,borderRadius:4,padding:4,border:'1px solid '+T.BORDER}}>
          {[['operacional','📊 Operacional'],['ejecutivo','📈 Ejecutivo']].map(function(t){return(
            <button key={t[0]} onClick={function(){setDashTab(t[0]);}}
              style={{padding:'7px 18px',border:'none',borderRadius:T.RADIUS.sm+2,cursor:'pointer',fontWeight:dashTab===t[0]?600:500,background:dashTab===t[0]?T.ACCENT_SOFT:'transparent',color:dashTab===t[0]?T.ACCENT:T.TEXT2,fontFamily:T.SANS,fontSize:12.5,transition:T.TRANS}}>
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
              <thead><tr>{['Empresa','CUIT','Estado','Segmento','Situación','Acción'].map(function(h,i){return <th key={i} style={{background:T.BG3,color:T.TEXT3,padding:'5px 10px',textAlign:'left',fontWeight:400,fontSize:9,letterSpacing:'1px',fontFamily:T.MONO}}>{h}</th>;})}</tr></thead>
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
        {casosUrgentes.length > 0 && (
          <div style={{background:T.BG2,border:'1px solid rgba(255,68,85,0.3)',borderLeft:'3px solid '+T.RED,borderRadius:T.RADIUS.md,padding:'13px 16px',marginBottom:14,boxShadow:T.SHADOW.card}}>
            <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}>
              <span style={{fontSize:11,fontWeight:700,color:T.RED,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS}}>Casos con plazo crítico</span>
              <span style={{fontFamily:T.MONO,fontSize:11,fontWeight:700,color:T.TEXT3}}>{casosUrgentes.length}</span>
            </div>
            {casosUrgentes.slice(0,5).map(function(x){
              var col = colorSLA(x.sla.estado);
              return (
                <div key={x.c.id} onClick={function(){ if(onVerCaso) onVerCaso(x.c.id); }}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderTop:'1px solid '+T.BORDER,cursor:onVerCaso?'pointer':'default'}}>
                  <span style={{fontFamily:T.MONO,fontSize:10,fontWeight:700,color:T.ACCENT,flexShrink:0}}>{x.c.ref}</span>
                  <span style={{flex:1,minWidth:0,fontSize:12,color:T.TEXT,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.c.titulo||'Sin título'}</span>
                  <span style={{fontSize:11,color:T.TEXT3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:150}}>{x.c.legajoNom||'—'}</span>
                  <span style={{color:col,fontSize:11,fontWeight:700,fontFamily:T.MONO,whiteSpace:'nowrap',flexShrink:0}}>
                    {x.sla.dias < 0 ? '⚠ '+Math.abs(x.sla.dias)+' d vencido' : x.sla.dias===0 ? 'vence hoy' : x.sla.dias+' d'}
                  </span>
                </div>
              );
            })}
            {casosUrgentes.length > 5 && (
              <div style={{fontSize:10,color:T.TEXT3,marginTop:8,fontFamily:T.SANS}}>y {casosUrgentes.length-5} más — verlos en la sección Casos.</div>
            )}
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:14}}>
          {[{label:'Legajos KYB',val:total,col:T.ACCENT},{label:'Períodos AML',val:periodos.length,col:T.VIOLET},{label:'Señales ALTA',val:altas,col:T.RED},{label:'Total señales',val:allSigs.length,col:T.AMBER}].map(function(kpi,i){return(
            <StatCard key={i} label={kpi.label} val={kpi.val} col={kpi.col}/>
          );})}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:18}}>
          {[{label:'En Onboarding',val:onboarding,col:'#8BA3C0',bg:T.BG3},{label:'Activas',val:activas,col:T.GREEN,bg:'rgba(0,230,118,0.1)'},{label:'Monitoreo Ref.',val:activasRef,col:T.AMBER,bg:'rgba(255,140,0,0.1)'},{label:'Suspendidas',val:suspendidas,col:T.AMBER,bg:'rgba(255,184,48,0.1)'},{label:'Cerradas',val:cerradas,col:T.RED,bg:'rgba(255,68,85,0.1)'}].map(function(kpi,i){return(
            <div key={i} style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'10px 14px',textAlign:'center',boxShadow:T.SHADOW.card}}>
              <div style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:10,color:T.TEXT3,fontWeight:600,fontFamily:T.SANS,letterSpacing:'0.5px',textTransform:'uppercase'}}>
                <span style={{width:7,height:7,borderRadius:99,background:kpi.col}}/>{kpi.label}
              </div>
              <div style={{fontSize:23,fontWeight:700,color:T.TEXT,fontFamily:T.SANS,marginTop:3}}>{kpi.val}</div>
            </div>
          );})}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
          <Card title="Legajos por segmento">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={segData} margin={{top:5,right:10,left:-20,bottom:5}}>
                <CartesianGrid {...chartGrid}/><XAxis dataKey="seg" {...chartAxis}/><YAxis allowDecimals={false} {...chartAxis}/><Tooltip {...chartTooltip}/>
                <Bar dataKey="count" name="Legajos">{segData.map(function(e,i){return <Cell key={i} fill={e.fill}/>;})}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Dictamenes KYB">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={[{d:'APROBADO',count:aprobados,fill:C.VERDE},{d:'CONDICIONAL',count:cond,fill:C.NARANJA},{d:'RECHAZADO',count:rech,fill:C.ROJO}]} margin={{top:5,right:10,left:-20,bottom:5}}>
                <CartesianGrid {...chartGrid}/><XAxis dataKey="d" {...chartAxis}/><YAxis allowDecimals={false} {...chartAxis}/><Tooltip {...chartTooltip}/>
                <Bar dataKey="count">{[{fill:C.VERDE},{fill:C.NARANJA},{fill:C.ROJO}].map(function(e,i){return <Cell key={i} fill={e.fill}/>;})}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Estado de cuentas">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={estadoData} margin={{top:5,right:10,left:-20,bottom:5}}>
                <CartesianGrid {...chartGrid}/><XAxis dataKey="est" {...chartAxis}/><YAxis allowDecimals={false} {...chartAxis}/><Tooltip {...chartTooltip}/>
                <Bar dataKey="count" name="Legajos">{estadoData.map(function(e,i){return <Cell key={i} fill={e.fill}/>;})}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
        {activasConAlertas.length > 0 && <Card title="⚠ Cuentas activas con señales ALTA pendientes">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr>{['Razón Social','CUIT','Estado','Períodos','Señales ALTA'].map(function(h,i){return <th key={i} style={{background:T.BG3,color:T.TEXT3,padding:'6px 10px',textAlign:'left',fontSize:9,letterSpacing:'1px',fontWeight:400,fontFamily:T.MONO}}>{h}</th>;})}</tr></thead>
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
            {label:'Clientes activos',val:activas+activasRef,icon:'🏢',col:T.CYAN,bg:'rgba(0,212,255,0.1)'},
            {label:'Señales ALTA totales',val:altas,icon:'🚨',col:T.RED,bg:'rgba(255,68,85,0.1)'},
            {label:'RFIs abiertos',val:rfisAbiertos.length,icon:'📧',col:rfisAbiertos.length>0?T.AMBER:T.GREEN,bg:rfisAbiertos.length>0?'rgba(255,184,48,0.1)':'rgba(0,230,118,0.1)'},
            {label:'RFIs vencidos',val:rfisVencidos.length,icon:'⏰',col:rfisVencidos.length>0?T.RED:T.TEXT3,bg:rfisVencidos.length>0?'rgba(255,68,85,0.1)':T.BG3},
          ].map(function(k,i){return(
            <StatCard key={i} label={k.label} val={k.val} col={k.col} icon={k.icon}/>
          );})}
        </div>

        {/* Segunda fila KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:18}}>
          {[
            {label:'Tasa de respuesta RFI',val:tasaRespuesta+'%',icon:'📊',col:tasaRespuesta>=70?C.VERDE:tasaRespuesta>=40?C.AMARILLO:C.ROJO},
            {label:'Tiempo prom. respuesta',val:tiempoPromResp?(tiempoPromResp+' días'):'—',icon:'⏱',col:C.AC},
            {label:'RFIs vencen en 7 días',val:rfisVencen7.length,icon:'⚠',col:rfisVencen7.length>0?T.AMBER:T.TEXT3},
            {label:'Períodos analizados',val:periodos.filter(function(p){return p.txns&&p.txns.length>0;}).length,icon:'📈',col:T.ACCENT},
          ].map(function(k,i){return(
            <StatCard key={i} label={k.label} val={k.val} col={k.col} icon={k.icon}/>
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
                    {['','Cliente','Seg','Score','ALTA','Períodos'].map(function(h,i){return <th key={i} style={{padding:'5px 8px',textAlign:'left',color:T.TEXT2,fontWeight:600,fontSize:11,borderBottom:'1px solid '+T.BORDER2}}>{h}</th>;})}
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
                    <CartesianGrid {...chartGrid}/>
                    <XAxis dataKey="nombre" {...chartAxis} angle={-25} textAnchor="end" interval={0}/>
                    <YAxis {...chartAxis} tickFormatter={function(v){return v>=1e9?(v/1e9).toFixed(1)+'B':v>=1e6?(v/1e6).toFixed(0)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v;}} tick={{fontSize:9,fill:'#4A6A8A',fontFamily:"'JetBrains Mono',monospace"}} width={45}/>
                    <Tooltip {...chartTooltip} formatter={function(v,name){return [fmtM(v), name==='tIn'?'Vol IN':'Vol OUT'];}} labelStyle={{fontWeight:600,color:T.TEXT}}/>
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

export default DashboardView;
