/* ==========================================================================
   admin/schema.js — describes every editable field of the site. The form
   engine (forms.js) turns this into the editing screens; adding a new field to
   the site means adding one line here.
   ========================================================================== */
(function (root) {
  "use strict";

  var T = function (key, label, extra) { return Object.assign({ type: "text", key: key, label: label }, extra || {}); };
  var LEVELS = ["Comfortable", "Practicing", "Learning"];

  var SECTIONS = [
    { id: "dashboard", title: "Dashboard", icon: "grid", view: "dashboard" },

    { id: "profile", title: "Profile", icon: "userc", page: "index.html",
      blurb: "Your name, photo, headline, availability and the About text on the home page.",
      fields: [{ type: "group", key: "profile", label: "", fields: [
        T("name", "Full name", { required: true, half: true }),
        T("headline", "Headline", { half: true, help: "Shown under your name, e.g. \u201cCSE Student and Aspiring Software Engineer\u201d." }),
        { type: "image", key: "avatar", label: "Profile photo", help: "Square photos work best. Uploading resizes it for you.", dir: "assets/images/uploads", max: 900, half: true },
        T("avatarAlt", "Photo description (for screen readers)", { half: true }),
        { type: "group", key: "status", label: "Availability", fields: [
          { type: "bool", key: "open", label: "Show the green \u201copen\u201d dot", half: true },
          T("label", "Status text", { half: true, placeholder: "Open to questions and opportunities" }),
        ] },
        T("githubUser", "GitHub username", { half: true, help: "Used for followers, stars, repositories and the contribution graph.", placeholder: "your-username" }),
        { type: "url", key: "website", label: "Main website (optional)", half: true, help: "When set, the Website page opens with a \u201cVisit my website\u201d card.", placeholder: "https://" },
        T("location", "Location (optional)", { half: true, placeholder: "City, Country" }),
        T("timezone", "Time zone (optional)", { half: true, placeholder: "Asia/Dhaka", help: "Shows your local time next to the location." }),
        { type: "file", key: "cv", label: "CV (PDF, optional)", help: "Upload a PDF, or paste a link. Adds View/Download CV buttons.", dir: "assets/uploads", half: true },
        { type: "tags", key: "focus", label: "Focus areas", help: "The coloured chips under your status. Press Enter to add." },
        { type: "strings", key: "about", label: "About", noun: "paragraph", help: "The first paragraph is always visible; the rest sit behind \u201cRead more\u201d." },
      ] }] },

    { id: "projects", title: "Projects", icon: "cube", page: "projects.html",
      blurb: "Every project card on the Projects page, the Work tab and the Website page.",
      fields: [{ type: "list", key: "projects", noun: "project", itemLabel: function (p) { return p.title || "Untitled project"; }, itemMeta: function (p) { return [p.featured ? "Featured" : "", p.status, p.live ? "Live" : ""].filter(Boolean).join(" \u00b7 "); },
        blank: function () { return { title: "", slug: "", description: "", technologies: [], categories: [], glyph: "{ }", image: "", github: "", live: "", status: "", featured: false }; },
        fields: [
          T("title", "Title", { required: true, half: true }),
          { type: "slug", key: "slug", label: "Link name (slug)", from: "title", half: true, help: "Used in the project's link, e.g. projects.html#my-project." },
          { type: "textarea", key: "description", label: "Description", rows: 4, required: true, help: "Shown on the card (about 4 lines) and read by the AI assistant." },
          { type: "tags", key: "technologies", label: "Technologies", half: true },
          { type: "tags", key: "categories", label: "Categories", half: true },
          { type: "url", key: "github", label: "GitHub link", half: true, placeholder: "https://github.com/\u2026" },
          { type: "url", key: "live", label: "Live demo link", half: true, placeholder: "https://\u2026", help: "Projects with a live link also appear on the Website page." },
          { type: "select", key: "status", label: "Status", half: true, options: [{ value: "", label: "(none)" }, "Completed", "Ongoing", "In progress", "Archived"] },
          { type: "bool", key: "featured", label: "Featured (shown first)", half: true },
          T("glyph", "Tile symbol", { half: true, maxLength: 4, help: "Shown in the glass tile when there's no screenshot." }),
          { type: "image", key: "image", label: "Screenshot (optional)", half: true, dir: "assets/images/uploads", max: 1400 },
          { type: "list", key: "links", label: "Extra links", noun: "link", compact: true, blank: function () { return { label: "", url: "" }; },
            fields: [T("label", "Label", { half: true }), { type: "url", key: "url", label: "Link", half: true }] },
        ] }] },

    { id: "skills", title: "Skills", icon: "wrench", page: "index.html#skills",
      blurb: "Your skills and tools. \u201cComfortable\u201d skills appear under Top skills.",
      fields: [{ type: "list", key: "skills", noun: "skill", compact: true, suggest: "skillCategories",
        blank: function () { return { name: "", category: "", level: "Practicing" }; },
        fields: [T("name", "Skill", { required: true }), T("category", "Category", { list: "skillCategories" }), { type: "select", key: "level", label: "Level", options: LEVELS }] }] },

    { id: "education", title: "Education", icon: "cap", page: "index.html",
      blurb: "Schools and degrees shown on the Resume tab.",
      fields: [{ type: "list", key: "education", noun: "education entry", itemLabel: function (e) { return e.school || "New entry"; },
        blank: function () { return { school: "", mark: "", role: "", degree: "", note: "", period: "" }; },
        fields: [
          T("school", "School", { required: true }), T("mark", "Short name", { half: true, help: "e.g. IIUC" }), T("role", "Your role", { half: true, placeholder: "CSE Student" }),
          T("degree", "Degree / department", { half: true }), T("period", "Period", { half: true, placeholder: "2023 to present" }),
          { type: "textarea", key: "note", label: "Note", rows: 3 },
        ] }] },

    { id: "journey", title: "Journey", icon: "flow", page: "index.html",
      blurb: "The \u201cProblem solving and coding journey\u201d rows.",
      fields: [{ type: "group", key: "journey", label: "", fields: [
        { type: "textarea", key: "lead", label: "Intro line", rows: 2 },
        { type: "list", key: "items", noun: "journey item", itemLabel: function (j) { return j.title || "New item"; },
          blank: function () { return { title: "", level: "Practicing", text: "" }; },
          fields: [T("title", "Title", { required: true, half: true }), { type: "select", key: "level", label: "Level", half: true, options: ["Comfortable", "Practicing", "Exploring"] }, { type: "textarea", key: "text", label: "Description", rows: 2 }] },
      ] }] },

    { id: "experience", title: "Experience", icon: "briefcase", page: "index.html",
      blurb: "Work experience and achievements. Anything you add here is also known by the AI assistant; until then it says these are \u201cnot listed\u201d.",
      fields: [
        { type: "list", key: "experience", label: "Experience", noun: "experience", itemLabel: function (x) { return (x.role || "New role") + (x.org ? " at " + x.org : ""); },
          blank: function () { return { role: "", org: "", period: "", note: "" }; },
          fields: [T("role", "Role", { required: true, half: true }), T("org", "Organisation", { half: true }), T("period", "Period", { half: true }), { type: "textarea", key: "note", label: "Note", rows: 3 }] },
        { type: "list", key: "achievements", label: "Achievements", noun: "achievement", itemLabel: function (x) { return x.title || "New achievement"; },
          blank: function () { return { title: "", year: "", note: "" }; },
          fields: [T("title", "Title", { required: true, half: true }), T("year", "Year", { half: true }), { type: "textarea", key: "note", label: "Note", rows: 2 }] },
      ] },

    { id: "people", title: "People", icon: "users", page: "people.html",
      blurb: "People you learn from (the People page and the \u201cWho to follow\u201d card). The People page isn't in the menu right now, but this card still appears when you add someone.",
      fields: [{ type: "list", key: "people", noun: "person", itemLabel: function (p) { return p.name || "New person"; },
        blank: function () { return { name: "", slug: "", role: "", why: "", image: "", tags: [], favorite: false, links: [] }; },
        fields: [
          T("name", "Name", { required: true, half: true }), { type: "slug", key: "slug", label: "Link name (slug)", from: "name", half: true },
          T("role", "Role / description", { half: true }), { type: "bool", key: "favorite", label: "Favourite", half: true },
          { type: "textarea", key: "why", label: "Why you follow them", rows: 2 }, { type: "image", key: "image", label: "Photo (optional)", half: true, dir: "assets/images/uploads", max: 400 }, { type: "tags", key: "tags", label: "Tags", half: true },
          { type: "list", key: "links", label: "Profiles", noun: "profile", compact: true, blank: function () { return { platform: "GitHub", url: "", handle: "" }; },
            fields: [T("platform", "Platform"), { type: "url", key: "url", label: "Link" }, T("handle", "Handle")] },
        ] }] },

    { id: "library", title: "Library", icon: "library", page: "library.html",
      blurb: "Resources, articles and notes you want to keep or recommend.",
      fields: [{ type: "list", key: "library", noun: "library item", itemLabel: function (x) { return x.title || "New item"; },
        blank: function () { return { title: "", url: "", type: "resource", source: "", description: "", tags: [] }; },
        fields: [
          T("title", "Title", { required: true, half: true }), { type: "url", key: "url", label: "Link", required: true, half: true },
          { type: "select", key: "type", label: "Type", half: true, options: ["article", "note", "resource", "bookmark", "learning", "reference"] }, T("source", "Source", { half: true, placeholder: "example.com" }),
          { type: "textarea", key: "description", label: "Description", rows: 2 }, { type: "tags", key: "tags", label: "Tags", half: true }, T("note", "Personal note", { half: true }),
        ] }] },

    { id: "contact", title: "Contact", icon: "mail", page: "contact.html",
      blurb: "Your email, the contact form and the topic cards.",
      fields: [{ type: "group", key: "contact", label: "", fields: [
        { type: "email", key: "email", label: "Email address", required: true, half: true }, T("web3formsKey", "Web3Forms access key", { half: true, help: "Public key that lets the form email you (from web3forms.com). Safe to keep here." }),
        { type: "textarea", key: "intro", label: "Intro text", rows: 2 },
        { type: "list", key: "topics", label: "Topic cards", noun: "topic", itemLabel: function (t) { return t.title || "New topic"; },
          blank: function () { return { id: "", title: "", text: "", cta: "", subject: "" }; },
          fields: [T("id", "Id", { half: true, help: "Short, lowercase, unique." }), T("title", "Card title", { half: true }), T("text", "Card text"), T("cta", "Button text", { half: true }), T("subject", "Email subject word", { half: true })] },
      ] }] },

    { id: "socials", title: "Social links", icon: "share2", page: "contact.html#find-me-on",
      blurb: "Profiles shown in \u201cFind me on\u201d, the footer and the sidebar.",
      fields: [{ type: "list", key: "socials", noun: "profile", compact: true,
        blank: function () { return { platform: "", icon: "external", handle: "", url: "" }; },
        fields: [T("platform", "Platform", { required: true }), { type: "select", key: "icon", label: "Icon", options: ["github", "linkedin", "instagram", "codeforces", "leetcode", "mail", "external"] }, T("handle", "Handle"), { type: "url", key: "url", label: "Link", required: true }] }] },

    { id: "assistant", title: "Assistant & GitHub", icon: "spark", page: "index.html",
      blurb: "The AI assistant and the GitHub section. Leave the defaults unless you know you need to change them.",
      fields: [
        { type: "group", key: "assistant", label: "AI assistant", fields: [
          { type: "bool", key: "enabled", label: "Show the assistant on the site", half: true },
          T("endpoint", "AI backend address (optional)", { half: true, placeholder: "/api/chat", help: "Leave empty to use built-in answers. Never put an API key here." }),
          { type: "group", key: "autoStart", label: "Auto-start timing", fields: [
            { type: "number", key: "scrollPercent", label: "Open after scrolling (%)", min: 5, max: 90, half: true }, { type: "number", key: "afterSeconds", label: "or after (seconds)", min: 5, max: 600, half: true }] },
        ] },
        { type: "group", key: "github", label: "GitHub section", fields: [
          { type: "url", key: "contributionsApi", label: "Contribution graph source", help: "Public mirror of the contribution calendar. Empty hides the graph." }] },
      ] },

    { id: "publish", title: "Publish & backup", icon: "share", view: "publish" },
  ];

  root.AdminSchema = { SECTIONS: SECTIONS };
})(window);
