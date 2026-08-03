// Coherencia lógica del conjunto de plazos.
//
// Estos tests NO validan que los números sean los legalmente correctos —para eso
// hace falta la resolución vigente—. Validan algo distinto y verificable sin
// ella: que el conjunto **encadene**. Un plazo de escalamiento posterior al de
// reporte es absurdo sin importar cuál sea el número legal: elevarías al comité
// para decidir un reporte cuyo plazo ya venció.
//
// Cada aserción lleva su justificación, porque el día que alguien cambie un
// valor y el test falle, va a necesitar saber por qué existía la regla.

import { describe, it, expect } from 'vitest';
import { SLA, DIAS_AVISO, antelacion } from '../src/lib/casos.js';
import { ACTUALIZACION_LEGAJO, VIGENCIA_DOCS, INSTITUCIONALES, DIAS_AVISO_VENC } from '../src/lib/vencimientos.js';
import { COMPORTAMIENTO } from '../src/lib/aml.js';
import { UMBRALES } from '../src/lib/screening.js';
import { GRAFO } from '../src/lib/grafo.js';

describe('SLA de casos — encadenamiento del proceso', () => {
  it('todos los plazos son enteros positivos', () => {
    Object.keys(SLA).forEach(k => {
      expect(Number.isInteger(SLA[k]), k + ' debe ser entero').toBe(true);
      expect(SLA[k], k + ' debe ser positivo').toBeGreaterThan(0);
    });
  });

  it('tomar el caso ocurre antes de elevarlo a comité', () => {
    // Si fuera al revés, un caso se elevaría antes de que alguien lo mire.
    expect(SLA.INICIO_ANALISIS).toBeLessThan(SLA.ESCALAMIENTO_COMITE);
  });

  it('la elevación a comité ocurre antes de que venza el plazo de reporte', () => {
    // El comité decide SI se reporta. Elevar después del vencimiento del plazo
    // de reporte convierte la decisión en un trámite sobre un incumplimiento ya
    // consumado.
    expect(SLA.ESCALAMIENTO_COMITE).toBeLessThan(SLA.ROS_CALIFICACION);
  });

  it('el plazo desde la calificación cabe dentro del tope desde la operación', () => {
    // El tope es un límite duro: si el plazo desde la calificación lo excediera,
    // calificar tarde permitiría reportar fuera del tope legítimamente.
    expect(SLA.ROS_CALIFICACION).toBeLessThan(SLA.ROS_MAX_OPERACION);
  });

  it('esperar la respuesta a un RFI no consume todo el plazo de reporte', () => {
    // Si el RFI tardara tanto como el plazo de reporte, al recibir la respuesta
    // ya no quedaría margen para analizarla y decidir.
    expect(SLA.RFI_RESPUESTA).toBeLessThan(SLA.ROS_CALIFICACION);
  });

  it('el plazo de financiamiento del terrorismo es más urgente que el general', () => {
    // FT tiene tratamiento agravado en todos los regímenes conocidos.
    expect(SLA.ROS_FT_HORAS).toBeLessThan(SLA.ROS_CALIFICACION * 24);
  });

  it('la antelación del aviso nunca iguala al plazo que vigila', () => {
    // Con un aviso igual o mayor al plazo, TODO nacería "próximo a vencer" y el
    // color dejaría de informar. La antelación escala con el plazo: para uno de
    // 2 días avisa el último día, para uno de 15 avisa 3 días antes.
    Object.keys(SLA).forEach(k => {
      if (k === 'ROS_FT_HORAS') return;   // está en horas, no en días
      const plazo = SLA[k];
      const a = antelacion(plazo);
      expect(a, k + ': la antelación no puede igualar al plazo').toBeLessThan(plazo);
      expect(a, k + ': debe haber al menos un día de aviso').toBeGreaterThanOrEqual(plazo > 1 ? 1 : 0);
    });
  });

  it('la antelación se comporta en los bordes', () => {
    expect(antelacion(1)).toBe(0);     // plazo de un día: verde hasta vencer
    expect(antelacion(2)).toBe(1);     // avisa el último día
    expect(antelacion(10)).toBe(3);    // tope de 3 días
    expect(antelacion(150)).toBe(3);   // no crece indefinidamente
    expect(antelacion(0)).toBe(0);
  });
});

