// Run: node --test tests/yue_speak.test.js
const test = require("node:test");
const assert = require("node:assert");
const S = require("../app/yue/speak.js");

test("guide mode names the checker's main mix-ups in plain words", () => {
  const t = S.guideText({ mode: "guide", confusions: [[2, 5, 0.15], [3, 1, 0.11], [5, 2, 0.12], [6, 3, 0.05]] });
  assert.match(t, /guide/);
  assert.match(t, /It often mixes up tones 2 and 5, and tones 1 and 3\./);
  assert.match(S.guideText({ mode: "guide", confusions: [[3, 6, 0.05], [1, 2, 0.04], [4, 6, 0.01]] }), /tones 3 and 6, and tones 1 and 2\./);
  assert.strictEqual(S.guideText({ mode: "check", confusions: [[2, 5, 0.2]] }), "");
  assert.match(S.guideText(require("../app/yue/data/tonecheck.json")), /mixes up tones \d and \d/);
});

test("recording switches the iOS audio session to play-and-record and back", async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const seq = [];
  let type = "playback";
  const session = { get type() { return type; }, set type(v) { seq.push(v); type = v; } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { audioSession: session,
    mediaDevices: { getUserMedia: async () => { seq.push("mic:" + type); throw new Error("no"); } } } });
  try {
    await assert.rejects(S.record(1), (e) => e && e.denied === true);
    assert.deepStrictEqual(seq, ["play-and-record", "mic:play-and-record", "playback"]);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => { throw new Error("no"); } } } });
    await assert.rejects(S.record(1), (e) => e && e.denied === true); // no audioSession: still fine
  } finally {
    if (had) Object.defineProperty(globalThis, "navigator", had); else delete globalThis.navigator;
  }
});

test("not heard says it didn't catch that", () => {
  assert.strictEqual(S.verdictText({ heard: false, results: [] }, "guide"), "Didn't catch that, try again");
});
test("unsure says not sure", () => {
  const r = { heard: true, results: [{ syl: "ji1", want: 1, got: 3, ok: false, unsure: true }] };
  assert.strictEqual(S.verdictText(r, "guide"), "Not sure, try once more");
});
test("guide mode words the result as a guide", () => {
  const r = { heard: true, results: [{ syl: "ji1", want: 1, got: 3, ok: false, unsure: false }] };
  assert.strictEqual(S.verdictText(r, "guide"), "Sounded like tone 3");
  const ok = { heard: true, results: [{ syl: "ji1", want: 1, got: 1, ok: true, unsure: false }] };
  assert.match(S.verdictText(ok, "guide"), /Sounded like tone 1/);
});
test("two syllables are joined", () => {
  const r = { heard: true, results: [{ want: 1, got: 1, ok: true }, { want: 2, got: 4, ok: false }] };
  assert.strictEqual(S.verdictText(r, "guide"), "Sounded like tone 1, then tone 4");
});
test("never a red cross or wrong", () => {
  for (const m of ["guide", "check"]) {
    const t = S.verdictText({ heard: true, results: [{ want: 1, got: 6, ok: false }] }, m);
    assert.doesNotMatch(t, /wrong|✗|❌|incorrect/i);
  }
});
test("unheard attempt is not recorded", () => {
  assert.strictEqual(S.shouldRecord({ heard: false }), false);
  assert.strictEqual(S.shouldRecord({ skipped: true }), false);
  assert.strictEqual(S.shouldRecord({ heard: true, results: [{ unsure: true }] }), false);
  assert.strictEqual(S.shouldRecord({ heard: true, results: [{ unsure: false, ok: true }] }), true);
});

test("panelState sends a missing or broken profile to calibration", () => {
  assert.strictEqual(S.panelState(undefined), "calibrate");
  assert.strictEqual(S.panelState({ t1: NaN, t3: 1, t6: 0, t4lo: -1, t2hi: 5, t5hi: 3 }), "calibrate");
  assert.strictEqual(S.panelState({ t1: 10, t3: 8, t6: 6, t4lo: 4, t2hi: 10, t5hi: 8 }), "say");
});
