import { authHeaders } from "./session";
import { base64ToBlob, fileToBase64, parseJsonFromResponse, sleep } from "./utils";

async function extractWithClaude(filesOrBlocks) {
  var contentBlocks = [];

  // Acepta tanto un array de File objects como content blocks ya construidos
  if (filesOrBlocks.length > 0 && filesOrBlocks[0] instanceof File) {
    // Modo legacy: recibe File objects (no debería usarse más)
    for (var i = 0; i < filesOrBlocks.length; i++) {
      var f = filesOrBlocks[i];
      var b64 = await fileToBase64(f);
      if (f.type === 'application/pdf') {
        contentBlocks.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 }, title:f.name });
      } else if (f.type.startsWith('image/')) {
        contentBlocks.push({ type:'image', source:{ type:'base64', media_type:f.type, data:b64 } });
      }
      contentBlocks.push({ type:'text', text:'[Archivo: ' + f.name + ']' });
    }
  } else {
    // Modo nuevo: recibe content blocks ya construidos por handleUpload
    contentBlocks = filesOrBlocks;
  }
  var prompt = `Sos analista senior Compliance & AML de GOAT S.A. (PSP argentino regulado por UIF/BCRA).
FECHA DE HOY: ${new Date().toLocaleDateString('es-AR')} (${new Date().getFullYear()}). Usá esta fecha como referencia para evaluar si algo es pasado, presente o futuro.
Analizá exhaustivamente los documentos adjuntos y extraé TODA la información posible para completar el legajo KYB corporativo.
Devolvé SOLO JSON válido, sin texto previo, sin backticks, sin comentarios.

ESTRUCTURA REQUERIDA:
{
  "razonSocial": "nombre legal completo de la empresa tal como figura en documentos",
  "cuit": "CUIT con formato XX-XXXXXXXX-X",
  "actividad": "actividad principal o giro comercial según estatuto o constancia AFIP",
  "facturacionMensual": numero_en_pesos (estimado conservador según estados contables o perfil),
  "limiteDiario": numero_en_pesos (sugerir conservador: 10-20% de facturacion mensual),
  "limiteMensual": numero_en_pesos (sugerir igual o menor a facturacion mensual declarada),
  "beneficiarioFinal": "nombre completo del/los beneficiario(s) final(es) con participacion >10%",
  "domicilio": "domicilio fiscal completo con calle, numero, localidad, provincia",
  "segmento": "BAJO|MEDIO|MEDIO-ALTO|ALTO",
  "dictamen": "APROBADO|CONDICIONAL|RECHAZADO",

  "checklist": {
    "Estatuto / Contrato social": "OK|Pendiente|Bloqueante|N/A",
    "Inscripcion registral (IGJ/INAES)": "OK|Pendiente|Bloqueante|N/A",
    "Constancia CUIT/AFIP": "OK|Pendiente|Bloqueante|N/A",
    "Acta de directorio vigente": "OK|Pendiente|Bloqueante|N/A",
    "Poder / Autorizacion firmante": "OK|Pendiente|Bloqueante|N/A",
    "DNI / Pasaporte firmante": "OK|Pendiente|Bloqueante|N/A",
    "Declaracion beneficiario final (>10%)": "OK|Pendiente|Bloqueante|N/A",
    "Estados contables (3 ejercicios)": "OK|Pendiente|Bloqueante|N/A",
    "Declaracion patrimonial DDJJ": "OK|Pendiente|Bloqueante|N/A",
    "Comprobante domicilio fiscal": "OK|Pendiente|Bloqueante|N/A",
    "Comprobante domicilio comercial": "OK|Pendiente|Bloqueante|N/A",
    "Certificado actividad / habilitacion": "OK|Pendiente|Bloqueante|N/A",
    "DDJJ AML (PEP/SO/UBO)": "OK|Pendiente|Bloqueante|N/A",
    "Constancia IVA / Monotributo": "OK|Pendiente|Bloqueante|N/A",
    "Referencias bancarias / comerciales": "OK|Pendiente|Bloqueante|N/A"
  },

  "kybScores": {
    "Completitud documental": 1-5,
    "Perfil de riesgo - actividad": 1-5,
    "Screening PEP/sanciones": 1-5,
    "Beneficiario final": 1-5,
    "Estructura societaria": 1-5,
    "Coherencia financiera": 1-5,
    "Antecedentes AML": 1-5
  },

  "representanteLegal": "nombre completo del representante legal / apoderado con CUIT/DNI si figura",
  "presidente": "nombre completo del presidente del directorio si es SA, o gerente si es SRL",
  "vinculados": "nombres de otros directores, socios o personas vinculadas relevantes (separados por coma)",
  "tipoSociedad": "SA|SRL|SAS|COOPERATIVA|ASOCIACION|OTRO",
  "paisConstitucion": "Argentina por defecto, indicar si es extranjera",
  "cotizaBolsa": false,
  "grupoEconomico": "nombre del grupo económico si pertenece a uno, vacío si no",
  "redFlags": ["lista de alertas detectadas en los documentos"],
  "observaciones": ["notas tecnicas del analisis"]
}

REGLAS DE COMPLETADO:

CHECKLIST — marca "OK" solo si el documento está presente en los adjuntos. Marca "Pendiente" si no está. Marca "Bloqueante" si hay inconsistencia grave (ej: datos contradictorios, vencido, ilegible).

SCORING KYB (1=Bajo riesgo, 5=Alto riesgo):
- "Completitud documental": 1 si >12 docs OK, 3 si 8-12, 5 si <8
- "Perfil de riesgo - actividad": evaluar si la actividad es sensible (financiera, inmobiliaria, casino, crypto, exportación = mayor riesgo). 1=actividad de bajo riesgo, 5=actividad muy sensible
- "Screening PEP/sanciones": 1 si no hay indicadores, 3 si hay menciones públicas ambiguas, 5 si hay indicadores claros de PEP o sanciones
- "Beneficiario final": 1 si está claramente identificado con documentación, 3 si está declarado sin documentación, 5 si no está identificado o hay estructura opaca
- "Estructura societaria": 1 si es simple y transparente, 3 si tiene capas societarias, 5 si es compleja, offshore o poco transparente
- "Coherencia financiera": 1 si facturación/actividad son coherentes, 3 si hay inconsistencias menores, 5 si hay inconsistencias graves o cifras inexplicables
- "Antecedentes AML": 1 si no hay indicadores, 3 si hay menciones en prensa o registros, 5 si hay antecedentes judiciales o regulatorios

REGLAS CRÍTICAS SOBRE FECHAS Y DOCUMENTOS ARGENTINOS — LEER CON ATENCIÓN ANTES DE GENERAR CUALQUIER RED FLAG:

═══════════════════════════════════════════════════════════
FECHA DE REFERENCIA: HOY ES ${new Date().toLocaleDateString('es-AR')} (AÑO ${new Date().getFullYear()}).
CUALQUIER FECHA IGUAL O ANTERIOR A HOY ES UNA FECHA PASADA. NO ES FUTURA.
═══════════════════════════════════════════════════════════

LÓGICA TEMPORAL OBLIGATORIA:
- Una fecha de 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 o 2025 es SIEMPRE una fecha PASADA. Nunca la llames futura.
- Solo es "fecha futura" una fecha POSTERIOR a ${new Date().toLocaleDateString('es-AR')}.
- Si el contrato social tiene fecha 29/07/2025 → es pasado (hace ${Math.floor((new Date() - new Date('2025-07-29'))/86400000)} días).
- PROHIBIDO: generar red flag por "fecha futura" si la fecha es del año 2025 o anterior.

VIGENCIA LEGAL DE DOCUMENTOS ARGENTINOS — COMPORTAMIENTO ESPERADO, NO SON ERRORES:

1. DNI / Pasaporte argentino:
   - Se emiten en una fecha (ej: 2010, 2015, 2017, 2019) y tienen vigencia de 5, 10 o 15 años.
   - Un DNI emitido en 2017 está VIGENTE hasta 2027. Es perfectamente válido.
   - Es COMPLETAMENTE NORMAL y ESPERADO que el DNI del firmante tenga fecha anterior al contrato social.
   - La empresa se CONSTITUYE DESPUÉS de que sus fundadores nazcan y obtengan DNI.
   - NUNCA ES RED FLAG: "contrato social posterior al DNI del representante". Es la única secuencia posible.
   - NUNCA ES RED FLAG: "DNI emitido antes de la constitución de la empresa".

2. Contrato Social / Estatuto:
   - Su fecha es la fecha de constitución. Siempre es posterior a los DNIs de los socios.
   - Una sociedad constituida en 2025 con socios que tienen DNIs de 2010-2020 → COMPLETAMENTE NORMAL.
   - NUNCA ES RED FLAG la secuencia: DNI 2017 → Contrato Social 2025.

3. Inscripción Registral (IGJ / RPC / INAES):
   - La fecha de inscripción es posterior a la del estatuto (días o meses después). NORMAL.
   - No vence, es permanente.

4. Constancia de CUIT / AFIP:
   - Puede reemitirse en cualquier momento. Fecha reciente no indica problema.
   - El número de CUIT es permanente desde su asignación.

5. Acta de Directorio / Asamblea:
   - Debe ser reciente para reflejar la autoridad actual del firmante.
   - SÍ es red flag si tiene MÁS DE 24 MESES de antigüedad respecto a hoy (${new Date().toLocaleDateString('es-AR')}).
   - NO es red flag si tiene menos de 24 meses.

6. Estados Contables:
   - Los ejercicios son anuales (cierran generalmente al 31/12 o 30/06).
   - Es NORMAL que los estados más recientes sean del ejercicio anterior.
   - SÍ es red flag si no hay estados de los últimos 2 ejercicios.

7. Poder Notarial:
   - Vigencia variable: puede ser por plazo determinado o indefinido.
   - Fecha anterior a la operación que autoriza → NORMAL.

8. Habilitación Municipal / Certificado de Actividad:
   - Tienen fecha de emisión y vencimiento. SÍ es red flag si la fecha de vencimiento ya pasó.

RELACIONES TEMPORALES QUE SON NORMALES Y NO DEBEN GENERAR RED FLAG:
✓ DNI año X → Contrato Social año X+N → NORMAL (la empresa se crea después de los fundadores)
✓ Estatuto año X → Acta de directorio año X+N → NORMAL (las actas son posteriores a la constitución)
✓ Inscripción IGJ posterior al estatuto en días/meses → NORMAL (el trámite lleva tiempo)
✓ Constancia AFIP con fecha reciente aunque el CUIT sea antiguo → NORMAL
✓ Diferentes documentos con diferentes fechas de emisión → NORMAL
✓ Documento emitido en fecha reciente pero con datos históricos → NORMAL

RED FLAGS GENUINOS — reportar SOLO estas situaciones:
⚠ Razón social diferente entre documentos del mismo legajo (ej: "ABC S.A." vs "ABC S.R.L.")
⚠ CUIT que no coincide entre documentos
⚠ Fecha de algún documento POSTERIOR a HOY (${new Date().toLocaleDateString('es-AR')}) — imposible
⚠ DNI corresponde a persona diferente al declarado como representante
⚠ Domicilio fiscal contradictorio entre documentos sin justificación
⚠ Actividad declarada en AFIP distinta a la del estatuto
⚠ Beneficiario final no declarado o estructura societaria que oculta el control real
⚠ Actividades de alto riesgo AML sin justificación: casino, juegos de azar, crypto, remesas, metales preciosos
⚠ Inhabilitaciones, quiebras, concursos preventivos, procesos penales mencionados
⚠ Documentos con alteraciones, correcciones sospechosas o sellos ilegibles
⚠ Datos numéricos imposibles (facturación mayor al PBI provincial, etc.)
⚠ Personas jurídicas en jurisdicciones de alto riesgo GAFI sin justificación
⚠ Acta de directorio con MÁS DE 24 MESES respecto a hoy (${new Date().toLocaleDateString('es-AR')})
⚠ Habilitación/certificado con fecha de vencimiento anterior a hoy (${new Date().toLocaleDateString('es-AR')})

REGLA DE ORO: Ante la duda, NO generes el red flag. Es preferible no reportar algo cuestionable que generar un falso positivo que desoriente al analista. Solo reportar certezas.

Si no encontrás un dato, dejá el campo vacío o en 0. Nunca inventes datos.`;

  contentBlocks.push({ type:'text', text:prompt });

  // Siempre usar el proxy del servidor para evitar CORS en todos los browsers
  // Separar los bloques de documentos del prompt
  // Incluye _isDoc (texto extraído de PDF) además de document/image binarios
  var docBlocks = contentBlocks.filter(function(b){
    return b.type === 'document' || b.type === 'image' || (b.type === 'text' && b._isDoc === true);
  });
  // Batch size según tipo de contenido:
  // - PDF binario (type=document): 1 por lote (lento, pesado)
  // - Imágenes JPEG de PDF escaneado: 3 documentos-equivalentes por lote (liviano)
  // - Texto extraído (_isDoc): 5 por lote (rapidísimo)
  var tienePDFBinario = docBlocks.some(function(b){ return b.type === 'document'; });
  var tieneImagenes   = docBlocks.some(function(b){ return b.type === 'image'; });
  var tienesBinarios  = tienePDFBinario; // solo PDF binario reduce el batch
  var DOC_BLOCKS_PER_BATCH = tienePDFBinario ? 1 : (tieneImagenes ? 3 : 5);
  // Sleep entre lotes según tipo
  var SLEEP_MS = tienePDFBinario ? 6000 : (tieneImagenes ? 2000 : 800);

  // Filtrar documentos que superen 3.5MB de tamaño (para dejar margen al prompt y compresión)
  var MAX_DOC_BYTES = 3.5 * 1024 * 1024;
  var docsOmitidos = 0;
  docBlocks = docBlocks.filter(function(b) {
    var dataStr = (b.source && b.source.data) ? b.source.data : '';
    var byteSize = dataStr.length * 0.75; // base64 → bytes aprox
    if (byteSize > MAX_DOC_BYTES) {
      docsOmitidos++;
      console.warn('[GOAT IA] Documento omitido por tamaño: ' + (byteSize/1024/1024).toFixed(1) + 'MB (límite 3.5MB)');
      return false;
    }
    return true;
  });
  if (docsOmitidos > 0) {
    console.warn('[GOAT IA] ' + docsOmitidos + ' documento(s) omitido(s) por exceder el límite de tamaño. Usá PDFs más livianos o comprimí las imágenes antes de subir.');
  }
  var textBlocks = contentBlocks.filter(function(b){ return b.type === 'text'; });
  var promptBlock = textBlocks[textBlocks.length - 1];

  // Si hay pocos documentos, enviar todo junto
  if (docBlocks.length <= DOC_BLOCKS_PER_BATCH) {
    // Limpiar _isDoc de todos los bloques antes de enviar
    var contentClean = contentBlocks.map(function(b){
      if (b._isDoc) return { type: 'text', text: b.text };
      return b;
    });
    return await callProxyOrDirect('claude', [{ role:'user', content:contentClean }], 8000);
  }

  // Prompt especial para análisis por lotes — CRÍTICO para evitar falsos positivos
  var totalBatches = Math.ceil(docBlocks.length / DOC_BLOCKS_PER_BATCH);
  var batchPromptText = promptBlock.text + '\n\n'
    + '══════════════════════════════════════════════════════════\n'
    + 'INSTRUCCIÓN CRÍTICA — ANÁLISIS EN LOTE (LEER ANTES DE RESPONDER):\n'
    + 'Este análisis se divide en ' + totalBatches + ' lotes. Este mensaje contiene SOLO ALGUNOS de los documentos del legajo.\n'
    + 'REGLAS OBLIGATORIAS para análisis en lote:\n'
    + '1. CHECKLIST: Marca "OK" únicamente para documentos que PUEDAS VER EN ESTE LOTE. Para todo lo demás escribe "Pendiente" (NUNCA "Bloqueante" por documentos que simplemente no están en este lote).\n'
    + '2. RED FLAGS: Reportá SOLO problemas REALES en los docs de ESTE lote: inconsistencias, vencimientos, irregularidades visibles. PROHIBIDO generar flags por: datos ausentes del lote (\"beneficiario final no identificado en este lote\", \"CUIT no identificado en este lote\", \"razón social no surge de este lote\"). Si un dato no está en este lote, dejarlo en blanco.\n'
    + '2b. ILEGIBILIDAD: Solo reportar si el documento está físicamente deteriorado en este lote. Si simplemente no está, NO generar red flag.\n'
    + '3. DATOS: Completá solo los campos que puedas inferir de los documentos presentes. Dejá en blanco los que no puedas determinar.\n'
    + '4. SCORING KYB: Evaluá solo los factores que puedas determinar con los docs disponibles. Si no tenés info suficiente, poné 0.\n'
    + '══════════════════════════════════════════════════════════';

  var batchPromptBlock = { type: 'text', text: batchPromptText };

  // ── Analizar en lotes — PROCESO RESILIENTE ──────────────────────────
  // Cada lote es independiente: si falla tras reintentos, se divide en
  // sub-lotes de 1 documento. Si un documento individual falla, se omite
  // y el proceso CONTINÚA con el resto. Nunca se pierde todo el trabajo.
  var allResults = [];
  var docsFallidos = [];

  function nombreDeBloque(b) {
    if (b.title) return b.title;
    if (b._isDoc && b.text) {
      var m = b.text.match(/^=== (.+?) ===/);
      if (m) return m[1];
    }
    return b.type === 'image' ? 'imagen' : 'documento';
  }

  async function procesarLote(docs, etiqueta) {
    var docsClean = docs.map(function(b){
      if (b._isDoc) return { type: 'text', text: b.text };
      var c = Object.assign({}, b); delete c._fromPDF; delete c.title;
      return c;
    });
    var blocks = docsClean.concat([batchPromptBlock]);
    console.log('[GOAT IA] ' + etiqueta);
    return await callProxyOrDirect('claude', [{ role:'user', content:blocks }], 6000);
  }

  for (var bStart = 0; bStart < docBlocks.length; bStart += DOC_BLOCKS_PER_BATCH) {
    var batchNum = Math.floor(bStart / DOC_BLOCKS_PER_BATCH) + 1;
    var batchDocs = docBlocks.slice(bStart, bStart + DOC_BLOCKS_PER_BATCH);

    try {
      var batchResult = await procesarLote(batchDocs, 'Lote ' + batchNum + ' de ' + totalBatches);
      allResults.push(batchResult);
    } catch(loteErr) {
      var esBatchFail = loteErr.message && (loteErr.message.indexOf('BATCH_FAILED:') === 0 || loteErr.message.indexOf('SERVER_TIMEOUT:') === 0);
      if (esBatchFail && batchDocs.length > 1) {
        // División automática: procesar los documentos del lote de a 1
        console.warn('[GOAT IA] Lote ' + batchNum + ' falló — dividiendo en ' + batchDocs.length + ' sub-lotes individuales...');
        for (var sd = 0; sd < batchDocs.length; sd++) {
          var docIndividual = [batchDocs[sd]];
          var nombreDoc = nombreDeBloque(batchDocs[sd]);
          try {
            var subResult = await procesarLote(docIndividual, 'Sub-lote ' + (sd+1) + '/' + batchDocs.length + ' del lote ' + batchNum + ' (' + nombreDoc + ')');
            allResults.push(subResult);
          } catch(subErr) {
            console.error('[GOAT IA] Documento omitido tras reintentos: ' + nombreDoc + ' — ' + subErr.message);
            docsFallidos.push(nombreDoc);
          }
          if (sd < batchDocs.length - 1) await sleep(1500);
        }
      } else if (esBatchFail) {
        // Lote de 1 documento que falló definitivamente → omitir y seguir
        var nombreUnico = nombreDeBloque(batchDocs[0]);
        console.error('[GOAT IA] Documento omitido tras reintentos: ' + nombreUnico);
        docsFallidos.push(nombreUnico);
      } else {
        // Error no reintentable (API key, 401, 413 individual) → propagar
        throw loteErr;
      }
    }

    if (bStart + DOC_BLOCKS_PER_BATCH < docBlocks.length) {
      await sleep(SLEEP_MS); // PDF: 6s; imagen: 2s; texto: 800ms
    }
  }

  // Si TODO falló, informar con claridad
  if (allResults.length === 0) {
    throw new Error('No se pudo procesar ningún documento después de todos los reintentos.\n'
      + 'Documentos intentados: ' + docsFallidos.join(', ') + '\n'
      + 'Verificá el estado de las funciones de Vercel o intentá más tarde.');
  }

  // ── MERGE INTELIGENTE ─────────────────────────────────────────────────────
  // Regla fundamental: OK siempre gana — si cualquier lote encontró el doc, está OK.
  // Un "Bloqueante" solo se aplica si el lote que TIENE ese documento lo marcó así.
  var merged = {};

  allResults.forEach(function(r) {
    if (!r || typeof r !== 'object') return;
    Object.keys(r).forEach(function(k) {

      // CHECKLIST — OK gana siempre sobre Bloqueante/Pendiente
      if (k === 'checklist') {
        if (!merged.checklist) merged.checklist = {};
        Object.keys(r.checklist || {}).forEach(function(item) {
          var cur = merged.checklist[item];
          var nxt = r.checklist[item];
          if (!nxt) return;
          if (!cur) { merged.checklist[item] = nxt; return; }
          // Jerarquía: OK > N/A > Bloqueante > Pendiente
          // Si CUALQUIER lote dice OK → el doc existe → es OK
          if (nxt === 'OK') { merged.checklist[item] = 'OK'; return; }
          if (cur === 'OK') return; // Ya está OK, no degradar
          if (nxt === 'N/A' && cur !== 'OK') { merged.checklist[item] = 'N/A'; return; }
          if (cur === 'N/A') return;
          if (nxt === 'Bloqueante' && cur === 'Pendiente') { merged.checklist[item] = 'Bloqueante'; return; }
        });

      // SCORING KYB — tomar el máximo valor informado (más información = mejor score)
      } else if (k === 'kybScores') {
        if (!merged.kybScores) merged.kybScores = {};
        Object.keys(r.kybScores || {}).forEach(function(f) {
          var n = Number(r.kybScores[f]);
          var cur = Number(merged.kybScores[f]) || 0;
          if (n > 0) merged.kybScores[f] = Math.max(cur, n);
        });

      // RED FLAGS — deduplicar agresivamente (evitar las 52 repeticiones)
      } else if (k === 'redFlags') {
        if (!merged.redFlags) merged.redFlags = [];
        (r.redFlags || []).forEach(function(v) {
          if (!v || v.length < 10) return;
          // Filtrar red flags genéricas sobre "falta documentación" que son artefactos del lote
          var lower = v.toLowerCase();
          // ── Artefactos de lote: flags generados porque el dato no estaba en ESE lote
          var esArtefactoLote =
            lower.indexOf('en este lote') >= 0
            || lower.indexOf('en este batch') >= 0
            || lower.indexOf('no surge de este lote') >= 0
            || lower.indexOf('no surge de los documentos') >= 0
            || lower.indexOf('no identificado en este lote') >= 0
            || lower.indexOf('no identificable en el documento presentado') >= 0
            || lower.indexOf('no disponible en este lote') >= 0
            || lower.indexOf('en los documentos presentes en este lote') >= 0
            || lower.indexOf('presentes en este lote') >= 0
            || lower.indexOf('no se cuenta con este dato en el lote') >= 0
            || (lower.indexOf('cuit') >= 0 && lower.indexOf('no identificado en este') >= 0)
            || (lower.indexOf('razón social') >= 0 && lower.indexOf('no identificable') >= 0)
            || (lower.indexOf('razón social') >= 0 && lower.indexOf('no identificado') >= 0)
            || (lower.indexOf('tipo societario') >= 0 && lower.indexOf('no determinado') >= 0)
            || (lower.indexOf('razón social de la empresa no') >= 0)
            || (lower.indexOf('razón social no surge') >= 0);

          // ── Red flags genéricas por falta de documentación (no procesables)
          var esFaltaDoc = lower.indexOf('falta documentaci') >= 0
            || (lower.indexOf('documentaci') >= 0 && lower.indexOf('insuficiente') >= 0)
            || lower.indexOf('solo se presenta') >= 0
            || lower.indexOf('solo se cuenta') >= 0
            || lower.indexOf('solo se adjunta') >= 0
            || lower.indexOf('solo se dispone') >= 0
            || lower.indexOf('imposible completar') >= 0
            || lower.indexOf('no es posible completar') >= 0
            || lower.indexOf('requiere documentaci') >= 0
            || lower.indexOf('necesario completar') >= 0
            || lower.indexOf('necesario solicitar') >= 0
            || lower.indexOf('necesario requerir') >= 0
            || lower.indexOf('requiere completar') >= 0
            || lower.indexOf('legajo incompleto') >= 0
            || lower.indexOf('legajo altamente incompleto') >= 0
            || (lower.indexOf('falta') >= 0 && lower.indexOf('kyb') >= 0)
            || (lower.indexOf('ausencia') >= 0 && lower.indexOf('documentaci') >= 0)
            || (lower.indexOf('no se puede') >= 0 && lower.indexOf('determinar') >= 0)
            || (lower.indexOf('no se puede') >= 0 && lower.indexOf('identificar') >= 0)
            || (lower.indexOf('no se puede') >= 0 && lower.indexOf('completar') >= 0)
            || (lower.indexOf('imposible') >= 0 && lower.indexOf('determinar') >= 0)
            || (lower.indexOf('imposible') >= 0 && lower.indexOf('evaluar') >= 0);
          
          var esDescartable = esArtefactoLote || esFaltaDoc;
          if (esDescartable) return; // Descartar artefacto de lote
          // Deduplicar por similitud — 80 chars + normalización semántica por tópico
          var vNorm = v.toLowerCase().replace(/[🚩⚠️•\-]/g, '').replace(/\s+/g, ' ').trim();
          var TEMAS_UNICOS = ['beneficiario final', 'cuit de la sociedad', 'razón social', 'tipo societario'];
          var isDuplicate = merged.redFlags.some(function(existing) {
            if (existing === v) return true;
            var eNorm = existing.toLowerCase().replace(/[🚩⚠️•\-]/g, '').replace(/\s+/g, ' ').trim();
            // Comparar primeros 80 chars normalizados
            if (vNorm.slice(0, 80) === eNorm.slice(0, 80)) return true;
            // Si comparten tópico y tienen contenido muy similar (>70 chars en común al inicio)
            for (var ti = 0; ti < TEMAS_UNICOS.length; ti++) {
              if (vNorm.indexOf(TEMAS_UNICOS[ti]) >= 0 && eNorm.indexOf(TEMAS_UNICOS[ti]) >= 0) {
                if (vNorm.slice(0, 60) === eNorm.slice(0, 60)) return true;
              }
            }
            return false;
            var shortA = v.slice(0, 40).toLowerCase();
            var shortB = existing.slice(0, 40).toLowerCase();
            return shortA === shortB;
          });
          if (!isDuplicate) merged.redFlags.push(v);
        });

      // OBSERVACIONES — deduplicar
      } else if (k === 'observaciones') {
        if (!merged.observaciones) merged.observaciones = [];
        (r.observaciones || []).forEach(function(v) {
          if (!v) return;
          var isDup = merged.observaciones.some(function(e){ return e.slice(0,40) === v.slice(0,40); });
          if (!isDup) merged.observaciones.push(v);
        });

      // CAMPOS ESCALARES — tomar el primero con valor real
      } else {
        if (r[k] !== undefined && r[k] !== '' && r[k] !== 0 && r[k] !== null) {
          if (!merged[k]) merged[k] = r[k];
        }
      }
    });
  });
  // ─── POST-PROCESO: limpieza final de red flags ─────────────────────────────
  if (merged.redFlags && merged.redFlags.length > 0) {
    // 1. Segunda pasada de artefactos de lote (por si alguno escapó)
    var FRASES_LOTE = [
      'en este lote', 'en este batch', 'no surge de este lote',
      'no identificado en este lote', 'no identificable en el documento presentado',
      'presentes en este lote', 'no surge de los documentos presentes',
      'cuit de la sociedad no identificado', 'razón social de la empresa no identificable',
      'razón social no identificable', 'tipo societario no determinado con certeza',
      'capital social y distribución accionaria parcialmente ilegibles',
      'razón social no surge del'
    ];
    merged.redFlags = merged.redFlags.filter(function(flag) {
      var fl = (flag || '').toLowerCase();
      return !FRASES_LOTE.some(function(f){ return fl.indexOf(f) >= 0; });
    });

    // 2. Cap por tópico: máximo 2 red flags por tópico principal
    var TOPICOS = [
      'beneficiario final', 'cuit', 'razón social',
      'tipo societario', 'actividad', 'cash management', 'capital social'
    ];
    var conteoTopicos = {};
    merged.redFlags = merged.redFlags.filter(function(flag) {
      var fl = (flag || '').toLowerCase();
      for (var i = 0; i < TOPICOS.length; i++) {
        var t = TOPICOS[i];
        if (fl.indexOf(t) >= 0) {
          conteoTopicos[t] = (conteoTopicos[t] || 0) + 1;
          if (conteoTopicos[t] > 2) return false; // máximo 2 por tópico
        }
      }
      return true;
    });

    // 3. Dedup final por primeros 70 chars normalizados
    var vistosPost = [];
    merged.redFlags = merged.redFlags.filter(function(flag) {
      var key = (flag || '').toLowerCase().replace(/[🚩⚠️•\s]+/g, ' ').trim().slice(0, 70);
      if (vistosPost.indexOf(key) >= 0) return false;
      vistosPost.push(key);
      return true;
    });
  }

  // Adjuntar información de documentos omitidos (para el resumen en la UI)
  if (typeof docsFallidos !== 'undefined' && docsFallidos.length > 0) {
    merged._docsFallidos = docsFallidos;
  }

  return merged;
}

