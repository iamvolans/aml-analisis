import { useState } from "react";
import { serverLogin } from "../lib/auth";
import { C, T } from "../lib/theme";

function LoginScreen(props) {
  var emailState = useState(''); var email=emailState[0]; var setEmail=emailState[1];
  var passState = useState(''); var pass=passState[0]; var setPass=passState[1];
  var errState = useState(''); var err=errState[0]; var setErr=errState[1];
  var showPassState = useState(false); var showPass=showPassState[0]; var setShowPass=showPassState[1];
  var loadingState = useState(false); var loggingIn=loadingState[0]; var setLoggingIn=loadingState[1];

  async function handleLogin() {
    if (!email.trim() || !pass.trim()) { setErr('Ingresá email y contraseña.'); return; }
    setLoggingIn(true); setErr('');
    try {
      var res = await serverLogin(email.trim(), pass);
      if (res.ok && res.usuario) {
        props.onLogin(Object.assign({}, res.usuario, {
          token: res.token || '',
          refreshToken: res.refreshToken || '',
          expiresIn: res.expiresIn || 3600
        }));
      } else {
        setErr(res.error || 'Email o contraseña incorrectos.');
      }
    } catch(e) {
      setErr('Error de conexión. Verificá tu internet.');
    }
    setLoggingIn(false);
  }

  function handleKey(e) { if (e.key === 'Enter') handleLogin(); }

  return (
    <div style={{minHeight:'100vh',background:T.BG,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:T.MONO}}>
      <div style={{textAlign:'center',marginBottom:32}}>
        <div style={{fontFamily:T.MONO,marginBottom:8}}>
          <div style={{width:40,height:40,background:C.AC,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',borderRadius:3,letterSpacing:'-0.5px',margin:'0 auto 12px'}}>RB</div>
        </div>
        <div style={{color:T.TEXT,fontWeight:700,fontSize:18,letterSpacing:'3px',textTransform:'uppercase'}}>SISTEMA AML & KYB</div>
        <div style={{color:T.TEXT3,fontSize:10,marginTop:6,letterSpacing:'2px'}}>GOAT S.A. // COMPLIANCE & AML</div>
        <div style={{color:T.TEXT4,fontSize:9,marginTop:3,letterSpacing:'1px'}}>UIF/BCRA REGULATED · v2.4.0</div>
      </div>

      <div style={{background:T.BG2,border:'1px solid '+T.BORDER2,borderRadius:4,padding:32,width:380,maxWidth:'90vw'}}>
        <div style={{fontWeight:600,color:T.TEXT,fontSize:13,marginBottom:4,letterSpacing:'1px',textTransform:'uppercase'}}>Acceso al sistema</div>
        <div style={{fontSize:11,color:T.TEXT3,marginBottom:20,fontFamily:T.MONO}}>Ingresá con tu email de compliance</div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:9,color:T.TEXT3,fontWeight:400,display:'block',marginBottom:5,letterSpacing:'1px',textTransform:'uppercase'}}>Email</label>
          <input
            type="email" value={email}
            onChange={function(e){setEmail(e.target.value);setErr('');}} onKeyDown={handleKey}
            placeholder="analista@goat.ar"
            autoComplete="email"
            style={{width:'100%',border:'1px solid '+T.BORDER2,borderRadius:3,padding:'10px 12px',fontSize:13,fontFamily:T.MONO,background:T.BG4,color:T.TEXT,outline:'none',boxSizing:'border-box'}}
          />
        </div>

        <div style={{marginBottom:20}}>
          <label style={{fontSize:9,color:T.TEXT3,fontWeight:400,display:'block',marginBottom:5,letterSpacing:'1px',textTransform:'uppercase'}}>Contraseña</label>
          <div style={{display:'flex',gap:6}}>
            <input
              type={showPass?'text':'password'} value={pass}
              onChange={function(e){setPass(e.target.value);setErr('');}} onKeyDown={handleKey}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{flex:1,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'10px 12px',fontSize:13,fontFamily:T.MONO,background:T.BG4,color:T.TEXT,outline:'none'}}
            />
            <button onClick={function(){setShowPass(!showPass);}} style={{background:T.BG3,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'10px 12px',cursor:'pointer',fontSize:14,color:T.TEXT3}}>{showPass?'🙈':'👁'}</button>
          </div>
        </div>

        {err && <div style={{background:'rgba(255,68,85,0.1)',border:'1px solid rgba(255,68,85,0.3)',borderRadius:3,padding:'9px 12px',marginBottom:16,fontSize:11,fontFamily:T.MONO,color:T.RED,fontWeight:500}}>⚠ {err}</div>}

        <button
          onClick={handleLogin}
          disabled={loggingIn}
          style={{width:'100%',background:loggingIn?T.BG3:C.AC,color:'white',border:'none',borderRadius:3,padding:'12px 0',cursor:loggingIn?'not-allowed':'pointer',fontWeight:600,fontSize:12,letterSpacing:'2px',fontFamily:T.MONO,textTransform:'uppercase'}}
        >
          {loggingIn ? '// verificando...' : '→ INGRESAR AL SISTEMA'}
        </button>

        <div style={{textAlign:'center',marginTop:18,fontSize:10,color:T.TEXT4,fontFamily:T.MONO}}>
          // acceso restringido — solo compliance<br/>
          GOAT S.A. — CUIT 30-71703953-6
        </div>
      </div>

      <div style={{color:T.TEXT4,fontSize:9,marginTop:20,textAlign:'center',fontFamily:T.MONO,letterSpacing:'1px'}}>
        REBIT_AML v2.4.0 // {new Date().getFullYear()}
      </div>
    </div>
  );
}

export default LoginScreen;
