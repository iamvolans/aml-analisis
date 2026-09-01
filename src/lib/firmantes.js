// ═══════════════════════════════════════════════════════════════════════════
// firmantes.js — Responsables que suscriben los informes
// ═══════════════════════════════════════════════════════════════════════════
// Los informes se emiten para ser firmados. Preimprimir el nombre en la línea
// de firma ahorra trabajo, pero también compromete a esa persona: si el bloque
// del analista trajera siempre el mismo nombre, un informe trabajado por otro
// analista saldría atribuido a quien no lo hizo.
//
// Por eso el bloque del analista muestra a QUIEN GENERÓ el informe cuando su
// rol es de análisis, y recae en el responsable configurado solamente cuando
// quien genera no es analista —por ejemplo, cuando lo emite el propio Oficial
// de Cumplimiento—.
//
// Al cambiar de titular o de responsable, se edita únicamente este archivo.

var FIRMANTES = {
  // Oficial de Cumplimiento titular ante la UIF
  oficialCumplimiento: {
    nombre: 'Axel Iván Sánchez',
    cargo: 'Oficial de Cumplimiento',
  },
  // Reemplaza al titular en su ausencia
  oficialSuplente: {
    nombre: 'Germán Alberto Pizzano',
    cargo: 'Oficial de Cumplimiento Suplente',
  },
  // Analista al que se atribuyen los informes cuando quien los genera no
  // pertenece al equipo de análisis
  analistaResponsable: {
    nombre: 'Samy Ariel Aizen',
    cargo: 'Analista de Compliance',
  },
  // Tercera firma en los informes que la contemplan
  responsableCompliance: {
    nombre: 'Germán Alberto Pizzano',
    cargo: 'Responsable de Compliance',
  },
};

// Roles del sistema que se consideran de análisis
var ROLES_ANALISIS = ['analista', 'supervisor'];

// Devuelve quién firma como analista en un informe determinado.
function firmanteAnalista(usuario) {
  var u = usuario || {};
  var nombre = String(u.nombre || '').trim();
  // Se exige que el nombre sea el de una persona: algunos usuarios están dados
  // de alta con la denominación del cargo, que no sirve como firma.
  var esPersona = nombre && nombre.toLowerCase().indexOf('oficial de cumplimiento') < 0;
  if (esPersona && ROLES_ANALISIS.indexOf(u.rol) >= 0) {
    return { nombre: nombre, cargo: 'Analista de Compliance' };
  }
  return FIRMANTES.analistaResponsable;
}

function firmanteOC() { return FIRMANTES.oficialCumplimiento; }
function firmanteResponsable() { return FIRMANTES.responsableCompliance; }

export { FIRMANTES, ROLES_ANALISIS, firmanteAnalista, firmanteOC, firmanteResponsable };
