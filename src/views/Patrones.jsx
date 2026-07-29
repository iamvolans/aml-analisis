import { useState } from "react";
import { C, T } from "../lib/theme";
import { sevColor } from "../lib/utils";

// ── PANEL DE USUARIOS (solo admin) ───────────────────────────────────────────
// ─── PATRONES AML ────────────────────────────────────────────────────────────
function PatronesView() {
  var PATRONES = [
    {
      code:'PAT-01', name:'Montos exactamente repetidos', tip:'T-01', sev:'MEDIA',
      desc:'Se detecta que un mismo monto aparece repetido en múltiples operaciones de forma no aleatoria. El patrón se activa cuando el mismo importe exacto aparece en 3 o más operaciones dentro del período.',
      ejemplo:'El cliente recibe exactamente $47.500 en 38 transferencias distintas durante el mes, siempre el mismo importe, desde diferentes contrapartes.',
      que_sugiere:'Operatoria automatizada o fragmentación mecánica. En comercio genuino los montos varían naturalmente por impuestos, descuentos y condiciones. La repetición exacta es estadísticamente anómala.',
    },
    {
      code:'PAT-02', name:'Montos redondos sistemáticos', tip:'T-01', sev:'MEDIA',
      desc:'Alto porcentaje de operaciones con montos exactamente redondos ($100.000, $500.000, $1.000.000, etc.). La alerta se activa cuando supera el 20-25% del total de operaciones del período.',
      ejemplo:'De 400 operaciones del mes, 110 tienen montos exactamente redondos: $200.000, $500.000, $1.000.000, sin centavos ni variaciones.',
      que_sugiere:'En comercio real los montos raramente son exactamente redondos — incluyen impuestos, flete, descuentos. Una concentración elevada sugiere operaciones manuales o premeditadas, típicas de structuring.',
    },
    {
      code:'PAT-03', name:'Circularidad de fondos (Layering)', tip:'T-04', sev:'ALTA',
      desc:'Se detectan contrapartes que aparecen simultáneamente como origen (envían fondos) y como destino (reciben fondos) dentro del mismo período. El sistema identifica relaciones bidireccionales entre la cuenta y sus contrapartes.',
      ejemplo:'La empresa Alfa le transfiere $5M al cliente, y el mismo cliente le transfiere $4.8M a la empresa Alfa dentro del mismo mes.',
      que_sugiere:'Patrón clásico de layering o estratificación. Los fondos "circulan" entre cuentas para dificultar el rastreo del origen ilícito, creando capas de movimientos que ocultan la trazabilidad.',
    },
    {
      code:'PAT-04', name:'Smurfing — Contrapartes one-shot', tip:'T-02', sev:'ALTA',
      desc:'Gran cantidad de contrapartes que realizan una única operación y nunca vuelven a aparecer. Cada contraparte opera una sola vez, generalmente con montos similares entre sí.',
      ejemplo:'El cliente recibe 200 transferencias de 200 personas físicas distintas, cada una por única vez, todas entre $50.000 y $80.000 en la misma semana.',
      que_sugiere:'Técnica de smurfing — uso de múltiples personas para fragmentar una operación grande en muchas pequeñas, cada una por debajo de los umbrales de reporte. Forma distribuida de estructuración.',
    },
    {
      code:'PAT-05', name:'Volumen incompatible con perfil', tip:'T-05', sev:'ALTA',
      desc:'El volumen total operado en el período es manifiestamente desproporcionado respecto a la facturación mensual declarada por el cliente en el onboarding KYB. El sistema calcula el ratio entre lo operado y lo declarado.',
      ejemplo:'Un comercio que declaró $5M/mes de facturación opera $80M en un período de 10 días — ratio 16x sobre lo declarado.',
      que_sugiere:'El cliente opera un volumen que no puede explicarse con su actividad económica real. Es la señal más directa de que los fondos que pasan por la cuenta no corresponden al negocio declarado del titular.',
    },
    {
      code:'PAT-06', name:'Concentración extrema en pocas contrapartes', tip:'T-03', sev:'MEDIA',
      desc:'El índice HHI (Herfindahl-Hirschman) indica que un porcentaje muy alto del volumen total está concentrado en 1 o pocas contrapartes. Alerta cuando la contraparte principal supera el 40-50% del volumen total.',
      ejemplo:'El 78% de todos los ingresos del cliente provienen de una sola empresa, sin justificación contractual documentada.',
      que_sugiere:'En comercio genuino los ingresos suelen estar distribuidos entre clientes. Concentración extrema puede indicar relación de fachada o fondos provenientes de una única fuente que los canaliza.',
    },
    {
      code:'PAT-07', name:'Fraccionamiento / Structuring', tip:'T-02', sev:'ALTA',
      desc:'Se detectan grupos de operaciones que comparten monto similar, contraparte y fechas cercanas (dentro de una misma jornada o días consecutivos), configurando un patrón de fragmentación deliberada para eludir umbrales.',
      ejemplo:'El cliente recibe 5 transferencias de $790.000 de la misma persona en el mismo día — todas por debajo del umbral de reporte de $800.000.',
      que_sugiere:'Structuring deliberado — técnica para fraccionar una operación grande en varias más pequeñas y eludir los umbrales de reporte obligatorio a la UIF. Conducta tipificada en la Ley 25.246.',
    },
    {
      code:'PAT-08', name:'Operatoria en horario atípico', tip:'T-06', sev:'MEDIA',
      desc:'Porcentaje significativo de operaciones realizadas fuera del horario bancario normal, en horario nocturno (22:00–06:00 hs) o durante fines de semana y feriados. Alerta si supera el 30% del total.',
      ejemplo:'El 45% de las transferencias del cliente ocurren entre las 23:00 y las 04:00 hs, incluyendo sábados y domingos.',
      que_sugiere:'Actividad comercial legítima ocurre en horario hábil. Concentración en horarios inusuales puede indicar automatización sospechosa, evasión de controles o actividades incompatibles con el giro declarado.',
    },
    {
      code:'PAT-09', name:'Pass-through — Cuenta de paso', tip:'T-07', sev:'ALTA',
      desc:'Alto porcentaje de fondos que ingresan a la cuenta y egresan el mismo día, sin permanencia. El dinero transita por la cuenta como canal de paso. Alerta cuando supera el 40% del volumen total.',
      ejemplo:'El cliente recibe $10M un martes y ese mismo día transfiere $9.2M a otras cuentas. El saldo neto al cierre del día es casi nulo.',
      que_sugiere:'Uso de la cuenta como intermediario de paso — la cuenta no acumula fondos propios sino que los recibe y redistribuye inmediatamente, típico de cuentas usadas para mover fondos de terceros.',
    },
    {
      code:'PAT-10', name:'Near-threshold structuring', tip:'T-02', sev:'ALTA',
      desc:'Se detectan 5 o más operaciones en el rango $680.000–$799.999 (85%–99,9% del umbral UIF de $800.000 ARS) realizadas con la misma contraparte, en cualquier dirección (IN o OUT). El umbral de $800K es el nivel de reporte obligatorio para PSPs según normativa UIF vigente.',
      ejemplo:'Una misma empresa le transfiere al cliente $750.000 en 7 oportunidades distintas durante el mes — cada operación por debajo del umbral de $800K, pero acumulando $5.25M con esa contraparte.',
      que_sugiere:'Structuring deliberado — técnica de mantener cada operación individual por debajo del umbral de reporte obligatorio para evitar la notificación a la UIF. A diferencia del PAT-07 (fraccionamiento clásico), aquí la recurrencia está concentrada en una misma contraparte, lo que sugiere un acuerdo sistemático entre las partes para eludir los controles.',
    },
    {
      code:'PAT-11', name:'Nuevas contrapartes masivas', tip:'T-08', sev:'MEDIA',
      desc:'En un período determinado aparece una cantidad desproporcionada de contrapartes nuevas que no habían operado antes con la cuenta. Alerta automática cuando la rotación supera el 60% respecto al período anterior.',
      ejemplo:'En enero el cliente operó con 50 contrapartes habituales. En febrero aparecen 180 contrapartes nuevas que nunca operaron antes — 78% de rotación.',
      que_sugiere:'Expansión abrupta e injustificada de la red de contactos. Un salto repentino puede indicar que la cuenta está siendo utilizada por terceros que aportan sus propias redes o que se está armando una nueva red.',
    },
    {
      code:'PAT-12', name:'Comportamiento transaccional atípico', tip:'T-09', sev:'MEDIA',
      desc:'El comportamiento del cliente en el período actual se desvía significativamente de su propio histórico. Cambio brusco en volumen, tipo de operaciones, horarios o composición de contrapartes sin justificación declarada.',
      ejemplo:'Un cliente que operó establemente $3M/mes durante 6 meses de repente opera $28M, cambia sus contrapartes habituales y empieza a operar de madrugada.',
      que_sugiere:'Cambio de conducta repentino — indicador de alto valor porque compara al cliente contra sí mismo, eliminando sesgos de sector. Un cambio abrupto sin causa declarada merece investigación inmediata.',
    },
  ];

  var SEV_COLOR = { 'ALTA': C.ROJO, 'MEDIA': C.NARANJA };
  var SEV_BG    = { 'ALTA': 'rgba(255,68,85,0.1)', 'MEDIA': 'rgba(255,184,48,0.1)' };

  var expandState = useState(null); var expanded = expandState[0]; var setExpanded = expandState[1];

  return (
    <div style={{padding:22, maxWidth:960}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
        <h2 style={{fontSize:15,fontWeight:600,color:T.TEXT,letterSpacing:'1px',margin:0}}>🔍 Patrones AML — Referencia</h2>
        <span style={{background:T.ACCENT_SOFT,color:T.ACCENT,border:'1px solid '+T.ACCENT_DIM,borderRadius:T.RADIUS.pill,padding:'2px 11px',fontSize:10,fontWeight:700,fontFamily:T.MONO}}>12 patrones activos</span>
      </div>
      <p style={{fontSize:12,color:T.TEXT2,marginBottom:20}}>
        Catálogo completo de patrones de comportamiento transaccional inusual detectados por el sistema.
        Cada patrón está mapeado a su tipología UIF correspondiente. Hacé clic en cualquier fila para ver el detalle completo.
      </p>

      {/* Leyenda de severidad */}
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        {[['ALTA',T.RED,'rgba(255,68,85,0.1)'],['MEDIA',T.AMBER,'rgba(255,184,48,0.1)']].map(function(s){return(
          <div key={s[0]} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 12px',background:s[2],border:'1px solid '+s[1],borderRadius:20}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:s[1]}}></div>
            <span style={{fontSize:11,fontWeight:700,color:s[1]}}>Severidad {s[0]}</span>
          </div>
        );})}
        <div style={{marginLeft:'auto',fontSize:11,color:T.TEXT3,alignSelf:'center'}}>
          Tipologías UIF: T-01 a T-09 según Resolución 156/2018
        </div>
      </div>

      {/* Tabla de patrones */}
      <div style={{border:'1px solid '+T.BORDER,borderRadius:8,overflow:'hidden'}}>
        {/* Header */}
        <div style={{display:'grid',gridTemplateColumns:'90px 1fr 80px 80px',background:T.BG3,borderBottom:'1px solid '+T.BORDER2,padding:'9px 16px',gap:12}}>
          {['Código','Nombre del patrón','Tip. UIF','Severidad'].map(function(h){return(
            <div key={h} style={{fontSize:10,fontWeight:700,color:T.TEXT3,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS}}>{h}</div>
          );})}
        </div>

        {PATRONES.map(function(p, i){
          var isOpen = expanded === p.code;
          var sevColor = SEV_COLOR[p.sev];
          var sevBg    = SEV_BG[p.sev];
          return (
            <div key={p.code} style={{borderBottom: i < PATRONES.length-1 ? '1px solid '+T.BORDER : 'none'}}>
              {/* Row */}
              <div
                onClick={function(){ setExpanded(isOpen ? null : p.code); }}
                style={{display:'grid',gridTemplateColumns:'90px 1fr 80px 80px',padding:'11px 16px',gap:12,cursor:'pointer',background:isOpen ? 'rgba(59,109,170,0.15)' : (i%2===0?T.BG2:T.BG3),transition:'background 0.1s',alignItems:'center'}}
              >
                <div style={{fontFamily:'monospace',fontWeight:700,fontSize:12.5,color:T.CYAN}}>{p.code}</div>
                <div style={{fontSize:13,fontWeight:isOpen?700:500,color:T.TEXT}}>{p.name}</div>
                <div style={{fontSize:11,color:T.TEXT2,fontFamily:'monospace'}}>{p.tip}</div>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:sevColor,flexShrink:0}}></div>
                  <span style={{fontSize:11,fontWeight:700,color:sevColor}}>{p.sev}</span>
                  <span style={{marginLeft:'auto',fontSize:12,color:T.CYAN}}>{isOpen?'▲':'▼'}</span>
                </div>
              </div>

              {/* Detalle expandible */}
              {isOpen && (
                <div style={{padding:'0 16px 16px 16px',background:T.BG3,borderTop:'1px solid #D6E4F0'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,paddingTop:14}}>

                    <div style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'12px 14px'}}>
                      <div style={{fontSize:10,fontWeight:700,color:T.CYAN,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:6}}>Descripción técnica</div>
                      <div style={{fontSize:12.5,color:T.TEXT,lineHeight:1.6}}>{p.desc}</div>
                    </div>

                    <div style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:6,padding:'12px 14px'}}>
                      <div style={{fontSize:10,fontWeight:700,color:T.CYAN,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:6}}>¿Qué puede indicar?</div>
                      <div style={{fontSize:12.5,color:T.TEXT,lineHeight:1.6}}>{p.que_sugiere}</div>
                    </div>

                    <div style={{background:'rgba(255,184,48,0.08)',border:'1px solid rgba(255,184,48,0.25)',borderRadius:3,padding:'12px 14px',gridColumn:'1/-1'}}>
                      <div style={{fontSize:10,fontWeight:700,color:T.AMBER,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:6}}>Ejemplo práctico</div>
                      <div style={{fontSize:12.5,color:T.TEXT,lineHeight:1.6,fontStyle:'italic'}}>{p.ejemplo}</div>
                    </div>

                  </div>
                  <div style={{marginTop:10,display:'flex',gap:8}}>
                    <span style={{background:sevBg,color:sevColor,border:'1px solid '+sevColor,borderRadius:4,padding:'3px 10px',fontSize:10,fontWeight:700}}>
                      Severidad típica: {p.sev}
                    </span>
                    <span style={{background:'rgba(0,212,255,0.12)',color:T.CYAN,border:'1px solid rgba(0,212,255,0.3)',borderRadius:4,padding:'3px 10px',fontSize:10,fontWeight:700}}>
                      Tipología UIF: {p.tip}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer nota */}
      <div style={{marginTop:14,padding:'10px 14px',background:T.BG3,borderRadius:3,fontSize:11,color:T.TEXT3,lineHeight:1.6}}>
        <strong>Nota regulatoria:</strong> Los patrones PAT-01 a PAT-12 son indicadores internos del sistema Rebit AML Tool mapeados
        a las tipologías de lavado de activos definidas por la UIF en la Resolución 156/2018 y sus modificatorias.
        La detección de un patrón no implica automáticamente la existencia de una operación ilícita —
        su interpretación debe realizarse siempre en el contexto del perfil completo del cliente.
      </div>
    </div>
  );
}

// ─── WIKI ────────────────────────────────────────────────────────────────────

export default PatronesView;
