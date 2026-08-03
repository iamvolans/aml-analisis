# Changelog

Formato: versión — tanda — cambios. Las tandas están descritas en `docs/PLAN_V3.md`.

## 3.20.0 — Validación y calibración de plazos

**Tests de coherencia** (`tests/plazos-coherencia.test.js`, 20 casos). No validan
que los números sean los legalmente correctos —eso necesita la resolución— sino
que el conjunto **encadene**, que es verificable sin ella: tomar el caso antes de
elevarlo, elevar antes de que venza el plazo de reporte, el plazo desde la
calificación dentro del tope desde la operación, y a mayor riesgo mayor
frecuencia de actualización. Cada aserción lleva escrita su justificación.

- **Encontraron una inconsistencia real**: la ventana de aviso era de 3 días
  fijos pero el plazo más corto es de 2, así que un caso nuevo nacía en amarillo
  y el color no informaba nada. La antelación pasó a escalar con el plazo —
  avisa el último día en uno de 2 días, tres días antes en uno de 15 — y nunca
  lo iguala.

**Panel de calibración**, dentro de Informe de gestión:

- Separa los plazos que **decide GOAT** (tomar el caso, elevar a comité, RFI) de
  los que **fija la norma**. Tres de seis no necesitan validación externa: se
  deciden.
- Marca los parámetros **inertes**: los que ningún caso tiene como plazo más
  urgente. Moverlos no cambia nada de lo que ve el analista, esté bien o mal
  configurado el valor.
- **Sensibilidad**: para cada valor candidato, cuántos casos abiertos quedarían
  vencidos, próximos y en regla. Convierte "¿15 o 20 días?" en una conversación
  sobre datos.
- Concentración de vencimientos por hito y antigüedad de los casos abiertos: si
  la mediana supera holgadamente un plazo, el problema es la capacidad de
  análisis, no el umbral, y bajarlo no lo arregla.
- `hitosSLA(caso, slaAlternativo)` acepta plazos distintos a los configurados,
  para simular sin tocar la configuración real.
- 14 tests, incluida la propiedad de monotonía: un plazo más largo nunca puede
  producir más vencidos.

## 3.19.0 — Informe de gestión para el Comité

- Sección nueva **Informe de gestión**, con selector de período (mes, trimestre
  o año) y exportación a PDF firmable.
- `lib/comite.js`: motor de métricas puro. Movimiento de casos (arrastre,
  abiertos, cerrados, saldo), resultado de los cierres, tiempos de resolución,
  cumplimiento de plazos, desempeño por analista, patrones recurrentes con su
  tipología UIF, evolución de cartera y screening.
- **Puntos sometidos a consideración**: el informe deriva de los propios números
  qué requiere decisión — plazos vencidos, cierres fuera de término, casos sin
  asignar, cartera pendiente creciendo, screening sin correr. Un comité necesita
  decidir, no solo enterarse.
- Se informa **mediana además de promedio**: un solo caso muy extenso desplaza
  el promedio y da una impresión equivocada del ritmo habitual.
- Campo de observaciones del Oficial de Cumplimiento, que se incorpora al
  informe como sección propia. Los números los calcula el sistema; la lectura
  de esos números no.
- **Estabilidad temporal**: las métricas se calculan con las fechas asentadas en
  cada caso, nunca con el reloj. El informe de un período cerrado da lo mismo
  generado hoy que dentro de un año, y hay un test que lo verifica.
- 25 tests nuevos, con foco en los bordes: casos que cruzan el límite del
  período, casos sin cerrar, y muestras vacías que devuelven `null` en vez de
  cero — no es lo mismo "cero días" que "sin datos".

## 3.18.3 — Fix: los estatutos escaneados llegaban truncados a la IA

- La extracción decidía entre "mandar texto" y "rasterizar páginas" con un
  umbral de **80 caracteres totales**. Una reproducción certificada digitalmente
  tiene capa de texto solo en la carátula: un estatuto de 20 páginas rendía 969
  caracteres, superaba el umbral, y al modelo le llegaba **la certificación en
  lugar del documento**. De ahí los "No identificado en documentación
  presentada" en presidente, representante legal y beneficiario final.
- Ahora se enruta por **densidad de texto por página** (mínimo 250, contra los
  1.500–3.000 de un PDF nativo) **y cobertura** (al menos la mitad de las
  páginas con texto propio). La cobertura es la que distingue "una carátula
  cargada + 19 páginas vacías" de "20 páginas con poco texto".
- `pdfToImages` pasó de 4 a 10 páginas: en un estatuto, la designación de
  autoridades rara vez está en las primeras cuatro.
- Cuando un escaneo no entra completo, el panel de resultados **lo dice**, con
  el nombre del archivo y cuántas páginas de cuántas se enviaron. Antes un
  "No identificado" era indistinguible de un dato real.
- El texto de la carátula se sigue enviando junto a las imágenes: aporta fecha,
  escribano y folios.

## 3.18.2 — Fix: pantalla en negro tras el login

