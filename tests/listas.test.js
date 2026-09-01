// Normalización de listados oficiales y precisión del cotejo a escala real.
//
// Cada organismo publica en su propio formato y ninguno entra directo al motor.
// Estos tests fijan lo que cada normalizador debe extraer, y sobre todo los
// defectos que aparecieron al probar con los archivos verdaderos:
//
//  · OFAC escribe '-0-' donde no hay dato. Sin limpiarlo se cargaban miles de
//    entradas llamadas literalmente "-0-".
//  · El archivo de la UE repite la cabecera Entity_logical_id seis veces;
//    quedarse con la última hacía que todo el archivo fuera una sola entidad.
//  · Los alias son la mayor parte del valor: solo REPET tiene 1.581 alias sobre
//    606 personas. Cargando el nombre principal se pierde la mayoría de las
//    coincidencias posibles.
//  · Con 55.000 entradas reales, entradas de una sola palabra ("MARIA",
//    "ESPERANZA") coincidían al 94% con cualquier nombre que las contuviera:
//    55% de falsos positivos sobre nombres argentinos corrientes.

import { describe, it, expect } from 'vitest';
import { detectarFormato, normalizarLista, normalizarREPET, normalizarOFAC,
         normalizarONU, normalizarUE, limpio, filasCSV } from '../src/lib/listas.js';
import { similitud, nivelDe, normalizar, sinSufijos } from '../src/lib/screening.js';

const puntaje = (a, b) => {
  const x = sinSufijos(normalizar(a)), y = sinSufijos(normalizar(b));
  return x === y ? 1 : similitud(x, y);
};

// ── Muestras con la estructura de los archivos reales ─────────────────────
const REPET = JSON.stringify([{
  FIRST_NAME:'ABD AL-BASET', SECOND_NAME:'AZZOUZ', THIRD_NAME:'', FOURTH_NAME:'',
  REFERENCE_NUMBER:'QDi.371', UN_LIST_TYPE:'Al-Qaida', LISTED_ON:'29/02/2016',
  COMMENTS1:'Key operative in Al-Qaida',
  INDIVIDUAL_ALIAS:[{ALIAS_NAME:'Abdelbassed Azouz',QUALITY:'Good'},
                    {ALIAS_NAME:'AA',QUALITY:'Low',NOTE:'initials'}],
  INDIVIDUAL_DOCUMENT:[{NUMBER:'00754833',TYPE_OF_DOCUMENT:'Passport'}]
}]);

const ONU = `<?xml version="1.0"?><CONSOLIDATED_LIST dateGenerated="2026-08-31">
<INDIVIDUALS><INDIVIDUAL><FIRST_NAME> GEDO </FIRST_NAME><SECOND_NAME>HAMDAN </SECOND_NAME>
<REFERENCE_NUMBER>SDi.007</REFERENCE_NUMBER><UN_LIST_TYPE>Sudan</UN_LIST_TYPE>
<INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>ABU NASHUK</ALIAS_NAME></INDIVIDUAL_ALIAS>
</INDIVIDUAL></INDIVIDUALS>
<ENTITIES><ENTITY><FIRST_NAME>ABDALLAH AZZAM BRIGADES</FIRST_NAME>
<REFERENCE_NUMBER>QDe.144</REFERENCE_NUMBER>
<ENTITY_ALIAS><QUALITY>a.k.a.</QUALITY><ALIAS_NAME>Ziyad al-Jarrah Battalions</ALIAS_NAME></ENTITY_ALIAS>
</ENTITY></ENTITIES></CONSOLIDATED_LIST>`;

const OFAC = '36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- \n'
           + '9640,"ABU TEIR, Mohammed","individual","NS-PLC",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"DOB 1951"\n'
           + '1200,"MAR AZUL","vessel","CUBA",-0- ,-0- ,"Cargo",-0- ,-0- ,"Panama",-0- ,-0- \n';

