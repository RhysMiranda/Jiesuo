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

  /**
   * Example sentences readable in full with what is known. `cache` (a Map) keeps each sentence's
   * units between calls, so only the first call tokenises. A sentence with a word outside our data
   * is never readable. Newest first: the day its last item was learned or reviewed, then shortest.
   */
  function readableRows(core, rows, known, seen, cache = new Map()) {
    const out = [];
    for (const row of rows) {
      let units = cache.get(row[0]);
      if (units === undefined) {
        const toks = core.tokenise(row[1]).filter((t) => t.han);
        units = toks.some((t) => t.unit === null) ? null : [...new Set(toks.map((t) => t.unit))];
        cache.set(row[0], units);
      }
      if (units && units.length && units.every((u) => known.has(u))) {
        const day = units.reduce((d, u) => { const s = seen && seen.get(u); return s && s > d ? s : d; }, "");
        out.push({ row, day });
      }
    }
    return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.row[1].length - b.row[1].length));
  }

  /**
   * A look back once a week. With no snapshot yet, or a week with nothing new, take a snapshot quietly
   * (a quiet week is never mentioned). Otherwise show the week's gains.
   */
  function weekRecap(weeks, now, today) {
    const last = weeks && weeks[weeks.length - 1];
    if (!last) return { action: "snapshot" };
    if (daysBetween(last.day, today) < 7) return { action: "none" };
    const gains = {
      chars: now.chars - last.chars, words: now.words - last.words, written: now.written - last.written,
      unlocked: now.unlocked - last.unlocked, coverage: now.coverage - last.coverage, since: last.day,
    };
    const any = gains.chars > 0 || gains.words > 0 || gains.written > 0 || gains.unlocked > 0;
    return any ? { action: "show", gains } : { action: "snapshot" };
  }
  /**
   * How firmly an item is held: its review box (1 to 6) as a strength, and whether it is due again.
   * Items marked as known without reviews have no box (strength null).
   */
  function memoryOf(entry, today) {
    if (!entry) return { strength: null, due: false };
    return { strength: entry[0] / BOXES.length, due: entry[1] <= today };
  }

  /**
   * Everything learned, grouped for revisiting. `by`: "recent" (today, this week, this month, earlier,
   * marked as known), "meaning" (characters by the part that gives their meaning, then words),
   * "level" (HSK band) or "refresh" (due or least secure first). Grammar is its own group in each.
   */
  function library(core, { known, seen, review }, today, by, bands = []) {
    const units = [...known].filter((u) => u < core.n || core.get(u));
    const kindRank = { c: 0, w: 1, p: 2, g: 3 };
    const byKind = (a, b) => kindRank[core.get(a).kind] - kindRank[core.get(b).kind] || (core.get(b).freq || 0) - (core.get(a).freq || 0);
    const groups = new Map();
    const put = (key, title, u, extra = {}) => { if (!groups.has(key)) groups.set(key, { key, title, units: [], ...extra }); groups.get(key).units.push(u); };
    if (by === "refresh") {
      const scored = units.filter((u) => review.has(u)).map((u) => [u, review.get(u)]);
      scored.sort((a, b) => (a[1][1] <= today) === (b[1][1] <= today) ? a[1][0] - b[1][0] || (a[1][1] < b[1][1] ? -1 : 1) : a[1][1] <= today ? -1 : 1);
      return scored.length ? [{ key: "refresh", title: "Ready for a refresh", units: scored.map(([u]) => u) }] : [];
    }
    for (const u of units.sort(byKind)) {
      const it = core.get(u);
      if (it.kind === "g") { put("g", "Grammar", u); continue; }
      if (by === "recent") {
        const d = seen.get(u);
        if (!d) put("z", "Marked as known", u);
        else {
          const ago = daysBetween(d, today);
          if (ago <= 0) put("a", "Today", u);
          else if (ago <= 7) put("b", "This week", u);
          else if (ago <= 31) put("c", "This month", u);
          else put("d", "Earlier", u);
        }
      } else if (by === "level") {
        const b = bands[u] || 0;
        put(b ? `l${b}` : "l9", b ? (b === 7 ? "HSK 7–9" : `HSK ${b}`) : "Beyond HSK", u);
      } else {
        if (it.kind === "w") { put("~w", "Words", u); continue; }
        if (it.kind === "p") { put("~p", "Parts", u); continue; }
        const rec = (core.partsData || {})[it.form] || {};
        const part = ((rec.p || []).find(([, role]) => role === "semantic") || [null])[0];
        if (part) put(`m${part}`, part, u, { part });
        else put("~c", "Other characters", u);
      }
    }
    let out = [...groups.values()];
    if (by === "recent") {
      const at = (k) => (k === "g" ? "zz" : k); // grammar after the dated groups
      out.sort((a, b) => (at(a.key) < at(b.key) ? -1 : 1));
      for (const g of out) if (g.key !== "z" && g.key !== "g") g.units.sort((a, b) => ((seen.get(b) || "") < (seen.get(a) || "") ? -1 : (seen.get(b) || "") > (seen.get(a) || "") ? 1 : byKind(a, b)));
    } else if (by === "level") out.sort((a, b) => (a.key < b.key ? -1 : 1));
    else {
      // Meaning groups: the biggest first, then small ones gathered at the end.
      const big = out.filter((g) => g.part && g.units.length >= 3).sort((a, b) => b.units.length - a.units.length);
      const small = out.filter((g) => g.part && g.units.length < 3).flatMap((g) => g.units);
      const rest = out.filter((g) => !g.part);
      const other = rest.find((g) => g.key === "~c");
      if (small.length) { if (other) other.units.unshift(...small); else rest.unshift({ key: "~c", title: "Other characters", units: small }); }
      out = [...big, ...rest.sort((a, b) => (a.key < b.key ? -1 : 1))];
    }
    return out;
  }

  const snapshot = (now, today) => ({ day: today, chars: now.chars, words: now.words, written: now.written, unlocked: now.unlocked, coverage: Math.round(now.coverage * 1e4) / 1e4 });

  return { dayKey, addDays, daysBetween, BOXES, schedule, dueReviews, pickNew, unlockSentence, focusInfo, dictationDue, nextDictationIn, pickDictation, DICTATION_EVERY, MILESTONES, milestones, readableRows, weekRecap, snapshot, memoryOf, library };
});
