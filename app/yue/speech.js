/* Jiesuo Cantonese: word and sentence audio with safe fallbacks. UMD; DOM and speechSynthesis are touched only inside functions.
   Order: neural clip, then the device voice (only for text it cannot misread), then the exact Cantone syllables, else none. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JyutSpeech = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const HAN = /\p{Script=Han}/u;
  const SLOW = "-25%", NORMAL = "0%";
  const NONE = { kind: "none" };

  /** The browser's speechSynthesis as {voices() -> [...], speak(text, voice, rate) -> Promise<"played"|"failed">}. */
  function deviceSynth() {
    const ss = typeof self !== "undefined" && self.speechSynthesis;
    const Utt = typeof self !== "undefined" && self.SpeechSynthesisUtterance;
    if (!ss || !Utt) return { voices: () => [], speak: () => Promise.resolve("failed"), cancel() {} };
    return {
      cancel: () => { try { ss.cancel(); } catch (e) { /* ignore */ } },
      voices: () => { try { return Array.from(ss.getVoices() || []); } catch (e) { return []; } },
      speak: (text, voice, rate) => new Promise((resolve) => {
        try {
          ss.cancel();
          const u = new Utt(text);
          u.voice = voice; u.lang = voice.lang; u.rate = rate || 1;
          u.onend = () => resolve("played");
          u.onerror = () => resolve("failed");
          ss.speak(u);
        } catch (e) { resolve("failed"); }
      }),
    };
  }

  const isHK = (v) => !!v && /^(zh[-_]HK|yue)/i.test(String(v.lang || ""));

  /** deps: {speechJson, audio (JyutAudio), lex (JyutLex instance), lexData (the raw data given to JyutLex.create), synth}. */
  function create(deps) {
    const d = deps || {};
    const audio = d.audio, lex = d.lex;
    const synth = d.synth || deviceSynth();
    const chars = (d.lexData && (d.lexData.lexicon || d.lexData).chars) || {};

    // Clips by form-or-exampleId, then rate.
    const clipsByKey = new Map();
    const sj = d.speechJson && typeof d.speechJson === "object" && d.speechJson.clips && typeof d.speechJson.clips === "object" ? d.speechJson.clips : {};
    for (const key of Object.keys(sj)) {
      const c = sj[key];
      if (!c || typeof c.f !== "string" || typeof c.r !== "string") continue;
      if (!clipsByKey.has(c.f)) clipsByKey.set(c.f, {});
      clipsByKey.get(c.f)[c.r] = "audio/speech/" + key + ".mp3";
    }

    /** {url, slow}: the slow clip when asked and present, else the normal-rate clip (slow:false). */
    function clipFor(id, slow) {
      const m = clipsByKey.get(id);
      if (!m) return null;
      if (slow && m[SLOW]) return { url: m[SLOW], slow: true };
      return m[NORMAL] ? { url: m[NORMAL], slow: false } : null;
    }

    function resolve(item) {
      try {
        const id = item && typeof item === "object" ? (item.form != null ? item.form : item.id) : item;
        if (id == null) return null;
        const key = String(id);
        const w = lex && lex.word(key);
        if (w) return { id: key, text: w.form, jp: w.jp, word: w };
        const ex = lex && lex.example(key);
        if (ex) return { id: key, text: ex.text, jp: ex.jp, word: null };
        return { id: key, text: key, jp: "", word: null };
      } catch (e) { return null; }
    }

    function deviceVoice() {
      try { return (synth.voices() || []).find(isHK) || null; } catch (e) { return null; }
    }

    /** Safe for the device voice: a lexicon word (never a sentence) with no changed tone or alt reading,
        every character having exactly one reading. */
    function isSafe(r) {
      const w = r.word;
      if (!w || w.changed || w.alt || w.unchecked) return false;
      const cs = Array.from(w.form), syls = syllablesOf(r);
      if (!cs.length || cs.length !== syls.length) return false;
      return cs.every((c, i) => HAN.test(c) && Array.isArray(chars[c]) && chars[c].length === 1 && chars[c][0] === syls[i]);
    }

    function syllablesOf(r) {
      const syls = String(r.jp || "").split(/\s+/).filter(Boolean);
      return syls.every((s) => /^[a-z]+[1-6]$/.test(s)) ? syls : [];
    }

    function source(item, opts) {
      try {
        const r = resolve(item);
        if (!r) return NONE;
        const slow = !!(opts && opts.slow);
        const clip = clipFor(r.id, slow);
        if (clip) return { kind: "clip", url: clip.url, slow: clip.slow };
        if (isSafe(r) && deviceVoice()) return { kind: "device", slow };
        const syls = syllablesOf(r);
        if (syls.length && audio) {
          const voice = audio.voiceForAll(syls, opts && opts.voice);
          if (voice !== null && voice !== undefined) return { kind: "syllables", syls, voice, slow: false };
        }
        return NONE;
      } catch (e) { return NONE; }
    }

    /** "played" | "failed" | "blocked" | "none" | "stopped"; never throws. Audio starts synchronously from the tap.
        Clips are never speeded or slowed (that would shift the pitch and so the tones): a slow request without a
        slow clip plays the normal one, and source(...).slow tells the UI which it got. */
    async function play(item, opts) {
      try {
        const o = opts || {};
        // One sound at a time across both channels, stopped synchronously from the tap.
        try { if (audio && audio.stop) audio.stop(); } catch (e) { /* ignore */ }
        try { if (synth.cancel) synth.cancel(); } catch (e) { /* ignore */ }
        const src = source(item, o);
        if (src.kind === "clip") return await audio.playUrl(src.url, { rate: 1 });
        if (src.kind === "device") {
          const r = resolve(item), v = deviceVoice();
          if (!r || !v) return "failed";
          return (await synth.speak(r.text, v, src.slow ? 0.7 : 1)) === "played" ? "played" : "failed";
        }
        if (src.kind === "syllables") {
          return await audio.playUrls(src.syls.map((x) => audio.clipUrl(x, src.voice)), { rate: 1 });
        }
        return "none";
      } catch (e) { return "failed"; }
    }

    return { source, play };
  }

  return { create };
});
