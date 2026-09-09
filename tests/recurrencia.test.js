// Huella de evidencia y recurrencia.
//
// Dos huecos que quedaban tras adjuntar las operaciones a cada señal:
//
//  · Una resolución afirma que un hallazgo tiene explicación, pero esa
//    afirmación se hizo sobre operaciones concretas. Si el período se recarga
//    con otro archivo, la resolución sigue cubriendo la señal aunque el
//    sustento sea otro. La huella permite advertirlo.
//
//  · Cada señal se lee por separado, de modo que una contraparte presente en
//    varias a la vez no resulta visible. Y una señal que aparece período tras
//    período resuelta siempre con el mismo argumento indica o un umbral mal
//    calibrado para ese cliente, o algo que la resolución no está mirando.

import { describe, it, expect } from 'vitest';
import { calcMetricas, detectPatrones, huellaEvidencia, evidenciaCambio,
         contrapartesRecurrentes, senalesRecurrentes, claveResolucion } from '../src/lib/aml.js';

const tx = (cp, monto, tipo, fecha) =>
  ({ tipo: tipo || 'IN', monto, fecha: fecha || '1/6/2026', hora: '14:00', contraparte_nombre: cp });

const OPS = [];
for (let i = 0; i < 5; i++) OPS.push(tx('PROV', 700000 + i));
const SIG = detectPatrones(calcMetricas(OPS), {}).find(s => s.ops.length);

describe('huella de la evidencia', () => {
  it('resume cantidad, importe y contenido', () => {
    const h = huellaEvidencia(SIG, OPS);
    expect(h.n).toBe(5);
    expect(h.suma).toBe(OPS.reduce((a, t) => a + t.monto, 0));
    expect(typeof h.hash).toBe('number');
  });

  it('el mismo archivo produce la misma huella', () => {
    expect(huellaEvidencia(SIG, OPS)).toEqual(huellaEvidencia(SIG, OPS.slice()));
  });

  it('cambiar un importe cambia la huella', () => {
    const otro = OPS.slice(); otro[2] = tx('PROV', 999999);
    const s2 = detectPatrones(calcMetricas(otro), {}).find(s => s.ops.length);
    expect(huellaEvidencia(s2, otro)).not.toEqual(huellaEvidencia(SIG, OPS));
  });

  it('cambiar una contraparte cambia la huella aunque el importe sea igual', () => {
    const otro = OPS.slice(); otro[2] = tx('DISTINTA', OPS[2].monto);
    const h1 = huellaEvidencia(SIG, OPS);
    const h2 = huellaEvidencia({ ops: [0,1,2,3,4] }, otro);
    expect(h2.suma).toBe(h1.suma);      // el importe total no cambió
    expect(h2.hash).not.toBe(h1.hash);  // el contenido sí
  });

  it('sin operaciones no hay huella', () => {
    expect(huellaEvidencia({ ops: [] }, OPS)).toBeNull();
    expect(huellaEvidencia(SIG, [])).toBeNull();
  });
});

describe('detección de cambio', () => {
  const res = { estado: 'RESUELTA', huella: huellaEvidencia(SIG, OPS) };

  it('sobre el mismo archivo no reporta cambio', () => {
    expect(evidenciaCambio(res, SIG, OPS)).toBeNull();
  });

  it('sobre un archivo alterado lo reporta con el detalle', () => {
    const otro = OPS.slice(); otro[2] = tx('PROV', 999999);
    const s2 = detectPatrones(calcMetricas(otro), {}).find(s => s.ops.length);
    const c = evidenciaCambio(res, s2, otro);
    expect(c).not.toBeNull();
    expect(c.detalle).toMatch(/Se resolvió sobre/);
  });

  it('una resolución sin huella no se reporta como discrepancia', () => {
    // Ausencia de dato no es cambio: confundirlas alarmaría sobre todo lo viejo
    expect(evidenciaCambio({ estado: 'RESUELTA' }, SIG, OPS)).toBeNull();
  });

  it('sin transacciones cargadas tampoco', () => {
    expect(evidenciaCambio(res, SIG, [])).toBeNull();
    expect(evidenciaCambio(res, SIG, null)).toBeNull();
  });
});

