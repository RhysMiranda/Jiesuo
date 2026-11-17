// Run: node --test tests/yue_clip_check.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { checkClip, voiceProfile, sample, CANTONE_VOICE } = require("../scripts/yue_clip_check.js");
const { readWav, voiceClips, profileOf } = require("../scripts/yue_tone_eval.js");

const DIR = path.join(__dirname, "../data/raw/yue/cantone/googleA");
const have = fs.existsSync(path.join(DIR, "ji1.wav")) && fs.existsSync(path.join(__dirname, "../data/raw/yue/cache/googleA.json"));

test("silence is unsegmented, never a verdict", () => {
  const r = checkClip(new Float32Array(24000), 24000, ["nei5", "hou2"], {});
  assert.strictEqual(r.status, "unsegmented");
});

test("both Azure voices map to their Cantone recordings", () => {
  assert.deepStrictEqual(Object.values(CANTONE_VOICE).sort(), ["microsoftHiuMaan", "microsoftWanLung"]);
  assert.throws(() => voiceProfile("zh-HK-Nobody"));
});

test("an uncalibratable voice is reported, not loosened", { skip: !fs.existsSync(path.join(__dirname, "../data/raw/yue/cache/microsoftHiuMaan.json")) }, () => {
  const p = voiceProfile("zh-HK-HiuMaanNeural");
  assert.strictEqual(typeof p.ok, "boolean");
  if (!p.ok) assert.match(p.why, /profile invalid/);
});

test("with a valid profile a single-syllable clip matches its own tone and mismatches another", { skip: !have }, () => {
  const p = profileOf(voiceClips("googleA"));
  assert.ok(p.ok);
  const { samples, rate } = readWav(path.join(DIR, "ji1.wav"));
  assert.strictEqual(checkClip(samples, rate, ["ji1"], p.profile).status, "match");
  assert.strictEqual(checkClip(samples, rate, ["ji4"], p.profile).status, "mismatch");
});

test("the listen-through sample is seeded, sorted-input independent and at most 30", () => {
  const keys = Array.from({ length: 100 }, (_, i) => "k" + i);
  const a = sample(keys, 30), b = sample(keys.slice().reverse(), 30);
  assert.strictEqual(a.length, 30);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(new Set(a).size, 30);
  assert.strictEqual(sample(["x", "y"], 30).length, 2);
});

test("Azure calibration clips are used when present; an incomplete set is invalid, with no fallback", () => {
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "ttscal-"));
  const cd = path.join(dir, "calib", "zh-HK-HiuMaanNeural");
  fs.mkdirSync(cd, { recursive: true });
  const w = path.join(__dirname, "../data/raw/yue/cantone/googleA/ji1.wav");
  if (fs.existsSync(w)) fs.copyFileSync(w, path.join(cd, "ji1.wav"));
  else fs.writeFileSync(path.join(cd, "ji1.wav"), Buffer.alloc(0));
  if (fs.existsSync(w)) {
    const p = voiceProfile("zh-HK-HiuMaanNeural", dir);
    assert.strictEqual(p.ok, false);
    assert.strictEqual(p.source, "Azure calibration clips");
    assert.match(p.why, /missing anchor clips/);
  }
});
