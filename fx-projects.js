/* =========================================================
   fx-projects.js - CardSwap (React Bits) en JS vanilla + GSAP clásico
   Convierte la cuadrícula #projects-grid (N .project-card) en una pila 3D
   compacta que rota sola cada ~4 s. Port del patrón de
   react-bits-kit/.../Components/CardSwap (pila en perspectiva, la tarjeta
   frontal cae y las demás avanzan una posición) usando vendor/gsap.min.js.

   - Las tarjetas NO se mueven de sitio en el DOM: siguen siendo hijas de
     #projects-grid, así que los ids/handlers de app.js (modal [data-open-modal],
     stats por '#projects-grid .project-card', spotlight, reveal) siguen valiendo.
   - Fallback progresivo: con prefers-reduced-motion o sin GSAP no se hace nada
     y queda la cuadrícula original. La clase de estado .is-swap la pone este JS
     sobre #panel-projects (también se activa/desactiva si cambia la preferencia).
   - Pausa con hover (mouse), foco de teclado, botón de pausa, pestaña oculta,
     fuera de pantalla y mientras hay un modal abierto.
   - Accesible: sólo la tarjeta frontal es alcanzable (las de atrás van con
     aria-hidden y tabindex=-1), botones anterior/siguiente/pausa, flechas del
     teclado y región de estado para los cambios hechos por el usuario.
   ========================================================= */
