// Run: node --test tests/app.test.js (after python -m jiesuo.export_app)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createCore, serialise, deserialise } = require("../app/core.js");

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "../app/data", f), "utf8"));
const data = { dict: read("dict.json"), parts: read("parts.json"), grammar: read("grammar.json") };
const order = read("order.json");
const core = createCore(data);
const unit = (form) => core.lookup.get(form);
const forms = (ids) => ids.map((i) => core.get(i).form);

// Fixed sentences for "Can I read this?"
test("segments fixed sentences into the expected words", () => {
  const seg = (s) => core.tokenise(s).filter((t) => t.han).map((t) => t.text);
  assert.deepStrictEqual(seg("我是学生。"), ["我", "是", "学生"]);
  assert.deepStrictEqual(seg("他的头发很长。"), ["他", "的", "头发", "很", "长"]);
  assert.deepStrictEqual(seg("你今天去学校吗?"), ["你", "今天", "去", "学校", "吗"]);
});

test("Traditional text resolves to the same items", () => {
  const seg = (s) => core.tokenise(s).filter((t) => t.han).map((t) => core.get(t.unit).form);
  assert.deepStrictEqual(seg("我是學生。"), ["我", "是", "学生"]);
  assert.deepStrictEqual(seg("他的頭髮很長。"), ["他", "的", "头发", "很", "长"]);
  assert.deepStrictEqual(seg("裏面"), ["里面"]);
});

test("known words count as readable and nothing else does", () => {
  const known = new Set(["我", "是"].map(unit));
  const r = core.analyse("我是学生。", known);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.readable, 2);
  assert.strictEqual(r.unknownTokens, 1);
});

test("learning set is minimal: it contains the word and its unknown prerequisites only", () => {
  const known = new Set(["我", "是"].map(unit));
  const r = core.analyse("我是学生。", known);
  const set = new Set(r.learn);
  assert.ok(set.has(unit("学生")) && set.has(unit("学")) && set.has(unit("生")));
  assert.deepStrictEqual(new Set(core.closure(unit("学生"), known)), set);
});

test("learning the whole set makes the text fully readable, in prerequisite order", () => {
  const text = "我们今天下午在图书馆学习汉语,因为明天有考试。";
  const known = new Set();
  const r = core.analyse(text, known);
  const seen = new Set();
  for (const i of r.learn) {
    for (const p of core.prereq[i]) assert.ok(seen.has(p), `${core.get(p).form} before ${core.get(i).form}`);
    seen.add(i);
  }
  const after = core.analyse(text, seen);
  assert.strictEqual(after.readable, after.total - after.outside);
  assert.strictEqual(after.ladder.length, 0);
  assert.strictEqual(r.ladder[r.ladder.length - 1].reached, r.total - r.outside);
});

test("characters outside the graph are counted, not hidden", () => {
  const r = core.analyse("我𰻝", new Set([unit("我")]));
  assert.strictEqual(r.outside, 1);
  assert.strictEqual(r.readable, 1);
});

test("empty and non-Chinese text do not break the analysis", () => {
  assert.strictEqual(core.analyse("", new Set()).total, 0);
  assert.strictEqual(core.analyse("hello, world 123", new Set()).total, 0);
});

test("spots literal grammar patterns", () => {
  const known = new Set();
  const keys = core.analyse("虽然下雨,但是我去了。", known).patterns.map((i) => core.get(i).key);
  assert.ok(!keys.includes("nothing"));
  const k2 = core.analyse("因为下雨,所以我不去。", known).patterns.map((i) => core.get(i).key);
  assert.ok(k2.includes("yinwei-suoyi"));
});

test("both orders are topological and complete", () => {
  for (const name of ["unlock", "hsk"]) {
    const pos = new Map(order[name].map((u, i) => [u, i]));
    assert.strictEqual(pos.size, order[name].length);
    assert.strictEqual(pos.size, core.prereq.length, name);
    core.prereq.forEach((ps, u) => ps.forEach((p) => assert.ok(pos.get(p) < pos.get(u), `${name}: ${core.get(p).form} ${core.get(u).form}`)));
  }
});

