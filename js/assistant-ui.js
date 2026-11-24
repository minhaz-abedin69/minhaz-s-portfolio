/* ==========================================================================
   assistant-ui.js — the floating assistant. All conversation logic lives in
   assistant-engine.js; this file only draws, times and remembers.

   Behaviour
   • A small floating button is always present.
   • After the visitor has scrolled ~30% of the page (and stayed a few seconds),
     or has been here ~30s, a subtle bubble appears. A moment later the
     conversation opens by itself (on phones the bubble waits for a tap) and the
     greeting plays with a typing indicator before each message.
   • The greeting plays ONCE per browser session. Closing and reopening, or
     navigating to another page, restores the conversation instead.
   • If the visitor dismisses it, it never reopens by itself.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.Site;
  if (!S || !window.AssistantKnowledge || !window.AssistantEngine) return;
  var D = S.data;
  var cfg = D.assistant || {};
  if (!cfg.enabled || S.page() === "notfound") return;

  var esc = S.esc, icon = S.icon;
  var K = window.AssistantKnowledge.build(D);
  var engine = window.AssistantEngine.create(K, { endpoint: cfg.endpoint || "" });
  var auto = cfg.autoStart || {};
  var first = K.firstName;

  var reduceMotion = { get matches() { return !(S.motion && S.motion.full()); } };
  var phone = window.matchMedia("(max-width: 600px)");

  /* ------------------------------------------------------------- state */
  var KEY = "assistant:v1";
  var state = { messages: [], chips: null, greeted: false, open: false, dismissed: false };
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY));
    if (saved && Array.isArray(saved.messages)) state = saved;
  } catch (e) { /* storage unavailable: fine, memory only */ }
  function save() {
    state.messages = state.messages.slice(-60);
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /* --------------------------------------------------------------- DOM */
  var root = document.createElement("div");
  root.className = "ai-root";
  root.innerHTML =
    '<div class="ai-bubble" id="aiBubble" role="status" hidden>' +
      '<button type="button" class="ai-bubble-x" id="aiBubbleX" aria-label="Dismiss">' + icon("close", 14) + "</button>" +
      '<p><strong>Hi \ud83d\udc4b</strong> Questions about ' + esc(first) + "\u2019s work? Ask my assistant.</p>" +
    "</div>" +
    '<section class="ai-panel" id="aiPanel" role="dialog" aria-label="' + esc(first) + '\u2019s AI assistant" aria-modal="false" hidden>' +
      '<header class="ai-head">' +
        '<span class="ai-avatar"><img src="' + esc(D.profile.avatar) + '" alt="" width="40" height="40"><i class="ai-online" aria-hidden="true"></i></span>' +
        '<div class="ai-title"><strong>' + esc(first) + "\u2019s Assistant</strong><span><i aria-hidden=\"true\"></i>Online \u00b7 AI</span></div>" +
        '<button type="button" class="ai-iconbtn" id="aiReset" aria-label="Start a new conversation" title="New conversation">' + icon("refresh", 17) + "</button>" +
        '<button type="button" class="ai-iconbtn" id="aiClose" aria-label="Close assistant" title="Close">' + icon("close", 18) + "</button>" +
      "</header>" +
      '<div class="ai-log" id="aiLog" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Conversation"></div>' +
      '<span class="visually-hidden" id="aiStatus" role="status" aria-live="polite"></span>' +
      '<form class="ai-form" id="aiForm" autocomplete="off">' +
        '<label class="visually-hidden" for="aiInput">Ask about ' + esc(first) + "</label>" +
        '<textarea id="aiInput" rows="1" maxlength="400" placeholder="Ask about ' + esc(first) + "\u2019s work\u2026\" enterkeyhint=\"send\"></textarea>" +
        '<button type="submit" class="ai-send" aria-label="Send message">' + icon("send", 18) + "</button>" +
      "</form>" +
      '<p class="ai-note">AI assistant \u00b7 answers come only from this portfolio</p>' +
    "</section>" +
    '<button type="button" class="ai-fab" id="aiFab" aria-label="Open AI assistant" aria-expanded="false" aria-controls="aiPanel">' +
      '<span class="ai-fab-icon ai-fab-open">' + icon("spark", 24) + '</span><span class="ai-fab-icon ai-fab-close">' + icon("chevron", 24) + "</span>" +
      '<i class="ai-fab-dot" aria-hidden="true"></i>' +
    "</button>";
  document.body.appendChild(root);
  if (!state.greeted && !state.dismissed) root.classList.add("ai-attn");

  var $ = function (id) { return document.getElementById(id); };
  var fab = $("aiFab"), panel = $("aiPanel"), bubble = $("aiBubble"), log = $("aiLog"), input = $("aiInput"), statusEl = $("aiStatus");

  /* ----------------------------------------------------------- helpers */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, reduceMotion.matches ? ms * 0.6 : ms); }); }
  function typingMs(text) { return Math.min(1900, Math.max(650, 420 + text.length * 15)); }

  function format(text) {
    return esc(text)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>")
      .replace(/(^|<br>)\u2022 /g, '$1<span class="ai-bullet">\u2022</span>');
  }

  function scrollDown(smooth) {
    log.scrollTo({ top: log.scrollHeight, behavior: smooth && !reduceMotion.matches ? "smooth" : "auto" });
  }

  function row(role, html, actions, animate) {
    var el = document.createElement("div");
    el.className = "ai-m ai-m-" + role + (animate ? " is-new" : "");
    var inner = '<div class="ai-b">' + html + "</div>";
    if (actions && actions.length) {
      inner += '<div class="ai-actions">' + actions.map(function (a) {
        var ext = a.external || /^https?:/.test(a.href);
        return '<a class="ai-action" href="' + esc(S.safeUrl(a.href)) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + esc(a.label) +
          (ext ? icon("external", 13) + '<span class="visually-hidden"> (opens in a new tab)</span>' : "") + "</a>";
      }).join("") + "</div>";
    }
    el.innerHTML = inner;
    return el;
  }

  var typingEl = null;
  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement("div");
    typingEl.className = "ai-m ai-m-assistant is-new ai-typing";
    typingEl.setAttribute("aria-hidden", "true");
    typingEl.innerHTML = '<div class="ai-b"><span></span><span></span><span></span></div>';
    log.appendChild(typingEl);
    statusEl.textContent = first + "\u2019s assistant is typing";
    scrollDown(true);
  }
  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
    statusEl.textContent = "";
  }

  var chipsEl = null;
  function renderChips() {
    if (chipsEl) { chipsEl.remove(); chipsEl = null; }
    if (!state.chips || !state.chips.length) return;
    chipsEl = document.createElement("div");
    chipsEl.className = "ai-chips is-new";
    chipsEl.setAttribute("role", "group");
    chipsEl.setAttribute("aria-label", "Suggested questions");
    chipsEl.innerHTML = state.chips.map(function (c) {
      return '<button type="button" class="ai-chip" data-q="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
    log.appendChild(chipsEl);
    scrollDown(true);
  }

  function draw(m, animate) {
    if (chipsEl) { chipsEl.remove(); chipsEl = null; }
    log.appendChild(row(m.role, format(m.text), m.actions, animate));
    scrollDown(animate);
  }

  function push(role, text, actions, animate) {
    var m = { role: role, text: text, actions: actions || [] };
    state.messages.push(m);
    draw(m, animate !== false);
    save();
    return m;
  }

  /* ------------------------------------------------------- conversation */
  var run = 0;                    // bumps on reset so stale timers stop
  var queue = Promise.resolve();  // answers are delivered one at a time

  function sayLines(lines, token) {
    return lines.reduce(function (p, line, i) {
      return p.then(function () {
        if (token !== run) return;
        showTyping();
        return sleep(i === 0 ? 900 : typingMs(line)).then(function () {
          if (token !== run) { hideTyping(); return; }
          hideTyping();
          push("assistant", line);
          return sleep(i === lines.length - 1 ? 250 : 550);
        });
      });
    }, Promise.resolve());
  }

  function greet() {
    if (state.greeted) return Promise.resolve();
    state.greeted = true; save();
    var token = run;
    return sayLines(engine.opening(), token).then(function () {
      if (token !== run) return;
      state.chips = engine.suggestions(); save();
      renderChips();
    });
  }

  function ask(text) {
    text = String(text || "").trim().slice(0, 400);
    if (!text) return;
    state.chips = null;
    state.greeted = true;
    push("user", text);
    var token = run;
    queue = queue.then(function () {
      if (token !== run) return;
      showTyping();
      var started = Date.now();
      var history = state.messages.map(function (m) { return { role: m.role, text: m.text }; });
      return engine.reply(history).then(function (r) {
        var wait = Math.max(0, typingMs(r.text) - (Date.now() - started));
        return sleep(wait).then(function () { return r; });
      }).then(function (r) {
        hideTyping();
        if (token !== run) return;
        push("assistant", r.text, r.actions);
        state.chips = (r.followups || []).slice(0, 3); save();
        renderChips();
      }).catch(function () {
        hideTyping();
        push("assistant", "Sorry, something went wrong on my side. You can reach " + first + " on the Contact page.", [{ label: "Contact page", href: K.pages.contact }]);
      });
    });
  }

  /* --------------------------------------------------------- open/close */
  var restoring = false;
  function setOpen(open, opts) {
    opts = opts || {};
    if (open === state.open && !restoring) return;
    state.open = open; save();
    fab.setAttribute("aria-expanded", String(open));
    fab.setAttribute("aria-label", open ? "Close AI assistant" : "Open AI assistant");
    root.classList.toggle("is-open", open);
    if (open) {
      root.classList.remove("ai-attn");
      hideBubble();
      panel.hidden = false;
      void panel.offsetWidth;                // let the browser see the hidden -> shown change, so it animates
      panel.classList.add("is-open");
      scrollDown(false);
      if (!state.greeted) greet();
      if (opts.focus !== false && !phone.matches) setTimeout(function () { input.focus({ preventScroll: true }); }, 280);
    } else {
      var hadFocus = panel.contains(document.activeElement);
      panel.classList.remove("is-open");
      setTimeout(function () { if (!state.open) panel.hidden = true; }, reduceMotion.matches ? 0 : 260);
      if (hadFocus) fab.focus({ preventScroll: true });
    }
  }

  function showBubble() {
    if (state.open || state.dismissed) return;
    bubble.hidden = false;
    void bubble.offsetWidth;
    bubble.classList.add("is-shown");
  }
  function hideBubble() {
    bubble.classList.remove("is-shown");
    setTimeout(function () { if (!bubble.classList.contains("is-shown")) bubble.hidden = true; }, 250);
  }

  /* ------------------------------------------------------------ events */
  fab.addEventListener("click", function () { state.dismissed = true; setOpen(!state.open); });
  $("aiClose").addEventListener("click", function () { state.dismissed = true; setOpen(false); });
  bubble.addEventListener("click", function (e) {
    if (e.target.closest("#aiBubbleX")) { state.dismissed = true; root.classList.remove("ai-attn"); save(); hideBubble(); return; }
    state.dismissed = true; setOpen(true);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && state.open && (panel.contains(document.activeElement) || document.activeElement === document.body)) { state.dismissed = true; setOpen(false); }
  });

  $("aiReset").addEventListener("click", function () {
    run++; hideTyping(); queue = Promise.resolve();
    state.messages = []; state.chips = null; state.greeted = false; save();
    log.innerHTML = ""; chipsEl = null;
    greet();
  });

  $("aiForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = input.value;
    input.value = ""; autosize();
    ask(v);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("aiForm").requestSubmit(); }
  });
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(110, input.scrollHeight) + "px"; }
  input.addEventListener("input", autosize);

  log.addEventListener("click", function (e) {
    var chip = e.target.closest(".ai-chip");
    if (chip) ask(chip.getAttribute("data-q"));
  });

  // Anything on the site can open the assistant: <button data-open-assistant>
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-open-assistant]")) { state.dismissed = true; setOpen(true); }
  });
  S.assistant = { open: function () { setOpen(true); }, close: function () { setOpen(false); }, ask: ask };

  /* ------------------------------------------------------------ restore */
  if (state.messages.length) {
    state.messages.forEach(function (m) { draw(m, false); });
    renderChips();
  }
  if (state.open) { restoring = true; state.open = false; setOpen(true, { focus: false }); restoring = false; }

  /* ----------------------------------------------------- automatic start */
  if (!state.greeted && !state.dismissed) {
    var t0 = Date.now(), fired = false, timer;
    var check = function () {
      if (fired || state.open || state.dismissed) return;
      var secs = (Date.now() - t0) / 1000;
      var range = document.documentElement.scrollHeight - window.innerHeight;
      var pct = range > 60 ? (window.scrollY / range) * 100 : 0;      // pages that don't scroll rely on the timer
      if ((pct >= (auto.scrollPercent || 30) && secs >= (auto.minSeconds || 6)) || secs >= (auto.afterSeconds || 30)) fire();
    };
    var fire = function () {
      fired = true;
      clearInterval(timer);
      window.removeEventListener("scroll", check);
      showBubble();
      setTimeout(function () {
        // Phones: leave the bubble for a tap. Wider screens: open the conversation softly.
        if (!state.open && !state.dismissed && !phone.matches) setOpen(true, { focus: false });
      }, auto.bubbleDelayMs || 2600);
    };
    window.addEventListener("scroll", check, { passive: true });
    timer = setInterval(check, 1000);
  }
})();
