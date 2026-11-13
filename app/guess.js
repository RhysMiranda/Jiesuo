/* Jiesuo guess check: how close an English guess is to a Chinese sentence, word by word. Pure, no DOM. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JiesuoGuess = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Grammar words: they shape the sentence but rarely show up as an English word, so they are not scored. */
  const GLUE = new Set("的了吗呢吧啊呀嘛啦哦着过地得之很是把被个么".split(""));
  const STOP = new Set(["a", "an", "the", "to", "of", "be", "is", "am", "are", "was", "were", "been", "being",
    "do", "does", "did", "sth", "sb", "etc", "one", "s", "used", "or", "as", "e", "g", "eg"]);
  const SAME = {
    me: "i", my: "i", mine: "i", myself: "i", your: "you", yours: "you", yourself: "you",
    him: "he", his: "he", himself: "he", her: "she", hers: "she", herself: "she",
    us: "we", our: "we", ours: "we", them: "they", their: "they", theirs: "they", its: "it",
    went: "go", gone: "go", goes: "go", ate: "eat", eaten: "eat", saw: "see", seen: "see", said: "say",
    had: "have", has: "have", made: "make", came: "come", gave: "give", given: "give", took: "take", taken: "take",
    bought: "buy", thought: "think", told: "tell", knew: "know", known: "know", got: "get", gotten: "get",
    felt: "feel", found: "find", wrote: "write", written: "write", spoke: "speak", spoken: "speak",
    brought: "bring", caught: "catch", met: "meet", sent: "send", spent: "spend", built: "build", lost: "lose",
    paid: "pay", heard: "hear", held: "hold", kept: "keep", began: "begin", begun: "begin", became: "become",
    chose: "choose", flew: "fly", forgot: "forget", fell: "fall", grew: "grow", sang: "sing", swam: "swim", wore: "wear",
    won: "win", understood: "understand", sold: "sell", drove: "drive", rode: "ride", woke: "wake", broke: "break",
    broken: "break", meant: "mean", read: "read", put: "put", cut: "cut", let: "let", hit: "hit", shut: "shut",
    ran: "run", sat: "sit", stood: "stand", slept: "sleep", drank: "drink", drunk: "drink", taught: "teach",
    children: "child", men: "man", women: "woman", people: "person", feet: "foot", teeth: "tooth",
    better: "good", best: "good", worse: "bad", worst: "bad", fine: "good", great: "good", nice: "good", well: "good",
    mum: "mother", mom: "mother", mommy: "mother", dad: "father", daddy: "father", kid: "child",
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten", "100": "hundred", "1000": "thousand",
  };
  // "one" is a stop word in senses ("one's"), but a number in a guess, so numbers are matched before STOP.
  const NUMBER = new Set(["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "hundred", "thousand"]);

  /** A rough stem, so "rained", "raining" and "rains" all meet "rain", and "making" meets "make". */
  function stem(w) {
    if (SAME[w] && SAME[w] !== w) return stem(SAME[w]); // went -> go, 100 -> hundred, then as any word
    let s = w;
    if (s.length > 4 && /ie[sd]$/.test(s)) s = s.slice(0, -3) + "y"; // studies, studied -> study
    else if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
    else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
    else if (s.length > 4 && s.endsWith("es") && /(ss|sh|ch|x|o)es$/.test(s)) s = s.slice(0, -2);
    else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
    if (s !== w && /([b-df-hj-np-tv-z])\1$/.test(s) && !/(ll|ss)$/.test(s)) s = s.slice(0, -1); // running -> run
    if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1); // make, making -> mak
    return s;
  }

  /** English text to [{word, key}], key being the stem to compare. Contractions are opened up. */
  function words(text) {
    const t = String(text).toLowerCase().replace(/[’']/g, "'")
      .replace(/\blet's\b/g, "let us").replace(/\bcan't\b/g, "can not").replace(/\bwon't\b/g, "will not").replace(/n't\b/g, " not")
      .replace(/'m\b/g, " am").replace(/'re\b/g, " are").replace(/'ve\b/g, " have").replace(/'ll\b/g, " will").replace(/'d\b/g, " would").replace(/'s\b/g, "");
    return (t.match(/[a-z]+|\d+/g) || []).map((w) => ({ word: w, key: stem(w) }));
  }

  /** The content stems of a meaning: no notes in brackets, no "to", "sth". */
  function senseKeys(sense) {
    return words(sense.replace(/\([^)]*\)/g, " ")).filter((w) => !STOP.has(w.word) || NUMBER.has(w.word)).map((w) => w.key);
  }

  /** Sentences of a text, punctuation kept, only those with Chinese in them. */
  function sentences(text, isHan) {
    const parts = String(text).match(/[^。！？!?；;\n]+[。！？!?；;]*[」』”"）)]*/g) || [];
    return parts.map((s) => s.trim()).filter((s) => s && isHan(s));
  }

  /**
   * Check a guess against tokens from core.analyse. `senses(unit)` gives every meaning of a unit as a
   * list of strings. Returns each token's role (glue, got, missed, nodata) with the meaning to show,
   * how many content words the guess got, and which guess words matched something.
   */
  function check(tokens, guess, senses, formOf) {
    const g = words(guess);
    const guessKeys = new Set(g.filter((w) => !STOP.has(w.word) || NUMBER.has(w.word)).map((w) => w.key));
    const used = new Set();
    const parts = tokens.map((t, k) => {
      if (!t.han) return { k, text: t.text, role: "text" };
      if (t.unit === null) return { k, text: t.text, unit: null, role: "nodata", meaning: "" };
      const list = senses(t.unit).filter(Boolean);
      const form = formOf ? formOf(t.unit) : t.text;
      const glue = GLUE.has(form);
      let hit = null, hitKeys = [];
      for (const s of list) {
        const keys = senseKeys(s).filter((x) => guessKeys.has(x));
        if (keys.length) { hit = s; hitKeys = keys; break; }
      }
      hitKeys.forEach((x) => used.add(x));
      const meaning = tidy(hit || list[0] || "");
      if (glue) return { k, text: t.text, unit: t.unit, role: "glue", meaning, got: !!hit };
      return { k, text: t.text, unit: t.unit, role: hit ? "got" : "missed", meaning };
    });
    const scored = parts.filter((p) => p.role === "got" || p.role === "missed");
    return {
      parts,
      got: scored.filter((p) => p.role === "got").length,
      total: scored.length,
      guess: g.map((w) => ({ word: w.word, used: used.has(w.key) })),
    };
  }

  /** A meaning short enough to sit under a word: its first sense, without long notes. */
  function tidy(s) {
    const first = s.split(";")[0].trim();
    const short = first.replace(/\s*\([^)]{16,}\)/g, "").trim() || first;
    return short.length > 32 ? short.slice(0, 30).replace(/\s+\S*$/, "") + "…" : short;
  }

  /** The Tatoeba row whose Chinese is this sentence, ignoring punctuation and spaces, or null. */
  function exactRow(rows, sentence, isHanChar) {
    const key = (s) => Array.from(String(s)).filter(isHanChar).join("");
    const want = key(sentence);
    if (!want) return null;
    return rows.find((r) => key(r[1]) === want || (r[2] && key(r[2]) === want)) || null;
  }

  /** A few encouraging words for a score. */
  function verdict(got, total) {
    if (!total) return "";
    const f = got / total;
    if (f === 1) return "You understood every word.";
    if (f >= 0.75) return "You got the gist.";
    if (f >= 0.4) return "You're on the right track.";
    if (got) return "A start. Here is what it says.";
    return "Here is what it says, word by word.";
  }

  return { check, words, stem, senseKeys, sentences, exactRow, verdict, tidy, GLUE };
});
