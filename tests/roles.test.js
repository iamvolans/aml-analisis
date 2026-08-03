// Consistencia de los identificadores de rol en todo el sistema.
//
// Por qué existe: la UI de Usuarios crea perfiles con rol 'oficial_cumplimiento',
// pero api/_auth.js quedó escrito con 'compliance'. No rompía el login —esa ruta
// usa otro módulo— así que el Oficial de Cumplimiento habría perdido permisos de
// escritura en silencio el día que se cableara RBAC en /api/sync.
//
// Un rol mal escrito no da error: simplemente no matchea, y el usuario ve menos
// de lo que le corresponde sin que nada lo avise.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '..');

// Los cinco roles que ofrece la UI de Usuarios. Es la fuente de verdad: es lo
// que termina guardado en la tabla `perfiles`.
//
// `readonly` no aparece en ninguna lista de permisos: se maneja por exclusión,
// que es lo correcto — un rol de solo lectura no debería requerir que alguien
// se acuerde de excluirlo de cada capacidad nueva.
const ROLES = ['analista', 'supervisor', 'oficial_cumplimiento', 'admin', 'readonly'];
const ROLES_ESCRIBEN = ['analista', 'supervisor', 'oficial_cumplimiento', 'admin'];

function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), 'utf8'); }
function sinComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('identificadores de rol', () => {
  it('la UI de Usuarios ofrece exactamente los roles del modelo', () => {
    const src = leer('src/views/Usuarios.jsx');
    const ofrecidos = [...src.matchAll(/<option value="([a-z_]+)"/g)].map(m => m[1]);
    expect(ofrecidos.sort()).toEqual(ROLES.slice().sort());
  });

  it('ningún módulo usa un rol que no existe en el modelo', () => {
    const archivos = [
      'src/lib/auth.js', 'src/views/Usuarios.jsx',
      'api/_auth.js', 'api/auth.js'
    ];
    const sospechosos = [];
    archivos.forEach(f => {
      const src = sinComentarios(leer(f));
      // Roles citados dentro de arrays o comparaciones
      [...src.matchAll(/['"]([a-z_]{4,})['"]/g)].forEach(m => {
        const v = m[1];
        // Solo se evalúan cadenas que parecen un rol: aparecen junto a `rol`
        const ctx = src.slice(Math.max(0, m.index - 120), m.index + 40);
        if (!/\brol\b|ROLES_|puede[A-Z]/.test(ctx)) return;
        if (ROLES.includes(v)) return;
        // Palabras de la propia lógica, no roles
        if (['admin','indexof','length','string','number','boolean'].includes(v)) return;
        if (/^[a-z_]+$/.test(v) && /compliance|oficial|analyst|supervisor|officer/.test(v)) {
          sospechosos.push(f + ' → ' + v);
        }
      });
    });
    expect(sospechosos, 'roles que no existen en el modelo:\n' + sospechosos.join('\n')).toEqual([]);
  });

  it('cliente y servidor coinciden en quién puede aprobar', () => {
    const cli = leer('src/lib/auth.js');
    const srv = leer('api/auth.js');
    const mCli = cli.match(/function puedeAprobar\(rol\)\s*\{\s*return \[([^\]]*)\]/);
    const mSrv = srv.match(/function puedeVerAudit\(u\)\s*\{[^[]*\[([^\]]*)\]/);
    const norm = s => s.replace(/['"\s]/g, '').split(',').filter(Boolean).sort();
    expect(norm(mCli[1])).toEqual(norm(mSrv[1]));
  });

  it('el rol de solo lectura no aparece en ninguna lista de escritura', () => {
    const srv = sinComentarios(leer('api/_auth.js'));
    const cli = sinComentarios(leer('src/lib/auth.js'));
    expect(srv).not.toMatch(/ROLES_ESCRITURA[^\]]*readonly/);
    expect(srv).not.toMatch(/ROLES_BORRADO[^\]]*readonly/);
    expect(cli).not.toMatch(/puedeEditar[^;]*readonly/);
  });

  it('quien puede borrar es un subconjunto de quien puede escribir', () => {
    const srv = sinComentarios(leer('api/_auth.js'));
    const esc = srv.match(/ROLES_ESCRITURA\s*=\s*\[([^\]]*)\]/)[1];
    const bor = srv.match(/ROLES_BORRADO\s*=\s*\[([^\]]*)\]/)[1];
    const norm = s => s.replace(/['"\s]/g, '').split(',').filter(Boolean);
    norm(bor).forEach(r => {
      expect(norm(esc), r + ' puede borrar pero no escribir').toContain(r);
    });
  });

  it('todos los roles del servidor existen en el modelo', () => {
    const srv = sinComentarios(leer('api/_auth.js'));
    ['ROLES_ESCRITURA', 'ROLES_BORRADO'].forEach(k => {
      const m = srv.match(new RegExp(k + '\\s*=\\s*\\[([^\\]]*)\\]'));
      m[1].replace(/['"\s]/g, '').split(',').filter(Boolean).forEach(r => {
        expect(ROLES, k + ' cita el rol inexistente "' + r + '"').toContain(r);
      });
    });
  });
});
