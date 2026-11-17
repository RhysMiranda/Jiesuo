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
  const TONE_MAP = { "7": "1", "8": "3", "9": "6" };

  /** "NeiHou", "nei5 hou2", "sik9" -> {syls:[{base, tone|null}]} or null. */
  function normalise(input) {
    try {
      if (typeof input !== "string") return null;
      const s = input.toLowerCase().replace(/[\s'’`]+/g, "").replace(/[789]/g, (d) => TONE_MAP[d]);
      if (!s || s.length > MAX_INPUT || !/^[a-z1-6]+$/.test(s) || /^[1-6]/.test(s)) return null;
      const memo = new Map();
      const walk = (i) => {
        if (i === s.length) return [];
        if (memo.has(i)) return memo.get(i);
        let res = null;
        for (let j = Math.min(s.length, i + 6); j > i && !res; j--) {
          const base = s.slice(i, j);
          if (!SYLLABLES.has(base)) continue;
          let end = j, tone = null;
          if (/[1-6]/.test(s[j] || "")) { tone = Number(s[j]); end = j + 1; }
          const rest = walk(end);
          if (rest) res = [{ base, tone }].concat(rest);
        }
        memo.set(i, res);
        return res;
      };
      const syls = walk(0);
      return syls && syls.length ? { syls } : null;
    } catch (e) { return null; }
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
      const e = { form: row[0], jp: row[1] || "", en: row[2] || "", rank: row[3] == null ? 1e9 : row[3], flags: row[4] | 0 };
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
        const out = { form: e.form, jp: e.jp, en: enOf(e), whkEn: (w0 && w0[1]) || null, rank: e.rank, changed: !!(e.flags & 1), alt: !!(e.flags & 2), unchecked: !!(e.flags & 4) };
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
            out.push({ t: c, word: null, jp: (Array.isArray(r) ? r[0] : r) || null, kind: "han" });
            i++;
          }
        }
        flush();
      } catch (err) { /* never throw */ }
      return out;
    }

    function candidates(input, k) {
      try {
        const n = normalise(input);
        if (!n) return [];
        const limit = k == null ? 9 : k;
        const pool = byFirst.get(n.syls[0].base) || [];
        const exact = [], prefix = [];
        for (const e of pool) {
          if (e.syls.length < n.syls.length) continue;
          let ok = true;
          for (let i = 0; i < n.syls.length && ok; i++) {
            ok = e.syls[i] === n.syls[i].base && (n.syls[i].tone == null || n.syls[i].tone === e.tones[i]);
          }
          if (!ok) continue;
          (e.syls.length === n.syls.length ? exact : prefix).push({ form: e.form, jp: e.jp });
        }
        return exact.concat(prefix).slice(0, limit);
      } catch (err) { return []; }
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

    return { word, segment, normalise, candidates, search, example };
  }

  return { create, normalise };
});
