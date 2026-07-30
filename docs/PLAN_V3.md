# Rebit AML & KYB Tool — Plan Maestro v3.0

**Proyecto:** Evolución integral de la plataforma de Compliance PLAFT de GOAT S.A./Rebit
**Base:** v2.2.0 (repo `iamvolans/aml-analisis`, deploy `rebit-aml-app.vercel.app`)
**Método:** tandas secuenciales T0–T8. Cada tanda cierra con build validado, deploy a producción y verificación funcional antes de pasar a la siguiente. Frann no edita código: recibe archivos completos listos para reemplazar + comandos de terminal listos para pegar.

---

## Principios rectores

1. **Cero pérdida de datos.** Ninguna tanda modifica tablas existentes de Supabase. Las features nuevas agregan tablas nuevas (`casos`, `documentos`, `screening_runs`, etc.). Todo SQL nuevo se entrega como script idempotente para pegar en el SQL Editor.
2. **Deploy incremental.** La app queda funcional al final de cada tanda. Nunca hay un estado intermedio roto en producción.
3. **Design tokens primero.** Todo el rediseño se gobierna desde `src/lib/theme.js`. Cambiar la estética completa = editar un solo archivo.
4. **Auditabilidad regulatoria.** Toda feature PLAFT nueva registra evidencia (quién, cuándo, qué) en `audit_log` y produce salidas exportables.

---

## T0 — Fundación: modularización + design tokens

*El requisito de todo lo demás. Sin cambio visual ni funcional perceptible.*

- Partir `src/App.jsx` (7.400 líneas) en módulos:
  - `src/lib/theme.js` — design tokens (colores, tipografía, espaciado, radios, sombras, transiciones)
  - `src/lib/constants.js` — ESTADOS_CUENTA, CHECKLIST_ITEMS, KYB_FACTORS, SCREENING, PAT_UIF_MAP, roles
  - `src/lib/utils.js` — uid, fmtM, fechas, parseo JSON, base64
  - `src/lib/aml.js` — calcMetricas, detectPatrones (PAT-01…12), calcScoring
  - `src/lib/ai.js` — callProxyOrDirect, extractWithClaude/GPT, prompts
  - `src/lib/parsers.js` — CSV/XLS/XLSX, normalizeRows
  - `src/lib/sync.js` — capa Supabase (serverSave/Load/KV/KVPrefix, gzip, retry)
  - `src/lib/auth.js` — login, usuarios, auditLog, permisos por rol
  - `src/lib/reports.js` — genINF01/02/07, genROS, genNotaDD y helpers HTML
  - `src/views/` — Dashboard, Legajos, Analisis, Alertas, Patrones, Normativa, Wiki, Usuarios, Login (un archivo por vista)
  - `src/components/ui.jsx` — Card, Pill, Badge, ReportModal (crece en T1)
  - `src/App.jsx` — solo el shell: routing de vistas, sesión, sync orchestration (~400 líneas)
- Verificación: build Vite OK + smoke test completo de todas las vistas en producción.
- **Riesgo controlado:** es un cambio mecánico (mover código + imports). Si algo falla, git revert de un solo commit.

## T1 — Design system fintech (componentes base)

*Dirección estética: "fintech institucional oscuro" — profesional para mostrar a un banco sponsor o inspector BCRA, sin perder identidad.*

- **Tokens** (`theme.js`):
  - Fondos: escala de superficies elevadas `#0A0E14 → #10161F → #161E2A → #1D2735` (profundidad por elevación, no por bordes)
  - Acento primario: azul eléctrico `#3D7EFF` (deriva del azul corporativo GOAT hacia fintech); semánticos: verde `#00D68F`, ámbar `#FFB020`, rojo `#FF4757`, violeta `#8B7CF6` (para IA)
  - Tipografía: **Inter** para UI (14px base, escala 12/14/16/20/28), **JetBrains Mono** solo para datos duros (CUITs, montos, IDs, timestamps)
  - Espaciado en escala de 8px, radios 6/10/16, sombras suaves para elevación, transiciones 150ms
