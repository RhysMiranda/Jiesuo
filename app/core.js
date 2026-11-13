/* Jiesuo core: pure logic with no DOM, so it runs in the browser and under node --test. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JiesuoCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // A part is required only when the data explains why it is there (see jiesuo/order.py).
  const HARD_ROLES = new Set(["semantic", "phonetic", "both", "meaning"]);
  const HAN = /[㐀-䶿一-鿿\u{20000}-\u{3ffff}]/u;
  const MAX_WORD = 8;
  const FLOOR = 0.01; // per million, for items with no frequency data
  const UNKNOWN_COST = 22; // cost of a character outside the graph, above any real single character

  function createCore(data) {
    const items = data.dict.items.map(([kind, form, pinyin, gloss, freq, others, hk], i) => ({
      i, kind, form, pinyin, gloss, freq, others: others || [], hk: hk || "",
    }));
    const n = items.length;
    const glyphUnit = new Map(), wordUnit = new Map(), lookup = new Map();
    for (const it of items) (it.kind === "w" ? wordUnit : glyphUnit).set(it.form, it.i);
    // Lookup of any written form to a unit. Simplified forms win over Traditional ones.
    for (const it of items) if (it.kind !== "p") lookup.set(it.form, it.i);
    const byFreq = [...items].sort((a, b) => b.freq - a.freq);
    for (const it of byFreq) {
      if (it.kind === "p") continue;
      for (const f of [it.hk, ...it.others]) if (f && !lookup.has(f)) lookup.set(f, it.i);
    }

    const patterns = data.grammar.patterns.map(([key, level, pattern, explanation, requires, detect, count], k) => ({
      i: n + k, kind: "g", key, level, form: pattern, explanation, requires, detect, count,
    }));
    const prereq = Array.from({ length: n + patterns.length }, () => []);
    const softParts = Array.from({ length: n }, () => []);
    for (const it of items) {
      if (it.kind === "w") {
        for (const c of new Set(it.form)) if (glyphUnit.has(c)) prereq[it.i].push(glyphUnit.get(c));
      } else {
        const rec = data.parts.parts[it.form];
        for (const [part, role] of (rec && rec.p) || []) {
          if (!glyphUnit.has(part)) continue;
          (HARD_ROLES.has(role) ? prereq[it.i] : softParts[it.i]).push(glyphUnit.get(part));
        }
      }
    }
    for (const p of patterns) prereq[p.i] = [...p.requires];
    const children = Array.from({ length: prereq.length }, () => []);
    prereq.forEach((ps, i) => ps.forEach((p) => children[p].push(i)));

    const get = (i) => (i < n ? items[i] : patterns[i - n]);
    const totalFreq = items.reduce((s, it) => s + it.freq, 0);
    const compiled = patterns.filter((p) => p.detect).map((p) => ({ i: p.i, steps: compileLiteral(p.detect) }));

    /** Unknown ancestors of a unit, then the unit, prerequisites always first. */
    function closure(i, known) {
      const out = [], seen = new Set();
      (function visit(u) {
        if (seen.has(u) || (known && known.has(u))) return;
        seen.add(u);
        for (const p of prereq[u]) visit(p);
        out.push(u);
      })(i);
      return out;
    }

    /**
     * The next k unknown items in an order. Orders are topological, so prerequisites appear first.
     * Marking a level as known can leave a backlog of patterns at the front, so at most
     * maxGrammar patterns are shown; nothing depends on a pattern, so skipping is safe.
     */
    function next(order, known, k = 10, maxGrammar = 3) {
      const out = [];
      let grammar = 0;
      for (const i of order) {
        if (known.has(i)) continue;
        if (i >= n && grammar === maxGrammar) continue;
        if (i >= n) grammar++;
        out.push(i);
        if (out.length === k) break;
      }
      return out;
    }

    /** Unknown items whose prerequisites are all known, in the given order. */
    function frontier(order, known) {
      return order.filter((i) => !known.has(i) && prereq[i].every((p) => known.has(p)));
    }

    /** Most probable segmentation by dynamic programming over word frequencies. */
    function segmentRun(run) {
      const chars = Array.from(run), m = chars.length;
      const best = new Array(m + 1).fill(Infinity), back = new Array(m + 1).fill(0);
      best[0] = 0;
      for (let a = 0; a < m; a++) {
        if (best[a] === Infinity) continue;
        let piece = "";
        for (let b = a + 1; b <= Math.min(m, a + MAX_WORD); b++) {
          piece += chars[b - 1];
          const u = lookup.get(piece);
          let cost;
          if (u !== undefined) cost = -Math.log(Math.max(items[u].freq, FLOOR) / 1e6);
          else if (b === a + 1) cost = UNKNOWN_COST;
          else continue;
          if (best[a] + cost < best[b]) { best[b] = best[a] + cost; back[b] = a; }
        }
      }
      const toks = [];
      for (let e = m; e > 0; e = back[e]) toks.unshift(chars.slice(back[e], e).join(""));
      return toks;
    }

    /** Text to tokens. Non-Han runs are kept as plain text so the reader can redraw the text. */
    function tokenise(text) {
      const toks = [];
      let run = "", other = "";
      const flushRun = () => {
        for (const t of segmentRun(run)) {
          const u = lookup.get(t);
          toks.push({ text: t, han: true, unit: u === undefined ? null : u });
        }
        run = "";
      };
      const flushOther = () => { if (other) toks.push({ text: other, han: false }); other = ""; };
      for (const ch of text) {
        if (HAN.test(ch)) { flushOther(); run += ch; } else { if (run) flushRun(); other += ch; }
      }
      if (run) flushRun();
      flushOther();
      return toks;
    }

    /** Literal-only grammar patterns present in the tokens. Others need POS tags, which the app lacks. */
    function spotPatterns(tokens) {
      const words = tokens.filter((t) => t.han).map((t) => (t.unit === null ? t.text : items[t.unit].form));
      return compiled.filter((p) => matches(p.steps, words)).map((p) => p.i);
    }

    /**
     * "Can I read this?". The learning set is the union of each unknown token's closure, which is
     * the smallest set that makes every token readable for this segmentation under these prerequisites.
     * `ladder` orders it so that each step gives the most new tokens per item learned.
     */
    function analyse(text, known) {
      const tokens = tokenise(text);
      const han = tokens.filter((t) => t.han);
      const count = new Map();
      let readable = 0, outside = 0;
      for (const t of han) {
        if (t.unit === null) outside++;
        else if (known.has(t.unit)) readable++;
        else count.set(t.unit, (count.get(t.unit) || 0) + 1);
      }
      const ladder = [], have = new Set(known), left = new Map(count);
      let reached = readable;
      while (left.size) {
        let bestUnit = null, bestScore = -1, bestSet = null;
        for (const u of [...left.keys()].sort((a, b) => a - b)) {
          const set = closure(u, have);
          const gain = set.reduce((s, x) => s + (left.get(x) || 0), 0);
          if (gain / set.length > bestScore) { bestScore = gain / set.length; bestUnit = u; bestSet = set; }
        }
        for (const x of bestSet) {
          have.add(x);
          reached += left.get(x) || 0;
          left.delete(x);
        }
        ladder.push({ target: bestUnit, items: bestSet, reached });
      }
      const learn = ladder.flatMap((s) => s.items);
      return { tokens, total: han.length, readable, outside, unknownTokens: han.length - readable - outside, ladder, learn, count, patterns: spotPatterns(tokens) };
    }

    /**
     * How Read shows a token. Simplified mode shows the Simplified form. Traditional mode keeps
     * what the person typed, so a pasted 髮 stays 髮. Simplified input is converted word by word,
     * and a lone character with several Traditional forms (发: 發 or 髮) lists the others.
     */
    function shownForm(token, script) {
      const it = items[token.unit];
      if (script !== "t") return { text: it.form, alternatives: [] };
      if (token.text !== it.form) return { text: token.text, alternatives: [] };
      // Only flag characters the conversion changed. 了 also has a rare form 瞭, but bare 了 is almost always 了.
      return { text: it.hk || it.form, alternatives: it.hk ? it.others.filter((f) => f !== it.hk) : [] };
    }

    // ---- Search, Pleco-style: characters (either script), pinyin with or without tones, or English.
    let searchIndex = null;
    function buildSearchIndex() {
      return items.map((it) => {
        const rec = (data.parts.parts || {})[it.form] || {};
        const readings = (it.pinyin || rec.y || "").split(",").map((r) => syllables(r)).filter((s) => s.length);
        // Parts also carry Make Me a Hanzi's short meaning ("hand" for 扌).
        const gloss = [it.gloss, it.kind === "p" ? rec.d : ""].filter(Boolean).join("; ").toLowerCase();
        const senses = gloss.split(";").map((s) => s.replace(/\([^)]*\)/g, "").replace(/^\s*to /, "").trim());
        return { forms: [it.form, it.hk, ...it.others].filter(Boolean), readings, gloss, senses };
      });
    }

    /** search("nihao") -> unit ids, best first. Grammar patterns are not included. */
    function search(query, limit = 50) {
      const q = String(query || "").trim();
      if (!q) return [];
      if (!searchIndex) searchIndex = buildSearchIndex();
      const scores = new Map();
      const add = (i, s) => { if (!scores.has(i) || s < scores.get(i)) scores.set(i, s); };
      const han = Array.from(q).filter((c) => HAN.test(c)).join("");
      if (han) {
        searchIndex.forEach((x, i) => {
          for (const f of x.forms) {
            if (f === han) add(i, 0);
            else if (f.startsWith(han)) add(i, 1);
            else if (f.includes(han)) add(i, 2);
          }
        });
      } else {
        const pq = parsePinyinQuery(q);
        if (pq) searchIndex.forEach((x, i) => {
          for (const r of x.readings) {
            const m = matchPinyin(pq, r);
            if (m) add(i, m === "exact" ? 0.5 : 1.5);
          }
        });
        const eq = q.toLowerCase().replace(/\s+/g, " ");
        if (/^[a-z][a-z '-]*$/.test(eq)) {
          const word = new RegExp(`(^|[^a-z])${eq.replace(/[-']/g, "\\$&")}([^a-z]|$)`);
          searchIndex.forEach((x, i) => {
            if (x.senses.includes(eq)) add(i, 1);
            else if (word.test(x.gloss)) add(i, 3);
          });
        }
      }
      return [...scores].sort((a, b) => a[1] - b[1] || items[b[0]].freq - items[a[0]].freq || items[a[0]].form.length - items[b[0]].form.length)
        .slice(0, limit).map(([i]) => i);
    }

    /** Share of everyday text covered by known units, estimated from word frequencies. */
    function estimatedCoverage(known) {
      let s = 0;
      for (const i of known) if (i < n) s += items[i].freq;
      return totalFreq ? s / totalFreq : 0;
    }

    return { items, patterns, get, n, prereq, softParts, children, closure, next, frontier, tokenise, segmentRun, analyse, spotPatterns, estimatedCoverage, shownForm, search, lookup, glyphUnit, wordUnit };
  }

  // ---- Pinyin for search. Tones: 1-4, and 5 for neutral. ü is written v.
  const TONE_MARK = { "\u0304": 1, "\u0301": 2, "\u030c": 3, "\u0300": 4 };
  /** "nǐ hǎo" -> [["ni", 3], ["hao", 3]]. */
  function syllables(reading) {
    const out = [];
    for (const syl of reading.toLowerCase().normalize("NFD").split(/[\s·'-]+/)) {
      let s = "", tone = 5;
      for (const ch of syl) {
        if (TONE_MARK[ch]) tone = TONE_MARK[ch];
        else if (ch === "\u0308") s = s.replace(/u$/, "v");
        else if (ch >= "a" && ch <= "z") s += ch;
      }
      if (s) out.push([s, tone]);
    }
    return out;
  }
  /**
   * What someone typed, as letters plus tone constraints: a digit says the syllable ends there with
   * that tone ("ni3hao"), a tone mark says the syllable holding that letter has that tone ("nǐhao").
   * Returns null when the text cannot be pinyin.
   */
  function parsePinyinQuery(text) {
    const s = text.toLowerCase().replace(/u:/g, "v").normalize("NFD");
    let letters = "";
    const ends = [], marks = [];
    for (const ch of s) {
      if (ch >= "a" && ch <= "z") letters += ch;
      else if (ch === "\u0308") letters = letters.replace(/u$/, "v");
      else if (TONE_MARK[ch]) { if (letters) marks.push([letters.length - 1, TONE_MARK[ch]]); }
      else if (ch >= "1" && ch <= "5") { if (letters) ends.push([letters.length, +ch]); }
      else if (!/[\s'·-]/.test(ch)) return null;
    }
    return letters ? { letters, ends, marks } : null;
  }
  /** "exact", "prefix" or null. */
  function matchPinyin(q, syls) {
    const plain = syls.map((x) => x[0]).join("");
    if (!plain.startsWith(q.letters)) return null;
    const toneAt = [], endTone = new Map();
    let pos = 0;
    for (const [s, t] of syls) { for (let k = 0; k < s.length; k++) toneAt.push(t); pos += s.length; endTone.set(pos, t); }
    if (!q.ends.every(([p, t]) => endTone.get(p) === t)) return null;
    if (!q.marks.every(([p, t]) => toneAt[p] === t)) return null;
    return plain.length === q.letters.length ? "exact" : "prefix";
  }

  function compileLiteral(spec) {
    const steps = spec.split(/\s+/);
    return {
      start: steps[0] === "^",
      end: steps[steps.length - 1] === "$",
      seq: steps.filter((s) => s !== "^" && s !== "$").map((s) => (s === ".." ? null : new Set(s.split("|")))),
    };
  }

  function matches(c, words) {
    const seq = c.seq;
    const from = (at, w) => {
      if (at === seq.length) return !c.end || w === words.length;
      if (seq[at] === null) {
        for (let g = 0; g <= 20 && w + g <= words.length; g++) if (from(at + 1, w + g)) return true;
        return false;
      }
      return w < words.length && seq[at].has(words[w]) && from(at + 1, w + 1);
    };
    if (c.start) return from(0, 0);
    for (let w = 0; w < words.length; w++) if (from(0, w)) return true;
    return false;
  }

  /** Progress as stable IDs, so an export survives a rebuild of the data. */
  /**
   * Progress file. Version 2 adds the journey: review schedule (id -> [box, due day]), days learned,
   * milestones reached (key -> day), stats, and the lesson in progress. Items are stored by stable
   * ids ("w:学生", "h:好", "g:key") so files survive data rebuilds.
   */
  function serialise(state, core) {
    const id = (i) => { const it = core.get(i); return it.kind === "g" ? "g:" + it.key : (it.kind === "w" ? "w:" : "h:") + it.form; };
    const ids = (list) => (list || []).map(id);
    const lesson = state.lesson ? { ...state.lesson, items: ids(state.lesson.items), reviews: ids(state.lesson.reviews), added: ids(state.lesson.added) } : null;
    return {
      app: "jiesuo", version: 2, savedAt: state.savedAt || null,
      known: [...state.known].map(id).sort(), traditionalToo: [...(state.tradSeen || [])].map(id).sort(), script: state.script, focus: state.focus,
      review: Object.fromEntries([...(state.review || new Map())].map(([u, e]) => [id(u), e])),
      days: [...(state.days || [])].sort(), milestones: state.milestones || {}, stats: state.stats || { written: 0, unlocked: 0 }, lesson,
    };
  }

  function deserialise(obj, core) {
    if (!obj || obj.app !== "jiesuo" || !Array.isArray(obj.known)) throw new Error("This file is not a Jiesuo progress file.");
    const ids = new Map();
    for (const it of core.items) ids.set((it.kind === "w" ? "w:" : "h:") + it.form, it.i);
    for (const p of core.patterns) ids.set("g:" + p.key, p.i);
    const pick = (list) => (list || []).map((x) => ids.get(x)).filter((x) => x !== undefined);
    const review = new Map();
    for (const [k, e] of Object.entries(obj.review || {})) if (ids.has(k) && Array.isArray(e)) review.set(ids.get(k), [e[0], e[1]]);
    const l = obj.lesson;
    const lesson = l && l.day ? { ...l, items: pick(l.items), reviews: pick(l.reviews), added: pick(l.added) } : null;
    const stats = { written: 0, unlocked: 0, ...(obj.stats || {}) };
    return {
      known: new Set(pick(obj.known)), tradSeen: new Set(pick(obj.traditionalToo)), script: obj.script === "t" ? "t" : "s", focus: obj.focus === "hsk" ? "hsk" : "unlock",
      review, days: new Set(obj.days || []), milestones: { ...(obj.milestones || {}) }, stats, lesson,
      skipped: obj.known.length - pick(obj.known).length,
    };
  }

  return { createCore, serialise, deserialise };
});
