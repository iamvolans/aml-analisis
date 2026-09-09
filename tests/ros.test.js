// Reporte de Operación Sospechosa — borrador.
//
// Este documento se presenta ante la autoridad, de modo que cada afirmación que
// contiene debe seguir a los datos. La versión anterior tenía cuatro defectos
// que se fijan acá:
//
//  · sostenía que el volumen era "incompatible con el perfil esperado" incluso
//    cuando coincidía con la facturación declarada — una afirmación falsa;
//  · mostraba al usuario de la sesión como Oficial de Cumplimiento, en
//    contradicción con la firma al pie del propio documento;
//  · imprimía descripciones de tipología que no correspondían al patrón que
//    acompañaban;
//  · leía la contraparte de un campo inexistente, de modo que la columna salía
//    vacía en todas las filas.

import { describe, it, expect } from 'vitest';
import { calcMetricas, detectPatrones, claveResolucion } from '../src/lib/aml.js';
import { genROS } from '../src/lib/reports.js';
import { PAT_UIF_MAP } from '../src/lib/constants.js';
import { firmanteOC } from '../src/lib/firmantes.js';

const tx = (cp, monto, tipo, fecha) =>
  ({ tipo, monto, fecha, hora:'11:25', contraparte_nombre: cp, contraparte_cuit: '30-71234567-8' });

const OPS = [];
for (let i = 0; i < 8; i++)  OPS.push(tx('PROVEEDOR SUR SA', 700000 + i, 'IN', '2026-08-0' + (i % 9 + 1)));
for (let i = 0; i < 14; i++) OPS.push(tx('CLIENTE-' + i, 300000, 'IN', '2026-08-1' + (i % 9)));
for (let i = 0; i < 3; i++)  OPS.push(tx('DESTINO UNICO SRL', 3000000, 'OUT', '2026-08-2' + i));

const MET = calcMetricas(OPS);
const PER = { id:'p1', nombre:'Agosto 26', legajoId:'L1', txns: OPS, metricas: MET };
const USUARIO = { nombre:'Gaston Rosa', rol:'analista' };
const legCon = (fact) => ({ id:'L1', razonSocial:'Grupo Pampeano S.R.L.', cuit:'30-71703334-1',
  segmento:'MEDIO-ALTO', estadoCuenta:'ACTIVA', facturacionMensual: fact, checklist:{} });

const ros = (fact) => genROS(legCon(fact), [PER], ['p1'], [], USUARIO, 'ROS-2026-003');

describe('la narrativa sigue a los números', () => {
  it('con volumen igual a la facturación NO afirma incompatibilidad', () => {
    const h = ros(MET.tIn);
    expect(h).not.toContain('incompatible con el perfil');
    expect(h).toContain('consistente con el perfil económico informado');
  });

  it('remite la inusualidad a los patrones, no al volumen', () => {
    expect(ros(MET.tIn)).toContain('no surge del volumen agregado sino de los patrones');
  });

  it('con volumen muy superior declara cuántas veces excede', () => {
    const h = ros(Math.round(MET.tIn / 3));
    expect(h).toMatch(/facturación mensual declarada de .* \(\d+\.\d+ veces\)/);
    expect(h).toContain('excede en forma significativa');
  });

  it('con volumen marcadamente inferior lo declara como tal', () => {
    const h = ros(MET.tIn * 10);
    expect(h).toContain('marcadamente inferior');
  });

  it('sin facturación declarada dice que no hay con qué contrastar', () => {
    const h = ros(0);
    expect(h).toContain('sin que el legajo registre una facturación mensual declarada');
    expect(h).not.toContain('incompatible con el perfil');
  });
});

describe('quién genera y quién suscribe', () => {
  it('el Oficial de Cumplimiento es el titular, no el usuario de la sesión', () => {
    const h = ros(MET.tIn);
    expect(h).toContain(firmanteOC().nombre);
  });

  it('el generador figura como tal', () => {
    expect(ros(MET.tIn)).toContain('Generado por: Gaston Rosa');
  });

  it('no atribuye el cargo de Oficial de Cumplimiento a quien lo generó', () => {
    const h = ros(MET.tIn);
    const i = h.indexOf('Oficial de Cumplimiento</td>');
    expect(i).toBeGreaterThan(-1);
    // La celda contigua debe traer al titular
    expect(h.slice(i, i + 200)).toContain(firmanteOC().nombre);
  });
});

