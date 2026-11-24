/* ==========================================================================
   motion.js — premium motion layer. Everything here is decoration on top of
   content that is already visible, and everything checks Site.motion.full(),
   so it switches off instantly with the Animations button or the device's
   reduced-motion setting.

   • scroll reveals with stagger            • animated counters
   • cursor spotlight + soft 3D tilt        • magnetic primary buttons
   • scroll progress bar                    • section icons that draw themselves
   • staggered chips / level dots

   Pointer effects only run for a real mouse (hover + fine pointer); touch
   devices keep the reveals, counters and page transitions.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.Site;
  if (!S || !S.motion) return;
  var M = S.motion;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");

  /* --------------------------------------------------------- scroll reveal */
  var REVEAL = [
    ".rblock", ".icard", ".timeline li", ".journey li", ".social-wrap", ".cv-row",
    ".pcard", ".site-card", ".repo-grid > li", ".gh-head", ".gh-contrib", ".gh-repos-head",
    ".hero-card", ".feature-card", ".tcard", ".reach-grid > li", ".find-grid > li", ".panel",
    ".person", ".lib-item", ".side-card", ".find", ".empty", ".sub", ".oss > .sh",
  ].join(",");
  var CHILDREN = [".dotchips", ".checks", ".chips-wrap.left .chips", ".dots", ".social-row", ".gh-legend"].join(",");
  var SPOT = ".pcard, .site-card, .icard, .tcard, .side-card, .link-card, .repo, .feature-card, .person, .lib-item, .hero-card";

  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      io.unobserve(el);
      el.classList.add("in");
      // Once settled, hand the element back to normal hover/tilt styles.
      setTimeout(function () { el.classList.remove("rv", "rv-c", "in"); }, 1300);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }) : null;

  function siblingIndex(el) {
    var n = 0, p = el.previousElementSibling;
    while (p && n < 8) { if (p.classList.contains("rv")) n++; p = p.previousElementSibling; }
    return n;
  }

  function scan(scope) {
    scope = scope || document;
    if (!M.full() || !io) return;

    scope.querySelectorAll(REVEAL).forEach(function (el) {
      if (el.dataset.mv || el.closest(".profile") || el.closest("[data-rise]")) return;
      el.dataset.mv = "1";
      el.classList.add("rv");
      el.style.setProperty("--rv-i", siblingIndex(el));
      io.observe(el);
    });
    scope.querySelectorAll(CHILDREN).forEach(function (el) {
      if (el.dataset.mv || el.closest(".chips-wrap:not(.left)")) return;
      el.dataset.mv = "1";
      [].forEach.call(el.children, function (c, i) { c.style.setProperty("--ci", Math.min(i, 14)); });
      el.classList.add("rv-c");
      io.observe(el);
    });
    // Section icons draw themselves: give every stroke a normalised length.
    scope.querySelectorAll(".sh-ic svg path, .sh-ic svg circle, .sh-ic svg rect").forEach(function (n) {
      if (!n.hasAttribute("pathLength")) n.setAttribute("pathLength", "1");
    });
    scope.querySelectorAll(SPOT).forEach(function (el) { el.classList.add("spot"); });
    // Header chips pop in one after another.
    scope.querySelectorAll(".chips-wrap:not(.left) .chips").forEach(function (ul) {
      [].forEach.call(ul.children, function (c, i) { c.style.setProperty("--ci", i); });
    });
  }

  /* -------------------------------------------------------------- counters */
  function format(n, dec) { return dec ? n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : Math.round(n).toLocaleString(); }

  function count(el, to, opts) {
    opts = opts || {};
    var dec = opts.decimals || 0;
    if (!el) return;
    el.textContent = format(to, dec);                    // final value is always the truth
    if (!M.full() || !("IntersectionObserver" in window)) return;
    var run = function () {
      var start = performance.now(), dur = opts.duration || 1300;
      el.textContent = format(0, dec);
      (function step(now) {
        var t = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - t, 4);
        el.textContent = format(to * eased, dec);
        if (t < 1) requestAnimationFrame(step); else el.textContent = format(to, dec);
      })(start);
    };
    var watch = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { watch.disconnect(); run(); }
    }, { threshold: 0.4 });
    watch.observe(el);
  }

  /* ------------------------------------------------------- scroll progress */
  var bar = document.createElement("div");
  bar.className = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  var ticking = false;
  function paintProgress() {
    ticking = false;
    var range = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty("--p", range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)).toFixed(4) : 0);
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(paintProgress); } }, { passive: true });
  window.addEventListener("resize", paintProgress);
  paintProgress();

  /* ---------------------------------------------------- pointer: spotlight, tilt, magnet */
  var TILT = ".pcard, .site-card";
  var MAGNET = ".btn-primary.btn-lg, .btn-primary.btn-md, .follow-btn";
  var raf = 0, last = null;

  document.addEventListener("pointermove", function (e) {
    if (!M.full() || !fine.matches || e.pointerType === "touch") return;
    last = e;
    if (!raf) raf = requestAnimationFrame(applyPointer);
  }, { passive: true });

  function applyPointer() {
    raf = 0;
    var e = last; if (!e) return;
    var t = e.target;
    if (!t || !t.closest) return;

    var card = t.closest(".spot");
    if (card) {
      var r = card.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      card.style.setProperty("--mx", x + "px");
      card.style.setProperty("--my", y + "px");
      if (card.matches(TILT)) {
        card.classList.add("tilting");
        card.style.setProperty("--ry", (((x / r.width) - 0.5) * 7).toFixed(2) + "deg");
        card.style.setProperty("--rx", ((0.5 - (y / r.height)) * 5).toFixed(2) + "deg");
      }
    }
    // magnetic buttons: lean toward the cursor when it is close
    document.querySelectorAll(MAGNET).forEach(function (b) {
      var r2 = b.getBoundingClientRect();
      var cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy), reach = Math.max(r2.width, 90);
      if (d < reach) { b.style.translate = (dx * 0.12).toFixed(1) + "px " + (dy * 0.2).toFixed(1) + "px"; }
      else if (b.style.translate) b.style.translate = "";
    });
  }

  document.addEventListener("pointerout", function (e) {
    var card = e.target.closest && e.target.closest(TILT);
    if (card && !card.contains(e.relatedTarget)) {
      card.classList.remove("tilting");
      card.style.removeProperty("--rx"); card.style.removeProperty("--ry");
    }
  });
  window.addEventListener("blur", function () {
    document.querySelectorAll(MAGNET).forEach(function (b) { b.style.translate = ""; });
  });

  /* ----------------------------------------------------------------- boot */
  scan(document);
  document.addEventListener("motionchange", function () {
    if (M.full()) scan(document);
    else {
      document.querySelectorAll(".rv, .rv-c").forEach(function (el) { el.classList.remove("rv", "rv-c", "in"); });
      document.querySelectorAll(MAGNET).forEach(function (b) { b.style.translate = ""; });
    }
  });

  S.motionFx = { scan: scan, count: count };
})();
