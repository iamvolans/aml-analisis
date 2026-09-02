import { useState, useEffect } from "react";
import { SevBadge, SortTh, TableCard, Drawer, EmptyState, TD } from "../components/ui";
import { toast, uiConfirm } from "../components/feedback";
import { auditLog, puedeAprobar } from "../lib/auth";
import { nuevoCaso, refCaso } from "../lib/casos";
import { senalesActivas, claveResolucion, periodosDuplicados } from "../lib/aml";
import { serverLoadKVPrefix } from "../lib/sync";
import { uid } from "../lib/utils";
import { T } from "../lib/theme";
import { parseFechaAR, sevColor, todayStr } from "../lib/utils";

// ── Filtros persistentes en la sesión (mismo patrón que Legajos) ─────────────
var FILTROS_KEY = 'goat_alertas_filtros_v3';
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

  // ── Regularización masiva ──────────────────────────────────────────────────
  // Alertas que fueron efectivamente resueltas fuera del sistema, contra
  // documentación recibida del cliente, y que quedaron abiertas por no haberse
  // asentado. Cerrarlas de a una es inviable cuando son cientos.
  //
  // El registro NO simula un análisis individual: cada resolución queda marcada
  // como regularización masiva, con su lote, su fundamento y dónde se encuentra
  // el respaldo. Un revisor tiene que poder distinguirlas de un análisis caso a
  // caso, porque no lo son.
  var masivoState = useState(false); var verMasivo=masivoState[0]; var setVerMasivo=masivoState[1];
  var mSelState = useState([]); var mSel=mSelState[0]; var setMSel=mSelState[1];
  var mFundState = useState(''); var mFund=mFundState[0]; var setMFund=mFundState[1];
  var mRespState = useState(''); var mResp=mRespState[0]; var setMResp=mRespState[1];
  var mHastaState = useState(''); var mHasta=mHastaState[0]; var setMHasta=mHastaState[1];

  function toggleMasivo(clave) {
    setMSel(function(prev){
      return prev.indexOf(clave) >= 0 ? prev.filter(function(x){return x!==clave;}) : prev.concat([clave]);
    });
  }

  async function regularizarSeleccionadas(lista) {
    if (!lista.length) { toast('No seleccionaste ninguna alerta.'); return; }
    if (!mFund.trim()) { toast('El fundamento es obligatorio: queda como evidencia de por qué se cierran.'); return; }
    if (!mResp.trim()) { toast('Indicá dónde se encuentra la documentación de respaldo.'); return; }

    if (!(await uiConfirm(
      'Se van a cerrar ' + lista.length + ' alerta(s) como REGULARIZACIÓN MASIVA.\n\n' +
      'Cada una queda asentada como cierre por lote, no como análisis individual, con el ' +
      'fundamento y la ubicación del respaldo que indicaste.\n\n' +
      'La acción queda registrada en la auditoría y es reversible señal por señal.',
      {danger:true, confirmLabel:'Cerrar ' + lista.length + ' alerta(s)'}))) return;

    var lote = 'REG-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' +
               Math.random().toString(36).slice(2,6).toUpperCase();
    var porPeriodo = {};
    lista.forEach(function(h){
      if (!porPeriodo[h.periodoId]) porPeriodo[h.periodoId] = [];
      porPeriodo[h.periodoId].push(h);
    });

    var updated = periodos.map(function(p){
      var delP = porPeriodo[p.id];
      if (!delP) return p;
      var newRes = Object.assign({}, p.sigsResolucion || {});
      delP.forEach(function(h){
        newRes[claveResolucion(h)] = {
          estado: 'RESUELTA',
          explicacion: mFund.trim(),
          respaldo: mResp.trim(),
          lote: lote,
          regularizacionMasiva: true,
          aprobadoPor: currentUser.nombre || 'Analista',
          aprobadoAt: todayStr(),
        };
      });
      return Object.assign({}, p, { sigsResolucion: newRes });
    });

    setPeriodos(updated);
    setMSel([]); setVerMasivo(false); setMFund(''); setMResp(''); setMHasta('');
    auditLog(currentUser, 'regularizacion_masiva_senales', 'alertas', lote, {
      lote: lote, cantidad: lista.length,
      periodos: Object.keys(porPeriodo).length,
      fundamento: mFund.trim(), respaldo: mResp.trim()
    });
    toast('✓ ' + lista.length + ' alerta(s) regularizadas — lote ' + lote);
  }

  // ── Mantenimiento (solo supervisor u Oficial de Cumplimiento) ─────────────
  var mantState = useState(false); var verMant=mantState[0]; var setVerMant=mantState[1];
  var justState = useState(''); var justLote=justState[0]; var setJustLote=justState[1];
  var corteLoteState = useState(''); var corteLote=corteLoteState[0]; var setCorteLote=corteLoteState[1];
  var trabajandoState = useState(false); var trabajando=trabajandoState[0]; var setTrabajando=trabajandoState[1];
  var puedeMantener = puedeAprobar(currentUser.rol);

  // ── Períodos duplicados ───────────────────────────────────────────────────
  // Mismo legajo y mismo nombre de período. Cada duplicado genera su propio
  // juego de señales, y por eso una misma alerta aparece repetida en la lista.
  var gruposDup = (function(){
    var m = {};
    periodos.forEach(function(p){
      var k = p.legajoId + '||' + (p.nombre || '').trim().toLowerCase();
      (m[k] = m[k] || []).push(p);
    });
    return Object.keys(m).map(function(k){ return m[k]; })
      .filter(function(g){ return g.length > 1; })
      .map(function(g){
        // Se conserva el más reciente por fecha de carga; los demás sobran
        var ord = g.slice().sort(function(a,b){
          var fa = parseFechaAR(a.createdAt), fb = parseFechaAR(b.createdAt);
          return (fb ? fb.getTime() : 0) - (fa ? fa.getTime() : 0);
        });
        var leg = legajos.find(function(l){ return l.id === ord[0].legajoId; });
        return { conservar: ord[0], sobrantes: ord.slice(1),
                 legajoNom: (leg && leg.razonSocial) || 'N/D', nombre: ord[0].nombre };
      })
      .sort(function(a,b){ return b.sobrantes.length - a.sobrantes.length; });
  })();
  var totalSobrantes = gruposDup.reduce(function(a,g){ return a + g.sobrantes.length; }, 0);

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
        // Identificador único de la señal dentro del período. Debe incluir el
        // título porque un mismo patrón emite variantes distintas —PAT-06 da
        // una para cash-in y otra para cash-out— y con la clave por patrón
        // ambas quedaban indistinguibles al seleccionarlas o resolverlas.
        key: p.id + '::' + claveResolucion(s),
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

  // ── Eliminar períodos duplicados ─────────────────────────────────────────
  async function limpiarDuplicados() {
    if (!totalSobrantes) return;
    if (!(await uiConfirm(
      'Se eliminarán ' + totalSobrantes + ' período(s) duplicado(s), conservando en cada caso el de ' +
      'carga más reciente.\n\nEsto elimina esos períodos y sus transacciones. Las señales que hoy ' +
      'aparecen repetidas dejarán de duplicarse.\n\nNo se puede deshacer.',
      {danger:true, confirmLabel:'Eliminar ' + totalSobrantes + ' duplicado(s)'}))) return;

    setTrabajando(true);
    var aBorrar = [];
    gruposDup.forEach(function(g){ g.sobrantes.forEach(function(p){ aBorrar.push(p.id); }); });
    var quedan = periodos.filter(function(p){ return aBorrar.indexOf(p.id) < 0; });
    setPeriodos(quedan);
    if (props.onSync) props.onSync(legajos, quedan, [], aBorrar);
    auditLog(currentUser, 'eliminar_periodos_duplicados', 'periodo', '',
             { cantidad: aBorrar.length, grupos: gruposDup.length });
    setTrabajando(false);
    toast('✓ ' + aBorrar.length + ' período(s) duplicado(s) eliminado(s).');
  }

  // ── Resolución en lote ────────────────────────────────────────────────────
  // Existe para regularizar señales que fueron analizadas y cerradas fuera del
  // sistema. Se restringe deliberadamente: exige rol de decisión, una fecha de
  // corte que impide barrer señales nuevas, y un fundamento escrito que se
  // asienta en CADA señal junto con un identificador de lote, de modo que una
  // revisión posterior pueda distinguir un cierre masivo de un análisis
  // individual.
  function senalesDelLote() {
    if (!corteLote) return [];
    var pz = corteLote.split('-');
    var limite = new Date(pz[0], pz[1]-1, pz[2], 23, 59, 59);
    return allSigs.filter(function(sg){
      var f = parseFechaAR(sg.per && sg.per.createdAt);
      return f && f <= limite;
    });
  }

  async function resolverLote() {
    var lote = senalesDelLote();
    if (!lote.length) { toast('No hay señales anteriores a esa fecha.'); return; }
    if (justLote.trim().length < 25) {
      toast('El fundamento debe ser específico: describí qué documentación respalda estos cierres.');
      return;
    }
    if (!(await uiConfirm(
      'Se cerrarán ' + lote.length + ' señal(es) de períodos cargados hasta el ' +
      corteLote.split('-').reverse().join('/') + '.\n\nCada una quedará asentada con tu nombre, la ' +
      'fecha y el fundamento, e identificada como cierre en lote.\n\nLas señales posteriores a esa ' +
      'fecha no se tocan.',
      {danger:true, confirmLabel:'Cerrar ' + lote.length + ' señal(es)'}))) return;

    setTrabajando(true);
    var loteId = 'LOTE-' + todayStr().replace(/\//g,'') + '-' + uid().slice(0,4).toUpperCase();
    var porPeriodo = {};
    lote.forEach(function(sg){ (porPeriodo[sg.periodoId] = porPeriodo[sg.periodoId] || []).push(sg.pat); });

    var actualizados = periodos.map(function(p){
      var pats = porPeriodo[p.id];
      if (!pats) return p;
      var res = Object.assign({}, p.sigsResolucion || {});
      pats.forEach(function(pat){
        res[pat] = {
          estado: 'RESUELTA',
          explicacion: justLote.trim(),
          aprobadoPor: currentUser.nombre || 'N/D',
          aprobadoAt: todayStr(),
          masiva: true,
          loteId: loteId
        };
      });
      return Object.assign({}, p, { sigsResolucion: res });
    });

    setPeriodos(actualizados);
    if (props.onSync) props.onSync(legajos, actualizados, [], []);
    auditLog(currentUser, 'resolver_senales_lote', 'senal', loteId,
             { loteId: loteId, cantidad: lote.length, hasta: corteLote, fundamento: justLote.trim() });
    setTrabajando(false);
    setJustLote(''); setVerMant(false);
    toast('✓ ' + lote.length + ' señal(es) cerradas — lote ' + loteId);
  }

  // ── Resolver señal ───────────────────────────────────────────────────────────
  function resolverSenal(sig, justificacion) {
    var updatedPers = periodos.map(function(p){
      if (p.id !== sig.periodoId) return p;
      var newRes = Object.assign({}, p.sigsResolucion||{});
      newRes[claveResolucion(sig)] = {
        estado: 'RESUELTA',
        explicacion: justificacion || 'Resuelta desde panel de Alertas.',
        aprobadoPor: currentUser.nombre || 'Analista',
        aprobadoAt: todayStr(),
      };
      return Object.assign({}, p, {sigsResolucion: newRes});
    });
    setPeriodos(updatedPers);
    var newMap = Object.assign({}, justMap);
    delete newMap[sig.key];
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
        {tab==='senales' && puedeAprobar(currentUser.rol) && (
          <button onClick={function(){setVerMasivo(!verMasivo); setMSel([]);}}
            style={{marginLeft:'auto',background:verMasivo?T.ACCENT_SOFT:'transparent',
              color:verMasivo?T.ACCENT:T.TEXT2,border:'1px solid '+(verMasivo?T.ACCENT_DIM:T.BORDER2),
              borderRadius:T.RADIUS.sm,padding:'6px 13px',cursor:'pointer',fontSize:12,
              fontWeight:verMasivo?600:500,fontFamily:T.SANS}}>
            {verMasivo ? '✕ Salir de regularización' : '☑ Regularizar en lote'}
          </button>
        )}
        <span style={{background:totalAlertas>0?'rgba(255,68,85,0.16)':'rgba(0,230,118,0.16)',color:totalAlertas>0?T.RED:T.GREEN,borderRadius:T.RADIUS.pill,padding:'2px 11px',fontSize:10,fontWeight:700,fontFamily:T.MONO}}>
          {totalAlertas > 0 ? totalAlertas+' activas' : '✓ Sin alertas'}
        </span>
      </div>

      {/* ── Períodos duplicados ────────────────────────────────────────────
          La misma alerta repetida N veces casi siempre significa N períodos
          idénticos, no una falla de detección. */}
      {(function(){
        var dups = periodosDuplicados(periodos);
        if (!dups.length) return null;
        var redundantes = dups.reduce(function(a,d){ return a + d.redundantes.length; }, 0);
        return (
          <div style={{background:'rgba(255,184,48,0.07)',border:'1px solid rgba(255,184,48,0.3)',
            borderLeft:'3px solid '+T.AMBER,borderRadius:T.RADIUS.md,padding:'12px 15px',marginBottom:14}}>
            <div style={{fontSize:11.5,fontWeight:700,color:T.AMBER,marginBottom:7}}>
              ⚠ {dups.length} período(s) cargado(s) más de una vez
            </div>
            <div style={{fontSize:11.5,color:T.TEXT2,lineHeight:1.7,marginBottom:9}}>
              Hay <strong>{redundantes} período(s) redundante(s)</strong>: mismo cliente, mismo nombre y
              mismas métricas. Cada copia emite su propio juego de señales, y por eso una misma alerta
              aparece repetida en la bandeja. No es un error de detección.
              <div style={{marginTop:5,color:T.TEXT3}}>
                Se depuran desde <strong>Análisis</strong>, eliminando las copias sobrantes de cada período.
                Conviene hacerlo antes de regularizar, para no cerrar alertas de períodos que van a borrarse.
              </div>
            </div>
            {dups.slice(0,6).map(function(d,i){
              var leg = legajos.find(function(l){ return l.id === d.legajoId; });
              return (
                <div key={i} style={{display:'flex',gap:10,alignItems:'center',padding:'4px 0',
                  borderTop:'1px solid '+T.BORDER,fontSize:11}}>
                  <span style={{flex:1,color:T.TEXT2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {(leg && leg.razonSocial) || 'N/D'} · <span style={{fontFamily:T.MONO}}>{d.nombre}</span>
                  </span>
                  <span style={{fontFamily:T.MONO,fontWeight:700,color:T.AMBER,whiteSpace:'nowrap'}}>
                    {d.copias} copias
                  </span>
                </div>
              );
            })}
            {dups.length > 6 && (
              <div style={{fontSize:10.5,color:T.TEXT3,marginTop:7}}>y {dups.length-6} más.</div>
            )}
          </div>
        );
      })()}

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

      {/* ── Panel de regularización masiva ── */}
      {verMasivo && tab==='senales' && (function(){
        var elegidas = sigsFiltradas.filter(function(h){ return mSel.indexOf(h.key) >= 0; });
        return (
          <div style={{background:T.BG2,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.md,
            padding:'16px 18px',marginBottom:14,boxShadow:T.SHADOW.card}}>
            <div style={{fontSize:13,fontWeight:600,color:T.TEXT,marginBottom:8}}>
              Regularización de alertas resueltas fuera del sistema
            </div>
            <div style={{fontSize:11.5,color:T.TEXT2,lineHeight:1.7,marginBottom:14}}>
              Para alertas que <strong>ya fueron analizadas y resueltas</strong> contra documentación
              recibida del cliente, y que quedaron abiertas por no haberse asentado en la herramienta.
              <div style={{marginTop:6,color:T.TEXT3}}>
                Cada cierre queda marcado como <strong>regularización por lote</strong>, con su fundamento
                y la ubicación del respaldo. No se registra como análisis individual, porque no lo fue:
                un revisor tiene que poder distinguirlos.
              </div>
            </div>

            <div style={{display:'flex',gap:9,marginBottom:11,flexWrap:'wrap',alignItems:'center'}}>
              <button onClick={function(){
                  setMSel(elegidas.length === sigsFiltradas.length ? [] : sigsFiltradas.map(function(h){return h.key;}));
                }}
                style={{background:'transparent',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,
                  padding:'6px 12px',cursor:'pointer',fontSize:11,fontWeight:600,color:T.TEXT2,fontFamily:T.SANS}}>
                {elegidas.length === sigsFiltradas.length ? 'Desmarcar todas' : 'Marcar las ' + sigsFiltradas.length + ' visibles'}
              </button>
              <span style={{fontSize:11,color:T.TEXT3,fontFamily:T.MONO}}>
                {elegidas.length} de {sigsFiltradas.length} seleccionadas
              </span>
              <span style={{fontSize:10.5,color:T.TEXT4}}>
                Usá los filtros de arriba para acotar por cliente o severidad antes de marcar.
              </span>
            </div>

            <div style={{marginBottom:10}}>
              <label style={{display:'block',fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:5}}>
                Fundamento del cierre <span style={{color:T.RED}}>*</span>
              </label>
              <textarea value={mFund} onChange={function(e){setMFund(e.target.value);}} rows={3}
                placeholder="Ej: alertas analizadas y resueltas entre marzo y junio de 2026 contra documentación respaldatoria remitida por los clientes, con anterioridad a la puesta en régimen de la herramienta."
                style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'9px 11px',fontSize:12,resize:'vertical',lineHeight:1.6,boxSizing:'border-box'}}/>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{display:'block',fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:5}}>
                Dónde está el respaldo <span style={{color:T.RED}}>*</span>
              </label>
              <input value={mResp} onChange={function(e){setMResp(e.target.value);}}
                placeholder="Ej: carpeta compartida Compliance/2026/Respaldos alertas — expedientes por cliente"
                style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'8px 11px',fontSize:12,boxSizing:'border-box'}}/>
              <div style={{fontSize:10.5,color:T.TEXT4,marginTop:4}}>
                Un cierre sin indicación de dónde está la documentación no es acreditable ante una revisión.
              </div>
            </div>

            <button onClick={function(){regularizarSeleccionadas(elegidas);}}
              disabled={!elegidas.length || !mFund.trim() || !mResp.trim()}
              style={{width:'100%',
                background:(elegidas.length && mFund.trim() && mResp.trim()) ? 'rgba(0,230,118,0.15)' : T.BG3,
                color:(elegidas.length && mFund.trim() && mResp.trim()) ? T.GREEN : T.TEXT4,
                border:'1px solid '+((elegidas.length && mFund.trim() && mResp.trim()) ? 'rgba(0,230,118,0.3)' : T.BORDER),
                borderRadius:T.RADIUS.sm,padding:'10px 0',
                cursor:(elegidas.length && mFund.trim() && mResp.trim()) ? 'pointer' : 'not-allowed',
                fontWeight:700,fontSize:13,fontFamily:T.SANS}}>
              {elegidas.length ? '✓ Regularizar ' + elegidas.length + ' alerta(s)' : 'Seleccioná al menos una alerta'}
            </button>
          </div>
        );
      })()}

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
                {verMasivo && <th style={Object.assign({},TD,{width:36,background:T.BG3,position:'sticky',top:0,zIndex:2,borderBottom:'1px solid '+T.BORDER2})}></th>}
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
                  <tr key={s.key} onClick={function(){ if (verMasivo) { toggleMasivo(s.key); } else { setSelSigKey(s.key); } }}
                    style={{cursor:'pointer',background:(verMasivo && mSel.indexOf(s.key)>=0)?T.ACCENT_SOFT:(selSigKey===s.key?T.ACCENT_SOFT:'transparent'),transition:T.TRANS}}>
                    {verMasivo && (
                      <td style={Object.assign({},TD,{width:36})}>
                        <input type="checkbox" readOnly checked={mSel.indexOf(s.key)>=0} style={{pointerEvents:'none'}}/>
                      </td>
                    )}
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
