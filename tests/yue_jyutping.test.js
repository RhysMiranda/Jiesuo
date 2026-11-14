const test = require("node:test");
const assert = require("node:assert");
const J = require("../app/yue/jyutping.js");

const CASES = [["si1", ["s", "i", 1]], ["ngo5", ["ng", "o", 5]], ["ng5", ["", "ng", 5]], ["m4", ["", "m", 4]],
  ["gwong2", ["gw", "ong", 2]], ["jyut6", ["j", "yut", 6]], ["aa3", ["", "aa", 3]], ["sik6", ["s", "ik", 6]]];

test("parse known syllables", () => { for (const [s, want] of CASES) assert.deepStrictEqual(J.parse(s), want); });
test("parse rejects bad", () => { for (const bad of ["si7", "si", "xyz1", "sx1", ""]) assert.throws(() => J.parse(bad)); });
test("split glued and spaced", () => {
  assert.deepStrictEqual(J.split("mat1je5"), ["mat1", "je5"]);
  assert.deepStrictEqual(J.split("mat1 je5"), ["mat1", "je5"]);
});
test("checked", () => { assert.ok(J.isChecked("sik1") && J.isChecked("sek3") && !J.isChecked("si1")); });
test("toneless and sets", () => { assert.strictEqual(J.toneless("nei5"), "nei"); assert.strictEqual(J.INITIALS.length, 19); assert.ok(J.FINALS.has("ng")); });
test("normalise accepts case and spacing", () => {
  assert.strictEqual(J.normalise(" SI 1 "), "si1");
  assert.strictEqual(J.normalise("Nei5  Hou2"), "nei5 hou2");
});
test("answerMatches", () => {
  const o = { needTone: true };
  assert.strictEqual(J.answerMatches("si", "si1", o), "needTone");
  assert.strictEqual(J.answerMatches("si3", "si1", o), "wrong");
  assert.strictEqual(J.answerMatches("SI1", "si1", o), "right");
});
