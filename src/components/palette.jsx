// ═══════════════════════════════════════════════════════════════════════════
// palette.jsx — Command Palette (Cmd+K / Ctrl+K)
// ═══════════════════════════════════════════════════════════════════════════
// Búsqueda instantánea: vistas de la app + legajos por razón social o CUIT.
// Navegación con ↑/↓, Enter para abrir, Esc para cerrar.

import { useState, useEffect, useRef } from "react";
import { T } from "../lib/theme";
import { segColor } from "../lib/utils";

export default function CommandPalette(props) {
  var open = props.open, onClose = props.onClose, legajos = props.legajos || [];
  var nav = props.nav || [], onNavigate = props.onNavigate, onOpenLegajo = props.onOpenLegajo;

  var qState = useState(''); var q = qState[0]; var setQ = qState[1];
  var iState = useState(0); var idx = iState[0]; var setIdx = iState[1];
  var inputRef = useRef(null);

  useEffect(function() {
    if (open) { setQ(''); setIdx(0); setTimeout(function(){ if(inputRef.current) inputRef.current.focus(); }, 10); }
  }, [open]);

  // ── Resultados ──
  var ql = q.trim().toLowerCase();
  var navItems = nav
    .filter(function(n){ return !ql || n[2].toLowerCase().indexOf(ql) >= 0; })
    .map(function(n){ return { kind:'nav', id:n[0], Icon:n[1], label:n[2] }; });
  var legItems = !ql ? [] : legajos
    .filter(function(l){
      var name = (l.razonSocial||'').toLowerCase();
      var cuit = (l.cuit||'').replace(/-/g,'');
      return name.indexOf(ql) >= 0 || cuit.indexOf(ql.replace(/-/g,'')) >= 0;
    })
    .slice(0, 8)
    .map(function(l){ return { kind:'legajo', legajo:l, label:l.razonSocial||'Sin nombre', sub:l.cuit||'—', seg:l.segmento }; });
  var items = navItems.concat(legItems);
  var safeIdx = Math.min(idx, Math.max(items.length - 1, 0));

  function pick(item) {
    if (!item) return;
    if (item.kind === 'nav') onNavigate(item.id);
    else onOpenLegajo(item.legajo);
    onClose();
  }

  useEffect(function() {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(function(i){ return Math.min(i+1, items.length-1); }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(function(i){ return Math.max(i-1, 0); }); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(items[safeIdx]); }
    }
    window.addEventListener('keydown', onKey);
    return function(){ window.removeEventListener('keydown', onKey); };
  }, [open, items.length, safeIdx, q]);

  if (!open) return null;

  var lastKind = null;

  return (
    <div onClick={onClose}
      style={{position:'fixed',inset:0,background:'rgba(4,7,12,0.65)',backdropFilter:'blur(2px)',zIndex:4800,display:'flex',justifyContent:'center',alignItems:'flex-start',paddingTop:'16vh'}}>
      <div onClick={function(e){e.stopPropagation();}}
        style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.md+2,width:560,maxWidth:'92vw',boxShadow:T.SHADOW.pop,overflow:'hidden',fontFamily:T.SANS}}>

        {/* Input */}
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',borderBottom:'1px solid '+T.BORDER}}>
          <span style={{color:T.TEXT3,fontSize:14}}>🔍</span>
          <input ref={inputRef} value={q}
            onChange={function(e){ setQ(e.target.value); setIdx(0); }}
            placeholder="Buscar legajo por nombre o CUIT, o ir a una vista…"
            style={{flex:1,background:'transparent',border:'none',outline:'none',boxShadow:'none',color:T.TEXT,fontSize:14,fontFamily:T.SANS}}/>
          <span style={{fontSize:10,color:T.TEXT4,fontFamily:T.MONO,border:'1px solid '+T.BORDER2,borderRadius:4,padding:'2px 6px'}}>ESC</span>
        </div>

        {/* Resultados */}
        <div style={{maxHeight:'46vh',overflowY:'auto',padding:'6px'}}>
          {items.length === 0 && (
            <div style={{padding:'24px 16px',textAlign:'center',color:T.TEXT3,fontSize:13}}>Sin resultados para "{q}"</div>
          )}
          {items.map(function(item, i) {
            var header = null;
            if (item.kind !== lastKind) {
              lastKind = item.kind;
              header = (
                <div key={'h'+i} style={{padding:'8px 12px 4px',fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:T.TEXT4}}>
                  {item.kind === 'nav' ? 'Ir a' : 'Legajos'}
                </div>
              );
            }
            var active = i === safeIdx;
            var Icon = item.Icon;
            return (
              <div key={item.kind + i}>
                {header}
                <div onClick={function(){pick(item);}} onMouseEnter={function(){setIdx(i);}}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:T.RADIUS.sm+2,cursor:'pointer',
                    background:active?T.ACCENT_SOFT:'transparent',color:active?T.TEXT:T.TEXT2,transition:'background 0.08s'}}>
                  {item.kind === 'nav'
                    ? <Icon size={15} color={active?T.ACCENT:T.TEXT3}/>
                    : <span style={{width:8,height:8,borderRadius:99,background:segColor(item.seg||'MEDIO'),flexShrink:0}}/>}
                  <span style={{flex:1,fontSize:13,fontWeight:active?600:400}}>{item.label}</span>
                  {item.sub && <span style={{fontSize:11,color:T.TEXT3,fontFamily:T.MONO}}>{item.sub}</span>}
                  {active && <span style={{fontSize:10,color:T.TEXT4,fontFamily:T.MONO}}>↵</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer de ayuda */}
        <div style={{display:'flex',gap:14,padding:'8px 16px',borderTop:'1px solid '+T.BORDER,fontSize:10,color:T.TEXT4,fontFamily:T.SANS}}>
          <span>↑↓ navegar</span><span>↵ abrir</span><span>esc cerrar</span>
        </div>
      </div>
    </div>
  );
}
