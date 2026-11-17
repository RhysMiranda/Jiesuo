const test = require("node:test");
const assert = require("node:assert");
const JyutLex = require("../app/yue/lexicon.js");

const lexicon = {
  words: [
    ["你好", "nei5 hou2", "hello", 1, 0], ["你", "nei5", "you", 2, 0], ["好", "hou2", "good", 3, 0],
    ["我哋", "ngo5 dei6", "we, us", 4, 0], ["佢", "keoi5", "he, she", 5, 0], ["緊", "gan2", "", 6, 0], ["食", "sik6", "eat", 7, 0],
    ["名", "meng2", "name", 8, 1],
  ],
  alts: {}, chars: { "𠮶": ["gwo2"], "我": ["ngo5"] },
};
const wordshk = { entries: { "食": [11, "to eat", "def"] }, examples: { "9": ["你好", "nei5 hou2", "hello"] } };
const sentences = { items: { "5": ["你好", "nei5 hou2", "Hi", "au", "enau", 77] } };
const hkcancor = { items: { "f#1": ["我食", "ngo5 sik6", null] } };
const L = JyutLex.create({ lexicon, course: {}, wordshk, sentences, hkcancor });
const sylsOf = (s) => L.normalise(s).syls.map((x) => x.base);

test("normalise loose input", () => {
  for (const s of ["NeiHou", "nei5 hou2", "nei hou", "nei'hou"]) assert.deepStrictEqual(sylsOf(s), ["nei", "hou"]);
  assert.strictEqual(L.normalise("sik9").syls[0].tone, 6);
  assert.strictEqual(L.normalise("sik7").syls[0].tone, 1);
  assert.strictEqual(L.normalise("xyz"), null);
  for (const bad of [null, undefined, "", "😂", 5, "1", "好"]) assert.strictEqual(L.normalise(bad), null);
});

test("candidates", () => {
  assert.strictEqual(L.candidates("neihou")[0].form, "你好");
  assert.ok(L.candidates("nei5").some((c) => c.form === "你"));
  assert.ok(!L.candidates("nei1").some((c) => c.form === "你"));
  assert.strictEqual(L.candidates("nei")[0].form, "你");
  assert.deepStrictEqual(L.candidates("xyz"), []);
  assert.deepStrictEqual(L.candidates(null), []);
});

test("segment never throws and rejoins", () => {
  const t = "佢 feed 緊😂 abc";
  const seg = L.segment(t);
  assert.strictEqual(seg.map((x) => x.t).join(""), t);
  assert.deepStrictEqual(seg.slice(0, 3).map((x) => x.kind), ["han", "other", "han"]);
  assert.strictEqual(seg[1].t, " feed ");
  assert.ok(seg.slice(3).every((x) => x.kind === "other"));
  assert.strictEqual(L.segment("你好")[0].word.form, "你好");
  for (const bad of [null, undefined, "", 5, "😂😂", "a好b𠮶"]) assert.doesNotThrow(() => L.segment(bad));
  const u = L.segment("𠮶");
  assert.strictEqual(u[0].word, null);
  assert.strictEqual(u[0].jp, "gwo2");
  assert.strictEqual(L.segment("龍")[0].jp, null);
});

test("search", () => {
  assert.ok(L.search("we").some((r) => r.form === "我哋"));
  assert.ok(L.search("ngo dei").some((r) => r.form === "我哋"));
  const f = L.search("好").map((r) => r.form);
  assert.ok(f.includes("好") && f.includes("你好"));
  assert.ok(L.search("EAT").some((r) => r.form === "食"));
  assert.strictEqual(L.search("to eat")[0].en, "to eat");
  assert.deepStrictEqual(L.search("😂"), []);
  assert.deepStrictEqual(L.search(null), []);
});

test("word and example", () => {
  assert.strictEqual(L.word("食").en, "to eat");
  assert.strictEqual(L.word("食").wordshk.id, 11);
  assert.strictEqual(L.word("你").en, "you");
  assert.strictEqual(L.word("名").changed, true);
  assert.strictEqual(L.word("nope"), null);
  assert.strictEqual(L.word(null), null);
  assert.strictEqual(L.word("__proto__"), null);
  assert.strictEqual(L.example("5").source, "tatoeba");
  assert.strictEqual(L.example("5").enAuthor, "enau");
  assert.strictEqual(L.example("f#1").source, "hkcancor");
  assert.strictEqual(L.example("9").source, "wordshk");
  assert.strictEqual(L.example("zz"), null);
});