const UE = 'Date_file;Entity_logical_id;Subject_type;Programme;Naal_lastname;Naal_firstname;'
         + 'Naal_wholename;Entity_logical_id\n'
         + '05/08/2026;13;P;IRQ;TORDEN;Voislav;Voislav TORDEN;13\n'
         + '05/08/2026;13;P;IRQ;TORDEN;Voyslav;Voyslav TORDEN;13\n'
         + '05/08/2026;27;E;SYR;;;Volksfront Befreiung Palaestinas;27\n';

describe('detección de formato', () => {
  it('reconoce cada uno de los cuatro formatos', () => {
    expect(detectarFormato('personas_repet.json', REPET)).toBe('repet-json');
    expect(detectarFormato('consolidatedLegacyByNAME.xml', ONU)).toBe('onu-xml');
    expect(detectarFormato('sdn.csv', OFAC)).toBe('ofac-csv');
    expect(detectarFormato('20260805-FULL-1_0.csv', UE)).toBe('ue-csv');
  });
  it('devuelve null ante un formato desconocido', () => {
    expect(detectarFormato('otro.csv', 'a,b,c\n1,2,3')).toBeNull();
  });
});

describe('limpieza de valores', () => {
  it('trata el relleno "-0-" de OFAC como vacío', () => {
    expect(limpio('-0- ')).toBe('');
    expect(limpio('-0-')).toBe('');
    expect(limpio('CUBA')).toBe('CUBA');
  });
  it('el lector de CSV respeta comillas y separador', () => {
    expect(filasCSV('a;"b;c";d', ';')[0]).toEqual(['a', 'b;c', 'd']);
    expect(filasCSV('x,"di ""hola""",z', ',')[0][1]).toBe('di "hola"');
  });
});

describe('REPET', () => {
  const r = normalizarREPET(REPET);
  it('compone el nombre a partir de los campos separados', () => {
    expect(r.entradas[0].nombre).toBe('ABD AL-BASET AZZOUZ');
  });
  it('emite cada alias como entrada propia vinculada al titular', () => {
    const al = r.entradas.filter(e => e.aliasDe);
    expect(al.length).toBe(1);
    expect(al[0].nombre).toBe('Abdelbassed Azouz');
    expect(al[0].aliasDe).toBe('ABD AL-BASET AZZOUZ');
  });
  it('descarta los alias de calidad baja, que son iniciales o fragmentos', () => {
    expect(r.entradas.some(e => e.nombre === 'AA')).toBe(false);
  });
  it('conserva el documento y la referencia del organismo', () => {
    expect(r.entradas[0].doc).toBe('00754833');
    expect(r.entradas[0].ref).toBe('QDi.371');
  });
});

describe('Naciones Unidas', () => {
  const r = normalizarONU(ONU);
  it('procesa individuos y entidades', () => {
    expect(r.entradas.some(e => e.tipo === 'persona')).toBe(true);
    expect(r.entradas.some(e => e.tipo === 'entidad')).toBe(true);
  });
  it('normaliza los espacios sobrantes del XML', () => {
    expect(r.entradas.find(e => e.ref === 'SDi.007').nombre).toBe('GEDO HAMDAN');
  });
  it('expande los alias de ambas secciones', () => {
    expect(r.entradas.some(e => e.nombre === 'ABU NASHUK' && e.aliasDe)).toBe(true);
    expect(r.entradas.some(e => e.nombre === 'Ziyad al-Jarrah Battalions' && e.aliasDe)).toBe(true);
  });
});

describe('OFAC', () => {
  const r = normalizarOFAC(OFAC);
  it('no genera entradas con el relleno "-0-"', () => {
    expect(r.entradas.some(e => e.nombre.indexOf('-0-') >= 0)).toBe(false);
    expect(r.entradas.every(e => e.nombre.length > 2)).toBe(true);
  });
  it('clasifica persona, entidad y buque', () => {
    const t = {}; r.entradas.forEach(e => t[e.tipo] = (t[e.tipo] || 0) + 1);
    expect(t.persona).toBe(1);
    expect(t.entidad).toBe(1);
    expect(t.buque).toBe(1);
  });
  it('advierte sobre buques y sobre los archivos complementarios', () => {
    expect(r.avisos.join(' ')).toMatch(/buques|aeronaves/);
    expect(r.avisos.join(' ')).toMatch(/alt\.csv|add\.csv/);
  });
});