- **Componentes nuevos** en `src/components/`: Button (variantes primary/ghost/danger), Input/Select/Textarea, Modal, **Toast** (reemplaza todos los `alert()`), ConfirmDialog (reemplaza `confirm()`), Table (orden por columna, paginación, densidad), Tabs, EmptyState, Skeleton (estados de carga), StatCard, Drawer lateral.
- **Command palette** (`Cmd+K`): saltar a cualquier legajo/período/vista por nombre o CUIT.
- Shell nuevo: sidebar colapsable con iconos (lucide-react), topbar con búsqueda global, indicador de sync y usuario.

## T2 — Rediseño de vistas

- Migrar vista por vista al design system: Dashboard → Legajos → Análisis → Alertas → resto.
- Dashboard rediseñado: KPIs en StatCards, gráficos recharts restyleados con los tokens, secciones colapsables.
- Legajos: tabla profesional con filtros persistentes, drawer de detalle en lugar de pantalla completa, timeline visual del ciclo de vida.
- Análisis: layout de dos paneles (selector | contenido), gráficos de evolución mejorados.
- Eliminación total de `alert()`/`confirm()` nativos.

## T3 — Case Management con SLA (feature PLAFT #1)

- Tabla nueva `casos`: id, legajo_id, origen (señal/screening/RFI/manual), estado (NUEVA → EN_ANALISIS → RFI_ENVIADO → COMITE → CERRADA_SIN_ROS → ROS_PRESENTADO), analista asignado, prioridad, fechas.
- **Contadores de plazos regulatorios** corriendo por caso: plazos de ROS según calificación, vencimiento de RFI, escalamiento a comité.
- Bandeja unificada "Casos" con vista kanban + lista, asignación por analista, historial completo de cada caso.
- Toda alerta ALTA no resuelta genera caso automáticamente; las señales existentes se vinculan.

## T4 — Calendario regulatorio y vencimientos

- Reglas de actualización de legajo por segmento (ALTO: 12 meses, MEDIO-ALTO: 18, MEDIO: 24, BAJO: 36 — parametrizable).
- Vencimiento por documento del checklist (DDJJ, estados contables, constancias).
- Fechas institucionales: autoevaluación anual, informe del revisor externo, reportes sistemáticos mensuales UIF.
- Panel "Vencimientos" + widget en Dashboard ("qué vence en 30 días") + generación de casos T3 al vencer.

## T5 — Screening periódico automático

- Vercel Cron (semanal) que re-screenea toda la cartera activa.
- **REPET local:** descarga del listado oficial UIF y matching determinístico local (nombre + fuzzy), en lugar de depender solo de IA con web search → más barato, más rápido, 100% auditable.
- Tabla `screening_runs`: cada corrida guarda fecha, listas consultadas, hits, y snapshot de evidencia.
- Coincidencia nueva → caso T3 automático con prioridad alta.

## T6 — Monitoreo por comportamiento + grafo de contrapartes

- **Perfil dinámico:** línea base por cliente (promedio móvil de volumen, contrapartes habituales, distribución horaria de sus últimos N períodos).
- Patrones nuevos: PAT-13 (desviación >Nx contra su propia línea base), PAT-14 (contraparte nueva concentra >40% del flujo), PAT-15 (cambio abrupto de distribución horaria).
- **Grafo de contrapartes inter-legajo:** detección de CUITs que operan con múltiples clientes de la cartera (posibles redes). Vista de grafo interactiva + alerta automática cuando una contraparte comparte ≥3 legajos.

## T7 — Reportería regulatoria y gestión documental

- Generador de **reporte sistemático mensual UIF** desde las txns cargadas.
- **Export de legajo completo**: PDF único con datos + checklist + screening con timestamps + períodos + señales + RFIs + informes emitidos (el legajo que pide un inspector, en un click).
- **Supabase Storage** para documentos: adjuntar PDFs al legajo, versionado, fecha de vencimiento por documento (alimenta T4). Tabla `documentos`.

## T8 — Hardening técnico final

- Migrar `/api/sync` de app-token a autenticación por usuario (cierra el último pendiente de seguridad).
- Tests unitarios de `aml.js` (calcMetricas, detectPatrones, calcScoring) — el corazón regulatorio, funciones puras, testeo trivial con vitest.
- Entorno de staging en Vercel (branch `staging` → deploy preview) para probar tandas sin tocar producción.
- Code-splitting por vista (bundle actual 1.2MB → carga inicial <400KB).
- README v3 y CHANGELOG.

---

## Orden y dependencias

