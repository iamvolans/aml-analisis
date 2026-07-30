import { useState, useEffect } from "react";
import { SevBadge, SortTh, TableCard, Drawer, EmptyState, TD } from "../components/ui";
import { nuevoCaso, refCaso } from "../lib/casos";
import { senalesActivas } from "../lib/aml";
import { serverLoadKVPrefix } from "../lib/sync";
import { T } from "../lib/theme";
import { parseFechaAR, sevColor, todayStr } from "../lib/utils";

// ── Filtros persistentes en la sesión (mismo patrón que Legajos) ─────────────
var FILTROS_KEY = 'rebit_alertas_filtros_v3';
function leerFiltros() {
  try { var raw = window.sessionStorage.getItem(FILTROS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch(e) { return {}; }
}
function guardarFiltros(f) {
  try { window.sessionStorage.setItem(FILTROS_KEY, JSON.stringify(f)); } catch(e) {}
}

var SEV_ORD = { ALTA:0, MEDIA:1, BAJA:2 };

function AlertasView(props) {
  var periodos = props.periodos, legajos = props.legajos;
  var setPeriodos = props.setPeriodos;
  var onNavAnalisis = props.onNavAnalisis; // function(leg, per)
  var currentUser = props.currentUser || {rol:'analista', nombre:'Analista'};
  var casos = props.casos || [];
  var setCasos = props.setCasos;
  var onSyncCasos = props.onSyncCasos;
  var onVerCaso = props.onVerCaso;

  // Índice de casos ya abiertos por (período, patrón) — vínculo señal ↔ caso
  var casoPorSenal = {};
  casos.forEach(function(c){
    if (c.periodoId && c.pat) casoPorSenal[c.periodoId + '::' + c.pat] = c;
  });
  function casoDe(s) { return casoPorSenal[s.periodoId + '::' + s.pat] || null; }

  function abrirCasoDesdeSenal(s) {
    if (!setCasos || !onSyncCasos) return;
    var c = nuevoCaso({
      ref: refCaso(s.legajoNom, casos.length + 1),
      legajoId: s.legajoId,
      legajoNom: s.legajoNom,
      origen: 'SENAL',
      prioridad: s.sev === 'ALTA' ? 'ALTA' : s.sev === 'MEDIA' ? 'MEDIA' : 'BAJA',
      titulo: s.titulo,
      detalle: s.desc + (s.tip ? '\n\nAcción sugerida: ' + s.tip : ''),
      periodoId: s.periodoId,
      periodoNom: s.periodoNom,
      pat: s.pat,
      sev: s.sev,
      fechaOperacion: (s.per && s.per.createdAt) || '',
      analista: currentUser.nombre || 'Analista',
    });
    var lista = casos.concat([c]);
    setCasos(lista);
    onSyncCasos(lista);
    setSelSigKey(null);
    if (onVerCaso) onVerCaso(c.id);
  }

  var tabState = useState(function(){ return leerFiltros().tab || 'senales'; }); var tab=tabState[0]; var setTab=tabState[1];
  var justState = useState({}); var justMap=justState[0]; var setJustMap=justState[1]; // {key: texto}

  // Filtros y orden
  var searchState = useState(function(){ return leerFiltros().search || ''; }); var search=searchState[0]; var setSearch=searchState[1];
  var fSevState = useState(function(){ return leerFiltros().sev || 'TODAS'; }); var fSev=fSevState[0]; var setFSev=fSevState[1];
  var fLegState = useState(function(){ return leerFiltros().leg || 'TODOS'; }); var fLeg=fLegState[0]; var setFLeg=fLegState[1];
  var fRfiState = useState(function(){ return leerFiltros().rfi || 'TODOS'; }); var fRfi=fRfiState[0]; var setFRfi=fRfiState[1];
  var sortState = useState(function(){
    return leerFiltros().sort || { senales:{k:'sev',d:1}, rfis:{k:'dias',d:-1}, analisis:{k:'dias',d:-1} };
  });
  var sortMap=sortState[0]; var setSortMap=sortState[1];
  var sortBy = sortMap[tab] || {k:'sev',d:1};
  function toggleSort(k) {
    setSortMap(function(prev){
      var cur = prev[tab] || {};
      var next = Object.assign({}, prev);
      next[tab] = cur.k === k ? {k:k, d:-cur.d} : {k:k, d:1};
      return next;
    });
  }

  useEffect(function() {
    guardarFiltros({ tab:tab, search:search, sev:fSev, leg:fLeg, rfi:fRfi, sort:sortMap });
  }, [tab, search, fSev, fLeg, fRfi, sortMap]);

  // Señal abierta en el drawer
  var selSigState = useState(null); var selSigKey=selSigState[0]; var setSelSigKey=selSigState[1];

  // RFIs de TODOS los legajos — cargados desde Supabase KV ('rfi_<legajoId>') en
  // una sola query. Reemplaza el loop muerto de localStorage que dejaba la
  // pestaña de RFIs vencidos siempre en cero.
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
          acc.push(Object.assign({}, rfi, { legajoNombre: (leg && leg.razonSocial) || 'N/D', legajoId: legId, leg: leg }));
        });
      });
      setRfisKV(acc);
    });
    return function() { cancelado = true; };
  }, [legajos.length]);

  var hoy = new Date(); hoy.setHours(0,0,0,0);

  // ── 1. SEÑALES ACTIVAS — desde metricas guardadas (no requiere txns en memoria) ──
  var allSigs = [];
  periodos.forEach(function(p) {
    var leg = legajos.find(function(l){return l.id===p.legajoId;});
    senalesActivas(p, leg, periodos).forEach(function(s) {
      allSigs.push(Object.assign({}, s, {
        key: p.id + '_' + s.pat,
        legajoNom: (leg&&leg.razonSocial)||'N/D',
        legajoId:  p.legajoId,
        periodoId: p.id,
        periodoNom: p.nombre,
        leg: leg,
        per: p,
      }));
    });
  });

  // ── 2. RFIs VENCIDOS ─────────────────────────────────────────────────────────
  var todosRfis = rfisKV;
  var rfisAbiertos = todosRfis.filter(function(r){
    return !(r.estado==='CERRADO'||r.estado==='RESPONDIDO');
  }).map(function(r){
    var f = parseFechaAR(r.createdAt);
    var dias = f ? Math.floor((hoy-f)/86400000) : 0;
    return Object.assign({}, r, { dias: dias, vencido: dias > 7, porVencer: dias >= 5 && dias <= 7 });
  }).filter(function(r){ return r.vencido || r.porVencer; });

  var rfisVencidos = rfisAbiertos.filter(function(r){return r.vencido;});
  var rfisProximos = rfisAbiertos.filter(function(r){return r.porVencer;});

  // ── 3. PERÍODOS SIN ANALIZAR ─────────────────────────────────────────────────
  var sinAnalizar = [];
  legajos.forEach(function(l){
    var lPers = periodos.filter(function(p){return p.legajoId===l.id;});
    if (lPers.length === 0) {
      var alta = parseFechaAR(l.createdAt);
      var diasSinAnalisis = alta ? Math.floor((hoy-alta)/86400000) : 0;
      var limDias = l.segmento==='ALTO'?30:l.segmento==='MEDIO-ALTO'?60:90;
      if (diasSinAnalisis > limDias) {
        sinAnalizar.push({legajoNom:l.razonSocial, legajoId:l.id, leg:l, dias:diasSinAnalisis, limite:limDias, tipo:'sin_periodos'});
      }
    } else {
      var conMetricas = lPers.filter(function(p){return p.metricas||p.txns&&p.txns.length;});
      if (conMetricas.length === 0) {
        sinAnalizar.push({legajoNom:l.razonSocial, legajoId:l.id, leg:l, dias:0, limite:0, tipo:'sin_metricas'});
      }
    }
  });

  // ── Resolver señal ───────────────────────────────────────────────────────────
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
    var newMap = Object.assign({}, justMap);
    delete newMap[sig.periodoId+'_'+sig.pat];
    setJustMap(newMap);
    setSelSigKey(null);
  }

  // ── Filtrado y orden ─────────────────────────────────────────────────────────
  var q = search.trim().toLowerCase();
  function matchTexto() {
    var partes = Array.prototype.slice.call(arguments);
    if (!q) return true;
    return partes.some(function(x){ return (x||'').toString().toLowerCase().indexOf(q) >= 0; });
  }
  function cmp(va, vb, d) { return va < vb ? -d : va > vb ? d : 0; }

  var sigsFiltradas = allSigs.filter(function(s){
    return (fSev==='TODAS' || s.sev===fSev)
      && (fLeg==='TODOS' || s.legajoId===fLeg)
      && matchTexto(s.pat, s.legajoNom, s.titulo, s.periodoNom);
  }).sort(function(a,b){
    var k=sortBy.k, d=sortBy.d;
    if (k==='sev') return cmp(SEV_ORD[a.sev]!==undefined?SEV_ORD[a.sev]:9, SEV_ORD[b.sev]!==undefined?SEV_ORD[b.sev]:9, d);
    return cmp((a[k]||'').toString().toLowerCase(), (b[k]||'').toString().toLowerCase(), d);
  });

  var rfisFiltrados = rfisAbiertos.filter(function(r){
    var estadoOk = fRfi==='TODOS' || (fRfi==='VENCIDO' ? r.vencido : r.porVencer);
    return estadoOk
      && (fLeg==='TODOS' || r.legajoId===fLeg)
      && matchTexto(r.refNum, r.legajoNombre, r.asunto);
  }).sort(function(a,b){
    var k=sortBy.k, d=sortBy.d;
    if (k==='dias') return cmp(a.dias, b.dias, d);
    return cmp((a[k]||'').toString().toLowerCase(), (b[k]||'').toString().toLowerCase(), d);
  });

  var sinAnalizarFiltrados = sinAnalizar.filter(function(x){
    return (fLeg==='TODOS' || x.legajoId===fLeg) && matchTexto(x.legajoNom);
  }).sort(function(a,b){
    var k=sortBy.k, d=sortBy.d;
    if (k==='dias') return cmp(a.dias, b.dias, d);
    return cmp((a[k]||'').toString().toLowerCase(), (b[k]||'').toString().toLowerCase(), d);
  });

  var TAB_COUNTS = [
    ['senales',  '🚨 Señales',        allSigs.length],
    ['rfis',     '📧 RFIs vencidos',  rfisAbiertos.length],
    ['analisis', '⏱ Sin analizar',   sinAnalizar.length],
  ];
  var totalAlertas = allSigs.length + rfisVencidos.length + sinAnalizar.length;

  var selSig = sigsFiltradas.find(function(s){return s.key===selSigKey;})
            || allSigs.find(function(s){return s.key===selSigKey;});

  var inputSt = {border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'7px 10px',fontSize:12,color:T.TEXT,fontFamily:T.SANS};
  var hayFiltro = search || fSev!=='TODAS' || fLeg!=='TODOS' || fRfi!=='TODOS';

  return (
    <div style={{padding:22}}>

      {/* ══ DRAWER DE SEÑAL ══════════════════════════════════════════════════ */}
      {selSig && (
        <Drawer onClose={function(){setSelSigKey(null);}}>
          <div style={{display:'flex',alignItems:'center',gap:9,flexWrap:'wrap',marginBottom:10}}>
            <span style={{fontFamily:T.MONO,fontSize:13,fontWeight:700,color:T.ACCENT}}>{selSig.pat}</span>
            <SevBadge sev={selSig.sev}/>
          </div>
          <h3 style={{margin:'0 0 6px',fontSize:17,fontWeight:700,color:T.TEXT,lineHeight:1.3}}>{selSig.titulo}</h3>
          <div style={{fontSize:12,color:T.TEXT3,fontFamily:T.SANS,marginBottom:16}}>
            {selSig.legajoNom} · {selSig.periodoNom}
          </div>

          <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderLeft:'3px solid '+sevColor(selSig.sev),borderRadius:T.RADIUS.md,padding:'14px 16px',marginBottom:14}}>
            <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:6}}>Descripción</div>
            <div style={{fontSize:13,color:T.TEXT2,lineHeight:1.6}}>{selSig.desc}</div>
          </div>

          {selSig.tip ? (
            <div style={{background:'rgba(61,126,255,0.06)',border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.md,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:10,color:T.ACCENT,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:6}}>Acción sugerida</div>
              <div style={{fontSize:13,color:T.TEXT2,lineHeight:1.6}}>{selSig.tip}</div>
            </div>
          ) : null}

          <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px',marginBottom:14}}>
            <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:8}}>Justificación para resolver</div>
            <textarea
              value={justMap[selSig.key]||''}
              onChange={function(e){var mm=Object.assign({},justMap); mm[selSig.key]=e.target.value; setJustMap(mm);}}
              rows={4}
              placeholder="Describí por qué se resuelve esta señal. Queda registrado en el legajo como evidencia de auditoría."
              style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'9px 11px',fontSize:12,resize:'vertical',lineHeight:1.6,boxSizing:'border-box'}}
            />
            <button
              onClick={function(){resolverSenal(selSig, justMap[selSig.key]);}}
              style={{marginTop:10,width:'100%',background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:T.RADIUS.sm,padding:'9px 0',cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:T.SANS}}>
              ✓ Resolver señal
            </button>
          </div>

          {(function(){
            var cs = casoDe(selSig);
            if (cs) {
              return (
                <div style={{background:T.BG2,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.md,padding:'12px 14px',marginBottom:12}}>
                  <div style={{fontSize:11,color:T.TEXT3,marginBottom:7}}>
                    Esta señal ya tiene un caso abierto: <span style={{fontFamily:T.MONO,color:T.ACCENT,fontWeight:700}}>{cs.ref}</span>
                  </div>
                  <button onClick={function(){setSelSigKey(null); if(onVerCaso) onVerCaso(cs.id);}}
                    style={{width:'100%',background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'8px 0',cursor:'pointer',fontWeight:600,fontSize:12,fontFamily:T.SANS}}>
                    Ver el caso →
                  </button>
                </div>
              );
            }
            if (!setCasos) return null;
            return (
              <button onClick={function(){abrirCasoDesdeSenal(selSig);}}
                style={{width:'100%',background:'rgba(255,184,48,0.14)',color:T.AMBER,border:'1px solid rgba(255,184,48,0.35)',borderRadius:T.RADIUS.sm,padding:'9px 0',cursor:'pointer',fontWeight:700,fontSize:12,fontFamily:T.SANS,marginBottom:12}}>
                📁 Abrir caso desde esta señal
              </button>
            );
          })()}

          {onNavAnalisis && selSig.leg && selSig.per && (
            <button onClick={function(){setSelSigKey(null);onNavAnalisis(selSig.leg, selSig.per);}}
              style={{width:'100%',background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'9px 0',cursor:'pointer',fontWeight:600,fontSize:12,fontFamily:T.SANS}}>
              Ver período completo →
            </button>
          )}
        </Drawer>
      )}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <h2 style={{color:T.TEXT,margin:0,fontSize:19,fontWeight:700}}>Centro de Alertas</h2>
        <span style={{background:totalAlertas>0?'rgba(255,68,85,0.16)':'rgba(0,230,118,0.16)',color:totalAlertas>0?T.RED:T.GREEN,borderRadius:T.RADIUS.pill,padding:'2px 11px',fontSize:10,fontWeight:700,fontFamily:T.MONO}}>
          {totalAlertas > 0 ? totalAlertas+' activas' : '✓ Sin alertas'}
        </span>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:14,background:T.BG3,borderRadius:T.RADIUS.sm+2,padding:4,border:'1px solid '+T.BORDER}}>
        {TAB_COUNTS.map(function(t){
          var on = tab===t[0];
          return (
            <button key={t[0]} onClick={function(){setTab(t[0]);}}
              style={{flex:1,padding:'7px 8px',border:'none',borderRadius:T.RADIUS.sm,cursor:'pointer',
                background:on?T.ACCENT_SOFT:'transparent',
                fontWeight:on?600:500,fontSize:12,color:on?T.ACCENT:T.TEXT2,fontFamily:T.SANS,
                transition:T.TRANS}}>
              {t[1]}
              {t[2]>0 && <span style={{marginLeft:6,background:on?T.ACCENT:T.BORDER3,color:on?'#FFFFFF':T.TEXT2,borderRadius:T.RADIUS.pill,padding:'0 7px',fontSize:10,fontWeight:700,fontFamily:T.MONO}}>{t[2]}</span>}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <input value={search} onChange={function(e){setSearch(e.target.value);}}
          placeholder="🔍 Buscar por patrón, cliente, asunto…"
          style={Object.assign({},inputSt,{flex:'1 1 240px'})}/>
        {tab==='senales' && (
          <select value={fSev} onChange={function(e){setFSev(e.target.value);}} style={inputSt}>
            <option value="TODAS">Todas las severidades</option>
            <option value="ALTA">ALTA</option>
            <option value="MEDIA">MEDIA</option>
            <option value="BAJA">BAJA</option>
          </select>
        )}
        {tab==='rfis' && (
          <select value={fRfi} onChange={function(e){setFRfi(e.target.value);}} style={inputSt}>
            <option value="TODOS">Vencidos y por vencer</option>
            <option value="VENCIDO">Solo vencidos</option>
            <option value="POR_VENCER">Solo por vencer</option>
          </select>
        )}
        <select value={fLeg} onChange={function(e){setFLeg(e.target.value);}} style={inputSt}>
          <option value="TODOS">Todos los clientes</option>
          {legajos.map(function(l){return <option key={l.id} value={l.id}>{l.razonSocial||'Sin nombre'}</option>;})}
        </select>
        {hayFiltro && (
          <button onClick={function(){setSearch('');setFSev('TODAS');setFLeg('TODOS');setFRfi('TODOS');}}
            style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.sm,padding:'7px 11px',cursor:'pointer',fontSize:12,color:T.TEXT2,fontFamily:T.SANS}}>✕ Limpiar</button>
        )}
      </div>

      {/* ── TAB: SEÑALES ── */}
      {tab==='senales' && (
        allSigs.length===0 ? (
          <EmptyState icon="✅" title="Sin señales activas" sub="Todos los períodos analizados están sin alertas pendientes."/>
        ) : sigsFiltradas.length===0 ? (
          <EmptyState icon="🔍" title="Sin resultados" sub="Ninguna señal coincide con los filtros aplicados."/>
        ) : (
          <TableCard>
            <thead>
              <tr>
                <SortTh k="sev" label="Sev." sortBy={sortBy} onSort={toggleSort} extra={{width:86}}/>
                <SortTh k="pat" label="Patrón" sortBy={sortBy} onSort={toggleSort} extra={{width:86}}/>
                <SortTh k="titulo" label="Señal" sortBy={sortBy} onSort={toggleSort}/>
                <SortTh k="legajoNom" label="Cliente" sortBy={sortBy} onSort={toggleSort} extra={{width:200}}/>
                <SortTh k="periodoNom" label="Período" sortBy={sortBy} onSort={toggleSort} extra={{width:150}}/>
                <th style={Object.assign({},TD,{width:130,background:T.BG3,position:'sticky',top:0,zIndex:2,color:T.TEXT3,fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER2})}>Caso</th>
              </tr>
            </thead>
            <tbody>
              {sigsFiltradas.map(function(s){
                return (
                  <tr key={s.key} onClick={function(){setSelSigKey(s.key);}}
                    style={{cursor:'pointer',background:selSigKey===s.key?T.ACCENT_SOFT:'transparent',transition:T.TRANS}}>
                    <td style={Object.assign({},TD,{borderLeft:'3px solid '+sevColor(s.sev)})}><SevBadge sev={s.sev}/></td>
                    <td style={Object.assign({},TD,{fontFamily:T.MONO,fontSize:11,color:T.ACCENT,fontWeight:600})}>{s.pat}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT,fontWeight:500})}>{s.titulo}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:200})}>{s.legajoNom}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT3,fontFamily:T.MONO,fontSize:11})}>{s.periodoNom}</td>
                    <td style={Object.assign({},TD,{whiteSpace:'nowrap'})}>
                      {(function(){
                        var cs = casoDe(s);
                        if (!cs) return <span style={{fontSize:10,color:T.TEXT4}}>—</span>;
                        return (
                          <button onClick={function(e){e.stopPropagation(); if(onVerCaso) onVerCaso(cs.id);}}
                            title={'Ver ' + cs.ref}
                            style={{background:T.ACCENT_SOFT,border:'1px solid '+T.ACCENT_DIM,color:T.ACCENT,borderRadius:T.RADIUS.sm,padding:'2px 8px',cursor:'pointer',fontSize:9,fontWeight:700,fontFamily:T.MONO}}>
                            {cs.ref}
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )
      )}

      {/* ── TAB: RFIs ── */}
      {tab==='rfis' && (
        rfisAbiertos.length===0 ? (
          <EmptyState icon="📧" title="Sin RFIs vencidos o próximos a vencer"/>
        ) : rfisFiltrados.length===0 ? (
          <EmptyState icon="🔍" title="Sin resultados" sub="Ningún RFI coincide con los filtros aplicados."/>
        ) : (
          <TableCard>
            <thead>
              <tr>
                <SortTh k="refNum" label="Referencia" sortBy={sortBy} onSort={toggleSort} extra={{width:180}}/>
                <SortTh k="legajoNombre" label="Cliente" sortBy={sortBy} onSort={toggleSort} extra={{width:200}}/>
                <SortTh k="asunto" label="Asunto" sortBy={sortBy} onSort={toggleSort}/>
                <SortTh k="dias" label="Días" sortBy={sortBy} onSort={toggleSort} extra={{width:130,textAlign:'right'}}/>
                <th style={Object.assign({},TD,{width:120,textAlign:'right',background:T.BG3,position:'sticky',top:0,zIndex:2,borderBottom:'1px solid '+T.BORDER2})}></th>
              </tr>
            </thead>
            <tbody>
              {rfisFiltrados.map(function(r,i){
                var col = r.vencido ? T.RED : T.AMBER;
                return (
                  <tr key={r.id||i}>
                    <td style={Object.assign({},TD,{borderLeft:'3px solid '+col,fontFamily:T.MONO,fontSize:11,color:T.ACCENT,fontWeight:600})}>{r.refNum||'RFI'}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT,fontWeight:500})}>{r.legajoNombre}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT2})}>{r.asunto||'Sin asunto'}</td>
                    <td style={Object.assign({},TD,{textAlign:'right',whiteSpace:'nowrap'})}>
                      <span style={{background:r.vencido?'rgba(255,68,85,0.14)':'rgba(255,184,48,0.14)',color:col,border:'1px solid '+(r.vencido?'rgba(255,68,85,0.35)':'rgba(255,184,48,0.35)'),borderRadius:T.RADIUS.pill,padding:'2px 9px',fontSize:10,fontWeight:700,fontFamily:T.MONO}}>
                        {r.vencido ? r.dias+' d vencido' : 'día '+r.dias+' de 7'}
                      </span>
                    </td>
                    <td style={Object.assign({},TD,{textAlign:'right'})}>
                      {onNavAnalisis && r.leg && (
                        <button onClick={function(){
                          var perAsoc = periodos.find(function(p){return p.legajoId===r.legajoId;});
                          onNavAnalisis(r.leg, perAsoc||null);
                        }} style={{background:T.ACCENT_SOFT,border:'1px solid '+T.ACCENT_DIM,color:T.ACCENT,borderRadius:T.RADIUS.sm,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap',fontFamily:T.SANS}}>
                          Ver legajo →
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )
      )}

      {/* ── TAB: SIN ANALIZAR ── */}
      {tab==='analisis' && (
        sinAnalizar.length===0 ? (
          <EmptyState icon="⏱" title="Todos los clientes tienen análisis reciente"/>
        ) : sinAnalizarFiltrados.length===0 ? (
          <EmptyState icon="🔍" title="Sin resultados" sub="Ningún cliente coincide con los filtros aplicados."/>
        ) : (
          <TableCard>
            <thead>
              <tr>
                <SortTh k="legajoNom" label="Cliente" sortBy={sortBy} onSort={toggleSort} extra={{width:230}}/>
                <SortTh k="tipo" label="Motivo" sortBy={sortBy} onSort={toggleSort}/>
                <SortTh k="dias" label="Días / límite" sortBy={sortBy} onSort={toggleSort} extra={{width:150,textAlign:'right'}}/>
                <th style={Object.assign({},TD,{width:150,textAlign:'right',background:T.BG3,position:'sticky',top:0,zIndex:2,borderBottom:'1px solid '+T.BORDER2})}></th>
              </tr>
            </thead>
            <tbody>
              {sinAnalizarFiltrados.map(function(item,i){
                return (
                  <tr key={item.legajoId||i}>
                    <td style={Object.assign({},TD,{borderLeft:'3px solid '+T.AMBER,color:T.TEXT,fontWeight:600})}>{item.legajoNom}</td>
                    <td style={Object.assign({},TD,{color:T.TEXT2})}>
                      {item.tipo==='sin_periodos'
                        ? 'Sin períodos cargados desde el alta'
                        : 'Tiene períodos pero sin métricas calculadas — falta cargar el archivo'}
                    </td>
                    <td style={Object.assign({},TD,{textAlign:'right',fontFamily:T.MONO,fontSize:11,color:T.AMBER,whiteSpace:'nowrap'})}>
                      {item.tipo==='sin_periodos'
                        ? item.dias + ' / ' + item.limite + ' d'
                        : '—'}
                      {item.tipo==='sin_periodos' && <div style={{fontSize:9,color:T.TEXT4}}>segmento {(item.leg&&item.leg.segmento)||'N/D'}</div>}
                    </td>
                    <td style={Object.assign({},TD,{textAlign:'right'})}>
                      {onNavAnalisis && item.leg && (
                        <button onClick={function(){onNavAnalisis(item.leg, null);}}
                          style={{background:T.ACCENT_SOFT,border:'1px solid '+T.ACCENT_DIM,color:T.ACCENT,borderRadius:T.RADIUS.sm,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap',fontFamily:T.SANS}}>
                          Cargar período →
                        </button>
                      )}
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

export default AlertasView;
