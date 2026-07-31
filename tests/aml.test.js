// Tests de lib/aml.js — el corazón regulatorio.
// Estas funciones deciden si una operación genera una señal ALTA, y de ahí
// salen los casos, los plazos y eventualmente un ROS. Un cambio que mueva un
// umbral sin querer tiene que romper acá, no en producción.

import { describe, it, expect } from 'vitest';
import { calcMetricas, detectPatrones, calcScoring, lineaBase, senalesActivas, contarAlta, metricasDe } from '../src/lib/aml.js';

function tx(o) {
  return Object.assign({ tipo:'IN', monto:10000, fecha:'5/6/2026', hora:'14:00', contraparte_nombre:'CP' }, o);
}
const pats = (sigs) => sigs.map(s => s.pat);

describe('calcMetricas', () => {
  it('devuelve null sin transacciones', () => {
    expect(calcMetricas([])).toBeNull();
    expect(calcMetricas(null)).toBeNull();
  });

  it('agrega volúmenes y conteos por tipo', () => {
    const m = calcMetricas([
      tx({ tipo:'IN',  monto:1000 }),
      tx({ tipo:'IN',  monto:3000 }),
      tx({ tipo:'OUT', monto:2000 }),
    ]);
    expect(m.totalTxns).toBe(3);
    expect(m.countIn).toBe(2);
    expect(m.countOut).toBe(1);
    expect(m.tIn).toBe(4000);
    expect(m.tOut).toBe(2000);
    expect(m.tVol).toBe(6000);
    expect(m.balanceNeto).toBe(2000);
  });

  it('cuenta contrapartes únicas por lado', () => {
    const m = calcMetricas([
      tx({ tipo:'IN',  contraparte_nombre:'A' }),
      tx({ tipo:'IN',  contraparte_nombre:'B' }),
      tx({ tipo:'IN',  contraparte_nombre:'A' }),
      tx({ tipo:'OUT', contraparte_nombre:'C' }),
    ]);
    expect(m.uniqueCpIn).toBe(2);
    expect(m.uniqueCpOut).toBe(1);
  });

  it('calcula concentración: una sola contraparte es 100%', () => {
    const m = calcMetricas([tx({ contraparte_nombre:'UNICA', monto:5000 })]);
    expect(m.top1In).toBeCloseTo(100, 5);
  });

  it('marca horario atípico fuera de 6:00–22:00', () => {
    const m = calcMetricas([
      tx({ hora:'03:00' }), tx({ hora:'23:30' }),
      tx({ hora:'10:00' }), tx({ hora:'15:00' }),
    ]);
    expect(m.pctAtypicalHour).toBeCloseTo(50, 5);
  });

  it('no rompe con campos ausentes', () => {
    const m = calcMetricas([{ monto: 100 }, { tipo:'OUT' }]);
    expect(m).not.toBeNull();
    expect(m.totalTxns).toBe(2);
  });
});

describe('detectPatrones — umbrales fijos', () => {
  it('sin señales en una operatoria normal y diversificada', () => {
    const txns = [];
    for (let i = 0; i < 12; i++) {
      txns.push(tx({ tipo:'IN',  monto:10000 + i, contraparte_nombre:'IN'+i,  fecha:(i%9+1)+'/6/2026' }));
      txns.push(tx({ tipo:'OUT', monto:9000 + i,  contraparte_nombre:'OUT'+i, fecha:(i%9+1)+'/6/2026' }));
    }
    const sigs = detectPatrones(calcMetricas(txns), {});
    expect(pats(sigs)).not.toContain('PAT-06');
    expect(pats(sigs)).not.toContain('PAT-02');
  });

  it('PAT-01 detecta fraccionamiento: 3+ ops de la misma contraparte el mismo día', () => {
    const txns = [
      tx({ tipo:'IN', contraparte_nombre:'ORIGEN', fecha:'5/6/2026', monto:9000 }),
      tx({ tipo:'IN', contraparte_nombre:'ORIGEN', fecha:'5/6/2026', monto:9000 }),
      tx({ tipo:'IN', contraparte_nombre:'ORIGEN', fecha:'5/6/2026', monto:9000 }),
    ];
    expect(pats(detectPatrones(calcMetricas(txns), {}))).toContain('PAT-01');
  });

  // ⚠️ COMPORTAMIENTO DOCUMENTADO, NO NECESARIAMENTE DESEADO.
  // calcMetricas agrupa splitGroups recorriendo SOLO las operaciones entrantes
  // (`ins.forEach`), aunque la variable se llame byDayDest y el texto de la señal
  // diga "al mismo destino". Consecuencia: el fraccionamiento de salida NO se
  // detecta. Este test fija la conducta actual para que un cambio sea deliberado.
  it('PAT-01 hoy NO detecta fraccionamiento en operaciones de salida', () => {
    const txns = [
      tx({ tipo:'OUT', contraparte_nombre:'DESTINO', fecha:'5/6/2026', monto:9000 }),
      tx({ tipo:'OUT', contraparte_nombre:'DESTINO', fecha:'5/6/2026', monto:9000 }),
      tx({ tipo:'OUT', contraparte_nombre:'DESTINO', fecha:'5/6/2026', monto:9000 }),
    ];
    const m = calcMetricas(txns);
    expect(m.splitGroupsCount).toBe(0);
    expect(pats(detectPatrones(m, {}))).not.toContain('PAT-01');
  });

  it('PAT-06 detecta concentración extrema en una contraparte', () => {
    const txns = [tx({ contraparte_nombre:'UNICA', monto:1000000 }), tx({ contraparte_nombre:'OTRA', monto:1 })];
    expect(pats(detectPatrones(calcMetricas(txns), {}))).toContain('PAT-06');
  });

  it('devuelve lista vacía sin métricas', () => {
    expect(detectPatrones(null, {})).toEqual([]);
  });
});

