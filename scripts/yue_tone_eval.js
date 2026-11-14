#!/usr/bin/env node
/* Tune and evaluate the Cantonese tone check on the Cantone recordings, and flag bad clips.
   Run: node scripts/yue_tone_eval.js   (first run builds a pitch cache under data/raw/yue/cache/)
   Tunes on the tuning voices only; held-out voices are measured once with the chosen parameters. */
"use strict";
const fs = require("fs");
const path = require("path");
const Tone = require("../app/tone.js");
const Y = require("../app/yue/tones.js");
const Jyut = require("../app/yue/jyutping.js");

const ROOT = path.join(__dirname, "..");
const AUDIO = path.join(ROOT, "data/raw/yue/cantone");
const CACHE = path.join(ROOT, "data/raw/yue/cache");
const TUNE = ["googleA", "googleB", "microsoftHiuGaai", "amazonHiuJin"];
const HELD = ["googleC", "googleD", "microsoftHiuMaan", "microsoftWanLung"];
const NO_SI5 = "no si5 clip (the dataset removed all Apple tone-5 clips), so it cannot be calibrated";
const EXCLUDED_VOICES = { appleAasing: NO_SI5, appleSinji: NO_SI5 };
const SHIPPED = ["googleA", "googleB", "amazonHiuJin"]; // microsoftHiuGaai dropped (R12): it cannot be calibrated
const CROSS_CHECK = ["googleA", "googleB", "googleC", "googleD", "amazonHiuJin"]; // calibratable voices that vouch for a clip (R11)
const ANCHORS = Y.ANCHORS; // ji1 ji3 ji6 ji4 ji2 ji5
const SETS = ["ji", "jau", "jan", "wai", "maa", "ngaa", "lou"]; // voiced six-tone sets used for every profile
const FIELDS = ["t1", "t3", "t6", "t4lo", "t2hi", "t5hi"];
const GRID_SHIFT = [0.25, 0.5, 0.75, 1], GRID_UNSURE = [0.1, 0.15, 0.25, 0.35, 0.5];
const TONES = [1, 2, 3, 4, 5, 6];
const family = (v) => v.replace(/(A|B|C|D|Aasing|Sinji|HiuGaai|HiuMaan|WanLung|HiuJin)$/, "");

/** The labelling rule: a "check" only if all three thresholds hold on held-out voices. */
function labelMode({ accuracy, unsureRate, confusions }) {
  const maxConf = Math.max(0, ...(confusions || []).map((c) => c[2]));
  return accuracy >= 0.9 && maxConf <= 0.1 && unsureRate <= 0.2 ? "check" : "guide";
}

/** Why a shipped clip is excluded, or null. `others` = [{voice, row}] for the same syllable in the other voices.
    Rule (R11): the classifier confidently disagrees with the filename (decided, margin >= 2 x unsure) AND at least 2
    other voices decide the same syllable and get the filename's tone. */
function exclusionReason(voice, row, others, unsure) {
  if (row.unsure || row.got === row.want || !(row.margin >= 2 * unsure)) return null;
  const agree = others.filter((o) => o.voice !== voice && !o.row.unsure && o.row.got === o.row.want).map((o) => o.voice);
  if (agree.length < 2) return null;
  return `classifier decides tone ${row.got} but the file says tone ${row.want}: want ${row.want}, got ${row.got}, margin ${row.margin.toFixed(2)} st; agreeing voices: ${agree.join(", ")}`;
}

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV: " + file);
  let p = 12, rate = 0, bits = 0, ch = 0;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), len = b.readUInt32LE(p + 4), body = p + 8;
    if (id === "fmt ") { ch = b.readUInt16LE(body + 2); rate = b.readUInt32LE(body + 4); bits = b.readUInt16LE(body + 14); }
    if (id === "data") {
      if (bits !== 16 || ch !== 1) throw new Error("not 16-bit mono: " + file);
      const n = Math.min(len, b.length - body) >> 1, out = new Float32Array(n);
      for (let k = 0; k < n; k++) out[k] = b.readInt16LE(body + 2 * k) / 32768;
      return { samples: out, rate };
    }
    p = body + len + (len & 1);
  }
  throw new Error("no data chunk: " + file);
}

