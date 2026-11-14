// Run: node --test tests/yue_tones.test.js
const test = require("node:test");
const assert = require("node:assert");
const T = require("../app/tone.js");
const Y = require("../app/yue/tones.js");

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

// Levels 55/33/22 at base 150 Hz: t1 = +6 st, t3 = +2, t6 = 0, t4 falls to -3, t2 rises to +6, t5 rises to +2.
let drift = 0;
const BASE = 150;
/** A contour through five points (at the middle of each fifth of the syllable), in semitones above 150 Hz. */
const through = (pts) => (x) => {
  const u = Math.min(4, Math.max(0, x * 5 - 0.5)), i = Math.min(3, Math.floor(u));
  return st(BASE, drift + pts[i] + (pts[i + 1] - pts[i]) * (u - i));
};
const voice = {
  1: () => st(BASE, 6 + drift),
  3: () => st(BASE, 2 + drift),
  6: () => st(BASE, 0 + drift),
  4: through([0, -1.5, -3, -3, -3]),
  2: through([0, 0, 1, 2, 6]),
  5: through([0, 0, 1, 2, 2]),
};
const segs = (audio, n) => Y.segmentsHz(T.pitchTrack(audio, SR), n);
function calibrate() {
  const one = (t) => segs(syllable(voice[t]), 1)[0];
  return Y.profileFrom({ ji1: one(1), ji3: one(3), ji6: one(6), ji4: one(4), ji2: one(2), ji5: one(5) });
}
const profile = () => { const saved = drift; drift = 0; const p = calibrate(); drift = saved; return p; };
const classifyTone = (t, opts) => Y.classify(segs(syllable(voice[t]), 1)[0], profile(), opts);

test("level tones are told apart by height after calibration", () => {
  for (const t of [1, 3, 6]) assert.strictEqual(classifyTone(t).tone, t, `tone ${t}`);
});

test("calibration profile is valid and ordered", () => {
  const p = profile();
  assert.deepStrictEqual(Y.validProfile(p), { ok: true });
  assert.ok(p.t1 > p.t3 && p.t3 > p.t6 && p.t6 > p.t4lo && p.t2hi > p.t5hi);
});

test("rising tones 2 and 5 are told apart by end height", () => {
  assert.strictEqual(classifyTone(2).tone, 2);
  assert.strictEqual(classifyTone(5).tone, 5);
});

test("tone 4 low fall is recognised", () => {
  assert.strictEqual(classifyTone(4).tone, 4);
});

test("checked syllable only chooses among 1, 3, 6", () => {
  const p = profile();
  const r = Y.check(syllable(voice[4]), SR, [{ syl: "sik1", tone: 1 }], p);
  assert.ok(r.heard);
  assert.ok([1, 3, 6].includes(r.results[0].got), String(r.results[0].got));
  assert.notStrictEqual(r.results[0].got, 4);
});

test("check reports each syllable against what was wanted", () => {
  const p = profile();
  const r = Y.check(join(syllable(voice[1]), syllable(voice[2]), syllable(voice[6])), SR,
    [{ syl: "si1", tone: 1 }, { syl: "si2", tone: 2 }, { syl: "si3", tone: 3 }], p);
  assert.ok(r.heard);
  assert.deepStrictEqual(r.results.map((x) => x.got), [1, 2, 6]);
  assert.deepStrictEqual(r.results.map((x) => x.ok), [true, true, false]);
  assert.strictEqual(r.results[2].want, 3);
});

test("profile with levels out of order is rejected", () => {
  const p = profile();
  const bad = { ...p, t3: p.t1 + 1 };
  assert.deepStrictEqual(Y.validProfile(bad), { ok: false, redo: "ji1" });
  assert.deepStrictEqual(Y.validProfile({ ...p, t6: p.t3 }), { ok: false, redo: "ji3" });
  assert.deepStrictEqual(Y.validProfile({ ...p, t4lo: p.t6 }), { ok: false, redo: "ji6" });
  assert.deepStrictEqual(Y.validProfile({ ...p, t5hi: p.t2hi }), { ok: false, redo: "ji2" });
});

test("silence is not heard", () => {
  const r = Y.check(new Float32Array(SR), SR, [{ syl: "si1", tone: 1 }], profile());
  assert.strictEqual(r.heard, false);
});

