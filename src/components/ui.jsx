import { useState, useEffect, useRef } from "react";
import { T } from "../lib/theme";
import { sevColor } from "../lib/utils";

// UI
function Card(props) {
  return (
    <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,marginBottom:14,overflow:'hidden',boxShadow:T.SHADOW.card}}>
      {props.title ? <div style={{borderBottom:'1px solid '+T.BORDER,padding:'11px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontWeight:600,fontSize:11,color:T.TEXT3,letterSpacing:'1px',textTransform:'uppercase',fontFamily:T.SANS}}>{props.title}</span>
        {props.actions ? props.actions : null}
      </div> : null}
      <div style={{padding:16}}>{props.children}</div>
    </div>
  );
}

// ── StatCard v3: KPI con acento lateral, número grande SANS y sub opcional ──
function StatCard(props) {
  var col = props.col || T.ACCENT;
  return (
    <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,padding:'14px 16px',position:'relative',overflow:'hidden',boxShadow:T.SHADOW.card}}>
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:col,opacity:0.9}}/>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:10,color:T.TEXT3,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS,marginBottom:6,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{props.label}</div>
          <div style={{fontSize:26,fontWeight:700,color:T.TEXT,lineHeight:1,fontFamily:T.SANS,letterSpacing:'-0.5px'}}>{props.val}</div>
          {props.sub ? <div style={{fontSize:10,color:T.TEXT3,marginTop:5,fontFamily:T.SANS}}>{props.sub}</div> : null}
        </div>
        {props.icon ? <span style={{fontSize:17,opacity:0.55,flexShrink:0}}>{props.icon}</span> : null}
      </div>
    </div>
  );
}

// ── Props compartidas para recharts en tema oscuro ──
var chartGrid = { strokeDasharray: '3 3', stroke: T.BORDER, vertical: false };
var chartAxis = { tick: { fontSize: 10, fill: T.TEXT3, fontFamily: T.SANS }, axisLine: { stroke: T.BORDER2 }, tickLine: false };
var chartTooltip = {
  contentStyle: { background: T.BG3, border: '1px solid ' + T.BORDER2, borderRadius: 8, fontFamily: T.SANS, fontSize: 12, boxShadow: T.SHADOW.pop },
  labelStyle: { color: T.TEXT, fontWeight: 600 },
  itemStyle: { color: T.TEXT2 },
  cursor: { fill: 'rgba(61,126,255,0.06)' }
};

function Pill(props) {
  if (!props.v) return null;
  var col = props.v==='APROBADO'||props.v==='BAJO' ? T.GREEN : props.v==='CONDICIONAL'||props.v==='MEDIO' ? T.AMBER : props.v==='MEDIO-ALTO' ? T.AMBER : T.RED;
  var bg = props.v==='APROBADO'||props.v==='BAJO' ? 'rgba(0,230,118,0.12)' : props.v==='CONDICIONAL'||props.v==='MEDIO' ? 'rgba(255,184,48,0.12)' : props.v==='MEDIO-ALTO' ? 'rgba(255,140,0,0.12)' : 'rgba(255,68,85,0.12)';
  return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:2,background:bg,color:col,fontWeight:600,fontSize:10,letterSpacing:'0.5px'}}>{props.v}</span>;
}

function Badge(props) { return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:2,background:'rgba(59,109,170,0.2)',color:T.CYAN,fontWeight:600,fontSize:10,letterSpacing:'0.5px'}}>{props.label}</span>; }

function SevBadge(props) { return <Badge label={props.sev} col={sevColor(props.sev)}/>; }

