/* Jiesuo Cantonese: say it. Voice calibration and the tone check panel. UMD; DOM only inside functions.
   Recordings stay on the device. The tone check is a guide, worded as one (see tonecheck.json). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../tone.js"), require("./tones.js"), require("./audio.js"));
  else root.JyutSpeak = factory(root.JiesuoTone, root.JyutTones, root.JyutAudio);
})(typeof self !== "undefined" ? self : this, function (Tone, Tones, Audio) {
  "use strict";
  const root = typeof self !== "undefined" ? self : this;
  const MAX_SECONDS = 6;
  const NO_MIC = "Speaking practice needs a microphone and a browser that can record.";
  const ANCHOR_CH = { ji1: "衣", ji3: "意", ji6: "二", ji4: "兒", ji2: "椅", ji5: "耳" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** One line for a check result, worded as a guide. Never "wrong". */
  function verdictText(result, mode) {
    if (!result || !result.heard || !result.results || !result.results.length) return "Didn't catch that, try again";
    if (result.results.some((r) => r.unsure)) return "Not sure, try once more";
    const heard = result.results.map((r) => "tone " + r.got).join(", then ");
    return (mode === "check" ? "Heard as " : "Sounded like ") + heard;
  }

  /** "say" when the calibration profile is usable, otherwise "calibrate". */
  function panelState(profile) {
    try { return profile && Tones.validProfile(profile).ok ? "say" : "calibrate"; } catch (e) { return "calibrate"; }
  }

  /** Only a clear, decided attempt is worth keeping. */
  function shouldRecord(result) {
    return !!(result && result.heard && result.results && result.results.length && !result.results.some((r) => r.unsure));
  }

  const canRecord = () => !!(typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && root.MediaRecorder && (root.AudioContext || root.webkitAudioContext));

  function downsample(buffer) {
    const data = buffer.numberOfChannels > 1
      ? buffer.getChannelData(0).map((x, k) => (x + buffer.getChannelData(1)[k]) / 2)
      : buffer.getChannelData(0);
    const f = Math.max(1, Math.floor(buffer.sampleRate / 16000));
    const out = new Float32Array(Math.floor(data.length / f));
    for (let k = 0; k < out.length; k++) { let s = 0; for (let j = 0; j < f; j++) s += data[k * f + j]; out[k] = s / f; }
    return { samples: out, rate: buffer.sampleRate / f };
  }

  /** Record for up to `seconds` (stopRef.stop() ends it early). Resolves {samples, rate}; rejects {denied:true} or an Error. */
  async function record(seconds, onStart, stopRef) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) { throw { denied: true }; }
    const chunks = [];
    let blob, timer;
    try {
      const rec = new root.MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
      const stopped = new Promise((res) => { rec.onstop = res; rec.onerror = res; });
      rec.start();
      const secs = Math.min(seconds, MAX_SECONDS);
      if (onStart) onStart(secs);
      const stop = () => { try { if (rec.state === "recording") rec.stop(); } catch (e) { /* already stopped */ } };
      timer = setTimeout(stop, secs * 1000);
      if (stopRef) stopRef.stop = stop;
      await stopped;
      blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    } finally {
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    const ctx = new AC();
    try { return downsample(await ctx.decodeAudioData(await blob.arrayBuffer())); } finally { ctx.close && ctx.close(); }
  }

  function injectStyle() {
    if (document.getElementById("jyut-speak-style")) return;
    const s = document.createElement("style");
    s.id = "jyut-speak-style";
    s.textContent = ".ys-row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:.5rem 0}.ys-big{font-size:2.4rem;line-height:1}.ys-bar{height:6px;background:rgba(128,128,128,.25);border-radius:3px;overflow:hidden;margin:.4rem 0}.ys-bar i{display:block;height:100%;width:0;background:currentColor}.ys-svg{max-width:260px;width:100%;height:auto}.ys-svg .want{fill:none;stroke:currentColor;stroke-dasharray:4 3;opacity:.55;stroke-width:2}.ys-svg .mine{fill:none;stroke:#2a7;stroke-width:3}.ys-svg .rung{stroke:currentColor;opacity:.15}";
    document.head.appendChild(s);
  }

  /** The tone template (dashed) and your pitch (solid) on the learner's own ladder. */
  function shapeSvg(want, points, profile) {
    const W = 260, H = 130, lo = profile.t4lo - 1.5, hi = profile.t2hi + 1.5;
    const y = (st) => H - 6 - ((Math.max(lo, Math.min(hi, st)) - lo) / (hi - lo)) * (H - 12);
    const x = (j, n) => 10 + (j * (W - 20)) / Math.max(1, n - 1);
    const line = (pts) => pts.map((st, j) => x(j, pts.length).toFixed(1) + "," + y(st).toFixed(1)).join(" ");
    const rungs = [profile.t1, profile.t3, profile.t6].map((st) => `<line class="rung" x1="4" x2="${W - 4}" y1="${y(st).toFixed(1)}" y2="${y(st).toFixed(1)}"/>`).join("");
    const tpl = Tones.template(want, profile);
    return `<svg class="ys-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tone ${want} shape with your pitch">${rungs}<polyline class="want" points="${line(tpl)}"/>${points && points.length ? `<polyline class="mine" points="${line(points)}"/>` : ""}</svg>`;
  }

  const PRIVACY = `<p class="soft small">Your recording stays on this device; nothing is uploaded. The tone check is a guide, not a judge: a cold, a whisper or background noise can confuse it.</p>`;

  function noMic(el, onResult) {
    el.innerHTML = `<p class="soft small">${NO_MIC}</p>`;
    if (onResult) onResult({ skipped: true });
  }

  function barRun(bar, s) {
    bar.hidden = false;
    const b = bar.querySelector("i");
    b.style.transition = "none"; b.style.width = "0"; void b.offsetWidth;
    b.style.transition = `width ${s}s linear`; b.style.width = "100%";
  }

  /** Record the six anchors one by one; call onDone(profile) once validProfile passes. */
  function calibrationPanel(el, { onDone } = {}) {
    if (!el) return;
    injectStyle();
    if (!canRecord()) { noMic(el, null); return; }
    const anchors = {}; // syl -> [Hz segment]
    const list = Tones.ANCHORS;
    let i = 0, redo = null, note = "";

    function step() {
      const syl = redo || list[i];
      const n = redo ? "once more" : `${i + 1} of ${list.length}`;
      el.innerHTML = `<p><strong>Set up your voice</strong> <span class="soft small">(${n})</span></p>
        <p class="soft small">Say each word in your normal speaking voice. The app learns your high and low.</p>
        <div class="ys-row"><span class="ys-big" lang="yue-HK">${ANCHOR_CH[syl]}</span><span>${esc(syl)}</span></div>
        <div class="ys-row"><button type="button" class="btn quiet" data-hear>🔊 Hear it</button>
          <button type="button" class="btn primary" data-rec disabled>🎙 Record</button></div>
        <div class="ys-bar" hidden><i></i></div><p class="soft small" data-status>${note || "Hear it first, then say it."}</p>${PRIVACY}`;
      note = "";
      const hear = el.querySelector("[data-hear]"), rec = el.querySelector("[data-rec]"), status = el.querySelector("[data-status]"), bar = el.querySelector(".ys-bar");
      hear.onclick = () => {
        const p = Audio && Audio.play ? Audio.play(syl) : Promise.resolve("failed");
        rec.disabled = false;
        status.textContent = "Now tap Record and say it.";
        Promise.resolve(p).then((r) => { if (r === "failed" || r === "blocked") status.textContent = "Couldn't play the clip. You can still tap Record and say it."; });
      };
      const stopRef = {};
      let busy = false;
      rec.onclick = async () => {
        if (busy) { stopRef.stop && stopRef.stop(); return; }
        busy = true;
        try {
          const { samples, rate } = await record(2.2, (s) => { rec.textContent = "■ Stop"; status.textContent = "Say it now."; barRun(bar, s); }, stopRef);
          const seg = Tones.segmentsHz(Tone.pitchTrack(samples, rate), 1)[0] || [];
          if (seg.length < 8) { busy = false; rec.textContent = "🎙 Record"; bar.hidden = true; status.textContent = "Didn't catch that, try again"; return; }
          anchors[syl] = [seg]; // the latest take replaces any earlier one for this anchor
          advance();
        } catch (e) {
          busy = false;
          if (e && e.denied) noMic(el, null);
          else { rec.textContent = "🎙 Record"; bar.hidden = true; status.textContent = "That recording couldn't be read. Try again."; }
        }
      };
    }

    function advance() {
      if (redo) redo = null;
      else { i++; if (i < list.length) return step(); }
      const profile = Tones.profileFrom(anchors);
      const v = Tones.validProfile(profile);
      if (v.ok) {
        el.innerHTML = `<p><strong>Your voice is set up.</strong></p>${PRIVACY}`;
        if (onDone) onDone(profile);
      } else {
        redo = v.redo; // ask again only for that anchor; no profile is saved
        note = "Let's try that one once more. Hear it, then say it.";
        step();
      }
    }
    step();
  }

  /** Say one syllable (or a pair) and see your pitch over the tone shape. */
  function sayPanel(el, { expected, profile, mode, onResult } = {}) {
    if (!el) return;
    injectStyle();
    if (!canRecord()) { noMic(el, onResult); return; }
    if (panelState(profile) === "calibrate") {
      el.innerHTML = `<p><strong>Set up your voice first</strong></p><p class="soft small">The tone check compares you with your own high and low.</p><button type="button" class="btn primary" data-cal>Set up my voice</button>`;
      el.querySelector("[data-cal]").onclick = () => calibrationPanel(el, { onDone: (p) => sayPanel(el, { expected, profile: p, mode, onResult }) });
      return;
    }
    el.innerHTML = `<div class="ys-row"><button type="button" class="btn quiet" data-hear>🔊 Hear it</button>
      <button type="button" class="btn primary" data-rec>🎙 Say it</button></div>
      <div class="ys-bar" hidden><i></i></div><p data-status class="soft small">Tap Say it, then say ${esc(expected.map((e) => e.syl).join(" "))}.</p><div data-out></div>${PRIVACY}`;
    const hear = el.querySelector("[data-hear]"), rec = el.querySelector("[data-rec]"), status = el.querySelector("[data-status]"), bar = el.querySelector(".ys-bar"), out = el.querySelector("[data-out]");
    hear.onclick = () => {
      if (!Audio || !Audio.play) { status.textContent = "Couldn't play the clip."; return; }
      let p = Audio.play(expected[0].syl); // first call is inside the tap
      for (const e of expected.slice(1)) p = Promise.resolve(p).then((r) => (r === "played" ? Audio.play(e.syl) : r));
      Promise.resolve(p).then((r) => { if (r === "failed" || r === "blocked") status.textContent = "Couldn't play the clip."; });
    };
    const stopRef = {};
    let busy = false;
    rec.onclick = async () => {
      if (busy) { stopRef.stop && stopRef.stop(); return; }
      busy = true;
      try {
        const { samples, rate } = await record(Math.min(6, 1.4 + 0.8 * expected.length), (s) => { hear.disabled = true; rec.textContent = "■ Stop"; status.textContent = "Listening…"; barRun(bar, s); }, stopRef);
        busy = false; hear.disabled = false; rec.textContent = "🎙 Say it again"; bar.hidden = true;
        const r = Tones.check(samples, rate, expected, profile);
        status.textContent = verdictText(r, mode);
        out.innerHTML = r.heard ? r.results.map((x) => `<div>${shapeSvg(x.want, x.points, profile)}</div>`).join("") + `<p class="soft small">Dashed: the tone's shape. Solid: your voice.</p>` : "";
        if (onResult) onResult(r);
      } catch (e) {
        busy = false; hear.disabled = false; rec.textContent = "🎙 Say it"; bar.hidden = true;
        if (e && e.denied) noMic(el, onResult);
        else status.textContent = "That recording couldn't be read. Try again.";
      }
    };
  }

  return { calibrationPanel, sayPanel, verdictText, shouldRecord, panelState, canRecord };
});
