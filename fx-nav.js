/* =========================================================
   fx-nav.js — GooeyNav + Crosshair (React Bits, port a JS vanilla)
   Fuente: react-bits-kit/.../Components/GooeyNav y Animations/Crosshair.
   Sin dependencias, sin CDN, funciona con doble clic (file://).

   1. GooeyNav sobre <nav class="nav-pill"> del header:
      - Construye los items LEYENDO los <a> que haya en el DOM (si otro
        agente añade uno, p. ej. "Música", aparece solo: un MutationObserver
        reconstruye la barra).
      - El estado activo lo sigue marcando initNav (app.js) con la clase
        .is-active y aria-current="location"; aquí sólo se OBSERVA ese estado
        y se anima la gota hacia el nuevo item.
      - Motor WebGL2 (campo de distancia firmado + metaballs) igual que el
        original; si no hay WebGL2 queda una píldora CSS que se desliza.
      - prefers-reduced-motion: sin partículas ni gooey, cambio de estado seco.
   2. Crosshair: líneas guía que siguen al cursor con lerp. Sólo con
      puntero fino (hover + pointer:fine) y sin movimiento reducido.
   Los <a> reales se MUEVEN (no se clonan): conservan ids, href, listeners y las
   referencias que initNav guardó al arrancar.
   ========================================================= */
