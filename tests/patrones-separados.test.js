// Separación de patrones con significado ambiguo.
//
// PAT-05 emitía "volumen excede el perfil" y "volumen muy inferior al perfil":
// hallazgos OPUESTOS bajo un mismo código. PAT-07 emitía "montos redondos" y
// "montos exactamente repetidos", que no guardan relación entre sí.
//
// La ambigüedad no era cosmética: todo lo que se indexa por código —evidencia,
// resoluciones, estadísticas del comité, tipología en el informe— quedaba
// mezclado, y una resolución sobre un hallazgo cerraba el otro.
//
// Separarlos rompe los datos ya asentados, de modo que la lectura de una
// resolución contempla la clave vieja: lo que un analista resolvió antes del
// cambio no puede reaparecer como pendiente.

import { describe, it, expect } from 'vitest';
import { calcMetricas, detectPatrones, claveResolucion, resolucionDe,
         CLAVES_HISTORICAS, senalesActivas } from '../src/lib/aml.js';
import { PAT_UIF_MAP } from '../src/lib/constants.js';

const tx = (cp, monto, tipo) =>
  ({ tipo: tipo || 'IN', monto, fecha: '1/6/2026', hora: '14:00', contraparte_nombre: cp });

describe('un código, un significado', () => {
  it('los importes repetidos tienen código propio', () => {
    const ops = [];
    for (let i = 0; i < 5; i++) ops.push(tx('M' + i, 88888));
    const s = detectPatrones(calcMetricas(ops), {}).find(x => /repetid/i.test(x.titulo));
    expect(s).toBeDefined();
    expect(s.pat).toBe('PAT-17');
  });

  it('los importes redondos conservan PAT-07', () => {
    const ops = [];
    for (let i = 0; i < 9; i++) ops.push(tx('R' + i, (i + 1) * 100000));
    const s = detectPatrones(calcMetricas(ops), {}).find(x => /redondo/i.test(x.titulo));
    expect(s).toBeDefined();
    expect(s.pat).toBe('PAT-07');
  });

  it('el volumen inferior al perfil tiene código propio', () => {
    const perfil = { facturacionMensual: 10000000 };
    const ops = [tx('X', 100000)];
    const s = detectPatrones(calcMetricas(ops, perfil), perfil).find(x => /inferior/i.test(x.titulo));
    expect(s).toBeDefined();
    expect(s.pat).toBe('PAT-16');
  });

  it('el volumen que excede el perfil conserva PAT-05', () => {
    const perfil = { facturacionMensual: 100000 };
    const ops = [];
    for (let i = 0; i < 5; i++) ops.push(tx('X', 3000000));
    const s = detectPatrones(calcMetricas(ops, perfil), perfil).find(x => x.pat === 'PAT-05');
    expect(s).toBeDefined();
    expect(s.titulo).toMatch(/excede/i);
  });

  it('ningún código emite dos hallazgos de significado distinto', () => {
    // Se recorren todas las emisiones y se agrupan sus títulos por código.
    // Las variantes admitidas son de severidad o de lado, no de significado.
    const casos = [
      { ops: (() => { const o = []; for (let i = 0; i < 9; i++) o.push(tx('R' + i, (i + 1) * 100000)); return o; })(), perfil: {} },
      { ops: (() => { const o = []; for (let i = 0; i < 5; i++) o.push(tx('M' + i, 88888)); return o; })(), perfil: {} },
      { ops: [tx('X', 100000)], perfil: { facturacionMensual: 10000000 } },
    ];
    const porCodigo = {};
    casos.forEach(c => {
      detectPatrones(calcMetricas(c.ops, c.perfil), c.perfil).forEach(s => {
        (porCodigo[s.pat] = porCodigo[s.pat] || new Set()).add(s.titulo);
      });
    });
    // PAT-07 y PAT-17 no pueden compartir título
    if (porCodigo['PAT-07'] && porCodigo['PAT-17']) {
      const inter = [...porCodigo['PAT-07']].filter(t => porCodigo['PAT-17'].has(t));
      expect(inter).toEqual([]);
    }
  });
});

