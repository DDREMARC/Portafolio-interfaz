/* =========================================================
   fx-text.js — efectos de texto y borde, JS nativo sin dependencias.
   Port a vanilla de React Bits (react-bits-kit/source/src/content):
     1. RotatingText  (hero .hero-sub, con resaltado naranja #f97316)
     2. ScrambledText (cita de About, reacciona al cursor)
     3. Shuffle       (nombre del hero, #hero-name)
     4. LetterGlitch  (fondo tenue del panel .security-panel)
     5. StarBorder    (botones .btn-primary)
   GlareHover (credencial) es sólo CSS: ver fx-text.css.
   Se carga después de app.js y no lo modifica: al arrancar sustituye el
   typewriter de .hero-sub (app.js no encuentra #typewriter y sale solo).
   prefers-reduced-motion: texto estático, un solo cuadro en LetterGlitch y
   sin StarBorder. Los efectos de puntero no se activan en pantallas táctiles.
   ========================================================= */
(() => {
  'use strict';

  /* ---------- utilidades ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = () => mqReduce.matches;
  const fine = () => mqFine.matches;
  const listen = (mq, fn) => {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  };
  const safe = (name, fn) => {
    try { return fn(); } catch (err) { console.warn('[fx-text] ' + name + ' falló:', err); }
    return undefined;
  };
  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const srOnly = (text) => make('span', 'fx-sr', text);
  const pick = (str) => str.charAt(Math.floor(Math.random() * str.length));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const segmenter = window.Intl && Intl.Segmenter ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null;
  const graphemes = (t) => (segmenter ? Array.from(segmenter.segment(t), (s) => s.segment) : Array.from(t));

  /** Ejecuta cb cuando las fuentes web terminaron (o tras 1.5 s como máximo). */
  function whenFonts(cb) {
    if (!document.fonts || !document.fonts.ready) { cb(); return; }
    let done = false;
    const go = () => { if (!done) { done = true; cb(); } };
    document.fonts.ready.then(go, go);
    setTimeout(go, 1500);
  }

  /** Ejecuta cb cuando el preloader de app.js empieza a salir (+ delay ms). */
  function afterPreloader(cb, delay = 0) {
    const pre = $('#preloader');
    const gone = () => !pre || pre.hidden || pre.classList.contains('is-hidden');
    if (gone()) { setTimeout(cb, delay); return; }
    let done = false;
    let mo = null;
    let timer = 0;
    const go = () => {
      if (done) return;
      done = true;
      if (mo) mo.disconnect();
      clearTimeout(timer);
      setTimeout(cb, delay);
    };
    if ('MutationObserver' in window) {
      mo = new MutationObserver(() => { if (gone()) go(); });
      mo.observe(pre, { attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    timer = setTimeout(go, 4000);
  }

  /** #rrggbb -> '#0b0b0c' o '#ffffff' según luminancia (misma regla que RotatingText). */
  function readableText(color) {
    const m = String(color || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return '#0b0b0c';
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    const lin = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] > 0.3 ? '#0b0b0c' : '#ffffff';
  }

  /* =========================================================
     1. RotatingText — .hero-sub[data-rotating]
        Datos en el propio HTML: data-rotating-prefix, -texts (JSON),
        -color. La frase actual se escribe en un <span class="fx-sr">;
        el texto visible va con aria-hidden. Efecto "slide" por letra
        (sube desde abajo, sale hacia arriba, modo "wait").
     ========================================================= */
  function initRotatingText() {
    const host = $('.hero-sub[data-rotating]');
    if (!host || host.classList.contains('fx-rot-host')) return;
    let texts = [];
    try { texts = JSON.parse(host.dataset.rotatingTexts || '[]'); } catch (_) { texts = []; }
    texts = texts.filter((t) => typeof t === 'string' && t.trim());
    if (!texts.length) return;                       // sin datos: queda el typewriter original
    const prefix = (host.dataset.rotatingPrefix || '').trim();
    const color = host.dataset.rotatingColor || '#f97316';
    const INTERVAL = Math.max(1500, Number(host.dataset.rotatingInterval) || 2600);
    const STAGGER = 12;           // ms entre letras
    const STAGGER_MAX = 300;

    const pill = make('span', 'fx-rot-pill');
    pill.style.setProperty('--fx-rot-bg', color);
    pill.style.setProperty('--fx-rot-fg', readableText(color));
    const sr = srOnly(texts[0]);
    const content = make('span', 'fx-rot-content');
    content.setAttribute('aria-hidden', 'true');
    pill.append(sr, content);

    // Sustituye de forma limpia el typewriter (#typewriter y su .caret): app.js ya no lo encuentra.
    host.replaceChildren(...(prefix ? [make('span', 'fx-rot-prefix', prefix)] : []), pill);
    host.classList.add('fx-rot-host');

    let index = 0;
    let chars = [];
    let timer = 0;
    let onScreen = true;

    const buildLine = (text) => {
      const line = make('span', 'fx-rot-line');
      const list = [];
      const words = text.split(' ');
      words.forEach((word, wi) => {
        const w = make('span', 'fx-rot-word');
        graphemes(word).forEach((g) => { const c = make('span', 'fx-rot-char', g); list.push(c); w.append(c); });
        if (wi < words.length - 1) w.append(make('span', 'fx-rot-space', ' '));
        line.append(w);
      });
      return { line, list };
    };
    const delayOf = (i) => Math.min(i * STAGGER, STAGGER_MAX);
    const animIn = (list) => list.map((c, i) => c.animate(
      [{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 520, delay: delayOf(i), easing: 'cubic-bezier(0.34, 1.35, 0.64, 1)', fill: 'both' }
    ));
    const animOut = (list) => list.map((c, i) => c.animate(
      [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-120%)', opacity: 0 }],
      { duration: 300, delay: delayOf(i), easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'both' }
    ));

    const fit = () => { pill.style.width = (content.offsetWidth + 1) + 'px'; };
    const mount = (i, animate) => {
      const b = buildLine(texts[i]);
      content.replaceChildren(b.line);
      chars = b.list;
      sr.textContent = texts[i];
      if (animate) animIn(chars);
    };

    const schedule = (ms) => {
      clearTimeout(timer);
      if (reduced()) { timer = 0; return; }
      timer = setTimeout(step, ms);
    };
    function step() {
      timer = 0;
      if (reduced()) return;
      if (!onScreen || document.hidden) { schedule(500); return; }
      const outs = animOut(chars);
      const last = outs[outs.length - 1];
      const next = () => {
        index = (index + 1) % texts.length;
        mount(index, !reduced());
        schedule(INTERVAL + 450);
      };
      if (last && last.finished) last.finished.then(next, next); else next();
    }

    mount(0, false);
    fit();
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(content);
    requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.add('is-ready')));

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => { onScreen = entries.some((e) => e.isIntersecting); }).observe(host);
    }
    afterPreloader(() => schedule(INTERVAL), 500);
    listen(mqReduce, () => {
      if (reduced()) {
        clearTimeout(timer); timer = 0;
        content.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        mount(index, false);                          // texto estático, sin animación
      } else {
        schedule(INTERVAL);
      }
    });
  }

  /* =========================================================
     2. ScrambledText — .about-copy .quote
        Cada letra va en su celda; al mover el cursor (ratón/lápiz) las
        letras a menos de RADIUS px se revuelven con "." y ":" y vuelven
        solas; un clic lanza una onda. Al entrar en pantalla se
        "descifra" una vez. aria-label + copia .fx-sr con el texto real.
     ========================================================= */
  function initScrambledText() {
    $$('.about-copy .quote').forEach((root) => safe('scrambled', () => scrambledText(root)));
  }

  function scrambledText(root) {
    const RADIUS = 90, DURATION = 900, CHARS = '.:', INTRO = 1100;
    const original = Array.from(root.childNodes);
    const text = root.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    let glyphs = null;
    let raf = 0;
    let io = null;
    let moveFrame = 0;
    let lastEv = null;

    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
    function tick(now) {
      raf = 0;
      let alive = false;
      for (const g of glyphs) {
        if (!g.until) continue;
        alive = true;
        if (now < g.start) continue;
        if (now >= g.until) {
          g.until = 0; g.start = 0;
          g.node.textContent = g.ch;
          g.node.classList.remove('is-scr');
          continue;
        }
        if (now >= g.next) {
          g.node.textContent = pick(CHARS);
          g.node.classList.add('is-scr');
          g.next = now + 55 + Math.random() * 45;
        }
      }
      if (alive) raf = requestAnimationFrame(tick);
    }
    const centers = () => glyphs.map((g) => {
      const r = g.cell.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    });

    const onMove = (e) => {
      if (reduced() || e.pointerType === 'touch') return;
      lastEv = e;
      if (moveFrame) return;
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        if (!glyphs || !lastEv) return;
        const now = performance.now();
        const pts = centers();
        glyphs.forEach((g, i) => {
          const d = Math.hypot(lastEv.clientX - pts[i][0], lastEv.clientY - pts[i][1]);
          if (d >= RADIUS) return;
          const until = now + DURATION * (1 - d / RADIUS);
          if (until > g.until) { g.until = until; g.start = Math.min(g.start || now, now); if (!g.next || g.next > now) g.next = now; }
        });
        wake();
      });
    };
    const onDown = (e) => {
      if (reduced() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const now = performance.now();
      const pts = centers();
      glyphs.forEach((g, i) => {
        const d = Math.hypot(e.clientX - pts[i][0], e.clientY - pts[i][1]);
        g.start = now + d * 0.9;
        g.until = g.start + 420;
        g.next = g.start;
      });
      wake();
    };

    const on = () => {
      if (glyphs || reduced()) return;
      const vis = make('span', 'fx-sc');
      vis.setAttribute('aria-hidden', 'true');
      glyphs = [];
      const words = text.split(' ');
      words.forEach((word, wi) => {
        const w = make('span', 'fx-sc-word');
        graphemes(word).forEach((ch) => {
          const cell = make('span', 'fx-sc-char');
          const node = make('span', 'fx-sc-glyph', ch);
          cell.append(make('span', 'fx-sc-size', ch), node);
          w.append(cell);
          glyphs.push({ ch, node, cell, start: 0, until: 0, next: 0 });
        });
        vis.append(w);
        if (wi < words.length - 1) vis.append(document.createTextNode(' '));
      });
      root.setAttribute('aria-label', text);        // blockquote admite nombre accesible
      root.replaceChildren(srOnly(text), vis);
      root.addEventListener('pointermove', onMove);
      root.addEventListener('pointerdown', onDown);
      if ('IntersectionObserver' in window) {
        io = new IntersectionObserver((entries) => {
          if (!entries.some((en) => en.isIntersecting) || !glyphs) return;
          io.disconnect(); io = null;
          const now = performance.now();
          glyphs.forEach((g, i) => {
            g.start = now;
            g.next = now;
            g.until = now + 150 + INTRO * (0.75 * (i / glyphs.length) + 0.25 * Math.random());
          });
          wake();
        }, { threshold: 0.6 });
        io.observe(root);
      }
    };
    const off = () => {
      if (!glyphs) return;
      cancelAnimationFrame(raf); raf = 0;
      cancelAnimationFrame(moveFrame); moveFrame = 0;
      if (io) { io.disconnect(); io = null; }
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerdown', onDown);
      root.removeAttribute('aria-label');
      root.replaceChildren(...original);
      glyphs = null;
    };

    whenFonts(() => { if (!reduced()) on(); });
    listen(mqReduce, () => { if (reduced()) off(); else on(); });
  }

  /* =========================================================
     3. Shuffle — #hero-name
        Cada letra en una celda con overflow:hidden durante la animación;
        una tira [letra, letras al azar del propio nombre, letra] se
        desliza hacia la derecha (modo evenodd: primero las impares).
        Se arma bajo el preloader y suena al salir; se repite al pasar
        el ratón. Usa la API de animaciones web (sin GSAP).
     ========================================================= */
  function initShuffle() {
    const name = $('#hero-name');
    if (!name || name.querySelector('.fx-sh')) return;
    const h1 = name.closest('h1');
    const h1Label = h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : '';
    const text = name.textContent.trim();
    if (!text) return;
    const original = Array.from(name.childNodes);
    const charset = Array.from(new Set(text.replace(/\s/g, ''))).join('');
    const DURATION = 520, STAGGER = 45, ROLLS = 2;
    let cells = null;
    let playing = false;

    const on = () => {
      if (cells || reduced()) return;
      const vis = make('span', 'fx-sh');
      vis.setAttribute('aria-hidden', 'true');
      cells = graphemes(text).map((ch) => {
        const wrap = make('span', 'fx-sh-cell');
        const inner = make('span', 'fx-sh-inner');
        const orig = make('span', 'fx-sh-char', ch);
        inner.append(orig);
        wrap.append(inner);
        vis.append(wrap);
        return { wrap, inner, orig, ch };
      });
      if (h1 && h1Label) h1.setAttribute('aria-label', h1Label);
      name.replaceChildren(srOnly(text), vis);
    };
    const off = () => {
      if (!cells) return;
      cells.forEach((c) => c.inner.getAnimations().forEach((a) => a.cancel()));
      name.replaceChildren(...original);
      if (h1) h1.removeAttribute('aria-label');
      cells = null;
      playing = false;
    };

    const play = () => {
      if (!cells || playing || reduced()) return;
      playing = true;
      const widths = cells.map((c) => c.wrap.getBoundingClientRect().width);   // todas las lecturas antes de escribir
      const n = cells.length;
      const oddCount = Math.floor(n / 2);
      const evenStart = oddCount ? (DURATION + Math.max(0, oddCount - 1) * STAGGER) * 0.7 : 0;
      let left = n;
      cells.forEach((c, i) => {
        const w = widths[i];
        const strip = [c.orig];
        for (let k = 0; k < ROLLS; k++) strip.push(make('span', 'fx-sh-char', pick(charset)));
        strip.push(make('span', 'fx-sh-char', c.ch));
        strip.forEach((s) => { s.style.width = w + 'px'; });
        c.wrap.style.width = w + 'px';
        c.wrap.classList.add('is-running');
        c.inner.replaceChildren(...strip);
        const span = (ROLLS + 1) * w;
        const delay = i % 2 === 1 ? Math.floor(i / 2) * STAGGER : evenStart + (i / 2) * STAGGER;
        const anim = c.inner.animate(
          [{ transform: 'translateX(' + (-span) + 'px)' }, { transform: 'translateX(0)' }],
          { duration: DURATION, delay, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)', fill: 'both' }
        );
        const settle = () => {
          anim.cancel();
          c.orig.style.width = '';
          c.inner.replaceChildren(c.orig);
          c.wrap.style.width = '';
          c.wrap.classList.remove('is-running');
          if (--left === 0) playing = false;
        };
        anim.finished.then(settle, settle);
      });
    };

    whenFonts(() => {
      on();
      afterPreloader(play, 250);
    });
    name.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && fine()) play(); });
    listen(mqReduce, () => { if (reduced()) off(); else on(); });
  }

  /* =========================================================
     4. LetterGlitch — canvas dentro de .security-panel
        Rejilla de letras monoespaciadas; ~3% cambia de letra y color cada
        50 ms con transición suave. Colores apagados (grises y naranja
        oscuro). Sólo se repinta lo que cambia. Se pausa fuera de pantalla
        y con la pestaña oculta. Con reduced-motion dibuja 1 cuadro.
     ========================================================= */
  function initLetterGlitch() {
    const panel = $('.security-panel');
    if (!panel || panel.querySelector('.fx-glitch')) return;
    const canvas = make('canvas', 'fx-glitch');
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    panel.insertBefore(canvas, panel.firstChild);

    const FONT_PX = 12, CW = 9, CH = 16, STEP_MS = 50, GLITCH_RATE = 0.03, FADE_MS = 420;
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789';
    // Grises (mayoría) y naranja oscuro (poco): el canvas entero va además a opacity .5 en CSS
    const COLORS = [
      [39, 39, 42], [39, 39, 42], [52, 52, 58], [52, 52, 58], [63, 63, 70],
      [82, 82, 91], [113, 113, 122], [124, 45, 18], [154, 52, 18]
    ];
    let cols = 0, rows = 0, total = 0, dpr = 1;
    let chr = [], cur = null, from = null, to = null, prog = null;
    let active = new Set();
    let visible = true;
    let raf = 0, last = 0, acc = 0;

    const font = () => FONT_PX + 'px "JetBrains Mono", ui-monospace, "Cascadia Code", Consolas, monospace';
    const drawCell = (i) => {
      const x = (i % cols) * CW, y = Math.floor(i / cols) * CH;
      ctx.clearRect(x, y, CW, CH);
      ctx.fillStyle = 'rgb(' + (cur[i * 3] | 0) + ',' + (cur[i * 3 + 1] | 0) + ',' + (cur[i * 3 + 2] | 0) + ')';
      ctx.fillText(chr[i], x + 1, y + 2);
    };
    const drawAll = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cols * CW, rows * CH);
      ctx.font = font();
      ctx.textBaseline = 'top';
      for (let i = 0; i < total; i++) drawCell(i);
    };
    const layout = () => {
      const w = panel.clientWidth, h = panel.clientHeight;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.ceil(w * dpr);
      canvas.height = Math.ceil(h * dpr);
      cols = Math.ceil(w / CW); rows = Math.ceil(h / CH); total = cols * rows;
      chr = new Array(total);
      cur = new Float32Array(total * 3); from = new Float32Array(total * 3); to = new Float32Array(total * 3);
      prog = new Float32Array(total).fill(1);
      active = new Set();
      for (let i = 0; i < total; i++) {
        chr[i] = pick(CHARS);
        const c = COLORS[Math.floor(Math.random() * COLORS.length)];
        cur.set(c, i * 3); to.set(c, i * 3);
      }
      drawAll();
    };

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden || reduced() || !total) return;
      const dt = Math.min(100, now - (last || now));
      last = now;
      acc += dt;
      if (acc >= STEP_MS) {
        acc = 0;
        const n = Math.max(1, Math.round(total * GLITCH_RATE));
        for (let k = 0; k < n; k++) {
          const i = Math.floor(Math.random() * total);
          chr[i] = pick(CHARS);
          const c = COLORS[Math.floor(Math.random() * COLORS.length)];
          from.set(cur.subarray(i * 3, i * 3 + 3), i * 3);
          to.set(c, i * 3);
          prog[i] = 0;
          active.add(i);
        }
      }
      if (active.size) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = font();
        ctx.textBaseline = 'top';
        active.forEach((i) => {
          prog[i] = Math.min(1, prog[i] + dt / FADE_MS);
          const t = prog[i];
          for (let k = 0; k < 3; k++) cur[i * 3 + k] = lerp(from[i * 3 + k], to[i * 3 + k], t);
          drawCell(i);
          if (t >= 1) active.delete(i);
        });
      }
      raf = requestAnimationFrame(frame);
    }
    const wake = () => {
      if (raf || !visible || document.hidden || reduced() || !total) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    layout();
    if ('ResizeObserver' in window) {
      let pending = 0;
      new ResizeObserver(() => {
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => { layout(); wake(); });
      }).observe(panel);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) wake();
      }).observe(panel);
    }
    document.addEventListener('visibilitychange', wake);
    listen(mqReduce, () => { if (reduced()) { cancelAnimationFrame(raf); raf = 0; drawAll(); } else wake(); });
    whenFonts(() => { drawAll(); wake(); });       // vuelve a pintar con la fuente web ya cargada
  }

  /* =========================================================
     5. StarBorder — .btn-primary
        Canvas por botón (BLEED px de margen) con dos estrellas que
        orbitan el contorno redondeado con estela y brillo (blend
        "lighter"). Al pasar el cursor da una vuelta extra. Naranja
        moderado: cabeza #FED7AA, cola #F97316. Se pausa fuera de
        pantalla; no se crea con reduced-motion ni en táctil.
     ========================================================= */
  function initStarBorder() {
    const BLEED = 48, TAU = Math.PI * 2, LAP = 0.9;
    const DURATION = 4.4, THICK = 2, GLOW = 0.6, STARS = 2, TRAIL = 0.3;
    const HEAD = [254, 215, 170], TAIL = [249, 115, 22], WHITE = [255, 255, 255];
    const wrap = (v, t) => ((v % t) + t) % t;
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const rgba = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + clamp(a, 0, 1).toFixed(3) + ')';
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const outline = (w, h, r0) => {
      const r = Math.max(0, Math.min(r0, w / 2, h / 2));
      const arc = (Math.PI * r) / 2, across = Math.max(0, w - 2 * r), down = Math.max(0, h - 2 * r);
      const segs = [
        { len: across, x: r, y: 0, dx: 1, dy: 0, ang: null },
        { len: arc, x: w - r, y: r, dx: 0, dy: 0, ang: -Math.PI / 2 },
        { len: down, x: w, y: r, dx: 0, dy: 1, ang: null },
        { len: arc, x: w - r, y: h - r, dx: 0, dy: 0, ang: 0 },
        { len: across, x: w - r, y: h, dx: -1, dy: 0, ang: null },
        { len: arc, x: r, y: h - r, dx: 0, dy: 0, ang: Math.PI / 2 },
        { len: down, x: 0, y: h - r, dx: 0, dy: -1, ang: null },
        { len: arc, x: r, y: r, dx: 0, dy: 0, ang: Math.PI }
      ];
      return { r, segs, total: Math.max(1, segs.reduce((s, g) => s + g.len, 0)) };
    };
    const pointAt = (shape, dist, p) => {
      let s = wrap(dist, shape.total);
      for (const g of shape.segs) {
        if (g.len > 0 && s <= g.len) {
          if (g.ang === null) { p.x = g.x + g.dx * s; p.y = g.y + g.dy * s; }
          else {
            const a = g.ang + s / shape.r;
            p.x = g.x + Math.cos(a) * shape.r; p.y = g.y + Math.sin(a) * shape.r;
          }
          return p;
        }
        s -= g.len;
      }
      return p;
    };

    const instances = new Map();

    function create(btn) {
      const canvas = make('canvas', 'fx-star-canvas');
      canvas.setAttribute('aria-hidden', 'true');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      btn.classList.add('fx-star');
      btn.insertBefore(canvas, btn.firstChild);

      const st = { w: 0, h: 0, dpr: 1, phase: 0, lap: -1, time: 0, visible: true, hovered: false };
      const pt = { x: 0, y: 0 };
      let raf = 0, last = 0, alive = true, dirty = true;

      // El canvas sobresale BLEED px por cada lado, pero en horizontal nunca más allá del viewport:
      // así un botón a todo el ancho (móvil / ventana estrecha) no crea scroll horizontal.
      let bleedL = BLEED, bleedR = BLEED, lastVw = 0, lastL = 0, lastR = 0;
      const measure = () => {
        st.w = btn.offsetWidth; st.h = btn.offsetHeight;
        st.dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = btn.getBoundingClientRect();
        const vw = document.documentElement.clientWidth || window.innerWidth;
        lastVw = vw; lastL = rect.left; lastR = rect.right;
        bleedL = clamp(Math.floor(rect.left), 0, BLEED);
        bleedR = clamp(Math.floor(vw - rect.right), 0, BLEED);
        const bx = btn.clientLeft, by = btn.clientTop;          // el borde de 1px desplaza el origen del absoluto
        canvas.style.left = (-bleedL - bx) + 'px';
        canvas.style.top = (-BLEED - by) + 'px';
        canvas.style.width = (st.w + bleedL + bleedR) + 'px';
        canvas.style.height = (st.h + BLEED * 2) + 'px';
        canvas.width = Math.max(1, Math.round((st.w + bleedL + bleedR) * st.dpr));
        canvas.height = Math.max(1, Math.round((st.h + BLEED * 2) * st.dpr));
        dirty = false;
      };
      const stroke = (x1, y1, x2, y2, width, style) => {
        ctx.lineWidth = width; ctx.strokeStyle = style;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      };
      const trail = (shape, head, length, boost) => {
        if (length < 0.5) return;
        const steps = clamp(Math.ceil(length / 2), 2, 90);
        pointAt(shape, head, pt);
        let px = pt.x, py = pt.y;
        for (let i = 1; i <= steps; i++) {
          pointAt(shape, head - length * (i / steps), pt);
          const u = 1 - (i - 0.5) / steps;
          const fade = u * u;
          const tone = mix(mix(TAIL, HEAD, u), WHITE, Math.pow(u, 6) * 0.5);
          ctx.lineCap = i === 1 ? 'round' : 'butt';
          stroke(px, py, pt.x, pt.y, 2 + 6 * GLOW * boost, rgba(tone, fade * 0.3 * GLOW * boost));
          stroke(px, py, pt.x, pt.y, THICK, rgba(tone, fade * boost));
          px = pt.x; py = pt.y;
        }
      };
      const head = (x, y, intensity, twinkle) => {
        const reach = 12 + 40 * GLOW;
        const bloom = ctx.createRadialGradient(x, y, 0, x, y, reach);
        const k = 0.4 * GLOW * intensity;
        bloom.addColorStop(0, rgba(HEAD, k));
        bloom.addColorStop(0.2, rgba(HEAD, k * 0.4));
        bloom.addColorStop(0.5, rgba(HEAD, k * 0.1));
        bloom.addColorStop(1, rgba(HEAD, 0));
        ctx.fillStyle = bloom;
        ctx.fillRect(x - reach, y - reach, reach * 2, reach * 2);
        const size = 1 + THICK * 0.6;                         // núcleo + destello en cruz (la "estrella")
        const core = ctx.createRadialGradient(x, y, 0, x, y, size * 2.2);
        core.addColorStop(0, rgba(WHITE, intensity));
        core.addColorStop(0.4, rgba(mix(HEAD, WHITE, 0.5), intensity * 0.9));
        core.addColorStop(1, rgba(HEAD, 0));
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(x, y, size * 2.2, 0, TAU); ctx.fill();
        const spike = (3 + 4 * GLOW + THICK * 1.5) * twinkle;
        const h = ctx.createLinearGradient(x - spike, y, x + spike, y);
        h.addColorStop(0, rgba(HEAD, 0)); h.addColorStop(0.5, rgba(WHITE, intensity * 0.95)); h.addColorStop(1, rgba(HEAD, 0));
        stroke(x - spike, y, x + spike, y, 1, h);
        const v = ctx.createLinearGradient(x, y - spike, x, y + spike);
        v.addColorStop(0, rgba(HEAD, 0)); v.addColorStop(0.5, rgba(WHITE, intensity * 0.95)); v.addColorStop(1, rgba(HEAD, 0));
        stroke(x, y - spike, x, y + spike, 1, v);
      };

      const frame = (now) => {
        raf = 0;
        if (!alive) return;
        // El ancho útil cambia sin 'resize' (p. ej. al salir el preloader aparece la barra de scroll): se detecta aquí
        const rr = btn.getBoundingClientRect();
        if (document.documentElement.clientWidth !== lastVw || Math.abs(rr.left - lastL) > 1 || Math.abs(rr.right - lastR) > 1) dirty = true;
        if (dirty) measure();
        const dt = clamp((now - last) / 1000, 0.001, 0.05);
        last = now;
        st.time += dt;
        let r = parseFloat(getComputedStyle(btn).borderTopLeftRadius);
        if (!(r >= 0)) r = st.h / 2;
        r = Math.min(r, st.h / 2, st.w / 2);
        const shape = outline(Math.max(1, st.w - THICK), Math.max(1, st.h - THICK), r - THICK / 2);
        const total = shape.total;
        const cruise = total / DURATION;
        let extra = 0;
        if (st.lap >= 0) {
          const before = easeInOut(Math.min(1, st.lap / LAP));
          st.lap += dt;
          extra = (easeInOut(Math.min(1, st.lap / LAP)) - before) * total;
          if (st.lap >= LAP) st.lap = -1;
        }
        st.phase = wrap(st.phase + cruise * dt + extra, total);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (st.w >= 2 && st.h >= 2) {
          ctx.setTransform(st.dpr, 0, 0, st.dpr, (bleedL + THICK / 2) * st.dpr, (BLEED + THICK / 2) * st.dpr);
          ctx.globalCompositeOperation = 'lighter';
          const spacing = total / STARS;
          const speed = (cruise * dt + extra) / dt;
          const length = Math.min(speed * TRAIL * DURATION, spacing * 0.92, total * 0.6);
          const boost = st.hovered ? 1.25 : 1;
          for (let i = 0; i < STARS; i++) trail(shape, st.phase + i * spacing, length, boost);
          for (let i = 0; i < STARS; i++) {
            pointAt(shape, st.phase + i * spacing, pt);
            const tw = 0.82 + 0.18 * Math.sin(st.time * 6.1 + i * 2.3) * Math.sin(st.time * 2.7 + i);
            head(pt.x, pt.y, boost, tw);
          }
        }
        if (st.visible && !document.hidden) raf = requestAnimationFrame(frame);
      };
      const wake = () => {
        if (raf || !alive || !st.visible || document.hidden) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      };

      const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { dirty = true; wake(); }) : null;
      if (ro) ro.observe(btn);
      const onResize = () => { dirty = true; wake(); };
      window.addEventListener('resize', onResize);
      const io = 'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => { st.visible = entries.some((e) => e.isIntersecting); if (st.visible) wake(); })
        : null;
      if (io) io.observe(btn);
      const onEnter = (e) => { if (e.pointerType === 'touch') return; st.hovered = true; if (st.lap < 0) st.lap = 0; wake(); };
      const onLeave = () => { st.hovered = false; };
      btn.addEventListener('pointerenter', onEnter);
      btn.addEventListener('pointerleave', onLeave);
      document.addEventListener('visibilitychange', wake);
      measure();
      wake();

      return {
        destroy() {
          alive = false;
          cancelAnimationFrame(raf);
          if (ro) ro.disconnect();
          if (io) io.disconnect();
          btn.removeEventListener('pointerenter', onEnter);
          btn.removeEventListener('pointerleave', onLeave);
          document.removeEventListener('visibilitychange', wake);
          window.removeEventListener('resize', onResize);
          canvas.remove();
          btn.classList.remove('fx-star');
        }
      };
    }

    const sync = () => {
      if (reduced() || !fine()) {
        instances.forEach((inst) => inst.destroy());
        instances.clear();
        return;
      }
      $$('.btn-primary').forEach((btn) => {
        if (instances.has(btn)) return;
        const inst = safe('starborder', () => create(btn));
        if (inst) instances.set(btn, inst);
      });
    };
    sync();
    listen(mqReduce, sync);
    listen(mqFine, sync);
  }

  /* =========================================================
     Arranque (app.js ya corrió: es anterior en el <head> y ambos son defer)
     ========================================================= */
  function boot() {
    safe('rotating', initRotatingText);
    safe('scrambled', initScrambledText);
    safe('shuffle', initShuffle);
    safe('letterglitch', initLetterGlitch);
    safe('starborder', initStarBorder);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
