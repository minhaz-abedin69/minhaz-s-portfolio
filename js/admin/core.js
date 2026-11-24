/* ==========================================================================
   admin/core.js — pure logic for the admin panel (no DOM), so it can be unit
   tested in Node (tests/admin.test.js).

   serialize / parse   the site's content file, js/data.js
   diff                human-readable list of what changed
   validate            blocking errors and softer warnings
   History             undo / redo
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AdminCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* -------------------------------------------------------------- helpers */
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function slugify(s) {
    return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }
  function hash(o) {                       // small, stable fingerprint (not security)
    var s = typeof o === "string" ? o : JSON.stringify(o), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function get(obj, path) { return path.reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function set(obj, path, value) {
    var o = obj;
    for (var i = 0; i < path.length - 1; i++) { if (o[path[i]] == null) o[path[i]] = typeof path[i + 1] === "number" ? [] : {}; o = o[path[i]]; }
    o[path[path.length - 1]] = value;
  }

  // Only these link types may ever be written into the site (blocks javascript:, data:, etc).
  function safeUrl(url, opts) {
    opts = opts || {};
    var u = String(url || "").trim();
    if (!u) return true;
    if (/^https:\/\/[^\s/$.?#][^\s]*$/i.test(u)) return true;
    if (opts.allowHttp && /^http:\/\/[^\s]+$/i.test(u)) return true;
    if (opts.mailto && /^mailto:[^\s@]+@[^\s@]+$/i.test(u)) return true;
    if (opts.relative && /^(?!\/\/)[A-Za-z0-9_\-./%]+$/.test(u) && !/^[a-z][a-z0-9+.-]*:/i.test(u)) return true;
    return false;
  }

  /* ------------------------------------------------------ serialize / parse */
  var HEADER = "/* ==========================================================================\n" +
    "   js/data.js — ALL site content. Managed by the admin panel (admin.html).\n" +
    "   You can still edit it by hand: it is plain data (one assignment, no code).\n" +
    "   Field reference: README.md. Last published: ";

  function serialize(site, stamp) {
    return HEADER + (stamp || new Date().toISOString()) + "\n   ========================================================================== */\n" +
      "window.SITE = " + JSON.stringify(site, null, 2) + ";\n";
  }

  // Accepts the generated data.js, or plain JSON. It never executes the text.
  function parse(text) {
    var t = String(text || "");
    var m = /^window\.SITE\s*=\s*/m.exec(t);          // the real statement, not a mention in a comment
    var body = m ? t.slice(m.index + m[0].length) : t.slice(t.indexOf("{"));
    var end = body.lastIndexOf("}");
    if (end < 0) throw new Error("No data object found in that file.");
    var obj;
    try { obj = JSON.parse(body.slice(0, end + 1)); }
    catch (e) { throw new Error("That file isn't in the admin panel's format (it must be JSON data, with no comments)."); }
    if (!isObj(obj) || !isObj(obj.profile)) throw new Error("That file doesn't look like portfolio data (no profile).");
    return obj;
  }

  /* ----------------------------------------------------------------- diff */
  function short(v) {
    var s = typeof v === "string" ? v : JSON.stringify(v);
    if (s === undefined) return "(empty)";
    s = s.replace(/\s+/g, " ");
    return s.length > 70 ? s.slice(0, 69) + "\u2026" : (typeof v === "string" ? "\u201c" + s + "\u201d" : s);
  }
  function label(path) { return path.map(function (k, i) { return typeof k === "number" ? "[" + (k + 1) + "]" : (i ? "." : "") + k; }).join(""); }

  function diff(a, b) {
    var out = [];
    (function walk(x, y, path) {
      if (x === y) return;
      var xa = Array.isArray(x), ya = Array.isArray(y);
      if (xa && ya) {
        var n = Math.max(x.length, y.length);
        for (var i = 0; i < n; i++) {
          if (i >= x.length) out.push({ path: path.concat(i), type: "add", to: y[i] });
          else if (i >= y.length) out.push({ path: path.concat(i), type: "remove", from: x[i] });
          else walk(x[i], y[i], path.concat(i));
        }
      } else if (isObj(x) && isObj(y)) {
        var keys = {}; Object.keys(x).concat(Object.keys(y)).forEach(function (k) { keys[k] = 1; });
        Object.keys(keys).forEach(function (k) {
          if (!(k in x)) out.push({ path: path.concat(k), type: "add", to: y[k] });
          else if (!(k in y)) out.push({ path: path.concat(k), type: "remove", from: x[k] });
          else walk(x[k], y[k], path.concat(k));
        });
      } else if (JSON.stringify(x) !== JSON.stringify(y)) {
        out.push({ path: path, type: "change", from: x, to: y });
      }
    })(a, b, []);
    return out.map(function (d) {
      d.section = typeof d.path[0] === "string" ? d.path[0] : "";
      d.text = label(d.path) + (d.type === "add" ? "  added " + short(d.to) : d.type === "remove" ? "  removed " + short(d.from) : "  " + short(d.from) + "  \u2192  " + short(d.to));
      return d;
    });
  }

  /* ------------------------------------------------------------- validate */
  var LEVELS = ["Comfortable", "Practicing", "Learning"];
  var JLEVELS = ["Comfortable", "Practicing", "Exploring"];

  function validate(site) {
    var out = [];
    function err(section, path, message) { out.push({ level: "error", section: section, path: path, message: message }); }
    function warn(section, path, message) { out.push({ level: "warn", section: section, path: path, message: message }); }
    function url(section, path, value, what, opts) { if (value && !safeUrl(value, opts)) err(section, path, what + " must start with https:// (other link types are blocked for safety)."); }
    function dupes(list, key, section, what) {
      var seen = {};
      (list || []).forEach(function (it, i) {
        var v = String(it[key] || "").toLowerCase(); if (!v) return;
        if (seen[v] !== undefined) err(section, [section, i, key], what + " \u201c" + it[key] + "\u201d is used twice (items " + (seen[v] + 1) + " and " + (i + 1) + ").");
        else seen[v] = i;
      });
    }

    var p = site.profile || {};
    if (!p.name) err("profile", ["profile", "name"], "Name is required.");
    if (!p.headline) warn("profile", ["profile", "headline"], "Headline is empty.");
    if (!p.avatar) warn("profile", ["profile", "avatar"], "No profile photo set.");
    if (p.githubUser && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(p.githubUser)) err("profile", ["profile", "githubUser"], "GitHub username has invalid characters.");
    if (p.website) url("profile", ["profile", "website"], p.website, "Website");
    if (p.cv && !/\.pdf$/i.test(p.cv) && !/^https:/i.test(p.cv)) warn("profile", ["profile", "cv"], "CV should be a PDF file or an https link.");
    if (p.timezone) { try { new Intl.DateTimeFormat(undefined, { timeZone: p.timezone }); } catch (e) { err("profile", ["profile", "timezone"], "\u201c" + p.timezone + "\u201d isn't a valid time zone (example: Asia/Dhaka)."); } }
    if (p.location && !p.timezone) warn("profile", ["profile", "timezone"], "Add a time zone to show your local time next to the location.");
    if (!(p.about || []).filter(Boolean).length) warn("profile", ["profile", "about"], "The About text is empty.");

    (site.education || []).forEach(function (e, i) {
      if (!e.school) err("education", ["education", i, "school"], "Education item " + (i + 1) + " needs a school name.");
    });

    (site.skills || []).forEach(function (s, i) {
      if (!s.name) err("skills", ["skills", i, "name"], "Skill " + (i + 1) + " needs a name.");
      if (LEVELS.indexOf(s.level) < 0) err("skills", ["skills", i, "level"], "Skill \u201c" + s.name + "\u201d has an unknown level.");
      if (!s.category) warn("skills", ["skills", i, "category"], "Skill \u201c" + s.name + "\u201d has no category.");
    });
    (function () {
      var seen = {};
      (site.skills || []).forEach(function (s, i) {
        var k = (s.name + "|" + s.category).toLowerCase();
        if (s.name && seen[k] !== undefined) warn("skills", ["skills", i, "name"], "\u201c" + s.name + "\u201d appears twice in " + s.category + ".");
        seen[k] = i;
      });
    })();

    ((site.journey && site.journey.items) || []).forEach(function (j, i) {
      if (!j.title) err("journey", ["journey", "items", i, "title"], "Journey item " + (i + 1) + " needs a title.");
      if (JLEVELS.indexOf(j.level) < 0) err("journey", ["journey", "items", i, "level"], "Journey item \u201c" + j.title + "\u201d has an unknown level.");
    });

    (site.projects || []).forEach(function (x, i) {
      var P = ["projects", i];
      if (!x.title) err("projects", P.concat("title"), "Project " + (i + 1) + " needs a title.");
      if (!x.slug) err("projects", P.concat("slug"), "Project \u201c" + x.title + "\u201d needs a slug (used in its link).");
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x.slug)) err("projects", P.concat("slug"), "Slug \u201c" + x.slug + "\u201d must be lowercase letters, numbers and hyphens.");
      if (!x.description) err("projects", P.concat("description"), "Project \u201c" + x.title + "\u201d needs a description.");
      else if (x.description.length < 40) warn("projects", P.concat("description"), "Project \u201c" + x.title + "\u201d has a very short description.");
      url("projects", P.concat("github"), x.github, "GitHub link of \u201c" + x.title + "\u201d");
      if (x.github && safeUrl(x.github) && !/^https:\/\/github\.com\//i.test(x.github)) warn("projects", P.concat("github"), "\u201c" + x.title + "\u201d: the GitHub link doesn't point to github.com.");
      url("projects", P.concat("live"), x.live, "Live link of \u201c" + x.title + "\u201d");
      (x.links || []).forEach(function (l, j) { if (!l.label) err("projects", P.concat("links", j, "label"), "A link on \u201c" + x.title + "\u201d has no label."); url("projects", P.concat("links", j, "url"), l.url, "Link \u201c" + l.label + "\u201d"); });
      if (x.image && !safeUrl(x.image, { relative: true })) err("projects", P.concat("image"), "Image path of \u201c" + x.title + "\u201d is not a valid path or https link.");
    });
    dupes(site.projects, "slug", "projects", "Slug");

    (site.people || []).forEach(function (x, i) {
      if (!x.name) err("people", ["people", i, "name"], "Person " + (i + 1) + " needs a name.");
      if (!x.slug) err("people", ["people", i, "slug"], "Person \u201c" + x.name + "\u201d needs a slug.");
      (x.links || []).forEach(function (l, j) { url("people", ["people", i, "links", j, "url"], l.url, "Link for " + x.name); if (!l.platform) err("people", ["people", i, "links", j, "platform"], "A link for " + x.name + " has no platform."); });
    });
    dupes(site.people, "slug", "people", "Slug");

    var types = (site.libraryTypes || []).map(function (t) { return t.id; });
    (site.library || []).forEach(function (x, i) {
      if (!x.title) err("library", ["library", i, "title"], "Library item " + (i + 1) + " needs a title.");
      if (!x.url) err("library", ["library", i, "url"], "Library item \u201c" + x.title + "\u201d needs a link.");
      else url("library", ["library", i, "url"], x.url, "Link of \u201c" + x.title + "\u201d");
      if (types.indexOf(x.type) < 0) err("library", ["library", i, "type"], "Library item \u201c" + x.title + "\u201d has an unknown type.");
    });

    (site.experience || []).forEach(function (x, i) { if (!x.role) err("experience", ["experience", i, "role"], "Experience " + (i + 1) + " needs a role."); });
    (site.achievements || []).forEach(function (x, i) { if (!x.title) err("experience", ["achievements", i, "title"], "Achievement " + (i + 1) + " needs a title."); });

    var c = site.contact || {};
    if (!c.email) err("contact", ["contact", "email"], "Contact email is required.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) err("contact", ["contact", "email"], "That email address doesn't look valid.");
    if (!c.web3formsKey) warn("contact", ["contact", "web3formsKey"], "No Web3Forms key: the contact form won't send messages.");
    if (!(c.topics || []).length) warn("contact", ["contact", "topics"], "No contact topics.");
    dupes(c.topics, "id", "contact", "Topic id");

    (site.socials || []).forEach(function (s, i) {
      if (!s.platform) err("socials", ["socials", i, "platform"], "Social " + (i + 1) + " needs a platform name.");
      if (!s.url) err("socials", ["socials", i, "url"], "Social \u201c" + s.platform + "\u201d needs a link.");
      else url("socials", ["socials", i, "url"], s.url, "Link for " + s.platform);
    });

    var a = site.assistant || {};
    if (a.endpoint && !/^(\/[A-Za-z0-9_\-./]*|https:\/\/[^\s]+)$/.test(a.endpoint)) err("assistant", ["assistant", "endpoint"], "Assistant endpoint must be empty, a path like /api/chat, or an https link.");
    var g = site.github || {};
    if (g.contributionsApi && !/^https:\/\/[^\s]+$/.test(g.contributionsApi)) err("assistant", ["github", "contributionsApi"], "Contributions API must be empty or an https link.");

    return out;
  }

  /* -------------------------------------------------------------- history */
  function History(limit) { this.limit = limit || 60; this.past = []; this.future = []; this.present = null; }
  History.prototype.reset = function (state) { this.past = []; this.future = []; this.present = JSON.stringify(state); };
  History.prototype.push = function (state) {
    var s = JSON.stringify(state);
    if (s === this.present) return false;
    this.past.push(this.present); if (this.past.length > this.limit) this.past.shift();
    this.present = s; this.future = []; return true;
  };
  History.prototype.undo = function () { if (!this.past.length) return null; this.future.push(this.present); this.present = this.past.pop(); return JSON.parse(this.present); };
  History.prototype.redo = function () { if (!this.future.length) return null; this.past.push(this.present); this.present = this.future.pop(); return JSON.parse(this.present); };
  History.prototype.canUndo = function () { return this.past.length > 0; };
  History.prototype.canRedo = function () { return this.future.length > 0; };

  return { clone: clone, slugify: slugify, hash: hash, get: get, set: set, safeUrl: safeUrl, serialize: serialize, parse: parse, diff: diff, validate: validate, History: History };
});
