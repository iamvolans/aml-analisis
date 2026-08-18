import { Card } from "../components/ui";
import { SCREENING } from "../lib/constants";
import { T } from "../lib/theme";

function NormativaView() {
  var normas = [
    {cod:'Ley 25.246',nombre:'Encubrimiento y lavado de activos',art:'Art. 20 - Sujetos obligados'},
    {cod:'Res. UIF 30/2017',nombre:'Prevencion del lavado - PSP',art:'Onboarding / DDC corporativa'},
    {cod:'Res. UIF 156/2018',nombre:'Beneficiario final - identificacion',art:'UBO >10% participacion'},
    {cod:'Res. UIF 76/2019',nombre:'Gestion de riesgos ML/FT',art:'Risk assessment periodico'},
    {cod:'Res. UIF 112/2021',nombre:'Onboarding digital y verificacion remota',art:'KYC/KYB digital'},
    {cod:'Com. BCRA A 8298',nombre:'Requisitos operativos PSP - billeteras',art:'Limites, topes, reportes'},
    {cod:'Com. BCRA A 6463',nombre:'Cuentas de pago - apertura y operatoria',art:'CVU y cuentas virtuales'},
    {cod:'Decreto 489/2019',nombre:'Personas Expuestas Politicamente (PEP)',art:'Definicion y categorias PEP'},
    {cod:'GAFI - 40 Recomendaciones',nombre:'Estandares internacionales AML/CFT',art:'R.10-R.20 Debida diligencia'},
    {cod:'Ley 27.446',nombre:'Sistema Nacional ALA/CFT',art:'Coordinacion institucional'},
    {cod:'Res. UIF 2/2012',nombre:'Reporte de Operaciones Sospechosas (ROS)',art:'Plazos y formato ROS'}
  ];
  return (
    <div style={{padding:22}}>
      <h2 style={{color:T.TEXT,margin:'0 0 16px',fontSize:19,fontWeight:700,}}>Normativa Aplicable</h2>
      <Card title="Marco regulatorio AML/CFT — Argentina">
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['Normativa','Descripcion','Articulo / Alcance'].map(function(h,i){return <th key={i} style={{background:T.BG3,color:T.TEXT3,padding:'9px 10px',textAlign:'left',fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS,borderBottom:'1px solid '+T.BORDER2}}>{h}</th>;})}</tr></thead>
          <tbody>{normas.map(function(n,i){return(
            <tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
              <td style={{padding:'6px 10px',fontWeight:600,color:T.CYAN,whiteSpace:'nowrap'}}>{n.cod}</td>
              <td style={{padding:'6px 10px'}}>{n.nombre}</td>
              <td style={{padding:'6px 10px',color:T.TEXT2,fontSize:11}}>{n.art}</td>
            </tr>
          );})}</tbody>
        </table>
      </Card>
      <Card title="Fuentes de screening — 13 fuentes">
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['#','Fuente','Jurisdiccion'].map(function(h,i){return <th key={i} style={{background:T.BG3,color:T.TEXT3,padding:'9px 10px',textAlign:'left',fontSize:10,fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',fontFamily:T.SANS,borderBottom:'1px solid '+T.BORDER2}}>{h}</th>;})}</tr></thead>
          <tbody>{SCREENING.map(function(s,i){return(
            <tr key={i} style={{background:i%2===0?T.BG3:T.BG2}}>
              <td style={{padding:'6px 10px',fontWeight:600,color:T.CYAN}}>{i+1}</td>
              <td style={{padding:'6px 10px'}}><strong>{s.n}</strong></td>
              <td style={{padding:'6px 10px',color:T.TEXT2}}>{s.j}</td>
            </tr>
          );})}</tbody>
        </table>
      </Card>
    </div>
  );
}

export default NormativaView;
