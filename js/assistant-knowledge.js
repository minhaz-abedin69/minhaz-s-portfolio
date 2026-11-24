/* ==========================================================================
   assistant-knowledge.js — the assistant's ONLY source of truth.

   Builds a plain, serialisable object from js/data.js. Nothing is hard-coded
   here: edit data.js and the assistant knows about it. Anything that is not
   in this object, the assistant must say it can't see in the portfolio.

   UMD: works as a browser global (window.AssistantKnowledge) and in Node
   (require) so the optional server in api/chat.js uses the exact same facts.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AssistantKnowledge = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function build(SITE) {
    var p = SITE.profile || {};
    var contact = SITE.contact || {};
    var first = String(p.name || "").split(/\s+/)[0] || "the owner";

    var education = (SITE.education || []).map(function (e) {
      return { school: e.school, short: e.mark || "", degree: e.degree, role: e.role || "", note: e.note || "", period: e.period || "" };
    });

    var projects = (SITE.projects || []).map(function (x) {
      return {
        title: x.title, slug: x.slug || "", description: x.description || "",
        technologies: x.technologies || [], categories: x.categories || [],
        github: x.github || "", live: x.live || "",
        links: x.links || [], status: x.status || "", featured: !!x.featured,
      };
    });

    return {
      name: p.name || "",
      firstName: first,
      headline: p.headline || "",
      status: p.status && p.status.label ? p.status.label : "",
      open: !!(p.status && p.status.open),
      about: p.about || [],
      focus: p.focus || [],
      location: p.location || "",
      cv: p.cv || "",
      skills: (SITE.skills || []).map(function (s) { return { name: s.name, category: s.category, level: s.level }; }),
      projects: projects,
      education: education,
      experience: SITE.experience || [],
      achievements: SITE.achievements || [],
      journey: (SITE.journey && SITE.journey.items) || [],
      website: p.website || "",
      liveSites: projects.filter(function (x) { return x.live; }).map(function (x) { return { title: x.title, url: x.live, slug: x.slug }; }),
      people: (SITE.people || []).map(function (x) { return { name: x.name, role: x.role || "" }; }),
      library: (SITE.library || []).map(function (x) { return { title: x.title, type: x.type, url: x.url }; }),
      contact: { email: contact.email || "", formPage: "contact.html#reach-me", topics: (contact.topics || []).map(function (t) { return t.title; }) },
      socials: (SITE.socials || []).map(function (s) { return { platform: s.platform, handle: s.handle, url: s.url }; }),
      // Pages of the site the assistant may point visitors to.
      pages: { home: "index.html", work: "index.html#work", projects: "projects.html", website: "website.html", library: "library.html", contact: "contact.html" },
    };
  }

  return { build: build };
});
