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
const wordshk = { entries: { "食": [11, "to eat", "def"], "緊": [12, "in the middle of", "d2"] }, examples: { "9": ["你好", "nei5 hou2", "hello"] } };
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
  assert.strictEqual(L.search("to eat")[0].en, "eat");  // words.hk text is still searchable
  assert.deepStrictEqual(L.search("😂"), []);
  assert.deepStrictEqual(L.search(null), []);
});

test("word and example", () => {
  assert.strictEqual(L.word("食").en, "eat");  // the cleaned lexicon meaning wins
  assert.strictEqual(L.word("食").whkEn, "to eat");
  assert.strictEqual(L.word("緊").en, "in the middle of");  // only words.hk has one
  assert.strictEqual(L.word("緊").whkEn, "in the middle of");
  assert.strictEqual(L.word("你").whkEn, null);
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

// ---- Task 10: Type screen helpers
const L2 = JyutLex.create({
  lexicon: { words: [["慶呀", "hing3 aa3", "celebrating", 1, 0], ["顯家", "hin2 gaa1", "shows", 2, 0], ["你好", "nei5 hou2", "hello", 3, 0], ["你", "nei5", "you", 4, 0], ["好", "hou2", "good", 5, 0], ["浩", "hou6", "vast", 6, 0]], alts: {}, chars: {} },
  course: {}, wordshk: {}, sentences: {}, hkcancor: {},
});

test("candidates consider every split of toneless input", () => {
  assert.deepStrictEqual(L2.normalise("hingaa").syls.map((x) => x.base), ["hing", "aa"]); // longest-first split, unchanged
  assert.ok(L2.candidates("hingaa").some((c) => c.form === "慶呀"), "hing + aa is another valid split");
  assert.ok(L2.candidates("hingaa").some((c) => c.form === "顯家"), "hin + gaa is the other split");
  assert.ok(!L2.candidates("hingwo").some((c) => c.form === "顯家"));
  assert.ok(L2.candidates("hingaa", 9).length <= 9);
  assert.ok(Array.isArray(L2.candidates("a".repeat(40)))); // a long ambiguous string stays bounded and never throws
});

test("tones 7, 8 and 9 map to 1, 3 and 6 (also on open syllables: lenient)", () => {
  assert.deepStrictEqual([7, 8, 9].map((t) => L.normalise("sik" + t).syls[0].tone), [1, 3, 6]);
  assert.deepStrictEqual([7, 8, 9].map((t) => L.normalise("nei" + t).syls[0].tone), [1, 3, 6]);
  assert.ok(L2.candidates("hou9").some((c) => c.jp === "hou6"));
});

test("ime candidates: whole word first, then longer, then shorter words that start the input", () => {
  const forms = L2.candidates("neihou", 9, { ime: true }).map((c) => c.form);
  assert.deepStrictEqual(forms.slice(0, 2), ["你好", "你"]);
  assert.ok(!L2.candidates("neihou", 9).some((c) => c.form === "你"), "shorter words only in ime mode");
});

test("consume takes a picked word's syllables off the input", () => {
  assert.deepStrictEqual(L2.consume("neihou", "你"), { rest: "hou", used: "nei" });
  assert.deepStrictEqual(L2.consume("nei5hou2", "你"), { rest: "hou2", used: "nei5" });
  assert.deepStrictEqual(L2.consume("neihou", "你好"), { rest: "", used: "neihou" });
  assert.strictEqual(L2.consume("neihou", "好"), null);
  assert.strictEqual(L2.consume("xyz", "你"), null);
});

test("scoreTyping marks wrong tones and wrong syllables", () => {
  const S = JyutLex.scoreTyping;
  assert.deepStrictEqual(S("nei5 hou2", "nei5hou3"), { ok: false, wrongTones: [1], wrongSyls: [] });
  assert.deepStrictEqual(S("nei5 hou2", "lei5hou2"), { ok: false, wrongTones: [], wrongSyls: [0] });
  assert.deepStrictEqual(S("nei5 hou2", "  NEI5   Hou2 "), { ok: true, wrongTones: [], wrongSyls: [] });
  assert.deepStrictEqual(S("nei5 hou2", "nei5 hou2"), { ok: true, wrongTones: [], wrongSyls: [] });
  assert.strictEqual(S("nei5 hou2", "nei5").ok, false);
  assert.deepStrictEqual(S("nei5 hou2", "nei5").wrongSyls, [1]);
  assert.strictEqual(S("nei5 hou2", "xyz").ok, false);
  assert.strictEqual(S("nei5 hou2", null).ok, false);
});
