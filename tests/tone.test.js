// Run: node --test tests/tone.test.js
const test = require("node:test");
const assert = require("node:assert");
const T = require("../app/tone.js");

const SR = 16000;
/** A voiced syllable: a buzzy tone whose pitch follows f(x) for x from 0 to 1, then silence. */
function syllable(f, dur = 0.35, gap = 0.12) {
  const n = Math.round(dur * SR), out = new Float32Array(n + Math.round(gap * SR));
  let phase = 0;
  for (let k = 0; k < n; k++) {
    const hz = f(k / n);
    phase += (2 * Math.PI * hz) / SR;
    const env = Math.min(1, k / 400, (n - k) / 400);
    out[k] = env * (0.6 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase));
  }
  return out;
}
const join = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0); const o = new Float32Array(n); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
const st = (base, semis) => base * 2 ** (semis / 12);
let voice = 180;
const tone = {
  1: (x) => st(voice, 3),
  2: (x) => st(voice, -1 + 4.5 * x * x),
  3: (x) => st(voice, -2 - 3 * Math.sin(Math.PI * Math.min(x, 0.8) / 1.6)),
  4: (x) => st(voice, 4 - 8 * x),
};

test("tone: pitch tracking finds a steady pitch", () => {
  const track = T.pitchTrack(syllable(() => 220), SR).filter((x) => x.f0 > 0);
  assert.ok(track.length > 20);
  const mid = track[Math.floor(track.length / 2)].f0;
  assert.ok(Math.abs(mid - 220) < 3, String(mid));
});

test("tone: each tone shape is recognised from a synthetic voice", () => {
  const audio = join(syllable(tone[1]), syllable(tone[2]), syllable(tone[3]), syllable(tone[4]));
  const r = T.check(audio, SR, [1, 2, 3, 4]);
  assert.ok(r.heard);
  assert.deepStrictEqual(r.results.map((x) => x.got), [1, 2, 3, 4]);
});

test("tone: a falling syllable where a rising one was wanted is marked wrong", () => {
  const r = T.check(join(syllable(tone[4]), syllable(tone[3])), SR, [2, 3]);
  assert.strictEqual(r.results[0].ok, false);
  assert.strictEqual(r.results[0].got, 4);
});

test("tone: silence is not heard", () => {
  assert.strictEqual(T.check(new Float32Array(SR), SR, [3, 3]).heard, false);
});

test("tone: tones from pinyin, with the regular changes when spoken", () => {
  assert.deepStrictEqual(T.tonesOf("nǐ hǎo"), [3, 3]);
  assert.deepStrictEqual(T.tonesOf("xué sheng"), [2, 5]);
  assert.deepStrictEqual(T.spoken("你好", [3, 3]).map((x) => x.tone), [2, 3]);
  assert.deepStrictEqual(T.spoken("不是", [4, 4]).map((x) => x.tone), [2, 4]);
  assert.deepStrictEqual(T.spoken("一个", [1, 4]).map((x) => x.tone), [2, 4]);
  assert.deepStrictEqual(T.spoken("一天", [1, 1]).map((x) => x.tone), [4, 1]);
});

test("tone: works for a low voice and a high voice", () => {
  for (const v of [110, 260]) {
    voice = v;
    const r = T.check(join(syllable(tone[2]), syllable(tone[4]), syllable(tone[1])), SR, [2, 4, 1]);
    assert.deepStrictEqual(r.results.map((x) => x.got), [2, 4, 1], `voice ${v}`);
  }
  voice = 180;
});