describe('operaciones que sustentan las señales', () => {
  const h = ros(MET.tIn);

  it('incorpora la sección de evidencia', () => {
    expect(h).toContain('Operaciones que Sustentan');
  });

  it('las contrapartes salen con nombre y documento', () => {
    expect(h).toContain('PROVEEDOR SUR SA');
    expect(h).toContain('30-71234567-8');
  });

  it('las fechas se muestran legibles, sin marca de tiempo cruda', () => {
    expect(h).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(h).not.toContain('11:25:51.980');
  });

  it('los patrones estructurales se declaran en lugar de listar operaciones', () => {
    const sigs = detectPatrones(MET, {});
    if (!sigs.some(s => s.estructural)) return;
    expect(h).toContain('estructura del flujo del período');
  });

  it('sin transacciones cargadas se emite igual, con lo que puede sostener', () => {
    // Los patrones estructurales no dependen de las transacciones, de modo que
    // la sección se emite con ellos aunque el detalle por operación falte.
    const sinTxns = Object.assign({}, PER, { txns: undefined });
    const h2 = genROS(legCon(MET.tIn), [sinTxns], ['p1'], [], USUARIO, '004');
    expect(h2.trim().endsWith('</html>')).toBe(true);
    expect(h2).not.toContain('undefined');
    expect(h2).toContain('Operaciones que Sustentan');
  });

  it('sin señales el reporte lo declara en lugar de omitir la sección', () => {
    const ops = [tx('A', 5000, 'IN', '2026-08-01'), tx('B', 6000, 'OUT', '2026-08-02')];
    const met = calcMetricas(ops);
    const per = { id:'p9', nombre:'Sep', legajoId:'L1', metricas: met, txns: ops };
    const h3 = genROS(legCon(met.tIn), [per], ['p9'], [], USUARIO, '005');
    expect(h3).toContain('Operaciones que Sustentan');
    expect(h3.trim().endsWith('</html>')).toBe(true);
    expect(h3).not.toContain('undefined');
  });
});

describe('tipologías', () => {
  it('cada descripción corresponde al patrón que acompaña', () => {
    // Estas descripciones se imprimen literalmente en un documento que se
    // presenta ante la autoridad
    const esperado = {
      'PAT-02': /embudo/i,
      'PAT-11': /velocidad|operaciones diarias/i,
      'PAT-12': /embudo múltiple|converge/i,
      'PAT-01': /fraccionamiento/i,
      'PAT-03': /circularidad/i,
      'PAT-17': /repetid/i,
    };
    Object.keys(esperado).forEach(k => {
      expect(PAT_UIF_MAP[k], k + ' no está en el mapa').toBeDefined();
      expect(PAT_UIF_MAP[k].desc, k + ': ' + PAT_UIF_MAP[k].desc).toMatch(esperado[k]);
    });
  });

  it('toda entrada del mapa declara tipología y descripción', () => {
    Object.keys(PAT_UIF_MAP).forEach(k => {
      expect(PAT_UIF_MAP[k].tip, k).toBeTruthy();
      expect(PAT_UIF_MAP[k].desc, k).toBeTruthy();
    });
  });
});

describe('integridad del documento', () => {
  it('se emite completo y sin marcadores sin resolver', () => {
    const h = ros(MET.tIn);
    expect(h.trim().endsWith('</html>')).toBe(true);
    expect(h).not.toContain('undefined');
    expect(h).not.toContain('NaN');
  });
});

// ── Backlog normativo ─────────────────────────────────────────────────────
describe('marco normativo y datos registrales', () => {
  const h = ros(MET.tIn);

  it('cita la ley vigente y no resoluciones derogadas', () => {
    expect(h).toContain('Ley N° 27.739');
    expect(h).toContain('Res');
    expect(h).not.toContain('156/2018');
  });

  it('identifica al regulador con la norma vigente y el registro', () => {
    expect(h).toContain('8454');
    expect(h).toContain('33.706');
    expect(h).not.toContain('6885');
  });

  it('el sistema de la UIF es el SRO, no SIROS', () => {
    expect(h).toContain('SRO');
    expect(h).not.toContain('SIROS');
  });

  it('sin número de inscripción lo señala en lugar de dejarlo en blanco', () => {
    // Un reporte con el campo vacío se presenta igual y nadie lo advierte
    expect(h).toMatch(/PENDIENTE DE CONFIGURAR|N° inscripción UIF<\/td><td>\d/);
  });
});

