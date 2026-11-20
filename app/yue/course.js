/* Jiesuo Cantonese: course engine (what to learn today, exercises, scheduling). Pure, no DOM. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../journey.js"), require("./lexicon.js"));
  else root.JyutCourse = factory(root.JiesuoJourney, root.JyutLex);
})(typeof self !== "undefined" ? self : this, function (J, Lex) {
  "use strict";

  const SKILLS = ["h", "r", "t"];
  const MAX_STEPS = 40;
  const isGrammar = (item) => typeof item === "string" && item.startsWith("g:");

  function wordsUnlocked(state, D) {
    return !!(D.gate(state.stats).passed || (state.gate && state.gate.movedOn === true) || (state.gate && state.gate.result && state.gate.result.passed === true));
  }

  // ---- items -------------------------------------------------------------------------------------------------

  const stage1Cache = new WeakMap();
  function stage1Of(course) {
    let m = stage1Cache.get(course);
    if (!m) {
      m = new Map();
      for (const l of (course.stage1 && course.stage1.lessons) || []) for (const it of l.items || []) if (!m.has(it.form)) m.set(it.form, it);
      stage1Cache.set(course, m);
    }
    return m;
  }

  /** The meaning shown for a word item: the hand-checked Stage 1 table first, else the lexicon. "" when there is none. */
  function meaning(course, lex, item) {
    if (isGrammar(item)) return "";
    const s = stage1Of(course).get(item);
    if (s && s.en) return s.en;
    const w = lex && lex.word(item);
    return (w && w.en) || "";
  }

  /** {form, jp, en, note?} for a word item, or null. Stage 1's own reading and note win. */
  function info(course, lex, item) {
    if (typeof item !== "string" || isGrammar(item)) return null;
    const s = stage1Of(course).get(item);
    const w = lex && lex.word(item);
    if (w && w.unchecked) return null;
    const jp = (s && s.jp) || (w && w.jp);
    const en = meaning(course, lex, item);
    if (!jp || !en) return null;
    const out = { form: item, jp, en };
    if (s && s.note) out.note = s.note;
    return out;
  }

  /** First sense only, so an option's length does not give the answer away. */
  const shortEn = (en) => String(en || "").split(";")[0].trim();

  const uncheckedSet = (course) => new Set(Array.isArray(course.unchecked) ? course.unchecked : []);

  /**
   * The first k items of course.order that are not in words. Unchecked items (course.unchecked, or an item marked
   * unchecked in the Stage 1 table) are never returned. With lex given, a word with no meaning is skipped too.
   */
  function nextNew(course, words, k, lex) {
    const out = [];
    const skip = uncheckedSet(course);
    const s1 = stage1Of(course);
    for (const item of course.order || []) {
      if (out.length >= k) break;
      if (Object.prototype.hasOwnProperty.call(words || {}, item) || skip.has(item)) continue;
      const st = s1.get(item);
      if (st && st.unchecked) continue;
      if (isGrammar(item)) { if (!(course.grammar && course.grammar[item.slice(2)])) continue; }
      else if (lex && !info(course, lex, item)) continue;
      out.push(item);
    }
    return out;
  }

  // ---- randomness --------------------------------------------------------------------------------------------

  function shuffled(arr, rng) {
    const a = arr.slice();
    const r = typeof rng === "function" ? rng : Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---- reviews -----------------------------------------------------------------------------------------------

  /** Due entries, most overdue first within a skill, interleaved across skills: [{item, skill}]. */
  function due(words, today, limit, keep) {
    const per = SKILLS.map((skill) => {
      const entries = [];
      for (const [item, e] of Object.entries(words || {})) if (e && Array.isArray(e[skill]) && (!keep || keep(item))) entries.push([item, e[skill]]);
      return J.dueReviews(new Map(entries), today, limit).map((item) => ({ item, skill }));
    });
    const out = [];
    for (let i = 0; out.length < limit && per.some((p) => i < p.length); i++) {
      for (const p of per) if (i < p.length && out.length < limit) out.push(p[i]);
    }
    return out;
  }

  function record(words, item, skill, correct, today) {
    const out = Object.assign({}, words);
    const old = words && words[item];
    const e = Object.assign({}, old);
    e[skill] = J.schedule(old && old[skill], !!correct, today);
    e.seen = today;
    out[item] = e;
    return out;
  }

  /** Mark an item as shown without scheduling any skill (grammar with nothing to drill). Non-mutating. */
  function markSeen(words, item, today) {
    const out = Object.assign({}, words);
    out[item] = Object.assign({}, words && words[item], { seen: today });
    return out;
  }

  // ---- exercises ---------------------------------------------------------------------------------------------

  const sylls = (jp) => jp.split(/\s+/).filter(Boolean);
  const toneless = (jp) => sylls(jp).map((s) => s.replace(/[1-6]$/, "")).join(" ");

  /** Word items near `item` for distractors: seen items first, then the order's neighbours (closest first). */
  function pool(ctx, item) {
    const { course, lex, words } = ctx;
    const seen = Object.keys(words || {}).filter((x) => x !== item && !isGrammar(x));
    const order = course.order || [];
    const at = order.indexOf(item);
    const near = [];
    if (at >= 0) {
      for (let d = 1; d <= 150; d++) {
        if (at - d >= 0) near.push(order[at - d]);
        if (at + d < order.length) near.push(order[at + d]);
      }
    } else near.push(...order.slice(0, 300));
    const unchecked = uncheckedSet(course);
    const seenSet = new Set(seen);
    const ok = (x) => x !== item && !isGrammar(x) && !unchecked.has(x);
    return { seen: seen.filter(ok), near: near.filter((x) => ok(x) && !seenSet.has(x)) };
  }

  /**
   * Pick 3 distractor items, never the answer or anything with the same meaning. Preference: tier 0 = same toneless
   * syllables (type pick only), then same syllable count from seen, same count from neighbours, any from neighbours.
   */
  function pickDistractors(ctx, item, inf, wantToneless) {
    const p = pool(ctx, item);
    const rng = ctx.rng;
    const n = sylls(inf.jp).length;
    const tl = toneless(inf.jp);
    const cand = [];
    const usedEn = new Set([shortEn(inf.en).toLowerCase(), inf.en.toLowerCase()]);
    const tiers = [];
    const mk = (list, test) => shuffled(list, rng).filter(test);
    const infos = new Map();
    const get = (x) => { if (!infos.has(x)) infos.set(x, info(ctx.course, ctx.lex, x)); return infos.get(x); };
    const same = (x) => { const i = get(x); return i && sylls(i.jp).length === n; };
    if (wantToneless) tiers.push(mk(p.seen.concat(p.near), (x) => { const i = get(x); return i && toneless(i.jp) === tl; }));
    tiers.push(mk(p.seen, same), mk(p.near, same), mk(p.near, (x) => !!get(x)), mk(p.seen, (x) => !!get(x)));
    for (const tier of tiers) {
      for (const x of tier) {
        if (cand.length >= 3) break;
        const i = get(x);
        const key = shortEn(i.en).toLowerCase();
        if (usedEn.has(key) || usedEn.has(i.en.toLowerCase()) || i.form === item || cand.some((c) => c.form === i.form)) continue;
        usedEn.add(key); usedEn.add(i.en.toLowerCase());
        cand.push(i);
      }
    }
    return cand;
  }

  function otherSentenceMeanings(ctx, exclude) {
    const out = [];
    const seen = new Set([exclude.toLowerCase()]);
    const ids = Object.values(ctx.course.lessonSentence || {});
    for (const id of shuffled(ids, ctx.rng)) {
      const ex = ctx.lex.example(id);
      if (ex && ex.en && !seen.has(ex.en.toLowerCase())) { seen.add(ex.en.toLowerCase()); out.push(ex.en); }
      if (out.length >= 3) break;
    }
    return out;
  }

  /** A grammar item's example with English, or null. */
  function hearExample(ctx, item) {
    const g = ctx.course.grammar && ctx.course.grammar[item.slice(2)];
    if (!g) return null;
    for (const id of g.examples || []) {
      const ex = ctx.lex.example(id);
      if (ex && ex.en) return { id, ex };
    }
    return null;
  }

  function hear(ctx, item) {
    if (isGrammar(item)) {
      const h = hearExample(ctx, item);
      if (!h) return null;
      const options = shuffled([h.ex.en].concat(otherSentenceMeanings(ctx, h.ex.en)), ctx.rng);
      return { type: "hear", item, skill: "h", prompt: { id: h.id, text: h.ex.text, jp: h.ex.jp }, options, answer: h.ex.en };
    }
    const inf = info(ctx.course, ctx.lex, item);
    if (!inf) return null;
    const options = shuffled([shortEn(inf.en)].concat(pickDistractors(ctx, item, inf, false).map((d) => shortEn(d.en))), ctx.rng);
    return { type: "hear", item, skill: "h", prompt: { text: inf.form, jp: inf.jp }, options, answer: shortEn(inf.en) };
  }

  function read(ctx, item) {
    const inf = info(ctx.course, ctx.lex, item);
    if (!inf) return null;
    const options = shuffled([shortEn(inf.en)].concat(pickDistractors(ctx, item, inf, false).map((d) => shortEn(d.en))), ctx.rng);
    return { type: "read", item, skill: "r", prompt: { text: inf.form }, options, answer: shortEn(inf.en) };
  }

  /** Type the Jyutping (tones required), then pick the characters: options are 4 forms, answerForm is the item. */
  function type(ctx, item) {
    const inf = info(ctx.course, ctx.lex, item);
    if (!inf) return null;
    const options = shuffled([item].concat(pickDistractors(ctx, item, inf, true).map((d) => d.form)), ctx.rng);
    return { type: "type", item, skill: "t", prompt: { en: shortEn(inf.en), jp: inf.jp, text: inf.form }, options, answer: inf.jp, answerForm: item };
  }

  /** True when the typed Jyutping equals the step's answer syllable by syllable; every tone must be given. */
  function checkTyped(step, input) {
    const a = Lex.normalise(input);
    const b = Lex.normalise(step.answer);
    if (!a || !b || a.syls.length !== b.syls.length) return false;
    return a.syls.every((s, i) => s.tone !== null && s.base === b.syls[i].base && s.tone === b.syls[i].tone);
  }

  const exercises = { hear, read, type };
  const MEET_EXAMPLES = 5; // a grammar meet card shows this many examples

  // ---- the day -----------------------------------------------------------------------------------------------

  function meet(ctx, item) {
    if (isGrammar(item)) {
      const g = ctx.course.grammar[item.slice(2)];
      const found = [];
      for (const id of g.examples || []) { const ex = ctx.lex.example(id); if (ex) found.push(Object.assign({ id }, ex)); }
      // at most MEET_EXAMPLES, those with an English line first (the order is otherwise kept: best first)
      const examples = found.filter((e) => e.en).concat(found.filter((e) => !e.en)).slice(0, MEET_EXAMPLES);
      return { type: "meet", item, grammar: true, title: g.title, explain: g.explain, pattern: g.pattern, cite: g.cite, examples };
    }
    const inf = info(ctx.course, ctx.lex, item);
    if (!inf) return null;
    const w = ctx.lex.word(item);
    const out = { type: "meet", item, form: inf.form, jp: inf.jp, en: inf.en };
    if (inf.note) out.note = inf.note;
    if (w && w.alt) out.alt = true;
    if (w && w.changed) out.changed = true;
    return out;
  }

  /** Spread review steps so that two steps of one item are never adjacent; a step that cannot be placed is dropped. */
  function spread(list) {
    const out = [];
    const rest = list.slice();
    while (rest.length) {
      const prev = out.length ? out[out.length - 1].item : null;
      const i = rest.findIndex((s) => s.item !== prev);
      if (i < 0) break;
      out.push(rest.splice(i, 1)[0]);
    }
    return out;
  }

  function planDay(c) {
    const ctx = { course: c.course, lex: c.lex, words: c.words || {}, rng: c.rng };
    const newCount = c.newCount == null ? 4 : c.newCount;
    const reviewLimit = c.reviewLimit == null ? 20 : c.reviewLimit;
    const fresh = nextNew(ctx.course, ctx.words, newCount, ctx.lex);
    const steps = [];
    for (const item of fresh) {
      const m = meet(ctx, item);
      if (!m) continue;
      steps.push(m);
      if (isGrammar(item)) { const h = hear(ctx, item); if (h) steps.push(h); else m.markSeen = true; }
      else for (const k of ["hear", "read", "type"]) { const s = exercises[k](ctx, item); if (s) steps.push(s); }
    }
    const reviews = [];
    for (const { item, skill } of due(ctx.words, c.today, reviewLimit, (it) => isGrammar(it) || (!uncheckedSet(ctx.course).has(it) && !(stage1Of(ctx.course).get(it) || {}).unchecked && !!info(ctx.course, ctx.lex, it)))) {
      if (isGrammar(item) && skill !== "h") continue;
      const s = exercises[{ h: "hear", r: "read", t: "type" }[skill]](ctx, item);
      if (s) reviews.push(s);
    }
    const shuffledReviews = spread(shuffled(reviews, ctx.rng));

    let sentence = null;
    for (let i = fresh.length - 1; i >= 0 && !sentence; i--) sentence = ctx.course.lessonSentence && ctx.course.lessonSentence[fresh[i]] || null;
    if (!sentence) {
      const recent = Object.entries(ctx.words).sort((a, b) => (a[1].seen < b[1].seen ? 1 : a[1].seen > b[1].seen ? -1 : 0));
      for (const [item] of recent) { sentence = ctx.course.lessonSentence && ctx.course.lessonSentence[item] || null; if (sentence) break; }
    }
    const body = steps.concat(shuffledReviews).slice(0, MAX_STEPS - (sentence ? 1 : 0));
    if (sentence) body.push({ type: "sentence", id: sentence });
    return { steps: body };
  }

  // ---- the library (Map and Progress) -------------------------------------------------------------------------

  const BAND = 50;
  const STRONG_BOX = 4;

  /**
   * The course as bands of 50 items (1-based, inclusive from/to), each cell {item, state: new|learning|strong, due, grammar},
   * with per-band learned and due counts, plus per-skill {learned, strong} over every entry in words.
   * An item is strong when every skill it is drilled in (hearing only for grammar) is in box 4 or higher.
   */
  function library(course, words, today) {
    const w = words && typeof words === "object" ? words : {};
    const skills = {};
    for (const k of SKILLS) skills[k] = { learned: 0, strong: 0 };
    for (const e of Object.values(w)) {
      if (!e) continue;
      for (const k of SKILLS) if (Array.isArray(e[k])) { skills[k].learned++; if (e[k][0] >= STRONG_BOX) skills[k].strong++; }
    }
    const order = (course && course.order) || [];
    const bands = [];
    for (let at = 0; at < order.length; at += BAND) {
      const cells = [];
      let learned = 0, dueN = 0;
      for (const item of order.slice(at, at + BAND)) {
        const e = Object.prototype.hasOwnProperty.call(w, item) ? w[item] : null;
        const grammar = isGrammar(item);
        const need = grammar ? ["h"] : SKILLS;
        const isDue = !!e && SKILLS.some((k) => Array.isArray(e[k]) && e[k][1] <= today);
        const state = !e ? "new" : need.every((k) => Array.isArray(e[k]) && e[k][0] >= STRONG_BOX) ? "strong" : "learning";
        if (e) learned++;
        if (isDue) dueN++;
        cells.push({ item, state, due: isDue, grammar });
      }
      bands.push({ from: at + 1, to: at + cells.length, learned, due: dueN, cells });
    }
    return { bands, skills };
  }

  return { SKILLS, library, wordsUnlocked, nextNew, due, planDay, record, markSeen, shortEn, meaning, info, checkTyped, exercises, hear, read, type };
});
