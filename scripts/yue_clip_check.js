#!/usr/bin/env node
/* Tone check for the generated Azure clips.
   Run: node scripts/yue_clip_check.js data/raw/yue/tts   (the folder `python -m jiesuo.yue.tts --run` wrote)
   Each clip is split with tone.js runs; when the natural run count equals the syllable count, every run is classified
   with the tones.js classifier against a profile fitted on THAT voice's own Azure calibration clips (calib/<voice>/, made by --run; Cantone clips only if those are missing), and compared
   with the tones of the Jyutping we sent. Writes reports/yue_tts_check.md and <dir>/check.json (the mismatched keys and the voices that could not be calibrated,
   which `python -m jiesuo.yue.tts --publish` keeps out of speech.json until listed in data/yue/tts_ok.txt). */
"use strict";
const fs = require("fs");
const path = require("path");
const Tone = require("../app/tone.js");
const Y = require("../app/yue/tones.js");
const Jyut = require("../app/yue/jyutping.js");
const { readWav, voiceClips, profileOf } = require("./yue_tone_eval.js");

const ROOT = path.join(__dirname, "..");
const CANTONE_VOICE = { "zh-HK-HiuMaanNeural": "microsoftHiuMaan", "zh-HK-WanLungNeural": "microsoftWanLung" };

/** {syl: voiced Hz} for the Azure calibration clips of a voice (<dir>/calib/<voice>/<syl>.wav), or null when there are none. */
function azureCalibration(dir, azureVoice) {
  const cdir = path.join(dir, "calib", azureVoice);
  if (!fs.existsSync(cdir)) return null;
  const files = fs.readdirSync(cdir).filter((f) => f.endsWith(".wav"));
  if (!files.length) return null;
  const out = {};
  for (const f of files) {
    const { samples, rate } = readWav(path.join(cdir, f));
    out[f.slice(0, -4)] = Y.segmentsHz(Tone.pitchTrack(samples, rate), 1)[0] || [];
  }
  return out;
}

/** {ok, profile, why, source} for an Azure voice. Fitted with the phase 1 code (profileOf: ji series, seven sets, validProfile)
    on the voice's own Azure calibration clips; only when none exist, on the same voice's Cantone clips.
    An invalid profile is reported, never loosened. */
function voiceProfile(azureVoice, dir) {
  const cv = CANTONE_VOICE[azureVoice];
  if (!cv) throw new Error("no Cantone recordings for voice " + azureVoice);
  const az = dir ? azureCalibration(dir, azureVoice) : null;
  const p = profileOf(az || voiceClips(cv));
  const source = az ? "Azure calibration clips" : "Cantone clips";
  return p.ok ? { ok: true, profile: p.profile, source } : { ok: false, why: p.why, source };
}

/** Small seeded PRNG so the listen-through sample is the same on every run. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sample(keys, n, seed = 1) {
  const a = keys.slice().sort(), rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/** Check one clip. status: "unsegmented" (run count differs from the syllable count, or not enough voiced audio),
    "match", "unsure" (decided nothing for some syllable, none decided wrongly), or "mismatch" (some syllable decided as another tone). */
function checkClip(samples, rate, syls, profile, params = Y.DEFAULTS) {
  const track = Tone.pitchTrack(samples, rate);
  if (Tone.rawRuns(track).length !== syls.length) return { status: "unsegmented", runs: Tone.rawRuns(track).length };
  const segs = Y.segmentsHz(track, syls.length);
  const rows = syls.map((syl, k) => {
    const allowed = Jyut.isChecked(syl) ? [1, 3, 6] : [1, 2, 3, 4, 5, 6];
    const c = Y.classify(segs[k], profile, { allowed, params });
    return { syl, want: Number(syl.slice(-1)), got: c.tone, unsure: c.unsure };
  });
  const status = rows.some((r) => !r.unsure && r.got !== r.want) ? "mismatch" : rows.some((r) => r.unsure) ? "unsure" : "match";
  return { status, rows };
}

