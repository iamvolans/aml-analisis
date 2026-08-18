import { useState, useEffect, useRef } from "react";
import { toast, uiConfirm } from "../components/feedback";
import { Badge, Card, Pill } from "../components/ui";
import { _KEYS, callProxyOrDirect, extractWithClaude, extractWithGPT } from "../lib/ai";
import { calcMetricas, calcScoring, contarAlta, detectPatrones, lineaBase, senalesActivas } from "../lib/aml";
import { auditLog, puedeAprobar, puedeEliminar } from "../lib/auth";
import { CHECKLIST_ITEMS, ESTADOS_CUENTA, KYB_FACTORS, getEstado } from "../lib/constants";
import { genINF01, genINF07Cierre, genLegajoCompleto, genROS } from "../lib/reports";
import { authHeaders } from "../lib/session";
import { gzipPayload, serverLoadKV } from "../lib/sync";
import { C, T } from "../lib/theme";
import { fileToBase64, fmtM, parseFechaAR, safeArr, segColor, todayStr, uid } from "../lib/utils";
import { VIGENCIA_DOCS, vencimientosDeLegajo } from "../lib/vencimientos";
import { listarDocumentos, subirDocumento, urlDescarga, borrarDocumento, fmtTamano, MAX_MB } from "../lib/documentos";

// El <input type="date"> habla ISO; el resto de la app guarda es-AR (DD/MM/AAAA)
function aISO(fechaAR) {
  var f = parseFechaAR(fechaAR);
  if (!f) return '';
  return f.getFullYear() + '-' + String(f.getMonth()+1).padStart(2,'0') + '-' + String(f.getDate()).padStart(2,'0');
}
function deISO(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  if (p.length !== 3) return '';
  return Number(p[2]) + '/' + Number(p[1]) + '/' + p[0];
}

