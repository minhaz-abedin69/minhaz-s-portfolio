/* ==========================================================================
   components.js — loaded in <head>, synchronously, after data.js.

   It does four things before the first paint so nothing flashes:
     1. marks <html> as JS-enabled and applies the saved theme
     2. defines helpers on window.Site (escaping, icons, toast, storage)
     3. defines <site-header>, <site-footer> custom elements
     4. keeps <meta name="theme-color"> in sync with the theme
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;

  /* ------------------------------------------------ Draft preview (admin)
     The admin panel opens the site with ?preview=1 to show an unpublished draft.
     The draft lives only in the owner's own browser; visitors never see it. */
  var isAdminPage = /admin\.html$/.test(location.pathname);
  var previewing = false;
  if (!isAdminPage) {
    try {
      if (/[?&]preview=1(&|$)/.test(location.search)) sessionStorage.setItem("preview", "1");
      if (sessionStorage.getItem("preview") === "1") {
        var rawDraft = JSON.parse(localStorage.getItem("admin:draft"));
        if (rawDraft && rawDraft.data && rawDraft.data.profile) { window.SITE = rawDraft.data; previewing = true; }
      }
    } catch (e) { /* no draft available */ }
  }
  var DATA = window.SITE;

  // Links coming from content are only ever http(s), mailto, tel or relative.
  function safeUrl(u) {
    u = String(u == null ? "" : u).trim();
    if (!u) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return /^(https?:|mailto:|tel:)/i.test(u) ? u : "#";
    if (/^\/\//.test(u)) return "#";
    return u;
  }
  root.classList.add("js");

  /* ------------------------------------------------------------ Storage */
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* private mode / blocked: fall back silently */ }
    return null;
  }

  /* -------------------------------------------------------------- Theme */
  var THEME_COLORS = { dark: "#0d0d0f", light: "#f6f8f7" };

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
    var toLight = theme === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-label", toLight ? "Switch to light theme" : "Switch to dark theme");
      btn.setAttribute("title", toLight ? "Light theme" : "Dark theme");
    });
  }
  var savedTheme = store("theme");
  applyTheme(savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark");

  /* ------------------------------------------------------------- Motion
     data-motion="full" | "reduce" on <html> is the single switch every animation
     (CSS and JS) listens to. Default follows the device's reduced-motion setting;
     the visitor can override it with the Animations button.                  */
  var osReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  function chosenMotion() {
    var s = store("motion");
    return s === "full" || s === "reduce" ? s : (osReduce.matches ? "reduce" : "full");
  }
  function setMotion(mode, persist) {
    if (persist) store("motion", mode);
    root.setAttribute("data-motion", mode);
    document.dispatchEvent(new CustomEvent("motionchange", { detail: mode }));
  }
  root.setAttribute("data-motion", chosenMotion());
  osReduce.addEventListener("change", function () { if (!store("motion")) setMotion(chosenMotion(), false); });
  var motion = {
    full: function () { return root.getAttribute("data-motion") === "full"; },
    set: function (m) { setMotion(m, true); },
    toggle: function () { setMotion(motion.full() ? "reduce" : "full", true); },
    osReduced: function () { return osReduce.matches; },
  };

  /* ------------------------------------------- Sidebar collapse + sound */
  if (store("nav") === "collapsed") root.setAttribute("data-nav", "collapsed");
  var soundOn = store("sound") === "on";
  var audio;
  function tick(freq, dur, vol) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.type = "sine"; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur);
    } catch (e) { /* audio unavailable */ }
  }
  // Soft UI tick on interactive elements, only when the person turned sound on.
  document.addEventListener("click", function (e) {
    if (soundOn && e.target.closest && e.target.closest("a, button, [role=tab]")) tick(680, 0.07, 0.035);
  }, true);

  /* ------------------------------------------------------------ Helpers */
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  // Minimal stroke icons (24px grid, 1.75 stroke, currentColor).
  var ICONS = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5v-.5a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6"/><path d="M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H16"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5V18a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18v-5.5"/>',
    external: '<path d="M8 16 16.5 7.5M9 7.5h7.5V15"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    cap: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.2 2.5 2.5 5.5 2.5s5.5-1.3 5.5-2.5V11"/><path d="M21.5 9v5"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 13h18"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5.5l-3 13"/>',
    tree: '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v5M12 12l-6 5M12 12l6 5"/>',
    flow: '<rect x="3.5" y="4" width="7" height="5" rx="1.2"/><rect x="13.5" y="15" width="7" height="5" rx="1.2"/><path d="M7 9v3.5a2 2 0 0 0 2 2h4.5M17 15v-2.5"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m12 12 8-4.5M12 12 4 7.5M12 12v9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',
    share2: '<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="5.5" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="m8.3 10.8 7.4-4M8.3 13.2l7.4 4"/>',
    badge: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/>',
    userc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.3 18.4a6.5 6.5 0 0 1 11.4 0"/>',
    library: '<path d="M5 4h3.5v16H5zM10.5 4H14v16h-3.5z"/><path d="m15.8 5.2 3.2-.9 3.4 14.5-3.2.9z"/>',
    volume: '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    volumex: '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
    panel: '<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M9.5 4v16M16 9.5 13.5 12l2.5 2.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 17h.01"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    spark: '<path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>',
    wrench: '<path d="m14.5 6.5 3-3a4.5 4.5 0 0 0-5.7 5.7L4 17l3 3 7.8-7.8a4.5 4.5 0 0 0 5.7-5.7l-3 3-2.5-.5z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5V16M8 7.8h.01M11.5 16v-5.5M11.5 13a2.5 2.5 0 0 1 5 0v3"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><path d="M17 7h.01"/>',
    codeforces: '<path d="M6 20v-9M12 20V4M18 20v-6"/>',
    leetcode: '<path d="m14.5 5-8 8a3 3 0 0 0 0 4.2l.3.3a3 3 0 0 0 4.2 0l2.5-2.5M10 9.5 13 6.5M11.5 12h8.5"/>',
    fork: '<circle cx="6" cy="5.5" r="2"/><circle cx="18" cy="5.5" r="2"/><circle cx="12" cy="18.5" r="2"/><path d="M6 7.5v1.5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7.5M12 12v4.5"/>',
    userplus: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
    trend: '<path d="m4 16 5-5 4 4 7-8M15 7h5v5"/>',
    send: '<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>',
    refresh: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
    sparkles: '<path d="m10 4 1.9 5.1L17 11l-5.1 1.9L10 18l-1.9-5.1L3 11l5.1-1.9z"/><path d="M18.5 3.5v3M17 5h3M19 15.5v3M17.5 17h3"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.5a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5L17.5 7M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V4M7 8.5 12 4l5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    download: '<path d="M12 4v12M7 11.5 12 16l5-4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  };
  function icon(name, size) {
    var s = size || 20;
    return (
      '<svg class="icon" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (ICONS[name] || "") + "</svg>"
    );
  }

  /* -------------------------------------------------------------- Toast */
  var toastTimer;
  function toast(message) {
    var el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    // force reflow so the transition replays when toasts fire back to back
    void el.offsetWidth;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-visible"); }, 2200);
  }

  /* ------------------------------------------------------- Clipboard */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  window.Site = {
    data: DATA,
    esc: esc,
    icon: icon,
    store: store,
    toast: toast,
    copyText: copyText,
    applyTheme: applyTheme,
    motion: motion,
    safeUrl: safeUrl,
    previewing: previewing,
    page: function () { return document.body && document.body.getAttribute("data-page"); },
  };

  /* ------------------------------------------------- Header + sidebar nav
     One element renders both: the phone header (hamburger, theme, Contact) and the
     desktop left sidebar. CSS shows whichever fits the viewport.            */
  function navLink(item, page) {
    var current = item.id === page ? ' aria-current="page"' : "";
    return '<li><a class="nav-link" href="' + esc(item.href) + '"' + current + ">" + esc(item.label) + "</a></li>";
  }
  function sideLink(item, page) {
    return '<li><a href="' + esc(item.href) + '"' + (item.id === page ? ' aria-current="page"' : "") + ' title="' + esc(item.label) + '">' +
      icon(item.icon, 22) + "<span>" + esc(item.label) + "</span></a></li>";
  }

  class SiteHeader extends HTMLElement {
    connectedCallback() {
      var page = window.Site.page();
      var nav = DATA.nav;
      var contact = nav.primary.filter(function (n) { return n.id === "contact"; })[0];
      var contactCurrent = page === "contact" ? ' aria-current="page"' : "";
      var words = DATA.profile.name.split(" ");
      var first = words[0], rest = words.slice(1).join(" ");
      var logo = '<span class="sn-logo" aria-hidden="true">' + esc(first.charAt(0)) + "</span>";

      this.innerHTML =
        /* ---- phone header */
        '<header class="site-header" id="siteHeader"><div class="shell header-row">' +
          '<button type="button" class="icon-btn icon-btn-round menu-btn" id="menuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu">' + icon("menu", 22) + "</button>" +
          '<div class="header-actions">' +
            '<button type="button" class="icon-btn icon-btn-round" id="themeToggle" data-theme-toggle>' +
              '<span class="theme-icon theme-icon-sun">' + icon("sun", 20) + "</span>" +
              '<span class="theme-icon theme-icon-moon">' + icon("moon", 20) + "</span>" +
            "</button>" +
            (contact ? '<a class="btn btn-primary contact-pill" href="' + esc(contact.href) + '"' + contactCurrent + ">" + esc(contact.label) + "</a>" : "") +
          "</div>" +
        "</div>" +
        '<nav class="mobile-menu" id="mobileMenu" aria-label="Menu" hidden><div class="shell"><ul>' +
          nav.primary.concat(nav.secondary).map(function (n) {
            return '<li><a href="' + esc(n.href) + '"' + (n.id === page ? ' aria-current="page"' : "") + ">" + icon(n.icon, 20) + "<span>" + esc(n.label) + "</span></a></li>";
          }).join("") +
          '<li><button type="button" class="menu-motion" id="motionToggleM" aria-pressed="true">' + icon("sparkles", 20) + "<span>Animations</span><em></em></button></li>" +
        "</ul></div></nav></header>" +

        /* ---- desktop sidebar */
        '<aside class="sidebar-nav" id="sidebarNav">' +
          '<a class="sn-brand" href="index.html" aria-label="' + esc(DATA.profile.name) + ', home">' + logo +
            '<span class="sn-word">' + esc(first) + (rest ? " <span>" + esc(rest) + "</span>" : "") + "</span></a>" +
          '<nav aria-label="Primary"><ul class="sn-list">' + nav.primary.map(function (n) { return sideLink(n, page); }).join("") + "</ul>" +
            '<div class="sn-sep" role="separator"></div>' +
            '<ul class="sn-list">' + nav.secondary.map(function (n) { return sideLink(n, page); }).join("") + "</ul></nav>" +
          '<div class="sn-foot">' +
            '<div class="sn-tools">' +
              '<button type="button" class="icon-btn icon-btn-round" data-theme-toggle>' +
                '<span class="theme-icon theme-icon-sun">' + icon("sun", 18) + "</span><span class=\"theme-icon theme-icon-moon\">" + icon("moon", 18) + "</span></button>" +
              '<button type="button" class="icon-btn icon-btn-round" id="soundToggle" aria-pressed="false">' + icon("volumex", 18) + "</button>" +
              '<button type="button" class="icon-btn icon-btn-round" id="motionToggle" aria-pressed="true">' + icon("sparkles", 18) + "</button>" +
              '<button type="button" class="icon-btn icon-btn-round" id="navCollapse" aria-label="Collapse sidebar" aria-pressed="false">' + icon("panel", 18) + "</button>" +
            "</div>" +
            '<p class="sn-copy">&copy; <span>' + new Date().getFullYear() + "</span> " + esc(DATA.profile.name) + "</p>" +
          "</div>" +
        "</aside>";

      applyTheme(root.getAttribute("data-theme") || "dark");

      /* phone menu */
      var menuBtn = this.querySelector("#menuBtn");
      var menu = this.querySelector("#mobileMenu");
      function setMenu(open) {
        menu.hidden = !open;
        menuBtn.setAttribute("aria-expanded", String(open));
        menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        menuBtn.innerHTML = icon(open ? "close" : "menu", 22);
      }
      menuBtn.addEventListener("click", function () { setMenu(menu.hidden); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !menu.hidden) { setMenu(false); menuBtn.focus(); }
      });
      document.addEventListener("click", function (e) {
        // composedPath: the icon inside the button is replaced on click, so e.target may already be detached
        var path = e.composedPath();
        if (!menu.hidden && path.indexOf(menu) === -1 && path.indexOf(menuBtn) === -1) setMenu(false);
      });
      window.matchMedia("(min-width: 820px)").addEventListener("change", function (m) { if (m.matches) setMenu(false); });

      /* theme (both toggles) */
      this.querySelectorAll("[data-theme-toggle]").forEach(function (toggle) {
        toggle.addEventListener("click", function () {
          var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
          var reduce = !motion.full();
          var swap = function () { applyTheme(next); store("theme", next); };
          if (document.startViewTransition && !reduce) document.startViewTransition(swap); else swap();
        });
      });

      /* sound toggle */
      var soundBtn = this.querySelector("#soundToggle");
      function paintSound() {
        soundBtn.innerHTML = icon(soundOn ? "volume" : "volumex", 18);
        soundBtn.setAttribute("aria-pressed", String(soundOn));
        soundBtn.setAttribute("aria-label", soundOn ? "Turn interface sounds off" : "Turn interface sounds on");
        soundBtn.setAttribute("title", soundOn ? "Sounds on" : "Sounds off");
      }
      paintSound();
      soundBtn.addEventListener("click", function () {
        soundOn = !soundOn; store("sound", soundOn ? "on" : "off"); paintSound();
        if (soundOn) tick(880, 0.1, 0.05);
      });

      /* animations toggle (sidebar + phone menu) */
      var mBtns = [this.querySelector("#motionToggle"), this.querySelector("#motionToggleM")];
      function paintMotion() {
        var on = motion.full();
        mBtns.forEach(function (btn) {
          if (!btn) return;
          btn.setAttribute("aria-pressed", String(on));
          var hint = on ? "Animations on. Click to turn off." : (motion.osReduced() && !store("motion") ? "Animations off because your device asks for reduced motion. Click to turn them on." : "Animations off. Click to turn on.");
          btn.setAttribute("title", hint);
          btn.setAttribute("aria-label", on ? "Turn animations off" : "Turn animations on");
          var em = btn.querySelector("em"); if (em) em.textContent = on ? "On" : "Off";
        });
      }
      paintMotion();
      mBtns.forEach(function (btn) {
        if (btn) btn.addEventListener("click", function () {
          motion.toggle();
          toast(motion.full() ? "Animations on" : "Animations off");
        });
      });
      document.addEventListener("motionchange", paintMotion);

      /* sidebar collapse */
      var collapse = this.querySelector("#navCollapse");
      function paintCollapse() {
        var c = root.getAttribute("data-nav") === "collapsed";
        collapse.setAttribute("aria-pressed", String(c));
        collapse.setAttribute("aria-label", c ? "Expand sidebar" : "Collapse sidebar");
        collapse.setAttribute("title", c ? "Expand sidebar" : "Collapse sidebar");
      }
      paintCollapse();
      collapse.addEventListener("click", function () {
        var c = root.getAttribute("data-nav") === "collapsed";
        if (c) root.removeAttribute("data-nav"); else root.setAttribute("data-nav", "collapsed");
        store("nav", c ? "expanded" : "collapsed"); paintCollapse();
      });
    }
  }

  /* ------------------------------------------------------------ Footer */
  class SiteFooter extends HTMLElement {
    connectedCallback() {
      var page = window.Site.page();
      var nav = DATA.nav;
      var all = nav.primary.concat(nav.secondary);
      this.innerHTML =
        '<footer class="site-footer"><div class="shell footer-inner">' +
          '<div class="footer-top">' +
            '<nav aria-label="Footer"><ul class="footer-nav">' +
              all.map(function (n) {
                return '<li><a href="' + esc(n.href) + '"' + (n.id === page ? ' aria-current="page"' : "") + ">" + esc(n.label) + "</a></li>";
              }).join("") +
            "</ul></nav>" +
            '<ul class="footer-social" aria-label="Social profiles">' +
              DATA.socials.map(function (s) {
                return '<li><a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(s.platform) +
                  '<span class="visually-hidden"> (opens in a new tab)</span></a></li>';
              }).join("") +
            "</ul>" +
          "</div>" +
          '<p class="footer-copy">&copy; <span id="year">' + new Date().getFullYear() + "</span> " + esc(DATA.profile.name) + "</p>" +
        "</div></footer>";
    }
  }

  if (previewing) {
    document.addEventListener("DOMContentLoaded", function () {
      var b = document.createElement("div");
      b.className = "preview-banner"; b.setAttribute("role", "status");
      b.innerHTML = '<span>Previewing your unpublished draft</span><button type="button">Exit preview</button>';
      b.querySelector("button").addEventListener("click", function () {
        try { sessionStorage.removeItem("preview"); } catch (e) { /* ignore */ }
        location.href = location.pathname + location.hash;
      });
      document.body.appendChild(b);
    });
  }

  customElements.define("site-header", SiteHeader);
  customElements.define("site-footer", SiteFooter);
})();
