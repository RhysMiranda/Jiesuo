// Run: node --test tests/yue_app.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const State = require("../app/yue/state.js");
const Drills = require("../app/yue/drills.js");

const yue = (f) => path.join(__dirname, "../app/yue", f);

test("emptyState has the agreed shape", () => {
  const s = State.emptyState();
  assert.deepStrictEqual(s, { stats: Drills.emptyStats(), profile: null, voice: 0, lesson: null, days: [], gate: null });
});

test("serialise round-trips", () => {
  const s = State.emptyState();
  s.stats = Drills.record(s.stats, { unit: "tones-six", type: "tone-id", target: "si1", options: [1, 6] }, { verdict: "wrong", answer: 6 }, "2026-11-14");
  s.voice = 2; s.days = ["2026-11-14"];
  const out = State.serialise(s);
  assert.strictEqual(out.lang, "yue");
  assert.strictEqual(out.v, 1);
  const back = State.deserialise(JSON.parse(JSON.stringify(out)));
  assert.deepStrictEqual(back, s);
});

test("a Mandarin progress file is refused", () => {
  assert.throws(() => State.deserialise({ known: [] }), /not-yue/);
  assert.throws(() => State.deserialise({ app: "jiesuo", known: [] }), { message: "not-yue" });
  assert.throws(() => State.deserialise(null), { message: "not-yue" });
});

test("deserialise fills defaults for missing fields", () => {
  const back = State.deserialise({ lang: "yue", v: 1 });
  assert.deepStrictEqual(back, State.emptyState());
});

test("the Mandarin service worker no longer deletes foreign caches", () => {
  const sw = fs.readFileSync(path.join(__dirname, "../app/sw.js"), "utf8");
  assert.ok(sw.includes("/^jiesuo-v" + String.fromCharCode(92) + "d+$/"));
});

test("the Cantonese service worker caches shell and data but not audio", () => {
  const sw = fs.readFileSync(yue("sw.js"), "utf8");
  assert.ok(sw.includes('"jiesuo-yue-v1"'));
  assert.ok(!/audio\/.*\.mp3/.test(sw.split("const FILES")[1].split("];")[0]));
  assert.ok(sw.includes("jiesuo-yue-"));
});

test("manifest identity", () => {
  const m = JSON.parse(fs.readFileSync(yue("manifest.webmanifest"), "utf8"));
  assert.strictEqual(m.name, "Jiesuo 粵");
  assert.strictEqual(m.scope, "./");
  assert.strictEqual(m.start_url, "./");
  const html = fs.readFileSync(yue("index.html"), "utf8");
  assert.ok(html.includes('<html lang="zh-HK">'));
  assert.ok(html.includes("<title>Jiesuo 粵</title>"));
  assert.ok(html.includes("Noto+Serif+HK:wght@400;700"));
});

test("every file the Cantonese service worker precaches exists", () => {
  const sw = fs.readFileSync(yue("sw.js"), "utf8");
  const list = sw.split("const FILES")[1].split("];")[0];
  const files = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(files.length > 10);
  for (const f of files) {
    const p = path.join(__dirname, "../app/yue", f);
    assert.ok(fs.existsSync(p), f + " is missing");
  }
});
