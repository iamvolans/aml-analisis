// Lectura de la columna de contraparte y protección contra el artefacto que
// produce su ausencia.
//
// Origen del problema: un archivo cuya columna de contraparte no se reconocía
// dejaba todas las operaciones sin contraparte. Aguas abajo, calcMetricas las
// agrupaba bajo un único rótulo 'Desconocido' y de ahí salían señales ALTA de
// concentración del 100%, fraccionamiento y embudo — todas describiendo el
// fallo de lectura, no la operatoria del cliente.
//
// La causa raíz del no reconocimiento era más sutil: el buscador de columnas
// hacía coincidencia por subcadena, y el alias 'to' (destinatario en inglés)
// coincidía dentro de "Mon-to". La columna de importes se tomaba como
// destinatario.

import { describe, it, expect } from 'vitest';
import { normalizeRows } from '../src/lib/parsers.js';
import { calcMetricas, detectPatrones } from '../src/lib/aml.js';

const fila = (f, t, m, ...resto) => [f, t, m, ...resto];

describe('reconocimiento de la columna de contraparte', () => {
  const formatos = [
    ['Contraparte',              ['Fecha','Tipo','Monto','Contraparte'],              ['5/6/2026','IN',1000,'ACME SA']],
    ['Contrapartida',            ['Fecha','Tipo','Monto','Contrapartida'],            ['5/6/2026','IN',1000,'ACME SA']],
    ['Denominación Contraparte', ['Fecha','Tipo','Monto','Denominación Contraparte'], ['5/6/2026','IN',1000,'ACME SA']],
    ['Titular',                  ['Fecha','Tipo','Monto','Titular'],                  ['5/6/2026','IN',1000,'ACME SA']],
    ['Razón Social',             ['Fecha','Tipo','Monto','Razón Social'],             ['5/6/2026','IN',1000,'ACME SA']],
    ['Ordenante',                ['Fecha','Tipo','Monto','Ordenante'],                ['5/6/2026','IN',1000,'ACME SA']],
    ['Beneficiario',             ['Fecha','Tipo','Monto','Beneficiario'],             ['5/6/2026','OUT',1000,'ACME SA']],
    ['Origen',                   ['Fecha','Tipo','Monto','Origen'],                   ['5/6/2026','IN',1000,'ACME SA']],
    ['Destino',                  ['Fecha','Tipo','Monto','Destino'],                  ['5/6/2026','OUT',1000,'ACME SA']],
    ['Remitente',                ['Fecha','Tipo','Monto','Remitente'],                ['5/6/2026','IN',1000,'ACME SA']],
    ['Destinatario',             ['Fecha','Tipo','Monto','Destinatario'],             ['5/6/2026','OUT',1000,'ACME SA']],
  ];

  formatos.forEach(([nombre, cab, dato]) => {
    it('reconoce la columna "' + nombre + '"', () => {
      const t = normalizeRows([cab, dato]);
      expect(t.length).toBe(1);
      expect(t[0].contraparte_nombre).toBe('ACME SA');
      expect(t.diagnostico.contraparteAusente).toBe(false);
    });
  });

  it('con columnas separadas usa el ordenante para ingresos y el beneficiario para egresos', () => {
    const t = normalizeRows([
      ['Fecha','Tipo','Importe','Ordenante','Beneficiario'],
      ['5/6/2026','Credito',1000,'QUIEN PAGA',''],
      ['6/6/2026','Debito', 500,'','QUIEN COBRA'],
    ]);
    expect(t[0].tipo).toBe('IN');
    expect(t[0].contraparte_nombre).toBe('QUIEN PAGA');
    expect(t[1].tipo).toBe('OUT');
    expect(t[1].contraparte_nombre).toBe('QUIEN COBRA');
  });

  it('si solo existe una de las dos columnas, sirve para ambos sentidos', () => {
    const t = normalizeRows([
      ['Fecha','Tipo','Monto','Ordenante'],
      ['5/6/2026','IN',1000,'ACME SA'],
      ['6/6/2026','OUT',500,'BETA SRL'],
    ]);
    expect(t.map(x => x.contraparte_nombre)).toEqual(['ACME SA','BETA SRL']);
  });

  it('detecta cuando el archivo NO trae contraparte', () => {
    const t = normalizeRows([
      ['Fecha','Tipo','Monto','Concepto'],
      ['5/6/2026','IN',1000,'transferencia'],
      ['6/6/2026','OUT',500,'pago'],
    ]);
    expect(t.diagnostico.contraparteAusente).toBe(true);
    expect(t.diagnostico.sinContraparte).toBe(2);
    expect(t.every(x => !x.contraparte_nombre)).toBe(true);
  });
});

