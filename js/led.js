/* ==========================================================================
   led.js — animated LED-style banner on the profile.

   A canvas grid of rounded pills (5 rows). Every pill's brightness is a smooth
   function of (column, row, time): a slow ripple plus a few travelling bright
   clusters. Cheap on purpose: ~200 rounded rects per frame, one canvas, and it
   stops drawing when off-screen, in a background tab, or under
   prefers-reduced-motion (one still frame is drawn instead).

   Geometry is expressed in "u" (1u = banner height / 372) so the pill size and
   spacing stay proportional to the design at any width.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("led");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var ROWS = 5;
  // One motion switch for the whole site (Animations button / device setting).
  var reduce = { get matches() { return !(window.Site && window.Site.motion && window.Site.motion.full()); } };

  // Phone geometry in "u" (banner height / 372). On wide banners the pills are smaller and
  // there are more rows, like the desktop design; those are set in resize().
  var PILL_W = 24, PILL_H = 57, PITCH_X = 33, PITCH_Y = 68.75, TOP = 26, LEFT = -18;
  var wide = false;

  var w = 0, h = 0, u = 1, cols = 0, dpr = 1;
  var running = false, visible = true, raf = 0, t0 = 0;

  function resize() {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    wide = w > 640;
    if (wide) {            // desktop: px geometry, as many rows as fit
      u = 1; PILL_W = 7; PILL_H = 15; PITCH_X = 10.2; PITCH_Y = 20.5; TOP = 4; LEFT = -3;
      ROWS = Math.max(5, Math.floor((h - TOP) / PITCH_Y));
    } else {
      u = h / 372; PILL_W = 24; PILL_H = 57; PITCH_X = 33; PITCH_Y = 68.75; TOP = 26; LEFT = -18; ROWS = 5;
    }
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil((w / u - LEFT) / PITCH_X) + 1;
    draw(performance.now());
  }

  function smooth(a, b, x) { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); }

  /* ---- interaction: the banner reacts to the cursor, and ripples on click ---- */
  var pointer = { c: -99, r: -99, t: -99 };          // last cursor cell + time it last moved
  var ripples = [];                                  // {c, r, t}
  function cellAt(ev) {
    var b = canvas.getBoundingClientRect();
    var x = (ev.clientX - b.left) / u, y = (ev.clientY - b.top) / u;
    return { c: (x - LEFT) / PITCH_X - 0.5, r: (y - TOP) / PITCH_Y - 0.5 };
  }
  var host = canvas.parentNode;
  host.addEventListener("pointermove", function (ev) {
    if (reduce.matches || ev.pointerType === "touch") return;
    var p = cellAt(ev); pointer.c = p.c; pointer.r = p.r; pointer.t = performance.now();
  });
  host.addEventListener("pointerdown", function (ev) {
    if (reduce.matches) return;
    var p = cellAt(ev); ripples.push({ c: p.c, r: p.r, t: performance.now() });
    if (ripples.length > 4) ripples.shift();
  });
  host.style.touchAction = "pan-y";

  function interaction(c, r, now) {
    var v = 0;
    var age = (now - pointer.t) / 1000;
    if (age < 1.4) {                                   // soft light that follows the cursor, then fades
      var d2 = Math.pow(c - pointer.c, 2) / 6 + Math.pow((r - pointer.r) * (PITCH_Y / PITCH_X), 2) / 6;
      v += 0.9 * Math.exp(-d2) * (1 - age / 1.4);
    }
    for (var i = ripples.length - 1; i >= 0; i--) {    // expanding ring from each click
      var a = (now - ripples[i].t) / 1000;
      if (a > 1.8) { ripples.splice(i, 1); continue; }
      var dist = Math.hypot(c - ripples[i].c, (r - ripples[i].r) * (PITCH_Y / PITCH_X));
      v += 0.95 * Math.exp(-Math.pow(dist - a * 16, 2) / 2.2) * (1 - a / 1.8);
    }
    return v;
  }

  // brightness 0..1 for a pill
  function level(c, r, t, now) {
    var v = 0.2
      + 0.1 * Math.sin(c * 0.3 - t * 0.7 + r * 0.9)
      + 0.06 * Math.sin(c * 0.11 + t * 0.35 - r * 0.4);

    // travelling bright clusters (wrap around the row)
    var span = cols + 16;
    var a = ((t * 2.6) % span) - 6;                 // left to right
    var b = span - 6 - ((t * 1.7 + span * 0.4) % span); // right to left
    var k = ROWS / 5;                       // scale cluster height with the number of rows
    var ca = Math.exp(-(Math.pow(c - a, 2) / (wide ? 14 : 7) + Math.pow(r - 2.4 * k, 2) / (1.1 * k * k)));
    var cb = Math.exp(-(Math.pow(c - b, 2) / (wide ? 18 : 9) + Math.pow(r - 3.6 * k, 2) / (1 * k * k)));
    v += 0.78 * ca + 0.7 * cb;
    if (wide) v += 0.3 * (r / (ROWS - 1)) - 0.08;   // brighter toward the bottom edge

    // a few pills dip dark, drifting slowly
    var hole = smooth(0.9, 0.985, Math.sin(c * 2.1 + r * 3.7 + t * 0.4) * Math.sin(c * 0.9 - r * 1.3 - t * 0.3));
    v *= 1 - 0.65 * hole;
    if (now) v += interaction(c, r, now);
    return Math.min(1, Math.max(0, v));
  }

  // dim green -> bright mint, sampled from the design's palette
  function color(v) {
    var g = 17 + 223 * v;
    var t = smooth(110, 240, g);
    var rC = 13 + (130 - 13) * t, gC = g + (212 - g) * t * 0.55, bC = g * 0.64 + (172 - g * 0.64) * t;
    return "rgb(" + (rC | 0) + "," + (gC | 0) + "," + (bC | 0) + ")";
  }

  function pill(x, y, pw, ph) {
    var rad = pw / 2;
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + pw, y, x + pw, y + ph, rad);
    ctx.arcTo(x + pw, y + ph, x, y + ph, rad);
    ctx.arcTo(x, y + ph, x, y, rad);
    ctx.arcTo(x, y, x + pw, y, rad);
    ctx.closePath();
    ctx.fill();
  }

  function draw(now) {
    if (!w) return;
    var t = reduce.matches ? 2.4 : (now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < cols; c++) {
        ctx.fillStyle = color(level(c, r, t, reduce.matches ? 0 : now));
        pill((LEFT + c * PITCH_X) * u, (TOP + r * PITCH_Y) * u, PILL_W * u, PILL_H * u);
      }
    }
  }

  function frame(now) {
    if (!running) return;
    draw(now);
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduce.matches || !visible || document.hidden) return;
    running = true; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  t0 = performance.now();
  resize();
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas); else window.addEventListener("resize", resize);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible ? start() : stop(); }).observe(canvas);
  }
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  document.addEventListener("motionchange", function () { if (reduce.matches) { stop(); draw(performance.now()); } else start(); });

  start();
})();