// ── Filtros persistentes en la sesión ────────────────────────────────────────
// El shell remonta LegajosView cada vez que se navega (key={'leg-'+legTarget}),
// así que el estado de filtros se perdía al ir y volver. sessionStorage los
// mantiene mientras dure la pestaña, sin ensuciar Supabase ni el legajo.
var FILTROS_KEY = 'rebit_legajos_filtros_v3';
function leerFiltros() {
  try { var raw = window.sessionStorage.getItem(FILTROS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch(e) { return {}; }
}
function guardarFiltros(f) {
  try { window.sessionStorage.setItem(FILTROS_KEY, JSON.stringify(f)); } catch(e) {}
}

function LegajosView(props) {
  var legajos=props.legajos, setLegajos=props.setLegajos, periodos=props.periodos, setPeriodos=props.setPeriodos, onAnalizar=props.onAnalizar, onReport=props.onReport, onSync=props.onSync||function(){}, currentUser=props.currentUser||{rol:'analista'};
  var ultScreening = props.ultScreening || null;
  var casos = props.casos || [];

  // ── Documentos adjuntos (T7b) ──────────────────────────────────────────────
  var docsState = useState([]); var docs=docsState[0]; var setDocs=docsState[1];
  var subiendoState = useState(''); var subiendo=subiendoState[0]; var setSubiendo=subiendoState[1];
  var docFileRef = useRef(null);
  var docTipoRef = useRef('');

  // Se cargan al abrir un legajo (editando o en el drawer)
  var legajoAbiertoId = (form && form.id) || (sel && sel.id) || null;
  useEffect(function(){
    if (!legajoAbiertoId) { setDocs([]); return; }
    var vivo = true;
    listarDocumentos(legajoAbiertoId).then(function(d){ if (vivo) setDocs(d); });
    return function(){ vivo = false; };
  }, [legajoAbiertoId]);

  async function onSubirDoc(file, tipo) {
    if (!file || !legajoAbiertoId) return;
    setSubiendo(tipo || 'general');
    try {
      // Si el ítem ya tiene fecha cargada a mano, se respeta; si no, queda vacía
      // y se puede completar después desde el propio checklist.
      var fechaDoc = ((form && form.checklistFechas) || {})[tipo] || '';
      await subirDocumento({
        file: file, legajoId: legajoAbiertoId, tipo: tipo || '',
        fechaDoc: fechaDoc, usuario: currentUser.nombre || 'N/D'
      });
      var frescos = await listarDocumentos(legajoAbiertoId);
      setDocs(frescos);
      auditLog(currentUser, 'subir_documento', 'legajo', legajoAbiertoId, { tipo: tipo || 'general', archivo: file.name });
      toast('✓ ' + file.name + ' adjuntado.');
    } catch(e) {
      toast(e.message);
    }
    setSubiendo('');
  }

  async function onDescargarDoc(d) {
    try {
      var url = await urlDescarga(d.path);
      window.open(url, '_blank', 'noopener');
    } catch(e) { toast(e.message); }
  }

  async function onBorrarDoc(d) {
    if (!(await uiConfirm('Eliminar "' + d.nombre + '" (versión ' + d.version + ')?\n\nSe borra el archivo y su registro. No se puede deshacer.', {danger:true, confirmLabel:'Eliminar'}))) return;
    var ok = await borrarDocumento(d.id, d.path);
    if (!ok) { toast('No se pudo eliminar.'); return; }
    setDocs(await listarDocumentos(legajoAbiertoId));
    auditLog(currentUser, 'eliminar_documento', 'legajo', legajoAbiertoId, { archivo: d.nombre, version: d.version });
  }

  // ── Export de legajo completo (T7) ─────────────────────────────────────────
  // Los RFIs viven en KV y no están en memoria: se cargan al momento de generar
  // para que el expediente no salga incompleto sin avisar.
  var expState = useState(false); var exportando=expState[0]; var setExportando=expState[1];

  async function exportarLegajoCompleto(leg) {
    setExportando(true);
    try {
      var rfis = [];
      try {
        var kv = await serverLoadKV('rfi_' + leg.id);
        if (Array.isArray(kv)) rfis = kv;
      } catch(e) { /* sin RFIs registrados */ }

      // Señales por período, con el mismo criterio único que el resto de la app
      var senalesPorPeriodo = {};
      periodos.filter(function(p){ return p.legajoId === leg.id; }).forEach(function(p){
        senalesPorPeriodo[p.id] = senalesActivas(p, leg, periodos);
      });

      // Los adjuntos pueden no estar cargados si se exporta desde la tabla
      var docsLeg = docs.length && docs[0].legajo_id === leg.id ? docs : await listarDocumentos(leg.id);

      var html = genLegajoCompleto({
        legajo: leg,
        documentos: docsLeg,
        periodos: periodos,
        casos: casos,
        rfis: rfis,
        screening: ultScreening,
        vencimientos: vencimientosDeLegajo(leg, periodos),
        usuario: currentUser,
        senalesPorPeriodo: senalesPorPeriodo,
      });
      onReport(html);
      auditLog(currentUser, 'exportar_legajo_completo', 'legajo', leg.id, {
        razonSocial: leg.razonSocial, periodos: Object.keys(senalesPorPeriodo).length, casos: casos.filter(function(c){return c.legajoId===leg.id;}).length
      });
    } catch(e) {
      toast('No se pudo generar el legajo: ' + e.message);
    }
    setExportando(false);
  }
  var selState = useState(props.initSelId||null); var selId = selState[0]; var setSelId = selState[1];
  var editState = useState(false); var editing = editState[0]; var setEditing = editState[1];
  var formState = useState(null); var form = formState[0]; var setForm = formState[1];
  var uploadingState = useState(false); var uploading = uploadingState[0]; var setUploading = uploadingState[1];
  var uploadMsgState = useState(''); var uploadMsg = uploadMsgState[0]; var setUploadMsg = uploadMsgState[1];
  var uploadPctState = useState(0); var uploadPct = uploadPctState[0]; var setUploadPct = uploadPctState[1];
  var iaFieldsState = useState(null); var iaFields = iaFieldsState[0]; var setIaFields = iaFieldsState[1];
  var tabState = useState('datos'); var tab = tabState[0]; var setTab = tabState[1];
  var searchState = useState(function(){ return leerFiltros().search || ''; }); var search=searchState[0]; var setSearch=searchState[1];
  var sortState = useState(function(){ return leerFiltros().sort || {k:'razonSocial',d:1}; }); var sortBy=sortState[0]; var setSortBy=sortState[1];

  // Drawer: Esc cierra el detalle (nunca en edición, para no perder datos)
  useEffect(function() {
    function onKey(e) {
      if (e.key === 'Escape' && selId && !editing) setSelId(null);
    }
    window.addEventListener('keydown', onKey);
    return function(){ window.removeEventListener('keydown', onKey); };
  }, [selId, editing]);
  var filtroSegState = useState(function(){ return leerFiltros().seg || 'TODOS'; }); var filtroSeg=filtroSegState[0]; var setFiltroSeg=filtroSegState[1];
  var filtroDictState = useState(function(){ return leerFiltros().dict || 'TODOS'; }); var filtroDict=filtroDictState[0]; var setFiltroDict=filtroDictState[1];
  var filtroEstState = useState(function(){ return leerFiltros().est || 'TODOS'; }); var filtroEst=filtroEstState[0]; var setFiltroEst=filtroEstState[1];

  // Persistencia de filtros y orden mientras dure la sesión del navegador
  useEffect(function() {
    guardarFiltros({ search:search, seg:filtroSeg, dict:filtroDict, est:filtroEst, sort:sortBy });
  }, [search, filtroSeg, filtroDict, filtroEst, sortBy]);
  var selectedState = useState([]); var selected=selectedState[0]; var setSelected=selectedState[1];
  var selectModeState = useState(false); var selectMode=selectModeState[0]; var setSelectMode=selectModeState[1];
  var menuOpenState = useState(null); var menuOpen=menuOpenState[0]; var setMenuOpen=menuOpenState[1];
  var cierreOpenState = useState(false); var cierreOpen=cierreOpenState[0]; var setCierreOpen=cierreOpenState[1];
  var cierreMotState = useState(''); var cierreMot=cierreMotState[0]; var setCierreMot=cierreMotState[1];
  var cierreTipoState = useState('RIESGO_AML'); var cierreTipo=cierreTipoState[0]; var setCierreTipo=cierreTipoState[1];
  var cierreIAState = useState(''); var cierreIA=cierreIAState[0]; var setCierreIA=cierreIAState[1];
  var cierreLoadingState = useState(false); var cierreLoading=cierreLoadingState[0]; var setCierreLoading=cierreLoadingState[1];
  // ROS Borrador
  var rosOpenState = useState(false); var rosOpen=rosOpenState[0]; var setRosOpen=rosOpenState[1];
  var rosSelPerState = useState([]); var rosSelPer=rosSelPerState[0]; var setRosSelPer=rosSelPerState[1];
  var rosNumState = useState(null); var rosNum=rosNumState[0]; var setRosNum=rosNumState[1];
  // Screening
  var screeningLoadingState = useState(false); var screeningLoading=screeningLoadingState[0]; var setScreeningLoading=screeningLoadingState[1];
  var fileRef = useRef();
  var sel = legajos.find(function(l){return l.id===selId;});

  function mkNew() {
    var cl = {}; CHECKLIST_ITEMS.forEach(function(item){cl[item]='Pendiente';});
    var kybSc = {}; KYB_FACTORS.forEach(function(f){kybSc[f]=2;});
    return { id:uid(), razonSocial:'', cuit:'', actividad:'', facturacionMensual:0, limiteDiario:0, limiteMensual:0, segmento:'MEDIO', dictamen:'CONDICIONAL', beneficiarioFinal:'', domicilio:'',
      representanteLegal:'', presidente:'', vinculados:'', tipoSociedad:'SA', paisConstitucion:'Argentina', cotizaBolsa:false, grupoEconomico:'',
      limitesHistorial:[],
      checklist:cl, kybScores:kybSc, redFlags:[], observaciones:[], docsIA:[], createdAt:todayStr(), estadoCuenta:'EN_ONBOARDING', estadoCuentaUpdatedAt:todayStr(), estadoHistorial:[{estado:'EN_ONBOARDING', fecha:todayStr(), hora:new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}), analista:'Sistema'}] };
  }
  function saveList(updated) { setLegajos(updated); onSync(updated, periodos); }
  async function handleSave() {
    console.log('[Rebit] Guardando legajo:', form.razonSocial, form.cuit, form);
    if (!form.razonSocial && !form.cuit) {
      if (!(await uiConfirm('Este legajo no tiene Razón Social ni CUIT cargados.\n\nSi ya subiste los documentos pero los campos están vacíos, puede que la extracción IA haya fallado — verificá tu API key.\n\n¿Guardar igual?', {danger:false, confirmLabel:'Guardar igual'}))) return;
    }
    var exists = legajos.find(function(l){return l.id===form.id;});
    var updated = exists ? legajos.map(function(l){return l.id===form.id?form:l;}) : legajos.concat([form]);
    saveList(updated); setEditing(false); setSelId(form.id); setForm(null); setIaFields(null);
    // Audit trail
    auditLog(currentUser, exists ? 'modificar_legajo' : 'crear_legajo', 'legajo', form.id, {
      razonSocial: form.razonSocial, cuit: form.cuit, segmento: form.segmento, dictamen: form.dictamen
    });
  }

  function fld(key, val) { setForm(function(prev){ var n=Object.assign({},prev); n[key]=val; return n; }); }
  // Fecha de emisión/actualización del documento — alimenta el calendario de
  // vencimientos (T4). Si no se carga, el motor usa la última actualización del
  // legajo como estimación y lo marca como tal.
  function setClFecha(item, val) { setForm(function(prev){ var n=Object.assign({},prev); n.checklistFechas=Object.assign({},prev.checklistFechas||{}); if(val){n.checklistFechas[item]=val;}else{delete n.checklistFechas[item];} return n; }); }
  function setClItem(item, val) { setForm(function(prev){ var n=Object.assign({},prev); n.checklist=Object.assign({},prev.checklist||{}); n.checklist[item]=val; return n; }); }
  function setKybSc(factor, val) { setForm(function(prev){ var n=Object.assign({},prev); n.kybScores=Object.assign({},prev.kybScores||{}); n.kybScores[factor]=Number(val); return n; }); }

  // Cambiar estado de cuenta con historial — usable desde form O directamente sobre un legajo guardado
  function cambiarEstadoLegajo(legajo, nuevoEstado, analista) {
    var ahora = new Date();
    var hora = ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    var nombreAnalista = analista || (currentUser && currentUser.nombre) || 'Analista';
    var entrada = { estado:nuevoEstado, fecha:todayStr(), hora:hora, analista:nombreAnalista };
    var historial = (legajo.estadoHistorial||[]).concat([entrada]);
    // Audit trail
    auditLog(currentUser, 'cambiar_estado', 'legajo', legajo.id, {
      razonSocial: legajo.razonSocial, estadoAnterior: legajo.estadoCuenta, estadoNuevo: nuevoEstado
    });
    return Object.assign({}, legajo, { estadoCuenta:nuevoEstado, estadoCuentaUpdatedAt:todayStr(), estadoHistorial:historial });
  }

  // Cambio rápido de estado desde la lista (sin abrir formulario)
  function cambioRapidoEstado(legajo, nuevoEstado) {
    var updated = cambiarEstadoLegajo(legajo, nuevoEstado, currentUser&&currentUser.nombre||'Analista');
    saveList(legajos.map(function(l){return l.id===legajo.id?updated:l;}));
    if (selId === legajo.id) setSelId(legajo.id);
  }

  // ── PDF.js: extraer texto del PDF en el browser (evita enviar binarios pesados a Claude)
  async function loadPDFJS() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    return window.pdfjsLib;
  }

  // Un PDF "con texto" puede tener capa de texto SOLO en la carátula. Pasa
  // siempre con las reproducciones certificadas digitalmente: la certificación
  // es texto, las páginas escaneadas del documento no. Por eso no alcanza con
  // mirar el total de caracteres — hay que mirar la DENSIDAD por página.
  //
  // Referencia: un PDF nativo rinde 1.500–3.000 caracteres por página. Un
  // escaneo con carátula certificada ronda los 50.
  var DENSIDAD_MIN  = 250;   // caracteres por página para considerarlo texto real
  var COBERTURA_MIN = 0.5;   // proporción de páginas que deben tener texto propio
  var MAX_PAGS_IMG  = 10;    // páginas a rasterizar cuando es escaneo

  async function pdfFileToText(file) {
    try {
      var lib = await loadPDFJS();
      if (!lib) return null;
      var buf = await file.arrayBuffer();
      var pdf = await lib.getDocument({ data: buf }).promise;
      var pages = [];
      var maxPg = Math.min(pdf.numPages, 15);
      for (var p = 1; p <= maxPg; p++) {
        var pg = await pdf.getPage(p);
        var ct = await pg.getTextContent();
        pages.push(ct.items.map(function(i){ return i.str; }).join(' '));
      }
      var txt = pages.join('\n\n').replace(/\s+/g, ' ').trim();
      // Cuántas de las páginas muestreadas tienen texto propio. La densidad
      // promedio sola no distingue "una carátula cargada + 19 páginas vacías"
      // de "20 páginas con poco texto"; la cobertura sí.
      var conTexto = pages.filter(function(t){ return t.replace(/\s+/g,' ').trim().length > 100; }).length;
      return {
        texto: txt,
        paginas: pdf.numPages,
        muestreadas: maxPg,
        densidad: maxPg > 0 ? Math.round(txt.length / maxPg) : 0,
        cobertura: maxPg > 0 ? conTexto / maxPg : 0
      };
    } catch(e) {
      console.warn('[Rebit IA] PDF.js error en ' + file.name + ':', e.message);
      return null;
    }
  }

  // PDF escaneado → imágenes JPEG comprimidas (de ~3MB a ~300KB por página)
  async function pdfToImages(file) {
    try {
      var lib = await loadPDFJS();
      if (!lib) return null;
      var buf = await file.arrayBuffer();
      var pdf = await lib.getDocument({ data: buf }).promise;
      var images = [];
      var maxPags = Math.min(pdf.numPages, MAX_PAGS_IMG);
      for (var p = 1; p <= maxPags; p++) {
        var page = await pdf.getPage(p);
        var vp = page.getViewport({ scale: 1.0 });
        var targetW = Math.min(vp.width, 1000); // reducir resolución
        var scale = targetW / vp.width;
        var scaledVp = page.getViewport({ scale: scale });
        var canvas = document.createElement('canvas');
        canvas.width = scaledVp.width;
        canvas.height = scaledVp.height;
        var ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: scaledVp }).promise;
        var dataUrl = canvas.toDataURL('image/jpeg', 0.65); // JPEG 65% ~200-400KB
        images.push(dataUrl.split(',')[1]);
      }
      return images.length > 0 ? images : null;
    } catch(e) {
      console.warn('[Rebit IA] PDF→imagen error en ' + file.name + ':', e.message);
      return null;
    }
  }

  async function handleUpload(e) {
    var files = Array.from(e.target.files).filter(function(f){
      return f.type==='application/pdf' || f.type.startsWith('image/');
    }).slice(0,25);
    if (!files.length) return;

    // Validar tamaño total — API acepta hasta ~100MB total de documentos
    var totalMB = files.reduce(function(s,f){return s+f.size;},0) / (1024*1024);
    if (totalMB > 90) {
      toast('Los documentos seleccionados pesan ' + totalMB.toFixed(1) + 'MB en total.\nEl límite es 90MB por análisis. Seleccioná menos documentos o usá versiones más livianas.');
      return;
    }

    setUploading(true); setUploadPct(0);
    setUploadMsg('Leyendo ' + files.length + ' documento(s) (' + totalMB.toFixed(1) + 'MB)...');

    try {
      // Convertir todos los archivos a base64 primero
      setUploadPct(15);
      setUploadMsg('Convirtiendo ' + files.length + ' documentos...');

      var contentBlocks = [];
      var docsTruncados = [];   // documentos escaneados que no entraron completos
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        setUploadMsg('Preparando doc ' + (i+1) + ' de ' + files.length + ': ' + f.name);
        setUploadPct(15 + Math.round((i / files.length) * 35));
        if (f.type === 'application/pdf') {
          // Primero intentar extraer texto con PDF.js (rápido: ~5KB en vez de 3.5MB)
          var info = await pdfFileToText(f);
          var hayTextoReal = info && info.texto.length > 80
                          && info.densidad >= DENSIDAD_MIN
                          && info.cobertura >= COBERTURA_MIN;
          if (hayTextoReal) {
            // PDF con texto seleccionable: enviar como texto (Claude responde en 3-5s)
            contentBlocks.push({ type:'text', text:'=== ' + f.name + ' ===\n' + info.texto.slice(0, 6000), _isDoc: true });
            console.log('[Rebit IA] PDF texto OK: ' + f.name + ' (' + info.texto.length + ' chars, ' +
                        info.densidad + ' por pág., ' + Math.round(info.cobertura*100) + '% de páginas con texto)');
          } else {
            // Escaneo, o PDF cuya capa de texto es solo la carátula de
            // certificación: rasterizar las páginas para que el modelo LEA el
            // documento en vez de la carátula.
            if (info && info.texto.length > 80) {
              console.log('[Rebit IA] PDF con capa de texto parcial: ' + f.name + ' (' +
                          info.densidad + ' chars/pág., ' + Math.round(info.cobertura*100) +
                          '% de páginas con texto) → se rasteriza');
            }
            var pdfImgs = await pdfToImages(f);
            if (pdfImgs && pdfImgs.length > 0) {
              pdfImgs.forEach(function(imgB64) {
                contentBlocks.push({ type:'image', source:{ type:'base64', media_type:'image/jpeg', data:imgB64 }, _fromPDF: true });
              });
              // El texto de la carátula igual aporta (fecha, escribano, folios)
              if (info && info.texto.length > 80) {
                contentBlocks.push({ type:'text', text:'=== ' + f.name + ' (capa de texto / certificación) ===\n' + info.texto.slice(0, 2000), _isDoc: true });
              }
              if (info && info.paginas > pdfImgs.length) {
                docsTruncados.push({ nombre: f.name, enviadas: pdfImgs.length, total: info.paginas });
              }
              console.log('[Rebit IA] PDF→' + pdfImgs.length + ' de ' + ((info&&info.paginas)||'?') + ' páginas como JPEG: ' + f.name);
            } else {
              // Último recurso: binario (puede fallar si es muy grande)
              var b64 = await fileToBase64(f);
              contentBlocks.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 }, title:f.name });
              console.log('[Rebit IA] PDF binario fallback: ' + f.name);
            }
          }
        } else if (f.type.startsWith('image/')) {
          var b64 = await fileToBase64(f);
          contentBlocks.push({ type:'image', source:{ type:'base64', media_type:f.type, data:b64 } });
        }
        contentBlocks.push({ type:'text', text:'[Doc ' + (i+1) + ' de ' + files.length + ': ' + f.name + ']' });
      }

      setUploadPct(55);
      setUploadMsg('Analizando ' + files.length + ' documentos con IA — procesando en lotes, puede tardar unos minutos...');

      // Llamar al proveedor seleccionado
      var provider = _KEYS.provider || 'claude';
      var extracted;
      if (provider === 'openai') {
        // Para GPT pasamos los content blocks SIN el prompt (lo agrega extractWithGPT)
        extracted = await extractWithGPT(contentBlocks);
      } else {
        // extractWithClaude ya tiene el prompt embebido en contentBlocks
        extracted = await extractWithClaude(contentBlocks);
      }

      setUploadPct(90);
      // Informar documentos omitidos si los hubo (proceso resiliente)
      if (extracted && extracted._docsFallidos && extracted._docsFallidos.length > 0) {
        var omitidos = extracted._docsFallidos;
        toast('⚠ Extracción completada parcialmente.\n\n'
          + (files.length - omitidos.length) + ' de ' + files.length + ' documentos procesados correctamente.\n\n'
          + 'Documentos omitidos por timeout (podés reintentarlos subiéndolos solos):\n• '
          + omitidos.join('\n• '));
        delete extracted._docsFallidos;
      }
      setUploadMsg('Completando campos del legajo...');

      var docNames = files.map(function(f){return f.name;});

      console.log('[Rebit IA] extracted.razonSocial:', extracted.razonSocial);
      console.log('[Rebit IA] extracted.cuit:', extracted.cuit);
      console.log('[Rebit IA] extracted completo:', extracted);

      // Calcular qué campos fueron efectivamente llenados por IA
      var filledFields = [];
      var datosKeys = ['razonSocial','cuit','actividad','facturacionMensual','limiteDiario','limiteMensual','beneficiarioFinal','domicilio','segmento','dictamen','representanteLegal','presidente','vinculados','tipoSociedad','paisConstitucion','grupoEconomico'];
      datosKeys.forEach(function(k){ if(extracted[k]!==undefined&&extracted[k]!==''&&extracted[k]!==0) filledFields.push(k); });
      var okChecklist = Object.values(extracted.checklist||{}).filter(function(v){return v==='OK';}).length;
      var bloqChecklist = Object.values(extracted.checklist||{}).filter(function(v){return v==='Bloqueante';}).length;
      var kybFilled = Object.values(extracted.kybScores||{}).filter(function(v){return Number(v)>0;}).length;
      var rfCount = safeArr(extracted.redFlags).length;

      setIaFields({
        filled: filledFields,
        okChecklist: okChecklist,
        bloqChecklist: bloqChecklist,
        kybFilled: kybFilled,
        rfCount: rfCount,
        segmento: extracted.segmento,
        dictamen: extracted.dictamen,
        truncados: docsTruncados
      });

      setForm(function(prev){
        var n = Object.assign({}, prev, extracted);
        if (!n.checklist) n.checklist = {};
        CHECKLIST_ITEMS.forEach(function(item){ if(!n.checklist[item]) n.checklist[item]='Pendiente'; });
        if (!n.kybScores) n.kybScores = {};
        KYB_FACTORS.forEach(function(f){ if(!n.kybScores[f]) n.kybScores[f]=2; });
        n.docsIA = docNames;
        return n;
      });

      setUploadPct(100);
      setUploadMsg('✅ ' + files.length + ' docs analizados · ' + filledFields.length + ' campos completados · ' + okChecklist + ' docs OK en checklist');
      setTab('resumen_ia');

    } catch(err) {
      setUploadMsg('❌ Error: ' + err.message);
      var msg = err.message || '';
      var isRateLimit = msg.indexOf('rate limit') >= 0 || msg.indexOf('rate_limit') >= 0 || msg.indexOf('tokens per minute') >= 0 || msg.indexOf('overloaded') >= 0;
      var isBilling = msg.indexOf('quota') >= 0 || msg.indexOf('billing') >= 0 || msg.indexOf('balance') >= 0 || (msg.indexOf('credit') >= 0 && msg.indexOf('credit') < 50);
      var isModelAccess = msg.indexOf('does not have access to model') >= 0 || msg.indexOf('model_not_found') >= 0;
      if (isRateLimit) {
        toast('⏱ Límite de velocidad del API (Rate Limit)\n\n' + msg + '\n\n─────────────────\nEl API de Claude tiene un límite de 30,000 tokens por minuto en cuentas nuevas.\nCon 25 PDFs grandes se supera ese límite fácilmente.\n\nSoluciones:\n• Subí menos documentos a la vez (empezá con 3-5 PDFs)\n• Esperá 60 segundos y volvé a intentar\n• Considerá upgradear el plan en console.anthropic.com');
      } else if (isBilling) {
        toast('💳 Sin créditos en la API\n\n' + msg + '\n\n─────────────────\nPara resolverlo:\n• Anthropic → console.anthropic.com/settings/billing\n• OpenAI → platform.openai.com/settings/billing');
      } else if (isModelAccess) {
        toast('🔒 El proyecto no tiene acceso al modelo solicitado.\n\n' + msg + '\n\n─────────────────\nVerificá la configuración en platform.openai.com/settings o console.anthropic.com');
      } else {
        toast('❌ Error en la extracción IA:\n\n' + msg + '\n\nPodés cargar el legajo manualmente usando la tab 📋 Datos.');
      }
    }
    setUploading(false); e.target.value = '';
  }

  var iS = {width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 9px',fontSize:13};
  var btnB = {background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'8px 18px',cursor:'pointer',fontWeight:700,fontSize:13};
  var btnG = {background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'8px 18px',cursor:'pointer',fontWeight:700,fontSize:13};
  var btnR = {background:'rgba(255,68,85,0.15)',color:T.RED,border:'1px solid rgba(255,68,85,0.3)',borderRadius:3,padding:'7px 14px',cursor:'pointer',fontWeight:600,fontSize:12};

  if (editing && form) {
    var scVals = KYB_FACTORS.map(function(f){return Number((form.kybScores||{})[f])||0;}).filter(function(v){return v>0;});
    var scProm = scVals.length > 0 ? (scVals.reduce(function(a,b){return a+b;},0)/scVals.length).toFixed(2) : 'N/D';
    return (
      <div style={{padding:22,maxWidth:900}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <h2 style={{fontSize:14,fontWeight:600,color:T.TEXT,letterSpacing:'1px',margin:0}}>{legajos.find(function(l){return l.id===form.id;}) ? 'Editar Legajo' : 'Nuevo Legajo KYB'}</h2>
            {!legajos.find(function(l){return l.id===form.id;}) && <div style={{fontSize:12,color:T.TEXT2,marginTop:3}}>Paso 1: subí los documentos → Paso 2: revisá los datos → Paso 3: guardá</div>}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={handleSave} style={btnG}>💾 Guardar</button>
            <button onClick={function(){setEditing(false);setForm(null);}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 14px',cursor:'pointer',fontWeight:600,fontSize:12,}}>Cancelar</button>
          </div>
        </div>
        <div style={{display:'flex',gap:2,marginBottom:14,background:T.BG3,borderRadius:4,padding:4,border:'1px solid '+T.BORDER}}>
          {[
            ['resumen_ia', iaFields ? '🤖 Resumen IA' : '📄 Docs IA'],
            ['datos', '📋 Datos' + (iaFields && iaFields.filled.length > 0 ? ' ✓' : '')],
            ['checklist', '✅ Checklist' + (iaFields && iaFields.okChecklist > 0 ? ' ✓' : '')],
            ['scoring', '📊 Scoring' + (iaFields && iaFields.kybFilled > 0 ? ' ✓' : '')],
            ['flags', '🚩 Red Flags' + (iaFields && iaFields.rfCount > 0 ? ' ('+iaFields.rfCount+')' : '')],
            ['historial', '🕐 Historial'],
            ['screening', '🛡 Screening' + (form.screening ? (form.screening.estadoGeneral==='LIMPIO'?' ✅':form.screening.estadoGeneral==='COINCIDENCIA'?' 🔴':' 🟡') : '')]
          ].map(function(t){return(
            <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{flex:1,padding:'7px 4px',border:'none',borderRadius:4,cursor:'pointer',fontWeight:tab===t[0]?700:400,background:tab===t[0]?'rgba(59,109,170,0.15)':'transparent',color:tab===t[0]?T.CYAN:T.TEXT2,borderBottom:tab===t[0]?'2px solid '+C.AC:'2px solid transparent',fontFamily:T.MONO,fontSize:11,letterSpacing:'0.5px',whiteSpace:'nowrap'}}>{t[1]}</button>
          );})}
        </div>
        {tab === 'resumen_ia' ? <div>
          <input ref={fileRef} type="file" multiple accept=".pdf,image/*" onChange={handleUpload} style={{display:'none'}}/>

          {/* MODO MANUAL — siempre disponible */}
          {!iaFields && !uploading ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
            <div onClick={function(){if(!uploading)fileRef.current.click();}} style={{border:'2px dashed '+C.AC,borderRadius:8,padding:'20px 16px',textAlign:'center',cursor:'pointer',background:T.BG3}}>
              <div style={{fontSize:26,marginBottom:6}}>🤖</div>
              <div style={{fontSize:13,color:T.TEXT,fontWeight:600,marginBottom:4}}>Extracción automática IA</div>
              <div style={{fontSize:11,color:T.TEXT2,lineHeight:1.5}}>Subí hasta 25 PDFs e imágenes. Claude o GPT-4o extraen los datos automáticamente.</div>
              <div style={{marginTop:10,background:C.AC,color:'white',borderRadius:4,padding:'6px 0',fontSize:12,fontWeight:700}}>📂 Seleccionar documentos</div>
              <div style={{fontSize:10,color:T.TEXT3,marginTop:6}}>Requiere créditos en Anthropic o OpenAI</div>
            </div>
            <div onClick={function(){setTab('datos');}} style={{border:'1px solid rgba(0,230,118,0.4)',borderRadius:8,padding:'20px 16px',textAlign:'center',cursor:'pointer',background:'rgba(0,214,143,0.06)'}}>
              <div style={{fontSize:26,marginBottom:6}}>✍️</div>
              <div style={{fontSize:13,color:T.TEXT,fontWeight:600,marginBottom:4}}>Carga manual</div>
              <div style={{fontSize:11,color:T.TEXT2,lineHeight:1.5}}>Completá los campos a mano. Podés hacerlo ahora y usar IA después cuando tengas créditos.</div>
              <div style={{marginTop:10,background:C.VERDE,color:T.ON_SEMANTIC,borderRadius:4,padding:'6px 0',fontSize:12,fontWeight:700}}>📋 Ir a Datos →</div>
              <div style={{fontSize:10,color:T.TEXT3,marginTop:6}}>Sin API key requerida</div>
            </div>
          </div> : null}

          {/* ZONA DE UPLOAD cuando ya hay resultado o está cargando */}
          {(iaFields || uploading) ? <div onClick={function(){if(!uploading)fileRef.current.click();}} style={{border:'2px dashed '+C.AC,borderRadius:8,padding:'20px',textAlign:'center',cursor:uploading?'wait':'pointer',background:uploading?T.BG2:'rgba(0,214,143,0.06)',marginBottom:12}}>
            <div style={{fontSize:24,marginBottom:4}}>{uploading?'⏳':'✅'}</div>
            <div style={{fontSize:13,color:T.CYAN,fontWeight:700}}>{uploading?uploadMsg:'Documentos analizados · Clic para re-analizar con nuevos docs'}</div>
          </div> : null}

          {uploading && <div style={{background:T.BG3,borderRadius:4,height:8,marginBottom:12}}><div style={{height:'100%',width:uploadPct+'%',background:C.AC,borderRadius:4,transition:'width 0.4s'}}/></div>}

          {/* RESUMEN DE LO EXTRAÍDO */}
          {iaFields && !uploading ? <div>
            <div style={{background:'rgba(0,230,118,0.08)',borderRadius:6,padding:'14px 18px',marginBottom:14,color:'white',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>🤖 Extracción IA completada</div>
                <div style={{fontSize:12,opacity:0.8}}>{safeArr(form.docsIA).length} documento(s) procesado(s)</div>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                {iaFields.segmento && <span style={{background:segColor(iaFields.segmento),borderRadius:4,padding:'3px 10px',fontWeight:700,fontSize:12}}>{iaFields.segmento}</span>}
                {iaFields.dictamen && <span style={{background:iaFields.dictamen==='APROBADO'?C.VERDE:iaFields.dictamen==='CONDICIONAL'?C.NARANJA:C.ROJO,borderRadius:4,padding:'3px 10px',fontWeight:700,fontSize:12}}>{iaFields.dictamen}</span>}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
              {[
                {icon:'📋',label:'Campos datos',val:iaFields.filled.length,max:10,col:C.AC},
                {icon:'✅',label:'Docs en checklist',val:iaFields.okChecklist,max:15,col:C.VERDE},
                {icon:'📊',label:'Factores scoring',val:iaFields.kybFilled,max:7,col:T.ACCENT},
                {icon:'🚩',label:'Red flags',val:iaFields.rfCount,max:null,col:iaFields.rfCount>0?C.ROJO:'#888'}
              ].map(function(stat,i){return(
                <div key={i} style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:6,padding:'12px 14px',textAlign:'center',borderTop:'3px solid '+stat.col}}>
                  <div style={{fontSize:20}}>{stat.icon}</div>
                  <div style={{fontSize:18,fontWeight:600,color:stat.col,margin:'4px 0',fontFamily:T.MONO}}>{stat.val}{stat.max?<span style={{fontSize:12,color:T.TEXT3,fontWeight:400}}>/{stat.max}</span>:''}</div>
                  <div style={{fontSize:11,color:T.TEXT2}}>{stat.label}</div>
                </div>
              );})}
            </div>

            {/* Documentos que no entraron completos — sin esto, un "No
                identificado" parece un dato en vez de una lectura parcial */}
            {safeArr(iaFields.truncados).length > 0 && (
              <div style={{background:'rgba(255,184,48,0.08)',border:'1px solid rgba(255,184,48,0.35)',borderLeft:'3px solid '+T.AMBER,borderRadius:T.RADIUS.md,padding:'12px 14px',marginBottom:10}}>
                <div style={{fontWeight:700,color:T.AMBER,fontSize:12,marginBottom:6}}>⚠ Documentos escaneados leídos parcialmente</div>
                <div style={{fontSize:11.5,color:T.TEXT2,lineHeight:1.6,marginBottom:8}}>
                  Estos PDF no tienen texto seleccionable, así que se leyeron como imágenes y solo entraron
                  las primeras páginas. Si falta el presidente, el directorio o el beneficiario final,
                  probablemente estén en las páginas que no se enviaron.
                </div>
                {iaFields.truncados.map(function(d,i){
                  return (
                    <div key={i} style={{fontSize:11,color:T.TEXT2,fontFamily:T.MONO,padding:'2px 0'}}>
                      · {d.nombre} — {d.enviadas} de {d.total} páginas
                    </div>
                  );
                })}
                <div style={{fontSize:11,color:T.TEXT3,marginTop:8,lineHeight:1.55}}>
                  Alternativa: subí por separado la parte del documento donde figuran las autoridades
                  (por ejemplo el acta de designación), o completá esos campos en la pestaña Datos.
                </div>
              </div>
            )}

            {/* Campos completados */}
            {iaFields.filled.length > 0 && <div style={{background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.2)',borderRadius:6,padding:'12px 14px',marginBottom:10}}>
              <div style={{fontWeight:700,color:T.GREEN,fontSize:12,marginBottom:8}}>✅ Campos completados automáticamente:</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
                {iaFields.filled.map(function(f,i){
                  var labels = {razonSocial:'Razón Social',cuit:'CUIT',actividad:'Actividad',facturacionMensual:'Facturación',limiteDiario:'Límite Diario',limiteMensual:'Límite Mensual',beneficiarioFinal:'Beneficiario Final',domicilio:'Domicilio',segmento:'Segmento',dictamen:'Dictamen'};
                  return <span key={i} style={{background:T.GREEN,color:T.ON_SEMANTIC,borderRadius:4,padding:'3px 10px',fontSize:11,fontWeight:600}}>{labels[f]||f}</span>;
                })}
              </div>
              {/* Preview de los valores clave extraídos */}
              <div style={{background:T.BG2,borderRadius:4,padding:'10px 12px',border:'1px solid rgba(0,230,118,0.2)'}}>
                <div style={{fontWeight:700,color:T.GREEN,fontSize:11,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.5px'}}>Valores extraídos — revisá antes de guardar</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <tbody>
                    {[
                      ['Razón Social', form && (form.razonSocial||'—')],
                      ['CUIT', form && (form.cuit||'—')],
                      ['Tipo sociedad', form && (form.tipoSociedad||'SA')],
                      ['Actividad', form && (form.actividad||'—')],
                      ['Presidente / Gerente', form && (form.presidente||'—')],
                      ['Representante legal', form && (form.representanteLegal||'—')],
                      ['Beneficiario final', form && (form.beneficiarioFinal||'—')],
                      ['Domicilio fiscal', form && (form.domicilio||'—')],
                      ['Facturación mensual', form && form.facturacionMensual ? fmtM(form.facturacionMensual) : '—'],
                      ['Límite diario', form && form.limiteDiario ? fmtM(form.limiteDiario) : '—'],
                      ['Límite mensual', form && form.limiteMensual ? fmtM(form.limiteMensual) : '—'],
                      ['Segmento sugerido', form && (form.segmento||'—')],
                      ['Dictamen sugerido', form && (form.dictamen||'—')]
                    ].map(function(r,i){return(
                      <tr key={i} style={{borderBottom:'1px solid rgba(0,214,143,0.18)'}}>
                        <td style={{padding:'4px 8px 4px 0',color:T.TEXT2,fontWeight:600,width:'40%'}}>{r[0]}</td>
                        <td style={{padding:'4px 0',color:r[1]==='—'?T.TEXT3:T.TEXT,fontWeight:r[1]==='—'?400:700}}>{r[1]}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>}

            {/* Checklist summary */}
            {(iaFields.okChecklist > 0 || iaFields.bloqChecklist > 0) && <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'12px 14px',marginBottom:10}}>
              <div style={{fontWeight:700,color:T.CYAN,fontSize:12,marginBottom:6}}>✅ Checklist evaluado por IA:</div>
              <div style={{display:'flex',gap:16,fontSize:13}}>
                <span style={{color:T.GREEN,fontWeight:700}}>{iaFields.okChecklist} documentos OK</span>
                {iaFields.bloqChecklist > 0 && <span style={{color:T.RED,fontWeight:700}}>{iaFields.bloqChecklist} bloqueantes</span>}
                <span style={{color:T.TEXT2}}>{15 - iaFields.okChecklist - iaFields.bloqChecklist} pendientes</span>
              </div>
            </div>}

            {/* Red flags */}
            {safeArr(form.redFlags).length > 0 && <div style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.2)',borderRadius:6,padding:'12px 14px',marginBottom:10}}>
              <div style={{fontWeight:700,color:T.RED,fontSize:12,marginBottom:8}}>🚩 Red flags detectados por IA:</div>
              {form.redFlags.map(function(rf,i){return <div key={i} style={{fontSize:12,color:T.RED,padding:'3px 0',borderBottom:'1px solid rgba(255,68,85,0.18)'}}>• {rf}</div>;})}
            </div>}

            {/* Docs procesados */}
            <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'10px 14px',marginBottom:14}}>
              <div style={{fontWeight:600,color:T.TEXT,fontSize:11,marginBottom:6}}>📄 Documentos procesados ({safeArr(form.docsIA).length}):</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:2}}>
                {safeArr(form.docsIA).map(function(d,i){return <div key={i} style={{fontSize:11,color:T.TEXT2,padding:'2px 0'}}>✅ {d}</div>;})}
              </div>
            </div>

            <div style={{display:'flex',gap:8}}>
              <button onClick={function(){setTab('datos');}} style={{flex:1,background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'9px 0',cursor:'pointer',fontWeight:700,fontSize:13}}>📋 Revisar Datos →</button>
              <button onClick={function(){setTab('checklist');}} style={{flex:1,background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'9px 0',cursor:'pointer',fontWeight:700,fontSize:13}}>✅ Revisar Checklist →</button>
              <button onClick={function(){setTab('scoring');}} style={{flex:1,background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'9px 0',cursor:'pointer',fontWeight:700,fontSize:13}}>📊 Revisar Scoring →</button>
            </div>
          </div> : null}
        </div> : null}

        {tab === 'datos' ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {iaFields && iaFields.filled.length > 0 && <div style={{gridColumn:'1/-1',background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'8px 12px',fontSize:11,color:T.CYAN}}>
            🤖 Los campos marcados con <strong style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 6px',fontSize:10}}>IA</strong> fueron completados automáticamente. Revisá y corregí si es necesario antes de guardar.
          </div>}
          {[
            {key:'razonSocial',label:'Razon Social',type:'text',placeholder:''},
            {key:'cuit',label:'CUIT',type:'text',placeholder:'XX-XXXXXXXX-X'},
            {key:'actividad',label:'Actividad / Giro comercial',type:'text',placeholder:'',full:true},
            {key:'beneficiarioFinal',label:'Beneficiario final (>10%)',type:'text',placeholder:''},
            {key:'representanteLegal',label:'Representante legal / Apoderado',type:'text',placeholder:'Nombre completo y DNI/CUIT'},
            {key:'presidente',label:'Presidente / Gerente',type:'text',placeholder:'Nombre completo'},
            {key:'vinculados',label:'Otros directores / socios vinculados',type:'text',placeholder:'Nombres separados por coma',full:true},
            {key:'domicilio',label:'Domicilio fiscal',type:'text',placeholder:'',full:true},
            {key:'grupoEconomico',label:'Grupo económico',type:'text',placeholder:'Dejar vacío si no aplica'},
            {key:'facturacionMensual',label:'Facturacion mensual ($)',type:'number',placeholder:''},
            {key:'limiteDiario',label:'Limite diario ($)',type:'number',placeholder:''},
            {key:'limiteMensual',label:'Limite mensual ($)',type:'number',placeholder:''}
          ].map(function(fdef,i){
            var isIA = iaFields && iaFields.filled.indexOf(fdef.key) >= 0;
            return(
              <div key={i} style={fdef.full?{gridColumn:'1/-1'}:{}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                  <label style={{fontSize:11,color:T.TEXT2}}>{fdef.label}</label>
                  {isIA && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 5px',fontSize:9,fontWeight:700}}>IA</span>}
                </div>
                <input
                  type={fdef.type}
                  value={form[fdef.key]||''}
                  onChange={function(e){fld(fdef.key,e.target.value);}}
                  placeholder={fdef.placeholder}
                  style={Object.assign({},iS,isIA?{borderColor:C.AC,background:T.BG3}:{})}
                />
              </div>
            );
          })}
          <div>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
              <label style={{fontSize:11,color:T.TEXT2}}>Segmento de riesgo</label>
              {iaFields && iaFields.filled.indexOf('segmento')>=0 && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 5px',fontSize:9,fontWeight:700}}>IA</span>}
            </div>
            <select value={form.segmento} onChange={function(e){fld('segmento',e.target.value);}} style={Object.assign({},iS,iaFields&&iaFields.filled.indexOf('segmento')>=0?{borderColor:C.AC,background:T.BG3}:{})}>
              <option>BAJO</option><option>MEDIO</option><option>MEDIO-ALTO</option><option>ALTO</option>
            </select>
          </div>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
              <label style={{fontSize:11,color:T.TEXT2}}>Dictamen KYB</label>
              {iaFields && iaFields.filled.indexOf('dictamen')>=0 && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 5px',fontSize:9,fontWeight:700}}>IA</span>}
            </div>
            <select value={form.dictamen} onChange={function(e){fld('dictamen',e.target.value);}} style={Object.assign({},iS,iaFields&&iaFields.filled.indexOf('dictamen')>=0?{borderColor:C.AC,background:T.BG3}:{})}>
              <option>APROBADO</option><option>CONDICIONAL</option><option>RECHAZADO</option>
            </select>
          </div>
          <div>
            <div>
              <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:4}}>Tipo de sociedad</label>
              <select value={form.tipoSociedad||'SA'} onChange={function(e){fld('tipoSociedad',e.target.value);}} style={iS}>
                <option value="SA">SA — Sociedad Anónima</option>
                <option value="SRL">SRL — Sociedad de Resp. Limitada</option>
                <option value="SAS">SAS — Sociedad por Acciones Simplificada</option>
                <option value="COOPERATIVA">Cooperativa</option>
                <option value="ASOCIACION">Asociación Civil</option>
                <option value="FUNDACION">Fundación</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10,paddingTop:20}}>
              <input type="checkbox" checked={!!form.cotizaBolsa} onChange={function(e){fld('cotizaBolsa',e.target.checked);}} id="cotizaBolsaChk"/>
              <label htmlFor="cotizaBolsaChk" style={{fontSize:11,color:T.TEXT2,cursor:'pointer'}}>Cotiza en bolsa</label>
            </div>
            <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:4}}>Estado de cuenta</label>
            <select
              value={form.estadoCuenta||'EN_ONBOARDING'}
              onChange={function(e){
                var nuevo = e.target.value;
                var ahora = new Date();
                var entrada = { estado:nuevo, fecha:todayStr(), hora:ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}), analista:'Analista' };
                setForm(function(prev){
                  var n = Object.assign({},prev);
                  n.estadoCuenta = nuevo;
                  n.estadoCuentaUpdatedAt = todayStr();
                  n.estadoHistorial = (prev.estadoHistorial||[]).concat([entrada]);
                  return n;
                });
              }}
              style={{width:'100%',border:'2px solid '+(getEstado(form.estadoCuenta||'EN_ONBOARDING').color),borderRadius:4,padding:'7px 9px',fontSize:13,fontWeight:700,color:getEstado(form.estadoCuenta||'EN_ONBOARDING').color,background:getEstado(form.estadoCuenta||'EN_ONBOARDING').bg}}>
              {ESTADOS_CUENTA.map(function(e){return <option key={e.id} value={e.id}>{e.label} — {e.desc}</option>;})}
            </select>
            {form.estadoCuentaUpdatedAt && <div style={{fontSize:10,color:T.TEXT3,marginTop:3}}>Último cambio: {form.estadoCuentaUpdatedAt}</div>}
          </div>

          {/* Último análisis externo — para cuentas analizadas antes de esta app */}
          <div style={{gridColumn:'1 / -1'}}>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:T.TEXT2,marginBottom:4}}>
              📋 Fecha de último análisis AML externo al sistema
              <span style={{fontWeight:400,color:T.TEXT3,marginLeft:6}}>(completar si la cuenta fue analizada antes de usar esta app)</span>
            </label>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input
                type="text"
                value={form.ultimoAnalisisExterno||''}
                onChange={function(e){fld('ultimoAnalisisExterno',e.target.value);}}
                placeholder="DD/MM/AAAA — ej: 31/12/2025"
                style={{flex:1,border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 9px',fontSize:13}}
              />
              {form.ultimoAnalisisExterno && (
                <button onClick={function(){fld('ultimoAnalisisExterno','');}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'7px 10px',cursor:'pointer',fontSize:11,color:T.TEXT2}}>✕ Limpiar</button>
              )}
            </div>
            <div style={{fontSize:10,color:T.TEXT2,marginTop:3}}>
              Si completás esta fecha, el sistema la usa como referencia para calcular cuándo vence el próximo análisis requerido y no generará alertas hasta que se cumpla ese plazo.
            </div>
          </div>

          {/* ── GESTIÓN DE LÍMITES TRANSACCIONALES ─────────────────────────── */}
          <div style={{gridColumn:'1/-1',marginTop:16,background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div>
                <div style={{fontWeight:600,color:T.TEXT,fontSize:13}}>📈 Gestión de límites transaccionales</div>
                <div style={{fontSize:11,color:T.TEXT2,marginTop:2}}>Declarar aumentos de límite aprobados para que el motor AML no genere alertas PAT-05 repetitivas.</div>
              </div>
              <button
                onClick={function(){
                  var hist = safeArr(form.limitesHistorial).slice();
                  hist.push({
                    id: uid(), tipo:'AUMENTO_TEMPORAL', estado:'VIGENTE',
                    fechaSolicitud: todayStr(),
                    vigenciaDesde: todayStr(), vigenciaHasta: '',
                    montoAnterior: form.facturacionMensual || 0,
                    montoNuevo: 0,
                    motivo: '', respaldo: 'DDJJ', aprobadoPor: '',
                    observaciones: ''
                  });
                  fld('limitesHistorial', hist);
                }}
                style={{background:'rgba(0,212,255,0.12)',color:T.CYAN,border:'1px solid rgba(0,212,255,0.3)',borderRadius:3,padding:'7px 14px',cursor:'pointer',fontSize:11,fontFamily:T.MONO,fontWeight:600,whiteSpace:'nowrap'}}
              >
                + Declarar aumento
              </button>
            </div>

            {/* Límites vigentes y vencidos */}
            {safeArr(form.limitesHistorial).length === 0 && (
              <div style={{textAlign:'center',padding:'16px 0',color:T.TEXT3,fontSize:11,fontFamily:T.MONO}}>
                // sin aumentos declarados — el motor AML usará facturación mensual como referencia
              </div>
            )}

            {safeArr(form.limitesHistorial).map(function(lim, li) {
              var isVigente = lim.estado === 'VIGENTE';
              var isVencido = lim.estado === 'VENCIDO';
              var borderCol = isVigente ? 'rgba(0,230,118,0.3)' : isVencido ? T.BORDER : 'rgba(255,68,85,0.3)';
              var statusCol = isVigente ? T.GREEN : isVencido ? T.TEXT3 : T.RED;
              var statusLabel = isVigente ? '✓ VIGENTE' : isVencido ? '⏱ VENCIDO' : '✗ REVOCADO';

              function updLim(k, v) {
                var hist = safeArr(form.limitesHistorial).slice();
                hist[li] = Object.assign({}, hist[li]);
                hist[li][k] = v;
                fld('limitesHistorial', hist);
              }

              async function removeLim() {
                if (!(await uiConfirm('¿Eliminar este registro de aumento de límite?', {danger:true, confirmLabel:'Eliminar'}))) return;
                var hist = safeArr(form.limitesHistorial).filter(function(x,xi){ return xi !== li; });
                fld('limitesHistorial', hist);
              }

              var tipoLabels = {
                'AUMENTO_TEMPORAL': '⏱ Aumento temporal',
                'AUMENTO_PERMANENTE': '∞ Aumento permanente',
                'OPERACION_PUNTUAL': '📌 Operación puntual'
              };

              return (
                <div key={lim.id||li} style={{background:T.BG2,border:'1px solid '+borderCol,borderRadius:4,padding:'14px',marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{padding:'2px 8px',borderRadius:2,background:statusCol+'22',color:statusCol,fontSize:10,fontWeight:600,fontFamily:T.MONO}}>{statusLabel}</span>
                      <span style={{fontSize:12,color:T.TEXT,fontWeight:600}}>{tipoLabels[lim.tipo] || lim.tipo}</span>
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      {isVigente && (
                        <button onClick={function(){updLim('estado','VENCIDO');}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:3,padding:'3px 8px',cursor:'pointer',fontSize:10,color:T.AMBER,fontFamily:T.MONO}}>vencer</button>
                      )}
                      {isVigente && (
                        <button onClick={function(){updLim('estado','REVOCADO');}} style={{background:'none',border:'1px solid rgba(255,68,85,0.3)',borderRadius:3,padding:'3px 8px',cursor:'pointer',fontSize:10,color:T.RED,fontFamily:T.MONO}}>revocar</button>
                      )}
                      <button onClick={removeLim} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:3,padding:'3px 8px',cursor:'pointer',fontSize:10,color:T.TEXT3,fontFamily:T.MONO}}>✕</button>
                    </div>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10}}>
                    <div>
                      <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:3}}>Tipo</label>
                      <select value={lim.tipo} onChange={function(e){updLim('tipo',e.target.value);}} style={{width:'100%',background:T.BG4,color:T.TEXT,border:'1px solid '+T.BORDER,borderRadius:3,padding:'6px 8px',fontSize:11}}>
                        <option value="AUMENTO_TEMPORAL">Aumento temporal</option>
                        <option value="AUMENTO_PERMANENTE">Aumento permanente</option>
                        <option value="OPERACION_PUNTUAL">Operación puntual</option>
                      </select>
                    </div>
                    <div>
                      <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:3}}>Respaldo</label>
                      <select value={lim.respaldo||'DDJJ'} onChange={function(e){updLim('respaldo',e.target.value);}} style={{width:'100%',background:T.BG4,color:T.TEXT,border:'1px solid '+T.BORDER,borderRadius:3,padding:'6px 8px',fontSize:11}}>
                        <option value="DDJJ">DDJJ</option>
                        <option value="NOTA">Nota formal</option>
                        <option value="EMAIL">Email</option>
                        <option value="ACTA_DIRECTORIO">Acta de directorio</option>
                        <option value="CONTRATO">Contrato comercial</option>
                      </select>
                    </div>
                    <div>
                      <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:3}}>Aprobado por</label>
                      <input type="text" value={lim.aprobadoPor||''} onChange={function(e){updLim('aprobadoPor',e.target.value);}} placeholder="Nombre del oficial" style={{width:'100%',background:T.BG4,color:T.TEXT,border:'1px solid '+T.BORDER,borderRadius:3,padding:'6px 8px',fontSize:11}}/>
                    </div>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,marginBottom:10}}>
                    <div>
                      <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:3}}>Vigencia desde</label>
                      <input type="date" value={lim.vigenciaDesde||''} onChange={function(e){updLim('vigenciaDesde',e.target.value);}} style={{width:'100%',background:T.BG4,color:T.TEXT,border:'1px solid '+T.BORDER,borderRadius:3,padding:'6px 8px',fontSize:11}}/>
                    </div>
                    <div>
                      <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:3}}>Vigencia hasta</label>
                      <input type="date" value={lim.vigenciaHasta||''} onChange={function(e){updLim('vigenciaHasta',e.target.value);}} disabled={lim.tipo==='AUMENTO_PERMANENTE'} style={{width:'100%',background:lim.tipo==='AUMENTO_PERMANENTE'?T.BG3:T.BG4,color:T.TEXT,border:'1px solid '+T.BORDER,borderRadius:3,padding:'6px 8px',fontSize:11,opacity:lim.tipo==='AUMENTO_PERMANENTE'?0.5:1}}/>
                    </div>
                    <div>
                      <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:3}}>Monto anterior ($)</label>
                      <input type="number" value={lim.montoAnterior||''} onChange={function(e){updLim('montoAnterior',Number(e.target.value));}} style={{width:'100%',background:T.BG4,color:T.TEXT,border:'1px solid '+T.BORDER,borderRadius:3,padding:'6px 8px',fontSize:11}}/>
                    </div>
                    <div>
                      <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:3}}>Monto nuevo ($)</label>
                      <input type="number" value={lim.montoNuevo||''} onChange={function(e){updLim('montoNuevo',Number(e.target.value));}} style={{width:'100%',background:T.BG4,color:T.TEXT,border:'1px solid '+T.BORDER,borderRadius:3,padding:'6px 8px',fontSize:11}}/>
                    </div>
                  </div>

                  <div style={{marginBottom:8}}>
                    <label style={{display:'block',fontSize:9,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',marginBottom:3}}>Motivo / justificación</label>
                    <textarea value={lim.motivo||''} onChange={function(e){updLim('motivo',e.target.value);}} placeholder="Ej: Expansión comercial, campaña estacional, acuerdo con nuevo proveedor..." rows={2} style={{width:'100%',background:T.BG4,color:T.TEXT,border:'1px solid '+T.BORDER,borderRadius:3,padding:'6px 8px',fontSize:11,resize:'vertical',fontFamily:T.MONO}}/>
                  </div>

                  <div style={{fontSize:10,color:T.TEXT3,fontFamily:T.MONO}}>
                    Solicitud: {lim.fechaSolicitud||'—'}
                    {lim.montoAnterior && lim.montoNuevo ? ' · ' + fmtM(lim.montoAnterior) + ' → ' + fmtM(lim.montoNuevo) + ' (' + (lim.montoNuevo/lim.montoAnterior).toFixed(1) + 'x)' : ''}
                  </div>
                </div>
              );
            })}

            {safeArr(form.limitesHistorial).filter(function(l){return l.estado==='VIGENTE';}).length > 0 && (
              <div style={{background:'rgba(0,230,118,0.06)',border:'1px solid rgba(0,230,118,0.2)',borderRadius:3,padding:'10px 14px',marginTop:8,fontSize:11,color:T.GREEN}}>
                ✓ Existe al menos un aumento de límite vigente — el motor AML clasificará PAT-05 como severidad BAJA en lugar de ALTA cuando el volumen exceda el perfil original.
              </div>
            )}
          </div>

        </div> : null}

        {tab === 'checklist' ? <div>
          <input ref={docFileRef} type="file" style={{display:'none'}}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            onChange={function(e){ var f=e.target.files&&e.target.files[0]; if(f) onSubirDoc(f, docTipoRef.current); e.target.value=''; }}/>
          {iaFields && iaFields.okChecklist > 0 && <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'8px 12px',marginBottom:10,fontSize:11,color:T.CYAN}}>
            🤖 IA evaluó la presencia de documentos. <strong>{iaFields.okChecklist} marcados como OK</strong>{iaFields.bloqChecklist>0?<span>, <strong style={{color:T.RED}}>{iaFields.bloqChecklist} como Bloqueante</strong></span>:null}. Revisá y ajustá según tu criterio.
          </div>}
          {CHECKLIST_ITEMS.map(function(item,i){
            var val = (form.checklist||{})[item]||'Pendiente';
            var stC = val==='OK'?C.VERDE:val==='Bloqueante'?C.ROJO:'#888';
            var isIA = iaFields && iaFields.okChecklist > 0;
            return(
              <div key={i} style={{padding:'8px 10px',background:i%2===0?T.BG3:T.BG2,borderBottom:'1px solid '+T.BORDER,fontSize:13,borderLeft:val==='OK'?'3px solid '+C.VERDE:val==='Bloqueante'?'3px solid '+C.ROJO:'3px solid transparent'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{color:T.TEXT}}>{item}</span>
                  {isIA && val !== 'Pendiente' && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 4px',fontSize:9,fontWeight:700}}>IA</span>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:7}}>
                  {val==='OK' && VIGENCIA_DOCS[item] ? (
                    <input type="date" value={aISO((form.checklistFechas||{})[item])}
                      onChange={function(e){setClFecha(item, deISO(e.target.value));}}
                      title={'Fecha del documento — vigencia ' + VIGENCIA_DOCS[item] + ' meses'}
                      style={{border:'1px solid '+T.BORDER,borderRadius:3,padding:'3px 6px',fontSize:10,color:T.TEXT2,fontFamily:T.MONO,background:T.BG4}}/>
                  ) : null}
                  <select value={val} onChange={function(e){setClItem(item,e.target.value);}} style={{border:'1px solid '+T.BORDER,borderRadius:3,padding:'4px 8px',fontSize:11,color:stC,fontWeight:600,background:val!=='Pendiente'?'rgba(59,109,170,0.1)':T.BG4,fontFamily:T.MONO}}>
                    <option>Pendiente</option><option>OK</option><option>Bloqueante</option><option>N/A</option>
                  </select>
                  <button
                    onClick={function(){ docTipoRef.current = item; if (docFileRef.current) docFileRef.current.click(); }}
                    disabled={!!subiendo || !form.id}
                    title={form.id ? ('Adjuntar archivo para "' + item + '" (máx. ' + MAX_MB + ' MB)') : 'Guardá el legajo antes de adjuntar archivos'}
                    style={{background:'transparent',border:'1px solid '+T.BORDER2,borderRadius:3,padding:'3px 8px',cursor:(subiendo||!form.id)?'not-allowed':'pointer',fontSize:11,color:T.TEXT3}}>
                    {subiendo===item ? '⏳' : '📎'}
                  </button>
                </div>
              </div>

              {/* Adjuntos de este ítem */}
              {(function(){
                var delItem = docs.filter(function(d){ return d.tipo === item; })
                  .sort(function(a,b){ return b.version - a.version; });
                if (!delItem.length) return null;
                return (
                  <div style={{marginTop:6,paddingLeft:2}}>
                    {delItem.map(function(d){
                      return (
                        <div key={d.id} style={{display:'flex',alignItems:'center',gap:7,padding:'3px 0',fontSize:11,opacity:d.vigente?1:0.5}}>
                          <span style={{color:d.vigente?T.GREEN:T.TEXT4,fontSize:10}}>{d.vigente?'●':'○'}</span>
                          <span onClick={function(){onDescargarDoc(d);}}
                            style={{color:T.ACCENT,cursor:'pointer',textDecoration:'underline',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:240}}>
                            {d.nombre}
                          </span>
                          <span style={{fontFamily:T.MONO,fontSize:9,color:T.TEXT4,whiteSpace:'nowrap'}}>
                            v{d.version} · {fmtTamano(d.tamano)} · {new Date(d.subido_at).toLocaleDateString('es-AR')} · {d.subido_por}
                            {d.vigente ? '' : ' · reemplazado'}
                          </span>
                          {puedeEliminar(currentUser.rol) && (
                            <button onClick={function(){onBorrarDoc(d);}}
                              style={{marginLeft:'auto',background:'transparent',border:'none',color:T.TEXT4,cursor:'pointer',fontSize:11}}>✕</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              </div>
            );
          })}
        </div> : null}

        {tab === 'scoring' ? <div>
          <div style={{background:'rgba(0,212,255,0.08)',borderRadius:4,padding:'10px 14px',marginBottom:12,border:'1px solid rgba(0,212,255,0.2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:600,color:T.TEXT}}>Score KYB promedio</span>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {iaFields && iaFields.kybFilled > 0 && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'2px 7px',fontSize:10,fontWeight:700}}>🤖 IA</span>}
              <span style={{fontWeight:700,fontSize:18,color:Number(scProm)>=4?C.ROJO:Number(scProm)>=3?C.NARANJA:C.VERDE}}>{scProm}/5</span>
            </div>
          </div>
          {iaFields && iaFields.kybFilled > 0 && <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'8px 12px',marginBottom:10,fontSize:11,color:T.CYAN}}>
            🤖 IA completó los factores basándose en el análisis documental. Revisá y ajustá con tu criterio profesional.
          </div>}
          {KYB_FACTORS.map(function(f,i){
            var val = Number((form.kybScores||{})[f])||2;
            var scC = val>=4?C.ROJO:val>=3?C.NARANJA:C.VERDE;
            var isIA = iaFields && iaFields.kybFilled > 0;
            return(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:i%2===0?T.BG3:T.BG2,borderBottom:'1px solid '+T.BORDER,borderLeft:'3px solid '+scC}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:13,color:T.TEXT}}>{f}</span>
                  {isIA && <span style={{background:C.AC,color:'white',borderRadius:3,padding:'1px 4px',fontSize:9,fontWeight:700}}>IA</span>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{color:scC,fontWeight:700,minWidth:28}}>{val}/5</span>
                  <input type="range" min={1} max={5} value={val} onChange={function(e){setKybSc(f,e.target.value);}} style={{width:120,accentColor:scC}}/>
                </div>
              </div>
            );
          })}
        </div> : null}

        {tab === 'flags' ? <div>
          {iaFields && iaFields.rfCount > 0 && <div style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.2)',borderRadius:4,padding:'8px 12px',marginBottom:10,fontSize:12,color:T.RED}}>
            🤖 IA detectó {iaFields.rfCount} red flag(s) en los documentos. Revisá, editá o agregá los tuyos.
          </div>}
          <p style={{fontSize:12,color:T.TEXT2,marginBottom:8}}>Red flags (uno por linea):</p>
          <textarea value={safeArr(form.redFlags).join('\n')} onChange={function(e){fld('redFlags',e.target.value.split('\n').filter(function(s){return s.trim();}));}} rows={6} style={{width:'100%',border:'1px solid '+(iaFields&&iaFields.rfCount>0?C.ROJO:T.BORDER2),borderRadius:6,padding:'8px 10px',fontSize:13,resize:'vertical',color:T.TEXT,background:iaFields&&iaFields.rfCount>0?'rgba(255,71,87,0.07)':T.BG4}} placeholder="Ingresa red flags..."/>
          <p style={{fontSize:12,color:T.TEXT2,margin:'12px 0 6px'}}>Observaciones del analista:</p>
          <textarea value={safeArr(form.observaciones).join('\n')} onChange={function(e){fld('observaciones',e.target.value.split('\n').filter(function(s){return s.trim();}));}} rows={4} style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,resize:'vertical'}} placeholder="Observaciones adicionales..."/>
        </div> : null}

        {tab === 'historial' ? <div>
          <p style={{fontSize:12,color:T.TEXT2,marginBottom:12}}>Historial de cambios de estado de cuenta. Se registra automáticamente cada vez que se modifica el estado.</p>
          {(function(){
            var hist = safeArr(form.estadoHistorial).slice().reverse();
            if (hist.length === 0) return <div style={{background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:16,textAlign:'center',color:T.TEXT3,fontSize:13}}>Sin historial registrado. Los cambios de estado quedarán registrados aquí.</div>;
            return (
              <div>
                {hist.map(function(h,i){
                  var est = getEstado(h.estado||'EN_ONBOARDING');
                  var isLast = i===0;
                  return (
                    <div key={i} style={{display:'flex',gap:14,padding:'10px 0',borderBottom:'none'}}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,flexShrink:0}}>
                        <div style={{width:12,height:12,borderRadius:'50%',background:est.color,marginTop:3,boxShadow:isLast?('0 0 0 4px '+T.ACCENT_SOFT+', 0 0 10px '+est.color):'none'}}></div>
                        {i<hist.length-1 && <div style={{width:2,flex:1,background:T.BORDER2,marginTop:2,borderRadius:2}}></div>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                          <span style={{background:est.bg,color:est.color,border:'1px solid '+est.color,borderRadius:8,padding:'2px 9px',fontSize:11,fontWeight:700}}>{est.label}</span>
                          {isLast && <span style={{background:C.AC,color:'white',borderRadius:8,padding:'1px 7px',fontSize:10,fontWeight:700}}>Actual</span>}
                        </div>
                        <div style={{fontSize:11,color:T.TEXT2}}>{h.fecha} {h.hora && 'a las '+h.hora} · {h.analista||'Analista'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }())}
          <div style={{marginTop:16,padding:'10px 12px',background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,fontSize:12,color:T.TEXT2}}>
            <strong>Registrar entrada manual en el historial:</strong>
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <input id="histNota" placeholder="Nota sobre el cambio de estado..." style={{flex:1,border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 8px',fontSize:12}}/>
              <button onClick={function(){
                var nota = document.getElementById('histNota').value.trim();
                if (!nota) return;
                var ahora = new Date();
                var entrada = { estado:form.estadoCuenta||'EN_ONBOARDING', fecha:todayStr(), hora:ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}), analista:'Analista — '+nota };
                fld('estadoHistorial', safeArr(form.estadoHistorial).concat([entrada]));
                document.getElementById('histNota').value='';
              }} style={{background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>+ Agregar</button>
            </div>
          </div>
        </div> : null}

        {tab === 'screening' ? <div>
          {/* Resultado del motor determinístico (T5) para este legajo */}
          {(function(){
            if (!ultScreening) {
              return (
                <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.md,padding:'11px 14px',marginBottom:12,fontSize:11,color:T.TEXT3,lineHeight:1.6}}>
                  Todavía no se corrió el screening automático contra listas cargadas.
                  Los enlaces de abajo siguen sirviendo para la verificación manual.
                </div>
              );
            }
            var mios = (ultScreening.hits||[]).filter(function(h){ return h.legajoId === form.id; });
            var fechaCorrida = new Date(ultScreening.fecha).toLocaleDateString('es-AR');
            if (!mios.length) {
              return (
                <div style={{background:'rgba(0,230,118,0.06)',border:'1px solid rgba(0,230,118,0.28)',borderLeft:'3px solid '+T.GREEN,borderRadius:T.RADIUS.md,padding:'11px 14px',marginBottom:12,fontSize:12,color:T.TEXT2,lineHeight:1.6}}>
                  <strong style={{color:T.GREEN}}>Sin coincidencias</strong> en la corrida del {fechaCorrida} contra{' '}
                  {(ultScreening.listas||[]).map(function(l){return l.nombre;}).join(', ') || 'las listas cargadas'}.
                  <div style={{fontSize:10,color:T.TEXT4,marginTop:3}}>
                    Matching determinístico sobre razón social, representante legal, presidente, beneficiario final y vinculados.
                  </div>
                </div>
              );
            }
            return (
              <div style={{background:'rgba(255,68,85,0.06)',border:'1px solid rgba(255,68,85,0.3)',borderLeft:'3px solid '+T.RED,borderRadius:T.RADIUS.md,padding:'12px 14px',marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:T.RED,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:8}}>
                  {mios.length} coincidencia(s) — corrida del {fechaCorrida}
                </div>
                {mios.map(function(h){
                  var col = h.nivel==='ALTA'?T.RED:h.nivel==='MEDIA'?T.AMBER:T.TEXT3;
                  return (
                    <div key={h.clave} style={{borderTop:'1px solid '+T.BORDER,paddingTop:7,marginTop:7,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                      <span style={{color:col,fontSize:10,fontWeight:700,fontFamily:T.MONO,width:48}}>{h.nivel}</span>
                      <span style={{fontFamily:T.MONO,fontSize:10,color:T.TEXT3,width:48}}>{(h.score*100).toFixed(1)}%</span>
                      <span style={{flex:1,minWidth:140,fontSize:12,color:T.TEXT}}>{h.sujeto}
                        <span style={{fontSize:10,color:T.TEXT4}}> ({h.rol})</span></span>
                      <span style={{fontSize:12,color:T.RED,flex:1,minWidth:140}}>{h.entradaNom}</span>
                      <span style={{fontSize:10,color:T.TEXT4,fontFamily:T.MONO}}>{h.lista}</span>
                    </div>
                  );
                })}
                <div style={{fontSize:10,color:T.TEXT3,marginTop:9,lineHeight:1.5}}>
                  Revisá y resolvé cada una desde la sección Screening: ahí se abre caso o se descarta con motivo.
                </div>
              </div>
            );
          })()}

          {(function(){
            var scr = form.screening || null;

            // Nombres a verificar: razón social + beneficiario final + representante legal
            var nombresArr = [];
            if (form.razonSocial) nombresArr.push(form.razonSocial + (form.cuit ? ' (CUIT: '+form.cuit+')' : ''));
            if (form.beneficiarioFinal) nombresArr.push('Beneficiario final: ' + form.beneficiarioFinal);
            if (form.representanteLegal) nombresArr.push('Representante legal: ' + form.representanteLegal);

            var LISTAS = [
              {key:'OFAC', label:'OFAC SDN', flag:'🇺🇸', url:'https://sanctionssearch.ofac.treas.gov/'},
              {key:'ONU',  label:'ONU Lista Consolidada', flag:'🌐', url:'https://www.un.org/securitycouncil/content/un-sc-consolidated-list'},
              {key:'REPET', label:'REPET UIF Argentina', flag:'🇦🇷', url:'https://repet.uif.gob.ar/'},
              {key:'PEP',  label:'PEPs Argentina (OA)', flag:'🇦🇷', url:'https://declaraciones.anticorrupcion.gob.ar/'},
            ];

            function getCol(estado) {
              return estado==='LIMPIO' ? C.VERDE : estado==='COINCIDENCIA' ? C.ROJO : estado==='REVISAR' ? C.AMARILLO : '#7F8C8D';
            }

            async function ejecutarScreening() {
              if (nombresArr.length === 0) { toast('El legajo debe tener al menos Razón Social para realizar el screening.'); return; }
              setScreeningLoading(true);
              try {
                var prompt = 'Sos un especialista en compliance AML/CFT para un PSP argentino regulado por UIF/BCRA.\n\n'
                  + 'Realizá un screening de las siguientes personas/entidades contra las listas de sanciones indicadas. '
                  + 'Usá búsqueda web para verificar cada lista.\n\n'
                  + 'ENTIDADES A VERIFICAR:\n' + nombresArr.join('\n') + '\n\n'
                  + 'LISTAS A CONSULTAR:\n'
                  + '1. OFAC SDN List: https://sanctionssearch.ofac.treas.gov/ - Buscar el nombre exacto y variaciones\n'
                  + '2. ONU Lista Consolidada: https://www.un.org/securitycouncil/content/un-sc-consolidated-list\n'
                  + '3. REPET UIF Argentina: https://repet.uif.gob.ar/ - Registro Público de personas vinculadas a terrorismo y financiamiento del terrorismo\n'
                  + '4. PEPs Argentina: https://declaraciones.anticorrupcion.gob.ar/ - Personas Políticamente Expuestas\n\n'
                  + 'Para cada lista indica:\n'
                  + '- LIMPIO: búsqueda realizada, sin coincidencias encontradas\n'
                  + '- REVISAR: posible coincidencia parcial o nombre similar, requiere revisión manual\n'
                  + '- COINCIDENCIA: coincidencia encontrada, acción inmediata requerida\n\n'
                  + 'Devolvé SOLO JSON válido, sin texto adicional, sin backticks:\n'
                  + '{"OFAC":{"estado":"LIMPIO|REVISAR|COINCIDENCIA","detalle":"descripción de lo encontrado o no encontrado"},'
                  + '"ONU":{"estado":"...","detalle":"..."},'
                  + '"REPET":{"estado":"...","detalle":"..."},'
                  + '"PEP":{"estado":"...","detalle":"..."}}';

                var r = await fetch('/api/ai', {
                  method: 'POST',
                  headers: await authHeaders({ 'Content-Type': 'application/json' }),
                  body: JSON.stringify({
                    provider: 'claude',
                    useWebSearch: true,
                    max_tokens: 2000,
                    messages: [{ role: 'user', content: prompt }]
                  })
                });
                var res = await r.json();
                var texto = res.text || '';
                var clean = texto.replace(/```json|```/g, '').trim();
                var resultados = JSON.parse(clean);
                var estados = Object.values(resultados).map(function(v){return v.estado;});
                var estadoGeneral = estados.some(function(e){return e==='COINCIDENCIA';}) ? 'COINCIDENCIA'
                  : estados.some(function(e){return e==='REVISAR';}) ? 'REVISAR' : 'LIMPIO';
                var nuevoScreening = {
                  fecha: todayStr(),
                  hora: new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
                  realizadoPor: currentUser ? currentUser.nombre : 'Sistema',
                  nombres: nombresArr,
                  resultados: resultados,
                  estadoGeneral: estadoGeneral
                };
                fld('screening', nuevoScreening);
              } catch(e) {
                toast('Error al realizar el screening: ' + e.message);
              }
              setScreeningLoading(false);
            }

            // ── Adverse Media ─────────────────────────────────────────────────
            var adverseState = useState(null); var adverseResult=adverseState[0]; var setAdverseResult=adverseState[1];
            var adverseLoadingState = useState(false); var adverseLoading=adverseLoadingState[0]; var setAdverseLoading=adverseLoadingState[1];

            async function ejecutarAdverseMedia() {
              var empresa = form.razonSocial || '';
              var presidente = form.presidente || form.representanteLegal || '';
              if (!empresa) { toast('El legajo debe tener Razón Social para realizar Adverse Media Search.'); return; }
              setAdverseLoading(true);
              try {
                var sujetos = [empresa];
                if (presidente) sujetos.push(presidente);
                if (form.beneficiarioFinal) sujetos.push(form.beneficiarioFinal);
                var prompt = 'Sos analista senior AML/Compliance de un PSP argentino (GOAT S.A./Rebit, regulado UIF/BCRA).\n\n'
                  + 'Realizá una búsqueda de Adverse Media (noticias negativas, antecedentes judiciales, regulatorios, periodísticos) para las siguientes entidades/personas.\n\n'
                  + 'ENTIDADES A INVESTIGAR:\n' + sujetos.map(function(s,i){return (i+1)+'. '+s;}).join('\n') + '\n\n'
                  + 'BUSCAR en fuentes públicas abiertas:\n'
                  + '- Google Noticias / búsqueda web en español e inglés\n'
                  + '- Infojus / Poder Judicial Argentina (causas judiciales)\n'
                  + '- BCRA / UIF / CNV / AFIP (sanciones regulatorias)\n'
                  + '- Periodismo de investigación (Infobae, La Nacion, Clarin, TN, Ambito, El Cronista)\n'
                  + '- ICIJ OffshoreLeaks / Panama Papers / Pandora Papers\n\n'
                  + 'Para cada sujeto, indicá:\n'
                  + '- LIMPIO: sin hallazgos negativos relevantes\n'
                  + '- REVISAR: hallazgos menores, menciones ambiguas, requiere análisis\n'
                  + '- ADVERSO: hallazgos negativos claros (causas penales, sanciones, fraude, lavado, etc.)\n\n'
                  + 'Devolvé SOLO JSON válido, sin backticks:\n'
                  + '{\n'
                  + '  "resumenGeneral": "LIMPIO|REVISAR|ADVERSO",\n'
                  + '  "sujetos": [\n'
                  + '    {\n'
                  + '      "nombre": "nombre buscado",\n'
                  + '      "estado": "LIMPIO|REVISAR|ADVERSO",\n'
                  + '      "hallazgos": ["hallazgo 1", "hallazgo 2"],\n'
                  + '      "fuentes": ["fuente/url 1", "fuente 2"],\n'
                  + '      "resumen": "texto libre de 2-3 oraciones con el resultado"\n'
                  + '    }\n'
                  + '  ],\n'
                  + '  "recomendacion": "Sin observaciones|Requiere análisis adicional|Escalar a Oficial de Cumplimiento",\n'
                  + '  "redFlags": ["red flag 1", "red flag 2"]\n'
                  + '}';

                var gz = await gzipPayload({ provider: 'claude', useWebSearch: true, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] });
                var r = await fetch('/api/ai', { method: 'POST', headers: gz.headers, body: gz.body });
                var res = await r.json();
                var clean = (res.text||'').replace(/```json|```/g,'').trim();
                var result = JSON.parse(clean);
                result.fecha = todayStr();
                result.hora = new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
                result.realizadoPor = currentUser ? currentUser.nombre : 'Sistema';
                result.sujetos_buscados = sujetos;
                fld('adverseMedia', result);
                setAdverseResult(result);
              } catch(e) {
                toast('Error en Adverse Media Search: ' + e.message);
              }
              setAdverseLoading(false);
            }

            var amResult = adverseResult || form.adverseMedia || null;
            var amGeneral = amResult ? amResult.resumenGeneral : null;
            var amCol = amGeneral==='LIMPIO' ? T.GREEN : amGeneral==='ADVERSO' ? T.RED : amGeneral==='REVISAR' ? T.AMBER : T.TEXT3;

            return (
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
                  <div>
                    <div style={{fontWeight:600,color:T.TEXT,fontSize:14,marginBottom:4}}>🛡 Screening de Sanciones Internacionales</div>
                    <div style={{fontSize:12,color:T.TEXT2}}>Verificación contra OFAC SDN, ONU, REPET UIF y PEPs Argentina.</div>
                    <div style={{fontSize:11,color:T.TEXT2,marginTop:4}}>Personas a verificar: {nombresArr.length > 0 ? nombresArr.join(' · ') : 'Completar Razón Social / Beneficiario Final primero'}</div>
                  </div>
                  <button
                    onClick={ejecutarScreening}
                    disabled={screeningLoading || nombresArr.length===0}
                    style={{background:screeningLoading||nombresArr.length===0?T.BG4:T.ACCENT,color:'#FFFFFF',border:'none',borderRadius:4,padding:'9px 16px',cursor:screeningLoading||nombresArr.length===0?'not-allowed':'pointer',fontWeight:700,fontSize:13,flexShrink:0,marginLeft:12}}
                  >
                    {screeningLoading ? '⏳ Verificando...' : scr ? '🔄 Repetir Screening' : '🔍 Ejecutar Screening'}
                  </button>
                </div>

                {screeningLoading && (
                  <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'16px',textAlign:'center',marginBottom:16}}>
                    <div style={{fontSize:14,color:T.CYAN,fontWeight:700}}>🔍 Consultando listas de sanciones...</div>
                    <div style={{fontSize:12,color:T.TEXT2,marginTop:4}}>OFAC SDN · ONU · REPET UIF · PEPs Argentina — esto puede tardar 20-30 segundos</div>
                  </div>
                )}

                {scr && !screeningLoading && (
                  <div>
                    {/* Badge resultado general */}
                    <div style={{background:scr.estadoGeneral==='LIMPIO'?'rgba(0,230,118,0.1)':scr.estadoGeneral==='COINCIDENCIA'?'rgba(255,68,85,0.1)':'rgba(255,184,48,0.1)',border:'1px solid '+(scr.estadoGeneral==='LIMPIO'?'rgba(0,230,118,0.3)':scr.estadoGeneral==='COINCIDENCIA'?'rgba(255,68,85,0.3)':'rgba(255,184,48,0.3)'),borderRadius:4,padding:'12px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <span style={{fontWeight:700,fontSize:14,color:getCol(scr.estadoGeneral)}}>
                          {scr.estadoGeneral==='LIMPIO'?'✅ SIN COINCIDENCIAS':scr.estadoGeneral==='COINCIDENCIA'?'🔴 COINCIDENCIA DETECTADA':'🟡 REQUIERE REVISIÓN MANUAL'}
                        </span>
                        <div style={{fontSize:11,color:T.TEXT2,marginTop:2}}>Realizado por {scr.realizadoPor} el {scr.fecha} a las {scr.hora}</div>
                      </div>
                      <div style={{fontSize:11,color:T.TEXT2,textAlign:'right'}}>
                        {scr.nombres && scr.nombres.map(function(n,i){return <div key={i}>{n}</div>;})}
                      </div>
                    </div>

                    {/* Resultados por lista */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                      {LISTAS.map(function(lista){
                        var res = scr.resultados && scr.resultados[lista.key];
                        var estado = res ? res.estado : 'PENDIENTE';
                        var col = getCol(estado);
                        return (
                          <div key={lista.key} style={{border:'1px solid '+(estado==='LIMPIO'?'rgba(0,230,118,0.3)':estado==='COINCIDENCIA'?'rgba(255,68,85,0.3)':estado==='REVISAR'?'rgba(255,184,48,0.3)':T.BORDER),borderRadius:3,padding:'12px 14px',background:estado==='LIMPIO'?'rgba(0,230,118,0.08)':estado==='COINCIDENCIA'?'rgba(255,68,85,0.08)':estado==='REVISAR'?'rgba(255,184,48,0.08)':T.BG3}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                              <span style={{fontWeight:700,fontSize:12}}>{lista.flag} {lista.label}</span>
                              <span style={{background:col+'22',color:col,borderRadius:2,padding:'2px 8px',fontSize:9,fontWeight:600,fontFamily:T.MONO}}>{estado}</span>
                            </div>
                            <div style={{fontSize:11,color:T.TEXT2,lineHeight:1.5}}>{res ? res.detalle : '—'}</div>
                            <a href={lista.url} target="_blank" rel="noreferrer" style={{fontSize:10,color:T.CYAN,display:'block',marginTop:4}}>Ver lista oficial →</a>
                          </div>
                        );
                      })}
                    </div>

                    {scr.estadoGeneral !== 'LIMPIO' && (
                      <div style={{background:'rgba(255,184,48,0.08)',border:'1px solid rgba(255,184,48,0.25)',borderRadius:3,padding:'10px 14px',fontSize:12,color:T.AMBER}}>
                        <strong>⚠ Acción requerida:</strong> {scr.estadoGeneral==='COINCIDENCIA'
                          ? 'Se detectó una posible coincidencia. Suspender operaciones del cliente y notificar al Oficial de Cumplimiento de inmediato. Evaluar reporte a UIF.'
                          : 'Existen nombres similares que requieren verificación manual. Revisar los detalles antes de continuar con el onboarding.'}
                      </div>
                    )}
                  </div>
                )}

                {!scr && !screeningLoading && (
                  <div style={{background:T.BG3,border:'1px dashed '+T.BORDER3,borderRadius:6,padding:'30px 20px',textAlign:'center',color:T.TEXT3}}>
                    <div style={{fontSize:32,marginBottom:8}}>🛡</div>
                    <div style={{fontSize:14,fontWeight:600,color:T.TEXT2}}>Screening no realizado</div>
                    <div style={{fontSize:12,marginTop:4}}>Hacé clic en "Ejecutar Screening" para verificar contra las 4 listas de sanciones.</div>
                  </div>
                )}

                {/* ── ADVERSE MEDIA ──────────────────────────────────────────────────── */}
                <div style={{marginTop:20,background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                    <div>
                      <div style={{fontWeight:600,color:T.TEXT,fontSize:13,marginBottom:3}}>
                        📰 Adverse Media Search
                        {amGeneral && <span style={{marginLeft:8,padding:'2px 8px',borderRadius:2,background:amCol+'22',color:amCol,fontSize:10,fontWeight:600,fontFamily:T.MONO,border:'1px solid '+amCol+'44'}}>{amGeneral}</span>}
                      </div>
                      <div style={{fontSize:11,color:T.TEXT2}}>Google Noticias · Poder Judicial · BCRA/UIF/CNV · ICIJ Offshore Leaks</div>
                      {amResult && <div style={{fontSize:10,color:T.TEXT3,marginTop:2,fontFamily:T.MONO}}>Último: {amResult.fecha} {amResult.hora} — {amResult.realizadoPor}</div>}
                    </div>
                    <button
                      onClick={ejecutarAdverseMedia}
                      disabled={adverseLoading || !form.razonSocial}
                      style={{background:adverseLoading?T.BG4:'rgba(255,184,48,0.15)',color:adverseLoading?T.TEXT3:T.AMBER,border:'1px solid '+(adverseLoading?T.BORDER:'rgba(255,184,48,0.35)'),borderRadius:3,padding:'8px 14px',cursor:adverseLoading||!form.razonSocial?'not-allowed':'pointer',fontSize:11,fontFamily:T.MONO,fontWeight:600,flexShrink:0,whiteSpace:'nowrap'}}
                    >
                      {adverseLoading ? '// buscando...' : '🔍 Ejecutar búsqueda'}
                    </button>
                  </div>

                  {adverseLoading && (
                    <div style={{textAlign:'center',padding:'16px',color:T.CYAN,fontSize:11,fontFamily:T.MONO}}>
                      // buscando noticias y antecedentes... esto puede tardar 30-60 segundos
                    </div>
                  )}

                  {amResult && !adverseLoading && (
                    <div>
                      {(amResult.sujetos||[]).map(function(s,si){
                        var sCol = s.estado==='LIMPIO'?T.GREEN:s.estado==='ADVERSO'?T.RED:T.AMBER;
                        return (
                          <div key={si} style={{background:T.BG2,border:'1px solid '+(s.estado==='ADVERSO'?'rgba(255,68,85,0.3)':s.estado==='REVISAR'?'rgba(255,184,48,0.25)':T.BORDER),borderRadius:3,padding:'12px 14px',marginBottom:8}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                              <div style={{fontWeight:600,color:T.TEXT,fontSize:12}}>{s.nombre}</div>
                              <span style={{padding:'2px 8px',borderRadius:2,background:sCol+'22',color:sCol,fontSize:10,fontWeight:600,fontFamily:T.MONO}}>{s.estado}</span>
                            </div>
                            <div style={{fontSize:11,color:T.TEXT2,lineHeight:1.6}}>{s.resumen}</div>
                            {s.hallazgos && s.hallazgos.length > 0 && s.hallazgos.map(function(h,hi){
                              return <div key={hi} style={{fontSize:11,color:T.AMBER,marginTop:4}}>⚠ {h}</div>;
                            })}
                            {s.fuentes && s.fuentes.length > 0 && (
                              <div style={{marginTop:6,fontSize:10,color:T.TEXT3,fontFamily:T.MONO}}>Fuentes: {s.fuentes.join(' · ')}</div>
                            )}
                          </div>
                        );
                      })}
                      {amResult.redFlags && amResult.redFlags.length > 0 && (
                        <div style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.25)',borderRadius:3,padding:'10px 14px',marginTop:8}}>
                          <div style={{fontSize:11,fontWeight:600,color:T.RED,marginBottom:6}}>🚨 Red Flags</div>
                          {amResult.redFlags.map(function(rf,ri){
                            return <div key={ri} style={{fontSize:11,color:T.TEXT,marginBottom:3}}>• {rf}</div>;
                          })}
                        </div>
                      )}
                      <div style={{background:T.BG4,borderRadius:3,padding:'10px 14px',marginTop:8}}>
                        <div style={{fontSize:10,color:T.TEXT3,letterSpacing:'1px',marginBottom:2,fontFamily:T.MONO}}>RECOMENDACIÓN</div>
                        <div style={{fontSize:12,color:amGeneral==='ADVERSO'?T.RED:amGeneral==='REVISAR'?T.AMBER:T.GREEN,fontWeight:600}}>{amResult.recomendacion}</div>
                      </div>
                    </div>
                  )}

                  {!amResult && !adverseLoading && (
                    <div style={{textAlign:'center',padding:'16px 0',color:T.TEXT3,fontSize:11,fontFamily:T.MONO}}>
                      // sin búsqueda realizada — ejecutar para ver noticias y antecedentes
                    </div>
                  )}
                </div>

              </div>
            );
          })()}
        </div> : null}
      </div>
    );
  }

  // ── DRAWER DE DETALLE ──────────────────────────────────────────────────────
  // Se monta por encima de la tabla (la lista queda visible detrás del backdrop)
  // en lugar de reemplazar la vista completa como hacía el return temprano.
  function renderDrawer() {
    if (!sel || editing) return null;
    var lPeriodos = periodos.filter(function(p){return p.legajoId===sel.id;});
    var clVals = Object.values(sel.checklist||{});
    var okC2 = clVals.filter(function(v){return v==='OK';}).length;
    var scV2 = KYB_FACTORS.map(function(f){return Number((sel.kybScores||{})[f])||0;}).filter(function(v){return v>0;});
    var scP2 = scV2.length>0?(scV2.reduce(function(a,b){return a+b;},0)/scV2.length).toFixed(2):'N/D';
    return (
      <div onClick={function(){setSelId(null);}}
        style={{position:'fixed',inset:0,background:T.SCRIM,backdropFilter:'blur(1px)',zIndex:1500,display:'flex',justifyContent:'flex-end',animation:'fadeIn 0.15s ease-out'}}>
      <div onClick={function(e){e.stopPropagation();}}
        style={{width:780,maxWidth:'94vw',height:'100vh',overflowY:'auto',background:T.BG,borderLeft:'1px solid '+T.BORDER2,boxShadow:T.SHADOW.pop,padding:22,animation:'drawerIn 0.18s ease-out'}}>
        <button onClick={function(){setSelId(null);}} style={{background:'transparent',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,color:T.TEXT3,cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:T.SANS,padding:'5px 11px',marginBottom:12}}>✕ Cerrar · Esc</button>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div>
            <h2 style={{color:T.TEXT,fontSize:18,fontWeight:700,margin:0}}>{sel.razonSocial||'Sin nombre'}</h2>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4,flexWrap:'wrap'}}>
              <span style={{color:T.TEXT2,fontSize:13}}>CUIT: {sel.cuit||'N/D'} · Alta: {sel.createdAt}</span>
              {(function(){var est=getEstado(sel.estadoCuenta||'EN_ONBOARDING');return(
                <span style={{background:est.bg,color:est.color,border:'1px solid '+est.color,borderRadius:10,padding:'3px 12px',fontSize:12,fontWeight:700}}>{est.label}</span>
              );}())}
              {sel.estadoCuentaUpdatedAt && <span style={{fontSize:11,color:T.TEXT3}}>desde {sel.estadoCuentaUpdatedAt}</span>}
              {sel.screening && (function(){
                var col = sel.screening.estadoGeneral==='LIMPIO'?C.VERDE:sel.screening.estadoGeneral==='COINCIDENCIA'?C.ROJO:C.AMARILLO;
                var label = sel.screening.estadoGeneral==='LIMPIO'?'🛡 Screening ✅':sel.screening.estadoGeneral==='COINCIDENCIA'?'🛡 Coincidencia 🔴':'🛡 Revisar 🟡';
                return <span style={{background:col,color:T.ON_SEMANTIC,borderRadius:10,padding:'3px 10px',fontSize:11,fontWeight:700}}>{label}</span>;
              })()}
            </div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={function(){
              onReport(genINF01(sel, periodos, []));
              auditLog(currentUser,'generar_inf01','legajo',sel.id,{razonSocial:sel.razonSocial,cuit:sel.cuit});
            }} style={btnB}>📄 INF-01</button>
            <button onClick={function(){ exportarLegajoCompleto(sel); }} disabled={exportando}
              title="Expediente consolidado: identificación, checklist, scoring, screening con versiones de listado, períodos y señales con su resolución, casos con trazabilidad, RFIs, vencimientos e historial"
              style={{background:exportando?T.BG3:'rgba(139,124,246,0.16)',color:exportando?T.TEXT4:T.VIOLET,border:'1px solid '+(exportando?T.BORDER:'rgba(139,124,246,0.4)'),borderRadius:T.RADIUS.sm,padding:'7px 14px',cursor:exportando?'wait':'pointer',fontWeight:700,fontSize:12,fontFamily:T.SANS}}>
              {exportando ? '⏳ Generando…' : '📑 Legajo completo'}
            </button>
            {puedeAprobar(currentUser.rol) && <button onClick={function(){
              // Abrir modal ROS — preseleccionar períodos con señales ALTA
              var lp = periodos.filter(function(p){return p.legajoId===sel.id;});
              var conSenales = lp.filter(function(p){
                if (!p.metricas) return false;
                var sigs = detectPatrones(p.metricas, sel, lineaBase(p, sel, periodos));
                return sigs.some(function(s){return s.sev==='ALTA' && (!(p.sigsResolucion||{})[s.pat] || (p.sigsResolucion||{})[s.pat].estado!=='RESUELTA');});
              });
              setRosSelPer(conSenales.map(function(p){return p.id;}));
              // Obtener número correlativo desde KV
              authHeaders().then(function(h){ return fetch('/api/sync?action=kv&k=ros_counter_'+new Date().getFullYear(), {headers:h}); })
                .then(function(r){return r.json();}).then(function(d){ setRosNum((d.v||0)+1); }).catch(function(){ setRosNum(1); });
              setRosOpen(true);
            }} style={{background:'rgba(139,103,192,0.2)',color:'#B39DDB',border:'1px solid rgba(139,103,192,0.3)',borderRadius:3,padding:'8px 14px',cursor:'pointer',fontWeight:700,fontSize:13}}>📋 ROS Borrador</button>}
            <button onClick={function(){setCierreOpen(true);setCierreMot('');setCierreIA('');}} style={{background:T.RED,color:'white',border:'none',borderRadius:4,padding:'8px 14px',cursor:'pointer',fontWeight:700,fontSize:13}}>🔒 Cierre</button>
            <button onClick={function(){setForm(JSON.parse(JSON.stringify(sel)));setEditing(true);setTab('datos');}} style={btnG}>✏️ Editar</button>
            {puedeEliminar(currentUser.rol) && <button onClick={async function(){if(await uiConfirm('Eliminar?', {danger:true, confirmLabel:'Eliminar'})){saveList(legajos.filter(function(l){return l.id!==sel.id;}));setSelId(null);}}} style={btnR}>🗑</button>}
          </div>

          {/* MODAL ROS BORRADOR */}
          {rosOpen && sel && (function(){
            var lp = periodos.filter(function(p){return p.legajoId===sel.id;});
            var rfisLegajo = [];
            // rfisLegajo se carga desde Supabase KV via useEffect en AnalisisView
            return (
              <div style={{position:'fixed',inset:0,background:T.SCRIM,zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div style={{background:T.BG2,borderRadius:8,padding:28,width:560,maxWidth:'92vw',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <div>
                      <div style={{fontWeight:700,color:'#B39DDB',fontSize:13}}>📋 Generar ROS Borrador</div>
                      <div style={{fontSize:12,color:T.TEXT2,marginTop:2}}>Reporte de Operación Sospechosa — {sel.razonSocial}</div>
                    </div>
                    <button onClick={function(){setRosOpen(false);}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:12}}>✕</button>
                  </div>

                  <div style={{marginBottom:16}}>
                    <div style={{fontWeight:700,fontSize:12,color:T.TEXT,marginBottom:8}}>Seleccioná los períodos a incluir en el ROS:</div>
                    {lp.length === 0 ? (
                      <div style={{color:T.TEXT3,fontSize:12,textAlign:'center',padding:'12px 0'}}>Este legajo no tiene períodos analizados.</div>
                    ) : lp.map(function(p){
                      var hasSigs = p.metricas && detectPatrones(p.metricas, sel, lineaBase(p, sel, periodos)).some(function(s){
                        return s.sev==='ALTA' && (!(p.sigsResolucion||{})[s.pat] || (p.sigsResolucion||{})[s.pat].estado!=='RESUELTA');
                      });
                      var checked = rosSelPer.indexOf(p.id) >= 0;
                      return (
                        <div key={p.id} onClick={function(){
                          setRosSelPer(function(prev){
                            return prev.indexOf(p.id)>=0 ? prev.filter(function(x){return x!==p.id;}) : prev.concat([p.id]);
                          });
                        }} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:4,cursor:'pointer',background:checked?'rgba(139,103,192,0.12)':T.BG3,border:'1px solid '+(checked?'rgba(139,103,192,0.4)':T.BORDER),marginBottom:6}}>
                          <input type="checkbox" checked={checked} readOnly style={{cursor:'pointer'}}/>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:600,fontSize:12,color:T.TEXT}}>{p.nombre}</div>
                            <div style={{fontSize:11,color:T.TEXT2}}>{p.metricas?fmtM(p.metricas.tIn)+' IN · '+fmtM(p.metricas.tOut)+' OUT · '+(p.metricas.totalTxns||0).toLocaleString('es-AR')+' txns':'Sin métricas calculadas'}</div>
                          </div>
                          {hasSigs && <span style={{background:T.RED,color:'white',borderRadius:8,padding:'2px 8px',fontSize:10,fontWeight:700}}>ALTA</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{background:'rgba(139,103,192,0.08)',border:'1px solid rgba(139,103,192,0.25)',borderRadius:3,padding:'8px 12px',marginBottom:16,fontSize:11}}>
                    <strong>N° de ROS:</strong> ROS-{new Date().getFullYear()}-{String(rosNum||'001').padStart(3,'0')} · <strong>Oficial:</strong> {currentUser&&currentUser.nombre||'Oficial de Cumplimiento'}
                  </div>

                  {rosSelPer.length === 0 && <div style={{color:T.AMBER,fontSize:12,marginBottom:10}}>⚠ Seleccioná al menos un período para generar el ROS.</div>}

                  <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button onClick={function(){setRosOpen(false);}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 16px',cursor:'pointer',fontSize:13}}>Cancelar</button>
                    <button
                      disabled={rosSelPer.length===0}
                      onClick={async function(){
                        // Incrementar contador ROS en Supabase
                        var num = rosNum || 1;
                        var yearKey = 'ros_counter_'+new Date().getFullYear();
                        try {
                          await fetch('/api/sync?action=kv', {
                            method:'POST', headers: await authHeaders({'Content-Type':'application/json'}),
                            body: JSON.stringify({k:yearKey, v:num})
                          });
                        } catch(e){}
                        // Generar ROS
                        var html = genROS(sel, periodos, rosSelPer, rfisLegajo, currentUser, num);
                        onReport(html);
                        auditLog(currentUser,'generar_ros','legajo',sel.id,{razonSocial:sel.razonSocial,rosNum:'ROS-'+new Date().getFullYear()+'-'+String(num).padStart(3,'0'),periodos:rosSelPer.length});
                        setRosOpen(false);
                      }}
                      style={{background:rosSelPer.length>0?T.VIOLET:T.BG4,color:'white',border:'none',borderRadius:4,padding:'8px 20px',cursor:rosSelPer.length>0?'pointer':'not-allowed',fontWeight:700,fontSize:13}}
                    >📋 Generar ROS ({rosSelPer.length} período{rosSelPer.length!==1?'s':''})</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* MODAL CIERRE DE CUENTA */}
          {cierreOpen ? <div style={{position:'fixed',inset:0,background:T.SCRIM,zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',overflow:'auto'}}>
            <div style={{background:T.BG2,borderRadius:8,padding:28,width:600,maxWidth:'92vw',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <div>
                  <div style={{fontWeight:700,color:T.RED,fontSize:16}}>🔒 Cierre de Cuenta</div>
                  <div style={{fontSize:12,color:T.TEXT2,marginTop:2}}>{sel.razonSocial} — {sel.cuit}</div>
                </div>
                <button onClick={function(){setCierreOpen(false);}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:12,color:T.TEXT2}}>✕</button>
              </div>

              {/* Resumen del legajo */}
              <div style={{background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:6,padding:'12px 14px',marginBottom:16,fontSize:12}}>
                <div style={{fontWeight:600,color:T.TEXT,marginBottom:8}}>Resumen del legajo</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {[['Alta',sel.createdAt],['Estado',getEstado(sel.estadoCuenta||'EN_ONBOARDING').label],['Segmento',sel.segmento],['Dictamen',sel.dictamen],['Períodos AML',periodos.filter(function(p){return p.legajoId===sel.id;}).length+' analizados']].map(function(r,i){return(
                    <div key={i} style={{fontSize:11}}><span style={{color:T.TEXT2}}>{r[0]}: </span><strong>{r[1]}</strong></div>
                  );})}
                </div>
              </div>

              {/* Tipo de cierre */}
              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,fontWeight:600,color:T.TEXT,display:'block',marginBottom:6}}>Motivo del cierre</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[
                    {id:'RIESGO_AML',label:'🚨 Riesgo AML',desc:'Patrones de lavado detectados'},
                    {id:'INCUMPLIMIENTO',label:'📋 Incumplimiento documental',desc:'Documentación incompleta o vencida'},
                    {id:'INACTIVIDAD',label:'⏸ Inactividad prolongada',desc:'Sin operaciones por período extendido'},
                    {id:'SOLICITUD_CLIENTE',label:'👤 Solicitud del cliente',desc:'Cierre voluntario por el titular'}
                  ].map(function(t){return(
                    <div key={t.id} onClick={function(){setCierreTipo(t.id);}} style={{border:'2px solid '+(cierreTipo===t.id?T.RED:T.BORDER),borderRadius:4,padding:'10px 12px',cursor:'pointer',background:cierreTipo===t.id?'rgba(255,68,85,0.1)':T.BG3}}>
                      <div style={{fontWeight:600,fontSize:12,color:cierreTipo===t.id?T.RED:T.TEXT2}}>{t.label}</div>
                      <div style={{fontSize:10,color:T.TEXT2,marginTop:2}}>{t.desc}</div>
                    </div>
                  );})}
                </div>
              </div>

              {/* Detalle del motivo */}
              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,fontWeight:600,color:T.TEXT,display:'block',marginBottom:6}}>Detalle / Fundamentación</label>
                <textarea
                  value={cierreMot}
                  onChange={function(e){setCierreMot(e.target.value);}}
                  rows={4}
                  placeholder="Describí los fundamentos de la decisión de cierre. Incluí referencias a períodos analizados, señales detectadas, incumplimientos o cualquier elemento relevante para el archivo de auditoría."
                  style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:12,resize:'vertical',boxSizing:'border-box'}}
                />
              </div>

              {/* Análisis IA */}
              <div style={{marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <label style={{fontSize:12,fontWeight:600,color:T.TEXT}}>Análisis automatizado IA</label>
                  <button
                    onClick={async function(){
                      setCierreLoading(true);
                      var lPers2 = periodos.filter(function(p){return p.legajoId===sel.id;});
                      var lastP = lPers2[lPers2.length-1];
                      var lastM2 = lastP&&lastP.txns?calcMetricas(lastP.txns,sel):null;
                      var lastSigs2 = lastM2?detectPatrones(lastM2,sel):[];
                      var lastSc2 = lastM2?calcScoring(lastM2,lastSigs2):null;
                      var apiKey2 = _KEYS.anthropic || '';
                      var oaiKey2 = _KEYS.openai || '';
                      var provider2 = _KEYS.provider || 'claude';
                      if (!apiKey2 && !oaiKey2) { toast('Configurá una API key en ⚙️'); setCierreLoading(false); return; }
                      var contexto = 'Empresa: '+sel.razonSocial+' | CUIT: '+(sel.cuit||'N/D')+' | Actividad: '+(sel.actividad||'N/D')+' | Segmento: '+(sel.segmento||'MEDIO')+' | Dictamen: '+(sel.dictamen||'N/D')+' | Red Flags KYB: '+(safeArr(sel.redFlags).join('; ')||'ninguna')+' | Períodos AML analizados: '+lPers2.length+(lastM2?' | Último período ('+( lastP.nombre)+'): Vol IN '+fmtM(lastM2.tIn)+', Vol OUT '+fmtM(lastM2.tOut)+', '+lastSigs2.length+' señales ('+lastSigs2.filter(function(s){return s.sev==='ALTA';}).length+' ALTA), Score AML '+(lastSc2?lastSc2.promedio.toFixed(2)+'/5 '+lastSc2.clasificacion:'N/D'):'');
                      var promptCierre = 'Sos analista senior Compliance de GOAT S.A./Rebit (PSP argentino). Redactá un análisis ejecutivo profesional de máximo 3 párrafos fundamentando el cierre de cuenta del siguiente cliente. Sé objetivo, técnico y basate estrictamente en los datos. Cita los indicadores concretos. Evaluá si corresponde considerar un ROS ante UIF. No uses bullets, escribe en prosa.\n\nDatos del cliente:\n'+contexto+'\n\nMotivo declarado de cierre: '+cierreTipo+'\nDetalle: '+(cierreMot||'Sin detalle adicional.');
                      try {
                        var cierreRes = await callProxyOrDirect(provider2, [{role:'user',content:promptCierre}], 600, true);
                        setCierreIA(typeof cierreRes === 'string' ? cierreRes : JSON.stringify(cierreRes));
                      } catch(err){ setCierreIA('Error al generar análisis: '+err.message); }
                      setCierreLoading(false);
                    }}
                    disabled={cierreLoading}
                    style={{background:cierreLoading?T.BG4:C.AC,color:'white',border:'none',borderRadius:4,padding:'6px 14px',cursor:cierreLoading?'not-allowed':'pointer',fontSize:11,fontWeight:700}}
                  >
                    {cierreLoading?'⏳ Analizando...':'🤖 Analizar con IA'}
                  </button>
                </div>
                {cierreIA ? <div style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'10px 12px',fontSize:11,lineHeight:1.7,color:T.TEXT2,whiteSpace:'pre-wrap'}}>{cierreIA}</div>
                  : <div style={{background:T.BG3,border:'1px dashed '+T.BORDER3,borderRadius:4,padding:'12px',fontSize:11,color:T.TEXT3,textAlign:'center'}}>Hacé clic en "Analizar con IA" para generar un análisis automático basado en el legajo y el último período AML.</div>}
              </div>

              {/* Botones */}
              <div style={{display:'flex',gap:8}}>
                <button
                  onClick={function(){
                    var html = genINF07Cierre(sel, periodos, cierreMot, cierreTipo, cierreIA);
                    onReport(html);
                    // Actualizar estado de cuenta a CERRADA automáticamente con historial
                    var updated = cambiarEstadoLegajo(sel, 'CERRADA', currentUser&&currentUser.nombre||'Sistema — INF-07');
                    saveList(legajos.map(function(l){return l.id===sel.id?updated:l;}));
                    auditLog(currentUser,'generar_inf07','legajo',sel.id,{razonSocial:sel.razonSocial,cuit:sel.cuit,motivoCierre:cierreTipo});
                    setCierreOpen(false);
                  }}
                  style={{flex:1,background:T.RED,color:'white',border:'none',borderRadius:4,padding:'11px 0',cursor:'pointer',fontWeight:700,fontSize:14}}
                >
                  📄 Generar INF-07 Cierre
                </button>
                <button onClick={function(){setCierreOpen(false);}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'11px 18px',cursor:'pointer',fontWeight:600,fontSize:12,}}>Cancelar</button>
              </div>
            </div>
          </div> : null}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <Card title="Perfil KYB">
            <table style={{width:'100%',fontSize:13}}>
              <tbody>{[['Actividad',sel.actividad||'N/D'],['Beneficiario final',sel.beneficiarioFinal||'N/D'],['Facturacion mensual',fmtM(sel.facturacionMensual)],['Limite diario',fmtM(sel.limiteDiario)],['Limite mensual',fmtM(sel.limiteMensual)]].map(function(r,i){return(
                <tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
                  <td style={{padding:'5px 8px',color:T.TEXT2,fontWeight:600}}>{r[0]}</td>
                  <td style={{padding:'5px 8px'}}>{r[1]}</td>
                </tr>
              );})}</tbody>
            </table>
          </Card>
          <Card title="Dictamen y scoring">
            <div style={{display:'flex',gap:10,marginBottom:10}}><Pill v={sel.dictamen}/><Pill v={sel.segmento}/></div>
            <div style={{fontSize:13,color:T.TEXT2}}>Score KYB: <strong style={{color:Number(scP2)>=4?C.ROJO:Number(scP2)>=3?C.NARANJA:C.VERDE}}>{scP2}/5</strong></div>
            <div style={{fontSize:12,color:T.TEXT2,marginTop:4}}>Checklist: {okC2}/{CHECKLIST_ITEMS.length} docs OK</div>
          </Card>
        </div>
        {safeArr(sel.redFlags).length > 0 ? <Card title={'Red Flags (' + sel.redFlags.length + ')'}>{sel.redFlags.map(function(rf,i){return <div key={i} style={{padding:'5px 0',borderBottom:'1px solid '+T.BORDER,fontSize:13,color:T.RED}}>🚩 {rf}</div>;})}</Card> : null}
        <Card title="Periodos AML" actions={<button onClick={function(){onAnalizar(sel,null);}} style={{background:'none',border:'1px solid rgba(255,255,255,0.5)',color:'white',borderRadius:4,padding:'4px 12px',cursor:'pointer',fontSize:12}}>+ Nuevo periodo</button>}>
          {lPeriodos.length === 0 ? <p style={{color:T.TEXT2,fontSize:13}}>Sin periodos. Subi un CSV para analizar.</p> :
          lPeriodos.map(function(p,i){
            // Usar métricas guardadas si existen, o recalcular si txns están en memoria
            var m2 = p.metricas || (p.txns && p.txns.length > 0 ? calcMetricas(p.txns, sel) : null);
            var txnCount = (p.txns && p.txns.length > 0) ? p.txns.length : (m2 ? m2.totalTxns : 0);
            var enMemoria = p.txns && p.txns.length > 0;
            // Contar señales ALTA desde scoring guardado o detectar si txns están en memoria
            var hi2 = 0;
            if (p.scoring && p.scoring.senales) {
              hi2 = p.scoring.senales.filter(function(s){return s.sev==='ALTA';}).length;
            } else if (m2 && enMemoria) {
              var sigs2 = detectPatrones(m2, sel);
              hi2 = sigs2.filter(function(s){return s.sev==='ALTA';}).length;
            }
            return (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid '+T.BORDER}}>
                <div>
                  <span style={{fontWeight:600,color:T.TEXT,fontSize:11,fontFamily:T.MONO}}>{p.nombre}</span>
                  <span style={{color:enMemoria?T.TEXT2:T.TEXT3,fontSize:11,marginLeft:8,fontFamily:T.MONO}}>
                    {txnCount.toLocaleString('es-AR')} txns
                    {!enMemoria && txnCount > 0 && <span style={{fontSize:9,color:T.AMBER,marginLeft:4}} title="Txns en Supabase, no cargadas en memoria">⚠</span>}
                  </span>
                  {hi2 > 0 ? <span style={{marginLeft:6,background:'rgba(255,68,85,0.2)',color:T.RED,borderRadius:2,padding:'2px 8px',fontSize:10,fontWeight:600,fontFamily:T.MONO,border:'1px solid rgba(255,68,85,0.4)'}}>{hi2} ALTA</span> : null}
                </div>
                <button onClick={function(){onAnalizar(sel,p);}} style={{background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'5px 12px',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:T.MONO}}>Analizar →</button>
              </div>
            );
          })}
        </Card>
      </div>
      </div>
    );
  }

  var filteredLegs = legajos.filter(function(l) {
    var matchSearch = !search || (l.razonSocial||'').toLowerCase().includes(search.toLowerCase()) || (l.cuit||'').includes(search) || (l.actividad||'').toLowerCase().includes(search.toLowerCase());
    var matchSeg = filtroSeg==='TODOS' || l.segmento===filtroSeg;
    var matchDict = filtroDict==='TODOS' || l.dictamen===filtroDict;
    var matchEst = filtroEst==='TODOS' || (l.estadoCuenta||'EN_ONBOARDING')===filtroEst;
    return matchSearch && matchSeg && matchDict && matchEst;
  });

  // ── Estadísticas por legajo ────────────────────────────────────────────────
  // Se calculan una sola vez recorriendo periodos (antes se recalculaban dentro
  // del map, una vez por fila). Misma lógica de conteo de señales ALTA que la
  // lista v2: solo cuenta períodos con txns hidratadas en memoria.
  var legIndex = {};
  legajos.forEach(function(l){ legIndex[l.id] = l; });
  var stats = {};
  legajos.forEach(function(l){ stats[l.id] = { periodos:0, alta:0, ultLabel:null, ultTs:0 }; });
  periodos.forEach(function(p) {
    var st = stats[p.legajoId];
    if (!st) return;
    st.periodos++;
    var fp = parseFechaAR(p.createdAt);
    var ts = fp ? fp.getTime() : 0;
    if (ts >= st.ultTs) { st.ultTs = ts; st.ultLabel = p.createdAt || null; }
    // Criterio único compartido (lib/aml.js): usa p.metricas persistidas, así que
    // ya no subreporta cuando las txns no están hidratadas en memoria.
    st.alta += contarAlta(p, legIndex[p.legajoId], periodos);
  });
  // Últ. análisis: período más reciente, o la fecha de análisis externo al sistema
  function ultAnalisis(l) {
    var st = stats[l.id] || {};
    if (st.ultLabel) return { label: st.ultLabel, ts: st.ultTs, externo: false };
    if (l.ultimoAnalisisExterno) {
      var fe = parseFechaAR(l.ultimoAnalisisExterno);
      return { label: l.ultimoAnalisisExterno, ts: fe ? fe.getTime() : 0, externo: true };
    }
    return { label: null, ts: 0, externo: false };
  }

  var SEG_ORD = {BAJO:0, MEDIO:1, 'MEDIO-ALTO':2, ALTO:3};
  var sortedLegs = filteredLegs.slice().sort(function(a, b) {
    var k = sortBy.k, d = sortBy.d, va, vb;
    if (k === 'segmento') { va = SEG_ORD[a.segmento]||0; vb = SEG_ORD[b.segmento]||0; }
    else if (k === 'periodos') { va = (stats[a.id]||{}).periodos||0; vb = (stats[b.id]||{}).periodos||0; }
    else if (k === 'ultAnalisis') { va = ultAnalisis(a).ts; vb = ultAnalisis(b).ts; }
    else if (k === 'estadoCuenta') { va = (a.estadoCuenta||'EN_ONBOARDING').toLowerCase(); vb = (b.estadoCuenta||'EN_ONBOARDING').toLowerCase(); }
    else { va = (a[k]||'').toString().toLowerCase(); vb = (b[k]||'').toString().toLowerCase(); }
    return va < vb ? -d : va > vb ? d : 0;
  });
  function toggleSort(k) {
    setSortBy(function(prev){ return prev.k === k ? {k:k, d:-prev.d} : {k:k, d:1}; });
  }

  function toggleSelect(id) {
    setSelected(function(prev){ return prev.indexOf(id)>=0 ? prev.filter(function(x){return x!==id;}) : prev.concat([id]); });
  }
  function selectAll() { setSelected(filteredLegs.map(function(l){return l.id;})); }
  function clearSel() { setSelected([]); }
  async function deleteSelected() {
    if (!selected.length) return;
    var names = selected.map(function(id){ var l=legajos.find(function(x){return x.id===id;}); return l ? '• '+(l.razonSocial||'Sin nombre') : ''; }).join('\n');
    if (!(await uiConfirm('Eliminar ' + selected.length + ' legajo(s)?\n\n' + names + '\n\nEsta acción no se puede deshacer.', {danger:true, confirmLabel:'Eliminar'}))) return;
    var newLegs = legajos.filter(function(l){return selected.indexOf(l.id)<0;});
    var newPers = periodos.filter(function(p){return selected.indexOf(p.legajoId)<0;});
    saveList(newLegs); setPeriodos(newPers);
    setSelected([]); setSelectMode(false);
  }
  function duplicateLegajo(l) {
    var copy = JSON.parse(JSON.stringify(l));
    copy.id = uid(); copy.razonSocial = (l.razonSocial||'Sin nombre') + ' (copia)'; copy.createdAt = todayStr();
    saveList(legajos.concat([copy]));
  }
  function exportLegajoJSON(l) {
    var lPers = periodos.filter(function(p){return p.legajoId===l.id;});
    var data = { legajo:l, periodos:lPers, exportedAt:new Date().toISOString() };
    var blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href=url; a.download='legajo-'+(l.razonSocial||l.id).replace(/[^a-z0-9]/gi,'_')+'.json';
    a.click(); URL.revokeObjectURL(url);
  }
  async function deleteSingle(l) {
    if (!(await uiConfirm('Eliminar "' + (l.razonSocial||'Sin nombre') + '"?\nEsta acción no se puede deshacer.', {danger:true, confirmLabel:'Eliminar'}))) return;
    var newLegs = legajos.filter(function(x){return x.id!==l.id;});
    var newPers = periodos.filter(function(p){return p.legajoId!==l.id;});
    saveList(newLegs); setPeriodos(newPers);
  }

  // ── Estilos de tabla derivados de tokens ───────────────────────────────────
  var thBase = {position:'sticky',top:0,zIndex:2,background:T.BG3,color:T.TEXT3,padding:'9px 10px',textAlign:'left',fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS,borderBottom:'1px solid '+T.BORDER2,whiteSpace:'nowrap'};
  var tdBase = {padding:'8px 10px',borderBottom:'1px solid '+T.BORDER,fontSize:12,verticalAlign:'middle',fontFamily:T.SANS};

  function thSort(k, label, extra) {
    var on = sortBy.k === k;
    var st = Object.assign({}, thBase, extra||{}, {cursor:'pointer',userSelect:'none'});
    if (on) st.color = T.ACCENT;
    return (
      <th key={k} onClick={function(){toggleSort(k);}} style={st} title={'Ordenar por ' + label}>
        {label}<span style={{marginLeft:5,color:T.ACCENT,opacity:on?1:0}}>{sortBy.d===1?'\u2191':'\u2193'}</span>
      </th>
    );
  }

  return (
    <div style={{padding:22}} onClick={function(){if(menuOpen)setMenuOpen(null);}}>
      {renderDrawer()}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <h2 style={{fontSize:15,fontWeight:600,color:T.TEXT,letterSpacing:'1px'}}>Legajos KYB ({legajos.length})</h2>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {selectMode ? (
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:12,color:T.TEXT2}}>{selected.length} seleccionado(s)</span>
              <button onClick={selectAll} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 12px',cursor:'pointer',fontSize:12}}>Todos ({filteredLegs.length})</button>
              <button onClick={deleteSelected} disabled={!selected.length} style={{background:selected.length?C.ROJO:T.BG4,color:'white',border:'none',borderRadius:4,padding:'6px 14px',cursor:selected.length?'pointer':'not-allowed',fontWeight:700,fontSize:12}}>🗑 Eliminar ({selected.length})</button>
              <button onClick={function(){setSelectMode(false);clearSel();}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'6px 12px',cursor:'pointer',fontSize:12}}>Cancelar</button>
            </div>
          ) : (
            <div style={{display:'flex',gap:8}}>
              <button onClick={function(){setSelectMode(true);}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 12px',cursor:'pointer',fontSize:12,color:T.TEXT2}}>☑ Seleccionar</button>
              <button onClick={function(){setForm(mkNew());setEditing(true);setSelId(null);setIaFields(null);setTab('resumen_ia');}} style={btnG}>+ Nuevo legajo</button>
            </div>
          )}
        </div>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="🔍 Buscar por razón social, CUIT o actividad..." style={{flex:'1 1 220px',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 12px',fontSize:13}}/>
        <select value={filtroSeg} onChange={function(e){setFiltroSeg(e.target.value);}} style={{border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:12,color:T.TEXT}}>
          <option value="TODOS">Todos los segmentos</option>
          <option>BAJO</option><option>MEDIO</option><option>MEDIO-ALTO</option><option>ALTO</option>
        </select>
        <select value={filtroDict} onChange={function(e){setFiltroDict(e.target.value);}} style={{border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:12,color:T.TEXT}}>
          <option value="TODOS">Todos los dictámenes</option>
          <option>APROBADO</option><option>CONDICIONAL</option><option>RECHAZADO</option>
        </select>
        <select value={filtroEst} onChange={function(e){setFiltroEst(e.target.value);}} style={{border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:12,color:T.TEXT}}>
          <option value="TODOS">Todos los estados</option>
          {ESTADOS_CUENTA.map(function(e){return <option key={e.id} value={e.id}>{e.label}</option>;})}
        </select>
        {(search||filtroSeg!=='TODOS'||filtroDict!=='TODOS'||filtroEst!=='TODOS') &&
          <button onClick={function(){setSearch('');setFiltroSeg('TODOS');setFiltroDict('TODOS');setFiltroEst('TODOS');}} style={{background:'none',border:'1px solid '+T.BORDER,borderRadius:4,padding:'6px 10px',cursor:'pointer',fontSize:12,color:T.TEXT2}}>✕ Limpiar</button>
        }
      </div>

      {legajos.length===0 && <Card title=""><p style={{color:T.TEXT2,textAlign:'center',padding:'20px 0'}}>No hay legajos. Creá el primero con "+ Nuevo legajo".</p></Card>}
      {filteredLegs.length===0 && legajos.length>0 && <Card title=""><p style={{color:T.TEXT2,textAlign:'center',padding:'16px 0'}}>Sin resultados para los filtros aplicados.</p></Card>}

      {/* ══ TABLA DE LEGAJOS ══════════════════════════════════════════════════ */}
      {sortedLegs.length > 0 && (
        <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,boxShadow:T.SHADOW.card}}>
          <table style={{width:'100%',borderCollapse:'separate',borderSpacing:0}}>
            <thead>
              <tr>
                {selectMode && <th style={Object.assign({},thBase,{width:36,borderTopLeftRadius:T.RADIUS.md})}></th>}
                {thSort('razonSocial','Razón social', selectMode?null:{borderTopLeftRadius:T.RADIUS.md})}
                {thSort('cuit','CUIT',{width:130})}
                {thSort('segmento','Segmento',{width:110})}
                {thSort('dictamen','Dictamen',{width:120})}
                {thSort('estadoCuenta','Estado',{width:180})}
                {thSort('periodos','Per.',{width:60,textAlign:'right'})}
                {thSort('ultAnalisis','Últ. análisis',{width:120})}
                {!selectMode && <th style={Object.assign({},thBase,{width:96,textAlign:'right',borderTopRightRadius:T.RADIUS.md})}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {sortedLegs.map(function(l){
                var st = stats[l.id] || {periodos:0, alta:0};
                var est = getEstado(l.estadoCuenta||'EN_ONBOARDING');
                var ua = ultAnalisis(l);
                var isSelected = selected.indexOf(l.id)>=0;
                var isMenuOpen = menuOpen===l.id;
                var isEstMenu = menuOpen==='est_'+l.id;
                var rowBg = isSelected ? T.ACCENT_SOFT : (selId===l.id ? T.BG3 : 'transparent');

                return (
                  <tr key={l.id}
                    onClick={function(){
                      if (menuOpen) { setMenuOpen(null); return; }
                      if (selectMode) { toggleSelect(l.id); } else { setSelId(l.id); }
                    }}
                    style={{cursor:'pointer',background:rowBg,transition:T.TRANS}}>

                    {selectMode && (
                      <td style={Object.assign({},tdBase,{width:36})}>
                        <input type="checkbox" checked={isSelected} readOnly style={{cursor:'pointer',pointerEvents:'none'}}/>
                      </td>
                    )}

                    {/* Razón social + actividad + señales ALTA */}
                    <td style={Object.assign({},tdBase,{minWidth:210})}>
                      <div style={{display:'flex',alignItems:'center',gap:9}}>
                        <span style={{width:3,height:24,borderRadius:2,background:segColor(l.segmento),flexShrink:0,opacity:0.9}}/>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={{fontWeight:600,color:T.TEXT,fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.razonSocial||'Sin nombre'}</div>
                          <div style={{fontSize:10,color:T.TEXT3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.actividad||'Sin actividad declarada'}</div>
                        </div>
                        {st.alta>0 && <span title={st.alta + ' señal(es) de severidad ALTA sin resolver'} style={{flexShrink:0,background:'rgba(255,68,85,0.14)',color:T.RED,border:'1px solid rgba(255,68,85,0.35)',borderRadius:T.RADIUS.pill,padding:'1px 8px',fontSize:10,fontWeight:700,fontFamily:T.MONO}}>{st.alta} ALTA</span>}
                      </div>
                    </td>

                    <td style={Object.assign({},tdBase,{fontFamily:T.MONO,fontSize:11,color:l.cuit?T.TEXT2:T.TEXT4,whiteSpace:'nowrap'})}>{l.cuit||'N/D'}</td>
                    <td style={tdBase}><Pill v={l.segmento}/></td>
                    <td style={tdBase}><Pill v={l.dictamen}/></td>

                    {/* Estado con cambio rápido */}
                    <td style={Object.assign({},tdBase,{position:'relative'})}>
                      <span
                        onClick={function(e){e.stopPropagation();setMenuOpen(isEstMenu?null:'est_'+l.id);}}
                        title="Clic para cambiar el estado de cuenta"
                        style={{display:'inline-block',background:est.bg,color:est.color,border:'1px solid '+est.color,borderRadius:T.RADIUS.pill,padding:'2px 10px',fontSize:10,fontWeight:700,whiteSpace:'nowrap',cursor:'pointer',userSelect:'none'}}
                      >{est.label} ▾</span>
                      {isEstMenu && (
                        <div onClick={function(e){e.stopPropagation();}} style={{position:'absolute',left:10,top:'100%',background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.md,boxShadow:T.SHADOW.pop,zIndex:400,minWidth:260,padding:5}}>
                          <div style={{padding:'6px 10px',fontSize:10,fontWeight:600,color:T.TEXT3,letterSpacing:'0.8px',textTransform:'uppercase',borderBottom:'1px solid '+T.BORDER,marginBottom:4}}>Cambiar estado de cuenta</div>
                          {ESTADOS_CUENTA.map(function(eOpt){
                            var isCurrent = (l.estadoCuenta||'EN_ONBOARDING')===eOpt.id;
                            return (
                              <div
                                key={eOpt.id}
                                onClick={function(ev){ev.stopPropagation();if(!isCurrent){cambioRapidoEstado(l,eOpt.id);}setMenuOpen(null);}}
                                style={{padding:'7px 10px',cursor:isCurrent?'default':'pointer',fontSize:12,display:'flex',gap:8,alignItems:'center',borderRadius:T.RADIUS.sm,background:isCurrent?eOpt.bg:'transparent',opacity:isCurrent?0.7:1}}
                              >
                                <span style={{width:8,height:8,borderRadius:'50%',background:eOpt.color,display:'inline-block',flexShrink:0}}></span>
                                <span style={{color:eOpt.color,fontWeight:isCurrent?700:500}}>{eOpt.label}</span>
                                <span style={{marginLeft:'auto',fontSize:10,color:T.TEXT3}}>{isCurrent?'actual':eOpt.desc}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    <td style={Object.assign({},tdBase,{fontFamily:T.MONO,fontSize:12,textAlign:'right',color:st.periodos?T.TEXT2:T.TEXT4})}>{st.periodos}</td>

                    <td style={Object.assign({},tdBase,{fontFamily:T.MONO,fontSize:11,whiteSpace:'nowrap',color:ua.label?T.TEXT2:T.TEXT4})}>
                      {ua.label || '—'}
                      {ua.externo && <span title="Análisis previo, externo al sistema" style={{marginLeft:5,color:T.TEXT4,fontSize:9}}>ext</span>}
                    </td>

                    {/* Acciones */}
                    {!selectMode && (
                      <td style={Object.assign({},tdBase,{textAlign:'right',position:'relative',whiteSpace:'nowrap'})}>
                        <button onClick={function(e){e.stopPropagation();setSelId(l.id);}} style={{background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.sm,padding:'4px 11px',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:T.SANS}}>Abrir</button>
                        <button
                          onClick={function(e){e.stopPropagation();setMenuOpen(isMenuOpen?null:l.id);}}
                          style={{marginLeft:4,background:'transparent',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,padding:'4px 8px',cursor:'pointer',fontSize:13,color:T.TEXT3,lineHeight:1}}
                        >⋯</button>
                        {isMenuOpen && (
                          <div onClick={function(e){e.stopPropagation();}} style={{position:'absolute',right:10,top:'100%',background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.md,boxShadow:T.SHADOW.pop,zIndex:400,minWidth:180,padding:5,textAlign:'left'}}>
                            {[
                              {icon:'✏️',label:'Editar',action:function(){setMenuOpen(null);setForm(JSON.parse(JSON.stringify(l)));setEditing(true);setTab('datos');}},
                              {icon:'📋',label:'Duplicar',action:function(){setMenuOpen(null);duplicateLegajo(l);}},
                              {icon:'💾',label:'Exportar JSON',action:function(){setMenuOpen(null);exportLegajoJSON(l);}}
                            ].concat(puedeEliminar(currentUser.rol) ? [{icon:'🗑',label:'Eliminar',action:function(){setMenuOpen(null);deleteSingle(l);},danger:true}] : [])
                            .map(function(item,j){return(
                              <div key={j} onClick={item.action} style={{padding:'7px 10px',cursor:'pointer',fontSize:12,color:item.danger?T.RED:T.TEXT2,fontWeight:item.danger?600:500,borderRadius:T.RADIUS.sm,display:'flex',gap:8,alignItems:'center'}}>
                                <span>{item.icon}</span>{item.label}
                              </div>
                            );})}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {legajos.length > 0 && (
        <div style={{fontSize:11,color:T.TEXT3,textAlign:'center',marginTop:10,fontFamily:T.SANS}}>
          {filteredLegs.length} de {legajos.length} legajos · {periodos.length} periodos
        </div>
      )}
    </div>
  );
}

export default LegajosView;
