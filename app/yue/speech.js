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
    if (!ss || !Utt) return { voices: () => [], speak: () => Promise.resolve("failed") };
    return {
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

    function clipFor(id, slow) {
      const m = clipsByKey.get(id);
      if (!m) return null;
      return (slow && m[SLOW]) || m[NORMAL] || null;
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
      if (!w || w.changed || w.alt) return false;
      const cs = Array.from(w.form);
      if (!cs.length) return false;
      return cs.every((c) => HAN.test(c) && Array.isArray(chars[c]) && chars[c].length === 1);
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
        const url = clipFor(r.id, slow);
        if (url) return { kind: "clip", url };
        if (isSafe(r) && deviceVoice()) return { kind: "device" };
        const syls = syllablesOf(r);
        if (syls.length && audio) {
          const voice = audio.voiceForAll(syls, opts && opts.voice);
          if (voice !== null && voice !== undefined) return { kind: "syllables", syls, voice };
        }
        return NONE;
      } catch (e) { return NONE; }
    }

    /** "played" | "failed" | "blocked" | "none"; never throws. Audio starts synchronously from the tap. */
    async function play(item, opts) {
      try {
        const o = opts || {};
        const src = source(item, o);
        if (src.kind === "clip") return await audio.playUrl(src.url, { rate: o.slow ? 0.75 : 1 });
        if (src.kind === "device") {
          const r = resolve(item), v = deviceVoice();
          if (!r || !v) return "failed";
          return (await synth.speak(r.text, v, o.slow ? 0.7 : 1)) === "played" ? "played" : "failed";
        }
        if (src.kind === "syllables") {
          const urls = src.syls.map((s) => audio.clipUrl(s, src.voice));
          return await audio.playUrls(urls, { rate: o.slow ? 0.75 : 1 });
        }
        return "none";
      } catch (e) { return "failed"; }
    }

    return { source, play };
  }

  return { create };
});
