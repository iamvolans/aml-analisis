import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import * as XLSX from "xlsx";
import { Card, SevBadge } from "../components/ui";
import { calcMetricas, calcScoring, detectPatrones } from "../lib/aml";
import { auditLog, puedeAprobar, puedeEditar } from "../lib/auth";
import { parseCsv, parseExcelFile } from "../lib/parsers";
import { genINF02, genNotaDD } from "../lib/reports";
import { APP_TOKEN } from "../lib/session";
import { serverLoadKV, serverLoadTxns, serverSaveKV, serverSaveTxns } from "../lib/sync";
import { C, T } from "../lib/theme";
import { fmtM, safeArr, sevColor, todayStr, uid } from "../lib/utils";

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
    if (onSync) onSync(legajos, periodos);
  }

  // Lazy load txns cuando el período seleccionado no los tiene (dispositivo nuevo)
  var txnsLoadingState = useState(false); var txnsLoading=txnsLoadingState[0]; var setTxnsLoading=txnsLoadingState[1];

  useEffect(function() {
    if (!selPeriodo) return;
    // Cargar txns si no están en memoria (o están vacías)
    if (selPeriodo.txns && selPeriodo.txns.length > 0) return;
    setTxnsLoading(true);
    serverLoadTxns(selPeriodo.id).then(function(txns) {
      if (txns && txns.length > 0) {
        var updatedPer = Object.assign({}, selPeriodo, {txns: txns});
        if (!updatedPer.metricas) {
          var leg = legajos.find(function(l){return l.id===selPeriodo.legajoId;});
          if (leg) {
            var m = calcMetricas(txns, leg);
            var sigs = m ? detectPatrones(m, leg) : [];
            var sc = m ? calcScoring(m, sigs) : null;
            updatedPer = Object.assign({}, updatedPer, {
              metricas: m||null, scoring: sc||null,
              estadoPeriodo: updatedPer.estadoPeriodo||'EN_REVISION',
              sigsResolucion: updatedPer.sigsResolucion||{}
            });
          }
        }
        var updated = props.periodos.map(function(p){
          return p.id === selPeriodo.id ? updatedPer : p;
        });
        props.setPeriodos(updated);
        setSelPeriodo(updatedPer);
        if (!selPeriodo.metricas && updatedPer.metricas) {
          onSync(legajos, updated);
        }
      }
      setTxnsLoading(false);
    }).catch(function(e){
      console.error('[Rebit] Error useEffect txns:', e);
      setTxnsLoading(false);
    });
  }, [selPeriodo && selPeriodo.id]);

  // RFI UI state
  var rfiModeState = useState(null); var rfiMode=rfiModeState[0]; var setRfiMode=rfiModeState[1]; // null | 'nuevo' | rfi_id
  var rfiFormState = useState({asunto:'',refNum:'',contenido:'',autor:'Analista'}); var rfiForm=rfiFormState[0]; var setRfiForm=rfiFormState[1];
  var rfiRespState = useState({contenido:'',tipo:'RESPUESTA',autor:''}); var rfiResp=rfiRespState[0]; var setRfiResp=rfiRespState[1];

  var RFI_ESTADOS = [
    {id:'ENVIADO',    label:'Enviado',        color:T.AMBER, bg:'rgba(255,184,48,0.1)'},
    {id:'RESPONDIDO', label:'Respondido',     color:T.GREEN, bg:'rgba(0,230,118,0.1)'},
    {id:'PARCIAL',    label:'Resp. parcial',  color:T.AMBER, bg:'rgba(255,184,48,0.1)'},
    {id:'SIN_RESP',   label:'Sin respuesta',  color:T.RED, bg:'rgba(255,68,85,0.1)'},
    {id:'CERRADO',    label:'Cerrado',        color:T.TEXT3, bg:T.BG3},
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
    // Si ya tiene txns en memoria, usarlas directamente
    if (p.txns && p.txns.length > 0) { setSelPeriodo(p); return; }
    setSelPeriodo(p);
    // Siempre intentar cargar desde Supabase (con o sin métricas precalculadas)
    setTxnsLoading(true);
    serverLoadTxns(p.id).then(function(txns) {
      if (txns && txns.length > 0) {
        var updatedP = Object.assign({}, p, { txns: txns });
        // Recalcular métricas si no existen o si el período las necesita
        if (!updatedP.metricas) {
          var leg = props.legajos ? props.legajos.find(function(l){return l.id===p.legajoId;}) : null;
          if (leg) {
            var m = calcMetricas(txns, leg);
            var sigs = m ? detectPatrones(m, leg) : [];
            var sc = m ? calcScoring(m, sigs) : null;
            updatedP = Object.assign({}, updatedP, {
              metricas: m||null, scoring: sc||null,
              estadoPeriodo: updatedP.estadoPeriodo||'EN_REVISION',
              sigsResolucion: updatedP.sigsResolucion||{}
            });
          }
        }
        setSelPeriodo(updatedP);
        var updatedAll = periodos.map(function(x){ return x.id===p.id ? updatedP : x; });
        props.setPeriodos(updatedAll);
        // Persistir métricas recalculadas
        if (!p.metricas && updatedP.metricas) {
          onSync(legajos, updatedAll);
        }
      } else {
        // Supabase no devolvió txns — puede ser período nuevo no persistido aún
        console.warn('[Rebit] No se encontraron txns para período', p.id, p.nombre);
      }
      setTxnsLoading(false);
    }).catch(function(e){
      console.error('[Rebit] Error cargando txns:', e);
      setTxnsLoading(false);
    });
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
    // Primero guardar las txns, luego el período con sus métricas
    serverSaveTxns(p.id, csv.txns).then(function(){
      onSync(legajos, updated);
    }).catch(function(e){
      console.error('[Rebit] Error guardando txns:', e);
      onSync(legajos, updated); // guardar el período igual, sin txns
    });
    setSelPeriodo(p); setCsv(null); setPeriodoNombre('');
  }

  var scData = sc ? sc.scores.map(function(f){return{f:f.factor.length>16?f.factor.slice(0,16)+'…':f.factor,s:f.score,fill:f.score>=4?C.ROJO:f.score>=3?C.NARANJA:C.VERDE};}) : [];
  var nota = m ? genNotaDD(selLegajo, selPeriodo, m, sigs, sc) : null;

  return (
    <div style={{padding:22}}>
      <h2 style={{color:T.TEXT,margin:'0 0 16px',fontSize:19,fontWeight:700,}}>Analisis Transaccional — INF-02</h2>
      <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
        <div style={{flex:'1 1 200px'}}>
          <label style={{fontSize:11,color:T.TEXT2,display:'block',marginBottom:3}}>Legajo</label>
          <select value={selLegajo?selLegajo.id:''} onChange={function(e){setSelLegajo(legajos.find(function(l){return l.id===e.target.value;})||null);setSelPeriodo(null);setCsv(null);setTendencias(false);}} style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,color:T.TEXT}}>
            <option value="">— Seleccionar legajo —</option>
            {legajos.map(function(l){return <option key={l.id} value={l.id}>{(l.razonSocial||'Sin nombre')} — {(l.cuit||'CUIT N/D')}</option>;})}
          </select>
        </div>
        {selLegajo && lP.length >= 2 && (
          <div style={{display:'flex',gap:2,background:T.BG3,borderRadius:4,padding:3,flexShrink:0,border:'1px solid '+T.BORDER}}>
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
            }} style={{flex:1,border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,color:T.TEXT}}>
              <option value="">— Seleccionar periodo —</option>
              {lP.map(function(p){
                // Mostrar txns desde metricas si no están en memoria
                var txnCount = (p.txns && p.txns.length > 0)
                  ? p.txns.length
                  : (p.metricas ? p.metricas.totalTxns : 0);
                return <option key={p.id} value={p.id}>{p.nombre} ({txnCount.toLocaleString('es-AR')} txns)</option>;
              })}
            </select>
            {txnsLoading && <span style={{fontSize:11,color:T.CYAN,flexShrink:0,fontFamily:T.MONO}}>// cargando txns...</span>}
            {!txnsLoading && selPeriodo && (!selPeriodo.txns || selPeriodo.txns.length === 0) && selPeriodo.metricas && (
              <span style={{fontSize:10,color:T.AMBER,flexShrink:0,fontFamily:T.MONO}} title="Txns no cargadas en memoria, pero las métricas están disponibles">⚠ cached</span>
            )}
            {selPeriodo && !txnsLoading && (!selPeriodo.txns || selPeriodo.txns.length === 0) && (
              <button
                onClick={function(){ handleSelectPeriodo(Object.assign({},selPeriodo,{txns:[]})); }}
                title="Recargar transacciones desde Supabase"
                style={{background:'rgba(0,212,255,0.1)',border:'1px solid rgba(0,212,255,0.3)',borderRadius:3,padding:'7px 10px',cursor:'pointer',fontSize:11,color:T.CYAN,flexShrink:0,fontFamily:T.MONO}}
              >↺ recargar</button>
            )}
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
          return <div style={{background:T.BG3,border:'1px dashed '+T.BORDER3,borderRadius:6,padding:'30px',textAlign:'center',color:T.TEXT3}}>
            <div style={{fontSize:32,marginBottom:8}}>📊</div>
            <div style={{fontSize:14,fontWeight:600,color:T.TEXT}}>Sin datos de métricas para mostrar tendencias</div>
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
                          <tr key={i} style={{background:alerta?'rgba(255,68,85,0.06)':i%2===0?T.BG3:T.BG2}}>
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
            {selLegajo && safeArr(selLegajo.limitesHistorial).filter(function(x){return x.estado==='VIGENTE';}).length > 0 && (
              <span style={{marginLeft:8,padding:'3px 10px',borderRadius:3,background:'rgba(0,212,255,0.12)',color:T.CYAN,fontSize:10,fontFamily:T.MONO,fontWeight:600,border:'1px solid rgba(0,212,255,0.25)'}}>📈 aumento vigente</span>
            )}
            {/* Estado del período */}
            {(function(){
              var ESTADOS_PERIODO = [
                {id:'EN_REVISION',label:'🔍 En revisión',col:T.CYAN,bg:'rgba(0,212,255,0.1)'},
                {id:'RFI_ENVIADO',label:'📧 RFI enviado',col:T.AMBER,bg:'rgba(255,184,48,0.1)'},
                {id:'CERRADO_SIN_ALERTA',label:'✅ Cerrado — sin alerta',col:T.GREEN,bg:'rgba(0,230,118,0.1)'},
                {id:'CERRADO_CON_ALERTA',label:'🚨 Cerrado — con alerta',col:T.RED,bg:'rgba(255,68,85,0.1)'},
                {id:'ARCHIVADO',label:'📦 Archivado',col:T.TEXT3,bg:T.BG3},
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
          }} style={{background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'8px 16px',cursor:'pointer',fontWeight:700,fontSize:13}}>📄 INF-02</button>
        </div>
        <div style={{display:'flex',gap:2,marginBottom:12,background:T.BG3,borderRadius:4,padding:4,border:'1px solid '+T.BORDER,flexWrap:'wrap'}}>
          {[['metricas','📊 Metricas'],['senales','🚨 Senales'],['scoring','📈 Scoring'],['graficos','📉 Graficos'],['dd','🔍 Nota DD'],['memos','📝 Memos'+(memos.length>0?' ('+memos.length+')':'')],['rfi','📧 RFI'+(rfis.length>0?' ('+rfis.filter(function(r){return r.estado!=='CERRADO';}).length+')':'')]].map(function(t){return(
            <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{flex:1,minWidth:80,padding:'7px 0',border:'none',borderRadius:3,cursor:'pointer',fontWeight:tab===t[0]?700:400,background:tab===t[0]?'rgba(59,109,170,0.25)':'transparent',color:tab===t[0]?T.CYAN:T.TEXT2,fontSize:11,fontFamily:T.MONO}}>{t[1]}</button>
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
                <td style={{padding:'5px 8px',fontWeight:700,color:T.TEXT}}>{r[1]}</td>
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
              <div key={i} style={{padding:'10px 14px',borderLeft:'3px solid '+(resuelta?T.GREEN:propuesta?T.AMBER:sevColor(s.sev)),background:resuelta?'rgba(0,230,118,0.06)':propuesta?'rgba(255,184,48,0.06)':i%2===0?T.BG3:T.BG2,marginBottom:6,borderRadius:'0 4px 4px 0',opacity:resuelta?0.75:1}}>
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
                    style={{background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'9px 18px',cursor:'pointer',fontWeight:600,fontSize:11,fontFamily:T.MONO}}
                  >
                    📋 Generar memo de cumplimiento
                  </button>
                </div>
                {/* Preview de acciones a documentar */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
                  {accionesSugeridas.slice(0,4).map(function(a,i){
                    var col = a.urgencia==='ALTA'?T.RED:a.urgencia==='MEDIA'?T.AMBER:T.GREEN;
                    var bg = a.urgencia==='ALTA'?'rgba(255,68,85,0.1)':a.urgencia==='MEDIA'?'rgba(255,184,48,0.1)':'rgba(0,230,118,0.1)';
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
          <div style={{background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.25)',borderRadius:3,padding:'16px 18px',marginBottom:14}}>
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
                style={{background:newMemo.trim()?C.VERDE:T.BG4,color:'white',border:'none',borderRadius:4,padding:'8px 20px',cursor:newMemo.trim()?'pointer':'not-allowed',fontWeight:700,fontSize:13}}
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
                          {esCompliance && <span style={{background:'rgba(0,212,255,0.15)',color:T.CYAN,borderRadius:2,padding:'1px 7px',fontSize:9,fontWeight:600}}>MEMO COMPLIANCE</span>}
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
              style={{background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'9px 18px',cursor:'pointer',fontWeight:600,fontSize:11,fontFamily:T.MONO}}
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
                <button onClick={crearRfi} disabled={!rfiForm.contenido.trim()} style={{background:rfiForm.contenido.trim()?'#1A4A6B':T.BG4,color:'white',border:'none',borderRadius:4,padding:'8px 20px',cursor:rfiForm.contenido.trim()?'pointer':'not-allowed',fontWeight:700,fontSize:12}}>💾 Registrar RFI</button>
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
                        {rfi.periodoNombre && <span style={{background:'rgba(0,212,255,0.12)',color:T.CYAN,borderRadius:3,padding:'2px 8px',fontSize:10,fontWeight:600}}>{rfi.periodoNombre}</span>}
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
                        return <button key={e.id} onClick={function(){cambiarEstadoRfi(rfi.id,e.id);}} style={{background:isCur?e.bg:'white',color:isCur?e.color:T.TEXT2,borderRadius:8,padding:'2px 10px',cursor:'pointer',fontSize:10,fontWeight:isCur?700:400}}>{e.label}</button>;
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
                          var msgColor = isEnvio?'#1A4A6B':isResp?'#1A6B3A':isCierre?T.TEXT3:'#FF8C00';
                          var msgBg = isEnvio?'rgba(0,212,255,0.08)':isResp?'rgba(0,230,118,0.08)':isCierre?T.BG3:'rgba(255,184,48,0.08)';
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
                                style={{background:rfiResp.contenido.trim()?'#1A4A6B':T.BG4,color:'white',border:'none',borderRadius:4,padding:'8px 20px',cursor:rfiResp.contenido.trim()?'pointer':'not-allowed',fontWeight:700,fontSize:12}}
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

export default AnalisisView;
