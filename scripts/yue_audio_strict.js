#!/usr/bin/env node
/* Strict tone check of the shipped syllable voice (googleB) before its clips are shipped.
   A clip is kept only if its pitch shape fits its tone directly: level, rising or falling, at the right height
   against the voice's own typical height for each tone (medians over all its clips, so a few bad clips can't move them).
   The phase 1 classifier is not used here: it was calibrated on these same voices and on six anchor clips.
   Writes data/yue/audio_strict.json {"<voice>/<syl>": reason} for clips that fail. Run: node scripts/yue_audio_strict.js */
"use strict";
const fs = require("fs");
const path = require("path");
const E = require("./yue_tone_eval.js");
const J = require("../app/yue/jyutping.js");

const ROOT = path.join(__dirname, "..");
const VOICE = "googleB";
const semis = (h) => 12 * Math.log2(h / 55);
const median = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };

/** Semitone frames with pitch-tracker octave jumps folded back towards the clip's median. */
function frames(seg) {
  const st = seg.filter((h) => h > 0).map(semis);
  const m = median(st);
  return st.map((x) => (x - m > 9.5 ? x - 12 : m - x > 9.5 ? x + 12 : x)); // a real tone 2 rises ~8 st; octave errors jump 12
}
/** head, level (middle 60%), end and move of one clip, in semitones. */
function measure(seg, minFrames = 5) {
  const st = frames(seg), n = st.length;
  if (n < minFrames) return null;
  const head = median(st.slice(0, Math.ceil(n * 0.3))), end = median(st.slice(Math.floor(n * 0.7)));
  const lvl = median(st.slice(Math.floor(n * 0.2), Math.max(Math.floor(n * 0.2) + 1, Math.ceil(n * 0.8))));
  return { head, end, lvl, move: end - head };
}
/** The voice's own typical heights per tone, as medians over all its clips of that tone (robust to bad clips). */
function references(clips) {
  const by = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const [syl, seg] of Object.entries(clips)) {
    const t = Number(syl.slice(-1)), m = measure(seg);
    if (m && by[t]) by[t].push(m);
  }
  const med = (t, k) => median(by[t].map((m) => m[k]));
  return { t1: med(1, "lvl"), t3: med(3, "lvl"), t6: med(6, "lvl"), t4: med(4, "end"), t2: med(2, "end"), t5: med(5, "end"), t2move: med(2, "move"), t5move: med(5, "move") };
}
/** Why a clip's shape does not fit tone `want` (null when it fits). */
function shapeProblem(seg, want, ref, checked) {
  const m = measure(seg, checked ? 3 : 5); // checked tones (-p -t -k) are short by nature
  if (!m) return "too short to measure";
  const { head, end, lvl, move } = m;
  const mid13 = (ref.t1 + ref.t3) / 2, mid36 = (ref.t3 + ref.t6) / 2, mid64 = (ref.t6 + ref.t4) / 2, mid25 = (ref.t2 + ref.t5) / 2;
  const flat = checked || (move > -2.5 && move < 1.5); // level tones may sag a little at the end (tone 1 can be 53), but never rise
  const r = (x) => x.toFixed(1);
  switch (want) {
    case 1: return lvl > mid13 && flat ? null : `not high and level (level ${r(lvl)}, move ${r(move)})`;
    case 3: return lvl > mid36 && lvl < mid13 && flat ? null : `not mid and level (level ${r(lvl)}, move ${r(move)})`;
    case 6: return lvl > mid64 && lvl < mid36 && flat ? null : `not low and level (level ${r(lvl)}, move ${r(move)})`;
    case 4: return end < mid64 && move <= 0.5 ? null : `not lowest/falling (end ${r(end)}, move ${r(move)})`;
    case 2: return move >= Math.max(2.5, ref.t2move / 2) && end > mid25 ? null : `not a high rise (end ${r(end)}, rise ${r(move)})`;
    case 5: return move >= 1 && end < mid25 && head < mid36 ? null : `not a low rise (start ${r(head)}, end ${r(end)}, rise ${r(move)})`;
    default: return "unknown tone";
  }
}

function main() {
  const clips = E.voiceClips(VOICE);
  const ref = references(clips);
  console.log("references (st re 55 Hz):", Object.fromEntries(Object.entries(ref).map(([k, v]) => [k, v.toFixed(1)])));
  const out = {};
  let kept = 0;
  for (const syl of Object.keys(clips).sort()) {
    let checked;
    try { checked = J.isChecked(syl); } catch (e) { continue; }
    const want = Number(syl.slice(-1));
    const why = shapeProblem(clips[syl], want, ref, checked);
    if (why) out[`${VOICE}/${syl}`] = why; else kept++;
  }
  fs.writeFileSync(path.join(ROOT, "data/yue/audio_strict.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`${VOICE}: kept ${kept}, failed ${Object.keys(out).length}`);
}

if (require.main === module) main();
module.exports = { shapeProblem, measure, references };
