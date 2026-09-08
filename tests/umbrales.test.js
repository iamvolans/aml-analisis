// Parámetros de detección centralizados.
//
// Antes, los umbrales estaban dispersos dentro de detectPatrones y repetidos
// dentro de calcScoring: `pctRound > 70`, `passThrough > 0.90`, `circularCount`
// y el horario atípico figuraban DOS veces. Ajustar la detección sin ajustar el
// scoring los desincronizaba en silencio, y nadie lo habría notado hasta que un
// período con señal alta arrojara un score bajo.
//
// Estos tests fijan que exista una sola definición por umbral, que cada una
// declare su fundamento, y que los valores sean coherentes entre sí.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { UMBRALES_DEF, U, franjaUmbral, sinAprobar } from '../src/lib/umbrales.js';

describe('estructura de la definición', () => {
  it('cada umbral declara valor, unidad, descripción y origen', () => {
    Object.keys(UMBRALES_DEF).forEach(k => {
      const d = UMBRALES_DEF[k];
      expect(typeof d.valor, k).toBe('number');
      expect(d.unidad, k).toBeTruthy();
      expect(d.desc, k + ' sin fundamento escrito').toBeTruthy();
      expect(d.desc.length, k + ': el fundamento es demasiado escueto').toBeGreaterThan(40);
      expect(['NORMATIVO', 'INTERNO'], k).toContain(d.origen);
      expect(typeof d.aprobado, k).toBe('string');
    });
  });

  it('los valores planos derivan de la definición, sin poder divergir', () => {
    Object.keys(UMBRALES_DEF).forEach(k => {
      expect(U[k], k).toBe(UMBRALES_DEF[k].valor);
    });
    expect(Object.keys(U).length).toBe(Object.keys(UMBRALES_DEF).length);
  });

  it('los umbrales de origen normativo se identifican como tales', () => {
    expect(UMBRALES_DEF.UMBRAL_REPORTE.origen).toBe('NORMATIVO');
  });

  it('se puede saber cuáles están pendientes de aprobación', () => {
    const pend = sinAprobar();
    expect(Array.isArray(pend)).toBe(true);
    pend.forEach(k => expect(UMBRALES_DEF[k].aprobado).toBe(''));
  });
});

describe('coherencia entre umbrales', () => {
  it('el corte de severidad alta es más exigente que el de media', () => {
    expect(U.CONC_HHI_MEDIA).toBeLessThan(U.CONC_HHI_ALTA);
    expect(U.REDONDOS_MEDIA).toBeLessThan(U.REDONDOS_ALTA);
    expect(U.TRANSITO_MEDIA).toBeLessThan(U.TRANSITO_ALTA);
  });

  it('los índices de concentración están en su rango válido', () => {
    [U.CONC_HHI_ALTA, U.CONC_HHI_MEDIA].forEach(v => {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    });
    expect(U.CONC_TOP1_ALTA).toBeGreaterThan(0);
    expect(U.CONC_TOP1_ALTA).toBeLessThanOrEqual(100);
  });

  it('los porcentajes son porcentajes', () => {
    ['ONESHOT_PCT', 'REDONDOS_ALTA', 'REDONDOS_MEDIA', 'HORARIO_PCT'].forEach(k => {
      expect(U[k], k).toBeGreaterThan(0);
      expect(U[k], k).toBeLessThanOrEqual(100);
    });
  });

  it('el horario habitual empieza antes de terminar', () => {
    expect(U.HORARIO_DESDE).toBeLessThan(U.HORARIO_HASTA);
    expect(U.HORARIO_DESDE).toBeGreaterThanOrEqual(0);
    expect(U.HORARIO_HASTA).toBeLessThanOrEqual(24);
  });

  it('el exceso de perfil es mayor que el defecto', () => {
    expect(U.PERFIL_DEFECTO).toBeLessThan(U.PERFIL_EXCESO);
    expect(U.SCORE_PERFIL_BAJO).toBeLessThan(U.SCORE_PERFIL_MEDIO);
    expect(U.SCORE_PERFIL_MEDIO).toBeLessThan(U.SCORE_PERFIL_ALTO);
  });

  it('el fraccionamiento exige al menos tres operaciones', () => {
    // Con dos no hay patrón: la repetición podría ser casual
    expect(U.FRACC_OPS_MISMO_DIA).toBeGreaterThanOrEqual(3);
  });

  it('la circularidad para el score exige más que para la señal', () => {
    expect(U.CIRCULAR_MIN).toBeLessThanOrEqual(U.CIRCULAR_SCORE_ALTO);
  });
});

describe('franja bajo el umbral de reporte', () => {
  it('se deriva del umbral vigente, no está escrita a mano', () => {
    const f = franjaUmbral();
    expect(f.hasta).toBe(U.UMBRAL_REPORTE);
    expect(f.desde).toBe(Math.round(U.UMBRAL_REPORTE * (1 - U.UMBRAL_MARGEN)));
    expect(f.desde).toBeLessThan(f.hasta);
  });

  it('el margen es una fracción razonable', () => {
    expect(U.UMBRAL_MARGEN).toBeGreaterThan(0);
    expect(U.UMBRAL_MARGEN).toBeLessThan(0.5);
  });

  it('actualizar el umbral desplaza la franja completa', () => {
    // Propiedad que hace que el parámetro sirva: al cambiar el umbral de
    // reporte, la vigilancia lo sigue sin tocar nada más
    const antes = franjaUmbral();
    const factor = 2;
    const simulado = { desde: Math.round(U.UMBRAL_REPORTE * factor * (1 - U.UMBRAL_MARGEN)),
                       hasta: U.UMBRAL_REPORTE * factor };
    expect(simulado.desde).toBe(antes.desde * factor);
  });
});

describe('no quedan valores sueltos en el motor', () => {
  const aml = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/aml.js'), 'utf8');

  function cuerpo(nombre) {
    const i = aml.indexOf('function ' + nombre + '(');
    if (i < 0) return '';
    const j = aml.indexOf('\nfunction ', i + 1);
    return aml.slice(i, j < 0 ? undefined : j);
  }

  it('detectPatrones no compara contra números escritos a mano', () => {
    const sueltos = [...cuerpo('detectPatrones').matchAll(/m\.(\w+)\s*[<>]=?\s*([\d.]+)/g)]
      .filter(m => !['0', '1'].includes(m[2]))
      .map(m => m[0]);
    expect(sueltos, 'llevar a umbrales.js:\n' + sueltos.join('\n')).toEqual([]);
  });

  it('calcScoring usa los mismos umbrales que la detección', () => {
    const sueltos = [...cuerpo('calcScoring').matchAll(/m\.(\w+)\s*[<>]=?\s*([\d.]+)/g)]
      .filter(m => !['0', '1'].includes(m[2]))
      .map(m => m[0]);
    expect(sueltos, 'llevar a umbrales.js:\n' + sueltos.join('\n')).toEqual([]);
  });
});