test("the first ten next items have prerequisites known or earlier in the list", () => {
  for (const name of ["unlock", "hsk"]) {
    const list = core.next(order[name], new Set(), 10);
    assert.strictEqual(list.length, 10);
    const seen = new Set();
    for (const i of list) {
      core.prereq[i].forEach((p) => assert.ok(seen.has(p)));
      seen.add(i);
    }
  }
});

test("next shows at most three grammar patterns when a backlog builds up", () => {
  const known = new Set(core.items.filter((it) => read("hsk.json").bands[it.i] === 1).flatMap((it) => core.closure(it.i)));
  const list = core.next(order.hsk, known, 10);
  assert.strictEqual(list.length, 10);
  assert.ok(list.filter((i) => i >= core.n).length <= 3);
});

test("frontier holds items whose prerequisites are all known", () => {
  const known = new Set(core.closure(unit("学")));
  const fr = new Set(core.frontier(order.unlock, known));
  assert.ok(!fr.has(unit("学")));
  assert.ok(!fr.has(unit("学生")), "生 is not known yet");
  core.closure(unit("生")).forEach((i) => known.add(i));
  assert.ok(new Set(core.frontier(order.unlock, known)).has(unit("学生")));
});

test("HSK focus finishes band 1 words before band 2 words", () => {
  const bands = read("hsk.json").bands;
  assert.ok(bands.filter((b) => b === 2).length > 700, "band 2 must not be truncated");
  const seq = order.hsk.filter((i) => i < core.n && core.get(i).kind === "w");
  const lastOne = Math.max(...seq.map((u, k) => (bands[u] === 1 ? k : -1)));
  const firstTwo = seq.findIndex((u) => bands[u] === 2);
  assert.ok(lastOne < firstTwo);
});

test("Read keeps the Traditional form the person typed (regression: 髮 was shown as 發)", () => {
  const shown = (text, script) => core.tokenise(text).filter((t) => t.han).map((t) => core.shownForm(t, script).text).join("");
  assert.strictEqual(shown("我剪了髮。", "t").includes("髮"), true);
  assert.strictEqual(shown("頭髮", "t"), "頭髮");
  assert.strictEqual(shown("頭髮", "s"), "头发");
  assert.strictEqual(shown("头发", "t"), "頭髮");
});

test("a lone Simplified character with several Traditional forms lists the others", () => {
  const t = core.tokenise("发").find((x) => x.han);
  const r = core.shownForm(t, "t");
  assert.strictEqual(r.text, "發");
  assert.ok(r.alternatives.includes("髮"));
  const le = core.tokenise("了").find((x) => x.han);
  assert.deepStrictEqual(core.shownForm(le, "t").alternatives, [], "了 is not flagged");
});

test("Traditional display uses the Hong Kong form and leaves shared glyphs alone", () => {
  assert.strictEqual(core.get(unit("后")).hk, "後");
  assert.strictEqual(core.get(unit("才")).hk, "");
  assert.strictEqual(core.get(unit("学生")).hk, "學生");
});

test("progress survives export and import", () => {
  const known = new Set([unit("学生"), core.patterns[0].i]);
  const state = { known, tradSeen: new Set([unit("学生")]), script: "t", focus: "hsk" };
  const back = deserialise(JSON.parse(JSON.stringify(serialise(state, core))), core);
  assert.deepStrictEqual([...back.known].sort(), [...known].sort());
  assert.strictEqual(back.script, "t");
  assert.strictEqual(back.focus, "hsk");
  assert.strictEqual(back.skipped, 0);
});

test("import rejects a file that is not progress, and skips unknown IDs", () => {
  assert.throws(() => deserialise({ hello: 1 }, core));
  assert.strictEqual(deserialise({ app: "jiesuo", known: ["w:不存在"] }, core).skipped, 1);
});

test("data stays under the size target", () => {
  const dir = path.join(__dirname, "../app/data");
  const total = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  assert.ok(total < 5e6, `${total} bytes`);
});

// ---- Journey: spaced review, new items, the unlock sentence, milestones, progress v2
const J = require("../app/journey.js");

