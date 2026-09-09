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
import { calcMetricas, detectPatrones } from '../src/lib/aml.js';
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
    expect(h).toContain('consistente con la facturación');
  });

  it('remite la inusualidad a los patrones, no al volumen', () => {
    expect(ros(MET.tIn)).toContain('no surge del volumen sino de los patrones');
  });

  it('con volumen muy superior declara cuántas veces excede', () => {
    const h = ros(Math.round(MET.tIn / 3));
    expect(h).toMatch(/veces la facturación mensual declarada/);
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

  it('sin evidencia alguna informa que el detalle debe acompañarse aparte', () => {
    // Un período sin transacciones y sin patrones estructurales
    const ops = [tx('A', 500000, 'IN', '2026-08-01'), tx('A', 500000, 'IN', '2026-08-02'),
                 tx('A', 500000, 'IN', '2026-08-03')];
    const met = calcMetricas(ops);
    const per = { id:'p9', nombre:'Sep', legajoId:'L1', metricas: met };
    const h3 = genROS(legCon(met.tIn), [per], ['p9'], [], USUARIO, '005');
    if (!detectPatrones(met, {}).some(s => s.estructural)) {
      expect(h3).toContain('no se encuentra');
    }
    expect(h3.trim().endsWith('</html>')).toBe(true);
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
