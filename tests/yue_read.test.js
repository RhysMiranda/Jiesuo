const test = require("node:test");
const assert = require("node:assert");
const JyutLex = require("../app/yue/lexicon.js");

const lexicon = {
  words: [
    ["你", "nei5", "you", 1, 0, "a"], ["食", "sik6", "eat", 2, 0, "c"], ["飯", "faan6", "rice", 3, 0, "w"],
    ["未", "mei6", "not yet", 4, 0, "o"], ["呀", "aa3", "", 5, 0], ["我哋", "ngo5 dei6", "we", 6, 0, "a"],
    ["咗", "zo2", "", 0, 0, "a"], ["怪", "gwaai3", "odd", 8, 4, "w"],
  ],
  alts: {}, chars: { "𠮶": ["gwo2"] },
};
const L = JyutLex.create({ lexicon, course: {}, wordshk: {}, sentences: {}, hkcancor: {} });
const seg = (t) => L.segment(t);

test("readReport counts Han tokens, known ones and orders learnNext by rank", () => {
  const r = L.readReport(seg("你食飯未呀 bot 😂"), { 你: { seen: "d" }, 食: { seen: "d" } });
  assert.strictEqual(r.total, 5);
  assert.strictEqual(r.known, 2);
  assert.deepStrictEqual(r.learnNext, ["飯", "未", "呀"]);
});

test("readReport leaves out seen words, unchecked words and characters with no entry; at most 5, unranked last", () => {
  const r = L.readReport(seg("你食飯未呀我哋咗怪𠮶𠮶"), { 食: { seen: "d" } });
  assert.strictEqual(r.total, 10);
  assert.strictEqual(r.known, 1);
  assert.deepStrictEqual(r.learnNext, ["你", "飯", "未", "呀", "我哋"]);
  assert.ok(!r.learnNext.includes("怪") && !r.learnNext.includes("𠮶"));
  assert.deepStrictEqual(L.readReport(seg("咗"), {}).learnNext, ["咗"]);
});

test("readReport counts repeats once in learnNext and never throws", () => {
  assert.deepStrictEqual(L.readReport(seg("飯飯飯"), {}).learnNext, ["飯"]);
  assert.deepStrictEqual(L.readReport(seg("hello 😂"), {}), { known: 0, total: 0, learnNext: [] });
  assert.deepStrictEqual(L.readReport(null, null), { known: 0, total: 0, learnNext: [] });
});

test("word() carries the reading status code as a name", () => {
  assert.strictEqual(L.word("你").status, "agree");
  assert.strictEqual(L.word("食").status, "corpus");
  assert.strictEqual(L.word("飯").status, "wordshk");
  assert.strictEqual(L.word("未").status, "override");
  assert.strictEqual(L.word("呀").status, null);
});

test("examplesFor finds sentences containing the word, own words.hk examples first", () => {
  const lx = JyutLex.create({
    lexicon: { words: [["食", "sik6", "eat", 1, 0, "a"]], alts: { 食: ["sik9"] }, chars: {} },
    wordshk: { entries: { 食: [11, "to eat", "d"] }, examples: { "wordshk:11#1": ["食飯", "sik6 faan6", "eat"], "wordshk:12#1": ["我食", "ngo5 sik6", "I eat"] } },
    sentences: { items: { "tatoeba:1": ["你食咗未", "nei5 sik6 zo2 mei6", "Have you eaten?", "a", "b", 2], "tatoeba:2": ["食物", "sik9 mat6", "food", "a", "b", 3] } },
    hkcancor: { items: { "hkcancor:f#1": ["食", "sik6", null], "hkcancor:f#2": ["去", "heoi3", null] } },
  });
  assert.deepStrictEqual(lx.examplesFor("食", 3), ["wordshk:11#1", "tatoeba:1", "wordshk:12#1"]);
  assert.deepStrictEqual(lx.examplesFor("食", 1), ["wordshk:11#1"]);
  assert.deepStrictEqual(lx.examplesFor("鬼", 3), []);
  assert.deepStrictEqual(lx.word("食").alts, ["sik9"]);
  assert.ok(!lx.examplesFor("食", 9).includes("tatoeba:2")); // there 食 is read sik9: not this word's reading
});

test("a sentence that has the form as part of another word is not its example; a character guess is marked", () => {
  const lx = JyutLex.create({
    lexicon: { words: [["你呢", "nei5 ne1", "and you?", 1, 0, "o"], ["你", "nei5", "you", 2, 0, "a"]], alts: {}, labels: { 你呢: { "nei5 ni1": "x" } }, chars: { 排: ["paai4"] } },
    wordshk: { entries: {}, examples: { "wordshk:1#1": ["你呢排點呀", "nei5 ni1 paai2 dim2 aa3", "How are you lately?"], "wordshk:2#1": ["我住喺旺角。你呢？", "ngo5 zyu6 hai2 wong6 gok3 nei5 ne1", "And you?"] } },
  });
  assert.deepStrictEqual(lx.examplesFor("你呢", 3), ["wordshk:2#1"]);
  assert.deepStrictEqual(lx.word("你呢").labels, { "nei5 ni1": "x" });
  const seg = lx.segment("排");
  assert.ok(seg[0].guess && seg[0].jp === "paai4");
  assert.ok(!lx.segment("你").some((s) => s.guess));
});
