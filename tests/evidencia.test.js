// Evidencia de cada señal: qué operaciones la sustentan.
//
// Antes, una alerta decía "124 ops entre $680K y $799.999" y el analista tenía
// que reconstruir a mano cuáles eran. El motivo era estructural: detectPatrones
// recibe métricas agregadas, no transacciones, de modo que para cuando se emite
// la señal el detalle ya se perdió.
//
// La solución es que calcMetricas registre, mientras recorre las operaciones,
// las POSICIONES de las que sustentan cada patrón. Se guardan posiciones y no
// copias porque las métricas se persisten: guardar las operaciones enteras
// multiplicaría el tamaño de cada período.

import { describe, it, expect } from 'vitest';
import { calcMetricas, detectPatrones, operacionesDeSenal, resumenEvidencia, enriquecerEvidencia } from '../src/lib/aml.js';
import { casosPendientesDeCrear } from '../src/lib/casos.js';

const tx = (cp, monto, tipo, fecha, hora) =>
  ({ tipo: tipo || 'IN', monto, fecha: fecha || '5/6/2026', hora: hora || '14:00',
     contraparte_nombre: cp });

// Tres operaciones del mismo librador el mismo día: fraccionamiento
const FRACC = [tx('ACME SA', 700000), tx('ACME SA', 700001), tx('ACME SA', 700002),
               tx('OTRO', 5000, 'OUT', '6/6/2026')];

describe('recolección de evidencia', () => {
  it('registra las posiciones de las operaciones, no copias', () => {
    const m = calcMetricas(FRACC);
    const ev = m.evidencia['PAT-01'];
    expect(ev.ops).toEqual([0, 1, 2]);
    expect(ev.ops.every(x => typeof x === 'number')).toBe(true);
  });

  it('cuenta el total aunque la lista se acote', () => {
    const m = calcMetricas(FRACC);
    expect(m.evidencia['PAT-01'].total).toBe(3);
  });

  it('acota lo que persiste para no inflar el período', () => {
    // 400 operaciones del mismo librador el mismo día
    const muchas = Array.from({length: 400}, (_, i) => tx('UNICO', 700000 + i));
    const ev = calcMetricas(muchas).evidencia['PAT-01'];
    expect(ev.ops.length).toBeLessThanOrEqual(300);
    expect(ev.total).toBe(400);
  });

  it('sin operaciones no hay evidencia', () => {
    expect(calcMetricas([])).toBeNull();
  });
});

describe('las señales viajan con su evidencia', () => {
  const m = calcMetricas(FRACC);
  const sigs = detectPatrones(m, {});

  it('cada señal declara sus operaciones y el total', () => {
    sigs.forEach(s => {
      expect(Array.isArray(s.ops), s.pat).toBe(true);
      expect(typeof s.opsTotal, s.pat).toBe('number');
    });
  });

  it('el fraccionamiento apunta a las tres operaciones que lo forman', () => {
    const s = sigs.find(x => x.pat === 'PAT-01');
    expect(s.ops).toEqual([0, 1, 2]);
    expect(s.estructural).toBe(false);
  });

  it('los patrones estructurales se declaran como tales, sin operaciones', () => {
    // Muchos orígenes hacia un solo destino: la forma del período, no un
    // subconjunto de movimientos
    const embudo = [];
    for (let i = 0; i < 12; i++) embudo.push(tx('ORIGEN ' + i, 100000));
    embudo.push(tx('DESTINO', 1100000, 'OUT'));
    const s = detectPatrones(calcMetricas(embudo), {}).find(x => x.pat === 'PAT-02');
    expect(s).toBeDefined();
    expect(s.estructural).toBe(true);
    expect(s.ops).toEqual([]);
  });
});

describe('resolución de posiciones a operaciones', () => {
  const m = calcMetricas(FRACC);
  const s = detectPatrones(m, {}).find(x => x.pat === 'PAT-01');

  it('devuelve las operaciones concretas', () => {
    const ops = operacionesDeSenal(s, FRACC);
    expect(ops.length).toBe(3);
    expect(ops.every(o => o.contraparte_nombre === 'ACME SA')).toBe(true);
    expect(ops[0].monto).toBe(700000);
  });

  it('conserva la posición original de cada operación', () => {
    expect(operacionesDeSenal(s, FRACC).map(o => o._i)).toEqual([0, 1, 2]);
  });

  it('sin transacciones cargadas devuelve vacío en lugar de romper', () => {
    expect(operacionesDeSenal(s, null)).toEqual([]);
    expect(operacionesDeSenal(s, [])).toEqual([]);
    expect(operacionesDeSenal(null, FRACC)).toEqual([]);
  });

  it('una posición fuera de rango se descarta sin propagar undefined', () => {
    const roto = Object.assign({}, s, { ops: [0, 99] });
    const ops = operacionesDeSenal(roto, FRACC);
    expect(ops.length).toBe(1);
  });

  it('el resumen describe cantidad, importe, fechas y contrapartes', () => {
    const r = resumenEvidencia(s, FRACC);
    expect(r).toMatch(/3 operación/);
    expect(r).toContain('ACME SA');
    expect(r).toContain('5/6/2026');
  });

  it('sin operaciones el resumen es vacío, no un texto engañoso', () => {
    expect(resumenEvidencia(s, [])).toBe('');
  });
});

