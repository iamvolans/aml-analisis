// Tests de lib/screening.js — matching contra listas restrictivas.
// Fijan la precisión medida durante T5: qué tiene que coincidir, qué no, y con
// qué nivel. Bajar un umbral sin querer acá significa perder coincidencias
// reales o inundar al analista de falsos positivos.

import { describe, it, expect } from 'vitest';
import {
  normalizar, sinSufijos, similitud, nivelDe, sujetosDe,
  correrScreening, hitsNuevos, filasAEntradasMapeo, sugerirMapeo, UMBRALES
} from '../src/lib/screening.js';
import { parseTabla, parseTablaJson } from '../src/lib/parsers.js';

const puntaje = (a, b) => {
  const x = sinSufijos(normalizar(a)), y = sinSufijos(normalizar(b));
  return x === y ? 1 : similitud(x, y);
};

describe('normalizar', () => {
  it('saca tildes, puntuación y mayúsculas', () => {
    expect(normalizar('José Rodríguez Gómez')).toBe('JOSE RODRIGUEZ GOMEZ');
    expect(normalizar('ACME, S.A.')).toBe('ACME S A');
  });
  it('tolera vacíos', () => {
    expect(normalizar('')).toBe('');
    expect(normalizar(null)).toBe('');
  });
});

describe('sinSufijos', () => {
  it('quita las formas societarias', () => {
    expect(sinSufijos('CLEAN MANAGERS SRL')).toBe('CLEAN MANAGERS');
    expect(sinSufijos('HOLTZ SOCIEDAD ANONIMA')).toBe('HOLTZ');
  });
});

describe('similitud — coincidencias que DEBEN detectarse', () => {
  it('variantes societarias puntúan 100%', () => {
    expect(puntaje('Agroganadera El Sombrerito S.A.', 'AGROGANADERA EL SOMBRERITO SA')).toBe(1);
    expect(puntaje('Clean Managers S.R.L.', 'CLEAN MANAGERS SRL')).toBe(1);
    expect(puntaje('Holtz S.A.', 'HOLTZ SOCIEDAD ANONIMA')).toBe(1);
  });
  it('orden de nombre y apellido invertido', () => {
    expect(nivelDe(puntaje('Juan Carlos Perez', 'PEREZ, JUAN CARLOS'))).toBe('ALTA');
  });
  it('tolera plurales y tipeos', () => {
    const s = puntaje('Transportes Rivadavia', 'TRANSPORTE RIVADAVIA');
    expect(s).toBeGreaterThanOrEqual(UMBRALES.ALTA);
  });
  it('una letra distinta en el nombre de pila se reporta, no se descarta', () => {
    expect(nivelDe(puntaje('Maria Lopez', 'MARIO LOPEZ'))).not.toBeNull();
  });
});

describe('similitud — falsos positivos que NO deben pasar', () => {
  it('Norte contra Sur', () => {
    expect(nivelDe(puntaje('Distribuidora del Norte SA', 'DISTRIBUIDORA DEL SUR SA'))).toBeNull();
  });
  it('Nación contra Provincia', () => {
    expect(nivelDe(puntaje('Banco de la Nacion', 'BANCO DE LA PROVINCIA'))).toBeNull();
  });
  it('nombres sin relación', () => {
    expect(puntaje('Ferreteria Central', 'SUPERMERCADO LA ESQUINA')).toBe(0);
    expect(puntaje('ACME Corp', 'XYZ Holdings')).toBe(0);
  });
});

describe('similitud — subconjuntos degradados a MEDIA', () => {
  // Sin la penalización por cobertura, token_set_ratio devuelve 1.0 cuando un
  // nombre está contenido en otro, indistinguible de una coincidencia exacta.
  it('un nombre contenido en otro más largo no llega a exacto', () => {
    const s = puntaje('Juan Perez', 'JUAN CARLOS PEREZ GOMEZ');
    expect(s).toBeLessThan(1);
    expect(nivelDe(s)).toBe('MEDIA');
  });
});

describe('sujetosDe', () => {
  it('evalúa sociedad, representante, presidente, beneficiario y vinculados', () => {
    const s = sujetosDe({
      razonSocial:'Alfa SA', cuit:'30111111119', representanteLegal:'Ana Gomez',
      presidente:'Juan Perez', beneficiarioFinal:'Juan Perez', vinculados:'Pedro Ruiz, Luis Diaz',
    });
    expect(s.length).toBe(6);
    expect(s.map(x => x.rol)).toContain('Beneficiario final');
    expect(s.some(x => x.nombre === 'Luis Diaz')).toBe(true);
  });
  it('ignora campos vacíos y fragmentos muy cortos', () => {
    expect(sujetosDe({ razonSocial:'Alfa SA', vinculados:'A, , Bo' }).length).toBe(1);
  });
});

