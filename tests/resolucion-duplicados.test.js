// Clave de resolución de señales y detección de períodos duplicados.
//
// Dos problemas reales que aparecieron en producción:
//
// 1. Las resoluciones se guardaban con el código de patrón como única clave.
//    PAT-06 emite DOS señales en el mismo período —una por cash-in y otra por
//    cash-out—, de modo que resolver una resolvía la otra en silencio.
//
// 2. La bandeja mostraba la misma alerta repetida veinte veces. No era una
//    falla de detección: eran veinte períodos idénticos del mismo cliente,
//    producto de cargar el mismo archivo varias veces. Cada copia emite su
//    propio juego de señales.

import { describe, it, expect } from 'vitest';
import { calcMetricas, detectPatrones, senalesActivas, claveResolucion, resolucionDe, periodosDuplicados } from '../src/lib/aml.js';

function tx(cp, monto, tipo) {
  return { tipo: tipo || 'IN', monto: monto, fecha: '5/6/2026', hora: '12:00', contraparte_nombre: cp };
}
// Concentración extrema en ambos sentidos: dispara PAT-06 cash-in y cash-out
function concentrado() {
  return [tx('UNICA IN', 1000000, 'IN'), tx('OTRA IN', 1, 'IN'),
          tx('UNICA OUT', 900000, 'OUT'), tx('OTRA OUT', 1, 'OUT')];
}

describe('clave de resolución', () => {
  it('distingue las dos señales que emite un mismo patrón', () => {
    const sigs = detectPatrones(calcMetricas(concentrado()), {}).filter(s => s.pat === 'PAT-06');
    expect(sigs.length).toBe(2);
    expect(claveResolucion(sigs[0])).not.toBe(claveResolucion(sigs[1]));
    expect(claveResolucion(sigs[0])).toContain('PAT-06');
  });

  it('resolver cash-in NO resuelve cash-out', () => {
    const per = { id: 'p1', legajoId: 'L1', createdAt: '1/6/2026', metricas: calcMetricas(concentrado()) };
    const antes = senalesActivas(per, { id: 'L1' }, [per]).filter(s => s.pat === 'PAT-06');
    expect(antes.length).toBe(2);

    const res = {};
    res[claveResolucion(antes[0])] = { estado: 'RESUELTA', explicacion: 'ok' };
    const conRes = Object.assign({}, per, { sigsResolucion: res });

    const despues = senalesActivas(conRes, { id: 'L1' }, [per]).filter(s => s.pat === 'PAT-06');
    expect(despues.length).toBe(1);
    expect(despues[0].titulo).toBe(antes[1].titulo);
  });

  it('las resoluciones guardadas con la clave vieja se siguen respetando', () => {
    // Compatibilidad: lo asentado antes del cambio no puede reaparecer como abierto
    const per = { id: 'p1', legajoId: 'L1', createdAt: '1/6/2026',
                  metricas: calcMetricas(concentrado()),
                  sigsResolucion: { 'PAT-06': { estado: 'RESUELTA', explicacion: 'histórica' } } };
    const activas = senalesActivas(per, { id: 'L1' }, [per]);
    expect(activas.filter(s => s.pat === 'PAT-06').length).toBe(0);
  });

  it('resolucionDe prefiere la clave precisa sobre la genérica', () => {
    const sig = { pat: 'PAT-06', titulo: 'Concentracion extrema — cash-in' };
    const res = {
      'PAT-06': { estado: 'RESUELTA', explicacion: 'vieja' },
      [claveResolucion(sig)]: { estado: 'RESUELTA', explicacion: 'nueva' },
    };
    expect(resolucionDe(res, sig).explicacion).toBe('nueva');
  });

  it('sin resolución devuelve null', () => {
    expect(resolucionDe({}, { pat: 'PAT-06', titulo: 'x' })).toBeNull();
    expect(resolucionDe(null, { pat: 'PAT-06', titulo: 'x' })).toBeNull();
  });
});

