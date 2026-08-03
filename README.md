# Rebit AML & KYB Tool

Plataforma interna de compliance PLAFT de **GOAT S.A. / Rebit** (PSPCP, Registro
BCRA N° 33.706). Gestiona el ciclo completo: legajos KYB, análisis transaccional,
detección de patrones AML, casos con plazos regulatorios, calendario de
vencimientos, screening contra listas restrictivas y reportería.

**Producción:** `rebit-aml-app.vercel.app` · **Repo:** `iamvolans/aml-analisis`

---

## Puesta en marcha

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm test         # suite de tests (80 casos)
```

### Variables de entorno (Vercel)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `SUPABASE_URL` | sí | Endpoint del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | sí | Service key. **Nunca sale del servidor.** |
| `APP_TOKEN` | sí | Token de arranque (login y config) |
| `ALLOW_APP_TOKEN` | recomendada | `false` = la API exige sesión de usuario |
| `ANTHROPIC_API_KEY` | opcional | Extracción con Claude |
| `OPENAI_API_KEY` | opcional | Extracción con GPT |
| `AI_PROVIDER` | opcional | `claude` (por defecto) u `openai` |
| `CRON_SECRET` | opcional | Autoriza el cron semanal de screening |

> ⚠️ **`ALLOW_APP_TOKEN` debe estar en `false` en producción.** Mientras no lo esté,
> la API acepta el token compartido, que viaja dentro del bundle del navegador y es
> legible por cualquiera que abra la app, incluso sin credenciales. La app muestra un
> aviso permanente a los administradores hasta que se corte.

### Migraciones SQL

Se corren en el SQL Editor de Supabase, en orden. Todas son **idempotentes**: se
pueden volver a ejecutar sin romper nada y no tocan tablas existentes.

```
sql/T3_casos.sql        casos + índices de dedupe (señales y vencimientos)
sql/T5_screening.sql    screening_listas + screening_runs
sql/T7_documentos.sql   documentos + bucket privado de Storage
```

---

## Arquitectura

```
src/
  App.jsx           shell: routing, sesión, sincronización (carga diferida por vista)
  lib/              lógica pura, sin dependencias de navegador
    theme.js        design tokens — fuente única de diseño
    constants.js    checklist, factores KYB, estados, mapa PAT → tipología UIF
    aml.js          métricas, patrones PAT-01..15, scoring, línea base
    screening.js    normalización y matching contra listas
    casos.js        ciclo de vida de casos y plazos regulatorios
    vencimientos.js calendario: legajos, documentos, obligaciones institucionales
    grafo.js        contrapartes compartidas entre legajos
    reports.js      generadores HTML de informes (INF-01/02/07, ROS, legajo completo)
    documentos.js   adjuntos sobre Supabase Storage
    session.js      sesión y cabeceras de autenticación
    sync.js         capa Supabase
  views/            una vista por sección
  components/       ui.jsx (primitivas), feedback.jsx (toast/confirm), palette.jsx (⌘K)
api/
  _auth.js          autenticación compartida (no es una ruta)
  auth.js           login, refresh, usuarios, audit log
  sync.js           legajos, períodos, transacciones, KV, casos
  documentos.js     URLs firmadas de subida y descarga
  ai.js             proxy de Claude / GPT
  config.js         flags de configuración (sin secretos)
  cron-screening.js corrida semanal automática
