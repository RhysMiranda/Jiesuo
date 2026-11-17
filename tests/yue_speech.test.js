"use strict";
const test = require("node:test");
const assert = require("node:assert");
const A = require("../app/yue/audio.js");
const L = require("../app/yue/lexicon.js");
const SP = require("../app/yue/speech.js");

const lexicon = {
  words: [
    ["你好", "nei5 hou2", "hello", 1, 0],
    ["個名", "go3 meng2", "the name", 2, 1],   // changed tone
    ["你", "nei5", "you", 5, 0],
    ["好", "hou2", "good", 3, 0],
    ["食", "sik6", "eat", 4, 2],               // alt reading
  ],
  chars: { 你: ["nei5"], 好: ["hou2", "hou3"], 個: ["go3"], 名: ["meng4", "meng2"], 食: ["sik6"] },
};
const data = { lexicon, sentences: { items: { 7: ["你好", "nei5 hou2", "Hello", "a", "b", 1] } } };
const lex = L.create(data);
const audioJson = { voices: [{ id: "v" }], clips: { nei5: [0], hou2: [0], go3: [0], meng2: [0] } };
A.init(audioJson);
const hk = { voices: () => [{ lang: "zh-HK" }], speak: async () => "played" };
const noVoice = { voices: () => [{ lang: "en-US" }], speak: async () => "played" };
const mk = (o) => SP.create(Object.assign({ audio: A, lex, lexData: data, synth: hk, speechJson: { clips: {} } }, o));

test("a clip wins, and slow falls back to the normal clip", () => {
  const s = mk({ speechJson: { clips: { a1: { f: "你好", r: "0%", v: "x" }, a2: { f: "你好", r: "-25%", v: "x" }, b1: { f: "好", r: "0%", v: "x" } } } });
  assert.deepStrictEqual(s.source("你好"), { kind: "clip", url: "audio/speech/a1.mp3" });
  assert.deepStrictEqual(s.source("你好", { slow: true }), { kind: "clip", url: "audio/speech/a2.mp3" });
  assert.deepStrictEqual(s.source("好", { slow: true }), { kind: "clip", url: "audio/speech/b1.mp3" });
});

test("changed tone never uses the device voice", () => {
  assert.deepStrictEqual(mk().source("個名"), { kind: "syllables", syls: ["go3", "meng2"], voice: 0 });
});

test("a safe one-reading word uses the device voice", () => {
  assert.deepStrictEqual(mk().source("你"), { kind: "device" });
});

test("a word with several character readings or an alt reading is not safe", () => {
  assert.notStrictEqual(mk().source("好").kind, "device");
  assert.notStrictEqual(mk().source("食").kind, "device");
});

test("sentences are never device voice", () => {
  const k = mk().source("7").kind;
  assert.ok(k === "syllables" || k === "none");
});

test("without a zh-HK voice the syllables play", () => {
  assert.strictEqual(mk({ synth: noVoice }).source("你好").kind, "syllables");
});

test("a missing syllable recording gives none", () => {
  A.init({ voices: [{ id: "v" }], clips: { nei5: [0] } });
  assert.deepStrictEqual(mk({ synth: noVoice }).source("你好"), { kind: "none" });
  A.init(audioJson);
});

test("play on none resolves none; unknown input and bad speechJson never throw", async () => {
  A.init({ voices: [], clips: {} });
  const s = mk({ synth: noVoice, speechJson: "garbage" });
  assert.strictEqual(await s.play("你好"), "none");
  assert.strictEqual(await s.play("zzz"), "none");
  assert.strictEqual(await s.play(null), "none");
  A.init(audioJson);
});

test("play uses the device voice when safe", async () => {
  let said = null;
  const s = mk({ synth: { voices: hk.voices, speak: async (t) => { said = t; return "played"; } } });
  assert.strictEqual(await s.play("你"), "played");
  assert.strictEqual(said, "你");
});