describe('Unión Europea', () => {
  const r = normalizarUE(UE);
  it('toma la PRIMERA aparición de una cabecera repetida', () => {
    // Entity_logical_id aparece seis veces en el archivo real; con la última,
    // todas las filas compartían identificador y el archivo entero quedaba
    // interpretado como una sola entidad.
    const principales = r.entradas.filter(e => !e.aliasDe);
    expect(principales.length).toBe(2);
  });
  it('trata las variantes de nombre de una entidad como alias', () => {
    const v = r.entradas.find(e => e.nombre === 'Voyslav TORDEN');
    expect(v.aliasDe).toBe('Voislav TORDEN');
  });
  it('distingue persona de entidad por Subject_type', () => {
    expect(r.entradas.find(e => e.nombre === 'Voislav TORDEN').tipo).toBe('persona');
    expect(r.entradas.find(e => /Volksfront/.test(e.nombre)).tipo).toBe('entidad');
  });
});

describe('punto de entrada', () => {
  it('informa formato, principales y alias por separado', () => {
    const r = normalizarLista('personas_repet.json', REPET);
    expect(r.formato).toBe('repet-json');
    expect(r.label).toBe('REPET (Argentina)');
    expect(r.principales).toBe(1);
    expect(r.alias).toBe(1);
  });
  it('un formato desconocido no rompe: devuelve vacío con aviso', () => {
    const r = normalizarLista('x.csv', 'a,b\n1,2');
    expect(r.formato).toBeNull();
    expect(r.entradas).toEqual([]);
    expect(r.avisos.length).toBeGreaterThan(0);
  });
  it('un archivo corrupto del formato correcto se informa, no explota', () => {
    const r = normalizarLista('personas_repet.json', '{"REFERENCE_NUMBER": roto');
    expect(r.entradas).toEqual([]);
    expect(r.avisos.join(' ')).toMatch(/no pudo procesarse/);
  });
});

// ── Precisión del cotejo a escala real ────────────────────────────────────
describe('fragmentos de una sola palabra', () => {
  it('una palabra suelta NO coincide con un nombre más largo', () => {
    // El caso que producía 55% de falsos positivos con las listas verdaderas
    [['MARIA E', 'MARIA FERNANDEZ'],
     ['ESPERANZA', 'AGROPECUARIA LA ESPERANZA'],
     ['ROBERTO', 'ROBERTO SANCHEZ'],
     ['CONSTRUCTORA W L', 'CONSTRUCTORA BELGRANO SA']].forEach(([a, b]) => {
      expect(nivelDe(puntaje(a, b)), a + ' vs ' + b).toBeNull();
    });
  });

  it('pero dos denominaciones de una sola palabra sí se comparan', () => {
    // Quitados los sufijos societarios ambas quedan en un solo término
    expect(puntaje('Holtz S.A.', 'HOLTZ SOCIEDAD ANONIMA')).toBe(1);
  });

  it('un cambio de letra en el nombre de pila se sigue reportando', () => {
    expect(nivelDe(puntaje('Maria Lopez', 'MARIO LOPEZ'))).not.toBeNull();
  });

  it('un nombre contenido en otro más largo queda en MEDIA, no en ALTA', () => {
    expect(nivelDe(puntaje('Juan Perez', 'JUAN CARLOS PEREZ GOMEZ'))).toBe('MEDIA');
  });

  it('compartir una sola palabra genérica no alcanza', () => {
    expect(nivelDe(puntaje('Distribuidora del Norte SA',
                           'DISTRIBUIDORA E IMPORTADORA DE PRODUCTOS'))).toBeNull();
  });
});

