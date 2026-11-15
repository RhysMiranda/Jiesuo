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

test("a yue file with wrong inner types is refused as bad-file", () => {
  const ok = (extra) => Object.assign({ lang: "yue", v: 1 }, extra);
  const bads = [
    { stats: { byUnit: { "tones-six": 5 }, pairs: {}, gateLog: [], tonePairs: {} } },
    { stats: { byUnit: { u: [{ r: "x" }] }, pairs: {}, gateLog: [], tonePairs: {} } },
    { stats: { byUnit: {}, pairs: { "1>2": "a" }, gateLog: [], tonePairs: {} } },
    { stats: { byUnit: {}, pairs: {}, gateLog: [2], tonePairs: {} } },
    { stats: { byUnit: {}, pairs: {}, gateLog: [], tonePairs: { "1-2": 3 } } },
    { stats: "x" }, { profile: { t1: "a" } }, { voice: -1 }, { voice: 1.5 }, { days: [1] },
  ];
  for (const b of bads) assert.throws(() => State.deserialise(ok(b)), { message: "bad-file" }, JSON.stringify(b));
  const good = State.emptyState(); good.profile = { t1: 3.2, t3: 1 };
  assert.deepStrictEqual(State.deserialise(ok(good)).profile, good.profile);
});

test("load falls back to a fresh state on a bad, foreign or unparseable save", () => {
  const fresh = State.emptyState();
  assert.deepStrictEqual(State.load(null), { state: fresh, fresh: false });
  const bad = JSON.stringify({ lang: "yue", v: 1, stats: { byUnit: { a: 5 }, pairs: {}, gateLog: [], tonePairs: {} } });
  assert.deepStrictEqual(State.load(bad), { state: fresh, fresh: true });
  assert.deepStrictEqual(State.load("{nope"), { state: fresh, fresh: true });
  assert.deepStrictEqual(State.load(JSON.stringify({ known: [] })), { state: fresh, fresh: true });
  const s = State.emptyState(); s.days = ["2026-11-14"];
  assert.deepStrictEqual(State.load(JSON.stringify(State.serialise(s))).state, s);
});

test("the Mandarin service worker no longer deletes foreign caches", () => {
  const sw = fs.readFileSync(path.join(__dirname, "../app/sw.js"), "utf8");
  assert.ok(sw.includes("/^jiesuo-v" + String.fromCharCode(92) + "d+$/"));
});

test("the Cantonese service worker caches shell and data but not audio", () => {
  const sw = fs.readFileSync(yue("sw.js"), "utf8");
  assert.ok(sw.includes('const VERSION = "jiesuo-yue-v3"'));
  assert.ok(sw.includes("network-first for everything else"));
  assert.ok(sw.includes("cache-first"));
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
