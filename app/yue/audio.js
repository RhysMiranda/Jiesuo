/* Jiesuo Cantonese: clip player. UMD; DOM and Audio are touched only inside functions. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JyutAudio = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  let voices = [], clips = {};

  function init(audioJson) {
    voices = (audioJson && audioJson.voices) || [];
    clips = (audioJson && audioJson.clips) || {};
  }

  /** Voice indexes that have a clip for syl, as listed in audio.json. */
  function voicesFor(syl) { return Array.isArray(clips[syl]) ? clips[syl].slice() : []; }

  /** "audio/<voiceId>/<syl>.mp3". A voice without the clip (or out of range) falls back to one that has it; null if none. */
  function clipUrl(syl, voice) {
    const have = voicesFor(syl).filter((v) => voices[v]);
    if (!have.length) return null;
    const v = have.includes(voice) ? voice : have[0];
    return "audio/" + voices[v].id + "/" + syl + ".mp3";
  }

  /** Plays one clip. Always resolves "played" or "failed"; never throws. A plain full GET (not <audio src>)
      so the service worker can cache the 200 response and serve it offline, even on iOS (which asks media for Range/206). */
  function play(syl, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      let objectUrl = null, settled = false;
      const done = (r) => {
        if (settled) return;
        settled = true;
        if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (e) { /* ignore */ } }
        resolve(r);
      };
      try {
        const url = clipUrl(syl, o.voice);
        if (!url || typeof fetch !== "function" || typeof Audio === "undefined") return done("failed");
        const el = new Audio(); // made inside the tap so iOS still counts it as user-started
        fetch(url).then((r) => { if (!r.ok) throw new Error("status " + r.status); return r.blob(); }).then((blob) => {
          objectUrl = URL.createObjectURL(blob);
          el.src = objectUrl;
          el.playbackRate = o.rate || 1;
          el.onended = () => done("played");
          el.onerror = () => done("failed");
          return el.play();
        }).catch(() => done("failed"));
      } catch (e) { done("failed"); }
    });
  }

  /** Quietly warms the cache for exactly the syllables passed (a lesson's drawn drills). Never the whole list. */
  function prefetch(syls, voice) {
    (syls || []).forEach((s) => {
      try {
        const url = clipUrl(s, voice);
        if (url && typeof fetch === "function") fetch(url).catch(() => {});
      } catch (e) { /* quiet */ }
    });
  }

  /** A clip that would not play is skipped, not scored. */
  function afterPlay(result) {
    return result === "failed" ? { skip: true, message: "This sound isn't downloaded yet" } : { skip: false, message: "" };
  }

  return { init, clipUrl, voicesFor, play, prefetch, afterPlay };
});
