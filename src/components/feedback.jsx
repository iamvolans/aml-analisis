// ═══════════════════════════════════════════════════════════════════════════
// feedback.jsx — Toast + ConfirmDialog (reemplazo de alert()/confirm() nativos)
// ═══════════════════════════════════════════════════════════════════════════
// Uso desde cualquier módulo:
//   toast('Legajo guardado')                      → tipo auto-inferido
//   toast('mensaje', 'error'|'success'|'info')    → tipo explícito
//   var ok = await uiConfirm('¿Eliminar?', {danger:true})
//     → true (confirmar) | false (cancelar) | null (Esc/click afuera)
// <FeedbackHost/> debe estar montado una sola vez (lo hace App.jsx).
// Si el host no montó todavía, cae en window.alert/confirm como fallback.

import { useState, useEffect } from "react";
import { T } from "../lib/theme";

var _pushToast = null;
var _askConfirm = null;

export function toast(msg, type) {
  msg = String(msg);
  if (!type) {
    var m = msg.toLowerCase();
    if (m.indexOf('error') >= 0 || msg.indexOf('⚠') >= 0 || m.indexOf('no se pudo') >= 0 || m.indexOf('no contiene') >= 0 || m.indexOf('verific') >= 0 || m.indexOf('falta') >= 0) type = 'error';
    else if (m.indexOf('correctamente') >= 0 || m.indexOf('actualizad') >= 0 || m.indexOf('importad') >= 0 || m.indexOf('reemplazad') >= 0 || m.indexOf('guardad') >= 0 || m.indexOf('cread') >= 0 || m.indexOf('generad') >= 0 || m.indexOf('copiad') >= 0 || msg.indexOf('✅') >= 0 || msg.indexOf('✓') >= 0) type = 'success';
    else type = 'info';
  }
  if (_pushToast) _pushToast({ id: Math.random().toString(36).slice(2), msg: msg, type: type });
  else window.alert(msg);
}

export function uiConfirm(msg, opts) {
  if (!_askConfirm) return Promise.resolve(window.confirm(String(msg)));
  return _askConfirm(String(msg), opts || {});
}

var TOAST_COL = function(type) {
  return type === 'error' ? T.RED : type === 'success' ? T.GREEN : T.ACCENT;
};

export function FeedbackHost() {
  var tState = useState([]); var toasts = tState[0]; var setToasts = tState[1];
  var cState = useState(null); var confirmReq = cState[0]; var setConfirmReq = cState[1];

  useEffect(function() {
    _pushToast = function(t) {
      setToasts(function(prev) { return prev.concat([t]).slice(-4); });
      setTimeout(function() {
        setToasts(function(prev) { return prev.filter(function(x) { return x.id !== t.id; }); });
      }, 4500);
    };
    _askConfirm = function(msg, opts) {
      return new Promise(function(resolve) {
        setConfirmReq({ msg: msg, opts: opts, resolve: resolve });
      });
    };
    return function() { _pushToast = null; _askConfirm = null; };
  }, []);

  function closeConfirm(result) {
    if (confirmReq) { confirmReq.resolve(result); setConfirmReq(null); }
  }

  // Teclado del confirm: Enter = confirmar, Esc = descartar (null)
  useEffect(function() {
    if (!confirmReq) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeConfirm(null); }
      if (e.key === 'Enter')  { e.preventDefault(); closeConfirm(true); }
    }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [confirmReq]);

  var opts = (confirmReq && confirmReq.opts) || {};
  var danger = opts.danger !== false; // por defecto, tono de precaución

  return (
    <>
      {/* ── Stack de toasts ── */}
      <div style={{position:'fixed',top:18,right:18,zIndex:5000,display:'flex',flexDirection:'column',gap:8,maxWidth:380,pointerEvents:'none'}}>
        {toasts.map(function(t) {
          return (
            <div key={t.id} style={{pointerEvents:'auto',background:T.BG3,border:'1px solid '+T.BORDER2,borderLeft:'3px solid '+TOAST_COL(t.type),borderRadius:T.RADIUS.sm+2,padding:'11px 14px',boxShadow:T.SHADOW.pop,fontFamily:T.SANS,fontSize:12.5,color:T.TEXT,lineHeight:1.5,whiteSpace:'pre-line',display:'flex',gap:10,alignItems:'flex-start'}}>
              <span style={{color:TOAST_COL(t.type),fontWeight:700,flexShrink:0,fontSize:13}}>
                {t.type === 'error' ? '✕' : t.type === 'success' ? '✓' : 'ℹ'}
              </span>
              <span style={{flex:1}}>{t.msg}</span>
              <button onClick={function(){setToasts(function(prev){return prev.filter(function(x){return x.id!==t.id;});});}}
                style={{background:'none',border:'none',color:T.TEXT3,cursor:'pointer',padding:0,fontSize:12,flexShrink:0}}>✕</button>
            </div>
          );
        })}
      </div>

      {/* ── ConfirmDialog ── */}
      {confirmReq && (
        <div onClick={function(){closeConfirm(null);}}
          style={{position:'fixed',inset:0,background:'rgba(4,7,12,0.65)',backdropFilter:'blur(2px)',zIndex:4500,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={function(e){e.stopPropagation();}}
            style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.md,padding:'22px 24px',width:420,maxWidth:'90vw',boxShadow:T.SHADOW.pop,fontFamily:T.SANS}}>
            <div style={{fontSize:14,fontWeight:600,color:T.TEXT,marginBottom:6}}>
              {opts.title || 'Confirmar acción'}
            </div>
            <div style={{fontSize:13,color:T.TEXT2,lineHeight:1.6,whiteSpace:'pre-line',marginBottom:20}}>
              {confirmReq.msg}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={function(){closeConfirm(false);}}
                style={{padding:'8px 16px',border:'1px solid '+T.BORDER2,borderRadius:T.RADIUS.sm+2,background:'transparent',color:T.TEXT2,cursor:'pointer',fontSize:12.5,fontWeight:500,fontFamily:T.SANS,transition:T.TRANS}}>
                {opts.cancelLabel || 'Cancelar'}
              </button>
              <button onClick={function(){closeConfirm(true);}} autoFocus
                style={{padding:'8px 16px',border:'none',borderRadius:T.RADIUS.sm+2,background:danger?T.RED:T.ACCENT,color:'#fff',cursor:'pointer',fontSize:12.5,fontWeight:600,fontFamily:T.SANS,transition:T.TRANS}}>
                {opts.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
