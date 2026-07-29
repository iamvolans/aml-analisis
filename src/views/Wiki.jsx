import { useState } from "react";
import { Badge } from "../components/ui";
import { r2, r3 } from "../lib/reports";
import { C, T } from "../lib/theme";

function WikiBadge({type, children}) {
  var map = {
    red:['rgba(255,68,85,0.1)',T.RED],orange:['rgba(255,140,0,0.1)',T.AMBER],yellow:['rgba(255,184,48,0.1)',T.AMBER],
    green:['rgba(0,230,118,0.1)',T.GREEN],blue:['rgba(0,212,255,0.1)',T.CYAN],gray:[T.BG3,T.TEXT2],purple:['rgba(139,103,192,0.1)','#B39DDB']
  };
  var c = map[type] || map.blue;
  return <span style={{background:c[0],color:c[1],borderRadius:12,padding:'2px 10px',fontSize:11,fontWeight:700,marginRight:4,whiteSpace:'nowrap',display:'inline-block'}}>{children}</span>;
}

function WikiTip({label, text}) {
  var [show, setShow] = useState(false);
  return (
    <span style={{position:'relative',display:'inline-block',cursor:'help'}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      <span style={{borderBottom:'1px dashed #3B6DAA',color:'#2C4A7C',fontWeight:600}}>{label}</span>
      {show && <div style={{position:'absolute',background:'#1B2A4A',color:'white',fontSize:11,padding:'6px 10px',borderRadius:6,whiteSpace:'nowrap',zIndex:9999,boxShadow:'0 4px 12px rgba(0,0,0,0.2)',bottom:'calc(100% + 7px)',left:'50%',transform:'translateX(-50%)'}}>{text}</div>}
    </span>
  );
}

function WikiStepList({steps}) {
  var [done, setDone] = useState([]);
  function toggle(i){ setDone(function(p){ return p.indexOf(i)>=0 ? p.filter(x=>x!==i) : [...p,i]; }); }
  return (
    <div style={{marginBottom:16}}>
      {steps.map(function(step,i){
        var ok = done.indexOf(i)>=0;
        return (
          <div key={i} style={{display:'flex',gap:12,marginBottom:8,alignItems:'flex-start'}}>
            <div onClick={()=>toggle(i)} style={{width:28,height:28,borderRadius:'50%',flexShrink:0,marginTop:2,background:ok?T.GREEN:T.BORDER3,color:ok?'#08130D':T.TEXT,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,cursor:'pointer',transition:'background 0.2s'}}>
              {ok ? '✓' : i+1}
            </div>
            <div style={{flex:1,background:ok?'rgba(0,230,118,0.08)':T.BG2,border:'1px solid '+(ok?'rgba(0,230,118,0.25)':T.BORDER),borderRadius:8,padding:'9px 13px',transition:'all 0.2s'}}>
              <div style={{fontSize:13,fontWeight:600,color:ok?T.GREEN:T.TEXT,marginBottom:2,textDecoration:ok?'line-through':'none'}}>{step[0]}</div>
              <div style={{fontSize:12.5,color:T.TEXT2,lineHeight:1.6}}>{step[1]}</div>
            </div>
          </div>
        );
      })}
      <div style={{fontSize:11,color:T.TEXT3,marginTop:2}}>💡 Clic en los números para marcar pasos completados</div>
    </div>
  );
}

function WikiBox({type, children}) {
  var cfg = {tip:['rgba(0,230,118,0.08)','rgba(0,230,118,0.25)',T.GREEN,'✓ '],warn:['rgba(255,184,48,0.08)','rgba(255,184,48,0.25)',T.AMBER,'⚠ '],danger:['rgba(255,68,85,0.08)','rgba(255,68,85,0.25)',T.RED,'⚠ '],info:['rgba(0,212,255,0.08)','rgba(0,212,255,0.25)',T.CYAN,'ℹ ']};
  var c = cfg[type]||cfg.info;
  return <div style={{background:c[0],border:'1px solid '+c[1],borderLeft:'4px solid '+c[1],borderRadius:6,padding:'10px 14px',marginBottom:14,fontSize:12.5,color:c[2],lineHeight:1.6}}><strong>{c[3]}</strong>{children}</div>;
}

function WikiTbl({headers, rows}) {
  return (
    <div style={{overflowX:'auto',marginBottom:16}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
        <thead><tr>{headers.map((h,i)=><th key={i} style={{background:T.BG3,color:T.TEXT3,padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS,borderBottom:'1px solid '+T.BORDER2}}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row,ri)=>(
            <tr key={ri} style={{background:ri%2===0?T.BG3:T.BG2}}>
              {row.map((cell,ci)=><td key={ci} style={{padding:'8px 12px',color:T.TEXT,borderBottom:'1px solid '+T.BORDER,verticalAlign:'top',lineHeight:1.6}}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WikiFlow({title, nodes, vertical}) {
  return (
    <div style={{marginBottom:20}}>
      {title && <div style={{fontSize:11,fontWeight:700,color:T.CYAN,letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:8}}>{title}</div>}
      <div style={{display:'flex',flexDirection:vertical?'column':'row',alignItems:'center',gap:0,background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:10,padding:'14px 12px',flexWrap:vertical?'nowrap':'wrap'}}>
        {nodes.map((node,i)=>(
          <div key={i} style={{display:'flex',flexDirection:vertical?'column':'row',alignItems:'center',flex:vertical?'none':'1',gap:0}}>
            <div style={{background:node.color||T.ACCENT,color:'#FFFFFF',borderRadius:8,padding:vertical?'10px 20px':'9px 12px',textAlign:'center',minWidth:vertical?200:80,boxShadow:'0 2px 6px rgba(27,42,74,0.12)',margin:vertical?'0':'0 2px'}}>
              <div style={{fontSize:12,fontWeight:700,lineHeight:1.4}}>{node.label}</div>
              {node.sub && <div style={{fontSize:10,opacity:0.8,marginTop:2,lineHeight:1.4}}>{node.sub}</div>}
            </div>
            {i < nodes.length-1 && <div style={{color:T.TEXT2,fontSize:14,fontWeight:400,padding:vertical?'2px 0':'0 3px',flexShrink:0,lineHeight:1}}>{vertical?'↓':'→'}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function WikiView() {
  var [search, setSearch] = useState('');
  var [active, setActive] = useState('inicio');

  var SECTIONS = [
    {id:'inicio',icon:'🏠',label:'Inicio'},
    {id:'roles',icon:'👤',label:'Roles y accesos'},
    {id:'dashboard',icon:'📊',label:'Dashboard'},
    {id:'legajos',icon:'📁',label:'Legajos KYB'},
    {id:'screening',icon:'🛡',label:'Screening'},
    {id:'aml',icon:'📈',label:'Análisis AML'},
    {id:'patrones',icon:'🔍',label:'Patrones AML'},
    {id:'senales',icon:'🚨',label:'Señales y resolución'},
    {id:'alertas',icon:'🔔',label:'Centro de Alertas'},
    {id:'rfi',icon:'📧',label:'Módulo RFI'},
    {id:'informes',icon:'📄',label:'Informes'},
    {id:'ros',icon:'📋',label:'ROS Borrador'},
    {id:'tendencias',icon:'📉',label:'Tendencias'},
    {id:'flujos',icon:'🔄',label:'Flujos de trabajo'},
    {id:'glosario',icon:'📖',label:'Glosario'},
  ];

  var H1 = {fontSize:22,fontWeight:600,color:T.TEXT,marginBottom:6,marginTop:0};
  var H2 = {fontSize:15,fontWeight:700,color:T.CYAN,marginBottom:10,marginTop:24,paddingBottom:6,borderBottom:'1px solid '+T.BORDER2};
  var PP = {fontSize:13,color:T.TEXT,lineHeight:1.7,marginBottom:10};

  function renderContent() {
    switch(active) {
      case 'inicio': return (
        <div>
          <div style={{background:'linear-gradient(135deg,#1B2A4A 0%,#2C4A7C 100%)',borderRadius:12,padding:'24px 28px',marginBottom:20,color:'white'}}>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:6}}>GOAT S.A. / Rebit — Departamento PLAFT</div>
            <h1 style={{fontSize:24,fontWeight:700,margin:'0 0 8px',color:'white'}}>📚 Wiki — Rebit AML & KYB Tool</h1>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.75)',margin:0,lineHeight:1.6}}>Guía completa de operación para todo el equipo de Compliance. Navegá por las secciones del panel izquierdo.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
            {[['📁','Legajos KYB','Onboarding, documentación y ciclo de vida','legajos','rgba(59,109,170,0.12)',T.CYAN],
              ['📈','Análisis AML','Carga de archivos, métricas y señales','aml','rgba(0,230,118,0.1)',T.GREEN],
              ['🔄','Flujos','Timelines completos paso a paso','flujos','rgba(255,184,48,0.1)',T.AMBER],
              ['📧','RFI','Requerimientos y gestión de respuestas','rfi','rgba(139,103,192,0.1)','#B39DDB'],
              ['🛡','Screening','OFAC · ONU · REPET · PEPs','screening','rgba(255,68,85,0.1)',T.RED],
              ['📋','ROS','Reporte de Operación Sospechosa','ros','rgba(59,109,170,0.08)',T.TEXT2]
            ].map(([ic,tit,desc,id,bg,col])=>(
              <div key={id} onClick={()=>setActive(id)} style={{background:bg,border:'1px solid rgba(255,255,255,0.06)',borderRadius:4,padding:'14px',cursor:'pointer',transition:'all 0.15s'}}>
                <div style={{fontSize:20,marginBottom:6}}>{ic}</div>
                <div style={{fontSize:12,fontWeight:600,color:col,marginBottom:3,fontFamily:T.MONO}}>{tit}</div>
                <div style={{fontSize:11,color:T.TEXT3,lineHeight:1.5}}>{desc}</div>
              </div>
            ))}
          </div>
          <WikiBox type="warn">Toda la información de legajos y análisis es estrictamente confidencial. No compartir capturas ni datos de clientes fuera del entorno autorizado.</WikiBox>
        </div>
      );

      case 'roles': return (
        <div>
          <h1 style={H1}>Roles y Permisos</h1>
          <WikiFlow title="Jerarquía de roles" nodes={[
            {label:'Admin',sub:'Acceso total',color:T.RED},
            {label:'Oficial',sub:'Sin usuarios',color:'#7D3C98'},
            {label:'Supervisor',sub:'Sin eliminar',color:'#2C4A7C'},
            {label:'Analista',sub:'Sin aprobar',color:T.GREEN},
            {label:'Solo lectura',sub:'Solo consulta',color:T.TEXT3},
          ]}/>
          <WikiTbl headers={['Rol','Puede hacer','No puede']} rows={[
            [<WikiBadge key="a" type="red">Admin</WikiBadge>,'Todo: crear/desactivar usuarios, eliminar legajos, configuración','—'],
            [<WikiBadge key="b" type="purple">Oficial</WikiBadge>,'INF-01/02/07, aprobar señales, generar ROS, editar todo','Gestionar usuarios'],
            [<WikiBadge key="c" type="blue">Supervisor</WikiBadge>,'Crear/editar legajos, aprobar señales ALTA, generar informes','Eliminar legajos, usuarios'],
            [<WikiBadge key="d" type="green">Analista</WikiBadge>,'Crear/editar, subir períodos, memos, RFIs, proponer cierre','Eliminar, aprobar señales, ROS'],
            [<WikiBadge key="e" type="gray">Solo lectura</WikiBadge>,'Ver todos los datos','Crear, editar o eliminar cualquier dato'],
          ]}/>
          <h2 style={H2}>Iniciar sesión</h2>
          <WikiStepList steps={[
            ['Abrir el navegador','Ingresar a https://rebit-aml-app.vercel.app desde Chrome, Firefox, Safari o Edge.'],
            ['Ingresar credenciales','Email institucional y contraseña personal. Verificación contra Supabase Auth.'],
            ['Cerrar sesión','Botón "Cerrar sesión" en la parte inferior del menú lateral izquierdo.'],
          ]}/>
          <WikiBox type="tip">Si olvidás tu contraseña contactá al Admin del sistema — no hay recuperación automática por email.</WikiBox>
        </div>
      );

      case 'dashboard': return (
        <div>
          <h1 style={H1}>Dashboard</h1>
          <WikiFlow title="Flujo de lectura diaria" nodes={[
            {label:'Alertas proactivas',sub:'Plazos regulatorios',color:T.AMBER},
            {label:'KPIs de cartera',sub:'Señales · RFIs',color:'#2C4A7C'},
            {label:'Semáforo',sub:'Por cliente',color:'#3B6DAA'},
            {label:'Priorizar acción',sub:'Ir al caso crítico',color:T.GREEN},
          ]}/>
          <h2 style={H2}>Pestaña Operacional</h2>
          <WikiTbl headers={['Elemento','Descripción']} rows={[
            ['Alerta proactiva', <span key="ap">Panel naranja cuando supera el plazo sin análisis. <WikiTip label="30/60/90 días" text="ALTO: 30d · MEDIO-ALTO: 60d · MEDIO/BAJO: 90d"/> según segmento.</span>],
            ['Semáforo de cartera','Clientes activos con nivel de riesgo: rojo señales sin resolver, amarillo monitoreo, verde sin alertas'],
            ['Cuentas con señales','Clientes con señales ALTA pendientes ordenados por criticidad'],
            ['Legajos recientes','Últimos 5 legajos con estado y dictamen KYB'],
          ]}/>
          <h2 style={H2}>Pestaña Ejecutivo</h2>
          <WikiTbl headers={['Elemento','Descripción']} rows={[
            ['KPIs regulatorios','Clientes activos · Señales ALTA · RFIs abiertos · RFIs vencidos · Tasa respuesta RFI %'],
            ['Semáforo completo','Todos los clientes activos con score AML, señales activas y cantidad de períodos'],
            ['Evolución mensual','Gráfico IN/OUT agregado de toda la cartera por período'],
            ['Panel RFIs','RFIs próximos a vencer · tasa de respuesta · RFIs vencidos'],
          ]}/>
          <WikiBox type="tip">Revisá el Dashboard al inicio de cada jornada para priorizar las investigaciones del día.</WikiBox>
        </div>
      );

      case 'legajos': return (
        <div>
          <h1 style={H1}>Módulo Legajos KYB</h1>
          <WikiFlow title="Ciclo de vida de un legajo" nodes={[
            {label:'En Onboarding',sub:'Documentación',color:T.TEXT3},
            {label:'Activa',sub:'Operando normal',color:T.GREEN},
            {label:'Monitoreo Ref.',sub:'Con alertas',color:T.AMBER},
            {label:'Suspendida',sub:'Bloqueada',color:T.AMBER},
            {label:'Cerrada',sub:'INF-07',color:T.RED},
          ]}/>
          <h2 style={H2}>Crear un nuevo legajo</h2>
          <WikiStepList steps={[
            ['Clic en "+ Nuevo Legajo"','Botón azul en la esquina superior derecha de la lista.'],
            ['Subir documentos (tab Docs IA)','Arrastrar o clic para subir PDFs: estatuto, poderes, DNIs, AFIP, estados contables. Máx. 25 archivos / 90 MB.'],
            ['Extraer datos con IA','Clic en "Extraer datos con IA". La IA completa todos los campos automáticamente en 30–90 segundos.'],
            ['Revisar y completar (tab Datos)','Verificar campos extraídos. Atención especial a CUIT, montos y beneficiario final.'],
            ['Completar Checklist','Marcar cada documento como OK / Pendiente / Bloqueante.'],
            ['Asignar Scoring KYB','Puntaje 1–5 en 8 factores. El sistema calcula el segmento automáticamente.'],
            ['Ejecutar Screening','Tab Screening → "Ejecutar Screening" contra OFAC, ONU, REPET y PEPs. Obligatorio antes de activar.'],
            ['Guardar','Clic en "Guardar". Sincroniza a Supabase — disponible en todos los dispositivos.'],
          ]}/>
          <h2 style={H2}>Pestañas del legajo</h2>
          <WikiTbl headers={['Pestaña','Contenido']} rows={[
            ['Resumen IA','Documentos subidos y resumen generado. Permite re-procesar con nuevos documentos.'],
            ['Datos','Razón social, CUIT, actividad, facturación, límites CVU, representante, beneficiario final.'],
            ['Checklist', <span key="ck">Documentación KYB por ítem. Estado global calculado automáticamente. <WikiTip label="Bloqueante" text="Un ítem Bloqueante impide avanzar con el onboarding hasta ser resuelto."/> impide activar la cuenta.</span>],
            ['Scoring','8 factores de riesgo con puntaje 1–5. Determina: BAJO / MEDIO / MEDIO-ALTO / ALTO.'],
            ['Red Flags','Alertas detectadas por IA o agregadas manualmente con severidad.'],
            ['Historial','Registro cronológico de cambios de estado. Respaldo regulatorio ante auditorías UIF.'],
            ['Screening','Verificación contra listas de sanciones internacionales.'],
          ]}/>
          <WikiBox type="tip">Cada cambio de estado queda registrado en el Historial con fecha, hora y nombre del analista. Es el respaldo regulatorio ante inspecciones de la UIF.</WikiBox>
        </div>
      );

      case 'screening': return (
        <div>
          <h1 style={H1}>Screening de Sanciones</h1>
          <WikiFlow title="Flujo del screening" nodes={[
            {label:'Legajo con datos',sub:'Razón social · Ben. final',color:'#3B6DAA'},
            {label:'IA busca en tiempo real',sub:'Web search 4 fuentes',color:'#2C4A7C'},
            {label:'OFAC · ONU · REPET · PEPs',sub:'Verificación simultánea',color:T.TEXT},
            {label:'Resultado documentado',sub:'Con fecha y analista',color:T.GREEN},
          ]}/>
          <WikiTbl headers={['Lista','Organismo','Qué verifica']} rows={[
            ['OFAC SDN','EE.UU.','Specially Designated Nationals — sanciones del gobierno de EE.UU.'],
            ['ONU Lista Consolidada','ONU','Personas y entidades sujetas a medidas restrictivas del Consejo de Seguridad.'],
            ['REPET UIF','Argentina','Registro de personas vinculadas a Terrorismo y su Financiamiento. repet.uif.gob.ar'],
            ['PEPs Argentina (OA)','Argentina','Personas Políticamente Expuestas según la Oficina Anticorrupción.'],
          ]}/>
          <WikiTbl headers={['Resultado','Qué significa','Acción']} rows={[
            [<WikiBadge key="s1" type="green">LIMPIO</WikiBadge>,'Sin coincidencias en ninguna lista.','Documentar y continuar el proceso.'],
            [<WikiBadge key="s2" type="yellow">REVISAR</WikiBadge>,'Nombre similar — puede ser homonimia.','Verificar manualmente antes de avanzar.'],
            [<WikiBadge key="s3" type="red">COINCIDENCIA</WikiBadge>,'Match confirmado en alguna lista.','Suspender operaciones y notificar al Oficial.'],
          ]}/>
          <WikiBox type="danger">Obligación regulatoria: el screening debe realizarse al onboarding y repetirse mínimo una vez al año, o ante cualquier cambio en la información del cliente.</WikiBox>
        </div>
      );

      case 'aml': return (
        <div>
          <h1 style={H1}>Análisis AML Transaccional</h1>
          <WikiFlow title="Pipeline de análisis de un período" nodes={[
            {label:'Archivo XLS/CSV',sub:'Del sistema operativo',color:T.TEXT3},
            {label:'Parser universal',sub:'Detecta columnas auto.',color:'#3B6DAA'},
            {label:'16 métricas',sub:'HHI · Pass-through...',color:'#2C4A7C'},
            {label:'12 patrones AML',sub:'PAT-01 a PAT-12',color:T.AMBER},
            {label:'Score 0–5',sub:'BAJO / MEDIO / ALTO',color:T.RED},
          ]}/>
          <h2 style={H2}>Cargar un período</h2>
          <WikiStepList steps={[
            ['Seleccionar el legajo','En el selector "Legajo", elegir el cliente a analizar.'],
            ['Ingresar nombre del período','Ej: "Enero 2026 — 1/10". Si se deja vacío se usa el nombre del archivo.'],
            ['Subir el archivo','Clic o arrastrar. Formatos aceptados: CSV, XLS, XLSX, ODS.'],
            ['Cargar y analizar','El sistema procesa txns, calcula métricas, detecta señales y guarda en Supabase.'],
          ]}/>
          <h2 style={H2}>Clasificaciones de riesgo</h2>
          <WikiTbl headers={['Score','Clasificación','Acción recomendada']} rows={[
            ['0 – 2', <WikiBadge key="r1" type="green">BAJO</WikiBadge>, 'Monitoreo periódico normal. Sin acción inmediata.'],
            ['2 – 3', <WikiBadge key="r2" type="blue">MEDIO</WikiBadge>, 'Seguimiento normal. Documentar observaciones en Memos.'],
            ['3 – 4', <WikiBadge key="r3" type="orange">MEDIO-ALTO</WikiBadge>, 'Investigar contrapartes. Considerar RFI al cliente.'],
            ['4 – 5', <WikiBadge key="r4" type="red">ALTO</WikiBadge>, 'RFI obligatorio. Escalar al Oficial. Posible ROS.'],
          ]}/>
          <WikiBox type="warn">Si los montos muestran valores inflados al cargar un XLS, hay un error de exportación en el archivo origen. Eliminar el período y cargar el archivo corregido.</WikiBox>
        </div>
      );

      case 'patrones': return (
        <div>
          <h1 style={H1}>Patrones AML</h1>
          <p style={PP}>El sistema detecta 12 patrones al cargar un período. Ver "Patrones AML" en el sidebar para el detalle técnico con ejemplos prácticos.</p>
          <WikiTbl headers={['Código','Nombre','Tip. UIF','Severidad']} rows={[
            ['PAT-01','Montos exactamente repetidos','T-01',<WikiBadge key="p1" type="orange">MEDIA</WikiBadge>],
            ['PAT-02','Montos redondos sistemáticos','T-01',<WikiBadge key="p2" type="orange">MEDIA</WikiBadge>],
            ['PAT-03','Circularidad de fondos (Layering)','T-04',<WikiBadge key="p3" type="red">ALTA</WikiBadge>],
            ['PAT-04','Smurfing — Contrapartes one-shot','T-02',<WikiBadge key="p4" type="red">ALTA</WikiBadge>],
            ['PAT-05','Volumen incompatible con perfil','T-05',<WikiBadge key="p5" type="red">ALTA</WikiBadge>],
            ['PAT-06','Concentración extrema','T-03',<WikiBadge key="p6" type="orange">MEDIA</WikiBadge>],
            ['PAT-07','Fraccionamiento / Structuring','T-02',<WikiBadge key="p7" type="red">ALTA</WikiBadge>],
            ['PAT-08','Horario atípico','T-06',<WikiBadge key="p8" type="orange">MEDIA</WikiBadge>],
            ['PAT-09','Pass-through / Cuenta de paso','T-07',<WikiBadge key="p9" type="red">ALTA</WikiBadge>],
            ['PAT-10','Near-threshold structuring','T-02',<WikiBadge key="p10" type="red">ALTA</WikiBadge>],
            ['PAT-11','Nuevas contrapartes masivas','T-08',<WikiBadge key="p11" type="orange">MEDIA</WikiBadge>],
            ['PAT-12','Comportamiento atípico histórico','T-09',<WikiBadge key="p12" type="orange">MEDIA</WikiBadge>],
          ]}/>
          <WikiBox type="info">La detección de un patrón no implica ilicitud automáticamente. Siempre interpretar en contexto del perfil completo del cliente y su actividad declarada.</WikiBox>
        </div>
      );

      case 'alertas': return (
        <div>
          <h1 style={H1}>🔔 Centro de Alertas</h1>
          <p style={PP}>Panel unificado de monitoreo activo. Muestra automáticamente todas las alertas pendientes de toda la cartera sin necesidad de entrar a cada legajo o período.</p>
          <WikiFlow title="Tres tipos de alertas en un solo panel" nodes={[
            {label:'🚨 Señales AML',sub:'Patrones detectados activos',color:T.RED},
            {label:'📧 RFIs vencidos',sub:'Sin respuesta +7 días',color:T.AMBER},
            {label:'⏱ Sin analizar',sub:'Fuera del plazo regulatorio',color:T.AMBER},
          ]}/>
          <h2 style={H2}>Pestaña Señales</h2>
          <p style={PP}>Muestra todas las señales AML activas (no resueltas) de todos los períodos de toda la cartera, ordenadas por severidad. Las señales se cargan desde las métricas guardadas en Supabase — no hace falta haber abierto Análisis AML previamente.</p>
          <WikiTbl headers={['Elemento','Descripción']} rows={[
            ['Código PAT + Badge','Identifica el patrón y su severidad ALTA/MEDIA.'],
            ['Legajo y período','A qué cliente y qué período pertenece la señal.'],
            ['Descripción','Detalle técnico del patrón detectado con cifras reales.'],
            ['Campo de justificación','Texto libre para documentar por qué se resuelve la señal.'],
            ['Botón ✓ Resolver','Marca la señal como RESUELTA y la elimina del panel inmediatamente.'],
            ['Botón Ver período →','Navega directamente a Análisis AML con ese legajo y período preseleccionados.'],
          ]}/>
          <h2 style={H2}>Cómo resolver una señal desde Alertas</h2>
          <WikiStepList steps={[
            ['Ir a la pestaña 🚨 Señales','Todas las señales activas de la cartera aparecen ordenadas por severidad.'],
            ['Revisar el contexto','Leé la descripción de la señal. Si necesitás más detalle, clic en "Ver período →" para ir al análisis completo.'],
            ['Escribir la justificación','En el campo de texto bajo la señal, describí brevemente por qué se resuelve (ej: "Cliente presentó contratos con Gadran SRL que justifican los movimientos observados").'],
            ['Clic en ✓ Resolver','La señal desaparece del panel inmediatamente y queda registrada como RESUELTA en el período con tu nombre y la fecha.'],
          ]}/>
          <WikiBox type="tip">La resolución desde Alertas tiene el mismo efecto que resolver desde la pestaña Señales dentro de Análisis AML — el estado se guarda en el período y se refleja en el Dashboard.</WikiBox>
          <h2 style={H2}>Pestaña RFIs vencidos</h2>
          <WikiTbl headers={['Estado','Criterio','Acción sugerida']} rows={[
            ['🔴 Vencido','Más de 7 días desde el envío sin respuesta del cliente','Escalar al Oficial de Cumplimiento. Evaluar cambio de estado del período y posible ROS.'],
            ['🟡 Próximo a vencer','Entre 5 y 7 días desde el envío','Hacer seguimiento con el cliente. El botón "Ver legajo →" navega al legajo para gestionar el RFI.'],
          ]}/>
          <h2 style={H2}>Pestaña Sin analizar</h2>
          <p style={PP}>Muestra clientes que superaron el plazo regulatorio de análisis sin tener métricas cargadas. El plazo varía según el segmento de riesgo asignado en el KYB.</p>
          <WikiTbl headers={['Segmento','Plazo máximo sin análisis']} rows={[
            ['ALTO','30 días corridos desde el alta o último análisis'],
            ['MEDIO-ALTO','60 días corridos'],
            ['MEDIO / BAJO','90 días corridos'],
          ]}/>
          <WikiBox type="warn">El panel de Alertas se alimenta de las métricas guardadas en Supabase. Si un período fue cargado pero nunca se guardaron las métricas (por ejemplo, si se interrumpió el proceso), las señales no aparecerán hasta cargar el archivo nuevamente.</WikiBox>
        </div>
      );

      case 'senales': return (
        <div>
          <h1 style={H1}>Señales y Resolución</h1>
          <WikiFlow vertical title="Flujo de resolución de una señal ALTA" nodes={[
            {label:'Señal ALTA detectada',sub:'Sistema la marca ACTIVA',color:T.RED},
            {label:'Analista investiga',sub:'Contrapartes, documentación, contexto',color:'#3B6DAA'},
            {label:'Analista propone cierre',sub:'Escribe justificación en pantalla',color:T.AMBER},
            {label:'Supervisor decide',sub:'Aprueba o Rechaza',color:'#2C4A7C'},
            {label:'Señal RESUELTA',sub:'Desaparece del Dashboard',color:T.GREEN},
          ]}/>
          <WikiBox type="warn">Solo Supervisor, Oficial y Admin pueden aprobar el cierre de señales. El analista solo puede proponer.</WikiBox>
          <h2 style={H2}>Estados del período AML</h2>
          <WikiTbl headers={['Estado','Cuándo usarlo']} rows={[
            [<WikiBadge key="e1" type="blue">En revisión</WikiBadge>,'Estado inicial. El período fue cargado y está siendo analizado.'],
            [<WikiBadge key="e2" type="orange">RFI enviado</WikiBadge>,'Se enviaron requerimientos al cliente y se espera respuesta.'],
            [<WikiBadge key="e3" type="green">Cerrado — sin alerta</WikiBadge>,'Todas las señales explicadas satisfactoriamente.'],
            [<WikiBadge key="e4" type="red">Cerrado — con alerta</WikiBadge>,'Período con alerta escalada (RFI vencido o ROS generado).'],
            [<WikiBadge key="e5" type="gray">Archivado</WikiBadge>,'Período fuera de vigencia. Sin acción requerida.'],
          ]}/>
        </div>
      );

      case 'rfi': return (
        <div>
          <h1 style={H1}>Módulo RFI</h1>
          <WikiFlow title="Ciclo de vida de un RFI" nodes={[
            {label:'ENVIADO',sub:'Plazo: 7 días',color:T.AMBER},
            {label:'RESPONDIDO',sub:'Completo',color:T.GREEN},
            {label:'RESP. PARCIAL',sub:'Incompleto',color:T.AMBER},
            {label:'SIN RESPUESTA',sub:'Escalar',color:T.RED},
            {label:'CERRADO',sub:'Resuelto',color:T.TEXT3},
          ]}/>
          <h2 style={H2}>Crear un RFI</h2>
          <WikiStepList steps={[
            ['Ir al tab RFI del período','Análisis AML → seleccionar período → tab RFI.'],
            ['Clic en "+ Nuevo RFI"','Se abre el formulario con número de referencia automático.'],
            ['Completar el formulario','N° referencia · Asunto · Texto del requerimiento · Nombre del analista.'],
            ['Registrar RFI','Clic en "Registrar RFI". Se crea el hilo con estado ENVIADO.'],
            ['Registrar respuesta','Al recibir respuesta del cliente: "Respuesta/Nota" → tipo → contenido.'],
          ]}/>
          <WikiBox type="danger">Los RFIs sin respuesta después de 7 días generan alertas automáticas en el Dashboard. Si vence sin respuesta, escalar al Oficial de Cumplimiento.</WikiBox>
        </div>
      );

      case 'informes': return (
        <div>
          <h1 style={H1}>Generación de Informes</h1>
          <WikiFlow title="Informes regulatorios disponibles" nodes={[
            {label:'INF-01',sub:'KYB — Onboarding',color:'#3B6DAA'},
            {label:'INF-02',sub:'AML — Monitoreo',color:'#2C4A7C'},
            {label:'INF-07',sub:'Cierre de cuenta',color:T.RED},
          ]}/>
          <WikiTbl headers={['Informe','Dónde generarlo','Quién puede','Contenido']} rows={[
            ['INF-01','Detalle del legajo → botón INF-01','Todos excepto Solo lectura','Datos cliente, checklist, scoring, red flags, dictamen.'],
            ['INF-02','Análisis AML → botón INF-02','Todos excepto Solo lectura','Métricas del período, señales con tipología UIF, scoring, memos.'],
            ['INF-07','Detalle del legajo → botón Cierre','Supervisor, Oficial, Admin','Motivo del cierre, historial de estados. Cierra automáticamente la cuenta.'],
          ]}/>
          <h2 style={H2}>Exportar como PDF</h2>
          <WikiStepList steps={[
            ['Generar el informe','Clic en el botón correspondiente (INF-01, INF-02 o INF-07).'],
            ['Revisar en el visor','El documento se abre con todos los datos pre-completados.'],
            ['Clic en Imprimir / PDF','Botón en la barra del visor.'],
            ['Guardar como PDF','En el diálogo del navegador, seleccionar "Guardar como PDF" como destino.'],
          ]}/>
          <WikiBox type="tip">Todos los informes quedan registrados en el audit trail con usuario, fecha y hora.</WikiBox>
        </div>
      );

      case 'ros': return (
        <div>
          <h1 style={H1}>ROS Borrador UIF</h1>
          <WikiBox type="danger">El ROS tiene carácter estrictamente confidencial (Art. 22 Ley 25.246). No puede ser revelado al cliente ni a terceros no autorizados.</WikiBox>
          <WikiFlow title="Flujo de generación del ROS borrador" nodes={[
            {label:'Caso con señales ALTA',sub:'RFI vencido / sin justif.',color:T.RED},
            {label:'Seleccionar períodos',sub:'Pre-selecciona con señales',color:T.AMBER},
            {label:'Generar borrador',sub:'8 secciones auto.',color:'#2C4A7C'},
            {label:'Editar narrativa',sub:'Descripción y conclusión',color:'#3B6DAA'},
            {label:'Presentar en SIROS',sub:'Portal UIF',color:T.GREEN},
          ]}/>
          <WikiTbl headers={['Sección','Contenido','Editable']} rows={[
            ['1. Encabezado','N° correlativo ROS-YYYY-NNN · Fecha · CONFIDENCIAL','No'],
            ['2. Sujeto Obligado','Datos fijos de GOAT S.A. / Rebit','No'],
            ['3. Cliente Reportado','Datos del legajo KYB','No'],
            ['4. Descripción de Operaciones','Métricas agregadas de los períodos seleccionados','Sí'],
            ['5. Señales Detectadas','PAT codes con tipología UIF correspondiente','No'],
            ['6. Top 20 Operaciones','Las 20 operaciones más relevantes por monto','No'],
            ['7. Diligencias Realizadas','Checklist KYB + RFIs enviados y sus respuestas','No'],
            ['8. Conclusión y Firma','Fundamento del reporte + firma del Oficial','Sí'],
          ]}/>
        </div>
      );

      case 'tendencias': return (
        <div>
          <h1 style={H1}>Tendencias Multi-período</h1>
          <p style={PP}>Cuando un legajo tiene 2 o más períodos cargados, aparece el toggle "Tendencias" junto al selector de período.</p>
          <WikiTbl headers={['Elemento','Descripción']} rows={[
            ['KPIs de tendencia','Variación % del volumen IN entre primer y último período. Tendencia del score. Clasificación actual.'],
            ['Gráfico IN/OUT','Líneas verde (IN) y roja (OUT) por período. Identifica crecimientos anómalos visualmente.'],
            ['Score trend','Evolución del score 0–5. Puntos de color según nivel en cada período.'],
            ['Tabla comparativa','Todos los períodos como columnas con métricas clave como filas.'],
            [<WikiTip key="rot" label="Rotación de contrapartes" text="> 60% nuevas en un período = alerta automática de posible atomización de red"/>, 'Por cada período vs. el anterior: nuevas, perdidas, recurrentes y % rotación.'],
          ]}/>
          <WikiBox type="warn">Alerta automática: si más del 60% de las contrapartes son nuevas en un período, el sistema alerta "Alta rotación". Indica posible fragmentación deliberada de la red de pagos.</WikiBox>
        </div>
      );

      case 'flujos': return (
        <div>
          <h1 style={H1}>Flujos de Trabajo</h1>
          <h2 style={H2}>Onboarding de nuevo cliente</h2>
          <WikiStepList steps={[
            ['Día 1 — Recepción documental','Estatuto, poderes, DNIs, constancia AFIP/ARCA, estados contables del último ejercicio.'],
            ['Día 1 — Crear legajo y extraer datos con IA','Legajos KYB → "+ Nuevo Legajo" → subir documentos → "Extraer datos con IA".'],
            ['Día 1 — Checklist, Scoring y Screening','Completar los tres antes de emitir dictamen. El Screening es obligatorio.'],
            ['Día 2 — Dictamen y generación de INF-01','Establecer APROBADO / CONDICIONAL / RECHAZADO. Generar y archivar el INF-01.'],
            ['Día 2 — Activar la cuenta','Cambiar estado de "En Onboarding" a "Activa". Historial registra automáticamente.'],
          ]}/>
          <h2 style={H2}>Monitoreo mensual recurrente</h2>
          <WikiStepList steps={[
            ['Días 1, 11 y 21 del mes — Obtener archivo XLS','Exportar desde el sistema operativo de Rebit el archivo de 10 días del período.'],
            ['Cargar en Análisis AML','Seleccionar legajo → nombre del período → subir archivo → "Cargar y analizar".'],
            ['Revisar métricas y señales','Verificar señales ALTA nuevas que requieran acción inmediata.'],
            ['Documentar en Memos','Registrar observaciones del analista sobre el período.'],
            ['Fin de mes — Tendencias','Con los 3 archivos cargados, activar "Tendencias" para ver la evolución mensual.'],
            ['Generar INF-02','Del período más relevante del mes para el expediente.'],
          ]}/>
          <h2 style={H2}>Caso con señales ALTA</h2>
          <WikiFlow vertical title="Árbol de decisión" nodes={[
            {label:'Señales ALTA detectadas',sub:'Semáforo rojo en Dashboard',color:T.RED},
            {label:'Emitir RFI al cliente',sub:'Plazo recomendado: 7 días hábiles',color:T.AMBER},
            {label:'Respuesta satisfactoria?',sub:'Sí proponer cierre / No escalar',color:'#2C4A7C'},
            {label:'Cierre de señales o ROS',sub:'Supervisor aprueba · Oficial evalúa ROS',color:T.TEXT},
          ]}/>
        </div>
      );

      case 'glosario': return (
        <div>
          <h1 style={H1}>Glosario</h1>
          <WikiTbl headers={['Término','Definición']} rows={[
            ['AML','Anti-Money Laundering. Prevención de lavado de activos y financiamiento del terrorismo.'],
            ['BCRA','Banco Central de la República Argentina. Regula PSPs mediante Com. A 6885.'],
            ['CVU','Clave Virtual Uniforme. Identificador de cuentas de pago de PSPs, equivalente al CBU bancario.'],
            ['Dictamen KYB','Conclusión del onboarding: APROBADO · CONDICIONAL · RECHAZADO.'],
            ['EDD','Enhanced Due Diligence. Debida diligencia reforzada para clientes de alto riesgo.'],
            ['HHI','Índice Herfindahl-Hirschman. Mide concentración de contrapartes. Valor 1 = máxima concentración.'],
            ['INF-01','Informe de Debida Diligencia KYB. Documenta el proceso de onboarding.'],
            ['INF-02','Informe de Monitoreo Transaccional AML. Resume el análisis de un período.'],
            ['INF-07','Informe de Cierre/Desvinculación. Cierra automáticamente la cuenta en el sistema.'],
            ['KYB','Know Your Business. Conocimiento y verificación de clientes corporativos.'],
            ['Layering','Segunda etapa del lavado: múltiples transacciones para dificultar el rastreo del origen.'],
            ['Pass-through','Fondos que ingresan y egresan el mismo día. Cuenta usada como intermediario de paso.'],
            ['PEP','Persona Políticamente Expuesta. Riesgo regulatorio especial por su función pública.'],
            ['PSP','Proveedor de Servicios de Pago. Categoría regulatoria de GOAT S.A. / Rebit.'],
            ['REPET','Registro Público de Personas vinculadas a Terrorismo. Administrado por la UIF.'],
            ['RFI','Request for Information. Requerimiento formal de información al cliente.'],
            ['ROS','Reporte de Operación Sospechosa. Comunicación obligatoria a la UIF (Art. 21 Ley 25.246).'],
            ['Same name','Transferencia al propio titular (mismo CUIT) en otra entidad al cerrar la cuenta.'],
            ['SIROS','Sistema Integral de Reporte de Operaciones Sospechosas. Portal web de la UIF.'],
            ['Smurfing','Uso de múltiples personas para dividir operaciones grandes en pequeñas.'],
            ['Structuring','Fraccionamiento deliberado para eludir umbrales de reporte obligatorio.'],
            ['UIF','Unidad de Información Financiera. Organismo de control AML en Argentina.'],
          ]}/>
        </div>
      );

      default: return <div>Sección no encontrada.</div>;
    }
  }

  var visible = SECTIONS.filter(s => !search || s.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{display:'flex',gap:0,minHeight:'calc(100vh - 60px)'}}>
      <div style={{width:200,flexShrink:0,background:T.BG2,borderRight:'1px solid '+T.BORDER,padding:'14px 0',overflowY:'auto'}}>
        <div style={{padding:'0 10px 10px',borderBottom:'1px solid '+T.BORDER,marginBottom:8}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar sección..." style={{width:'100%',padding:'6px 10px',border:'1px solid '+T.BORDER2,borderRadius:6,fontSize:12,color:T.TEXT,background:T.BG2}}/>
        </div>
        {visible.map(s=>{
          var on = active===s.id;
          return (
            <button key={s.id} onClick={()=>{setActive(s.id);setSearch('');}} style={{display:'block',width:'100%',textAlign:'left',padding:'7px 16px',border:'none',background:on?'rgba(59,109,170,0.15)':'transparent',color:on?T.CYAN:T.TEXT2,fontWeight:on?600:400,fontSize:11,cursor:'pointer',fontFamily:T.MONO,borderLeft:'2px solid '+(on?C.AC:'transparent'),transition:'all 0.12s'}}>
              <span style={{marginRight:6}}>{s.icon}</span>{s.label}
            </button>
          );
        })}
      </div>
      <div style={{flex:1,padding:'28px 32px',overflowY:'auto',maxWidth:860}}>
        {renderContent()}
      </div>
    </div>
  );
}

export default WikiView;