describe('la conclusión no afirma diligencias inexistentes', () => {
  it('sin requerimientos registrados no habla de debida diligencia reforzada', () => {
    const h = genROS(legCon(MET.tIn), [PER], ['p1'], [], USUARIO, '010');
    expect(h).not.toContain('debida diligencia reforzada llevadas a cabo');
    expect(h).toContain('documentación de debida diligencia obrante en el legajo');
  });

  it('con requerimientos registrados los invoca', () => {
    const rfis = [{ id:'r1', asunto:'Origen de fondos', estado:'RESPONDIDO' }];
    const h = genROS(legCon(MET.tIn), [PER], ['p1'], rfis, USUARIO, '011');
    expect(h).toContain('requerimientos de información cursados al cliente');
  });
});

describe('medidas adoptadas', () => {
  const h = ros(MET.tIn);

  it('incorpora la sección con el catálogo de medidas', () => {
    expect(h).toContain('Medidas Adoptadas por el Sujeto Obligado');
    expect(h).toContain('Recalificación del riesgo');
    expect(h).toContain('Limitación operativa');
    expect(h).toContain('restitución de saldo a cuenta de igual titularidad');
  });

  it('exige constancia cuando no se adopta ninguna', () => {
    expect(h).toContain('fundamento de no adoptar medidas');
  });

  it('la numeración de secciones queda correlativa', () => {
    ['7. Medidas Adoptadas', '8. Conclusión', '9. Firma'].forEach(t => {
      expect(h, 'falta ' + t).toContain(t);
    });
  });
});

describe('ausencia de evidencia', () => {
  it('el patrón se declara en lugar de desaparecer del reporte', () => {
    // Omitirlo lo hacía desaparecer sin explicación: el lector no podía saber
    // que la señal existía. El período debe tener métricas CON evidencia pero
    // sin las transacciones cargadas, que es el caso real al generar el ROS.
    const sinTxns = { id:'p1', nombre:'Agosto 26', legajoId:'L1', metricas: MET };
    const h = genROS(legCon(MET.tIn), [sinTxns], ['p1'], [], USUARIO, '012');
    // El reporte incluye únicamente las señales de severidad alta
    const conOps = detectPatrones(MET, {})
      .filter(s => s.sev === 'ALTA' && !s.estructural && s.ops.length);
    expect(conOps.length, 'el caso no produjo señales altas con evidencia').toBeGreaterThan(0);
    conOps.forEach(s => expect(h, 'falta ' + s.pat).toContain(s.pat));
    expect(h).toMatch(/no pudo recuperarse/);
  });
});

// ── Magnitudes comparables ────────────────────────────────────────────────
// El relato dividía el volumen ACUMULADO de todos los períodos por la
// facturación MENSUAL. Con seis meses de operatoria contra un mes de
// facturación, el múltiplo no significaba nada: informaba "5,3 veces" cuando el
// promedio mensual real era 0,88.
describe('contraste contra el perfil económico', () => {
  const per2 = Object.assign({}, PER, { id:'p2', nombre:'Septiembre 26' });
  const dos = (fact) => genROS(legCon(fact), [PER, per2], ['p1','p2'], [], USUARIO, '020');

  it('con varios períodos informa el promedio por período', () => {
    const h = dos(MET.tIn);
    expect(h).toContain('promedio de');
    expect(h).toContain('por período analizado');
  });

  it('el múltiplo se calcula sobre magnitudes comparables', () => {
    // Dos períodos de igual volumen contra esa misma facturación mensual dan
    // 1,00 veces, no 2,00
    const h = dos(MET.tIn);
    expect(h).toMatch(/\(1\.00 veces\)/);
    expect(h).toContain('consistente con el perfil económico informado');
  });

  it('un solo período no habla de promedio', () => {
    expect(ros(MET.tIn)).not.toContain('por período analizado');
  });
});