// ── Identificador de la lista ─────────────────────────────────────────────
// Bug real: el identificador por defecto se derivaba del FORMATO, de modo que
// personas_repet.json y repet_entidades.json recibían ambos el id "repet" y el
// segundo reemplazaba al primero en silencio. Lo mismo con los dos de OFAC.
describe('identificador derivado del archivo', () => {
  // Misma derivación que aplica la vista de Screening
  function idDesdeArchivo(n) {
    return String(n || 'listado')
      .replace(/\.[^.]+$/, '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'listado';
  }

  const ARCHIVOS = ['personas_repet.json', 'repet_entidades.json',
                    'consolidatedLegacyByNAME.xml', 'sdn.csv', 'cons_prim.csv',
                    '20260805-FULL-1_0.csv'];

  it('los seis listados oficiales producen identificadores distintos', () => {
    const ids = ARCHIVOS.map(idDesdeArchivo);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('los dos archivos de REPET no colisionan', () => {
    expect(idDesdeArchivo('personas_repet.json'))
      .not.toBe(idDesdeArchivo('repet_entidades.json'));
  });

  it('los dos archivos de OFAC no colisionan', () => {
    expect(idDesdeArchivo('sdn.csv')).not.toBe(idDesdeArchivo('cons_prim.csv'));
  });

  it('produce identificadores válidos: minúsculas, sin acentos ni espacios', () => {
    ARCHIVOS.concat(['Listado Interno ñandú.csv']).forEach(f => {
      const id = idDesdeArchivo(f);
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(id.length).toBeGreaterThan(0);
      expect(id.length).toBeLessThanOrEqual(32);
    });
  });

  it('nunca devuelve cadena vacía', () => {
    expect(idDesdeArchivo('')).toBe('listado');
    expect(idDesdeArchivo('...')).toBe('listado');
    expect(idDesdeArchivo(null)).toBe('listado');
  });

  it('un mismo archivo recargado conserva su identificador, para poder actualizarlo', () => {
    // Cargar la versión nueva de un listado debe reemplazar a la anterior
    expect(idDesdeArchivo('personas_repet.json')).toBe(idDesdeArchivo('personas_repet.json'));
  });
});

// ── Tamaño del envío al servidor ──────────────────────────────────────────
// El SDN de OFAC son 19.321 entradas: 5,79 MB de JSON contra un límite de 4,5 MB
// de cuerpo en Vercel. El servidor rechazaba la carga con "No se pudo guardar la
// lista". Comprimido baja a 0,86 MB, y el servidor ya descomprime esa ruta.
describe('volumen de un listado grande', () => {
  function listaSintetica(n) {
    const entradas = [];
    for (let i = 0; i < n; i++) {
      entradas.push({
        nombre: 'ENTIDAD DE PRUEBA NUMERO ' + i + ' SOCIEDAD ANONIMA',
        doc: '', tipo: 'entidad', ref: String(i), aliasDe: '',
        detalle: 'Programa: CUBA · Observaciones extensas del organismo emisor '
               + 'que describen la designación y su fundamento normativo ' + i
      });
    }
    return { id: 'x', nombre: 'X', fuente: 'u', version: 'v', entradas: entradas };
  }

  it('un listado del tamaño del SDN excede el límite de cuerpo sin comprimir', () => {
    const bytes = JSON.stringify(listaSintetica(19321)).length;
    expect(bytes).toBeGreaterThan(4.5 * 1024 * 1024);
  });

  it('el detalle es la mayor parte del peso', () => {
    const l = listaSintetica(19321);
    const con = JSON.stringify(l).length;
    const sin = JSON.stringify({ ...l,
      entradas: l.entradas.map(e => ({ nombre:e.nombre, doc:e.doc, tipo:e.tipo, ref:e.ref, aliasDe:e.aliasDe })) }).length;
    expect(sin).toBeLessThan(con / 2);
  });

  it('un listado chico no necesita compresión', () => {
    expect(JSON.stringify(listaSintetica(500)).length).toBeLessThan(4.5 * 1024 * 1024);
  });
});
