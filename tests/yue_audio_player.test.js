"use strict";
const test = require("node:test");
const assert = require("node:assert");
const A = require("../app/yue/audio.js");
const S = require("../app/yue/sounds.js");
const audio = require("../app/yue/data/audio.json");

A.init(audio);

test("clipUrl returns null when no clip", () => {
  assert.strictEqual(A.clipUrl("m4", 0), null);
  assert.strictEqual(A.clipUrl("zzz9", 0), null);
});

test("clipUrl builds the path and falls back to a voice that has the clip", () => {
  assert.strictEqual(A.clipUrl("si1", 0), "audio/googleB/si1.mp3");
  A.init({ voices: [{ id: "a" }, { id: "b" }, { id: "c" }], clips: { x1: [2] } });
  assert.strictEqual(A.clipUrl("x1", 0), "audio/c/x1.mp3");
  assert.strictEqual(A.clipUrl("x1", 99), "audio/c/x1.mp3");
  assert.strictEqual(A.clipUrl("x1", -1), "audio/c/x1.mp3");
  assert.strictEqual(A.clipUrl("x1", 2), "audio/c/x1.mp3");
  A.init(audio);
});

test("voiceForAll keeps a group in one voice", () => {
  A.init({ voices: [{ id: "a" }, { id: "b" }, { id: "c" }], clips: { x1: [0, 1, 2], x2: [1, 2], x3: [2, 1] } });
  assert.strictEqual(A.voiceForAll(["x1", "x2", "x3"], 0), 1); // preferred lacks x2: first voice with all
  assert.strictEqual(A.voiceForAll(["x1", "x2", "x3"], 2), 2); // preferred has them all
  assert.strictEqual(A.voiceForAll(["x1"], 0), 0);
  assert.strictEqual(A.voiceForAll("x2", undefined), 1);
  assert.strictEqual(A.voiceForAll(["x1", "nope"], 0), null); // nobody has all: callers fall back per syllable
  assert.strictEqual(A.voiceForAll([], 0), null);
  A.init(audio);
  const ladder = [1, 2, 3, 4, 5, 6].map((t) => "si" + t);
  const v = A.voiceForAll(ladder, 0);
  assert.ok(v !== null && ladder.every((s) => audio.clips[s].includes(v)));
});

test("clipsFromUrls maps cached clip URLs to the shape of audio.clips", () => {
  A.init({ voices: [{ id: "a" }, { id: "b" }], clips: { x1: [0, 1], x2: [1] } });
  const got = A.clipsFromUrls(["http://h/yue/audio/b/x1.mp3", "http://h/yue/audio/a/x1.mp3", "http://h/yue/audio/a/x2.mp3",
    "http://h/yue/audio/zz/x1.mp3", "http://h/yue/index.html", "http://h/yue/audio/b/x2.mp3", "http://h/yue/audio/b/x2.mp3"]);
  assert.deepStrictEqual(got, { x1: [1, 0], x2: [1] }); // unknown voices and clips audio.json lacks are left out
  A.init(audio);
});

test("voicesFor follows audio.json", () => {
  assert.deepStrictEqual(A.voicesFor("aa1"), audio.clips.aa1);
  assert.deepStrictEqual(A.voicesFor("m4"), []);
  assert.deepStrictEqual(A.voicesFor("nope1"), []);
});

test("failed playback skips without scoring", () => {
  assert.deepStrictEqual(A.afterPlay("failed", {}), { skip: true, message: "This sound isn't downloaded yet" });
  assert.deepStrictEqual(A.afterPlay("played", {}), { skip: false, message: "" });
});

test("play resolves failed without throwing when there is no clip or no DOM", async () => {
  assert.strictEqual(await A.play("m4", { voice: 0 }), "failed");
  assert.strictEqual(await A.play("si1", { voice: 0 }), "failed"); // no fetch/Audio in this context
});

test("chart model: only rows and columns with audio, cells list their tones", () => {
  const m = S.buildChart({ clips: { si1: [0], si6: [0], sik1: [0], aa1: [0], aa3: [0], m4: [], ngaa4: [0] } });
  assert.deepStrictEqual(m.initials, ["", "ng", "s"]);
  assert.deepStrictEqual(m.finals, ["aa", "i", "ik"]);
  assert.deepStrictEqual(m.cell("s", "i"), [1, 6]);
  assert.strictEqual(m.cell("s", "aa"), null);
  assert.deepStrictEqual(m.cell("", "aa"), [1, 3]);
});

test("tone tabs: checked finals show only 1, 3 and 6", () => {
  assert.deepStrictEqual(S.tonesShown("sik"), [1, 3, 6]);
  assert.deepStrictEqual(S.tonesShown("si"), [1, 2, 3, 4, 5, 6]);
});

test("mix-up sentences are plain", () => {
  assert.strictEqual(S.confusionText(6, 3), "You hear tone 6 as tone 3 most often");
  assert.strictEqual(S.confusionText(2, 5, false), "You hear tone 2 as tone 5 sometimes");
});

test("blocked playback asks for another tap", () => {
  assert.deepStrictEqual(A.afterPlay("blocked", {}), { skip: true, message: "Tap again to hear it" });
});

test("withTimeout settles once with the fallback", async () => {
  assert.strictEqual(await A.withTimeout(new Promise(() => {}), 20, "failed"), "failed");
  assert.strictEqual(await A.withTimeout(Promise.resolve("ok"), 500, "failed"), "ok");
  assert.strictEqual(await A.withTimeout(Promise.reject(new Error("x")), 500, "failed"), "failed");
});