test("review schedule: Leitner boxes 1, 2, 4, 8, 16, 32 days; a miss goes back to box 1", () => {
  const d = "2026-11-13";
  assert.deepStrictEqual(J.schedule(undefined, true, d), [1, "2026-11-14"]);
  assert.deepStrictEqual(J.schedule([3, d], true, d), [4, "2026-11-21"]);
  assert.deepStrictEqual(J.schedule([5, d], false, d), [1, "2026-11-14"]);
  assert.deepStrictEqual(J.schedule([6, d], true, d), [6, "2026-12-15"]);
  assert.strictEqual(J.addDays("2026-12-31", 1), "2027-01-01");
  assert.strictEqual(J.daysBetween("2026-11-13", "2026-11-20"), 7);
});

test("due reviews: overdue first, then lower boxes, capped", () => {
  const r = new Map([[1, [3, "2026-11-10"]], [2, [1, "2026-11-13"]], [3, [2, "2026-11-13"]], [4, [1, "2026-11-14"]]]);
  assert.deepStrictEqual(J.dueReviews(r, "2026-11-13"), [1, 2, 3]);
  assert.deepStrictEqual(J.dueReviews(r, "2026-11-13", 2), [1, 2]);
});

test("new items for a lesson are unknown, in order, and never grammar", () => {
  const known = new Set(order.unlock.slice(0, 40));
  const picked = J.pickNew(core, order.unlock, known, 3);
  assert.strictEqual(picked.length, 3);
  assert.ok(picked.every((i) => !known.has(i) && i < core.n));
  assert.deepStrictEqual(picked, order.unlock.filter((i) => !known.has(i) && i < core.n).slice(0, 3));
});

test("unlock sentence: the shortest one newly readable in full, or none", () => {
  const rows = [["9", "我是学生，我很好。", 0, "x", [], "a", 0, 0], ["1", "我是学生。", 0, "I am a student.", [], "a", 0, 0], ["2", "你好。", 0, "Hello.", [], "b", 0, 0]];
  const before = new Set(["我", "是", "学", "生", "很", "好"].flatMap((f) => core.closure(unit(f), new Set())));
  const after = new Set([...before, ...core.closure(unit("学生"), before)]);
  assert.strictEqual(J.unlockSentence(core, rows, before, after)[0], "1");
  assert.strictEqual(J.unlockSentence(core, rows, before, before), null);
});

test("milestones: reached ones marked, the next one says how far", () => {
  const m = J.milestones({ chars: 7, words: 3, written: 1, unlocked: 0, days: 2, coverage: 0.1, hsk1Done: false });
  const byKey = Object.fromEntries(m.map((x) => [x.key, x]));
  assert.ok(byKey["first-char"].reached && byKey["first-write"].reached);
  assert.ok(!byKey["chars-10"].reached);
  assert.strictEqual(byKey["chars-10"].hint, "3 more characters");
  assert.strictEqual(byKey["days-7"].hint, "5 more days of learning");
});

test("progress v2 keeps reviews, days, milestones, stats and an open lesson", () => {
  const state = {
    known: new Set([unit("学生")]), tradSeen: new Set(), script: "s", focus: "unlock",
    review: new Map([[unit("学生"), [2, "2026-11-15"]]]), days: new Set(["2026-11-12", "2026-11-13"]),
    milestones: { "first-char": "2026-11-12" }, stats: { written: 4, unlocked: 1 },
    lesson: { day: "2026-11-13", items: [unit("学生")], reviews: [], added: [unit("学生")], step: 2, before: { coverage: 0.1 } },
  };
  const file = JSON.parse(JSON.stringify(serialise(state, core)));
  assert.strictEqual(file.version, 2);
  const back = deserialise(file, core);
  assert.deepStrictEqual([...back.review], [...state.review]);
  assert.deepStrictEqual([...back.days].sort(), [...state.days].sort());
  assert.deepStrictEqual(back.milestones, state.milestones);
  assert.deepStrictEqual(back.stats, state.stats);
  assert.deepStrictEqual(back.lesson, state.lesson);
});

test("a version 1 progress file still imports, with empty journey state", () => {
  const back = deserialise({ app: "jiesuo", version: 1, known: ["w:学生"] }, core);
  assert.strictEqual(back.review.size, 0);
  assert.strictEqual(back.days.size, 0);
  assert.deepStrictEqual(back.stats, { written: 0, unlocked: 0 });
  assert.strictEqual(back.lesson, null);
});