```
T0 (fundación) → T1 (design system) → T2 (vistas)
                                    ↘
T3 (casos) → T4 (calendario) → T5 (screening) → T6 (comportamiento) → T7 (reportería) → T8
```

T3 en adelante puede intercalarse con T2 si se prioriza funcionalidad sobre estética.

## Método de trabajo por sesión

1. Frann sube el zip del repo actualizado (o los archivos tocados) al inicio.
2. Se ejecuta una tanda (o media, si es grande).
3. Entrega: archivos completos + SQL idempotente si aplica + comandos git listos para pegar.
4. Verificación en producción con checklist de smoke test.
5. Este documento se actualiza marcando la tanda como ✅.

## Estado (actualizado 29/07/2026 · T3a)

- [x] T0 — Modularización + tokens ✅ (v3.0)
- [x] T1 — Design system fintech ✅ (v3.1.0 / v3.2.0)
- [x] T2 — Rediseño de vistas ✅ COMPLETA
  - T2a Dashboard (v3.3.0) · T2b Legajos (v3.4.0/v3.5.0) · T2c Análisis (v3.6.0) · T2d Alertas (v3.7.0)
- [~] **T3 — Case management + SLA — EN CURSO**
  - [x] T3a (v3.8.0): fundación
    - Deuda #1 resuelta: criterio único de señal activa en `lib/aml.js`
      (`metricasDe`, `senalesActivas`, `contarAlta`). Las cuatro vistas lo usan.
      **Legajos dejó de subreportar**: antes exigía txns hidratadas en memoria.
    - `lib/casos.js`: ciclo de vida de 6 estados, orígenes, prioridades, motor de
      plazos (`hitosSLA` / `slaCritico`), generación desde señales, transiciones
      que sellan las fechas que disparan cada contador.
    - Tabla `casos` en Supabase (script idempotente en `sql/T3_casos.sql`),
      endpoints `GET|POST /api/sync?action=casos`, helpers `serverLoadCasos` /
      `serverSaveCasos`.
    - Vista `Casos`: KPIs, filtros persistentes, tabla ordenable por urgencia de
      plazo, drawer con plazos aplicables, transiciones e historial.
    - v3.8.1: el preview de generación es **selección por señal** (checkbox por fila,
      marcar/desmarcar todas, contador). Antes solo ofrecía crear todas de una.
  - [x] T3b (v3.9.0): bandeja completa
    - Vista **kanban** con drag & drop entre columnas (usa `cambiarEstadoCaso`, mismo
      camino que los botones: sellar fechas sigue teniendo una sola implementación).
      Toggle lista/kanban persistente en sesión.
    - **Asignación**: selector de analista desde `perfiles`, botón "Asignarme",
      filtro "Mis casos" y tira de carga por analista con casos vencidos.
    - **Hilo de comentarios** por caso, separado del historial de estados.
    - **Vínculo señal ↔ caso bidireccional**: Alertas muestra columna "Caso" con la
      referencia si ya existe (y salta a él), o el botón "Abrir caso desde esta señal".
    - **Widget de plazos críticos en Dashboard**, clickeable hacia el caso.
- [x] **T4 — Calendario regulatorio ✅ (v3.10.0)**
  - `lib/vencimientos.js`: tres familias de vencimientos — actualización de legajo por
    segmento, vigencia de documentos del checklist, y obligaciones institucionales
    recurrentes. Todo parametrizable en un solo archivo.
  - Vista `Vencimientos`: KPIs, filtros persistentes, tabla ordenable, columna "Caso"
    con el vínculo al caso generado, aviso visible de fechas sin validar.
  - Captura de fecha por documento en el checklist de Legajos (`checklistFechas`).
    Sin fecha cargada, el motor estima desde la última actualización del legajo y lo
    marca como "estimado" — no simula precisión que no tiene.
  - Generación de casos desde vencidos (origen `VENCIMIENTO`), con el mismo preview
    seleccionable que las señales y dedupe por `vencKey` (índice único en Postgres).
  - Widget "vence en los próximos 30 días" en Dashboard.
