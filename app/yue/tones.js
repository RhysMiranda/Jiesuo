/* Jiesuo Cantonese: the six-tone classifier. Pure, no DOM, all on the device.
   Tones 1, 3 and 6 differ only in height, so each learner calibrates on their own voice first
   (a profile of heights), and every syllable is compared with templates built from that profile.
   When two tones fit about equally well it says "unsure" rather than guess. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../tone.js"), require("./jyutping.js"));
  else root.JyutTones = factory(root.JiesuoTone, root.JyutJyutping);
})(typeof self !== "undefined" ? self : this, function (Tone, Jyut) {
  "use strict";

  // Tuned by scripts/yue_tone_eval.js on the tuning voices only (see reports/yue_tone_check.md).
  // shift: largest global pitch shift tried (semitones); step: its increment;
  // unsure: smallest margin (semitones) between best and second-best tone that counts as a decision.
  const DEFAULTS = { shift: 0.25, step: 0.25, unsure: 0.1 };
  // Calibration syllables: sonorant onset, so the whole syllable is voiced (衣 意 二 兒 椅 耳).
  const ANCHORS = ["ji1", "ji3", "ji6", "ji4", "ji2", "ji5"];
  const MIN_FRAMES = 8, MIN_VOICED_SHARE = 0.05;

  const semis = (hz) => 12 * Math.log2(hz / 55);
  const positive = (segHz) => (segHz || []).filter((h) => Number.isFinite(h) && h > 0); // zero or negative Hz is not a pitch
  const median = (a) => {
    if (!a.length) return NaN;
    const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  /** Voiced pitches in Hz for each of n syllables. */
  function segmentsHz(track, n) {
    return Tone.runs(track, n).map(([a, b]) => track.slice(a, b + 1).filter((x) => x.f0 > 0).map((x) => x.f0));
  }

  /** The steady height of a syllable: semitones re 55 Hz, median of the middle 60% of frames. */
  function level(segHz) {
    segHz = positive(segHz);
    const n = segHz.length;
    if (!n) return NaN;
    const a = Math.floor(n * 0.2), b = Math.max(a + 1, Math.ceil(n * 0.8));
    return median(segHz.slice(a, b).map(semis));
  }

  /** The end height of a syllable: median of the last 30% of frames, in semitones re 55 Hz. */
  function tail(segHz) {
    segHz = positive(segHz);
    const n = segHz.length;
    if (!n) return NaN;
    return median(segHz.slice(Math.min(n - 1, Math.floor(n * 0.7))).map(semis));
  }

  /** The learner's calibration from the anchor syllables ji1, ji3, ji6, ji4, ji2, ji5.
      Each value is one Hz segment or an array of Hz segments; each field is the median over the segments. */
  function profileFrom(anchors) {
    const segsOf = (v) => (Array.isArray(v) && Array.isArray(v[0]) ? v : [v]);
    const field = (name, fn) => {
      const vals = segsOf(anchors[name]).map(fn).filter(Number.isFinite);
      return vals.length ? median(vals) : NaN;
    };
    return {
      t1: field("ji1", level), t3: field("ji3", level), t6: field("ji6", level),
      t4lo: field("ji4", tail), t2hi: field("ji2", tail), t5hi: field("ji5", tail),
    };
  }

  /** Whether the calibration makes sense; if not, the first anchor to record again. */
  function validProfile(p) {
    const bad = Object.values(p || {}).some((v) => !Number.isFinite(v)) || !p || ["t1", "t3", "t6", "t4lo", "t2hi", "t5hi"].some((k) => !(k in p));
    if (bad) return { ok: false, redo: "ji1" };
    if (!(p.t1 - p.t3 >= 1)) return { ok: false, redo: "ji1" };
    if (!(p.t3 - p.t6 >= 1)) return { ok: false, redo: "ji3" };
    if (!(p.t6 - p.t4lo >= 0.5)) return { ok: false, redo: "ji6" };
    if (!(p.t2hi - p.t5hi >= 1)) return { ok: false, redo: "ji2" };
    if (!(p.t2hi > p.t3)) return { ok: false, redo: "ji3" };
    return { ok: true };
  }

  /** The five-point shape of a tone, in the learner's own semitone heights. */
  function template(tone, p) {
    const mid = (a, b) => (a + b) / 2;
    switch (tone) {
      case 1: return [p.t1, p.t1, p.t1, p.t1, p.t1];
      case 2: return [p.t6, p.t6, mid(p.t6, p.t3), p.t3, p.t2hi];
      case 3: return [p.t3, p.t3, p.t3, p.t3, p.t3];
      case 4: return [p.t6, mid(p.t6, p.t4lo), p.t4lo, p.t4lo, p.t4lo];
      case 5: return [p.t6, p.t6, mid(p.t6, p.t5hi), p.t5hi, p.t5hi];
      case 6: return [p.t6, p.t6, p.t6, p.t6, p.t6];
      default: throw new Error("no such tone: " + tone);
    }
  }
  const TEMPLATES = (p) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((t) => [t, template(t, p)]));

  /** Mean absolute difference to the template, minimised over a global shift. */
  function score(points, tpl, { shift, step }) {
    const k = Math.round(shift / step);
    let best = Infinity;
    for (let i = -k; i <= k; i++) {
      const s = i * step;
      let d = 0;
      for (let j = 0; j < 5; j++) d += Math.abs(points[j] - (tpl[j] + s));
      best = Math.min(best, d / 5);
    }
    return best;
  }

  /** Which tone a syllable sounds like, among `allowed`; `unsure` when the best two are too close. */
  function classify(segHz, profile, { allowed = [1, 2, 3, 4, 5, 6], params = DEFAULTS } = {}) {
    const prm = { ...DEFAULTS, ...params };
    const none = { tone: 0, unsure: true, margin: 0, scores: {}, points: [] };
    segHz = positive(segHz);
    if (segHz.length < MIN_FRAMES) return none;
    const points = Tone.resample(segHz.map(semis), 5);
    if (points.length < 5 || !points.every(Number.isFinite)) return none;
    const scores = {};
    for (const t of allowed) {
      const tpl = template(t, profile);
      if (!tpl.every(Number.isFinite)) return none; // a broken profile never gives a verdict
      scores[t] = score(points, tpl, prm);
    }
    if (!allowed.every((t) => Number.isFinite(scores[t]))) return none;
    const order = allowed.slice().sort((a, b) => scores[a] - scores[b]);
    const margin = order.length > 1 ? scores[order[1]] - scores[order[0]] : Infinity;
    return { tone: order[0], unsure: !(margin >= prm.unsure), margin, scores, points };
  }

  function isChecked(syl) { try { return Jyut.isChecked(syl); } catch (e) { return false; } }

  /**
   * The whole check: pitch track, syllables, each compared with the tone it should have.
   * `ok` means heard as wanted AND decided; an unsure syllable is never ok (the app says "not sure").
   * Checked syllables (ending p, t, k) can only be tones 1, 3 or 6.
   */
  function check(samples, sampleRate, expected, profile, params = DEFAULTS) {
    const track = Tone.pitchTrack(samples, sampleRate);
    const voiced = track.filter((x) => x.f0 > 0).length / Math.max(1, track.length);
    const segs = segmentsHz(track, expected.length);
    if (voiced < MIN_VOICED_SHARE || segs.length < expected.length || segs.some((s) => s.length < MIN_FRAMES)) {
      return { heard: false, results: [] };
    }
    if (!validProfile(profile).ok) {
      // heard, but with no usable calibration nothing can be decided: every syllable is "not sure"
      return { heard: true, results: expected.map(({ syl, tone: want }) => ({ syl, want, got: 0, ok: false, unsure: true, points: [] })) };
    }
    const results = expected.map(({ syl, tone: want }, k) => {
      const allowed = isChecked(syl) ? [1, 3, 6] : [1, 2, 3, 4, 5, 6];
      const c = classify(segs[k], profile, { allowed, params });
      return { syl, want, got: c.tone, ok: c.tone === want && !c.unsure, unsure: c.unsure, points: c.points };
    });
    return { heard: true, results };
  }

  return { DEFAULTS, ANCHORS, TEMPLATES, template, segmentsHz, level, tail, profileFrom, validProfile, classify, check };
});
