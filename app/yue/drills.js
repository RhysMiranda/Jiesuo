/* Jiesuo Cantonese: the drills engine. Pure, no DOM; all randomness comes from the rng argument. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./jyutping.js"));
  else root.JyutDrills = factory(root.JyutJyutping);
})(typeof self !== "undefined" ? self : this, function (J) {
  "use strict";

  const PRIOR_PAIRS = new Set(["3-6", "2-5", "4-6", "1-3", "5-6"]); // spec section 3
  const GATE_SIZE = 40, GATE_PASS = 34, UNIT_WINDOW = 20, UNIT_PASS = 0.8;
  const SAME_SHARE = 1 / 3;

  const pairKey = (a, b) => (a < b ? a + "-" + b : b + "-" + a);
  const toneOf = (syl) => J.parse(syl)[2];

  // ---- stats (plain JSON) ----
  function emptyStats() { return { byUnit: {}, pairs: {}, gateLog: [], tonePairs: {} }; }

  /**
   * verdict: "right" | "wrong" | "needTone" | null, or {verdict, answer}. The answer (the tone or
   * syllable the learner chose) lets a wrong tone-id be filed as a want>got confusion.
   * Returns new stats; the input is never touched. needTone and null are not recorded.
   */
  function record(stats, drill, verdict, day) {
    let answer;
    if (verdict && typeof verdict === "object") { answer = verdict.answer; verdict = verdict.verdict; }
    if (verdict !== "right" && verdict !== "wrong") return stats;
    const ok = verdict === "right";
    const out = {
      byUnit: Object.assign({}, stats.byUnit),
      pairs: Object.assign({}, stats.pairs),
      gateLog: stats.gateLog.slice(),
      tonePairs: Object.assign({}, stats.tonePairs),
    };
    const log = (stats.byUnit[drill.unit] || []).concat([{ r: ok ? 1 : 0, d: day || null }]);
    out.byUnit[drill.unit] = log.slice(-UNIT_WINDOW);
    if (drill.gate) out.gateLog = out.gateLog.concat([ok ? 1 : 0]).slice(-GATE_SIZE);

    const bump = (a, b, wrong) => {
      const k = pairKey(a, b), p = out.tonePairs[k] || { n: 0, wrong: 0 };
      out.tonePairs[k] = { n: p.n + 1, wrong: p.wrong + (wrong ? 1 : 0) };
    };
    if (drill.type === "tone-id") {
      const want = toneOf(drill.target), got = Number(answer);
      const opts = (drill.options || []).map(Number);
      const gotKnown = !ok && opts.includes(got) && got !== want;
      if (ok || gotKnown) for (const o of opts) if (o !== want) bump(want, o, gotKnown && o === got);
      if (gotKnown) { const k = want + ">" + got; out.pairs[k] = (out.pairs[k] || 0) + 1; }
    } else if (drill.type === "same-diff" && Array.isArray(drill.target)) {
      const [a, b] = drill.target.map(toneOf);
      if (a !== b && drill.toneUnit) bump(a, b, !ok);
    }
    return out;
  }

  function unitPassed(stats, unitId) {
    const log = (stats.byUnit[unitId] || []).slice(-UNIT_WINDOW);
    return log.length === UNIT_WINDOW && log.reduce((n, e) => n + e.r, 0) / UNIT_WINDOW >= UNIT_PASS;
  }

  function gate(stats) {
    const log = stats.gateLog.slice(-GATE_SIZE);
    const right = log.reduce((n, x) => n + x, 0);
    return { passed: log.length === GATE_SIZE && right >= GATE_PASS, right, count: log.length };
  }

  /** [[want, got, count], ...] most frequent first. */
  function confusions(stats) {
    return Object.entries(stats.pairs)
      .map(([k, n]) => { const [w, g] = k.split(">").map(Number); return [w, g, n]; })
      .sort((x, y) => y[2] - x[2] || x[0] - y[0] || x[1] - y[1]);
  }

  // ---- minimal-set categories (ruling R14) ----
  const ASPIRATION = new Set(["b-p", "d-t", "g-k", "gw-kw", "c-z"]);
  const ending = (f, re) => { const m = re.exec(f); return m ? [f.slice(0, m.index), m[0]] : null; };

  function initialsCategory(a, b) {
    if (ASPIRATION.has(pairKey(a, b))) return "aspiration";
    if (pairKey(a, b) === "-ng" || pairKey(a, b) === "ng-") return "ng-zero";
    return "other";
  }
  function finalsCategory(a, b) {
    const norm = (f) => f.replace(/^aa/, "a");
    if (a !== b && norm(a) === norm(b)) return "aa-a";
    const na = ending(a, /(ng|m|n)$/), nb = ending(b, /(ng|m|n)$/);
    if (na && nb && na[0] === nb[0] && na[1] !== nb[1]) return "nasal";
    const sa = ending(a, /[ptk]$/), sb = ending(b, /[ptk]$/);
    if (sa && sb && sa[0] === sb[0] && sa[1] !== sb[1]) return "stop";
    const rounded = (f) => /^(yu|oe|eo)/.test(f);
    if (rounded(a) || rounded(b)) return "rounded";
    return "other";
  }
  /** Which kind of contrast a minimal set is, from its first two members. "all" outside initials/finals. */
  function categoryOf(unitId, set) {
    if (unitId !== "initials" && unitId !== "finals") return "all";
    const p = J.parse(set[0]), q = J.parse(set[1]);
    return unitId === "initials" ? initialsCategory(p[0], q[0]) : finalsCategory(p[1], q[1]);
  }

  // ---- the engine ----
  function createDrills({ stage0, audio }) {
    const units = {};
    for (const u of stage0.units) units[u.id] = u;
    const nVoices = audio.voices.length;
    const filteredCache = {};

    const hasClip = (syl, voice, offline) => {
      const all = audio.clips[syl];
      if (!all || !all.includes(voice)) return false;
      if (!offline) return true;
      const off = offline[syl];
      return !!off && off.includes(voice);
    };

    /** Minimal sets cut down to members that have a clip in this voice; sets under 2 members dropped. */
    function usableSets(unit, voice, offline) {
      const key = unit.id + "|" + voice;
      if (!offline && filteredCache[key]) return filteredCache[key];
      const sets = [];
      for (const s of unit.minimalSets || []) {
        const m = s.filter((x) => hasClip(x, voice, offline));
        if (m.length >= 2) sets.push(m);
      }
      if (!offline) filteredCache[key] = sets;
      return sets;
    }

    const rnd = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));
    const choice = (rng, xs) => xs[rnd(rng, xs.length)];
    function shuffle(rng, xs) {
      const a = xs.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = rnd(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    function weighted(rng, items, weightOf) {
      const ws = items.map(weightOf), total = ws.reduce((x, y) => x + y, 0);
      let r = rng() * total;
      for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r < 0) return items[i]; }
      return items[items.length - 1];
    }

    /** Weight of a tone pair: prior (2 for the confusable pairs, else 1) + 3 x observed error rate. */
    function pairWeight(stats, a, b, review) {
      const k = pairKey(a, b), p = stats.tonePairs[k];
      const err = p && p.n > 0 ? p.wrong / p.n : 0;
      return (PRIOR_PAIRS.has(k) ? 2 : 1) + (review ? 6 : 3) * err;
    }
    const toneWeight = (stats, unit, t, review) =>
      unit.tones.filter((u) => u !== t).reduce((sum, u) => sum + pairWeight(stats, t, u, review), 0);

    function pickSet(rng, unit, sets) {
      if (unit.id !== "initials" && unit.id !== "finals") return choice(rng, sets);
      const groups = {};
      for (const s of sets) (groups[categoryOf(unit.id, s)] = groups[categoryOf(unit.id, s)] || []).push(s);
      return choice(rng, groups[choice(rng, Object.keys(groups))]);
    }

    const toneUnit = (unit) => unit.drills.includes("tone-id");
    const withTone = (sets, t) => sets.filter((s) => s.some((x) => toneOf(x) === t));

    function build(type, unit, stats, rng, voice, offline, review) {
      const sets = usableSets(unit, voice, offline);
      const base = { type, unit: unit.id, voice, gate: false };

      if (type === "tone-id") {
        const ok = unit.tones.filter((t) => withTone(sets, t).length);
        if (!ok.length) return null;
        const t = weighted(rng, ok, (x) => toneWeight(stats, unit, x, review));
        const set = choice(rng, withTone(sets, t));
        const target = choice(rng, set.filter((x) => toneOf(x) === t));
        return Object.assign(base, {
          target, options: unit.tones.slice(),
          gate: unit.tones.length === 6 && unit.id !== "tones-six",
        });
      }

      if (type === "same-diff") {
        if (!sets.length) return null;
        const same = rng() < SAME_SHARE;
        if (toneUnit(unit)) {
          if (same) {
            const ok = unit.tones.filter((t) => withTone(sets, t).length);
            if (!ok.length) return null;
            const t = weighted(rng, ok, (x) => toneWeight(stats, unit, x, review));
            const s = choice(rng, choice(rng, withTone(sets, t)).filter((x) => toneOf(x) === t));
            return Object.assign(base, { target: [s, s], options: ["same", "different"], toneUnit: true });
          }
          const pairs = [];
          for (let i = 0; i < unit.tones.length; i++) for (let j = i + 1; j < unit.tones.length; j++) {
            const a = unit.tones[i], b = unit.tones[j];
            if (sets.some((s) => s.some((x) => toneOf(x) === a) && s.some((x) => toneOf(x) === b))) pairs.push([a, b]);
          }
          if (!pairs.length) return null;
          const [a, b] = weighted(rng, pairs, (p) => pairWeight(stats, p[0], p[1], review));
          const cands = sets.filter((s) => s.some((x) => toneOf(x) === a) && s.some((x) => toneOf(x) === b));
          const set = choice(rng, cands);
          const pair = shuffle(rng, [choice(rng, set.filter((x) => toneOf(x) === a)), choice(rng, set.filter((x) => toneOf(x) === b))]);
          return Object.assign(base, { target: pair, options: ["same", "different"], toneUnit: true });
        }
        const set = pickSet(rng, unit, sets);
        if (same) { const s = choice(rng, set); return Object.assign(base, { target: [s, s], options: ["same", "different"] }); }
        const two = shuffle(rng, set).slice(0, 2);
        return Object.assign(base, { target: two, options: ["same", "different"] });
      }

      if (type === "syl-id") {
        if (!sets.length) return null;
        const set = pickSet(rng, unit, sets);
        return Object.assign(base, { target: choice(rng, set), options: shuffle(rng, set).slice(0, 4) });
      }

      if (type === "read" || type === "dictation") {
        const pool = unit.syllables.filter((s) => hasClip(s, voice, offline));
        if (!pool.length) return null;
        const target = choice(rng, pool);
        if (type === "dictation") return Object.assign(base, { target, options: [] });
        const [ini, fin] = J.parse(target);
        const near = pool.filter((s) => { if (s === target) return false; const p = J.parse(s); return p[0] === ini || p[1] === fin; });
        const same = near.filter((s) => J.toneless(s) === J.toneless(target));
        const rest = shuffle(rng, near.filter((s) => !same.includes(s)));
        const opts = shuffle(rng, same).slice(0, 2).concat(rest).slice(0, 3);
        return Object.assign(base, { target, options: shuffle(rng, opts.concat([target])) });
      }

      if (type === "say") {
        if (unit.id === "say") { // a two-syllable pair
          if (!sets.length) return null;
          return Object.assign(base, { target: choice(rng, sets).slice(0, 2), options: [] });
        }
        if (sets.length) return Object.assign(base, { target: choice(rng, pickSet(rng, unit, sets)), options: [] });
        const pool = (unit.syllables || []).filter((s) => hasClip(s, voice, offline));
        if (!pool.length) return null;
        return Object.assign(base, { target: choice(rng, pool), options: [] });
      }
      return null;
    }

    /**
     * Next drill. opts: {review, offlineClips, type}. offlineClips has the shape of audio.clips
     * ({syl: [voice, ...]}) and limits both syllables and voices to what is cached.
     * Every syllable in target/options has a clip in drill.voice.
     */
    function pick(unitId, stats, rng, opts) {
      const { review = false, offlineClips = null, type = null } = opts || {};
      const unit = units[unitId];
      if (!unit) throw new Error("unknown unit: " + unitId);
      const first = type && unit.drills.includes(type) ? type : choice(rng, unit.drills);
      const types = [first].concat(shuffle(rng, unit.drills.filter((x) => x !== first)));
      const start = rnd(rng, nVoices);
      for (const t of types) {
        for (let i = 0; i < nVoices; i++) {
          const drill = build(t, unit, stats, rng, (start + i) % nVoices, offlineClips, review);
          if (drill) return drill;
        }
      }
      return null; // nothing playable (for example nothing cached offline)
    }

    function score(drill, answer) {
      switch (drill.type) {
        case "tone-id": return Number(answer) === toneOf(drill.target) ? "right" : "wrong";
        case "syl-id": case "read": return answer === drill.target ? "right" : "wrong";
        case "same-diff": return answer === (drill.target[0] === drill.target[1] ? "same" : "different") ? "right" : "wrong";
        case "dictation": return J.answerMatches(String(answer || ""), drill.target, { needTone: true });
        default: return null; // say: scored by the tone check
      }
    }

    return { pick, score, category: categoryOf, record, unitPassed, gate, confusions, emptyStats };
  }

  return { createDrills, record, unitPassed, gate, confusions, emptyStats, categoryOf, PRIOR_PAIRS };
});