function main(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const profiles = {}, out = { match: [], unsure: [], mismatch: [], unsegmented: [], missing: [], uncalibrated: [] };
  for (const [key, m] of Object.entries(manifest)) {
    const wav = path.join(dir, key + ".wav");
    if (!fs.existsSync(wav)) { out.missing.push(key); continue; }
    profiles[m.voice] = profiles[m.voice] || voiceProfile(m.voice, dir);
    if (!profiles[m.voice].ok) { out.uncalibrated.push({ key, m, r: {} }); continue; }
    const { samples, rate } = readWav(wav);
    const r = checkClip(samples, rate, m.jp.split(/\s+/), profiles[m.voice].profile);
    out[r.status].push({ key, m, r });
  }
  const checked = out.match.length + out.unsure.length + out.mismatch.length;
  const md = ["# Azure clip tone check", ""];
  md.push("Each clip is split into voiced runs; when the run count equals the syllable count, each run is classified against a profile fitted on the same voice's own Azure calibration clips (Cantone clips only if those are missing) and compared with the tones we sent. Clips whose run count differs are only counted. Natural speech has tone sandhi and neutral tones, so a mismatch is a prompt to listen, not proof of a wrong clip.", "");
  md.push(`- clips: ${Object.keys(manifest).length}${out.missing.length ? ` (${out.missing.length} without a WAV)` : ""}`);
  md.push(`- checked (run count = syllable count): ${checked}`);
  md.push(`- matched: ${out.match.length}`);
  md.push(`- unsure (no confident verdict on some syllable, none contradicted): ${out.unsure.length}`);
  md.push(`- mismatched: ${out.mismatch.length}`);
  md.push(`- unsegmented (not checked): ${out.unsegmented.length}`);
  md.push(`- not checked, voice could not be calibrated: ${out.uncalibrated.length}`, "");
  for (const [v, p] of Object.entries(profiles)) md.push(`- ${v}: profile from ${p.source}${p.ok ? "" : ", INVALID (" + p.why + ")"}`);
  md.push("");
  const uncal = Object.keys(profiles).filter((v) => !profiles[v].ok).sort();
  for (const v of uncal) {
    const mine = out.uncalibrated.filter((x) => x.m.voice === v);
    md.push(`## Voice ${v} could not be calibrated`, "", `Nothing from this voice is published until you listen to the ${Math.min(30, mine.length)} clips below (random, fixed seed, from ${mine.length}) and add the line \`voice:${v}\` to data/yue/tts_ok.txt.`, "");
    const by = Object.fromEntries(mine.map((x) => [x.key, x.m]));
    for (const k of sample(mine.map((x) => x.key), 30)) md.push(`- ${k} ${by[k].r} ${by[k].f}: ${by[k].text} (${by[k].jp})`);
    md.push("");
  }
  md.push("## Mismatched, for a listen-through", "", "Held back from speech.json until the key is added to data/yue/tts_ok.txt (one per line).", "");
  for (const { key, m, r } of out.mismatch) {
    const bad = r.rows.filter((x) => !x.unsure && x.got !== x.want).map((x) => `${x.syl} heard ${x.got}`).join(", ");
    md.push(`- ${key} ${m.voice} ${m.r} ${m.f}: ${m.text} (${m.jp}): ${bad}`);
  }
  md.push("");
  fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "reports/yue_tts_check.md"), md.join("\n"));
  fs.writeFileSync(path.join(dir, "check.json"), JSON.stringify({ mismatched: out.mismatch.map((x) => x.key).sort(), uncalibrated: uncal }, null, 1) + "\n");
  console.log(`clips ${Object.keys(manifest).length}  checked ${checked}  matched ${out.match.length}  unsure ${out.unsure.length}  mismatched ${out.mismatch.length}  unsegmented ${out.unsegmented.length}  uncalibrated ${out.uncalibrated.length}`);
}

module.exports = { checkClip, voiceProfile, sample, CANTONE_VOICE };
if (require.main === module) {
  if (!process.argv[2]) { console.error("usage: node scripts/yue_clip_check.js <wav dir>"); process.exit(2); }
  main(process.argv[2]);
}
