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

  /** Anything without lang "yue" (a Mandarin file, junk) is refused. Missing fields take their defaults. */
  function deserialise(obj) {
    if (!obj || typeof obj !== "object" || obj.lang !== "yue") throw new Error("not-yue");
    const base = emptyState();
    const stats = obj.stats && typeof obj.stats === "object" ? obj.stats : {};
    return {
      stats: {
        byUnit: stats.byUnit && typeof stats.byUnit === "object" ? stats.byUnit : base.stats.byUnit,
        pairs: stats.pairs && typeof stats.pairs === "object" ? stats.pairs : base.stats.pairs,
        gateLog: Array.isArray(stats.gateLog) ? stats.gateLog : base.stats.gateLog,
        tonePairs: stats.tonePairs && typeof stats.tonePairs === "object" ? stats.tonePairs : base.stats.tonePairs,
      },
      profile: obj.profile && typeof obj.profile === "object" ? obj.profile : null,
      voice: Number.isInteger(obj.voice) && obj.voice >= 0 ? obj.voice : 0,
      lesson: obj.lesson && typeof obj.lesson === "object" ? obj.lesson : null,
      days: Array.isArray(obj.days) ? obj.days.filter((d) => typeof d === "string") : [],
      gate: obj.gate && typeof obj.gate === "object" ? obj.gate : null,
    };
  }

  return { serialise, deserialise, emptyState };
});
