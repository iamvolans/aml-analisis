import { useState, useEffect } from "react";
import { SevBadge } from "../components/ui";
import { calcMetricas, detectPatrones } from "../lib/aml";
import { serverLoadKVPrefix } from "../lib/sync";
import { C, T } from "../lib/theme";
import { parseFechaAR, todayStr } from "../lib/utils";

function AlertasView(props) {
  var periodos = props.periodos, legajos = props.legajos;
  var setPeriodos = props.setPeriodos;
  var onNavAnalisis = props.onNavAnalisis; // function(leg, per)
  var currentUser = props.currentUser || {rol:'analista', nombre:'Analista'};

  var tabState = useState('senales'); var tab=tabState[0]; var setTab=tabState[1];
  var justState = useState({}); var justMap=justState[0]; var setJustMap=justState[1]; // {key: texto}

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
  // (desde Supabase KV — ver efecto rfisKV arriba)
  var todosRfis = rfisKV;
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
        <h2 style={{color:T.TEXT,margin:0,fontSize:19,fontWeight:700,}}>Centro de Alertas</h2>
        <span style={{background:totalAlertas>0?'rgba(255,68,85,0.2)':'rgba(0,230,118,0.2)',color:totalAlertas>0?T.RED:T.GREEN,borderRadius:3,padding:'2px 10px',fontSize:10,fontWeight:600,fontFamily:T.MONO}}>
          {totalAlertas > 0 ? totalAlertas+' activas' : '✓ Sin alertas'}
        </span>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,background:T.BG3,borderRadius:3,padding:4,border:'1px solid '+T.BORDER}}>
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
            <div style={{background:T.BG3,border:'1px dashed '+T.BORDER3,borderRadius:8,padding:'30px 20px',textAlign:'center',color:T.TEXT3}}>
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
            <div style={{background:T.BG3,border:'1px dashed '+T.BORDER3,borderRadius:8,padding:'30px 20px',textAlign:'center',color:T.TEXT3}}>
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
                              <span style={{background:'rgba(255,184,48,0.15)',color:T.AMBER,borderRadius:2,padding:'1px 8px',fontSize:11,fontWeight:700}}>día {dias} de 7</span>
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
            <div style={{background:T.BG3,border:'1px dashed '+T.BORDER3,borderRadius:8,padding:'30px 20px',textAlign:'center',color:T.TEXT3}}>
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

export default AlertasView;
