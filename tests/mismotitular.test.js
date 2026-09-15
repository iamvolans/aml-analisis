// Movimientos entre cuentas del propio titular.
//
// Una transferencia de la empresa hacia otra cuenta de su misma titularidad no
// tiene contraparte: el dinero no cambia de dueño. Computarla como si la
// tuviera hacía que el cliente figurara como origen Y destino de sus propios
// fondos, que es exactamente la forma del patrón de circularidad — una señal de
// severidad alta, emitida sobre operatoria legítima, capaz de fundar un reporte
// ante la autoridad.
//
// La regla clasifica, no descarta: los movimientos se apartan del cómputo de
// patrones basados en contraparte pero se conservan e informan. Ocultarlos
// cambiaría un falso positivo por un falso negativo, porque un volumen elevado
// de movimientos entre cuentas propias puede ser en sí mismo un hecho a
// analizar.

import { describe, it, expect } from 'vitest';
import { claveNombre, soloDigitos, identidadesDe, motivoMismoTitular,
         separarMismoTitular, leyendaMismoTitular } from '../src/lib/mismotitular.js';
import { calcMetricas, detectPatrones, operacionesDeSenal } from '../src/lib/aml.js';
import { genROS } from '../src/lib/reports.js';

const LEG = { razonSocial:'GOAT S.A.', cuit:'30-71703953-6' };
const tx = (cp, cuit, monto, tipo) =>
  ({ tipo, monto, fecha:'1/8/2026', hora:'12:00', contraparte_nombre: cp, contraparte_cuit: cuit });

describe('normalización de la denominación', () => {
  it('las formas societarias no impiden el reconocimiento', () => {
    const esperado = claveNombre('GOAT S.A.');
    ['GOAT SA', 'GOAT SOCIEDAD ANONIMA', 'Goat s.a.', 'GOAT S.A.S.', 'GOAT']
      .forEach(v => expect(claveNombre(v), v).toBe(esperado));
  });

  it('empresas distintas no colisionan', () => {
    expect(claveNombre('GOAT S.A.')).not.toBe(claveNombre('GOATEX S.A.'));
    expect(claveNombre('ALFA SRL')).not.toBe(claveNombre('ALFA BETA SRL'));
  });

  it('el documento se compara solo por sus dígitos', () => {
    expect(soloDigitos('30-71703953-6')).toBe(soloDigitos('30717039536'));
    expect(soloDigitos('')).toBe('');
  });
});

describe('identificación del titular', () => {
  const ident = identidadesDe(LEG);

  it('reconoce por CUIT con o sin guiones', () => {
    expect(motivoMismoTitular(tx('CUALQUIER NOMBRE', '30717039536', 100, 'IN'), ident)).toBe('documento');
    expect(motivoMismoTitular(tx('CUALQUIER NOMBRE', '30-71703953-6', 100, 'IN'), ident)).toBe('documento');
  });

  it('reconoce por denominación cuando no hay documento', () => {
    expect(motivoMismoTitular(tx('GOAT SOCIEDAD ANONIMA', '', 100, 'IN'), ident)).toBe('denominación');
  });

  it('el documento manda sobre el nombre', () => {
    // Dos empresas pueden llamarse parecido, pero un CUIT distinto las separa
    const otra = tx('GOAT S.A.', '30-99999999-9', 100, 'IN');
    expect(motivoMismoTitular(otra, ident)).toBeNull();
  });

  it('un tercero no se confunde con el titular', () => {
    expect(motivoMismoTitular(tx('PROVEEDOR SRL', '30-88888888-8', 100, 'IN'), ident)).toBeNull();
    expect(motivoMismoTitular(tx('PROVEEDOR SRL', '', 100, 'IN'), ident)).toBeNull();
  });

  it('admite cuentas propias declaradas por el analista', () => {
    const conDecl = identidadesDe(Object.assign({}, LEG, {
      cuentasPropias: 'GOAT PAGOS, 30-55555555-5\nGOAT OPERACIONES'
    }));
    expect(motivoMismoTitular(tx('X', '30-55555555-5', 100, 'IN'), conDecl)).toBe('documento');
    expect(motivoMismoTitular(tx('GOAT OPERACIONES', '', 100, 'IN'), conDecl)).toBe('denominación');
  });

  it('sin legajo no reconoce nada', () => {
    expect(motivoMismoTitular(tx('GOAT S.A.', '30-71703953-6', 100, 'IN'), identidadesDe(null))).toBeNull();
  });
});

