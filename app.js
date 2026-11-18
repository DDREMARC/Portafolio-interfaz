/* =========================================================
   COSMIC ORANGE PORTFOLIO - app.js
   Vanilla JS, sin build ni librerías. Orden de módulos:
   preloader + BlurText, typewriter, partículas, lanyard (física
   verlet propia), stats, tabs, modales, nav, DecryptedText,
   emblema Fable (SVG nativo), contacto y muro de comentarios.
   Lógica inspirada en React Bits (BlurText, DecryptedText,
   Particles, Lanyard) reescrita desde cero en JS nativo.
   Respeta prefers-reduced-motion en cada módulo.
   ========================================================= */
(() => {
  'use strict';

  /* ---------- utilidades ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mqReduce.matches;
  const onReducedChange = (fn) => {
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', fn);
    else if (mqReduce.addListener) mqReduce.addListener(fn);
  };
  const safe = (name, fn) => {
    try { return fn(); } catch (err) { console.warn('[portfolio] ' + name + ' falló:', err); }
    return undefined;
  };
  const rafThrottle = (fn) => {
    let queued = false;
    return (...args) => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn(...args); });
    };
  };
  const isHttpUrl = (u) => {
    try { const p = new URL(u, location.href).protocol; return p === 'https:' || p === 'http:'; }
    catch (_) { return false; }
  };

  /* =========================================================
     1. Preloader + BlurText
     ========================================================= */
  function splitBlurText(el, stepMs) {
    if (!el || el.dataset.blurReady) return [];
    const text = el.textContent.trim();
    el.textContent = '';
    const words = text.split(/\s+/).map((word, i) => {
      const span = document.createElement('span');
      span.className = 'blur-word';
      span.textContent = word;
      span.style.transitionDelay = reduced() ? '0ms' : (i * stepMs) + 'ms';
      el.appendChild(span);
      return span;
    });
    el.dataset.blurReady = '1';
    return words;
  }

  function revealWords(words) {
    if (!words.length) return;
    if (reduced()) { words.forEach((w) => w.classList.add('is-visible')); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      words.forEach((w) => w.classList.add('is-visible'));
    }));
  }

  /** Devuelve una promesa que se resuelve cuando el preloader empieza a salir. */
  function initPreloader() {
    const root = document.documentElement;
    const pre = $('#preloader');
    const others = $$('[data-blur-text]').filter((el) => !pre || !pre.contains(el));

    // BlurText fuera del preloader: se revela al entrar en viewport.
    if (others.length && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          revealWords(splitBlurText(e.target, 110));
        });
      }, { threshold: 0.2 });
      others.forEach((el) => io.observe(el));
    }

    if (!pre) return Promise.resolve();

    const target = $('[data-blur-text]', pre);
    revealWords(splitBlurText(target, 120));

    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

    return new Promise((resolve) => {
      setTimeout(() => {
        pre.classList.add('is-hidden');
        pre.setAttribute('aria-hidden', 'true');
        root.style.overflow = prevOverflow;
        resolve();
        setTimeout(() => { pre.hidden = true; }, 1100);
      }, reduced() ? 700 : 1600);
    });
  }

  /* =========================================================
     2. Typewriter (#typewriter lee data-phrases)
     ========================================================= */
  function initTypewriter() {
    const el = $('#typewriter');
    if (!el) return;
    let phrases = [];
    try { phrases = JSON.parse(el.dataset.phrases || '[]'); } catch (_) { phrases = []; }
    phrases = phrases.filter((p) => typeof p === 'string' && p.trim());
    if (!phrases.length) return;
    el.textContent = phrases[0];
    if (reduced() || phrases.length < 2) return;

    let p = 0;
    let n = phrases[0].length;
    let deleting = true;
    const tick = () => {
      const full = phrases[p];
      if (!deleting) {
        if (n < full.length) {
          n += 1;
          el.textContent = full.slice(0, n);
          return setTimeout(tick, 48 + Math.random() * 50);
        }
        deleting = true;
        return setTimeout(tick, 2000);
      }
      if (n > 0) {
        n -= 1;
        el.textContent = full.slice(0, n);
        return setTimeout(tick, 26);
      }
      deleting = false;
      p = (p + 1) % phrases.length;
      return setTimeout(tick, 320);
    };
    setTimeout(tick, 2200);
  }

  /* =========================================================
     3. Partículas cósmicas (#particles-canvas)
        Naranja/ámbar, repulsión del cursor, pausa fuera de
        pantalla o con la pestaña oculta. Lienzo fijo a pantalla
        completa (cubre toda la página, no sólo el hero).
        Atmósfera sutil: pocas partículas, baja opacidad y paleta
        mayormente neutra con acento naranja (parámetros visuales).
     ========================================================= */
  function initParticles() {
    const canvas = $('#particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Canvas fijo a pantalla completa (CSS: position:fixed; inset:0): mide el viewport, ya no el hero.
    // Como no recibe eventos (pointer-events:none), el cursor se escucha en window.
    const host = canvas;

    const COLORS = ['#F97316', '#FDBA74', '#FFFFFF', '#A1A1AA', '#FFFFFF', '#FBBF24'];
    const ALPHA = 0.5;   // opacidad máxima global de las partículas (sutileza)
    const makeSprite = (color) => {
      const s = 64;
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, color);
      grad.addColorStop(0.16, color);
      grad.addColorStop(0.34, color + '55');
      grad.addColorStop(1, color + '00');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      return c;
    };
    const sprites = COLORS.map(makeSprite);

    let w = 0, h = 0, dpr = 1;
    let particles = [];
    let visible = true;
    let raf = 0;
    let last = 0;
    const pointer = { x: -9999, y: -9999, active: false };
    const RADIUS = 150;

    const targetCount = () => {
      const base = clamp(Math.round((w * h) / 20000), 24, 64);
      return w < 700 ? Math.round(base * 0.6) : base;
    };

    const spawn = () => {
      const speed = 5 + Math.random() * 16;
      const ang = Math.random() * Math.PI * 2;
      const bx = Math.cos(ang) * speed * 0.6;
      const by = -Math.abs(Math.sin(ang)) * speed * 0.8 - 2;
      return {
        x: Math.random() * w, y: Math.random() * h,
        bx, by, vx: bx, vy: by,
        r: 0.6 + Math.pow(Math.random(), 2.4) * 2.4,
        phase: Math.random() * Math.PI * 2,
        tw: 0.6 + Math.random() * 1.8,
        sprite: sprites[(Math.random() * sprites.length) | 0]
      };
    };

    const fit = () => {
      const rect = host.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // lienzo a pantalla completa: tope 1.5
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const want = targetCount();
      while (particles.length < want) particles.push(spawn());
      if (particles.length > want) particles.length = want;
      particles.forEach((p) => {
        if (p.x > w) p.x = Math.random() * w;
        if (p.y > h) p.y = Math.random() * h;
      });
      if (!isRunning()) draw(performance.now());
    };

    const step = (dt) => {
      const relax = 1 - Math.exp(-dt * 1.5);
      const R2 = RADIUS * RADIUS;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = 1 - d / RADIUS;
            const push = f * f * 2600 * dt;
            p.vx += (dx / d) * push;
            p.vy += (dy / d) * push;
          }
        }
        p.vx += (p.bx - p.vx) * relax;
        p.vy += (p.by - p.vy) * relax;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const m = 12;
        if (p.x < -m) p.x = w + m; else if (p.x > w + m) p.x = -m;
        if (p.y < -m) p.y = h + m; else if (p.y > h + m) p.y = -m;
      }
    };

    const draw = (now) => {
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;
      const still = reduced();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const tw = still ? 0.8 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * p.tw + p.phase));
        const size = p.r * 7;
        ctx.globalAlpha = tw * ALPHA;
        ctx.drawImage(p.sprite, p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const isRunning = () => visible && !document.hidden && !reduced();
    const frame = (now) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      step(dt);
      draw(now);
      if (isRunning()) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (!isRunning()) { if (!raf) draw(performance.now()); return; }
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const setPointer = (e) => {
      if (reduced()) return;
      const r = host.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.active = true;
    };
    const clearPointer = () => { pointer.active = false; pointer.x = pointer.y = -9999; };
    window.addEventListener('pointermove', setPointer, { passive: true });
    window.addEventListener('pointerdown', setPointer, { passive: true });
    document.documentElement.addEventListener('pointerleave', clearPointer);
    window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') clearPointer(); });
    window.addEventListener('pointercancel', clearPointer);

    if ('ResizeObserver' in window) new ResizeObserver(rafThrottle(fit)).observe(host);
    else window.addEventListener('resize', rafThrottle(fit));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); }).observe(host);
    }
    document.addEventListener('visibilitychange', wake);
    onReducedChange(() => { clearPointer(); wake(); });

    fit();
    wake();
  }

  /* =========================================================
     4. Lanyard con física propia (verlet + restricciones)
        Cinturón = cadena de 6 tramos; tarjeta = barra rígida
        articulada en el clip. Arrastre con mouse/touch/lápiz
        (Pointer Events) y suelta con inercia.
     ========================================================= */
  function initLanyard(ready) {
    const box = $('#lanyard-container');
    const rig = $('#lanyard-rig');
    const card = $('#lanyard-card');
    if (!box || !rig || !card) return;
    const strap = $('#lanyard-strap');
    const clip = $('.lanyard-clip', rig);

    const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
    const L = (strap && strap.offsetHeight) || 252;              // largo del cinturón
    const cardTop = num(getComputedStyle(card).top, 262);
    const clipTop = clip ? num(getComputedStyle(clip).top, 240) : L - 12;

    /* --- datos de la tarjeta a partir del DOM (nada inventado) --- */
    const avatar = $('#lanyard-avatar');
    if (avatar) {
      avatar.addEventListener('error', () => {
        const initial = (($('#lanyard-name') || {}).textContent || 'D').trim().charAt(0).toUpperCase() || 'D';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="#18181c"/>' +
          '<text x="80" y="104" font-family="sans-serif" font-size="84" font-weight="700" text-anchor="middle" fill="#F97316">' + initial + '</text></svg>';
        avatar.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      }, { once: true });
    }
    const barcode = $('#lanyard-barcode');
    if (barcode) {
      const seed = (($('.lanyard-handle', card) || {}).textContent || '') + (($('.lanyard-id', card) || {}).textContent || '');
      if (seed.trim()) {
        const cols = ['#D4D4D8', '#A1A1AA', '#F97316'];
        let xPos = 0;
        let bars = '';
        for (let i = 0; i < seed.length; i++) {
          const code = seed.charCodeAt(i);
          for (let b = 0; b < 4; b++) {
            const wBar = 1 + ((code >> (b * 2)) & 3);
            const gap = 1 + ((code >> (b + 1)) & 1);
            bars += '<rect x="' + xPos + '" y="0" width="' + wBar + '" height="38" fill="' + cols[(i + b) % 3] + '"/>';
            xPos += wBar + gap;
          }
        }
        barcode.style.background = 'none';
        barcode.innerHTML = '<svg viewBox="0 0 ' + xPos + ' 38" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" focusable="false">' + bars + '</svg>';
      }
    }

    /* --- estado físico --- */
    const SEG = 6;
    const NA = SEG;          // clip (extremo del cinturón)
    const NB = SEG + 1;      // centro de la tarjeta
    const N = SEG + 2;
    const x = new Float64Array(N), y = new Float64Array(N);
    const ox = new Float64Array(N), oy = new Float64Array(N);
    const iw = new Float64Array(N);                 // masa inversa
    const segLen = L / SEG;
    for (let i = 1; i < N; i++) iw[i] = 1 / 0.35;
    iw[NA] = 1 / 0.8;
    iw[NB] = 1 / 3.5;
    iw[0] = 0;

    const DT = 1 / 120;
    const ITER = 18;
    const G = 2600;                 // px/s^2
    const DAMP_R = 0.9965;
    const DAMP_B = 0.9987;
    const BREEZE = 80;              // px/s^2, brisa suave
    const PULL = 0.38;

    let cardW = card.offsetWidth || 256;
    let cardH = card.offsetHeight || 480;
    let D = cardTop + cardH / 2 - L;               // distancia clip -> centro de la tarjeta
    let breezeOn = !reduced();

    card.style.transformOrigin = (cardW / 2) + 'px ' + (L - cardTop) + 'px';
    if (clip) clip.style.transformOrigin = ((clip.offsetWidth || 30) / 2) + 'px ' + (L - clipTop) + 'px';
    card.style.willChange = 'transform';
    if (clip) clip.style.willChange = 'transform';
    card.style.touchAction = 'none';
    box.style.touchAction = 'pan-y';
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'Credencial colgante. Arrástrala con el mouse o el dedo, o usa las flechas izquierda y derecha para balancearla.');

    function reset(theta) {
      const sx = -Math.sin(theta), sy = Math.cos(theta);
      for (let i = 0; i <= SEG; i++) { x[i] = sx * segLen * i; y[i] = sy * segLen * i; }
      x[NB] = x[NA] + sx * D; y[NB] = y[NA] + sy * D;
      ox.set(x); oy.set(y);
    }
    reset(0);

    /* --- canvas del cinturón (curva flexible) --- */
    const sc = document.createElement('canvas');
    sc.setAttribute('aria-hidden', 'true');
    const padX = 170, padTop = 16, padBottom = 24;
    Object.assign(sc.style, { position: 'absolute', pointerEvents: 'none', zIndex: '0', left: -padX + 'px', top: -padTop + 'px' });
    box.insertBefore(sc, box.firstChild);
    const sctx = sc.getContext('2d');
    let dpr = 1, boxW = 0;
    let stripe = null;

    function fitCanvas() {
      boxW = box.clientWidth;
      const boxH = box.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = boxW + padX * 2, ch = boxH + padTop + padBottom;
      sc.style.width = cw + 'px';
      sc.style.height = ch + 'px';
      sc.width = Math.round(cw * dpr);
      sc.height = Math.round(ch * dpr);
      stripe = null;
      render();
    }

    function drawStrap() {
      if (!sctx) return;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, sc.width, sc.height);
      sctx.setTransform(dpr, 0, 0, dpr, (padX + boxW / 2) * dpr, padTop * dpr);
      sctx.lineJoin = 'round';
      const path = () => {
        sctx.beginPath();
        sctx.moveTo(x[0], y[0] - 4);
        sctx.lineTo(x[0], y[0]);
        for (let i = 1; i < SEG; i++) {
          sctx.quadraticCurveTo(x[i], y[i], (x[i] + x[i + 1]) / 2, (y[i] + y[i + 1]) / 2);
        }
        sctx.lineTo(x[SEG], y[SEG]);
      };
      if (!stripe) {
        stripe = sctx.createLinearGradient(0, 0, 0, L);
        stripe.addColorStop(0, 'rgba(249,115,22,0.55)');
        stripe.addColorStop(0.6, 'rgba(249,115,22,0.72)');
        stripe.addColorStop(1, 'rgba(249,115,22,0.8)');
      }
      sctx.lineCap = 'butt';
      sctx.lineWidth = 18;
      sctx.strokeStyle = stripe;
      sctx.shadowColor = 'rgba(249,115,22,0.22)';
      sctx.shadowBlur = 8;
      path();
      sctx.stroke();
      sctx.shadowBlur = 0;
      sctx.shadowColor = 'transparent';
      sctx.setLineDash([3, 8]);
      sctx.strokeStyle = 'rgba(7,7,9,0.3)';
      path();
      sctx.stroke();
      sctx.setLineDash([]);
      sctx.lineWidth = 1;
      sctx.strokeStyle = 'rgba(255,255,255,0.18)';
      path();
      sctx.stroke();
    }

    function render() {
      const ax = x[NA], ay = y[NA];
      const phi = Math.atan2(-(x[NB] - ax), y[NB] - ay);
      const tf = 'translate(' + ax.toFixed(2) + 'px,' + (ay - L).toFixed(2) + 'px) rotate(' + phi.toFixed(4) + 'rad)';
      card.style.transform = tf;
      if (clip) clip.style.transform = tf;
      drawStrap();
    }

    /* --- simulación --- */
    let drag = null;
    let simTime = 0;

    function solve(i, j, len) {
      const dx = x[j] - x[i], dy = y[j] - y[i];
      const d = Math.hypot(dx, dy) || 1e-6;
      const ws = iw[i] + iw[j];
      const k = (d - len) / (d * ws);
      x[i] += dx * k * iw[i]; y[i] += dy * k * iw[i];
      x[j] -= dx * k * iw[j]; y[j] -= dy * k * iw[j];
    }

    function applyDrag() {
      let ex = x[NB] - x[NA], ey = y[NB] - y[NA];
      const len = Math.hypot(ex, ey) || 1;
      ex /= len; ey /= len;
      const nx = -ey, ny = ex;
      const wx = x[NA] + ex * drag.v + nx * drag.u;
      const wy = y[NA] + ey * drag.v + ny * drag.u;
      let dx = drag.tx - wx, dy = drag.ty - wy;
      const m = Math.hypot(dx, dy);
      if (m > 30) { dx *= 30 / m; dy *= 30 / m; }
      dx *= PULL; dy *= PULL;
      const s = clamp(drag.v / D, -0.2, 2.2);
      const wa = 1 - s, wb = s;
      const den = wa * wa + wb * wb || 1;
      x[NA] += dx * wa / den; y[NA] += dy * wa / den;
      x[NB] += dx * wb / den; y[NB] += dy * wb / den;
    }

    function simulate(dt) {
      simTime += dt;
      const dt2 = dt * dt;
      const wind = breezeOn
        ? BREEZE * Math.sin(simTime * 0.7) * (0.65 + 0.35 * Math.sin(simTime * 1.9 + 1.3))
        : 0;
      for (let i = 1; i < N; i++) {
        const damp = i === NB ? DAMP_B : DAMP_R;
        const vx = (x[i] - ox[i]) * damp;
        const vy = (y[i] - oy[i]) * damp;
        ox[i] = x[i]; oy[i] = y[i];
        x[i] += vx + (i >= NA ? wind : wind * 0.4) * dt2;
        y[i] += vy + G * dt2;
      }
      if (drag) applyDrag();
      for (let k = 0; k < ITER; k++) {
        for (let i = 0; i < SEG; i++) solve(i, i + 1, segLen);
        solve(NA, NB, D);
      }
      x[0] = 0; y[0] = 0;
    }

    function kinetic() {
      let e = 0;
      for (let i = 1; i < N; i++) {
        const vx = x[i] - ox[i], vy = y[i] - oy[i];
        e += vx * vx + vy * vy;
      }
      return e;
    }

    /* --- bucle --- */
    let raf = 0, last = 0, acc = 0, inView = true;
    const canRun = () => inView && !document.hidden;

    function frame(now) {
      raf = 0;
      acc += Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      let guard = 0;
      while (acc >= DT && guard++ < 10) { simulate(DT); acc -= DT; }
      if (acc >= DT) acc = 0;
      // salvaguarda numérica: si algo se desboca, vuelve al reposo
      if (!Number.isFinite(x[NB] + y[NB]) || Math.abs(x[NB]) > 3000 || Math.abs(y[NB]) > 3000) reset(0);
      render();
      const asleep = !drag && !breezeOn && kinetic() < 1e-5;
      if (!asleep && canRun()) raf = requestAnimationFrame(frame);
    }
    function wake() {
      if (raf || !canRun()) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; wake(); }).observe(box);
    }
    document.addEventListener('visibilitychange', wake);
    onReducedChange(() => { breezeOn = !reduced(); wake(); });
    if ('ResizeObserver' in window) {
      new ResizeObserver(rafThrottle(() => {
        const h = card.offsetHeight || cardH;
        if (h !== cardH) { cardH = h; D = cardTop + cardH / 2 - L; }
        fitCanvas();
        wake();
      })).observe(box);
      new ResizeObserver(rafThrottle(() => {
        const h = card.offsetHeight || cardH;
        if (h !== cardH) { cardH = h; D = cardTop + cardH / 2 - L; wake(); }
      })).observe(card);
    } else {
      window.addEventListener('resize', rafThrottle(fitCanvas));
    }

    /* --- arrastre (mouse, touch y lápiz) --- */
    let clientX = 0, clientY = 0;
    const updateTarget = () => {
      const r = box.getBoundingClientRect();
      drag.tx = clientX - (r.left + r.width / 2);
      drag.ty = clientY - r.top;
    };
    const prevSelect = document.documentElement.style.userSelect;

    card.addEventListener('pointerdown', (e) => {
      if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.pointerType === 'mouse') e.preventDefault();
      clientX = e.clientX; clientY = e.clientY;
      const r = box.getBoundingClientRect();
      const px = clientX - (r.left + r.width / 2);
      const py = clientY - r.top;
      let ex = x[NB] - x[NA], ey = y[NB] - y[NA];
      const len = Math.hypot(ex, ey) || 1;
      ex /= len; ey /= len;
      const rx = px - x[NA], ry = py - y[NA];
      drag = { id: e.pointerId, v: rx * ex + ry * ey, u: rx * -ey + ry * ex, tx: px, ty: py };
      try { card.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
      document.documentElement.style.userSelect = 'none';
      wake();
    });
    card.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      clientX = e.clientX; clientY = e.clientY;
      updateTarget();
    });
    const release = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      try { card.releasePointerCapture(drag.id); } catch (_) { /* ya liberado */ }
      drag = null;
      document.documentElement.style.userSelect = prevSelect;
      wake();   // la inercia queda en las posiciones previas (verlet)
    };
    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);
    card.addEventListener('lostpointercapture', release);
    window.addEventListener('blur', () => release());
    card.addEventListener('dragstart', (e) => e.preventDefault());
    window.addEventListener('scroll', () => { if (drag) updateTarget(); }, { passive: true });

    const nudge = (dir) => {
      const total = L + D;
      for (let i = 1; i < N; i++) {
        const r = Math.hypot(x[i], y[i]);
        ox[i] -= dir * 2.6 * (r / total);
      }
      wake();
    };
    card.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
    });

    /* --- arranque --- */
    rig.classList.add('is-physics');
    if (strap) strap.style.display = 'none';
    fitCanvas();
    wake();

    Promise.resolve(ready).then(() => {
      if (reduced()) return;
      reset(0.3);       // se suelta desde un lado cuando el preloader sale
      wake();
    });
  }

  /* =========================================================
     5. Contadores / Bento (datos reales del DOM)
     ========================================================= */
  function initStats() {
    const elProjects = $('#stat-projects');
    const elCerts = $('#stat-certs');
    const elTech = $('#stat-tech');

    const certCount = () => $$('#certificates-grid .cert-card').length;
    const techCount = () => new Set(
      $$('#tech-pyramid .tech img').map((i) => (i.alt || '').trim().toLowerCase()).filter(Boolean)
    ).size;
    const cardCount = () => $$('#projects-grid .project-card').length;

    const setFinal = (el, n) => {
      if (!el) return;
      el.dataset.count = String(n);
      el.textContent = String(n);
    };

    const sync = () => {
      if (elProjects) {
        const declared = parseInt(elProjects.dataset.count, 10);
        setFinal(elProjects, Number.isFinite(declared) && declared > 0 ? declared : cardCount());
      }
      const certs = certCount();
      setFinal(elCerts, certs);
      if (elCerts && certs > 0) {
        const note = $('.stat-note', elCerts.parentElement);
        if (note) note.textContent = 'Certificados publicados';
      }
      const techs = techCount();
      if (techs > 0) setFinal(elTech, techs);
    };
    sync();

    const grid = $('#certificates-grid');
    if (grid && 'MutationObserver' in window) {
      new MutationObserver(sync).observe(grid, { childList: true });
    }

    const countUp = (el) => {
      const to = parseInt(el.dataset.count, 10);
      if (!Number.isFinite(to)) return;
      if (reduced() || to === 0) { el.textContent = String(to); return; }
      const t0 = performance.now();
      const dur = 1300;
      el.textContent = '0';
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = String(to);
      };
      requestAnimationFrame(tick);
    };
    const nums = [elProjects, elCerts, elTech].filter(Boolean);
    if (nums.length && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          countUp(e.target);
        });
      }, { threshold: 0.4 });
      nums.forEach((n) => io.observe(n));
    }
  }

  /* =========================================================
     6. Tabs segmentadas
     ========================================================= */
  function initTabs() {
    const list = $('#portfolio-tabs');
    if (!list) return;
    const tabs = $$('[role="tab"]', list);
    const panels = $$('.tab-panel[data-panel]');
    if (!tabs.length) return;

    /* Al cambiar de pestaña con la barra ya fuera de vista (bajo la navbar),
       se vuelve a mostrar para no dejar al usuario a mitad del panel anterior. */
    const keepTabsInView = () => {
      if (list.getBoundingClientRect().top < 72) {
        list.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
      }
    };

    const select = (name, focus, scroll) => {
      const exists = tabs.some((t) => t.dataset.tab === name);
      if (!exists) return;
      tabs.forEach((t) => {
        const on = t.dataset.tab === name;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus({ preventScroll: !!scroll });
      });
      panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
      if (scroll) keepTabsInView();
    };

    tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.tab, false, true)));
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let next = -1;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      select(tabs[next].dataset.tab, true, true);
    });
    $$('[data-goto-tab]').forEach((a) => a.addEventListener('click', () => select(a.dataset.gotoTab, false)));
  }

  /* =========================================================
     7. Modal de proyecto + lightbox de certificados
     ========================================================= */
  function initModals() {
    const projectModal = $('#project-modal');
    const lightbox = $('#cert-lightbox');
    const root = document.documentElement;
    let active = null;
    let lastFocus = null;
    let prevOverflow = '';

    const focusables = (m) => $$('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', m)
      .filter((el) => el.getClientRects().length > 0);

    const open = (m, trigger) => {
      if (!m) return;
      if (active) close();
      lastFocus = trigger || document.activeElement;
      active = m;
      prevOverflow = root.style.overflow;
      root.style.overflow = 'hidden';
      m.classList.add('is-open');
      m.setAttribute('aria-hidden', 'false');
      const first = $('.modal-close', m) || focusables(m)[0];
      if (first) first.focus({ preventScroll: true });
    };
    function close() {
      if (!active) return;
      active.classList.remove('is-open');
      active.setAttribute('aria-hidden', 'true');
      active = null;
      root.style.overflow = prevOverflow;
      if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) {
        lastFocus.focus({ preventScroll: true });
      }
      lastFocus = null;
    }

    const fillProject = (card) => {
      const d = card.dataset;
      const img = $('.project-media img', card);
      const mi = $('#modal-image');
      if (mi) {
        mi.style.height = 'auto';   // el atributo height="800" del HTML anularía el aspect-ratio del CSS
        const src = d.image || (img && img.getAttribute('src')) || '';
        if (src) mi.src = src;
        mi.alt = img ? img.alt : '';
      }
      const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
      set('#modal-lang', d.langLabel || d.lang || 'Sin lenguaje');
      set('#modal-stars', '★ ' + (d.stars || '0'));
      set('#modal-title', d.repo || $('.project-name', card).textContent);
      set('#modal-description', d.desc || 'Repositorio de GitHub sin descripción.');
      const link = $('#modal-link');
      if (link) {
        // data-url="#" (o vacío) = enlace pendiente: sin botón, para no dejar el href de la tarjeta anterior
        const hasUrl = !!d.url && d.url.trim() !== '#' && isHttpUrl(d.url);
        if (hasUrl) { link.href = d.url; link.hidden = false; }
        else { link.hidden = true; link.removeAttribute('href'); }
      }
      const home = $('#modal-homepage');
      if (home) {
        if (d.homepage && isHttpUrl(d.homepage)) { home.href = d.homepage; home.hidden = false; }
        else { home.hidden = true; home.removeAttribute('href'); }
      }
    };

    document.addEventListener('click', (e) => {
      // Enlace de tarjeta pendiente (href="#"): no navegar ni saltar al inicio
      const dead = e.target.closest('.project-card a[href="#"]');
      if (dead) { e.preventDefault(); return; }
      const opener = e.target.closest('[data-open-modal]');
      if (opener) {
        const card = opener.closest('.project-card');
        if (card && projectModal) { fillProject(card); open(projectModal, opener); }
        return;
      }
      if (e.target.closest('[data-modal-close]')) { close(); return; }

      const cert = e.target.closest('#certificates-grid .cert-card');
      if (cert && lightbox) openCert(cert);
    });

    const openCert = (cert) => {
      const img = $('img', cert);
      const big = $('#lightbox-image');
      if (!img || !big) return;
      big.src = cert.dataset.full || img.currentSrc || img.src;
      big.alt = cert.dataset.title || img.alt || 'Certificado';
      big.hidden = false;
      const cap = $('#lightbox-caption');
      if (cap) cap.textContent = cert.dataset.title || img.alt || '';
      open(lightbox, cert);
    };
    const certGrid = $('#certificates-grid');
    if (certGrid) {
      certGrid.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const cert = e.target.closest('.cert-card');
        if (!cert) return;
        e.preventDefault();
        openCert(cert);
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!active) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(active);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && (document.activeElement === lastEl || !active.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    });
  }

  /* =========================================================
     8. Navegación: enlace activo según la sección visible
     ========================================================= */
  function initNav() {
    const links = $$('.nav-pill a[data-nav]');
    if (!links.length) return;
    /* [id de sección en el DOM, enlace de la barra que se ilumina]. La barra tiene 5 enlaces (landing):
       portfolio, seguridad y música cuelgan de "Nosotros". El orden debe ser el del DOM. */
    const map = [
      ['home', 'home'], ['about', 'about'], ['portfolio', 'about'], ['security', 'about'], ['music', 'about'],
      ['gallery', 'gallery'], ['testimonials', 'testimonials'], ['contact', 'contact']
    ].map(([id, key]) => [document.getElementById(id), key]).filter(([el]) => el);

    const setActive = (key) => {
      links.forEach((a) => {
        const on = a.dataset.nav === key;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    };
    const update = rafThrottle(() => {
      const pivot = window.innerHeight * 0.38;
      let key = map.length ? map[0][1] : 'home';
      for (const [el, k] of map) {
        if (el.getBoundingClientRect().top <= pivot) key = k;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) key = 'contact';
      setActive(key);
    });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    links.forEach((a) => a.addEventListener('click', () => setActive(a.dataset.nav)));
    update();
  }

  /* =========================================================
     9. DecryptedText sobre el anillo (#decrypted-ring-text)
     ========================================================= */
  function initDecryptRing() {
    const node = $('#decrypted-ring-text');
    if (!node) return;
    const host = $('#decrypted-matrix') || node;
    const target = node.dataset.decryptText || node.textContent;
    const chars = Array.from(target);
    const pool = Array.from(new Set(chars.filter((c) => c.trim() && !'/'.includes(c))));
    if (!pool.length) return;
    let timer = 0;
    let inView = false;

    const stop = () => { clearInterval(timer); timer = 0; };
    const run = () => {
      stop();
      if (reduced()) { node.textContent = target; return; }
      let revealed = 0;
      const perTick = Math.max(1, chars.length / 42);
      timer = setInterval(() => {
        revealed += perTick;
        const cut = Math.floor(revealed);
        node.textContent = chars.map((c, i) => (
          i < cut || c === ' ' || c === '/' ? c : pool[(Math.random() * pool.length) | 0]
        )).join('');
        if (cut >= chars.length) { stop(); node.textContent = target; }
      }, 45);
    };
    /* Sin bucle de 9s: el scramble corre una vez al entrar en pantalla y al pasar el puntero. */

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        const was = inView;
        inView = entry.isIntersecting;
        if (inView && !was && !timer) run();
      }, { threshold: 0.35 }).observe(host);
    }
    host.addEventListener('pointerenter', () => { if (!timer) run(); });
    onReducedChange(() => { if (reduced()) { stop(); node.textContent = target; } });
  }

  /* =========================================================
     10. Emblema Fable: SVG nativo (sin lottie-web)
         <img> con SMIL ya anima. Con movimiento reducido y
         servidor http(s) se incrusta y se pausa la animación.
     ========================================================= */
  function initFable() {
    const host = $('#fable-security-emblem');
    if (!host) return;
    const img = $('img', host);
    if (!img) return;
    /* Variante estática (data-static-src): con movimiento reducido se cambia el
       src del <img>; funciona también con file://. Sin el atributo no hace nada
       y se conserva el respaldo anterior (incrustar y pausar bajo http/https). */
    const staticSrc = img.dataset.staticSrc;
    if (staticSrc) {
      const animatedSrc = img.getAttribute('src');
      const applySrc = () => {
        const want = reduced() ? staticSrc : animatedSrc;
        if (img.getAttribute('src') !== want) img.setAttribute('src', want);
      };
      applySrc();
      onReducedChange(applySrc);
      return;
    }
    if (!reduced() || !/^https?:$/.test(location.protocol)) return;
    fetch(img.getAttribute('src'))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const svg = doc.documentElement;
        if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return;
        $$('script, foreignObject', svg).forEach((n) => n.remove());
        $$('*', svg).forEach((n) => {
          Array.from(n.attributes).forEach((a) => { if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
        });
        const live = document.importNode(svg, true);
        live.setAttribute('role', 'img');
        live.setAttribute('aria-label', img.alt || 'Candado de seguridad');
        host.replaceChildren(live);
        if (typeof live.pauseAnimations === 'function') { live.setCurrentTime(1.2); live.pauseAnimations(); }
      })
      .catch(() => { /* se mantiene el <img> */ });
  }

  /* =========================================================
     11. Formulario de contacto -> contacto.php (PHP, JSON)
         Estados: enviando / ok / error. Si no hay PHP (abierto como archivo, Vercel,
         vista previa: 404/405 o una respuesta que no es JSON) avisa con claridad en vez de fallar en silencio.
         Los límites (maxlength) del HTML son los mismos que valida contacto.php.
     ========================================================= */
  function initContactForm() {
    const form = $('#contact-form');
    if (!form) return;
    const status = $('#contact-status');
    const submit = $('button[type="submit"]', form);
    const label = submit ? $('.btn-label', submit) : null;
    const idleLabel = label ? label.textContent : '';
    const ENDPOINT = form.getAttribute('action') || 'contacto.php';
    const TIMEOUT_MS = 15000;
    const GITHUB = 'github.com/DDREMARC';
    const MSG = {
      invalid: 'Revisa los campos marcados antes de continuar.',
      sending: 'Enviando tu mensaje…',
      ok: 'Mensaje enviado. Gracias, te respondo pronto.',
      noPhp: 'El envío necesita el servidor PHP (InfinityFree). Aquí es solo vista previa. Escríbeme por GitHub: ' + GITHUB + '.',
      network: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo, o escríbeme por GitHub: ' + GITHUB + '.',
      timeout: 'El servidor tardó demasiado en responder. Inténtalo de nuevo en un momento, o escríbeme por GitHub: ' + GITHUB + '.',
      server: 'El servidor no pudo procesar el mensaje. Inténtalo más tarde o escríbeme por GitHub: ' + GITHUB + '.'
    };
    let sending = false;

    /* Estados de color en CSS: info (enviando / sin PHP), error, ok */
    const setStatus = (state, text) => {
      if (!status) return;
      status.dataset.state = state;
      status.setAttribute('role', state === 'error' ? 'alert' : 'status');
      status.textContent = text;
    };
    const busy = (on) => {
      if (submit) submit.disabled = on;
      form.setAttribute('aria-busy', on ? 'true' : 'false');
      if (label) label.textContent = on ? 'Enviando…' : idleLabel;
    };
    const clearInvalid = () => $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    const markInvalid = (errors) => {
      clearInvalid();
      if (!errors || typeof errors !== 'object') return;
      let first = null;
      Object.keys(errors).forEach((name) => {
        const el = form.elements[name];
        if (el && el.setAttribute) { el.setAttribute('aria-invalid', 'true'); first = first || el; }
      });
      if (first && typeof first.focus === 'function') first.focus();
    };

    // La validación nativa bloquea el envío antes del 'submit': 'invalid' no burbujea, de ahí la captura.
    form.addEventListener('invalid', () => setStatus('error', MSG.invalid), true);
    form.addEventListener('input', (e) => { if (e.target && e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      if (!form.checkValidity()) { setStatus('error', MSG.invalid); form.reportValidity(); return; }
      // file:// no puede hacer fetch ni ejecutar PHP: se avisa sin intentar (evita un error de consola)
      if (location.protocol === 'file:') { setStatus('info', MSG.noPhp); return; }

      sending = true;
      clearInvalid();
      busy(true);
      setStatus('info', MSG.sending);
      const ctrl = 'AbortController' in window ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : 0;
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          signal: ctrl ? ctrl.signal : undefined
        });
        const raw = await res.text();
        let data = null;
        try { data = JSON.parse(raw); } catch (_) { /* no es JSON: no hay PHP detrás */ }
        if (data && typeof data === 'object' && typeof data.ok === 'boolean') {
          if (data.ok) {
            form.reset();
            setStatus('ok', MSG.ok);
          } else {
            setStatus('error', typeof data.message === 'string' && data.message ? data.message : MSG.server);
            markInvalid(data.errors);
          }
        } else if (res.status >= 500) {
          setStatus('error', MSG.server);
        } else {
          setStatus('info', MSG.noPhp);   // 404/405/501 (Vercel, hosting sin PHP) o HTML en vez de JSON
        }
      } catch (err) {
        setStatus('error', err && err.name === 'AbortError' ? MSG.timeout : MSG.network);
      } finally {
        clearTimeout(timer);
        sending = false;
        busy(false);
      }
    });
  }

  /* =========================================================
     12. Muro de comentarios (localStorage, FileReader, Like)
     ========================================================= */
  function initComments() {
    const form = $('#comment-form');
    const list = $('#comments-list');
    const tpl = $('#comment-template');
    if (!form || !list || !tpl || !tpl.content) return;

    const KEY = 'dremarc.portfolio.comments.v1';
    const MAX_ITEMS = 60;
    const counter = $('#comments-count');
    const fileInput = $('#comment-image');
    const preview = $('#comment-image-preview');
    const previewWrap = $('.image-preview-wrap', form);
    const dateFmt = (() => {
      try { return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
      catch (_) { return null; }
    })();

    const status = document.createElement('p');
    status.className = 'form-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);
    const say = (msg) => { status.textContent = msg || ''; };

    const fresh = () => ({ items: [], pinned: { likes: 0, liked: false } });
    const sanitize = (raw) => {
      const out = fresh();
      if (!raw || typeof raw !== 'object') return out;
      if (raw.pinned && typeof raw.pinned === 'object') {
        out.pinned.likes = Math.max(0, parseInt(raw.pinned.likes, 10) || 0);
        out.pinned.liked = !!raw.pinned.liked;
      }
      if (Array.isArray(raw.items)) {
        raw.items.forEach((it) => {
          if (!it || typeof it !== 'object') return;
          const author = String(it.author || '').slice(0, 40);
          const text = String(it.text || '').slice(0, 400);
          if (!author || !text) return;
          const image = typeof it.image === 'string' && /^data:image\//.test(it.image) ? it.image : '';
          out.items.push({
            id: String(it.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7))),
            author, text, image,
            ts: Number(it.ts) || Date.now(),
            likes: Math.max(0, parseInt(it.likes, 10) || 0),
            liked: !!it.liked
          });
        });
      }
      return out;
    };

    let canStore = true;
    const load = () => {
      try { return sanitize(JSON.parse(localStorage.getItem(KEY) || 'null')); }
      catch (_) { return fresh(); }
    };
    const persist = () => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); canStore = true; return true; }
      catch (_) { canStore = false; return false; }
    };
    const state = load();

    const setLike = (li, likes, liked) => {
      const btn = $('[data-like]', li);
      if (!btn) return;
      btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
      const c = $('.like-count', btn);
      if (c) c.textContent = String(likes);
    };

    const buildItem = (it) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.commentId = it.id;
      const avatar = $('.avatar', li);
      if (avatar) avatar.textContent = it.author.trim().charAt(0).toUpperCase() || '?';
      $('.comment-author', li).textContent = it.author;
      const when = new Date(it.ts);
      $('.comment-time', li).textContent = dateFmt ? dateFmt.format(when) : when.toLocaleString();
      $('.comment-text', li).textContent = it.text;
      const img = $('.comment-image', li);
      if (img) {
        if (it.image) { img.src = it.image; img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }
      }
      setLike(li, it.likes, it.liked);
      return li;
    };

    const renderCount = () => {
      if (!counter) return;
      const n = 1 + state.items.length;
      counter.textContent = n + (n === 1 ? ' comentario' : ' comentarios');
    };
    const render = () => {
      $$('.comment:not(.is-pinned)', list).forEach((n) => n.remove());
      const frag = document.createDocumentFragment();
      state.items.forEach((it) => frag.appendChild(buildItem(it)));
      list.appendChild(frag);
      const pinned = $('.comment.is-pinned', list);
      if (pinned) setLike(pinned, state.pinned.likes, state.pinned.liked);
      renderCount();
    };

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-like]');
      if (!btn) return;
      const li = btn.closest('.comment');
      if (!li) return;
      const id = li.dataset.commentId;
      const rec = id === 'pinned' ? state.pinned : state.items.find((it) => it.id === id);
      if (!rec) return;
      rec.liked = !rec.liked;
      rec.likes = Math.max(0, rec.likes + (rec.liked ? 1 : -1));
      setLike(li, rec.likes, rec.liked);
      persist();
    });

    /* --- imagen con FileReader (se reduce para caber en localStorage) --- */
    let pendingImage = '';
    let removeBtn = null;
    const clearImage = () => {
      pendingImage = '';
      if (fileInput) fileInput.value = '';
      if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
      if (removeBtn) removeBtn.hidden = true;
    };
    if (previewWrap) {
      removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-glass btn-sm';
      removeBtn.textContent = 'Quitar imagen';
      removeBtn.hidden = true;
      removeBtn.style.marginTop = '10px';
      removeBtn.addEventListener('click', () => { clearImage(); say(''); });
      previewWrap.appendChild(removeBtn);
    }

    const shrink = (dataUrl) => new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        const MAX = 900;
        const scale = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
        if (scale === 1 && dataUrl.length < 450000) { resolve(dataUrl); return; }
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * scale));
        c.height = Math.max(1, Math.round(im.naturalHeight * scale));
        const g = c.getContext('2d');
        if (!g) { resolve(dataUrl.length < 700000 ? dataUrl : ''); return; }
        g.fillStyle = '#0b0b0e';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = () => resolve('');
      im.src = dataUrl;
    });

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) { clearImage(); return; }
        if (!/^image\//.test(file.type)) { clearImage(); say('Elige un archivo de imagen.'); return; }
        if (file.size > 8 * 1024 * 1024) { clearImage(); say('La imagen pesa más de 8 MB. Elige una más ligera.'); return; }
        const reader = new FileReader();
        reader.onerror = () => { clearImage(); say('No se pudo leer la imagen.'); };
        reader.onload = () => {
          shrink(String(reader.result)).then((url) => {
            if (!url) { clearImage(); say('No se pudo procesar esa imagen.'); return; }
            pendingImage = url;
            if (preview) { preview.src = url; preview.hidden = false; }
            if (removeBtn) removeBtn.hidden = false;
            say('');
          });
        };
        reader.readAsDataURL(file);
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const author = (form.elements.author.value || '').trim().slice(0, 40);
      const text = (form.elements.text.value || '').trim().slice(0, 400);
      if (!author || !text) { say('Escribe tu nombre y un comentario.'); return; }
      const item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        author, text, image: pendingImage, ts: Date.now(), likes: 0, liked: false
      };
      state.items.unshift(item);
      if (state.items.length > MAX_ITEMS) state.items.length = MAX_ITEMS;
      let note = 'Comentario publicado. Solo se guarda en este navegador.';
      if (!persist() && item.image) {
        item.image = '';
        note = persist()
          ? 'La imagen no cabía en el almacenamiento local; el comentario se guardó sin ella.'
          : 'No se pudo guardar en este navegador; el comentario se verá solo hasta recargar.';
      } else if (!canStore) {
        note = 'No se pudo guardar en este navegador; el comentario se verá solo hasta recargar.';
      }
      form.reset();
      clearImage();
      render();
      say(note);
    });

    render();
  }

  /* =========================================================
     13. Foco de luz en tarjetas (SpotlightCard simplificado)
     ========================================================= */
  function initSpotlight() {
    if (reduced() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    $$('.project-card, .social-card, .stat.glass, .gallery-tile[data-index], .testi-card').forEach((card) => {
      const glow = document.createElement('span');
      glow.setAttribute('aria-hidden', 'true');
      Object.assign(glow.style, {
        position: 'absolute', inset: '0', zIndex: '2', pointerEvents: 'none',
        borderRadius: 'inherit', opacity: '0', transition: 'opacity 0.3s ease'
      });
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      card.appendChild(glow);
      let ev = null;
      const paint = rafThrottle(() => {
        if (!ev) return;
        const r = card.getBoundingClientRect();
        glow.style.background = 'radial-gradient(260px circle at ' + (ev.clientX - r.left).toFixed(1) + 'px ' +
          (ev.clientY - r.top).toFixed(1) + 'px, rgba(249,115,22,0.09), rgba(249,115,22,0) 65%)';
      });
      card.addEventListener('pointermove', (e) => { ev = e; glow.style.opacity = '1'; paint(); });
      card.addEventListener('pointerleave', () => { glow.style.opacity = '0'; ev = null; });
    });
  }

  /* =========================================================
     14. Chispas al clic (ClickSpark simplificado)
     Ráfaga corta en color --accent con un canvas temporal fixed
     (pointer-events:none) por clic. Ignora el lanyard (y su margen),
     campos de formulario y modales. Apagado con prefers-reduced-motion.
     ========================================================= */
  function initClickSpark() {
    const COUNT = 8, DURATION = 450, RADIUS = 30, LENGTH = 12, WIDTH = 2, MAX_BURSTS = 8;
    const PAD = RADIUS + LENGTH + WIDTH + 4;
    const IGNORE = '#lanyard-container, input, textarea, select, [contenteditable], .modal, [role="dialog"]';
    const lanyard = $('#lanyard-container');
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#F97316';
    const bursts = [];
    let raf = 0;

    const remove = (b) => {
      b.canvas.remove();
      const i = bursts.indexOf(b);
      if (i >= 0) bursts.splice(i, 1);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      bursts.slice().forEach(remove);
    };

    const frame = (now) => {
      raf = 0;
      bursts.slice().forEach((b) => {
        const p = (now - b.start) / DURATION;
        if (p >= 1) { remove(b); return; }
        const ease = 1 - Math.pow(1 - p, 3);
        const len = LENGTH * Math.pow(1 - p, 1.6);
        const fade = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
        const ctx = b.ctx;
        ctx.clearRect(0, 0, b.size, b.size);
        ctx.globalAlpha = fade;
        ctx.beginPath();
        b.angles.forEach((a, i) => {
          const d = RADIUS * b.reach[i] * ease;
          ctx.moveTo(PAD + Math.cos(a) * d, PAD + Math.sin(a) * d);
          ctx.lineTo(PAD + Math.cos(a) * (d + len), PAD + Math.sin(a) * (d + len));
        });
        ctx.stroke();
      });
      if (bursts.length) raf = requestAnimationFrame(frame);
    };

    const spawn = (x, y) => {
      const size = PAD * 2;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.ceil(size * ratio);
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, {
        position: 'fixed', left: (x - PAD) + 'px', top: (y - PAD) + 'px',
        width: size + 'px', height: size + 'px', zIndex: '450', pointerEvents: 'none'
      });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.strokeStyle = color;
      ctx.lineWidth = WIDTH;
      ctx.lineCap = 'round';
      const turn = (Math.PI * 2) / COUNT;
      bursts.push({
        canvas, ctx, size, start: performance.now(),
        angles: Array.from({ length: COUNT }, (_, i) => turn * i + (Math.random() - 0.5) * turn * 0.4),
        reach: Array.from({ length: COUNT }, () => 1 + (Math.random() - 0.5) * 0.3)
      });
      document.body.appendChild(canvas);
      while (bursts.length > MAX_BURSTS) remove(bursts[0]);
      if (!raf) raf = requestAnimationFrame(frame);
    };

    document.addEventListener('pointerdown', (e) => {
      if (reduced() || e.button !== 0 || !e.isPrimary || e.pointerType === 'touch') return;
      if (!(e.target instanceof Element) || e.target.closest(IGNORE)) return;
      if (lanyard) {
        const r = lanyard.getBoundingClientRect();
        if (r.width && r.height && e.clientX > r.left - PAD && e.clientX < r.right + PAD &&
            e.clientY > r.top - PAD && e.clientY < r.bottom + PAD) return;
      }
      spawn(e.clientX, e.clientY);
    }, { passive: true });

    onReducedChange(() => { if (reduced()) stop(); });
  }

  /* =========================================================
     14. Revelado al hacer scroll (IntersectionObserver)
         Anima opacity + la propiedad individual `translate` (nunca
         `transform`, que usan los hover). La clase .reveal la pone este
         JS, así que sin JS todo queda visible. Con movimiento reducido
         no se aplica nada. La clase se retira en transitionend para
         devolver el control a las transiciones normales del elemento.
     ========================================================= */
  function initReveal(ready) {
    if (!('IntersectionObserver' in window)) return;
    const SELECTOR = '.section-head, .about-photo, .about-copy, .stat, .project-card, ' +
      '.security-panel, .gallery-item, .testi-card, .gallery-empty, .testi-empty, .contact-form, .social-card, .comments, .footer-col';
    const STEP_MS = 90;      // escalonado entre elementos que entran a la vez
    const MAX_STEPS = 5;
    let io = null;
    let ticket = 0;          // invalida un arranque diferido si cambia la preferencia

    const clear = (el) => {
      el.classList.remove('reveal', 'is-in');
      el.style.removeProperty('--reveal-delay');
    };

    const show = (el, delay) => {
      if (!el.classList.contains('reveal') || el.classList.contains('is-in')) return;
      el.style.setProperty('--reveal-delay', delay + 'ms');
      el.classList.add('is-in');
      let timer = 0;
      const finish = () => {
        el.removeEventListener('transitionend', onEnd);
        clearTimeout(timer);
        clear(el);
      };
      const onEnd = (e) => { if (e.target === el && e.propertyName === 'translate') finish(); };
      el.addEventListener('transitionend', onEnd);
      timer = setTimeout(finish, delay + 1400);   // respaldo si transitionend no llega
    };

    const onIntersect = (entries) => {
      const batch = [];
      entries.forEach((entry) => {
        const el = entry.target;
        if (entry.isIntersecting) {
          io.unobserve(el);
          batch.push(el);
        } else if (entry.boundingClientRect.height > 0 && entry.boundingClientRect.bottom < 0) {
          // ya quedó por encima del viewport (scroll restaurado o salto por ancla): sin animar
          io.unobserve(el);
          clear(el);
        }
      });
      batch.forEach((el, i) => show(el, Math.min(i, MAX_STEPS) * STEP_MS));
    };

    const setup = () => {
      if (io) return;
      const mine = ++ticket;
      const items = $$(SELECTOR);
      try {
        items.forEach((el) => el.classList.add('reveal'));
        io = new IntersectionObserver(onIntersect, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
        const start = () => {
          if (mine !== ticket || !io || reduced()) return;
          items.forEach((el) => io.observe(el));
        };
        // Los elementos ya quedan ocultos; se observan cuando el preloader empieza a salir.
        if (ready && typeof ready.then === 'function') ready.then(start, start); else start();
      } catch (err) {
        items.forEach(clear);
        io = null;
        throw err;
      }
    };

    const teardown = () => {
      ticket += 1;
      if (io) io.disconnect();
      io = null;
      $$('.reveal').forEach(clear);
    };

    if (!reduced()) setup();
    onReducedChange(() => { if (reduced()) teardown(); else setup(); });
  }

  /* =========================================================
     15. Títulos de sección: el degradado animado (gt-flow) se pausa
         fuera de pantalla para no repintar 4 títulos sin necesidad.
     ========================================================= */
  function initTitleFlow() {
    const titles = $$('.section-title');
    if (!titles.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-offscreen', !entry.isIntersecting));
    }, { rootMargin: '80px 0px' });
    titles.forEach((t) => io.observe(t));
  }

  /* =========================================================
     16. Fondo Aurora (#aurora-canvas)
         Port a WebGL2 puro del componente Aurora de React Bits
         (react-bits-kit/.../Backgrounds/Aurora). El original usa la
         librería ogl como módulo ESM, que no funciona en file://:
         aquí un solo canvas fijo a pantalla completa, un triángulo y el
         MISMO fragment shader (ruido simplex + rampa de color en OKLCH).
         Cálido (ámbar/naranja) y muy tenue sobre obsidiana.
         - prefers-reduced-motion: un solo fotograma estático.
         - Se pausa con document.hidden y si el lienzo no es visible.
         - devicePixelRatio <= 1.5 y además se dibuja a media resolución
           (QUALITY): es un degradado suave, el navegador lo reescala.
         - Máx. 30 fps (el movimiento es muy lento).
         - Sin WebGL2 / error de shader: elimina el canvas en silencio.
         - pointer-events:none (CSS): no bloquea clics.
     ========================================================= */
  function initAurora(ready) {
    const canvas = $('#aurora-canvas');
    if (!canvas) return;

    /* Parámetros visuales (los de Aurora; opacity/brightness lo mantienen tenue) */
    const CFG = {
      stops: ['#9A3412', '#F97316', '#F59E0B', '#C2410C'],  // naranja quemado > naranja > ámbar > naranja quemado
      amplitude: 1, blend: 0.6, speed: 0.55, height: 0.34, scale: 1, glow: 0.6,
      brightness: 0.8, layers: 2, flip: 0, opacity: 0.24,
      mouse: true, intro: 2.4,
      dprMax: 1.5, quality: 0.5, minFrameMs: 30, staticClock: 38
    };
    const MAX_STOPS = 5;
    const MAX_LAYERS = 3;

    const VERT = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

    const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uStops[${MAX_STOPS}];
uniform int uStopCount;
uniform float uAmplitude;
uniform float uBlend;
uniform float uHeight;
uniform float uScale;
uniform float uGlow;
uniform float uBrightness;
uniform int uLayers;
uniform float uFlip;
uniform vec3 uPointer;
uniform float uReveal;
uniform float uOpacity;
out vec4 outColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float smootherstep(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uStopCount - 1);
  int i = int(min(floor(x), float(uStopCount - 2)));
  float f = x - float(i);
  f = f * f * (3.0 - 2.0 * f);
  vec3 lch = mix(uStops[i], uStops[i + 1], f);
  return toSrgb(oklabToLinear(vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z))));
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float y = 1.0 - frag.y / uResolution.y;
  y = mix(y, 1.0 - y, uFlip);
  float u = frag.x / uResolution.x;
  float X = (frag.x - uResolution.x * 0.5) / uResolution.y;
  float t = uTime;
  float reach = uPointer.z * exp(-pow((X - uPointer.x) / 0.38, 2.0));

  vec3 glow = vec3(0.0);
  float cover = 0.0;
  for (int k = 0; k < ${MAX_LAYERS}; k++) {
    if (k >= uLayers) break;
    float layer = float(k);
    float seed = layer * 13.7;
    float pace = t * (1.0 - layer * 0.18);
    float warp = snoise(vec2(X * 0.45 * uScale + pace * 0.02 + seed, pace * 0.05 + seed));
    float wave = snoise(vec2(X * 0.75 * uScale + warp * 0.35 - pace * 0.03 + seed, pace * 0.07 - seed)) * 0.72
      + snoise(vec2(X * 1.6 * uScale + warp * 0.5 + pace * 0.04 - seed, pace * 0.1 + seed * 0.5)) * 0.28;
    float hem = uHeight + layer * 0.07 + wave * 0.15 * uAmplitude;
    hem += reach * 0.08 * (layer < 0.5 ? 1.0 : 0.4);
    hem = mix(-0.25, hem, uReveal);

    float soft = (0.04 + uBlend * 0.16) * (1.0 + layer * 0.9);
    float rise = hem - y;
    float low = -soft - uGlow * 0.14;
    float high = 0.26 + soft * 0.6;
    float body = pow(smootherstep(low, high, rise), 1.5 + uGlow * 0.6);
    float lobes = 0.86 + 0.14 * snoise(vec2(X * 0.9 * uScale - pace * 0.025 + seed, y * 0.3 + pace * 0.04));
    float alpha = body * lobes * (layer < 0.5 ? 1.0 : 0.32 / layer);
    alpha = clamp(alpha * (1.0 + reach * 0.25 * smootherstep(0.9, 0.0, abs(y - hem))), 0.0, 1.0);

    vec3 tint = ramp(u + 0.05 * sin(pace * 0.08 + layer * 2.3) + layer * 0.1 + max(rise, 0.0) * 0.05);
    glow = 1.0 - (1.0 - glow) * (1.0 - tint * alpha);
    cover = 1.0 - (1.0 - cover) * (1.0 - alpha);
  }

  float fade = smootherstep(0.0, 0.7, uReveal) * uOpacity;
  float strength = clamp(uBrightness, 0.0, 2.0);
  glow *= fade * min(strength, 1.0);
  cover *= fade * min(strength, 1.0);
  glow = 1.0 - pow(1.0 - glow, vec3(max(strength, 1.0)));
  float dither = (hash(frag) - 0.5) / 255.0;
  outColor = vec4(glow + dither, clamp(cover + dither, 0.0, 1.0));
}`;

    /* --- color: hex -> OKLCH (el shader interpola en OKLCH) --- */
    const hexToRgb = (hex) => {
      let h = String(hex).replace('#', '');
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16) || 0;
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };
    const toOklch = (rgb) => {
      const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      const lab = [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
      ];
      return [lab[0], Math.hypot(lab[1], lab[2]), Math.atan2(lab[2], lab[1])];
    };
    const unwrapHues = (stops) => {
      const known = stops.findIndex((s) => s[1] > 0.02);
      let previous = known === -1 ? 0 : stops[known][2];
      return stops.map((s) => {
        let hue = s[1] > 0.02 ? s[2] : previous;
        while (hue - previous > Math.PI) hue -= Math.PI * 2;
        while (hue - previous < -Math.PI) hue += Math.PI * 2;
        previous = hue;
        return [s[0], s[1], hue];
      });
    };
    const stops = CFG.stops.slice(0, MAX_STOPS);
    const palette = new Float32Array(MAX_STOPS * 3);
    unwrapHues(stops.map((c) => toOklch(hexToRgb(c)))).forEach((s, i) => palette.set(s, i * 3));

    /* --- WebGL2 --- */
    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false,
      depth: false, stencil: false, powerPreference: 'low-power'
    });
    if (!gl) { canvas.remove(); return; }

    let program = null, vao = null, buffer = null;
    const uni = {};
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh;
      gl.deleteShader(sh);
      return null;
    };
    const build = () => {
      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG);
      const prog = gl.createProgram();
      if (!vs || !fs || !prog) return false;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'aPosition');
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.deleteProgram(prog); return false; }
      program = prog;
      ['uResolution', 'uTime', 'uStops', 'uStopCount', 'uAmplitude', 'uBlend', 'uHeight', 'uScale', 'uGlow',
        'uBrightness', 'uLayers', 'uFlip', 'uPointer', 'uReveal', 'uOpacity']
        .forEach((n) => { uni[n] = gl.getUniformLocation(program, n); });
      buffer = gl.createBuffer();
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // un triángulo que cubre la pantalla
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(program);
      // uniformes que no cambian entre fotogramas
      gl.uniform3fv(uni.uStops, palette);
      gl.uniform1i(uni.uStopCount, stops.length);
      gl.uniform1f(uni.uAmplitude, CFG.amplitude);
      gl.uniform1f(uni.uBlend, CFG.blend);
      gl.uniform1f(uni.uHeight, CFG.height);
      gl.uniform1f(uni.uScale, CFG.scale);
      gl.uniform1f(uni.uGlow, CFG.glow);
      gl.uniform1f(uni.uBrightness, CFG.brightness);
      gl.uniform1i(uni.uLayers, CFG.layers);
      gl.uniform1f(uni.uFlip, CFG.flip);
      gl.uniform1f(uni.uOpacity, CFG.opacity);
      return true;
    };
    if (!build()) { canvas.remove(); return; }

    /* --- estado y fotogramas --- */
    const view = { w: 1, h: 1 };
    const pointer = { x: 0, y: 0, inside: false };
    const state = { clock: 0, px: 0, py: 0.5, reach: 0, reveal: 0 };
    let raf = 0, last = 0;
    let started = false;     // se activa cuando el preloader empieza a salir
    let visible = true;
    let lost = false;

    const render = () => {
      if (lost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uni.uResolution, canvas.width, canvas.height);
      gl.uniform1f(uni.uTime, state.clock);
      gl.uniform3f(uni.uPointer, state.px, state.py, state.reach);
      gl.uniform1f(uni.uReveal, 1 - Math.pow(1 - state.reveal, 3));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.classList.add('is-on');
    };
    const renderStatic = () => {          // movimiento reducido: un solo fotograma
      state.clock = CFG.staticClock;
      state.reveal = 1;
      state.reach = 0;
      render();
    };

    const frame = (now) => {
      raf = 0;
      if (!started || !visible || document.hidden || lost || reduced()) return;
      if (last && now - last < CFG.minFrameMs) { raf = requestAnimationFrame(frame); return; }   // tope ~30 fps
      const dt = last ? clamp((now - last) / 1000, 0.0005, 0.1) : 1 / 30;
      last = now;
      state.clock += dt * CFG.speed;
      const engaged = CFG.mouse && pointer.inside;
      const follow = 1 - Math.exp(-dt / 0.6);
      if (engaged) {
        state.px += ((pointer.x - view.w / 2) / view.h - state.px) * follow;
        state.py += ((CFG.flip ? 1 - pointer.y / view.h : pointer.y / view.h) - state.py) * follow;
      }
      state.reach += ((engaged ? 1 : 0) - state.reach) * (1 - Math.exp(-dt / (engaged ? 0.9 : 1.4)));
      if (state.reveal < 1) state.reveal = Math.min(1, state.reveal + dt / CFG.intro);
      render();
      raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (!started || lost) return;
      if (reduced()) { renderStatic(); return; }
      if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); }
    };

    const resize = () => {
      view.w = Math.max(1, canvas.clientWidth);
      view.h = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, CFG.dprMax) * CFG.quality;
      canvas.width = Math.max(1, Math.round(view.w * ratio));
      canvas.height = Math.max(1, Math.round(view.h * ratio));
      if (started) { if (reduced()) renderStatic(); else render(); }   // redimensionar borra el buffer
    };

    /* --- eventos --- */
    window.addEventListener('pointermove', (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!pointer.inside) {
        state.px = (pointer.x - view.w / 2) / view.h;
        state.py = CFG.flip ? 1 - pointer.y / view.h : pointer.y / view.h;
      }
      pointer.inside = true;
    }, { passive: true });
    window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointer.inside = false; }, { passive: true });
    window.addEventListener('pointercancel', () => { pointer.inside = false; }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointer.inside = false; });
    document.addEventListener('visibilitychange', wake);
    onReducedChange(wake);
    if ('ResizeObserver' in window) new ResizeObserver(rafThrottle(resize)).observe(canvas);
    else window.addEventListener('resize', rafThrottle(resize));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries.some((en) => en.isIntersecting);
        if (visible) wake();
      }).observe(canvas);
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      raf = 0;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      lost = false;
      if (!build()) { canvas.remove(); return; }
      resize();
      wake();
    });

    resize();
    Promise.resolve(ready).then(() => { started = true; wake(); });
  }

  /* =========================================================
     Arranque
     ========================================================= */
  function boot() {
    const ready = safe('preloader', initPreloader) || Promise.resolve();
    safe('particles', initParticles);
    safe('aurora', () => initAurora(ready));
    safe('lanyard', () => initLanyard(ready));
    safe('stats', initStats);
    safe('tabs', initTabs);
    safe('modales', initModals);
    safe('nav', initNav);
    safe('decrypt', initDecryptRing);
    safe('fable', initFable);
    safe('contacto', initContactForm);
    safe('comentarios', initComments);
    safe('spotlight', initSpotlight);
    safe('chispas', initClickSpark);
    safe('reveal', () => initReveal(ready));
    safe('titulos', initTitleFlow);
    ready.then(() => safe('typewriter', initTypewriter));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