describe('lineaBase', () => {
  const leg = { id:'L1' };
  const mkPer = (id, monto) => ({
    id, legajoId:'L1', createdAt:'1/6/2026',
    metricas: calcMetricas([tx({ monto, contraparte_nombre:'HABITUAL' })]),
  });

  it('es null con menos de 2 períodos previos', () => {
    const p2 = mkPer('p2', 100);
    expect(lineaBase(p2, leg, [mkPer('p1', 100), p2])).toBeNull();
  });

  it('se construye con 2 o más previos', () => {
    const actual = mkPer('p3', 100);
    const base = lineaBase(actual, leg, [mkPer('p1', 100), mkPer('p2', 100), actual]);
    expect(base).not.toBeNull();
    expect(base.nPeriodos).toBe(2);
  });

  it('usa mediana, no promedio: un período atípico previo no corre la base', () => {
    const actual = mkPer('p4', 100);
    // 100, 100, 10000 → mediana 100, promedio 3400
    const base = lineaBase(actual, leg, [mkPer('p1',100), mkPer('p2',100), mkPer('p3',10000), actual]);
    expect(base.volMediano).toBe(100);
  });

  it('registra las contrapartes habituales de los períodos previos', () => {
    const actual = mkPer('p3', 100);
    const base = lineaBase(actual, leg, [mkPer('p1',100), mkPer('p2',100), actual]);
    expect(base.habituales['HABITUAL']).toBe(true);
    expect(base.cantHabituales).toBe(1);
  });

  it('no mezcla períodos de otros legajos', () => {
    const otro = { id:'p9', legajoId:'L2', createdAt:'1/6/2026', metricas: calcMetricas([tx({monto:1})]) };
    const actual = mkPer('p2', 100);
    expect(lineaBase(actual, leg, [mkPer('p1',100), otro, actual])).toBeNull();
  });
});

