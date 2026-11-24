/* ==========================================================================
   assistant-engine.js — conversational logic, no DOM.

   Two modes, same interface:
     • local  (default): intent matching over the knowledge object. No server,
                         no API key, and it can only say what the portfolio says.
     • remote (optional): POSTs the conversation to SITE.assistant.endpoint
                         (api/chat.js). If that fails, it falls back to local.

   engine.reply(history) -> Promise<{ text, actions[], followups[] }>
     text       markdown-lite: **bold**, line breaks, "• " bullets
     actions    [{ label, href, external? }]  buttons shown under the message
     followups  [string]                      suggested next questions

   UMD so Node can unit-test it (tests/assistant.test.js).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AssistantEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------------------------------------------------- text helpers */
  function norm(s) {
    return " " + String(s == null ? "" : s).toLowerCase()
      .replace(/c\+\+/g, "cpp").replace(/c#/g, "csharp")
      .replace(/[^a-z0-9+.\s-]/g, " ").replace(/[-.]/g, " ").replace(/\s+/g, " ").trim() + " ";
  }
  function has(q, re) { return re.test(q); }
  function stem(w) { return w.replace(/(ing|ed|es|s)$/, ""); }
  function list(arr) {
    if (!arr.length) return "";
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
  }
  function firstSentence(t, max) {
    var m = String(t || "").match(/^[^.!?]*[.!?]/);
    var s = (m ? m[0] : String(t || "")).trim();
    if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, "") + "\u2026";
    return s;
  }
  var TECH_LABEL = { csharp: "C#", nodejs: "Node.js", node: "Node.js", golang: "Go", sql: "SQL", mysql: "MySQL", mongodb: "MongoDB", aws: "AWS", postgres: "PostgreSQL", javascript: "JavaScript", typescript: "TypeScript", php: "PHP" };
  function techLabel(t) { return TECH_LABEL[t] || (t.charAt(0).toUpperCase() + t.slice(1)); }
  function pick(arr, seed) { return arr[seed % arr.length]; }

  var EDU_WORDS = { university: 1, college: 1, school: 1, study: 1, studying: 1 };
  var STOP = { and: 1, the: 1, ui: 1, system: 1, page: 1, programming: 1, a: 1, of: 1, for: 1 };

  // Technologies a visitor might ask about. If one is asked and it is not in the
  // skills list, the assistant must say it's not listed (never claim it).
  var COMMON_TECH = ["python", "react", "node", "nodejs", "typescript", "php", "laravel", "django", "flask", "sql", "mysql",
    "mongodb", "docker", "aws", "kotlin", "swift", "golang", "rust", "angular", "vue", "tailwind", "flutter", "android",
    "figma", "linux", "postgres", "csharp", "dart", "machine learning", "next", "express", "firebase", "wordpress"];

  /* ---------------------------------------------------------------- create */
  function create(K, opts) {
    opts = opts || {};
    var first = K.firstName;
    var projects = K.projects;

    // Distinct title keywords per project, used to recognise "tell me about the e-voting project".
    var tokenCount = {};
    projects.forEach(function (p) {
      p._tokens = unique((norm(p.title) + " " + norm(p.slug)).split(" ").filter(function (w) { return w.length > 2 && !STOP[w] && !EDU_WORDS[w]; }).map(stem));
      p._tokens.forEach(function (t) { tokenCount[t] = (tokenCount[t] || 0) + 1; });
    });
    function unique(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

    function matchProject(q) {
      var best = null, bestScore = 0;
      projects.forEach(function (p) {
        var score = 0, strong = 0;
        p._tokens.forEach(function (t) {
          if (q.indexOf(" " + t) > -1) { score++; if (tokenCount[t] === 1) strong++; }
        });
        if ((score >= 2 || strong >= 1) && score > bestScore) { best = p; bestScore = score; }
      });
      return best;
    }

    function skillByQuery(q) {
      return K.skills.filter(function (s) {
        var n = norm(s.name).trim();
        if (n.length < 2) return q.indexOf(" " + n + " ") > -1;       // "C": whole word only
        return q.indexOf(" " + n + " ") > -1 || q.indexOf(" " + stem(n) + " ") > -1 || q.indexOf(" " + n) > -1;
      });
    }

    function projectScore(p) {
      return (p.featured ? 2 : 0) + (p.live ? 2 : 0) + (p.github ? 1 : 0) + Math.min(2, Math.floor(p.description.length / 120));
    }
    function bestProject() {
      return projects.slice().sort(function (a, b) { return projectScore(b) - projectScore(a); })[0];
    }

    function projectActions(p) {
      var a = [];
      if (p.slug) a.push({ label: "View in Projects", href: K.pages.projects + "#" + p.slug });
      if (p.live) a.push({ label: "Live demo", href: p.live, external: true });
      if (p.github) a.push({ label: "GitHub", href: p.github, external: true });
      return a;
    }

    var FOLLOW = {
      about: ["What projects has he built?", "What are his skills?", "How can I contact him?"],
      projects: ["Show me his best project", "What are his skills?", "How can I contact him?"],
      project: ["Show me his best project", "What are his skills?", "Education?"],
      skills: ["What projects has he built?", "Education?", "How can I contact him?"],
      education: ["What are his skills?", "What projects has he built?", "How can I contact him?"],
      contact: ["What projects has he built?", "Tell me about " + first, "Education?"],
      other: ["Tell me about " + first, "What projects has he built?", "How can I contact him?"],
    };

    /* ---------------------------------------------------------- the answers */
    var R = {
      greet: function () {
        return { text: "Hi there \ud83d\udc4b I can tell you about " + first + "'s projects, skills, education, or how to reach him. What are you curious about?", followups: FOLLOW.other };
      },
      thanks: function () { return { text: "You're welcome! Anything else you'd like to know about " + first + "'s work?", followups: FOLLOW.other }; },
      bye: function () { return { text: "Thanks for stopping by! If you'd like to get in touch with " + first + ", the Contact page is always there.", actions: [{ label: "Contact page", href: K.pages.contact }] }; },
      who: function () {
        return { text: "I'm " + first + "'s AI portfolio assistant. I answer from what's actually on this site (his projects, skills, education and contact details), so if something isn't listed, I'll tell you rather than guess.", followups: FOLLOW.about };
      },
      help: function () {
        return { text: "You can ask me about " + first + "'s **projects**, **skills**, **education**, **what he's learning**, or **how to contact him**. I can also point you to the right page.", followups: FOLLOW.about };
      },
      about: function () {
        var edu = K.education[0];
        var t = "**" + K.name + "** is a " + K.headline + (edu ? " at " + edu.school : "") + ".";
        if (K.focus.length) t += " He's focused on " + list(K.focus) + ".";
        if (K.open && K.status) t += " Current status: " + K.status.toLowerCase() + ".";
        return { text: t, actions: [{ label: "See his work", href: K.pages.work }], followups: FOLLOW.about };
      },
      learning: function () {
        var t = first + " is currently focused on " + list(K.focus) + ".";
        var learning = K.skills.filter(function (s) { return s.level === "Learning"; }).map(function (s) { return s.name; });
        if (learning.length) t += " Right now he's still learning " + list(learning) + ".";
        return { text: t, followups: FOLLOW.skills };
      },
      projects: function () {
        if (!projects.length) return { text: "There are no projects listed in the portfolio yet.", followups: FOLLOW.other };
        var lines = projects.map(function (p) {
          return "\u2022 **" + p.title + "**" + (p.technologies.length ? " (" + p.technologies.join(", ") + ")" : "");
        });
        return {
          text: first + " has " + projects.length + " projects in his portfolio:\n" + lines.join("\n") + "\n\nAsk about any of them (for example \u201ctell me about " + projects[0].title + "\u201d) for details.",
          actions: [{ label: "Browse all projects", href: K.pages.projects }],
          followups: FOLLOW.projects,
        };
      },
      project: function (p) {
        var t = "**" + p.title + "**" + (p.status ? " (" + p.status.toLowerCase() + ")" : "") + "\n" + p.description;
        if (p.technologies.length) t += "\n\nBuilt with " + list(p.technologies) + ".";
        var actions = projectActions(p);
        (p.links || []).forEach(function (l) { actions.push({ label: l.label, href: l.url, external: true }); });
        return { text: t, actions: actions, followups: FOLLOW.project };
      },
      best: function () {
        var p = bestProject();
        if (!p) return R.projects();
        var why = [];
        if (p.featured) why.push("it's one of his featured projects");
        if (p.live) why.push("it has a live demo you can try");
        var t = "If I had to point to one, it'd be **" + p.title + "**" + (why.length ? ": " + list(why) + "." : ".") + "\n" + firstSentence(p.description, 230) +
          "\n\n(That's my pick from what's listed. Judge for yourself!)";
        return { text: t, actions: projectActions(p), followups: ["What projects has he built?", "What are his skills?", "How can I contact him?"] };
      },
      skills: function () {
        if (!K.skills.length) return { text: "No skills are listed in the portfolio yet.", followups: FOLLOW.other };
        function by(level) { return K.skills.filter(function (s) { return s.level === level; }).map(function (s) { return s.name; }); }
        var parts = [];
        if (by("Comfortable").length) parts.push("\u2022 **Comfortable with:** " + list(by("Comfortable")));
        if (by("Practicing").length) parts.push("\u2022 **Practicing:** " + list(by("Practicing")));
        if (by("Learning").length) parts.push("\u2022 **Learning:** " + list(by("Learning")));
        return { text: first + "'s listed skills:\n" + parts.join("\n"), actions: [{ label: "See skills on his profile", href: K.pages.home + "#skills" }], followups: FOLLOW.skills };
      },
      skillSpecific: function (found, missing) {
        var parts = [];
        found.forEach(function (s) { parts.push("Yes, **" + s.name + "** is on his list (" + s.level.toLowerCase() + ")."); });
        missing.forEach(function (m) { parts.push("I don't see **" + m + "** in his listed skills, so I can't say he knows it."); });
        return { text: parts.join(" "), followups: FOLLOW.skills };
      },
      education: function () {
        if (!K.education.length) return { text: "No education details are listed in the portfolio yet.", followups: FOLLOW.other };
        var e = K.education[0];
        var t = first + " is " + (e.role ? "a **" + e.role + "**" : "studying") + " at **" + e.school + "**" + (e.short ? " (" + e.short + ")" : "") + ", in the " + e.degree + ".";
        if (e.note) t += " " + e.note;
        if (e.period) t += " (" + e.period + ")";
        return { text: t, followups: FOLLOW.education };
      },
      experience: function () {
        if (K.experience.length) {
          var lines = K.experience.map(function (x) { return "\u2022 **" + x.role + "**" + (x.org ? " at " + x.org : "") + (x.period ? " (" + x.period + ")" : "") + (x.note ? ": " + x.note : ""); });
          return { text: "Here's the experience listed:\n" + lines.join("\n"), followups: FOLLOW.projects };
        }
        return {
          text: "There's no work experience listed in the portfolio yet, so I won't guess. What it does show is " + projects.length + " projects and ongoing competitive programming practice.",
          actions: [{ label: "See his projects", href: K.pages.projects }], followups: FOLLOW.projects,
        };
      },
      achievements: function () {
        if (K.achievements.length) {
          var lines = K.achievements.map(function (x) { return "\u2022 **" + x.title + "**" + (x.year ? " (" + x.year + ")" : "") + (x.note ? ": " + x.note : ""); });
          return { text: "Achievements listed:\n" + lines.join("\n"), followups: FOLLOW.projects };
        }
        var cp = K.socials.filter(function (s) { return /codeforces|leetcode/i.test(s.platform); });
        return {
          text: "No awards, certificates or contest ratings are listed in the portfolio, so I can't claim any." + (cp.length ? " He does practice on " + list(cp.map(function (s) { return s.platform; })) + ", and his profiles are linked if you'd like to look." : ""),
          actions: cp.map(function (s) { return { label: s.platform, href: s.url, external: true }; }), followups: FOLLOW.projects,
        };
      },
      contact: function () {
        var t = "Yes, you can reach " + first + " here:\n\u2022 **Email:** " + K.contact.email + "\n\u2022 **Contact form:** on the Contact page, with topics like a question, an opportunity or just saying hi.";
        var actions = [{ label: "Open contact form", href: K.contact.formPage }];
        if (K.contact.email) actions.push({ label: "Email him", href: "mailto:" + K.contact.email, external: true });
        return { text: t, actions: actions, followups: FOLLOW.contact };
      },
      phone: function () {
        return { text: "A phone number isn't listed in the portfolio. The best ways to reach " + first + " are email (" + K.contact.email + ") or the contact form.", actions: [{ label: "Open contact form", href: K.contact.formPage }], followups: FOLLOW.contact };
      },
      social: function (which) {
        var s = which.length ? which : K.socials;
        var lines = s.map(function (x) { return "\u2022 **" + x.platform + ":** " + x.handle; });
        return { text: "Here " + (which.length === 1 ? "is his " + which[0].platform : "are his profiles") + ":\n" + lines.join("\n"), actions: s.map(function (x) { return { label: x.platform, href: x.url, external: true }; }), followups: FOLLOW.contact };
      },
      cv: function () {
        if (K.cv) return { text: "Yes, his CV is available.", actions: [{ label: "View CV", href: K.cv, external: true }], followups: FOLLOW.contact };
        return { text: "There's no CV published on the portfolio yet. His education, skills and projects are all on the profile page, and you can ask " + first + " directly for more.", actions: [{ label: "Contact", href: K.pages.contact }], followups: FOLLOW.contact };
      },
      status: function () {
        var t = K.status ? first + "'s status right now: **" + K.status + "**." : "There's no availability status listed.";
        return { text: t + " The best way to start a conversation is the contact form.", actions: [{ label: "Contact", href: K.pages.contact }], followups: FOLLOW.contact };
      },
      location: function () {
        if (K.location) return { text: first + " is based in " + K.location + ".", followups: FOLLOW.contact };
        return { text: "His location isn't listed on the portfolio. He studies at " + (K.education[0] ? K.education[0].school : "his university") + ".", followups: FOLLOW.contact };
      },
      personal: function () {
        return { text: "That's not something the portfolio shares, and I only go by what's published. I can tell you about " + first + "'s projects, skills and education, though.", followups: FOLLOW.other };
      },
      website: function () {
        var lines = K.liveSites.map(function (s) { return "\u2022 **" + s.title + "**"; });
        var t = K.website ? "His website is **" + K.website.replace(/^https?:\/\//, "") + "**." : "";
        if (lines.length) t += (t ? "\n\n" : "") + first + " has " + K.liveSites.length + " live " + (K.liveSites.length === 1 ? "site" : "sites") + " you can open:\n" + lines.join("\n");
        if (!t) t = "There's no website or live demo listed yet.";
        var actions = [{ label: "Website page", href: K.pages.website }];
        if (K.website) actions.unshift({ label: "Visit website", href: K.website, external: true });
        return { text: t, actions: actions, followups: FOLLOW.projects };
      },
      people: function () {
        if (!K.people.length) return { text: "He hasn't listed the people he learns from yet.", followups: FOLLOW.other };
        return { text: "People " + first + " learns from: " + list(K.people.map(function (x) { return x.name; })) + ".", followups: FOLLOW.other };
      },
      unknown: function () {
        return { text: "I can mainly help you explore " + first + "'s portfolio: his projects, skills, education, and how to contact him. Here are a few things to try:", followups: FOLLOW.other };
      },
    };

    /* ----------------------------------------------------------- routing */
    function localReply(raw) {
      var q = norm(raw);
      var words = q.trim().split(" ").filter(Boolean);
      if (!words.length) return R.unknown();

      if (has(q, / (thanks|thank you|thx|jazakallah|shukran) /)) return R.thanks();
      if (has(q, / (bye|goodbye|see you|take care) /)) return R.bye();
      if (has(q, / (who|what) are you | your name | are you (a |an )?(bot|ai|human|real|robot|person|chatgpt) | who made you /)) return R.who();
      if (words.length <= 4 && has(q, /^ (hi|hello|hey|hola|salam|assalam\w*|good (morning|evening|afternoon)|yo) /)) return R.greet();
      if (has(q, / (what can you|how can you help|what (do|can) i ask|what should i ask|help me|how do i use) /) || q.trim() === "help") return R.help();

      // Specific project by name
      var p = matchProject(q);
      if (p) return R.project(p);

      // Specific technology: "does he know Python?"
      var found = skillByQuery(q);
      var missing = COMMON_TECH.filter(function (t) {
        var n = norm(t).trim();
        return q.indexOf(" " + n + " ") > -1 && !K.skills.some(function (s) { return norm(s.name).trim() === n; });
      }).map(techLabel);
      var askingKnow = has(q, / (know|knows|use|uses|work with|worked with|familiar|experience with|proficient|good at|can he|does he|has he|is he) /);
      if ((found.length || missing.length) && (askingKnow || missing.length) && !has(q, / (project|projects|built|build) /)) {
        return R.skillSpecific(found, missing);
      }

      if (has(q, / (best|favou?rite|top|most impressive|flagship|proud|highlight|recommend|standout|coolest|greatest) /) && has(q, / (project|projects|work|built|build|thing|app|one) /)) return R.best();
      if (has(q, / (best|favou?rite|flagship|most impressive) /) && words.length <= 6) return R.best();

      if (has(q, / (cv|resume|r\u00e9sum\u00e9|curriculum) /)) return R.cv();
      if (has(q, / (phone|number|whatsapp|call|telephone|mobile) /)) return R.phone();
      var plat = K.socials.filter(function (s) { return q.indexOf(" " + norm(s.platform).trim() + " ") > -1; });
      if (plat.length) return R.social(plat);
      if (has(q, / (contact|reach|email|e mail|mail|message|hire|hiring|get in touch|connect|talk to|collaborat\w*|dm) /)) return R.contact();
      if (has(q, / (social|socials|profiles|follow|links) /)) return R.social([]);
      if (has(q, / (available|availability|open to|looking for|opportunit\w*|freelance|status) /)) return R.status();
      if (has(q, / (where|location|city|country|based|live|lives|timezone|from) /) && has(q, / (he|him|his|minhaz|you|based|location|live|lives) /)) return R.location();
      if (has(q, / (age|old|married|girlfriend|wife|family|salary|religion|address|birthday|born|parents|income) /)) return R.personal();

      if (has(q, / (educat\w*|universit\w*|college|school|degree|cse|iiuc|academic\w*|major|department|study|studying|student|graduat\w*|course|courses) /)) return R.education();
      if (has(q, / (experience|job|jobs|intern|internship|career|employ\w*|compan\w*|professional|worked|work history|resume) /)) return R.experience();
      if (has(q, / (achiev\w*|award|awards|certific\w*|prize|rank|ranking|rating|contest|contests|competition|accomplish\w*|honou?rs?|medal) /)) return R.achievements();
      if (has(q, / (project|projects|built|build|builds|made|make|created|create|apps?|application|applications|portfolio work|developed|develop|ship|shipped) /)) return R.projects();
      if (has(q, / (skill|skills|tech|technology|technologies|tech stack|stack|language|languages|tools?|expert|expertise|proficient|capable|abilities|programming) /)) return R.skills();
      var hisContext = has(q, / (he|him|his|minhaz|you|your) /);
      if (has(q, / (learning|learn|currently|focus|focused|working on) /) || (hisContext && has(q, / (goal|goals|future|plans?|headed|aspir\w*|interests?) /))) return R.learning();
      if (has(q, / (website|websites|web site|personal site|live demo|live demos|demos?|visit|live sites?) /)) return R.website();
      if (has(q, / (people|mentors?|inspir\w*) /)) return R.people();
      if (has(q, / (tell me about|about|who is|who s|introduce|overview|bio|summary|describe|know about|more about) /) || has(q, / (minhaz|him|he) /)) return R.about();

      return R.unknown();
    }

    /* --------------------------------------------------- optional AI backend */
    function remote(history) {
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 20000) : null;
      return fetch(opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-10).map(function (m) { return { role: m.role, content: m.text }; }) }),
        signal: controller ? controller.signal : undefined,
      }).then(function (r) { if (!r.ok) throw new Error("bad status"); return r.json(); })
        .then(function (j) {
          if (timer) clearTimeout(timer);
          if (!j || typeof j.reply !== "string" || !j.reply.trim()) throw new Error("empty reply");
          return { text: j.reply, actions: Array.isArray(j.actions) ? j.actions : [], followups: Array.isArray(j.followups) ? j.followups : [], source: "ai" };
        });
    }

    return {
      opening: function () {
        return ["Assalamu Alaikum \ud83d\udc4b", "Welcome to " + first + "'s portfolio! I'm his AI Assistant.", "I can help you explore his projects, skills, education, and more.", "What would you like to know?"];
      },
      suggestions: function () {
        return ["Tell me about " + first, "What projects has he built?", "What are his skills?", "Education?", "How can I contact him?"];
      },
      localReply: localReply,
      reply: function (history) {
        var last = history[history.length - 1];
        var q = last ? last.text : "";
        if (opts.endpoint && typeof fetch === "function") {
          return remote(history).catch(function () { var r = localReply(q); r.source = "local"; return r; });
        }
        var r = localReply(q); r.source = "local";
        return Promise.resolve(r);
      },
    };
  }

  return { create: create, norm: norm };
});
