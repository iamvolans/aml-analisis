// Tests del parseo de Excel.
//
// Por qué existen: parsers.js convierte las fechas que Excel guarda como número
// serial usando XLSX.SSF.parse_date_code(), dentro de un try/catch que ante un
// fallo deja la fecha como el número crudo SIN avisar. Una fecha "45813" en vez
// de "9/6/2025" no rompe nada visiblemente, pero desarma los agrupamientos por
// día de PAT-01 y las líneas de tiempo.
//
// Vitest resuelve los módulos igual que Vite, así que estos tests ven la misma
// build de xlsx que el navegador. Ojo: un script de Node suelto NO sirve para
// esto — Node toma la build CJS, cuyo analizador de exports no expone SSF, y da
// un falso negativo.

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { normalizeRows } from '../src/lib/parsers.js';

describe('API de xlsx que usa la app', () => {
  it('expone las funciones de las que depende parsers.js', () => {
    expect(typeof XLSX.read).toBe('function');
    expect(typeof XLSX.utils.sheet_to_json).toBe('function');
    expect(typeof XLSX.utils.aoa_to_sheet).toBe('function');
  });

  it('expone SSF.parse_date_code — sin esto las fechas seriales se rompen en silencio', () => {
    expect(XLSX.SSF).toBeDefined();
    expect(typeof XLSX.SSF.parse_date_code).toBe('function');
  });

  it('convierte correctamente el número serial de Excel a fecha', () => {
    // Serial 45813 = 5 de junio de 2025 (época de Excel: serial 1 = 1/1/1900)
    const d = XLSX.SSF.parse_date_code(45813);
    expect(d.d).toBe(5);
    expect(d.m).toBe(6);
    expect(d.y).toBe(2025);
  });
});

describe('normalizeRows con una planilla real', () => {
  // Mismo camino que parseExcelFile: hoja → sheet_to_json(header:1, raw:true)
  function parsear(filas) {
    const hoja = XLSX.utils.aoa_to_sheet(filas);
    const rows = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
    return normalizeRows(rows);
  }

  it('convierte fechas seriales a DD/MM/AAAA', () => {
    const txns = parsear([
      ['fecha', 'hora', 'tipo', 'monto', 'contraparte_nombre'],
      [45813, '14:30', 'IN',  150000, 'PROVEEDOR UNO'],
      [45814, '09:15', 'OUT',  80000, 'CLIENTE DOS'],
    ]);
    expect(txns.length).toBe(2);
    expect(txns[0].fecha).toBe('5/6/2025');
    expect(txns[1].fecha).toBe('6/6/2025');
    // Ninguna fecha puede quedar como número pelado
    txns.forEach(t => expect(String(t.fecha)).toContain('/'));
  });

  it('respeta las fechas que ya vienen como texto', () => {
    const txns = parsear([
      ['fecha', 'tipo', 'monto', 'contraparte_nombre'],
      ['15/03/2026', 'IN', 1000, 'CP'],
    ]);
    expect(txns[0].fecha).toBe('15/03/2026');
  });

  it('parsea montos, tipo y contraparte', () => {
    const txns = parsear([
      ['fecha', 'tipo', 'monto', 'contraparte_nombre'],
      [45813, 'IN', 150000.5, 'PROVEEDOR UNO'],
    ]);
    expect(txns[0].monto).toBeCloseTo(150000.5, 2);
    expect(txns[0].tipo).toBe('IN');
    expect(txns[0].contraparte_nombre).toBe('PROVEEDOR UNO');
  });

  it('no rompe con una planilla vacía o solo con cabeceras', () => {
    expect(parsear([]).length).toBe(0);
    expect(parsear([['fecha', 'tipo', 'monto']]).length).toBe(0);
  });
});
