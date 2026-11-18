/* =========================================================
   galeria-data.js - imágenes de la sección GALERÍA (#gallery)
   Las pinta landing.js. Cada entrada:
     { src, alt, caption, sample }
       src      ruta de la imagen (./assets/images/...). Sin src = tesela "Foto pendiente".
       alt      descripción para lectores de pantalla (obligatoria si hay src).
       caption  texto corto debajo de la imagen (opcional).
       sample   true = imagen de muestra (se marca "Muestra" en la tesela).
   El orden de este arreglo es el orden en pantalla.
   ========================================================= */
window.GALERIA = [
  /* Las tres fotos de assets/images/project-N.jpg son imágenes genéricas de stock, no fotos de Angel.
     TODO: reemplazarlas por fotos reales (escritorio, laboratorio, proyectos en clase) y quitar `sample: true`. */
  { src: './assets/images/project-1.jpg', alt: 'Primer plano de una placa de circuitos con chips y condensadores', caption: 'Hardware', sample: true },
  { src: './assets/images/project-2.jpg', alt: 'Líneas de código PHP desenfocadas en una pantalla oscura', caption: 'Código', sample: true },
  { src: './assets/images/project-3.jpg', alt: 'Cielo nocturno lleno de estrellas', caption: 'Cielo nocturno', sample: true },

  /* TODO: fotos pendientes. Para llenar una, copia la imagen a assets/images/ y añade src y alt:
     { src: './assets/images/mi-foto.jpg', alt: 'Qué se ve en la foto', caption: 'Título corto' } */
  { caption: 'Mi espacio de estudio' },
  { caption: 'Proyecto en clase' },
  { caption: 'Mi mejor proyecto' }
];
