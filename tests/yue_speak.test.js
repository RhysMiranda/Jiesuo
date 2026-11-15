// Run: node --test tests/yue_speak.test.js
const test = require("node:test");
const assert = require("node:assert");
const S = require("../app/yue/speak.js");

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