- [~] **T5 — Screening — EN CURSO**
  - [x] T5a (v3.11.0): motor determinístico + gestión de listas + corridas manuales
    - `lib/screening.js`: normalización (tildes, puntuación, sufijos societarios),
      match por documento, exacto, exacto-sin-sufijo y aproximado (token_set_ratio
      con penalización por cobertura). Indexado por bloques de prefijo/sufijo de token.
    - Tablas `screening_listas` y `screening_runs` (`sql/T5_screening.sql`).
    - Vista `Screening`: carga de listados CSV/XLSX/JSON, corrida sobre cartera activa
      o completa, resultados con nivel y puntaje, drawer de comparación lado a lado,
      descarte de falsos positivos con motivo, historial de corridas y caso desde
      coincidencia.
    - **v3.13.1 — fix de importación de listados.** La carga usaba `parseCsv` /
      `parseExcelFile`, que corren `normalizeRows()`: están hechas para archivos de
      TRANSACCIONES (fecha/monto/tipo/contraparte) y devolvían cero filas para un
      listado de nombres. Se agregaron `parseTabla`, `parseTablaExcel` y
      `parseTablaJson` en `lib/parsers.js`: lectores genéricos que devuelven las filas
      tal cual, con detección de separador (coma, punto y coma, tab, barra), manejo de
      BOM y de comillas escapadas. Además la importación pasó a tener **mapeo de
      columnas visible**: se sugiere el mapeo, se muestra una vista previa de las
      entradas resultantes y el usuario corrige antes de confirmar, en vez de un
      rechazo opaco.
  - [x] T5b (v3.12.0): automatización e integración
    - `api/cron-screening.js` + `crons` en `vercel.json`: corrida semanal (lunes 9:00 UTC)
      sobre la cartera activa, usando el MISMO motor que la corrida manual.
    - `hitsNuevos(actual, anterior)`: diff entre corridas. Solo las coincidencias
      **nuevas** de nivel ALTA abren caso solo. Si no hay corrida previa devuelve vacío
      a propósito — la primera carga de un listado se revisa a mano.
    - Pestaña Screening del legajo: muestra el resultado real del motor para ese cliente
      (coincidencias con nivel y puntaje, o "sin coincidencias" con fecha y listas).
      Los enlaces manuales quedan abajo para jurisdicciones no cubiertas.
    - Dashboard: aviso si la última corrida tiene más de 10 días o nunca se corrió.
- [x] **T6 — Comportamiento + grafo ✅ (v3.13.0)**
  - `lineaBase(periodo, legajo, periodos)` en `lib/aml.js`: mediana de volumen y de
    operaciones sobre los 6 períodos previos, contrapartes habituales y distribución
    horaria. Mediana y no promedio: un solo período atípico previo no corre la base.
  - **PAT-13** desvío ≥3x contra la mediana propia (≥5x = ALTA) · **PAT-14** contraparte
    sin antecedentes que concentra ≥40% del flujo (≥60% = ALTA) · **PAT-15** salto de
    ≥25 puntos en operaciones en horario atípico (≥40 = ALTA). Umbrales en
    `COMPORTAMIENTO`, dentro de `lib/aml.js`.
  - `PAT_UIF_MAP` extendido con los tres, así el generador de ROS los contempla.
  - `lib/grafo.js` + vista `Red`: contrapartes que operan con varios legajos de la
    cartera, grafo SVG determinístico, tabla, drawer con detalle por cliente y caso
    desde una red detectada.
- [~] **T7 — Reportería + documental — EN CURSO**
  - [x] T7a (v3.14.0): **export de legajo completo**
    - `genLegajoCompleto()` en `lib/reports.js`: expediente consolidado de 10 secciones
      con identificación, checklist con fechas de documento, scoring KYB, screening
      (corrida, versión de cada listado, umbrales aplicados, coincidencias), períodos con
      métricas y señales incluyendo quién resolvió cada una y cuándo, casos con
      trazabilidad completa y comentarios, RFIs, vencimientos, historial de estado de
      cuenta y constancia de emisión con firmas.
    - Botón "📑 Legajo completo" en el drawer del legajo. Los RFIs se cargan desde KV al
      momento de generar para que el expediente no salga incompleto en silencio.
    - Escapado de HTML en todos los campos de usuario.
  - [x] T7b (v3.15.0): **gestión documental**
    - Bucket privado `documentos` en Supabase Storage + tabla `documentos`
      (`sql/T7_documentos.sql`).
    - `api/documentos.js`: el navegador nunca ve la service key ni sube a través de la
      función. El servidor firma una URL de subida de vida corta (10 min) y el archivo va
      **directo del navegador a Storage**, así no aplica el límite de body de Vercel.
      Descarga por URL firmada de 5 minutos; el bucket no es público.
    - **Versionado**: subir el mismo tipo de documento no pisa el anterior. La versión
      nueva queda vigente y las previas se conservan marcadas como reemplazadas.
    - Adjunto por ítem del checklist, con nombre, versión, tamaño, quién lo subió y cuándo.
    - El export de legajo completo suma la sección 10 (documentación respaldatoria) y
      la columna "Archivo adjunto" en el checklist.
  - [ ] **T7c — BLOQUEADA: reporte sistemático mensual** (ver abajo)