// ─── PROXY + FALLBACK + RETRY CON BACKOFF ────────────────────────────────────
async function callProxyOrDirect(provider, messages, maxTokens, returnRaw) {
  var MAX_RETRIES = 4;
  var RETRY_DELAYS = [15000, 30000, 60000, 90000]; // 15s, 30s, 60s, 90s

  async function doCall() {
    var isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    // 1. Intentar proxy del servidor
    var proxyResp;
    try {
      // Comprimir payload con gzip para evitar el límite de 4.5MB de Vercel
      var payload = JSON.stringify({ provider: provider, messages: messages, max_tokens: maxTokens || 8000 });
      var proxyBody, proxyHeaders;
      try {
        var stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'));
        var compressed = await new Response(stream).arrayBuffer();
        proxyBody = compressed;
        proxyHeaders = await authHeaders({ 'Content-Type': 'application/octet-stream', 'x-encoding': 'gzip-json' });
      } catch(compErr) {
        // Fallback sin compresión si el browser no soporta CompressionStream
        proxyBody = payload;
        proxyHeaders = await authHeaders({ 'Content-Type': 'application/json' });
      }
      // Timeout preventivo del cliente: abortar a los 50s sin esperar el 504 de Vercel
      var abortCtrl = new AbortController();
      var abortTimer = setTimeout(function(){ abortCtrl.abort(); }, 50000);
      try {
        proxyResp = await fetch('/api/ai', {
          method: 'POST',
          headers: proxyHeaders,
          body: proxyBody,
          signal: abortCtrl.signal
        });
      } finally {
        clearTimeout(abortTimer);
      }
    } catch(networkErr) {
      // Timeout del cliente (50s) → error reintentable con lote más chico
      if (networkErr.name === 'AbortError') {
        throw new Error('SERVER_TIMEOUT:El lote tardó más de 50 segundos');
      }
      // fetch() lanzó error de red real (sin conexión, DNS, etc.)
      if (!isLocalhost) {
        throw new Error('Error de red al contactar el servidor proxy.\n'
          + 'Verificá tu conexión a internet y que las Serverless Functions de Vercel estén disponibles.\n'
          + 'Detalle: ' + networkErr.message);
      }
      console.warn('[GOAT IA] Proxy no alcanzable (localhost):', networkErr.message);
      proxyResp = null;
    }

    if (proxyResp) {
      if (proxyResp.ok) {
        var proxyData = await proxyResp.json();
        if (proxyData.text) return returnRaw ? proxyData.text : parseJsonFromResponse(proxyData.text);
      }
      // Proxy respondió con error HTTP
      var proxyErrData = {};
      try { proxyErrData = await proxyResp.json(); } catch(e) {}
      var proxyErrMsg = proxyErrData.error || ('HTTP ' + proxyResp.status);
      if (proxyResp.status === 429 || proxyErrMsg.indexOf('rate limit') >= 0 || proxyErrMsg.indexOf('tokens per minute') >= 0) {
        throw new Error('RATE_LIMIT:' + proxyErrMsg);
      }
      if (proxyResp.status === 413) {
        throw new Error('El documento es demasiado grande (HTTP 413).\nIntentá con documentos más pequeños o de a uno por vez.');
      }
      if (proxyErrMsg.indexOf('no configurado') >= 0) {
        throw new Error('ANTHROPIC_API_KEY no está configurada en el servidor.\n'
          + 'Vercel → Settings → Environment Variables → agregar ANTHROPIC_API_KEY');
      }
      // Errores de servidor transitorios → reintentables (504 timeout, 502/503 gateway, 500)
      if (proxyResp.status === 504 || proxyResp.status === 502 || proxyResp.status === 503 || proxyResp.status === 500) {
        throw new Error('SERVER_TIMEOUT:HTTP ' + proxyResp.status + ' — ' + proxyErrMsg);
      }
      if (!isLocalhost) {
        throw new Error('Error del servidor proxy (' + proxyResp.status + '): ' + proxyErrMsg);
      }
      console.warn('[GOAT IA] Proxy falló (' + proxyResp.status + '), usando llamada directa (solo localhost)...');
    }

    // 2. Fallback: llamada directa (SOLO en desarrollo local)
    var apiKey = provider === 'openai'
      ? (_KEYS.openai || '')
      : (_KEYS.anthropic || '');
    if (!apiKey) throw new Error('Sin API key configurada. Verificá las variables de entorno en Vercel.');

    try {
      var directResp;
      if (provider === 'openai') {
        directResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({ model: 'gpt-4o-2024-11-20', max_tokens: maxTokens || 8000, messages: messages })
        });
        var dGPT = await directResp.json();
        if (dGPT.error) {
          if (dGPT.error.type === 'rate_limit_error' || (dGPT.error.message && dGPT.error.message.indexOf('rate') >= 0)) throw new Error('RATE_LIMIT:' + dGPT.error.message);
          throw new Error(dGPT.error.message);
        }
        var rawGPT = (dGPT.choices && dGPT.choices[0] && dGPT.choices[0].message && dGPT.choices[0].message.content) || '{}';
        return returnRaw ? rawGPT : parseJsonFromResponse(rawGPT);
      } else {
        directResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens || 8000, messages: messages })
        });
        var dClaude = await directResp.json();
        if (dClaude.error) {
          if (dClaude.error.type === 'rate_limit_error' || (dClaude.error.message && dClaude.error.message.indexOf('rate limit') >= 0) || (dClaude.error.message && dClaude.error.message.indexOf('tokens per minute') >= 0)) {
            throw new Error('RATE_LIMIT:' + dClaude.error.message);
          }
          throw new Error(dClaude.error.message);
        }
        var rawClaude = ((dClaude.content && dClaude.content.find(function(b){return b.type==='text';})) || {}).text || '{}';
        return returnRaw ? rawClaude : parseJsonFromResponse(rawClaude);
      }
    } catch(directErr) {
      if (directErr.message && directErr.message.indexOf('RATE_LIMIT:') === 0) throw directErr;
      if (directErr.message && (directErr.message.indexOf('Load failed') >= 0 || directErr.message.indexOf('NetworkError') >= 0 || directErr.message.indexOf('Failed to fetch') >= 0)) {
        throw new Error('CORS: El browser bloqueó la llamada directa al API (solo ocurre en desarrollo local cuando el proxy no responde).');
      }
      throw directErr;
    }
  }

  // Ejecutar con retry automático ante rate limit y errores de servidor transitorios
  var TIMEOUT_RETRY_DELAYS = [4000, 8000]; // reintentos rápidos para 504/timeout
  var lastErr;
  for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await doCall();
    } catch(err) {
      lastErr = err;
      // SERVER_TIMEOUT: reintentar hasta 2 veces con delay corto
      if (err.message && err.message.indexOf('SERVER_TIMEOUT:') === 0) {
        if (attempt < 2) {
          var waitT = TIMEOUT_RETRY_DELAYS[attempt] || 8000;
          console.warn('[GOAT IA] Timeout del servidor. Reintentando en ' + (waitT/1000) + 's (intento ' + (attempt+1) + '/2)...');
          await sleep(waitT);
          continue;
        }
        // Agotados: propagar como BATCH_FAILED para que el caller divida el lote
        throw new Error('BATCH_FAILED:' + err.message.slice('SERVER_TIMEOUT:'.length));
      }
      if (err.message && err.message.indexOf('RATE_LIMIT:') === 0) {
        if (attempt < MAX_RETRIES) {
          var waitMs = RETRY_DELAYS[attempt];
          console.warn('[GOAT IA] Rate limit alcanzado. Esperando ' + (waitMs/1000) + 's antes de reintentar (intento ' + (attempt+1) + '/' + MAX_RETRIES + ')...');
          await sleep(waitMs);
          continue;
        }
        // Agotados los reintentos
        throw new Error('Límite de velocidad del API superado después de ' + MAX_RETRIES + ' reintentos.\n\n' +
          'El análisis de ' + (messages[0] && messages[0].content ? (Array.isArray(messages[0].content) ? messages[0].content.filter(function(b){return b.type==='document'||b.type==='image';}).length : 0) : 0) + ' documentos excede el límite de 30,000 tokens/minuto de tu plan.\n\n' +
          '─────────────────\n' +
          'Para procesar todos los documentos necesitás:\n' +
          '• Subir los documentos en grupos de 3-5 PDFs por vez\n' +
          '• O hacer upgrade del plan en console.anthropic.com\n  (el tier Build tiene límites 10x más altos)');
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── GPT EXTRACTION ───────────────────────────────────────────────────────────
async function extractWithGPT(contentBlocks) {
  var apiKey = _KEYS.openai || '';
  if (!apiKey) throw new Error('API key de OpenAI no configurada. Ingresá tu key en ⚙️ Configuración.');

  var hoy = new Date().toLocaleDateString('es-AR');
  var anio = new Date().getFullYear();
  var KYB_PROMPT = 'Sos un analista senior de Compliance y AML de GOAT S.A. (PSP argentino regulado por UIF/BCRA).\n'
    + '══════════════════════════════════════════════════════════\n'
    + 'FECHA DE HOY: ' + hoy + ' (AÑO ' + anio + ').\n'
    + 'CUALQUIER FECHA DEL AÑO 2025 O ANTERIOR ES UNA FECHA PASADA. NO ES FUTURA.\n'
    + '══════════════════════════════════════════════════════════\n'
    + 'Analizá exhaustivamente los documentos adjuntos y extraé TODA la información para completar el legajo KYB corporativo.\n'
    + 'Devolvé SOLO JSON válido, sin texto previo, sin backticks, sin comentarios.\n\n'
    + 'ESTRUCTURA REQUERIDA:\n'
    + '{"razonSocial":"nombre legal completo","cuit":"XX-XXXXXXXX-X","actividad":"giro comercial principal","facturacionMensual":0,"limiteDiario":0,"limiteMensual":0,"beneficiarioFinal":"nombre UBO >10%","domicilio":"domicilio fiscal completo","segmento":"BAJO|MEDIO|MEDIO-ALTO|ALTO","dictamen":"APROBADO|CONDICIONAL|RECHAZADO","checklist":{"Estatuto / Contrato social":"OK|Pendiente|Bloqueante|N/A","Inscripcion registral (IGJ/INAES)":"OK|Pendiente|Bloqueante|N/A","Constancia CUIT/AFIP":"OK|Pendiente|Bloqueante|N/A","Acta de directorio vigente":"OK|Pendiente|Bloqueante|N/A","Poder / Autorizacion firmante":"OK|Pendiente|Bloqueante|N/A","DNI / Pasaporte firmante":"OK|Pendiente|Bloqueante|N/A","Declaracion beneficiario final (>10%)":"OK|Pendiente|Bloqueante|N/A","Estados contables (3 ejercicios)":"OK|Pendiente|Bloqueante|N/A","Declaracion patrimonial DDJJ":"OK|Pendiente|Bloqueante|N/A","Comprobante domicilio fiscal":"OK|Pendiente|Bloqueante|N/A","Comprobante domicilio comercial":"OK|Pendiente|Bloqueante|N/A","Certificado actividad / habilitacion":"OK|Pendiente|Bloqueante|N/A","DDJJ AML (PEP/SO/UBO)":"OK|Pendiente|Bloqueante|N/A","Constancia IVA / Monotributo":"OK|Pendiente|Bloqueante|N/A","Referencias bancarias / comerciales":"OK|Pendiente|Bloqueante|N/A"},"kybScores":{"Completitud documental":2,"Perfil de riesgo - actividad":2,"Screening PEP/sanciones":2,"Beneficiario final":2,"Estructura societaria":2,"Coherencia financiera":2,"Antecedentes AML":2},"redFlags":[],"observaciones":[]}\n\n'
    + 'REGLAS TEMPORALES OBLIGATORIAS — APLICAR SIEMPRE:\n'
    + '1. DNI/Pasaporte: tienen vigencia de 5, 10 o 15 años desde su emisión. DNI emitido en 2010-2019 puede estar vigente hasta 2025-2034. NUNCA es red flag que el DNI sea anterior al contrato social.\n'
    + '2. Contrato social POSTERIOR al DNI del representante → NORMAL Y OBLIGATORIO. La empresa se constituye DESPUÉS de que existan sus fundadores. Esta secuencia temporal es la ÚNICA posible.\n'
    + '3. Fechas 2020, 2021, 2022, 2023, 2024, 2025 → TODAS son fechas PASADAS. NO escribas "fecha futura" para ninguna de ellas.\n'
    + '4. SOLO es "fecha futura" una fecha posterior a ' + hoy + '. Si no hay documentos con fecha posterior a ' + hoy + ', no puede haber red flag de fecha futura.\n'
    + '5. Distintos documentos tienen distintas fechas de emisión → COMPLETAMENTE NORMAL.\n'
    + '6. Estados contables del año anterior al corriente → NORMAL (los ejercicios cierran anualmente).\n\n'
    + 'RED FLAGS VÁLIDOS (SOLO ESTOS):\n'
    + '✓ Razón social diferente entre documentos del mismo legajo\n'
    + '✓ CUIT diferente entre documentos\n'
    + '✓ Fecha de un documento POSTERIOR a ' + hoy + ' (imposible en documentos reales)\n'
    + '✓ Datos del DNI no coinciden con quien firma como representante\n'
    + '✓ Domicilio fiscal contradictorio sin justificación\n'
    + '✓ Actividad en AFIP diferente a la del estatuto\n'
    + '✓ Beneficiario final no identificable o estructura opaca\n'
    + '✓ Actividades de alto riesgo AML: casino, crypto, remesas, juegos de azar, metales preciosos\n'
    + '✓ Inhabilitaciones, quiebras, procesos penales mencionados\n'
    + '✓ Documentos claramente alterados o ilegibles\n'
    + '✓ Acta de directorio con más de 24 meses de antigüedad respecto a ' + hoy + '\n\n'
    + 'REGLA DE ORO: Ante la duda sobre un red flag, NO lo incluyas. Es preferible omitir antes que generar un falso positivo. Nunca inventes datos.';

  // GPT-4o solo acepta imágenes (jpg/png/webp/gif) como base64 en image_url.
  // Los PDFs deben subirse primero al Files API de OpenAI y referenciarse como file_id.
  var userContent = [];
  var uploadedFileIds = [];

  for (var i = 0; i < contentBlocks.length; i++) {
    var block = contentBlocks[i];
    if (block.type === 'document') {
      // PDF: subir via Files API y obtener file_id
      try {
        var pdfBlob = base64ToBlob(block.source.data, 'application/pdf');
        var formData = new FormData();
        formData.append('file', pdfBlob, (block.title || 'documento.pdf'));
        formData.append('purpose', 'user_data');
        var uploadResp = await fetch('https://api.openai.com/v1/files', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey },
          body: formData
        });
        var uploadData = await uploadResp.json();
        if (uploadData.error) {
          // Si falla la subida, incluir como texto descriptivo
          userContent.push({ type: 'text', text: '[PDF: ' + (block.title||'documento.pdf') + ' — no se pudo subir: ' + uploadData.error.message + ']' });
        } else {
          uploadedFileIds.push(uploadData.id);
          userContent.push({
            type: 'file',
            file: { file_id: uploadData.id }
          });
        }
      } catch(uploadErr) {
        userContent.push({ type: 'text', text: '[PDF: ' + (block.title||'documento.pdf') + ' — error al procesar]' });
      }
    } else if (block.type === 'image') {
      // Imágenes: enviar como base64 directamente (formato soportado)
      var mime = block.source.media_type;
      // Solo jpg, png, webp, gif son soportados
      if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif') {
        userContent.push({
          type: 'image_url',
          image_url: { url: 'data:' + mime + ';base64,' + block.source.data, detail: 'high' }
        });
      } else {
        userContent.push({ type: 'text', text: '[Imagen en formato ' + mime + ' — no soportado por GPT-4o]' });
      }
    } else if (block.type === 'text') {
      userContent.push({ type: 'text', text: block.text });
    }
  }
  userContent.push({ type: 'text', text: KYB_PROMPT });

  // Limpiar archivos subidos en OpenAI
  if (uploadedFileIds.length > 0) {
    uploadedFileIds.forEach(function(fileId) {
      fetch('https://api.openai.com/v1/files/' + fileId, {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + apiKey }
      }).catch(function(){});
    });
  }

  return await callProxyOrDirect('openai', [{ role: 'user', content: userContent }], 8000);
}

// Almacén de API keys en memoria — se populan desde Vercel env vars al iniciar.
// Nunca se guardan en localStorage.
var _KEYS = { anthropic: '', openai: '', provider: 'claude' };

function setModuleKeys(anthropic, openai, provider) {
  if (anthropic) _KEYS.anthropic = anthropic;
  if (openai)    _KEYS.openai    = openai;
  if (provider)  _KEYS.provider  = provider;
}

export { extractWithClaude, callProxyOrDirect, extractWithGPT, _KEYS, setModuleKeys };
