import { useState, useEffect } from "react";
import { SortTh, TableCard, Drawer, EmptyState, StatCard, TD } from "../components/ui";
import { toast, uiConfirm } from "../components/feedback";
import { auditLog, puedeAprobar } from "../lib/auth";
import {
  SLA, ESTADOS_CASO, getEstadoCaso, getOrigen, PRIORIDADES, getPrioridad,
  hitosSLA, slaCritico, colorSLA, fmtFecha,
  nuevoCaso, refCaso, casosPendientesDeCrear, cambiarEstadoCaso
} from "../lib/casos";
import { T } from "../lib/theme";

var FILTROS_KEY = 'rebit_casos_filtros_v3';
function leerFiltros() {
  try { var raw = window.sessionStorage.getItem(FILTROS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch(e) { return {}; }
}
function guardarFiltros(f) {
  try { window.sessionStorage.setItem(FILTROS_KEY, JSON.stringify(f)); } catch(e) {}
}

var SLA_ORD = { VENCIDO:0, PROXIMO:1, OK:2 };

function CasosView(props) {
  var casos = props.casos || [];
  var setCasos = props.setCasos;
  var legajos = props.legajos || [];
  var periodos = props.periodos || [];
  var onNavAnalisis = props.onNavAnalisis;
  var currentUser = props.currentUser || {rol:'analista', nombre:'Analista'};

  var searchState = useState(function(){ return leerFiltros().search || ''; }); var search=searchState[0]; var setSearch=searchState[1];
  var fEstState = useState(function(){ return leerFiltros().est || 'ABIERTOS'; }); var fEst=fEstState[0]; var setFEst=fEstState[1];
  var fPriState = useState(function(){ return leerFiltros().pri || 'TODAS'; }); var fPri=fPriState[0]; var setFPri=fPriState[1];
  var fLegState = useState(function(){ return leerFiltros().leg || 'TODOS'; }); var fLeg=fLegState[0]; var setFLeg=fLegState[1];
  var sortState = useState(function(){ return leerFiltros().sort || {k:'sla',d:1}; }); var sortBy=sortState[0]; var setSortBy=sortState[1];

  useEffect(function(){
    guardarFiltros({ search:search, est:fEst, pri:fPri, leg:fLeg, sort:sortBy });
  }, [search, fEst, fPri, fLeg, sortBy]);

  var selState = useState(null); var selId=selState[0]; var setSelId=selState[1];
  var notaState = useState(''); var nota=notaState[0]; var setNota=notaState[1];
  var previewState = useState(null); var preview=previewState[0]; var setPreview=previewState[1];
  var previewSelState = useState([]); var previewSel=previewSelState[0]; var setPreviewSel=previewSelState[1];

  // Clave estable de cada señal pendiente, para poder marcarlas una por una
  function claveP(p) { return p.periodoId + '::' + p.pat; }
  function togglePreview(p) {
    var k = claveP(p);
    setPreviewSel(function(prev){
      return prev.indexOf(k) >= 0 ? prev.filter(function(x){return x!==k;}) : prev.concat([k]);
    });
  }

  function toggleSort(k) {
    setSortBy(function(prev){ return prev.k===k ? {k:k,d:-prev.d} : {k:k,d:1}; });
  }

  var sel = casos.find(function(c){return c.id===selId;});

  // ── Persistencia ───────────────────────────────────────────────────────────
  function guardar(lista) {
    setCasos(lista);
    props.onSyncCasos(lista);
  }

  function actualizarCaso(caso) {
    guardar(casos.map(function(c){ return c.id===caso.id ? caso : c; }));
  }

  function transicionar(caso, nuevoEstado) {
    var actualizado = cambiarEstadoCaso(caso, nuevoEstado, currentUser.nombre||'Analista', nota);
    actualizarCaso(actualizado);
    setNota('');
    auditLog(currentUser, 'cambiar_estado_caso', 'caso', caso.id, {
      ref: caso.ref, estadoAnterior: caso.estado, estadoNuevo: nuevoEstado, empresa: caso.legajoNom
    });
  }

  function asignarme(caso) {
    var actualizado = Object.assign({}, caso, { analista: currentUser.nombre || 'Analista' });
    if (actualizado.estado === 'NUEVA') {
      actualizado = cambiarEstadoCaso(actualizado, 'EN_ANALISIS', currentUser.nombre||'Analista', 'Caso tomado');
    }
    actualizarCaso(actualizado);
    auditLog(currentUser, 'asignar_caso', 'caso', caso.id, { ref: caso.ref, analista: actualizado.analista });
  }

  // ── Generación desde señales ───────────────────────────────────────────────
  function calcularPreview() {
    var pend = casosPendientesDeCrear(legajos, periodos, casos);
    if (pend.length === 0) { toast('No hay señales ALTA activas sin caso asociado.'); return; }
    setPreview(pend);
    // Arrancan todas marcadas — desmarcar es más rápido que marcar de a una
    setPreviewSel(pend.map(claveP));
  }

  async function confirmarGeneracion() {
    if (!preview || !preview.length) return;
    var elegidos = preview.filter(function(p){ return previewSel.indexOf(claveP(p)) >= 0; });
    if (!elegidos.length) { toast('No seleccionaste ninguna señal.'); return; }
    if (!(await uiConfirm('Se van a crear ' + elegidos.length + ' caso(s) a partir de las señales seleccionadas.\n\nCada uno queda registrado con su origen y fecha de apertura.', {confirmLabel:'Crear ' + elegidos.length + ' caso(s)'}))) return;
    var n = casos.length;
    var nuevos = elegidos.map(function(p, i){
      return nuevoCaso(Object.assign({}, p, { ref: refCaso(p.legajoNom, n + i + 1) }));
    });
    var lista = casos.concat(nuevos);
    guardar(lista);
    setPreview(null);
    setPreviewSel([]);
    auditLog(currentUser, 'generar_casos', 'caso', '', { cantidad: nuevos.length });
    toast('✓ ' + nuevos.length + ' caso(s) creados.');
  }

  function crearManual() {
    var c = nuevoCaso({
      ref: refCaso('MANUAL', casos.length + 1),
      titulo: 'Caso manual',
      origen: 'MANUAL',
      analista: currentUser.nombre || 'Analista',
    });
    guardar(casos.concat([c]));
    setSelId(c.id);
    auditLog(currentUser, 'crear_caso', 'caso', c.id, { ref: c.ref });
  }

  // ── Filtros y orden ────────────────────────────────────────────────────────
  var q = search.trim().toLowerCase();
  var filtrados = casos.filter(function(c){
    var est = getEstadoCaso(c.estado);
    var okEst = fEst==='TODOS' ? true : fEst==='ABIERTOS' ? est.abierto : fEst==='CERRADOS' ? !est.abierto : c.estado===fEst;
    var okPri = fPri==='TODAS' || c.prioridad===fPri;
    var okLeg = fLeg==='TODOS' || c.legajoId===fLeg;
    var okQ = !q || [c.ref, c.titulo, c.legajoNom, c.pat, c.analista].some(function(x){
      return (x||'').toString().toLowerCase().indexOf(q) >= 0;
    });
    return okEst && okPri && okLeg && okQ;
  }).sort(function(a,b){
    var k=sortBy.k, d=sortBy.d, va, vb;
    if (k==='sla') {
      var sa=slaCritico(a), sb2=slaCritico(b);
      // Los casos sin plazo activo (cerrados) van siempre al final
      va = sa ? SLA_ORD[sa.estado]*10000 + sa.dias : 99999;
      vb = sb2 ? SLA_ORD[sb2.estado]*10000 + sb2.dias : 99999;
    }
    else if (k==='prioridad') { va=getPrioridad(a.prioridad).ord; vb=getPrioridad(b.prioridad).ord; }
    else { va=(a[k]||'').toString().toLowerCase(); vb=(b[k]||'').toString().toLowerCase(); }
    return va<vb ? -d : va>vb ? d : 0;
  });

  // ── KPIs ───────────────────────────────────────────────────────────────────
  var abiertos = casos.filter(function(c){ return getEstadoCaso(c.estado).abierto; });
  var vencidos = abiertos.filter(function(c){ var s=slaCritico(c); return s && s.estado==='VENCIDO'; });
  var proximos = abiertos.filter(function(c){ var s=slaCritico(c); return s && s.estado==='PROXIMO'; });
  var sinAsignar = abiertos.filter(function(c){ return !c.analista; });

  var inputSt = {border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 10px',fontSize:12,color:T.TEXT,fontFamily:T.SANS};
  var hayFiltro = search || fEst!=='ABIERTOS' || fPri!=='TODAS' || fLeg!=='TODOS';
  var puedeDecidir = puedeAprobar(currentUser.rol);

  return (
    <div style={{padding:22}}>

      {/* ══ DRAWER DE CASO ═══════════════════════════════════════════════════ */}
      {sel && (function(){
        var est = getEstadoCaso(sel.estado);
        var pri = getPrioridad(sel.prioridad);
        var org = getOrigen(sel.origen);
        var hitos = hitosSLA(sel);
        return (
          <Drawer width={620} onClose={function(){setSelId(null);setNota('');}}>
            <div style={{display:'flex',alignItems:'center',gap:9,flexWrap:'wrap',marginBottom:10}}>
              <span style={{fontFamily:T.MONO,fontSize:12,fontWeight:700,color:T.ACCENT}}>{sel.ref}</span>
              <span style={{background:est.bg,color:est.col,border:'1px solid '+est.col,borderRadius:T.RADIUS.pill,padding:'2px 10px',fontSize:10,fontWeight:700}}>{est.label}</span>
              <span style={{color:pri.col,fontSize:10,fontWeight:700,fontFamily:T.MONO}}>● {pri.label}</span>
              <span style={{fontSize:11,color:T.TEXT3}}>{org.icon} {org.label}</span>
            </div>
            <h3 style={{margin:'0 0 6px',fontSize:17,fontWeight:700,color:T.TEXT,lineHeight:1.3}}>{sel.titulo||'Sin título'}</h3>
            <div style={{fontSize:12,color:T.TEXT3,marginBottom:16}}>
              {sel.legajoNom||'Sin cliente'}{sel.periodoNom ? ' · ' + sel.periodoNom : ''}{sel.pat ? ' · ' + sel.pat : ''}
              {sel.analista ? ' · Analista: ' + sel.analista : ' · Sin asignar'}
            </div>

            {/* Plazos */}
            <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:10}}>Plazos aplicables</div>
              {hitos.length === 0 ? (
                <div style={{fontSize:12,color:T.TEXT3}}>El caso está cerrado — sin plazos corriendo.</div>
              ) : hitos.map(function(h){
                var col = colorSLA(h.estado);
                return (
                  <div key={h.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:'1px solid '+T.BORDER}}>
                    <span style={{width:7,height:7,borderRadius:'50%',background:col,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,color:T.TEXT,fontWeight:500}}>{h.label}</div>
                      <div style={{fontSize:10,color:T.TEXT3}}>{h.nota} · vence {fmtFecha(h.limite)}</div>
                    </div>
                    <span style={{color:col,fontSize:11,fontWeight:700,fontFamily:T.MONO,whiteSpace:'nowrap'}}>
                      {h.dias < 0 ? Math.abs(h.dias)+' d vencido' : h.dias===0 ? 'vence hoy' : h.dias+' d'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Detalle */}
            {sel.detalle ? (
              <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px',marginBottom:14}}>
                <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:6}}>Detalle</div>
                <div style={{fontSize:12,color:T.TEXT2,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{sel.detalle}</div>
              </div>
            ) : null}

            {/* Acciones */}
            <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:9}}>Mover el caso</div>
              <input value={nota} onChange={function(e){setNota(e.target.value);}}
                placeholder="Nota del cambio (queda en el historial)"
                style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 10px',fontSize:12,marginBottom:9,boxSizing:'border-box'}}/>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {!sel.analista && (
                  <button onClick={function(){asignarme(sel);}}
                    style={{background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'6px 12px',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:T.SANS}}>
                    Asignarme
                  </button>
                )}
                {ESTADOS_CASO.filter(function(e){ return e.id!==sel.estado; }).map(function(e){
                  // Cerrar con o sin ROS es decisión de comité
                  var restringido = (e.id==='CERRADA_SIN_ROS' || e.id==='ROS_PRESENTADO') && !puedeDecidir;
                  return (
                    <button key={e.id} disabled={restringido}
                      title={restringido ? 'Requiere rol supervisor u oficial de cumplimiento' : e.desc}
                      onClick={function(){transicionar(sel, e.id);}}
                      style={{background:restringido?T.BG3:e.bg,color:restringido?T.TEXT4:e.col,border:'1px solid '+(restringido?T.BORDER:e.col),borderRadius:T.RADIUS.sm,padding:'6px 12px',cursor:restringido?'not-allowed':'pointer',fontSize:11,fontWeight:600,fontFamily:T.SANS}}>
                      → {e.label}
                    </button>
                  );
                })}
              </div>
              {sel.estado !== 'COMITE' && !sel.fechaCalificacion && (
                <div style={{fontSize:10,color:T.TEXT3,marginTop:9,lineHeight:1.5}}>
                  El plazo de reporte arranca cuando el caso se eleva a comité (ahí se sella la fecha de calificación).
                </div>
              )}
            </div>

            {/* Historial */}
            <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:10}}>Historial</div>
              {(sel.historial||[]).slice().reverse().map(function(h,i,arr){
                var he = getEstadoCaso(h.estado);
                return (
                  <div key={i} style={{display:'flex',gap:12,paddingBottom:10}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:he.col,marginTop:3,boxShadow:i===0?('0 0 0 3px '+T.ACCENT_SOFT):'none'}}/>
                      {i < arr.length-1 && <div style={{width:2,flex:1,background:T.BORDER2,marginTop:2,borderRadius:2}}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:he.col}}>{he.label}</div>
                      <div style={{fontSize:10,color:T.TEXT3}}>{h.fecha} {h.hora} · {h.autor}</div>
                      {h.nota ? <div style={{fontSize:11,color:T.TEXT2,marginTop:3,lineHeight:1.5}}>{h.nota}</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {onNavAnalisis && sel.periodoId && (function(){
              var leg = legajos.find(function(l){return l.id===sel.legajoId;});
              var per = periodos.find(function(p){return p.id===sel.periodoId;});
              if (!leg || !per) return null;
              return (
                <button onClick={function(){setSelId(null);onNavAnalisis(leg, per);}}
                  style={{width:'100%',background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'9px 0',cursor:'pointer',fontWeight:600,fontSize:12,fontFamily:T.SANS}}>
                  Ver período que originó el caso →
                </button>
              );
            })()}
          </Drawer>
        );
      })()}

      {/* ══ PREVIEW DE GENERACIÓN ════════════════════════════════════════════ */}
      {preview && (function(){
        var elegidos = preview.filter(function(p){ return previewSel.indexOf(claveP(p)) >= 0; });
        var todos = elegidos.length === preview.length;
        return (
        <Drawer width={600} onClose={function(){setPreview(null);setPreviewSel([]);}}>
          <h3 style={{margin:'0 0 6px',fontSize:17,fontWeight:700,color:T.TEXT}}>Casos a generar</h3>
          <div style={{fontSize:12,color:T.TEXT3,marginBottom:14}}>
            {preview.length} señal(es) ALTA activa(s) sin caso asociado. Elegí cuáles convertir en caso.
          </div>

          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:10,borderBottom:'1px solid '+T.BORDER}}>
            <button onClick={function(){ setPreviewSel(todos ? [] : preview.map(claveP)); }}
              style={{background:'transparent',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'5px 11px',cursor:'pointer',fontSize:11,fontWeight:600,color:T.TEXT2,fontFamily:T.SANS}}>
              {todos ? 'Desmarcar todas' : 'Marcar todas'}
            </button>
            <span style={{fontSize:11,color:T.TEXT3,fontFamily:T.MONO}}>{elegidos.length} de {preview.length} seleccionadas</span>
          </div>

          <div style={{marginBottom:16}}>
            {preview.map(function(p,i){
              var marcado = previewSel.indexOf(claveP(p)) >= 0;
              return (
                <div key={claveP(p)} onClick={function(){togglePreview(p);}}
                  style={{display:'flex',gap:11,alignItems:'flex-start',background:marcado?T.BG2:'transparent',
                    border:'1px solid '+(marcado?T.BORDER2:T.BORDER),
                    borderLeft:'3px solid '+(marcado?T.RED:T.BORDER2),
                    borderRadius:T.RADIUS.sm,padding:'10px 12px',marginBottom:7,cursor:'pointer',
                    opacity:marcado?1:0.55,transition:T.TRANS}}>
                  <input type="checkbox" checked={marcado} readOnly style={{marginTop:2,flexShrink:0,pointerEvents:'none'}}/>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3,flexWrap:'wrap'}}>
                      <span style={{fontFamily:T.MONO,fontSize:10,fontWeight:700,color:T.ACCENT}}>{p.pat}</span>
                      <span style={{fontSize:11,color:T.TEXT2}}>{p.legajoNom}</span>
                    </div>
                    <div style={{fontSize:12,color:T.TEXT,fontWeight:500,lineHeight:1.4}}>{p.titulo}</div>
                    <div style={{fontSize:10,color:T.TEXT3,marginTop:2,fontFamily:T.MONO}}>{p.periodoNom}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={confirmarGeneracion} disabled={elegidos.length===0}
            style={{width:'100%',background:elegidos.length?'rgba(0,230,118,0.15)':T.BG3,color:elegidos.length?T.GREEN:T.TEXT4,border:'1px solid '+(elegidos.length?'rgba(0,230,118,0.3)':T.BORDER),borderRadius:T.RADIUS.sm,padding:'10px 0',cursor:elegidos.length?'pointer':'not-allowed',fontWeight:700,fontSize:13,fontFamily:T.SANS}}>
            {elegidos.length ? '✓ Crear ' + elegidos.length + ' caso(s)' : 'Seleccioná al menos una señal'}
          </button>
        </Drawer>
        );
      })()}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
        <h2 style={{color:T.TEXT,margin:0,fontSize:19,fontWeight:700}}>Casos</h2>
        <div style={{display:'flex',gap:8}}>
          <button onClick={calcularPreview}
            style={{background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'7px 13px',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:T.SANS}}>
            ⚡ Generar desde señales
          </button>
          <button onClick={crearManual}
            style={{background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:T.RADIUS.sm,padding:'7px 13px',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:T.SANS}}>
            + Nuevo caso
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        <StatCard label="Casos abiertos" val={abiertos.length} col={T.ACCENT} icon="📁"/>
        <StatCard label="Plazo vencido" val={vencidos.length} col={vencidos.length?T.RED:T.GREEN} icon="🔴"
          sub={vencidos.length?'Requieren acción inmediata':'Ninguno'}/>
        <StatCard label={'Vencen en ' + 3 + ' días'} val={proximos.length} col={proximos.length?T.AMBER:T.TEXT3} icon="⏱"/>
        <StatCard label="Sin asignar" val={sinAsignar.length} col={sinAsignar.length?T.AMBER:T.TEXT3} icon="👤"/>
      </div>

      {/* Filtros */}
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <input value={search} onChange={function(e){setSearch(e.target.value);}}
          placeholder="🔍 Buscar por referencia, título, cliente, patrón o analista…"
          style={Object.assign({},inputSt,{flex:'1 1 260px'})}/>
        <select value={fEst} onChange={function(e){setFEst(e.target.value);}} style={inputSt}>
          <option value="ABIERTOS">Solo abiertos</option>
          <option value="CERRADOS">Solo cerrados</option>
          <option value="TODOS">Todos los estados</option>
          {ESTADOS_CASO.map(function(e){return <option key={e.id} value={e.id}>{e.label}</option>;})}
        </select>
        <select value={fPri} onChange={function(e){setFPri(e.target.value);}} style={inputSt}>
          <option value="TODAS">Todas las prioridades</option>
          {PRIORIDADES.map(function(p){return <option key={p.id} value={p.id}>{p.label}</option>;})}
        </select>
        <select value={fLeg} onChange={function(e){setFLeg(e.target.value);}} style={inputSt}>
          <option value="TODOS">Todos los clientes</option>
          {legajos.map(function(l){return <option key={l.id} value={l.id}>{l.razonSocial||'Sin nombre'}</option>;})}
        </select>
        {hayFiltro && (
          <button onClick={function(){setSearch('');setFEst('ABIERTOS');setFPri('TODAS');setFLeg('TODOS');}}
            style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.sm,padding:'7px 11px',cursor:'pointer',fontSize:12,color:T.TEXT2,fontFamily:T.SANS}}>✕ Limpiar</button>
        )}
      </div>

      {/* Tabla */}
      {casos.length === 0 ? (
        <EmptyState icon="📁" title="Todavía no hay casos"
          sub="Usá “Generar desde señales” para abrir casos a partir de las señales ALTA activas, o creá uno manual."/>
      ) : filtrados.length === 0 ? (
        <EmptyState icon="🔍" title="Sin resultados" sub="Ningún caso coincide con los filtros aplicados."/>
      ) : (
        <TableCard>
          <thead>
            <tr>
              <SortTh k="sla" label="Plazo" sortBy={sortBy} onSort={toggleSort} extra={{width:140}}/>
              <SortTh k="ref" label="Referencia" sortBy={sortBy} onSort={toggleSort} extra={{width:170}}/>
              <SortTh k="titulo" label="Caso" sortBy={sortBy} onSort={toggleSort}/>
              <SortTh k="legajoNom" label="Cliente" sortBy={sortBy} onSort={toggleSort} extra={{width:180}}/>
              <SortTh k="estado" label="Estado" sortBy={sortBy} onSort={toggleSort} extra={{width:140}}/>
              <SortTh k="prioridad" label="Prior." sortBy={sortBy} onSort={toggleSort} extra={{width:80}}/>
              <SortTh k="analista" label="Analista" sortBy={sortBy} onSort={toggleSort} extra={{width:130}}/>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(function(c){
              var est = getEstadoCaso(c.estado);
              var pri = getPrioridad(c.prioridad);
              var s = slaCritico(c);
              var col = s ? colorSLA(s.estado) : T.TEXT4;
              return (
                <tr key={c.id} onClick={function(){setSelId(c.id);setNota('');}}
                  style={{cursor:'pointer',background:selId===c.id?T.ACCENT_SOFT:'transparent',transition:T.TRANS}}>
                  <td style={Object.assign({},TD,{borderLeft:'3px solid '+col,whiteSpace:'nowrap'})}>
                    {s ? (
                      <span style={{color:col,fontSize:11,fontWeight:700,fontFamily:T.MONO}}>
                        {s.dias < 0 ? '⚠ ' + Math.abs(s.dias) + ' d vencido' : s.dias===0 ? 'vence hoy' : s.dias + ' d'}
                      </span>
                    ) : <span style={{color:T.TEXT4,fontSize:11,fontFamily:T.MONO}}>—</span>}
                    {s ? <div style={{fontSize:9,color:T.TEXT4,marginTop:1}}>{s.label}</div> : null}
                  </td>
                  <td style={Object.assign({},TD,{fontFamily:T.MONO,fontSize:10,color:T.ACCENT,fontWeight:600})}>{c.ref}</td>
                  <td style={Object.assign({},TD,{color:T.TEXT,fontWeight:500})}>
                    {c.titulo||'Sin título'}
                    {c.pat ? <span style={{marginLeft:7,fontFamily:T.MONO,fontSize:9,color:T.TEXT4}}>{c.pat}</span> : null}
                  </td>
                  <td style={Object.assign({},TD,{color:T.TEXT2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:180})}>{c.legajoNom||'—'}</td>
                  <td style={TD}>
                    <span style={{background:est.bg,color:est.col,border:'1px solid '+est.col,borderRadius:T.RADIUS.pill,padding:'2px 9px',fontSize:9,fontWeight:700,whiteSpace:'nowrap'}}>{est.label}</span>
                  </td>
                  <td style={Object.assign({},TD,{color:pri.col,fontWeight:700,fontSize:11,fontFamily:T.MONO})}>{pri.label}</td>
                  <td style={Object.assign({},TD,{color:c.analista?T.TEXT2:T.TEXT4,fontSize:11})}>{c.analista||'sin asignar'}</td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      <div style={{fontSize:10,color:T.TEXT4,marginTop:12,lineHeight:1.6,fontFamily:T.SANS}}>
        Plazos configurados: reporte {SLA.ROS_CALIFICACION} días corridos desde la calificación ·
        tope {SLA.ROS_MAX_OPERACION} días desde la operación ·
        RFI {SLA.RFI_RESPUESTA} días · elevación a comité {SLA.ESCALAMIENTO_COMITE} días.
        Se editan en <span style={{fontFamily:T.MONO}}>src/lib/casos.js</span> — verificar contra la normativa vigente.
      </div>
    </div>
  );
}

export default CasosView;