describe('el caso hereda la evidencia', () => {
  const leg = { id: 'L1', razonSocial: 'Test SA' };
  // Concentración extrema: dispara una señal de severidad alta
  const ops = [tx('UNICA', 5000000), tx('OTRA', 1)];
  const per = { id: 'p1', legajoId: 'L1', nombre: 'Junio', createdAt: '1/6/2026',
                metricas: calcMetricas(ops), txns: ops };

  it('el caso generado registra las operaciones de la señal', () => {
    const pend = casosPendientesDeCrear([leg], [per], []);
    expect(pend.length).toBeGreaterThan(0);
    const conOps = pend.find(c => (c.ops || []).length > 0);
    expect(conOps, 'ningún caso heredó operaciones').toBeDefined();
    expect(conOps.opsTotal).toBeGreaterThan(0);
  });

  it('el detalle del caso enumera las operaciones implicadas', () => {
    const c = casosPendientesDeCrear([leg], [per], []).find(x => (x.ops || []).length > 0);
    expect(c.detalle).toContain('Operaciones implicadas');
    expect(c.detalle).toContain('UNICA');
  });

  it('sin transacciones cargadas el detalle no inventa evidencia', () => {
    const sinTxns = Object.assign({}, per, { txns: undefined });
    const c = casosPendientesDeCrear([leg], [sinTxns], [])[0];
    expect(c.detalle).not.toContain('Operaciones implicadas');
  });
});

// ── Disponibilidad retroactiva ────────────────────────────────────────────
// La vista de Análisis recalcula las métricas desde las transacciones cargadas,
// de modo que la evidencia queda disponible también para períodos analizados
// antes de esta versión. La bandeja de Alertas, en cambio, usa las métricas
// persistidas: allí solo la tienen los períodos recargados.
describe('evidencia en períodos ya existentes', () => {
  const ops = [tx('ACME SA', 700000), tx('ACME SA', 700001), tx('ACME SA', 700002)];

  it('recalcular desde las transacciones restituye la evidencia', () => {
    // Simula un período viejo: métricas guardadas sin el campo evidencia
    const viejas = calcMetricas(ops);
    delete viejas.evidencia;
    expect(detectPatrones(viejas, {}).find(s => s.pat === 'PAT-01').ops).toEqual([]);

    // Al recalcular con las txns disponibles, la evidencia vuelve
    const frescas = calcMetricas(ops);
    expect(detectPatrones(frescas, {}).find(s => s.pat === 'PAT-01').ops).toEqual([0, 1, 2]);
  });

  it('una métrica sin evidencia no rompe la emisión de señales', () => {
    const sin = calcMetricas(ops);
    delete sin.evidencia;
    const sigs = detectPatrones(sin, {});
    expect(sigs.length).toBeGreaterThan(0);
    sigs.forEach(s => {
      expect(Array.isArray(s.ops)).toBe(true);
      expect(s.opsTotal).toBe(0);
    });
  });
});