describe('contrapartes en varias señales', () => {
  const ops = [];
  for (let i = 0; i < 6; i++) ops.push(tx('FOCO SA', 700000 + i, 'IN', '1/6/2026'));
  ops.push(tx('FOCO SA', 400000, 'OUT', '2/6/2026'));
  for (let i = 0; i < 3; i++) ops.push(tx('MENOR-' + i, 50000, 'IN', '3/6/2026'));
  const sigs = detectPatrones(calcMetricas(ops), {});
  const rec = contrapartesRecurrentes(sigs, ops, 2);

  it('identifica a quien concentra hallazgos de patrones distintos', () => {
    expect(rec.length).toBeGreaterThan(0);
    expect(rec[0].nombre).toBe('FOCO SA');
    expect(rec[0].patrones.length).toBeGreaterThanOrEqual(2);
  });

  it('cuenta cada patrón una sola vez por contraparte', () => {
    expect(new Set(rec[0].patrones).size).toBe(rec[0].patrones.length);
  });

  it('ordena por cantidad de patrones', () => {
    for (let i = 1; i < rec.length; i++) {
      expect(rec[i-1].patrones.length).toBeGreaterThanOrEqual(rec[i].patrones.length);
    }
  });

  it('excluye los patrones estructurales, que no señalan operaciones', () => {
    const embudo = [];
    for (let i = 0; i < 14; i++) embudo.push(tx('O' + i, 100000, 'IN', '1/6/2026'));
    embudo.push(tx('DESTINO', 1300000, 'OUT', '2/6/2026'));
    const s = detectPatrones(calcMetricas(embudo), {});
    const r = contrapartesRecurrentes(s, embudo, 2);
    r.forEach(c => c.patrones.forEach(p => {
      expect(p).not.toMatch(/PAT-02|PAT-09|PAT-12/);
    }));
  });

  it('con una sola señal no hay recurrencia', () => {
    expect(contrapartesRecurrentes([SIG], OPS, 2)).toEqual([]);
  });

  it('sin transacciones devuelve vacío', () => {
    expect(contrapartesRecurrentes(sigs, [], 2)).toEqual([]);
    expect(contrapartesRecurrentes(null, ops, 2)).toEqual([]);
  });
});

describe('señales que se repiten período tras período', () => {
  const leg = { id: 'L1' };
  function periodo(id, nombre, ops, fundamento) {
    const m = calcMetricas(ops);
    const res = {};
    if (fundamento) {
      detectPatrones(m, leg).forEach(s => {
        res[claveResolucion(s)] = { estado: 'RESUELTA', explicacion: fundamento };
      });
    }
    return { id, legajoId: 'L1', nombre, metricas: m, sigsResolucion: res };
  }
  const base = () => {
    const o = [];
    for (let i = 0; i < 5; i++) o.push(tx('HABITUAL', 700000 + i));
    return o;
  };

  it('detecta la señal resuelta siempre con el mismo argumento', () => {
    const pers = ['Jun','Jul','Ago','Sep'].map((n, i) =>
      periodo('p' + i, n, base(), 'cobranza del contrato marco'));
    const r = senalesRecurrentes(pers, leg, 3);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].vecesFundamento).toBeGreaterThanOrEqual(3);
    expect(r[0].fundamentoRepetido).toContain('contrato marco');
  });

  it('no reporta si se resolvió con fundamentos distintos', () => {
    const pers = ['Jun','Jul','Ago','Sep'].map((n, i) =>
      periodo('p' + i, n, base(), 'motivo distinto ' + i));
    expect(senalesRecurrentes(pers, leg, 3)).toEqual([]);
  });

  it('no reporta con menos períodos que el mínimo', () => {
    const pers = ['Jun','Jul'].map((n, i) => periodo('p' + i, n, base(), 'mismo motivo'));
    expect(senalesRecurrentes(pers, leg, 3)).toEqual([]);
  });

  it('no reporta señales sin resolver', () => {
    const pers = ['Jun','Jul','Ago'].map((n, i) => periodo('p' + i, n, base(), null));
    expect(senalesRecurrentes(pers, leg, 3)).toEqual([]);
  });

  it('sin períodos no rompe', () => {
    expect(senalesRecurrentes([], leg, 3)).toEqual([]);
    expect(senalesRecurrentes(null, leg, 3)).toEqual([]);
  });
});
