/* Unit tests for the admin panel's core logic. Run: node tests/admin.test.js */
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const root = path.join(__dirname, "..");
const C = require(path.join(root, "js/admin/core.js"));
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/data.js"), "utf8"), ctx);
const SITE = ctx.window.SITE;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS " + name); } catch (e) { fail++; console.log("FAIL " + name + "\n   " + e.message); } };

t("serialize -> parse round-trips the real site data exactly", () => {
  const text = C.serialize(SITE, "2026-01-01T00:00:00Z"); const back = C.parse(text);
  assert.deepStrictEqual(back, JSON.parse(JSON.stringify(SITE)));
});
t("serialized file is valid JavaScript that defines window.SITE (what the site loads)", () => {
  const c2 = { window: {} }; vm.createContext(c2); vm.runInContext(C.serialize(SITE), c2);
  assert.strictEqual(c2.window.SITE.profile.name, "Minhaz Abedin"); assert.strictEqual(c2.window.SITE.projects.length, 5);
});
t("parse also accepts plain JSON", () => assert.strictEqual(C.parse(JSON.stringify(SITE)).profile.name, "Minhaz Abedin"));
t("parse rejects junk, wrong shapes and never executes code", () => {
  assert.throws(() => C.parse("hello")); assert.throws(() => C.parse("{\"a\":1}"));
  global.__pwned = false; assert.throws(() => C.parse("window.SITE = {profile: (global.__pwned = true)}")); assert.strictEqual(global.__pwned, false);
});
t("parse rejects the old hand-annotated data.js (comments) with a clear message", () => {
  const old = fs.readFileSync(path.join(root, "_archive/data-annotated-before-admin.js"), "utf8");
  try { C.parse(old); assert.fail("should throw"); } catch (e) { assert.ok(/format|JSON/i.test(e.message)); }
});
t("slugify handles spaces, symbols, accents, ampersands", () => {
  assert.strictEqual(C.slugify("Boolean Algebra & Logic Gates: Study Dashboard"), "boolean-algebra-and-logic-gates-study-dashboard");
  assert.strictEqual(C.slugify("  E-Voting  Simulation!! "), "e-voting-simulation"); assert.strictEqual(C.slugify("Caf\u00e9 \u00dcber"), "cafe-uber");
});
t("diff: no changes -> empty", () => assert.strictEqual(C.diff(SITE, C.clone(SITE)).length, 0));
t("diff: describes a change, an addition and a removal", () => {
  const b = C.clone(SITE); b.profile.headline = "New headline"; b.projects.push({ title: "X" }); b.skills.shift();
  const d = C.diff(SITE, b); const types = d.map((x) => x.type);
  assert.ok(types.includes("change") && types.includes("add") && types.includes("remove"));
  assert.ok(d.find((x) => x.type === "change").text.includes("profile.headline")); assert.ok(d.every((x) => x.section));
});
t("validate: the real data has zero errors", () => {
  const errs = C.validate(SITE).filter((x) => x.level === "error"); assert.deepStrictEqual(errs, []);
});
t("validate: blocks javascript:/data: links everywhere (XSS defence)", () => {
  const b = C.clone(SITE); b.projects[0].live = "javascript:alert(1)"; b.socials[0].url = "data:text/html,<script>x</script>"; b.profile.website = "vbscript:x"; b.library[0].url = "JaVaScRiPt:alert(1)";
  const e = C.validate(b).filter((x) => x.level === "error").map((x) => x.path.join("."));
  ["projects.0.live", "socials.0.url", "profile.website", "library.0.url"].forEach((p) => assert.ok(e.includes(p), "not blocked: " + p));
});
t("validate: duplicate slugs, bad slug, missing required fields, bad email/timezone/username", () => {
  const b = C.clone(SITE); b.projects[1].slug = b.projects[0].slug; b.projects[2].slug = "Bad Slug!"; b.profile.name = ""; b.contact.email = "nope"; b.profile.timezone = "Mars/Base"; b.profile.githubUser = "-bad user";
  const m = C.validate(b).filter((x) => x.level === "error").map((x) => x.message).join(" | ");
  ["used twice", "lowercase letters", "Name is required", "email", "time zone", "GitHub username"].forEach((s) => assert.ok(m.toLowerCase().includes(s.toLowerCase()), "missing: " + s));
});
t("validate: warnings (not errors) for soft issues", () => {
  const b = C.clone(SITE); b.profile.location = "Somewhere"; b.profile.timezone = ""; b.contact.web3formsKey = "";
  const w = C.validate(b).filter((x) => x.level === "warn").map((x) => x.message).join(" ");
  assert.ok(/time zone/i.test(w) && /Web3Forms/.test(w));
});
t("validate: assistant endpoint must be a path or https", () => {
  const b = C.clone(SITE); b.assistant.endpoint = "http://evil.example/x"; assert.ok(C.validate(b).some((x) => x.level === "error" && x.section === "assistant"));
  b.assistant.endpoint = "/api/chat"; assert.ok(!C.validate(b).some((x) => x.level === "error" && x.section === "assistant"));
});
t("safeUrl accepts https/mailto/relative and rejects look-alikes", () => {
  assert.ok(C.safeUrl("https://github.com/x")); assert.ok(C.safeUrl("mailto:a@b.co", { mailto: true })); assert.ok(C.safeUrl("assets/images/a.webp", { relative: true }));
  assert.ok(!C.safeUrl("http://x.com")); assert.ok(C.safeUrl("http://x.com", { allowHttp: true })); assert.ok(!C.safeUrl("//evil.com", { relative: true })); assert.ok(!C.safeUrl("https://", {})); assert.ok(!C.safeUrl("ftp://x"));
});
t("history: undo/redo, branching clears redo, no-op pushes ignored, limit respected", () => {
  const h = new C.History(3); h.reset({ n: 0 });
  assert.ok(!h.push({ n: 0 })); h.push({ n: 1 }); h.push({ n: 2 });
  assert.deepStrictEqual(h.undo(), { n: 1 }); assert.deepStrictEqual(h.redo(), { n: 2 });
  h.undo(); h.push({ n: 9 }); assert.ok(!h.canRedo());
  h.push({ n: 10 }); h.push({ n: 11 }); h.push({ n: 12 }); assert.ok(h.past.length <= 3);
});
t("get/set path helpers create missing containers", () => {
  const o = {}; C.set(o, ["a", "b", 0, "c"], 5); assert.strictEqual(C.get(o, ["a", "b", 0, "c"]), 5); assert.ok(Array.isArray(o.a.b));
});

