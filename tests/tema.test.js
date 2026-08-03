// Tests del sistema de temas.
//
// Verifican tres clases de error que no se ven en un build exitoso:
//   1. Una paleta a la que le falta una clave → esa variable CSS queda sin
//      definir y el color se pinta transparente o negro, sin avisar.
//   2. Contraste insuficiente → texto ilegible. Se mide, no se estima.
//   3. Un token `T.` dentro de un ATRIBUTO SVG → var() no se resuelve ahí y el
//      elemento se pinta negro. Es el pie de barro de usar variables CSS, así
//      que se vigila con un escáner estático.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { T, TR, C, CR, PALETAS, TEMAS, CLAVES_COLOR, varDe, aplicarTema, temaActual } from '../src/lib/theme.js';

// ── Contraste WCAG ─────────────────────────────────────────────────────────
function canal(c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function luminancia(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return 0.2126 * canal(parseInt(h.slice(0, 2), 16))
       + 0.7152 * canal(parseInt(h.slice(2, 4), 16))
       + 0.0722 * canal(parseInt(h.slice(4, 6), 16));
}
function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('estructura de las paletas', () => {
  it('hay exactamente dos temas declarados', () => {
    expect(Object.keys(PALETAS).sort()).toEqual(['claro', 'oscuro']);
    expect(TEMAS.map(t => t.id).sort()).toEqual(['claro', 'oscuro']);
  });

  it('ambas paletas definen TODAS las claves — una faltante pinta transparente', () => {
    CLAVES_COLOR.forEach(k => {
      expect(PALETAS.oscuro[k], 'falta ' + k + ' en oscuro').toBeDefined();
      expect(PALETAS.claro[k], 'falta ' + k + ' en claro').toBeDefined();
    });
  });

  it('ninguna paleta tiene claves de más', () => {
    ['oscuro', 'claro'].forEach(t => {
      Object.keys(PALETAS[t]).forEach(k => {
        expect(CLAVES_COLOR, k + ' sobra en ' + t).toContain(k);
      });
    });
  });

  it('los valores son colores o sombras válidas', () => {
    const valido = /^(#[0-9A-Fa-f]{3,8}|rgba?\(|0 |inset)/;
    ['oscuro', 'claro'].forEach(t => {
      CLAVES_COLOR.forEach(k => {
        expect(String(PALETAS[t][k]), t + '.' + k).toMatch(valido);
      });
    });
  });

  it('los dos temas son realmente distintos', () => {
    expect(PALETAS.oscuro.BG).not.toBe(PALETAS.claro.BG);
    expect(luminancia(PALETAS.oscuro.BG)).toBeLessThan(0.1);
    expect(luminancia(PALETAS.claro.BG)).toBeGreaterThan(0.85);
  });
});

describe('T apunta a variables CSS', () => {
  it('cada clave de color es una referencia var()', () => {
    CLAVES_COLOR.forEach(k => {
      expect(T[k], k).toBe('var(' + varDe(k) + ')');
    });
  });

  it('T.SHADOW.card y .pop siguen existiendo (los usan 30 lugares)', () => {
    expect(T.SHADOW.card).toBe(T.SHADOW_CARD);
    expect(T.SHADOW.pop).toBe(T.SHADOW_POP);
  });

  it('los tokens que no dependen del tema son literales', () => {
    expect(T.SANS).toContain('Inter');
    expect(T.MONO).toContain('JetBrains');
    expect(T.RADIUS.md).toBe(10);
    expect(String(T.TRANS)).not.toContain('var(');
  });

  it('la paleta legacy C también apunta a variables', () => {
    expect(C.VERDE).toBe(T.GREEN);
    expect(C.ROJO).toBe(T.RED);
    expect(C.AC).toBe(T.ACCENT);
  });
});

describe('aplicarTema y TR', () => {
  it('TR arranca con valores reales, no con var()', () => {
    CLAVES_COLOR.forEach(k => {
      expect(String(TR[k]), k).not.toContain('var(');
    });
  });

  it('cambiar de tema muta TR en el lugar', () => {
    const antes = TR.BG;
    aplicarTema('claro');
    expect(TR.BG).toBe(PALETAS.claro.BG);
    expect(TR.BG).not.toBe(antes);
    expect(temaActual()).toBe('claro');

    aplicarTema('oscuro');
    expect(TR.BG).toBe(PALETAS.oscuro.BG);
    expect(temaActual()).toBe('oscuro');
  });

  it('CR acompaña el cambio', () => {
    aplicarTema('claro');
    expect(CR.VERDE).toBe(PALETAS.claro.GREEN);
    aplicarTema('oscuro');
    expect(CR.VERDE).toBe(PALETAS.oscuro.GREEN);
  });

  it('un tema desconocido cae en oscuro en vez de romper', () => {
    expect(aplicarTema('neon')).toBe('oscuro');
    expect(TR.BG).toBe(PALETAS.oscuro.BG);
  });

  it('la referencia a TR se mantiene — quien la importó ve los cambios', () => {
    const ref = TR;
    aplicarTema('claro');
    expect(ref.BG).toBe(PALETAS.claro.BG);
    aplicarTema('oscuro');
  });
});

describe('contraste — texto legible en ambos temas', () => {
  // AA exige 4.5:1 para texto normal y 3:1 para texto grande o en negrita.
  const superficies = ['BG', 'BG2', 'BG3'];

  ['oscuro', 'claro'].forEach(tema => {
    const p = PALETAS[tema];

    superficies.forEach(sup => {
      it(`${tema}: TEXT sobre ${sup} cumple AA`, () => {
        expect(contraste(p.TEXT, p[sup])).toBeGreaterThanOrEqual(4.5);
      });
      it(`${tema}: TEXT2 sobre ${sup} cumple AA`, () => {
        expect(contraste(p.TEXT2, p[sup])).toBeGreaterThanOrEqual(4.5);
      });
      it(`${tema}: TEXT3 sobre ${sup} es legible para etiquetas`, () => {
        expect(contraste(p.TEXT3, p[sup])).toBeGreaterThanOrEqual(3.0);
      });
    });

    it(`${tema}: el acento se distingue sobre la superficie de tarjeta`, () => {
      expect(contraste(p.ACCENT, p.BG2)).toBeGreaterThanOrEqual(3.0);
    });

    ['GREEN', 'AMBER', 'RED'].forEach(sem => {
      it(`${tema}: ${sem} como texto sobre BG2 se lee`, () => {
        expect(contraste(p[sem], p.BG2)).toBeGreaterThanOrEqual(3.0);
      });
      it(`${tema}: ON_SEMANTIC sobre ${sem} se lee`, () => {
        expect(contraste(p.ON_SEMANTIC, p[sem])).toBeGreaterThanOrEqual(3.0);
      });
    });

    it(`${tema}: ON_ACCENT sobre ACCENT se lee`, () => {
      expect(contraste(p.ON_ACCENT, p.ACCENT)).toBeGreaterThanOrEqual(3.0);
    });

    it(`${tema}: los bordes se distinguen del fondo`, () => {
      expect(contraste(p.BORDER2, p.BG2)).toBeGreaterThan(1.08);
    });
  });
});

// ── Escáner estático: el pie de barro de las variables CSS ─────────────────
describe('ningún token var() dentro de un atributo SVG', () => {
  const RAIZ = path.resolve(__dirname, '..', 'src');

  function archivos(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? archivos(p) : (/\.jsx?$/.test(e.name) ? [p] : []);
    });
  }

  // Los comentarios se descartan antes de escanear: theme.js documenta el
  // antipatrón con un ejemplo, y sin esto se denunciaría a sí mismo.
  function sinComentarios(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  }

  it('stroke / fill / stopColor usan TR o CR, nunca T o C', () => {
    const ATTRS = ['stroke', 'fill', 'stopColor', 'floodColor'];
    const infracciones = [];

    archivos(RAIZ).forEach(f => {
      const src = sinComentarios(fs.readFileSync(f, 'utf8'));
      ATTRS.forEach(attr => {
        // Solo atributos JSX: attr={...}. El `style={{stroke:T.RED}}` es CSS y
        // ahí var() sí funciona, por eso se excluye.
        const re = new RegExp('(?<![\\w.])' + attr + '=\\{([^}]*)\\}', 'g');
        let m;
        while ((m = re.exec(src))) {
          if (/\b[TC]\.[A-Z]/.test(m[1]) && !/\bTR\.|\bCR\./.test(m[1])) {
            const linea = src.slice(0, m.index).split('\n').length;
            infracciones.push(`${path.basename(f)}:${linea}  ${attr}={${m[1].trim().slice(0, 50)}}`);
          }
        }
      });
    });

    expect(infracciones, 'usar TR./CR. en atributos SVG:\n' + infracciones.join('\n')).toEqual([]);
  });

  it('ninguna vista importa colores crudos de la paleta interna', () => {
    // OSCURO y CLARO no se exportan: son detalle de implementación de theme.js
    archivos(RAIZ).filter(f => !f.endsWith('theme.js')).forEach(f => {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, path.basename(f)).not.toMatch(/import[^;]*\b(OSCURO|CLARO)\b[^;]*from[^;]*theme/);
    });
  });
});
