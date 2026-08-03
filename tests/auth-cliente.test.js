// Verifica que toda llamada a /api viaje con la sesión del usuario.
//
// Por qué existe: al cortar el token compartido (ALLOW_APP_TOKEN=false), la
// extracción con IA empezó a dar 401. La causa era que lib/ai.js armaba sus
// cabeceras con el token escrito a mano ('123aml2026') en lugar de importarlo,
// así que la migración a authHeaders() —que buscaba el símbolo APP_TOKEN— no lo
// tocó. Un grep por 'x-app-token' lo habría encontrado; el que hice no.
//
// Este test cierra esa clase de error: ningún módulo puede armar cabeceras de
// autenticación a mano, salvo los dos endpoints de arranque.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '..', 'src');

// session.js define el token y lo usa para el refresh; auth.js lo usa para el
// login. Los dos corren ANTES de que exista sesión, así que son la excepción.
const PERMITIDOS = ['session.js', 'auth.js'];

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p) : (/\.jsx?$/.test(e.name) ? [p] : []);
  });
}
function sinComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('autenticación del cliente', () => {
  it('el valor del token no está escrito a mano en ningún lado', () => {
    const culpables = [];
    archivos(RAIZ).forEach(f => {
      if (path.basename(f) === 'session.js') return;  // acá se define
      const src = sinComentarios(fs.readFileSync(f, 'utf8'));
      if (/['"]123aml2026['"]/.test(src)) culpables.push(path.basename(f));
    });
    expect(culpables, 'importar APP_TOKEN de session.js en vez de repetir el valor').toEqual([]);
  });

  it('nadie arma la cabecera x-app-token a mano fuera de los endpoints de arranque', () => {
    const culpables = [];
    archivos(RAIZ).forEach(f => {
      const base = path.basename(f);
      if (PERMITIDOS.includes(base)) return;
      const src = sinComentarios(fs.readFileSync(f, 'utf8'));
      src.split('\n').forEach((linea, i) => {
        if (/['"]x-app-token['"]\s*:/.test(linea)) culpables.push(`${base}:${i + 1}  ${linea.trim().slice(0, 70)}`);
      });
    });
    expect(culpables, 'usar await authHeaders({...}) de session.js:\n' + culpables.join('\n')).toEqual([]);
  });

  it('todo fetch a /api manda cabeceras', () => {
    const culpables = [];
    archivos(RAIZ).forEach(f => {
      const base = path.basename(f);
      if (PERMITIDOS.includes(base)) return;
      const src = sinComentarios(fs.readFileSync(f, 'utf8'));
      const re = /fetch\(\s*['"`]\/api\/[^'"`]*['"`][\s\S]{0,60}?,\s*\{([\s\S]{0,400}?)\}\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        if (!/headers\s*:/.test(m[1])) {
          culpables.push(`${base}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    });
    expect(culpables, 'fetch a /api sin cabeceras:\n' + culpables.join('\n')).toEqual([]);
  });

  // El bug de v3.18.1: ai.js llamaba a /api/ai y NO mencionaba authHeaders en
  // ninguna parte del archivo. Es la comprobación que lo hubiera atajado.
  it('todo módulo que llama a /api conoce authHeaders', () => {
    const culpables = [];
    archivos(RAIZ).forEach(f => {
      const base = path.basename(f);
      if (PERMITIDOS.includes(base)) return;
      const src = sinComentarios(fs.readFileSync(f, 'utf8'));
      if (!/fetch\(\s*['"`]\/api\//.test(src)) return;
      // Directo, o a través de un ayudante local que sí lo use (gzipPayload,
      // headers()), en cuyo caso el archivo importa ese ayudante.
      const usa = /authHeaders/.test(src) || /gzipPayload|await headers\(\)/.test(src);
      if (!usa) culpables.push(base);
    });
    expect(culpables, 'estos módulos llaman a /api sin pasar por authHeaders:\n' + culpables.join('\n')).toEqual([]);
  });
});