describe('períodos duplicados', () => {
  const m = calcMetricas([tx('A', 1000), tx('B', 2000, 'OUT')]);
  const per = (id, legajoId, nombre, metricas) =>
    ({ id, legajoId, nombre, createdAt: '1/6/2026', metricas: metricas || m });

  it('agrupa períodos con mismo cliente, nombre y métricas', () => {
    const d = periodosDuplicados([
      per('p1', 'L1', 'Agosto hasta 18'),
      per('p2', 'L1', 'Agosto hasta 18'),
      per('p3', 'L1', 'Agosto hasta 18'),
    ]);
    expect(d.length).toBe(1);
    expect(d[0].copias).toBe(3);
    expect(d[0].redundantes.length).toBe(2);
    expect(d[0].conservar.id).toBe('p1');
  });

  it('no agrupa períodos de clientes distintos', () => {
    expect(periodosDuplicados([per('p1', 'L1', 'Agosto'), per('p2', 'L2', 'Agosto')]).length).toBe(0);
  });

  it('no agrupa mismo nombre con métricas distintas', () => {
    const otro = calcMetricas([tx('A', 999999)]);
    expect(periodosDuplicados([per('p1', 'L1', 'Agosto'), per('p2', 'L1', 'Agosto', otro)]).length).toBe(0);
  });

  it('sin duplicados devuelve lista vacía', () => {
    expect(periodosDuplicados([per('p1', 'L1', 'Julio'), per('p2', 'L1', 'Agosto', calcMetricas([tx('X', 5)]))])).toEqual([]);
    expect(periodosDuplicados([])).toEqual([]);
  });

  it('ordena por cantidad de copias', () => {
    const otro = calcMetricas([tx('Z', 77)]);
    const d = periodosDuplicados([
      per('a1', 'L1', 'Julio', otro), per('a2', 'L1', 'Julio', otro),
      per('b1', 'L2', 'Agosto'), per('b2', 'L2', 'Agosto'), per('b3', 'L2', 'Agosto'),
    ]);
    expect(d[0].copias).toBe(3);
    expect(d[1].copias).toBe(2);
  });

  it('N copias de un período producen N veces la misma señal', () => {
    // Es la explicación del síntoma que se vio en la bandeja
    const conc = calcMetricas(concentrado());
    const pers = [1,2,3].map(i => per('p'+i, 'L1', 'Agosto hasta 18', conc));
    const total = pers.reduce((acc, p) =>
      acc.concat(senalesActivas(p, { id:'L1' }, pers).filter(s => s.pat === 'PAT-06')), []);
    expect(total.length).toBe(6);              // 3 períodos x 2 variantes
    expect(periodosDuplicados(pers)[0].copias).toBe(3);
  });
});

// ── Identificador de señal en la bandeja de alertas ────────────────────────
// La bandeja arma una clave por señal para poder seleccionarlas y resolverlas.
// Dos defectos reales que tuvo:
//   · la clave era `periodoId + '_' + pat`, y como PAT-06 emite dos variantes,
//     ambas compartían identificador;
//   · el modo de selección múltiple leía `s.clave`, propiedad que no existe en
//     este objeto —se llama `key`—, con lo que todas las filas alternaban el
//     mismo valor `undefined` y se marcaban o desmarcaban en bloque.
describe('identificador de señal en la bandeja', () => {
  function claveBandeja(periodoId, s) { return periodoId + '::' + claveResolucion(s); }

  it('dos variantes del mismo patrón tienen identificadores distintos', () => {
    const sigs = detectPatrones(calcMetricas(concentrado()), {}).filter(s => s.pat === 'PAT-06');
    expect(sigs.length).toBe(2);
    const a = claveBandeja('p1', sigs[0]);
    const b = claveBandeja('p1', sigs[1]);
    expect(a).not.toBe(b);
  });

  it('la misma señal en períodos distintos tiene identificadores distintos', () => {
    const s0 = detectPatrones(calcMetricas(concentrado()), {})[0];
    expect(claveBandeja('p1', s0)).not.toBe(claveBandeja('p2', s0));
  });

  it('todas las señales de un período producen identificadores únicos', () => {
    const sigs = detectPatrones(calcMetricas(concentrado()), {});
    const claves = sigs.map(s => claveBandeja('p1', s));
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('el identificador no es undefined para ninguna señal', () => {
    detectPatrones(calcMetricas(concentrado()), {}).forEach(s => {
      const k = claveBandeja('p1', s);
      expect(k).toBeTruthy();
      expect(k).not.toContain('undefined');
    });
  });
});
