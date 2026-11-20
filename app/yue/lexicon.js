/* Jiesuo Cantonese: lexicon (segmenting, search, Jyutping typing candidates). Pure, no DOM, never throws. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./jyutping.js"));
  else root.JyutLex = factory(root.JyutJyutping);
})(typeof self !== "undefined" ? self : this, function (JP) {
  "use strict";

  const HAN = /\p{Script=Han}/u;
  const MAXLEN = 4, MAX_RESULTS = 30, MAX_INPUT = 80;

  // Toneless syllable inventory, derived from jyutping.js.
  const SYLLABLES = new Set();
  for (const ini of [""].concat(JP.INITIALS)) {
    for (const fin of JP.FINALS) {
      try { JP.parse(ini + fin + "1"); SYLLABLES.add(ini + fin); } catch (e) { /* not a syllable */ }
    }
  }
  const STATUS = { a: "agree", c: "corpus", e: "attested", w: "wordshk", o: "override" }; // row[5]: how the reading was settled
  const TONE_MAP = { "7": "1", "8": "3", "9": "6" };

  const MAX_SPLITS = 8;
  // Tones 7, 8 and 9 are the checked-tone spellings of 1, 3 and 6. We accept them on any syllable, open ones
  // included (lenient: "nei7" is read as nei1 rather than rejected).

  /** Every way to cut loose input into syllables, longest syllable first, at most MAX_SPLITS: [[{base, tone|null}]] */
  function splitsOf(input) {
    try {
      if (typeof input !== "string") return [];
      const s = input.toLowerCase().replace(/[\s'’`]+/g, "").replace(/[789]/g, (d) => TONE_MAP[d]);
      if (!s || s.length > MAX_INPUT || !/^[a-z1-6]+$/.test(s) || /^[1-6]/.test(s)) return [];
      const steps = (i) => { // the syllables that can start at i, with where they end
        const out = [];
        for (let j = Math.min(s.length, i + 6); j > i; j--) {
          const base = s.slice(i, j);
          if (!SYLLABLES.has(base)) continue;
          if (/[1-6]/.test(s[j] || "")) out.push({ base, tone: Number(s[j]), end: j + 1 });
          else out.push({ base, tone: null, end: j });
        }
        return out;
      };
      const can = new Map(); // can the rest from i be cut at all?
      const finishes = (i) => {
        if (i === s.length) return true;
        if (can.has(i)) return can.get(i);
        const r = steps(i).some((x) => finishes(x.end));
        can.set(i, r);
        return r;
      };
      const res = [];
      const walk = (i, acc) => {
        if (res.length >= MAX_SPLITS) return;
        if (i === s.length) { res.push(acc); return; }
        for (const x of steps(i)) if (finishes(x.end)) walk(x.end, acc.concat([{ base: x.base, tone: x.tone }]));
      };
      walk(0, []);
      return res;
    } catch (e) { return []; }
  }

  /** "NeiHou", "nei5 hou2", "sik9" -> {syls:[{base, tone|null}]} (the longest-first split) or null. */
  function normalise(input) {
    const all = splitsOf(input);
    return all.length ? { syls: all[0] } : null;
  }

  /** Target Jyutping ("nei5 hou2") against what was typed. Case, spaces and tone digits 7-9 are forgiven. */
  function scoreTyping(target, typed) {
    const res = { ok: false, wrongTones: [], wrongSyls: [] };
    try {
      const want = String(target || "").toLowerCase().split(/\s+/).filter(Boolean).map((x) => {
        const m = /^([a-z]+)([1-6])?$/.exec(x);
        return m ? { base: m[1], tone: m[2] ? Number(m[2]) : null } : { base: x, tone: null };
      });
      const got = splitsOf(typed);
      if (!want.length || !got.length) { res.wrongSyls = want.map((_, i) => i); return res; }
      // the split that agrees with the target's own syllables in the most places (the first one on a tie)
      const hits = (x) => want.reduce((n, w, i) => n + (x[i] && x[i].base === w.base ? 1 : 0), 0) * 100 - Math.abs(x.length - want.length);
      const g = got.reduce((best, x) => (hits(x) > hits(best) ? x : best), got[0]);
      want.forEach((w, i) => {
        if (!g[i] || g[i].base !== w.base) res.wrongSyls.push(i);
        else if (g[i].tone !== w.tone) res.wrongTones.push(i);
      });
      res.ok = !res.wrongSyls.length && !res.wrongTones.length && g.length === want.length;
    } catch (e) { /* not ok */ }
    return res;
  }

  function words(text) { return (String(text || "").toLowerCase().match(/[a-z0-9]+/g) || []); }

  function create(data) {
    const d = data || {};
    const lex = d.lexicon || {};
    const wk = (d.wordshk && d.wordshk.entries) || {};
    const chars = lex.chars || {};
    const byForm = new Map();
    for (const row of lex.words || []) {
      if (!Array.isArray(row) || typeof row[0] !== "string") continue;
      const e = { form: row[0], jp: row[1] || "", en: row[2] || "", rank: row[3] == null ? 1e9 : row[3], flags: row[4] | 0, status: STATUS[row[5]] || null };
      const parts = JP.split(e.jp);
      e.syls = parts.map((x) => x.replace(/[0-9]+$/, ""));
      e.tones = parts.map((x) => { const m = /[0-9]+$/.exec(x); return m ? Number(m[0]) : null; });
      const prev = byForm.get(e.form);
      if (!prev || e.rank < prev.rank) byForm.set(e.form, e);
    }
    const entries = Array.from(byForm.values()).sort((a, b) => a.rank - b.rank);

    function wkEntry(form) {
      return Object.prototype.hasOwnProperty.call(wk, form) ? wk[form] : null;
    }
    function enOf(e) {
      const w = wkEntry(e.form);
      return e.en || (w && w[1]) || "";
    }

    // Indexes, built once.
    const byFirst = new Map();     // first toneless syllable -> entries (rank order)
    const engIndex = new Map();    // english word -> Set of forms
    const engTokens = new Map();   // form -> Set of words
    for (const e of entries) {
      const k = e.syls[0];
      if (k !== undefined) { if (!byFirst.has(k)) byFirst.set(k, []); byFirst.get(k).push(e); }
      const w = wkEntry(e.form);
      const toks = new Set(words(e.en).concat(words(w && w[1])));
      engTokens.set(e.form, toks);
      for (const t of toks) { if (!engIndex.has(t)) engIndex.set(t, new Set()); engIndex.get(t).add(e.form); }
    }

    function word(form) {
      try {
        if (typeof form !== "string") return null;
        const e = byForm.get(form);
        if (!e) return null;
        const w0 = wkEntry(form);
        const out = { form: e.form, jp: e.jp, en: enOf(e), whkEn: (w0 && w0[1]) || null, rank: e.rank, changed: !!(e.flags & 1), alt: !!(e.flags & 2), unchecked: !!(e.flags & 4), status: e.status, alts: Array.isArray(lex.alts && lex.alts[form]) ? lex.alts[form].slice() : [], labels: Object.assign({}, lex.labels && lex.labels[form]) };
        const w = wkEntry(form);
        if (w) out.wordshk = { id: w[0], eng: w[1], def: w[2] };
        return out;
      } catch (err) { return null; }
    }

    function segment(text) {
      const out = [];
      try {
        const cps = Array.from(typeof text === "string" ? text : "");
        let other = "";
        const flush = () => { if (other) { out.push({ t: other, word: null, jp: null, kind: "other" }); other = ""; } };
        let i = 0;
        while (i < cps.length) {
          if (!HAN.test(cps[i])) { other += cps[i]; i++; continue; }
          let n = 0;
          for (let len = MAXLEN; len >= 1 && !n; len--) {
            if (i + len > cps.length) continue;
            const cand = cps.slice(i, i + len);
            if (!cand.every((c) => HAN.test(c))) continue;
            if (byForm.has(cand.join(""))) n = len;
          }
          flush();
          if (n) {
            const f = cps.slice(i, i + n).join("");
            out.push({ t: f, word: word(f), jp: byForm.get(f).jp, kind: "han" });
            i += n;
          } else {
            const c = cps[i];
            const r = Object.prototype.hasOwnProperty.call(chars, c) ? chars[c] : null;
            const jp = (Array.isArray(r) ? r[0] : r) || null;
            out.push({ t: c, word: null, jp, guess: !!jp, kind: "han" }); // a character's main reading, not checked in context
            i++;
          }
        }
        flush();
      } catch (err) { /* never throw */ }
      return out;
    }

    // Does the entry's reading start with these split syllables (tone only checked where typed)?
    const startsWith = (e, syls) => {
      if (e.syls.length < syls.length) return false;
      for (let i = 0; i < syls.length; i++) {
        if (e.syls[i] !== syls[i].base || (syls[i].tone != null && syls[i].tone !== e.tones[i])) return false;
      }
      return true;
    };

    /** Words for typed Jyutping, over every split of the input: same length first, then longer, then (opts.ime) shorter. */
    function candidates(input, k, opts) {
      try {
        const splits = splitsOf(input);
        if (!splits.length) return [];
        const limit = k == null ? 9 : k;
        const ime = !!(opts && opts.ime);
        const best = new Map(); // form -> {e, kind} with kind 0 same length, 1 longer, 2 shorter
        const add = (e, kind) => { const o = best.get(e.form); if (!o || kind < o.kind) best.set(e.form, { e, kind }); };
        for (const sp of splits) {
          for (const e of byFirst.get(sp[0].base) || []) {
            if (startsWith(e, sp)) add(e, e.syls.length === sp.length ? 0 : 1);
            else if (ime && e.syls.length < sp.length && startsWith(e, sp.slice(0, e.syls.length))) add(e, 2);
          }
        }
        return Array.from(best.values())
          .sort((a, b) => a.kind - b.kind || a.e.rank - b.e.rank)
          .slice(0, limit).map((x) => ({ form: x.e.form, jp: x.e.jp }));
      } catch (err) { return []; }
    }

    /** After picking `form` from `input`: {rest, used} (the input text left and used), or null if it does not start it. */
    function consume(input, form) {
      try {
        const e = byForm.get(form);
        if (!e) return null;
        const txt = (x) => x.base + (x.tone == null ? "" : x.tone);
        for (const sp of splitsOf(input)) {
          if (e.syls.length > sp.length || !startsWith(e, sp.slice(0, e.syls.length))) continue;
          return { rest: sp.slice(e.syls.length).map(txt).join(""), used: sp.slice(0, e.syls.length).map(txt).join("") };
        }
      } catch (err) { /* null */ }
      return null;
    }

    function english(q) {
      const toks = words(q);
      if (!toks.length) return [];
      const forms = engIndex.get(toks[0]);
      if (!forms) return [];
      const res = [];
      for (const f of forms) {
        const set = engTokens.get(f);
        if (toks.every((t) => set.has(t))) res.push(byForm.get(f));
      }
      res.sort((a, b) => a.rank - b.rank);
      return res;
    }

    function search(q) {
      try {
        if (typeof q !== "string") return [];
        const s = q.trim();
        if (!s) return [];
        const pack = (e) => ({ form: e.form, jp: e.jp, en: enOf(e) });
        let res;
        if (HAN.test(s)) {
          const starts = [], contains = [];
          for (const e of entries) {
            if (e.form.startsWith(s)) starts.push(e);
            else if (e.form.includes(s)) contains.push(e);
          }
          res = starts.concat(contains);
        } else {
          const eng = english(s);
          const jy = candidates(s, MAX_RESULTS).map((c) => byForm.get(c.form));
          const jyFirst = /[1-9]/.test(s) || /\s/.test(s);
          res = jyFirst ? jy.concat(eng) : eng.concat(jy);
        }
        const seen = new Set(), out = [];
        for (const e of res) {
          if (seen.has(e.form)) continue;
          seen.add(e.form);
          out.push(pack(e));
          if (out.length >= MAX_RESULTS) break;
        }
        return out;
      } catch (err) { return []; }
    }

    function example(id) {
      try {
        const key = String(id);
        const has = (o) => o && Object.prototype.hasOwnProperty.call(o, key);
        const s = d.sentences && d.sentences.items;
        if (has(s)) {
          const r = s[key];
          return { text: r[0], jp: r[1], en: r[2], source: "tatoeba", author: r[3], enAuthor: r[4], enId: r[5] };
        }
        const h = d.hkcancor && d.hkcancor.items;
        if (has(h)) return { text: h[key][0], jp: h[key][1], en: h[key][2] || "", source: "hkcancor" };
        const w = d.wordshk && d.wordshk.examples;
        if (has(w)) return { text: w[key][0], jp: w[key][1], en: w[key][2] || "", source: "wordshk" };
      } catch (err) { /* fall through */ }
      return null;
    }

    /** Read-screen summary: Han tokens counted, those in `words` (the learner's progress) known, and up to 5 unseen,
     *  checked lexicon words by rank to learn next. Never throws. */
    function readReport(segments, wordsState) {
      const out = { known: 0, total: 0, learnNext: [] };
      try {
        const seen = wordsState && typeof wordsState === "object" ? wordsState : {};
        const next = new Map();
        for (const s of Array.isArray(segments) ? segments : []) {
          if (!s || s.kind !== "han") continue;
          out.total++;
          if (Object.prototype.hasOwnProperty.call(seen, s.t) && seen[s.t]) { out.known++; continue; }
          const e = byForm.get(s.t);
          if (e && !(e.flags & 4) && !next.has(s.t)) next.set(s.t, e.rank || 1e9); // rank 0 means unranked
        }
        out.learnNext = Array.from(next.entries()).sort((a, b) => a[1] - b[1]).slice(0, 5).map((x) => x[0]);
      } catch (err) { /* keep what we have */ }
      return out;
    }

    // Attested sentences by form, built on first use: [{id, text, rank}] over all three pools.
    let pool = null;
    function buildPool() {
      pool = [];
      const add = (items, pri) => { for (const [id, r] of Object.entries(items || {})) pool.push({ id, text: r[0], jp: r[1], en: !!r[2], pri }); };
      add(d.sentences && d.sentences.items, 0);
      add(d.wordshk && d.wordshk.examples, 1);
      add(d.hkcancor && d.hkcancor.items, 2);
    }
    /** True if the sentence says `form` with the word's reading at least once (its Jyutping over the form's characters):
     *  你呢 in 你呢排 (nei5 ni1) or 地下 in 地下音樂 (haa6) is another word. */
    function saysForm(p, form, jp) {
      const han = Array.from(p.text).filter((c) => HAN.test(c)).join("");
      const syls = String(p.jp || "").split(/\s+/).filter(Boolean), want = String(jp || "").split(/\s+/).filter(Boolean);
      if (!want.length || syls.length !== Array.from(han).length) return false;
      const cps = Array.from(han), f = Array.from(form);
      for (let i = 0; i + f.length <= cps.length; i++) {
        if (f.every((c, k) => cps[i + k] === c) && want.every((s, k) => syls[i + k] === s)) return true;
      }
      return false;
    }
    /** Up to k example ids that say `form` (saysForm): the word's own words.hk examples first, then those with an English line, Tatoeba before the rest, short first. */
    function examplesFor(form, k) {
      try {
        if (typeof form !== "string" || !form) return [];
        if (!pool) buildPool();
        const w = wkEntry(form), own = w ? "wordshk:" + w[0] + "#" : null;
        const e = byForm.get(form);
        const hits = pool.filter((p) => p.text.includes(form) && (!e || saysForm(p, form, e.jp)));
        const score = (p) => (own && p.id.startsWith(own) ? 0 : 1) * 1000 + (p.en ? 0 : 500) + p.pri * 100 + p.text.length;
        return hits.sort((a, b) => score(a) - score(b)).slice(0, k == null ? 3 : k).map((p) => p.id);
      } catch (err) { return []; }
    }

    return { word, segment, readReport, examplesFor, normalise, candidates, consume, search, example };
  }

  return { create, normalise, scoreTyping };
});
