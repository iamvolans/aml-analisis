// Tests del motor de métricas del comité.
//
// Un informe de gestión que cuenta mal es peor que no tenerlo: se usa para
// decidir. Acá se fija qué entra en cada número y, sobre todo, los bordes:
// casos que cruzan el límite del período, casos sin cerrar, y el criterio de
// "cerrado en plazo", que se reconstruye con las fechas selladas y no con el
// reloj de hoy — un informe de marzo tiene que dar lo mismo generado en abril
// que un año después.

import { describe, it, expect } from 'vitest';
import { rangoPeriodo, metricasComite, mediana, percentil, promedio, diasEntre, fechaCierreReal, enRango } from '../src/lib/comite.js';

function caso(o) {
  return Object.assign({
    id: Math.random().toString(36).slice(2),
    estado: 'NUEVA', prioridad: 'MEDIA', origen: 'SENAL',
    analista: '', legajoId: 'L1', legajoNom: 'Test SA',
    fechaApertura: '5/6/2026', fechaCierre: '',
    historial: [{ estado:'NUEVA', fecha:'5/6/2026', hora:'10:00', autor:'Sistema' }]
  }, o);
}
const JUNIO = rangoPeriodo('mes', new Date(2026, 5, 15));

describe('rangos de período', () => {
  it('el mes va del 1 al último día', () => {
    const r = rangoPeriodo('mes', new Date(2026, 1, 10));   // febrero 2026
    expect(r.isoDesde).toBe('2026-02-01');
    expect(r.isoHasta).toBe('2026-02-28');
    expect(r.label).toBe('Febrero 2026');
  });
  it('contempla febrero bisiesto', () => {
    expect(rangoPeriodo('mes', new Date(2024, 1, 10)).isoHasta).toBe('2024-02-29');
  });
  it('el trimestre agrupa de a tres meses', () => {
    expect(rangoPeriodo('trimestre', new Date(2026, 6, 15)).isoDesde).toBe('2026-07-01');
    expect(rangoPeriodo('trimestre', new Date(2026, 6, 15)).isoHasta).toBe('2026-09-30');
    expect(rangoPeriodo('trimestre', new Date(2026, 0, 5)).label).toBe('T1 2026');
  });
  it('el año va de enero a diciembre', () => {
    const r = rangoPeriodo('anio', new Date(2026, 6, 15));
    expect(r.isoDesde).toBe('2026-01-01');
    expect(r.isoHasta).toBe('2026-12-31');
  });
  it('enRango incluye los extremos', () => {
    expect(enRango('1/6/2026', JUNIO)).toBe(true);
    expect(enRango('30/6/2026', JUNIO)).toBe(true);
    expect(enRango('31/5/2026', JUNIO)).toBe(false);
    expect(enRango('1/7/2026', JUNIO)).toBe(false);
  });
});

describe('estadística', () => {
  it('mediana con muestra impar y par', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
  });
  it('la mediana resiste un valor extremo, el promedio no', () => {
    expect(mediana([2, 3, 4, 500])).toBe(3.5);
    expect(promedio([2, 3, 4, 500])).toBeGreaterThan(100);
  });
  it('percentil 90', () => {
    expect(percentil([1,2,3,4,5,6,7,8,9,10], 90)).toBe(9);
  });
  it('muestra vacía devuelve null, no cero — no es lo mismo', () => {
    expect(mediana([])).toBeNull();
    expect(promedio([])).toBeNull();
    expect(percentil([], 90)).toBeNull();
  });
});

describe('conteo de casos por período', () => {
  const casos = [
    // Creado y cerrado dentro de junio
    caso({ fechaApertura:'3/6/2026', fechaCierre:'10/6/2026', estado:'CERRADA_SIN_ROS' }),
    // Creado en junio, sigue abierto
    caso({ fechaApertura:'20/6/2026', estado:'EN_ANALISIS' }),
    // Creado en mayo, cerrado en junio → cuenta como cerrado, no como creado
    caso({ fechaApertura:'15/5/2026', fechaCierre:'8/6/2026', estado:'ROS_PRESENTADO' }),
    // Creado en mayo, sigue abierto → arrastre
    caso({ fechaApertura:'2/5/2026', estado:'COMITE' }),
    // Todo en julio → fuera del período
    caso({ fechaApertura:'5/7/2026', fechaCierre:'9/7/2026', estado:'CERRADA_SIN_ROS' }),
  ];
  const m = metricasComite({ casos, rango: JUNIO });

  it('cuenta solo los creados dentro del período', () => {
    expect(m.casos.creados).toBe(2);
  });
  it('cuenta los cerrados dentro del período, sin importar cuándo se abrieron', () => {
    expect(m.casos.cerrados).toBe(2);
  });
  it('el arrastre son los abiertos antes del período que seguían abiertos', () => {
    expect(m.casos.arrastre).toBe(2);
  });
  it('separa cerrados con ROS de cerrados sin ROS', () => {
    expect(m.casos.conRos).toBe(1);
    expect(m.casos.sinRos).toBe(1);
  });
  it('los abiertos son a hoy, no al cierre del período', () => {
    expect(m.casos.abiertosHoy).toBe(2);
  });
});

