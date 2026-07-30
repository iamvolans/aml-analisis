import { useState, useEffect, useRef } from "react";
import { SortTh, TableCard, Drawer, EmptyState, StatCard, TD } from "../components/ui";
import { toast, uiConfirm } from "../components/feedback";
import { auditLog } from "../lib/auth";
import { nuevoCaso, refCaso } from "../lib/casos";
import { parseCsv, parseExcelFile } from "../lib/parsers";
import { UMBRALES, correrScreening, filasAEntradas } from "../lib/screening";
import { serverLoadKV, serverSaveKV, serverLoadListas, serverSaveLista, serverDeleteLista, serverLoadRuns, serverLoadRun, serverSaveRun } from "../lib/sync";
import { T } from "../lib/theme";
import { todayStr } from "../lib/utils";

var DESCARTES_KV = 'screening_descartes';
var NIVEL_COL = { ALTA: T.RED, MEDIA: T.AMBER, BAJA: T.TEXT3 };
var NIVEL_ORD = { ALTA: 0, MEDIA: 1, BAJA: 2 };

function ScreeningView(props) {
  var legajos = props.legajos || [];
  var casos = props.casos || [];
  var setCasos = props.setCasos;
  var onSyncCasos = props.onSyncCasos;
  var onVerCaso = props.onVerCaso;
  var currentUser = props.currentUser || {rol:'analista', nombre:'Analista'};

  var tabState = useState('resultados'); var tab=tabState[0]; var setTab=tabState[1];
  var listasState = useState([]); var listas=listasState[0]; var setListas=listasState[1];
  var runState = useState(null); var run=runState[0]; var setRun=runState[1];
  var runsState = useState([]); var runs=runsState[0]; var setRuns=runsState[1];
  var descState = useState({}); var descartes=descState[0]; var setDescartes=descState[1];
  var cargandoState = useState(false); var cargando=cargandoState[0]; var setCargando=cargandoState[1];
  var corriendoState = useState(false); var corriendo=corriendoState[0]; var setCorriendo=corriendoState[1];
  var selHitState = useState(null); var selHit=selHitState[0]; var setSelHit=selHitState[1];
  var motivoState = useState(''); var motivo=motivoState[0]; var setMotivo=motivoState[1];
  var fNivelState = useState('TODOS'); var fNivel=fNivelState[0]; var setFNivel=fNivelState[1];
  var searchState = useState(''); var search=searchState[0]; var setSearch=searchState[1];
  var sortState = useState({k:'score',d:-1}); var sortBy=sortState[0]; var setSortBy=sortState[1];
  var fileRef = useRef(null);

  function toggleSort(k) { setSortBy(function(p){ return p.k===k ? {k:k,d:-p.d} : {k:k,d:1}; }); }

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(function(){
    var vivo = true;
    setCargando(true);
    Promise.all([serverLoadListas(false), serverLoadRuns(), serverLoadKV(DESCARTES_KV)])
      .then(function(r){
        if (!vivo) return;
        setListas(r[0] || []);
        setRuns(r[1] || []);
        setDescartes(r[2] || {});
        setCargando(false);
        // Abrir la última corrida para no arrancar con la pantalla vacía
        if (r[1] && r[1].length) {
          serverLoadRun(r[1][0].id).then(function(full){ if (vivo && full) setRun(full); });
        }
      })
      .catch(function(){ if (vivo) setCargando(false); });
    return function(){ vivo = false; };
  }, []);

  // ── Carga de listado ───────────────────────────────────────────────────────
  async function subirListado(file) {
    if (!file) return;
    try {
      var filas;
      var nombreArch = file.name || 'listado';
      if (/\.(xlsx|xls)$/i.test(nombreArch)) {
        filas = await parseExcelFile(file);
      } else {
        var texto = await file.text();
        if (/^\s*[\[{]/.test(texto)) {
          var json = JSON.parse(texto);
          filas = Array.isArray(json) ? json : (json.datos || json.data || json.registros || []);
        } else {
          filas = parseCsv(texto);
        }
      }
      var entradas = filasAEntradas(filas);
      if (!entradas.length) {
        toast('No se reconoció ninguna entrada. El archivo debe tener una columna de nombre (nombre, denominación, razón social…).');
        return;
      }
      var idLista = (window.prompt('Identificador corto de la lista (ej: repet, ofac, pep_arg):', 'repet') || '').trim().toLowerCase();
      if (!idLista) return;
      var lista = {
        id: idLista,
        nombre: window.prompt('Nombre visible de la lista:', idLista.toUpperCase()) || idLista.toUpperCase(),
        fuente: window.prompt('Fuente / URL oficial de descarga:', '') || '',
        version: nombreArch + ' · cargado ' + todayStr(),
        entradas: entradas,
      };
      var ok = await serverSaveLista(lista);
      if (!ok) { toast('No se pudo guardar la lista.'); return; }
      setListas(function(prev){
        var otras = prev.filter(function(l){ return l.id !== lista.id; });
        return [Object.assign({}, lista, {cantidad: entradas.length, updated_at: new Date().toISOString()})].concat(otras);
      });
      auditLog(currentUser, 'cargar_lista_screening', 'screening', lista.id, { cantidad: entradas.length, version: lista.version });
      toast('✓ ' + entradas.length + ' entradas cargadas en ' + lista.nombre);
    } catch(e) {
      toast('Error leyendo el archivo: ' + e.message);
    }
  }

  async function borrarLista(l) {
    if (!(await uiConfirm('Eliminar la lista "' + l.nombre + '" (' + l.cantidad + ' entradas)?', {danger:true, confirmLabel:'Eliminar'}))) return;
    await serverDeleteLista(l.id);
    setListas(function(prev){ return prev.filter(function(x){ return x.id !== l.id; }); });
  }

  // ── Corrida ────────────────────────────────────────────────────────────────
  async function correr(soloActivos) {
    if (!listas.length) { toast('Cargá al menos un listado antes de correr el screening.'); return; }
    setCorriendo(true);
    // Cede el hilo para que se vea el estado de "corriendo" antes del cálculo
    await new Promise(function(r){ setTimeout(r, 30); });
    try {
      var completas = listas;
      if (completas.some(function(l){ return !l.entradas; })) {
        completas = await serverLoadListas(false);
        setListas(completas);
      }
      var resultado = correrScreening(legajos, completas, descartes, { soloActivos: soloActivos });
      resultado.ejecutadoPor = currentUser.nombre || 'Analista';
      await serverSaveRun(resultado);
      setRun(resultado);
      setRuns(function(prev){
        return [{id:resultado.id, fecha:resultado.fecha, alcance:resultado.alcance, resumen:resultado.resumen}].concat(prev);
      });
      setTab('resultados');
      auditLog(currentUser, 'correr_screening', 'screening', resultado.id, resultado.resumen);
      toast('✓ Screening completo: ' + resultado.resumen.total + ' coincidencia(s) en ' + resultado.legajosEvaluados + ' legajos.');
    } catch(e) {
      toast('Error en la corrida: ' + e.message);
    }
    setCorriendo(false);
  }

  // ── Descartar falso positivo ───────────────────────────────────────────────
  async function descartar(hit, texto) {
    if (!texto || !texto.trim()) { toast('Escribí el motivo del descarte — queda como evidencia.'); return; }
    var nuevos = Object.assign({}, descartes);
    nuevos[hit.clave] = { motivo: texto.trim(), autor: currentUser.nombre || 'Analista', fecha: todayStr() };
    setDescartes(nuevos);
    await serverSaveKV(DESCARTES_KV, nuevos);
    // Sacarlo de la corrida en pantalla
    setRun(function(prev){
      if (!prev) return prev;
      var hits = prev.hits.filter(function(h){ return h.clave !== hit.clave; });
      return Object.assign({}, prev, { hits: hits });
    });
    setSelHit(null); setMotivo('');
    auditLog(currentUser, 'descartar_hit_screening', 'screening', hit.clave, { legajo: hit.legajoNom, entrada: hit.entradaNom, motivo: texto.trim() });
  }

  async function restaurarDescarte(clave) {
    var nuevos = Object.assign({}, descartes);
    delete nuevos[clave];
    setDescartes(nuevos);
    await serverSaveKV(DESCARTES_KV, nuevos);
    toast('Descarte revertido. Va a reaparecer en la próxima corrida.');
  }

  // ── Caso desde hit ─────────────────────────────────────────────────────────
  function casoDe(hit) {
    return casos.find(function(c){ return c.screeningKey === hit.clave; }) || null;
  }
  function abrirCaso(hit) {
    var c = nuevoCaso({
      ref: refCaso(hit.legajoNom, casos.length + 1),
      legajoId: hit.legajoId,
      legajoNom: hit.legajoNom,
      origen: 'SCREENING',
      prioridad: hit.nivel === 'ALTA' ? 'ALTA' : hit.nivel === 'MEDIA' ? 'MEDIA' : 'BAJA',
      titulo: 'Coincidencia en lista: ' + hit.sujeto,
      detalle: 'Sujeto evaluado: ' + hit.sujeto + ' (' + hit.rol + ')\n' +
               'Coincide con: ' + hit.entradaNom + '\n' +
               'Lista: ' + hit.lista + (hit.listaVersion ? ' — ' + hit.listaVersion : '') + '\n' +
               'Criterio: ' + hit.criterio + ' · puntaje ' + hit.score + ' · nivel ' + hit.nivel +
               (hit.entradaDetalle ? '\n\nDetalle de la entrada: ' + hit.entradaDetalle : ''),
      screeningKey: hit.clave,
      analista: currentUser.nombre || 'Analista',
    });
    var lista = casos.concat([c]);
    setCasos(lista); onSyncCasos(lista);
    setSelHit(null);
    auditLog(currentUser, 'crear_caso_screening', 'caso', c.id, { ref: c.ref, hit: hit.clave });
    if (onVerCaso) onVerCaso(c.id);
  }

  // ── Datos derivados ────────────────────────────────────────────────────────
  var hits = (run && run.hits) || [];
  var q = search.trim().toLowerCase();
  var hitsFiltrados = hits.filter(function(h){
    var okN = fNivel==='TODOS' || h.nivel===fNivel;
    var okQ = !q || [h.legajoNom, h.sujeto, h.entradaNom, h.lista].some(function(x){
      return (x||'').toString().toLowerCase().indexOf(q) >= 0;
    });
    return okN && okQ;
  }).sort(function(a,b){
    var k=sortBy.k, d=sortBy.d, va, vb;
    if (k==='score') { va=a.score; vb=b.score; }
    else if (k==='nivel') { va=NIVEL_ORD[a.nivel]; vb=NIVEL_ORD[b.nivel]; }
    else { va=(a[k]||'').toString().toLowerCase(); vb=(b[k]||'').toString().toLowerCase(); }
    return va<vb ? -d : va>vb ? d : 0;
  });

  var totalEntradas = listas.reduce(function(a,l){ return a + (l.cantidad||0); }, 0);
  var clavesDesc = Object.keys(descartes);
  var inputSt = {border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 10px',fontSize:12,color:T.TEXT,fontFamily:T.SANS};

  return (
    <div style={{padding:22}}>

      {/* Drawer de coincidencia */}
      {selHit && (function(){
        var cs = casoDe(selHit);
        return (
          <Drawer width={580} onClose={function(){setSelHit(null);setMotivo('');}}>
            <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10,flexWrap:'wrap'}}>
              <span style={{background:'rgba(255,68,85,0.12)',color:NIVEL_COL[selHit.nivel],border:'1px solid '+NIVEL_COL[selHit.nivel],borderRadius:T.RADIUS.pill,padding:'2px 10px',fontSize:10,fontWeight:700}}>{selHit.nivel}</span>
              <span style={{fontFamily:T.MONO,fontSize:12,fontWeight:700,color:T.TEXT}}>{(selHit.score*100).toFixed(1)}%</span>
              <span style={{fontSize:10,color:T.TEXT3,fontFamily:T.MONO}}>{selHit.criterio}</span>
            </div>

            <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px',marginBottom:12}}>
              <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:8}}>Comparación</div>
              <div style={{marginBottom:9}}>
                <div style={{fontSize:10,color:T.TEXT4}}>En cartera — {selHit.rol}</div>
                <div style={{fontSize:14,color:T.TEXT,fontWeight:600}}>{selHit.sujeto}</div>
                <div style={{fontSize:11,color:T.TEXT3}}>{selHit.legajoNom}</div>
              </div>
              <div style={{borderTop:'1px solid '+T.BORDER,paddingTop:9}}>
                <div style={{fontSize:10,color:T.TEXT4}}>En listado — {selHit.lista}</div>
                <div style={{fontSize:14,color:T.RED,fontWeight:600}}>{selHit.entradaNom}</div>
                {selHit.entradaDetalle ? <div style={{fontSize:11,color:T.TEXT3,marginTop:2}}>{selHit.entradaDetalle}</div> : null}
                {selHit.listaVersion ? <div style={{fontSize:10,color:T.TEXT4,fontFamily:T.MONO,marginTop:3}}>{selHit.listaVersion}</div> : null}
              </div>
            </div>

            {cs ? (
              <div style={{background:T.BG2,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.md,padding:'12px 14px',marginBottom:12}}>
                <div style={{fontSize:11,color:T.TEXT3,marginBottom:7}}>
                  Ya tiene caso abierto: <span style={{fontFamily:T.MONO,color:T.ACCENT,fontWeight:700}}>{cs.ref}</span>
                </div>
                <button onClick={function(){setSelHit(null); if(onVerCaso) onVerCaso(cs.id);}}
                  style={{width:'100%',background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'8px 0',cursor:'pointer',fontWeight:600,fontSize:12,fontFamily:T.SANS}}>
                  Ver el caso →
                </button>
              </div>
            ) : (
              <button onClick={function(){abrirCaso(selHit);}}
                style={{width:'100%',background:'rgba(255,68,85,0.12)',color:T.RED,border:'1px solid rgba(255,68,85,0.35)',borderRadius:T.RADIUS.sm,padding:'10px 0',cursor:'pointer',fontWeight:700,fontSize:12,fontFamily:T.SANS,marginBottom:12}}>
                📁 Abrir caso por esta coincidencia
              </button>
            )}

            <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px'}}>
              <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:8}}>Descartar como falso positivo</div>
              <div style={{fontSize:11,color:T.TEXT3,marginBottom:8,lineHeight:1.5}}>
                El motivo queda registrado y la coincidencia no reaparece en las próximas corridas.
              </div>
              <textarea value={motivo} onChange={function(e){setMotivo(e.target.value);}} rows={3}
                placeholder="Ej: homónimo — CUIT y fecha de nacimiento no coinciden con la entrada del listado."
                style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'8px 10px',fontSize:12,resize:'vertical',lineHeight:1.55,boxSizing:'border-box'}}/>
              <button onClick={function(){descartar(selHit, motivo);}}
                style={{marginTop:8,width:'100%',background:'transparent',color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'8px 0',cursor:'pointer',fontWeight:600,fontSize:12,fontFamily:T.SANS}}>
                Descartar
              </button>
            </div>
          </Drawer>
        );
      })()}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
        <h2 style={{color:T.TEXT,margin:0,fontSize:19,fontWeight:700}}>Screening</h2>
        <div style={{display:'flex',gap:8}}>
          <button onClick={function(){correr(true);}} disabled={corriendo||!listas.length}
            style={{background:corriendo?T.BG3:T.ACCENT_SOFT,color:corriendo?T.TEXT4:T.ACCENT,border:'1px solid '+(corriendo?T.BORDER:T.ACCENT_DIM),borderRadius:T.RADIUS.sm,padding:'7px 13px',cursor:corriendo||!listas.length?'not-allowed':'pointer',fontSize:12,fontWeight:600,fontFamily:T.SANS}}>
            {corriendo ? '⏳ Corriendo…' : '▶ Correr sobre cartera activa'}
          </button>
          <button onClick={function(){correr(false);}} disabled={corriendo||!listas.length}
            style={{background:'transparent',color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 13px',cursor:corriendo||!listas.length?'not-allowed':'pointer',fontSize:12,fontWeight:500,fontFamily:T.SANS}}>
            Cartera completa
          </button>
        </div>
      </div>

      {/* Nota metodológica */}
      <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderLeft:'3px solid '+T.ACCENT,borderRadius:T.RADIUS.md,padding:'11px 14px',marginBottom:14,fontSize:11,color:T.TEXT2,lineHeight:1.6}}>
        El matching corre <strong>localmente y de forma determinística</strong> contra los listados cargados:
        documento exacto, nombre exacto, nombre sin sufijos societarios y aproximación tolerante a tipeos.
        No se consulta ningún servicio externo durante la corrida, y cada resultado es reproducible a partir
        del listado y su versión. Umbrales: ALTA ≥{(UMBRALES.ALTA*100).toFixed(0)}% ·
        MEDIA ≥{(UMBRALES.MEDIA*100).toFixed(0)}% · BAJA ≥{(UMBRALES.BAJA*100).toFixed(0)}%.
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        <StatCard label="Listas cargadas" val={listas.length} col={listas.length?T.ACCENT:T.AMBER} icon="📋"
          sub={totalEntradas ? totalEntradas.toLocaleString('es-AR') + ' entradas' : 'Sin listados'}/>
        <StatCard label="Coincidencias ALTA" val={hits.filter(function(h){return h.nivel==='ALTA';}).length} col={T.RED} icon="🚨"/>
        <StatCard label="A revisar (MEDIA)" val={hits.filter(function(h){return h.nivel==='MEDIA';}).length} col={T.AMBER} icon="🔍"/>
        <StatCard label="Descartadas" val={clavesDesc.length} col={T.TEXT3} icon="✓"/>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:14,background:T.BG3,borderRadius:T.RADIUS.sm+2,padding:4,border:'1px solid '+T.BORDER}}>
        {[['resultados','Resultados'],['listas','Listados ('+listas.length+')'],['historial','Historial ('+runs.length+')'],['descartes','Descartes ('+clavesDesc.length+')']].map(function(t){
          var on = tab===t[0];
          return (
            <button key={t[0]} onClick={function(){setTab(t[0]);}}
              style={{flex:1,padding:'7px 8px',border:'none',borderRadius:T.RADIUS.sm,cursor:'pointer',background:on?T.ACCENT_SOFT:'transparent',fontWeight:on?600:500,fontSize:12,color:on?T.ACCENT:T.TEXT2,fontFamily:T.SANS,transition:T.TRANS}}>
              {t[1]}
            </button>
          );
        })}
      </div>

      {/* ── RESULTADOS ── */}
      {tab==='resultados' && (
        cargando ? <EmptyState icon="⏳" title="Cargando…"/> :
        !run ? <EmptyState icon="🛡" title="Sin corridas todavía" sub={listas.length ? 'Ejecutá una corrida para ver coincidencias.' : 'Primero cargá un listado en la pestaña Listados.'}/> :
        (
          <div>
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:12,flexWrap:'wrap',fontSize:11,color:T.TEXT3}}>
              <span>Corrida del <span style={{fontFamily:T.MONO,color:T.TEXT2}}>{new Date(run.fecha).toLocaleString('es-AR')}</span></span>
              <span>· {run.alcance} · {run.legajosEvaluados} legajos · {run.duracionMs} ms</span>
              {run.ejecutadoPor ? <span>· por {run.ejecutadoPor}</span> : null}
            </div>
            <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
              <input value={search} onChange={function(e){setSearch(e.target.value);}}
                placeholder="🔍 Buscar por cliente, sujeto o entrada del listado…"
                style={Object.assign({},inputSt,{flex:'1 1 240px'})}/>
              <select value={fNivel} onChange={function(e){setFNivel(e.target.value);}} style={inputSt}>
                <option value="TODOS">Todos los niveles</option>
                <option value="ALTA">Solo ALTA</option>
                <option value="MEDIA">Solo MEDIA</option>
                <option value="BAJA">Solo BAJA</option>
              </select>
            </div>
            {hitsFiltrados.length===0 ? (
              <EmptyState icon="✅" title={hits.length ? 'Sin resultados para el filtro' : 'Ninguna coincidencia'}
                sub={hits.length ? '' : 'Ningún sujeto de la cartera coincide con los listados cargados.'}/>
            ) : (
              <TableCard>
                <thead>
                  <tr>
                    <SortTh k="nivel" label="Nivel" sortBy={sortBy} onSort={toggleSort} extra={{width:90}}/>
                    <SortTh k="score" label="Puntaje" sortBy={sortBy} onSort={toggleSort} extra={{width:90,textAlign:'right'}}/>
                    <SortTh k="sujeto" label="Sujeto en cartera" sortBy={sortBy} onSort={toggleSort}/>
                    <SortTh k="entradaNom" label="Entrada del listado" sortBy={sortBy} onSort={toggleSort}/>
                    <SortTh k="legajoNom" label="Legajo" sortBy={sortBy} onSort={toggleSort} extra={{width:170}}/>
                    <SortTh k="lista" label="Lista" sortBy={sortBy} onSort={toggleSort} extra={{width:100}}/>
                    <th style={Object.assign({},TD,{width:110,textAlign:'right',background:T.BG3,position:'sticky',top:0,zIndex:2,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>Caso</th>
                  </tr>
                </thead>
                <tbody>
                  {hitsFiltrados.map(function(h){
                    var col = NIVEL_COL[h.nivel];
                    var cs = casoDe(h);
                    return (
                      <tr key={h.clave} onClick={function(){setSelHit(h);setMotivo('');}} style={{cursor:'pointer'}}>
                        <td style={Object.assign({},TD,{borderLeft:'3px solid '+col})}>
                          <span style={{color:col,fontSize:10,fontWeight:700,fontFamily:T.MONO}}>{h.nivel}</span>
                        </td>
                        <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,fontSize:11,color:T.TEXT2})}>{(h.score*100).toFixed(1)}%</td>
                        <td style={Object.assign({},TD,{color:T.TEXT,fontWeight:500})}>
                          {h.sujeto}
                          <div style={{fontSize:9,color:T.TEXT4}}>{h.rol} · {h.criterio}</div>
                        </td>
                        <td style={Object.assign({},TD,{color:T.RED})}>{h.entradaNom}</td>
                        <td style={Object.assign({},TD,{color:T.TEXT2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:170})}>{h.legajoNom}</td>
                        <td style={Object.assign({},TD,{color:T.TEXT3,fontSize:10,fontFamily:T.MONO})}>{h.lista}</td>
                        <td style={Object.assign({},TD,{textAlign:'right',whiteSpace:'nowrap'})}>
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
          </div>
        )
      )}

      {/* ── LISTADOS ── */}
      {tab==='listas' && (
        <div>
          <div style={{background:T.BG2,border:'1px dashed '+T.BORDER2,borderRadius:T.RADIUS.md,padding:'18px 20px',marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,color:T.TEXT,marginBottom:6}}>Cargar un listado</div>
            <div style={{fontSize:11,color:T.TEXT3,lineHeight:1.6,marginBottom:12}}>
              Acepta CSV, XLSX o JSON. Se reconoce automáticamente la columna de nombre
              (<span style={{fontFamily:T.MONO}}>nombre, denominación, razón social, apellido_y_nombre</span>),
              la de documento (<span style={{fontFamily:T.MONO}}>cuit, cuil, dni, documento</span>) y la de detalle.
              Descargá el archivo del sitio oficial del organismo y subilo tal cual — anotá la fuente para que
              quede registrada en cada corrida.
            </div>
            <input ref={fileRef} type="file" accept=".csv,.json,.xlsx,.xls" style={{display:'none'}}
              onChange={function(e){ var f=e.target.files&&e.target.files[0]; if(f) subirListado(f); e.target.value=''; }}/>
            <button onClick={function(){ if(fileRef.current) fileRef.current.click(); }}
              style={{background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'8px 16px',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:T.SANS}}>
              📁 Elegir archivo
            </button>
          </div>

          {listas.length===0 ? (
            <EmptyState icon="📋" title="Sin listados cargados" sub="Sin al menos un listado no se puede correr el screening."/>
          ) : (
            <TableCard>
              <thead>
                <tr>
                  <th style={Object.assign({},TD,{background:T.BG3,position:'sticky',top:0,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>Lista</th>
                  <th style={Object.assign({},TD,{background:T.BG3,position:'sticky',top:0,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>Fuente</th>
                  <th style={Object.assign({},TD,{background:T.BG3,position:'sticky',top:0,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>Versión</th>
                  <th style={Object.assign({},TD,{width:100,textAlign:'right',background:T.BG3,position:'sticky',top:0,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>Entradas</th>
                  <th style={Object.assign({},TD,{width:70,background:T.BG3,position:'sticky',top:0,borderBottom:'1px solid '+T.BORDER2})}></th>
                </tr>
              </thead>
              <tbody>
                {listas.map(function(l){
                  return (
                    <tr key={l.id}>
                      <td style={Object.assign({},TD,{color:T.TEXT,fontWeight:600})}>{l.nombre}
                        <div style={{fontSize:9,color:T.TEXT4,fontFamily:T.MONO}}>{l.id}</div></td>
                      <td style={Object.assign({},TD,{color:T.TEXT3,fontSize:11,wordBreak:'break-all'})}>{l.fuente||'—'}</td>
                      <td style={Object.assign({},TD,{color:T.TEXT3,fontSize:10,fontFamily:T.MONO})}>{l.version||'—'}</td>
                      <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,fontSize:11,color:T.TEXT2})}>{(l.cantidad||0).toLocaleString('es-AR')}</td>
                      <td style={Object.assign({},TD,{textAlign:'right'})}>
                        <button onClick={function(){borrarLista(l);}}
                          style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.25)',color:T.RED,borderRadius:T.RADIUS.sm,padding:'3px 9px',cursor:'pointer',fontSize:10,fontWeight:600}}>🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
          )}
        </div>
      )}

      {/* ── HISTORIAL ── */}
      {tab==='historial' && (
        runs.length===0 ? <EmptyState icon="🕐" title="Sin corridas registradas"/> : (
          <TableCard>
            <thead>
              <tr>
                {['Fecha','Alcance','ALTA','MEDIA','BAJA','Total',''].map(function(h,i){
                  return <th key={i} style={Object.assign({},TD,{background:T.BG3,position:'sticky',top:0,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2,textAlign:i>=2&&i<=5?'right':'left'})}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {runs.map(function(r){
                var res = r.resumen || {};
                var activa = run && run.id === r.id;
                return (
                  <tr key={r.id} style={{background:activa?T.ACCENT_SOFT:'transparent'}}>
                    <td style={Object.assign({},TD,{fontFamily:T.MONO,fontSize:11,color:T.TEXT2,whiteSpace:'nowrap'})}>{new Date(r.fecha).toLocaleString('es-AR')}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT3,fontSize:11})}>{r.alcance||'—'}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:res.alta?T.RED:T.TEXT4,fontWeight:700})}>{res.alta||0}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:res.media?T.AMBER:T.TEXT4})}>{res.media||0}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:T.TEXT3})}>{res.baja||0}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,color:T.TEXT2})}>{res.total||0}</td>
                    <td style={Object.assign({},TD,{textAlign:'right'})}>
                      <button onClick={function(){ serverLoadRun(r.id).then(function(full){ if(full){setRun(full); setTab('resultados');} }); }}
                        style={{background:T.ACCENT_SOFT,border:'1px solid '+T.ACCENT_DIM,color:T.ACCENT,borderRadius:T.RADIUS.sm,padding:'3px 10px',cursor:'pointer',fontSize:10,fontWeight:600,whiteSpace:'nowrap'}}>Abrir</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )
      )}

      {/* ── DESCARTES ── */}
      {tab==='descartes' && (
        clavesDesc.length===0 ? <EmptyState icon="✓" title="Sin descartes" sub="Las coincidencias que marques como falso positivo aparecen acá."/> : (
          <TableCard>
            <thead>
              <tr>
                {['Coincidencia descartada','Motivo','Analista','Fecha',''].map(function(h,i){
                  return <th key={i} style={Object.assign({},TD,{background:T.BG3,position:'sticky',top:0,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {clavesDesc.map(function(k){
                var d = descartes[k];
                var partes = k.split('::');
                return (
                  <tr key={k}>
                    <td style={Object.assign({},TD,{color:T.TEXT2,fontSize:11})}>{partes[1]||k}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT2,fontSize:11})}>{d.motivo}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT3,fontSize:11})}>{d.autor}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT3,fontFamily:T.MONO,fontSize:10})}>{d.fecha}</td>
                    <td style={Object.assign({},TD,{textAlign:'right'})}>
                      <button onClick={function(){restaurarDescarte(k);}}
                        style={{background:'transparent',border:'1px solid '+T.BORDER2,color:T.TEXT2,borderRadius:T.RADIUS.sm,padding:'3px 10px',cursor:'pointer',fontSize:10,fontWeight:600,whiteSpace:'nowrap'}}>Revertir</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )
      )}
    </div>
  );
}

export default ScreeningView;
