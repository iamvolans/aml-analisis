// Verifica que ningún módulo use un identificador que no importó ni declaró.
//
// Por qué existe: el build de Vite NO detecta esto. `esbuild` no resuelve
// identificadores libres, así que un archivo puede referenciar `C` o `Pill` sin
// importarlos, compilar sin una sola advertencia, y explotar en el navegador con
// "ReferenceError: X is not defined" — pantalla en blanco.
//
// Ya pasó tres veces: `Pill` en Análisis (v3.6.0), y `C` en App.jsx al reescribir
// el import del tema (v3.18.2). Las tres se atajaron con un script descartable;
// acá queda permanente.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '..', 'src');

// Globales del navegador y del lenguaje: no se importan.
const GLOBALES = new Set([
  'window','document','navigator','location','history','localStorage','sessionStorage',
  'console','fetch','Blob','File','FileReader','FormData','Headers','Request','Response',
  'URL','URLSearchParams','AbortController','CompressionStream','DecompressionStream',
  'setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame',
  'Math','JSON','Object','Array','String','Number','Boolean','Date','RegExp','Error',
  'Promise','Map','Set','WeakMap','WeakSet','Symbol','Proxy','Reflect','BigInt',
  'Intl','TextEncoder','TextDecoder','Uint8Array','ArrayBuffer','DataView','Int32Array',
  'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent',
  'btoa','atob','structuredClone','crypto','process','globalThis','alert','confirm','prompt',
  'React','MouseEvent','KeyboardEvent','Event','Image','Audio','Notification','matchMedia'
]);

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p) : (/\.jsx?$/.test(e.name) ? [p] : []);
  });
}

function sinComentariosNiTextos(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    // Texto plano de JSX: >Oficial de Cumplimiento (titular)< no es código.
    // Se descarta solo cuando no contiene nada que parezca expresión. Se
    // conservan los saltos de línea para que los números de línea reportados
    // sigan coincidiendo con el archivo real.
    .replace(/>[^<>{}=]*</g, m => '>' + saltos(m) + '<')
    // Texto JSX intercalado entre expresiones: `{n} RFI(s) registrado(s) {otra}`.
    // Los guards de `=` y `;` evitan comerse código real entre un cierre y una
    // apertura — sin el `;` se tragaba el espacio entre imports consecutivos
    // (`} from '...'; import {`) y quedaban todos sin registrar.
    .replace(/\}[^<>{}=;]*\{/g, m => '}' + saltos(m) + '{');
}

function saltos(m) {
  return '\n'.repeat((m.match(/\n/g) || []).length);
}

function importados(src) {
  const out = new Set();
  const re = /import\s+(?:\*\s+as\s+(\w+)|(\w+)\s*,\s*\{([^}]*)\}|\{([^}]*)\}|(\w+))\s+from/g;
  let m;
  while ((m = re.exec(src))) {
    m.slice(1).filter(Boolean).forEach(g => {
      g.split(',').forEach(p => {
        const nombre = p.trim().split(/\s+as\s+/).pop().trim();
        if (nombre) out.add(nombre);
      });
    });
  }
  return out;
}

function declarados(src) {
  const out = new Set();
  [/(?:var|let|const)\s+([\w$]+)/g, /function\s+([\w$]+)/g, /class\s+([\w$]+)/g].forEach(re => {
    let m; while ((m = re.exec(src))) out.add(m[1]);
  });
  // desestructuración: var { a, b } = ... / var [a, b] = ...
  let m;
  const destr = /(?:var|let|const)\s*[{[]([^}\]]*)[}\]]\s*=/g;
  while ((m = destr.exec(src))) {
    m[1].split(',').forEach(p => {
      const nombre = p.split(':').pop().split('=')[0].trim();
      if (/^[\w$]+$/.test(nombre)) out.add(nombre);
    });
  }
  // parámetros de función
  const params = /function\s*[\w$]*\s*\(([^)]*)\)/g;
  while ((m = params.exec(src))) {
    m[1].split(',').forEach(p => {
      const nombre = p.split('=')[0].trim();
      if (/^[\w$]+$/.test(nombre)) out.add(nombre);
    });
  }
  // arrow functions con paréntesis y sin ellos
  const arrow = /\(([^)]*)\)\s*=>|(?:^|[^\w.])([\w$]+)\s*=>/g;
  while ((m = arrow.exec(src))) {
    (m[1] || m[2] || '').split(',').forEach(p => {
      const nombre = p.split('=')[0].trim();
      if (/^[\w$]+$/.test(nombre)) out.add(nombre);
    });
  }
  // catch (e)
  const cat = /catch\s*\(\s*([\w$]+)\s*\)/g;
  while ((m = cat.exec(src))) out.add(m[1]);
  return out;
}