(function () {
  'use strict';

  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(RM && RM.matches);
  const listen = (mql, fn) => {
    if (!mql) return;
    if (mql.addEventListener) mql.addEventListener('change', fn);
    else if (mql.addListener) mql.addListener(fn);
  };
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const safe = (name, fn) => {
    try { return fn(); } catch (err) { console.warn('[fx-nav] ' + name + ' no se pudo iniciar:', err); return null; }
  };

  /* =========================================================
     1. GooeyNav
     ========================================================= */
  const MAX_DROPS = 32;
  const MAX_PILLS = 4;
  const MARGIN = 72;   // el lienzo sobresale 72px de la barra para que las gotas salgan de ella

  const SETTINGS = {
    animationTime: 600,   // ms base del vuelo de cada gota
    particleCount: 12,    // gotas por cambio (escala con la masa que sale)
    timeVariance: 300,
    spread: 30,           // alcance de las gotas (px); contenido: la barra mide ~50px de alto
    gooeyness: 0.5,
    wobble: 0.5,
    hoverEffect: true,
    shadow: 0.28          // la sombra queda por encima del texto vecino: más suave que el 0.4 original
  };

  const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

  const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 uSize;
uniform float uRatio;
uniform vec4 uPills[${MAX_PILLS}];
uniform vec4 uHover;
uniform vec4 uDrops[${MAX_DROPS}];
uniform vec2 uTails[${MAX_DROPS}];
uniform vec3 uTints[${MAX_DROPS}];
uniform int uCount;
uniform float uSmooth;
uniform vec3 uPill;
uniform vec4 uHoverColor;
uniform float uShadow;

out vec4 outColor;

float sdPill(vec2 p, vec4 box) {
  vec2 extent = max(box.zw, vec2(0.0));
  float r = min(extent.x, extent.y);
  vec2 q = abs(p - box.xy) - extent + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

vec4 blend(vec4 a, vec4 b, float k) {
  float h = clamp(0.5 + 0.5 * (b.w - a.w) / k, 0.0, 1.0);
  return vec4(mix(b.rgb, a.rgb, h), mix(b.w, a.w, h) - k * h * (1.0 - h));
}

vec4 field(vec2 p) {
  vec4 shape = vec4(uPill, 1e5);
  for (int i = 0; i < ${MAX_PILLS}; i++) {
    vec4 pill = uPills[i];
    if (pill.z <= 0.0) continue;
    shape = blend(shape, vec4(uPill, sdPill(p, pill)), uSmooth);
  }
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uCount) break;
    vec4 drop = uDrops[i];
    if (drop.z <= 0.0) continue;
    float d = sdCapsule(p, drop.xy, drop.xy - uTails[i], drop.z);
    if (d > shape.w + uSmooth) continue;
    shape = blend(shape, vec4(uTints[i], d), uSmooth);
  }
  return shape;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y * uRatio - gl_FragCoord.y) / uRatio;
  vec4 shape = field(p);
  float d = shape.w;
  float aa = max(fwidth(d), 0.35);
  float body = clamp(0.5 - d / aa, 0.0, 1.0);

  vec2 grad = vec2(dFdx(d), -dFdy(d));
  vec2 n = length(grad) > 0.0001 ? normalize(grad) : vec2(0.0, 1.0);
  float rim = (1.0 - smoothstep(0.0, 1.6, -d)) * max(0.0, -n.y) * 0.3;
  vec3 fill = mix(shape.rgb, vec3(1.0), rim) * (1.0 - 0.06 * max(0.0, n.y) * (1.0 - smoothstep(0.0, 6.0, -d)));

  float lifted = field(p - vec2(0.0, 3.0)).w;
  float shadow = (1.0 - smoothstep(-3.0, 9.0, lifted)) * uShadow * (1.0 - body);

  float hover = clamp(0.5 - sdPill(p, uHover) / aa, 0.0, 1.0) * uHoverColor.a;

  vec4 color = vec4(0.0, 0.0, 0.0, shadow);
  color = vec4(uHoverColor.rgb * hover, hover) + color * (1.0 - hover);
  color = vec4(fill * body, body) + color * (1.0 - body);
  outColor = color;
}
`;

  const UNIFORMS = ['uSize', 'uRatio', 'uPills', 'uHover', 'uDrops', 'uTails', 'uTints',
    'uCount', 'uSmooth', 'uPill', 'uHoverColor', 'uShadow'];

  /* "#rgb", "#rrggbb" o "rgb(a)(...)" -> [r, g, b, a] en 0..1 */
  function parseColor(value, fallback) {
    const s = String(value || '').trim();
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (hex) {
      const h = hex[1].length === 3 ? hex[1].replace(/./g, (d) => d + d) : hex[1];
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(1);
    }
    const rgb = /rgba?\(([^)]+)\)/i.exec(s);
    if (rgb) {
      const p = rgb[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
      return [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1];
    }
    return fallback || [1, 1, 1, 1];
  }

  const travelEase = (t) => {
    const x = clamp01(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };
  const bezier = (a, b, c, d, t) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };
  const pillPath = (x, y, w, h) => {
    if (w <= 0.5 || h <= 0.5) return '';
    const r = Math.min(w, h) / 2;
    return 'M' + (x + r) + ',' + y + 'H' + (x + w - r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + w) + ',' + (y + r) +
      'V' + (y + h - r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + w - r) + ',' + (y + h) +
      'H' + (x + r) + 'A' + r + ',' + r + ' 0 0 1 ' + x + ',' + (y + h - r) +
      'V' + (y + r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + r) + ',' + y + 'Z';
  };

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  /* Programa + buffer; null si el shader no compila o no enlaza (entonces entra la píldora CSS) */
  function buildPipeline(gl) {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    const uniforms = {};
    UNIFORMS.forEach((name) => { uniforms[name] = gl.getUniformLocation(program, name); });
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return { program, uniforms, buffer, position: gl.getAttribLocation(program, 'aPosition') };
  }

  /* ---------------------------------------------------------
     Motor de una barra ya construida.
     parts = { nav, stage, track, canvas, fallback, list, overlay }
     Devuelve { go(i), refresh(), remeasure(), destroy() }
     --------------------------------------------------------- */
  function createGooey(parts, initialIndex, colors) {
    const { nav, track, canvas, fallback, list, overlay } = parts;
    const S = SETTINGS;
    const pillRgb = colors.pill;
    const tints = colors.tints;
    const hoverRgb = [1, 1, 1, 0.08];

    let gl = null;
    try {
      gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    } catch (e) { gl = null; }
    let pipeline = gl ? buildPipeline(gl) : null;
    const useFallback = () => {
      pipeline = null;
      nav.classList.add('gn-nogl');
      fallback.style.display = 'block';
      canvas.style.display = 'none';
    };
    if (pipeline) {
      fallback.style.display = 'none';
      canvas.style.display = 'block';
      nav.classList.remove('gn-nogl');
    } else {
      useFallback();
    }

    /* ml/mt/mr/mb = cuánto sobresale el lienzo por cada lado (nunca más allá del viewport) */
    const view = { width: 0, height: 0, ml: MARGIN, mt: MARGIN, mr: MARGIN, mb: MARGIN };
    let rects = [];
    let target = -1;
    const pills = new Map();
    const drops = [];
    const hover = { x: 0, y: 0, w: 0, h: 0, alpha: 0, index: -1 };
    const pillData = new Float32Array(MAX_PILLS * 4);
    const dropData = new Float32Array(MAX_DROPS * 4);
    const tailData = new Float32Array(MAX_DROPS * 2);
    const tintData = new Float32Array(MAX_DROPS * 3);
    let raf = 0;
    let last = 0;
    let disposed = false;
    let wantIndex = initialIndex;

    const measure = () => {
      const box = track.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      /* En modo scroll (barra más ancha que su hueco) el lienzo se ajusta al track sin margen:
         un lienzo que sobresale ampliaría el área desplazable. Fuera de ese modo sobresale hasta
         MARGIN px por lado, recortado al viewport para no crear desbordes horizontales (320px). */
      const scrolling = nav.classList.contains('gn-scroll');
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = window.innerHeight;
      const room = (v) => (scrolling ? 4 : Math.max(0, Math.min(MARGIN, Math.floor(v))));   // 4 = relleno del stage en modo scroll
      view.width = box.width;
      view.height = box.height;
      view.ml = room(box.left);
      view.mt = room(box.top);
      view.mr = room(vw - box.right);
      view.mb = room(vh - box.bottom);
      const outerWidth = box.width + view.ml + view.mr;
      const outerHeight = box.height + view.mt + view.mb;
      canvas.style.left = -view.ml + 'px';
      canvas.style.top = -view.mt + 'px';
      canvas.style.width = outerWidth + 'px';
      canvas.style.height = outerHeight + 'px';
      const width = Math.max(1, Math.round(outerWidth * ratio));
      const height = Math.max(1, Math.round(outerHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      rects = Array.prototype.map.call(list.children, (item) => {
        const r = item.getBoundingClientRect();
        return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
      });
    };

    /* Contorno CPU del mismo campo que dibuja el shader: sirve de clip-path para que el
       texto de color "activo" (overlay) sólo se vea DENTRO de la gota. */
    const trace = (boxes, blobs, smooth) => {
      const field = (x, y) => {
        let d = 1e5;
        const merge = (value) => {
          const h = clamp01(0.5 + (0.5 * (value - d)) / smooth);
          d = value + (d - value) * h - smooth * h * (1 - h);
        };
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          const r = Math.min(b.hw, b.hh);
          const qx = Math.abs(x - b.cx) - b.hw + r;
          const qy = Math.abs(y - b.cy) - b.hh + r;
          merge(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
        }
        for (let i = 0; i < blobs.length; i++) {
          const blob = blobs[i];
          const px = x - blob.x;
          const py = y - blob.y;
          const bx = -blob.tx;
          const by = -blob.ty;
          const span = bx * bx + by * by;
          const h = span > 0.0001 ? clamp01((px * bx + py * by) / span) : 0;
          const value = Math.hypot(px - bx * h, py - by * h) - blob.r;
          if (value > d + smooth) continue;
          merge(value);
        }
        return d;
      };
      const step = 2;
      const parts2 = [];
      for (let y = 0; y < view.height; y += 1) {
        const cy = y + 0.5;
        let previous = field(0, cy);
        let start = previous < 0 ? 0 : null;
        for (let x = step; x <= view.width + step; x += step) {
          const value = field(Math.min(x, view.width), cy);
          if ((previous < 0) !== (value < 0)) {
            const cross = x - step + (step * previous) / (previous - value);
            if (value < 0) start = cross;
            else if (start !== null) {
              parts2.push('M' + start.toFixed(1) + ',' + y + 'H' + cross.toFixed(1) + 'V' + (y + 1) + 'H' + start.toFixed(1) + 'Z');
              start = null;
            }
          }
          previous = value;
        }
        if (start !== null) parts2.push('M' + start.toFixed(1) + ',' + y + 'H' + view.width + 'V' + (y + 1) + 'H' + start.toFixed(1) + 'Z');
      }
      return parts2.join('');
    };

    const pill = (index) => {
      if (!pills.has(index)) pills.set(index, { mass: 0, scale: 0, velocity: 0, outgoing: 0 });
      return pills.get(index);
    };

    const shape = (index, amount) => {
      const rect = rects[index];
      if (!rect || amount <= 0.002) return null;
      const h = rect.h * Math.min(1.08, 0.42 + 0.58 * Math.sqrt(Math.max(0, amount)));
      const w = Math.max(h, rect.w * Math.pow(Math.max(0, amount), 0.75));
      return { x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, w: w, h: h };
    };

    /* Trayectoria bézier de una gota hacia el item `index` */
    const plan = (drop, index, now, fresh) => {
      const rect = rects[index];
      if (!rect) return;
      const reach = Math.max(0, S.spread);
      const ex = rect.x + rect.w / 2 + (Math.random() - 0.5) * rect.w * 0.45;
      const ey = rect.y + rect.h / 2 + (Math.random() - 0.5) * rect.h * 0.2;
      const base = Math.max(0.15, S.animationTime / 1000);
      const variance = (Math.random() - 0.5) * (Math.max(0, S.timeVariance) / 1000);
      const duration = Math.max(0.15, base * (0.62 + Math.random() * 0.32) + variance * 0.6);
      const out = Math.random() * Math.PI * 2;
      const into = Math.random() * Math.PI * 2;
      const burst = reach * (0.7 + Math.random() * 0.6);
      const swing = reach * (0.55 + Math.random() * 0.55);
      const carry = Math.min(duration / 3, 0.12);
      drop.index = index;
      drop.start = now;
      drop.duration = duration;
      drop.path = [
        drop.x,
        drop.y,
        fresh ? drop.x + Math.cos(out) * burst * 1.6 : drop.x + drop.vx * carry,
        fresh ? drop.y + Math.sin(out) * burst * 1.6 : drop.y + drop.vy * carry,
        ex + Math.cos(into) * swing * 1.5,
        ey + Math.sin(into) * swing * 1.5,
        ex,
        ey
      ];
    };

    /* La gota "sangra" masa del item de origen y la lleva al destino */
    const emit = (from, to, now) => {
      const source = pills.get(from);
      const rect = rects[from];
      if (!source || !rect || !rects[to]) return;
      const available = source.mass - source.outgoing;
      if (available <= 0.002) return;
      const room = MAX_DROPS - drops.length;
      const count = Math.min(room, Math.max(1, Math.round(Math.max(1, S.particleCount) * available)));
      if (count <= 0) return;
      const span = Math.max(0.15, S.animationTime / 1000) * 0.16;
      for (let i = 0; i < count; i++) {
        const mass = available / count;
        source.outgoing += mass;
        drops.push({
          x: rect.x + rect.w / 2 + (Math.random() - 0.5) * rect.w * 0.6,
          y: rect.y + rect.h / 2 + (Math.random() - 0.5) * rect.h * 0.3,
          vx: 0,
          vy: 0,
          mass: mass,
          size: 0.8 + Math.random() * 0.4,
          given: 0,
          source: from,
          index: to,
          leave: now + Math.random() * span * 1000,
          emerged: 0,
          absorbed: 0,
          state: 'waiting',
          tint: tints.length ? tints[Math.floor(Math.random() * tints.length)] : null
        });
      }
    };

    const render = () => {
      const height = rects[target] ? rects[target].h : (rects[0] ? rects[0].h : 36);
      const smooth = height * (0.18 + 0.5 * clamp01(S.gooeyness));
      const boxes = [];
      const blobs = [];
      pills.forEach((state, index) => {
        const b = shape(index, state.scale);
        if (b) boxes.push({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, hw: b.w / 2, hh: b.h / 2 });
      });
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        if (drop.state === 'waiting') continue;
        const radius = 0.26 * height * drop.size * Math.min(drop.emerged, 1 - drop.absorbed);
        if (radius <= 0.05) continue;
        const speed = Math.hypot(drop.vx, drop.vy);
        const length = Math.min(radius * 1.1, speed * 0.018);
        blobs.push({
          x: drop.x,
          y: drop.y,
          r: radius,
          tx: speed > 0.01 ? (drop.vx / speed) * length : 0,
          ty: speed > 0.01 ? (drop.vy / speed) * length : 0,
          tint: drop.tint
        });
      }

      /* clip-path del overlay: píldora exacta en reposo, contorno trazado mientras hay gotas */
      if (boxes.length === 1 && !blobs.length) {
        const b = boxes[0];
        overlay.style.clipPath = "path('" + pillPath(b.cx - b.hw, b.cy - b.hh, b.hw * 2, b.hh * 2) + "')";
      } else {
        overlay.style.clipPath = "path('" + (trace(boxes, blobs, smooth) || 'M0,0Z') + "')";
      }
      overlay.style.visibility = 'visible';

      if (!pipeline || !gl) {
        const b = shape(target, 1);
        if (b) {
          fallback.style.transform = 'translate(' + b.x.toFixed(2) + 'px, ' + b.y.toFixed(2) + 'px)';
          fallback.style.width = b.w + 'px';
          fallback.style.height = b.h + 'px';
        }
        fallback.style.opacity = b ? '1' : '0';
        return;
      }

      const ml = view.ml;
      const mt = view.mt;
      const outerW = view.width + ml + view.mr;
      const outerH = view.height + mt + view.mb;
      let slot = 0;
      for (let i = 0; i < boxes.length && slot < MAX_PILLS; i++, slot++) {
        pillData[slot * 4] = boxes[i].cx + ml;
        pillData[slot * 4 + 1] = boxes[i].cy + mt;
        pillData[slot * 4 + 2] = boxes[i].hw;
        pillData[slot * 4 + 3] = boxes[i].hh;
      }
      pillData.fill(0, slot * 4);
      let count = 0;
      for (let i = 0; i < blobs.length && count < MAX_DROPS; i++, count++) {
        const blob = blobs[i];
        dropData[count * 4] = blob.x + ml;
        dropData[count * 4 + 1] = blob.y + mt;
        dropData[count * 4 + 2] = blob.r;
        dropData[count * 4 + 3] = 0;
        tailData[count * 2] = blob.tx;
        tailData[count * 2 + 1] = blob.ty;
        const tint = blob.tint || pillRgb;
        tintData[count * 3] = tint[0];
        tintData[count * 3 + 1] = tint[1];
        tintData[count * 3 + 2] = tint[2];
      }

      const u = pipeline.uniforms;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(pipeline.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, pipeline.buffer);
      gl.enableVertexAttribArray(pipeline.position);
      gl.vertexAttribPointer(pipeline.position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(u.uSize, outerW, outerH);
      gl.uniform1f(u.uRatio, canvas.width / Math.max(1, outerW));
      gl.uniform4fv(u.uPills, pillData);
      gl.uniform4f(u.uHover, hover.x + ml, hover.y + mt, hover.w / 2, hover.h / 2);
      gl.uniform4fv(u.uDrops, dropData);
      gl.uniform2fv(u.uTails, tailData);
      gl.uniform3fv(u.uTints, tintData);
      gl.uniform1i(u.uCount, count);
      gl.uniform1f(u.uSmooth, smooth);
      gl.uniform3f(u.uPill, pillRgb[0], pillRgb[1], pillRgb[2]);
      gl.uniform4f(u.uHoverColor, hoverRgb[0], hoverRgb[1], hoverRgb[2], hoverRgb[3] * hover.alpha);
      gl.uniform1f(u.uShadow, S.shadow);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const frame = (now) => {
      raf = 0;
      if (disposed) return;
      const rm = reduced();
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const emergeTime = 0.09;
      const absorbTime = 0.12;

      for (let i = drops.length - 1; i >= 0; i--) {
        const drop = drops[i];
        if (drop.state === 'waiting') {
          if (now < drop.leave) continue;
          drop.state = 'flying';
          plan(drop, drop.index, now, true);
        }
        if (drop.state === 'flying') {
          drop.emerged = Math.min(1, drop.emerged + dt / emergeTime);
          const source = pills.get(drop.source);
          if (source && drop.given < drop.mass) {
            const give = Math.min(drop.mass * (dt / emergeTime), drop.mass - drop.given);
            source.mass = Math.max(0, source.mass - give);
            source.outgoing = Math.max(0, source.outgoing - give);
            drop.given += give;
          }
          const t = clamp01((now - drop.start) / 1000 / drop.duration);
          const eased = travelEase(t);
          const p = drop.path;
          const x = bezier(p[0], p[2], p[4], p[6], eased);
          const y = bezier(p[1], p[3], p[5], p[7], eased);
          if (dt > 0) {
            drop.vx = (x - drop.x) / dt;
            drop.vy = (y - drop.y) / dt;
          }
          drop.x = x;
          drop.y = y;
          if (t >= 1) drop.state = 'absorbing';
        }
        if (drop.state === 'absorbing') {
          const take = Math.min(1 - drop.absorbed, dt / absorbTime);
          drop.absorbed += take;
          drop.vx *= 0.8;
          drop.vy *= 0.8;
          const host = pill(drop.index);
          host.mass = Math.min(1, host.mass + drop.mass * take);
          if (drop.absorbed >= 1) drops.splice(i, 1);
        }
      }

      /* Resorte de cada píldora: la masa recibida crece su tamaño con un pequeño rebote */
      const zeta = rm ? 1 : 1 - 0.72 * clamp01(S.wobble);
      const omega = 26;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      pills.forEach((state, index) => {
        for (let n = 0; n < steps; n++) {
          state.velocity += (omega * omega * (state.mass - state.scale) - 2 * zeta * omega * state.velocity) * h;
          state.scale += state.velocity * h;
        }
        if (index !== target && state.mass <= 0.002 && state.outgoing <= 0.002 && Math.abs(state.scale) < 0.004) {
          pills.delete(index);
        }
      });

      if (hover.index >= 0 && rects[hover.index]) {
        const rect = rects[hover.index];
        const k = rm ? 1 : 1 - Math.exp(-dt / 0.06);
        hover.x += (rect.x + rect.w / 2 - hover.x) * k;
        hover.y += (rect.y + rect.h / 2 - hover.y) * k;
        hover.w += (rect.w - hover.w) * k;
        hover.h += (rect.h - hover.h) * k;
      }
      const hoverGoal = S.hoverEffect && hover.index >= 0 && hover.index !== target ? 1 : 0;
      hover.alpha += (hoverGoal - hover.alpha) * (rm ? 1 : 1 - Math.exp(-dt / 0.08));

      render();

      const host = pills.get(target);
      const resting = drops.length === 0 && pills.size === 1 && host &&
        Math.abs(host.mass - host.scale) < 0.0008 && Math.abs(host.velocity) < 0.004;
      const hoverRect = rects[hover.index];
      const hovering = Math.abs(hoverGoal - hover.alpha) > 0.003 ||
        (hoverRect && Math.abs(hoverRect.x + hoverRect.w / 2 - hover.x) + Math.abs(hoverRect.w - hover.w) > 0.1);
      if (!resting || hovering) {
        raf = requestAnimationFrame(frame);
      } else {
        host.mass = 1;
        host.scale = 1;
        host.velocity = 0;
        hover.alpha = hoverGoal;
        render();
      }
    };

    const wake = () => {
      if (raf || disposed) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    /* Estado final sin animación (carga, resize, movimiento reducido) */
    const settle = (index) => {
      pills.clear();
      drops.length = 0;
      target = index;
      const state = pill(index);
      state.mass = 1;
      state.scale = 1;
      state.velocity = 0;
      render();
    };

    const go = (index, animate) => {
      wantIndex = index;
      if (index === target) return;
      if (!rects[index] || !animate || reduced() || target < 0) {
        settle(index);
        return;
      }
      const now = performance.now();
      target = index;
      pill(index);
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        drop.index = index;
        if (drop.state === 'flying') plan(drop, index, now, false);
        if (drop.state === 'absorbing') {
          drop.state = 'flying';
          drop.mass *= 1 - drop.absorbed;
          drop.absorbed = 0;
          plan(drop, index, now, false);
        }
      }
      Array.from(pills.keys()).forEach((from) => { if (from !== index) emit(from, index, now); });
      wake();
    };

    /* Hover con puntero: la píldora tenue sigue al item bajo el cursor (no en táctil) */
    const onOver = (event) => {
      if (event.pointerType === 'touch') return;
      const item = event.target.closest('[data-gn-index]');
      if (!item || !list.contains(item)) return;
      const index = Number(item.dataset.gnIndex);
      const rect = rects[index];
      if (!rect) return;
      if (hover.alpha < 0.01) {
        hover.x = rect.x + rect.w / 2;
        hover.y = rect.y + rect.h / 2;
        hover.w = rect.w;
        hover.h = rect.h;
      }
      hover.index = index;
      wake();
    };
    const onLeave = () => { hover.index = -1; wake(); };
    const onLost = (e) => { e.preventDefault(); useFallback(); render(); };

    list.addEventListener('pointerover', onOver);
    list.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('webglcontextlost', onLost);

    measure();
    settle(initialIndex);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (disposed) return;
        measure();
        if (!drops.length) settle(target);
      });
    }

    return {
      go: (index) => go(index, true),
      /* Tras un cambio de tamaño o de modo (scroll/normal): medir de nuevo */
      remeasure: () => {
        measure();
        if (!drops.length) settle(target < 0 ? wantIndex : target);
        else render();
      },
      /* Se llama si cambia prefers-reduced-motion: deja todo en su estado final */
      refresh: () => {
        if (reduced()) { hover.alpha = 0; hover.index = -1; settle(target < 0 ? wantIndex : target); }
        else { render(); wake(); }
      },
      destroy: () => {
        disposed = true;
        cancelAnimationFrame(raf);
        list.removeEventListener('pointerover', onOver);
        list.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('webglcontextlost', onLost);
        if (gl && pipeline) {
          gl.deleteBuffer(pipeline.buffer);
          gl.deleteProgram(pipeline.program);
        }
      }
    };
  }

  /* ---------------------------------------------------------
     Construcción de la barra a partir de los <a> actuales
     --------------------------------------------------------- */
  function initGooeyNav() {
    const nav = document.querySelector('.navbar .nav-pill') || document.querySelector('nav.nav-pill');
    if (!nav) return;

    const collect = () => Array.prototype.filter.call(nav.querySelectorAll('a'), (a) => !a.closest('.gn-list--active'));
    const sameSet = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
    const readActive = (links) => {
      let i = -1;
      for (let k = 0; k < links.length; k++) {
        const c = links[k].getAttribute('aria-current');
        if (c && c !== 'false') { i = k; break; }
      }
      if (i < 0) i = links.findIndex((a) => a.classList.contains('is-active'));
      return i < 0 ? 0 : i;
    };

    let links = [];
    let engine = null;
    let ro = null;
    let attrObs = null;
    let rafId = 0;
    let parts = null;
    let current = -1;

    const mo = new MutationObserver(() => {
      if (!sameSet(collect(), links)) rebuild();
    });
    const watchTree = () => mo.observe(nav, { childList: true, subtree: true });

    /* ¿Caben los items en el hueco? Si no (320px con 5 items, o sin la fuente web),
       modo scroll: la barra se desplaza en horizontal y el activo se centra solo. */
    const fit = () => {
      const was = nav.classList.contains('gn-scroll');
      nav.classList.remove('gn-scroll');
      const need = parts.list.scrollWidth;
      const have = parts.stage.clientWidth;
      const on = need > have + 1;
      if (on) nav.classList.add('gn-scroll');
      return on !== was;
    };

    /* En modo scroll el stage tiene 4px de relleno (ver fx-nav.css): el item se centra contándolo */
    const reveal = (index, instant) => {
      if (!nav.classList.contains('gn-scroll') || !parts) return;
      const item = parts.list.children[index];
      if (!item) return;
      const left = 4 + item.offsetLeft + item.offsetWidth / 2 - parts.stage.clientWidth / 2;
      parts.stage.scrollTo({ left: Math.max(0, left), behavior: instant || reduced() ? 'auto' : 'smooth' });
    };

    /* Degradado en el borde con más contenido oculto (clases gn-more-l / gn-more-r) */
    const updateEdges = () => {
      if (!parts) return;
      const s = parts.stage;
      const scrolling = nav.classList.contains('gn-scroll');
      const max = s.scrollWidth - s.clientWidth;
      nav.classList.toggle('gn-more-l', scrolling && s.scrollLeft > 2);
      nav.classList.toggle('gn-more-r', scrolling && s.scrollLeft < max - 2);
    };

    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (!engine) return;
        fit();
        engine.remeasure();
        reveal(current, true);
        updateEdges();
      });
    };

    const sync = () => {
      if (!engine) return;
      const i = readActive(links);
      if (i === current) return;
      current = i;
      engine.go(i);
      reveal(i, false);
    };

    function teardown() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (ro) { ro.disconnect(); ro = null; }
      if (attrObs) { attrObs.disconnect(); attrObs = null; }
      if (engine) { engine.destroy(); engine = null; }
    }

    function rebuild() {
      mo.disconnect();
      teardown();
      links = collect();
      if (!links.length) { watchTree(); return; }

      const stage = el('div', 'gn-stage');
      const track = el('div', 'gn-track');
      const canvas = el('canvas', 'gn-canvas');
      canvas.setAttribute('aria-hidden', 'true');
      const fallback = el('span', 'gn-fallback');
      fallback.setAttribute('aria-hidden', 'true');
      const list = el('ul', 'gn-list');
      const overlay = el('ul', 'gn-list gn-list--active');
      overlay.setAttribute('aria-hidden', 'true');

      links.forEach((a, i) => {
        a.classList.add('gn-link');
        const li = el('li', 'gn-item');
        li.setAttribute('data-gn-index', String(i));
        li.appendChild(a);                       // se mueve el <a> real (no se clona)
        list.appendChild(li);
        /* copia decorativa del texto: se ve en color "activo" sólo dentro de la gota */
        const ghost = el('li', 'gn-item');
        const text = el('span', 'gn-link');
        Array.prototype.forEach.call(a.childNodes, (n) => {
          const c = n.cloneNode(true);
          if (c.removeAttribute) c.removeAttribute('id');
          text.appendChild(c);
        });
        ghost.appendChild(text);
        overlay.appendChild(ghost);
      });

      /* Orden de apilado (de abajo arriba): lista real, gota (WebGL o píldora CSS), copia con tinta oscura.
         Así la gota opaca TAPA el texto claro de debajo y no asoma ningún halo claro alrededor de la tinta oscura.
         El lienzo y el overlay tienen pointer-events:none: los clics/hover siguen llegando a los <a>. */
      track.appendChild(list);
      track.appendChild(canvas);
      track.appendChild(fallback);
      track.appendChild(overlay);
      stage.appendChild(track);
      while (nav.firstChild) nav.removeChild(nav.firstChild);   // los <a> ya viven dentro de la lista
      nav.appendChild(stage);
      nav.classList.add('gn');
      parts = { nav, stage, track, canvas, fallback, list, overlay };

      /* colores desde los tokens CSS (--gn-pill = --accent; tinta oscura para contraste AA) */
      const cs = getComputedStyle(nav);
      const pillRgb = parseColor(cs.getPropertyValue('--gn-pill'), [0.976, 0.451, 0.086, 1]);
      const tints = ['#F97316', '#FB923C', '#EA580C'].map((c) => parseColor(c));   // variantes de naranja, sin amarillo

      fit();
      current = readActive(links);
      engine = createGooey(parts, current, { pill: pillRgb, tints });
      reveal(current, true);
      stage.addEventListener('scroll', updateEdges, { passive: true });
      updateEdges();

      attrObs = new MutationObserver(sync);
      links.forEach((a) => attrObs.observe(a, { attributes: true, attributeFilter: ['class', 'aria-current'] }));
      if (window.ResizeObserver) {
        ro = new ResizeObserver(schedule);
        ro.observe(stage);
        ro.observe(list);
      }
      watchTree();
    }

    rebuild();
    window.addEventListener('resize', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    listen(RM, () => { if (engine) engine.refresh(); });
  }

  /* =========================================================
     2. Crosshair (líneas guía con lerp, puntero fino)
     ========================================================= */
  const CROSS = {
    alpha: 0.12,        // líneas muy tenues: blanco al 12 %
    thickness: 1,
    gap: 14,            // hueco alrededor del cursor para no tapar el puntero real
    fade: 0.6,          // las líneas se desvanecen hacia los bordes de la pantalla
    smoothing: 0.35,    // lerp: tau = 8 ms + 0.35 * 160 ms
    markColor: '249,115,22'   // marca de la intersección: --accent, minúscula
  };
  /* No se dibuja sobre el lanyard, modales ni campos de texto */
  const CROSS_IGNORE = '#lanyard-container, input, textarea, select, [contenteditable], .modal, [role="dialog"]';

  function createCrosshair() {
    const canvas = el('canvas', 'fx-crosshair');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    document.body.appendChild(canvas);

    const state = { x: 0, y: 0, tx: 0, ty: 0, inside: false, presence: 0, seen: false };
    const size = { w: 0, h: 0, dpr: 1 };
    let raf = 0;
    let last = 0;
    let alive = true;
    let sizeDirty = true;

    const applySize = () => {
      sizeDirty = false;
      size.dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.w = canvas.clientWidth;
      size.h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(size.w * size.dpr));
      canvas.height = Math.max(1, Math.round(size.h * size.dpr));
    };
    const crisp = (v) => {
      const dev = Math.round(CROSS.thickness * size.dpr);
      return (Math.round(v * size.dpr) + (dev % 2 ? 0.5 : 0)) / size.dpr;
    };

    /* tramo de línea con degradado: alpha pleno junto al cursor, (1-fade) en el borde */
    const stroke = (x1, y1, x2, y2, nearEnd) => {
      if (Math.abs(x2 - x1) + Math.abs(y2 - y1) < 1) return;
      const a = state.presence * CROSS.alpha;
      const far = a * (1 - CROSS.fade);
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, 'rgba(255,255,255,' + (nearEnd ? a : far) + ')');
      g.addColorStop(1, 'rgba(255,255,255,' + (nearEnd ? far : a) + ')');
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const draw = () => {
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      if (state.presence <= 0.001) return;
      const x = crisp(state.x);
      const y = crisp(state.y);
      const g = CROSS.gap;
      ctx.lineWidth = CROSS.thickness;
      ctx.lineCap = 'butt';
      stroke(0, y, x - g, y, false);
      stroke(x + g, y, size.w, y, true);
      stroke(x, 0, x, y - g, false);
      stroke(x, y + g, x, size.h, true);
      /* marca en la intersección: anillo tenue + punto naranja de 2 px */
      ctx.strokeStyle = 'rgba(255,255,255,' + (state.presence * 0.22).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(state.x, state.y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(' + CROSS.markColor + ',' + (state.presence * 0.8).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(state.x, state.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    };

    const tick = (now) => {
      raf = 0;
      if (!alive) return;
      if (sizeDirty) applySize();
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const follow = 1 - Math.exp(-dt / (0.008 + CROSS.smoothing * 0.16));
      state.x += (state.tx - state.x) * follow;
      state.y += (state.ty - state.y) * follow;
      const wanted = state.inside ? 1 : 0;
      state.presence += (wanted - state.presence) * (1 - Math.exp(-dt / (wanted ? 0.12 : 0.22)));
      if (Math.abs(wanted - state.presence) < 0.004) state.presence = wanted;
      draw();
      if (Math.abs(state.tx - state.x) > 0.05 || Math.abs(state.ty - state.y) > 0.05 || state.presence !== wanted) {
        raf = requestAnimationFrame(tick);
      }
    };
    const wake = () => {
      if (raf || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const ignored = (t) => !!(t && t.closest && t.closest(CROSS_IGNORE));
    const place = (cx, cy, over) => {
      state.tx = cx;
      state.ty = cy;
      const inside = !ignored(over);
      if (inside && (!state.seen || state.presence < 0.02)) {   // al (re)aparecer no cruza la pantalla: salta
        state.x = cx;
        state.y = cy;
        state.seen = true;
      }
      state.inside = inside;
      wake();
    };
    const onMove = (e) => {
      if (e.pointerType === 'touch') return;
      place(e.clientX, e.clientY, e.target);
    };
    const leave = () => { state.inside = false; wake(); };
    const onOut = (e) => { if (!e.relatedTarget) leave(); };
    /* Con scroll, lo que hay bajo el puntero cambia sin que éste se mueva */
    let scrollPending = false;
    const onScroll = () => {
      if (scrollPending || !state.seen) return;
      scrollPending = true;
      requestAnimationFrame(() => {
        scrollPending = false;
        if (alive) place(state.tx, state.ty, document.elementFromPoint(state.tx, state.ty));
      });
    };
    const onResize = () => { sizeDirty = true; wake(); };
    const onVis = () => { if (document.hidden) leave(); };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut);
    window.addEventListener('blur', leave);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);

    return {
      destroy: () => {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerout', onOut);
        window.removeEventListener('blur', leave);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        canvas.remove();
      }
    };
  }

  function initCrosshair() {
    if (!window.matchMedia) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    let inst = null;
    const sync = () => {
      const want = fine.matches && !reduced();
      if (want && !inst) inst = createCrosshair();
      else if (!want && inst) { inst.destroy(); inst = null; }
    };
    listen(fine, sync);
    listen(RM, sync);
    sync();
  }

  /* =========================================================
     Arranque
     ========================================================= */
  function boot() {
    safe('gooey-nav', initGooeyNav);
    safe('crosshair', initCrosshair);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
