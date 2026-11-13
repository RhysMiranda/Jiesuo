// Run: node --test tests/handwriting.test.js (after python -m jiesuo.export_handwriting)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const H = require("../app/handwriting.js");

const index = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/data/handwriting.json"), "utf8"));
const chars = H.load(index);
/** A character as someone might draw it: its own medians, shifted, scaled and a little shaky. */
function drawn(ch, { order = null, seed = 1 } = {}) {
  const file = path.join(__dirname, "../app/strokes", ch.codePointAt(0).toString(16) + ".json");
  const medians = JSON.parse(fs.readFileSync(file, "utf8")).medians;
  let r = seed;
  const jitter = () => { r = (r * 9301 + 49297) % 233280; return (r / 233280 - 0.5) * 30; };
  const strokes = medians.map((m) => m.map(([x, y]) => [x * 0.4 + 50 + jitter(), (900 - y) * 0.4 + 20 + jitter()]));
  return order ? order.map((k) => strokes[k]) : strokes;
}

test("handwriting: the index covers the characters the app teaches", () => {
  assert.ok(chars.length > 3000);
  assert.ok(index.chars.includes("好") && index.chars.includes("学"));
});

test("handwriting: a drawn character comes first, or near it", () => {
  for (const ch of ["好", "学", "人", "口", "我", "爱", "水", "国"]) {
    const top = H.recognise(chars, drawn(ch)).map((x) => x.ch);
    assert.ok(top.slice(0, 3).includes(ch), `${ch}: ${top.join("")}`);
  }
});

test("handwriting: wrong stroke order still finds the character", () => {
  const top = H.recognise(chars, drawn("十", { order: [1, 0] })).map((x) => x.ch);
  assert.ok(top.slice(0, 5).includes("十"), top.join(""));
});

test("handwriting: nothing drawn gives nothing", () => {
  assert.deepStrictEqual(H.recognise(chars, []), []);
});