test("an ambiguous contour halfway between 3 and 6 is unsure", () => {
  const p = profile();
  const mid = syllable(() => st(BASE, 1));
  const c = Y.classify(segs(mid, 1)[0], p, { allowed: [1, 3, 6] });
  assert.strictEqual(c.unsure, true);
  assert.ok(c.margin < Y.DEFAULTS.unsure);
});

test("a speaker drifting 1 semitone sharp is still classified", () => {
  const p = profile();
  drift = 1;
  try {
    // 3 and 6 are 2 st apart here, so a 1 st drift sits exactly between them: it must never be a
    // confident wrong answer (right, or "not sure"). Contoured tones and tone 1 stay exact.
    for (const t of [1, 2, 4, 5]) assert.strictEqual(Y.classify(segs(syllable(voice[t]), 1)[0], p, wide).tone, t, `tone ${t}`);
    for (const t of [3, 6]) {
      const c = Y.classify(segs(syllable(voice[t]), 1)[0], p, wide);
      assert.ok(c.tone === t || c.unsure, `tone ${t} heard as ${c.tone}`);
    }
    drift = 0.5;
    for (const t of [1, 2, 3, 4, 5, 6]) assert.strictEqual(Y.classify(segs(syllable(voice[t]), 1)[0], p, wide).tone, t, `tone ${t} at +0.5`);
  } finally { drift = 0; }
});

test("level is the median of the middle 60% in semitones re 55 Hz", () => {
  assert.ok(Math.abs(Y.level(Array(20).fill(110)) - 12) < 1e-9);
  const seg = [400, ...Array(10).fill(110), 60];
  assert.ok(Math.abs(Y.level(seg) - 12) < 1e-9);
});

test("templates follow the profile", () => {
  const p = { t1: 12, t3: 8, t6: 4, t4lo: 0, t2hi: 12, t5hi: 8 };
  assert.deepStrictEqual(Y.template(1, p), [12, 12, 12, 12, 12]);
  assert.deepStrictEqual(Y.template(2, p), [4, 4, 6, 8, 12]);
  assert.deepStrictEqual(Y.template(4, p), [4, 2, 0, 0, 0]);
  assert.deepStrictEqual(Y.template(5, p), [4, 4, 6, 8, 8]);
});

test("too few voiced frames is not heard", () => {
  const short = syllable(voice[1], 0.06);
  assert.strictEqual(Y.check(join(short, new Float32Array(SR)), SR, [{ syl: "si1", tone: 1 }], profile()).heard, false);
});

test("a broken profile or bad Hz frames never give a confident verdict", () => {
  const good = profile(), seg = segs(syllable(voice[1]), 1)[0];
  const nan = { ...good, t3: NaN };
  assert.strictEqual(Y.classify(seg, nan).unsure, true);
  assert.strictEqual(Y.classify(seg, {}).unsure, true);
  const dirty = Y.classify([0, -5, ...seg, 0], good);
  assert.ok(Object.values(dirty.scores).every(Number.isFinite) && dirty.points.every(Number.isFinite));
  assert.strictEqual(dirty.tone, 1);
  const r = Y.check(syllable(voice[1]), SR, [{ syl: "si1", tone: 1 }], nan);
  assert.ok(r.results.every((x) => x.unsure && !x.ok));
  assert.ok(Y.check(syllable(voice[1]), SR, [{ syl: "si1", tone: 1 }], undefined).results.every((x) => x.unsure && !x.ok));
});

test("ANCHORS is the ji series", () => {
  assert.deepStrictEqual(Y.ANCHORS, ["ji1", "ji3", "ji6", "ji4", "ji2", "ji5"]);
});

test("profileFrom with arrays of segments takes the median of each field", () => {
  const seg = (hz) => Array(12).fill(hz);
  const one = (hz) => ({ ji1: seg(hz), ji3: seg(hz), ji6: seg(hz), ji4: seg(hz), ji2: seg(hz), ji5: seg(hz) });
  const a = Y.profileFrom({ ...one(200), ji1: [seg(200), seg(220), seg(400)] });
  assert.ok(Math.abs(a.t1 - Y.level(seg(220))) < 1e-9, "median of three levels is the middle one");
  assert.ok(Math.abs(a.t3 - Y.level(seg(200))) < 1e-9, "a single bare segment still works");
  const b = Y.profileFrom({ ...one(200), ji2: [seg(200), [], seg(300)] });
  assert.ok(Math.abs(b.t2hi - (Y.tail(seg(200)) + Y.tail(seg(300))) / 2) < 1e-9, "unvoiced segments are skipped");
});
