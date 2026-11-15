"use strict";
const test = require("node:test");
const assert = require("node:assert");
const stage0 = require("../app/yue/data/stage0.json");
const audio = require("../app/yue/data/audio.json");
const Drills = require("../app/yue/drills.js");
const L = require("../app/yue/lesson.js");

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const D = Drills.createDrills({ stage0, audio });
const passedLog = () => Array.from({ length: 20 }, () => ({ r: 1, d: "2026-01-01" }));
function statsWith(passed) {
  const s = Drills.emptyStats();
  for (const id of passed) s.byUnit[id] = passedLog();
  return s;
}
const base = { hasMic: false, calibrated: false, audio };
const drillsOf = (steps) => steps.filter((s) => s.kind === "drill");
const texts = (steps) => JSON.stringify(steps.filter((s) => s.kind === "done" || s.kind === "gate").map((s) => s.summary || ""));

test("a new learner starts on tones-six with a teach block", () => {
  const { unit, steps } = L.compose(stage0, Drills.emptyStats(), base, seeded(1));
  assert.strictEqual(unit, "tones-six");
  assert.strictEqual(steps[0].kind, "teach");
  assert.ok(steps[0].lines.length > 0);
  assert.strictEqual(steps.filter((s) => s.kind === "teach").length, 1);
});

test("no teach block once the unit has been started", () => {
  const s = Drills.emptyStats();
  s.byUnit["tones-six"] = [{ r: 1, d: "2026-01-01" }];
  assert.strictEqual(L.compose(stage0, s, base, seeded(1)).steps.some((x) => x.kind === "teach"), false);
});

test("lesson has about 30 drills, 70% current unit once a unit has passed", () => {
  const { unit, steps } = L.compose(stage0, statsWith(["tones-six"]), base, seeded(2));
  assert.strictEqual(unit, "tones-hear");
  const ds = drillsOf(steps);
  assert.ok(ds.length >= 28 && ds.length <= 32, "n=" + ds.length);
  const cur = ds.filter((s) => s.drill.unit === "tones-hear").length;
  const share = cur / ds.length;
  assert.ok(share > 0.6 && share < 0.8, "share=" + share);
  assert.ok(ds.every((s) => s.drill.unit === "tones-hear" || s.drill.unit === "tones-six"));
});

test("lesson without a microphone still completes", () => {
  const { steps } = L.compose(stage0, Drills.emptyStats(), base, seeded(3));
  assert.ok(!steps.some((s) => s.kind === "calibrate"));
  assert.ok(!drillsOf(steps).some((s) => s.drill.type === "say"));
  assert.strictEqual(steps[steps.length - 1].kind, "done");
});

test("calibration comes before the first say drill", () => {
  const { steps } = L.compose(stage0, Drills.emptyStats(), { hasMic: true, calibrated: false, audio }, seeded(4));
  const cal = steps.findIndex((s) => s.kind === "calibrate");
  const firstSay = steps.findIndex((s) => s.kind === "drill" && s.drill.type === "say");
  assert.ok(cal >= 0 && firstSay > cal);
  assert.strictEqual(drillsOf(steps).filter((s) => s.drill.type === "say").length, 3);
  const calibrated = L.compose(stage0, Drills.emptyStats(), { hasMic: true, calibrated: true, audio }, seeded(4));
  assert.ok(!calibrated.steps.some((s) => s.kind === "calibrate"));
});

test("gate appears after tones-hear passes", () => {
  const without = L.compose(stage0, statsWith(["tones-six"]), base, seeded(5)).steps;
  assert.ok(!without.some((s) => s.kind === "gate"));
  const withGate = L.compose(stage0, statsWith(["tones-six", "tones-hear"]), base, seeded(5)).steps;
  const g = withGate.find((s) => s.kind === "gate");
  assert.ok(g);
  assert.strictEqual(g.drills.length, 40);
  assert.ok(g.drills.every((d) => d.gate === true && d.type === "tone-id"));
  const done = statsWith(["tones-six", "tones-hear"]);
  done.gateLog = Array(40).fill(1);
  assert.ok(!L.compose(stage0, done, base, seeded(5)).steps.some((s) => s.kind === "gate"));
});

test("only a taken gate fills the gate log, and it passes at 34 of 40", () => {
  const ready = statsWith(["tones-six", "tones-hear"]);
  const g = L.compose(stage0, ready, base, seeded(11)).steps.find((s) => s.kind === "gate");
  const run = (right) => g.drills.reduce((s, d, i) => Drills.record(s, d, i < right ? "right" : "wrong", "2026-01-01"), ready);
  assert.deepStrictEqual(Drills.gate(run(34)), { passed: true, right: 34, count: 40 });
  assert.strictEqual(Drills.gate(run(33)).passed, false);
  // ordinary lesson drills and pair practice never count toward the gate
  const { steps } = L.compose(stage0, statsWith(["tones-six"]), base, seeded(12));
  let s = statsWith(["tones-six"]);
  for (const st of drillsOf(steps)) { assert.strictEqual(st.drill.gate, false); s = Drills.record(s, st.drill, "right", "2026-01-01"); }
  const prac = L.practise(stage0, audio, ready, 2, 5, seeded(13), 10);
  assert.ok(prac.length && prac.every((d) => d.gate === false));
  for (const d of prac) s = Drills.record(s, d, "right", "2026-01-01");
  assert.strictEqual(Drills.gate(s).count, 0);
});

