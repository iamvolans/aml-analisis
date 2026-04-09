# Rebit AML & KYB Tool — v2.2.0

Sistema integral de gestión de Compliance, KYB y Monitoreo Transaccional AML para **GOAT S.A. / Rebit**, Proveedor de Servicios de Pago (PSP) regulado por UIF y BCRA.

🌐 **Producción:** https://rebit-aml-app.vercel.app

---

## Funcionalidades

### 📁 Módulo Legajos KYB
- CRUD completo de clientes corporativos con 7 pestañas: Resumen IA, Datos, Checklist, Scoring, Red Flags, Historial, Screening
- **Extracción IA de documentos** — PDFs e imágenes procesados por Claude / GPT-4o para completar automáticamente todos los campos
- Checklist de documentación KYB con estados OK / Pendiente / Bloqueante
- Scoring de 8 factores de riesgo (1–5) con segmentación automática BAJO / MEDIO / MEDIO-ALTO / ALTO
- **Ciclo de vida de cuenta** — 5 estados: En Onboarding → Activa → Monitoreo Reforzado → Suspendida → Cerrada
- Historial de cambios de estado con fecha, hora y analista (respaldo regulatorio UIF)
- Generación de **INF-01** (Debida Diligencia KYB) y **INF-07** (Cierre/Desvinculación)

### 🛡 Screening de Sanciones Internacionales
- Verificación automática via IA con búsqueda web en tiempo real contra:
  - 🇺🇸 OFAC SDN List (USA)
  - 🌐 ONU Lista Consolidada
  - 🇦🇷 REPET UIF Argentina (repet.uif.gob.ar)
  - 🇦🇷 PEPs Argentina (Oficina Anticorrupción)
- Resultado por lista: ✅ LIMPIO / 🟡 REVISAR / 🔴 COINCIDENCIA
- Resultado guardado con fecha, hora y analista para evidencia regulatoria

### 📊 Módulo Análisis AML Transaccional
- Carga de archivos CSV, XLS, XLSX, ODS — detección automática de columnas
- **12 patrones AML** (PAT-01 a PAT-12) con tipologías UIF T-01 a T-09
- **16 métricas** transaccionales: volumen IN/OUT, HHI concentración, fraccionamiento, pass-through, circularidad, montos redondos, horario atípico, etc.
- **Scoring de 8 factores** con clasificación BAJO / MEDIO / MEDIO-ALTO / ALTO
- Métricas pre-computadas y persistidas en Supabase — disponibles en cualquier dispositivo sin recargar el archivo
- Pestañas: Métricas | Señales | Scoring | Gráficos | Nota DD | Memos | RFI
- **Resolución de señales ALTA** — flujo dos pasos: Analista propone → Supervisor aprueba/rechaza
- **Estados del período AML** — En revisión / RFI enviado / Cerrado sin alerta / Cerrado con alerta / Archivado
- Generación de **INF-02** (Monitoreo Transaccional AML) con memos integrados

### 📈 Análisis Multi-período (Tendencias)
- Activo cuando el legajo tiene 2+ períodos cargados
- Gráfico de líneas: evolución IN/OUT por período
- Gráfico de score trend con puntos de color por nivel de riesgo
- Tabla comparativa de métricas clave período a período
- Análisis de rotación de contrapartes con alerta automática si rotación > 60%

### 📋 ROS Borrador UIF
- Reporte de Operación Sospechosa pre-completado con datos del sistema
- 8 secciones: Sujeto Obligado, Cliente, Descripción de Operaciones, Señales (PAT → tipología UIF), Top 20 operaciones, Diligencias (KYB + RFIs), Conclusión editable, Firma
- Número correlativo ROS-YYYY-NNN compartido entre analistas via Supabase
- Secciones narrativas editables en pantalla antes de imprimir/PDF

### 📧 Módulo RFI
- Hilo de intercambios: Envío / Respuesta / Nota interna / Cierre
- Estados: Enviado | Respondido | Resp. parcial | Sin respuesta | Cerrado
- Alertas automáticas de vencimiento (> 7 días sin respuesta del cliente)

### 📈 Dashboard
- **Operacional** — KPIs, alertas proactivas por plazo regulatorio, semáforo de cartera, gráficos, cuentas con señales ALTA
- **Ejecutivo** — semáforo completo de cartera, evolución mensual IN/OUT, panel RFIs con SLA y tasa de respuesta

### 🔐 Autenticación y Roles
- Login con email + contraseña via Supabase Auth
- 5 roles: Admin | Oficial de Cumplimiento | Supervisor | Analista | Solo lectura
- Panel de administración de usuarios (solo Admin)
- **Audit trail completo** — todas las acciones registradas en Supabase

