/* Jiesuo Cantonese: progress state and its file format. Pure, no DOM. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./drills.js"));
  else root.JyutState = factory(root.JyutDrills);
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";

  function emptyState() {
    return { stats: D.emptyStats(), profile: null, voice: 0, lesson: null, days: [], gate: null };
  }

  function serialise(state) {
    return Object.assign({ lang: "yue", v: 1, savedAt: new Date().toISOString() }, JSON.parse(JSON.stringify(state)));
  }

  const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const bad = () => new Error("bad-file");

  /** Throws "bad-file" unless every inner type the app relies on is right (shapes as drills.js writes them). */
  function checkStats(stats) {
    if (!isObj(stats)) throw bad();
    const { byUnit, pairs, gateLog, tonePairs } = stats;
    if (!isObj(byUnit) || !isObj(pairs) || !Array.isArray(gateLog) || !isObj(tonePairs)) throw bad();
    for (const log of Object.values(byUnit)) {
      if (!Array.isArray(log)) throw bad();
      for (const e of log) if (!isObj(e) || (e.r !== 0 && e.r !== 1) || (e.d != null && typeof e.d !== "string")) throw bad();
    }
    for (const n of Object.values(pairs)) if (!Number.isFinite(n)) throw bad();
    for (const x of gateLog) if (x !== 0 && x !== 1) throw bad();
    for (const p of Object.values(tonePairs)) if (!isObj(p) || !Number.isFinite(p.n) || !Number.isFinite(p.wrong)) throw bad();
    return stats;
  }

  /**
   * Anything without lang "yue" (a Mandarin file, junk) is refused with "not-yue". A yue file with
   * wrong inner types is refused with "bad-file". Missing fields take their defaults.
   */
  function deserialise(obj) {
    if (!obj || typeof obj !== "object" || obj.lang !== "yue") throw new Error("not-yue");
    const stats = obj.stats === undefined ? D.emptyStats() : checkStats(obj.stats);
    const profile = obj.profile === undefined ? null : obj.profile;
    if (profile !== null && (!isObj(profile) || !Object.values(profile).every(Number.isFinite))) throw bad();
    const voice = obj.voice === undefined ? 0 : obj.voice;
    if (!Number.isInteger(voice) || voice < 0 || voice > 99) throw bad();
    const days = obj.days === undefined ? [] : obj.days;
    if (!Array.isArray(days) || !days.every((d) => typeof d === "string")) throw bad();
    const lesson = obj.lesson === undefined ? null : obj.lesson;
    if (lesson !== null && !isObj(lesson)) throw bad();
    const gate = obj.gate === undefined ? null : obj.gate;
    if (gate !== null && !isObj(gate)) throw bad();
    return { stats: JSON.parse(JSON.stringify(stats)), profile, voice, lesson, days, gate };
  }

  /** Saved text -> {state, fresh}. A damaged, foreign or unparseable save gives a fresh state and fresh:true. */
  function load(text) {
    if (!text) return { state: emptyState(), fresh: false };
    try { return { state: deserialise(JSON.parse(text)), fresh: false }; }
    catch (e) { return { state: emptyState(), fresh: true }; }
  }

  return { serialise, deserialise, emptyState, load };
});
