// Persistencia de las resoluciones de señales.
//
// Resolver una alerta modifica el período que la contiene: la resolución se
// guarda en `sigsResolucion`. Si ese cambio no se sincroniza, vive solo en la
// memoria del navegador y la alerta reaparece en la siguiente carga.
//
// Es el mismo defecto que tenía la eliminación de períodos, y comparte su
// peligro: el analista ve desaparecer la alerta, da por hecho que quedó
// resuelta y pasa a otra cosa. El trabajo se pierde sin aviso.
//
// La vista de Alertas resolvía —individualmente y en lote— sin sincronizar. La
// de Análisis sí lo hacía, lo que explica que el problema apareciera solo al
// trabajar desde la bandeja.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calcMetricas, detectPatrones, senalesActivas, claveResolucion } from '../src/lib/aml.js';

const RAIZ = path.resolve(__dirname, '..', 'src');
const tx = (cp, monto, tipo, fecha) =>
  ({ tipo, monto, fecha, hora:'12:00', contraparte_nombre: cp, contraparte_cuit:'30-9' });

const LEG = { id:'L1', razonSocial:'T', cuit:'30-1' };
const OPS = [];
for (let i = 0; i < 6; i++) OPS.push(tx('PROV', 700000 + i, 'IN', '1/8/2026'));
const PERIODO = { id:'p1', legajoId:'L1', nombre:'Agosto',
                  metricas: calcMetricas(OPS, LEG), txns: OPS };

describe('una resolución no sincronizada se pierde', () => {
  const activas = senalesActivas(PERIODO, LEG, [PERIODO]);
  const sig = activas[0];
  const res = {};
  res[claveResolucion(sig)] = { estado:'RESUELTA', explicacion:'contrato marco',
                                aprobadoPor:'Samy', aprobadoAt:'1/9/2026' };
  const enMemoria = Object.assign({}, PERIODO, { sigsResolucion: res });

  it('en memoria la señal queda resuelta', () => {
    expect(senalesActivas(enMemoria, LEG, [enMemoria]).length).toBe(activas.length - 1);
  });

  it('sin sincronizar, el servidor conserva el período sin la resolución', () => {
    // Recargar desde el servidor devuelve el período original
    expect(senalesActivas(PERIODO, LEG, [PERIODO]).length).toBe(activas.length);
  });

  it('sincronizado, la resolución sobrevive a la recarga', () => {
    const delServidor = JSON.parse(JSON.stringify(enMemoria));
    expect(senalesActivas(delServidor, LEG, [delServidor]).length).toBe(activas.length - 1);
  });
});

describe('toda vista que resuelve debe sincronizar', () => {
  function fuente(rel) { return fs.readFileSync(path.join(RAIZ, rel), 'utf8'); }

  it('Alertas persiste tras resolver individualmente', () => {
    const src = fuente('views/Alertas.jsx');
    const i = src.indexOf('function resolverSenal');
    expect(i).toBeGreaterThan(-1);
    const cuerpo = src.slice(i, i + 1600);
    // Vale cualquier vía que efectivamente persista: el envío general o el
    // guardado directo del período afectado.
    expect(cuerpo, 'resolverSenal no persiste').toMatch(/serverSavePeriodo\(|onSync\(/);
  });

  it('Alertas persiste tras regularizar en lote', () => {
    const src = fuente('views/Alertas.jsx');
    const i = src.indexOf('regularizarSeleccionadas');
    expect(i).toBeGreaterThan(-1);
    const cuerpo = src.slice(i, i + 3000);
    expect(cuerpo, 'la regularización en lote no persiste').toMatch(/serverSavePeriodo\(|onSync\(/);
  });

  it('Análisis sincroniza tras resolver', () => {
    const src = fuente('views/Analisis.jsx');
    const i = src.indexOf('sigsResolucion: nuevaSigsRes');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 900)).toMatch(/onSync\(/);
  });

  it('ninguna vista escribe sigsResolucion sin persistirla', () => {
    const fallos = [];
    ['views/Alertas.jsx', 'views/Analisis.jsx'].forEach(rel => {
      const lineas = fuente(rel).split('\n');
      lineas.forEach((l, i) => {
        if (!/setPeriodos\(/.test(l)) return;
        // Una llamada a setPeriodos que modifica resoluciones debe ir acompañada
        // de la sincronización dentro de las diez líneas siguientes.
        const ventana = lineas.slice(Math.max(0, i - 12), i + 10).join('\n');
        if (!/sigsResolucion/.test(ventana)) return;
        if (!/serverSavePeriodo\(|onSync\(/.test(ventana)) fallos.push(path.basename(rel) + ':' + (i + 1));
      });
    });
    expect(fallos, 'cambios de resolución sin persistir:\n' + fallos.join('\n')).toEqual([]);
  });
});

describe('el servidor conserva las resoluciones', () => {
  const RUTA = path.resolve(__dirname, '..', 'api', 'sync.js');
  const existe = fs.existsSync(RUTA);
  const src = existe ? fs.readFileSync(RUTA, 'utf8') : '';

  it.skipIf(!existe)('las guarda al recibir un período', () => {
    // Sincronizar sin que el servidor persista el campo dejaría el mismo
    // síntoma: la alerta reaparece pese a haberse resuelto.
    const post = src.slice(src.indexOf('if (periodos?.length)'), src.indexOf('if (periodos?.length)') + 800);
    expect(post).toContain('sigsResolucion');
  });

  it.skipIf(!existe)('las devuelve al entregar los períodos', () => {
    const get = src.slice(0, src.indexOf('if (periodos?.length)'));
    expect(get).toContain('sigsResolucion');
  });
});
