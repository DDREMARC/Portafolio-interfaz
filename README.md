# Portafolio DREMARC - landing

Landing de una sola página (HTML, CSS y JavaScript sin frameworks) con formulario de contacto en PHP.

## Estructura

- `index.html`, `styles.css`, `landing.css`, `landing.js`, `app.js`: página y estilos.
- `galeria-data.js`: fotos de la galería.
- `testimonios.js`: testimonios de la sección Testimonios.
- `fx-*.js/css`, `music-data.js`, `vendor/`, `assets/`: efectos, música y recursos.
- `contacto.php`: recibe el formulario (solo POST) y responde JSON.
- `config.sample.php`: plantilla de configuración. Copiala como `config.php`.
- `mensajes/`: guarda `contacto.log` y los contadores del límite por IP. Protegida con `.htaccess`.

## Subir a InfinityFree

1. En el panel de InfinityFree, entra al Administrador de archivos (o usa FTP) y abre `htdocs`.
2. Sube todos los archivos del proyecto a `htdocs` (sin `.git`).
3. Copia `config.sample.php` como `config.php` (en el mismo lugar) y edita:
   - `destino`: tu correo real (el que recibe los mensajes).
   - `remitente`: `no-reply@TU-DOMINIO.epizy.com` (tu dominio de InfinityFree).
4. Revisa que `mensajes/` exista y tenga permisos de escritura (si no, el log y el límite no funcionan).
5. Prueba el formulario desde la URL real del sitio. No lo pruebes abriendo el archivo con doble clic: no hay PHP.

`config.php` no se sube a GitHub (está en `.gitignore`). Solo vive en el servidor.

## Subir a GitHub

```
git add .
git commit -m "Landing y formulario de contacto"
git remote add origin https://github.com/DDREMARC/NOMBRE-DEL-REPO.git
git push -u origin main
```

Antes de hacer `git add`, revisa que `config.php` no aparezca en `git status`.

## Testimonios

Abre `testimonios.js` y pon las opiniones dentro de `window.TESTIMONIOS`. Cada una tiene `nombre`, `rol` (Compañero o Docente), `ciclo` y `texto`. Solo opiniones reales y con permiso de quien las dijo. Si todavía no hay reales, deja la lista vacía: se muestran tarjetas "Pendiente". Cuando tengas todas, cambia `TESTIMONIOS_MINIMO` a 0.

## Qué falta

- Correo destino real en `config.php`.
- Testimonios reales en `testimonios.js`.
- Imágenes de la galería en `galeria-data.js`.
- URL final de InfinityFree (para enlaces y para probar el envío).
- Probar el envío de correo real en el servidor (en local no se puede).
