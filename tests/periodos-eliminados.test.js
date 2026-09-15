// Casos que sobreviven a la eliminación de su período.
//
// Situación real de la operatoria: el analista carga los primeros diez días del
// mes, después los segundos, y al final el extracto completo. Al eliminar los
// parciales, los casos que generaron quedaban con una referencia a un período
// inexistente: seguían abiertos, computaban en los indicadores de gestión y no
// se podía llegar al análisis que los fundamentó.
//
// La decisión de qué hacer con ellos no puede ser uniforme. Un caso que nadie
// tocó se elimina junto con el período; uno con análisis registrado se cierra
// dejando constancia, porque eliminarlo destruiría el trabajo asentado.

import { describe, it, expect } from 'vitest';
import { nuevoCaso, casosDePeriodo, casoTrabajado, casosHuerfanos,
         clasificarCasosDePeriodo } from '../src/lib/casos.js';

const caso = (over) => Object.assign(nuevoCaso({
  legajoId:'L1', periodoId:'p1', titulo:'Test', pat:'PAT-01', sev:'ALTA',
}), over || {});

describe('casos de un período', () => {
  it('identifica los originados en un período determinado', () => {
    const cs = [caso(), caso({ periodoId:'p2' }), caso()];
    expect(casosDePeriodo(cs, 'p1').length).toBe(2);
    expect(casosDePeriodo(cs, 'p2').length).toBe(1);
  });

  it('sin casos devuelve vacío', () => {
    expect(casosDePeriodo([], 'p1')).toEqual([]);
    expect(casosDePeriodo(null, 'p1')).toEqual([]);
  });
});

describe('distinguir un caso trabajado', () => {
  it('un caso recién abierto no está trabajado', () => {
    expect(casoTrabajado(caso())).toBe(false);
  });

  it('con comentarios sí lo está', () => {
    expect(casoTrabajado(caso({ comentarios:[{ texto:'algo' }] }))).toBe(true);
  });

  it('con más de un asiento en el historial sí lo está', () => {
    expect(casoTrabajado(caso({ historial:[{}, {}] }))).toBe(true);
  });

  it('asignado a alguien sí lo está', () => {
    expect(casoTrabajado(caso({ asignadoA:'Samy' }))).toBe(true);
  });

  it('con estado distinto del inicial sí lo está', () => {
    expect(casoTrabajado(caso({ estado:'EN_ANALISIS' }))).toBe(true);
    expect(casoTrabajado(caso({ estado:'NUEVA' })), 'un caso nuevo no está trabajado').toBe(false);
  });

  it('nulo no rompe', () => {
    expect(casoTrabajado(null)).toBe(false);
  });
});

describe('clasificación al eliminar un período', () => {
  it('separa los que pueden eliminarse de los que deben cerrarse', () => {
    const cs = [caso(), caso(), caso({ comentarios:[{ texto:'analizado' }] })];
    const cl = clasificarCasosDePeriodo(cs, 'p1');
    expect(cl.total).toBe(3);
    expect(cl.sinTrabajar.length).toBe(2);
    expect(cl.trabajados.length).toBe(1);
  });

  it('un período sin casos no reporta nada', () => {
    expect(clasificarCasosDePeriodo([caso({ periodoId:'otro' })], 'p1').total).toBe(0);
  });
});

describe('casos huérfanos', () => {
  const periodos = [{ id:'p1', legajoId:'L1' }, { id:'p2', legajoId:'L1' }];

  it('detecta los abiertos cuyo período ya no existe', () => {
    const cs = [caso({ periodoId:'p1' }), caso({ periodoId:'BORRADO' })];
    const h = casosHuerfanos(cs, periodos);
    expect(h.length).toBe(1);
    expect(h[0].periodoId).toBe('BORRADO');
  });

  it('ignora los casos ya cerrados: no requieren acción', () => {
    const cs = [caso({ periodoId:'BORRADO', estado:'CERRADA_SIN_ROS' })];
    expect(casosHuerfanos(cs, periodos)).toEqual([]);
  });

  it('ignora los casos que no nacen de un período', () => {
    // Los abiertos manualmente o por screening no tienen periodoId
    const cs = [caso({ periodoId:'' }), caso({ periodoId: undefined })];
    expect(casosHuerfanos(cs, periodos)).toEqual([]);
  });

  it('sin períodos, todos los que tienen referencia quedan huérfanos', () => {
    expect(casosHuerfanos([caso({ periodoId:'p1' })], []).length).toBe(1);
  });

  it('con entradas vacías no rompe', () => {
    expect(casosHuerfanos([], periodos)).toEqual([]);
    expect(casosHuerfanos(null, periodos)).toEqual([]);
    expect(casosHuerfanos([caso()], null).length).toBe(1);
  });

  it('el escenario de la operatoria: parciales eliminados, mensual vigente', () => {
    // Dos parciales borrados y el extracto completo cargado
    const pers = [{ id:'mensual', legajoId:'L1' }];
    const cs = [
      caso({ periodoId:'dias1-10' }),
      caso({ periodoId:'dias11-20' }),
      caso({ periodoId:'mensual' }),
    ];
    const h = casosHuerfanos(cs, pers);
    expect(h.length).toBe(2);
    expect(h.every(c => c.periodoId !== 'mensual')).toBe(true);
  });
});
