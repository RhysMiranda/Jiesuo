/* Jiesuo tones: pitch tracking and tone shapes for the speaking check. Pure, no DOM, all on the device. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JiesuoTone = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * Pitch per 10 ms frame, by the YIN method (de Cheveigné and Kawahara 2002): the lag where the
   * signal best matches itself, after normalising the difference function. 0 where unvoiced.
   */
  function pitchTrack(samples, sampleRate, { hop = 0.01, win = 0.04, min = 70, max = 500, threshold = 0.15 } = {}) {
    const W = Math.round(win * sampleRate), H = Math.round(hop * sampleRate);
    const tauMin = Math.floor(sampleRate / max), tauMax = Math.min(Math.ceil(sampleRate / min), W - 1);
    let peak = 0;
    for (let k = 0; k < samples.length; k++) peak = Math.max(peak, Math.abs(samples[k]));
    const quiet = peak * 0.08;
    const out = [];
    const d = new Float32Array(tauMax + 1);
    for (let start = 0; start + W + tauMax < samples.length; start += H) {
      let rms = 0;
      for (let k = 0; k < W; k++) rms += samples[start + k] ** 2;
      rms = Math.sqrt(rms / W);
      let f0 = 0;
      if (rms > quiet / 3) {
        for (let tau = 1; tau <= tauMax; tau++) {
          let s = 0;
          for (let k = 0; k < W; k++) { const x = samples[start + k] - samples[start + k + tau]; s += x * x; }
          d[tau] = s;
        }
        let run = 0, best = -1;
        d[0] = 1;
        for (let tau = 1; tau <= tauMax; tau++) {
          run += d[tau];
          d[tau] = run ? (d[tau] * tau) / run : 1;
        }
        for (let tau = tauMin; tau <= tauMax; tau++) {
          if (d[tau] < threshold) {
            while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
            best = tau;
            break;
          }
        }
        if (best > 0) {
          const a = d[best - 1], b = d[best], c = best + 1 <= tauMax ? d[best + 1] : b;
          const shift = (a + c - 2 * b) ? (a - c) / (2 * (a + c - 2 * b)) : 0;
          f0 = sampleRate / (best + shift);
        }
      }
      out.push({ t: start / sampleRate, f0, rms });
    }
    return smooth(out);
  }

  /** Drop single-frame octave jumps and lone voiced frames, which are tracking errors, not speech. */
  function smooth(track) {
    const f = track.map((x) => x.f0);
    for (let k = 1; k < f.length - 1; k++) {
      if (f[k] && !f[k - 1] && !f[k + 1]) f[k] = 0;
      if (f[k] && f[k - 1] && f[k + 1]) {
        const mid = (f[k - 1] + f[k + 1]) / 2;
        if (Math.abs(12 * Math.log2(f[k] / mid)) > 7) f[k] = mid;
      }
    }
    return track.map((x, k) => ({ ...x, f0: f[k] }));
  }

  /**
   * Split the voiced frames into n syllables. Pauses (60 ms or more of silence) separate syllables;
   * with too many runs the shortest gaps are merged, with too few the longest runs are cut evenly.
   * Each syllable is a list of pitches in semitones from the speaker's median.
   */
  function syllables(track, n) {
    const voiced = track.map((x) => x.f0 > 0);
    let runs = [];
    for (let k = 0; k < track.length; k++) {
      if (!voiced[k]) continue;
      const last = runs[runs.length - 1];
      if (last && k - last[1] <= 6) last[1] = k; // a gap under 60 ms is inside a syllable
      else runs.push([k, k]);
    }
    runs = runs.filter(([a, b]) => b - a >= 3); // under 40 ms is a click
    if (!runs.length || n < 1) return [];
    while (runs.length > n) {
      let gap = Infinity, at = 0;
      for (let j = 0; j + 1 < runs.length; j++) { const g = runs[j + 1][0] - runs[j][1]; if (g < gap) { gap = g; at = j; } }
      runs.splice(at, 2, [runs[at][0], runs[at + 1][1]]);
    }
    while (runs.length < n) {
      let len = -1, at = 0;
      runs.forEach(([a, b], j) => { if (b - a > len) { len = b - a; at = j; } });
      const [a, b] = runs[at];
      const mid = Math.floor((a + b) / 2);
      if (mid <= a || mid >= b) break;
      runs.splice(at, 1, [a, mid], [mid + 1, b]);
    }
    const all = track.filter((x) => x.f0 > 0).map((x) => x.f0).sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)] || 1;
    return runs.map(([a, b]) => track.slice(a, b + 1).filter((x) => x.f0 > 0).map((x) => 12 * Math.log2(x.f0 / median)));
  }

  // Tone shapes in semitones from a speaker's middle pitch, on five points (Chao's 55, 35, 214, 51).
  const SHAPES = {
    1: [3, 3, 3, 3, 3],
    2: [-1, -0.5, 0.5, 2, 3.5],
    3: [-2, -3.5, -4.5, -4.5, -3],
    4: [4, 3, 1, -1.5, -4],
  };

  /** n evenly spaced points from a list of pitches, each the mean of its stretch. */
  function resample(seg, n = 5) {
    if (!seg.length) return [];
    const out = [];
    for (let j = 0; j < n; j++) {
      const a = Math.floor((j * seg.length) / n), b = Math.max(a + 1, Math.floor(((j + 1) * seg.length) / n));
      const part = seg.slice(a, b);
      out.push(part.reduce((s, x) => s + x, 0) / part.length);
    }
    return out;
  }

  /**
   * Which tone a syllable sounds like: the nearest shape, allowing the whole contour to sit a
   * little higher or lower and to span a narrower or wider range, as voices differ.
   */
  function classify(seg, range = 1) {
    const p = resample(seg);
    if (p.length < 5) return { tone: 0, scores: {} };
    const scores = {};
    for (const [tone, shape] of Object.entries(SHAPES)) {
      let best = Infinity;
      for (let shift = -1.5; shift <= 1.5; shift += 0.5) {
        let d = 0;
        for (let j = 0; j < 5; j++) d += Math.abs(p[j] - (shape[j] * range + shift));
        best = Math.min(best, d / 5);
      }
      scores[tone] = best;
    }
    const tone = +Object.keys(scores).sort((a, b) => scores[a] - scores[b])[0];
    return { tone, scores, points: p };
  }

  /** How wide this voice's pitch range is, relative to the shapes (a lively voice spans more). */
  function rangeOf(segs) {
    const all = segs.flat().sort((a, b) => a - b);
    if (all.length < 10) return 1;
    const spread = all[Math.floor(all.length * 0.9)] - all[Math.floor(all.length * 0.1)];
    return Math.min(1.6, Math.max(0.6, spread / 7));
  }

  const MARK = { "̄": 1, "́": 2, "̌": 3, "̀": 4 };
  /** "nǐ hǎo" -> [3, 3]; 5 for a neutral tone. */
  function tonesOf(pinyin) {
    return String(pinyin).toLowerCase().normalize("NFD").split(/[\s'·-]+/).filter((s) => /[a-zü]/.test(s)).map((syl) => {
      for (const ch of syl) if (MARK[ch]) return MARK[ch];
      return 5;
    });
  }

  /**
   * The tones as spoken, after the regular changes (sandhi): a third tone before another third
   * becomes second (你好 ní hǎo); 不 becomes second before a fourth (不是 bú shì); 一 becomes second
   * before a fourth and fourth before the others (一个 yí gè, 一天 yì tiān). Returns [{tone, note}].
   */
  function spoken(chars, tones) {
    return tones.map((t, k) => {
      const next = tones[k + 1];
      if (t === 3 && next === 3) return { tone: 2, note: "3rd tone before another 3rd is said as a 2nd" };
      if (chars[k] === "不" && t === 4 && next === 4) return { tone: 2, note: "不 before a 4th tone is said bú" };
      if (chars[k] === "一" && t === 1 && next) {
        if (next === 4 || next === 5) return { tone: 2, note: "一 before a 4th tone is said yí" };
        return { tone: 4, note: "一 before other tones is said yì" };
      }
      return { tone: t, note: "" };
    });
  }

  /**
   * The whole check: pitch track to syllables, each compared with the tone it should have.
   * Neutral tones always pass (they are short and take their pitch from the tone before).
   * A near miss (the right tone was a close second) counts as close.
   */
  function check(samples, sampleRate, expected) {
    const track = pitchTrack(samples, sampleRate);
    const voicedShare = track.filter((x) => x.f0 > 0).length / Math.max(1, track.length);
    const segs = syllables(track, expected.length);
    if (!segs.length || voicedShare < 0.05) return { heard: false, track, results: [] };
    const range = rangeOf(segs);
    const results = expected.map((want, k) => {
      const seg = segs[k] || [];
      if (want === 5) return { want, got: 0, ok: true, close: false, points: resample(seg), neutral: true };
      const c = classify(seg, range);
      const ok = c.tone === want;
      const order = Object.keys(c.scores).sort((a, b) => c.scores[a] - c.scores[b]).map(Number);
      const close = !ok && order[1] === want && c.scores[want] - c.scores[order[0]] < 0.6;
      return { want, got: c.tone, ok, close, points: c.points || [] };
    });
    return { heard: true, track, results, range, syllablesFound: segs.length };
  }

  return { pitchTrack, syllables, classify, resample, tonesOf, spoken, check, SHAPES, rangeOf };
});
