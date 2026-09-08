// Evidencia en los informes emitidos.
//
// Un informe que afirma "se detectó fraccionamiento" sin adjuntar las
// operaciones obliga al lector a confiar en la afirmación. Adjuntarlas la
// convierte en verificable: un revisor externo puede rehacer el análisis sobre
// los mismos movimientos.
//
// La compatibilidad importa: genINF02 se sigue invocando sin transacciones
// desde código anterior, y en ese caso debe omitir la sección en lugar de
// romper o de inventar un detalle que no tiene.

import { describe, it, expect } from 'vitest';
import { calcMetricas, detectPatrones, calcScoring } from '../src/lib/aml.js';
import { genINF02, genLegajoCompleto } from '../src/lib/reports.js';

const tx = (cp, monto, tipo, fecha, hora) =>
  ({ tipo, monto, fecha, hora: hora || '14:00', contraparte_nombre: cp });

// Fraccionamiento + circularidad + concentración
const OPS = [];
for (let i = 0; i < 6; i++) OPS.push(tx('PROV-A', 700000 + i, 'IN', '1/6/2026'));
for (let i = 0; i < 4; i++) OPS.push(tx('DEST-B', 600000 + i, 'OUT', '2/6/2026'));
OPS.push(tx('PROV-A', 300000, 'OUT', '3/6/2026'));

const LEG = { id:'L1', razonSocial:'Holtz S.A.', cuit:'30-71234567-8',
              segmento:'ALTO', estadoCuenta:'ACTIVA' };
const M = calcMetricas(OPS);
const SIGS = detectPatrones(M, LEG);
const SC = calcScoring(M, SIGS);
const PER = { id:'p1', legajoId:'L1', nombre:'Junio 2026', createdAt:'1/7/2026',
              txns: OPS, metricas: M };

describe('INF-02', () => {
  it('con transacciones incorpora el detalle por señal', () => {
    const h = genINF02(LEG, PER, M, SIGS, SC, [], OPS);
    expect(h).toContain('Detalle de operaciones por señal');
    expect(h).toContain('Operaciones que sustentan');
    expect(h).toContain('PROV-A');
  });

  it('el detalle informa cantidad e importe de lo que sustenta la señal', () => {
    const h = genINF02(LEG, PER, M, SIGS, SC, [], OPS);
    expect(h).toMatch(/Operaciones que sustentan la señal — \d+/);
  });

  it('sin transacciones omite la sección en lugar de romper', () => {
    const h = genINF02(LEG, PER, M, SIGS, SC, []);
    expect(h).not.toContain('Detalle de operaciones por señal');
    expect(h.trim().endsWith('</html>')).toBe(true);
    expect(h).not.toContain('undefined');
  });

  it('se emite completo y firmado', () => {
    const h = genINF02(LEG, PER, M, SIGS, SC, [], OPS);
    // Este informe llegó a producción con una función de firma inexistente:
    // se generaba la excepción recién al emitirlo.
    expect(h).toContain('Firma');
    expect(h.trim().endsWith('</html>')).toBe(true);
  });
});

describe('legajo completo', () => {
  const base = { legajo: LEG, casos: [], rfis: [], screening: null, vencimientos: [],
                 usuario: { nombre:'Frann', rol:'compliance' }, documentos: [],
                 senalesPorPeriodo: { p1: SIGS } };

  it('adjunta las operaciones de cada señal del período', () => {
    const h = genLegajoCompleto(Object.assign({}, base, { periodos: [PER] }));
    expect(h).toContain('Operaciones que sustentan');
    expect(h).toContain('PROV-A');
  });

  it('un período sin transacciones cargadas no produce tabla', () => {
    const sinTxns = Object.assign({}, PER, { txns: undefined });
    const h = genLegajoCompleto(Object.assign({}, base, { periodos: [sinTxns] }));
    expect(h).not.toContain('Operaciones que sustentan');
    expect(h.trim().endsWith('</html>')).toBe(true);
    expect(h).not.toContain('undefined');
  });
});

describe('patrones estructurales en los informes', () => {
  // Muchos orígenes hacia un destino: la forma del período, no un subconjunto
  const embudo = [];
  for (let i = 0; i < 14; i++) embudo.push(tx('ORIGEN ' + i, 100000, 'IN', '1/6/2026'));
  embudo.push(tx('UNICO DESTINO', 1300000, 'OUT', '2/6/2026'));
  const m2 = calcMetricas(embudo);
  const s2 = detectPatrones(m2, LEG);

  it('se declaran como tales en lugar de mostrar una tabla vacía', () => {
    expect(s2.some(s => s.estructural), 'el caso no generó patrón estructural').toBe(true);
    const h = genINF02(LEG, { id:'p2', nombre:'X', txns: embudo }, m2, s2,
                       calcScoring(m2, s2), [], embudo);
    expect(h).toContain('forma del período en su conjunto');
  });

  it('el informe no atribuye operaciones a un patrón estructural', () => {
    const estr = s2.find(s => s.estructural);
    expect(estr.ops).toEqual([]);
  });
});