test("a failed gate is offered again on a later day, not the same day", () => {
  const failed = statsWith(["tones-six", "tones-hear"]);
  failed.gateLog = Array(40).fill(1).fill(0, 0, 10);
  const has = (o) => L.compose(stage0, failed, Object.assign({}, base, o), seeded(14)).steps.some((s) => s.kind === "gate");
  assert.ok(has({}));
  assert.ok(!has({ gateLast: "2026-11-15", today: "2026-11-15" }));
  assert.ok(has({ gateLast: "2026-11-14", today: "2026-11-15" }));
});

test("usableSteps keeps a sound kept lesson and refuses a damaged one", () => {
  const ready = statsWith(["tones-six", "tones-hear"]);
  const steps = JSON.parse(JSON.stringify(L.compose(stage0, ready, base, seeded(15)).steps));
  const ok = L.usableSteps(steps);
  assert.ok(ok && ok.length === steps.length);
  assert.ok(ok.find((s) => s.kind === "gate").drills.every((d) => d.gate === true));
  const stale = JSON.parse(JSON.stringify(steps));
  drillsOf(stale)[0].drill.gate = true; // an old save's passive gate flag is dropped
  assert.strictEqual(drillsOf(L.usableSteps(stale))[0].drill.gate, false);
  for (const bad of [null, [], [{ kind: "drill" }], [{ kind: "drill", drill: { type: "tone-id" } }], [{ kind: "gate", drills: [] }],
    [{ kind: "teach", title: "x" }], [{ kind: "mystery" }], [7]]) assert.strictEqual(L.usableSteps(bad), null, JSON.stringify(bad));
});

test("an unplayable gate question is replaced, and a short gate is reported honestly", () => {
  const ready = statsWith(["tones-six", "tones-hear"]);
  const g = L.compose(stage0, ready, base, seeded(21)).steps.find((s) => s.kind === "gate");
  const failed = g.drills[0];
  const rng = seeded(22);
  for (let i = 0; i < 30; i++) {
    const nd = L.replaceGateDrill(D, ready, failed, rng);
    assert.ok(nd && nd.gate === true && nd.type === "tone-id" && nd.options.length === 6 && nd.unit === "tones-hear");
    assert.ok(!(nd.target === failed.target && nd.voice === failed.voice));
  }
  const short = Object.assign({}, ready, { gateLog: Array(39).fill(1) });
  assert.match(L.gateSummary(short, Drills.gate(short).passed), /39 of the 39 questions you answered.*open to you/);
  const full = Object.assign({}, ready, { gateLog: Array(40).fill(1).fill(0, 0, 10) });
  assert.match(L.gateSummary(full, false), /You got 30 of 40 on the tone check/);
});

test("a kept lesson carries its gate step, and decides at the start whether it is due", () => {
  const ready = statsWith(["tones-six", "tones-hear"]);
  const today = { gateLast: "2026-11-15", today: "2026-11-15" }, tomorrow = { gateLast: "2026-11-15", today: "2026-11-16" };
  // composed in done() right after today's gate: the gate step is kept anyway, so its clips can be prefetched
  const kept = L.compose(stage0, ready, Object.assign({}, base, today, { gate: "keep" }), seeded(23)).steps;
  const g = kept.find((s) => s.kind === "gate");
  assert.ok(g && g.drills.length === 40 && g.drills.every((d) => d.gate === true));
  const pre = new Set();
  kept.forEach((s) => { if (s.kind === "gate") s.drills.forEach((d) => pre.add(d.voice + "|" + d.target)); });
  assert.strictEqual(pre.size > 0, true); // the prefetch branch in today.js done() sees these drills
  // due at the start: the very same (prefetched) gate step is kept
  const next = L.withGate(stage0, kept, ready, Object.assign({}, base, tomorrow), seeded(24));
  assert.deepStrictEqual(next.find((s) => s.kind === "gate"), g);
  assert.strictEqual(next.length, kept.length);
  // not due (same day): dropped
  assert.ok(!L.withGate(stage0, kept, ready, Object.assign({}, base, today), seeded(25)).some((s) => s.kind === "gate"));
  // passed meanwhile: dropped
  const passed = Object.assign({}, ready, { gateLog: Array(40).fill(1) });
  assert.ok(!L.withGate(stage0, kept, passed, Object.assign({}, base, tomorrow), seeded(26)).some((s) => s.kind === "gate"));
  // none kept but due: a fresh one goes after the teach steps
  const plain = L.compose(stage0, ready, Object.assign({}, base, { gate: false }), seeded(27)).steps;
  const fresh = L.withGate(stage0, plain, ready, Object.assign({}, base, tomorrow), seeded(28));
  const gi = fresh.findIndex((s) => s.kind === "gate");
  assert.ok(gi >= 0 && fresh.slice(0, gi).every((s) => s.kind === "teach"));
});