- Al reescribir el import del tema en `App.jsx` quedó afuera `C`, que el archivo
  usa cinco veces. `ReferenceError: C is not defined` al montar → pantalla en
  negro. El build de Vite no lo detecta: esbuild no resuelve identificadores
  libres, así que compila sin una sola advertencia.
- `tests/imports.test.js`: escanea todos los módulos y falla si alguno usa un
  símbolo que no importó ni declaró. Es la tercera vez que este tipo de error
  llega a producción (`Pill` en v3.6.0, `C` acá), así que deja de depender de
  que alguien se acuerde de correr un script suelto.
  Verificado en las dos direcciones: pasa con el código correcto y falla
  señalando `App.jsx:327 C` al reintroducir el bug.

## 3.18.1 — Fix: la extracción con IA daba 401

- `lib/ai.js` armaba sus cabeceras con el token compartido **escrito a mano**
  (`'123aml2026'`) en lugar de importarlo de `session.js`. La migración de T8a
  buscaba el símbolo `APP_TOKEN`, así que nunca lo tocó. Al cortar el token con
  `ALLOW_APP_TOKEN=false`, `/api/ai` empezó a rechazar la extracción con IA.
- `tests/auth-cliente.test.js` (4 casos) cierra la clase de error: ningún módulo
  puede repetir el valor del token ni armar la cabecera a mano, y todo archivo
  que llame a `/api` tiene que pasar por `authHeaders()`. Se verificó
  reintroduciendo el bug: el test falla.

## 3.18.0 — Tema claro

- **Dos temas que conviven**, alternables desde la barra lateral: el oscuro
  original y uno claro estilo fintech moderno (referencia Stripe): tarjetas
  blancas que flotan con sombras de dos capas en vez de bordes duros, texto en
  azul marino profundo en lugar de negro, y semánticos oscurecidos para tener
  contraste real sobre blanco.
- **Implementación por variables CSS.** `T.BG` ya no vale `'#0A0E14'` sino
  `'var(--bg)'`. Cambiar de tema reescribe las variables en `:root`, así que no
  hace falta re-render y —clave— no quedan viejas las diez constantes que se
  calculan una sola vez al importar un módulo (`ui.jsx`, `casos.js` y otras).
- `TR` / `CR`: mismos tokens con valores reales, para atributos SVG y props de
  recharts, donde `var()` NO se resuelve. Un test estático vigila que no se
  cuele un `T.` en un atributo SVG.
- Preferencia persistida en `localStorage`, con el tema del sistema operativo
  como valor inicial y un script anti-parpadeo en `index.html`.
- `color-scheme` dinámico: scrollbars, date pickers y autofill del navegador
  siguen el tema.
- **Bugs de contraste preexistentes del tema oscuro, encontrados al medir:**
  texto blanco sobre verde daba 1,91:1 y sobre ámbar 1,83:1 (ilegibles); las
  etiquetas con tooltip de la Wiki daban 2,19:1. Se agregó el token
  `ON_SEMANTIC`, que va oscuro sobre los semánticos brillantes del tema oscuro
  y blanco sobre los oscurecidos del claro.
- 52 tests nuevos: paridad de claves entre paletas, contraste medido de cada
  par texto/superficie en ambos temas, y el escáner de atributos SVG.

## 3.17.4 — Fix: la carga de datos esperaba sesión

- El `useEffect` que hidrata legajos, períodos, casos y screening corría **al
  montar la app**, antes del login. Con el token compartido funcionaba porque
  viajaba siempre; al exigir sesión de usuario devolvía 401 y no reintentaba,
  dejando la app logueada y vacía con "sin conexión a Supabase".
- Ahora depende de `currentUser`: la carga arranca cuando hay con qué
  autenticarse, y se rehace si cambia la sesión.

## 3.17.3 — Normalización de ALLOW_APP_TOKEN

- El flag se comparaba con `!== 'false'`: un `False` o un espacio al final
  dejaba el control de seguridad abierto en silencio. Ahora acepta `false`,
  `0`, `no`, `off`, sin distinguir mayúsculas ni espacios.
- `appTokenVarDefinida` en `/api/config` para diagnosticar si la variable llega
  a la función, sin exponer su valor.

## 3.17.2 — Fechas institucionales sin validar

- **Las obligaciones institucionales con `validado:false` ya no generan casos.**
  Una fecha por defecto que pasara a vencida abría un caso de compliance real,
  con referencia y rastro de auditoría, sobre un vencimiento inventado.
- El widget del Dashboard las muestra atenuadas y con etiqueta "sin validar", y
  no las cuenta en el total. Antes aparecían idénticas a un vencimiento real.
- Los KPIs de Vencimientos tampoco las cuentan.
- 3 tests nuevos que fijan el criterio.

## 3.17.1 — xlsx 0.20.3 y tests de parseo de Excel

- `xlsx` pasa a instalarse desde el CDN de SheetJS: corrige Prototype Pollution y
  ReDoS (high), que no tenían fix por npm. La app parsea planillas que mandan los
  clientes, así que el vector no era teórico.
- `tests/xlsx.test.js` (7 casos): verifica que `XLSX.SSF.parse_date_code` siga
  disponible y que las fechas seriales de Excel se conviertan bien. Esa llamada
  está dentro de un `try/catch` que, si falla, deja el número crudo sin avisar.
