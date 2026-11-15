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

  /** One voice for a group of syllables played together (a tone ladder, a pair), so they never mix voices:
      `preferred` if it has every syllable, else the first voice that does, else null (callers then fall back per syllable). */
  function voiceForAll(syls, preferred) {
    const list = [].concat(syls || []);
    if (!list.length) return null;
    const hasAll = (v) => Number.isInteger(v) && !!voices[v] && list.every((s) => voicesFor(s).includes(v));
    if (hasAll(preferred)) return preferred;
    for (let v = 0; v < voices.length; v++) if (hasAll(v)) return v;
    return null;
  }

  const LOAD_MS = 8000;
  let actx = null, current = null;

  /** Resolves with the promise's value, or `fallback` if it has not settled within ms. Never rejects. */
  function withTimeout(promise, ms, fallback) {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(fallback), ms);
      Promise.resolve(promise).then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
    });
  }

  /** Create or resume the one shared AudioContext. Call synchronously inside a tap (play does) so iOS allows sound. */
  function unlock() {
    try {
      // iOS (Safari 16.4+): "playback" keeps Web Audio audible with the Ring/Silent switch on silent.
      const nav = typeof navigator !== "undefined" ? navigator : null;
      if (nav && nav.audioSession && nav.audioSession.type !== "playback") nav.audioSession.type = "playback";
    } catch (e) { /* not supported */ }
    try {
      const AC = typeof self !== "undefined" && (self.AudioContext || self.webkitAudioContext);
      if (!AC) return null;
      if (!actx) actx = new AC();
      if (actx.state === "suspended") { const r = actx.resume(); if (r && r.catch) r.catch(() => {}); }
      return actx;
    } catch (e) { return null; }
  }

  function stopCurrent() {
    if (current) { try { current.stop(); } catch (e) { /* already stopped */ } current = null; }
  }

  async function playBuffered(ctx, url, rate) {
    const bytes = await withTimeout(fetch(url).then((r) => { if (!r.ok) throw new Error("status " + r.status); return r.arrayBuffer(); }), LOAD_MS, null);
    if (!bytes) return "failed";
    const buf = await withTimeout(new Promise((ok, no) => { const p = ctx.decodeAudioData(bytes, ok, no); if (p && p.then) p.then(ok, no); }), LOAD_MS, null);
    if (!buf) return "failed";
    if (ctx.state !== "running") await withTimeout(ctx.resume(), 1500, null);
    if (ctx.state !== "running") return "blocked";
    stopCurrent();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(ctx.destination);
    current = src;
    return new Promise((resolve) => {
      src.onended = () => { if (current === src) current = null; resolve("played"); };
      try { src.start(0); } catch (e) { resolve("blocked"); }
    });
  }

  async function playElement(url, rate, el) {
    const blob = await withTimeout(fetch(url).then((r) => { if (!r.ok) throw new Error("status " + r.status); return r.blob(); }), LOAD_MS, null);
    if (!blob) return "failed";
    const objectUrl = URL.createObjectURL(blob);
    try {
      el.src = objectUrl;
      el.playbackRate = rate;
      const ended = new Promise((resolve) => { el.onended = () => resolve("played"); el.onerror = () => resolve("failed"); });
      await el.play();
      return await ended;
    } catch (e) {
      return e && e.name === "NotAllowedError" ? "blocked" : "failed";
    } finally { try { URL.revokeObjectURL(objectUrl); } catch (e) { /* ignore */ } }
  }

  /** Plays one clip; resolves "played", "blocked" (the browser wanted a fresh tap) or "failed"; never throws.
      The shared AudioContext is unlocked synchronously here, before any await, because iOS only allows sound
      started from a tap. Clips are fetched in full (200) so the service worker can cache them for offline use;
      a new clip stops the one still playing. Without AudioContext it falls back to an <audio> element. */
  async function play(syl, opts) {
    const o = opts || {};
    try {
      const url = clipUrl(syl, o.voice);
      if (!url || typeof fetch !== "function") return "failed";
      const rate = o.rate || 1;
      const ctx = unlock();
      if (ctx) return await playBuffered(ctx, url, rate);
      if (typeof Audio === "undefined") return "failed";
      return await playElement(url, rate, new Audio());
    } catch (e) { return "failed"; }
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
    if (result === "failed") return { skip: true, message: "This sound isn't downloaded yet" };
    if (result === "blocked") return { skip: true, message: "Tap again to hear it" };
    return { skip: false, message: "" };
  }

  return { init, clipUrl, voicesFor, voiceForAll, play, unlock, withTimeout, prefetch, afterPlay };
});
