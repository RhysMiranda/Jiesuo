/* Jiesuo journey: pure logic for the daily lesson (no DOM), so it runs in the browser and under node --test. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JiesuoJourney = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");
  /** Local calendar day, so "today" matches the learner's own clock. */
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (day) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  function addDays(day, n) {
    const t = new Date(parse(day) + n * 864e5);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

  // Leitner boxes: an item in box k comes back after BOXES[k-1] days.
  const BOXES = [1, 2, 4, 8, 16, 32];
  function schedule(entry, correct, today) {
    if (!correct) return [1, addDays(today, 1)];
    const box = entry ? Math.min(BOXES.length, entry[0] + 1) : 1;
    return [box, addDays(today, BOXES[box - 1])];
  }

  /** Items due today or earlier: most overdue first, then the least secure. */
  function dueReviews(review, today, limit = 5) {
    return [...review].filter(([, [, due]]) => due <= today)
      .sort((a, b) => (a[1][1] < b[1][1] ? -1 : a[1][1] > b[1][1] ? 1 : a[1][0] - b[1][0] || a[0] - b[0]))
      .slice(0, limit).map(([u]) => u);
  }

  /** The next new items for a lesson: parts, characters and words in the learner's order, no grammar. */
  const pickNew = (core, order, known, k = 3) => (k > 0 ? core.next(order, known, k, 0) : []);

  const HAN = /[㐀-䶿一-鿿\u{20000}-\u{3ffff}]/u;
  /**
   * The shortest example sentence that is fully readable with knownAfter but was not with knownBefore.
   * Only sentences containing a character of a newly known item are tokenised, to keep this fast.
   */
  function unlockSentence(core, rows, knownBefore, knownAfter) {
    const fresh = [...knownAfter].filter((u) => !knownBefore.has(u) && u < core.n);
    const chars = new Set(fresh.flatMap((u) => Array.from(core.get(u).form)).filter((c) => HAN.test(c)));
    if (!chars.size) return null;
    const readable = (text, known) => core.tokenise(text).every((t) => !t.han || (t.unit !== null && known.has(t.unit)));
    let best = null;
    for (const row of rows) {
      const text = row[1];
      if (best && text.length >= best[1].length) continue;
      if (!Array.from(text).some((c) => chars.has(c))) continue;
      if (readable(text, knownAfter) && !readable(text, knownBefore)) best = row;
    }
    return best;
  }

  /**
   * The focus map around one item. Each item's state is "known", "ready" (everything it needs is
   * known) or "locked". parts: what it is made of (required parts first, then shape-only ones).
   * unlocks: what is built from it; "ready" means nothing else is missing besides this item,
   * so ready ones open as soon as this is learned. Ready first, then most frequent.
   */
  function focusInfo(core, i, known) {
    const stateOf = (u) => (known.has(u) ? "known" : core.prereq[u].every((p) => known.has(p)) ? "ready" : "locked");
    const hard = core.prereq[i];
    const soft = i < core.n ? core.softParts[i].filter((p) => !hard.includes(p)) : [];
    const parts = [...new Set([...hard, ...soft])].map((u) => ({ u, state: stateOf(u), soft: !hard.includes(u) }));
    const weight = (u) => core.get(u).freq || 0;
    const unlocks = core.children[i].map((c) => {
      const missing = core.prereq[c].filter((p) => p !== i && !known.has(p));
      return { u: c, ready: missing.length === 0, missing, state: stateOf(c) };
    }).sort((a, b) => (b.ready - a.ready) || weight(b.u) - weight(a.u) || a.u - b.u);
    const readyCount = unlocks.filter((x) => x.ready).length;
    return { u: i, state: stateOf(i), needs: hard.filter((p) => !known.has(p)), parts, unlocks, readyCount, laterCount: unlocks.length - readyCount };
  }

  // ---- Dictation every two weeks: hear words from the fortnight and write them from memory.
  const DICTATION_EVERY = 14, DICTATION_MIN = 5;
  /** Words and characters (not parts) learned or reviewed in the last 14 days. seen: Map unit -> day. */
  function dictationPool(core, seen, today) {
    const from = addDays(today, -DICTATION_EVERY);
    return [...seen].filter(([u, day]) => day >= from && u < core.n && core.get(u).kind !== "p");
  }
  /** The day the next dictation is counted from: the last dictation, else the first day of learning. */
  function dictationAnchor({ days, dictations }) {
    if (dictations && dictations.length) return dictations[dictations.length - 1].day;
    const sorted = [...(days || [])].sort();
    return sorted[0] || null;
  }
  /** Days until the next dictation (0 = today), or null before the first lesson. */
  function nextDictationIn(core, st, today) {
    const anchor = dictationAnchor(st);
    return anchor ? Math.max(0, DICTATION_EVERY - daysBetween(anchor, today)) : null;
  }
  function dictationDue(core, st, today) {
    return nextDictationIn(core, st, today) === 0 && dictationPool(core, st.seen || new Map(), today).length >= DICTATION_MIN;
  }
  /** Up to k items from the fortnight: least secure first (lowest review box), then most recent. */
  function pickDictation(core, seen, review, today, k = 10) {
    const box = (u) => (review.get(u) || [0])[0];
    return dictationPool(core, seen, today)
      .sort((a, b) => box(a[0]) - box(b[0]) || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0) || a[0] - b[0])
      .slice(0, k).map(([u]) => u);
  }

  // The journey path. Counts say how far away they are; flags are firsts.
  const MILESTONES = [
    { key: "first-char", label: "Your first character", field: "chars", target: 1 },
    { key: "first-write", label: "Your first character written", field: "written", target: 1 },
    { key: "chars-10", label: "10 characters", field: "chars", target: 10, unit: "characters" },
    { key: "first-sentence", label: "Your first sentence read in full", field: "unlocked", target: 1 },
    { key: "days-7", label: "7 days of learning", field: "days", target: 7, unit: "days of learning" },
    { key: "chars-50", label: "50 characters", field: "chars", target: 50, unit: "characters" },
    { key: "hsk1", label: "All of HSK 1", field: "hsk1Done", target: true },
    { key: "words-100", label: "100 words", field: "words", target: 100, unit: "words" },
    { key: "cover-25", label: "A quarter of everyday Chinese", field: "coverage", target: 0.25, pct: true },
    { key: "chars-100", label: "100 characters", field: "chars", target: 100, unit: "characters" },
    { key: "days-30", label: "30 days of learning", field: "days", target: 30, unit: "days of learning" },
    { key: "chars-250", label: "250 characters", field: "chars", target: 250, unit: "characters" },
    { key: "cover-50", label: "Half of everyday Chinese", field: "coverage", target: 0.5, pct: true },
    { key: "words-500", label: "500 words", field: "words", target: 500, unit: "words" },
    { key: "chars-500", label: "500 characters", field: "chars", target: 500, unit: "characters" },
    { key: "cover-75", label: "Three quarters of everyday Chinese", field: "coverage", target: 0.75, pct: true },
    { key: "chars-1000", label: "1,000 characters", field: "chars", target: 1000, unit: "characters" },
  ];
  /** ctx: {chars, words, written, unlocked, days, coverage (0..1), hsk1Done}. */
  function milestones(ctx) {
    return MILESTONES.map((m) => {
      const v = ctx[m.field];
      const reached = m.target === true ? !!v : v >= m.target;
      let hint = "";
      if (!reached && m.unit) hint = `${m.target - v} more ${m.target - v === 1 ? m.unit.replace(/s(?= |$)/, "") : m.unit}`;
      else if (!reached && m.pct) hint = `${Math.round(v * 100)}% so far`;
      return { key: m.key, label: m.label, reached, hint };
    });
  }

  return { dayKey, addDays, daysBetween, BOXES, schedule, dueReviews, pickNew, unlockSentence, focusInfo, dictationDue, nextDictationIn, pickDictation, DICTATION_EVERY, MILESTONES, milestones };
});
