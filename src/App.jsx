import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { LayoutDashboard, FolderOpen, BarChart3, Bell, Briefcase, CalendarClock, ShieldCheck, Share2, Scale, Radar, BookOpen, Users, Download, Upload, Settings, LogOut } from "lucide-react";
import { ReportModal } from "./components/ui";
import { FeedbackHost, toast, uiConfirm } from "./components/feedback";
import CommandPalette from "./components/palette";
import { setModuleKeys } from "./lib/ai";
import { ROL_LABELS, puedeGestionarUsuarios } from "./lib/auth";
import { authHeaders, setSesion, limpiarSesion, onSesionCaida } from "./lib/session";
import { fetchServerConfig, serverLoad, serverLoadCasos, serverLoadRun, serverLoadRuns, serverSave, serverSaveCasos } from "./lib/sync";
import { C, T } from "./lib/theme";
import { todayStr } from "./lib/utils";
import LoginScreen from "./views/Login";


// ─── Carga diferida por vista (T8b) ──────────────────────────────────────────
// El bundle único pesaba ~1,4 MB y se descargaba entero antes de mostrar el
// login. Con lazy() cada vista viaja en su propio chunk y solo se baja cuando
// se entra a ella. Login y el shell quedan en la carga inicial.
var AlertasView = lazy(function(){ return import("./views/Alertas"); });
var CasosView = lazy(function(){ return import("./views/Casos"); });
var VencimientosView = lazy(function(){ return import("./views/Vencimientos"); });
var ScreeningView = lazy(function(){ return import("./views/Screening"); });
var RedView = lazy(function(){ return import("./views/Red"); });
var AnalisisView = lazy(function(){ return import("./views/Analisis"); });
var DashboardView = lazy(function(){ return import("./views/Dashboard"); });
var LegajosView = lazy(function(){ return import("./views/Legajos"); });
var NormativaView = lazy(function(){ return import("./views/Normativa"); });
var PatronesView = lazy(function(){ return import("./views/Patrones"); });
var UsuariosView = lazy(function(){ return import("./views/Usuarios"); });
var WikiView = lazy(function(){ return import("./views/Wiki"); });

// Placeholder mientras baja el chunk de una vista
function CargandoVista() {
  return (
    <div style={{padding:40,textAlign:'center',color:T.TEXT3,fontSize:12,fontFamily:T.SANS}}>
      Cargando…
    </div>
  );
}

