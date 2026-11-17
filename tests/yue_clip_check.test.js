// Run: node --test tests/yue_clip_check.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { checkClip, voiceProfile, CANTONE_VOICE } = require("../scripts/yue_clip_check.js");
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
