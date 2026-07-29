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

## Estado (actualizado 29/07/2026 · cierre T2 completa)

- [x] T0 — Modularización + tokens ✅ (22 módulos, v3.0; App.jsx 7.480→432 líneas)
- [x] T1 — Design system fintech ✅ (v3.1.0 tokens+sidebar, v3.2.0 Toast/Confirm/⌘K)
- [x] **T2 — Rediseño de vistas ✅ COMPLETA**
  - T2a (v3.3.0): Dashboard con StatCards + charts oscuros app-wide
  - T2b (v3.4.0 / v3.5.0): Legajos — drawer lateral + timeline; tabla profesional con
    orden por header, filtros persistentes en sessionStorage, drawer sobre la lista
  - T2c (v3.6.0): Análisis — layout de dos paneles (selector sticky | contenido),
    gráficos de evolución con ComposedChart de doble eje y umbrales de riesgo
  - T2d (v3.7.0): Alertas — tres tablas ordenables (Señales / RFIs / Sin analizar),
    filtros persistentes, drawer de detalle de señal con acción sugerida y resolución.
    Primitivas compartidas nuevas en `components/ui.jsx`: `SortTh`, `TableCard`,
    `Drawer`, `EmptyState`, `TH`, `TD`. Barrido final de contraste en Patrones,
    Normativa, Wiki, Usuarios y Dashboard; paleta legacy `C` reducida a los semánticos.
- [ ] **T3 — PRÓXIMA: Case management + SLA**
- [ ] T4 — Calendario regulatorio
- [ ] T5 — Screening periódico
- [ ] T6 — Comportamiento + grafo
- [ ] T7 — Reportería + documental
- [ ] T8 — Hardening final

## Método de verificación por tanda

- Build Vite OK.
- **Chequeo de identificadores**: el build de Vite NO detecta variables no declaradas. Un
  componente JSX usado sin importar compila limpio y crashea en runtime (pasó con `Pill` en T2c).
  Antes de entregar, verificar componentes usados vs. importados/declarados, y que no queden
  claves inexistentes de la paleta (`C.AMARI` era `undefined` y pasaba silenciosamente).
- Smoke test en producción de la vista tocada.

## Deuda técnica registrada

1. **Conteo de señales ALTA no uniforme.** Análisis y Alertas usan `p.metricas`; Dashboard usa
   el fallback `p.scoring.senales`; la columna ALTA de Legajos exige txns en memoria y
   subreporta. Unificar en un helper de `lib/aml.js` — candidato natural a resolverse en T3,
   que necesita un criterio único de "alerta activa" para generar casos.
2. **Legajos.jsx no usa las primitivas compartidas** (`SortTh`/`TableCard`): tiene su propia
   implementación equivalente. Migración mecánica, sin beneficio visible; se dejó para T8 para
   no re-verificar una vista ya validada en producción.
3. **Bundle 1.29MB** sin code-splitting (ítem de T8).
4. **3 vulnerabilidades npm** (1 moderada, 2 altas) de las deps transitivas de Vite 4 / esbuild.
   `npm audit fix --force` sube Vite a 5+ y Recharts a 3 y rompe los charts. Tratar en T8.

## Notas técnicas acumuladas

**Legajos.jsx** — lista en `<table>` con `thSort(k,label,extra)` local; detalle en
`renderDrawer()` (sin `return` temprano). `stats[legajoId]` precalculado recorriendo `periodos`
una vez. Filtros en `sessionStorage` → `rebit_legajos_filtros_v3`.

**Analisis.jsx** — `ESTADOS_PERIODO` y `getEstadoPeriodo()` en scope de módulo. Helpers
`altaActivas(p)` (desde `p.metricas`, sin depender de txns) y `txnsDe(p)`.

**Alertas.jsx** — filtros en `rebit_alertas_filtros_v3`, con orden independiente por pestaña
(`sortMap[tab]`). El drawer de señal muestra `s.tip` como acción sugerida.

**components/ui.jsx** — Card, StatCard, Pill, Badge, SevBadge, ReportModal, chartGrid/Axis/Tooltip,
TH, TD, SortTh, TableCard, Drawer, EmptyState.

**App.jsx** — keyframes `pulse`, `fadeIn`, `drawerIn` en el CSS global derivado de tokens.

**theme.js** es la fuente única de diseño; la paleta de los informes PDF está bloqueada e
independiente. `C` quedó reducida a AC + los cuatro semánticos.

**Entrega** — zip de `src/` completa + `rm -rf src && unzip` + comandos git. Frann no edita código.
Ojo con nombres repetidos en `~/Downloads`: si ya existe uno igual, el navegador guarda el nuevo
como `archivo-1.ext` y el `cp` termina copiando el viejo. Por eso los entregables van versionados.
