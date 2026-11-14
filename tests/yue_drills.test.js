"use strict";
const test = require("node:test");
const assert = require("node:assert");
const stage0 = require("../app/yue/data/stage0.json");
const audio = require("../app/yue/data/audio.json");
const J = require("../app/yue/jyutping.js");
const Drills = require("../app/yue/drills.js");

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const D = Drills.createDrills({ stage0, audio });
const UNITS = stage0.units.map((u) => u.id);
const syllablesOf = (d) => (Array.isArray(d.target) ? d.target : [d.target]);

function toneIdDrill(unit, tone, stats) {
  const rng = seeded(tone * 101);
  for (let i = 0; i < 500; i++) {
    const d = D.pick(unit, stats, rng, { type: "tone-id" });
    if (J.parse(d.target)[2] === tone) return d;
  }
  throw new Error("no drill");
}

test("pick never returns a syllable without audio for the chosen voice", () => {
  const rng = seeded(1);
  for (const unit of UNITS) {
    for (let i = 0; i < 500; i++) {
      const d = D.pick(unit, Drills.emptyStats(), rng, {});
      assert.ok(Number.isInteger(d.voice) && d.voice >= 0 && d.voice < audio.voices.length);
      for (const s of syllablesOf(d)) {
        assert.ok((audio.clips[s] || []).includes(d.voice), unit + " " + s + " voice " + d.voice);
      }
      if (d.type === "syl-id") for (const s of d.options) assert.ok((audio.clips[s] || []).includes(d.voice), s);
      assert.ok(!syllablesOf(d).some((s) => /^(m4|ng5)$/.test(s)));
    }
  }
});

test("pick with offlineClips only uses cached clips", () => {
  const rng = seeded(2);
  const offline = {};
  for (const [s, vs] of Object.entries(audio.clips)) if (vs.includes(1) && rng() < 0.7) offline[s] = [1];
  for (const unit of ["tones-hear", "initials", "finals", "jyutping", "checked"]) {
    for (let i = 0; i < 200; i++) {
      const d = D.pick(unit, Drills.emptyStats(), rng, { offlineClips: offline });
      assert.strictEqual(d.voice, 1);
      for (const s of syllablesOf(d)) assert.ok(offline[s], s + " not cached");
    }
  }
});

test("confusable tone pairs come up more often", () => {
  const rng = seeded(3);
  let n = 0, hit = 0;
  for (let i = 0; i < 2000; i++) {
    const d = D.pick("tones-hear", Drills.emptyStats(), rng, { type: "tone-id" });
    const t = J.parse(d.target)[2];
    n++;
    if (t === 3 || t === 6) hit++;
  }
  assert.ok(hit / n > 1 / 3 + 0.02, "share " + hit / n);
});

test("a learner who confuses 2 and 5 gets more 2/5 drills", () => {
  const share = (stats) => {
    const rng = seeded(4);
    let hit = 0;
    for (let i = 0; i < 2000; i++) {
      const t = J.parse(D.pick("tones-hear", stats, rng, { type: "tone-id" }).target)[2];
      if (t === 2 || t === 5) hit++;
    }
    return hit / 2000;
  };
  let stats = Drills.emptyStats();
  const base = share(stats);
  const d2 = toneIdDrill("tones-hear", 2, stats);
  for (let i = 0; i < 12; i++) stats = Drills.record(stats, d2, { verdict: "wrong", answer: 5 }, "2026-01-01");
  const d5 = toneIdDrill("tones-hear", 5, stats);
  for (let i = 0; i < 12; i++) stats = Drills.record(stats, d5, { verdict: "wrong", answer: 2 }, "2026-01-01");
  assert.ok(share(stats) > base + 0.05, base + " -> " + share(stats));
  const c = Drills.confusions(stats);
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c[0][2], 12);
  assert.deepStrictEqual(c.map((x) => x[0] + ">" + x[1]).sort(), ["2>5", "5>2"]);
});

test("dictation without tone asks for the tone", () => {
  const rng = seeded(5);
  const d = D.pick("jyutping", Drills.emptyStats(), rng, { type: "dictation" });
  assert.strictEqual(d.type, "dictation");
  const bare = J.toneless(d.target);
  assert.strictEqual(D.score(d, bare), "needTone");
  assert.strictEqual(D.score(d, d.target), "right");
  assert.strictEqual(D.score(d, bare + ((J.parse(d.target)[2] % 6) + 1)), "wrong");
  const s0 = Drills.emptyStats();
  assert.deepStrictEqual(Drills.record(s0, d, "needTone", "2026-01-01"), s0);
});

test("unitPassed needs 20 drills at 80%", () => {
  const d = D.pick("initials", Drills.emptyStats(), seeded(6), { type: "syl-id" });
  let s = Drills.emptyStats();
  for (let i = 0; i < 19; i++) s = Drills.record(s, d, "right", "2026-01-01");
  assert.strictEqual(Drills.unitPassed(s, "initials"), false);
  s = Drills.record(s, d, "right", "2026-01-01");
  assert.strictEqual(Drills.unitPassed(s, "initials"), true);
  let t = Drills.emptyStats();
  for (let i = 0; i < 20; i++) t = Drills.record(t, d, i >= 16 ? "wrong" : "right", "2026-01-01");
  assert.strictEqual(Drills.unitPassed(t, "initials"), true);
  t = Drills.record(t, d, "wrong", "2026-01-01"); // window slides: 5 wrong of last 20
  assert.strictEqual(Drills.unitPassed(t, "initials"), false);
});