// ---- Search, Pleco-style: characters, pinyin with or without tones, or English
const top = (q, k = 5) => core.search(q, 50).slice(0, k).map((i) => core.get(i).form);

test("search by characters: exact first, then words containing it", () => {
  assert.strictEqual(top("好")[0], "好");
  assert.ok(core.search("好", 50).map((i) => core.get(i).form).includes("你好"));
  assert.strictEqual(top("學生")[0], "学生");
});

test("search by pinyin: plain, numbered, tone marks and spaces all work", () => {
  for (const q of ["nihao", "ni3hao3", "ni3hao", "nǐ hǎo", "NI HAO"]) assert.strictEqual(top(q)[0], "你好", q);
  assert.strictEqual(top("zhongguo")[0], "中国");
});

test("pinyin tone numbers narrow the match, and any reading counts", () => {
  const hao3 = core.search("hao3", 50).map((i) => core.get(i).form);
  assert.ok(hao3.includes("好"));
  assert.ok(!hao3.includes("号"));
  assert.ok(core.search("hao4", 50).map((i) => core.get(i).form).includes("好"));
});

test("ü can be typed as v or u:", () => {
  assert.ok(core.search("lv4", 50).map((i) => core.get(i).form).includes("绿"));
  assert.ok(core.search("nu:3", 50).map((i) => core.get(i).form).includes("女"));
});

test("search by English matches whole words, best senses first", () => {
  assert.ok(top("student").includes("学生"));
  assert.ok(top("hello").includes("你好"));
  assert.ok(!core.search("he", 50).map((i) => core.get(i).form).includes("你好"));
  assert.ok(core.search("hand", 50).map((i) => core.get(i).form).includes("扌"));
});

test("empty or symbol-only search returns nothing, and grammar is left out", () => {
  assert.deepStrictEqual(core.search(""), []);
  assert.deepStrictEqual(core.search("   "), []);
  assert.deepStrictEqual(core.search("!?"), []);
  assert.ok(core.search("le", 50).every((i) => i < core.n));
});

test("a lesson with no new items asked for picks none", () => {
  assert.deepStrictEqual(J.pickNew(core, order.unlock, new Set(), 0), []);
});

// ---- Focus map: what an item is made of and what it unlocks
test("focus map: 他 is made of 也 and 亻 and unlocks words, ready ones first", () => {
  const known = new Set(["也", "人"].flatMap((f) => core.closure(unit(f), new Set())));
  const info = J.focusInfo(core, unit("他"), known);
  const parts = Object.fromEntries(info.parts.map((p) => [core.get(p.u).form, p.state]));
  assert.strictEqual(parts["也"], "known");
  assert.ok("亻" in parts && parts["亻"] !== "known");
  const byForm = Object.fromEntries(info.unlocks.map((x) => [core.get(x.u).form, x]));
  assert.ok(byForm["他人"].ready, "他人 needs only 他 and 人");
  assert.deepStrictEqual(byForm["他们"].missing.map((u) => core.get(u).form), ["们"]);
  const firstNotReady = info.unlocks.findIndex((x) => !x.ready);
  assert.ok(info.unlocks.slice(firstNotReady).every((x) => !x.ready), "ready ones come first");
  assert.strictEqual(info.readyCount, info.unlocks.filter((x) => x.ready).length);
  assert.strictEqual(info.state, "locked");
  assert.deepStrictEqual(info.needs.map((u) => core.get(u).form), ["亻"]);
});

test("focus map: a word is made of its characters, and states follow what is known", () => {
  const known = new Set(core.closure(unit("学"), new Set()));
  const info = J.focusInfo(core, unit("学生"), known);
  assert.deepStrictEqual(info.parts.map((p) => core.get(p.u).form).sort(), ["学", "生"].sort());
  assert.strictEqual(info.parts.find((p) => core.get(p.u).form === "学").state, "known");
  const all = new Set(core.closure(unit("学生"), new Set()));
  assert.strictEqual(J.focusInfo(core, unit("学生"), all).state, "known");
  assert.strictEqual(J.focusInfo(core, unit("学生"), new Set([...all].filter((u) => u !== unit("学生")))).state, "ready");
});
