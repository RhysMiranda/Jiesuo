// Run: node --test tests/yue_course.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../app/yue/course.js");
const State = require("../app/yue/state.js");
const Drills = require("../app/yue/drills.js");
const JyutLex = require("../app/yue/lexicon.js");

const data = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "../app/yue/data", f), "utf8"));
const course = data("course.json");
const lex = JyutLex.create({ lexicon: data("lexicon.json"), course, wordshk: data("wordshk.json"), sentences: data("sentences.json"), hkcancor: data("hkcancor.json") });
const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const T = "2026-11-17";
const ctx = (extra) => Object.assign({ course, lex, words: {}, today: T, rng: rngOf(7) }, extra);

test("a v1 file loads with words {} and keeps its stats", () => {
  const s = State.emptyState();
  s.stats = Drills.record(s.stats, { unit: "tones-six", type: "tone-id", target: "si1", options: [1, 6] }, { verdict: "wrong", answer: 6 }, "2026-11-14");
  s.days = ["2026-11-14"];
  const v1 = Object.assign({ lang: "yue", v: 1 }, JSON.parse(JSON.stringify(s)));
  delete v1.words;
  const back = State.deserialise(v1);
  assert.deepStrictEqual(back.words, {});
  assert.deepStrictEqual(back.stats, s.stats);
  assert.deepStrictEqual(back.days, ["2026-11-14"]);
  assert.strictEqual(State.serialise(back).v, 2);
  assert.deepStrictEqual(State.load(JSON.stringify(v1)), { state: back, fresh: false });
});

test("v2 words round-trip and corrupt entries are bad-file", () => {
  const s = State.emptyState();
  s.words = { "你好": { h: [2, "2026-11-19"], seen: "2026-11-17" }, "g:zo2": { h: [1, "2026-11-18"], seen: "2026-11-17" } };
  assert.deepStrictEqual(State.deserialise(JSON.parse(JSON.stringify(State.serialise(s)))), s);
  const mk = (w) => ({ lang: "yue", v: 2, words: w });
  for (const w of [
    { "你好": { h: [9, "x"] } },
    { "你好": { h: [9, "2026-11-19"], seen: "2026-11-17" } },
    { "你好": { h: [0, "2026-11-19"], seen: "2026-11-17" } },
    { "你好": { h: [1.5, "2026-11-19"], seen: "2026-11-17" } },
    { "你好": { h: [1, "tomorrow"], seen: "2026-11-17" } },
    { "你好": { h: [1, "2026-11-19"], seen: 5 } },
    { "你好": { h: [1, "2026-11-19"] } },
    { "你好": 3 }, [], "x",
  ]) assert.throws(() => State.deserialise(mk(w)), { message: "bad-file" });
  assert.strictEqual(State.load(JSON.stringify(mk({ "你好": { h: [9, "x"] } }))).fresh, true);
});

test("wordsUnlocked", () => {
  const s = State.emptyState();
  assert.strictEqual(C.wordsUnlocked(s, Drills), false);
  s.gate = { offered: true, result: { right: 10, count: 40, passed: false, day: T }, movedOn: false };
  assert.strictEqual(C.wordsUnlocked(s, Drills), false);
  s.gate.movedOn = true;
  assert.strictEqual(C.wordsUnlocked(s, Drills), true);
  s.gate = { result: { passed: true } };
  assert.strictEqual(C.wordsUnlocked(s, Drills), true);
  s.gate = null; s.stats.gateLog = new Array(40).fill(1);
  assert.strictEqual(C.wordsUnlocked(s, Drills), true);
});

test("nextNew takes the start of the order and never an unchecked item", () => {
  assert.deepStrictEqual(C.nextNew(course, {}, 4), course.order.slice(0, 4));
  assert.deepStrictEqual(C.nextNew(course, { [course.order[0]]: {} }, 2), course.order.slice(1, 3));
  const c2 = Object.assign({}, course, { unchecked: [course.order[1]] });
  assert.ok(!C.nextNew(c2, {}, 4).includes(course.order[1]));
});

test("planDay on a fresh state: 4 new items, meet-hear-read-type, no reviews", () => {
  const { steps } = C.planDay(ctx());
  const body = steps.filter((s) => s.type !== "sentence");
  assert.deepStrictEqual(body.map((s) => s.type), Array.from({ length: 4 }, () => ["meet", "hear", "read", "type"]).flat());
  assert.deepStrictEqual([...new Set(body.map((s) => s.item))], course.order.slice(0, 4));
  assert.ok(steps.length <= 17);
  const last = steps[steps.length - 1];
  if (last.type === "sentence") assert.ok(lex.example(last.id));
  assert.deepStrictEqual(C.planDay(ctx()).steps, steps, "deterministic given rng");
});

