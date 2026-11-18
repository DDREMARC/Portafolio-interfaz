/* =========================================================
   testimonios.js - testimonios de la sección #testimonials
   Aquí SOLO van opiniones REALES de compañeros y docentes, con su permiso.
   No inventes citas ni nombres. Cada entrada:
     {
       nombre: 'Nombre y apellido',          // opcional pero recomendado
       rol:    'Compañero' | 'Docente',
       ciclo:  'C24S A - 1',                 // ciclo / sección (opcional)
       texto:  'Lo que dijo, tal cual.'      // obligatorio (sin texto = se ignora la entrada)
     }
   Ejemplo (NO descomentar con datos inventados):
     // { nombre: '...', rol: 'Docente', ciclo: '...', texto: '...' },
   La lista vacía muestra tarjetas "Pendiente: testimonio real".
   ========================================================= */
window.TESTIMONIOS = [
  /* TODO: pedir y pegar aquí los testimonios reales (README.md, sección "Testimonios"). */
];

/* Mínimo de tarjetas visibles: lo que falte se completa con "Pendiente: testimonio real".
   Cuando ya tengas todos los reales, pon 0 para ocultar los pendientes. */
window.TESTIMONIOS_MINIMO = 3;
