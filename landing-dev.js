/* =========================================================
   landing-dev.js - datos extremos para probar GALERÍA y TESTIMONIOS (solo desarrollo)
   Se carga sola desde landing.js SOLO en localhost / file:// y con ?data=... en la URL:
     index.html?data=worst   peor caso realista (textos largos, emoji, HTML, imagen rota, sin alt, sin nombre)
     index.html?data=one     un solo elemento
     index.html?data=empty   listas vacías
     index.html?data=many    40 fotos y 24 testimonios
     (sin parámetro = datos reales de galeria-data.js y testimonios.js)
   Todos los textos de aquí son FALSOS y existen solo para estresar el diseño. No se muestran en producción.
   ========================================================= */
window.LANDING_DEV = function (render, original) {
  'use strict';

  const IMG = ['./assets/images/project-1.jpg', './assets/images/project-2.jpg', './assets/images/project-3.jpg'];
  const LARGO = 'Texto de prueba largo. '.repeat(40).trim();           // ~920 caracteres

  const FIXTURES = {
    demo: original,
    worst: {
      minimo: 0,
      galeria: [
        { src: IMG[0], alt: 'Placa base', caption: 'Proyecto final del curso de Programación Orientada a Objetos, Tecsup 2026 C24S A - 1, demostración en clase con el docente y los compañeros de sección' },
        { src: './assets/images/no-existe.jpg', alt: 'Imagen rota', caption: 'Imagen que no carga' },
        { src: IMG[2] },
        { src: IMG[1], alt: 'Código', caption: '🚀 Lanzamiento del proyecto final 🎉' },
        { caption: 'Pendiente con un título larguísimo para ver cómo se corta en la tesela pequeña de 320px' },
        { src: IMG[0], alt: 'x', caption: '<b>negrita</b> & "comillas" <img src=x onerror=alert(1)>' },
        { src: IMG[1], alt: 'Jo', caption: 'Jo' },
        { src: IMG[2], alt: 'Largo', caption: 'ProgramaciónOrientadaAObjetos_2026_C24S_A-1_entrega_final_v12_definitiva_ahora_si' },
        { src: IMG[0], alt: 'Muestra', caption: 'Con insignia', sample: true }
      ],
      testimonios: [
        { nombre: 'María de los Ángeles Fernández de la Cruz y Montalvo-Sánchez', rol: 'Docente', ciclo: 'Programación Orientada a Objetos · C24S A - 1 · Sección de la tarde y laboratorio', texto: LARGO },
        { nombre: 'Jo', rol: 'Compañero', ciclo: '', texto: 'Bien.' },
        { nombre: '😀 Luis', rol: 'Compañero', ciclo: 'C24S A - 1', texto: 'Probando emoji 🚀🔥 y HTML <script>alert(1)</script> &amp; "comillas".' },
        { nombre: '', rol: 'Docente', ciclo: 'C24S A - 1', texto: 'Sin nombre: debe verse el rol como título, sin guion suelto.' },
        { nombre: 'Nombre Apellido', rol: 'Compañero', ciclo: 'C24S A - 1', texto: 'Escríbeme a un-correo-extremadamente-largo-de-prueba@dominio-institucional-de-ejemplo.edu.pe para ver si se corta.' },
        { nombre: 'Rol largo', rol: 'Docente de Programación Orientada a Objetos y Base de Datos', texto: 'Rol más largo de lo normal y sin ciclo.' },
        { nombre: 'Sin texto', rol: 'Docente', texto: '' }        // se ignora: no hay testimonio sin texto
      ]
    },
    one: {
      minimo: 0,
      galeria: [{ src: IMG[0], alt: 'Imagen de prueba', caption: 'Una sola imagen' }],
      testimonios: [{ nombre: 'Nombre Apellido', rol: 'Compañero', ciclo: 'C24S A - 1', texto: 'Texto de prueba corto.' }]
    },
    empty: { minimo: 0, galeria: [], testimonios: [] },
    many: {
      minimo: 0,
      galeria: Array.from({ length: 40 }, (_, i) => (
        i % 7 === 6 ? { caption: 'Pendiente ' + (i + 1) } : { src: IMG[i % 3], alt: 'Imagen ' + (i + 1), caption: 'Imagen número ' + (i + 1) }
      )),
      testimonios: Array.from({ length: 24 }, (_, i) => ({
        nombre: 'Persona de prueba ' + (i + 1), rol: i % 4 === 0 ? 'Docente' : 'Compañero', ciclo: 'C24S A - 1', texto: 'Texto de prueba ' + (i + 1) + '. ' + 'Más texto. '.repeat(i % 12)
      }))
    }
  };

  const LABELS = [['demo', 'Demo data'], ['worst', 'Worst case'], ['empty', 'Empty'], ['one', 'One'], ['many', '40 / 24']];

  const apply = (name) => {
    const f = FIXTURES[name] || FIXTURES.demo;
    render(f.galeria, f.testimonios, f.minimo);
    document.querySelectorAll('.dev-toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.name === name)));
    try {
      const u = new URL(location.href);
      u.searchParams.set('data', name);
      history.replaceState(null, '', u);
    } catch (_) { /* file:// puede negarlo: no importa */ }
  };

  /* Control segmentado fijo abajo al centro: neutro a propósito (no es parte del diseño bajo prueba) */
  const style = document.createElement('style');
  style.textContent =
    '.dev-toggle{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:3000;display:flex;gap:2px;padding:3px;border-radius:999px;background:#3a3a3c;font:12px/1 system-ui,sans-serif;max-width:calc(100vw - 16px);overflow-x:auto}' +
    '.dev-toggle button{border:0;border-radius:999px;padding:8px 10px;background:transparent;color:#ddd;font:inherit;white-space:nowrap;cursor:pointer}' +
    '.dev-toggle button[aria-pressed="true"]{background:#fff;color:#111}';
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.className = 'dev-toggle';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Datos de prueba');
  LABELS.forEach(([name, text]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.name = name;
    b.textContent = text;
    b.addEventListener('click', () => apply(name));
    bar.appendChild(b);
  });
  document.body.appendChild(bar);

  apply(new URLSearchParams(location.search).get('data') || 'demo');
};
