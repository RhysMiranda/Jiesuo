/* Jiesuo Cantonese: composes a stage 0 lesson. Pure, no DOM; randomness comes from rng. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./jyutping.js"), require("./drills.js"));
  else root.JyutLesson = factory(root.JyutJyutping, root.JyutDrills);
})(typeof self !== "undefined" ? self : this, function (J, Drills) {
  "use strict";
  const LESSON_SIZE = 30, CURRENT_SHARE = 0.7, SAY_STEPS = 3, SAY_UNIT_SHARE = 6, GATE_SIZE = 40;

  const key = (d) => JSON.stringify([d.type, d.target]);
  const toneOf = (s) => J.parse(s)[2];

  function shuffle(rng, xs) {
    const a = xs.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /**
   * compose(stage0, stats, {hasMic, calibrated, audio, drills?}, rng?) -> {unit, steps}
   * audio (audio.json) is needed so drills only use syllables that have clips.
   */
  function compose(stage0, stats, opts, rng) {
    rng = rng || Math.random;
    const { hasMic = false, calibrated = false, audio, offlineClips = null } = opts || {};
    const D = (opts && opts.drills) || Drills.createDrills({ stage0, audio });
    const units = stage0.units;
    const cur = units.find((u) => !D.unitPassed(stats, u.id)) || units[units.length - 1];
    const passed = units.filter((u) => u !== cur && D.unitPassed(stats, u.id));
    const steps = [];

    if (!(stats.byUnit[cur.id] || []).length) steps.push({ kind: "teach", unit: cur.id, title: cur.title, lines: cur.teach, anchors: cur.anchors });

    const gateWanted = D.unitPassed(stats, "tones-hear") && !D.gate(stats).passed && D.gate(stats).count < GATE_SIZE;
    if (gateWanted) {
      const gd = [];
      for (let i = 0, tries = 0; gd.length < GATE_SIZE && tries < GATE_SIZE * 5; tries++, i++) {
        const d = D.pick("tones-hear", stats, rng, { type: "tone-id", offlineClips });
        if (d && d.gate) gd.push(d);
      }
      if (gd.length === GATE_SIZE) steps.push({ kind: "gate", drills: gd, summary: "A 40-question tone check. It opens the words at 34 right, and you can move on whenever you like." });
    }

    const nonSay = (unit, review) => {
      for (let t = 0; t < 12; t++) {
        const d = D.pick(unit.id, stats, rng, { review, offlineClips });
        if (!d) continue;
        if (d.type !== "say") return d;
        if (unit.drills.every((x) => x === "say")) return null;
      }
      return null;
    };
    const nCur = !passed.length ? LESSON_SIZE : Math.round(LESSON_SIZE * CURRENT_SHARE);
    const picked = [];
    const seen = new Set();
    const add = (unit, review) => {
      for (let t = 0; t < 4; t++) {
        const d = nonSay(unit, review);
        if (!d) return false;
        if (!seen.has(key(d)) || t === 3) { seen.add(key(d)); picked.push(d); return true; }
      }
      return false;
    };
    const sayOnly = cur.drills.every((x) => x === "say");
    if (sayOnly && !hasMic) {
      // no microphone: the say unit cannot be practised, so stage 0 is complete; review everything else
      const others = units.filter((u) => u !== cur);
      for (let i = 0; i < LESSON_SIZE; i++) add(others[Math.floor(rng() * others.length)], true);
    } else if (sayOnly) {
      for (let i = 0; i < SAY_UNIT_SHARE; i++) {
        const d = D.pick(cur.id, stats, rng, { type: "say", offlineClips });
        if (d) picked.push(d);
      }
    } else for (let i = 0; i < nCur; i++) add(cur, false);
    if (passed.length && !(sayOnly && !hasMic)) {
      const want = LESSON_SIZE - picked.length;
      for (let i = 0; i < want; i++) add(passed[Math.floor(rng() * passed.length)], true);
    }
    for (const d of shuffle(rng, picked)) steps.push({ kind: "drill", drill: d });

    if (hasMic) {
      if (!calibrated) steps.push({ kind: "calibrate" });
      const sayUnit = cur.drills.includes("say") ? cur : units.find((u) => u.id === "say");
      const have = steps.filter((s) => s.kind === "drill" && s.drill.type === "say").length;
      for (let i = have; i < SAY_STEPS; i++) {
        const d = D.pick(sayUnit.id, stats, rng, { type: "say", offlineClips });
        if (d) steps.push({ kind: "drill", drill: d });
      }
      // calibration first, then the say drills (sorted last, in order)
      const ci = steps.findIndex((s) => s.kind === "calibrate");
      const sayIdx = steps.map((s, i) => (s.kind === "drill" && s.drill.type === "say" ? i : -1)).filter((i) => i >= 0);
      if (ci >= 0 && sayIdx.length && sayIdx[0] < ci) {
        const says = sayIdx.map((i) => steps[i]);
        const rest = steps.filter((s, i) => !sayIdx.includes(i) && s.kind !== "calibrate");
        const cal = steps.find((s) => s.kind === "calibrate");
        steps.length = 0;
        steps.push(...rest, cal, ...says);
      }
    }
    steps.push({ kind: "done", summary: "That is today's practice done. Come back whenever you like." });
    return { unit: cur.id, steps };
  }

  /** Pair-by-pair gain between two stats: the most-practised pair this lesson. */
  function summarise(before, after, answered) {
    let best = null;
    for (const [k, p] of Object.entries(after.tonePairs || {})) {
      const b = (before.tonePairs || {})[k] || { n: 0, wrong: 0 };
      const n = p.n - b.n, wrong = p.wrong - b.wrong;
      if (n > 0 && (!best || n > best.n)) best = { k, n, right: n - wrong };
    }
    if (best) {
      const [a, c] = best.k.split("-");
      return "You told tone " + a + " from tone " + c + " " + best.right + " times out of " + best.n + ".";
    }
    return answered > 0 ? "You worked through " + answered + " questions. Every one of them helps your ear." : "Nothing to score this time. Come back whenever you like.";
  }

  function gateSummary(stats, passed) {
    const g = Drills.gate(stats);
    if (passed) return "You got " + g.right + " of " + g.count + " on the tone check, so the words are open to you.";
    const top = Drills.confusions(stats)[0];
    const pair = top ? " The pair to practise most is tone " + Math.min(top[0], top[1]) + " and tone " + Math.max(top[0], top[1]) + "." : "";
    return "You got " + g.right + " of " + g.count + " on the tone check. The words open at 34 right." + pair;
  }

  /** A 10-drill practice for one tone pair: tone-id on either tone, or same-diff built from those two tones. */
  function practise(stage0, audio, stats, a, b, rng, n) {
    rng = rng || Math.random; n = n || 10;
    const D = Drills.createDrills({ stage0, audio });
    const ok = (d) => {
      if (!d) return false;
      if (d.type === "tone-id") { const t = toneOf(d.target); return t === a || t === b; }
      if (d.type === "same-diff") return d.target.map(toneOf).every((t) => t === a || t === b);
      return false;
    };
    const out = [];
    for (let tries = 0; out.length < n && tries < 4000; tries++) {
      const d = D.pick("tones-hear", stats, rng, { type: rng() < 0.6 ? "tone-id" : "same-diff", review: true });
      if (ok(d)) out.push(d);
    }
    return out;
  }

  /** Maps a sayPanel result to "skip" | "retry" | "right" | "wrong". should = JyutSpeak.shouldRecord. */
  function sayVerdict(r, should) {
    if (!r || r.skipped) return "skip";
    if (!should(r)) return "retry";
    return r.results.every((x) => x.ok) ? "right" : "wrong";
  }

  return { compose, summarise, gateSummary, practise, sayVerdict };
});