describe('tipologías declaradas', () => {
  it('los códigos nuevos tienen su entrada en el mapa de tipologías', () => {
    ['PAT-16', 'PAT-17'].forEach(k => {
      expect(PAT_UIF_MAP[k], k + ' sin tipología').toBeDefined();
      expect(PAT_UIF_MAP[k].tip, k).toBeTruthy();
      expect(PAT_UIF_MAP[k].desc.length, k).toBeGreaterThan(30);
    });
  });

  it('la descripción de los códigos separados ya no es ambigua', () => {
    expect(PAT_UIF_MAP['PAT-05'].desc).toMatch(/superior/i);
    expect(PAT_UIF_MAP['PAT-16'].desc).toMatch(/inferior/i);
    expect(PAT_UIF_MAP['PAT-07'].desc).toMatch(/redondo/i);
    expect(PAT_UIF_MAP['PAT-17'].desc).toMatch(/repetid/i);
  });

  it('todo código emitido por el motor tiene tipología', () => {
    const ops = [];
    for (let i = 0; i < 5; i++) ops.push(tx('M' + i, 88888));
    detectPatrones(calcMetricas(ops), {}).forEach(s => {
      if (s.pat.startsWith('DATA-')) return;
      expect(PAT_UIF_MAP[s.pat], s.pat + ' emitido sin tipología').toBeDefined();
    });
  });
});

describe('resoluciones asentadas antes del cambio', () => {
  const ops = [];
  for (let i = 0; i < 5; i++) ops.push(tx('M' + i, 88888));
  const sig = detectPatrones(calcMetricas(ops), {}).find(x => x.pat === 'PAT-17');

  it('la tabla de equivalencias cubre los códigos que se movieron', () => {
    expect(CLAVES_HISTORICAS[claveResolucion(sig)]).toBe('PAT-07::Montos exactamente repetidos');
  });

  it('una resolución guardada con el código viejo se sigue respetando', () => {
    const res = { 'PAT-07::Montos exactamente repetidos': { estado: 'RESUELTA', explicacion: 'contrato marco' } };
    const r = resolucionDe(res, sig);
    expect(r).not.toBeNull();
    expect(r.explicacion).toBe('contrato marco');
  });

  it('la señal no reaparece como activa tras la separación', () => {
    const leg = { id: 'L1' };
    const per = { id: 'p1', legajoId: 'L1', createdAt: '1/6/2026', metricas: calcMetricas(ops),
                  sigsResolucion: { 'PAT-07::Montos exactamente repetidos': { estado: 'RESUELTA', explicacion: 'ok' } } };
    const activas = senalesActivas(per, leg, [per]).map(s => s.pat);
    expect(activas).not.toContain('PAT-17');
  });

  it('la clave nueva tiene prioridad sobre la histórica', () => {
    const res = {
      'PAT-07::Montos exactamente repetidos': { estado: 'RESUELTA', explicacion: 'vieja' },
      'PAT-17::Montos exactamente repetidos': { estado: 'RESUELTA', explicacion: 'nueva' },
    };
    expect(resolucionDe(res, sig).explicacion).toBe('nueva');
  });

  it('resolver el código separado no cierra el otro hallazgo', () => {
    const mixtas = [];
    for (let i = 0; i < 9; i++) mixtas.push(tx('R' + i, (i + 1) * 100000));  // redondos
    for (let i = 0; i < 4; i++) mixtas.push(tx('P' + i, 77777, 'OUT'));      // repetidos
    const leg = { id: 'L1' };
    const met = calcMetricas(mixtas);
    const todas = detectPatrones(met, leg);
    const rep = todas.find(s => s.pat === 'PAT-17');
    expect(rep, 'no se emitió la señal de repetidos').toBeDefined();

    const res = {};
    res[claveResolucion(rep)] = { estado: 'RESUELTA', explicacion: 'ok' };
    const per = { id: 'p1', legajoId: 'L1', createdAt: '1/6/2026', metricas: met, sigsResolucion: res };
    const activas = senalesActivas(per, leg, [per]).map(s => s.pat);
    expect(activas).not.toContain('PAT-17');
    expect(activas, 'resolver repetidos cerró también los redondos').toContain('PAT-07');
  });
});
