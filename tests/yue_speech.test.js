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
  assert.deepStrictEqual(s.source("你好"), { kind: "clip", url: "audio/speech/a1.mp3", slow: false });
  assert.deepStrictEqual(s.source("你好", { slow: true }), { kind: "clip", url: "audio/speech/a2.mp3", slow: true });
  assert.deepStrictEqual(s.source("好", { slow: true }), { kind: "clip", url: "audio/speech/b1.mp3", slow: false });
});

test("changed tone never uses the device voice", () => {
  assert.deepStrictEqual(mk().source("個名"), { kind: "syllables", syls: ["go3", "meng2"], voice: 0, slow: false });
});

test("a safe one-reading word uses the device voice", () => {
  assert.deepStrictEqual(mk().source("你"), { kind: "device", slow: false });
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

// ---- play(): real playback path against a fake AudioContext ----
let cur = null; // audio.js keeps one AudioContext, so the fake context reports to whichever test is current
function installFakes(failUrl) {
  const started = [];
  cur = started;
  class Ctx {
    constructor() { this.state = "running"; this.destination = {}; }
    resume() { return Promise.resolve(); }
    decodeAudioData(bytes, ok) { const b = { url: bytes.url }; ok(b); return Promise.resolve(b); }
    createBufferSource() {
      const src = { playbackRate: { value: 1 }, connect() {}, onended: null,
        start() { cur.push({ url: this.buffer.url, rate: this.playbackRate.value }); this.t = setTimeout(() => this.onended && this.onended(), 5); },
        stop() { clearTimeout(this.t); if (this.onended) this.onended(); } };
      return src;
    }
  }
  const saved = { self: global.self, fetch: global.fetch };
  global.self = { AudioContext: Ctx };
  global.fetch = async (url) => ({ ok: url !== failUrl, arrayBuffer: async () => ({ url }) });
  return { started, restore() { global.self = saved.self; global.fetch = saved.fetch; } };
}

test("a clip plays at rate 1, including a slow (-25%) clip", async () => {
  const f = installFakes();
  try {
    A.init(audioJson);
    const s = mk({ speechJson: { clips: { a1: { f: "你好", r: "0%", v: "x" }, a2: { f: "你好", r: "-25%", v: "x" } } } });
    assert.strictEqual(await s.play("你好", { slow: true }), "played");
    assert.deepStrictEqual(f.started, [{ url: "audio/speech/a2.mp3", rate: 1 }]);
    const s2 = mk({ speechJson: { clips: { a1: { f: "你好", r: "0%", v: "x" } } } });
    assert.strictEqual(s2.source("你好", { slow: true }).slow, false);
    f.started.length = 0;
    assert.strictEqual(await s2.play("你好", { slow: true }), "played");
    assert.deepStrictEqual(f.started, [{ url: "audio/speech/a1.mp3", rate: 1 }]);
  } finally { f.restore(); }
});

test("a syllable sequence plays in order at rate 1", async () => {
  const f = installFakes();
  try {
    A.init(audioJson);
    assert.strictEqual(await mk({ synth: noVoice }).play("個名", { slow: true }), "played");
    assert.deepStrictEqual(f.started, [{ url: "audio/v/go3.mp3", rate: 1 }, { url: "audio/v/meng2.mp3", rate: 1 }]);
  } finally { f.restore(); }
});

test("a failed middle clip stops the sequence", async () => {
  const f = installFakes("audio/v/hou2.mp3");
  try {
    A.init({ voices: [{ id: "v" }], clips: { go3: [0], hou2: [0], meng2: [0] } });
    const data2 = { lexicon: { words: [["個好名", "go3 hou2 meng2", "x", 1, 0]], chars: {} } };
    const s = SP.create({ audio: A, lex: L.create(data2), lexData: data2, synth: noVoice });
    assert.strictEqual(await s.play("個好名"), "failed");
    assert.deepStrictEqual(f.started.map((x) => x.url), ["audio/v/go3.mp3"]);
  } finally { f.restore(); A.init(audioJson); }
});

test("an overlapping playUrls cancels the stale sequence", async () => {
  const f = installFakes();
  try {
    const first = A.playUrls(["a1.mp3", "a2.mp3", "a3.mp3"]);
    await new Promise((r) => setTimeout(r, 1));
    const second = A.playUrls(["b1.mp3", "b2.mp3"]);
    const [r1, r2] = await Promise.all([first, second]);
    assert.strictEqual(r1, "stopped");
    assert.strictEqual(r2, "played");
    const urls = f.started.map((x) => x.url);
    assert.deepStrictEqual(urls.slice(urls.indexOf("b1.mp3")), ["b1.mp3", "b2.mp3"]);
    assert.ok(!urls.includes("a2.mp3") && !urls.includes("a3.mp3"), urls.join());
  } finally { f.restore(); }
});

test("device safety needs matching per-character readings and a checked word", () => {
  const d = { lexicon: { words: [["你", "nei5", "you", 1, 0], ["我", "ngo5", "me", 2, 0], ["佢", "keoi5", "he", 3, 4]], chars: { 你: ["nei4"], 我: ["ngo5"], 佢: ["keoi5"] } } };
  const s = SP.create({ audio: A, lex: L.create(d), lexData: d, synth: hk });
  assert.notStrictEqual(s.source("你").kind, "device"); // char reading differs from the word's
  assert.strictEqual(s.source("我").kind, "device");
  assert.notStrictEqual(s.source("佢").kind, "device"); // unchecked
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function spySynth() {
  const log = { cancels: 0, said: [] };
  return { log, voices: () => [{ lang: "zh-HK" }], cancel() { log.cancels++; }, speak: async (t, v, rate) => { log.said.push([t, rate]); return "played"; } };
}

test("device speech after a syllable sequence stops the sequence and cancels synth", async () => {
  const f = installFakes();
  try {
    A.init(audioJson);
    const syn = spySynth();
    const s = mk({ synth: syn });
    const seq = mk({ synth: noVoice }).play("個名");
    await sleep(1);
    assert.strictEqual(await s.play("你"), "played");
    assert.strictEqual(await seq, "stopped");
    assert.deepStrictEqual(f.started.map((x) => x.url), ["audio/v/go3.mp3"]);
    assert.ok(syn.log.cancels >= 1);
  } finally { f.restore(); }
});

test("a clip after device speech cancels the synth", async () => {
  const f = installFakes();
  try {
    A.init(audioJson);
    const syn = spySynth();
    let release; syn.speak = () => new Promise((r) => { release = r; });
    const s = mk({ synth: syn, speechJson: { clips: { c1: { f: "個名", r: "0%", v: "x" } } } });
    const dev = s.play("你");
    const before = syn.log.cancels;
    assert.strictEqual(await s.play("個名"), "played");
    assert.ok(syn.log.cancels > before);
    assert.deepStrictEqual(f.started.map((x) => x.url), ["audio/speech/c1.mp3"]);
    release("played"); await dev;
  } finally { f.restore(); }
});

test("slow device speech uses rate 0.7", async () => {
  const syn = spySynth();
  await mk({ synth: syn }).play("你", { slow: true });
  assert.deepStrictEqual(syn.log.said, [["你", 0.7]]);
});

test("stop() cancels a running sequence", async () => {
  const f = installFakes();
  try {
    A.init(audioJson);
    const p = A.playUrls(["a1.mp3", "a2.mp3", "a3.mp3"]);
    await sleep(1);
    A.stop();
    assert.strictEqual(await p, "stopped");
    assert.deepStrictEqual(f.started.map((x) => x.url), ["a1.mp3"]);
  } finally { f.restore(); }
});

test("an interrupted single clip is stopped, not played", async () => {
  const f = installFakes();
  try {
    const first = A.playUrl("x1.mp3");
    await sleep(1);
    const second = A.playUrl("x2.mp3");
    assert.strictEqual(await first, "stopped");
    assert.strictEqual(await second, "played");
  } finally { f.restore(); }
});

test("a word whose syllable count differs from its characters is not device-safe", () => {
  const d = { lexicon: { words: [["我", "ngo5 dei6", "x", 1, 0]], chars: { 我: ["ngo5"] } } };
  assert.notStrictEqual(SP.create({ audio: A, lex: L.create(d), lexData: d, synth: hk }).source("我").kind, "device");
});
