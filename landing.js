/* =========================================================
   landing.js - secciones GALERÍA y TESTIMONIOS de la landing
   Vanilla JS, sin librerías. Todo el texto entra con textContent (nunca innerHTML):
   un nombre con <b>, comillas o emoji se muestra tal cual y no rompe nada.
   Orden de carga: galeria-data.js, testimonios.js, landing.js y DESPUÉS app.js,
   para que initReveal e initSpotlight (app.js) ya encuentren las tarjetas.
   Datos: window.GALERIA, window.TESTIMONIOS, window.TESTIMONIOS_MINIMO.
   Prueba de datos extremos (sólo en localhost/file://): index.html?data=worst | one | empty | many
   (carga landing-dev.js; en producción ese archivo no se sube y el parámetro no hace nada).
   ========================================================= */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  const mk = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null && text !== '') el.textContent = text;
    return el;
  };
  const icon = (id, cls) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  };

  /* Estado compartido entre la rejilla y el visor */
  const state = { photos: [] };

  /* =========================================================
     1. Galería
     ========================================================= */
  function normGallery(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((it) => it && typeof it === 'object')
      .map((it) => ({ src: str(it.src), alt: str(it.alt), caption: str(it.caption), sample: it.sample === true }));
  }

  function pendingTile(it) {
    const tile = mk('div', 'gallery-tile gallery-tile--pending glass');
    tile.append(icon('i-image', 'gallery-pending-icon'));
    tile.append(mk('span', 'gallery-pending-title', 'Foto pendiente'));
    if (it.caption) tile.append(mk('span', 'gallery-pending-cap', it.caption));
    return tile;
  }

  function renderGallery(list) {
    const grid = $('#gallery-grid');
    if (!grid) return;
    grid.replaceChildren();
    state.photos = [];
    const items = normGallery(list);
    /* Con n múltiplo de 3 la primera tesela ocupa 2x2 en 3 columnas y no quedan huecos */
    grid.classList.toggle('has-feature', items.length >= 3 && items.length % 3 === 0);

    if (!items.length) {
      const li = mk('li', 'gallery-empty glass');
      li.append(icon('i-image', 'gallery-pending-icon'));
      li.append(mk('h3', null, 'Aún no hay imágenes'));
      li.append(mk('p', null, 'Pronto habrá fotos de mi entorno de trabajo y de mis proyectos.'));
      grid.append(li);
      return;
    }

    items.forEach((it) => {
      const li = mk('li', 'gallery-item');
      if (!it.src) { li.append(pendingTile(it)); grid.append(li); return; }

      const photo = it;
      const index = state.photos.push(photo) - 1;
      const btn = mk('button', 'gallery-tile glass');
      btn.type = 'button';
      btn.dataset.index = String(index);
      btn.setAttribute('aria-label', 'Ampliar imagen: ' + (it.caption || it.alt || 'sin título'));

      const img = document.createElement('img');
      img.alt = '';                       // el nombre accesible lo da el aria-label del botón
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      img.addEventListener('error', () => {
        /* Imagen rota: la tesela pasa a "no disponible" y el visor la salta */
        photo.broken = true;
        btn.replaceChildren(icon('i-image', 'gallery-pending-icon'), mk('span', 'gallery-pending-title', 'Imagen no disponible'));
        if (it.caption) btn.append(mk('span', 'gallery-pending-cap', it.caption));
        btn.classList.add('gallery-tile--pending');
        btn.disabled = true;
      });
      img.src = it.src;
      btn.append(img);

      if (it.sample) btn.append(mk('span', 'gallery-badge', 'Muestra'));
      if (it.caption) {
        const cap = mk('span', 'gallery-cap');
        cap.append(mk('span', 'gallery-cap-text', it.caption));
        btn.append(cap);
      }
      li.append(btn);
      grid.append(li);
    });
  }

  /* ---------- Visor (lightbox) ---------- */
  function initLightbox() {
    const box = $('#gallery-lightbox');
    const grid = $('#gallery-grid');
    if (!box || !grid) return;
    const img = $('#gallery-lightbox-img', box);
    const cap = $('#gallery-lightbox-caption', box);
    const count = $('#gallery-lightbox-count', box);
    const err = $('#gallery-lightbox-error', box);
    const figure = $('.lb-figure', box);
    const btnPrev = $('[data-lb-prev]', box);
    const btnNext = $('[data-lb-next]', box);
    const root = document.documentElement;
    let cur = -1;
    let lastFocus = null;
    let prevOverflow = '';

    const isOpen = () => box.classList.contains('is-open');
    const focusables = () => $$('button:not([disabled])', box).filter((el) => el.getClientRects().length > 0);

    const show = (i) => {
      const p = state.photos[i];
      if (!p) return;
      cur = i;
      err.hidden = true;
      img.hidden = false;
      img.alt = p.alt || p.caption || '';
      img.onerror = () => { p.broken = true; img.hidden = true; err.hidden = false; };
      img.src = p.src;
      cap.textContent = p.caption ? p.caption + (p.sample ? ' (imagen de muestra)' : '') : (p.sample ? 'Imagen de muestra' : '');
      const total = state.photos.length;
      count.textContent = total > 1 ? (i + 1) + ' / ' + total : '';
      const many = total > 1;
      btnPrev.hidden = !many;
      btnNext.hidden = !many;
      /* precarga de la vecina siguiente */
      if (many) { const n = state.photos[(i + 1) % total]; if (n && !n.broken) new Image().src = n.src; }
    };

    const step = (dir) => {
      const n = state.photos.length;
      for (let k = 1; k <= n; k++) {
        const j = (((cur + dir * k) % n) + n) % n;
        if (!state.photos[j].broken) { show(j); return; }
      }
    };

    const open = (i, trigger) => {
      if (!state.photos[i]) return;
      lastFocus = trigger || document.activeElement;
      prevOverflow = root.style.overflow;
      root.style.overflow = 'hidden';
      box.classList.add('is-open');
      box.setAttribute('aria-hidden', 'false');
      show(i);
      const first = $('.modal-close', box);
      if (first) first.focus({ preventScroll: true });
    };

    const close = () => {
      if (!isOpen()) return;
      box.classList.remove('is-open');
      box.setAttribute('aria-hidden', 'true');
      root.style.overflow = prevOverflow;
      if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) {
        lastFocus.focus({ preventScroll: true });
      }
      lastFocus = null;
    };

    grid.addEventListener('click', (e) => {
      const tile = e.target.closest('.gallery-tile[data-index]');
      if (tile && !tile.disabled) open(parseInt(tile.dataset.index, 10), tile);
    });

    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-lb-close]')) { close(); return; }
      if (e.target.closest('[data-lb-prev]')) { step(-1); return; }
      if (e.target.closest('[data-lb-next]')) { step(1); }
    });

    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    });

    /* Deslizar en táctil: sólo gana el gesto claramente horizontal; el vertical queda del navegador (touch-action: pan-y) */
    if (figure) {
      let x0 = 0, y0 = 0, tracking = false;
      figure.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' || e.target.closest('button')) return;
        tracking = true; x0 = e.clientX; y0 = e.clientY;
      });
      figure.addEventListener('pointerup', (e) => {
        if (!tracking) return;
        tracking = false;
        const dx = e.clientX - x0;
        const dy = e.clientY - y0;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      });
      figure.addEventListener('pointercancel', () => { tracking = false; });
    }
  }

  /* =========================================================
     2. Testimonios
     ========================================================= */
  const PENDING_ROLES = ['Compañero', 'Compañero', 'Docente'];
  const LONG_TEXT = 260;     // por encima de esto se recorta a ~6 líneas con "Leer más"
  let uid = 0;

  function normTestimonials(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((t) => t && typeof t === 'object')
      .map((t) => ({ nombre: str(t.nombre), rol: str(t.rol), ciclo: str(t.ciclo), texto: str(t.texto) }))
      .filter((t) => t.texto);   // sin texto no hay testimonio
  }

  /* Iniciales por grafemas (no por unidades UTF-16): "Jo" -> "J", "Ana María Pérez" -> "AP", "😀 Luis" -> "😀L" */
  function initials(name) {
    const words = name.split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const first = (w) => {
      if (window.Intl && Intl.Segmenter) {
        const it = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(w)[Symbol.iterator]().next();
        return it.done ? '' : it.value.segment;
      }
      return Array.from(w)[0] || '';
    };
    return (first(words[0]) + (words.length > 1 ? first(words[words.length - 1]) : '')).toUpperCase();
  }

  function testiCard(t, pendingRole) {
    const pending = !!pendingRole;
    const li = mk('li', 'testi-card glass' + (pending ? ' is-pending' : ''));
    li.append(icon('i-quote', 'testi-quote'));

    const quote = mk('blockquote', 'testi-text');
    if (pending) {
      quote.append(mk('p', 'testi-pending-title', 'Pendiente: testimonio real'));
      quote.append(mk('p', 'testi-pending-hint', 'Aquí irá la opinión de un ' + pendingRole.toLowerCase() + ' de Tecsup, con su permiso.'));
      li.append(quote);
    } else {
      const long = t.texto.length > LONG_TEXT;
      const p = mk('p', long ? 'is-clamped' : null, t.texto);
      p.id = 'testi-text-' + (++uid);
      quote.append(p);
      li.append(quote);
      if (long) {
        const more = mk('button', 'testi-more', 'Leer más');
        more.type = 'button';
        more.setAttribute('aria-expanded', 'false');
        more.setAttribute('aria-controls', p.id);
        more.addEventListener('click', () => {
          const open = more.getAttribute('aria-expanded') !== 'true';
          more.setAttribute('aria-expanded', open ? 'true' : 'false');
          more.textContent = open ? 'Leer menos' : 'Leer más';
          p.classList.toggle('is-clamped', !open);
        });
        li.append(more);
      }
    }

    const meta = mk('footer', 'testi-meta');
    const av = mk('span', 'avatar', pending ? '' : initials(t.nombre));
    av.setAttribute('aria-hidden', 'true');
    if (pending || !av.textContent) av.append(icon('i-user'));
    meta.append(av);

    const who = mk('div', 'testi-who');
    const sub = pending ? 'Nombre y ciclo por confirmar' : [t.nombre ? t.rol : '', t.ciclo].filter(Boolean).join(' · ');
    const main = pending ? pendingRole : (t.nombre || t.rol);
    if (main) who.append(mk('strong', 'testi-name', main));
    if (sub) who.append(mk('span', 'testi-sub mono-tag', sub));
    meta.append(who);
    li.append(meta);
    return li;
  }

  function renderTestimonials(list, minimo) {
    const ul = $('#testimonials-list');
    if (!ul) return;
    ul.replaceChildren();
    const real = normTestimonials(list);
    const min = Number.isFinite(minimo) ? Math.max(0, Math.min(12, Math.floor(minimo))) : 3;
    real.forEach((t) => ul.append(testiCard(t, null)));
    for (let i = 0; i < Math.max(0, min - real.length); i++) {
      ul.append(testiCard(null, PENDING_ROLES[i % PENDING_ROLES.length]));
    }
    if (!ul.children.length) {
      /* Sin testimonios y sin mínimo: nunca dejar el título solo, sin nada debajo */
      const li = mk('li', 'testi-empty glass');
      li.append(icon('i-quote', 'gallery-pending-icon'));
      li.append(mk('h3', null, 'Aún no hay testimonios'));
      li.append(mk('p', null, 'Cuando mis compañeros y docentes compartan su opinión, aparecerá aquí.'));
      ul.append(li);
    }
  }

  /* =========================================================
     3. Arranque (y gancho de pruebas locales)
     ========================================================= */
  function renderAll() {
    renderGallery(window.GALERIA);
    renderTestimonials(window.TESTIMONIOS, window.TESTIMONIOS_MINIMO);
  }

  function boot() {
    initLightbox();
    renderAll();

    /* Datos extremos: sólo en local y con ?data=... (landing-dev.js no se sube a producción) */
    const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (local && new URLSearchParams(location.search).has('data')) {
      const s = document.createElement('script');
      s.src = './landing-dev.js';
      s.onload = () => {
        if (typeof window.LANDING_DEV === 'function') {
          window.LANDING_DEV((galeria, testimonios, minimo) => {
            renderGallery(galeria);
            renderTestimonials(testimonios, minimo);
          }, { galeria: window.GALERIA, testimonios: window.TESTIMONIOS, minimo: window.TESTIMONIOS_MINIMO });
        }
      };
      document.head.appendChild(s);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