describe('calendario regulatorio — coherencia', () => {
  it('a mayor riesgo, mayor frecuencia de actualización', () => {
    // Un cliente de riesgo ALTO no puede revisarse con menos frecuencia que uno
    // BAJO: invertiría el sentido del enfoque basado en riesgo.
    expect(ACTUALIZACION_LEGAJO['ALTO']).toBeLessThan(ACTUALIZACION_LEGAJO['MEDIO-ALTO']);
    expect(ACTUALIZACION_LEGAJO['MEDIO-ALTO']).toBeLessThan(ACTUALIZACION_LEGAJO['MEDIO']);
    expect(ACTUALIZACION_LEGAJO['MEDIO']).toBeLessThan(ACTUALIZACION_LEGAJO['BAJO']);
  });

  it('están cubiertos los cuatro segmentos del modelo de riesgo', () => {
    ['BAJO','MEDIO','MEDIO-ALTO','ALTO'].forEach(seg => {
      expect(ACTUALIZACION_LEGAJO[seg], 'falta el segmento ' + seg).toBeGreaterThan(0);
    });
  });

  it('la vigencia de todo documento es positiva y razonable', () => {
    Object.keys(VIGENCIA_DOCS).forEach(d => {
      expect(VIGENCIA_DOCS[d], d).toBeGreaterThan(0);
      // Más de 10 años equivale a "no vence"; si es así conviene sacarlo de la
      // lista en vez de poner un número enorme.
      expect(VIGENCIA_DOCS[d], d + ' — si no vence, quitarlo de VIGENCIA_DOCS').toBeLessThanOrEqual(120);
    });
  });

  it('la ventana de aviso cabe dentro del ciclo de actualización más corto', () => {
    const mesesMin = Math.min.apply(null, Object.values(ACTUALIZACION_LEGAJO));
    expect(DIAS_AVISO_VENC).toBeLessThan(mesesMin * 30);
  });

  it('las fechas institucionales son días de mes válidos', () => {
    INSTITUCIONALES.forEach(o => {
      expect(o.dia, o.id).toBeGreaterThanOrEqual(1);
      expect(o.dia, o.id + ' — un día > 28 no existe en todos los meses').toBeLessThanOrEqual(31);
      if (o.periodicidad === 'ANUAL') {
        expect(o.mes, o.id).toBeGreaterThanOrEqual(1);
        expect(o.mes, o.id).toBeLessThanOrEqual(12);
      }
      expect(typeof o.validado, o.id + ' debe declarar si está validado').toBe('boolean');
    });
  });

  it('cada obligación institucional declara su periodicidad', () => {
    INSTITUCIONALES.forEach(o => {
      expect(['ANUAL','MENSUAL'], o.id).toContain(o.periodicidad);
    });
  });
});

describe('umbrales de detección — coherencia', () => {
  it('el desvío que marca ALTA es mayor que el que marca MEDIA', () => {
    expect(COMPORTAMIENTO.DESVIO_VOLUMEN).toBeLessThan(COMPORTAMIENTO.DESVIO_VOLUMEN_ALTA);
  });

  it('la línea base necesita al menos dos períodos previos', () => {
    // Con uno solo no hay dispersión: cualquier variación parecería anomalía.
    expect(COMPORTAMIENTO.MIN_PERIODOS).toBeGreaterThanOrEqual(2);
    expect(COMPORTAMIENTO.MIN_PERIODOS).toBeLessThanOrEqual(COMPORTAMIENTO.VENTANA);
  });

  it('la concentración que dispara PAT-14 es una proporción posible', () => {
    expect(COMPORTAMIENTO.CONC_NUEVA).toBeGreaterThan(0);
    expect(COMPORTAMIENTO.CONC_NUEVA).toBeLessThanOrEqual(100);
  });

  it('los niveles de screening están ordenados y dentro de rango', () => {
    expect(UMBRALES.BAJA).toBeLessThan(UMBRALES.MEDIA);
    expect(UMBRALES.MEDIA).toBeLessThan(UMBRALES.ALTA);
    expect(UMBRALES.ALTA).toBeLessThanOrEqual(1);
    // Por debajo de 0.7 el ruido supera a la señal en nombres de personas.
    expect(UMBRALES.BAJA).toBeGreaterThanOrEqual(0.7);
  });

  it('el umbral de alerta del grafo no es menor que el de visualización', () => {
    expect(GRAFO.MIN_LEGAJOS_MOSTRAR).toBeLessThanOrEqual(GRAFO.MIN_LEGAJOS_ALERTA);
    // Una contraparte "compartida" exige al menos dos legajos.
    expect(GRAFO.MIN_LEGAJOS_MOSTRAR).toBeGreaterThanOrEqual(2);
  });
});

describe('trazabilidad de la validación normativa', () => {
  it('las fechas institucionales sin validar están marcadas como tales', () => {
    // No es un error que existan: es un error que se muestren como verificadas.
    const sinValidar = INSTITUCIONALES.filter(o => !o.validado);
    sinValidar.forEach(o => {
      expect(o.validado, o.id).toBe(false);
      expect(o.nota, o.id + ' debe explicar de qué obligación se trata').toBeTruthy();
    });
  });
});