test("planDay with grammar: meet lists examples, hear uses an example with English", () => {
  const gi = course.order.indexOf("g:zo2");
  const words = {};
  for (const it of course.order.slice(0, gi)) words[it] = { h: [1, "2099-01-01"], seen: "2026-11-01" };
  const { steps } = C.planDay(ctx({ words, newCount: 1 }));
  const g = steps.filter((s) => s.item === "g:zo2");
  assert.strictEqual(g[0].type, "meet");
  assert.strictEqual(g[0].examples.length, course.grammar.zo2.examples.length);
  if (g[1]) { assert.strictEqual(g[1].type, "hear"); assert.ok(g[1].answer && g[1].options.includes(g[1].answer)); }
});

test("due reviews appear, no two review steps of one item are adjacent, total <= 40", () => {
  const words = {};
  course.order.slice(0, 30).forEach((it) => {
    if (it.startsWith("g:")) return;
    words[it] = { h: [1, "2026-11-10"], r: [1, "2026-11-12"], t: [2, "2026-11-16"], seen: "2026-11-09" };
  });
  const due = C.due(words, T, 20);
  assert.strictEqual(due.length, 20);
  assert.ok(due.every((d) => C.SKILLS.includes(d.skill) && d.item in words));
  const { steps } = C.planDay(ctx({ words }));
  assert.ok(steps.length <= 40);
  const rev = steps.filter((s) => s.item in words && s.type !== "sentence");
  assert.ok(rev.length >= 15);
  for (let i = 1; i < rev.length; i++) assert.notStrictEqual(rev[i].item, rev[i - 1].item);
  const big = C.planDay(ctx({ words, newCount: 20, reviewLimit: 50 }));
  assert.ok(big.steps.length <= 40);
});

test("due only returns entries on or before today", () => {
  const words = { "你好": { h: [1, "2026-11-18"], r: [1, T], seen: T } };
  assert.deepStrictEqual(C.due(words, T, 5), [{ item: "你好", skill: "r" }]);
});

test("type check: tones required", () => {
  const step = C.exercises.type(ctx(), "你好");
  assert.strictEqual(step.answer, "nei5 hou2");
  assert.ok(C.checkTyped(step, "nei5hou2"));
  assert.ok(C.checkTyped(step, "nei5 hou2"));
  assert.ok(C.checkTyped(step, "Nei5 Hou2"));
  assert.ok(!C.checkTyped(step, "nei5hou3"));
  assert.ok(!C.checkTyped(step, "neihou"));
  assert.ok(!C.checkTyped(step, "???"));
  assert.strictEqual(step.options.length, 4);
  assert.ok(step.options.includes("你好"));
});

test("distractors never include the answer or a same-meaning item", () => {
  const words = { "我": { h: [1, T], seen: T } };
  for (const item of course.order.slice(0, 60).filter((x) => !x.startsWith("g:"))) {
    const en = C.meaning(course, lex, item);
    for (const kind of ["hear", "read", "type"]) {
      const st = C.exercises[kind](ctx({ words }), item);
      assert.strictEqual(st.options.length, 4, item + kind);
      assert.strictEqual(new Set(st.options).size, 4);
      assert.strictEqual(st.skill, { hear: "h", read: "r", type: "t" }[kind]);
      if (kind !== "type") {
        assert.strictEqual(st.answer, en);
        assert.strictEqual(st.options.filter((o) => o === en).length, 1);
      } else {
        assert.ok(st.options.includes(item));
        for (const o of st.options) if (o !== item) assert.notStrictEqual(C.meaning(course, lex, o), en);
      }
    }
  }
});

test("record: wrong gives box 1 due tomorrow, right climbs, input untouched", () => {
  const w0 = { "你好": { h: [3, "2026-11-20"], seen: "2026-11-10" } };
  const w1 = C.record(w0, "你好", "h", false, T);
  assert.deepStrictEqual(w1["你好"].h, [1, "2026-11-18"]);
  assert.strictEqual(w1["你好"].seen, T);
  assert.deepStrictEqual(w0["你好"].h, [3, "2026-11-20"]);
  const w2 = C.record(w1, "你好", "r", true, T);
  assert.deepStrictEqual(w2["你好"].r, [1, "2026-11-18"]);
  assert.deepStrictEqual(C.record(w2, "你好", "h", true, "2026-11-18")["你好"].h, [2, "2026-11-20"]);
});
