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
