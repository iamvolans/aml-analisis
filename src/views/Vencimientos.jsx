import { useState, useEffect } from "react";
import { SortTh, TableCard, Drawer, EmptyState, StatCard, TD } from "../components/ui";
import { toast, uiConfirm } from "../components/feedback";
import { auditLog } from "../lib/auth";
import { nuevoCaso, refCaso } from "../lib/casos";
import { T } from "../lib/theme";
import {
  ACTUALIZACION_LEGAJO, DIAS_AVISO_VENC,
  todosLosVencimientos, vencimientosPendientesDeCaso,
  fmtFecha, colorVenc, esConfiable
} from "../lib/vencimientos";

var FILTROS_KEY = 'rebit_vencimientos_filtros_v3';
function leerFiltros() {
  try { var raw = window.sessionStorage.getItem(FILTROS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch(e) { return {}; }
}
function guardarFiltros(f) {
  try { window.sessionStorage.setItem(FILTROS_KEY, JSON.stringify(f)); } catch(e) {}
}

var TIPOS = [
  ['TODOS',        'Todos los tipos'],
  ['LEGAJO',       'Actualización de legajo'],
  ['DOCUMENTO',    'Documentos'],
  ['INSTITUCIONAL','Institucionales'],
];
var EST_ORD = { VENCIDO:0, PROXIMO:1, OK:2 };

function VencimientosView(props) {
  var legajos = props.legajos || [];
  var periodos = props.periodos || [];
  var casos = props.casos || [];
  var setCasos = props.setCasos;
  var onSyncCasos = props.onSyncCasos;
  var onVerCaso = props.onVerCaso;
  var onOpenLegajo = props.onOpenLegajo;
  var currentUser = props.currentUser || {rol:'analista', nombre:'Analista'};

  var searchState = useState(function(){ return leerFiltros().search || ''; }); var search=searchState[0]; var setSearch=searchState[1];
  var fTipoState = useState(function(){ return leerFiltros().tipo || 'TODOS'; }); var fTipo=fTipoState[0]; var setFTipo=fTipoState[1];
  var fEstState = useState(function(){ return leerFiltros().est || 'ACTIVOS'; }); var fEst=fEstState[0]; var setFEst=fEstState[1];
  var sortState = useState(function(){ return leerFiltros().sort || {k:'dias',d:1}; }); var sortBy=sortState[0]; var setSortBy=sortState[1];
  useEffect(function(){
    guardarFiltros({ search:search, tipo:fTipo, est:fEst, sort:sortBy });
  }, [search, fTipo, fEst, sortBy]);

  var previewState = useState(null); var preview=previewState[0]; var setPreview=previewState[1];
  var previewSelState = useState([]); var previewSel=previewSelState[0]; var setPreviewSel=previewSelState[1];

  function toggleSort(k) { setSortBy(function(p){ return p.k===k ? {k:k,d:-p.d} : {k:k,d:1}; }); }

  var todos = todosLosVencimientos(legajos, periodos);

  // Índice de casos ya abiertos por vencimiento
  var casoPorVenc = {};
  casos.forEach(function(c){ if (c.vencKey) casoPorVenc[c.vencKey] = c; });

  var vencidos = todos.filter(function(v){ return v.estado==='VENCIDO' && esConfiable(v); });
  var proximos = todos.filter(function(v){ return v.estado==='PROXIMO' && esConfiable(v); });
  var sinValidar = todos.filter(function(v){ return v.tipo==='INSTITUCIONAL' && !v.validado; });

  var q = search.trim().toLowerCase();
  var filtrados = todos.filter(function(v){
    var okTipo = fTipo==='TODOS' || v.tipo===fTipo;
    var okEst = fEst==='TODOS' ? true
      : fEst==='ACTIVOS' ? (v.estado==='VENCIDO'||v.estado==='PROXIMO')
      : v.estado===fEst;
    var okQ = !q || [v.label, v.legajoNom, v.detalle].some(function(x){
      return (x||'').toString().toLowerCase().indexOf(q) >= 0;
    });
    return okTipo && okEst && okQ;
  }).sort(function(a,b){
    var k=sortBy.k, d=sortBy.d, va, vb;
    if (k==='dias') { va=EST_ORD[a.estado]*100000+a.dias; vb=EST_ORD[b.estado]*100000+b.dias; }
    else if (k==='limite') { va=a.limite.getTime(); vb=b.limite.getTime(); }
    else { va=(a[k]||'').toString().toLowerCase(); vb=(b[k]||'').toString().toLowerCase(); }
    return va<vb ? -d : va>vb ? d : 0;
  });

  // ── Generación de casos ────────────────────────────────────────────────────
  function claveP(p) { return p.vencKey; }
  function calcularPreview() {
    var pend = vencimientosPendientesDeCaso(todos, casos);
    if (!pend.length) { toast('No hay vencimientos vencidos sin caso asociado.'); return; }
    setPreview(pend);
    setPreviewSel(pend.map(claveP));
  }
  function togglePreview(p) {
    var k = claveP(p);
    setPreviewSel(function(prev){
      return prev.indexOf(k)>=0 ? prev.filter(function(x){return x!==k;}) : prev.concat([k]);
    });
  }
  async function confirmarGeneracion() {
    var elegidos = (preview||[]).filter(function(p){ return previewSel.indexOf(claveP(p))>=0; });
    if (!elegidos.length) { toast('No seleccionaste ningún vencimiento.'); return; }
    if (!(await uiConfirm('Se van a crear ' + elegidos.length + ' caso(s) por vencimientos incumplidos.', {confirmLabel:'Crear ' + elegidos.length + ' caso(s)'}))) return;
    var n = casos.length;
    var nuevos = elegidos.map(function(p, i){
      var campos = Object.assign({}, p);
      delete campos._venc;
      return nuevoCaso(Object.assign(campos, { ref: refCaso(p.legajoNom, n + i + 1) }));
    });
    var lista = casos.concat(nuevos);
    setCasos(lista);
    onSyncCasos(lista);
    setPreview(null);
    setPreviewSel([]);
    auditLog(currentUser, 'generar_casos_vencimiento', 'caso', '', { cantidad: nuevos.length });
    toast('✓ ' + nuevos.length + ' caso(s) creados.');
  }

  var inputSt = {border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 10px',fontSize:12,color:T.TEXT,fontFamily:T.SANS};
  var hayFiltro = search || fTipo!=='TODOS' || fEst!=='ACTIVOS';

  return (
    <div style={{padding:22}}>

      {/* Preview de generación */}
      {preview && (function(){
        var elegidos = preview.filter(function(p){ return previewSel.indexOf(claveP(p))>=0; });
        var todosSel = elegidos.length === preview.length;
        return (
          <Drawer width={600} onClose={function(){setPreview(null);setPreviewSel([]);}}>
            <h3 style={{margin:'0 0 6px',fontSize:17,fontWeight:700,color:T.TEXT}}>Casos por vencimiento</h3>
            <div style={{fontSize:12,color:T.TEXT3,marginBottom:14}}>
              {preview.length} vencimiento(s) incumplido(s) sin caso asociado. Elegí cuáles convertir en caso.
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:10,borderBottom:'1px solid '+T.BORDER}}>
              <button onClick={function(){ setPreviewSel(todosSel ? [] : preview.map(claveP)); }}
                style={{background:'transparent',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'5px 11px',cursor:'pointer',fontSize:11,fontWeight:600,color:T.TEXT2,fontFamily:T.SANS}}>
                {todosSel ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
              <span style={{fontSize:11,color:T.TEXT3,fontFamily:T.MONO}}>{elegidos.length} de {preview.length} seleccionados</span>
            </div>
            <div style={{marginBottom:16}}>
              {preview.map(function(p){
                var marcado = previewSel.indexOf(claveP(p))>=0;
                return (
                  <div key={claveP(p)} onClick={function(){togglePreview(p);}}
                    style={{display:'flex',gap:11,alignItems:'flex-start',background:marcado?T.BG2:'transparent',
                      border:'1px solid '+(marcado?T.BORDER2:T.BORDER),borderLeft:'3px solid '+(marcado?T.RED:T.BORDER2),
                      borderRadius:T.RADIUS.sm,padding:'10px 12px',marginBottom:7,cursor:'pointer',opacity:marcado?1:0.55,transition:T.TRANS}}>
                    <input type="checkbox" checked={marcado} readOnly style={{marginTop:2,flexShrink:0,pointerEvents:'none'}}/>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontSize:12,color:T.TEXT,fontWeight:500,lineHeight:1.4}}>{p.titulo}</div>
                      <div style={{fontSize:10,color:T.TEXT3,marginTop:2}}>{p.legajoNom}</div>
                      {p._venc && p._venc.estimado ? <div style={{fontSize:10,color:T.AMBER,marginTop:2}}>⚠ fecha base estimada</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={confirmarGeneracion} disabled={elegidos.length===0}
              style={{width:'100%',background:elegidos.length?'rgba(0,230,118,0.15)':T.BG3,color:elegidos.length?T.GREEN:T.TEXT4,border:'1px solid '+(elegidos.length?'rgba(0,230,118,0.3)':T.BORDER),borderRadius:T.RADIUS.sm,padding:'10px 0',cursor:elegidos.length?'pointer':'not-allowed',fontWeight:700,fontSize:13,fontFamily:T.SANS}}>
              {elegidos.length ? '✓ Crear ' + elegidos.length + ' caso(s)' : 'Seleccioná al menos uno'}
            </button>
          </Drawer>
        );
      })()}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
        <h2 style={{color:T.TEXT,margin:0,fontSize:19,fontWeight:700}}>Vencimientos</h2>
        <button onClick={calcularPreview}
          style={{background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'7px 13px',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:T.SANS}}>
          ⚡ Generar casos por vencidos
        </button>
      </div>

      {/* Aviso de fechas sin validar */}
      {sinValidar.length > 0 && (
        <div style={{background:'rgba(255,184,48,0.07)',border:'1px solid rgba(255,184,48,0.3)',borderLeft:'3px solid '+T.AMBER,borderRadius:T.RADIUS.md,padding:'11px 14px',marginBottom:14,fontSize:11,color:T.TEXT2,lineHeight:1.6}}>
          <strong style={{color:T.AMBER}}>{sinValidar.length} fecha(s) institucional(es) sin validar.</strong> Las fechas de
          autoevaluación, revisor externo y reporte sistemático son valores por defecto y deben confirmarse contra la
          resolución UIF vigente. Mientras tanto <strong>no se cuentan en los indicadores ni generan casos</strong>, para
          que una fecha por defecto no termine en un registro con valor regulatorio. Se editan en{' '}
          <span style={{fontFamily:T.MONO}}>src/lib/vencimientos.js</span> (marcar
          <span style={{fontFamily:T.MONO}}> validado:true</span> una vez confirmadas).
        </div>
      )}

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        <StatCard label="Vencidos" val={vencidos.length} col={vencidos.length?T.RED:T.GREEN} icon="🔴"
          sub={vencidos.length?'Requieren regularización':'Ninguno'}/>
        <StatCard label={'Vencen en ' + DIAS_AVISO_VENC + ' días'} val={proximos.length} col={proximos.length?T.AMBER:T.TEXT3} icon="⏱"/>
        <StatCard label="Legajos en seguimiento" val={legajos.length} col={T.ACCENT} icon="📁"/>
        <StatCard label="Puntos de control" val={todos.length} col={T.VIOLET} icon="📅"/>
      </div>

      {/* Filtros */}
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <input value={search} onChange={function(e){setSearch(e.target.value);}}
          placeholder="🔍 Buscar por documento, cliente u obligación…"
          style={Object.assign({},inputSt,{flex:'1 1 250px'})}/>
        <select value={fTipo} onChange={function(e){setFTipo(e.target.value);}} style={inputSt}>
          {TIPOS.map(function(t){return <option key={t[0]} value={t[0]}>{t[1]}</option>;})}
        </select>
        <select value={fEst} onChange={function(e){setFEst(e.target.value);}} style={inputSt}>
          <option value="ACTIVOS">Vencidos y próximos</option>
          <option value="VENCIDO">Solo vencidos</option>
          <option value="PROXIMO">Solo próximos</option>
          <option value="OK">Solo en regla</option>
          <option value="TODOS">Todos</option>
        </select>
        {hayFiltro && (
          <button onClick={function(){setSearch('');setFTipo('TODOS');setFEst('ACTIVOS');}}
            style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.sm,padding:'7px 11px',cursor:'pointer',fontSize:12,color:T.TEXT2,fontFamily:T.SANS}}>✕ Limpiar</button>
        )}
      </div>

      {/* Tabla */}
      {todos.length === 0 ? (
        <EmptyState icon="📅" title="Sin puntos de control" sub="Cargá legajos para que el calendario empiece a seguir sus vencimientos."/>
      ) : filtrados.length === 0 ? (
        <EmptyState icon="✅" title="Nada a la vista" sub="Ningún vencimiento coincide con los filtros aplicados."/>
      ) : (
        <TableCard>
          <thead>
            <tr>
              <SortTh k="dias" label="Estado" sortBy={sortBy} onSort={toggleSort} extra={{width:130}}/>
              <SortTh k="tipo" label="Tipo" sortBy={sortBy} onSort={toggleSort} extra={{width:120}}/>
              <SortTh k="label" label="Concepto" sortBy={sortBy} onSort={toggleSort}/>
              <SortTh k="legajoNom" label="Cliente" sortBy={sortBy} onSort={toggleSort} extra={{width:180}}/>
              <SortTh k="limite" label="Vence" sortBy={sortBy} onSort={toggleSort} extra={{width:110}}/>
              <th style={Object.assign({},TD,{width:120,textAlign:'right',background:T.BG3,position:'sticky',top:0,zIndex:2,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>Caso</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(function(v){
              var col = colorVenc(v.estado);
              var cs = casoPorVenc[v.clave];
              return (
                <tr key={v.clave} style={{cursor:v.legajoId&&onOpenLegajo?'pointer':'default'}}
                  onClick={function(){ if(v.legajoId && onOpenLegajo) onOpenLegajo(v.legajoId); }}>
                  <td style={Object.assign({},TD,{borderLeft:'3px solid '+col,whiteSpace:'nowrap'})}>
                    <span style={{color:col,fontSize:11,fontWeight:700,fontFamily:T.MONO}}>
                      {v.dias < 0 ? '⚠ ' + Math.abs(v.dias) + ' d' : v.dias===0 ? 'vence hoy' : 'en ' + v.dias + ' d'}
                    </span>
                  </td>
                  <td style={Object.assign({},TD,{fontSize:10,color:T.TEXT3})}>
                    {v.tipo==='LEGAJO'?'Legajo':v.tipo==='DOCUMENTO'?'Documento':'Institucional'}
                  </td>
                  <td style={Object.assign({},TD,{color:T.TEXT,fontWeight:500})}>
                    {v.label}
                    {v.estimado ? <span title="El documento no tiene fecha cargada; se usa la última actualización del legajo" style={{marginLeft:7,color:T.AMBER,fontSize:9,fontFamily:T.MONO}}>estimado</span> : null}
                    {v.tipo==='INSTITUCIONAL' && !v.validado ? <span title="Fecha por defecto, pendiente de validación normativa" style={{marginLeft:7,color:T.AMBER,fontSize:9,fontFamily:T.MONO}}>sin validar</span> : null}
                    <div style={{fontSize:10,color:T.TEXT4,marginTop:1}}>{v.detalle}</div>
                  </td>
                  <td style={Object.assign({},TD,{color:v.legajoNom?T.TEXT2:T.TEXT4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:180})}>{v.legajoNom||'—'}</td>
                  <td style={Object.assign({},TD,{fontFamily:T.MONO,fontSize:11,color:T.TEXT2,whiteSpace:'nowrap'})}>{fmtFecha(v.limite)}</td>
                  <td style={Object.assign({},TD,{textAlign:'right',whiteSpace:'nowrap'})}>
                    {cs ? (
                      <button onClick={function(e){e.stopPropagation(); if(onVerCaso) onVerCaso(cs.id);}}
                        style={{background:T.ACCENT_SOFT,border:'1px solid '+T.ACCENT_DIM,color:T.ACCENT,borderRadius:T.RADIUS.sm,padding:'2px 8px',cursor:'pointer',fontSize:9,fontWeight:700,fontFamily:T.MONO}}>
                        {cs.ref}
                      </button>
                    ) : <span style={{fontSize:10,color:T.TEXT4}}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      <div style={{fontSize:10,color:T.TEXT4,marginTop:12,lineHeight:1.6,fontFamily:T.SANS}}>
        Actualización de legajo: ALTO {ACTUALIZACION_LEGAJO['ALTO']} meses ·
        MEDIO-ALTO {ACTUALIZACION_LEGAJO['MEDIO-ALTO']} · MEDIO {ACTUALIZACION_LEGAJO['MEDIO']} ·
        BAJO {ACTUALIZACION_LEGAJO['BAJO']}. Ventana de aviso: {DIAS_AVISO_VENC} días.
        Las reglas se editan en <span style={{fontFamily:T.MONO}}>src/lib/vencimientos.js</span>.
      </div>
    </div>
  );
}

export default VencimientosView;
