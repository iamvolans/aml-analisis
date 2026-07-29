import { useState, useEffect, useRef } from "react";
import { T } from "../lib/theme";
import { sevColor } from "../lib/utils";

// UI
function Card(props) {
  return (
    <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:4,marginBottom:14,overflow:'hidden'}}>
      {props.title ? <div style={{background:T.BG3,borderBottom:'1px solid '+T.BORDER,padding:'9px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontWeight:600,fontSize:12,color:T.TEXT2,letterSpacing:'1px',textTransform:'uppercase'}}>{props.title}</span>
        {props.actions ? props.actions : null}
      </div> : null}
      <div style={{padding:16}}>{props.children}</div>
    </div>
  );
}

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
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:2000,display:'flex',flexDirection:'column'}}>
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

export { Card, Pill, Badge, SevBadge, ReportModal };