test("a replacement gate question prefers a cached clip", () => {
  const ready = statsWith(["tones-six", "tones-hear"]);
  const unit = stage0.units.find((u) => u.id === "tones-hear");
  const set = unit.minimalSets.find((s) => s.filter((x) => (audio.clips[x] || []).includes(0)).length >= 4);
  const cached = {};
  for (const x of set) if ((audio.clips[x] || []).includes(0)) cached[x] = [0];
  const failed = { type: "tone-id", unit: "tones-hear", target: "zzz1", voice: 9 };
  const rng = seeded(31);
  for (let i = 0; i < 20; i++) {
    const d = L.replaceGateDrill(D, ready, failed, rng, cached);
    assert.ok(d && d.gate === true && d.voice === 0 && cached[d.target], JSON.stringify(d));
  }
  assert.ok(L.replaceGateDrill(D, ready, failed, rng, {})); // nothing cached: any playable question
});

test("summary never mentions missed days", () => {
  const bad = /miss|streak|lost/i;
  const before = Drills.emptyStats();
  let after = before;
  const rng = seeded(6);
  for (let i = 0; i < 12; i++) {
    const d = D.pick("tones-hear", after, rng, { type: "tone-id" });
    after = D.record(after, d, { verdict: i % 4 ? "right" : "wrong", answer: 3 }, "2026-01-02");
  }
  const { steps } = L.compose(stage0, statsWith(["tones-six", "tones-hear"]), base, seeded(6));
  assert.ok(!bad.test(texts(steps)));
  assert.ok(!bad.test(L.summarise(before, after, 12)));
  assert.ok(!bad.test(L.summarise(before, before, 0)));
  assert.ok(!bad.test(L.gateSummary(after, true)));
});

test("summarise names the tone pair practised most", () => {
  const before = Drills.emptyStats();
  const after = Drills.emptyStats();
  after.tonePairs["3-6"] = { n: 10, wrong: 1 };
  after.tonePairs["1-2"] = { n: 2, wrong: 0 };
  assert.match(L.summarise(before, after, 12), /tone 3 from tone 6 9 times out of 10/);
});

test("gateSummary names the most confused pair when the gate fails", () => {
  const s = Drills.emptyStats();
  s.pairs["3>6"] = 5;
  s.pairs["2>5"] = 2;
  assert.match(L.gateSummary(s, false), /tone 3 and tone 6/);
});

test("practise gives 10 drills for the pair", () => {
  const ds = L.practise(stage0, audio, Drills.emptyStats(), 3, 6, seeded(7));
  assert.strictEqual(ds.length, 10);
  const J = require("../app/yue/jyutping.js");
  const tone = (s) => J.parse(s)[2];
  for (const d of ds) {
    assert.ok(["tone-id", "same-diff"].includes(d.type));
    const ts = (Array.isArray(d.target) ? d.target : [d.target]).map(tone);
    if (d.type === "tone-id") assert.ok(ts[0] === 3 || ts[0] === 6);
    else assert.ok(ts.every((t) => t === 3 || t === 6));
  }
});

test("sayVerdict maps say results to skip, retry, right or wrong", () => {
  const should = (r) => !!(r && r.heard && r.results.length && !r.results.some((x) => x.unsure));
  const res = (...oks) => ({ heard: true, results: oks.map((ok) => ({ ok, unsure: false })) });
  assert.strictEqual(L.sayVerdict({ skipped: true }, should), "skip");
  assert.strictEqual(L.sayVerdict({ heard: false, results: [] }, should), "retry");
  assert.strictEqual(L.sayVerdict({ heard: true, results: [{ ok: false, unsure: true }] }, should), "retry");
  assert.strictEqual(L.sayVerdict(res(true, true), should), "right");
  assert.strictEqual(L.sayVerdict(res(true, false), should), "wrong");
});

test("without a microphone the say unit is skipped and the learner is not stuck", () => {
  const all = statsWith(["tones-six", "tones-hear", "checked", "initials", "finals", "jyutping"]);
  all.gateLog = Array(40).fill(1);
  const { steps } = L.compose(stage0, all, base, seeded(8));
  assert.ok(!steps.some((s) => s.kind === "calibrate" || (s.kind === "drill" && s.drill.type === "say")));
  assert.ok(drillsOf(steps).length >= 25);
  assert.strictEqual(steps[steps.length - 1].kind, "done");
});