describe('colisión de alias por subcadena', () => {
  // La causa raíz: 'to' coincidía dentro de 'Monto'.
  it('la columna Monto no se confunde con destinatario', () => {
    const t = normalizeRows([['Fecha','Tipo','Monto','Concepto'], ['5/6/2026','IN',1000,'pago']]);
    expect(t.diagnostico.columnas.destinatario).toBe(-1);
    expect(t[0].contraparte_nombre).not.toBe('1000');
    expect(t[0].monto).toBe(1000);
  });

  it('la coincidencia exacta tiene prioridad sobre la parcial', () => {
    // "Contraparte" exacta debe ganarle a "Nombre del Ordenante"
    const t = normalizeRows([
      ['Fecha','Tipo','Monto','Nombre del Ordenante','Contraparte'],
      ['5/6/2026','IN',1000,'NO ES ESTA','ES ESTA'],
    ]);
    expect(t[0].contraparte_nombre).toBe('ES ESTA');
  });

  it('un alias corto no coincide dentro de otra palabra', () => {
    // 'op' (de operacion) no debe tomar la columna "Top Cliente"
    const t = normalizeRows([['Fecha','Top Cliente','Monto','Tipo'], ['5/6/2026','x',1000,'IN']]);
    expect(t[0].tipo).toBe('IN');
  });
});

describe('protección: sin contraparte no se emiten señales que dependan de ella', () => {
  function ops(cp, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ tipo: i % 2 ? 'IN' : 'OUT', monto: 700000 + i,
                 fecha: ((i % 9) + 1) + '/6/2026', hora: '12:00',
                 contraparte_nombre: typeof cp === 'function' ? cp(i) : cp });
    }
    return out;
  }
  const DEPENDEN = ['PAT-01','PAT-02','PAT-03','PAT-04','PAT-06','PAT-09','PAT-10','PAT-11','PAT-12','PAT-14'];

  it('marca las métricas como sin contraparte identificable', () => {
    const m = calcMetricas(ops('', 100));
    expect(m.cpIdentificable).toBe(false);
    expect(m.pctSinCp).toBe(100);
  });

  it('emite DATA-01 y suprime los patrones que dependen de la contraparte', () => {
    const sigs = detectPatrones(calcMetricas(ops('', 180)), {});
    const pats = sigs.map(s => s.pat);
    expect(pats).toContain('DATA-01');
    DEPENDEN.forEach(p => expect(pats, p + ' no debe emitirse sin contraparte').not.toContain(p));
  });

  it('la señal de datos explica la causa, no un hallazgo inexistente', () => {
    const d = detectPatrones(calcMetricas(ops('', 100)), {}).find(s => s.pat === 'DATA-01');
    expect(d.sev).toBe('ALTA');
    expect(d.desc).toMatch(/contraparte/i);
    expect(d.desc).toMatch(/artefacto|no un hallazgo/i);
  });

  it('con contrapartes identificadas, los patrones vuelven a evaluarse', () => {
    const m = calcMetricas(ops(i => 'PROVEEDOR ' + (i % 40), 180));
    expect(m.cpIdentificable).toBe(true);
    const pats = detectPatrones(m, {}).map(s => s.pat);
    expect(pats).not.toContain('DATA-01');
  });

  it('una concentración REAL en una contraparte identificada se sigue reportando', () => {
    // La protección no puede cegar hallazgos legítimos
    const txns = ops('CRAVERO SA', 60).map(t => ({ ...t, tipo: 'IN' }));
    txns.push({ tipo:'IN', monto:100, fecha:'5/6/2026', hora:'12:00', contraparte_nombre:'OTRO' });
    const m = calcMetricas(txns);
    expect(m.cpIdentificable).toBe(true);
    expect(m.top1In).toBeGreaterThan(99);
    expect(detectPatrones(m, {}).map(s => s.pat)).toContain('PAT-06');
  });

  it('con la mitad de las operaciones identificadas se considera utilizable', () => {
    const mitad = ops('ACME', 50).concat(ops('', 50));
    expect(calcMetricas(mitad).cpIdentificable).toBe(true);
  });
});