describe('separación de operaciones', () => {
  const ops = [
    tx('GOAT S.A.', '30-71703953-6', 5000000, 'IN'),
    tx('GOAT SOCIEDAD ANONIMA', '', 2000000, 'OUT'),
    tx('PROVEEDOR REAL SRL', '30-99999999-9', 800000, 'IN'),
  ];
  const r = separarMismoTitular(ops, LEG);

  it('aparta las propias y conserva las de terceros', () => {
    expect(r.propias.length).toBe(2);
    expect(r.terceros.length).toBe(1);
    expect(r.terceros[0].contraparte_nombre).toBe('PROVEEDOR REAL SRL');
  });

  it('no pierde ninguna operación', () => {
    expect(r.propias.length + r.terceros.length).toBe(ops.length);
  });

  it('informa el motivo de cada reconocimiento', () => {
    expect(r.resumen.porDocumento).toBe(1);
    expect(r.resumen.porDenominacion).toBe(1);
  });

  it('suma los importes por sentido', () => {
    expect(r.resumen.montoIn).toBe(5000000);
    expect(r.resumen.montoOut).toBe(2000000);
    expect(r.resumen.montoTotal).toBe(7000000);
  });

  it('sin legajo no aparta nada', () => {
    expect(separarMismoTitular(ops, null).terceros.length).toBe(3);
  });
});

describe('efecto sobre la detección de patrones', () => {
  // La empresa mueve fondos entre sus cuentas en ambos sentidos, y además opera
  // con terceros
  const ops = [
    tx('GOAT S.A.', '30-71703953-6', 5000000, 'IN'),
    tx('GOAT S.A.', '30-71703953-6', 4800000, 'OUT'),
    tx('GOAT SOCIEDAD ANONIMA', '', 2000000, 'IN'),
    tx('GOAT SA', '', 1900000, 'OUT'),
    tx('PROVEEDOR REAL SRL', '30-99999999-9', 800000, 'IN'),
    tx('CLIENTE X SA', '30-88888888-8', 600000, 'OUT'),
  ];

  it('sin identificar al titular se emite circularidad', () => {
    const m = calcMetricas(ops, {});
    expect(m.circularCount).toBeGreaterThan(0);
    expect(detectPatrones(m, {}).map(s => s.pat)).toContain('PAT-03');
  });

  it('identificándolo, la circularidad desaparece', () => {
    const m = calcMetricas(ops, LEG);
    expect(m.circularCount).toBe(0);
    expect(detectPatrones(m, LEG).map(s => s.pat)).not.toContain('PAT-03');
  });

  it('el tránsito de fondos deja de computar movimientos propios', () => {
    const sin = detectPatrones(calcMetricas(ops, {}), {}).map(s => s.pat);
    const con = detectPatrones(calcMetricas(ops, LEG), LEG).map(s => s.pat);
    expect(sin).toContain('PAT-09');
    expect(con).not.toContain('PAT-09');
  });

  it('las contrapartes cuentan solo terceros', () => {
    const m = calcMetricas(ops, LEG);
    expect(m.uniqueCpIn).toBe(1);
    expect(m.uniqueCpOut).toBe(1);
  });

  it('los movimientos propios quedan registrados, no descartados', () => {
    const m = calcMetricas(ops, LEG);
    expect(m.mismoTitular.cantidad).toBe(4);
    expect(m.mismoTitular.montoTotal).toBe(13700000);
    expect(m.totalTxnsConPropias).toBe(6);
  });

  it('las señales legítimas sobre terceros se siguen emitiendo', () => {
    // Un tercero que concentra debe seguir detectándose
    const conTercero = [
      tx('GOAT S.A.', '30-71703953-6', 1000000, 'IN'),
      tx('DOMINANTE SA', '30-77777777-7', 9000000, 'IN'),
      tx('MENOR SRL', '30-66666666-6', 1000, 'IN'),
    ];
    expect(detectPatrones(calcMetricas(conTercero, LEG), LEG).map(s => s.pat)).toContain('PAT-06');
  });

  it('un período íntegramente de movimientos propios no rompe', () => {
    const soloPropias = [
      tx('GOAT S.A.', '30-71703953-6', 100000, 'IN'),
      tx('GOAT S.A.', '30-71703953-6', 90000, 'OUT'),
    ];
    const m = calcMetricas(soloPropias, LEG);
    expect(m.sinTerceros).toBe(true);
    expect(m.mismoTitular.cantidad).toBe(2);
    expect(function(){ detectPatrones(m, LEG); }).not.toThrow();
  });
});