---

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite, Recharts, SheetJS (xlsx) |
| Backend | Vercel Serverless Functions (Node.js) |
| Base de datos | Supabase PostgreSQL |
| Autenticación | Supabase Auth |
| IA — extracción docs | Claude `claude-sonnet-4-20250514` o GPT-4o `gpt-4o-2024-11-20` |
| IA — screening | Claude con web search (`web_search_20250305`) |
| Deploy | Vercel (CD automático desde GitHub) |

---

## Estructura del proyecto

```
rebit-aml-app/
├── index.html
├── package.json          # v2.2.0
├── vite.config.js
├── vercel.json           # maxDuration: 60s para api/ai.js
├── README.md
├── src/
│   ├── main.jsx
│   └── App.jsx           # ~5200+ líneas — app completa
└── api/
    ├── ai.js             # Proxy IA (Claude + GPT-4o + web search)
    ├── sync.js           # Proxy Supabase (legajos, periodos, txns, kv)
    ├── auth.js           # Autenticación y gestión de usuarios
    └── config.js         # Sirve env vars al frontend
```

---

## Variables de entorno (Vercel)

Configurar en https://vercel.com → proyecto → Settings → Environment Variables:

| Variable | Descripción |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key de Anthropic (Claude) |
| `OPENAI_API_KEY` | API key de OpenAI (GPT-4o) |
| `AI_PROVIDER` | `claude` o `openai` (default: `claude`) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key de Supabase |
| `APP_TOKEN` | Token de validación interna entre frontend y API |

---

## Base de datos Supabase

Tablas requeridas (crear con RLS deshabilitado — se usa `service_role`):

```sql
CREATE TABLE legajos      (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE periodos     (id TEXT PRIMARY KEY, legajo_id TEXT, nombre TEXT, created_at_str TEXT, data JSONB, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE periodos_txns(periodo_id TEXT PRIMARY KEY, txns JSONB, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE kv           (k TEXT PRIMARY KEY, v JSONB, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE perfiles     (id UUID PRIMARY KEY REFERENCES auth.users, nombre TEXT, email TEXT, rol TEXT, activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE audit_log    (id BIGSERIAL PRIMARY KEY, usuario_id UUID, usuario_nombre TEXT, accion TEXT, entidad TEXT, entidad_id TEXT, detalle JSONB, created_at TIMESTAMPTZ DEFAULT now());
```

---

## Deploy

### Deploy automático (recomendado)

El repositorio está conectado a Vercel — cada `git push` a `main` dispara un deploy automático.

```bash
cd ~/Downloads/rebit-aml-app
git add .
git commit -m "descripción del cambio"
git push
```

### Deploy manual con CLI

```bash
cd ~/Downloads/rebit-aml-app
npx vercel --prod
```

### Desarrollo local

```bash
npm install
npm run dev
# Abrir http://localhost:5173
```

> Para desarrollo local crear `.env.local` con las mismas variables que en Vercel.

---

## Persistencia de datos

- **Supabase PostgreSQL** — fuente de verdad. Sincronización automática con cada guardado.
- **localStorage** — caché local para acceso offline y velocidad de carga.
- **Transacciones AML** — guardadas separado en `periodos_txns` (Vercel body limit 4.5 MB).
- Al iniciar, los períodos sin métricas se migran automáticamente en segundo plano: carga txns de Supabase → calcula métricas → guarda. El dashboard se va poblando progresivamente sin intervención manual.
- **Backup manual** — botones "Exportar JSON" / "Importar JSON" en el sidebar.

---

## Normativa de referencia

- Ley 25.246 y modificatorias — Encubrimiento y Lavado de Activos
- Resoluciones UIF 156/2018, 76/2019 y complementarias para PSPs
- Comunicación BCRA "A" 6885 y ss. — Proveedores de Servicios de Pago
- REPET UIF: https://repet.uif.gob.ar
- SIROS UIF (presentación ROS): https://siros.uif.gob.ar

---

## Design System

```
v2.2.0 LOCKED — GOAT S.A. / Rebit Compliance
Azul Oscuro: #1B2A4A  |  Azul Medio: #2C4A7C  |  Azul Claro: #3B6DAA
Verde: #27AE60  |  Amarillo: #F39C12  |  Naranja: #E67E22  |  Rojo: #E74C3C
```

---

*GOAT S.A. — CUIT 30-71703953-6 — Compliance & AML — Sistema interno v2.2.0*