// ── Selección de señales del reporte ──────────────────────────────────────
describe('qué señales incluye el reporte', () => {
  it('las variantes de entrada y salida no se colapsan', () => {
    // Deduplicar por código perdía una de las dos: un reporte que afirma
    // concentración de ingresos omitiría la de egresos
    const ops = [];
    for (let i = 0; i < 10; i++) ops.push(tx('UNICO IN', 900000, 'IN', '2026-08-01'));
    for (let i = 0; i < 8; i++)  ops.push(tx('UNICO OUT', 800000, 'OUT', '2026-08-02'));
    const met = calcMetricas(ops);
    const per = { id:'pv', nombre:'Ago', legajoId:'L1', metricas: met, txns: ops };
    const h = genROS(legCon(met.tIn), [per], ['pv'], [], USUARIO, '030');
    const altas = detectPatrones(met, {}).filter(s => s.sev === 'ALTA');
    const seis = altas.filter(s => s.pat === 'PAT-06');
    if (seis.length === 2) {
      expect(h).toContain('cash-in');
      expect(h).toContain('cash-out');
    }
  });

  it('una señal resuelta no reaparece en el reporte', () => {
    // La resolución se guarda con la clave por señal; leerla solo por código
    // hacía que la señal volviera a figurar como activa
    const sigs = detectPatrones(MET, {}).filter(s => s.sev === 'ALTA');
    expect(sigs.length).toBeGreaterThan(0);
    const res = {};
    res[claveResolucion(sigs[0])] = { estado:'RESUELTA', explicacion:'operatoria acreditada' };
    const per = Object.assign({}, PER, { sigsResolucion: res });
    const h = genROS(legCon(MET.tIn), [per], ['p1'], [], USUARIO, '031');
    const otras = sigs.slice(1).map(s => s.titulo);
    // La resuelta no debe figurar entre las señales del reporte
    const i = h.indexOf('4. Señales de Alerta');
    const j = h.indexOf('5. Operaciones que Sustentan');
    const seccion4 = h.slice(i, j);
    expect(seccion4).not.toContain(sigs[0].titulo);
    otras.forEach(t => { if (t) expect(seccion4).toContain(t); });
  });
});

// ── Base de comparación del perfil económico ──────────────────────────────
// El volumen acumula todos los períodos seleccionados; la facturación declarada
// es mensual. Contrastarlos sin normalizar comparaba seis meses de operatoria
// contra un mes de facturación: con $13.2B en seis períodos y $2.5B declarados,
// el reporte informaba "5.2 veces" cuando el promedio real era 0,88.
describe('comparación contra el perfil económico', () => {
  function conPeriodos(n, montoPorPeriodo, facturacionMensual) {
    const pers = [];
    for (let i = 1; i <= n; i++) {
      const ops = [];
      for (let k = 0; k < 10; k++) {
        ops.push({ tipo:'IN', monto: montoPorPeriodo / 10, fecha:'2026-08-01',
                   hora:'11:25', contraparte_nombre:'X' });
      }
      pers.push({ id:'p'+i, nombre:'Mes '+i, legajoId:'L1', txns: ops, metricas: calcMetricas(ops) });
    }
    const leg = { id:'L1', razonSocial:'Test SRL', cuit:'30-1',
                  facturacionMensual, checklist:{} };
    return genROS(leg, pers, pers.map(p => p.id), [], { nombre:'G' }, '006');
  }

  it('con varios períodos normaliza contra el perfil del lapso analizado', () => {
    // 6 períodos de 2.2B = 13.2B contra 2.5B mensuales = 0,88 veces
    const h = conPeriodos(6, 2200000000, 2500000000);
    expect(h).toContain('promedio de');
    expect(h).toContain('por período analizado');
    expect(h).not.toMatch(/5\.[23] veces/);
  });

  it('no declara exceso cuando el promedio por período no lo tiene', () => {
    const h = conPeriodos(6, 2200000000, 2500000000);
    expect(h).toContain('consistente con el perfil');
    expect(h).not.toContain('excediéndolo en forma significativa');
  });

  it('con un exceso real sí lo declara', () => {
    // 3 períodos de 9B contra 1B mensual = 9 veces
    const h = conPeriodos(3, 9000000000, 1000000000);
    expect(h).toMatch(/\(9\.00 veces\)/);
    expect(h).toContain('excede en forma significativa el perfil económico informado');
  });

  it('con un solo período compara contra la facturación mensual sin promediar', () => {
    const h = conPeriodos(1, 2500000000, 2500000000);
    expect(h).not.toContain('por período analizado');
  });
});

describe('marco normativo del documento', () => {
  const h = ros(MET.tIn);

  it('cita el texto vigente y no resoluciones derogadas', () => {
    expect(h).toContain('27.739');
    expect(h).not.toContain('156/2018');
  });

  it('identifica correctamente al regulador y el registro', () => {
    expect(h).toContain('8454');
    expect(h).toContain('33.706');
  });

  it('nombra el sistema de la UIF como SRO', () => {
    expect(h).toContain('SRO');
    expect(h).not.toContain('SIROS');
  });

  it('la conclusión no tipifica delito: reporta inusualidad no justificada', () => {
    expect(h).toContain('21 inciso b');
    expect(h).toContain('no cuentan con justificación económica o jurídica');
    // Nunca debe afirmar que el cliente lavó activos
    expect(h).not.toMatch(/lavó|lavado de activos por parte del cliente/i);
  });
});
