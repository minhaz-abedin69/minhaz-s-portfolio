/* Tests api/chat.js with a mocked provider. Run: node tests/api.test.js */
const assert = require("assert"), path = require("path");
const handle = require(path.join(__dirname, "..", "api", "chat.js"));
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("PASS " + name); } catch (e) { fail++; console.log("FAIL " + name + "\n   " + e.message); } };
function call(method, body, headers = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: b ? JSON.parse(b) : null, headers: this.headers }); } };
    handle({ method, body, headers: { "x-forwarded-for": "9.9.9." + Math.floor(Math.random() * 250), ...headers } }, res);
  });
}
(async () => {
  delete process.env.AI_API_KEY;
  await t("no key configured -> 503 (frontend falls back to local)", async () => { const r = await call("POST", { messages: [{ role: "user", content: "hi" }] }); assert.strictEqual(r.status, 503); });
  process.env.AI_API_KEY = "test-key-never-real";
  await t("rejects GET", async () => assert.strictEqual((await call("GET")).status, 405));
  await t("rejects malformed bodies", async () => { assert.strictEqual((await call("POST", { messages: "x" })).status, 400); assert.strictEqual((await call("POST", {})).status, 400); assert.strictEqual((await call("POST", { messages: [{ role: "assistant", content: "x" }] })).status, 400); });
  let seen;
  global.fetch = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ content: [{ type: "text", text: "  Minhaz studies CSE at IIUC.  " }] }) }; };
  await t("anthropic: key only in server-side header, facts in system prompt, reply returned", async () => {
    const r = await call("POST", { messages: [{ role: "user", content: "Education?" }] });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.reply, "Minhaz studies CSE at IIUC.");
    assert.ok(seen.url.includes("anthropic.com")); assert.strictEqual(seen.opts.headers["x-api-key"], "test-key-never-real");
    const sent = JSON.parse(seen.opts.body); assert.ok(sent.system.includes("International Islamic University Chittagong")); assert.ok(sent.system.includes("Never invent"));
    assert.ok(!JSON.stringify(r.body).includes("test-key-never-real"));
  });
  await t("openai-compatible provider supported", async () => {
    process.env.AI_PROVIDER = "openai";
    global.fetch = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ choices: [{ message: { content: "Hello" } }] }) }; };
    const r = await call("POST", { messages: [{ role: "user", content: "hi" }] });
    assert.strictEqual(r.body.reply, "Hello"); assert.ok(seen.opts.headers.Authorization.startsWith("Bearer ")); assert.strictEqual(JSON.parse(seen.opts.body).messages[0].role, "system");
    delete process.env.AI_PROVIDER;
  });
  await t("provider failure -> 502 with no key or internals leaked", async () => {
    global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const r = await call("POST", { messages: [{ role: "user", content: "hi" }] });
    assert.strictEqual(r.status, 502); assert.ok(!JSON.stringify(r.body).includes("test-key"));
  });
  await t("long messages are truncated, history is capped", async () => {
    global.fetch = async (u, o) => { seen = { url: u, opts: o }; return { ok: true, json: async () => ({ content: [{ text: "ok" }] }) }; };
    const many = []; for (let i = 0; i < 30; i++) many.push({ role: i % 2 ? "assistant" : "user", content: "x".repeat(5000) }); many.push({ role: "user", content: "last" });
    await call("POST", { messages: many });
    const sent = JSON.parse(seen.opts.body); assert.ok(sent.messages.length <= 10); assert.ok(sent.messages.every((m) => m.content.length <= 600));
  });
  await t("rate limit kicks in after 20 requests/min from one IP", async () => {
    let last; for (let i = 0; i < 22; i++) last = await new Promise((resolve) => { const res = { statusCode: 200, setHeader() {}, end(b) { resolve({ status: this.statusCode }); } }; handle({ method: "POST", body: { messages: [{ role: "user", content: "hi" }] }, headers: { "x-forwarded-for": "7.7.7.7" } }, res); });
    assert.strictEqual(last.status, 429);
  });
  console.log(`\n${pass}/${pass + fail} api checks passed`); process.exit(fail ? 1 : 0);
})();
