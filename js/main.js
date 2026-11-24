/* ==========================================================================
   main.js — behaviour layer. Runs deferred, after render.js has built the
   page, so everything it looks for already exists.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.Site;
  var D = S.data;
  var esc = S.esc;
  var icon = S.icon;
  var reduceMotion = !(S.motion && S.motion.full());   // decided once per page load; CSS reacts live

  /* ------------------------------------------------------ Scroll reveal
     Below-the-fold blocks fade in once. Everything is visible if JS or
     IntersectionObserver is missing, or if the user prefers reduced motion. */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------------- Tabs */
  var tabs = [].slice.call(document.querySelectorAll('[role="tab"]'));
  if (tabs.length) {
    var strip = tabs[0].parentNode;
    var ind = document.createElement("span");
    ind.className = "tab-ind"; ind.setAttribute("aria-hidden", "true");
    strip.appendChild(ind);
    var moveInd = function () {
      var cur = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0];
      if (!cur) return;
      var inset = Math.min(22, cur.offsetWidth * 0.18);
      ind.style.width = Math.max(10, cur.offsetWidth - inset * 2) + "px";
      ind.style.transform = "translateX(" + (cur.offsetLeft + inset) + "px)";
    };
    window.addEventListener("resize", moveInd);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInd);
    var selectTab = function (tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        var panelEl = document.getElementById(t.getAttribute("aria-controls"));
        var wasHidden = panelEl.hidden;
        panelEl.hidden = !on;
        if (on && wasHidden) {                       // replay the slide-up on the panel that just appeared
          panelEl.classList.remove("panel-in"); void panelEl.offsetWidth; panelEl.classList.add("panel-in");
          setTimeout(function () { panelEl.classList.remove("panel-in"); }, 700);
        }
      });
      moveInd();
      if (focus) tab.focus();
      var work = tab.id === "tab-work";
      if ((location.hash === "#work") !== work) history.replaceState(null, "", work ? "#work" : location.pathname + location.search);
    };
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { selectTab(t); });
      t.addEventListener("keydown", function (e) {
        var n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (n === undefined) return;
        e.preventDefault();
        selectTab(tabs[(n + tabs.length) % tabs.length], true);
      });
    });
    var fromHash = function () { if (location.hash === "#work") selectTab(document.getElementById("tab-work")); };
    fromHash();
    moveInd();
    window.addEventListener("hashchange", function () { selectTab(document.getElementById(location.hash === "#work" ? "tab-work" : "tab-resume")); });
  }

  /* ---------------------------------------------------------- Read more */
  var aboutToggle = document.getElementById("aboutToggle");
  if (aboutToggle) {
    var more = document.getElementById("aboutMore");
    aboutToggle.addEventListener("click", function () {
      var open = aboutToggle.getAttribute("aria-expanded") === "true";
      aboutToggle.setAttribute("aria-expanded", String(!open));
      aboutToggle.innerHTML = (open ? "Read more" : "Read less") + icon("chevron", 16);
      more.classList.toggle("is-open", !open);
      if (open) more.setAttribute("inert", ""); else more.removeAttribute("inert");
    });
  }

  /* ------------------------------------------------------------- Copy */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-copy]");
    if (!btn) return;
    var text = btn.getAttribute("data-copy");
    var label = btn.getAttribute("data-copy-label") || "Text";
    S.copyText(text).then(function () {
      S.toast(label + " copied");
      var original = btn.innerHTML;
      btn.innerHTML = icon("check", 16) + "Copied";
      setTimeout(function () { btn.innerHTML = original; }, 1600);
    }, function () {
      S.toast("Couldn\u2019t copy. Select the text instead.");
    });
  });

  /* -------------------------------------------------------------- Share
     Web Share API where the browser has it (phones, Safari, Edge); otherwise
     the link is copied to the clipboard and a toast confirms it.            */
  document.querySelectorAll("[data-share]").forEach(function (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var url = location.href.split("#")[0];
      var data = { title: D.profile.name, text: D.profile.name + ", " + D.profile.headline, url: url };

      var fallback = function () {
        S.copyText(url).then(
          function () { S.toast("Link copied to clipboard"); },
          function () { S.toast("Couldn\u2019t copy. Copy the address from your browser instead."); }
        );
      };

      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        navigator.share(data).catch(function (err) {
          if (!err || err.name !== "AbortError") fallback(); // AbortError = person closed the share sheet
        });
      } else {
        fallback();
      }
    });
  });

  /* ------------------------------------------------------- GitHub stats
     Public API, no key. Cached for the session so we make at most one pair
     of requests, and the UI simply stays quiet if the request fails.      */
  var gh = null;
  var LANG = { PHP: "#8892bf", JavaScript: "#f1e05a", TypeScript: "#3178c6", HTML: "#e34c26", CSS: "#663399", "C++": "#f34b7d", C: "#8a8a8a", Java: "#b07219", Python: "#3572a5", Vue: "#41b883", Shell: "#89e051" };

  function repoCards(repos) {
    return repos.map(function (r) {
      var owner = r.full_name.split("/")[0];
      return '<li><a class="repo" href="' + esc(S.safeUrl(r.url)) + '" target="_blank" rel="noopener noreferrer">' +
        '<p class="repo-name"><span>' + esc(owner) + "/</span><b>" + esc(r.name) + "</b></p>" +
        '<p class="repo-desc">' + esc(r.description || "No description yet.") + "</p>" +
        '<div class="repo-meta">' +
          (r.language ? '<span><i class="lang-dot" style="background:' + (LANG[r.language] || "#7d8590") + '"></i>' + esc(r.language) + "</span>" : "") +
          '<span>' + icon("star", 14) + r.stars + "</span>" +
          '<span>' + icon("fork", 14) + r.forks + "</span>" +
        '</div><span class="visually-hidden">(opens in a new tab)</span></a></li>';
    }).join("");
  }

  function renderOSS() {
    if (!gh || !gh.repos || !gh.repos.length) return;
    var html = repoCards(gh.repos);
    var list = document.getElementById("ossList"), section = document.getElementById("ossSection");
    if (list && section) { list.innerHTML = html; section.hidden = false; }
    var wl = document.getElementById("ghRepos"), block = document.getElementById("ghRepoBlock");
    if (wl && block) {
      wl.innerHTML = html;
      var count = document.getElementById("ghRepoCount");
      count.innerHTML = gh.publicRepos ? 'Total <strong class="num"></strong> ' + (gh.publicRepos === 1 ? "repository" : "repositories") : "Repositories";
      var rn = count.querySelector(".num");
      if (rn) { if (S.motionFx) S.motionFx.count(rn, gh.publicRepos); else rn.textContent = gh.publicRepos; }
      block.hidden = false;
    }
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function renderGraph() {
    var host = document.getElementById("ghGraph");
    if (!host || !gh || !gh.contrib || !gh.contrib.days || !gh.contrib.days.length) return;
    var days = gh.contrib.days;
    var lead = new Date(days[0].date + "T00:00:00Z").getUTCDay();      // pad so rows are Sun..Sat
    var cells = [];
    for (var i = 0; i < lead; i++) cells.push(null);
    days.forEach(function (d) { cells.push(d); });
    var weeks = Math.ceil(cells.length / 7);

    var labels = "", lastMonth = -1, lastCol = -10;
    for (var w = 0; w < weeks; w++) {
      var d0 = cells.slice(w * 7, w * 7 + 7).filter(Boolean)[0];
      if (!d0) continue;
      var mo = new Date(d0.date + "T00:00:00Z").getUTCMonth();
      if (mo !== lastMonth && w - lastCol >= 3) { labels += '<span style="grid-column:' + (w + 1) + '">' + MONTHS[mo] + "</span>"; lastCol = w; }
      lastMonth = mo;
    }
    var grid = cells.map(function (c, idx) {
      if (!c) return '<i class="gh-cell gap"></i>';
      var when = new Date(c.date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
      return '<i class="gh-cell l' + (c.level || 0) + '" style="--c:' + Math.floor(idx / 7) + ";--r:" + (idx % 7) + '" title="' + c.count + (c.count === 1 ? " contribution" : " contributions") + " on " + esc(when) + '"></i>';
    }).join("");
    host.style.setProperty("--weeks", weeks);
    host.innerHTML = '<div class="gh-months">' + labels + '</div><div class="gh-grid" aria-hidden="true">' + grid + "</div>";

    var total = gh.contrib.total;
    host.setAttribute("aria-label", total.toLocaleString() + " contributions in the last year");
    document.getElementById("ghTotal").innerHTML = '<strong class="num"></strong> contributions in the last year';
    if (S.motionFx) S.motionFx.count(document.querySelector("#ghTotal .num"), total); else document.querySelector("#ghTotal .num").textContent = total.toLocaleString();
    document.getElementById("ghContrib").hidden = false;
    var sc = document.getElementById("ghScroll");
    if (sc) sc.scrollLeft = sc.scrollWidth;                             // newest weeks in view on narrow screens
  }

  function applyGithub() {
    if (!gh) return;
    var line = document.querySelector("[data-gh-followers-text]");
    if (line && gh.followers > 0) {
      line.innerHTML = '<span class="num"></span> ' + (gh.followers === 1 ? "follower" : "followers") + " on GitHub";
      if (S.motionFx) S.motionFx.count(line.querySelector(".num"), gh.followers); else line.querySelector(".num").textContent = gh.followers;
      line.hidden = false;
    }
    document.querySelectorAll("[data-repo]").forEach(function (el) {
      var n = gh.stars[el.getAttribute("data-repo")];
      if (n > 0) {
        el.querySelector("span").textContent = n + (n === 1 ? " star" : " stars");
        el.hidden = false;
      }
    });
    renderOSS();
    renderGraph();
    if (S.motionFx) S.motionFx.scan(document);        // reveal the repo cards / graph blocks that were just added
  }
  S.refreshGithub = applyGithub;

  // Contribution calendar: GitHub only exposes it behind authentication, so this uses a public
  // mirror (SITE.github.contributionsApi). If it is unreachable the graph just stays hidden.
  function loadContributions(user) {
    var api = D.github && D.github.contributionsApi;
    if (!api) return Promise.resolve(null);
    return fetch(api + encodeURIComponent(user) + "?y=last")
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        var days = (j.contributions || []).filter(function (d) { return d && d.date; })
          .map(function (d) { return { date: d.date, count: d.count || 0, level: d.level || 0 }; })
          .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        if (!days.length) return null;
        var total = (j.total && (j.total.lastYear || Object.keys(j.total).reduce(function (s, k) { return s + j.total[k]; }, 0))) ||
          days.reduce(function (s, d) { return s + d.count; }, 0);
        return { total: total, days: days };
      })
      .catch(function () { return null; });
  }

  function loadGithub() {
    var user = D.profile.githubUser;
    if (!user || !window.fetch) return;
    var KEY = "gh:v3:" + user;
    try {
      var cached = JSON.parse(sessionStorage.getItem(KEY));
      if (cached && Date.now() - cached.t < 30 * 60 * 1000) { gh = cached; applyGithub(); return; }
    } catch (e) { /* ignore */ }

    var opts = { headers: { Accept: "application/vnd.github+json" } };
    Promise.all([
      fetch("https://api.github.com/users/" + encodeURIComponent(user), opts).then(function (r) { if (!r.ok) throw 0; return r.json(); }),
      fetch("https://api.github.com/users/" + encodeURIComponent(user) + "/repos?per_page=100&type=owner", opts).then(function (r) { if (!r.ok) throw 0; return r.json(); }),
      loadContributions(user),
    ]).then(function (res) {
      var stars = {};
      res[1].forEach(function (repo) { stars[repo.html_url.toLowerCase()] = repo.stargazers_count; });
      // Open source list: own, non-fork repos; most starred first, then most recently pushed.
      var repos = res[1].filter(function (r) { return !r.fork && !r.archived; })
        .sort(function (a, b) { return (b.stargazers_count - a.stargazers_count) || (new Date(b.pushed_at) - new Date(a.pushed_at)); })
        .slice(0, 6)
        .map(function (r) { return { name: r.name, full_name: r.full_name, url: r.html_url, description: r.description, language: r.language, stars: r.stargazers_count, forks: r.forks_count }; });
      gh = { t: Date.now(), followers: res[0].followers || 0, publicRepos: res[0].public_repos || 0, stars: stars, repos: repos, contrib: res[2] };
      try { sessionStorage.setItem(KEY, JSON.stringify(gh)); } catch (e) { /* ignore */ }
      applyGithub();
    }).catch(function () { /* offline or rate-limited: leave the UI as is */ });
  }
  loadGithub();

  /* -------------------------------------------------------- Local time */
  var clocks = document.querySelectorAll("[data-tz]");
  if (clocks.length) {
    var tick = function () {
      clocks.forEach(function (el) {
        try {
          el.textContent = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", timeZone: el.getAttribute("data-tz") }).format(new Date());
        } catch (e) { el.textContent = ""; }
      });
    };
    tick();
    setInterval(tick, 30000);
  }

  /* ------------------------------------------------------ Contact form */
  var form = document.getElementById("contactForm");
  if (form) {
    var note = document.getElementById("formNote");
    var submit = document.getElementById("contactSubmit");
    var topicSel = document.getElementById("topic");
    var subjectInput = form.querySelector('input[name="subject"]');
    var defaultNote = note.textContent;
    var noteTimer;

    var setNote = function (text, kind) {
      note.textContent = text;
      note.className = "form-note" + (kind ? " is-" + kind : "");
    };

    var syncSubject = function () {
      var t = D.contact.topics.filter(function (x) { return x.id === topicSel.value; })[0];
      subjectInput.value = "Portfolio message: " + (t ? t.subject : "General");
      document.querySelectorAll("[data-topic]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-topic") === topicSel.value));
      });
    };
    topicSel.addEventListener("change", syncSubject);
    syncSubject();

    // Topic cards pre-select the topic, then move the person to the form.
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-topic]");
      if (!btn) return;
      topicSel.value = btn.getAttribute("data-topic");
      syncSubject();
      form.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      var first = form.querySelector("#name");
      setTimeout(function () { first.focus({ preventScroll: true }); }, reduceMotion ? 0 : 350);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Honeypot: a hidden checkbox real people never tick.
      var trap = form.querySelector('input[name="botcheck"]');
      if (trap && trap.checked) { form.reset(); return; }

      if (!form.checkValidity()) {
        form.reportValidity();
        setNote("Please fill in your name, a valid email and a message.", "error");
        return;
      }

      submit.disabled = true;
      var label = submit.textContent;
      submit.textContent = "Sending\u2026";
      setNote("Sending your message\u2026");

      fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.success) {
            setNote("Thanks, your message is sent. I\u2019ll get back to you soon.", "ok");
            form.reset();
            syncSubject();
          } else {
            setNote("That didn\u2019t send. Please email me directly at " + D.contact.email + ".", "error");
          }
        })
        .catch(function () {
          setNote("Couldn\u2019t send right now. Please email me directly at " + D.contact.email + ".", "error");
        })
        .then(function () {
          submit.disabled = false;
          submit.textContent = label;
          clearTimeout(noteTimer);
          noteTimer = setTimeout(function () { setNote(defaultNote); }, 9000);
        });
    });
  }
})();
