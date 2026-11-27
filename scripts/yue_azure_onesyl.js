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

function main(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const segs = {}, syl = {};
  for (const [k, v] of Object.entries(manifest)) {
    const jp = String(v.jp || "").trim();
    if (!ONE.test(jp)) continue;
    const wav = path.join(dir, k + ".wav");
    if (!fs.existsSync(wav)) continue;
    const { samples, rate } = readWav(wav);
    segs[k] = Y.segmentsHz(Tone.pitchTrack(samples, rate), 1)[0] || [];
    syl[k] = jp;
  }
  // references() keys clips by a name ending in the tone digit
  const ref = S.references(Object.fromEntries(Object.keys(segs).map((k) => [k + syl[k].slice(-1), segs[k]])));
  const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app/yue/data/audio.json"), "utf8")).clips || {};
  const out = { pass: [], covered: [], fail: {} };
  for (const k of Object.keys(segs).sort()) {
    let checked;
    try { checked = J.isChecked(syl[k]); } catch (e) { out.fail[k] = "not a syllable"; continue; }
    const why = S.shapeProblem(segs[k], Number(syl[k].slice(-1)), ref, checked);
    if (why) out.fail[k] = `${syl[k]}: ${why}`;
    else if (recorded[syl[k]] && recorded[syl[k]].length) out.covered.push(k);
    else out.pass.push(k);
  }
  fs.writeFileSync(path.join(__dirname, "..", "data/yue/tts_onesyl.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`one-syllable clips: ${out.pass.length} pass and fill a gap, ${out.covered.length} pass but have a recording, ${Object.keys(out.fail).length} fail`);
}

if (require.main === module) {
  if (!process.argv[2]) { console.error("usage: node scripts/yue_azure_onesyl.js <wav dir>"); process.exit(2); }
  main(process.argv[2]);
}