export default function App() {
  // Sesión: solo en memoria — login requerido en cada apertura
  var authState = useState(null);
  var currentUser=authState[0]; var setCurrentUser=authState[1];
  var isAuth = !!currentUser;
  var legState = useState([]); var legajos=legState[0]; var setLegajos=legState[1];
  var perState = useState([]); var periodos=perState[0]; var setPeriodos=perState[1];
  var casState = useState([]); var casos=casState[0]; var setCasos=casState[1];
  var scrState = useState(null); var ultScreening=scrState[0]; var setUltScreening=scrState[1];
  var legacyState = useState(false); var tokenLegacy=legacyState[0]; var setTokenLegacy=legacyState[1];

  // Si el refresco del JWT falla, la sesión no se puede recuperar: se vuelve al
  // login en vez de dejar la app fallando en silencio contra la API.
  useEffect(function(){
    onSesionCaida(function(){
      limpiarSesion();
      setCurrentUser(null);
      toast('Tu sesión expiró. Ingresá de nuevo.');
    });
  }, []);
  var loadState = useState(true); var loading=loadState[0]; var setLoading=loadState[1];
  var viewState = useState('dashboard'); var view=viewState[0]; var setView=viewState[1];
  var repState = useState(null); var reportHTML=repState[0]; var setReportHTML=repState[1];
  var analState = useState({leg:null,per:null}); var analTarget=analState[0]; var setAnalTarget=analState[1];
  var palState = useState(false); var paletteOpen=palState[0]; var setPaletteOpen=palState[1];
  var legTgtState = useState(null); var legTarget=legTgtState[0]; var setLegTarget=legTgtState[1];
  var casoTgtState = useState(null); var casoTarget=casoTgtState[0]; var setCasoTarget=casoTgtState[1];
  // API keys: se cargan del servidor (variables de entorno Vercel) — no de localStorage
  var apiKeyState = useState(''); var apiKey=apiKeyState[0]; var setApiKey=apiKeyState[1];
  var oaiKeyState = useState(''); var oaiKey=oaiKeyState[0]; var setOaiKey=oaiKeyState[1];
  var providerState = useState('claude'); var provider=providerState[0]; var setProvider=providerState[1];
  var showKeyState = useState(false); var showKey=showKeyState[0]; var setShowKey=showKeyState[1];
  var showOaiKeyState = useState(false); var showOaiKey=showOaiKeyState[0]; var setShowOaiKey=showOaiKeyState[1];
  var configOpenState = useState(false); var configOpen=configOpenState[0]; var setConfigOpen=configOpenState[1];
  // Flags de configuración del servidor: las keys NUNCA llegan al browser —
  // /api/config solo informa si están configuradas. Toda llamada IA va por /api/ai.
  var srvKeysState = useState({anthropic:false, openai:false}); var serverKeys=srvKeysState[0]; var setServerKeys=srvKeysState[1];

  var syncStatusState = useState('idle'); var syncStatus=syncStatusState[0]; var setSyncStatus=syncStatusState[1];
  var hydrationState = useState({total:0,loaded:0}); var hydration=hydrationState[0]; var setHydration=hydrationState[1];

  // Audit log viewer state — nivel de componente para cumplir reglas de hooks
  var auditItemsState = useState([]); var auditItems=auditItemsState[0]; var setAuditItems=auditItemsState[1];
  var auditLoadedState = useState(false); var auditLoaded=auditLoadedState[0]; var setAuditLoaded=auditLoadedState[1];
  function cargarAudit() {
    authHeaders().then(function(h){ return fetch('/api/auth?action=audit_log&limit=20', {headers:h}); })
      .then(function(r){return r.json();})
      .then(function(d){ setAuditItems(d.logs||[]); setAuditLoaded(true); })
      .catch(function(){ setAuditLoaded(true); });
  }

  useEffect(function() {
    // Fuentes: Inter (UI) + JetBrains Mono (datos duros)
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap';
    document.head.appendChild(link);
    // CSS global derivado de los design tokens (theme.js) — v3 fintech
    var styleEl = document.createElement('style');
    styleEl.textContent = [
      '*, *::before, *::after { box-sizing: border-box; }',
      'body { background: ' + T.BG + '; color: ' + T.TEXT + '; margin: 0; font-family: ' + T.SANS + '; -webkit-font-smoothing: antialiased; }',
      'input, select, textarea, button { font-family: ' + T.SANS + '; color: ' + T.TEXT + '; background: ' + T.BG4 + '; border-color: ' + T.BORDER2 + '; }',
      'input, select, textarea { transition: ' + T.TRANS + '; }',
      'input:focus, select:focus, textarea:focus { outline: none; border-color: ' + T.ACCENT + ' !important; box-shadow: 0 0 0 3px ' + T.ACCENT_SOFT + '; }',
      'input::placeholder, textarea::placeholder { color: ' + T.TEXT3 + '; }',
      'select option { background: ' + T.BG2 + '; color: ' + T.TEXT + '; }',
      'input[type="checkbox"] { accent-color: ' + T.ACCENT + '; width: 14px; height: 14px; cursor: pointer; }',
      'input[type="radio"] { accent-color: ' + T.ACCENT + '; cursor: pointer; }',
      'button { transition: ' + T.TRANS + '; }',
      '::-webkit-scrollbar { width: 8px; height: 8px; }',
      '::-webkit-scrollbar-track { background: transparent; }',
      '::-webkit-scrollbar-thumb { background: ' + T.BORDER2 + '; border-radius: 4px; }',
      '::-webkit-scrollbar-thumb:hover { background: ' + T.BORDER3 + '; }',
      'a { color: ' + T.ACCENT + '; text-decoration: none; }',
      '::selection { background: ' + T.ACCENT_DIM + '; color: ' + T.TEXT + '; }',
      'table { border-collapse: collapse; width: 100%; }',
      'th { font-weight: 500; text-align: left; color: ' + T.TEXT3 + '; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }',
      'td { color: ' + T.TEXT + '; }',
      'tr:hover td { background: ' + T.ACCENT_SOFT.replace('0.12','0.05') + '; }',
      '@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }',
      '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }',
      '@keyframes drawerIn { from { transform: translateX(26px); opacity: 0; } to { transform: none; opacity: 1; } }'
    ].join('\n');
    document.head.appendChild(styleEl);
    setSyncStatus('loading');

    // 1. Config del servidor — solo flags: las API keys quedan en el servidor
    //    (llegaban en texto plano al browser; ahora todas las llamadas IA van
    //    por el proxy /api/ai que usa las env vars de Vercel)
    fetchServerConfig().then(function(cfg) {
      if (cfg) {
        setServerKeys({ anthropic: !!cfg.hasAnthropicKey, openai: !!cfg.hasOpenaiKey });
        if (cfg.defaultProvider) { setProvider(cfg.defaultProvider); setModuleKeys(null, null, cfg.defaultProvider); }
        setTokenLegacy(!!cfg.appTokenLegacy);
      }
    }).catch(function(){});

    // Verificar si hay API keys configuradas en servidor
    fetchServerConfig().then(function(cfg){
      if (!cfg || (!cfg.hasAnthropicKey && !cfg.hasOpenaiKey)) setConfigOpen(true);
    }).catch(function(){});
  }, []);

  // ── 2. Cargar los datos de Supabase, DESPUÉS de tener sesión ────────────────
  // Este efecto depende de currentUser a propósito. Antes corría al montar la
  // app, cuando todavía no hay sesión: con el token compartido funcionaba porque
  // viajaba siempre, pero al exigir sesión de usuario devolvía 401 y no se
  // reintentaba nunca — la app quedaba logueada y vacía, con "sin conexión a
  // Supabase". La carga tiene que esperar a que haya con qué autenticarse.
  useEffect(function() {
    if (!currentUser) return;
    setSyncStatus('loading');
    setLoading(true);

    // Casos (T3) — carga independiente, no bloquea la hidratación principal
    serverLoadCasos().then(function(cs){ setCasos(cs || []); }).catch(function(){});

    // Última corrida de screening (T5b) — la usan la pestaña Screening del legajo
    // y el aviso de corrida vencida del Dashboard.
    serverLoadRuns().then(function(rs){
      if (rs && rs.length) return serverLoadRun(rs[0].id).then(function(full){ setUltScreening(full); });
    }).catch(function(){});

    serverLoad().then(function(cloudData) {
      if (cloudData && cloudData.legajos !== undefined) {
        var cloudPers = cloudData.periodos || [];
        setLegajos(cloudData.legajos || []);
        setPeriodos(cloudPers);
        setSyncStatus('ok');
        setLoading(false);

        // Las txns se cargan on-demand al seleccionar un período; esto evita
        // saturar Supabase con queries masivas al inicio.
        var sinMetricas = cloudPers.filter(function(p){ return !p.metricas; });
        if (sinMetricas.length > 0) {
          console.log('[Rebit] Períodos sin métricas:', sinMetricas.length, '— se calcularán al seleccionarlos');
        }
      } else {
        setSyncStatus('error');
        setLoading(false);
      }
    }).catch(function() {
      setSyncStatus('error');
      setLoading(false);
    });
  }, [currentUser]);

  function saveApiKey(val) { var t=val.trim(); setApiKey(t); setModuleKeys(t, null, null); }
  function saveOaiKey(val) { var t=val.trim(); setOaiKey(t); setModuleKeys(null, t, null); }
  function saveProvider(val) { setProvider(val); setModuleKeys(null, null, val); }

  // Debounced sync: acumula cambios y envía 1 solo POST cada 2 segundos
  var syncTimerRef = useRef(null);
  var syncPendingRef = useRef(null);
  
  // Los casos se guardan directo: son registros chicos y de baja frecuencia,
  // y conviene que el plazo quede persistido apenas cambia el estado.
  function syncCasos(lista) {
    setSyncStatus('saving');
    serverSaveCasos(lista).then(function(ok){
      setSyncStatus(ok ? 'ok' : 'error');
    });
  }

  function syncToCloud(legs, pers, deletedLegajoIds, deletedPeriodoIds) {
    // Acumular datos más recientes
    var pending = syncPendingRef.current || { deletedLegajoIds: [], deletedPeriodoIds: [] };
    syncPendingRef.current = {
      legajos: legs || legajos,
      periodos: pers || periodos,
      deletedLegajoIds: (pending.deletedLegajoIds || []).concat(deletedLegajoIds || []),
      deletedPeriodoIds: (pending.deletedPeriodoIds || []).concat(deletedPeriodoIds || [])
    };
    setSyncStatus('saving');
    
    // Cancelar el timer anterior y crear uno nuevo
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(function() {
      var data = syncPendingRef.current;
      syncPendingRef.current = null;
      if (!data) return;
      serverSave(data).then(function(ok) {
        setSyncStatus(ok ? 'ok' : 'error');
      }).catch(function(){ setSyncStatus('error'); });
    }, 2000); // 2 segundos de debounce
  }

  var activeKeyOk = provider==='openai' ? (serverKeys.openai || !!oaiKey.trim()) : (serverKeys.anthropic || !!apiKey.trim());

  // Cmd+K / Ctrl+K → Command Palette
  useEffect(function() {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(function(o){return !o;}); }
    }
    window.addEventListener('keydown', onKey);
    return function(){ window.removeEventListener('keydown', onKey); };
  }, []);

  function handleAnalizar(leg, per) { setAnalTarget({leg:leg,per:per}); setView('analisis'); }
  function handleVerCaso(casoId) { setCasoTarget(casoId); setView('casos'); }

  var importRef = useRef();

  function handleExport() {
    var backup = { version:'2.2.0', exportedAt: new Date().toISOString(), legajos: legajos, periodos: periodos };
    var json = JSON.stringify(backup, null, 2);
    var blob = new Blob([json], { type:'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rebit-aml-backup-' + todayStr().replace(/\//g,'-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = async function() {
      try {
        var data = JSON.parse(r.result);
        var importedLegs = data.legajos || [];
        var importedPers = data.periodos || [];
        if (!importedLegs.length && !importedPers.length) { toast('El archivo no contiene datos validos.'); return; }
        var merge = await uiConfirm(
          'Archivo: ' + (data.exportedAt ? new Date(data.exportedAt).toLocaleDateString('es-AR') : 'desconocido') + '\n' +
          importedLegs.length + ' legajos y ' + importedPers.length + ' periodos encontrados.\n\n' +
          '¿Cómo querés importarlos?',
          {title:'Importar backup', confirmLabel:'Agregar a existentes', cancelLabel:'Reemplazar todo', danger:false});
        if (merge === null) return; // Esc = cancelar importación
        var newLegs, newPers;
        if (merge) {
          var existingLegIds = legajos.map(function(l){return l.id;});
          var existingPerIds = periodos.map(function(p){return p.id;});
          var addLegs = importedLegs.filter(function(l){return existingLegIds.indexOf(l.id)<0;});
          var addPers = importedPers.filter(function(p){return existingPerIds.indexOf(p.id)<0;});
          newLegs = legajos.concat(addLegs);
          newPers = periodos.concat(addPers);
          toast('Importados: ' + addLegs.length + ' legajos nuevos y ' + addPers.length + ' periodos nuevos. (' + (importedLegs.length - addLegs.length) + ' duplicados omitidos)');
        } else {
          newLegs = importedLegs;
          newPers = importedPers;
          toast('Datos reemplazados: ' + newLegs.length + ' legajos, ' + newPers.length + ' periodos.');
        }
        setLegajos(newLegs);
        setPeriodos(newPers);
        syncToCloud(newLegs, newPers);
      } catch(err) { toast('Error al leer el archivo: ' + err.message); }
    };
    r.readAsText(f, 'UTF-8');
    e.target.value = '';
  }

  var NAV = [
    ['dashboard', LayoutDashboard, 'Dashboard'],
    ['legajos',   FolderOpen,      'Legajos KYB'],
    ['analisis',  BarChart3,       'Análisis AML'],
    ['alertas',   Bell,            'Alertas'],
    ['casos',     Briefcase,       'Casos'],
    ['vencimientos', CalendarClock, 'Vencimientos'],
    ['screening', ShieldCheck,   'Screening'],
    ['red',       Share2,        'Red'],
    ['normativa', Scale,           'Normativa'],
    ['patrones',  Radar,           'Patrones AML'],
    ['wiki',      BookOpen,        'Wiki']
  ];
  if (currentUser && puedeGestionarUsuarios(currentUser.rol)) {
    NAV.push(['usuarios', Users, 'Usuarios']);
  }

  if (!isAuth) return <LoginScreen onLogin={function(usuario){setSesion(usuario); setCurrentUser(usuario);}} />;

  if (loading) return (
    <div style={{minHeight:'100vh',background:T.BG,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',fontFamily:T.MONO}}>
      <div style={{width:36,height:36,background:C.AC,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',borderRadius:3,marginBottom:20,letterSpacing:'-0.5px'}}>RB</div>
      <div style={{fontSize:13,fontWeight:600,color:T.TEXT,letterSpacing:'3px',marginBottom:8,textTransform:'uppercase'}}>REBIT AML TOOL</div>
      <div style={{fontSize:10,color:T.TEXT3,letterSpacing:'2px'}}>// cargando...</div>
    </div>
  );

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',fontFamily:T.MONO,background:T.BG,color:T.TEXT}}>
      {reportHTML ? <ReportModal html={reportHTML} onClose={function(){setReportHTML(null);}} /> : null}
      <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{display:'none'}}/>

      {/* MODAL CONFIGURACIÓN IA */}
      {configOpen ? <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',overflow:'auto'}}>
        <div style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:4,padding:28,color:T.TEXT,width:540,maxWidth:'92vw',maxHeight:'90vh',overflowY:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div>
              <div style={{fontWeight:600,color:T.TEXT,fontSize:13,letterSpacing:'1px'}}>⚙ CONFIGURACIÓN IA & SYNC</div>
              <div style={{fontSize:11,color:T.TEXT3,marginTop:2,fontFamily:T.MONO}}>Proveedor, API keys y sincronización</div>
            </div>
            {activeKeyOk && <button onClick={function(){setConfigOpen(false);}} style={{background:'none',border:'1px solid '+T.BORDER2,borderRadius:3,padding:'4px 10px',cursor:'pointer',fontSize:11,color:T.TEXT3,fontFamily:T.MONO}}>✕ cerrar</button>}
          </div>

          {/* BANNER: keys del servidor */}
          {(serverKeys.anthropic || serverKeys.openai) && <div style={{background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.2)',borderRadius:3,padding:'10px 14px',marginBottom:16,fontSize:11,color:T.GREEN,fontFamily:T.MONO}}>
            ✅ <strong>API keys configuradas en el servidor</strong> ({serverKeys.anthropic ? 'Anthropic' : ''}{serverKeys.anthropic && serverKeys.openai ? ' + ' : ''}{serverKeys.openai ? 'OpenAI' : ''}). Por seguridad nunca se envían al navegador — todas las llamadas IA pasan por el proxy del servidor.
          </div>}

          {/* SELECTOR DE PROVEEDOR */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
            {[
              {id:'claude',label:'Claude (Anthropic)',icon:'🟠',desc:'claude-sonnet-4',color:'#E8560A'},
              {id:'openai',label:'GPT-4o (OpenAI)',icon:'🟢',desc:'gpt-4o-2024-11-20',color:'#10A37F'}
            ].map(function(p){return(
              <div key={p.id} onClick={function(){saveProvider(p.id);}} style={{border:'1px solid '+(provider===p.id?C.AC:T.BORDER2),borderRadius:3,padding:'12px 14px',cursor:'pointer',background:provider===p.id?'rgba(59,109,170,0.12)':T.BG3,transition:'all 0.15s'}}>
                <div style={{fontSize:18,marginBottom:4}}>{p.icon}</div>
                <div style={{fontWeight:600,color:provider===p.id?T.CYAN:T.TEXT2,fontSize:12,fontFamily:T.MONO}}>{p.label}</div>
                <div style={{fontSize:10,color:T.TEXT3,fontFamily:T.MONO}}>{p.desc}</div>
                {provider===p.id && <div style={{fontSize:9,color:T.GREEN,fontWeight:600,marginTop:4,fontFamily:T.MONO}}>// ACTIVO</div>}
              </div>
            );})}
          </div>

          {/* ANTHROPIC */}
          <div style={{marginBottom:16,opacity:provider==='claude'?1:0.5}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <label style={{fontSize:10,color:T.TEXT3,fontWeight:400,fontFamily:T.MONO,letterSpacing:'1px'}}>// ANTHROPIC API KEY {provider==='claude'&&<span style={{color:T.GREEN}}>(activo)</span>}</label>
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{fontSize:11,color:T.CYAN}}>Obtener key →</a>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:4}}>
              <input type={showKey?'text':'password'} value={apiKey} onChange={function(e){setApiKey(e.target.value);}}
                placeholder="sk-ant-api03-..." style={{flex:1,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 10px',fontSize:11,fontFamily:T.MONO,background:T.BG4,color:T.TEXT,outline:'none'}}/>
              <button onClick={function(){setShowKey(!showKey);}} style={{background:T.BG4,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 10px',cursor:'pointer',color:T.TEXT3}}>{showKey?'🙈':'👁'}</button>
              <button onClick={function(){saveApiKey(apiKey);}} style={{background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'8px 12px',cursor:'pointer',fontSize:10,fontWeight:600,fontFamily:T.MONO}}>guardar</button>
            </div>
            {apiKey && apiKey.startsWith('sk-ant-') && <div style={{fontSize:11,color:T.GREEN}}>✓ Formato válido</div>}
            {apiKey && !apiKey.startsWith('sk-ant-') && <div style={{fontSize:11,color:T.RED}}>⚠ Debe empezar con "sk-ant-"</div>}
          </div>

          {/* OPENAI */}
          <div style={{marginBottom:20,opacity:provider==='openai'?1:0.5}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <label style={{fontSize:10,color:T.TEXT3,fontWeight:400,fontFamily:T.MONO,letterSpacing:'1px'}}>// OPENAI API KEY {provider==='openai'&&<span style={{color:T.GREEN}}>(activo)</span>}</label>
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{fontSize:11,color:T.CYAN}}>Obtener key →</a>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:4}}>
              <input type={showOaiKey?'text':'password'} value={oaiKey} onChange={function(e){setOaiKey(e.target.value);}}
                placeholder="sk-..." style={{flex:1,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 10px',fontSize:11,fontFamily:T.MONO,background:T.BG4,color:T.TEXT,outline:'none'}}/>
              <button onClick={function(){setShowOaiKey(!showOaiKey);}} style={{background:T.BG4,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 10px',cursor:'pointer',color:T.TEXT3}}>{showOaiKey?'🙈':'👁'}</button>
              <button onClick={function(){saveOaiKey(oaiKey);}} style={{background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'8px 12px',cursor:'pointer',fontSize:10,fontWeight:600,fontFamily:T.MONO}}>guardar</button>
            </div>
            {oaiKey && oaiKey.startsWith('sk-') && <div style={{fontSize:11,color:T.GREEN}}>✓ Formato válido</div>}
          </div>

          <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'10px 12px',fontSize:11,color:T.TEXT2,lineHeight:1.6}}>
            🔒 Las keys viven únicamente en el servidor (variables de entorno de Vercel) y <strong>nunca se envían al navegador</strong>.<br/>
            💡 Los campos de arriba son solo para desarrollo local (fallback directo en localhost) — en producción dejalos vacíos.
          </div>

          {activeKeyOk && <button onClick={function(){setConfigOpen(false);}}
            style={{width:'100%',background:provider==='openai'?'#10A37F':C.NARANJA,color:'white',border:'none',borderRadius:4,padding:'11px 0',cursor:'pointer',fontWeight:700,fontSize:14,marginTop:16}}>
            ✅ Usar {provider==='openai'?'GPT-4o':'Claude'} para extracción IA
          </button>}

          {/* SECCIÓN SYNC */}
          <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid '+T.BORDER}}>
            <div style={{fontWeight:600,color:T.TEXT,fontSize:11,marginBottom:4}}>☁️ Sincronización entre dispositivos</div>
            <div style={{background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.2)',borderRadius:4,padding:'10px 12px'}}>
              <div style={{fontWeight:700,color:T.GREEN,fontSize:12,marginBottom:4}}>✅ Supabase — Base de datos activa</div>
              <div style={{fontSize:11,color:T.TEXT2,lineHeight:1.5}}>
                Los datos se sincronizan automáticamente con Supabase (PostgreSQL). Sin límite de tamaño, multi-analista, con historial de cambios.
              </div>
              {syncStatus==='ok' && <div style={{fontSize:10,color:T.GREEN,marginTop:6,fontFamily:T.MONO}}>✓ Última sincronización exitosa</div>}
              {syncStatus==='error' && <div style={{fontSize:10,color:T.RED,marginTop:6,fontFamily:T.MONO}}>⚠ Error de sincronización — verificá las variables SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel</div>}
              {syncStatus==='saving' && <div style={{fontSize:10,color:T.AMBER,marginTop:6,fontFamily:T.MONO}}>⏳ Guardando...</div>}
              {syncStatus==='loading' && hydration.total > 0 && <div style={{fontSize:10,color:T.CYAN,marginTop:6,fontFamily:T.MONO}}>// hidratando txns: {hydration.loaded}/{hydration.total}</div>}
              <button onClick={function(){syncToCloud(legajos,periodos);}} style={{marginTop:8,width:'100%',background:T.BG3,border:'1px solid '+T.BORDER2,color:T.CYAN,borderRadius:3,padding:'7px 0',cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:T.MONO}}>
                🔄 Sincronizar ahora ({legajos.length} legajos, {periodos.length} periodos)
              </button>
            </div>
          </div>

          {/* SECCIÓN AUDIT LOG */}
          {currentUser && (
            <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid '+T.BORDER}}>
              <div style={{fontWeight:600,color:T.TEXT,fontSize:11,marginBottom:8}}>📋 Actividad reciente</div>
              {auditLoaded ? (
                <div>
                  <button onClick={cargarAudit} style={{width:'100%',background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:'5px 0',cursor:'pointer',fontSize:11,color:T.TEXT2,marginBottom:8}}>↻ Actualizar</button>
                  {auditItems.length === 0 ? (
                    <div style={{fontSize:12,color:T.TEXT3,textAlign:'center',padding:'10px 0'}}>Sin actividad registrada aún.</div>
                  ) : (
                    <div style={{maxHeight:280,overflowY:'auto'}}>
                      {auditItems.map(function(a){
                        var fecha = a.created_at ? new Date(a.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
                        var ACCION_LABEL = {crear_legajo:'➕ Legajo creado',modificar_legajo:'✏️ Legajo modificado',cambiar_estado:'🔄 Estado cambiado',generar_inf01:'📄 INF-01',generar_inf02:'📊 INF-02',generar_inf07:'🔒 INF-07',generar_ros:'📋 ROS generado',crear_rfi:'📧 RFI creado',responder_rfi:'📥 RFI respondido',cerrar_rfi:'⚫ RFI cerrado',crear_usuario:'👤 Usuario creado',cambio_rol:'🔑 Rol cambiado',desactivar_usuario:'⏸ Desactivado',activar_usuario:'▶ Activado',cambiar_estado_rfi:'🔄 Estado RFI',aprobar_cierre_senal:'✅ Señal resuelta',cambiar_estado_periodo:'🔄 Estado período'};
                        return (
                          <div key={a.id} style={{padding:'6px 8px',borderBottom:'1px solid '+T.BORDER,fontSize:11}}>
                            <div style={{display:'flex',justifyContent:'space-between'}}>
                              <span style={{fontWeight:500,color:T.TEXT2}}>{ACCION_LABEL[a.accion]||a.accion}</span>
                              <span style={{color:T.TEXT3,flexShrink:0,marginLeft:6}}>{fecha}</span>
                            </div>
                            <div style={{color:T.TEXT2,marginTop:1}}>
                              {a.usuario_nombre && <span style={{color:T.CYAN}}>{a.usuario_nombre}</span>}
                              {a.detalle&&a.detalle.razonSocial && <span style={{color:T.TEXT2}}> — {a.detalle.razonSocial}</span>}
                              {a.detalle&&a.detalle.periodo && <span style={{color:T.TEXT2}}> · {a.detalle.periodo}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={cargarAudit} style={{width:'100%',background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 0',cursor:'pointer',fontSize:12,color:T.TEXT2,fontWeight:500}}>
                  🔍 Ver actividad reciente
                </button>
              )}
            </div>
          )}
        </div>
      </div> : null}

      {/* ══ SIDEBAR v3 — fintech shell ══ */}
      <div style={{width:230,background:T.BG2,borderRight:'1px solid '+T.BORDER,display:'flex',flexDirection:'column',flexShrink:0}}>

        {/* Logo */}
        <div style={{padding:'20px 16px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:11}}>
            <div style={{width:34,height:34,background:'linear-gradient(135deg,'+T.ACCENT+' 0%,#2A5FD0 100%)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',borderRadius:T.RADIUS.md,flexShrink:0,fontFamily:T.SANS,boxShadow:'0 2px 8px '+T.ACCENT_DIM}}>RB</div>
            <div>
              <div style={{color:T.TEXT,fontWeight:700,fontSize:14,letterSpacing:'-0.2px',fontFamily:T.SANS}}>Rebit AML</div>
              <div style={{color:T.TEXT3,fontSize:10,fontWeight:500,letterSpacing:'0.5px',fontFamily:T.SANS}}>Compliance Suite</div>
            </div>
          </div>
        </div>

        {/* Búsqueda global */}
        <div style={{padding:'0 10px 8px'}}>
          <button onClick={function(){setPaletteOpen(true);}}
            style={{display:'flex',gap:8,alignItems:'center',width:'100%',padding:'8px 12px',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm+2,background:T.BG3,color:T.TEXT3,cursor:'pointer',fontSize:12,fontFamily:T.SANS,transition:T.TRANS}}>
            <span style={{fontSize:12}}>🔍</span>
            <span style={{flex:1,textAlign:'left'}}>Buscar…</span>
            <span style={{fontSize:9,fontFamily:T.MONO,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'1px 5px',color:T.TEXT4}}>⌘K</span>
          </button>
        </div>

        {/* Navegación */}
        <nav style={{flex:1,padding:'4px 10px',overflowY:'auto'}}>
          {NAV.map(function(n){
            var Icon = n[1];
            var active = view === n[0];
            return (
              <button key={n[0]} onClick={function(){setView(n[0]);}}
                style={{display:'flex',gap:10,alignItems:'center',width:'100%',padding:'9px 12px',border:'none',borderRadius:T.RADIUS.sm+2,
                  background:active?T.ACCENT_SOFT:'transparent',
                  color:active?T.ACCENT:T.TEXT2,
                  cursor:'pointer',fontSize:13,fontWeight:active?600:500,textAlign:'left',marginBottom:2,fontFamily:T.SANS,transition:T.TRANS}}>
                <Icon size={16} strokeWidth={active?2.2:1.8}/>
                {n[2]}
              </button>
            );
          })}
        </nav>

        {/* Acciones: datos + configuración */}
        <div style={{padding:'10px 10px 6px',borderTop:'1px solid '+T.BORDER}}>
          <div style={{display:'flex',gap:6,marginBottom:6}}>
            <button onClick={handleExport} title="Exportar backup JSON"
              style={{flex:1,display:'flex',gap:6,alignItems:'center',justifyContent:'center',padding:'8px 0',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm+2,background:'transparent',color:T.TEXT2,cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:T.SANS,transition:T.TRANS}}>
              <Download size={13}/> Exportar
            </button>
            <button onClick={function(){importRef.current.click();}} title="Importar backup JSON"
              style={{flex:1,display:'flex',gap:6,alignItems:'center',justifyContent:'center',padding:'8px 0',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm+2,background:'transparent',color:T.TEXT2,cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:T.SANS,transition:T.TRANS}}>
              <Upload size={13}/> Importar
            </button>
          </div>
          <button onClick={function(){setConfigOpen(true);}}
            style={{display:'flex',gap:8,alignItems:'center',width:'100%',padding:'8px 12px',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm+2,background:'transparent',color:T.TEXT2,cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:T.SANS,transition:T.TRANS}}>
            <Settings size={13}/>
            <span style={{flex:1,textAlign:'left'}}>Configuración IA</span>
            <span style={{width:7,height:7,borderRadius:99,background:activeKeyOk?T.GREEN:T.RED,boxShadow:'0 0 6px '+(activeKeyOk?T.GREEN:T.RED)}}/>
          </button>
        </div>

        {/* Usuario + estado */}
        <div style={{padding:'12px 14px 14px',borderTop:'1px solid '+T.BORDER}}>
          {currentUser && (
            <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}>
              <div style={{width:28,height:28,borderRadius:99,background:T.BG4,border:'1px solid '+T.BORDER3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:T.ACCENT,fontFamily:T.SANS,flexShrink:0}}>
                {(currentUser.nombre||'?').split(' ').map(function(p){return p[0];}).slice(0,2).join('').toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:T.TEXT,fontSize:12,fontWeight:600,fontFamily:T.SANS,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{currentUser.nombre}</div>
                <div style={{color:T.TEXT3,fontSize:10,fontFamily:T.SANS}}>{ROL_LABELS[currentUser.rol]||currentUser.rol}</div>
              </div>
              <button onClick={async function(){if(await uiConfirm('¿Cerrar sesión?', {danger:false, confirmLabel:'Cerrar sesión'})){setCurrentUser(null);}}} title="Cerrar sesión"
                style={{background:'none',border:'none',color:T.TEXT3,cursor:'pointer',padding:4,display:'flex'}}>
                <LogOut size={14}/>
              </button>
            </div>
          )}
          <div style={{display:'flex',alignItems:'center',gap:7,fontSize:10,fontFamily:T.SANS,color:T.TEXT3}}>
            <span style={{width:7,height:7,borderRadius:99,flexShrink:0,
              background:syncStatus==='ok'?T.GREEN:syncStatus==='error'?T.RED:T.AMBER,
              animation:(syncStatus==='saving'||syncStatus==='loading')?'pulse 1.2s infinite':'none'}}/>
            <span style={{flex:1}}>
              {syncStatus==='ok'?'Sincronizado':syncStatus==='saving'?'Guardando…':syncStatus==='loading'?'Cargando…':syncStatus==='error'?'Sin conexión':'—'}
            </span>
            <span style={{fontFamily:T.MONO,color:T.TEXT4}}>{legajos.length}L · {periodos.length}P</span>
          </div>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',maxHeight:'100vh',background:T.BG}}>
        {/* Aviso mientras el token compartido siga habilitado (T8a) */}
        {tokenLegacy && puedeGestionarUsuarios(currentUser && currentUser.rol) && (
          <div style={{margin:'14px 22px 0',background:'rgba(255,184,48,0.08)',border:'1px solid rgba(255,184,48,0.35)',borderLeft:'3px solid '+T.AMBER,borderRadius:T.RADIUS.md,padding:'11px 15px',fontSize:11,color:T.TEXT2,lineHeight:1.65}}>
            <strong style={{color:T.AMBER}}>Autenticación en transición.</strong> La API todavía acepta el token
            compartido, que viaja dentro del bundle del navegador y es legible por cualquiera que abra la app, incluso
            sin credenciales. Verificá que todo funcione con la sesión de usuario y después definí{' '}
            <span style={{fontFamily:T.MONO,color:T.TEXT}}>ALLOW_APP_TOKEN=false</span> en las variables de entorno de
            Vercel. Este aviso desaparece solo cuando el token deja de aceptarse.
          </div>
        )}
        {syncStatus==='error' && (
          <div style={{background:'rgba(255,184,48,0.08)',borderBottom:'1px solid rgba(255,184,48,0.2)',padding:'7px 20px',display:'flex',alignItems:'center',gap:10,fontSize:10,fontFamily:T.MONO}}>
            <span style={{fontSize:13}}>⚠</span>
            <span style={{color:T.AMBER,fontWeight:600}}>SIN CONEXIÓN A SUPABASE</span>
            <span style={{color:T.TEXT3}}>— datos en memoria. Los cambios se guardarán al restaurar.</span>
            <button onClick={function(){setSyncStatus('loading');serverLoad().then(function(d){if(d){setLegajos(d.legajos||[]);setPeriodos(d.periodos||[]);setSyncStatus('ok');}else{setSyncStatus('error');}});}} style={{marginLeft:'auto',background:T.BG2,border:'1px solid rgba(255,184,48,0.3)',color:T.AMBER,borderRadius:4,padding:'3px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>
              Reintentar
            </button>
          </div>
        )}
        <Suspense fallback={<CargandoVista/>}>
          {view==='dashboard' ? <DashboardView casos={casos} ultScreening={ultScreening} onVerCaso={handleVerCaso} onNavigate={function(v){setView(v);}} legajos={legajos} periodos={periodos} setLegajos={setLegajos}/> : null}
          {view==='legajos' ? <LegajosView ultScreening={ultScreening} casos={casos} key={'leg-'+(legTarget||'')} initSelId={legTarget} legajos={legajos} setLegajos={setLegajos} periodos={periodos} setPeriodos={setPeriodos} onAnalizar={handleAnalizar} onReport={function(html){setReportHTML(html);}} onSync={syncToCloud} currentUser={currentUser}/> : null}
          {view==='analisis' ? <AnalisisView legajos={legajos} periodos={periodos} setPeriodos={setPeriodos} onReport={function(html){setReportHTML(html);}} initLegajo={analTarget.leg} initPeriodo={analTarget.per} onSync={syncToCloud} currentUser={currentUser}/> : null}
          {view==='alertas' ? <AlertasView periodos={periodos} legajos={legajos} setPeriodos={setPeriodos} casos={casos} setCasos={setCasos} onSyncCasos={syncCasos} onNavAnalisis={handleAnalizar} onVerCaso={handleVerCaso} currentUser={currentUser}/> : null}
          {view==='red' ? <RedView legajos={legajos} periodos={periodos} casos={casos} setCasos={setCasos} onSyncCasos={syncCasos} onVerCaso={handleVerCaso} onOpenLegajo={function(id){setLegTarget(id);setView('legajos');}} currentUser={currentUser}/> : null}
          {view==='screening' ? <ScreeningView legajos={legajos} casos={casos} setCasos={setCasos} onSyncCasos={syncCasos} onVerCaso={handleVerCaso} currentUser={currentUser}/> : null}
          {view==='vencimientos' ? <VencimientosView legajos={legajos} periodos={periodos} casos={casos} setCasos={setCasos} onSyncCasos={syncCasos} onVerCaso={handleVerCaso} onOpenLegajo={function(id){setLegTarget(id);setView('legajos');}} currentUser={currentUser}/> : null}
          {view==='casos' ? <CasosView key={'cas-'+(casoTarget||'')} initCasoId={casoTarget} casos={casos} setCasos={setCasos} legajos={legajos} periodos={periodos} onNavAnalisis={handleAnalizar} onSyncCasos={syncCasos} currentUser={currentUser}/> : null}
          {view==='normativa' ? <NormativaView/> : null}
          {view==='patrones' ? <PatronesView/> : null}
          {view==='wiki' ? <WikiView/> : null}
          {view==='usuarios' && currentUser && puedeGestionarUsuarios(currentUser.rol) ? <UsuariosView currentUser={currentUser}/> : null}
        </Suspense>
      </div>

      <FeedbackHost/>
      <CommandPalette open={paletteOpen} onClose={function(){setPaletteOpen(false);}}
        legajos={legajos} nav={NAV}
        onNavigate={function(v){setView(v);}}
        onOpenLegajo={function(l){setLegTarget(l.id);setView('legajos');}}/>
    </div>
  );
}