- Las vulnerabilidades restantes son todas de desarrollo y no llegan al bundle.

## 3.17.0 — T8b · Tests, performance y documentación

- **Suite de tests con vitest**: 80 casos sobre `aml.js`, `screening.js`,
  `casos.js` y `vencimientos.js`. `npm test`.
- **Carga diferida por vista** con `React.lazy`: la carga inicial pasó de
  1.432 kB a 240 kB (419 → 75 kB gzip). Cada vista viaja en su propio chunk;
  `xlsx` y `recharts` solo se descargan al entrar a Análisis o Dashboard.
- README v3 y este CHANGELOG.
- **Hallazgo pinneado en los tests**: `PAT-01` detecta fraccionamiento solo sobre
  operaciones entrantes, aunque el texto de la señal dice "al mismo destino". El
  test fija la conducta actual para que cambiarla sea una decisión deliberada.

## 3.16.0 — T8a · Autenticación por usuario

- `api/_auth.js` con `requireAuth()` compartido: valida el JWT de Supabase y lee
  el rol de `perfiles`, nunca del body.
- Migrados a sesión de usuario: `/api/sync`, `/api/documentos`, `/api/ai`,
  `/api/cron-screening`. `/api/auth` y `/api/config` siguen con el token
  compartido por ser endpoints de arranque.
- **Refresco de JWT**: el login ahora devuelve `refresh_token`. `session.js`
  refresca un minuto antes del vencimiento y deduplica refrescos concurrentes.
  Sin esto, exigir el JWT habría roto toda sesión de más de una hora.
- Transición con `ALLOW_APP_TOKEN`; aviso permanente en la app mientras siga activo.

## 3.15.0 — T7b · Gestión documental

- Bucket privado de Storage y tabla `documentos`, con versionado: subir el mismo
  tipo no pisa el anterior.
- Subida directa del navegador a Storage mediante URL firmada por el servidor:
  la service key no sale del servidor y no aplica el límite de body de Vercel.
- Adjuntos por ítem del checklist; sección nueva en el export de legajo completo.

## 3.14.0 — T7a · Export de legajo completo

- `genLegajoCompleto()`: expediente consolidado de 11 secciones con trazabilidad
  (quién resolvió cada señal y cuándo, versión de cada listado de screening,
  historial de cada caso). Escapado de HTML en todos los campos de usuario.

## 3.13.1 — Fix de importación de listados

- La carga de listas usaba los parsers de **transacciones**, que descartaban las
  filas de un listado de nombres. Lectores genéricos nuevos con detección de
  separador (crítico: las listas traen "APELLIDO, NOMBRE" en archivos con punto
  y coma), BOM y comillas escapadas.
- La importación pasó a tener mapeo de columnas visible y vista previa.

## 3.13.0 — T6 · Comportamiento y red

- `lineaBase()`: mediana de volumen y operaciones sobre los 6 períodos previos.
  Mediana y no promedio, para que un período atípico no corra la base.
- **PAT-13** desvío contra la línea base propia · **PAT-14** contraparte nueva que
  concentra el flujo · **PAT-15** cambio abrupto de distribución horaria.
- Vista **Red**: contrapartes compartidas entre legajos, con grafo determinístico.

## 3.12.0 — T5b · Cron de screening

- Corrida semanal automática con el mismo motor que la manual.
- `hitsNuevos()`: solo las coincidencias nuevas de nivel ALTA abren caso solo.
  Sin corrida previa devuelve vacío a propósito.
- Extensiones `.js` explícitas en `lib/` para que el cron pueda importar el motor.

## 3.11.0 — T5a · Motor de screening

- Matching determinístico local: documento exacto, nombre exacto, nombre sin
  sufijo societario y aproximación tolerante. Reproducible por un inspector.
- Indexado por bloques: de 16 s a 0,4 s con 200 legajos × 5.000 entradas.
- Descarte razonado de falsos positivos, con motivo y autor.

## 3.10.0 — T4 · Calendario regulatorio

- Vencimientos de actualización de legajo, de documentos y de obligaciones
  institucionales. Generación de casos desde los vencidos.

## 3.9.0 — T3b · Kanban y asignación

- Kanban con drag & drop, asignación por analista, comentarios y vínculo
  bidireccional señal ↔ caso.

## 3.8.1 — Selección por señal al generar casos

## 3.8.0 — T3a · Case management con SLA

- Tabla `casos`, ciclo de vida de 6 estados y motor de plazos.
- **Criterio único de señal activa** en `aml.js`: antes cada vista contaba
  distinto y Legajos subreportaba.

## 3.7.0 — T2d · Alertas

## 3.6.0 — T2c · Análisis en dos paneles

## 3.5.0 — T2b · Tabla de legajos y drawer

## 3.3.0 — T2a · Dashboard

## 3.2.0 / 3.1.0 — T1 · Design system

## 3.0.0 — T0 · Modularización

- `App.jsx` de 7.480 a 432 líneas, repartido en 22 módulos.
