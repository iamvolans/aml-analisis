// Conciliación y control de convenios de recaudación.
//
// En esta modalidad la entidad recibe cheques de libradores terceros y liquida
// el producido a beneficiarios que el cliente instruye, bajo pago por cuenta y
// orden. El flujo es por diseño un embudo, de modo que las reglas generales que
// detectan esa forma describirían el modelo de negocio y no una anomalía.
//
// Lo que distingue una operación regular de una irregular acá es la ARITMÉTICA:
// que lo liquidado se corresponda con lo cobrado menos la comisión pactada.

import { describe, it, expect } from 'vitest';
import { COBRANZA, conciliar, beneficiarios, beneficiariosNuevos,
         reglasCobranza, analizarConvenio, unificarOperaciones, esRecaudacion } from '../src/lib/cobranza.js';
import { calcMetricas, detectPatrones } from '../src/lib/aml.js';

const cheque = (librador, monto) =>
  ({ tipo:'IN', monto, fecha:'5/6/2026', hora:'12:00', contraparte_nombre: librador });
const liq = (benef, monto) =>
  ({ tipo:'OUT', monto, fecha:'6/6/2026', hora:'12:00', contraparte_nombre: benef });

// Cartera regular: 10 cheques de $100.000, comisión 0,6%, liquidado correcto
const CHEQUES = Array.from({length:10}, (_, i) => cheque('LIBRADOR ' + i, 100000));
const ESPERADO = 1000000 * 0.994;   // 994.000

describe('conciliación', () => {
  it('calcula el producido a liquidar según la comisión pactada', () => {
    const c = conciliar(CHEQUES, [], 0.6);
    expect(c.cobrado).toBe(1000000);
    expect(c.comisionTeorica).toBeCloseTo(6000, 2);
    expect(c.esperado).toBeCloseTo(994000, 2);
  });

  it('una liquidación correcta deja saldo cero', () => {
    const c = conciliar(CHEQUES, [liq('BENEFICIARIO', ESPERADO)], 0.6);
    expect(c.saldo).toBeCloseTo(0, 2);
    expect(c.comisionImplicita).toBeCloseTo(0.6, 2);
    expect(c.desvioComision).toBeCloseTo(0, 2);
  });

  it('detecta el saldo sin liquidar', () => {
    const c = conciliar(CHEQUES, [liq('B', 500000)], 0.6);
    expect(c.saldo).toBeCloseTo(494000, 2);
    expect(c.saldoPct).toBeGreaterThan(49);
  });

  it('un saldo negativo significa que se liquidó de más', () => {
    const c = conciliar(CHEQUES, [liq('B', 1200000)], 0.6);
    expect(c.saldo).toBeLessThan(0);
  });

  it('sin comisión registrada usa la de referencia', () => {
    expect(conciliar(CHEQUES, [], null).comisionPactada).toBe(COBRANZA.COMISION_DEFECTO);
    expect(conciliar(CHEQUES, [], '').comisionPactada).toBe(COBRANZA.COMISION_DEFECTO);
  });

  it('sin cobranza no divide por cero', () => {
    const c = conciliar([], [], 0.6);
    expect(c.cobrado).toBe(0);
    expect(c.comisionImplicita).toBeNull();
    expect(c.saldoPct).toBe(0);
  });
});

describe('reglas propias del producto', () => {
  const pats = s => s.map(x => x.pat);

  it('una cartera regular no emite señales', () => {
    const r = analizarConvenio({ cheques: CHEQUES, liquidaciones: [liq('B', ESPERADO)], comision: 0.6 });
    expect(r.senales).toEqual([]);
  });

  it('COB-01: liquidar por encima del producido', () => {
    const r = analizarConvenio({ cheques: CHEQUES, liquidaciones: [liq('B', 1200000)], comision: 0.6 });
    const s = r.senales.find(x => x.pat === 'COB-01');
    expect(s).toBeDefined();
    expect(s.sev).toBe('ALTA');
    expect(s.desc).toMatch(/exceso/i);
  });

  it('COB-01: liquidar sin cobranza registrada', () => {
    const r = analizarConvenio({ cheques: [], liquidaciones: [liq('B', 50000)], comision: 0.6 });
    expect(pats(r.senales)).toContain('COB-01');
  });

  it('COB-02: comisión efectiva fuera de lo pactado', () => {
    // Se retiene 3% en vez del 0,6% pactado
    const r = analizarConvenio({ cheques: CHEQUES, liquidaciones: [liq('B', 970000)], comision: 0.6 });
    const s = r.senales.find(x => x.pat === 'COB-02');
    expect(s).toBeDefined();
    expect(s.desc).toMatch(/3\.00%|3,00%/);
  });

  it('un desvío dentro de la tolerancia no se reporta', () => {
    // 0,8% contra 0,6% pactado: 0,2 puntos, por debajo de la tolerancia
    const r = analizarConvenio({ cheques: CHEQUES, liquidaciones: [liq('B', 992000)], comision: 0.6 });
    expect(pats(r.senales)).not.toContain('COB-02');
  });

  it('COB-03: producido retenido sin liquidar', () => {
    const r = analizarConvenio({ cheques: CHEQUES, liquidaciones: [liq('B', 500000)], comision: 0.6 });
    expect(pats(r.senales)).toContain('COB-03');
  });

  it('COB-04: beneficiario nuevo que concentra, solo con historial', () => {
    const previos = [{ metricas: { cpOut: { 'BENEFICIARIO HABITUAL': 900000 } } }];
    const r = analizarConvenio({
      cheques: CHEQUES,
      liquidaciones: [liq('BENEFICIARIO HABITUAL', 300000), liq('DESTINO NUEVO', 694000)],
      comision: 0.6, periodosPrevios: previos });
    const s = r.senales.find(x => x.pat === 'COB-04');
    expect(s).toBeDefined();
    expect(s.desc).toContain('DESTINO NUEVO');
  });

  it('sin períodos previos no se reporta beneficiario nuevo', () => {
    // Sin historial todos son nuevos: informarlo no aportaría nada
    const r = analizarConvenio({ cheques: CHEQUES,
      liquidaciones: [liq('CUALQUIERA', ESPERADO)], comision: 0.6, periodosPrevios: [] });
    expect(pats(r.senales)).not.toContain('COB-04');
  });

  it('COB-05: destinatario único con varias liquidaciones', () => {
    const r = analizarConvenio({ cheques: CHEQUES,
      liquidaciones: [liq('UNICO', 500000), liq('UNICO', 494000)], comision: 0.6 });
    expect(pats(r.senales)).toContain('COB-05');
  });
});

