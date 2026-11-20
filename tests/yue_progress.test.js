// Run: node --test tests/yue_progress.test.js
const test = require("node:test");
const assert = require("node:assert");
const C = require("../app/yue/course.js");

const T = "2026-11-19";
const mkCourse = (n, grammarAt) => ({ order: Array.from({ length: n }, (_, i) => (i === grammarAt ? "g:zo2" : "w" + i)) });

test("bands hold 50 items, with 1-based inclusive from and to", () => {
  const lib = C.library(mkCourse(120), {}, T);
  assert.deepStrictEqual(lib.bands.map((b) => [b.from, b.to]), [[1, 50], [51, 100], [101, 120]]);
  assert.deepStrictEqual(lib.bands.map((b) => b.cells.length), [50, 50, 20]);
  assert.strictEqual(lib.bands[0].cells[0].item, "w0");
  assert.strictEqual(lib.bands[2].cells[19].item, "w119");
  assert.strictEqual(C.library(mkCourse(50), {}, T).bands.length, 1);
});

test("strong needs box 4 or more in all three skills; grammar needs hearing only", () => {
  const course = mkCourse(5, 4);
  const words = {
    w0: { h: [4, "2026-12-01"], r: [5, "2026-12-01"], t: [6, "2026-12-01"], seen: T }, // strong
    w1: { h: [4, "2026-12-01"], r: [3, "2026-12-01"], t: [6, "2026-12-01"], seen: T }, // learning
    w2: { h: [6, "2026-12-01"], seen: T }, // one skill only: learning
    w3: { seen: T }, // seen, nothing scheduled: learning
    "g:zo2": { h: [4, "2026-12-01"], seen: T }, // strong
  };
  const lib = C.library(course, words, T);
  assert.deepStrictEqual(lib.bands[0].cells.map((c) => c.state), ["strong", "learning", "learning", "learning", "strong"]);
  assert.strictEqual(lib.bands[0].cells[4].grammar, true);
  assert.strictEqual(lib.bands[0].learned, 5);
  assert.deepStrictEqual(lib.skills, { h: { learned: 4, strong: 4 }, r: { learned: 2, strong: 1 }, t: { learned: 2, strong: 2 } });
});

test("due counts items with any skill due today or earlier, once each", () => {
  const words = {
    w0: { h: [1, T], r: [1, "2026-11-01"], seen: "2026-11-01" }, // two skills due: one item
    w1: { h: [2, "2026-11-20"], seen: T },
    w60: { t: [1, "2026-11-18"], seen: T },
  };
  const lib = C.library(mkCourse(70), words, T);
  assert.deepStrictEqual(lib.bands.map((b) => [b.learned, b.due]), [[2, 1], [1, 1]]);
  assert.strictEqual(lib.bands[0].cells[0].due, true);
  assert.strictEqual(lib.bands[0].cells[1].due, false);
});

test("an empty words gives all-zero counts and every cell new", () => {
  const lib = C.library(mkCourse(60), {}, T);
  assert.ok(lib.bands.every((b) => b.learned === 0 && b.due === 0 && b.cells.every((c) => c.state === "new")));
  assert.deepStrictEqual(lib.skills, { h: { learned: 0, strong: 0 }, r: { learned: 0, strong: 0 }, t: { learned: 0, strong: 0 } });
  assert.deepStrictEqual(C.library({}, null, T), { bands: [], skills: lib.skills });
});

test("words outside the course order still count toward the skills, not the bands", () => {
  const lib = C.library(mkCourse(3), { stray: { h: [5, "2026-12-01"], seen: T } }, T);
  assert.strictEqual(lib.skills.h.learned, 1);
  assert.strictEqual(lib.bands[0].learned, 0);
});
