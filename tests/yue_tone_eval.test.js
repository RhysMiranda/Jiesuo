// Run: node --test tests/yue_tone_eval.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { labelMode } = require("../scripts/yue_tone_eval.js");
const Y = require("../app/yue/tones.js");

test("labelMode: check only when all three thresholds hold", () => {
  assert.strictEqual(labelMode({ accuracy: 0.91, unsureRate: 0.10, confusions: [[3, 6, 0.08], [6, 3, 0.05]] }), "check");
  assert.strictEqual(labelMode({ accuracy: 0.91, unsureRate: 0.10, confusions: [[3, 6, 0.12]] }), "guide");
  assert.strictEqual(labelMode({ accuracy: 0.95, unsureRate: 0.25, confusions: [[3, 6, 0.02]] }), "guide");
});

test("labelMode: thresholds are inclusive and a low accuracy is a guide", () => {
  assert.strictEqual(labelMode({ accuracy: 0.90, unsureRate: 0.20, confusions: [[1, 3, 0.10]] }), "check");
  assert.strictEqual(labelMode({ accuracy: 0.89, unsureRate: 0.05, confusions: [] }), "guide");
  assert.strictEqual(labelMode({ accuracy: NaN, unsureRate: 0.05, confusions: [] }), "guide");
});

const read = (p) => { const f = path.join(__dirname, "..", p); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };

test("tonecheck.json, if present, has every field and matches DEFAULTS", () => {
  const t = read("app/yue/data/tonecheck.json");
  if (!t) return;
  assert.strictEqual(t.licence, "MIT: Jiesuo (computed)");
  assert.ok(["check", "guide"].includes(t.mode));
  for (const k of ["heldOutAccuracy", "unsureRate"]) assert.ok(typeof t[k] === "number" && t[k] >= 0 && t[k] <= 1, k);
  assert.ok(Array.isArray(t.confusions));
  for (const c of t.confusions) assert.ok(c.length === 3 && c[0] !== c[1] && c[2] >= 0 && c[2] <= 1);
  for (const k of ["shift", "step", "unsure"]) assert.ok(t.params[k] > 0, k);
  assert.deepStrictEqual(t.params, { shift: Y.DEFAULTS.shift, step: Y.DEFAULTS.step, unsure: Y.DEFAULTS.unsure });
  assert.strictEqual(t.mode, labelMode({ accuracy: t.heldOutAccuracy, unsureRate: t.unsureRate, confusions: t.confusions }));
});

test("audio_exclusions.json, if present, maps voice/syl to a reason", () => {
  const e = read("data/yue/audio_exclusions.json");
  if (!e) return;
  for (const [k, v] of Object.entries(e)) {
    assert.match(k, /^(googleA|googleB|amazonHiuJin)\/[a-z]+[1-6]$/);
    assert.match(v, /want \d.*got \d.*margin/);
  }
});

test("exclusion rule: confidently wrong AND at least 2 other voices agree with the label", () => {
  const { exclusionReason } = require("../scripts/yue_tone_eval.js");
  const wrong = { syl: "baa1", want: 1, got: 3, unsure: false, margin: 0.5 };
  const ok = (v) => ({ voice: v, row: { syl: "baa1", want: 1, got: 1, unsure: false, margin: 1 } });
  const others = [ok("googleB"), ok("googleC")];
  const r = exclusionReason("googleA", wrong, others, 0.1);
  assert.match(r, /want 1.*got 3.*margin 0\.50.*googleB, googleC/);
  assert.strictEqual(exclusionReason("googleA", wrong, [ok("googleB")], 0.1), null, "only one agreeing voice: kept");
  assert.strictEqual(exclusionReason("googleA", wrong, [ok("googleB"), { voice: "googleC", row: { ...ok("x").row, unsure: true } }], 0.1), null, "unsure or wrong others do not count");
  assert.strictEqual(exclusionReason("googleA", { ...wrong, margin: 0.15 }, others, 0.1), null, "margin below 2 x unsure: kept");
  assert.strictEqual(exclusionReason("googleA", { ...wrong, unsure: true }, others, 0.1), null);
  assert.strictEqual(exclusionReason("googleA", { ...wrong, got: 1 }, others, 0.1), null, "classified right: kept");
});
