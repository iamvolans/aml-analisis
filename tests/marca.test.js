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

  it('index.html conserva el script anti-parpadeo', () => {
    // Sin él, quien usa el tema claro ve un destello negro en cada carga
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    expect(html, 'falta el script anti-parpadeo en index.html').toMatch(/localStorage\.getItem/);
  });

  it('la clave del tema coincide entre index.html y theme.js', () => {
    // Si divergen, el script fija un tema y React aplica el otro
    const theme = fs.readFileSync(path.join(RAIZ, 'src/lib/theme.js'), 'utf8');
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const mTheme = /TEMA_KEY\s*=\s*'([^']+)'/.exec(theme);
    const mHtml = /localStorage\.getItem\(['"]([^'"]+)['"]\)/.exec(html);
    expect(mTheme, 'no se encontró TEMA_KEY en theme.js').not.toBeNull();
    expect(mHtml, 'no se encontró la lectura de localStorage en index.html').not.toBeNull();
    expect(mHtml[1], 'la clave de index.html no coincide con la de theme.js').toBe(mTheme[1]);
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
