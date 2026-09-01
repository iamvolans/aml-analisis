// Firmas de los informes.
//
// Los informes se emiten para ser firmados, así que preimprimir el nombre en la
// línea de firma ahorra trabajo. Pero también compromete a esa persona: si el
// bloque del analista trajera siempre el mismo nombre, un informe trabajado por
// otro analista saldría atribuido a quien no lo hizo.
//
// De ahí la regla: el bloque del analista muestra a QUIEN GENERÓ el informe
// cuando su rol es de análisis, y recae en el responsable configurado solo
// cuando quien genera no pertenece al equipo de análisis.

import { describe, it, expect } from 'vitest';
import { FIRMANTES, firmanteAnalista, firmanteOC, firmanteResponsable } from '../src/lib/firmantes.js';
import { genLegajoCompleto, genInformeScreening, genInformeComite } from '../src/lib/reports.js';
import { rangoPeriodo, metricasComite } from '../src/lib/comite.js';
import { UMBRALES } from '../src/lib/screening.js';

describe('quién firma como analista', () => {
  it('firma el analista que generó el informe', () => {
    ['Samy Ariel Aizen', 'Héctor Dylan Neira', 'Federico Aizen'].forEach(n => {
      expect(firmanteAnalista({ nombre: n, rol: 'analista' }).nombre).toBe(n);
    });
  });

  it('un supervisor también firma con su propio nombre', () => {
    expect(firmanteAnalista({ nombre: 'Germán Alberto Pizzano', rol: 'supervisor' }).nombre)
      .toBe('Germán Alberto Pizzano');
  });

  it('si lo genera alguien ajeno al análisis, firma el responsable configurado', () => {
    expect(firmanteAnalista({ nombre: 'Axel Iván Sánchez', rol: 'oficial_cumplimiento' }).nombre)
      .toBe(FIRMANTES.analistaResponsable.nombre);
    expect(firmanteAnalista({ nombre: 'Alguien', rol: 'admin' }).nombre)
      .toBe(FIRMANTES.analistaResponsable.nombre);
  });

  it('un usuario dado de alta con el nombre del cargo no sirve como firma', () => {
    // En el sistema hay usuarios cuyo "nombre" es la denominación del puesto
    expect(firmanteAnalista({ nombre: 'Oficial de Cumplimiento', rol: 'analista' }).nombre)
      .toBe(FIRMANTES.analistaResponsable.nombre);
  });

  it('sin usuario recae en el responsable configurado', () => {
    expect(firmanteAnalista(null).nombre).toBe(FIRMANTES.analistaResponsable.nombre);
    expect(firmanteAnalista({}).nombre).toBe(FIRMANTES.analistaResponsable.nombre);
  });

  it('el Oficial de Cumplimiento es siempre el titular', () => {
    expect(firmanteOC().nombre).toBe('Axel Iván Sánchez');
    expect(firmanteOC().cargo).toBe('Oficial de Cumplimiento');
  });

  it('todos los firmantes declaran nombre y cargo', () => {
    Object.keys(FIRMANTES).forEach(k => {
      expect(FIRMANTES[k].nombre, k).toBeTruthy();
      expect(FIRMANTES[k].cargo, k).toBeTruthy();
    });
  });
});

describe('los informes salen firmados', () => {
  const leg = { id:'L1', razonSocial:'RABBLE S.A.', cuit:'30-71695295-5',
                segmento:'MEDIO-ALTO', estadoCuenta:'EN_ONBOARDING' };
  const hector = { nombre:'Héctor Dylan Neira', rol:'analista' };

  const informes = {
    'legajo completo': u => genLegajoCompleto({ legajo:leg, periodos:[], casos:[], rfis:[],
      screening:null, vencimientos:[], usuario:u, documentos:[] }),
    'screening': u => genInformeScreening({ legajo:leg, sujetos:[],
      listas:[{nombre:'REPET',cantidad:5}], hits:[], descartes:[], umbrales:UMBRALES, usuario:u }),
    'comité': u => genInformeComite({ metricas: metricasComite({ rango: rangoPeriodo('mes') }),
      usuario:u, notas:'' }),
  };

  Object.keys(informes).forEach(nombre => {
    it(nombre + ': lleva el nombre de quien lo generó y el del Oficial de Cumplimiento', () => {
      const html = informes[nombre](hector);
      expect(html, 'falta el analista').toContain('Héctor Dylan Neira');
      expect(html, 'falta el Oficial de Cumplimiento').toContain('Axel Iván Sánchez');
    });

    it(nombre + ': no atribuye la firma a un analista que no intervino', () => {
      const html = informes[nombre](hector);
      expect(html).not.toContain('Samy Ariel Aizen');
    });

    it(nombre + ': no deja líneas de firma sin nombre', () => {
      const html = informes[nombre](hector);
      // El patrón viejo era una línea de guiones seguida del cargo sin persona
      expect(html).not.toMatch(/_+<br\/><strong>Analista de Compliance<\/strong>/);
      expect(html).not.toMatch(/_+<br\/><strong>Oficial de Cumplimiento<\/strong>/);
    });
  });

  it('el informe de gestión reserva la segunda firma para el Comité', () => {
    const html = informes['comité'](hector);
    expect(html).toContain('Comité de Compliance');
    expect(html).toContain('Por acta de la sesión');
  });
});