function ReportModal(props) {
  var iRef = useRef();
  var ready = useState(false);
  var setReady = ready[1];
  ready = ready[0];
  useEffect(function() {
    if (!iRef.current || !props.html) return;
    var blob = new Blob([props.html], { type:'text/html' });
    var url = URL.createObjectURL(blob);
    iRef.current.src = url;
    iRef.current.onload = function() { setReady(true); };
    return function() { URL.revokeObjectURL(url); };
  }, [props.html]);
  return (
    <div style={{position:'fixed',inset:0,background:T.SCRIM,zIndex:2000,display:'flex',flexDirection:'column'}}>
      <div style={{background:T.BG3,color:T.TEXT,padding:'10px 18px',borderBottom:'1px solid '+T.BORDER,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <span style={{fontWeight:700,fontSize:14}}>Vista previa del informe</span>
        <div style={{display:'flex',gap:8}}>
          {ready ? <button onClick={function(){iRef.current.contentWindow.print();}} style={{background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'6px 16px',cursor:'pointer',fontWeight:700}}>🖨 Imprimir / PDF</button> : null}
          <button onClick={props.onClose} style={{background:'rgba(255,68,85,0.15)',color:T.RED,border:'1px solid rgba(255,68,85,0.3)',borderRadius:3,padding:'6px 14px',cursor:'pointer',fontWeight:700}}>✕ Cerrar</button>
        </div>
      </div>
      <iframe ref={iRef} style={{flex:1,border:'none',background:T.BG2}} title="Informe"/>
    </div>
  );
}

// ── Primitivas de tabla (T2d) ───────────────────────────────────────────────
// Estilos base para tablas de datos. Legajos.jsx todavía usa su implementación
// propia equivalente; migrarla acá quedó como tarea de limpieza para T8.
var TH = {position:'sticky',top:0,zIndex:2,background:T.BG3,color:T.TEXT3,padding:'9px 10px',textAlign:'left',fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS,borderBottom:'1px solid '+T.BORDER2,whiteSpace:'nowrap'};
var TD = {padding:'8px 10px',borderBottom:'1px solid '+T.BORDER,fontSize:12,verticalAlign:'middle',fontFamily:T.SANS};

// Header de columna ordenable. props: k, label, sortBy {k,d}, onSort(k), extra
function SortTh(props) {
  var on = props.sortBy && props.sortBy.k === props.k;
  var st = Object.assign({}, TH, props.extra||{}, {cursor:'pointer',userSelect:'none'});
  if (on) st.color = T.ACCENT;
  return (
    <th onClick={function(){props.onSort(props.k);}} style={st} title={'Ordenar por ' + props.label}>
      {props.label}<span style={{marginLeft:5,color:T.ACCENT,opacity:on?1:0}}>{props.sortBy.d===1?'\u2191':'\u2193'}</span>
    </th>
  );
}

// Contenedor de tabla con la elevación estándar de card
function TableCard(props) {
  return (
    <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:T.RADIUS.md,boxShadow:T.SHADOW.card}}>
      <table style={{width:'100%',borderCollapse:'separate',borderSpacing:0}}>{props.children}</table>
    </div>
  );
}

// Panel lateral derecho. Cierra con Esc o clic en el backdrop.
function Drawer(props) {
  useEffect(function() {
    function onKey(e) { if (e.key === 'Escape') props.onClose(); }
    window.addEventListener('keydown', onKey);
    return function(){ window.removeEventListener('keydown', onKey); };
  }, [props.onClose]);
  return (
    <div onClick={props.onClose} style={{position:'fixed',inset:0,background:T.SCRIM,backdropFilter:'blur(1px)',zIndex:1500,display:'flex',justifyContent:'flex-end',animation:'fadeIn 0.15s ease-out'}}>
      <div onClick={function(e){e.stopPropagation();}}
        style={{width:props.width||560,maxWidth:'94vw',height:'100vh',overflowY:'auto',background:T.BG,borderLeft:'1px solid '+T.BORDER2,boxShadow:T.SHADOW.pop,padding:22,animation:'drawerIn 0.18s ease-out'}}>
        <button onClick={props.onClose} style={{background:'transparent',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm,color:T.TEXT3,cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:T.SANS,padding:'5px 11px',marginBottom:14}}>✕ Cerrar · Esc</button>
        {props.children}
      </div>
    </div>
  );
}

// Estado vacío estándar
function EmptyState(props) {
  return (
    <div style={{background:T.BG2,border:'1px dashed '+T.BORDER2,borderRadius:T.RADIUS.md,padding:'44px 24px',textAlign:'center'}}>
      <div style={{fontSize:28,marginBottom:9,opacity:0.45}}>{props.icon||'—'}</div>
      <div style={{fontSize:14,fontWeight:600,color:T.TEXT,fontFamily:T.SANS}}>{props.title}</div>
      {props.sub ? <div style={{fontSize:12,color:T.TEXT3,marginTop:5,fontFamily:T.SANS}}>{props.sub}</div> : null}
    </div>
  );
}

export { Card, StatCard, Pill, Badge, SevBadge, ReportModal, chartGrid, chartAxis, chartTooltip, TH, TD, SortTh, TableCard, Drawer, EmptyState };
