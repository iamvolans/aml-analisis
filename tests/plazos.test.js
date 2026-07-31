// Tests de lib/casos.js y lib/vencimientos.js — los contadores de plazo.
// Acá lo que se rompe silenciosamente es un vencimiento mal calculado, que es
// justo lo que un panel de compliance no puede permitirse.

import { describe, it, expect } from 'vitest';
import { hitosSLA, slaCritico, cambiarEstadoCaso, nuevoCaso, getEstadoCaso, casosPendientesDeCrear, SLA } from '../src/lib/casos.js';
import { sumarMeses, vencimientosDeLegajo, baseActualizacion, ACTUALIZACION_LEGAJO, vencimientosPendientesDeCaso, esConfiable } from '../src/lib/vencimientos.js';
import { calcMetricas } from '../src/lib/aml.js';

// Fecha en formato es-AR a N días de hoy
function hace(dias) {
  const d = new Date(); d.setDate(d.getDate() - dias);
  return d.toLocaleDateString('es-AR');
}

describe('sumarMeses', () => {
  it('respeta el fin de mes: 31/01 + 1 mes = 28/02', () => {
    expect(sumarMeses('31/1/2026', 1).getDate()).toBe(28);
    expect(sumarMeses('31/1/2026', 1).getMonth()).toBe(1);
  });
  it('contempla años bisiestos', () => {
    expect(sumarMeses('31/1/2024', 1).getDate()).toBe(29);
    const r = sumarMeses('29/2/2024', 12);
    expect(r.getDate()).toBe(28);
    expect(r.getFullYear()).toBe(2025);
  });
  it('conserva el día cuando existe en el mes destino', () => {
    const r = sumarMeses('15/6/2025', 18);
    expect(r.getDate()).toBe(15);
    expect(r.getMonth()).toBe(11);
    expect(r.getFullYear()).toBe(2026);
  });
  it('null con fecha inválida', () => {
    expect(sumarMeses('', 12)).toBeNull();
    expect(sumarMeses('no-es-fecha', 12)).toBeNull();
  });
});

describe('vencimientos de legajo', () => {
  it('la fecha base es la más reciente entre período, cambio de estado y alta', () => {
    const leg = { id:'L1', createdAt:'1/1/2024', estadoCuentaUpdatedAt:'1/6/2025' };
    const pers = [{ id:'p1', legajoId:'L1', createdAt:'1/3/2026' }];
    expect(baseActualizacion(leg, pers)).toBe('1/3/2026');
  });

  it('la frecuencia de actualización depende del segmento', () => {
    const base = { id:'L1', createdAt: hace(400), checklist:{} };
    const alto  = vencimientosDeLegajo(Object.assign({}, base, { segmento:'ALTO' }), []);
    const bajo  = vencimientosDeLegajo(Object.assign({}, base, { segmento:'BAJO' }), []);
    const vAlto = alto.find(v => v.tipo === 'LEGAJO');
    const vBajo = bajo.find(v => v.tipo === 'LEGAJO');
    expect(vAlto.estado).toBe('VENCIDO');          // 400 días > 12 meses
    expect(vBajo.estado).toBe('OK');               // 400 días < 36 meses
    expect(ACTUALIZACION_LEGAJO['ALTO']).toBeLessThan(ACTUALIZACION_LEGAJO['BAJO']);
  });

  it('solo vencen los documentos marcados OK', () => {
    const leg = { id:'L1', segmento:'MEDIO', createdAt: hace(30),
      checklist:{ 'Constancia CUIT/AFIP':'OK', 'Estados contables (3 ejercicios)':'Pendiente' } };
    const docs = vencimientosDeLegajo(leg, []).filter(v => v.tipo === 'DOCUMENTO');
    expect(docs.length).toBe(1);
    expect(docs[0].label).toBe('Constancia CUIT/AFIP');
  });

  it('marca como estimado el documento sin fecha propia', () => {
    const leg = { id:'L1', segmento:'MEDIO', createdAt: hace(30), checklist:{ 'Constancia CUIT/AFIP':'OK' } };
    const sinFecha = vencimientosDeLegajo(leg, []).find(v => v.tipo === 'DOCUMENTO');
    expect(sinFecha.estimado).toBe(true);

    const conFecha = vencimientosDeLegajo(
      Object.assign({}, leg, { checklistFechas:{ 'Constancia CUIT/AFIP': hace(10) } }), []
    ).find(v => v.tipo === 'DOCUMENTO');
    expect(conFecha.estimado).toBe(false);
  });
});

describe('SLA de casos', () => {
  it('un caso cerrado no tiene plazos corriendo', () => {
    const c = nuevoCaso({ estado:'CERRADA_SIN_ROS' });
    expect(hitosSLA(c)).toEqual([]);
    expect(slaCritico(c)).toBeNull();
  });

  it('un caso nuevo tiene plazo para ser tomado', () => {
    const c = nuevoCaso({ fechaApertura: hace(0) });
    const h = hitosSLA(c).find(x => x.id === 'inicio');
    expect(h).toBeDefined();
    expect(h.dias).toBe(SLA.INICIO_ANALISIS);
  });

  it('detecta el plazo vencido', () => {
    const c = nuevoCaso({ fechaApertura: hace(SLA.INICIO_ANALISIS + 5) });
    expect(hitosSLA(c).find(x => x.id === 'inicio').estado).toBe('VENCIDO');
  });

  it('el plazo de reporte corre desde la calificación', () => {
    const c = nuevoCaso({ estado:'COMITE', fechaCalificacion: hace(SLA.ROS_CALIFICACION - 1) });
    const ros = hitosSLA(c).find(x => x.id === 'ros');
    expect(ros).toBeDefined();
    expect(ros.dias).toBe(1);
  });

  it('el tope desde la operación corre en paralelo', () => {
    const c = nuevoCaso({ estado:'EN_ANALISIS', fechaOperacion: hace(SLA.ROS_MAX_OPERACION + 1) });
    expect(hitosSLA(c).find(x => x.id === 'tope').estado).toBe('VENCIDO');
  });

  it('slaCritico devuelve el hito más urgente', () => {
    const c = nuevoCaso({ estado:'EN_ANALISIS', fechaApertura: hace(1), fechaOperacion: hace(SLA.ROS_MAX_OPERACION - 1) });
    expect(slaCritico(c).id).toBe('tope');
  });
});