describe('correrScreening', () => {
  const legajos = [
    { id:'L1', razonSocial:'Holtz SA', cuit:'30-71234567-8', estadoCuenta:'ACTIVA' },
    { id:'L2', razonSocial:'Sin Coincidencia SRL', cuit:'30999999997', estadoCuenta:'ACTIVA' },
    { id:'L3', razonSocial:'Holtz SA', cuit:'30712345678', estadoCuenta:'CERRADA' },
  ];
  const listas = [{ id:'t', nombre:'Test', version:'v1', entradas:[
    { nombre:'HOLTZ SOCIEDAD ANONIMA' },
    { nombre:'OTRO NOMBRE CUALQUIERA', doc:'30-71234567-8' },
  ]}];

  it('detecta por nombre y por documento', () => {
    const r = correrScreening(legajos, listas, {}, { soloActivos:true });
    const crit = r.hits.filter(h => h.legajoId === 'L1').map(h => h.criterio);
    expect(crit).toContain('DOCUMENTO');
    expect(r.hits.some(h => h.legajoId === 'L2')).toBe(false);
  });

  it('el match por documento ignora guiones y formato', () => {
    const r = correrScreening(legajos, listas, {}, { soloActivos:true });
    const doc = r.hits.find(h => h.criterio === 'DOCUMENTO');
    expect(doc).toBeDefined();
    expect(doc.score).toBe(1);
  });

  it('soloActivos excluye las cuentas cerradas', () => {
    const act = correrScreening(legajos, listas, {}, { soloActivos:true });
    const todo = correrScreening(legajos, listas, {}, { soloActivos:false });
    expect(act.legajosEvaluados).toBe(2);
    expect(todo.legajosEvaluados).toBe(3);
    expect(todo.hits.length).toBeGreaterThan(act.hits.length);
  });

  it('los descartes no reaparecen', () => {
    const r1 = correrScreening(legajos, listas, {}, { soloActivos:true });
    const desc = {}; desc[r1.hits[0].clave] = { motivo:'homónimo', autor:'test', fecha:'1/1/2026' };
    const r2 = correrScreening(legajos, listas, desc, { soloActivos:true });
    expect(r2.hits.length).toBe(r1.hits.length - 1);
    expect(r2.hits.some(h => h.clave === r1.hits[0].clave)).toBe(false);
  });

  it('registra la versión de cada listado — es lo que hace auditable la corrida', () => {
    const r = correrScreening(legajos, listas, {}, {});
    expect(r.listas[0].version).toBe('v1');
    expect(r.listas[0].cantidad).toBe(2);
    expect(r.umbrales.ALTA).toBe(UMBRALES.ALTA);
  });

  it('sin listas no produce coincidencias', () => {
    expect(correrScreening(legajos, [], {}, {}).hits.length).toBe(0);
  });
});

describe('hitsNuevos', () => {
  const run = { hits: [{ clave:'a' }, { clave:'b' }] };
  it('sin corrida previa devuelve vacío: la primera revisión es manual', () => {
    expect(hitsNuevos(run, null)).toEqual([]);
  });
  it('devuelve solo lo que no estaba antes', () => {
    const n = hitsNuevos(run, { hits:[{ clave:'a' }] });
    expect(n.length).toBe(1);
    expect(n[0].clave).toBe('b');
  });
  it('sin novedades devuelve vacío', () => {
    expect(hitsNuevos(run, run).length).toBe(0);
  });
});

describe('importación de listados', () => {
  it('detecta el separador y no parte nombres con coma', () => {
    const t = parseTabla('Nombre;Tipo Doc;Nro Documento\nPEREZ, JUAN CARLOS;DNI;12345678\n');
    expect(t.filas.length).toBe(1);
    expect(t.filas['0']['Nombre']).toBe('PEREZ, JUAN CARLOS');
  });

  it('maneja BOM y comillas escapadas', () => {
    const t = parseTabla('\uFEFF"nombre","documento"\n"ACME ""EL"" SA","30712345678"\n');
    expect(t.headers[0]).toBe('nombre');
    expect(t.filas[0]['nombre']).toBe('ACME "EL" SA');
  });

  it('sugiere el mapeo con cabeceras acentuadas', () => {
    const t = parseTabla('Razón Social;Número de Documento;Observación\nBETA SRL;30222222220;alta\n');
    const m = sugerirMapeo(t.headers);
    expect(m.nombre).toBe('Razón Social');
    expect(m.doc).toBe('Número de Documento');
    const e = filasAEntradasMapeo(t.filas, m);
    expect(e[0].nombre).toBe('BETA SRL');
    expect(e[0].doc).toBe('30222222220');
  });

  it('descarta filas cuyo nombre es demasiado corto', () => {
    const t = parseTabla('nombre\nAB\nNOMBRE VALIDO\n');
    expect(filasAEntradasMapeo(t.filas, sugerirMapeo(t.headers)).length).toBe(1);
  });

  it('acepta JSON', () => {
    const j = parseTablaJson('[{"nombre":"XYZ SA","cuit":"30999999997"}]');
    expect(filasAEntradasMapeo(j.filas, sugerirMapeo(j.headers))[0].doc).toBe('30999999997');
  });
});
