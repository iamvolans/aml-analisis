import { useState, useEffect } from "react";
import { ROL_LABELS, auditLog, serverCambiarPassword, serverCambiarRol, serverCrearUsuario, serverGetUsuarios, serverToggleActivo } from "../lib/auth";
import { C, T } from "../lib/theme";

function UsuariosView(props) {
  var currentUser = props.currentUser;
  var usuariosState = useState([]); var usuarios=usuariosState[0]; var setUsuarios=usuariosState[1];
  var loadingState = useState(true); var loading=loadingState[0]; var setLoading=loadingState[1];
  var formState = useState(null); var form=formState[0]; var setForm=formState[1];
  var errState = useState(''); var err=errState[0]; var setErr=errState[1];
  var okState = useState(''); var ok=okState[0]; var setOk=okState[1];
  var passModalState = useState(null); var passModal=passModalState[0]; var setPassModal=passModalState[1];
  var newPassState = useState(''); var newPass=newPassState[0]; var setNewPass=newPassState[1];

  function cargarUsuarios() {
    setLoading(true);
    serverGetUsuarios().then(function(res){
      setUsuarios(res.usuarios || []);
      setLoading(false);
    }).catch(function(){ setLoading(false); });
  }

  useEffect(cargarUsuarios, []);

  async function handleCrear() {
    if (!form.email||!form.password||!form.nombre) { setErr('Completá todos los campos.'); return; }
    if (form.password.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return; }
    setErr('');
    var res = await serverCrearUsuario(form.email, form.password, form.nombre, form.rol||'analista');
    if (res.ok) { setOk('Usuario creado correctamente.'); setForm(null); cargarUsuarios(); setTimeout(function(){setOk('');},3000); }
    else setErr(res.error||'Error al crear usuario.');
  }

  async function handlePassword() {
    if (!newPass || newPass.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return; }
    var res = await serverCambiarPassword(passModal.id, newPass);
    if (res.ok) { setOk('Contraseña actualizada.'); setPassModal(null); setNewPass(''); setTimeout(function(){setOk('');},3000); }
    else setErr(res.error||'Error al cambiar contraseña.');
  }

  async function handleRol(userId, rol) {
    var res = await serverCambiarRol(userId, rol);
    if (res.ok) { setErr(''); cargarUsuarios(); auditLog(currentUser,'cambio_rol','usuario',userId,{rol:rol}); }
    else setErr(res.error||'Error al cambiar rol.');
  }

  async function handleToggle(u) {
    var res = await serverToggleActivo(u.id, !u.activo);
    if (res.ok) { setErr(''); cargarUsuarios(); auditLog(currentUser,u.activo?'desactivar_usuario':'activar_usuario','usuario',u.id,{email:u.email}); }
    else setErr(res.error||'Error al actualizar usuario.');
  }

  var ROL_COL = { admin:T.RED, oficial_cumplimiento:'#A855F7', supervisor:T.CYAN, analista:T.GREEN, readonly:T.TEXT3 };

  return (
    <div style={{padding:22}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:15,fontWeight:600,color:T.TEXT,letterSpacing:'1px',margin:0}}>👥 Gestión de Usuarios</h2>
        <button onClick={function(){setForm({email:'',password:'',nombre:'',rol:'analista'});setErr('');}}
          style={{background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'8px 16px',cursor:'pointer',fontWeight:700,fontSize:13}}>
          + Nuevo usuario
        </button>
      </div>

      {ok && <div style={{background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.2)',borderRadius:4,padding:'10px 14px',marginBottom:12,color:T.GREEN,fontWeight:600,fontSize:12}}>✅ {ok}</div>}
      {err && <div style={{background:'rgba(255,68,85,0.08)',border:'1px solid rgba(255,68,85,0.2)',borderRadius:4,padding:'10px 14px',marginBottom:12,color:T.RED,fontWeight:600,fontSize:12}}>⚠ {err}</div>}

      {/* Formulario nuevo usuario */}
      {form && (
        <div style={{background:T.BG3,border:'2px solid #2471A3',borderRadius:6,padding:'18px',marginBottom:18}}>
          <div style={{fontWeight:600,color:T.TEXT,fontSize:14,marginBottom:14}}>Nuevo usuario</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Nombre completo</label>
              <input value={form.nombre} onChange={function(e){setForm(Object.assign({},form,{nombre:e.target.value}));}}
                placeholder="Juan Pérez" style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Email</label>
              <input type="email" value={form.email} onChange={function(e){setForm(Object.assign({},form,{email:e.target.value}));}}
                placeholder="analista@goat.ar" style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Contraseña inicial</label>
              <input type="password" value={form.password} onChange={function(e){setForm(Object.assign({},form,{password:e.target.value}));}}
                placeholder="Mínimo 6 caracteres" style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:T.TEXT2,display:'block',marginBottom:3}}>Rol</label>
              <select value={form.rol} onChange={function(e){setForm(Object.assign({},form,{rol:e.target.value}));}}
                style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'8px 10px',fontSize:13,boxSizing:'border-box',color:T.TEXT}}>
                <option value="analista">📋 Analista</option>
                <option value="supervisor">👁 Supervisor</option>
                <option value="oficial_cumplimiento">⚖️ Oficial de Cumplimiento</option>
                <option value="admin">🔑 Admin</option>
                <option value="readonly">👀 Solo lectura</option>
              </select>
            </div>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button onClick={function(){setForm(null);setErr('');}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 16px',cursor:'pointer',fontSize:12}}>Cancelar</button>
            <button onClick={handleCrear} style={{background:'rgba(0,230,118,0.15)',color:T.GREEN,border:'1px solid rgba(0,230,118,0.3)',borderRadius:3,padding:'8px 20px',cursor:'pointer',fontWeight:700,fontSize:12}}>✓ Crear usuario</button>
          </div>
        </div>
      )}

      {/* Modal cambiar contraseña */}
      {passModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:T.BG2,borderRadius:8,padding:28,width:380,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
            <div style={{fontWeight:600,color:T.TEXT,fontSize:15,marginBottom:4}}>Cambiar contraseña</div>
            <div style={{fontSize:12,color:T.TEXT2,marginBottom:16}}>{passModal.nombre} — {passModal.email}</div>
            <input type="password" value={newPass} onChange={function(e){setNewPass(e.target.value);setErr('');}}
              placeholder="Nueva contraseña (mínimo 6 caracteres)"
              style={{width:'100%',border:'1px solid '+T.BORDER,borderRadius:4,padding:'10px 12px',fontSize:14,boxSizing:'border-box',marginBottom:12}}/>
            {err && <div style={{fontSize:12,color:T.RED,marginBottom:10}}>⚠ {err}</div>}
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={function(){setPassModal(null);setNewPass('');setErr('');}} style={{background:T.BG4,color:T.TEXT2,border:'1px solid '+T.BORDER2,borderRadius:3,padding:'8px 16px',cursor:'pointer',fontSize:12}}>Cancelar</button>
              <button onClick={handlePassword} style={{background:C.AC,color:'#FFFFFF',border:'none',borderRadius:3,padding:'8px 20px',cursor:'pointer',fontWeight:700,fontSize:12}}>💾 Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de usuarios */}
      {loading ? <div style={{textAlign:'center',padding:30,color:T.TEXT2}}>Cargando usuarios...</div> : (
        <div style={{background:T.BG2,border:'1px solid '+T.BORDER,borderRadius:6,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:C.AO}}>
                {['Nombre','Email','Rol','Estado','Acciones'].map(function(h){return <th key={h} style={{color:'white',padding:'10px 14px',textAlign:'left',fontWeight:700,fontSize:12}}>{h}</th>;})}
              </tr>
            </thead>
            <tbody>
              {usuarios.map(function(u,i){
                var rolCol = ROL_COL[u.rol]||'#888';
                var esSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id} style={{background:i%2===0?T.BG3:T.BG2,opacity:u.activo?1:0.6}}>
                    <td style={{padding:'10px 14px',fontWeight:500,color:T.TEXT2}}>
                      {u.nombre} {esSelf && <span style={{background:C.AC,color:'white',borderRadius:4,padding:'1px 6px',fontSize:9,marginLeft:4}}>Vos</span>}
                    </td>
                    <td style={{padding:'10px 14px',color:T.TEXT2,fontSize:12}}>{u.email}</td>
                    <td style={{padding:'10px 14px'}}>
                      {esSelf ? (
                        <span style={{background:rolCol,color:'white',borderRadius:6,padding:'2px 10px',fontSize:11,fontWeight:700}}>{ROL_LABELS[u.rol]||u.rol}</span>
                      ) : (
                        <select value={u.rol} onChange={function(e){handleRol(u.id,e.target.value);}}
                          style={{border:'1px solid '+rolCol,borderRadius:6,padding:'3px 8px',fontSize:11,fontWeight:700,color:rolCol,background:T.BG2,cursor:'pointer'}}>
                          {Object.keys(ROL_LABELS).map(function(r){return <option key={r} value={r}>{ROL_LABELS[r]}</option>;})}
                        </select>
                      )}
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{background:u.activo?'rgba(0,230,118,0.1)':T.BG3,color:u.activo?T.GREEN:T.TEXT3,border:'1px solid '+(u.activo?C.VERDE:'#ddd'),borderRadius:8,padding:'2px 10px',fontSize:11,fontWeight:700}}>
                        {u.activo ? '● Activo' : '○ Inactivo'}
                      </span>
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={function(){setPassModal(u);setNewPass('');setErr('');}}
                          style={{background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:11,color:T.TEXT}}>
                          🔑 Password
                        </button>
                        {!esSelf && (
                          <button onClick={function(){handleToggle(u);}}
                            style={{background:u.activo?'rgba(255,184,48,0.1)':'rgba(0,230,118,0.1)',border:'1px solid '+(u.activo?T.AMBER:T.GREEN),borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:11,color:u.activo?T.AMBER:T.GREEN}}>
                            {u.activo ? '⏸ Desactivar' : '▶ Activar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{marginTop:14,padding:'10px 14px',background:T.BG3,border:'1px solid '+T.BORDER,borderRadius:4,fontSize:11,color:T.TEXT2}}>
        <strong>Roles disponibles:</strong> Admin (acceso total) · Oficial de Cumplimiento (todo excepto usuarios) · Supervisor (crear/editar/aprobar) · Analista (crear/editar) · Solo lectura (solo ver)
      </div>
    </div>
  );
}

export default UsuariosView;
