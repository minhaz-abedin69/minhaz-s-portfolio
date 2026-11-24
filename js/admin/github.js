/* ==========================================================================
   admin/github.js — publishes content by committing files to the site's own
   GitHub repository through GitHub's REST API (the site is static, so there is
   no server of its own).

   The security model is GitHub's: only someone holding a token with write
   access to THIS repository can publish. The token is kept in memory (and in
   sessionStorage / localStorage only if the owner chooses), and is only ever
   sent to api.github.com.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AdminGitHub = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var API = "https://api.github.com";

  function b64(str) {                                   // UTF-8 safe base64
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(s) {
    var bin = atob(String(s).replace(/\s/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function GH(cfg) {
    this.cfg = { owner: "", repo: "", branch: "main", token: "" };
    this.configure(cfg || {});
  }
  GH.prototype.configure = function (c) {
    var self = this;
    ["owner", "repo", "branch", "token"].forEach(function (k) { if (c[k] !== undefined) self.cfg[k] = String(c[k]).trim(); });
    return this;
  };
  GH.prototype.ready = function () { var c = this.cfg; return !!(c.owner && c.repo && c.branch && c.token); };

  GH.prototype._req = function (method, path, body) {
    var c = this.cfg;
    if (!c.token) return Promise.reject(friendly(0, "Connect your GitHub token first."));
    var opts = {
      method: method,
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + c.token, "X-GitHub-Api-Version": "2022-11-28" },
    };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw friendly(r.status, j && j.message);
        return j;
      });
    }, function () { throw friendly(-1); });
  };

  function friendly(status, msg) {
    var m;
    if (status === -1) m = "Couldn't reach GitHub. Check your internet connection and try again.";
    else if (status === 401) m = "GitHub rejected that token (expired or mistyped). Create a new one and paste it again.";
    else if (status === 403) m = "That token can't write to this repository. It needs \u201cContents: Read and write\u201d permission for this repo (or you've hit a rate limit; wait a minute).";
    else if (status === 404) m = "Repository or file not found. Check the owner/repository/branch, and that the token has access to this repository.";
    else if (status === 409 || status === 422) m = "The file changed on GitHub since you loaded this page (or the branch moved). Reload the admin panel to pick up the latest version, then publish again.";
    else if (status === 0) m = msg;
    else m = "GitHub said: " + (msg || ("error " + status));
    var e = new Error(m); e.status = status; return e;
  }

  GH.prototype._path = function (p) { return p.split("/").map(encodeURIComponent).join("/"); };
  GH.prototype._repoUrl = function () { var c = this.cfg; return "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo); };

  // Verifies the token, the repository, push rights and the branch in one go.
  GH.prototype.test = function () {
    var self = this;
    return this._req("GET", this._repoUrl()).then(function (repo) {
      if (repo.permissions && repo.permissions.push === false) throw friendly(403);
      return self._req("GET", self._repoUrl() + "/branches/" + encodeURIComponent(self.cfg.branch)).then(function () {
        return { name: repo.full_name, private: !!repo.private, canPush: !repo.permissions || repo.permissions.push !== false };
      });
    });
  };

  GH.prototype.getFile = function (path) {
    var self = this;
    return this._req("GET", this._repoUrl() + "/contents/" + this._path(path) + "?ref=" + encodeURIComponent(this.cfg.branch))
      .then(function (f) { return { sha: f.sha, text: f.encoding === "base64" ? fromB64(f.content) : "", path: f.path }; })
      .catch(function (e) { if (e.status === 404) return null; throw e; });
  };

  // Create or update. Updating needs the file's current sha: GitHub refuses stale writes (that is the conflict check).
  GH.prototype.putFile = function (path, content, message, opts) {
    opts = opts || {};
    var self = this;
    var make = function (sha) {
      var body = { message: message, content: opts.base64 ? content : b64(content), branch: self.cfg.branch };
      if (sha) body.sha = sha;
      return self._req("PUT", self._repoUrl() + "/contents/" + self._path(path), body).then(function (r) {
        return { commit: r.commit && r.commit.sha, url: r.commit && r.commit.html_url, path: path };
      });
    };
    if (opts.sha !== undefined) return make(opts.sha);
    return this.getFile(path).then(function (f) { return make(f && f.sha); });
  };

  GH.prototype.publishData = function (text, message) { return this.putFile("js/data.js", text, message || "Update site content (admin panel)"); };

  GH.prototype.uploadBase64 = function (path, base64, message) { return this.putFile(path, base64, message || "Add " + path + " (admin panel)", { base64: true, sha: undefined }); };

  return { GH: GH, b64: b64, fromB64: fromB64, friendly: friendly };
});