describe('identificadores libres', () => {
  it('todo símbolo usado como X.algo o X(...) está importado o declarado', () => {
    const problemas = [];

    archivos(RAIZ).forEach(f => {
      const crudo = fs.readFileSync(f, 'utf8');
      const src = sinComentariosNiTextos(crudo);
      const conocidos = new Set([...importados(src), ...declarados(src), ...GLOBALES]);

      const RESERVADAS = new Set(['if','for','while','switch','catch','return','typeof',
        'new','delete','void','in','of','do','else','try','finally','function','class',
        'await','yield','case','throw','instanceof','import','export','default','from']);

      const re = /(?<![\w.$])([A-Za-z_$][\w$]*)(?:\.[\w$]|\()/g;
      let m;
      const vistos = new Set();
      while ((m = re.exec(src))) {
        const sim = m[1];
        if (RESERVADAS.has(sim) || conocidos.has(sim) || vistos.has(sim)) continue;
        // Solo mayúscula inicial: los identificadores en minúscula son casi
        // siempre variables locales, y distinguirlas exigiría análisis de
        // alcance real, que una expresión regular no puede hacer. Ese hueco lo
        // cubre la comprobación siguiente, que sí es precisa.
        if (!/^[A-Z]/.test(sim)) continue;
        vistos.add(sim);
        const linea = src.slice(0, m.index).split('\n').length;
        problemas.push(`${path.basename(f)}:${linea}  ${sim}`);
      }
    });

    expect(problemas, 'identificadores sin importar (ReferenceError en runtime):\n' + problemas.join('\n')).toEqual([]);
  });

  // Comprobación precisa para el caso que efectivamente rompió en producción:
  // usar un ayudante que la propia app exporta —fmtM, segColor, todayStr— sin
  // importarlo. La vista compila y explota en el navegador al renderizar.
  it('ningún módulo usa un ayudante de lib/ sin importarlo', () => {
    // Símbolos exportados por los módulos de lib/
    const exportados = new Set();
    archivos(path.join(RAIZ, 'lib')).forEach(f => {
      const src = fs.readFileSync(f, 'utf8');
      [...src.matchAll(/export\s*\{([^}]*)\}/g)].forEach(m => {
        m[1].split(',').forEach(x => {
          const n = x.trim().split(/\s+as\s+/).pop().trim();
          if (/^[a-zA-Z_$][\w$]*$/.test(n)) exportados.add(n);
        });
      });
    });
    expect(exportados.size, 'no se detectó ningún export en lib/').toBeGreaterThan(20);

    const problemas = [];
    archivos(RAIZ).forEach(f => {
      if (f.includes('/lib/')) return;           // los módulos entre sí ya se resuelven al importar
      const src = sinComentariosNiTextos(fs.readFileSync(f, 'utf8'));
      const imp = importados(src);
      const dec = declarados(src);
      exportados.forEach(sim => {
        if (imp.has(sim) || dec.has(sim)) return;
        // Uso como llamada o como acceso a propiedad
        const re = new RegExp('(?<![\\w.$])' + sim + '\\s*[(.]');
        if (re.test(src)) {
          problemas.push(`${path.basename(f)}: usa ${sim} sin importarlo`);
        }
      });
    });
    expect(problemas, 'ayudantes usados sin importar:\n' + problemas.join('\n')).toEqual([]);
  });
});
