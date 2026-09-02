import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, StatCard, TableCard, SortTh, EmptyState, TD, chartGrid, chartAxis, chartTooltip } from "../components/ui";
import { auditLog } from "../lib/auth";
import { PAT_UIF_MAP } from "../lib/constants";
import { rangoPeriodo, metricasComite, MESES } from "../lib/comite";
import { SLA } from "../lib/casos";
import { PARAMS, ejercicio, sensibilidad, candidatos, concentracionVencidos, edadCasos } from "../lib/calibracion";
import { genInformeComite } from "../lib/reports";
import { serverLoadRuns } from "../lib/sync";
import { T, TR } from "../lib/theme";
import { todayStr } from "../lib/utils";

var FILTROS_KEY = 'goat_comite_filtros_v3';
function leerFiltros() {
  try { var raw = window.sessionStorage.getItem(FILTROS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch(e) { return {}; }
}
function guardarFiltros(f) {
  try { window.sessionStorage.setItem(FILTROS_KEY, JSON.stringify(f)); } catch(e) {}
}

function ComiteView(props) {
  var casos = props.casos || [];
  var legajos = props.legajos || [];
  var periodos = props.periodos || [];
  var onReport = props.onReport;
  var currentUser = props.currentUser || {rol:'analista', nombre:'Analista'};

  var hoy = new Date();
  var tipoState = useState(function(){ return leerFiltros().tipo || 'mes'; }); var tipo=tipoState[0]; var setTipo=tipoState[1];
  var anioState = useState(function(){ return leerFiltros().anio || hoy.getFullYear(); }); var anio=anioState[0]; var setAnio=anioState[1];
  var idxState  = useState(function(){ var f=leerFiltros(); return f.idx !== undefined ? f.idx : hoy.getMonth(); }); var idx=idxState[0]; var setIdx=idxState[1];
  var notasState = useState(''); var notas=notasState[0]; var setNotas=notasState[1];
  var runsState = useState([]); var runs=runsState[0]; var setRuns=runsState[1];
  var calibState = useState(false); var verCalib=calibState[0]; var setVerCalib=calibState[1];
  var paramState = useState('ESCALAMIENTO_COMITE'); var paramSel=paramState[0]; var setParamSel=paramState[1];

  useEffect(function(){ guardarFiltros({tipo:tipo, anio:anio, idx:idx}); }, [tipo, anio, idx]);

  useEffect(function(){
    var vivo = true;
    serverLoadRuns().then(function(rs){ if (vivo) setRuns(rs || []); }).catch(function(){});
    return function(){ vivo = false; };
  }, []);

  // Fecha de referencia según el selector
  var ref = tipo === 'anio' ? new Date(anio, 5, 15)
          : tipo === 'trimestre' ? new Date(anio, idx * 3 + 1, 15)
          : new Date(anio, idx, 15);
  var rango = rangoPeriodo(tipo, ref);

  var m = metricasComite({
    casos: casos, legajos: legajos, periodos: periodos,
    screeningRuns: runs, rango: rango, generado: todayStr()
  });

  function exportar() {
    var html = genInformeComite({ metricas: m, usuario: currentUser, notas: notas });
    onReport(html);
    auditLog(currentUser, 'exportar_informe_comite', 'comite', rango.label, {
      periodo: rango.label, creados: m.casos.creados, cerrados: m.casos.cerrados
    });
  }

  var anios = [];
  for (var a = hoy.getFullYear(); a >= hoy.getFullYear() - 4; a--) anios.push(a);

  var inputSt = {border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 10px',fontSize:12,color:T.TEXT,fontFamily:T.SANS};
  var seccion = {fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS,margin:'22px 0 9px'};

  // Datos para el gráfico de movimiento
  var movimiento = [
    { etiqueta:'Al inicio', valor:m.casos.arrastre,  col:TR.TEXT3 },
    { etiqueta:'Abiertos',  valor:m.casos.creados,   col:TR.AMBER },
    { etiqueta:'Cerrados',  valor:m.casos.cerrados,  col:TR.GREEN },
    { etiqueta:'A hoy',     valor:m.casos.abiertosHoy, col:TR.ACCENT }
  ];

  var hayDatos = casos.length > 0 || legajos.length > 0;

  return (
    <div style={{padding:22}}>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
        <h2 style={{color:T.TEXT,margin:0,fontSize:19,fontWeight:700}}>Informe de gestión</h2>
        <button onClick={exportar}
          style={{background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'8px 15px',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:T.SANS}}>
          📑 Generar informe para el comité
        </button>
      </div>

      {/* Selector de período */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:2,background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.sm+2,padding:3}}>
          {[['mes','Mes'],['trimestre','Trimestre'],['anio','Año']].map(function(t){
            var on = tipo===t[0];
            return (
              <button key={t[0]} onClick={function(){
                setTipo(t[0]);
                if (t[0]==='mes') setIdx(hoy.getMonth());
                if (t[0]==='trimestre') setIdx(Math.floor(hoy.getMonth()/3));
              }}
                style={{border:'none',borderRadius:T.RADIUS.sm,padding:'6px 14px',cursor:'pointer',fontSize:12,
                  fontWeight:on?600:500,background:on?T.ACCENT_SOFT:'transparent',color:on?T.ACCENT:T.TEXT2,
                  fontFamily:T.SANS,transition:T.TRANS}}>{t[1]}</button>
            );
          })}
        </div>

        {tipo==='mes' && (
          <select value={idx} onChange={function(e){setIdx(Number(e.target.value));}} style={inputSt}>
            {MESES.map(function(mes,i){
              return <option key={i} value={i}>{mes.charAt(0).toUpperCase()+mes.slice(1)}</option>;
            })}
          </select>
        )}
        {tipo==='trimestre' && (
          <select value={idx} onChange={function(e){setIdx(Number(e.target.value));}} style={inputSt}>
            {[0,1,2,3].map(function(q){ return <option key={q} value={q}>T{q+1}</option>; })}
          </select>
        )}
        <select value={anio} onChange={function(e){setAnio(Number(e.target.value));}} style={inputSt}>
          {anios.map(function(a){ return <option key={a} value={a}>{a}</option>; })}
        </select>

        <span style={{fontSize:11,color:T.TEXT3,fontFamily:T.MONO,marginLeft:4}}>
          {rango.isoDesde} → {rango.isoHasta}
        </span>
      </div>

      {!hayDatos ? (
        <EmptyState icon="📊" title="Sin datos para informar"
          sub="El informe se arma con los casos, legajos y períodos registrados en el sistema."/>
      ) : (
      <div>

        {/* KPIs principales */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:6}}>
          <StatCard label="Casos abiertos en el período" val={m.casos.creados} col={T.AMBER} icon="📥"/>
          <StatCard label="Casos cerrados" val={m.casos.cerrados} col={T.GREEN} icon="✅"/>
          <StatCard label="Mediana de resolución"
            val={m.tiempos.mediana === null ? '—' : m.tiempos.mediana + ' d'}
            col={T.ACCENT} icon="⏱"
            sub={m.tiempos.muestra ? 'sobre ' + m.tiempos.muestra + ' caso(s)' : 'sin cierres'}/>
          <StatCard label="Cumplimiento de plazos"
            val={m.plazos.pctEnPlazo === null ? '—' : m.plazos.pctEnPlazo + '%'}
            col={m.plazos.pctEnPlazo === null ? T.TEXT3 : m.plazos.pctEnPlazo >= 90 ? T.GREEN : m.plazos.pctEnPlazo >= 70 ? T.AMBER : T.RED}
            icon="📅"
            sub={m.plazos.evaluados ? m.plazos.enPlazo + ' de ' + m.plazos.evaluados : 'sin evaluar'}/>
        </div>

        {/* Alertas derivadas */}
        {(m.plazos.vencidosAbiertos > 0 || m.casos.sinAsignar > 0 || m.casos.creados > m.casos.cerrados) && (
          <div style={{background:T.BG2,border:'1px solid rgba(255,68,85,0.3)',borderLeft:'3px solid '+T.RED,borderRadius:T.RADIUS.md,padding:'12px 15px',margin:'12px 0',boxShadow:T.SHADOW.card}}>
            <div style={{fontSize:11,fontWeight:700,color:T.RED,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:7,fontFamily:T.SANS}}>Requiere decisión del comité</div>
            <ul style={{margin:'0 0 0 17px',padding:0,fontSize:12,color:T.TEXT2,lineHeight:1.75}}>
              {m.plazos.vencidosAbiertos > 0 && <li>{m.plazos.vencidosAbiertos} caso(s) abierto(s) con plazo vencido.</li>}
              {m.plazos.fueraPlazo > 0 && <li>{m.plazos.fueraPlazo} caso(s) cerrado(s) fuera de plazo en el período.</li>}
              {m.casos.sinAsignar > 0 && <li>{m.casos.sinAsignar} caso(s) abierto(s) sin analista asignado.</li>}
              {m.casos.creados > m.casos.cerrados && <li>Entraron más casos ({m.casos.creados}) de los que se cerraron ({m.casos.cerrados}): la cartera pendiente crece.</li>}
            </ul>
          </div>
        )}

        {/* Movimiento y resultado */}
        <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr',gap:14,marginTop:14}}>
          <Card title="Movimiento de casos">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={movimiento} margin={{top:8,right:8,left:0,bottom:5}}>
                <CartesianGrid {...chartGrid}/>
                <XAxis dataKey="etiqueta" {...chartAxis}/>
                <YAxis allowDecimals={false} {...chartAxis}/>
                <Tooltip {...chartTooltip}/>
                <Bar dataKey="valor" radius={[4,4,0,0]} barSize={44}>
                  {movimiento.map(function(d,i){ return <Cell key={i} fill={d.col}/>; })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Resultado de los cierres">
            <div style={{padding:'6px 0'}}>
              {[['Cerrados sin reporte', m.casos.sinRos, T.GREEN],
                ['Reportes presentados', m.casos.conRos, T.RED]].map(function(r,i){
                var tot = m.casos.sinRos + m.casos.conRos;
                var pct = tot ? Math.round(r[1]/tot*100) : 0;
                return (
                  <div key={i} style={{marginBottom:14}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:5}}>
                      <span style={{color:T.TEXT2}}>{r[0]}</span>
                      <span style={{fontFamily:T.MONO,fontWeight:700,color:r[2]}}>{r[1]}</span>
                    </div>
                    <div style={{height:7,background:T.BG3,borderRadius:4,overflow:'hidden'}}>
                      <div style={{width:pct+'%',height:'100%',background:r[2],borderRadius:4,transition:T.TRANS}}/>
                    </div>
                  </div>
                );
              })}
              <div style={{fontSize:10,color:T.TEXT4,lineHeight:1.6,marginTop:4}}>
                La proporción entre ambos no tiene un valor "correcto": depende del perfil de la cartera.
                Lo relevante es que cada cierre tenga fundamento asentado.
              </div>
            </div>
          </Card>
        </div>

        {/* Analistas */}
        <div style={seccion}>Desempeño por analista</div>
        {m.analistas.length === 0 ? (
          <EmptyState icon="👤" title="Ningún caso tiene analista asignado"
            sub="Sin asignación, la trazabilidad de responsabilidad queda incompleta."/>
        ) : (
          <TableCard>
            <thead>
              <tr>
                {['Analista','Abiertos','Asignados en el período','Cerrados','Mediana de cierre','Plazo vencido'].map(function(h,i){
                  return <th key={i} style={Object.assign({},TD,{background:T.BG3,position:'sticky',top:0,zIndex:2,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2,textAlign:i?'right':'left'})}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {m.analistas.map(function(a){
                return (
                  <tr key={a.nombre}>
                    <td style={Object.assign({},TD,{color:T.TEXT,fontWeight:600})}>{a.nombre}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:T.TEXT2})}>{a.abiertos}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:T.TEXT2})}>{a.creadosPeriodo}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:T.GREEN,fontWeight:700})}>{a.cerrados}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:T.TEXT2})}>{a.medianaDias === null ? '—' : a.medianaDias + ' d'}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,fontWeight:700,color:a.vencidos?T.RED:T.TEXT4})}>{a.vencidos}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )}

        {/* Patrones */}
        <div style={seccion}>Patrones más frecuentes en la cartera</div>
        {m.senales.porPatron.length === 0 ? (
          <EmptyState icon="✅" title="Sin señales activas"/>
        ) : (
          <TableCard>
            <thead>
              <tr>
                {['Patrón','Tipología UIF','Señales activas'].map(function(h,i){
                  return <th key={i} style={Object.assign({},TD,{background:T.BG3,position:'sticky',top:0,zIndex:2,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2,textAlign:i===2?'right':'left'})}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {m.senales.porPatron.map(function(p){
                var uif = PAT_UIF_MAP[p.clave];
                return (
                  <tr key={p.clave}>
                    <td style={Object.assign({},TD,{fontFamily:T.MONO,fontSize:11,color:T.ACCENT,fontWeight:600,width:80})}>{p.clave}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT2,fontSize:11.5,lineHeight:1.5})}>{uif ? uif.desc : '—'}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,fontWeight:700,color:T.TEXT,width:110})}>{p.n}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )}

        {/* Cartera y screening */}
        <div style={seccion}>Cartera y screening</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
          <StatCard label="Clientes en cartera" val={m.cartera.total} col={T.ACCENT} icon="📁"/>
          <StatCard label="Altas del período" val={m.cartera.altasPeriodo} col={T.VIOLET} icon="➕"/>
          <StatCard label="Períodos analizados" val={m.cartera.periodosAnalizados} col={T.TEXT3} icon="📊"/>
          <StatCard label="Corridas de screening" val={m.screening.corridasPeriodo}
            col={m.screening.corridasPeriodo ? T.GREEN : T.AMBER} icon="🛡"
            sub={m.screening.hitsAlta ? m.screening.hitsAlta + ' coincidencia(s) ALTA' : 'sin coincidencias'}/>
        </div>

        {/* ══ CALIBRACIÓN DE PLAZOS ═══════════════════════════════════════ */}
        <div style={seccion}>Calibración de plazos</div>
        <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,boxShadow:T.SHADOW.card}}>
          <button onClick={function(){setVerCalib(!verCalib);}}
            style={{width:'100%',background:'transparent',border:'none',padding:'13px 16px',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:9,fontFamily:T.SANS}}>
            <span style={{color:T.TEXT3,fontSize:11}}>{verCalib ? '▾' : '▸'}</span>
            <span style={{flex:1,fontSize:12.5,color:T.TEXT,fontWeight:600}}>
              Qué pasaría si moviéramos un plazo
            </span>
            <span style={{fontSize:11,color:T.TEXT3}}>{verCalib ? 'ocultar' : 'analizar'}</span>
          </button>

          {verCalib && (function(){
            var ej = ejercicio(casos);
            var conc = concentracionVencidos(casos);
            var edad = edadCasos(casos);
            var sens = sensibilidad(casos, paramSel, candidatos(SLA[paramSel]));
            var pInfo = PARAMS.find(function(x){ return x.id === paramSel; }) || {};
            var maxTot = sens.reduce(function(a,r){ return Math.max(a, r.total); }, 1);

            return (
              <div style={{padding:'0 16px 16px'}}>
                <div style={{fontSize:11.5,color:T.TEXT2,lineHeight:1.65,marginBottom:14,paddingBottom:12,borderBottom:'1px solid '+T.BORDER}}>
                  Este panel no dice cuál es el plazo legalmente correcto — eso sale de la resolución vigente.
                  Dice el <strong>impacto operativo</strong> de cada valor sobre tus casos reales, que es la parte
                  que sí se puede medir. Los marcados <span style={{color:T.ACCENT,fontWeight:600}}>internos</span> los
                  decide GOAT y no necesitan validación externa.
                </div>

                {/* Ejercicio de cada parámetro */}
                <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:8,fontFamily:T.SANS}}>
                  Qué plazo manda de verdad
                </div>
                <div style={{overflowX:'auto',marginBottom:16}}>
                  <table style={{width:'100%',borderCollapse:'separate',borderSpacing:0,fontSize:12}}>
                    <thead><tr>
                      {['Plazo','Tipo','Valor','Casos que lo tienen','Casos que gobierna','Vencidos'].map(function(h,i){
                        return <th key={i} style={Object.assign({},TD,{background:T.BG3,color:T.TEXT3,fontSize:9.5,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2,textAlign:i>2?'right':'left'})}>{h}</th>;
                      })}
                    </tr></thead>
                    <tbody>
                      {ej.map(function(p){
                        var esSel = p.id === paramSel;
                        return (
                          <tr key={p.id} onClick={function(){setParamSel(p.id);}}
                            style={{cursor:'pointer',background:esSel?T.ACCENT_SOFT:'transparent'}}>
                            <td style={Object.assign({},TD,{color:T.TEXT,fontWeight:esSel?700:500})}>
                              {p.label}
                              <div style={{fontSize:10,color:T.TEXT4,lineHeight:1.4}}>{p.desc}</div>
                            </td>
                            <td style={TD}>
                              <span style={{background:p.tipo==='INTERNO'?T.ACCENT_SOFT:'rgba(255,184,48,0.12)',
                                color:p.tipo==='INTERNO'?T.ACCENT:T.AMBER,
                                border:'1px solid '+(p.tipo==='INTERNO'?T.ACCENT_DIM:'rgba(255,184,48,0.35)'),
                                borderRadius:T.RADIUS.pill,padding:'1px 8px',fontSize:9,fontWeight:700,whiteSpace:'nowrap'}}>
                                {p.tipo==='INTERNO' ? 'interno' : 'regulatorio'}
                              </span>
                            </td>
                            <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:T.TEXT2,whiteSpace:'nowrap'})}>{p.valor} {p.unidad==='horas'?'h':'d'}</td>
                            <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:T.TEXT2})}>{p.presente}</td>
                            <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,fontWeight:700,color:p.inerte?T.TEXT4:T.TEXT})}>
                              {p.critico}
                              {p.inerte && <span title="Ningún caso lo tiene como plazo más urgente: moverlo no cambia lo que ve el analista" style={{marginLeft:6,fontSize:9,color:T.TEXT4,fontFamily:T.SANS}}>inerte</span>}
                            </td>
                            <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,fontWeight:700,color:p.vencido?T.RED:T.TEXT4})}>{p.vencido}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Sensibilidad del parámetro elegido */}
                <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:4,fontFamily:T.SANS}}>
                  Sensibilidad — {pInfo.label}
                </div>
                <div style={{fontSize:11,color:T.TEXT4,marginBottom:10}}>
                  Sobre {sens.length ? sens[0].total : 0} caso(s) abierto(s). Clic en otra fila de arriba para cambiar de plazo.
                </div>

                {(!sens.length || sens[0].total === 0) ? (
                  <div style={{fontSize:12,color:T.TEXT3,padding:'12px 0'}}>
                    No hay casos abiertos para simular. La calibración empírica necesita casos con historial real.
                  </div>
                ) : (
                  <div>
                    {sens.map(function(r){
                      var pv = Math.round(r.vencidos/maxTot*100);
                      var pp = Math.round(r.proximos/maxTot*100);
                      var po = Math.round(r.ok/maxTot*100);
                      return (
                        <div key={r.valor} style={{display:'flex',alignItems:'center',gap:11,padding:'6px 0'}}>
                          <span style={{width:62,textAlign:'right',fontFamily:T.MONO,fontSize:12,
                            fontWeight:r.actual?700:400,color:r.actual?T.ACCENT:T.TEXT2,whiteSpace:'nowrap'}}>
                            {r.valor} {pInfo.unidad==='horas'?'h':'d'}
                          </span>
                          <div style={{flex:1,display:'flex',height:20,borderRadius:4,overflow:'hidden',background:T.BG3}}>
                            {pv>0 && <div title={r.vencidos+' vencido(s)'} style={{width:pv+'%',background:T.RED}}/>}
                            {pp>0 && <div title={r.proximos+' próximo(s)'} style={{width:pp+'%',background:T.AMBER}}/>}
                            {po>0 && <div title={r.ok+' en regla'} style={{width:po+'%',background:T.GREEN}}/>}
                          </div>
                          <span style={{width:118,fontSize:11,fontFamily:T.MONO,color:T.TEXT3,whiteSpace:'nowrap'}}>
                            <span style={{color:r.vencidos?T.RED:T.TEXT4,fontWeight:700}}>{r.vencidos}</span> venc ·{' '}
                            <span style={{color:r.proximos?T.AMBER:T.TEXT4}}>{r.proximos}</span> próx
                          </span>
                          {r.actual && <span style={{fontSize:9,color:T.ACCENT,fontWeight:700,fontFamily:T.SANS}}>ACTUAL</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Concentración y edad */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:18}}>
                  <div>
                    <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:8,fontFamily:T.SANS}}>Dónde se concentran los vencidos</div>
                    {conc.length === 0 ? (
                      <div style={{fontSize:12,color:T.GREEN}}>Ningún plazo vencido con la configuración actual.</div>
                    ) : conc.map(function(c){
                      return (
                        <div key={c.param} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid '+T.BORDER,fontSize:12}}>
                          <span style={{color:T.TEXT2}}>{c.label}</span>
                          <span style={{fontFamily:T.MONO,color:T.RED,fontWeight:700}}>{c.n} <span style={{color:T.TEXT4,fontWeight:400}}>· hasta {c.diasMax} d</span></span>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:8,fontFamily:T.SANS}}>Antigüedad de los casos abiertos</div>
                    {edad.n === 0 ? (
                      <div style={{fontSize:12,color:T.TEXT3}}>Sin casos abiertos.</div>
                    ) : (
                      <div style={{fontSize:12,color:T.TEXT2,lineHeight:1.9}}>
                        <div>Mediana: <span style={{fontFamily:T.MONO,color:T.TEXT,fontWeight:700}}>{edad.mediana} días</span></div>
                        <div>Rango: <span style={{fontFamily:T.MONO}}>{edad.min} – {edad.max} días</span></div>
                        <div style={{fontSize:10.5,color:T.TEXT4,lineHeight:1.55,marginTop:6}}>
                          Si la mediana supera holgadamente un plazo, el problema no es el umbral sino la
                          capacidad de análisis. Bajar el plazo no lo arregla.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{fontSize:10.5,color:T.TEXT4,marginTop:16,paddingTop:12,borderTop:'1px solid '+T.BORDER,lineHeight:1.6}}>
                  Los valores se editan en <span style={{fontFamily:T.MONO}}>src/lib/casos.js</span>, objeto <span style={{fontFamily:T.MONO}}>SLA</span>.
                  Hay tests que fallan si el conjunto pierde coherencia — por ejemplo si el escalamiento a comité
                  quedara después del plazo de reporte.
                </div>
              </div>
            );
          })()}
        </div>

        {/* Observaciones */}
        <div style={seccion}>Observaciones del Oficial de Cumplimiento</div>
        <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px',boxShadow:T.SHADOW.card}}>
          <div style={{fontSize:11,color:T.TEXT3,marginBottom:9,lineHeight:1.6}}>
            Lo que escribas acá se incorpora al informe como sección propia. Los números los calcula el
            sistema; la lectura de esos números es tuya.
          </div>
          <textarea value={notas} onChange={function(e){setNotas(e.target.value);}} rows={5}
            placeholder="Contexto del período, decisiones tomadas, criterios aplicados, cambios de umbral…"
            style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'10px 12px',fontSize:12.5,resize:'vertical',lineHeight:1.65,boxSizing:'border-box'}}/>
        </div>

        <div style={{fontSize:10,color:T.TEXT4,marginTop:14,lineHeight:1.6,fontFamily:T.SANS}}>
          Las cifras se calculan con las fechas asentadas en cada caso, no con el reloj: el informe de un
          período cerrado da el mismo resultado se genere hoy o dentro de un año.
        </div>
      </div>
      )}
    </div>
  );
}

export default ComiteView;
