import { T } from "./theme";

var ESTADOS_CUENTA = [
  { id:'EN_ONBOARDING',   label:'En Onboarding',              color:'#8BA3C0', bg:'rgba(139,163,192,0.1)', desc:'Legajo en proceso, cuenta no habilitada' },
  { id:'ACTIVA',          label:'Activa',                     color:'#00E676', bg:'rgba(0,230,118,0.1)',   desc:'Cuenta habilitada y operando' },
  { id:'ACTIVA_REFORZADO',label:'Activa — Monitoreo Reforzado',color:'#FF8C00', bg:'rgba(255,140,0,0.1)',  desc:'Operando con alertas activas' },
  { id:'SUSPENDIDA',      label:'Suspendida',                 color:'#FFB830', bg:'rgba(255,184,48,0.1)', desc:'Operación pausada temporalmente' },
  { id:'CERRADA',         label:'Cerrada',                    color:'#FF4455', bg:'rgba(255,68,85,0.1)',   desc:'Desvinculada — cuenta inactiva' },
];

function getEstado(id) { return ESTADOS_CUENTA.find(function(e){return e.id===id;}) || ESTADOS_CUENTA[0]; }

// Tipo de operatoria del cliente. Determina qué reglas de detección aplican:
// un convenio de recaudación tiene forma de embudo por diseño, de modo que las
// reglas que detectan esa forma se calibran de otro modo. Ver lib/cobranza.js.
var TIPOS_OPERATORIA = [
  { id:'CUENTA_PAGO',  label:'Cuenta de pago',
    desc:'Cliente con cuenta de pago. Se monitorea el flujo propio del cliente.' },
  { id:'RECAUDACION',  label:'Convenio de recaudación',
    desc:'La entidad recibe cheques librados por terceros y liquida el producido a beneficiarios '
       + 'instruidos por el cliente, bajo la modalidad de pago por cuenta y orden.' },
];

var CHECKLIST_ITEMS = ['Estatuto / Contrato social','Inscripcion registral (IGJ/INAES)','Constancia CUIT/AFIP','Acta de directorio vigente','Poder / Autorizacion firmante','DNI / Pasaporte firmante','Declaracion beneficiario final (>10%)','Estados contables (3 ejercicios)','Declaracion patrimonial DDJJ','Comprobante domicilio fiscal','Comprobante domicilio comercial','Certificado actividad / habilitacion','DDJJ AML (PEP/SO/UBO)','Constancia IVA / Monotributo','Referencias bancarias / comerciales'];

var KYB_FACTORS = ['Completitud documental','Perfil de riesgo - actividad','Screening PEP/sanciones','Beneficiario final','Estructura societaria','Coherencia financiera','Antecedentes AML'];

var SCREENING = [{n:'REPET - Registro Público de Personas y Entidades vinculadas a actos de Terrorismo',j:'Argentina',u:'https://www.argentina.gob.ar/justicia/repet'},{n:'OFAC SDN List',j:'USA',u:'https://sanctionssearch.ofac.treas.gov/'},{n:'UN Consolidated Sanctions',j:'Internacional',u:'https://www.un.org/securitycouncil/content/un-sc-consolidated-list'},{n:'EU Consolidated List',j:'Europa',u:'https://eeas.europa.eu/topics/sanctions-policy/'},{n:'GAFI - High-Risk Jurisdictions',j:'Internacional',u:'https://www.fatf-gafi.org/'},{n:'UIF - Sujetos Obligados',j:'Argentina',u:'https://www.argentina.gob.ar/uif'},{n:'AFIP - Constancia CUIT',j:'Argentina',u:'https://www.afip.gob.ar/'},{n:'ROS / RFI Internos GOAT',j:'Interno',u:'#'},{n:'Interpol Most Wanted',j:'Internacional',u:'https://www.interpol.int/'},{n:'PEP Arg - Poder Ciudadano',j:'Argentina',u:'https://poderciudadano.org/'},{n:'World-Check / Refinitiv',j:'Global',u:'https://www.refinitiv.com/'},{n:'Adverse Media - Google News',j:'Global',u:'https://news.google.com/'},{n:'BCRA - Central de Deudores',j:'Argentina',u:'https://www.bcra.gob.ar/BCRAyVos/Deudores.asp'},{n:'Poder Judicial Argentina',j:'Argentina',u:'https://www.pjn.gov.ar/'}];

// ─── GENERADOR ROS — REPORTE DE OPERACIÓN SOSPECHOSA ─────────────────────────
var PAT_UIF_MAP = {
  'PAT-01': { tip:'T-02', desc:'Fraccionamiento de operaciones para eludir umbrales de reporte (structuring)' },
  'PAT-02': { tip:'T-01', desc:'Operaciones con montos exactos o redondeados en forma sistemática y reiterada' },
  'PAT-03': { tip:'T-04', desc:'Posible circularidad de fondos entre contrapartes relacionadas (layering)' },
  'PAT-04': { tip:'T-02', desc:'Smurfing: uso de múltiples contrapartes únicas para fragmentar transacciones de alto monto' },
  'PAT-05': { tip:'T-05', desc:'Volumen de operaciones manifiestamente incompatible con el perfil económico declarado' },
  'PAT-06': { tip:'T-03', desc:'Concentración extrema de operaciones en una o pocas contrapartes sin justificación comercial aparente' },
  'PAT-07': { tip:'T-01', desc:'Patrón de montos exactamente repetidos en múltiples operaciones' },
  'PAT-08': { tip:'T-06', desc:'Actividad transaccional concentrada en horarios atípicos (nocturnos o fines de semana)' },
  'PAT-09': { tip:'T-07', desc:'Uso de la cuenta como intermediario de paso (pass-through): fondos que ingresan y egresan en forma inmediata' },
  'PAT-10': { tip:'T-02', desc:'Near-threshold structuring: acumulación de 5 o más operaciones por debajo del umbral UIF ($800K) con la misma contraparte' },
  'PAT-11': { tip:'T-08', desc:'Incorporación masiva de nuevas contrapartes en un período reducido, sin correlato operativo aparente' },
  'PAT-12': { tip:'T-09', desc:'Comportamiento transaccional atípico en relación al perfil histórico del cliente' },
  'PAT-13': { tip:'T-09', desc:'Desvío significativo del volumen operado respecto de la línea base histórica del propio cliente' },
  'PAT-14': { tip:'T-03', desc:'Concentración del flujo en una contraparte sin antecedentes operativos con el cliente' },
  'PAT-15': { tip:'T-06', desc:'Cambio abrupto en la distribución horaria de las operaciones respecto del comportamiento habitual' },
  // No es una tipología: es una alerta de calidad del dato. Se incluye para que
  // los informes no la muestren sin descripción, y NO debe integrar un ROS.
  'DATA-01': { tip:'T-00', desc:'Calidad del dato: el archivo cargado no permite identificar las contrapartes, por lo que los análisis de concentración y fraccionamiento no son concluyentes' },
};

export { ESTADOS_CUENTA, getEstado, CHECKLIST_ITEMS, KYB_FACTORS, SCREENING, PAT_UIF_MAP, TIPOS_OPERATORIA };
