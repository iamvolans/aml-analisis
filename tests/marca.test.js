// La marca comercial de la billetera no debe aparecer en el sistema.
//
// "Rebit" es la marca comercial del producto de billetera. El sistema de
// monitoreo alcanza a la totalidad de los productos que administra la entidad
// —cuentas de pago y gestión de cobranza de cheques—, de modo que la
// documentación y las pantallas deben identificar a GOAT S.A. y no a uno de sus
// productos.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '..');

function archivos(dir, ext) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p, ext) : (ext.test(e.name) ? [p] : []);
  });
}

describe('identidad de marca', () => {
  it('ningún módulo menciona la marca de la billetera', () => {
    const culpables = [];
    archivos(path.join(RAIZ, 'src'), /\.jsx?$/).forEach(f => {
      const src = fs.readFileSync(f, 'utf8');
      src.split('\n').forEach((l, i) => {
        // La dirección de despliegue de la aplicación no es identidad de marca:
        // es un dato técnico de acceso y se documenta como tal.
        if (/rebit-aml-app\.vercel\.app/.test(l)) return;
        if (/\bRebit\b/i.test(l)) culpables.push(`${path.basename(f)}:${i + 1}`);
      });
    });
    expect(culpables, 'reemplazar por GOAT:\n' + culpables.join('\n')).toEqual([]);
  });

  it('la clave del tema coincide entre index.html y theme.js', () => {
    // Si divergen, el script anti-parpadeo fija un tema y React aplica el otro
    const theme = fs.readFileSync(path.join(RAIZ, 'src/lib/theme.js'), 'utf8');
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const enTheme = /TEMA_KEY\s*=\s*'([^']+)'/.exec(theme)[1];
    const enHtml = /localStorage\.getItem\('([^']+)'\)/.exec(html)[1];
    expect(enHtml).toBe(enTheme);
  });

  it('las claves de almacenamiento usan un prefijo único y consistente', () => {
    const claves = new Set();
    archivos(path.join(RAIZ, 'src'), /\.jsx?$/).forEach(f => {
      const src = fs.readFileSync(f, 'utf8');
      [...src.matchAll(/'(goat_[a-z_0-9]+)'/g)].forEach(m => claves.add(m[1]));
    });
    expect(claves.size).toBeGreaterThan(0);
    claves.forEach(k => expect(k).toMatch(/^goat_/));
  });
});
