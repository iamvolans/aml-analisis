#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera el Manual de Operación del Rebit AML & KYB Tool.

El contenido normativo y de procedimiento está escrito acá; los catálogos
técnicos (patrones, checklist, factores KYB, estados, parámetros) se leen
del código fuente para que el manual no se desincronice del sistema.

    python3 manual/generar_manual.py
"""
import json, os, re, subprocess, sys
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AZUL = '#1B3A8C'
HOY = date.today().strftime('%d/%m/%Y')
VERSION_DOC = '1.0'


# ═══════════════════════════════════════════════════════════════════════════
# LECTURA DEL CÓDIGO — los catálogos salen del sistema, no de esta plantilla
# ═══════════════════════════════════════════════════════════════════════════
def leer(rel):
    with open(os.path.join(RAIZ, rel), encoding='utf-8') as f:
        return f.read()


def inventario():
    c = leer('src/lib/constants.js')
    aml = leer('src/lib/aml.js')
    casos = leer('src/lib/casos.js')
    venc = leer('src/lib/vencimientos.js')
    scr = leer('src/lib/screening.js')
    graf = leer('src/lib/grafo.js')
    inv = {}

    m = re.search(r'CHECKLIST_ITEMS\s*=\s*\[(.*?)\];', c, re.S)
    inv['checklist'] = re.findall(r"'([^']+)'", m.group(1))

    m = re.search(r'KYB_FACTORS\s*=\s*\[(.*?)\];', c, re.S)
    inv['kyb'] = re.findall(r"'([^']+)'", m.group(1))

    inv['pat'] = {}
    for m in re.finditer(r"'(PAT-\d+)':\s*\{\s*tip:'([^']*)',\s*desc:'([^']*)'", c):
        inv['pat'][m.group(1)] = {'tip': m.group(2), 'desc': m.group(3)}
    for m in re.finditer(r"add\('(PAT-\d+)',\s*(?:[^,]+),\s*'([^']*)'", aml):
        if m.group(1) in inv['pat'] and 'titulo' not in inv['pat'][m.group(1)]:
            inv['pat'][m.group(1)]['titulo'] = m.group(2)

    m = re.search(r'ESTADOS_CUENTA\s*=\s*\[(.*?)\n\];', c, re.S)
    inv['estadosCuenta'] = []
    for e in re.finditer(r'\{([^}]*)\}', m.group(1)):
        d = dict(re.findall(r"(\w+)\s*:\s*'([^']*)'", e.group(1)))
        if d.get('id'):
            inv['estadosCuenta'].append(d)

    inv['screening'] = re.findall(r"\{n:'([^']*)',j:'([^']*)'", c)

    inv['estadosCaso'] = []
    m = re.search(r'ESTADOS_CASO\s*=\s*\[(.*?)\n\];', casos, re.S)
    for e in re.finditer(r'\{([^}]*)\}', m.group(1)):
        d = dict(re.findall(r"(\w+)\s*:\s*'([^']*)'", e.group(1)))
        ab = re.search(r'abierto:\s*(true|false)', e.group(1))
        if d.get('id'):
            d['abierto'] = (ab.group(1) == 'true') if ab else True
            inv['estadosCaso'].append(d)

    inv['origenes'] = re.findall(r"\{ id:'([A-Z]+)',\s*label:'([^']*)'", casos)

    m = re.search(r'var SLA = \{(.*?)\};', casos, re.S)
    inv['sla'] = [(a, int(b), (c2 or '').strip())
                  for a, b, c2 in re.findall(r'(\w+):\s*(\d+),\s*//\s*(.*)', m.group(1))]

    m = re.search(r'ACTUALIZACION_LEGAJO = \{(.*?)\};', venc, re.S)
    inv['actualizacion'] = re.findall(r"'([A-Z\-]+)':\s*(\d+)", m.group(1))

    m = re.search(r'VIGENCIA_DOCS = \{(.*?)\};', venc, re.S)
    inv['vigencia'] = re.findall(r"'([^']+)':\s*(\d+)", m.group(1))

    inv['institucionales'] = []
    for e in re.finditer(r"\{ id:'(\w+)',\s*label:'([^']*)',\s*\n?\s*periodicidad:'(\w+)'"
                         r"(?:,\s*mes:(\d+))?,\s*dia:(\d+),\s*validado:(true|false)", venc):
        inv['institucionales'].append({
            'id': e.group(1), 'label': e.group(2), 'periodicidad': e.group(3),
            'mes': e.group(4), 'dia': e.group(5), 'validado': e.group(6) == 'true'})

    m = re.search(r'var UMBRALES = \{(.*?)\};', scr, re.S)
    inv['umbrales'] = re.findall(r'(\w+):\s*([\d.]+)', m.group(1))

    m = re.search(r'var COMPORTAMIENTO = \{(.*?)\};', aml, re.S)
    inv['comportamiento'] = [(a, b, (c3 or '').strip())
                             for a, b, c3 in re.findall(r'(\w+):\s*(\d+),\s*//\s*(.*)', m.group(1))]

    m = re.search(r'var GRAFO = \{(.*?)\};', graf, re.S)
    inv['grafo'] = re.findall(r'(\w+):\s*(\d+)', m.group(1))

    pkg = json.loads(leer('package.json'))
    inv['version'] = pkg['version']

    r = subprocess.run(['npx', 'vitest', 'run', '--reporter=json'],
                       capture_output=True, text=True, cwd=RAIZ)
    try:
        inv['tests'] = json.loads(r.stdout[r.stdout.index('{'):])['numTotalTests']
    except Exception:
        inv['tests'] = None
    return inv


INV = inventario()


# ═══════════════════════════════════════════════════════════════════════════
# HELPERS DE MARCADO
# ═══════════════════════════════════════════════════════════════════════════
_indice = []
_cap = [0]
_sec = [0]


def esc(x):
    return (str(x).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def h1(t):
    _cap[0] += 1
    _sec[0] = 0
    n = _cap[0]
    _id = 'c%d' % n
    _indice.append((1, str(n), t, _id))
    return '<h1 id="%s"><span class="num">%d.</span> %s</h1>' % (_id, n, esc(t))


def h2(t):
    _sec[0] += 1
    n = '%d.%d' % (_cap[0], _sec[0])
    _id = 's%s' % n.replace('.', '_')
    _indice.append((2, n, t, _id))
    return '<h2 id="%s"><span class="num">%s</span> %s</h2>' % (_id, n, esc(t))


def h3(t):
    return '<h3>%s</h3>' % esc(t)


def p(t):
    return '<p>%s</p>' % t


def nota(cls, t):
    return '<div class="nota %s">%s</div>' % (cls, t)


def tabla(cabeceras, filas, anchos=None):
    cols = ''
    if anchos:
        cols = '<colgroup>%s</colgroup>' % ''.join('<col style="width:%s">' % a for a in anchos)
    th = ''.join('<th>%s</th>' % esc(c) for c in cabeceras)
    tr = ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % c for c in f) for f in filas)
    return '<table>%s<thead><tr>%s</tr></thead><tbody>%s</tbody></table>' % (cols, th, tr)


def pasos(items):
    return '<ol class="pasos">%s</ol>' % ''.join('<li>%s</li>' % i for i in items)


def lista(items):
    return '<ul>%s</ul>' % ''.join('<li>%s</li>' % i for i in items)


def uso(correcto, incorrecto):
    return ('<div class="uso"><div class="ok"><div class="rot">Uso correcto</div>%s</div>'
            '<div class="mal"><div class="rot">Uso incorrecto</div>%s</div></div>'
            % (lista(correcto), lista(incorrecto)))


CSS = """
@page { size: A4; margin: 22mm 18mm 20mm 18mm;
  @top-center { content: "Manual de Operación · Rebit AML & KYB Tool"; font-family: Arial; font-size: 7.5pt; color: #8a97a8; }
  @bottom-left { content: "GOAT S.A. — Rebit · PSPCP Registro BCRA N° 33.706"; font-family: Arial; font-size: 7.5pt; color: #8a97a8; }
  @bottom-right { content: "Página " counter(page) " de " counter(pages) " | Confidencial"; font-family: Arial; font-size: 7.5pt; color: #8a97a8; }
}
@page :first { @top-center { content: ""; } @bottom-left { content: ""; } @bottom-right { content: ""; } }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; line-height: 1.55; color: #1f2733; margin: 0; }
h1 { font-size: 14pt; color: %(azul)s; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid %(azul)s;
     page-break-before: always; page-break-after: avoid; }
h1:first-of-type { page-break-before: avoid; }
h2 { font-size: 11pt; color: #24457f; margin: 18px 0 7px; page-break-after: avoid; }
h3 { font-size: 9.8pt; color: #33475f; margin: 13px 0 5px; page-break-after: avoid; }
.num { color: %(azul)s; font-weight: bold; }
p { margin: 0 0 8px; text-align: justify; }
ul, ol { margin: 0 0 9px; padding-left: 19px; }
li { margin-bottom: 3px; }
table { width: 100%%; border-collapse: collapse; margin: 9px 0 13px; font-size: 8.3pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th { background: %(azul)s; color: #fff; text-align: left; padding: 5px 7px; font-weight: bold; font-size: 8pt; }
td { border-bottom: 1px solid #dde3ec; padding: 5px 7px; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f6f8fc; }
code, .mono { font-family: "Courier New", monospace; font-size: 8.2pt; background: #eef2f8; padding: 1px 4px; border-radius: 2px; }
.nota { padding: 9px 12px; margin: 10px 0; border-radius: 3px; font-size: 8.8pt; border-left: 3px solid; }
.nota.info { background: #eef4fc; border-color: %(azul)s; }
.nota.warn { background: #fdf5e6; border-color: #b8860b; }
.nota.crit { background: #fdeeee; border-color: #b03030; }
.nota.ok   { background: #eefaf2; border-color: #1e8a53; }
.nota b { color: #16233a; }
ol.pasos { counter-reset: paso; list-style: none; padding-left: 0; }
ol.pasos li { counter-increment: paso; position: relative; padding-left: 26px; margin-bottom: 6px; }
ol.pasos li::before { content: counter(paso); position: absolute; left: 0; top: 1px; width: 18px; height: 18px;
  background: %(azul)s; color: #fff; border-radius: 50%%; text-align: center; font-size: 7.5pt; line-height: 18px; font-weight: bold; }
.uso { display: flex; gap: 10px; margin: 10px 0 13px; }
.uso > div { flex: 1; padding: 9px 11px; border-radius: 3px; font-size: 8.6pt; }
.uso .ok { background: #eefaf2; border: 1px solid #bfe4cf; }
.uso .mal { background: #fdeeee; border: 1px solid #f0cccc; }
.uso .rot { font-weight: bold; font-size: 7.6pt; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 5px; }
.uso .ok .rot { color: #1e8a53; }
.uso .mal .rot { color: #b03030; }
.uso ul { margin: 0; padding-left: 15px; }
.portada { height: 245mm; display: flex; flex-direction: column; justify-content: center; }
.marca { border-left: 5px solid %(azul)s; padding-left: 16px; margin-bottom: 34px; }
.marca .n { font-size: 22pt; font-weight: bold; color: %(azul)s; letter-spacing: -0.5px; }
.marca .s { font-size: 9.5pt; color: #64748b; letter-spacing: 2.6px; text-transform: uppercase; margin-top: 3px; }
.titulo { font-size: 27pt; font-weight: bold; color: #16233a; line-height: 1.16; margin-bottom: 10px; }
.subtitulo { font-size: 12.5pt; color: #4a6a8a; margin-bottom: 34px; }
.meta { border-top: 1px solid #d6e0ee; padding-top: 14px; font-size: 9pt; color: #4a5568; }
.meta td { border: none; padding: 3px 0; font-size: 9pt; }
.meta td:first-child { color: #8a97a8; width: 42%%; }
#toc { page-break-after: always; }
#toc h1 { page-break-before: avoid; }
.toc1 { font-weight: bold; color: %(azul)s; margin: 9px 0 2px; font-size: 9.6pt; }
.toc2 { margin-left: 17px; font-size: 8.9pt; color: #33475f; }
.toc a { color: inherit; text-decoration: none; }
.toc a::after { content: leader('.') target-counter(attr(href), page); color: #9aa7b8; }
""" % {'azul': AZUL}


# ═══════════════════════════════════════════════════════════════════════════
# CONTENIDO
# ═══════════════════════════════════════════════════════════════════════════
B = []
A = B.append

# ── 1 ──────────────────────────────────────────────────────────────────────
A(h1('Propósito y alcance'))
A(h2('Objeto del documento'))
A(p('Este manual describe la totalidad de las funciones del <b>Rebit AML &amp; KYB Tool</b>, '
    'la plataforma con la que GOAT S.A. ejecuta y documenta su programa de prevención de lavado '
    'de activos y financiamiento del terrorismo. Para cada función se indica qué hace, cómo se '
    'opera y —lo que suele faltar en la documentación de sistemas— <b>cuál es su uso correcto y '
    'cuál es el uso que degrada el valor probatorio del legajo</b>.'))
A(p('El documento cumple dos fines. Hacia adentro, es la referencia de trabajo del equipo de '
    'Compliance. Hacia afuera, describe ante bancos patrocinantes, auditores y autoridad de '
    'aplicación cómo se ejecutan los monitoreos, qué queda registrado de cada decisión y con qué '
    'trazabilidad.'))

A(h2('Destinatarios'))
A(tabla(['Perfil', 'Uso del documento'], [
    ['<b>Analista de Compliance</b>',
     'Referencia operativa diaria. Las secciones 4 a 10 describen su trabajo habitual; '
     'la sección 15 sintetiza su circuito completo.'],
    ['<b>Oficial de Cumplimiento</b> <span class="mono">oficial_cumplimiento</span>',
     'Además de lo anterior, las secciones 7, 11, 13 y 14: decisión sobre casos, calibración '
     'de parámetros, informe al comité y limitaciones declaradas.'],
    ['<b>Auditoría interna y revisor externo</b>',
     'Secciones 2, 12 y 16: modelo de trazabilidad, catálogo de informes y limitaciones.'],
    ['<b>Banco patrocinante / autoridad</b>',
     'El documento completo, con foco en las secciones 2, 5, 9 y 16.'],
], ['24%', '76%']))

A(h2('Advertencia sobre parámetros'))
A(nota('warn',
       '<b>Los umbrales y plazos que este manual documenta son los configurados en el sistema, '
       'no una interpretación normativa.</b> La sección 13 identifica cuáles son decisión interna '
       'de GOAT S.A. y cuáles derivan de normativa, y señala expresamente los que se encuentran '
       'pendientes de validación contra la resolución vigente. Ningún parámetro marcado como '
       'pendiente genera casos ni computa en indicadores hasta ser confirmado.'))

# ── 2 ──────────────────────────────────────────────────────────────────────
A(h1('Principios de operación'))
A(p('Cinco decisiones de diseño gobiernan el comportamiento del sistema. Conocerlas evita '
    'interpretar mal lo que se ve en pantalla.'))

A(h2('Todo dato tiene autor y fecha'))
A(p('Cada resolución de señal, cambio de estado, asignación y cierre de caso registra quién lo '
    'hizo y cuándo. El sistema no permite modificar un registro sin dejar rastro: las correcciones '
    'se asientan como eventos nuevos. Un legajo exportado muestra esa cadena completa.'))

A(h2('Lo automático se propone; lo decide una persona'))
A(p('El sistema detecta, calcula y sugiere. No cierra casos, no descarta coincidencias ni resuelve '
    'señales por sí mismo. Las únicas acciones automáticas son la corrida semanal de screening y la '
    'apertura de casos por coincidencias nuevas de nivel ALTA, y ambas quedan asentadas como '
    'ejecutadas por el sistema.'))

A(h2('Los resultados son reproducibles'))
A(p('El screening no consulta servicios externos durante una corrida: coteja localmente contra los '
    'listados cargados, cuya versión queda registrada. Un tercero con el mismo listado y el mismo '
    'algoritmo obtiene el mismo resultado. Del mismo modo, el informe de gestión de un período '
    'cerrado arroja las mismas cifras se genere cuando se genere.'))

A(h2('La incertidumbre se declara, no se disimula'))
A(p('Cuando el sistema no puede afirmar algo con certeza, lo dice. Un documento escaneado leído '
    'parcialmente se informa como tal; una fecha estimada se marca como estimada; un parámetro no '
    'validado se muestra con advertencia y se excluye de los indicadores. Un campo vacío por falta '
    'de información no debe poder confundirse con un dato verificado.'))

A(h2('Un solo criterio por concepto'))
A(p('Cada concepto se calcula en un único lugar del sistema. "Señal activa" significa exactamente '
    'lo mismo en el tablero, en el legajo, en alertas y en el informe al comité. No hay dos vistas '
    'que puedan mostrar cifras distintas del mismo hecho.'))

# ── 3 ──────────────────────────────────────────────────────────────────────
A(h1('Acceso, roles y trazabilidad'))
A(h2('Autenticación'))
A(p('El acceso se realiza con usuario y contraseña individuales gestionados en Supabase Auth. '
    'Cada llamada al servidor se valida contra la sesión del usuario, y el rol se lee siempre de la '
    'tabla de perfiles del servidor —nunca de un dato enviado por el navegador—, de modo que un '
    'cliente no puede declararse con permisos que no tiene.'))
A(p('La sesión se renueva automáticamente y no se conserva al cerrar el navegador: recargar exige '
    'volver a autenticarse. Es el comportamiento que corresponde a una herramienta de compliance en '
    'equipos compartidos.'))

A(h2('Roles'))
A(tabla(['Rol', 'Puede', 'No puede'], [
    ['<b>Solo lectura</b> <span class="mono">readonly</span>', 'Consultar todas las secciones.',
     'Modificar cualquier dato.'],
    ['<b>Analista</b> <span class="mono">analista</span>', 'Crear y editar legajos, cargar períodos, analizar, resolver señales, '
     'gestionar casos, emitir INF-01 e INF-02.',
     'Cerrar casos con o sin reporte. Emitir INF-07. Eliminar registros. Gestionar usuarios.'],
    ['<b>Supervisor</b> <span class="mono">supervisor</span>', 'Todo lo anterior, más cerrar casos, aprobar y emitir INF-07.',
     'Eliminar registros. Gestionar usuarios.'],
    ['<b>Oficial de Cumplimiento</b> <span class="mono">oficial_cumplimiento</span>', 'Todo lo del supervisor. Consultar el registro de auditoría.',
     'Gestionar usuarios (salvo que además tenga rol administrador).'],
    ['<b>Administrador</b> <span class="mono">admin</span>', 'Todas las funciones, incluida la gestión de usuarios y la eliminación '
     'de registros.', '—'],
], ['20%', '46%', '34%']))
A(nota('info',
       'La separación entre quien analiza y quien decide el cierre es deliberada: el sistema impide '
       'que un mismo usuario con rol de analista abra un caso, lo trabaje y lo cierre sin '
       'intervención de un supervisor u Oficial de Cumplimiento.'))

A(h2('Registro de auditoría'))
A(p('Toda acción relevante se asienta en un registro consultable desde la sección Usuarios: alta y '
    'modificación de legajos, resolución de señales, cambios de estado de caso, generación de '
    'informes, carga de listados de screening, descarte de coincidencias y subida de documentos. '
    'Cada asiento contiene usuario, acción, entidad afectada, fecha y hora.'))

# ── 4 ──────────────────────────────────────────────────────────────────────
A(h1('Tablero de control'))
A(p('Es la pantalla de entrada y la vista de situación de la cartera. Se organiza en dos '
    'perspectivas: <b>Operacional</b>, orientada al trabajo del día, y <b>Ejecutiva</b>, orientada a '
    'la composición y evolución del portafolio.'))
A(h2('Avisos de atención inmediata'))
A(p('En el encabezado, y solo cuando corresponde, el tablero antepone tres avisos:'))
A(tabla(['Aviso', 'Aparece cuando', 'Acción'], [
    ['<b>Casos con plazo crítico</b>', 'Existen casos abiertos vencidos o próximos a vencer.',
     'Cada fila enlaza al caso.'],
    ['<b>Vencimientos a 30 días</b>', 'El calendario registra obligaciones por vencer.',
     'Enlaza al calendario completo.'],
    ['<b>Screening desactualizado</b>', 'La última corrida supera los diez días, o nunca se ejecutó.',
     'Enlaza a la sección de screening.'],
], ['26%', '44%', '30%']))
A(h2('Indicadores'))
A(p('Legajos en cartera, períodos analizados, señales activas totales y de severidad ALTA, '
    'distribución por estado de cuenta, composición por segmento de riesgo y por dictamen. Incluye '
    'además el detalle de cuentas activas sin análisis reciente, con la posibilidad de asentar allí '
    'mismo la fecha del último análisis externo al sistema.'))
A(nota('info',
       'Los indicadores del tablero usan el mismo criterio de "señal activa" que el resto del '
       'sistema. Una diferencia entre lo que muestra el tablero y lo que muestra un legajo no es '
       'posible por construcción.'))

A(h1('Legajos KYB'))
A(p('La sección Legajos concentra la debida diligencia de cada cliente: identificación, '
    'documentación respaldatoria, evaluación de riesgo, screening y estado de la relación.'))

A(h2('Alta de un legajo'))
A(pasos([
    'Desde <span class="mono">Legajos KYB</span>, pulsar <b>+ Nuevo legajo</b>.',
    'Cargar los documentos del cliente en la pestaña <b>Resumen IA</b> para que el sistema '
    'preextraiga los datos, o completar manualmente la pestaña <b>Datos</b>.',
    'Revisar campo por campo lo extraído. La extracción es un borrador, no una verificación.',
    'Completar el <b>Checklist</b> documental y adjuntar los archivos.',
    'Puntuar los siete factores de <b>Scoring</b> y confirmar el segmento propuesto.',
    'Registrar el <b>Screening</b> y asentar el dictamen.',
    'Guardar. El legajo nace en estado <span class="mono">En Onboarding</span>.',
]))

A(h2('Extracción asistida por inteligencia artificial'))
A(p('El sistema admite hasta 25 documentos por análisis (PDF o imagen, hasta 90 MB en total) y '
    'preextrae razón social, CUIT, actividad, domicilio, autoridades, beneficiario final, estructura '
    'societaria y datos económicos, además de proponer segmento y dictamen.'))
A(p('Los PDF con texto seleccionable se procesan como texto. Los escaneados se rasterizan y se '
    'leen como imágenes, hasta diez páginas por documento. El sistema evalúa la <b>densidad de texto '
    'por página</b> para distinguir un documento nativo de una reproducción certificada, cuya '
    'carátula tiene texto pero cuyo contenido está escaneado.'))
A(nota('crit',
       '<b>Cuando un documento escaneado no entra completo, el panel de resultados lo informa</b> '
       'indicando archivo y cuántas páginas de cuántas se enviaron. Ante un campo sin identificar, '
       'verificar primero ese aviso: la ausencia de un dato puede deberse a que la página donde '
       'figura no fue leída, no a que el documento no lo contenga.'))
A(uso(['Revisar cada campo extraído contra el documento fuente antes de guardar.',
       'Atender el aviso de lectura parcial y, si aparece, subir por separado la sección relevante '
       '(por ejemplo el acta de designación de autoridades).',
       'Completar a mano lo que la extracción no pudo resolver.'],
      ['Guardar el legajo sin revisar, asumiendo que lo extraído es correcto.',
       'Interpretar "No identificado en documentación presentada" como un hecho verificado.',
       'Cargar documentos de otro cliente en el mismo análisis.']))

A(h2('Checklist documental'))
A(p('Quince ítems, cada uno con estado <span class="mono">Pendiente</span>, '
    '<span class="mono">OK</span>, <span class="mono">Bloqueante</span> o '
    '<span class="mono">N/A</span>. Los marcados como OK admiten fecha del documento y archivo '
    'adjunto.'))
A(tabla(['#', 'Documento', 'Vigencia'],
        [[str(i + 1), esc(d), (dict(INV['vigencia']).get(d, '—') + ' meses')
          if d in dict(INV['vigencia']) else 'permanente']
         for i, d in enumerate(INV['checklist'])], ['6%', '64%', '30%']))
A(nota('info',
       'La <b>fecha del documento</b> alimenta el calendario de vencimientos. Si se omite, el '
       'sistema estima la vigencia desde la última actualización del legajo y marca ese vencimiento '
       'como <span class="mono">estimado</span>. Cargarla convierte una estimación en un control real.'))

A(h2('Documentación respaldatoria'))
A(p('Cada ítem del checklist admite archivos adjuntos de hasta 25 MB. El archivo viaja cifrado '
    'directamente al repositorio documental sin pasar por la aplicación, y solo es accesible '
    'mediante enlaces firmados de vigencia limitada: no existe URL pública.'))
A(p('El sistema aplica <b>versionado</b>: subir un archivo nuevo para el mismo ítem no reemplaza al anterior. '
    'La versión nueva queda vigente y las previas se conservan como antecedente, visibles en el '
    'legajo y en su exportación.'))
A(uso(['Adjuntar el documento en el ítem que acredita, no en uno genérico.',
       'Cargar la fecha del documento junto con el archivo.',
       'Subir la versión nueva cuando un documento se renueva, sin borrar la anterior.'],
      ['Eliminar versiones anteriores para "ordenar": son el antecedente de la debida diligencia.',
       'Adjuntar el legajo completo escaneado en un solo ítem.']))

A(h2('Evaluación de riesgo (scoring KYB)'))
A(p('Siete factores puntuados de 1 a 5. El promedio determina el segmento sugerido, que el analista '
    'puede ajustar con fundamento.'))
A(tabla(['Factor', 'Qué evalúa'], [
    [esc(INV['kyb'][0]), 'Cuántos ítems del checklist están efectivamente acreditados.'],
    [esc(INV['kyb'][1]), 'Riesgo inherente al rubro y a la jurisdicción de operación.'],
    [esc(INV['kyb'][2]), 'Resultado del cotejo contra listas restrictivas y condición de PEP.'],
    [esc(INV['kyb'][3]), 'Identificación efectiva de quien controla en última instancia.'],
    [esc(INV['kyb'][4]), 'Complejidad, opacidad o interposición de capas societarias.'],
    [esc(INV['kyb'][5]), 'Consistencia entre actividad declarada, facturación y volumen operado.'],
    [esc(INV['kyb'][6]), 'Antecedentes propios o del grupo en materia de prevención.'],
], ['32%', '68%']))

A(h2('Estados de cuenta'))
A(tabla(['Estado', 'Significado'],
        [[esc(e['label']), esc(e.get('desc', ''))] for e in INV['estadosCuenta']], ['30%', '70%']))
A(p('Todo cambio de estado registra fecha, hora, responsable y motivo, y queda visible en la línea '
    'de tiempo del legajo.'))

# ── 5 ──────────────────────────────────────────────────────────────────────
A(h1('Análisis transaccional'))
A(p('El monitoreo transaccional se organiza por <b>períodos</b>: un conjunto de operaciones de un '
    'cliente en un lapso determinado. Cada período se analiza, produce señales y se cierra con una '
    'conclusión asentada.'))

A(h2('Carga de un período'))
A(pasos([
    'Seleccionar el cliente en el panel izquierdo de <span class="mono">Análisis AML</span>.',
    'Pulsar <b>+ Nuevo</b> y cargar el archivo de operaciones (CSV, XLS o XLSX).',
    'El sistema detecta las columnas automáticamente y calcula las métricas.',
    'Revisar las señales detectadas en la pestaña correspondiente.',
    'Resolver cada señal con fundamento, o elevarla como caso.',
    'Asentar el estado de cierre del período.',
]))
A(nota('warn',
       'Las fechas que Excel almacena como número de serie se convierten automáticamente. Si al '
       'revisar las operaciones las fechas resultan incorrectas, no continuar el análisis: los '
       'agrupamientos diarios —de los que dependen varios patrones— quedarían mal calculados.'))

A(h2('Métricas calculadas'))
A(p('Sobre cada período se computan volúmenes de entrada y salida, balance neto, cantidad y ticket '
    'promedio de operaciones, contrapartes únicas por lado, concentración por contraparte principal, '
    'índice de concentración Herfindahl-Hirschman, relación entrada/salida, proporción de montos '
    'redondos y repetidos, contrapartes de operación única, circularidad, días activos, velocidad '
    'operativa, proporción de operaciones en horario atípico, agrupamientos de fraccionamiento y '
    'acumulaciones bajo umbral.'))

A(h2('Patrones de detección'))
A(p('El sistema evalúa quince patrones. Los doce primeros contrastan el período contra umbrales '
    'fijos; los tres últimos lo contrastan contra el <b>comportamiento histórico del propio '
    'cliente</b>, que es lo que permite detectar una anomalía en una cuenta cuyo volumen absoluto '
    'nunca sería llamativo.'))
A(tabla(['Código', 'Patrón', 'Tipología', 'Descripción'],
        [[k, esc(INV['pat'][k].get('titulo', '')), INV['pat'][k]['tip'], esc(INV['pat'][k]['desc'])]
         for k in sorted(INV['pat'], key=lambda x: int(x.split('-')[1]))],
        ['9%', '25%', '9%', '57%']))
A(nota('info',
       '<b>PAT-13, PAT-14 y PAT-15 requieren al menos dos períodos previos analizados.</b> Sin línea '
       'base no se activan: con un solo antecedente cualquier variación parecería una anomalía. La '
       'línea base usa la mediana y no el promedio, de modo que un único período atípico anterior no '
       'desplace la referencia.'))

A(h2('Resolución de señales'))
A(p('Cada señal se resuelve con una explicación escrita que queda asentada con su autor y fecha, o '
    'se eleva como caso. Una señal sin resolver permanece activa e impacta en los indicadores del '
    'cliente y de la cartera.'))
A(uso(['Fundamentar la resolución con el hecho concreto que la explica: contrato marco, '
       'estacionalidad acreditada, operación documentada.',
       'Elevar a caso cuando la explicación requiera pedir información al cliente.',
       'Dejar la señal activa mientras la investigación esté en curso.'],
      ['Resolver con fórmulas genéricas del tipo "operatoria habitual" sin respaldo.',
       'Resolver en bloque para limpiar el tablero.',
       'Cerrar el período con señales de severidad ALTA sin resolver ni elevar.']))

A(h2('Análisis de tendencias'))
A(p('Con dos o más períodos, la vista de tendencias compara la evolución de volumen, cantidad de '
    'operaciones, score de riesgo y señales, y analiza la rotación de contrapartes entre períodos: '
    'cuáles son nuevas, cuáles se perdieron y cuáles se mantienen.'))

A(h2('Requerimientos de información (RFI)'))
A(p('Desde el período se emiten RFI al cliente, con hilo de intercambios, seguimiento de estado y '
    'control de plazo de respuesta. Los RFI vencidos aparecen en el Centro de Alertas.'))

# ── 6 ──────────────────────────────────────────────────────────────────────
A(h1('Centro de alertas'))
A(p('Bandeja unificada de lo que requiere atención, en tres pestañas.'))
A(tabla(['Pestaña', 'Contenido', 'Acción esperada'], [
    ['<b>Señales</b>', 'Señales activas de toda la cartera, con severidad, patrón, cliente y período.',
     'Abrir el detalle, evaluar la acción sugerida y resolver o abrir caso.'],
    ['<b>RFIs vencidos</b>', 'Requerimientos sin respuesta pasados los plazos, y los próximos a vencer.',
     'Reiterar al cliente o escalar.'],
    ['<b>Sin analizar</b>', 'Clientes activos sin períodos cargados, con antigüedad superior al límite '
     'de su segmento.', 'Cargar el período pendiente.'],
], ['17%', '45%', '38%']))
A(p('El detalle de cada señal muestra la comparación completa y la <b>acción sugerida</b> asociada al '
    'patrón. Si la señal ya generó un caso, la fila lo indica y permite saltar a él; si no, se puede '
    'abrir uno desde allí.'))

# ── 7 ──────────────────────────────────────────────────────────────────────
A(h1('Gestión de casos'))
A(p('El caso es la unidad de trabajo de compliance: convierte una alerta en un expediente con '
    'responsable, plazos corriendo y trazabilidad de cada decisión.'))

A(h2('Origen de un caso'))
A(tabla(['Origen', 'Se genera cuando'],
        [[esc(l), d] for (i, l), d in zip(INV['origenes'], [
            'Una señal transaccional se eleva en lugar de resolverse.',
            'El screening detecta una coincidencia contra listas restrictivas.',
            'Un requerimiento de información supera su plazo.',
            'Un analista lo abre por un hecho no cubierto por los anteriores.',
            'Una obligación del calendario regulatorio queda incumplida.'])], ['24%', '76%']))

A(h2('Ciclo de vida'))
A(tabla(['Estado', 'Situación', 'Condición'],
        [[esc(e['label']), esc(e.get('desc', '')),
          'Abierto' if e['abierto'] else 'Cerrado'] for e in INV['estadosCaso']],
        ['22%', '54%', '24%']))
A(nota('crit',
       '<b>Elevar un caso a comité sella la fecha de calificación</b> y con ella arranca el plazo de '
       'reporte. Es una acción con consecuencia regulatoria: no se usa como paso administrativo para '
       'derivar un caso a otro analista. Las fechas selladas no se sobrescriben.'))

A(h2('Plazos'))
A(p('Cada caso muestra los plazos que le corren según su estado, con el más urgente destacado. La '
    'antelación del aviso escala con la duración del plazo, de modo que un plazo breve no nazca ya '
    'en estado de advertencia.'))
A(tabla(['Plazo', 'Valor', 'Corre desde'],
        [[esc(k.replace('_', ' ').title()), '%s días' % v, esc(c)] for k, v, c in INV['sla']],
        ['32%', '14%', '54%']))

A(h2('Operación de la bandeja'))
A(p('La bandeja admite vista de lista y vista kanban con arrastre entre columnas. Ambas ejecutan la '
    'misma lógica de transición, de modo que el sellado de fechas no puede evitarse por la vía de '
    'usar una u otra.'))
A(p('Cada caso admite asignación de analista, comentarios de trabajo e historial de estados. El '
    'historial registra transiciones —es evidencia—; los comentarios registran el trabajo del '
    'analista. Se mantienen separados a propósito.'))
A(uso(['Asignar responsable apenas se abre el caso.',
       'Registrar en comentarios cada gestión: a quién se consultó, qué se pidió, qué se obtuvo.',
       'Escribir la nota del cambio al mover un caso de estado.'],
      ['Dejar casos sin asignar: la responsabilidad queda sin trazar.',
       'Cerrar un caso sin fundamento en el historial.',
       'Usar el comentario para lo que corresponde al historial de estado.']))

# ── 8 ──────────────────────────────────────────────────────────────────────
A(h1('Calendario de vencimientos'))
A(p('Consolida tres familias de obligaciones con plazo.'))

A(h2('Actualización periódica del legajo'))
A(tabla(['Segmento', 'Frecuencia'],
        [[s, '%s meses' % v] for s, v in INV['actualizacion']], ['40%', '60%']))
A(p('La fecha de referencia es la más reciente entre el último período analizado, el último cambio '
    'de estado de cuenta y el alta del legajo.'))

A(h2('Vigencia documental'))
A(p('Los documentos con vigencia limitada vencen según el detalle de la sección 4.3. El resto '
    '—estatuto, inscripción registral, declaración de beneficiario final— se considera de vigencia '
    'permanente salvo cambio societario.'))

A(h2('Obligaciones institucionales'))
A(tabla(['Obligación', 'Periodicidad', 'Estado del parámetro'],
        [[esc(o['label']),
          'Anual' if o['periodicidad'] == 'ANUAL' else 'Mensual',
          '<b>Validado</b>' if o['validado'] else
          '<span style="color:#b8860b"><b>Pendiente de validación</b></span>']
         for o in INV['institucionales']], ['48%', '18%', '34%']))
A(nota('warn',
       'Las obligaciones marcadas como pendientes tienen fecha provisoria. <b>No computan en ningún '
       'indicador ni generan casos</b> hasta ser confirmadas contra la normativa vigente. Se muestran '
       'atenuadas y con etiqueta expresa para que no se confundan con un vencimiento verificado.'))

A(h2('Generación de casos por incumplimiento'))
A(p('Los vencimientos ya incumplidos pueden convertirse en casos. El sistema propone la lista y el '
    'usuario selecciona cuáles materializar: no se crean registros de forma automática, porque un '
    'caso abierto es un asiento con valor regulatorio.'))

# ── 9 ──────────────────────────────────────────────────────────────────────
A(h1('Screening contra listas restrictivas'))
A(h2('Método'))
A(p('El cotejo es <b>determinístico y local</b>. No se consulta ningún servicio externo durante una '
    'corrida: se compara contra los listados cargados, cuya versión queda registrada junto con el '
    'resultado. Esto hace que cualquier coincidencia sea reproducible por un tercero con el mismo '
    'listado.'))
A(tabla(['Criterio', 'Cuándo aplica', 'Puntaje'], [
    ['<b>Documento</b>', 'CUIT, CUIL o DNI coincidente, con independencia de cómo esté escrito el nombre.', '100%'],
    ['<b>Nombre exacto</b>', 'Coincidencia literal tras normalizar mayúsculas, tildes y puntuación.', '100%'],
    ['<b>Sin sufijo societario</b>', 'Coincidencia ignorando S.A., S.R.L., S.A.S. y equivalentes.', '98%'],
    ['<b>Aproximado</b>', 'Tolera orden invertido, plurales y errores de tipeo, con penalización '
     'cuando un nombre solo está contenido en otro.', 'variable'],
], ['22%', '58%', '20%']))
A(tabla(['Nivel', 'Umbral', 'Tratamiento'],
        [['<b>ALTA</b>', '≥ %d%%' % round(float(dict(INV['umbrales'])['ALTA']) * 100),
          'Coincidencia a tratar. Genera caso automáticamente en la corrida programada.'],
         ['<b>MEDIA</b>', '≥ %d%%' % round(float(dict(INV['umbrales'])['MEDIA']) * 100),
          'Requiere revisión y decisión del analista.'],
         ['<b>BAJA</b>', '≥ %d%%' % round(float(dict(INV['umbrales'])['BAJA']) * 100),
          'Se informa a título de completitud.']], ['16%', '16%', '68%']))

A(h2('Sujetos evaluados'))
A(p('Por cada legajo se cotejan la razón social con su CUIT, el representante legal, el presidente o '
    'gerente, el beneficiario final y las personas vinculadas declaradas.'))

A(h2('Carga de listados'))
A(p('Se admiten archivos CSV, XLSX y JSON, con detección automática del separador. Tras seleccionar '
    'el archivo, el sistema muestra las columnas detectadas, propone el mapeo de nombre, documento y '
    'detalle, y exhibe una vista previa de las entradas resultantes. La carga se confirma recién '
    'después de esa revisión.'))
A(nota('info',
       'Se registra la <b>fuente y versión</b> de cada listado, y ese dato acompaña cada corrida y '
       'aparece en la exportación del legajo. Es lo que permite acreditar contra qué se cotejó y en '
       'qué fecha.'))
A(p('Listados de referencia sugeridos para la verificación manual complementaria:'))
A(tabla(['Listado', 'Jurisdicción'], [[esc(n), esc(j)] for n, j in INV['screening']], ['62%', '38%']))

A(h2('Descarte de coincidencias'))
A(p('Una coincidencia puede descartarse como falso positivo con motivo obligatorio. El descarte '
    'queda asentado con autor y fecha, la coincidencia no reaparece en corridas posteriores, y la '
    'decisión es reversible desde la pestaña de descartes.'))
A(uso(['Fundamentar el descarte con el dato que lo sustenta: documento distinto, fecha de nacimiento '
       'que no coincide, jurisdicción incompatible.',
       'Revisar la pestaña de descartes periódicamente.'],
      ['Descartar con "no corresponde" o equivalente sin explicación.',
       'Descartar coincidencias de nivel ALTA sin verificación documental.']))

A(h2('Corrida automática'))
A(p('El sistema ejecuta una corrida semanal sobre la cartera activa. Solo las coincidencias '
    '<b>nuevas</b> respecto de la corrida anterior y de nivel ALTA abren caso automáticamente.'))
A(nota('info',
       'La primera corrida tras cargar un listado no genera casos de forma automática, por diseño: '
       'con un listado nuevo la totalidad de las coincidencias es "nueva". Esa primera revisión se '
       'hace manualmente.'))

# ── 10 ─────────────────────────────────────────────────────────────────────
A(h1('Red de contrapartes'))
A(p('Cada legajo se analiza por separado; una contraparte que opera con varios clientes de la '
    'cartera no resulta visible en ese análisis individual. Esta sección cruza toda la cartera y '
    'expone esas coincidencias.'))
A(p('Se representan en grafo las contrapartes presentes en %s o más legajos, y se listan desde %s. '
    'La disposición es determinística: los mismos datos producen siempre el mismo grafo, de modo que '
    'una captura sirve como evidencia reproducible.'
    % (dict(INV['grafo'])['MIN_LEGAJOS_ALERTA'], dict(INV['grafo'])['MIN_LEGAJOS_MOSTRAR'])))
A(nota('warn',
       '<b>Una contraparte compartida no constituye por sí sola una irregularidad.</b> Puede tratarse '
       'de un proveedor de servicios común, una entidad financiera o una empresa relevante del rubro. '
       'Lo que amerita análisis es la combinación con vinculación societaria, concentración de flujo '
       'o coincidencia temporal.'))
A(p('La normalización agrupa variantes de escritura pero <b>no</b> unifica formas societarias '
    'distintas: "PUENTE S.A." y "PUENTE S.R.L." se tratan como personas jurídicas diferentes, porque '
    'fusionarlas construiría un vínculo inexistente.'))

# ── 11 ─────────────────────────────────────────────────────────────────────
A(h1('Informe de gestión al Comité'))
A(h2('Contenido'))
A(p('Con período seleccionable (mes, trimestre o año), el informe consolida movimiento de casos, '
    'resultado de los cierres, tiempos de resolución, cumplimiento de plazos, desempeño por analista, '
    'patrones recurrentes con su tipología, evolución de cartera y actividad de screening.'))
A(p('Incluye una sección de <b>puntos sometidos a consideración</b> derivada de las propias cifras: '
    'plazos vencidos, cierres fuera de término, casos sin asignar, crecimiento de la cartera '
    'pendiente y ausencia de corridas de screening.'))
A(nota('info',
       'Se informa la <b>mediana</b> además del promedio de resolución. Un único caso extenso desplaza '
       'el promedio y transmite una impresión equivocada del ritmo habitual de trabajo.'))
A(p('El campo de observaciones del Oficial de Cumplimiento se incorpora al informe como sección '
    'propia. Las cifras las calcula el sistema; su interpretación corresponde a quien firma.'))

A(h2('Calibración de plazos'))
A(p('El panel de calibración permite evaluar el impacto operativo de cada plazo sobre los casos '
    'reales, sin modificar la configuración vigente. Distingue los parámetros que decide GOAT S.A. de '
    'los que derivan de normativa, señala los que ningún caso llega a ejercitar y muestra, para cada '
    'valor candidato, cuántos casos quedarían vencidos, próximos y en regla.'))
A(p('Complementa la antigüedad mediana de los casos abiertos, dato que permite distinguir un umbral '
    'mal calibrado de un problema de capacidad de análisis: si la permanencia mediana supera '
    'holgadamente el plazo, reducirlo no mejora el cumplimiento.'))

# ── 12 ─────────────────────────────────────────────────────────────────────
A(h1('Secciones de referencia'))
A(p('Tres secciones no operativas, de consulta permanente.'))
A(tabla(['Sección', 'Contenido', 'Uso'], [
    ['<b>Normativa</b>', 'Marco normativo aplicable y enlaces a los registros y listados oficiales '
     'de consulta.', 'Verificación manual complementaria al screening automatizado.'],
    ['<b>Patrones AML</b>', 'Ficha de cada uno de los quince patrones: qué detecta, con qué umbral, '
     'tipología asociada y ejemplo práctico.',
     'Consulta al fundamentar la resolución de una señal.'],
    ['<b>Wiki</b>', 'Guía de operación integrada: circuitos, checklists de procedimiento y '
     'diagramas de flujo por proceso.', 'Inducción de personal nuevo y consulta de procedimiento.'],
], ['18%', '48%', '34%']))
A(nota('info',
       'La sección <b>Patrones AML</b> es la referencia a citar al fundamentar una resolución: '
       'contiene el umbral exacto que disparó cada señal y la tipología con la que se corresponde.'))

A(h1('Informes que emite el sistema'))
A(tabla(['Informe', 'Contenido', 'Emite'], [
    ['<b>INF-01 — KYB</b>', 'Debida diligencia de onboarding: identificación, checklist, scoring, '
     'screening y dictamen.', 'Analista'],
    ['<b>INF-02 — Monitoreo</b>', 'Análisis transaccional de un período: métricas, señales, '
     'scoring y conclusión.', 'Analista'],
    ['<b>INF-07 — Cierre</b>', 'Cierre de un requerimiento o de una situación observada.',
     'Supervisor u OC'],
    ['<b>ROS</b>', 'Borrador de reporte con la tipología asociada al patrón detectado.',
     'Supervisor u OC'],
    ['<b>Nota de debida diligencia</b>', 'Comunicación formal al cliente.', 'Analista'],
    ['<b>Legajo completo</b>', 'Expediente consolidado de once secciones con trazabilidad íntegra.',
     'Analista'],
    ['<b>Informe de gestión</b>', 'Métricas de operación del período para el comité.', 'OC'],
], ['24%', '58%', '18%']))
A(h2('Exportación de legajo completo'))
A(p('Consolida en un único documento la identificación del sujeto, el checklist con fechas y '
    'archivos adjuntos, la evaluación de riesgo, el screening con la versión de cada listado y los '
    'umbrales aplicados, los períodos con sus métricas y señales —indicando quién resolvió cada una, '
    'cuándo y con qué fundamento—, los casos con su trazabilidad completa, los RFI, los vencimientos, '
    'el historial de estados, la documentación archivada y la constancia de emisión.'))
A(nota('ok',
       'Es el documento previsto para atender un requerimiento de información sobre un cliente '
       'determinado. Su valor reside en que no afirma "screening realizado" sino "cotejado contra el '
       'listado tal, versión tal, en tal fecha, con tal umbral y tal resultado".'))

# ── 13 ─────────────────────────────────────────────────────────────────────
A(h1('Parámetros configurables'))
A(p('La totalidad de los umbrales del sistema está centralizada. Se distinguen los que constituyen '
    'política interna de GOAT S.A. —que la empresa define— de los que derivan de normativa.'))

A(h2('Plazos de gestión de casos'))
A(tabla(['Parámetro', 'Valor', 'Naturaleza'], [
    ['Tomar el caso', '%s días' % dict((k, v) for k, v, _ in INV['sla'])['INICIO_ANALISIS'], 'Política interna'],
    ['Elevar a comité', '%s días' % dict((k, v) for k, v, _ in INV['sla'])['ESCALAMIENTO_COMITE'], 'Política interna'],
    ['Respuesta a RFI', '%s días' % dict((k, v) for k, v, _ in INV['sla'])['RFI_RESPUESTA'], 'Política interna'],
    ['Plazo de reporte desde la calificación',
     '%s días' % dict((k, v) for k, v, _ in INV['sla'])['ROS_CALIFICACION'],
     '<span style="color:#b8860b"><b>Normativa — pendiente de validación</b></span>'],
    ['Tope desde la operación', '%s días' % dict((k, v) for k, v, _ in INV['sla'])['ROS_MAX_OPERACION'],
     '<span style="color:#b8860b"><b>Normativa — pendiente de validación</b></span>'],
    ['Reporte por financiamiento del terrorismo',
     '%s horas' % dict((k, v) for k, v, _ in INV['sla'])['ROS_FT_HORAS'],
     '<span style="color:#b8860b"><b>Normativa — pendiente de validación</b></span>'],
], ['46%', '16%', '38%']))

A(h2('Umbrales de comportamiento'))
A(tabla(['Parámetro', 'Valor', 'Efecto'],
        [[esc(k.replace('_', ' ').title()), v, esc(c)] for k, v, c in INV['comportamiento']],
        ['30%', '12%', '58%']))

A(h2('Coherencia del conjunto'))
A(p('El sistema verifica automáticamente que los plazos encadenen: tomar el caso antes de elevarlo, '
    'elevar antes de que venza el plazo de reporte, y que el plazo desde la calificación quede '
    'comprendido en el tope desde la operación. También que a mayor riesgo corresponda mayor '
    'frecuencia de actualización. Un cambio que rompa alguna de estas relaciones impide la puesta en '
    'producción.'))
A(nota('info',
       'Estas verificaciones no validan que los valores sean los normativamente correctos —eso exige '
       'la resolución aplicable— sino que el conjunto sea internamente consistente, lo cual es '
       'comprobable con independencia de ella.'))

# ── 14 ─────────────────────────────────────────────────────────────────────
A(h1('Uso correcto por perfil'))
A(h2('Analista de Compliance'))
A(h3('Rutina diaria'))
A(pasos([
    'Revisar el <b>Tablero</b>: casos con plazo crítico, vencimientos próximos y estado del screening.',
    'Atender el <b>Centro de Alertas</b>, comenzando por las señales de severidad ALTA.',
    'Trabajar los <b>casos asignados</b>, priorizando los de plazo más próximo.',
    'Registrar cada gestión en los comentarios del caso.',
]))
A(h3('Rutina periódica'))
A(pasos([
    'Cargar los períodos transaccionales según la frecuencia del segmento del cliente.',
    'Resolver o elevar las señales de cada período cargado.',
    'Actualizar los legajos que el calendario señale como vencidos.',
    'Emitir el INF-02 de los períodos cerrados.',
]))
A(uso(['Fundamentar por escrito cada resolución y cada descarte.',
       'Revisar lo que extrae la inteligencia artificial antes de guardarlo.',
       'Cargar la fecha de cada documento al adjuntarlo.',
       'Elevar a caso ante la duda, en lugar de resolver.'],
      ['Resolver señales en bloque para despejar el tablero.',
       'Cerrar un período con señales ALTA sin resolver ni elevar.',
       'Dejar casos sin asignar.',
       'Tomar los campos vacíos de una extracción como información verificada.']))

A(h2('Oficial de Cumplimiento'))
A(h3('Responsabilidades exclusivas'))
A(lista([
    'Cerrar casos, con o sin reporte, y fundamentar la decisión.',
    'Emitir el INF-07 y los borradores de reporte.',
    'Validar los parámetros normativos y mantenerlos actualizados.',
    'Emitir el informe de gestión al comité.',
    'Consultar el registro de auditoría.',
]))
A(h3('Rutina mensual sugerida'))
A(pasos([
    'Ejecutar el screening sobre la cartera activa y revisar las coincidencias nuevas.',
    'Revisar el calendario de vencimientos y generar los casos que correspondan.',
    'Analizar en el panel de calibración si los plazos vigentes resultan alcanzables.',
    'Emitir el informe de gestión y asentar sus observaciones.',
    'Revisar los descartes de screening del período.',
]))
A(uso(['Revisar el fundamento del analista antes de cerrar un caso.',
       'Mantener las observaciones del informe como registro de criterio.',
       'Documentar en el manual PLAFT todo cambio de umbral.'],
      ['Cerrar casos en bloque al final del período.',
       'Modificar un umbral sin asentar el motivo.',
       'Presentar el informe sin observaciones cuando hubo decisiones relevantes.']))

# ── 15 ─────────────────────────────────────────────────────────────────────
A(h1('Limitaciones declaradas'))
A(p('Se enuncian expresamente los límites del sistema. Conocerlos es condición para usarlo '
    'correctamente y para no atribuirle un alcance que no tiene.'))
A(tabla(['Limitación', 'Implicancia operativa'], [
    ['<b>Los listados de screening no se actualizan solos.</b>',
     'La vigencia del cotejo depende de que se carguen los listados actualizados. La versión '
     'utilizada queda registrada en cada corrida.'],
    ['<b>El cotejo alcanza a los listados cargados.</b>',
     'Una persona incluida en una lista no cargada no será detectada. Los enlaces de verificación '
     'manual complementan, no sustituyen.'],
    ['<b>El matching admite falsos positivos y negativos.</b>',
     'Los umbrales están calibrados hacia la sensibilidad. Un error de tipeo que altere '
     'simultáneamente el principio y el final de todos los términos de un nombre puede no detectarse.'],
    ['<b>La extracción por IA es un borrador.</b>',
     'Requiere revisión humana. Los documentos escaneados se leen hasta diez páginas y el sistema '
     'informa cuando la lectura fue parcial.'],
    ['<b>El análisis depende de la calidad del archivo cargado.</b>',
     'Operaciones ausentes o mal clasificadas en el origen no son detectables por el sistema.'],
    ['<b>Los patrones de comportamiento exigen historial.</b>',
     'PAT-13 a PAT-15 no se activan sin al menos dos períodos previos analizados.'],
    ['<b>Determinados parámetros están pendientes de validación normativa.</b>',
     'Se identifican en la sección 13. No computan en indicadores ni generan casos hasta su '
     'confirmación.'],
    ['<b>El sistema no emite reportes ante la autoridad.</b>',
     'Genera borradores. La presentación se realiza por los canales oficiales que correspondan.'],
], ['34%', '66%']))

# ── 16 ─────────────────────────────────────────────────────────────────────
A(h1('Control del documento'))
A(tabla(['Campo', 'Detalle'], [
    ['Documento', 'Manual de Operación — Rebit AML &amp; KYB Tool'],
    ['Versión del documento', VERSION_DOC],
    ['Versión del sistema documentada', esc(INV['version'])],
    ['Fecha de emisión', HOY],
    ['Elaborado por', 'Departamento de Compliance — GOAT S.A.'],
    ['Aprobado por', 'Oficial de Cumplimiento'],
    ['Clasificación', 'Confidencial — uso interno y ante requerimiento de autoridad competente'],
    ['Revisión', 'Anual, o ante cambio sustantivo del sistema o de la normativa aplicable'],
], ['32%', '68%']))
A(p('El sistema documentado cuenta con %s verificaciones automatizadas sobre su lógica de detección, '
    'cálculo de plazos, coherencia de parámetros y consistencia de permisos, que se ejecutan antes de '
    'cada puesta en producción.'
    % (INV['tests'] if INV['tests'] else 'un conjunto de')))
A(nota('info',
       'Los catálogos de este manual —patrones, checklist, factores de riesgo, estados, plazos y '
       'umbrales— se generan directamente desde el código del sistema. No pueden divergir de lo que '
       'la plataforma efectivamente ejecuta.'))
A('<table style="margin-top:34px"><tr>'
  '<td style="padding:30px 18px;border:1px solid #ccd5e2;text-align:center;width:50%">'
  '____________________________<br/><b>Oficial de Cumplimiento</b><br/>'
  '<span style="font-size:7.6pt;color:#8a97a8">Firma y aclaración</span></td>'
  '<td style="padding:30px 18px;border:1px solid #ccd5e2;text-align:center;width:50%">'
  '____________________________<br/><b>Comité de Compliance</b><br/>'
  '<span style="font-size:7.6pt;color:#8a97a8">Firma y aclaración</span></td>'
  '</tr></table>')

CUERPO = '\n'.join(B)

# ═══════════════════════════════════════════════════════════════════════════
# PORTADA, ÍNDICE Y RENDER
# ═══════════════════════════════════════════════════════════════════════════
PORTADA = """
<div class="portada">
  <div class="marca"><div class="n">GOAT S.A.</div><div class="s">Rebit &middot; Compliance &amp; PLAFT</div></div>
  <div class="titulo">Manual de Operación</div>
  <div class="subtitulo">Rebit AML &amp; KYB Tool &mdash; Sistema de prevención de lavado de activos<br/>y financiamiento del terrorismo</div>
  <table class="meta">
    <tr><td>Versión del documento</td><td><b>%s</b></td></tr>
    <tr><td>Versión del sistema</td><td><b>%s</b></td></tr>
    <tr><td>Fecha de emisión</td><td><b>%s</b></td></tr>
    <tr><td>Entidad</td><td><b>GOAT S.A. &mdash; marca comercial Rebit</b></td></tr>
    <tr><td>Registro</td><td><b>PSPCP &mdash; Registro BCRA N&deg; 33.706</b></td></tr>
    <tr><td>Clasificación</td><td><b>Confidencial</b></td></tr>
  </table>
</div>
""" % (VERSION_DOC, INV['version'], HOY)

TOC = ['<div id="toc"><h1 style="page-break-before:avoid">Contenido</h1><div class="toc">']
for niv, num, tit, _id in _indice:
    TOC.append('<div class="toc%d"><a href="#%s">%s%s</a></div>'
               % (niv, _id, (num + '. ') if niv == 1 else (num + ' '), esc(tit)))
TOC.append('</div></div>')

HTML = ('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
        '<title>Manual de Operación — Rebit AML &amp; KYB Tool</title>'
        '<style>%s</style></head><body>%s%s%s</body></html>'
        % (CSS, PORTADA, ''.join(TOC), CUERPO))

os.makedirs('/mnt/user-data/outputs', exist_ok=True)
salida = '/mnt/user-data/outputs/Manual_Operacion_Rebit_AML.pdf'

from weasyprint import HTML as WHTML
WHTML(string=HTML, base_url=RAIZ).write_pdf(salida)

with open('/mnt/user-data/outputs/Manual_Operacion_Rebit_AML.html', 'w', encoding='utf-8') as f:
    f.write(HTML)

print('Manual generado:', salida)
print('Secciones:', len([x for x in _indice if x[0] == 1]),
      '| Subsecciones:', len([x for x in _indice if x[0] == 2]))
print('Patrones documentados:', len(INV['pat']),
      '| Checklist:', len(INV['checklist']),
      '| Tests del sistema:', INV['tests'])