test("gate passes at 34 of 40 and not at 33", () => {
  const d = D.pick("tones-hear", Drills.emptyStats(), seeded(7), { type: "tone-id" });
  assert.strictEqual(d.gate, true);
  const run = (right) => {
    let s = Drills.emptyStats();
    for (let i = 0; i < 40; i++) s = Drills.record(s, d, i < right ? "right" : "wrong", "2026-01-01");
    return Drills.gate(s);
  };
  assert.deepStrictEqual(run(34), { passed: true, right: 34, count: 40 });
  assert.strictEqual(run(33).passed, false);
  let s = Drills.emptyStats();
  for (let i = 0; i < 39; i++) s = Drills.record(s, d, "right", "2026-01-01");
  assert.strictEqual(Drills.gate(s).passed, false);
  const other = D.pick("checked", Drills.emptyStats(), seeded(8), { type: "tone-id" });
  assert.strictEqual(other.gate, false);
});

test("checked unit only offers tones 1, 3, 6", () => {
  const rng = seeded(9);
  for (let i = 0; i < 400; i++) {
    const d = D.pick("checked", Drills.emptyStats(), rng, {});
    for (const s of syllablesOf(d)) assert.ok(J.isChecked(s) && [1, 3, 6].includes(J.parse(s)[2]), s);
    if (d.type === "tone-id") assert.deepStrictEqual(d.options.slice().sort(), [1, 3, 6]);
  }
});

test("initials and finals pick categories fairly", () => {
  for (const [unit, cats] of [["finals", 4], ["initials", 2]]) {
    const rng = seeded(10);
    const counts = {};
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const d = D.pick(unit, Drills.emptyStats(), rng, { type: "syl-id" });
      const c = D.category(unit, d.options);
      counts[c] = (counts[c] || 0) + 1;
    }
    assert.strictEqual(Object.keys(counts).length, cats, JSON.stringify(counts));
    for (const [c, n] of Object.entries(counts)) {
      assert.ok(n > (N / cats) * 0.5 && n < (N / cats) * 1.5, c + " " + n);
    }
  }
});

test("same-diff is same about a third of the time and scores", () => {
  const rng = seeded(11);
  for (const unit of ["tones-hear", "initials", "finals", "checked"]) {
    let same = 0;
    const N = 900;
    for (let i = 0; i < N; i++) {
      const d = D.pick(unit, Drills.emptyStats(), rng, { type: "same-diff" });
      assert.strictEqual(d.target.length, 2);
      if (d.target[0] === d.target[1]) {
        same++;
        assert.strictEqual(D.score(d, "same"), "right");
        assert.strictEqual(D.score(d, "different"), "wrong");
      } else {
        assert.strictEqual(D.score(d, "different"), "right");
      }
    }
    assert.ok(same / N > 0.25 && same / N < 0.42, unit + " " + same / N);
  }
});

test("score, say and record basics", () => {
  const rng = seeded(12);
  const t = D.pick("tones-six", Drills.emptyStats(), rng, { type: "tone-id" });
  assert.strictEqual(D.score(t, J.parse(t.target)[2]), "right");
  assert.strictEqual(D.score(t, (J.parse(t.target)[2] % 6) + 1), "wrong");
  const say = D.pick("say", Drills.emptyStats(), rng, { type: "say" });
  assert.strictEqual(D.score(say, "x"), null);
  const s0 = Drills.emptyStats();
  const frozen = JSON.stringify(s0);
  const s1 = Drills.record(s0, say, "right", "2026-01-01");
  assert.strictEqual(JSON.stringify(s0), frozen);
  assert.notStrictEqual(s1, s0);
});

test("z/c counts as aspiration", () => {
  assert.strictEqual(D.category("initials", ["zaa1", "caa1"]), "aspiration");
  assert.strictEqual(D.category("initials", ["ngaa1", "aa1"]), "ng-zero");
});

test("pick falls back to other drill types offline and returns null with nothing playable", () => {
  const rng = seeded(13);
  const offline = { baa1: [0] };
  for (let i = 0; i < 100; i++) {
    const d = D.pick("jyutping", Drills.emptyStats(), rng, { offlineClips: offline, type: "read" });
    assert.ok(d && d.target === "baa1" && d.voice === 0);
  }
  // tones-hear cannot build any tone drill from one clip, but must not throw
  assert.strictEqual(D.pick("tones-hear", Drills.emptyStats(), rng, { offlineClips: offline }), null);
  assert.strictEqual(D.pick("jyutping", Drills.emptyStats(), rng, { offlineClips: {} }), null);
  // fallback: requested type unavailable, another type works
  const only = { baa1: [0], paa1: [0] };
  const d = D.pick("initials", Drills.emptyStats(), rng, { offlineClips: only, type: "say" });
  assert.ok(d && syllablesOf(d).every((s) => only[s]));
  const e = D.pick("jyutping", Drills.emptyStats(), rng, { offlineClips: { baa1: [0], baa2: [0] }, type: "say" });
  assert.ok(e && e.type !== "say"); // jyutping has no say drill: falls back to read/dictation
});

test("a plain wrong on tone-id does not dilute tone pair error rates", () => {
  const d = toneIdDrill("tones-hear", 2, Drills.emptyStats());
  const s = Drills.record(Drills.emptyStats(), d, "wrong", "2026-01-01");
  assert.deepStrictEqual(s.tonePairs, {});
  assert.strictEqual(s.byUnit["tones-hear"].length, 1);
  const r = Drills.record(Drills.emptyStats(), d, "right", "2026-01-01");
  assert.ok(r.tonePairs["2-5"].n === 1 && r.tonePairs["2-5"].wrong === 0);
});
