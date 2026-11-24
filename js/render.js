/* ==========================================================================
   render.js — turns js/data.js into page markup, and wires filters.
   Runs deferred, so the static page skeleton already exists.
   Each page declares itself with <body data-page="home|projects|...">.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.Site;
  var D = S.data;
  var esc = S.esc;
  var icon = S.icon;

  /* ------------------------------------------------------------ Helpers */
  function $(id) { return document.getElementById(id); }

  var NEW_TAB = '<span class="visually-hidden"> (opens in a new tab)</span>';

  function extLink(url, label, cls) {
    return '<a class="' + (cls || "") + '" href="' + esc(S.safeUrl(url)) + '" target="_blank" rel="noopener noreferrer">' +
      label + NEW_TAB + "</a>";
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("");
  }

  var DOTS = { Comfortable: 3, Practicing: 2, Learning: 1, Exploring: 1 };
  function level(label) {
    var n = DOTS[label] || 1;
    var dots = "";
    for (var i = 1; i <= 3; i++) dots += "<i" + (i <= n ? ' class="on"' : "") + "></i>";
    return '<span class="level"><span class="dots" aria-hidden="true">' + dots + "</span>" +
      '<span class="level-text">' + esc(label) + "</span></span>";
  }

  function emptyState(title, text, extra) {
    return '<div class="empty"><h2>' + esc(title) + "</h2><p>" + esc(text) + "</p>" + (extra || "") + "</div>";
  }

  function unique(list) { return list.filter(function (v, i) { return list.indexOf(v) === i; }); }

  function hasContent(v) { return Array.isArray(v) ? v.length > 0 : !!v; }

  /* ----------------------------------------------------------- Projects */
  function primaryUrl(p) {
    return p.live || p.github || (p.links && p.links[0] && p.links[0].url) || "";
  }
  function repoKey(url) { return (url || "").toLowerCase().replace(/\/+$/, ""); }

  function projectCard(p, n) {
    var url = primaryUrl(p);
    var title = url ? extLink(url, esc(p.title), "ptitle-link") : esc(p.title);
    var badge = p.status
      ? '<span class="badge">' + icon("trend", 14) + esc(p.status) + "</span>"
      : "";
    var thumb = p.image
      ? '<img class="thumb-img" src="' + esc(p.image) + '" alt="" loading="lazy" decoding="async">'
      : '<div class="glass" aria-hidden="true"><span>' + esc(p.glyph || "\u25c7") + "</span></div>";
    var tags = (p.technologies || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    var links = "";
    if (p.live) links += extLink(p.live, icon("external", 17), "pstat-link\" aria-label=\"Live demo of " + esc(p.title));
    if (p.github) links += extLink(p.github, icon("github", 17), "pstat-link\" aria-label=\"" + esc(p.title) + " on GitHub");
    (p.links || []).forEach(function (l) { links += extLink(l.url, esc(l.label) + " " + icon("external", 14), "pstat-text"); });
    var stars = p.github
      ? '<span class="stars" data-repo="' + esc(repoKey(p.github)) + '" hidden>' + icon("star", 15) + "<span></span></span>"
      : "";
    return (
      '<article class="pcard" id="' + esc(p.slug || "") + '" style="--n:' + (n % 6) + '">' +
        '<div class="thumb">' + badge + thumb + "</div>" +
        '<div class="pbody">' +
          '<h3 class="ptitle">' + title + "</h3>" +
          '<p class="pdesc">' + esc(p.description) + "</p>" +
          '<div class="pfoot">' +
            (tags ? '<ul class="tags" aria-label="Technologies">' + tags + "</ul>" : "<span></span>") +
            '<div class="pstats">' + stars + links + "</div>" +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function projectGrid(list) {
    var sorted = list.slice().sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
    return '<div class="pgrid">' + sorted.map(function (p, i) { return projectCard(p, i); }).join("") + "</div>";
  }

  function renderProjectsPage() {
    var host = $("projectsHost");
    if (!host) return;
    host.innerHTML = projectGrid(D.projects) +
      '<section class="oss" id="ossSection" aria-labelledby="ossH" hidden>' +
        '<h2 class="sh" id="ossH"><span class="sh-ic">' + icon("github", 20) + "</span>Open source</h2>" +
        '<ul class="repo-grid" id="ossList"></ul></section>';
  }

  /* ------------------------------------------------------------- Website */
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; } }

  function renderWebsitePage() {
    var host = $("websiteHost");
    if (!host) return;
    var main = D.profile.website;
    var sites = D.projects.filter(function (p) { return p.live; });

    var hero = main
      ? '<section class="hero-card"><h2>Visit my website</h2><p>' + esc(hostOf(main)) + "</p>" +
        '<div class="hero-meta">' + extLink(main, "Open website " + icon("external", 16), "btn btn-primary btn-md") + "</div></section>"
      : "";

    var list = sites.length
      ? '<section class="cblock first" aria-labelledby="liveH"><h2 class="sub" id="liveH">Live websites</h2><ul class="site-grid">' +
        sites.map(function (p) {
          var thumb = p.image
            ? '<img class="thumb-img" src="' + esc(p.image) + '" alt="" loading="lazy" decoding="async">'
            : '<div class="glass" aria-hidden="true"><span>' + esc(p.glyph || "\u25c7") + "</span></div>";
          return '<li class="site-card"><div class="thumb">' + thumb + "</div>" +
            '<div class="site-body"><h3>' + esc(p.title) + '</h3><p class="site-url">' + icon("globe", 15) + esc(hostOf(p.live)) + "</p>" +
            '<p class="pdesc">' + esc(p.description) + "</p>" +
            '<div class="site-actions">' + extLink(p.live, "Visit site " + icon("external", 15), "btn btn-primary btn-sm") +
            (p.github ? extLink(p.github, icon("github", 16) + "Source", "btn btn-sm") : "") +
            (p.slug ? '<a class="btn btn-sm btn-quiet" href="projects.html#' + esc(p.slug) + '">Details</a>' : "") + "</div></div></li>";
        }).join("") + "</ul></section>"
      : "";

    host.innerHTML = hero + (list || (main ? "" : emptyState("No websites yet", "Live websites will appear here as soon as a project has a live demo link.", '<a class="btn" href="projects.html">See projects</a>')));
  }

  /* ------------------------------------------------------------- People */
  function personCard(p) {
    var pfp = p.image
      ? '<img class="pfp" src="' + esc(p.image) + '" alt="" width="56" height="56" loading="lazy" decoding="async">'
      : '<span class="pfp pfp-initials" aria-hidden="true">' + esc(initials(p.name)) + "</span>";
    var links = (p.links || []).map(function (l) {
      return "<li>" + extLink(
        l.url,
        '<span class="plat">' + esc(l.platform) + '</span><span class="handle">' + esc(l.handle || "") + "</span>" + icon("external", 14),
        "person-link"
      ) + "</li>";
    }).join("");
    return (
      '<li class="person" id="' + esc(p.slug || "") + '">' +
        '<div class="person-head">' + pfp +
          "<div><h3>" + esc(p.name) + (p.favorite ? '<span class="fav" title="Favorite">Favorite</span>' : "") + "</h3>" +
          (p.role ? '<p class="role">' + esc(p.role) + "</p>" : "") + "</div>" +
        "</div>" +
        (p.why ? '<p class="why"><strong>Why I follow:</strong> ' + esc(p.why) + "</p>" : "") +
        (p.tags && p.tags.length ? '<ul class="tags">' + p.tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") +
        (links ? '<ul class="person-links" aria-label="Profiles of ' + esc(p.name) + '">' + links + "</ul>" : "") +
      "</li>"
    );
  }

  function renderPeoplePage() {
    var host = $("peopleHost");
    if (!host) return;
    var people = D.people.slice();

    if (!people.length) {
      host.innerHTML = emptyState(
        "Nobody listed yet",
        "This is where I'll collect the developers, teachers and builders whose work I learn from.",
        '<a class="btn" href="index.html">Back to profile</a>'
      );
      return;
    }

    var platforms = unique([].concat.apply([], people.map(function (p) { return (p.links || []).map(function (l) { return l.platform; }); })));
    var active = "All";

    host.innerHTML =
      '<p class="stat">' + plural(people.length, "person", "people") + " across " + plural(platforms.length, "platform") + "</p>" +
      '<div class="toolbar"><div class="filter" role="group" aria-label="Filter people by platform" id="peopleFilter"></div>' +
      '<p class="result-count" id="peopleCount" role="status" aria-live="polite"></p></div>' +
      '<ul class="people-grid" id="peopleList"></ul>';

    function paint() {
      var shown = people.filter(function (p) {
        return active === "All" || (p.links || []).some(function (l) { return l.platform === active; });
      });
      $("peopleFilter").innerHTML = ["All"].concat(platforms).map(function (pl) {
        var n = pl === "All" ? people.length : people.filter(function (p) { return (p.links || []).some(function (l) { return l.platform === pl; }); }).length;
        return '<button type="button" class="chip" data-plat="' + esc(pl) + '" aria-pressed="' + (pl === active) + '">' +
          esc(pl) + '<span class="chip-count">' + n + "</span></button>";
      }).join("");
      $("peopleCount").textContent = plural(shown.length, "person", "people");
      $("peopleList").innerHTML = shown.map(personCard).join("");
    }

    host.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-plat]");
      if (!btn) return;
      active = btn.getAttribute("data-plat");
      paint();
      var again = host.querySelector('[data-plat="' + active.replace(/"/g, '\\"') + '"]');
      if (again) again.focus();
    });

    paint();

    // Deep links (people.html#slug). The cards are created after load, so the
    // browser's own :target never matches; highlight explicitly, on load and on hashchange.
    function highlight() {
      var old = host.querySelector(".person.is-target");
      if (old) old.classList.remove("is-target");
      if (!location.hash) return;
      var slug = decodeURIComponent(location.hash.slice(1));
      var target = document.getElementById(slug);
      if (!target && people.some(function (x) { return x.slug === slug; })) {
        active = "All"; // a filter must never hide a deep-linked person
        paint();
        target = document.getElementById(slug);
      }
      if (target && target.classList.contains("person")) {
        target.classList.add("is-target");
        target.scrollIntoView({ block: "center" });
      }
    }
    highlight();
    window.addEventListener("hashchange", highlight);
  }

  /* ------------------------------------------------------------ Library */
  function renderLibraryPage() {
    var host = $("libraryHost");
    if (!host) return;
    var items = D.library.slice();
    var typeLabel = {};
    D.libraryTypes.forEach(function (t) { typeLabel[t.id] = t.label; });

    if (!items.length) {
      host.innerHTML = emptyState(
        "Nothing saved yet",
        "Articles, notes, resources and references I want to keep will show up here.",
        '<a class="btn" href="index.html">Back to profile</a>'
      );
      return;
    }

    var types = D.libraryTypes.filter(function (t) { return items.some(function (i) { return i.type === t.id; }); });
    var active = "all";
    var query = "";

    host.innerHTML =
      '<div class="toolbar toolbar-library">' +
        '<div class="search"><label class="visually-hidden" for="librarySearch">Search the library</label>' +
          icon("search", 18) +
          '<input id="librarySearch" type="search" placeholder="Search the library" autocomplete="off" spellcheck="false">' +
        "</div>" +
        (types.length > 1 ? '<div class="filter" role="group" aria-label="Filter library by type" id="libraryFilter"></div>' : "") +
        '<p class="result-count" id="libraryCount" role="status" aria-live="polite"></p>' +
      "</div>" +
      '<ul class="library-grid" id="libraryList"></ul>';

    function matches(i) {
      if (active !== "all" && i.type !== active) return false;
      if (!query) return true;
      var hay = [i.title, i.description, i.source, i.note, (i.tags || []).join(" ")].join(" ").toLowerCase();
      return hay.indexOf(query) > -1;
    }

    function paint() {
      var shown = items.filter(matches);
      var f = $("libraryFilter");
      if (f) {
        f.innerHTML = [{ id: "all", label: "All" }].concat(types).map(function (t) {
          var n = t.id === "all" ? items.length : items.filter(function (i) { return i.type === t.id; }).length;
          return '<button type="button" class="chip" data-type="' + esc(t.id) + '" aria-pressed="' + (t.id === active) + '">' +
            esc(t.label) + '<span class="chip-count">' + n + "</span></button>";
        }).join("");
      }
      $("libraryCount").textContent = plural(shown.length, "item");
      $("libraryList").innerHTML = shown.length
        ? shown.map(function (i) {
            return (
              '<li class="lib-item">' +
                '<p class="lib-type">' + esc(typeLabel[i.type] || i.type) + "</p>" +
                '<h3>' + extLink(i.url, esc(i.title) + icon("external", 15), "lib-link") + "</h3>" +
                (i.source ? '<p class="lib-source">' + esc(i.source) + "</p>" : "") +
                (i.description ? "<p>" + esc(i.description) + "</p>" : "") +
                (i.note ? '<p class="lib-note">' + esc(i.note) + "</p>" : "") +
                (i.tags && i.tags.length ? '<ul class="tags">' + i.tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") +
              "</li>"
            );
          }).join("")
        : '<li class="lib-none">' + emptyState("No matches", "Nothing in the library fits that search.", '<button type="button" class="btn" id="libraryClear">Clear search</button>') + "</li>";
    }

    host.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-type]");
      if (btn) {
        active = btn.getAttribute("data-type");
        paint();
        var again = host.querySelector('[data-type="' + active + '"]');
        if (again) again.focus();
        return;
      }
      if (e.target.id === "libraryClear") {
        query = ""; active = "all";
        $("librarySearch").value = "";
        paint();
        $("librarySearch").focus();
      }
    });
    host.addEventListener("input", function (e) {
      if (e.target.id === "librarySearch") {
        query = e.target.value.trim().toLowerCase();
        paint();
      }
    });

    paint();
  }

  /* ------------------------------------------------- Right rail / sidebar */
  function socialIcon(s) { return icon(s.icon || "external", 20); }

  function renderRail() {
    var head = $("railHead");
    if (head) {
      head.innerHTML = '<a class="follow-btn" href="https://github.com/' + esc(D.profile.githubUser) + '" target="_blank" rel="noopener noreferrer">' +
        icon("github", 20) + "Follow" + '<span class="visually-hidden"> ' + esc(D.profile.name) + " on GitHub (opens in a new tab)</span></a>";
    }
    var host = $("sidebar");
    if (!host) return;
    var p = D.profile;
    var open = p.status && p.status.open;
    var onContact = S.page() === "contact";
    var socials = D.socials.slice(0, 4);

    var people = D.people.slice(0, 3);
    var peopleCard = people.length
      ? '<section class="side-card" aria-labelledby="sideFollow"><h2 class="side-title" id="sideFollow"><span class="sh-ic">' + icon("userplus", 18) + "</span>Who to follow</h2><ul class=\"side-people\">" +
          people.map(function (x) {
            var first = (x.links && x.links[0]) || null;
            var pfp = x.image
              ? '<img class="pfp pfp-sm" src="' + esc(x.image) + '" alt="" width="44" height="44" loading="lazy">'
              : '<span class="pfp pfp-sm pfp-initials" aria-hidden="true">' + esc(initials(x.name)) + "</span>";
            return "<li>" + pfp +
              '<div class="side-person"><a href="people.html#' + esc(x.slug || "") + '">' + esc(x.name) + "</a>" +
              (x.role ? "<p>" + esc(x.role) + "</p>" : "") + "</div>" +
              (first ? extLink(first.url, "Follow", "btn btn-sm") : "") + "</li>";
          }).join("") +
        "</ul>" +
        '<a class="see-all" href="people.html">See all ' + D.people.length + " " + (D.people.length === 1 ? "person" : "people") + "</a></section>"
      : "";

    var talkCard = onContact ? "" :
      '<section class="side-card side-card-green" aria-labelledby="sideTalk">' +
        '<h2 class="side-title" id="sideTalk"><span class="dot" aria-hidden="true"></span>' + (open ? "Open to conversations" : "Get in touch") + "</h2>" +
        "<p>" + esc(D.contact.intro) + "</p>" +
        '<a class="btn btn-primary btn-md" href="contact.html">Let\u2019s talk</a>' +
      "</section>";

    var findCard = onContact ? "" :
      '<section class="find" aria-labelledby="sideFind"><h2 class="side-title dot-title" id="sideFind"><span class="dot" aria-hidden="true"></span>Find me on</h2>' +
        '<ul class="find-rows">' + socials.map(function (s) {
          return "<li>" + extLink(s.url,
            '<span class="bubble">' + socialIcon(s) + '</span><span class="fr-text"><b>' + esc(s.platform) + "</b><small>" + esc(s.handle) + "</small></span>" +
            '<span class="fr-arrow">' + icon("external", 15) + "</span>", "find-row") + "</li>";
        }).join("") + "</ul>" +
        (D.socials.length > socials.length
          ? '<a class="see-all see-all-green" href="contact.html#find-me-on">See all ' + D.socials.length + " profiles " + icon("arrowRight", 15) + "</a>"
          : "") +
      "</section>";

    host.innerHTML = talkCard + peopleCard + findCard;
    if (onContact && !people.length) { var rail = $("rail"); if (rail) rail.hidden = true; }
  }

  /* ----------------------------------------------------------- Top bar
     Desktop only (CSS hides it on phones). Profile page: mini profile + actions.
     Other pages: the page title.                                          */
  function renderTopbar() {
    var bar = $("topbar");
    if (!bar) return;
    var page = S.page();
    if (page === "home") {
      var p = D.profile;
      bar.innerHTML =
        '<div class="tb-profile"><img src="' + esc(p.avatar) + '" alt="" width="44" height="44">' +
          '<div><strong>' + esc(p.name) + verifiedSvg("verified-sm") + '</strong><span class="tb-sub" data-gh-followers-text hidden></span></div></div>' +
        '<div class="tb-actions">' +
          '<button type="button" class="tb-icon" data-share aria-label="Share profile">' + icon("share2", 20) + "</button>" +
          (p.cv ? '<a class="btn btn-md" href="' + esc(S.safeUrl(p.cv)) + '" target="_blank" rel="noopener noreferrer">CV' + NEW_TAB + "</a>" : "") +
          '<a class="btn btn-primary btn-md" href="contact.html">Get in touch</a>' +
        "</div>";
    } else {
      var all = D.nav.primary.concat(D.nav.secondary).filter(function (n) { return n.id === page; })[0];
      bar.innerHTML = '<p class="tb-title" aria-hidden="true">' + esc(all ? all.label : "") + "</p>";
    }
  }

  /* --------------------------------------------------------------- Home */
  function verifiedSvg(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="vb" d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path class="vc" d="m8.6 12.2 2.4 2.4 4.6-4.8"/></svg>';
  }
  function sectionHead(ic, text, id) {
    return '<h2 class="sh" id="' + id + '"><span class="sh-ic">' + icon(ic, 20) + "</span>" + esc(text) + "</h2>";
  }

  // Skill chips: tinted line-icon chips (focus areas) + dark letter-mark chips (languages and tools).
  var SKILL_ICON = { "c++": "code", "data structures": "tree", "algorithms": "flow", "oop": "cube", "web development": "globe" };
  var TINTS = ["orange", "green", "blue", "grey", "amber"];
  var MARK = {
    "c": ["C", "#4b6fd6", "#fff"], "c++": ["C+", "#00599c", "#fff"], "java": ["J", "#e76f00", "#fff"],
    "html": ["H", "#e44d26", "#fff"], "css": ["C", "#2965f1", "#fff"], "javascript": ["JS", "#f7df1e", "#111"],
    "git": ["G", "#f05133", "#fff"], "github": ["Gh", "#f0f0f0", "#111"], "vs code": ["VS", "#0078d4", "#fff"]
  };
  function stackChips() {
    var focus = D.profile.focus || [];
    var seen = {};
    focus.forEach(function (f) { seen[f.toLowerCase()] = 1; });
    var tech = [];
    D.skills.forEach(function (s) {
      if (["Programming", "Web", "Tools"].indexOf(s.category) > -1 && !seen[s.name.toLowerCase()]) { seen[s.name.toLowerCase()] = 1; tech.push(s.name); }
    });
    return (focus.length ? '<ul class="chips chips-skills" aria-label="Skills">' + focus.map(function (f, i) {
        return '<li class="tint-' + TINTS[i % TINTS.length] + '">' + icon(SKILL_ICON[f.toLowerCase()] || "code", 22) + "<span>" + esc(f) + "</span></li>";
      }).join("") + "</ul>" : "") +
      (tech.length ? '<ul class="chips chips-tech" aria-label="Technologies and tools">' + tech.map(function (f) {
        var m = MARK[f.toLowerCase()] || [f.charAt(0), "#444", "#fff"];
        return '<li><span class="mk" aria-hidden="true" style="background:' + m[1] + ";color:" + m[2] + '">' + esc(m[0]) + "</span><span>" + esc(f) + "</span></li>";
      }).join("") + "</ul>" : "");
  }

  function renderHome() {
    var host = $("content");
    if (!host) return;
    var p = D.profile;
    var edu = (D.education && D.education[0]) || null;

    var status = p.status && p.status.label
      ? '<a class="status' + (p.status.open ? " is-open" : "") + '" href="contact.html" data-rise style="--i:3">' +
        '<span class="dot" aria-hidden="true"></span>' + esc(p.status.label) + "</a>"
      : "";

    var roleItems = (D.education || []).map(function (e) {
      return '<span class="role">' + esc(e.role || "Student") + " at " +
        '<span class="org-mark" aria-hidden="true">' + icon("cap", 14) + "</span><u>" + esc(e.school) + "</u></span>";
    }).join('<span class="sep" aria-hidden="true">\u00b7</span>');
    var infoHTML = "";
    if (roleItems) infoHTML += '<p class="roles"><span class="ic">' + icon("briefcase", 22) + "</span>" + roleItems + "</p>";
    if (p.location) {
      infoHTML += '<p class="roles place"><span class="ic">' + icon("pin", 22) + "</span>" + esc(p.location) +
        (p.timezone ? '<span class="sep" aria-hidden="true">\u00b7</span><span class="clock" data-tz="' + esc(p.timezone) + '"></span>' : "") + "</p>";
    }

    var profile =
      '<section class="profile" aria-labelledby="profileName">' +
        '<div class="cover" aria-hidden="true"><canvas id="led"></canvas></div>' +
        '<span class="avatar-wrap"><img class="avatar" src="' + esc(p.avatar) + '" alt="' + esc(p.avatarAlt || "") + '" width="321" height="321" fetchpriority="high" decoding="async"></span>' +
        '<h1 id="profileName" data-rise style="--i:1"><span>' + esc(p.name) + "</span>" + verifiedSvg("verified") + "</h1>" +
        '<p class="headline" data-rise style="--i:2">' + esc(p.headline) + "</p>" +
        status +
        '<div class="info-row" data-rise style="--i:4">' + infoHTML + "</div>" +
        '<div class="chips-wrap" data-rise style="--i:5">' + stackChips() + "</div>" +
        '<div class="actions" data-rise style="--i:6">' +
          '<a class="btn btn-primary btn-lg" href="contact.html">Get in touch</a>' +
          '<button type="button" class="btn btn-lg" id="shareBtn" data-share>' + icon("share2", 22) + "Share</button>" +
          (p.cv ? '<a class="btn btn-lg" href="' + esc(S.safeUrl(p.cv)) + '" target="_blank" rel="noopener noreferrer">CV' + NEW_TAB + "</a>" : "") +
        "</div>" +
      "</section>";

    var tabs =
      '<div class="tabs" role="tablist" aria-label="Profile sections">' +
        '<button type="button" role="tab" id="tab-resume" aria-selected="true" aria-controls="panel-resume">Resume</button>' +
        '<button type="button" role="tab" id="tab-work" aria-selected="false" aria-controls="panel-work" tabindex="-1">Work</button>' +
      "</div>";

    /* About */
    var about = p.about || [];
    var aboutHTML =
      '<section class="rblock first" id="about" aria-labelledby="aboutH">' + sectionHead("userc", "About", "aboutH") +
        '<div class="prose">' + (about[0] ? "<p>" + esc(about[0]) + "</p>" : "") +
        (about.length > 1
          ? '<div class="more" id="aboutMore" inert><div class="more-inner">' + about.slice(1).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</div></div>" +
            '<button type="button" class="read-more" id="aboutToggle" aria-expanded="false" aria-controls="aboutMore">Read more' + icon("chevron", 16) + "</button>"
          : "") + "</div></section>";

    /* Info cards */
    var cards = "";
    if (p.location) {
      cards += '<article class="icard icard-green"><p class="icard-label">' + icon("pin", 18) + "Based in</p><h3>" + esc(p.location) + "</h3>" +
        (p.timezone ? '<p class="icard-big"><span class="clock" data-tz="' + esc(p.timezone) + '"></span></p>' : "") + "</article>";
    }
    if (edu) {
      cards += '<article class="icard' + (p.location ? "" : " icard-green") + '"><p class="icard-label">' + icon("cap", 18) + "Studying at</p><h3>" + esc(edu.school) + "</h3>" +
        '<p class="icard-big">' + esc(edu.mark || "") + "</p>" +
        '<p class="icard-foot">' + icon("code", 16) + esc(edu.degree) + "</p></article>";
    }
    if ((p.focus || []).length) {
      cards += '<article class="icard"><p class="icard-label">' + icon("globe", 18) + "Learning</p><h3>Currently focused on</h3>" +
        '<ul class="checks">' + p.focus.map(function (f) { return "<li>" + icon("check", 15) + esc(f) + "</li>"; }).join("") + "</ul></article>";
    }
    var cardsHTML = cards ? '<div class="info-cards">' + cards + "</div>" : "";

    /* Education */
    var eduHTML = hasContent(D.education)
      ? '<section class="rblock" id="education" aria-labelledby="eduH">' + sectionHead("briefcase", "Education", "eduH") + '<ol class="timeline">' +
          D.education.map(function (e) {
            return '<li><span class="mark" aria-hidden="true">' + esc(e.mark || "") + "</span><div>" +
              "<h3>" + esc(e.school) + "</h3>" +
              '<p class="sub">' + esc(e.degree) + (e.period ? '<span class="period">' + esc(e.period) + "</span>" : "") + "</p>" +
              (e.note ? "<p>" + esc(e.note) + "</p>" : "") + "</div></li>";
          }).join("") + "</ol></section>"
      : "";

    /* Top skills + Skills and tools */
    var top = D.skills.filter(function (s) { return s.level === "Comfortable"; });
    var topHTML = top.length
      ? '<section class="rblock" id="topskills" aria-labelledby="topH">' + sectionHead("target", "Top skills", "topH") +
          '<ul class="dotchips">' + top.map(function (s) { return "<li><i aria-hidden=\"true\"></i>" + esc(s.name) + "</li>"; }).join("") + "</ul></section>"
      : "";
    var toolsHTML = '<section class="rblock" id="skills" aria-labelledby="skillsH">' + sectionHead("wrench", "Skills and tools", "skillsH") +
      '<div class="chips-wrap left">' + stackChips() + "</div></section>";

    /* Journey */
    var j = D.journey;
    var journeyHTML = j && j.items && j.items.length
      ? '<section class="rblock" id="journey" aria-labelledby="journeyH">' + sectionHead("flow", "Problem solving and coding journey", "journeyH") +
          (j.lead ? '<p class="block-lead">' + esc(j.lead) + "</p>" : "") +
          '<ul class="journey">' + j.items.map(function (i) {
            return "<li><div><h3>" + esc(i.title) + "</h3><p>" + esc(i.text) + "</p></div>" + level(i.level) + "</li>";
          }).join("") + "</ul></section>"
      : "";

    var cvHTML = p.cv
      ? '<div class="cv-row"><a class="btn btn-md" href="' + esc(S.safeUrl(p.cv)) + '" target="_blank" rel="noopener noreferrer">View CV' + NEW_TAB + '</a><a class="btn btn-primary btn-md" href="' + esc(S.safeUrl(p.cv)) + '" download>Download CV</a></div>'
      : "";

    var socialRow = '<ul class="social-row" aria-label="Social profiles">' + D.socials.map(function (s) {
      return "<li>" + extLink(s.url, icon(s.icon || "external", 24) + '<span class="visually-hidden">' + esc(s.platform) + "</span>", "social-link\" title=\"" + esc(s.platform)) + "</li>";
    }).join("") + "</ul>";

    var ghUrl = "https://github.com/" + D.profile.githubUser;
    var ghSection =
      '<section class="gh-section" id="githubSection" aria-labelledby="ghH">' +
        '<div class="gh-head"><h2 class="sh" id="ghH"><span class="sh-ic gh-big">' + icon("github", 26) + "</span>GitHub</h2>" +
        extLink(ghUrl, "Open profile " + icon("external", 15), "btn btn-sm gh-profile-btn") + "</div>" +
        '<div class="gh-contrib" id="ghContrib" hidden>' +
          '<p class="gh-total" id="ghTotal"></p>' +
          '<div class="gh-scroll" id="ghScroll"><div class="gh-graph" id="ghGraph" role="img"></div></div>' +
          '<div class="gh-legend" aria-hidden="true">Less <i class="gh-cell l0"></i><i class="gh-cell l1"></i><i class="gh-cell l2"></i><i class="gh-cell l3"></i><i class="gh-cell l4"></i> More</div>' +
        "</div>" +
        '<div class="gh-repos" id="ghRepoBlock" hidden>' +
          '<div class="gh-repos-head"><p id="ghRepoCount"></p>' +
          extLink(ghUrl + "?tab=repositories", "View all " + icon("external", 15), "btn btn-sm") + "</div>" +
          '<ul class="repo-grid" id="ghRepos"></ul>' +
        "</div>" +
      "</section>";

    var projectsBlock = D.projects.length
      ? '<section class="gh-section" aria-labelledby="wpH"><h2 class="sh" id="wpH"><span class="sh-ic">' + icon("grid", 20) + "</span>Projects</h2>" + projectGrid(D.projects) +
        '<p class="work-more"><a class="see-all" href="projects.html">See all projects and open source</a></p></section>'
      : "";
    var workHTML = ghSection + (projectsBlock || emptyState("No projects yet", "Projects will appear here."));

    host.innerHTML = profile + tabs +
      '<div class="tab-body">' +
        '<div role="tabpanel" id="panel-resume" aria-labelledby="tab-resume" tabindex="0">' +
          aboutHTML + cardsHTML + eduHTML + topHTML + toolsHTML + journeyHTML + cvHTML +
          '<div class="social-wrap">' + socialRow + "</div>" +
        "</div>" +
        '<div role="tabpanel" id="panel-work" aria-labelledby="tab-work" tabindex="0" hidden>' + workHTML + "</div>" +
      "</div>";
  }

  /* ------------------------------------------------------------ Contact */
  var TOPIC_ICON = { question: "help", opportunity: "briefcase", algorithms: "tree", hello: "smile" };

  function renderContact() {
    var host = $("contactHost");
    if (!host) return;
    var c = D.contact;
    var p = D.profile;
    var open = p.status && p.status.open;
    var byName = {};
    D.socials.forEach(function (s) { byName[s.platform] = s; });

    var heroMeta =
      (p.status && p.status.label ? '<span class="status' + (open ? " is-open" : "") + ' static"><span class="dot" aria-hidden="true"></span>' + esc(p.status.label) + "</span>" : "") +
      (p.location ? '<span class="hero-where">' + icon("pin", 16) + esc(p.location) + (p.timezone ? '<span class="clock" data-tz="' + esc(p.timezone) + '"></span>' : "") + "</span>" : "");

    function linkCard(url, ic, title, sub, cls) {
      return extLink(url, '<span class="bubble">' + icon(ic, 20) + '</span><span class="fr-text"><b>' + esc(title) + "</b><small>" + esc(sub) + "</small></span>" +
        '<span class="fr-arrow">' + icon("external", 15) + "</span>", "link-card" + (cls ? " " + cls : ""));
    }

    var reach = '<li class="reach-email"><a class="link-card" href="mailto:' + esc(c.email) + '"><span class="bubble">' + icon("mail", 20) + '</span><span class="fr-text"><b>Email me</b><small>' + esc(c.email) + "</small></span></a>" +
      '<button type="button" class="copy-btn" data-copy="' + esc(c.email) + '" data-copy-label="Email address" aria-label="Copy email address">' + icon("copy", 18) + "</button></li>";
    ["LinkedIn", "Instagram"].forEach(function (name) {
      var s = byName[name];
      if (s) reach += "<li>" + linkCard(s.url, s.icon, "Message on " + name, s.handle) + "</li>";
    });

    host.innerHTML =
      '<section class="hero-card"><h2>Get in touch</h2><p>' + esc(c.intro) + '</p><div class="hero-meta">' + heroMeta + "</div></section>" +

      '<section class="cblock" aria-labelledby="startH"><h2 class="sub" id="startH">Start a conversation</h2>' +
        '<article class="feature-card"><span class="bubble bubble-lg">' + icon("spark", 22) + "</span>" +
          '<div><h3>Say what\u2019s on your mind</h3><p>Pick a topic below, or write to me directly. I\u2019ll get back to you.</p></div>' +
          '<a class="btn btn-primary btn-md" href="#reach-me" data-to-form>Write a message' + icon("arrowRight", 16) + "</a></article>" +
        '<ul class="topic-grid">' + c.topics.map(function (t) {
          return '<li class="tcard"><span class="bubble">' + icon(TOPIC_ICON[t.id] || "mail", 20) + "</span><h3>" + esc(t.title) + "</h3><p>" + esc(t.text) + "</p>" +
            '<button type="button" class="btn btn-sm" data-topic="' + esc(t.id) + '" aria-pressed="false">' + esc(t.cta || t.title) + icon("arrowRight", 15) + "</button></li>";
        }).join("") + "</ul></section>" +

      '<section class="cblock" aria-labelledby="reachH"><h2 class="sub" id="reachH">Reach me</h2><ul class="reach-grid">' + reach + "</ul></section>" +

      '<section class="cblock" id="reach-me" aria-labelledby="formH"><h2 class="sub" id="formH">Send a message</h2>' +
        '<form class="form panel" id="contactForm" novalidate>' +
          '<input type="hidden" name="access_key" value="' + esc(c.web3formsKey) + '">' +
          '<input type="hidden" name="subject" value="New message from your portfolio site">' +
          '<input type="checkbox" name="botcheck" class="honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<div class="field"><label for="topic">Topic</label><select id="topic" name="topic">' + c.topics.map(function (t) {
            return '<option value="' + esc(t.id) + '">' + esc(t.subject) + "</option>";
          }).join("") + "</select></div>" +
          '<div class="field-row"><div class="field"><label for="name">Name</label><input id="name" name="name" type="text" autocomplete="name" required></div>' +
          '<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div></div>' +
          '<div class="field"><label for="message">Message</label><textarea id="message" name="message" rows="6" required></textarea></div>' +
          '<button type="submit" class="btn btn-primary btn-md" id="contactSubmit">Send message</button>' +
          '<p class="form-note" id="formNote" role="status" aria-live="polite">Messages go straight to my inbox.</p>' +
        "</form></section>" +

      '<section class="cblock" id="find-me-on" aria-labelledby="findH"><h2 class="sub" id="findH">Find me on</h2><ul class="find-grid">' +
        D.socials.map(function (s) { return "<li>" + linkCard(s.url, s.icon || "external", s.platform, s.handle) + "</li>"; }).join("") + "</ul></section>";
  }

  /* -------------------------------------------------------------- Boot */
  var pages = {
    home: renderHome,
    projects: renderProjectsPage,
    website: renderWebsitePage,
    people: renderPeoplePage,
    library: renderLibraryPage,
    contact: renderContact,
  };
  renderTopbar();
  var fn = pages[S.page()];
  if (fn) fn();
  if (S.page() !== "notfound") renderRail();
  document.dispatchEvent(new CustomEvent("site:rendered"));
})();
