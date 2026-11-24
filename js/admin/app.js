/* ==========================================================================
   admin/app.js — the admin panel itself: navigation, dashboard, editors,
   undo/redo, change review, publishing and backup.
   Content is edited as a draft in this browser (auto-saved); "Publish" commits
   js/data.js to the site's GitHub repository, which updates the live site.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.Site, C = window.AdminCore, F = window.AdminForms, SCHEMA = window.AdminSchema.SECTIONS;
  var esc = S.esc, icon = S.icon;
  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------- storage */
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } return null; }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } return null; }

  /* --------------------------------------------------------------- state */
  var live = C.clone(window.SITE);                    // what the site currently publishes
  var state = C.clone(live);                          // the working draft
  var history = new C.History(60);
  var restoredNote = "";
  var openItems = new WeakSet();

  (function restoreDraft() {
    try {
      var raw = JSON.parse(ls("admin:draft"));
      if (raw && raw.data && raw.data.profile) {
        if (C.hash(raw.data) !== C.hash(live)) {
          state = raw.data;
          restoredNote = raw.base !== C.hash(live)
            ? "stale"                                   // live content changed since this draft began
            : "ok";
        }
      }
    } catch (e) { /* ignore a corrupt draft */ }
    history.reset(state);
  })();

  var gh = new window.AdminGitHub.GH({ owner: live.profile.githubUser || "", repo: "portfolio", branch: "main" });
  (function loadGh() {
    try { var c = JSON.parse(ls("admin:gh")); if (c) gh.configure(c); } catch (e) { /* ignore */ }
    var tok = ss("admin:token") || ls("admin:token");
    if (tok) gh.configure({ token: tok });
  })();

  var current = "dashboard", pendingFocus = null, listeners = {};
  var diffCache = [], issuesCache = [], saveTimer = 0, pushTimer = 0, statusText = "";
  var booted = false;
  var publishNote = "";   // survives re-renders so the "Published" message never vanishes

  /* ------------------------------------------------------------ the ctx */
  var ctx = {
    get: function (p) { return C.get(state, p); },
    root: function () { return state; },
    set: function (path, value, opts) {
      var key = path.join("."), old = C.get(state, path);
      C.set(state, path, value);
      (listeners[key] || []).forEach(function (l) { l.fn(value, old); });
      if (!opts || !opts.silent) changed(false);
      else scheduleAfter(false);
    },
    mutate: function (fn) { fn(); changed(true); renderSection(); },
    rerender: function () { renderSection(); },
    listen: function (key, fn, keep) { (listeners[key] = listeners[key] || []).push({ fn: fn, keep: keep }); },
    opened: function (item) { openItems.add(item); },
    isOpen: function (item) { return openItems.has(item); },
    setOpen: function (item, o) { if (o) openItems.add(item); else openItems.delete(item); },
    focusPath: function (p) { pendingFocus = p; },
    suggestions: function (name) {
      if (name === "skillCategories") { var seen = {}; return (state.skills || []).map(function (s) { return s.category; }).filter(function (c) { if (!c || seen[c]) return false; seen[c] = 1; return true; }); }
      return [];
    },
    confirm: function (msg, okLabel) { return confirmDialog(msg, okLabel); },
    toast: function (m) { S.toast(m); },
    uploadReady: function () { return gh.ready(); },
    upload: function (file, o) { return uploadFile(file, o); },
  };

  /* ---------------------------------------------------- change tracking */
  function changed(immediate) { scheduleAfter(immediate); setStatus("Saving\u2026"); }
  function scheduleAfter(immediate) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(afterChange, immediate ? 0 : 350);
  }
  function afterChange() {
    ls("admin:draft", JSON.stringify({ base: C.hash(live), data: state, savedAt: Date.now() }));
    clearTimeout(pushTimer); pushTimer = setTimeout(function () { history.push(state); paintUndo(); }, 0);
    recompute();
  }
  function recompute() {
    diffCache = C.diff(live, state);
    issuesCache = C.validate(state);
    setStatus(diffCache.length ? "Draft saved. " + diffCache.length + " unpublished change" + (diffCache.length === 1 ? "" : "s") : "No unpublished changes");
    paintNavBadges(); paintTop();
    var main = $("adMain");
    if (current !== "dashboard" && current !== "publish") F.paintIssues(main, issuesCache);
    if (current === "dashboard") renderDashboardLive();
    if (current === "publish") renderPublishLive();
  }
  function setStatus(t) { statusText = t; var el = $("adStatus"); if (el) el.textContent = t; }

  /* ----------------------------------------------------------- dialogs */
  function confirmDialog(message, okLabel) {
    return new Promise(function (resolve) {
      var d = $("adConfirm");
      $("adConfirmText").textContent = message;
      $("adConfirmOk").textContent = okLabel || "Delete";
      var done = function (v) { d.close(); d.removeEventListener("cancel", onCancel); resolve(v); };
      var onCancel = function () { done(false); };
      d.addEventListener("cancel", onCancel);
      $("adConfirmOk").onclick = function () { done(true); };
      $("adConfirmNo").onclick = function () { done(false); };
      d.showModal();
    });
  }

  /* ------------------------------------------------------- shell: nav/top */
  function counts(section) {
    var e = 0, w = 0;
    issuesCache.forEach(function (i) { if (i.section === section) { if (i.level === "error") e++; else w++; } });
    return { e: e, w: w };
  }
  function sectionOfIssue(i) { return i.section === "journey" ? "journey" : i.section; }

  function buildNav() {
    var nav = $("adNav");
    nav.innerHTML = SCHEMA.map(function (s) {
      return '<a href="#' + s.id + '" data-id="' + s.id + '">' + icon(s.icon, 20) + "<span>" + esc(s.title) + '</span><em class="ad-nb" hidden></em></a>';
    }).join("");
  }
  function paintNavBadges() {
    $("adNav").querySelectorAll("a").forEach(function (a) {
      var id = a.getAttribute("data-id"), s = SCHEMA.filter(function (x) { return x.id === id; })[0];
      a.setAttribute("aria-current", id === current ? "page" : "false");
      if (id === current) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      var b = a.querySelector(".ad-nb"); b.hidden = true;
      if (id === "publish") { if (diffCache.length) { b.hidden = false; b.textContent = diffCache.length; b.className = "ad-nb is-info"; } return; }
      if (!s || s.view) return;
      var c = counts(id);
      if (id === "experience") { var c2 = counts("achievements"); c.e += c2.e; c.w += c2.w; }
      if (c.e) { b.hidden = false; b.textContent = c.e; b.className = "ad-nb is-error"; b.title = c.e + " error(s)"; }
      else if (c.w) { b.hidden = false; b.textContent = c.w; b.className = "ad-nb is-warn"; b.title = c.w + " warning(s)"; }
    });
  }
  function paintTop() {
    var n = diffCache.length, errs = issuesCache.filter(function (i) { return i.level === "error"; }).length;
    var pill = $("adChanges");
    pill.textContent = n ? n + " unpublished" : "Up to date";
    pill.className = "ad-pill " + (n ? "is-info" : "is-ok");
    var pub = $("adPublishBtn");
    pub.disabled = false;
    pub.title = errs ? errs + " problem(s) to fix before publishing" : (n ? "Review and publish" : "Nothing to publish");
    paintUndo();
  }
  function paintUndo() { $("adUndo").disabled = !history.canUndo(); $("adRedo").disabled = !history.canRedo(); }

  /* ----------------------------------------------------------- routing */
  function route() {
    var id = (location.hash || "#dashboard").slice(1);
    if (!SCHEMA.some(function (s) { return s.id === id; })) id = "dashboard";
    if (id !== "publish") publishNote = "";
    current = id;
    document.body.classList.remove("nav-open");
    renderSection();
    var main = $("adMain"); main.setAttribute("tabindex", "-1");
    if (booted) main.focus({ preventScroll: true });          // move focus on navigation, not on first load (keeps the skip link first)
    booted = true;
    window.scrollTo(0, 0);
  }

  function renderSection() {
    var sec = SCHEMA.filter(function (s) { return s.id === current; })[0];
    var main = $("adMain");
    var scroll = window.scrollY;
    listeners = {};
    main.innerHTML = "";
    document.title = sec.title + " \u00b7 Admin";
    if (sec.view === "dashboard") renderDashboard(main);
    else if (sec.view === "publish") renderPublish(main);
    else {
      var head = document.createElement("header"); head.className = "ad-head";
      head.innerHTML = "<div><h1>" + esc(sec.title) + "</h1><p>" + esc(sec.blurb || "") + "</p></div>" +
        (sec.page ? '<button type="button" class="btn btn-sm" id="adViewPage">' + icon("eye", 16) + "Preview this page</button>" : "");
      main.appendChild(head);
      var card = document.createElement("div"); card.className = "ad-card";
      card.appendChild(F.build(sec.fields, ctx, []));
      main.appendChild(card);
      var vp = $("adViewPage"); if (vp) vp.addEventListener("click", function () { openPreview(sec.page); });
      F.paintIssues(main, issuesCache);
    }
    paintNavBadges();
    window.scrollTo(0, scroll);
    if (pendingFocus) {
      var t = main.querySelector('[data-path="' + pendingFocus + '"]'); pendingFocus = null;
      if (t) { var inp = t.querySelector("input, textarea, select"); if (inp) { t.scrollIntoView({ block: "center" }); inp.focus(); } }
    }
  }

  function openPreview(page) {
    ls("admin:draft", JSON.stringify({ base: C.hash(live), data: state, savedAt: Date.now() }));
    window.open((page || "index.html").replace(/(#.*)?$/, function (h) { return "?preview=1" + (h || ""); }).replace("?preview=1?", "?"), "_blank", "noopener");
  }

  /* --------------------------------------------------------- dashboard */
  function renderDashboard(main) {
    main.innerHTML =
      '<header class="ad-head"><div><h1>Dashboard</h1><p>Welcome back. Everything you change is saved as a draft in this browser until you publish it.</p></div></header>' +
      (restoredNote ? '<div class="ad-note is-info" role="status">' + icon("save", 18) + "<div><strong>Draft restored.</strong> " + (restoredNote === "stale" ? "The live site changed since you started this draft. Review the changes before publishing." : "Your unpublished changes from last time are back.") +
        ' <button type="button" class="ad-link" id="adDiscardDraft">Discard draft</button></div></div>' : "") +
      '<div id="adDashLive"></div>';
    var dd = $("adDiscardDraft"); if (dd) dd.addEventListener("click", discardDraft);
    renderDashboardLive();
  }
  function renderDashboardLive() {
    var host = $("adDashLive"); if (!host) return;
    var errs = issuesCache.filter(function (i) { return i.level === "error"; }), warns = issuesCache.filter(function (i) { return i.level === "warn"; });
    var tiles = [
      ["Projects", (state.projects || []).length, "projects", "cube"], ["Skills", (state.skills || []).length, "skills", "wrench"],
      ["Library items", (state.library || []).length, "library", "library"], ["People", (state.people || []).length, "people", "users"],
    ].map(function (t) { return '<a class="ad-tile" href="#' + t[2] + '">' + icon(t[3], 22) + '<strong>' + t[1] + "</strong><span>" + t[0] + "</span></a>"; }).join("");

    var todo = [];
    var P = state.profile || {};
    if (!P.cv) todo.push(["Add your CV (PDF) to show View / Download CV buttons.", "profile"]);
    if (!P.location) todo.push(["Add your location and time zone to show your local time.", "profile"]);
    if (!P.website) todo.push(["Add your main website link for the Website page.", "profile"]);
    if (!(state.people || []).length) todo.push(["List the people you learn from (\u201cWho to follow\u201d).", "people"]);
    if (!(state.experience || []).length) todo.push(["Add work experience. Until then the assistant says none is listed.", "experience"]);
    if (!(state.achievements || []).length) todo.push(["Add achievements or certificates.", "experience"]);
    var noImg = (state.projects || []).filter(function (p) { return !p.image; }).length;
    if (noImg) todo.push(["Add screenshots to " + noImg + " project" + (noImg === 1 ? "" : "s") + " (they use a glass tile for now).", "projects"]);

    host.innerHTML =
      '<div class="ad-tiles">' + tiles + "</div>" +
      '<div class="ad-cols">' +
        '<section class="ad-card"><h2>Status</h2><ul class="ad-stlist">' +
          '<li class="' + (diffCache.length ? "is-info" : "is-ok") + '">' + icon(diffCache.length ? "save" : "check", 18) + "<span><strong>" + (diffCache.length ? diffCache.length + " unpublished change" + (diffCache.length === 1 ? "" : "s") : "Everything is published") + '</strong><small>' + (diffCache.length ? '<a href="#publish">Review &amp; publish</a>' : "The live site matches this draft.") + "</small></span></li>" +
          '<li class="' + (errs.length ? "is-error" : (warns.length ? "is-warn" : "is-ok")) + '">' + icon(errs.length || warns.length ? "alert" : "check", 18) + "<span><strong>" + (errs.length ? errs.length + " problem" + (errs.length === 1 ? "" : "s") + " to fix" : (warns.length ? warns.length + " suggestion" + (warns.length === 1 ? "" : "s") : "No problems found")) + "</strong><small>" + (errs.length ? esc(errs[0].message) : (warns.length ? esc(warns[0].message) : "Links, slugs and required fields all look good.")) + "</small></span></li>" +
          '<li class="' + (gh.ready() ? "is-ok" : "is-warn") + '">' + icon(gh.ready() ? "lock" : "alert", 18) + "<span><strong>" + (gh.ready() ? "GitHub connected" : "GitHub not connected") + "</strong><small>" + (gh.ready() ? esc(gh.cfg.owner + "/" + gh.cfg.repo) + " on " + esc(gh.cfg.branch) : '<a href="#publish">Connect your token</a> to publish and upload images.') + "</small></span></li>" +
        "</ul>" +
        '<div class="ad-actions"><button type="button" class="btn btn-sm" id="adDashPreview">' + icon("eye", 16) + 'Preview draft</button><a class="btn btn-sm" href="index.html" target="_blank" rel="noopener noreferrer">' + icon("external", 16) + 'Open live site</a><a class="btn btn-sm btn-primary" href="#publish">' + icon("share", 16) + "Publish</a></div></section>" +
        '<section class="ad-card"><h2>Suggestions</h2>' + (todo.length ? '<ul class="ad-todo">' + todo.map(function (t) { return '<li><span>' + esc(t[0]) + '</span><a href="#' + t[1] + '" class="ad-link">Go</a></li>'; }).join("") + "</ul>" : '<p class="ad-muted">Your content is complete. Nice work.</p>') + "</section>" +
      "</div>";
    var pv = $("adDashPreview"); if (pv) pv.addEventListener("click", function () { openPreview("index.html"); });
  }

  function discardDraft() {
    confirmDialog("Discard all unpublished changes and go back to the live content?", "Discard").then(function (ok) {
      if (!ok) return;
      state = C.clone(live); history.reset(state); ls("admin:draft", null); restoredNote = ""; recompute(); renderSection(); S.toast("Draft discarded");
    });
  }

  /* ------------------------------------------------------------ publish */
  function renderPublish(main) {
    main.innerHTML =
      '<header class="ad-head"><div><h1>Publish &amp; backup</h1><p>Review what changed, then publish it to your site. Publishing commits <code>js/data.js</code> to your GitHub repository; the site updates in about a minute.</p></div></header>' +
      '<div id="adPubLive"></div>' +
      '<section class="ad-card" id="adGhCard"><h2>Connect GitHub</h2>' +
        '<p class="ad-muted">Publishing needs a GitHub token with write access to <strong>this repository only</strong>. It\u2019s the lock on this panel: nobody without it can change your site. <a class="ad-link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Create a fine-grained token</a> (Repository access: only this repo, Permissions: Contents \u2192 Read and write).</p>' +
        '<div class="ad-grid">' +
          '<div class="ad-field ad-half"><label class="ad-label" for="ghOwner">Owner</label><input class="ad-input" id="ghOwner" value="' + esc(gh.cfg.owner) + '" autocomplete="off" spellcheck="false"></div>' +
          '<div class="ad-field ad-half"><label class="ad-label" for="ghRepo">Repository</label><input class="ad-input" id="ghRepo" value="' + esc(gh.cfg.repo) + '" autocomplete="off" spellcheck="false"></div>' +
          '<div class="ad-field ad-half"><label class="ad-label" for="ghBranch">Branch</label><input class="ad-input" id="ghBranch" value="' + esc(gh.cfg.branch) + '" autocomplete="off" spellcheck="false"></div>' +
          '<div class="ad-field ad-half"><label class="ad-label" for="ghToken">Token</label><input class="ad-input" id="ghToken" type="password" placeholder="' + (gh.cfg.token ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved)" : "github_pat_\u2026") + '" autocomplete="off" spellcheck="false"></div>' +
        "</div>" +
        '<div class="ad-field ad-bool"><label class="ad-switch" for="ghRemember"><input type="checkbox" role="switch" id="ghRemember"' + (ls("admin:token") ? " checked" : "") + '><span class="ad-track" aria-hidden="true"></span><span class="ad-switch-text">Remember the token on this device</span></label><p class="ad-help">Off (recommended): kept for this tab only and forgotten when you close it.</p></div>' +
        '<div class="ad-actions"><button type="button" class="btn btn-sm btn-primary" id="ghTest">' + icon("lock", 16) + 'Connect &amp; test</button><button type="button" class="btn btn-sm" id="ghForget">Forget token</button></div>' +
        '<p class="ad-result" id="ghResult" role="status" aria-live="polite"></p></section>' +
      '<div id="adPubGo"></div>' +
      '<section class="ad-card"><h2>Backup &amp; restore</h2><p class="ad-muted">Keep a copy of your content, or move it to another browser.</p>' +
        '<div class="ad-actions"><button type="button" class="btn btn-sm" id="adDlJs">' + icon("download", 16) + 'Download data.js</button><button type="button" class="btn btn-sm" id="adDlJson">' + icon("download", 16) + 'Download JSON</button><button type="button" class="btn btn-sm" id="adCopy">' + icon("copy", 16) + 'Copy data.js</button><button type="button" class="btn btn-sm" id="adImport">' + icon("upload", 16) + 'Import a backup\u2026</button><input type="file" id="adImportFile" class="visually-hidden" accept=".js,.json,application/json,text/javascript" tabindex="-1" aria-hidden="true"></div>' +
        '<div class="ad-actions ad-actions-sep"><button type="button" class="btn btn-sm" id="adResetDraft">Discard my draft</button></div></section>';

    $("ghTest").addEventListener("click", connectAndTest);
    $("ghForget").addEventListener("click", function () { ss("admin:token", null); ls("admin:token", null); gh.configure({ token: "" }); $("ghToken").value = ""; $("ghToken").placeholder = "github_pat_\u2026"; $("ghResult").className = "ad-result"; $("ghResult").textContent = "Token forgotten."; renderPublishLive(); });
    $("adDlJs").addEventListener("click", function () { download("data.js", C.serialize(state), "text/javascript"); });
    $("adDlJson").addEventListener("click", function () { download("portfolio-content.json", JSON.stringify(state, null, 2), "application/json"); });
    $("adCopy").addEventListener("click", function () { S.copyText(C.serialize(state)).then(function () { S.toast("data.js copied"); }, function () { S.toast("Couldn't copy. Use Download instead."); }); });
    $("adImport").addEventListener("click", function () { $("adImportFile").click(); });
    $("adImportFile").addEventListener("change", importFile);
    $("adResetDraft").addEventListener("click", discardDraft);
    renderPublishLive();
  }

  function saveGhFields() {
    var o = $("ghOwner"); if (!o) return;
    gh.configure({ owner: o.value, repo: $("ghRepo").value, branch: $("ghBranch").value });
    var tok = $("ghToken").value.trim();
    if (tok) {
      gh.configure({ token: tok });
      if ($("ghRemember").checked) { ls("admin:token", tok); ss("admin:token", null); } else { ss("admin:token", tok); ls("admin:token", null); }
      $("ghToken").value = ""; $("ghToken").placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved)";
    } else if (gh.cfg.token) {
      if ($("ghRemember").checked) { ls("admin:token", gh.cfg.token); ss("admin:token", null); } else { ls("admin:token", null); ss("admin:token", gh.cfg.token); }
    }
    ls("admin:gh", JSON.stringify({ owner: gh.cfg.owner, repo: gh.cfg.repo, branch: gh.cfg.branch }));
  }

  function connectAndTest() {
    saveGhFields();
    var out = $("ghResult"); out.className = "ad-result"; out.textContent = "Checking\u2026";
    gh.test().then(function (r) {
      out.className = "ad-result is-ok"; out.textContent = "Connected to " + r.name + (r.private ? " (private)" : "") + ". You can publish and upload images.";
      renderPublishLive(); paintTop();
    }, function (e) { out.className = "ad-result is-error"; out.textContent = e.message; });
  }

  function renderPublishLive() {
    var host = $("adPubLive"); if (!host) return;
    var errs = issuesCache.filter(function (i) { return i.level === "error"; }), warns = issuesCache.filter(function (i) { return i.level === "warn"; });
    var bySection = {};
    diffCache.forEach(function (d) { (bySection[d.section || "other"] = bySection[d.section || "other"] || []).push(d); });
    var title = function (id) { var s = SCHEMA.filter(function (x) { return x.id === id; })[0]; return s ? s.title : id.charAt(0).toUpperCase() + id.slice(1); };

    var changes = diffCache.length
      ? Object.keys(bySection).map(function (k) {
          var list = bySection[k];
          return '<details class="ad-diffgrp"><summary><strong>' + esc(title(k)) + "</strong><span>" + list.length + " change" + (list.length === 1 ? "" : "s") + "</span></summary><ul class=\"ad-diff\">" +
            list.slice(0, 60).map(function (d) { return '<li class="is-' + d.type + '"><b aria-hidden="true">' + (d.type === "add" ? "+" : d.type === "remove" ? "\u2212" : "~") + "</b><code>" + esc(d.text) + "</code></li>"; }).join("") +
            (list.length > 60 ? "<li class=\"ad-muted\">\u2026and " + (list.length - 60) + " more</li>" : "") + "</ul></details>";
        }).join("")
      : '<p class="ad-muted">No changes yet. Edit something and it will show up here.</p>';

    var problems = errs.length || warns.length
      ? '<ul class="ad-issues">' + errs.concat(warns).slice(0, 40).map(function (i) {
          return '<li class="is-' + i.level + '">' + icon("alert", 16) + '<span>' + esc(i.message) + '</span><a class="ad-link" href="#' + esc(i.section) + '" data-focus="' + esc(i.path.join(".")) + '">Fix</a></li>';
        }).join("") + "</ul>"
      : '<p class="ad-ok">' + icon("check", 18) + " All checks passed.</p>";

    var canPublish = diffCache.length && !errs.length && gh.ready();
    var why = !diffCache.length ? "There's nothing new to publish." : errs.length ? "Fix the " + errs.length + " problem" + (errs.length === 1 ? "" : "s") + " above first." : !gh.ready() ? "Connect GitHub below first." : "";

    host.innerHTML =
      '<section class="ad-card"><h2>Review changes <span class="ad-count">' + diffCache.length + "</span></h2>" + changes + "</section>" +
      '<section class="ad-card"><h2>Checks</h2>' + problems + "</section>";
    var go = $("adPubGo");
    go.innerHTML =
      '<section class="ad-card"><h2>Publish</h2><div class="ad-field"><label class="ad-label" for="adMsg">Commit message</label><input class="ad-input" id="adMsg" value="' + esc(ss("admin:msg") || "Update site content (admin panel)") + '"></div>' +
        '<div class="ad-actions"><button type="button" class="btn btn-primary" id="adPublish"' + (canPublish ? "" : " disabled") + ">" + icon("share", 18) + "Publish to " + esc(gh.cfg.owner || "GitHub") + "/" + esc(gh.cfg.repo || "") + "</button>" + (why ? '<span class="ad-muted">' + esc(why) + "</span>" : "") + "</div>" +
        '<div id="adPubResult" role="status" aria-live="polite">' + publishNote + "</div></section>";

    host.querySelectorAll("[data-focus]").forEach(function (a) { a.addEventListener("click", function () { pendingFocus = a.getAttribute("data-focus"); }); });
    var pb = $("adPublish"); if (pb) pb.addEventListener("click", doPublish);
    var m = $("adMsg"); if (m) m.addEventListener("input", function () { ss("admin:msg", m.value); });
  }

  function doPublish() {
    var errs = issuesCache.filter(function (i) { return i.level === "error"; });
    if (errs.length || !diffCache.length) return;
    var btn = $("adPublish"), out = $("adPubResult");
    confirmDialog("Publish " + diffCache.length + " change" + (diffCache.length === 1 ? "" : "s") + " to " + gh.cfg.owner + "/" + gh.cfg.repo + " (" + gh.cfg.branch + ")? The live site updates in about a minute.", "Publish").then(function (ok) {
      if (!ok) return;
      btn.disabled = true; btn.innerHTML = icon("refresh", 18) + "Publishing\u2026"; out.innerHTML = ""; publishNote = ""; document.body.classList.add("ad-busy");
      var text = C.serialize(state, new Date().toISOString());
      var msg = ($("adMsg") && $("adMsg").value.trim()) || "Update site content (admin panel)";
      gh.publishData(text, msg).then(function (r) {
        live = C.clone(state); ls("admin:draft", null); restoredNote = ""; history.reset(state);
        document.body.classList.remove("ad-busy");
        publishNote = '<div class="ad-note is-ok">' + icon("check", 18) + "<div><strong>Published.</strong> GitHub is rebuilding the site; it\u2019s live in about a minute. " + (r.url ? '<a class="ad-link" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">View the commit</a>' : "") + "</div></div>";
        recompute(); S.toast("Published");
      }, function (e) {
        document.body.classList.remove("ad-busy");
        publishNote = '<div class="ad-note is-error">' + icon("alert", 18) + "<div><strong>Couldn\u2019t publish.</strong> " + esc(e.message) + "</div></div>";
        out.innerHTML = publishNote;
        btn.disabled = false; btn.innerHTML = icon("share", 18) + "Publish";
      });
    });
  }

  /* ----------------------------------------------------- files: io, upload */
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function importFile(e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var data;
      try { data = C.parse(String(r.result)); } catch (err) { S.toast(err.message); e.target.value = ""; return; }
      confirmDialog("Replace your current draft with the contents of \u201c" + f.name + "\u201d? You can undo this.", "Import").then(function (ok) {
        if (ok) { state = data; changed(true); renderSection(); S.toast("Backup imported"); }
        e.target.value = "";
      });
    };
    r.readAsText(f);
  }

  function toBase64(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(",")[1]); }; fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  function resizeImage(file, max) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, (max || 1400) / Math.max(img.width, img.height));
        var cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          if (b && b.type === "image/webp") return res({ blob: b, ext: "webp" });
          cv.toBlob(function (j) { j ? res({ blob: j, ext: "jpg" }) : rej(new Error("Couldn't process that image.")); }, "image/jpeg", 0.88);
        }, "image/webp", 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("That file isn't a readable image.")); };
      img.src = url;
    });
  }
  function uploadFile(file, o) {
    if (!gh.ready()) return Promise.reject(new Error("Connect GitHub first."));
    var base = C.slugify(file.name.replace(/\.[^.]+$/, "")) || "file";
    if (o.kind === "pdf") {
      if (file.type !== "application/pdf") return Promise.reject(new Error("Please choose a PDF file."));
      if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error("That PDF is over 8 MB."));
      var ppath = (o.dir || "assets/uploads") + "/" + base + ".pdf";
      return toBase64(file).then(function (b64) { return gh.uploadBase64(ppath, b64, "Add " + ppath + " (admin panel)"); }).then(function () { return ppath; });
    }
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return Promise.reject(new Error("Use a PNG, JPG, WebP or GIF image."));
    if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error("That image is over 12 MB."));
    return resizeImage(file, o.max).then(function (r) {
      var path = (o.dir || "assets/images/uploads") + "/" + base + "-" + Date.now().toString(36) + "." + r.ext;
      return toBase64(r.blob).then(function (b64) { return gh.uploadBase64(path, b64, "Add " + path + " (admin panel)"); }).then(function () { return path; });
    });
  }

  /* -------------------------------------------------------- global events */
  function wire() {
    $("adUndo").addEventListener("click", undo);
    $("adRedo").addEventListener("click", redo);
    $("adPreviewBtn").addEventListener("click", function () { openPreview("index.html"); });
    $("adPublishBtn").addEventListener("click", function () { location.hash = "#publish"; });
    $("adNavToggle").addEventListener("click", function () { var o = document.body.classList.toggle("nav-open"); $("adNavToggle").setAttribute("aria-expanded", String(o)); });
    $("adTheme").addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; S.applyTheme(next); S.store("theme", next);
    });
    window.addEventListener("hashchange", route);
    document.addEventListener("keydown", function (e) {
      var mod = e.ctrlKey || e.metaKey, tag = (e.target.tagName || "").toLowerCase(), typing = tag === "input" || tag === "textarea" || tag === "select";
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); afterChange(); S.toast("Draft saved"); }
      else if (mod && !typing && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && !typing && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    });
    window.addEventListener("beforeunload", function (e) { if (document.body.classList.contains("ad-busy")) { e.preventDefault(); e.returnValue = ""; } });
  }
  function undo() { var s = history.undo(); if (s) { state = s; ls("admin:draft", JSON.stringify({ base: C.hash(live), data: state, savedAt: Date.now() })); recompute(); renderSection(); } }
  function redo() { var s = history.redo(); if (s) { state = s; ls("admin:draft", JSON.stringify({ base: C.hash(live), data: state, savedAt: Date.now() })); recompute(); renderSection(); } }

  /* ---------------------------------------------------------------- boot */
  buildNav(); wire();
  diffCache = C.diff(live, state); issuesCache = C.validate(state);
  route(); paintTop(); setStatus(diffCache.length ? "Draft restored. " + diffCache.length + " unpublished change" + (diffCache.length === 1 ? "" : "s") : "No unpublished changes");
  window.AdminApp = { state: function () { return state; }, live: function () { return live; }, gh: gh };
})();
