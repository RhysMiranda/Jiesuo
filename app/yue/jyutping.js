/* Jiesuo Cantonese: Jyutping syllables. Pure, no DOM. Twin of jiesuo/yue/jyutping.py. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JyutJyutping = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const INITIALS = ["b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "ng", "h", "gw", "kw", "w", "z", "c", "s", "j"];
  const FINALS = new Set((
    "aa aai aau aam aan aang aap aat aak " +
    "a ai au am an ang ap at ak " +
    "e ei eu em en eng ep et ek " +
    "i iu im in ing ip it ik " +
    "o oi ou on ong ot ok " +
    "oe oen oeng oet oek eoi eon eot " +
    "u ui un ung ut uk " +
    "yu yun yut " +
    "m ng").split(" "));
  const BY_LENGTH = INITIALS.slice().sort((a, b) => b.length - a.length);

  /** [initial or "", final, tone 1-6]; throws on anything else. */
  function parse(syl) {
    const m = /^([a-z]+)([1-6])$/.exec(syl || "");
    if (!m) throw new Error("not a Jyutping syllable: " + JSON.stringify(syl));
    const body = m[1], tone = Number(m[2]);
    for (const ini of BY_LENGTH) {
      if (body.startsWith(ini) && FINALS.has(body.slice(ini.length))) return [ini, body.slice(ini.length), tone];
    }
    if (FINALS.has(body)) return ["", body, tone];
    throw new Error("not a Jyutping syllable: " + JSON.stringify(syl));
  }

  /** "mat1je5" and "mat1 je5" both give ["mat1", "je5"]. */
  function split(text) {
    return String(text).toLowerCase().replace(/\s+(?=[0-9])/g, "").match(/[a-z]+[0-9]*/g) || [];
  }

  function isChecked(syl) { return "ptk".includes(parse(syl)[1].slice(-1)); }
  function toneless(syl) { return String(syl).replace(/[0-9]+$/, ""); }

  /** Lowercase, trim, digits glued to the syllable, single spaces. */
  function normalise(text) {
    return String(text).toLowerCase().trim().replace(/\s+(?=[0-9])/g, "").replace(/\s+/g, " ");
  }

  /** "right", "needTone" (right sounds, tone missing and required) or "wrong". */
  function answerMatches(typed, target, { needTone = true } = {}) {
    const a = normalise(typed), b = normalise(target);
    if (a === b) return "right";
    const bare = b.split(" ").map(toneless).join(" ");
    const hasTone = /[0-9]/.test(a);
    if (!hasTone && a === bare) return needTone ? "needTone" : "right";
    return "wrong";
  }

  return { INITIALS, FINALS, parse, split, isChecked, toneless, normalise, answerMatches };
});