(() => {
  'use strict';

  const grid = document.getElementById('projects-grid');
  const panel = document.getElementById('panel-projects');
  if (!grid || !panel) return;

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const CFG = {
    delay: 4000,     // ms entre rotaciones automáticas
    visible: 4,      // tarjetas visibles en la pila (el resto queda oculto detrás)
    maxW: 400,       // ancho máximo de tarjeta (px de diseño)
    skew: 4,         // skewY constante de CardSwap (grados)
    depth: 64,       // separación en profundidad entre tarjetas (px)
    dim: 0.5,        // oscurecimiento máximo de las tarjetas del fondo
    dur: 0.75        // duración base de un intercambio (s)
  };

  let api = null;

  function enable() {
    if (api || mqReduce.matches) return;
    const g = window.gsap;
    if (!g || typeof g.timeline !== 'function') return;   // GSAP no cargó: cuadrícula original
    try {
      api = createSwap(g);
    } catch (err) {
      console.warn('[fx-projects] CardSwap falló, se conserva la cuadrícula:', err);
      if (api) { try { api.destroy(); } catch (_) { /* nada */ } }
      api = null;
      panel.classList.remove('is-swap');
    }
  }
  function disable() {
    if (!api) return;
    api.destroy();
    api = null;
  }

  enable();
  const onMotionPref = () => { if (mqReduce.matches) disable(); else enable(); };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMotionPref);
  else if (mqReduce.addListener) mqReduce.addListener(onMotionPref);

  /* ---------------------------------------------------------
     Pila
     --------------------------------------------------------- */
  function createSwap(gsap) {
    const cards = Array.from(grid.querySelectorAll(':scope > .project-card'));
    const n = cards.length;
    if (n < 2) return null;

    const ac = new AbortController();
    const signal = ac.signal;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const pad2 = (v) => String(v).padStart(2, '0');
    const nameOf = (card) => {
      const h = card.querySelector('.project-name');
      return (h && h.textContent.trim()) || card.dataset.repo || 'Proyecto';
    };

    /* ---- estado ---- */
    let order = cards.slice();                 // order[0] = tarjeta frontal
    const shade = new Map();                   // overlay de oscurecimiento por tarjeta
    const saved = new Map();                   // tabindex originales de los focusables
    const g = { W: 340, H: 380, dx: 28, dy: 24, dz: CFG.depth, vis: Math.min(CFG.visible, n), drop: 190, laid: false, width: 0 };
    const run = { userPaused: false, hover: false, focus: false, inView: true, modal: false };
    let tl = null;           // timeline del intercambio en curso
    let timer = null;        // tween de progreso: al completar, siguiente tarjeta
    let animating = false;
    let queue = [];
    let suppressClick = false;
    let live = null;

    /* ---- UI (se inserta por JS: sin JS/GSAP no existe) ---- */
    panel.classList.add('is-swap');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-roledescription', 'pila de proyectos');
    grid.setAttribute('aria-label', 'Proyectos de GitHub');

    const ui = document.createElement('div');
    ui.className = 'fx-swap-ui';
    ui.setAttribute('role', 'group');
    ui.setAttribute('aria-label', 'Controles de la pila de proyectos');
    ui.innerHTML =
      '<p class="fx-swap-kicker mono-tag">Proyecto</p>' +
      '<p class="fx-swap-count"><span class="fx-swap-n">01</span><span class="fx-swap-sep" aria-hidden="true">/</span><span class="fx-swap-total">' + pad2(n) + '</span></p>' +
      '<div class="fx-swap-bar" aria-hidden="true"><span></span></div>' +
      '<div class="fx-swap-controls">' +
        '<button class="btn btn-glass fx-swap-btn fx-swap-prev" type="button" aria-label="Proyecto anterior"><svg class="icon" aria-hidden="true" focusable="false"><use href="#i-arrow"/></svg></button>' +
        '<button class="btn btn-glass fx-swap-btn fx-swap-next" type="button" aria-label="Proyecto siguiente"><svg class="icon" aria-hidden="true" focusable="false"><use href="#i-arrow"/></svg></button>' +
        '<button class="btn btn-glass fx-swap-btn fx-swap-toggle" type="button" aria-label="Pausar rotación automática"><span class="fx-swap-glyph" aria-hidden="true"></span></button>' +
      '</div>' +
      '<p class="fx-swap-hint"></p>' +
      '<p class="visually-hidden fx-swap-live" role="status" aria-live="polite" aria-atomic="true"></p>';
    grid.after(ui);

    const elN = ui.querySelector('.fx-swap-n');
    const elBar = ui.querySelector('.fx-swap-bar > span');
    const btnPrev = ui.querySelector('.fx-swap-prev');
    const btnNext = ui.querySelector('.fx-swap-next');
    const btnToggle = ui.querySelector('.fx-swap-toggle');
    const elHint = ui.querySelector('.fx-swap-hint');
    live = ui.querySelector('.fx-swap-live');
    elHint.textContent = finePointer
      ? 'Pasa el cursor para pausar. Haz clic en una tarjeta de atrás para traerla al frente.'
      : 'Desliza la tarjeta o usa los botones para cambiar de proyecto.';

    /* overlay de sombra + gestión de focusables por tarjeta */
    cards.forEach((card) => {
      const s = document.createElement('span');
      s.className = 'fx-swap-shade';
      s.setAttribute('aria-hidden', 'true');
      card.appendChild(s);
      shade.set(card, s);
      saved.set(card, Array.from(card.querySelectorAll('a[href], button, [tabindex]')).map((el) => ({
        el, had: el.hasAttribute('tabindex'), val: el.getAttribute('tabindex')
      })));
    });

    /* ---- geometría ---- */
    const slot = (p) => {
      const q = Math.min(p, g.vis);                   // p >= vis comparten la posición oculta
      const c = (g.vis - 1) / 2;                      // centra la pila en el escenario
      return { x: (q - c) * g.dx, y: -(q - c) * g.dy, z: -q * g.dz };
    };
    const alphaOf = (p) => (p < g.vis ? 1 : 0);
    const dimOf = (p) => (p >= g.vis ? CFG.dim : CFG.dim * Math.min(1, p / Math.max(1, g.vis - 1)));
    const zOf = (p) => (p < g.vis ? 100 - p : 1);

    function computeGeometry() {
      const avail = grid.clientWidth;
      if (!avail) return false;
      const small = avail < 520;
      g.vis = Math.min(CFG.visible, n);
      g.dx = small ? 11 : 32;
      g.dy = small ? 15 : 24;
      g.dz = small ? 52 : CFG.depth;
      g.W = Math.max(200, Math.min(CFG.maxW, avail - (g.vis - 1) * g.dx - 6));
      g.H = Math.round(g.W / 2 + (g.W < 300 ? 222 : 192));
      g.drop = Math.round(g.H * 0.46);
      g.width = avail;
      const stageH = g.H + (g.vis - 1) * g.dy + 44;
      grid.style.setProperty('--fx-w', g.W + 'px');
      grid.style.setProperty('--fx-h', g.H + 'px');
      grid.style.setProperty('--fx-stage-h', stageH + 'px');
      g.laid = true;
      return true;
    }

    function placeAll() {
      order.forEach((card, p) => {
        const s = slot(p);
        gsap.set(card, {
          x: s.x, y: s.y, z: s.z, xPercent: -50, yPercent: -50,
          skewY: CFG.skew, transformOrigin: '50% 50%', zIndex: zOf(p),
          autoAlpha: alphaOf(p), force3D: true
        });
        gsap.set(shade.get(card), { opacity: dimOf(p) });
      });
    }

    /* ---- estado accesible / contador ---- */
    function syncFront(announce) {
      const front = order[0];
      cards.forEach((card) => {
        const isFront = card === front;
        card.toggleAttribute('data-front', isFront);
        if (isFront) card.removeAttribute('aria-hidden'); else card.setAttribute('aria-hidden', 'true');
        saved.get(card).forEach((f) => {
          if (isFront) { if (f.had) f.el.setAttribute('tabindex', f.val); else f.el.removeAttribute('tabindex'); }
          else f.el.setAttribute('tabindex', '-1');
        });
      });
      const idx = cards.indexOf(front) + 1;
      elN.textContent = pad2(idx);
      if (announce) live.textContent = 'Proyecto ' + idx + ' de ' + n + ': ' + nameOf(front);
    }

    /* ---- intercambio ---- */
    function build(dir, speed) {
      const d = CFG.dur;
      const t = gsap.timeline({ onComplete: done });
      if (dir > 0) {
        const front = order[0];
        const s0 = slot(0);
        // 1) la frontal cae y se desvanece
        t.set(front, { zIndex: 200 }, 0);
        t.to(front, { y: s0.y + g.drop, duration: d * 0.85, ease: 'power2.in' }, 0);
        t.to(front, { autoAlpha: 0, duration: d * 0.5, ease: 'power1.in' }, d * 0.32);
        // 2) el resto avanza una posición (p_nuevo = i)
        const at0 = d * 0.34;
        order.slice(1).forEach((card, i) => {
          if (i >= g.vis) return;                       // sigue oculta en el mismo sitio
          const s = slot(i);
          const at = at0 + i * 0.07;
          t.set(card, { zIndex: zOf(i) }, at);
          t.to(card, { x: s.x, y: s.y, z: s.z, autoAlpha: alphaOf(i), duration: d, ease: 'power2.inOut' }, at);
          t.to(shade.get(card), { opacity: dimOf(i), duration: d, ease: 'power2.inOut' }, at);
        });
        // 3) la que cayó se recoloca detrás (oculta si no cabe en la pila visible)
        const pEnd = n - 1;
        const sEnd = slot(pEnd);
        const atRet = d * 0.9;
        if (pEnd < g.vis) {
          t.set(front, { x: sEnd.x, y: sEnd.y + g.drop * 0.5, z: sEnd.z, zIndex: zOf(pEnd) }, atRet);
          t.to(front, { y: sEnd.y, autoAlpha: 1, duration: d * 0.7, ease: 'power2.out' }, atRet);
          t.to(shade.get(front), { opacity: dimOf(pEnd), duration: d * 0.7 }, atRet);
        } else {
          t.set(front, { x: sEnd.x, y: sEnd.y, z: sEnd.z, zIndex: 1, autoAlpha: 0 }, atRet);
          t.set(shade.get(front), { opacity: CFG.dim }, atRet);
        }
      } else {
        const last = order[n - 1];
        const s0 = slot(0);
        // la última entra desde abajo hasta el frente
        t.set(last, { x: s0.x, y: s0.y + g.drop, z: s0.z, zIndex: zOf(0), autoAlpha: 0 }, 0);
        t.set(shade.get(last), { opacity: 0 }, 0);
        t.to(last, { y: s0.y, autoAlpha: 1, duration: d * 0.9, ease: 'power2.out' }, 0.12);
        // el resto retrocede una posición (p_nuevo = i + 1)
        order.slice(0, n - 1).forEach((card, i) => {
          const pNew = i + 1;
          if (i >= g.vis) return;                       // ya estaba oculta
          const s = slot(pNew);
          t.set(card, { zIndex: zOf(pNew) }, 0);
          t.to(card, { x: s.x, y: s.y, z: s.z, autoAlpha: alphaOf(pNew), duration: d, ease: 'power2.inOut' }, i * 0.05);
          t.to(shade.get(card), { opacity: dimOf(pNew), duration: d, ease: 'power2.inOut' }, i * 0.05);
        });
      }
      t.timeScale(speed || 1);
      return t;
    }

    function shift(dir, speed, byUser) {
      if (n < 2) return;
      stopTimer();
      animating = true;
      // el orden lógico (y la UI) cambia al empezar; GSAP anima hacia ese estado
      const prevOrder = order;
      tl = build(dir, speed);
      order = dir > 0 ? prevOrder.slice(1).concat(prevOrder[0]) : [prevOrder[n - 1]].concat(prevOrder.slice(0, n - 1));
      // si el foco estaba dentro de una tarjeta que deja de ser frontal, se mueve al escenario
      const ae = document.activeElement;
      const lostFocus = ae && ae !== document.body && cards.some((c) => c !== order[0] && c.contains(ae));
      syncFront(byUser);
      if (lostFocus) { grid.tabIndex = -1; grid.focus({ preventScroll: true }); }
    }

    function done() {
      animating = false;
      tl = null;
      if (queue.length) { const j = queue.shift(); shift(j.dir, j.speed, j.byUser); return; }
      armTimer();
    }

    function request(dir, speed, byUser) {
      if (animating) { if (queue.length < 3) queue.push({ dir, speed, byUser }); return; }
      shift(dir, speed, byUser);
    }

    function goTo(card) {
      const k = order.indexOf(card);
      if (k < 1 || k >= g.vis || animating || queue.length) return;
      for (let i = 0; i < k; i++) request(1, k > 1 ? 1.9 : 1.25, true);
    }

    /* ---- autoplay (tween de progreso = temporizador pausable) ---- */
    function canRun() {
      return !run.userPaused && !run.hover && !run.focus && run.inView && !document.hidden && !run.modal && !animating;
    }
    function stopTimer() {
      if (timer) { timer.kill(); timer = null; }
      gsap.set(elBar, { scaleX: 0 });
    }
    function armTimer() {
      if (timer) timer.kill();
      gsap.set(elBar, { scaleX: 0 });
      timer = gsap.to(elBar, {
        scaleX: 1, duration: CFG.delay / 1000, ease: 'none', paused: !canRun(),
        onComplete: () => { timer = null; if (canRun()) request(1, 1, false); else armTimer(); }
      });
    }
    function syncPlayback() {
      if (!timer) return;
      if (canRun()) timer.resume(); else timer.pause();
    }

    /* ---- eventos ---- */
    btnNext.addEventListener('click', () => request(1, 1, true), { signal });
    btnPrev.addEventListener('click', () => request(-1, 1, true), { signal });
    btnToggle.addEventListener('click', () => {
      run.userPaused = !run.userPaused;
      btnToggle.classList.toggle('is-paused', run.userPaused);
      btnToggle.setAttribute('aria-label', run.userPaused ? 'Reanudar rotación automática' : 'Pausar rotación automática');
      live.textContent = run.userPaused ? 'Rotación automática en pausa.' : 'Rotación automática activada.';
      syncPlayback();
    }, { signal });

    // Clic en una tarjeta de atrás: se trae al frente (y se bloquean sus botones internos)
    grid.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
      const card = e.target.closest && e.target.closest('.project-card');
      if (!card || card === order[0]) return;
      e.preventDefault();
      e.stopPropagation();
      goTo(card);
    }, { capture: true, signal });

    // Flechas del teclado dentro del componente
    panel.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); request(1, 1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); request(-1, 1, true); }
    }, { signal });

    // Pausa por hover (sólo mouse/lápiz: en táctil el hover emulado se quedaría pegado)
    panel.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; run.hover = true; syncPlayback(); }, { signal });
    panel.addEventListener('pointerleave', (e) => { if (e.pointerType === 'touch') return; run.hover = false; syncPlayback(); }, { signal });
    // Pausa por foco de teclado (:focus-visible), no por un clic con el mouse
    panel.addEventListener('focusin', (e) => {
      try { run.focus = e.target.matches(':focus-visible'); } catch (_) { run.focus = true; }
      syncPlayback();
    }, { signal });
    panel.addEventListener('focusout', () => { run.focus = false; syncPlayback(); }, { signal });
    document.addEventListener('visibilitychange', syncPlayback, { signal });

    // Deslizar con el dedo (táctil/lápiz)
    let swipe = null;
    grid.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
    }, { signal });
    grid.addEventListener('pointerup', (e) => {
      if (!swipe || swipe.id !== e.pointerId) return;
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 350);
        request(dx < 0 ? 1 : -1, 1, true);
      }
    }, { signal });
    grid.addEventListener('pointercancel', () => { swipe = null; }, { signal });

    // Parallax suave: el punto de fuga sigue al cursor (como el CardSwap original)
    if (finePointer) {
      const po = { x: 50, y: 50 };
      const apply = () => { grid.style.perspectiveOrigin = po.x.toFixed(2) + '% ' + po.y.toFixed(2) + '%'; };
      let pending = null;
      grid.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        pending = e;
        if (grid._fxRaf) return;
        grid._fxRaf = requestAnimationFrame(() => {
          grid._fxRaf = 0;
          const r = grid.getBoundingClientRect();
          if (!pending || !r.width || !r.height) return;
          const nx = Math.min(1, Math.max(0, (pending.clientX - r.left) / r.width));
          const ny = Math.min(1, Math.max(0, (pending.clientY - r.top) / r.height));
          gsap.to(po, { x: 50 + (nx - 0.5) * 30, y: 50 + (ny - 0.5) * 22, duration: 0.8, ease: 'power3.out', overwrite: true, onUpdate: apply });
        });
      }, { signal });
      grid.addEventListener('pointerleave', () => {
        gsap.to(po, { x: 50, y: 50, duration: 1, ease: 'power3.out', overwrite: true, onUpdate: apply });
      }, { signal });
    }

    /* ---- observadores ---- */
    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
        run.inView = entries.some((en) => en.isIntersecting);
        syncPlayback();
      }, { threshold: 0.12 })
      : null;
    if (io) io.observe(grid);

    const modals = Array.from(document.querySelectorAll('.modal'));
    const checkModal = () => { run.modal = modals.some((m) => m.classList.contains('is-open')); syncPlayback(); };
    const mo = 'MutationObserver' in window ? new MutationObserver(checkModal) : null;
    if (mo) modals.forEach((m) => mo.observe(m, { attributes: true, attributeFilter: ['class'] }));

    /* ---- layout (el escenario mide 0 mientras la pestaña está oculta) ---- */
    function relayout() {
      if (!grid.clientWidth) return;
      if (g.laid && grid.clientWidth === g.width) return;
      if (tl) { tl.kill(); tl = null; }
      animating = false;
      queue = [];
      computeGeometry();
      placeAll();
      syncFront(false);
      armTimer();
    }
    const ro = 'ResizeObserver' in window ? new ResizeObserver(relayout) : null;
    if (ro) ro.observe(grid);
    else window.addEventListener('resize', relayout, { signal });

    computeGeometry();
    placeAll();
    syncFront(false);
    armTimer();

    /* ---- limpieza (reduced-motion en caliente) ---- */
    function destroy() {
      ac.abort();
      if (io) io.disconnect();
      if (mo) mo.disconnect();
      if (ro) ro.disconnect();
      if (tl) tl.kill();
      if (timer) timer.kill();
      gsap.killTweensOf(grid);
      cards.forEach((card) => {
        gsap.killTweensOf(card);
        gsap.set(card, { clearProps: 'transform,x,y,z,xPercent,yPercent,skewY,transformOrigin,opacity,visibility,zIndex' });
        card.removeAttribute('data-front');
        card.removeAttribute('aria-hidden');
        saved.get(card).forEach((f) => {
          if (f.had) f.el.setAttribute('tabindex', f.val); else f.el.removeAttribute('tabindex');
        });
        const s = shade.get(card);
        if (s) { gsap.killTweensOf(s); s.remove(); }
      });
      cancelAnimationFrame(grid._fxRaf || 0);
      grid._fxRaf = 0;
      ['--fx-w', '--fx-h', '--fx-stage-h'].forEach((v) => grid.style.removeProperty(v));
      grid.style.removeProperty('perspective-origin');
      grid.removeAttribute('role');
      grid.removeAttribute('aria-roledescription');
      grid.removeAttribute('aria-label');
      grid.removeAttribute('tabindex');
      ui.remove();
      panel.classList.remove('is-swap');
    }

    return { destroy };
  }
})();