describe('declaración en los informes', () => {
  it('la leyenda explica qué se apartó y por qué', () => {
    const r = separarMismoTitular([
      tx('GOAT S.A.', '30-71703953-6', 5000000, 'IN'),
      tx('PROVEEDOR REAL SRL', '30-99999999-9', 800000, 'IN'),
    ], LEG);
    const l = leyendaMismoTitular(r.resumen);
    expect(l).toContain('titularidad del propio cliente');
    expect(l).toMatch(/no importan transferencia de fondos a terceros/);
    expect(l).toMatch(/se excluyen/);
  });

  it('sin movimientos propios no hay leyenda que agregar', () => {
    expect(leyendaMismoTitular({ cantidad: 0 })).toBe('');
    expect(leyendaMismoTitular(null)).toBe('');
  });
});

// ── El ROS no puede reportar al cliente contra sí mismo ───────────────────
// Un reporte emitido desde métricas anteriores a la regla presentaba las
// transferencias del cliente hacia sus propias cuentas como las operaciones más
// relevantes, y emitía señales cuya "contraparte" era el CUIT del propio
// titular. Si el período conserva sus transacciones, se recalcula.
describe('ROS y movimientos del propio titular', () => {
  const tx2 = (cp, cuit, monto, tipo) =>
    ({ tipo, monto, fecha:'2026-08-01', hora:'12:00', contraparte_nombre: cp, contraparte_cuit: cuit });

  const LEGR = { id:'L1', razonSocial:'CRAVERO NEGOCIOS S.A.', cuit:'30-71813032-4',
                 facturacionMensual: 5000000000, checklist:{} };
  const ops = [];
  for (let i = 0; i < 10; i++) {
    ops.push(tx2('Cravero Negocios SA', '30718130324', 90000000, 'IN'));
    ops.push(tx2('Cravero Negocios SA', '30718130324', 90000000, 'OUT'));
  }
  for (let i = 0; i < 8; i++) ops.push(tx2('PERSONA ' + i, '20' + (300000000 + i), 700000, 'IN'));

  // Período anterior a la regla: métricas sin el campo
  const viejas = calcMetricas(ops, {});
  delete viejas.mismoTitular;
  const PER = { id:'p1', nombre:'Agosto 26', legajoId:'L1', txns: ops, metricas: viejas };
  const H = genROS(LEGR, [PER], ['p1'], [], { nombre:'Axel' }, '017');

  function seccion(desde, hasta) {
    const m = new RegExp(desde + '([\\s\\S]*?)' + hasta).exec(H);
    return m ? m[1] : '';
  }

  it('el ranking de mayor monto no encabeza con el propio titular', () => {
    expect(seccion('5\\.1 Operaciones de Mayor Monto', '(5\\.2|<h2>6)')).not.toMatch(/Cravero/i);
  });

  it('ninguna señal toma al propio CUIT como contraparte', () => {
    expect(seccion('4\\. Señales de Alerta', '5\\. Operaciones')).not.toContain('30718130324');
  });

  it('los movimientos propios se exhiben en su propia sección', () => {
    expect(H).toContain('Movimientos entre Cuentas del Propio Titular');
    expect(H).toContain('Cravero Negocios SA');   // visibles, no ocultos
  });

  it('el informe declara qué se apartó y por qué', () => {
    expect(H).toContain('titularidad del propio cliente');
  });

  it('se emite completo', () => {
    expect(H.trim().endsWith('</html>')).toBe(true);
    expect(H).not.toContain('undefined');
  });

  it('un período con métricas ya correctas no se recalcula de más', () => {
    const buenas = calcMetricas(ops, LEGR);
    expect(buenas.mismoTitular.cantidad).toBe(20);
    const per2 = { id:'p2', nombre:'X', legajoId:'L1', txns: ops, metricas: buenas };
    const h2 = genROS(LEGR, [per2], ['p2'], [], { nombre:'Axel' }, '018');
    expect(h2).toContain('Movimientos entre Cuentas del Propio Titular');
  });
});

