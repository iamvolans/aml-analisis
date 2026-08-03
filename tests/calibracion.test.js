// Tests del análisis de sensibilidad de plazos.

import { describe, it, expect } from 'vitest';
import { SLA } from '../src/lib/casos.js';
import { PARAMS, ejercicio, sensibilidad, candidatos, concentracionVencidos, edadCasos } from '../src/lib/calibracion.js';

function hace(dias) {
  const d = new Date(); d.setDate(d.getDate() - dias);
  return d.toLocaleDateString('es-AR');
}
function caso(o) {
  return Object.assign({
    id: Math.random().toString(36).slice(2), estado:'EN_ANALISIS', prioridad:'MEDIA',
    origen:'SENAL', analista:'Frann', fechaApertura: hace(1), fechaCierre:'',
    historial:[{estado:'NUEVA',fecha:hace(1)}]
  }, o);
}

describe('catálogo de parámetros', () => {
  it('cada parámetro del SLA está declarado con su tipo', () => {
    Object.keys(SLA).forEach(k => {
      const p = PARAMS.find(x => x.id === k);
      expect(p, 'falta declarar ' + k + ' en PARAMS').toBeDefined();
      expect(['INTERNO','REGULATORIO']).toContain(p.tipo);
    });
  });

  it('distingue los que decide GOAT de los que fija la norma', () => {
    const internos = PARAMS.filter(p => p.tipo === 'INTERNO').map(p => p.id);
    expect(internos).toContain('INICIO_ANALISIS');
    expect(internos).toContain('ESCALAMIENTO_COMITE');
    expect(internos).toContain('RFI_RESPUESTA');
    const reg = PARAMS.filter(p => p.tipo === 'REGULATORIO').map(p => p.id);
    expect(reg).toContain('ROS_CALIFICACION');
    expect(reg).toContain('ROS_MAX_OPERACION');
  });
});

describe('ejercicio de los parámetros', () => {
  it('un parámetro que ningún caso ejercita queda marcado como inerte', () => {
    // Un solo caso NUEVA: solo ejercita INICIO_ANALISIS
    const e = ejercicio([caso({ estado:'NUEVA' })]);
    expect(e.find(p => p.id === 'INICIO_ANALISIS').critico).toBe(1);
    expect(e.find(p => p.id === 'ROS_CALIFICACION').inerte).toBe(true);
  });

  it('cuenta presencia y criticidad por separado', () => {
    // Caso en análisis con fecha de operación: dos hitos presentes, uno crítico
    const c = caso({ estado:'EN_ANALISIS', fechaApertura: hace(1), fechaOperacion: hace(140) });
    const e = ejercicio([c]);
    expect(e.find(p => p.id === 'ESCALAMIENTO_COMITE').presente).toBe(1);
    expect(e.find(p => p.id === 'ROS_MAX_OPERACION').presente).toBe(1);
    const criticos = e.filter(p => p.critico > 0);
    expect(criticos.length).toBe(1);
  });

  it('los casos cerrados no ejercitan ningún plazo', () => {
    const e = ejercicio([caso({ estado:'CERRADA_SIN_ROS' })]);
    expect(e.every(p => p.presente === 0)).toBe(true);
  });
});

describe('sensibilidad', () => {
  const casos = [
    caso({ estado:'EN_ANALISIS', fechaApertura: hace(5) }),
    caso({ estado:'EN_ANALISIS', fechaApertura: hace(12) }),
    caso({ estado:'EN_ANALISIS', fechaApertura: hace(30) }),
  ];

  it('un plazo más largo no puede producir MÁS vencidos', () => {
    const r = sensibilidad(casos, 'ESCALAMIENTO_COMITE', [5, 10, 20, 40]);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].vencidos, 'plazo ' + r[i].valor).toBeLessThanOrEqual(r[i-1].vencidos);
    }
  });

  it('marca cuál es el valor configurado hoy', () => {
    const r = sensibilidad(casos, 'ESCALAMIENTO_COMITE', [5, SLA.ESCALAMIENTO_COMITE, 40]);
    expect(r.filter(x => x.actual).length).toBe(1);
    expect(r.find(x => x.actual).valor).toBe(SLA.ESCALAMIENTO_COMITE);
  });

  it('los totales cierran', () => {
    sensibilidad(casos, 'ESCALAMIENTO_COMITE', [10]).forEach(r => {
      expect(r.vencidos + r.proximos + r.ok + r.sinPlazo).toBe(r.total);
    });
  });

  it('sin casos abiertos devuelve todo en cero', () => {
    const r = sensibilidad([caso({estado:'ROS_PRESENTADO'})], 'ESCALAMIENTO_COMITE', [10]);
    expect(r[0].total).toBe(0);
  });
});

describe('candidatos', () => {
  it('propone valores alrededor del actual, sin repetir', () => {
    const c = candidatos(10);
    expect(c).toContain(10);
    expect(c[0]).toBeLessThan(10);
    expect(c[c.length-1]).toBeGreaterThan(10);
    expect(new Set(c).size).toBe(c.length);
  });
  it('nunca baja de 1', () => {
    expect(Math.min.apply(null, candidatos(1))).toBeGreaterThanOrEqual(1);
    expect(Math.min.apply(null, candidatos(2))).toBeGreaterThanOrEqual(1);
  });
});

describe('concentración de vencidos y edad', () => {
  it('agrupa los vencimientos por hito', () => {
    const casos = [
      caso({ estado:'EN_ANALISIS', fechaApertura: hace(60) }),
      caso({ estado:'EN_ANALISIS', fechaApertura: hace(90) }),
    ];
    const c = concentracionVencidos(casos);
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].n).toBe(2);
    expect(c[0].diasMax).toBeGreaterThan(0);
  });

  it('la edad mediana permite juzgar si el plazo es alcanzable', () => {
    const e = edadCasos([
      caso({ fechaApertura: hace(2) }),
      caso({ fechaApertura: hace(10) }),
      caso({ fechaApertura: hace(30) }),
    ]);
    expect(e.n).toBe(3);
    expect(e.mediana).toBe(10);
    expect(e.max).toBe(30);
  });

  it('sin casos abiertos devuelve nulls, no ceros', () => {
    const e = edadCasos([]);
    expect(e.mediana).toBeNull();
  });
});
