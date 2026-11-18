/* =========================================================
   fx-music.js - TiltedCard (React Bits) en JS vanilla
   Pinta las 5 canciones de window.TOP_SONGS (music-data.js) como tarjetas con
   inclinación 3D según el cursor, brillo (glare), sombra, parallax de la portada
   y caption flotante (título + artista) que sigue al puntero. Port del
   comportamiento de react-bits-kit/.../Components/TiltedCard con el mismo
   modelo de muelles amortiguados; sin flip/giroscopio (no hacen falta aquí).

   - Táctil (hover:none + pointer:coarse): tarjeta plana, sin tilt ni caption flotante
     (el título y el artista siguen visibles debajo de cada portada).
   - prefers-reduced-motion: sin inclinación, sin escala ni brillo; el caption sólo
     aparece/desaparece en su sitio.
   - Si window.TOP_SONGS no existe o está vacío se usan 5 entradas marcadas EJEMPLO.
   - Portada local (./assets/music/cover-N.jpg) o remota; si falla, degradado + nota.
   ========================================================= */
(() => {
  'use strict';

  const list = document.getElementById('music-list');
  if (!list) return;

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const reduced = () => mqReduce.matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- datos ---------- */
  const SAMPLE = [1, 2, 3, 4, 5].map((i) => ({
    title: 'EJEMPLO · Canción ' + i,
    artist: 'Artista de ejemplo',
    cover: '',   // sin portada: degradado de respaldo (no pide archivos que quizá no existan)
    url: 'https://music.youtube.com/'
  }));

  const isHttp = (u) => {
    try { const p = new URL(u, location.href).protocol; return p === 'https:' || p === 'http:'; }
    catch (_) { return false; }
  };
  const isSafeSrc = (u) => isHttp(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u);   // http(s) o ruta relativa; nunca javascript:/data: de terceros

  const clean = (raw) => (Array.isArray(raw) ? raw : [])
    .filter((s) => s && typeof s.title === 'string' && s.title.trim())
    .map((s) => ({
      title: String(s.title).trim(),
      artist: typeof s.artist === 'string' ? s.artist.trim() : '',
      cover: typeof s.cover === 'string' ? s.cover.trim() : '',
      url: typeof s.url === 'string' ? s.url.trim() : ''
    }))
    .slice(0, 5);

  let songs = clean(window.TOP_SONGS);
  const usingSample = songs.length === 0;
  if (usingSample) songs = SAMPLE;

  /* ---------- DOM ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const noteIcon = () => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'fx-tc__note');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    ['M9 18V5l12-2v13'].forEach((d) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
    [[6, 18], [18, 16]].forEach(([cx, cy]) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 3);
      svg.appendChild(c);
    });
    return svg;
  };

  // Degradados de respaldo (sin naranja dominante): azul, violeta, verde azulado, rosa, ámbar apagado
  const HUES = [222, 268, 176, 334, 38];
  // miniaturas de YouTube 4:3 (hqdefault/sddefault/default) traen barras negras arriba y abajo
  const LETTERBOX = /ytimg\.com\/.*\/(?:hq|sd)?default(?:_live)?\.(?:jpg|webp)/i;

  function buildSong(song, i) {
    const li = el('li', 'fx-song');
    const linked = isHttp(song.url);
    const link = el(linked ? 'a' : 'div', 'fx-song-link');
    if (linked) {
      link.href = song.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }

    const tc = el('div', 'fx-tc');
    const hue = HUES[i % HUES.length];
    tc.style.setProperty('--fx-a', 'hsl(' + hue + ' 62% 38% / 0.65)');
    tc.style.setProperty('--fx-b', 'hsl(' + ((hue + 38) % 360) + ' 45% 12%)');

    const shadow = el('div', 'fx-tc__shadow');
    shadow.setAttribute('aria-hidden', 'true');
    const body = el('div', 'fx-tc__body');
    const face = el('div', 'fx-tc__face');
    face.appendChild(noteIcon());

    if (song.cover && isSafeSrc(song.cover)) {
      const img = el('img', 'fx-tc__img');
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.draggable = false;
      img.referrerPolicy = 'no-referrer';
      if (LETTERBOX.test(song.cover)) img.setAttribute('data-letterbox', '');
      const fail = () => { img.remove(); face.classList.add('is-fallback'); };
      img.addEventListener('error', fail, { once: true });
      img.addEventListener('load', () => { if (!img.naturalWidth) fail(); else face.classList.add('has-cover'); }, { once: true });
      img.src = song.cover;
      face.appendChild(img);
    } else {
      face.classList.add('is-fallback');
    }

    ['glare', 'rim', 'edge'].forEach((k) => {
      const s = el('span', 'fx-tc__' + k);
      s.setAttribute('aria-hidden', 'true');
      face.appendChild(s);
    });
    const rank = el('span', 'fx-tc__rank', String(i + 1).padStart(2, '0'));
    rank.setAttribute('aria-hidden', 'true');
    face.appendChild(rank);
    body.appendChild(face);

    const caption = el('div', 'fx-tc__caption');
    caption.setAttribute('aria-hidden', 'true');
    caption.appendChild(el('b', null, song.title));
    if (song.artist) caption.appendChild(el('span', null, song.artist));

    tc.append(shadow, body, caption);

    const meta = el('span', 'fx-song-meta');
    meta.appendChild(el('span', 'fx-song-title', song.title));
    if (song.artist) meta.appendChild(el('span', 'fx-song-artist', song.artist));

    link.append(tc, meta);
    if (linked) link.appendChild(el('span', 'visually-hidden', ' (se abre en una pestaña nueva)'));
    li.appendChild(link);

    if (!coarse) attachTilt(tc, link, { body, shadow, caption });
    return li;
  }

  /* ---------- TiltedCard: muelles amortiguados (mismo modelo que el original) ---------- */
  const STEP = 1 / 240;
  const step = (st, key, target, omega, zeta, dt) => {
    const vk = 'v' + key;
    const n = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      st[vk] += (omega * omega * (target - st[key]) - 2 * zeta * omega * st[vk]) * h;
      st[key] += st[vk] * h;
    }
    const settled = Math.abs(target - st[key]) < 0.001 && Math.abs(st[vk]) < 0.01;
    if (settled) { st[key] = target; st[vk] = 0; }
    return !settled;
  };

  function attachTilt(root, link, parts) {
    const { body, shadow, caption } = parts;
    const AMP = 12, SCALE = 1.05, GLARE = 0.5, SHADOW = 0.5, PARALLAX = 1;
    const SMOOTH = 0.6;
    const omega = 20 * Math.pow(0.2, SMOOTH);
    const zeta = 1 - 0.3 * SMOOTH;

    const st = { rx: 0, vrx: 0, ry: 0, vry: 0, lift: 0, vlift: 0, shown: 0, vshown: 0, tip: 0, vtip: 0, tx: 8, ty: 8 };
    const ptr = { nx: 0, ny: 0, x: 0, y: 0, vx: 0, last: 0, inside: false };
    let raf = 0, lastT = 0, focused = false, boxW = 1, boxH = 1, capW = 0, capH = 0;

    const measure = () => {
      const r = root.getBoundingClientRect();
      boxW = Math.max(1, r.width); boxH = Math.max(1, r.height);
      capW = caption.offsetWidth; capH = caption.offsetHeight;
    };

    const frame = (now) => {
      raf = 0;
      const dt = clamp((now - lastT) / 1000 || 0, 0, 0.05);
      lastT = now;
      const rm = reduced();
      let busy = false;

      const hovering = ptr.inside;
      const lifted = hovering || focused ? 1 : 0;
      const amp = rm ? 0 : AMP;
      const inX = hovering ? ptr.nx : 0;
      const inY = hovering ? ptr.ny : 0;

      busy = step(st, 'rx', -inY * amp, omega, zeta, dt) || busy;
      busy = step(st, 'ry', inX * amp, omega, zeta, dt) || busy;
      busy = step(st, 'lift', rm ? 0 : lifted, omega, Math.max(zeta, 0.85), dt) || busy;
      busy = step(st, 'shown', lifted, 16, 1, dt) || busy;

      const scale = 1 + (SCALE - 1) * st.lift;
      const rxr = (st.rx * Math.PI) / 180;
      const ryr = (st.ry * Math.PI) / 180;
      body.style.transform = 'rotateX(' + st.rx.toFixed(3) + 'deg) rotateY(' + st.ry.toFixed(3) + 'deg) scale(' + scale.toFixed(4) + ')';
      body.style.setProperty('--tc-px', (Math.sin(ryr) * PARALLAX).toFixed(4));
      body.style.setProperty('--tc-py', (-Math.sin(rxr) * PARALLAX).toFixed(4));
      const reach = AMP;
      body.style.setProperty('--tc-gx', (50 + (st.ry / reach) * 46).toFixed(2) + '%');
      body.style.setProperty('--tc-gy', (50 - (st.rx / reach) * 46).toFixed(2) + '%');
      const energy = Math.min(1, Math.hypot(st.rx, st.ry) / reach);
      body.style.setProperty('--tc-glare', rm ? '0' : (GLARE * Math.max(st.lift, energy)).toFixed(3));

      // sombra desplazada según la inclinación
      const spread = scale * (0.86 + 0.04 * st.lift);
      shadow.style.transform = 'translate3d(' + (-Math.sin(ryr) * 22).toFixed(2) + 'px,' + (12 + 16 * st.lift + Math.sin(rxr) * 18).toFixed(2) + 'px,0) scale(' + spread.toFixed(4) + ')';
      shadow.style.opacity = (SHADOW * (0.6 + 0.4 * st.lift) * (rm ? 0 : Math.min(1, st.lift + energy))).toFixed(3);

      // caption: sigue al puntero (con balanceo por velocidad); con foco de teclado o reduced-motion queda fijo
      const follow = hovering && !rm;
      const tx = follow ? clamp(ptr.x + 14, 4, Math.max(4, boxW - capW - 4)) : 8;
      const ty = follow ? clamp(ptr.y + 18, 4, Math.max(4, boxH - capH - 4)) : 8;
      const f = rm ? 1 : 1 - Math.exp(-dt / 0.035);
      st.tx += (tx - st.tx) * f;
      st.ty += (ty - st.ty) * f;
      if (Math.abs(tx - st.tx) + Math.abs(ty - st.ty) > 0.2) busy = true; else { st.tx = tx; st.ty = ty; }
      ptr.vx *= Math.exp(-dt / 0.08);
      busy = step(st, 'tip', rm || !follow ? 0 : clamp(-ptr.vx * 0.012, -10, 10), 18, 0.62, dt) || busy;
      caption.style.transform = 'translate3d(' + st.tx.toFixed(1) + 'px,' + st.ty.toFixed(1) + 'px,0) rotate(' + st.tip.toFixed(2) + 'deg)';
      caption.style.opacity = Math.max(0, st.shown).toFixed(3);

      if (busy || hovering) raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); } };

    const locate = (e) => {
      const r = root.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      return { x, y, nx: clamp((x - r.width / 2) / (r.width / 2), -1, 1), ny: clamp((y - r.height / 2) / (r.height / 2), -1, 1) };
    };
    const track = (e) => {
      const p = locate(e);
      const now = performance.now();
      const el_ = Math.max(8, now - (ptr.last || now - 16)) / 1000;
      ptr.vx += ((p.x - ptr.x) / el_ - ptr.vx) * 0.5;
      ptr.last = now;
      ptr.x = p.x; ptr.y = p.y; ptr.nx = p.nx; ptr.ny = p.ny;
    };
    const isTouch = (e) => e.pointerType === 'touch';

    root.addEventListener('pointerenter', (e) => {
      if (isTouch(e)) return;
      measure();
      const p = locate(e);
      ptr.x = p.x; ptr.y = p.y; ptr.vx = 0;
      st.tx = clamp(p.x + 14, 4, Math.max(4, boxW - capW - 4));
      st.ty = clamp(p.y + 18, 4, Math.max(4, boxH - capH - 4));
      ptr.inside = true;
      track(e);
      wake();
    });
    root.addEventListener('pointermove', (e) => {
      if (isTouch(e)) return;
      if (!ptr.inside) { ptr.inside = true; measure(); }
      track(e);
      wake();
    });
    root.addEventListener('pointerleave', () => { ptr.inside = false; ptr.vx = 0; wake(); });
    root.addEventListener('pointercancel', () => { ptr.inside = false; wake(); });

    // Teclado: el foco levanta la tarjeta y muestra el caption fijo (sin seguir al puntero)
    link.addEventListener('focus', () => {
      try { focused = link.matches(':focus-visible'); } catch (_) { focused = true; }
      measure();
      wake();
    });
    link.addEventListener('blur', () => { focused = false; wake(); });
  }

  /* ---------- render ---------- */
  const frag = document.createDocumentFragment();
  songs.forEach((s, i) => frag.appendChild(buildSong(s, i)));
  list.textContent = '';
  list.appendChild(frag);
  list.setAttribute('aria-label', usingSample ? 'Canciones de ejemplo (EJEMPLO)' : 'Mis canciones más escuchadas');
  if (usingSample) list.setAttribute('data-sample', '');
})();