describe('tiempos de resolución', () => {
  it('mide de apertura a cierre en días', () => {
    expect(diasEntre('1/6/2026', '11/6/2026')).toBe(10);
  });
  it('usa el historial si falta fechaCierre', () => {
    const c = caso({
      fechaApertura:'1/6/2026', fechaCierre:'',
      estado:'CERRADA_SIN_ROS',
      historial:[{estado:'NUEVA',fecha:'1/6/2026'},{estado:'CERRADA_SIN_ROS',fecha:'6/6/2026'}]
    });
    expect(fechaCierreReal(c)).toBe('6/6/2026');
  });
  it('agrega mediana, promedio y p90 sobre los cerrados', () => {
    const casos = [
      caso({ fechaApertura:'1/6/2026', fechaCierre:'3/6/2026',  estado:'CERRADA_SIN_ROS' }), // 2
      caso({ fechaApertura:'1/6/2026', fechaCierre:'5/6/2026',  estado:'CERRADA_SIN_ROS' }), // 4
      caso({ fechaApertura:'1/6/2026', fechaCierre:'7/6/2026',  estado:'CERRADA_SIN_ROS' }), // 6
      caso({ fechaApertura:'1/6/2026', fechaCierre:'21/6/2026', estado:'CERRADA_SIN_ROS' }), // 20
    ];
    const m = metricasComite({ casos, rango: JUNIO });
    expect(m.tiempos.muestra).toBe(4);
    expect(m.tiempos.mediana).toBe(5);
    expect(m.tiempos.max).toBe(20);
  });
  it('sin casos cerrados los tiempos son null, no cero', () => {
    const m = metricasComite({ casos: [caso({ estado:'EN_ANALISIS' })], rango: JUNIO });
    expect(m.tiempos.mediana).toBeNull();
    expect(m.tiempos.muestra).toBe(0);
  });
});

describe('carga por analista', () => {
  const casos = [
    caso({ analista:'Frann',  fechaApertura:'2/6/2026', fechaCierre:'6/6/2026', estado:'CERRADA_SIN_ROS' }),
    caso({ analista:'Frann',  fechaApertura:'3/6/2026', estado:'EN_ANALISIS' }),
    caso({ analista:'Germán', fechaApertura:'4/6/2026', fechaCierre:'6/6/2026', estado:'ROS_PRESENTADO' }),
    caso({ analista:'',       fechaApertura:'5/6/2026', estado:'NUEVA' }),
  ];
  const m = metricasComite({ casos, rango: JUNIO });

  it('lista un renglón por analista con nombre', () => {
    expect(m.analistas.map(a => a.nombre).sort()).toEqual(['Frann','Germán']);
  });
  it('separa abiertos de cerrados', () => {
    const f = m.analistas.find(a => a.nombre === 'Frann');
    expect(f.abiertos).toBe(1);
    expect(f.cerrados).toBe(1);
    expect(f.medianaDias).toBe(4);
  });
  it('los casos sin asignar se cuentan aparte', () => {
    expect(m.casos.sinAsignar).toBe(1);
  });
});

describe('el informe de un período cerrado es estable', () => {
  // Si las métricas leyeran el reloj, el mismo período daría distinto según
  // cuándo se genere el informe. Eso rompería la trazabilidad.
  const casos = [
    caso({ fechaApertura:'2/6/2026', fechaCierre:'9/6/2026', estado:'CERRADA_SIN_ROS' }),
    caso({ fechaApertura:'20/5/2026', fechaCierre:'4/6/2026', estado:'ROS_PRESENTADO' }),
  ];
  it('creados, cerrados y tiempos no dependen de la fecha de generación', () => {
    const a = metricasComite({ casos, rango: JUNIO, generado: '1/7/2026' });
    const b = metricasComite({ casos, rango: JUNIO, generado: '15/3/2027' });
    expect(a.casos.creados).toBe(b.casos.creados);
    expect(a.casos.cerrados).toBe(b.casos.cerrados);
    expect(a.tiempos.mediana).toBe(b.tiempos.mediana);
    expect(a.plazos.evaluados).toBe(b.plazos.evaluados);
  });
});

describe('cartera y señales', () => {
  it('cuenta altas del período y distribución por segmento', () => {
    const legajos = [
      { id:'L1', razonSocial:'A', segmento:'ALTO',  createdAt:'5/6/2026',  estadoCuenta:'ACTIVA' },
      { id:'L2', razonSocial:'B', segmento:'ALTO',  createdAt:'1/2/2026',  estadoCuenta:'ACTIVA' },
      { id:'L3', razonSocial:'C', segmento:'BAJO',  createdAt:'20/6/2026', estadoCuenta:'CERRADA' },
    ];
    const m = metricasComite({ casos: [], legajos, rango: JUNIO });
    expect(m.cartera.total).toBe(3);
    expect(m.cartera.altasPeriodo).toBe(2);
    expect(m.cartera.porSegmento.find(x => x.clave === 'ALTO').n).toBe(2);
  });

  it('registra las señales resueltas en el período con su responsable', () => {
    const periodos = [{
      id:'p1', legajoId:'L1', createdAt:'1/6/2026', metricas:null,
      sigsResolucion: {
        'PAT-06': { estado:'RESUELTA', aprobadoPor:'Germán', aprobadoAt:'7/6/2026' },
        'PAT-02': { estado:'RESUELTA', aprobadoPor:'Frann',  aprobadoAt:'2/5/2026' }  // fuera del período
      }
    }];
    const m = metricasComite({ casos: [], legajos:[{id:'L1'}], periodos, rango: JUNIO });
    expect(m.senales.resueltasPeriodo).toBe(1);
    expect(m.senales.resueltasPor[0].clave).toBe('Germán');
  });
});

describe('sin datos no rompe', () => {
  it('devuelve una estructura completa con ceros y nulls', () => {
    const m = metricasComite({ rango: JUNIO });
    expect(m.casos.creados).toBe(0);
    expect(m.tiempos.mediana).toBeNull();
    expect(m.plazos.pctEnPlazo).toBeNull();
    expect(m.analistas).toEqual([]);
    expect(m.cartera.total).toBe(0);
  });
});