- [ ] T8 — Hardening final

## ⚠️ Pendiente de validación normativa (BLOQUEANTE para uso operativo)

Hay dos conjuntos de parámetros cargados con valores por defecto que **Germán debe
validar contra la normativa vigente aplicable a PSPCP** antes de que estos paneles se
usen como control operativo real:

**1. Plazos de caso — `src/lib/casos.js`, objeto `SLA`.**
Reflejan el régimen general de la Ley 25.246 y resoluciones UIF tal como se conocían al
construir el módulo: 15 días corridos para reportar desde la calificación, tope de 150
días desde la operación, 48 horas para FT. Los otros tres (RFI 7 días, comité 10, toma
de caso 2) son política interna de Rebit.

**2. Calendario regulatorio — `src/lib/vencimientos.js`.**
- `ACTUALIZACION_LEGAJO`: frecuencia de refresco del KYB por segmento (12/18/24/36
  meses). Debe coincidir con lo que declara el Manual PLAFT de GOAT S.A.
- `VIGENCIA_DOCS`: vigencia en meses de cada documento del checklist.
- `INSTITUCIONALES`: fechas de autoevaluación anual, informe del revisor externo y
  reporte sistemático mensual. Las tres están marcadas `validado:false` y el panel las
  muestra con un cartel de advertencia hasta que se confirmen. Al validarlas, cambiar
  el flag a `true` y el aviso desaparece.

Cambiar cualquiera de estos valores recalcula todos los contadores de la app.

## T7c — Reporte sistemático mensual: BLOQUEADA, falta el layout oficial

El RSM tiene un formato de campos definido por resolución. **No lo conozco con certeza
para PSPCP y no voy a inventar el layout de un reporte regulado**: un archivo con la
estructura equivocada es peor que no tenerlo, porque parece presentable.

Para desbloquear hace falta que Germán aporte, de la resolución vigente:
- La lista exacta de campos, su orden y su tipo.
- El formato de archivo esperado (TXT de ancho fijo, CSV, XML) y el separador.
- El criterio de inclusión: qué operaciones entran, con qué umbral y en qué período.
- Un ejemplo de archivo aceptado, si existe.

Con eso el generador sale rápido: los datos ya están todos en `periodos[].txns` y en las
métricas. Lo que falta es el mapeo, no la información.

## Spec T8 — Hardening técnico final (PRÓXIMA)

1. Migrar `/api/sync` de app-token a autenticación por usuario (último pendiente de
   seguridad; `api/documentos.js` hereda la misma limitación y hay que migrarlo junto).
2. Tests unitarios de `aml.js` con vitest: `calcMetricas`, `detectPatrones`, `calcScoring`
   y `lineaBase` son funciones puras — es el corazón regulatorio y el testeo es trivial.
