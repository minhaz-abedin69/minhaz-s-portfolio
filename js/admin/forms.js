/* ==========================================================================
   admin/forms.js — builds the editing screens from js/admin/schema.js.

   Forms.build(fields, ctx, basePath) -> DocumentFragment
   ctx supplies: get(path), set(path, value), mutate(fn), rerender(),
                 confirm(message) -> Promise<boolean>, upload(file, opts) -> Promise<path>,
                 suggestions(name) -> string[], uploadReady() -> boolean
   Forms.paintIssues(root, issues) shows validation messages inline without re-rendering.
   ========================================================================== */
(function (root) {
  "use strict";
  var C = root.AdminCore;
  var uid = 0;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var icon = function (n, s) { return root.Site ? root.Site.icon(n, s || 18) : ""; };

  function h(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === false || attrs[k] == null) return;
      if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    if (html != null) e.innerHTML = html;
    return e;
  }
  var pstr = function (p) { return p.join("."); };

  function wrap(f, path, control, id, extraClass) {
    var w = h("div", { class: "ad-field" + (f.half ? " ad-half" : "") + (extraClass ? " " + extraClass : ""), "data-path": pstr(path) });
    if (f.label) w.appendChild(h("label", { class: "ad-label", for: id }, esc(f.label) + (f.required ? ' <span class="ad-req" title="Required">*</span>' : "")));
    w.appendChild(control);
    if (f.help) w.appendChild(h("p", { class: "ad-help", id: id + "-h" }, esc(f.help)));
    w.appendChild(h("p", { class: "ad-msg", id: id + "-m", hidden: true }));
    return w;
  }

  /* --------------------------------------------------------- builders */
  var B = {};

  B.input = function (f, path, ctx) {
    var id = "f" + (++uid), val = ctx.get(path);
    var isNum = f.type === "number";
    var inp = h("input", {
      id: id, class: "ad-input", type: isNum ? "number" : (f.type === "email" ? "email" : "text"), value: val == null ? "" : String(val),
      placeholder: f.placeholder, maxlength: f.maxLength, min: f.min, max: f.max, autocomplete: "off", spellcheck: f.type === "text" ? null : "false",
      inputmode: f.type === "url" ? "url" : null, "aria-describedby": (f.help ? id + "-h " : "") + id + "-m",
    });
    if (f.list) { inp.setAttribute("list", id + "-dl"); }
    inp.addEventListener("input", function () { ctx.set(path, isNum ? (inp.value === "" ? "" : Number(inp.value)) : inp.value); });
    var box = h("div", { class: "ad-ctl" }); box.appendChild(inp);
    if (f.list) {
      var dl = h("datalist", { id: id + "-dl" });
      (ctx.suggestions(f.list) || []).forEach(function (o) { dl.appendChild(h("option", { value: o })); });
      box.appendChild(dl);
    }
    return wrap(f, path, box, id);
  };
  B.text = B.url = B.email = B.number = B.input;

  B.slug = function (f, path, ctx) {
    var id = "f" + (++uid), val = ctx.get(path);
    var inp = h("input", { id: id, class: "ad-input", type: "text", value: val || "", spellcheck: "false", autocomplete: "off", "aria-describedby": id + "-m" });
    inp.addEventListener("input", function () { ctx.set(path, inp.value); });
    var btn = h("button", { type: "button", class: "ad-mini", title: "Generate from " + (f.from || "title"), "aria-label": "Generate from " + (f.from || "title") }, icon("refresh", 16));
    var fromPath = path.slice(0, -1).concat(f.from);
    btn.addEventListener("click", function () { var v = C.slugify(ctx.get(fromPath)); inp.value = v; ctx.set(path, v); });
    // auto-fill while the slug is still blank or still matches the previous title
    ctx.listen(pstr(fromPath), function (nv, ov) {
      var cur = ctx.get(path);
      if (!cur || cur === C.slugify(ov)) { var v = C.slugify(nv); inp.value = v; ctx.set(path, v, { silent: true }); }
    });
    var box = h("div", { class: "ad-ctl ad-ctl-row" }); box.appendChild(inp); box.appendChild(btn);
    return wrap(f, path, box, id);
  };

  B.textarea = function (f, path, ctx) {
    var id = "f" + (++uid);
    var ta = h("textarea", { id: id, class: "ad-input", rows: f.rows || 3, "aria-describedby": (f.help ? id + "-h " : "") + id + "-m" });
    ta.value = ctx.get(path) || "";
    ta.addEventListener("input", function () { ctx.set(path, ta.value); });
    return wrap(f, path, ta, id);
  };

  B.select = function (f, path, ctx) {
    var id = "f" + (++uid), cur = ctx.get(path);
    var sel = h("select", { id: id, class: "ad-input", "aria-describedby": id + "-m" });
    var opts = f.options.map(function (o) { return typeof o === "string" ? { value: o, label: o } : o; });
    if (cur != null && !opts.some(function (o) { return o.value === cur; })) opts.push({ value: cur, label: String(cur) + " (unknown)" });
    opts.forEach(function (o) { var op = h("option", { value: o.value }, esc(o.label)); if (o.value === cur) op.selected = true; sel.appendChild(op); });
    sel.addEventListener("change", function () { ctx.set(path, sel.value); });
    return wrap(f, path, sel, id);
  };

  B.bool = function (f, path, ctx) {
    var id = "f" + (++uid);
    var w = h("div", { class: "ad-field ad-bool" + (f.half ? " ad-half" : ""), "data-path": pstr(path) });
    var lab = h("label", { class: "ad-switch", for: id });
    var cb = h("input", { id: id, type: "checkbox", role: "switch" }); cb.checked = !!ctx.get(path);
    cb.addEventListener("change", function () { ctx.set(path, cb.checked); });
    lab.appendChild(cb); lab.appendChild(h("span", { class: "ad-track", "aria-hidden": "true" })); lab.appendChild(h("span", { class: "ad-switch-text" }, esc(f.label)));
    w.appendChild(lab);
    if (f.help) w.appendChild(h("p", { class: "ad-help" }, esc(f.help)));
    w.appendChild(h("p", { class: "ad-msg", id: id + "-m", hidden: true }));
    return w;
  };

  B.tags = function (f, path, ctx) {
    var id = "f" + (++uid);
    var box = h("div", { class: "ad-tags" });
    var inp = h("input", { id: id, class: "ad-tags-input", type: "text", placeholder: "Type and press Enter", autocomplete: "off", "aria-describedby": (f.help ? id + "-h " : "") + id + "-m" });
    function list() { var v = ctx.get(path); return Array.isArray(v) ? v : []; }
    function paint() {
      box.querySelectorAll(".ad-tag").forEach(function (n) { n.remove(); });
      list().forEach(function (t, i) {
        var chip = h("span", { class: "ad-tag" }, esc(t) + '<button type="button" aria-label="Remove ' + esc(t) + '">' + icon("close", 12) + "</button>");
        chip.querySelector("button").addEventListener("click", function () { var a = list().slice(); a.splice(i, 1); ctx.set(path, a); paint(); inp.focus(); });
        box.insertBefore(chip, inp);
      });
    }
    function add() {
      var parts = inp.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!parts.length) return;
      var a = list().slice(); parts.forEach(function (p) { if (a.indexOf(p) < 0) a.push(p); });
      inp.value = ""; ctx.set(path, a); paint();
    }
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
      else if (e.key === "Backspace" && !inp.value && list().length) { var a = list().slice(); a.pop(); ctx.set(path, a); paint(); }
    });
    inp.addEventListener("blur", add);
    box.addEventListener("click", function (e) { if (e.target === box) inp.focus(); });
    box.appendChild(inp); paint();
    return wrap(f, path, box, id);
  };

  B.strings = function (f, path, ctx) {
    var id = "f" + (++uid);
    var w = h("div", { class: "ad-field", "data-path": pstr(path) });
    if (f.label) w.appendChild(h("span", { class: "ad-label", id: id + "-l" }, esc(f.label)));
    var list = h("div", { class: "ad-strings", role: "group", "aria-labelledby": id + "-l" });
    function items() { var v = ctx.get(path); return Array.isArray(v) ? v : []; }
    function paint() {
      list.innerHTML = "";
      items().forEach(function (txt, i) {
        var row = h("div", { class: "ad-string" });
        var ta = h("textarea", { class: "ad-input", rows: 3, "aria-label": (f.noun || "item") + " " + (i + 1) }); ta.value = txt;
        ta.addEventListener("input", function () { var a = items().slice(); a[i] = ta.value; ctx.set(path, a); });
        var del = h("button", { type: "button", class: "ad-mini ad-danger", "aria-label": "Delete " + (f.noun || "item") + " " + (i + 1) }, icon("trash", 16));
        del.addEventListener("click", function () { ctx.confirm("Delete this " + (f.noun || "item") + "?").then(function (ok) { if (ok) { var a = items().slice(); a.splice(i, 1); ctx.set(path, a); paint(); } }); });
        row.appendChild(ta); row.appendChild(del); list.appendChild(row);
      });
    }
    var add = h("button", { type: "button", class: "btn btn-sm" }, icon("plus", 16) + "Add " + esc(f.noun || "item"));
    add.addEventListener("click", function () { var a = items().slice(); a.push(""); ctx.set(path, a); paint(); var t = list.querySelectorAll("textarea"); if (t.length) t[t.length - 1].focus(); });
    w.appendChild(list); w.appendChild(add);
    if (f.help) w.appendChild(h("p", { class: "ad-help" }, esc(f.help)));
    w.appendChild(h("p", { class: "ad-msg", id: id + "-m", hidden: true }));
    paint();
    return w;
  };

  B.image = B.file = function (f, path, ctx) {
    var id = "f" + (++uid), isFile = f.type === "file";
    var val = ctx.get(path) || "";
    var box = h("div", { class: "ad-ctl ad-media" });
    var thumb = h("div", { class: "ad-thumb", "aria-hidden": "true" });
    var inp = h("input", { id: id, class: "ad-input", type: "text", value: val, placeholder: isFile ? "assets/uploads/cv.pdf or https://\u2026" : "assets/images/\u2026", spellcheck: "false", autocomplete: "off", "aria-describedby": id + "-m" });
    function paintThumb() {
      var v = inp.value.trim();
      thumb.innerHTML = !isFile && v && C.safeUrl(v, { relative: true }) ? '<img src="' + esc(v) + '" alt="">' : icon(isFile ? "book" : "user", 20);
    }
    inp.addEventListener("input", function () { ctx.set(path, inp.value); paintThumb(); });
    var file = h("input", { type: "file", class: "visually-hidden", accept: isFile ? "application/pdf" : "image/png,image/jpeg,image/webp,image/gif", tabindex: "-1", "aria-hidden": "true" });
    var up = h("button", { type: "button", class: "btn btn-sm" }, icon("upload", 16) + "Upload");
    up.addEventListener("click", function () {
      if (!ctx.uploadReady()) { ctx.toast("Connect GitHub in \u201cPublish & backup\u201d first. Uploads are saved to your repository."); return; }
      file.click();
    });
    file.addEventListener("change", function () {
      var fl = file.files && file.files[0]; if (!fl) return;
      up.disabled = true; up.innerHTML = icon("refresh", 16) + "Uploading\u2026";
      ctx.upload(fl, { dir: f.dir, max: f.max, kind: isFile ? "pdf" : "image" }).then(function (p) {
        inp.value = p; ctx.set(path, p); paintThumb(); ctx.toast("Uploaded. Publish to put it live.");
      }, function (e) { ctx.toast(e.message || "Upload failed."); })
        .then(function () { up.disabled = false; up.innerHTML = icon("upload", 16) + "Upload"; file.value = ""; });
    });
    box.appendChild(thumb); box.appendChild(inp); box.appendChild(up); box.appendChild(file); paintThumb();
    return wrap(f, path, box, id);
  };

  B.group = function (f, path, ctx) {
    var fs = h("fieldset", { class: "ad-group" + (f.label ? "" : " ad-group-bare"), "data-path": pstr(path) });
    if (f.label) fs.appendChild(h("legend", null, esc(f.label)));
    var grid = h("div", { class: "ad-grid" });
    f.fields.forEach(function (sub) { grid.appendChild(buildField(sub, path.concat(sub.key), ctx)); });
    fs.appendChild(grid);
    return fs;
  };

  B.list = function (f, path, ctx) {
    var id = "f" + (++uid);
    var w = h("section", { class: "ad-list" + (f.compact ? " ad-list-compact" : ""), "data-path": pstr(path), "aria-labelledby": id + "-t" });
    var items = ctx.get(path); if (!Array.isArray(items)) { items = []; }
    var head = h("div", { class: "ad-list-head" });
    if (f.label) head.appendChild(h("h3", { id: id + "-t" }, esc(f.label) + ' <span class="ad-count">' + items.length + "</span>"));
    else head.appendChild(h("span", { id: id + "-t", class: "visually-hidden" }, esc(f.noun) + "s"));
    var addTop = h("button", { type: "button", class: "btn btn-sm btn-primary" }, icon("plus", 16) + "Add " + esc(f.noun || "item"));
    head.appendChild(addTop); w.appendChild(head);

    if (f.compact && items.length) {
      var hdr = h("div", { class: "ad-row ad-row-head", style: "--cols:" + f.fields.length }, f.fields.map(function (s) { return "<span>" + esc(s.label) + "</span>"; }).join("") + "<span></span>");
      w.appendChild(hdr);
    }
    if (!items.length) w.appendChild(h("p", { class: "ad-empty" }, "Nothing here yet. Use \u201cAdd " + esc(f.noun || "item") + "\u201d."));

    var wrapEl = h("div", { class: "ad-items" });
    items.forEach(function (item, i) {
      var ipath = path.concat(i);
      var ctl = h("div", { class: "ad-ctrls" });
      function btn(label, ic, cls, fn, disabled) {
        var b = h("button", { type: "button", class: "ad-mini " + (cls || ""), "aria-label": label + " " + (f.noun || "item") + " " + (i + 1), title: label, disabled: disabled }, icon(ic, 16));
        b.addEventListener("click", function (e) { e.stopPropagation(); fn(); }); ctl.appendChild(b); return b;
      }
      btn("Move up", "arrowUp", "", function () { ctx.mutate(function () { var a = ctx.get(path); a.splice(i - 1, 0, a.splice(i, 1)[0]); }); }, i === 0);
      btn("Move down", "chevron", "", function () { ctx.mutate(function () { var a = ctx.get(path); a.splice(i + 1, 0, a.splice(i, 1)[0]); }); }, i === items.length - 1);
      if (!f.compact) btn("Duplicate", "copy", "", function () { ctx.mutate(function () { var a = ctx.get(path), c = C.clone(item); if (c.slug) c.slug += "-copy"; if (c.title) c.title += " (copy)"; else if (c.name) c.name += " (copy)"; ctx.opened(c); a.splice(i + 1, 0, c); }); });
      btn("Delete", "trash", "ad-danger", function () { ctx.confirm("Delete this " + (f.noun || "item") + "? You can undo this with Ctrl+Z.").then(function (ok) { if (ok) ctx.mutate(function () { ctx.get(path).splice(i, 1); }); }); });

      if (f.compact) {
        var row = h("div", { class: "ad-row ad-item", style: "--cols:" + f.fields.length, "data-path": pstr(ipath) });
        f.fields.forEach(function (sub) { var fe = buildField(sub, ipath.concat(sub.key), ctx); fe.classList.add("ad-cell"); row.appendChild(fe); });
        row.appendChild(ctl); wrapEl.appendChild(row);
      } else {
        var open = ctx.isOpen(item);
        var card = h("div", { class: "ad-item ad-card-item" + (open ? " is-open" : ""), "data-path": pstr(ipath) });
        var title = f.itemLabel ? f.itemLabel(item) : (f.noun + " " + (i + 1));
        var meta = f.itemMeta ? f.itemMeta(item) : "";
        var bid = "f" + (++uid);
        var top = h("div", { class: "ad-item-top" });
        var tg = h("button", { type: "button", class: "ad-item-toggle", "aria-expanded": String(open), "aria-controls": bid }, '<span class="ad-item-num">' + (i + 1) + '</span><span class="ad-item-title">' + esc(title) + '</span><span class="ad-item-meta">' + esc(meta) + '</span><span class="ad-item-badge" hidden></span>' + icon("chevron", 18));
        tg.addEventListener("click", function () { var o = card.classList.toggle("is-open"); tg.setAttribute("aria-expanded", String(o)); ctx.setOpen(item, o); });
        top.appendChild(tg); top.appendChild(ctl);
        var body = h("div", { class: "ad-item-body", id: bid });
        var grid = h("div", { class: "ad-grid" });
        f.fields.forEach(function (sub) { grid.appendChild(buildField(sub, ipath.concat(sub.key), ctx)); });
        body.appendChild(grid);
        card.appendChild(top); card.appendChild(body); wrapEl.appendChild(card);
        // keep the card title live while typing
        ctx.listen(pstr(ipath), function () { var t = f.itemLabel ? f.itemLabel(ctx.get(ipath)) : ""; var tn = tg.querySelector(".ad-item-title"); if (tn) tn.textContent = t; if (f.itemMeta) { var mn = tg.querySelector(".ad-item-meta"); if (mn) mn.textContent = f.itemMeta(ctx.get(ipath)); } }, true);
      }
    });
    w.appendChild(wrapEl);

    addTop.addEventListener("click", function () {
      ctx.mutate(function () {
        var arr = ctx.get(path); if (!Array.isArray(arr)) { C.set(ctx.root(), path, []); arr = ctx.get(path); }
        var blank = f.blank ? f.blank() : {}; ctx.opened(blank); arr.push(blank);
        ctx.focusPath(pstr(path.concat(arr.length - 1)));
      });
    });
    return w;
  };

  function buildField(f, path, ctx) {
    var b = B[f.type] || B.text;
    return b(f, path, ctx);
  }

  /* ------------------------------------------------------------ public */
  var Forms = {
    build: function (fields, ctx, basePath) {
      var frag = document.createDocumentFragment();
      var grid = h("div", { class: "ad-grid" });
      (fields || []).forEach(function (f) { grid.appendChild(buildField(f, (basePath || []).concat(f.key), ctx)); });
      frag.appendChild(grid);
      return frag;
    },
    paintIssues: function (rootEl, issues) {
      rootEl.querySelectorAll(".has-error, .has-warn").forEach(function (n) { n.classList.remove("has-error", "has-warn"); });
      rootEl.querySelectorAll(".ad-msg").forEach(function (m) { m.hidden = true; m.textContent = ""; });
      rootEl.querySelectorAll("[aria-invalid]").forEach(function (n) { n.removeAttribute("aria-invalid"); });
      rootEl.querySelectorAll(".ad-item-badge").forEach(function (n) { n.hidden = true; n.textContent = ""; });
      var perItem = {};
      issues.forEach(function (is) {
        var key = pstr(is.path);
        var field = rootEl.querySelector('[data-path="' + key.replace(/"/g, '\\"') + '"]');
        if (field) {
          if (!field.classList.contains("has-error")) field.classList.add(is.level === "error" ? "has-error" : "has-warn");
          if (is.level === "error") { field.classList.remove("has-warn"); field.classList.add("has-error"); }
          var msg = field.querySelector(".ad-msg"); if (msg && msg.hidden) { msg.textContent = is.message; msg.hidden = false; }
          var ctl = field.querySelector("input, select, textarea"); if (ctl && is.level === "error") ctl.setAttribute("aria-invalid", "true");
        }
        // mark the enclosing list card
        for (var n = is.path.length - 1; n >= 2; n--) {
          if (typeof is.path[n] === "number" || (typeof is.path[n - 1] === "number")) {
            var ip = pstr(is.path.slice(0, typeof is.path[n] === "number" ? n + 1 : n));
            perItem[ip] = perItem[ip] || { e: 0, w: 0 }; perItem[ip][is.level === "error" ? "e" : "w"]++; break;
          }
        }
      });
      Object.keys(perItem).forEach(function (ip) {
        var card = rootEl.querySelector('.ad-card-item[data-path="' + ip + '"]'); if (!card) return;
        var bd = card.querySelector(".ad-item-badge"), c = perItem[ip];
        bd.hidden = false; bd.className = "ad-item-badge " + (c.e ? "is-error" : "is-warn"); bd.textContent = c.e ? c.e + (c.e === 1 ? " error" : " errors") : c.w + (c.w === 1 ? " warning" : " warnings");
      });
    },
  };

  root.AdminForms = Forms;
})(window);
