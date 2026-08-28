import { useState, useEffect } from "react";
import { SortTh, TableCard, Drawer, EmptyState, StatCard, TD } from "../components/ui";
import { auditLog } from "../lib/auth";
import { nuevoCaso, refCaso } from "../lib/casos";
import { GRAFO, contrapartesCompartidas, layoutGrafo } from "../lib/grafo";
import { toast, uiConfirm } from "../components/feedback";
import { serverLoadKV, serverSaveKV } from "../lib/sync";
import { T, TR } from "../lib/theme";
import { fmtM, parseFechaAR, segColor, segColorR, todayStr } from "../lib/utils";

// El punto de corte se guarda en el servidor y no en el navegador: es una
// decisión de alcance del análisis, no una preferencia personal. Todo el equipo
// tiene que ver la misma red.
var CORTE_KV = 'red_punto_corte';

var FILTROS_KEY = 'rebit_red_filtros_v3';
function leerFiltros() {
  try { var raw = window.sessionStorage.getItem(FILTROS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch(e) { return {}; }
}
function guardarFiltros(f) {
  try { window.sessionStorage.setItem(FILTROS_KEY, JSON.stringify(f)); } catch(e) {}
}

function RedView(props) {
  var legajos = props.legajos || [];
  var periodos = props.periodos || [];
  var casos = props.casos || [];
  var setCasos = props.setCasos;
  var onSyncCasos = props.onSyncCasos;
  var onVerCaso = props.onVerCaso;
  var onOpenLegajo = props.onOpenLegajo;
  var currentUser = props.currentUser || {rol:'analista', nombre:'Analista'};

  var minState = useState(function(){ return leerFiltros().min || GRAFO.MIN_LEGAJOS_MOSTRAR; }); var minLeg=minState[0]; var setMinLeg=minState[1];
  var searchState = useState(function(){ return leerFiltros().search || ''; }); var search=searchState[0]; var setSearch=searchState[1];
  var sortState = useState(function(){ return leerFiltros().sort || {k:'cantLegajos',d:-1}; }); var sortBy=sortState[0]; var setSortBy=sortState[1];
  useEffect(function(){ guardarFiltros({min:minLeg, search:search, sort:sortBy}); }, [minLeg, search, sortBy]);

  var selState = useState(null); var selCp=selState[0]; var setSelCp=selState[1];
  var hoverState = useState(null); var hover=hoverState[0]; var setHover=hoverState[1];

  // ── Punto de corte ─────────────────────────────────────────────────────────
  // Red no almacena nada propio: calcula sobre los períodos. "Reiniciarla" sin
  // borrar datos consiste en acotar qué períodos entran en el cálculo. Los
  // períodos anteriores permanecen intactos y siguen disponibles en el resto de
  // la aplicación; solo dejan de computar en esta vista.
  var corteState = useState(null); var corte=corteState[0]; var setCorte=corteState[1];
  var cargandoState = useState(true); var cargandoCorte=cargandoState[0]; var setCargandoCorte=cargandoState[1];
  var panelState = useState(false); var verPanel=panelState[0]; var setVerPanel=panelState[1];
  var motivoState = useState(''); var motivo=motivoState[0]; var setMotivo=motivoState[1];

  useEffect(function(){
    var vivo = true;
    serverLoadKV(CORTE_KV).then(function(c){
      if (!vivo) return;
      setCorte(c && c.fecha ? c : null);
      setCargandoCorte(false);
    }).catch(function(){ if (vivo) setCargandoCorte(false); });
    return function(){ vivo = false; };
  }, []);

  async function definirCorte(desdeISO) {
    if (!desdeISO) { toast('Elegí una fecha de corte.'); return; }
    var partes = desdeISO.split('-');
    var fechaAR = Number(partes[2]) + '/' + Number(partes[1]) + '/' + partes[0];
    var quedan = periodos.filter(function(p){
      var f = parseFechaAR(p.createdAt);
      return f && f >= new Date(partes[0], partes[1]-1, partes[2]);
    }).length;
    if (!(await uiConfirm(
      'La red pasará a calcularse solo con los períodos cargados desde el ' + fechaAR + '.\n\n' +
      'Quedan dentro ' + quedan + ' de ' + periodos.length + ' períodos.\n\n' +
      'Ningún dato se elimina: los períodos anteriores siguen disponibles en Análisis, Alertas y ' +
      'los legajos. Solo dejan de computar en esta vista.',
      {confirmLabel:'Aplicar corte'}))) return;

    var nuevo = { fecha: fechaAR, iso: desdeISO, autor: currentUser.nombre || 'N/D',
                  definidoEl: todayStr(), motivo: (motivo || '').trim() };
    var ok = await serverSaveKV(CORTE_KV, nuevo);
    if (!ok) { toast('No se pudo guardar el punto de corte.'); return; }
    setCorte(nuevo); setVerPanel(false); setMotivo('');
    auditLog(currentUser, 'definir_corte_red', 'red', fechaAR,
             { desde: fechaAR, periodosDentro: quedan, periodosTotales: periodos.length, motivo: nuevo.motivo });
    toast('✓ Red acotada a los períodos desde el ' + fechaAR);
  }

  async function quitarCorte() {
    if (!(await uiConfirm('La red volverá a considerar la totalidad de los períodos cargados.',
      {confirmLabel:'Quitar corte'}))) return;
    var ok = await serverSaveKV(CORTE_KV, {});
    if (!ok) { toast('No se pudo quitar el punto de corte.'); return; }
    setCorte(null); setVerPanel(false);
    auditLog(currentUser, 'quitar_corte_red', 'red', '', {});
    toast('Corte quitado. La red considera todos los períodos.');
  }

  function toggleSort(k) { setSortBy(function(p){ return p.k===k ? {k:k,d:-p.d} : {k:k,d:1}; }); }

  // Períodos que efectivamente entran en el cálculo
  var desde = corte && corte.iso ? new Date(corte.iso.split('-')[0], corte.iso.split('-')[1]-1, corte.iso.split('-')[2]) : null;
  var periodosEnRed = desde ? periodos.filter(function(p){
    var f = parseFechaAR(p.createdAt);
    return f && f >= desde;
  }) : periodos;
  var excluidos = periodos.length - periodosEnRed.length;

  var compartidas = contrapartesCompartidas(legajos, periodosEnRed, Number(minLeg));
  var conAlerta = compartidas.filter(function(c){ return c.alerta; });

  var q = search.trim().toLowerCase();
  var filtradas = compartidas.filter(function(c){
    return !q || c.label.toLowerCase().indexOf(q) >= 0 ||
      c.legajos.some(function(l){ return l.nombre.toLowerCase().indexOf(q) >= 0; });
  }).sort(function(a,b){
    var k=sortBy.k, d=sortBy.d, va, vb;
    if (k==='cantLegajos') { va=a.cantLegajos; vb=b.cantLegajos; }
    else if (k==='montoTotal') { va=a.montoTotal; vb=b.montoTotal; }
    else { va=(a[k]||'').toString().toLowerCase(); vb=(b[k]||'').toString().toLowerCase(); }
    return va<vb ? -d : va>vb ? d : 0;
  });

  // El grafo se dibuja solo con las que superan el umbral de alerta: con toda
  // la cartera se vuelve ilegible y deja de comunicar nada.
  var paraGrafo = compartidas.filter(function(c){ return c.alerta; }).slice(0, 40);
  var layout = paraGrafo.length ? layoutGrafo(paraGrafo, 900, 540) : null;

  function casoDe(c) {
    return casos.find(function(x){ return x.redKey === c.clave; }) || null;
  }
  function abrirCaso(c) {
    var nc = nuevoCaso({
      ref: refCaso(c.legajos[0].nombre, casos.length + 1),
      legajoId: c.legajos[0].id,
      legajoNom: c.legajos[0].nombre,
      origen: 'SENAL',
      prioridad: c.cantLegajos >= 4 ? 'ALTA' : 'MEDIA',
      titulo: 'Contraparte compartida: ' + c.label,
      detalle: '"' + c.label + '" opera con ' + c.cantLegajos + ' clientes de la cartera, ' +
        'por un volumen agregado de ' + fmtM(c.montoTotal) + '.\n\n' +
        c.legajos.map(function(l){
          return '· ' + l.nombre + ' (' + l.segmento + ') — ' + fmtM(l.monto) + ' en ' + l.periodos + ' período(s)';
        }).join('\n') +
        '\n\nRevisar si existe vinculación societaria o económica entre los clientes, o si la contraparte ' +
        'actúa como punto de concentración.' +
        (corte ? '\n\nAlcance del análisis: períodos cargados desde el ' + corte.fecha +
                 ' (' + periodosEnRed.length + ' de ' + periodos.length + ' períodos).'
               : '\n\nAlcance del análisis: todos los períodos cargados (' + periodos.length + ').'),
      redKey: c.clave,
      analista: currentUser.nombre || 'Analista',
    });
    var lista = casos.concat([nc]);
    setCasos(lista); onSyncCasos(lista);
    setSelCp(null);
    auditLog(currentUser, 'crear_caso_red', 'caso', nc.id, { ref: nc.ref, contraparte: c.label, legajos: c.cantLegajos });
    if (onVerCaso) onVerCaso(nc.id);
  }

  var inputSt = {border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 10px',fontSize:12,color:T.TEXT,fontFamily:T.SANS};
  var resaltado = hover || (selCp && selCp.clave);

  return (
    <div style={{padding:22}}>

      {/* Drawer de contraparte */}
      {selCp && (function(){
        var cs = casoDe(selCp);
        return (
          <Drawer width={560} onClose={function(){setSelCp(null);}}>
            <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:8,flexWrap:'wrap'}}>
              <span style={{background:selCp.alerta?'rgba(255,68,85,0.12)':'rgba(255,184,48,0.12)',color:selCp.alerta?T.RED:T.AMBER,border:'1px solid '+(selCp.alerta?T.RED:T.AMBER),borderRadius:T.RADIUS.pill,padding:'2px 10px',fontSize:10,fontWeight:700}}>
                {selCp.cantLegajos} legajos
              </span>
              <span style={{fontFamily:T.MONO,fontSize:12,color:T.TEXT2}}>{fmtM(selCp.montoTotal)}</span>
            </div>
            <h3 style={{margin:'0 0 16px',fontSize:17,fontWeight:700,color:T.TEXT,lineHeight:1.3}}>{selCp.label}</h3>

            <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px',marginBottom:12}}>
              <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:10}}>Clientes que operan con esta contraparte</div>
              {selCp.legajos.map(function(l){
                return (
                  <div key={l.id} onClick={function(){ if(onOpenLegajo){ setSelCp(null); onOpenLegajo(l.id); } }}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid '+T.BORDER,cursor:onOpenLegajo?'pointer':'default'}}>
                    <span style={{width:3,height:22,borderRadius:2,background:segColor(l.segmento),flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,color:T.TEXT,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.nombre}</div>
                      <div style={{fontSize:10,color:T.TEXT4}}>{l.segmento} · {l.periodos} período(s)</div>
                    </div>
                    <span style={{fontFamily:T.MONO,fontSize:11,color:T.TEXT2,whiteSpace:'nowrap'}}>{fmtM(l.monto)}</span>
                  </div>
                );
              })}
            </div>

            <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.md,padding:'12px 14px',marginBottom:12,fontSize:11,color:T.TEXT3,lineHeight:1.6}}>
              Que una contraparte opere con varios clientes no es por sí solo una irregularidad: puede ser un
              proveedor de servicios común, un banco o una empresa grande del rubro. Lo que amerita revisión es
              la combinación con vinculación societaria, concentración de flujo o coincidencia temporal.
            </div>

            {cs ? (
              <button onClick={function(){setSelCp(null); if(onVerCaso) onVerCaso(cs.id);}}
                style={{width:'100%',background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'9px 0',cursor:'pointer',fontWeight:600,fontSize:12,fontFamily:T.SANS}}>
                Ver caso {cs.ref} →
              </button>
            ) : (
              <button onClick={function(){abrirCaso(selCp);}}
                style={{width:'100%',background:'rgba(255,184,48,0.14)',color:T.AMBER,border:'1px solid rgba(255,184,48,0.35)',borderRadius:T.RADIUS.sm,padding:'10px 0',cursor:'pointer',fontWeight:700,fontSize:12,fontFamily:T.SANS}}>
                📁 Abrir caso por esta red
              </button>
            )}
          </Drawer>
        );
      })()}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{color:T.TEXT,margin:0,fontSize:19,fontWeight:700}}>Red de contrapartes</h2>
        <button onClick={function(){setVerPanel(!verPanel);}}
          style={{background:corte?'rgba(255,184,48,0.14)':'transparent',
            color:corte?T.AMBER:T.TEXT2,
            border:'1px solid '+(corte?'rgba(255,184,48,0.4)':T.BORDER2),
            borderRadius:T.RADIUS.sm,padding:'7px 13px',cursor:'pointer',fontSize:12,
            fontWeight:corte?600:500,fontFamily:T.SANS}}>
          {corte ? '📅 Corte desde ' + corte.fecha : '📅 Definir punto de corte'}
        </button>
      </div>

      {/* Estado del corte — siempre visible cuando hay uno activo, para que
          nadie interprete la red como si fuera la cartera completa */}
      {corte && (
        <div style={{background:'rgba(255,184,48,0.07)',border:'1px solid rgba(255,184,48,0.3)',
          borderLeft:'3px solid '+T.AMBER,borderRadius:T.RADIUS.md,padding:'11px 14px',marginBottom:14,
          fontSize:11.5,color:T.TEXT2,lineHeight:1.65}}>
          <strong style={{color:T.AMBER}}>Alcance acotado.</strong> La red considera únicamente los{' '}
          <strong>{periodosEnRed.length}</strong> período(s) cargado(s) desde el{' '}
          <span style={{fontFamily:T.MONO}}>{corte.fecha}</span>.
          {excluidos > 0 && <> Quedan fuera del cálculo {excluidos} período(s) anteriores, que
          <strong> siguen disponibles</strong> en Análisis, Alertas y los legajos.</>}
          <div style={{fontSize:10.5,color:T.TEXT3,marginTop:5}}>
            Definido por {corte.autor} el {corte.definidoEl}
            {corte.motivo ? ' — ' + corte.motivo : ''}
          </div>
        </div>
      )}

      {/* Panel de configuración */}
      {verPanel && (
        <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,
          padding:'16px 18px',marginBottom:14,boxShadow:T.SHADOW.card}}>
          <div style={{fontSize:13,fontWeight:600,color:T.TEXT,marginBottom:8}}>Punto de corte del análisis de red</div>
          <div style={{fontSize:11.5,color:T.TEXT2,lineHeight:1.7,marginBottom:14}}>
            La red no almacena información propia: se calcula sobre los períodos transaccionales
            cargados. Acotarla por fecha permite trabajar solo con datos nuevos <strong>sin eliminar
            nada</strong>. Los períodos anteriores conservan sus métricas, señales y conclusiones, y
            siguen computando en el resto de la aplicación.
            <div style={{marginTop:7,color:T.TEXT3}}>
              El corte es compartido por todo el equipo y queda registrado en la auditoría con su autor
              y su motivo.
            </div>
          </div>

          <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div>
              <label style={{display:'block',fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:5}}>Considerar desde</label>
              <input id="corteFecha" type="date" defaultValue={corte && corte.iso ? corte.iso : new Date().toISOString().slice(0,10)}
                style={{border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 10px',fontSize:12,color:T.TEXT,fontFamily:T.MONO}}/>
            </div>
            <div style={{flex:'1 1 240px'}}>
              <label style={{display:'block',fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:5}}>Motivo</label>
              <input value={motivo} onChange={function(e){setMotivo(e.target.value);}}
                placeholder="Ej: reinicio del análisis de red tras corrección en la lectura de contrapartes"
                style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 10px',fontSize:12,color:T.TEXT,boxSizing:'border-box'}}/>
            </div>
            <button onClick={function(){
                var el = document.getElementById('corteFecha');
                definirCorte(el ? el.value : '');
              }}
              style={{background:T.ACCENT,color:T.ON_ACCENT,border:'none',borderRadius:T.RADIUS.sm,padding:'8px 16px',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:T.SANS}}>
              Aplicar
            </button>
            {corte && (
              <button onClick={quitarCorte}
                style={{background:'transparent',color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'8px 14px',cursor:'pointer',fontSize:12,fontFamily:T.SANS}}>
                Quitar corte
              </button>
            )}
          </div>

          <div style={{fontSize:10.5,color:T.TEXT4,marginTop:12,lineHeight:1.6}}>
            Si lo que buscás es eliminar definitivamente períodos cargados por error, eso se hace desde
            Análisis, período por período, y sí borra los datos.
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        <StatCard label="Contrapartes compartidas" val={compartidas.length} col={T.ACCENT} icon="🔗"
          sub={'Con ' + minLeg + '+ legajos'}/>
        <StatCard label={'Alertas (' + GRAFO.MIN_LEGAJOS_ALERTA + '+ legajos)'} val={conAlerta.length}
          col={conAlerta.length?T.RED:T.GREEN} icon="🚨"/>
        <StatCard label="Legajos en la red" val={new Set(compartidas.reduce(function(a,c){ return a.concat(c.legajos.map(function(l){return l.id;})); },[])).size} col={T.VIOLET} icon="📁"/>
        <StatCard label="Períodos analizados" val={periodosEnRed.filter(function(p){return p.metricas;}).length} col={T.TEXT3} icon="📊"/>
      </div>

      {/* Grafo */}
      {layout ? (
        <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,boxShadow:T.SHADOW.card,padding:14,marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:8,flexWrap:'wrap'}}>
            <span style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS}}>
              Contrapartes en {GRAFO.MIN_LEGAJOS_ALERTA} o más legajos
            </span>
            <span style={{fontSize:10,color:T.TEXT4}}>· clic en un nodo para el detalle</span>
          </div>
          <svg viewBox={'0 0 ' + layout.W + ' ' + layout.H} style={{width:'100%',height:'auto',display:'block'}}>
            {/* Aristas */}
            {layout.aristas.map(function(a,i){
              var act = resaltado && (a.cpId === resaltado);
              return <line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
                stroke={act ? TR.RED : TR.BORDER2} strokeWidth={act ? 2 : 1}
                strokeOpacity={resaltado ? (act ? 0.9 : 0.15) : 0.5}/>;
            })}
            {/* Legajos */}
            {layout.nodosLeg.map(function(n){
              var derecha = Math.cos(n.ang) >= 0;
              return (
                <g key={n.id} style={{cursor:onOpenLegajo?'pointer':'default'}}
                   onClick={function(){ if(onOpenLegajo) onOpenLegajo(n.id); }}>
                  <circle cx={n.x} cy={n.y} r={8} fill={segColorR(n.segmento)} stroke={TR.BG2} strokeWidth={2}/>
                  <text x={n.x + (derecha ? 13 : -13)} y={n.y + 4}
                    textAnchor={derecha ? 'start' : 'end'}
                    style={{fontSize:11,fill:T.TEXT2,fontFamily:'Inter, sans-serif'}}>
                    {(n.label||'').length > 22 ? n.label.slice(0,21)+'…' : n.label}
                  </text>
                </g>
              );
            })}
            {/* Contrapartes */}
            {layout.nodosCp.map(function(n){
              var act = resaltado === n.id;
              var r = 9 + Math.min(9, n.cant * 2);
              return (
                <g key={n.id} style={{cursor:'pointer'}}
                   onMouseEnter={function(){setHover(n.id);}}
                   onMouseLeave={function(){setHover(null);}}
                   onClick={function(){setSelCp(n.ref);}}>
                  <circle cx={n.x} cy={n.y} r={r}
                    fill={n.alerta ? 'rgba(255,68,85,0.85)' : 'rgba(255,184,48,0.85)'}
                    stroke={act ? TR.ON_ACCENT : TR.BG2} strokeWidth={act ? 2 : 1.5}/>
                  <text x={n.x} y={n.y + 4} textAnchor="middle"
                    style={{fontSize:10,fontWeight:700,fill:'#0A0E14',fontFamily:'JetBrains Mono, monospace'}}>{n.cant}</text>
                  {act && (
                    <text x={n.x} y={n.y - r - 7} textAnchor="middle"
                      style={{fontSize:11,fontWeight:600,fill:T.TEXT,fontFamily:'Inter, sans-serif'}}>
                      {(n.label||'').length > 30 ? n.label.slice(0,29)+'…' : n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div style={{display:'flex',gap:16,marginTop:8,fontSize:10,color:T.TEXT4,flexWrap:'wrap'}}>
            <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'rgba(255,68,85,0.85)',marginRight:5}}/>Contraparte compartida — el número es la cantidad de legajos</span>
            <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:T.ACCENT,marginRight:5}}/>Legajo (color por segmento)</span>
          </div>
        </div>
      ) : (
        <div style={{marginBottom:16}}>
          <EmptyState icon="🔗" title={compartidas.length ? 'Ninguna contraparte alcanza el umbral de alerta' : 'Sin contrapartes compartidas'}
            sub={compartidas.length
              ? 'Hay ' + compartidas.length + ' contraparte(s) en 2 legajos, pero el grafo dibuja solo las de ' + GRAFO.MIN_LEGAJOS_ALERTA + ' o más. Están listadas abajo.'
              : 'Se necesitan al menos dos legajos con períodos analizados que compartan alguna contraparte.'}/>
        </div>
      )}

      {/* Tabla */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        <input value={search} onChange={function(e){setSearch(e.target.value);}}
          placeholder="🔍 Buscar por contraparte o cliente…"
          style={Object.assign({},inputSt,{flex:'1 1 240px'})}/>
        <select value={minLeg} onChange={function(e){setMinLeg(Number(e.target.value));}} style={inputSt}>
          <option value={2}>Presente en 2+ legajos</option>
          <option value={3}>Presente en 3+ legajos</option>
          <option value={4}>Presente en 4+ legajos</option>
          <option value={5}>Presente en 5+ legajos</option>
        </select>
      </div>

      {filtradas.length === 0 ? (
        <EmptyState icon="🔍" title="Sin resultados"/>
      ) : (
        <TableCard>
          <thead>
            <tr>
              <SortTh k="cantLegajos" label="Legajos" sortBy={sortBy} onSort={toggleSort} extra={{width:90,textAlign:'right'}}/>
              <SortTh k="label" label="Contraparte" sortBy={sortBy} onSort={toggleSort}/>
              <th style={Object.assign({},TD,{background:T.BG3,position:'sticky',top:0,zIndex:2,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>Clientes</th>
              <SortTh k="montoTotal" label="Volumen" sortBy={sortBy} onSort={toggleSort} extra={{width:120,textAlign:'right'}}/>
              <th style={Object.assign({},TD,{width:110,textAlign:'right',background:T.BG3,position:'sticky',top:0,zIndex:2,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>Caso</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map(function(c){
              var cs = casoDe(c);
              return (
                <tr key={c.clave} onClick={function(){setSelCp(c);}} style={{cursor:'pointer'}}>
                  <td style={Object.assign({},TD,{borderLeft:'3px solid '+(c.alerta?T.RED:T.AMBER),textAlign:'right',fontFamily:T.MONO,fontWeight:700,color:c.alerta?T.RED:T.AMBER})}>{c.cantLegajos}</td>
                  <td style={Object.assign({},TD,{color:T.TEXT,fontWeight:500})}>{c.label}</td>
                  <td style={Object.assign({},TD,{color:T.TEXT3,fontSize:11})}>
                    {c.legajos.map(function(l){return l.nombre;}).join(' · ')}
                  </td>
                  <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,fontSize:11,color:T.TEXT2})}>{fmtM(c.montoTotal)}</td>
                  <td style={Object.assign({},TD,{textAlign:'right'})}>
                    {cs ? (
                      <button onClick={function(e){e.stopPropagation(); if(onVerCaso) onVerCaso(cs.id);}}
                        style={{background:T.ACCENT_SOFT,border:'1px solid '+T.ACCENT_DIM,color:T.ACCENT,borderRadius:T.RADIUS.sm,padding:'2px 8px',cursor:'pointer',fontSize:9,fontWeight:700,fontFamily:T.MONO}}>{cs.ref}</button>
                    ) : <span style={{fontSize:10,color:T.TEXT4}}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      <div style={{fontSize:10,color:T.TEXT4,marginTop:12,lineHeight:1.6,fontFamily:T.SANS}}>
        Las contrapartes se toman de las métricas persistidas de cada período y se normalizan
        (mayúsculas, sin tildes ni puntuación) para agrupar variantes de escritura.
        Umbral de alerta: {GRAFO.MIN_LEGAJOS_ALERTA} legajos — se edita en <span style={{fontFamily:T.MONO}}>src/lib/grafo.js</span>.
      </div>
    </div>
  );
}

export default RedView;