// ── Correspondencia entre señal y evidencia ───────────────────────────────
// Un mismo código de patrón puede emitir señales DISTINTAS, y cada una necesita
// su propia evidencia. Al construir esto se cometieron dos errores que estos
// tests fijan:
//
//   · se atribuyeron los montos redondos a PAT-05, que en realidad compara el
//     volumen contra el perfil declarado y no tiene operaciones puntuales;
//   · PAT-06 y PAT-10 emiten variante de entrada y de salida, y ambas
//     compartían evidencia: la señal de cash-in mostraba operaciones de salida.
//
// Mostrar operaciones equivocadas es peor que no mostrar ninguna: el analista
// fundamenta un cierre sobre movimientos que no son los que dispararon la señal.
describe('cada variante de señal lleva su propia evidencia', () => {
  const ops = [];
  for (let i = 0; i < 10; i++) ops.push(tx('DOM-IN', 700000 + i, 'IN', '1/6/2026'));
  for (let i = 0; i < 8; i++)  ops.push(tx('DOM-OUT', 700000 + i, 'OUT', '2/6/2026'));
  for (let i = 0; i < 6; i++)  ops.push(tx('RD-' + i, (i + 1) * 100000, 'IN', '3/6/2026'));
  for (let i = 0; i < 4; i++)  ops.push(tx('RP-' + i, 55555, 'OUT', '4/6/2026'));
  const sigs = detectPatrones(calcMetricas(ops), {});

  function porTitulo(re) { return sigs.filter(s => re.test(s.titulo)); }

  it('la concentración de entrada muestra solo operaciones de entrada', () => {
    porTitulo(/cash-in/).forEach(s => {
      const o = operacionesDeSenal(s, ops);
      expect(o.length, s.titulo).toBeGreaterThan(0);
      expect(o.every(x => x.tipo === 'IN'), s.titulo).toBe(true);
    });
  });

  it('la concentración de salida muestra solo operaciones de salida', () => {
    porTitulo(/cash-out/).forEach(s => {
      const o = operacionesDeSenal(s, ops);
      expect(o.length, s.titulo).toBeGreaterThan(0);
      expect(o.every(x => x.tipo === 'OUT'), s.titulo).toBe(true);
    });
  });

  it('la señal de montos repetidos muestra importes que efectivamente se repiten', () => {
    const s = sigs.find(x => /repetid/i.test(x.titulo));
    expect(s).toBeDefined();
    const o = operacionesDeSenal(s, ops);
    const cuenta = {};
    o.forEach(x => { cuenta[x.monto] = (cuenta[x.monto] || 0) + 1; });
    expect(Object.values(cuenta).every(v => v >= 3)).toBe(true);
  });

  it('la señal de montos redondos muestra múltiplos de 100.000', () => {
    const redondos = [];
    for (let i = 0; i < 9; i++) redondos.push(tx('R' + i, (i + 1) * 100000, 'IN', '1/6/2026'));
    const s = detectPatrones(calcMetricas(redondos), {}).find(x => /redondo/i.test(x.titulo));
    expect(s).toBeDefined();
    const o = operacionesDeSenal(s, redondos);
    expect(o.length).toBeGreaterThan(0);
    expect(o.every(x => x.monto % 100000 === 0)).toBe(true);
  });

  it('el volumen contra el perfil no lleva operaciones: es una razón del período', () => {
    const perf = [];
    for (let i = 0; i < 5; i++) perf.push(tx('X', 3000000, 'IN', '1/6/2026'));
    const s = detectPatrones(calcMetricas(perf, { facturacionMensual: 100000 }),
                             { facturacionMensual: 100000 }).find(x => x.pat === 'PAT-05');
    expect(s).toBeDefined();
    expect(s.estructural).toBe(true);
    expect(s.ops).toEqual([]);
  });
});

// ── Orden de las operaciones ──────────────────────────────────────────────
// En el orden del archivo, las operaciones de una misma contraparte quedan
// dispersas y el analista tiene que rastrearlas a ojo — justamente el trabajo
// que la evidencia viene a evitar. Se agrupan por contraparte y, dentro de cada
// una, cronológicamente.
describe('orden de la evidencia', () => {
  const t2 = (cp, monto, fecha) =>
    ({ tipo:'IN', monto, fecha, hora:'14:00', contraparte_nombre: cp });
  // Deliberadamente desordenado
  const ops = [t2('ZETA',100000,'3/6/2026'), t2('ALFA',200000,'5/6/2026'),
               t2('ZETA',300000,'1/6/2026'), t2('ALFA',100000,'2/6/2026'),
               t2('ZETA',100000,'2/6/2026'), t2('ALFA',100000,'1/6/2026')];
  const senal = { ops: [0,1,2,3,4,5], opsTotal: 6 };
  const orden = operacionesDeSenal(senal, ops);

  it('agrupa las operaciones de una misma contraparte', () => {
    const nombres = orden.map(o => o.contraparte_nombre);
    // Cada contraparte aparece en un bloque contiguo
    const bloques = nombres.filter((n, i) => i === 0 || n !== nombres[i-1]);
    expect(bloques.length).toBe(new Set(nombres).size);
  });

  it('dentro de cada contraparte ordena por fecha', () => {
    const alfa = orden.filter(o => o.contraparte_nombre === 'ALFA').map(o => o.fecha);
    expect(alfa).toEqual(['1/6/2026','2/6/2026','5/6/2026']);
  });

  it('conserva la posición original de cada operación', () => {
    expect(orden.map(o => o._i).sort((a,b) => a-b)).toEqual([0,1,2,3,4,5]);
  });

  it('no pierde ni duplica operaciones al ordenar', () => {
    expect(orden.length).toBe(6);
    expect(new Set(orden.map(o => o._i)).size).toBe(6);
  });

  it('opera igual sin fechas válidas', () => {
    const sinFecha = [t2('B',100,''), t2('A',200,'')];
    const r = operacionesDeSenal({ ops:[0,1] }, sinFecha);
    expect(r.map(o => o.contraparte_nombre)).toEqual(['A','B']);
  });
});