tests/              suite vitest
sql/                migraciones
docs/PLAN_V3.md     plan maestro y estado por tanda
```

### Decisiones que conviene conocer antes de tocar el código

**Temas.** La app tiene dos: `oscuro` y `claro`, alternables desde la barra lateral.
Se implementan con variables CSS: `T.BG` vale `'var(--bg)'`, no un hex. Consecuencias
para quien toque el código:

- En CSS (incluido `style={{...}}`) usar `T.` normalmente. Funciona siempre.
- En **atributos SVG** y props de recharts (`stroke=`, `fill=`) usar `TR.` / `CR.`,
  que traen el valor real: `var()` no se resuelve fuera de CSS y el elemento se
  pintaría transparente. `tests/tema.test.js` lo verifica y falla si se cuela uno.
- Para colores por severidad o segmento en SVG están `segColorR()` y `sevColorR()`.
- Agregar un token nuevo: sumarlo a `CLAVES_COLOR` **y a las dos paletas**. El test
  de paridad falla si falta en una.
- Texto sobre un fondo semántico sólido (verde/ámbar/rojo): usar `T.ON_SEMANTIC`,
  que se invierte según el tema. Blanco fijo es ilegible sobre el verde del oscuro.

**Los umbrales viven en un solo lugar por dominio.** Cambiar un número recalcula
toda la app:

| Dónde | Qué controla |
|---|---|
| `casos.js` → `SLA` | Plazos de reporte, RFI, comité |
| `vencimientos.js` → `ACTUALIZACION_LEGAJO`, `VIGENCIA_DOCS`, `INSTITUCIONALES` | Calendario regulatorio |
| `aml.js` → `COMPORTAMIENTO` | Umbrales de PAT-13/14/15 |
| `screening.js` → `UMBRALES` | Niveles ALTA/MEDIA/BAJA de coincidencia |
| `grafo.js` → `GRAFO` | Cuántos legajos compartidos disparan alerta |

**Criterio único de señal activa.** `senalesActivas(periodo, legajo, periodos)` en
`aml.js` es la única fuente. El tercer parámetro es el array **completo** de
períodos: sin él no hay línea base y PAT-13/14/15 no activan. Si se agrega un call
site nuevo, hay que pasarlo, o esa vista contará menos señales que el resto.

**Autenticación.** Toda llamada a `/api` usa `authHeaders()` de `session.js`, que es
`async` porque puede necesitar refrescar el JWT. Armar un objeto `headers` a mano deja
esa request sin sesión.

**Extensiones `.js` en `lib/`.** El cierre transitivo que importa el cron
(`screening`, `casos`, `aml`, `utils`, `theme`, `vencimientos`) usa `from "./utils.js"`
con extensión explícita: Vite no la necesita, Node ESM sí. Sin eso el cron falla con
`ERR_MODULE_NOT_FOUND`.

**Sin backticks en componentes.** Convención del proyecto: concatenación de strings.

---

## Secciones

| Sección | Qué hace |
|---|---|
| **Dashboard** | KPIs, casos con plazo crítico, vencimientos a 30 días, aviso de screening vencido |
| **Legajos KYB** | Alta y edición, checklist con adjuntos, scoring, screening, historial, export completo |
| **Análisis AML** | Carga de transacciones, métricas, señales, tendencias multi-período, INF-02, ROS |
| **Alertas** | Señales activas, RFIs vencidos, clientes sin analizar |
| **Casos** | Bandeja con SLA, lista y kanban, asignación, comentarios, trazabilidad |
| **Vencimientos** | Calendario regulatorio y generación de casos por incumplimiento |
| **Screening** | Listas restrictivas, corridas, descartes razonados, historial |
| **Red** | Contrapartes que operan con varios clientes de la cartera |
| **Normativa · Patrones · Wiki** | Referencia |
| **Usuarios** | Gestión y audit log (solo admin) |

---

## Tests

```bash
npm test
```

80 casos sobre la lógica que decide si una operación genera una señal, y de ahí un
caso, un plazo y eventualmente un ROS:

- `tests/aml.test.js` — métricas, PAT-01..15, línea base, scoring, señales activas
- `tests/screening.test.js` — normalización, precisión del matcher, corridas, importación
- `tests/plazos.test.js` — aritmética de meses, SLA, transiciones, vencimientos

Los tests de screening fijan la precisión medida: qué **debe** coincidir (variantes
societarias, orden invertido, plurales) y qué **no** (Norte/Sur, Nación/Provincia).

---

## Pendientes conocidos

1. **Validación normativa** de los plazos por defecto en `casos.js` y
   `vencimientos.js` — ver `docs/PLAN_V3.md`. **Bloqueante para uso operativo.**
2. **Reporte sistemático mensual**: falta el layout oficial de campos.
3. **`ALLOW_APP_TOKEN=false`** en producción.
4. `PAT-01` evalúa fraccionamiento solo sobre operaciones **entrantes**; el texto de
   la señal dice "destino". Pinneado en los tests; decidir si se amplía o se corrige
   la redacción.
5. `Legajos.jsx` no usa las primitivas `SortTh`/`TableCard`: tiene su propia
   implementación equivalente.
6. Vulnerabilidades npm: las que quedan son **solo de desarrollo** (vite, esbuild,
   vitest) y no llegan al bundle. La crítica de vitest requiere `vitest --ui`, que no
   se usa. `npm audit fix --force` sube Vite a 8 y rompe el build: no correrlo.

## Nota sobre `xlsx`

Se instala **desde el CDN de SheetJS**, no desde npm:

```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

La última versión publicada en npm es 0.18.5 y arrastra Prototype Pollution y ReDoS,
sin fix disponible por ese canal. Como la app parsea planillas que mandan los clientes,
el vector no es teórico. Consecuencia: **cada build necesita alcanzar `cdn.sheetjs.com`**;
si ese CDN está caído, el deploy falla.

`tests/xlsx.test.js` verifica que la API que usa `parsers.js` siga presente — en especial
`XLSX.SSF.parse_date_code`, que convierte las fechas seriales de Excel y está envuelta en
un `try/catch` que ante un fallo deja el número crudo **sin avisar**.

⚠️ Un script de Node suelto NO sirve para verificar esto: Node resuelve la build CJS,
cuyo analizador de exports no expone `SSF`, y da un falso negativo. Los tests corren bajo
Vitest, que resuelve igual que Vite y que el navegador.
