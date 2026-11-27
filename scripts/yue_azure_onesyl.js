#!/usr/bin/env node
/* Strict pitch-shape check of the Azure one-syllable word clips (the same test as scripts/yue_audio_strict.js applies to the
   syllable recordings). Azure often says a lone syllable with a flattened tone, so publish ships a one-syllable clip only
   when it passes here, and the app still prefers the checked syllable recording when there is one.
   Run after `python -m jiesuo.yue.tts --run`: node scripts/yue_azure_onesyl.js data/raw/yue/tts
   Writes data/yue/tts_onesyl.json {"pass": [key...], "covered": [key...], "fail": {key: reason}}: "pass" lists only clips
   whose syllable has no checked recording (the app would play the recording instead, so the others are not shipped). */
"use strict";
const fs = require("fs");
const path = require("path");
const Tone = require("../app/tone.js");
const Y = require("../app/yue/tones.js");
const J = require("../app/yue/jyutping.js");
const { readWav } = require("./yue_tone_eval.js");
const S = require("./yue_audio_strict.js");

const ONE = /^[a-z]+[1-6]$/;

const PREFER = ["zh-HK-HiuMaanNeural", "zh-HK-HiuGaaiNeural"]; // the word voice first, then HiuGaai (it keeps more rises)

/* Azure flattens the rising tones of a lone syllable, so its rises must be as big as those of the syllable recordings that
   ship: the 10th percentile of the checked googleB rises (tone 2: 6.3 st, tone 5: 2.5 st), close to the EduHK human
   recordings (about 6 and 3 st). The voice-relative test above alone lets a 4 st tone 2 through. */
const MIN_RISE = { 2: 6, 5: 2.5 };
function tooFlat(seg, tone) {
  if (!MIN_RISE[tone]) return null;
  const m = S.measure(seg);
  return m.move >= MIN_RISE[tone] ? null : `rise ${m.move.toFixed(1)} st is below ${MIN_RISE[tone]}`;
}

function main(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const byVoice = {};
  for (const [k, v] of Object.entries(manifest)) {
    const jp = String(v.jp || "").trim();
    if (!ONE.test(jp) || v.r !== "0%") continue;
    const wav = path.join(dir, k + ".wav");
    if (!fs.existsSync(wav)) continue;
    const { samples, rate } = readWav(wav);
    (byVoice[v.voice] = byVoice[v.voice] || {})[k] = { seg: Y.segmentsHz(Tone.pitchTrack(samples, rate), 1)[0] || [], jp, f: v.f };
  }
  const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app/yue/data/audio.json"), "utf8")).clips || {};
  const out = { pass: [], covered: [], fail: {} }, good = {}; // good: {form: {voice: key}}
  for (const [voice, clips] of Object.entries(byVoice)) {
    // each voice against its own typical heights (references() keys clips by a name ending in the tone digit)
    const ref = S.references(Object.fromEntries(Object.entries(clips).map(([k, c]) => [k + c.jp.slice(-1), c.seg])));
    for (const k of Object.keys(clips).sort()) {
      const c = clips[k];
      let checked;
      try { checked = J.isChecked(c.jp); } catch (e) { out.fail[k] = "not a syllable"; continue; }
      const tone = Number(c.jp.slice(-1));
      const why = S.shapeProblem(c.seg, tone, ref, checked) || tooFlat(c.seg, tone);
      if (why) out.fail[k] = `${voice} ${c.jp}: ${why}`;
      else if (recorded[c.jp] && recorded[c.jp].length) out.covered.push(k);
      else (good[c.f] = good[c.f] || {})[voice] = k;
    }
  }
  // one clip per word: the first voice in PREFER that passed
  for (const f of Object.keys(good).sort()) {
    const v = PREFER.find((x) => good[f][x]) || Object.keys(good[f]).sort()[0];
    out.pass.push(good[f][v]);
  }
  out.pass.sort(); out.covered.sort();
  fs.writeFileSync(path.join(__dirname, "..", "data/yue/tts_onesyl.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`one-syllable clips: ${out.pass.length} words get a checked clip, ${out.covered.length} pass but have a recording, ${Object.keys(out.fail).length} fail`);
}

if (require.main === module) {
  if (!process.argv[2]) { console.error("usage: node scripts/yue_azure_onesyl.js <wav dir>"); process.exit(2); }
  main(process.argv[2]);
}