// ── Criterio de agrupación según la señal ─────────────────────────────────
// Agrupar siempre por contraparte no sirve para las señales de importe: en
// "montos exactamente repetidos" lo que hay que ver juntos son los importes que
// se repiten, y ordenar por contraparte los dispersa justamente cuando la señal
// afirma lo contrario.
describe('agrupación según lo que la señal afirma', () => {
  const t3 = (cp, monto, fecha) =>
    ({ tipo:'OUT', monto, fecha, hora:'14:00', contraparte_nombre: cp });
  const ops = [t3('ZETA',77777,'1/6/2026'), t3('ALFA',55555,'2/6/2026'),
               t3('BETA',77777,'3/6/2026'), t3('ALFA',77777,'4/6/2026'),
               t3('ZETA',55555,'5/6/2026'), t3('BETA',55555,'6/6/2026')];
  const sigs = detectPatrones(calcMetricas(ops), {});

  it('la señal de montos repetidos declara agrupación por importe', () => {
    const s = sigs.find(x => /repetid/i.test(x.titulo));
    expect(s).toBeDefined();
    expect(s.orden).toBe('monto');
  });

  it('los importes iguales salen juntos', () => {
    const s = sigs.find(x => /repetid/i.test(x.titulo));
    const montos = operacionesDeSenal(s, ops).map(o => o.monto);
    const bloques = montos.filter((mn, i) => i === 0 || mn !== montos[i-1]);
    expect(bloques.length).toBe(new Set(montos).size);
  });

  it('las demás señales siguen agrupando por contraparte', () => {
    sigs.filter(x => !/repetid|redondo/i.test(x.titulo) && !x.estructural)
        .forEach(s => expect(s.orden, s.titulo).toBe('contraparte'));
  });
});

// ── Evidencia en períodos con métricas guardadas sin ella ─────────────────
// El legajo completo emitía "el período fue analizado con anterioridad al
// registro del detalle" incluso teniendo las transacciones, porque las señales
// se calculan desde las métricas persistidas y éstas no traían la evidencia.
describe('completar la evidencia sin alterar las señales', () => {
  const t4 = (cp, monto, tipo, fecha) =>
    ({ tipo, monto, fecha, hora:'14:00', contraparte_nombre: cp });
  const ops = [];
  for (let i = 0; i < 6; i++) ops.push(t4('PROV-A', 700000 + i, 'IN', '1/6/2026'));
  ops.push(t4('PROV-A', 300000, 'OUT', '2/6/2026'));

  // Período viejo: métricas sin el campo evidencia
  const viejas = calcMetricas(ops);
  delete viejas.evidencia;
  const originales = detectPatrones(viejas, {});

  it('las señales originales no traen evidencia', () => {
    expect(originales.every(s => (s.ops || []).length === 0)).toBe(true);
  });

  it('al completarla, aparecen las operaciones', () => {
    const r = enriquecerEvidencia(originales, ops, {});
    expect(r.some(s => s.ops.length > 0)).toBe(true);
  });

  it('NO cambia qué señales se muestran', () => {
    // Recalcular las señales alteraría el informe respecto de lo que el
    // analista vio y resolvió
    const r = enriquecerEvidencia(originales, ops, {});
    expect(r.length).toBe(originales.length);
    expect(r.map(s => s.pat + s.titulo)).toEqual(originales.map(s => s.pat + s.titulo));
    expect(r.map(s => s.sev)).toEqual(originales.map(s => s.sev));
  });

  it('deja intactas las señales que ya tienen evidencia', () => {
    const frescas = detectPatrones(calcMetricas(ops), {});
    expect(enriquecerEvidencia(frescas, ops, {})).toBe(frescas);
  });

  it('sin transacciones devuelve las señales sin tocar', () => {
    expect(enriquecerEvidencia(originales, [], {})).toBe(originales);
    expect(enriquecerEvidencia(originales, null, {})).toBe(originales);
  });

  it('con señales vacías no rompe', () => {
    expect(enriquecerEvidencia([], ops, {})).toEqual([]);
    expect(enriquecerEvidencia(null, ops, {})).toEqual([]);
  });
});