describe('beneficiarios', () => {
  it('agrega por destinatario con su participación', () => {
    const b = beneficiarios([liq('A', 700000), liq('B', 300000), liq('A', 0)]);
    expect(b[0].nombre).toBe('A');
    expect(b[0].ops).toBe(2);
    expect(b[0].part).toBeCloseTo(70, 1);
  });

  it('identifica los que no aparecen en períodos previos', () => {
    const previos = [{ metricas: { cpOut: { 'CONOCIDO': 100 } } }];
    const nuevos = beneficiariosNuevos([{nombre:'CONOCIDO'}, {nombre:'NUEVO'}], previos);
    expect(nuevos.map(x => x.nombre)).toEqual(['NUEVO']);
  });

  it('ignora las liquidaciones sin destinatario identificado', () => {
    expect(beneficiarios([liq('', 1000), liq('A', 500)]).length).toBe(1);
  });
});

describe('calibración de las reglas generales', () => {
  // Cartera típica: 30 libradores hacia 1 beneficiario, sale lo que entra
  const cheques30 = Array.from({length:30}, (_, i) => cheque('LIBRADOR ' + i, 100000));
  const opsRecaud = unificarOperaciones(cheques30, [liq('BENEFICIARIO', 2982000)]);
  const m = calcMetricas(opsRecaud);

  it('la forma de embudo del convenio se detectaría con las reglas generales', () => {
    const pats = detectPatrones(m, {}).map(s => s.pat);
    expect(pats).toContain('PAT-02');   // cuenta embudo
    expect(pats).toContain('PAT-09');   // tránsito de fondos
    expect(pats).toContain('PAT-12');   // muchos-a-pocos
  });

  it('marcado como convenio de recaudación, esas tres no se emiten', () => {
    const pats = detectPatrones(m, { tipoOperatoria: 'RECAUDACION' }).map(s => s.pat);
    ['PAT-02','PAT-09','PAT-12'].forEach(p => expect(pats, p).not.toContain(p));
  });

  it('la circularidad SÍ se sigue detectando en un convenio', () => {
    // Un librador que además recibe la liquidación
    const ops = unificarOperaciones(
      [cheque('EMPRESA X', 500000), cheque('OTRO', 500000)],
      [liq('EMPRESA X', 994000)]);
    const pats = detectPatrones(calcMetricas(ops), { tipoOperatoria: 'RECAUDACION' }).map(s => s.pat);
    expect(pats).toContain('PAT-03');
  });

  it('la concentración de libradores SÍ se sigue detectando', () => {
    const ops = unificarOperaciones(
      [cheque('UNICO LIBRADOR', 3000000), cheque('MENOR', 1000)],
      [liq('B', 2000000)]);
    const pats = detectPatrones(calcMetricas(ops), { tipoOperatoria: 'RECAUDACION' }).map(s => s.pat);
    expect(pats).toContain('PAT-06');
  });

  it('esRecaudacion identifica el tipo de operatoria', () => {
    expect(esRecaudacion({ tipoOperatoria: 'RECAUDACION' })).toBe(true);
    expect(esRecaudacion({ tipoOperatoria: 'CUENTA_PAGO' })).toBe(false);
    expect(esRecaudacion(null)).toBe(false);
  });
});

describe('unificación de archivos', () => {
  it('marca los cheques como ingreso y las liquidaciones como egreso', () => {
    const ops = unificarOperaciones([{monto:100}], [{monto:50}]);
    expect(ops.map(o => o.tipo)).toEqual(['IN','OUT']);
  });
  it('no muta los originales', () => {
    const ch = [{monto:100, tipo:'X'}];
    unificarOperaciones(ch, []);
    expect(ch[0].tipo).toBe('X');
  });
});