3. Entorno de staging en Vercel (branch `staging` → deploy preview).
4. Code-splitting por vista (bundle ~1,3 MB → carga inicial <400 KB).
5. Migrar `Legajos.jsx` a las primitivas compartidas `SortTh`/`TableCard` (deuda #2).
6. README v3 y CHANGELOG.
7. Evaluar las 3 vulnerabilidades npm (deuda #4).

## Nota T7b — fecha del documento

La fecha se sigue cargando a mano en el checklist: al adjuntar un archivo se usa la fecha
ya cargada para ese ítem, si existe. **Extraerla del PDF automáticamente quedó fuera de
alcance**: requeriría OCR o parseo por tipo de documento, y una fecha mal inferida en un
control de vencimientos es peor que una vacía. El campo queda visible y editable.

## Notas de T6 — comportamiento y red

**Firma nueva.** `senalesActivas(periodo, legajo, periodos)` y `contarAlta(...)` toman un
tercer parámetro con el array COMPLETO de períodos: sin él no hay línea base y PAT-13/14/15
no activan. Todos los call sites lo tienen en scope y se actualizaron. **Si se agrega un
call site nuevo, pasarlo siempre**, o esa vista contará menos señales que el resto — es
exactamente la deuda #1 que se resolvió en T3a.

**Comportamiento verificado** con series sintéticas (4 períodos estables de $1M como base):
período normal no dispara nada; 3,2x → PAT-13 MEDIA; 6x → PAT-13 ALTA; 2x no dispara;
contraparte nueva con 100% del flujo → PAT-14 ALTA; salto a horario nocturno → PAT-15 ALTA.
Con menos de 2 períodos previos `lineaBase` devuelve null y los tres quedan inactivos.

**Normalización de contrapartes en el grafo.** `normalizar()` convierte la puntuación en
espacios, así que "S.A." queda "S A" y no coincidía con "SA": `claveCp` vuelve a pegar las
corridas de letras sueltas. A diferencia del screening, **no** se quitan los sufijos
societarios: "PUENTE SA" y "PUENTE SRL" son personas jurídicas distintas y fusionarlas
inventaría una red inexistente. Un vínculo falso cuesta más caro que uno no detectado.

## Importante — extensiones .js en los imports de lib/

`api/cron-screening.js` importa `src/lib/screening.js` y `src/lib/casos.js` desde una
función serverless. **Node ESM exige extensión explícita en los imports relativos**;
Vite no. Por eso el cierre transitivo (`screening`, `casos`, `aml`, `utils`, `theme`,
`vencimientos`) usa `from "./utils.js"` y no `from "./utils"`. Sin eso el cron falla con
`ERR_MODULE_NOT_FOUND` — se detectó probando el import en Node puro antes de deployar.

Si en el futuro el cron necesita otro módulo de `lib/`, agregarle las extensiones antes.

## Notas del motor de screening (T5a)

**Precisión medida** sobre un set de 12 pares construido a mano:
exactos y variantes societarias en 100%; plurales y tipeos ("TRANSPORTES/TRANSPORTE")
en 95%; nombre contenido en otro más largo degradado a MEDIA (94%) para que el analista
lo distinga de una coincidencia exacta; y rechazo correcto de Norte/Sur (71.8%),
Nación/Provincia (42.5%) y pares no relacionados (0%).

**Rendimiento**: 300 legajos × 20.000 entradas en 0,7 s. Sin el indexado por bloques
eran 16 s con solo 5.000 entradas.

**Límite conocido**: el indexado agrupa por los primeros y últimos 4 caracteres de cada
token. Un tipeo que altere a la vez el principio y el final de todos los tokens de un
nombre no entra al bloque y no se detecta. Es el compromiso estándar en resolución de
entidades; sin él el screening no corre en tiempo razonable en el navegador.

**Nombres cortos y comunes**: "Juan Perez" contra "Perez, Juan Carlos" da 96,4% (ALTA)
porque los dos tokens quedan cubiertos. Es sensibilidad deliberada — en screening PLAFT
conviene pecar de sensible — y se compensa con el match por documento y el descarte
razonado. Si genera demasiado ruido en producción, subir `UMBRALES.ALTA`.

## Método de verificación por tanda

- Build Vite OK.
- **Chequeo de identificadores**: el build de Vite NO detecta variables no declaradas.
  Un componente JSX usado sin importar compila limpio y crashea en runtime (pasó con
  `Pill` en T2c). Verificar también claves inexistentes de paleta (`C.AMARI` era
  `undefined` y pasaba silenciosamente) e imports muertos.
- Smoke test en producción de la vista tocada.

## Deuda técnica registrada

1. ~~Conteo de señales ALTA no uniforme~~ — **resuelto en T3a**.
2. **Legajos.jsx no usa las primitivas compartidas** (`SortTh`/`TableCard`): tiene su
   propia implementación equivalente. Migración mecánica, para T8.
3. **Bundle 1.30MB** sin code-splitting (T8).
4. **3 vulnerabilidades npm** de deps transitivas de Vite 4 / esbuild. `npm audit fix
   --force` sube Vite a 5+ y Recharts a 3 y rompe los charts. Tratar en T8.
5. **`/api/sync` sigue con app-token**, no autenticación por usuario (ítem propio de T8).
   Los casos heredan esa limitación.

## Notas técnicas acumuladas

**lib/aml.js** — `metricasDe(p, leg)` prefiere `p.metricas` persistidas y cae a `p.txns`;
`senalesActivas(p, leg)` filtra las resueltas; `contarAlta(p, leg)`. Fuente única.

**lib/casos.js** — un caso se deduplica por `(periodoId, pat)`, con índice único parcial
en Postgres además del chequeo en cliente. `cambiarEstadoCaso` es el único camino para
mover un caso: sella `fechaCalificacion` al elevar a comité, `fechaRfi` al mandar RFI y
`fechaCierre` al cerrar. No sobrescribe fechas ya selladas.

**Generación de casos** — `casosPendientesDeCrear` no crea nada: devuelve el preview y la
vista pide confirmación. Decisión deliberada: en un registro con valor regulatorio no
conviene que aparezcan filas sin que quede claro quién las originó y cuándo. El preview
permite elegir señal por señal (arrancan todas marcadas); se materializan solo las
seleccionadas.

**Legajos.jsx** — lista en `<table>` con `thSort` local; detalle en `renderDrawer()`.
Filtros en `sessionStorage` → `rebit_legajos_filtros_v3`.

**Analisis.jsx** — `ESTADOS_PERIODO` / `getEstadoPeriodo()` en scope de módulo.

**Alertas.jsx** — filtros en `rebit_alertas_filtros_v3`, orden independiente por pestaña.

**Importación de listados** — `parseTabla` detecta el separador contando ocurrencias
fuera de comillas en la cabecera. Es necesario: las listas de sanciones suelen traer
"APELLIDO, NOMBRE" en archivos separados por punto y coma, y asumir la coma parte los
nombres al medio. Las cabeceras se comparan sin tildes y con no-alfanuméricos colapsados
a `_`, así que "Número de Documento" y "Nro. de Documento" caen en el mismo alias.

**genLegajoCompleto** — recibe todo por un único objeto `datos` en vez de diez parámetros
posicionales, así agregar una sección no rompe los call sites. Escapa HTML en cada campo
de usuario (probado con `<script>` en la razón social). Verificado también con un legajo
casi vacío: no imprime "undefined" ni "[object Object]" en ningún lado.

**screening.js** — no tiene dependencias de navegador: es JS puro, importable también
desde una función serverless (lo usa el cron de T5b). Los descartes viven en
KV bajo `screening_descartes` y se aplican dentro de `correrScreening`, así que un falso
positivo descartado no reaparece en corridas futuras.

**vencimientos.js** — `sumarMeses` respeta fin de mes (31/01 + 1 mes = 28/02, y en
bisiesto 29/02). La fecha base de actualización de un legajo es la más reciente entre
el último período, el último cambio de estado y el alta: derivada de datos existentes,
sin migración. Los documentos sin fecha en `checklistFechas` se estiman desde esa base
y se marcan como estimados en la UI.

**Casos.jsx** — filtros en `rebit_casos_filtros_v3` (incluye modo lista/kanban y "mis
casos"). El orden por defecto es por urgencia de plazo (vencidos primero, cerrados al
final). El kanban usa HTML5 drag & drop; soltar en una columna de cierre sin rol de
supervisor avisa y no mueve nada.

**Vínculo señal ↔ caso** — la clave es `periodoId + '::' + pat`, con índice único parcial
en Postgres. Alertas construye `casoPorSenal` en memoria para mostrar la columna "Caso".
App.jsx expone `handleVerCaso(id)`, que remonta CasosView con `initCasoId` y abre el drawer.

**components/ui.jsx** — Card, StatCard, Pill, Badge, SevBadge, ReportModal,
chartGrid/Axis/Tooltip, TH, TD, SortTh, TableCard, Drawer, EmptyState.

**App.jsx** — keyframes `pulse`, `fadeIn`, `drawerIn`. `syncCasos` guarda directo (sin
debounce): los casos son registros chicos y conviene persistir el plazo apenas cambia.

**theme.js** es la fuente única de diseño; la paleta de informes PDF está bloqueada.

**Entrega** — zip de `src/` + `rm -rf src && unzip` + comandos git. Frann no edita código.
Los entregables van versionados en el nombre: si en `~/Downloads` ya existe un archivo
igual, el navegador guarda el nuevo como `archivo-1.ext` y el `cp` copia el viejo.