// ── La evidencia se resuelve contra el archivo completo ───────────────────
// Las posiciones registradas al detectar un patrón se resuelven después contra
// las transacciones tal como se cargaron. Al apartar los movimientos del propio
// titular, el índice pasó a armarse sobre el subconjunto de terceros y las
// posiciones quedaron corridas: la tabla del informe exhibía operaciones que no
// eran las que sustentaban la señal.
//
// En un reporte que se presenta ante la autoridad, exhibir las operaciones
// equivocadas es peor que no exhibir ninguna.
describe('alineación de la evidencia con el archivo original', () => {
  const tx3 = (cp, cuit, monto, tipo, fecha) =>
    ({ tipo, monto, fecha: fecha || '1/8/2026', hora:'12:00',
       contraparte_nombre: cp, contraparte_cuit: cuit });
  const LEGC = { razonSocial:'CRAVERO NEGOCIOS S.A.', cuit:'30-71813032-4' };

  // Propias primero, terceros después: cualquier corrimiento se hace visible
  const ops = [];
  for (let i = 0; i < 5; i++) ops.push(tx3('Cravero Negocios SA', '30718130324', 90000000, 'IN'));
  for (let i = 0; i < 6; i++) ops.push(tx3('PROV FRACCIONA', '20300000001', 700000 + i, 'IN', '2/8/2026'));
  for (let i = 0; i < 4; i++) ops.push(tx3('OTRO ' + i, '20' + (400000000 + i), 50000, 'OUT', '3/8/2026'));

  const sigs = detectPatrones(calcMetricas(ops, LEGC), LEGC);

  it('ninguna señal exhibe operaciones del propio titular', () => {
    sigs.forEach(s => {
      const o = operacionesDeSenal(s, ops);
      const propias = o.filter(x => x.contraparte_cuit === '30718130324');
      expect(propias.length, s.pat + ' exhibe ' + propias.length + ' movimientos del titular').toBe(0);
    });
  });

  it('las posiciones apuntan a la operación correcta del archivo', () => {
    sigs.filter(s => s.ops.length).forEach(s => {
      s.ops.forEach(i => {
        expect(ops[i], s.pat + ': posición ' + i + ' fuera de rango').toBeDefined();
      });
    });
  });

  it('el fraccionamiento señala las operaciones del tercero que lo produjo', () => {
    const s = sigs.find(x => x.pat === 'PAT-01');
    expect(s).toBeDefined();
    const o = operacionesDeSenal(s, ops);
    expect(o.length).toBeGreaterThan(0);
    expect(o.every(x => x.contraparte_nombre === 'PROV FRACCIONA')).toBe(true);
  });

  it('sin movimientos propios las posiciones siguen siendo correctas', () => {
    const soloTerceros = ops.filter(o => o.contraparte_cuit !== '30718130324');
    const s2 = detectPatrones(calcMetricas(soloTerceros, LEGC), LEGC).find(x => x.ops.length);
    operacionesDeSenal(s2, soloTerceros).forEach(o => expect(o).toBeDefined());
  });
});