describe('detectPatrones — comportamiento (PAT-13/14/15)', () => {
  const leg = { id:'L1' };
  // 4 períodos estables: 20 ops de $50.000 = $1.000.000, contraparte habitual, 14:00
  const historial = [1,2,3,4].map(i => ({
    id:'h'+i, legajoId:'L1', createdAt:'1/6/2026',
    metricas: calcMetricas(Array.from({length:20}, () => tx({ monto:50000, contraparte_nombre:'HABITUAL' }))),
  }));
  function evaluar(txns) {
    const actual = { id:'act', legajoId:'L1', createdAt:'1/6/2026', metricas: calcMetricas(txns) };
    const todos = historial.concat([actual]);
    return detectPatrones(actual.metricas, leg, lineaBase(actual, leg, todos));
  }
  const gen = (monto, cp, hora) => Array.from({length:20}, () => tx({ monto, contraparte_nombre:cp, hora }));

  it('sin línea base los patrones de comportamiento no activan', () => {
    const m = calcMetricas(gen(999999, 'NUEVA'));
    const p = pats(detectPatrones(m, leg, null));
    expect(p).not.toContain('PAT-13');
    expect(p).not.toContain('PAT-14');
    expect(p).not.toContain('PAT-15');
  });

  it('un período igual al historial no dispara nada', () => {
    const p = pats(evaluar(gen(50000, 'HABITUAL')));
    expect(p).not.toContain('PAT-13');
    expect(p).not.toContain('PAT-14');
    expect(p).not.toContain('PAT-15');
  });

  it('2x el volumen habitual queda bajo el umbral', () => {
    expect(pats(evaluar(gen(100000, 'HABITUAL')))).not.toContain('PAT-13');
  });

  it('PAT-13 en MEDIA a ~3x', () => {
    const s = evaluar(gen(160000, 'HABITUAL')).find(x => x.pat === 'PAT-13');
    expect(s).toBeDefined();
    expect(s.sev).toBe('MEDIA');
  });

  it('PAT-13 escala a ALTA a partir de 5x', () => {
    const s = evaluar(gen(300000, 'HABITUAL')).find(x => x.pat === 'PAT-13');
    expect(s.sev).toBe('ALTA');
  });

  it('PAT-14 cuando una contraparte sin antecedentes concentra el flujo', () => {
    const s = evaluar(gen(50000, 'DESCONOCIDA SRL')).find(x => x.pat === 'PAT-14');
    expect(s).toBeDefined();
    expect(s.sev).toBe('ALTA');
  });

  it('PAT-15 ante un salto en la distribución horaria', () => {
    const s = evaluar(gen(50000, 'HABITUAL', '23:00')).find(x => x.pat === 'PAT-15');
    expect(s).toBeDefined();
  });
});

describe('senalesActivas / contarAlta', () => {
  const leg = { id:'L1' };
  const per = {
    id:'p1', legajoId:'L1', createdAt:'1/6/2026',
    metricas: calcMetricas([tx({ contraparte_nombre:'UNICA', monto:1000000 }), tx({ contraparte_nombre:'OTRA', monto:1 })]),
  };

  it('no depende de que las txns estén en memoria: usa p.metricas', () => {
    expect(senalesActivas(per, leg, [per]).length).toBeGreaterThan(0);
  });

  it('excluye las señales marcadas como resueltas', () => {
    const antes = senalesActivas(per, leg, [per]);
    const conRes = Object.assign({}, per, {
      sigsResolucion: { [antes[0].pat]: { estado:'RESUELTA', explicacion:'ok' } }
    });
    const despues = senalesActivas(conRes, leg, [per]);
    expect(despues.length).toBe(antes.length - 1);
    expect(pats(despues)).not.toContain(antes[0].pat);
  });

  it('contarAlta solo cuenta severidad ALTA', () => {
    const todas = senalesActivas(per, leg, [per]);
    expect(contarAlta(per, leg, [per])).toBe(todas.filter(s => s.sev === 'ALTA').length);
  });

  it('metricasDe prefiere las métricas persistidas sobre las txns', () => {
    const p = { metricas: { marcador:'persistida' }, txns:[tx({})] };
    expect(metricasDe(p, leg).marcador).toBe('persistida');
  });
});

describe('calcScoring', () => {
  it('null sin métricas', () => {
    expect(calcScoring(null, [])).toBeNull();
  });

  it('una operatoria con señales ALTA puntúa peor que una limpia', () => {
    const limpio = calcMetricas([
      tx({ tipo:'IN', contraparte_nombre:'A', monto:1000 }),
      tx({ tipo:'IN', contraparte_nombre:'B', monto:1000 }),
      tx({ tipo:'OUT', contraparte_nombre:'C', monto:1000 }),
    ]);
    const sucio = calcMetricas([tx({ contraparte_nombre:'UNICA', monto:9999999 })]);
    const sL = calcScoring(limpio, detectPatrones(limpio, {}));
    const sS = calcScoring(sucio, detectPatrones(sucio, {}));
    expect(sS.promedio).toBeGreaterThan(sL.promedio);
  });

  it('devuelve promedio, clasificación y acción sugerida', () => {
    const m = calcMetricas([tx({})]);
    const sc = calcScoring(m, detectPatrones(m, {}));
    expect(typeof sc.promedio).toBe('number');
    expect(['BAJO','MEDIO','MEDIO-ALTO','ALTO']).toContain(sc.clasificacion);
    expect(typeof sc.accion).toBe('string');
  });
});
