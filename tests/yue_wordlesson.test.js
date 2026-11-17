"use strict";
const test = require("node:test");
const assert = require("node:assert");
const W = require("../app/yue/wordlesson.js");

test("feedbackFor names the syllable with the wrong tone", () => {
  assert.strictEqual(W.feedbackFor({ type: "type" }, "nei5hou3", "nei5 hou2"), "hou: you typed tone 3, it's tone 2");
});
test("feedbackFor: missing tone, wrong syllable, wrong count, garbage, right", () => {
  assert.strictEqual(W.feedbackFor({ type: "type" }, "nei5 hou", "nei5 hou2"), "hou: add the tone number, it's tone 2");
  assert.strictEqual(W.feedbackFor({ type: "type" }, "nei5 sik6", "nei5 hou2"), "syllable 2: you typed sik, it's hou");
  assert.match(W.feedbackFor({ type: "type" }, "nei5", "nei5 hou2"), /1 syllable.*2/);
  assert.match(W.feedbackFor({ type: "type" }, "???", "nei5 hou2"), /nei5 hou2/);
  assert.match(W.feedbackFor({ type: "type" }, "Nei5 Hou2", "nei5 hou2"), /^Yes/);
});
test("feedbackFor for pick steps", () => {
  assert.match(W.feedbackFor({ type: "read" }, "hi", "hello"), /hello/);
  assert.match(W.feedbackFor({ type: "hear" }, "hello", "hello"), /^Yes/);
});
test("stepLabel", () => {
  assert.strictEqual(W.stepLabel({ type: "meet" }), "New word");
  assert.strictEqual(W.stepLabel({ type: "meet", grammar: true }), "New grammar");
  assert.strictEqual(W.stepLabel({ type: "hear", item: "你好" }), "Review: hearing");
  assert.strictEqual(W.stepLabel({ type: "read", item: "你好" }), "Review: reading");
  assert.strictEqual(W.stepLabel({ type: "type", item: "你好" }), "Review: typing");
  assert.strictEqual(W.stepLabel({ type: "hear", item: "你好" }, true), "New word: hearing");
  assert.strictEqual(W.stepLabel({ type: "hear", item: "g:zo2" }, true), "New grammar: hearing");
  assert.strictEqual(W.stepLabel({ type: "sentence" }), "Closing sentence");
});
test("changedNote uses the character's main reading", () => {
  const chars = { 個: ["go3"], 名: ["ming4", "meng2"] };
  assert.strictEqual(W.changedNote("個名", "go3 meng2", chars), "This word changes 名 ming4 \u2192 meng2");
  assert.strictEqual(W.changedNote("個", "go3", chars), "");
});
test("creditParts for each source", () => {
  const t = W.creditParts({ source: "tatoeba", author: "nickyeow", enAuthor: "CK", enId: 433811 }, "tatoeba:486580", () => null);
  assert.strictEqual(t.map((p) => p.t).join(""), "Tatoeba #486580 by nickyeow; English #433811 by CK (CC BY 2.0 FR)");
  assert.ok(t.some((p) => p.href === "https://tatoeba.org/en/sentences/show/486580"));
  const w = W.creditParts({ source: "wordshk" }, "wordshk:49900#1", (id) => (id === "49900" ? "喺" : null));
  assert.ok(w.some((p) => p.t === "words.hk" && p.href === "https://words.hk/zidin/" + encodeURIComponent("喺")));
  assert.ok(w.some((p) => p.href === "https://words.hk/base/hoifong/"));
  assert.strictEqual(W.creditParts({ source: "hkcancor" }, "hkcancor:x#1", () => null).map((p) => p.t).join(""), "HKCanCor (CC BY 4.0)");
});
test("clean strips # link markers", () => { assert.strictEqual(W.clean("一連串嘅#高山 and #舐嘢"), "一連串嘅高山 and 舐嘢"); });
test("usableSteps accepts planDay steps and refuses damage", () => {
  const ok = [{ type: "meet", item: "你好", form: "你好", jp: "nei5 hou2", en: "hello" },
    { type: "hear", item: "你好", skill: "h", prompt: { text: "你好", jp: "nei5 hou2" }, options: ["a", "b"], answer: "a" },
    { type: "type", item: "你好", skill: "t", prompt: { en: "hello", jp: "nei5 hou2", text: "你好" }, options: ["你好", "a"], answer: "nei5 hou2", answerForm: "你好" },
    { type: "sentence", id: "x" }];
  assert.strictEqual(W.usableSteps(ok).length, 4);
  assert.strictEqual(W.usableSteps([]).length, 0);
  assert.strictEqual(W.usableSteps([{ type: "hear", item: "x" }]), null);
  assert.strictEqual(W.usableSteps("no"), null);
  assert.strictEqual(W.usableSteps([{ type: "wat" }]), null);
});