/** {syl: voiced Hz of the one syllable} for a voice, cached on disk. */
function voiceClips(voice) {
  const cf = path.join(CACHE, voice + ".json");
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, "utf8"));
  const dir = path.join(AUDIO, voice), files = fs.readdirSync(dir).filter((f) => f.endsWith(".wav")).sort();
  const out = {}, t0 = Date.now();
  files.forEach((f, i) => {
    const { samples, rate } = readWav(path.join(dir, f));
    const seg = Y.segmentsHz(Tone.pitchTrack(samples, rate), 1)[0] || [];
    out[f.slice(0, -4)] = seg.map((h) => Math.round(h * 10) / 10);
    if (i % 500 === 0) console.log(`  ${voice}: ${i}/${files.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
  });
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cf, JSON.stringify(out));
  return out;
}

const toneOf = (syl) => Number(syl.slice(-1));
const allowedFor = (syl) => (Jyut.isChecked(syl) ? [1, 3, 6] : TONES);

/** One profile per voice: per tone, the segments of the same tone in each of the seven six-tone sets. */
function profileOf(clips) {
  const tones = [1, 3, 6, 4, 2, 5];
  const miss = tones.flatMap((t) => SETS.map((x) => x + t)).filter((k) => !clips[k]);
  if (miss.length) return { ok: false, why: "missing anchor clips " + miss.join(" ") };
  const anchors = {};
  tones.forEach((t, i) => { anchors[ANCHORS[i]] = SETS.map((x) => clips[x + t]); });
  const profile = Y.profileFrom(anchors);
  const per = SETS.map((x, k) => Y.profileFrom(Object.fromEntries(ANCHORS.map((n) => [n, anchors[n][k]]))));
  const spread = Object.fromEntries(FIELDS.map((f) => {
    const v = per.map((q) => q[f]).filter(Number.isFinite);
    return [f, v.length ? Math.max(...v) - Math.min(...v) : NaN];
  }));
  const v = Y.validProfile(profile);
  return v.ok ? { ok: true, profile, spread } : { ok: false, why: "profile invalid, redo " + v.redo, profile, spread };
}

/** Classify every clip of a voice with the given params. */
function runVoice(clips, profile, params) {
  const rows = [];
  for (const syl of Object.keys(clips)) {
    let allowed;
    try { allowed = allowedFor(syl); } catch (e) { continue; } // not a Jyutping syllable
    const c = Y.classify(clips[syl], profile, { allowed, params });
    rows.push({ syl, want: toneOf(syl), got: c.tone, unsure: c.unsure, margin: c.margin });
  }
  return rows;
}

function summarise(rows) {
  const n = rows.length, unsure = rows.filter((r) => r.unsure).length;
  const decided = rows.filter((r) => !r.unsure), right = decided.filter((r) => r.got === r.want).length;
  const per = {};
  for (const t of TONES) per[t] = { n: 0, got: {}, unsure: 0 };
  for (const r of rows) {
    const p = per[r.want];
    p.n++;
    if (r.unsure) p.unsure++; else p.got[r.got] = (p.got[r.got] || 0) + 1;
  }
  const confusions = [];
  for (const t of TONES) for (const g of TONES) if (g !== t && per[t].got[g]) confusions.push([t, g, per[t].got[g] / per[t].n]);
  confusions.sort((a, b) => b[2] - a[2]);
  return { n, unsureRate: n ? unsure / n : NaN, accuracy: decided.length ? right / decided.length : NaN, decided: decided.length, per, confusions };
}

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/a");
function matrixMd(s) {
  const lines = ["| want \\ heard | " + TONES.join(" | ") + " | not sure | items |", "|---|" + "---|".repeat(TONES.length + 2)];
  for (const t of TONES) {
    const p = s.per[t];
    lines.push(`| ${t} | ` + TONES.map((g) => pct((p.got[g] || 0) / (p.n || NaN))).join(" | ") + ` | ${pct(p.unsure / (p.n || NaN))} | ${p.n} |`);
  }
  return lines.join("\n");
}

function main() {
  const t0 = Date.now();
  const all = [...TUNE, ...HELD];
  const clips = {}, profiles = {}, excluded = {};
  for (const v of all) {
    console.log("voice " + v);
    clips[v] = voiceClips(v);
    const p = profileOf(clips[v]);
    if (p.ok) profiles[v] = p.profile; else { excluded[v] = p.why; console.log("  EXCLUDED: " + p.why); }
  }
  const profs = {};
  for (const v of all) { const pr = profileOf(clips[v]); if (pr.profile) profs[v] = pr; }
  const gap = (v) => profiles[v].t3 - profiles[v].t6;
  const tuneOk = TUNE.filter((v) => profiles[v]), heldOk = HELD.filter((v) => profiles[v]);
  const minGap = Math.min(...tuneOk.map(gap));
  const shifts = GRID_SHIFT.filter((s) => s < minGap / 2);
  if (!shifts.length) throw new Error("no shift in the grid is below half the tuning 3-6 gap " + minGap);

  // Grid search on tuning voices only.
  const grid = [];
  for (const shift of shifts) for (const unsure of GRID_UNSURE) {
    const params = { shift, step: Y.DEFAULTS.step, unsure };
    const s = summarise(tuneOk.flatMap((v) => runVoice(clips[v], profiles[v], params)));
    grid.push({ shift, unsure, accuracy: s.accuracy, unsureRate: s.unsureRate, objective: s.accuracy * (1 - s.unsureRate) });
  }
  const best = grid.reduce((a, b) => (b.objective > a.objective ? b : a));
  const params = { shift: best.shift, step: Y.DEFAULTS.step, unsure: best.unsure };
  console.log("chosen", params);

  // Held-out, measured once with the chosen params.
  const rowsBy = {};
  for (const v of all) if (profiles[v]) rowsBy[v] = runVoice(clips[v], profiles[v], params);
  const held = summarise(heldOk.flatMap((v) => rowsBy[v]));
  const mode = labelMode(held);
  const tonecheck = {
    licence: "MIT: Jiesuo (computed)", mode, heldOutAccuracy: held.accuracy, unsureRate: held.unsureRate,
    confusions: held.confusions.filter((c) => c[2] >= 0.005).map(([a, b, c]) => [a, b, Math.round(c * 1e4) / 1e4]), params,
  };
  const maxConf = held.confusions[0] || [0, 0, 0];

  // Exclusions (R11): shipped voices only; a confidently wrong clip is dropped only if >= 2 other calibratable voices agree with its label.
  const bySyl = {};
  for (const v of CROSS_CHECK) if (profiles[v]) for (const r of rowsBy[v]) (bySyl[r.syl] = bySyl[r.syl] || []).push({ voice: v, row: r });
  const exclusions = {};
  for (const v of SHIPPED) if (profiles[v]) {
    for (const r of rowsBy[v]) {
      const why = exclusionReason(v, r, bySyl[r.syl] || [], params.unsure);
      if (why) exclusions[`${v}/${r.syl}`] = why;
    }
  }

  // Report.
  const fams = {};
  for (const v of heldOk) (fams[family(v)] = fams[family(v)] || []).push(v);
  const anchorN = heldOk.length * SETS.length * 6;
  const md = [];
  md.push("# Cantonese tone check: held-out evaluation", "");
  md.push(`**Result: the tone feedback is a ${mode.toUpperCase()}.**`, "");
  md.push("These voices are synthetic; real voices, especially in a noisy room, will do worse. The numbers below are an upper bound.", "");
  md.push("Rule: a check needs, on held-out voices, accuracy on decided items >= 90%, no single confusion above 10% of that tone's items, and \"not sure\" on <= 20% of items. Otherwise it is a guide.", "");
  md.push("| measure | held-out | needed | met |", "|---|---|---|---|");
  md.push(`| accuracy on decided items | ${pct(held.accuracy)} | >= 90% | ${held.accuracy >= 0.9 ? "yes" : "NO"} |`);
  md.push(`| largest single confusion | ${maxConf[0]} -> ${maxConf[1]}, ${pct(maxConf[2])} | <= 10% | ${maxConf[2] <= 0.1 ? "yes" : "NO"} |`);
  md.push(`| "not sure" rate | ${pct(held.unsureRate)} | <= 20% | ${held.unsureRate <= 0.2 ? "yes" : "NO"} |`, "");
  md.push(`Held-out items: ${held.n} clips from ${heldOk.join(", ")} (${held.decided} decided). This includes the ${anchorN} calibration clips (the 42 clips of the seven calibration sets per voice), which the profiles were built from.`, "");
  const gd = profs.googleD ? profs.googleD.spread : null;
  md.push("## How far to trust these numbers", "");
  md.push(`- Held-out is ${heldOk.join(" and ")}: one engine, not a spread of vendors. ${HELD.length - heldOk.length} of the ${HELD.length} planned held-out voices (${Object.keys(excluded).filter((v) => HELD.includes(v)).join(", ")}) could not be calibrated.${gd ? ` googleD's calibration is unstable: its per-set spreads are t1 ${gd.t1.toFixed(1)}, t3 ${gd.t3.toFixed(1)}, t6 ${gd.t6.toFixed(1)}, t2 end ${gd.t2hi.toFixed(1)} st (probably pitch octave errors), so the held-out accuracy is low-confidence.` : ""}`);
  md.push("- Parameters were chosen on the tuning voices only. But the calibration method was changed (single si clips, then the ji series with medians over seven sets) after calibration failures on held-out voices were seen, and held-out voices were evaluated in more than one round. Nothing was fitted to held-out accuracy, but this is not a single untouched test.");
  md.push("- The excluded-clips list is disputed clips as judged by this same classifier, with other voices vouching for the label. It is not confirmed bad audio.");
  md.push(`- The tuned shift of ${best.shift} st tolerates only about +/- ${best.shift} st of pitch drift. Real speakers who drift will see more \"not sure\".`, "");
  md.push("## Chosen parameters", "");
  md.push(`shift ${params.shift} st, step ${params.step} st, unsure ${params.unsure} st. Chosen by grid search over shift ${JSON.stringify(shifts)} x unsure ${JSON.stringify(GRID_UNSURE)} on the tuning voices only (${tuneOk.join(", ")}), maximising decided-accuracy x (1 - unsure rate). Shift values at or above half the smallest tuning-voice tone 3-6 gap (${minGap.toFixed(2)} st) were not tried, because drift of half the gap makes tones 3 and 6 confusable.`, "");
  md.push("| shift | unsure | accuracy | not sure | objective |", "|---|---|---|---|---|");
  for (const g of grid) md.push(`| ${g.shift} | ${g.unsure} | ${pct(g.accuracy)} | ${pct(g.unsureRate)} | ${g.objective.toFixed(4)}${g === best ? " (chosen)" : ""} |`);
  md.push("", "## Voices", "");
  md.push("| voice | role | tone 3-6 gap (st) | items | accuracy | not sure |", "|---|---|---|---|---|---|");
  for (const v of all) {
    const role = TUNE.includes(v) ? "tuning" : "held-out";
    if (!profiles[v]) { md.push(`| ${v} | ${role} | - | - | excluded: ${excluded[v]} | - |`); continue; }
    const s = summarise(rowsBy[v]);
    md.push(`| ${v} | ${role} | ${gap(v).toFixed(2)} | ${s.n} | ${pct(s.accuracy)} | ${pct(s.unsureRate)} |`);
  }
  md.push("", "Calibration profiles (semitones re 55 Hz): per field, the median over the seven voiced six-tone sets (ji, jau, jan, wai, maa, ngaa, lou) of the voice's own clips; spread = max minus min of the per-set values:", "");
  md.push("| voice | t1 | t3 | t6 | t4 end | t2 end | t5 end | 3-6 gap | valid |", "|---|---|---|---|---|---|---|---|---|");
  for (const v of all) {
    const pr = profs[v];
    if (pr) md.push(`| ${v} | ${FIELDS.map((f) => pr.profile[f].toFixed(2) + " (spread " + pr.spread[f].toFixed(2) + ")").join(" | ")} | ${(pr.profile.t3 - pr.profile.t6).toFixed(2)} | ${profiles[v] ? "yes" : "NO: " + excluded[v]} |`);
    else md.push(`| ${v} | - | - | - | - | - | - | - | NO: ${excluded[v]} |`);
  }
  md.push("", "Excluded from tuning and held-out metrics:", "");
  for (const [v, why] of Object.entries(EXCLUDED_VOICES)) md.push(`- ${v}: ${why}.`);
  for (const [v, why] of Object.entries(excluded)) md.push(`- ${v}: ${why}.`);
  const tight = heldOk.filter((v) => gap(v) / 2 <= params.shift);
  if (tight.length) md.push("", `Warning: held-out voice(s) ${tight.join(", ")} have a 3-6 gap at or below twice the chosen shift (${params.shift} st), so tones 3 and 6 can be confused by drift alone.`);
  md.push("", "## Confusion matrix, all held-out voices", "", "Rows: the tone the file says. Columns: the tone heard, as a share of that tone's items.", "", matrixMd(held));
  for (const [f, vs] of Object.entries(fams)) {
    const s = summarise(vs.flatMap((v) => rowsBy[v]));
    const top = s.confusions[0] ? `${s.confusions[0][0]} -> ${s.confusions[0][1]} ${pct(s.confusions[0][2])}` : "none";
    md.push("", `## Confusion matrix, ${f} voices (${vs.join(", ")})`, "", `Accuracy on decided ${pct(s.accuracy)}, not sure ${pct(s.unsureRate)}, largest confusion ${top}.`, "", matrixMd(s));
  }
  md.push("", "## Largest confusions, held-out", "", ...held.confusions.slice(0, 8).map(([a, b, c]) => `- ${a} -> ${b}: ${pct(c)}`));
  md.push("", "## Excluded clips", "");
  md.push(`Shipped voices (${SHIPPED.join(", ")}) lose a clip only when the classifier confidently disagrees with the filename (decided, margin >= 2 x unsure = ${(2 * params.unsure).toFixed(2)} st) AND at least 2 other calibratable voices (${CROSS_CHECK.join(", ")}) decide the same syllable and agree with the filename. The other voices are used only as a cross-check of clip quality, never for parameter selection. microsoftHiuGaai is not shipped (it cannot be calibrated). ${Object.keys(exclusions).length} clips excluded.`, "");
  for (const v of SHIPPED) md.push(`- ${v}: ${Object.keys(exclusions).filter((k) => k.startsWith(v + "/")).length}`);
  md.push("", "Full list with reasons: data/yue/audio_exclusions.json.", "");
  const sample = Object.entries(exclusions).slice(0, 30);
  for (const [k, r] of sample) md.push(`- ${k}: ${r}`);
  if (Object.keys(exclusions).length > sample.length) md.push(`- ... and ${Object.keys(exclusions).length - sample.length} more`);
  md.push("", `Run time (including any pitch tracking not yet cached): ${Math.round((Date.now() - t0) / 1000)} s.`, "");

  fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "reports/yue_tone_check.md"), md.join("\n"));
  fs.mkdirSync(path.join(ROOT, "app/yue/data"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "app/yue/data/tonecheck.json"), JSON.stringify(tonecheck, null, 2) + "\n");
  fs.mkdirSync(path.join(ROOT, "data/yue"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "data/yue/audio_exclusions.json"), JSON.stringify(exclusions, null, 1) + "\n");
  console.log(`mode ${mode}  acc ${pct(held.accuracy)}  unsure ${pct(held.unsureRate)}  max confusion ${maxConf[0]}->${maxConf[1]} ${pct(maxConf[2])}  exclusions ${Object.keys(exclusions).length}`);
  if (params.shift !== Y.DEFAULTS.shift || params.unsure !== Y.DEFAULTS.unsure) console.log("NOTE: set DEFAULTS in app/yue/tones.js to " + JSON.stringify(params));
}

module.exports = { labelMode, readWav, exclusionReason };
if (require.main === module) main();