describe('transiciones de caso', () => {
  it('elevar a comité sella la fecha de calificación', () => {
    const c = nuevoCaso({});
    expect(c.fechaCalificacion).toBe('');
    expect(cambiarEstadoCaso(c, 'COMITE', 'Frann', '').fechaCalificacion).not.toBe('');
  });

  it('no pisa una fecha de calificación ya sellada', () => {
    const c = nuevoCaso({ fechaCalificacion:'1/1/2020' });
    expect(cambiarEstadoCaso(c, 'COMITE', 'Frann', '').fechaCalificacion).toBe('1/1/2020');
  });

  it('cerrar sella la fecha de cierre', () => {
    expect(cambiarEstadoCaso(nuevoCaso({}), 'ROS_PRESENTADO', 'Germán', 'ok').fechaCierre).not.toBe('');
  });

  it('cada transición deja rastro en el historial con autor', () => {
    const c = cambiarEstadoCaso(nuevoCaso({}), 'EN_ANALISIS', 'Frann', 'tomado');
    expect(c.historial.length).toBe(2);
    expect(c.historial[1].autor).toBe('Frann');
    expect(c.historial[1].nota).toBe('tomado');
  });

  it('no muta el caso original', () => {
    const c = nuevoCaso({});
    const antes = c.historial.length;
    cambiarEstadoCaso(c, 'COMITE', 'x', '');
    expect(c.historial.length).toBe(antes);
    expect(c.estado).toBe('NUEVA');
  });

  it('los estados de cierre no cuentan como abiertos', () => {
    expect(getEstadoCaso('NUEVA').abierto).toBe(true);
    expect(getEstadoCaso('CERRADA_SIN_ROS').abierto).toBe(false);
    expect(getEstadoCaso('ROS_PRESENTADO').abierto).toBe(false);
  });
});

describe('generación de casos desde señales', () => {
  const leg = { id:'L1', razonSocial:'Test SA' };
  const per = {
    id:'p1', legajoId:'L1', nombre:'Mayo', createdAt:'1/6/2026',
    metricas: calcMetricas([
      { tipo:'IN', monto:1000000, fecha:'5/6/2026', hora:'12:00', contraparte_nombre:'UNICA' },
      { tipo:'IN', monto:1,       fecha:'5/6/2026', hora:'12:00', contraparte_nombre:'OTRA' },
    ]),
  };

  it('propone casos para las señales ALTA sin caso', () => {
    const p = casosPendientesDeCrear([leg], [per], []);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every(x => x.sev === 'ALTA')).toBe(true);
    expect(p[0].origen).toBe('SENAL');
  });

  it('no duplica: dedupe por período y patrón', () => {
    const p1 = casosPendientesDeCrear([leg], [per], []);
    const existentes = p1.map(x => ({ periodoId:x.periodoId, pat:x.pat }));
    expect(casosPendientesDeCrear([leg], [per], existentes).length).toBe(0);
  });

  it('ignora períodos de legajos que no están en la cartera', () => {
    expect(casosPendientesDeCrear([], [per], []).length).toBe(0);
  });
});

describe('fechas institucionales sin validar', () => {
  const vencs = [
    { clave:'INST::a', tipo:'INSTITUCIONAL', validado:false, estado:'VENCIDO', dias:-5, label:'Sin validar', detalle:'', limite:new Date(), legajoId:'', legajoNom:'' },
    { clave:'INST::b', tipo:'INSTITUCIONAL', validado:true,  estado:'VENCIDO', dias:-5, label:'Validada',    detalle:'', limite:new Date(), legajoId:'', legajoNom:'' },
    { clave:'ACT::L1', tipo:'LEGAJO',        estado:'VENCIDO', dias:-5, label:'Actualización', detalle:'', limite:new Date(), legajoId:'L1', legajoNom:'Test' },
  ];

  it('esConfiable distingue solo las institucionales no validadas', () => {
    expect(esConfiable(vencs[0])).toBe(false);
    expect(esConfiable(vencs[1])).toBe(true);
    expect(esConfiable(vencs[2])).toBe(true);
  });

  // Un caso abierto por una fecha inventada es un registro regulatorio falso,
  // con su referencia y su rastro de auditoría.
  it('una fecha sin validar NO genera caso aunque esté vencida', () => {
    const p = vencimientosPendientesDeCaso(vencs, []);
    expect(p.length).toBe(2);
    expect(p.some(x => x.vencKey === 'INST::a')).toBe(false);
    expect(p.some(x => x.vencKey === 'INST::b')).toBe(true);
    expect(p.some(x => x.vencKey === 'ACT::L1')).toBe(true);
  });

  it('los vencimientos de legajo y documento nunca quedan excluidos', () => {
    expect(esConfiable({ tipo:'DOCUMENTO', estado:'VENCIDO' })).toBe(true);
  });
});
