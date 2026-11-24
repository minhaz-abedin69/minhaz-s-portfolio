/* Unit tests for the assistant's knowledge + engine. Run: node tests/assistant.test.js */
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const root = path.join(__dirname, "..");
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/data.js"), "utf8"), ctx);
const SITE = ctx.window.SITE;
const K = require(path.join(root, "js/assistant-knowledge.js")).build(SITE);
const E = require(path.join(root, "js/assistant-engine.js")).create(K, {});

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("PASS " + name); } catch (e) { fail++; console.log("FAIL " + name + "\n   " + e.message); } }
const ask = (q) => E.localReply(q);
const text = (q) => ask(q).text;
const links = (q) => (ask(q).actions || []).map((a) => a.href);

t("knowledge comes from data.js (name, 5 projects, education)", () => {
  assert.strictEqual(K.name, "Minhaz Abedin"); assert.strictEqual(K.projects.length, 5); assert.ok(K.education[0].school.includes("Islamic"));
});
t("opening lines + suggestions use the owner's first name", () => {
  assert.ok(E.opening().join(" ").includes("Minhaz")); assert.ok(!E.opening().join(" ").includes("Nahian"));
  assert.strictEqual(E.suggestions().length, 5);
});
t("projects: lists every real project title", () => {
  const r = text("What projects has Minhaz built?"); K.projects.forEach((p) => assert.ok(r.includes(p.title), "missing " + p.title));
});
t("'What did he build?' -> projects", () => assert.ok(text("What did he build?").includes("University Management System")));
t("skills: reflects actual levels", () => {
  const r = text("What are his skills?"); assert.ok(r.includes("C++")); assert.ok(r.includes("Learning")); assert.ok(r.includes("Java"));
});
t("education: real school and department", () => {
  const r = text("Tell me about his education."); assert.ok(r.includes("International Islamic University Chittagong")); assert.ok(r.includes("Computer Science"));
});
t("'Education?' works as a one-word question", () => assert.ok(text("Education?").includes("IIUC")));
t("contact: real email + contact page link", () => {
  const r = ask("Can I contact him?"); assert.ok(r.text.includes(K.contact.email)); assert.ok(r.actions.some((a) => a.href.includes("contact.html")));
});
t("'How can I contact him?' -> contact", () => assert.ok(text("How can I contact him?").includes("Email")));
t("who are you -> assistant identity, honest about scope", () => { const r = text("Who are you?"); assert.ok(/assistant/i.test(r)); assert.ok(/guess|listed/i.test(r)); });
t("best project links to a real project section", () => {
  const r = ask("Show me his best project"); assert.ok(r.actions.some((a) => a.href.startsWith("projects.html#"))); assert.ok(K.projects.some((p) => r.text.includes(p.title)));
});
t("specific project by name (e-voting)", () => { const r = text("tell me about the e-voting project"); assert.ok(r.includes("E-Voting Simulation")); assert.ok(r.includes("election")); });
t("specific project: boolean algebra dashboard", () => assert.ok(text("what is the boolean algebra dashboard").includes("Study Dashboard")));
t("'university' alone is education, not a project", () => assert.ok(text("which university does he attend").includes("Islamic")));
t("does he know C++? -> yes from list", () => assert.ok(/Yes/.test(text("does he know C++?"))));
t("does he know Python? -> NOT listed (no invention)", () => { const r = text("Does he know Python?"); assert.ok(/don't see/i.test(r)); assert.ok(!/^Yes/.test(r)); });
t("does he know React and Java? -> mixed honest answer", () => { const r = text("does he know react and java"); assert.ok(r.includes("Java")); assert.ok(/don't see/i.test(r)); });
t("experience: honestly says none listed", () => { const r = text("What is his work experience?"); assert.ok(/no work experience/i.test(r)); });
t("achievements: honestly says none listed", () => { const r = text("any awards or achievements?"); assert.ok(/No awards/i.test(r)); });
t("cv/resume: says none published", () => assert.ok(/no cv/i.test(text("can I see his resume"))));
t("phone number: not listed", () => assert.ok(/isn't listed/i.test(text("what's his phone number"))));
t("location: not listed", () => assert.ok(/isn't listed/i.test(text("where does he live"))));
t("personal questions are declined without inventing", () => assert.ok(/not something the portfolio shares/i.test(text("how old is he and what's his salary"))));
t("github link", () => assert.ok(links("what's his github").some((l) => l.includes("github.com/minhaz-abedin69"))));
t("linkedin only returns linkedin", () => { const l = links("linkedin?"); assert.strictEqual(l.length, 1); assert.ok(l[0].includes("linkedin")); });
t("availability uses the real status text", () => assert.ok(text("is he open to opportunities?").toLowerCase().includes("open to questions and opportunities")));
t("unrelated question is politely redirected", () => { const r = ask("what's the weather in Paris and who won the world cup"); assert.ok(/mainly help/i.test(r.text)); assert.ok(r.followups.length >= 3); });
t("gibberish is handled", () => assert.ok(/mainly help/i.test(text("asdkjh qwe zxc"))));
t("greeting / thanks / bye", () => { assert.ok(/Hi there/.test(text("hello"))); assert.ok(/welcome/i.test(text("thanks!"))); assert.ok(/stopping by/i.test(text("bye"))); });
t("tell me about Minhaz -> overview from real fields", () => { const r = text("Tell me about Minhaz"); assert.ok(r.includes("Minhaz Abedin")); assert.ok(r.includes("Algorithms")); });
t("learning / current focus", () => assert.ok(text("what is he learning right now?").includes("Java")));
t("no reply ever contains made-up employers/awards", () => {
  ["Google", "Microsoft", "gold medal", "Dean's list", "GPA", "internship at"].forEach((w) => {
    ["tell me everything", "experience", "achievements", "education", "projects", "skills"].forEach((q) => assert.ok(!text(q).includes(w), q + " mentions " + w));
  });
});
t("every reply is short enough (<= 900 chars)", () => {
  ["projects", "skills", "education", "contact", "tell me about minhaz", "best project"].forEach((q) => assert.ok(text(q).length <= 900, q + " " + text(q).length));
});
t("filled-in experience/achievements ARE used when added to data", () => {
  const K2 = JSON.parse(JSON.stringify(K)); K2.experience = [{ role: "Intern", org: "Acme", period: "2026" }]; K2.achievements = [{ title: "Hackathon winner", year: 2026 }];
  const E2 = require(path.join(root, "js/assistant-engine.js")).create(K2, {});
  assert.ok(E2.localReply("experience").text.includes("Acme")); assert.ok(E2.localReply("achievements").text.includes("Hackathon winner"));
});
t("website question lists the real live sites and links to the Website page", () => {
  const r = ask("does he have a website I can visit?"); assert.ok(r.text.includes("Study Dashboard")); assert.ok(r.actions.some((x) => x.href === "website.html"));
});
t("remote mode falls back to local when the endpoint fails", async () => {});
(async () => {
  const E3 = require(path.join(root, "js/assistant-engine.js")).create(K, { endpoint: "/api/chat" });
  global.fetch = () => Promise.reject(new Error("network down"));
  const r = await E3.reply([{ role: "user", text: "What are his skills?" }]);
  try { assert.ok(r.text.includes("C++") && r.source === "local"); pass++; console.log("PASS remote failure -> local answer"); } catch (e) { fail++; console.log("FAIL remote fallback " + e.message); }
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ reply: "From the AI backend" }) });
  const r2 = await E3.reply([{ role: "user", text: "hi" }]);
  try { assert.strictEqual(r2.text, "From the AI backend"); assert.strictEqual(r2.source, "ai"); pass++; console.log("PASS remote success -> AI answer"); } catch (e) { fail++; console.log("FAIL remote success " + e.message); }
  console.log(`\n${pass}/${pass + fail} assistant checks passed`); process.exit(fail ? 1 : 0);
})();