/* ---- GitHub publisher with a mocked GitHub API ---- */
const { GH, b64, fromB64 } = require(path.join(root, "js/admin/github.js"));
global.btoa = global.btoa || ((s) => Buffer.from(s, "binary").toString("base64")); global.atob = global.atob || ((s) => Buffer.from(s, "base64").toString("binary"));
function mockGitHub(handler) { const calls = []; global.fetch = async (url, opts) => { const c = { url, method: (opts && opts.method) || "GET", headers: (opts && opts.headers) || {}, body: opts && opts.body ? JSON.parse(opts.body) : null }; calls.push(c); const r = await handler(c); return { ok: r.status < 400, status: r.status, json: async () => r.json || {} }; }; return calls; }
(async () => {
  const tt = async (name, fn) => { try { await fn(); pass++; console.log("PASS " + name); } catch (e) { fail++; console.log("FAIL " + name + "\n   " + e.message); } };
  const gh = new GH({ owner: "minhaz-abedin69", repo: "portfolio", branch: "main", token: "ghp_TESTTOKEN" });
  await tt("base64 is UTF-8 safe (Bengali, emoji)", () => { const s = "\u09ae\u09bf\u09a8\u09b9\u09be\u099c \ud83d\udc4b caf\u00e9"; assert.strictEqual(fromB64(b64(s)), s); });
  await tt("no token -> refuses without calling GitHub", async () => { const calls = mockGitHub(() => ({ status: 200 })); await assert.rejects(new GH({ owner: "a", repo: "b" }).test(), /token/i); assert.strictEqual(calls.length, 0); });
  await tt("test(): checks repo + push rights + branch; token only sent to api.github.com", async () => {
    const calls = mockGitHub((c) => c.url.includes("/branches/") ? { status: 200, json: {} } : { status: 200, json: { full_name: "minhaz-abedin69/portfolio", private: false, permissions: { push: true } } });
    const r = await gh.test(); assert.strictEqual(r.name, "minhaz-abedin69/portfolio");
    assert.ok(calls.every((c) => c.url.startsWith("https://api.github.com/")) && calls.every((c) => c.headers.Authorization === "Bearer ghp_TESTTOKEN"));
  });
  await tt("test(): read-only token is rejected with a clear message", async () => { mockGitHub(() => ({ status: 200, json: { full_name: "x/y", permissions: { push: false } } })); await assert.rejects(gh.test(), /Contents: Read and write/); });
  await tt("test(): 401 / 404 / network errors map to friendly messages", async () => {
    mockGitHub(() => ({ status: 401 })); await assert.rejects(gh.test(), /rejected that token/);
    mockGitHub(() => ({ status: 404 })); await assert.rejects(gh.test(), /not found/);
    global.fetch = async () => { throw new TypeError("fail"); }; await assert.rejects(gh.test(), /Couldn't reach GitHub/);
  });
  await tt("publishData: reads the current sha, then PUTs the new content to js/data.js on the right branch", async () => {
    const calls = mockGitHub((c) => c.method === "GET" ? { status: 200, json: { sha: "abc123", encoding: "base64", content: b64("old"), path: "js/data.js" } } : { status: 200, json: { commit: { sha: "c0ffee", html_url: "https://github.com/x/y/commit/c0ffee" } } });
    const r = await gh.publishData("window.SITE = {};\n", "Update"); const put = calls.find((c) => c.method === "PUT");
    assert.ok(put.url.endsWith("/contents/js/data.js")); assert.strictEqual(put.body.sha, "abc123"); assert.strictEqual(put.body.branch, "main"); assert.strictEqual(fromB64(put.body.content), "window.SITE = {};\n"); assert.strictEqual(r.commit, "c0ffee");
  });
  await tt("publishData: stale sha (409/422) -> asks the user to reload instead of overwriting", async () => {
    mockGitHub((c) => c.method === "GET" ? { status: 200, json: { sha: "abc", encoding: "base64", content: "" } } : { status: 409, json: { message: "conflict" } });
    await assert.rejects(gh.publishData("x"), /changed on GitHub/);
  });
  await tt("putFile creates a new file when it doesn't exist yet (no sha sent)", async () => {
    const calls = mockGitHub((c) => c.method === "GET" ? { status: 404 } : { status: 201, json: { commit: { sha: "n1" } } });
    await gh.putFile("assets/images/uploads/a.webp", "QUJD", "add", { base64: true }); const put = calls.find((c) => c.method === "PUT");
    assert.strictEqual(put.body.sha, undefined); assert.strictEqual(put.body.content, "QUJD");
  });
  await tt("paths are URL-encoded safely", async () => { const calls = mockGitHub(() => ({ status: 404 })); await gh.getFile("assets/my file#1.pdf"); assert.ok(calls[0].url.includes("my%20file%231.pdf")); });
  console.log(`\n${pass}/${pass + fail} admin checks passed`); process.exit(fail ? 1 : 0);
})();
