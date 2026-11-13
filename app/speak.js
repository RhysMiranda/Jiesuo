/* Jiesuo speaking check: record yourself, see your pitch against each tone's shape. DOM only;
   the analysis is in tone.js. The recording stays on the device. An optional word check uses the
   browser's own speech recognition, only when tapped, and says where the audio goes. */
(function (root) {
  "use strict";
  const T = root.JiesuoTone;
  const NAMES = { 1: "high and level", 2: "rising", 3: "low dip", 4: "falling", 5: "light (neutral)" };
  const ORD = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };
  const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;
  const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && root.MediaRecorder && (root.AudioContext || root.webkitAudioContext));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** Mono samples at about 16 kHz, so pitch tracking stays quick on a phone. */
  function downsample(buffer) {
    const data = buffer.numberOfChannels > 1
      ? buffer.getChannelData(0).map((x, k) => (x + buffer.getChannelData(1)[k]) / 2)
      : buffer.getChannelData(0);
    const f = Math.max(1, Math.floor(buffer.sampleRate / 16000));
    const out = new Float32Array(Math.floor(data.length / f));
    for (let k = 0; k < out.length; k++) { let s = 0; for (let j = 0; j < f; j++) s += data[k * f + j]; out[k] = s / f; }
    return { samples: out, rate: buffer.sampleRate / f };
  }

  /** A small drawing: the tone's shape as a dashed line, your pitch over it. */
  function shapeSvg(want, points, ok, range) {
    const W = 84, H = 64, y = (st) => H / 2 - st * 4.2, x = (j, n) => 8 + (j * (W - 16)) / Math.max(1, n - 1);
    const shape = want >= 1 && want <= 4 ? T.SHAPES[want].map((st, j) => `${x(j, 5)},${y(st * (range || 1))}`).join(" ") : "";
    const mine = points && points.length ? points.map((st, j) => `${x(j, points.length)},${y(Math.max(-7, Math.min(7, st)))}`).join(" ") : "";
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <line x1="4" x2="${W - 4}" y1="${H / 2}" y2="${H / 2}" class="sp-mid"/>
      ${shape ? `<polyline points="${shape}" class="sp-want"/>` : `<line x1="${W / 2 - 8}" x2="${W / 2 + 8}" y1="${H / 2 + 6}" y2="${H / 2 + 6}" class="sp-want"/>`}
      ${mine ? `<polyline points="${mine}" class="sp-mine ${ok ? "ok" : "off"}"/>` : ""}
    </svg>`;
  }

  /**
   * A "Say it" panel. `units` is [{ch, pinyin}] per syllable; `say` plays the model voice (or null).
   */
  function panel(el, { text, units, say, onResult }) {
    if (!el || !T) return;
    const chars = units.map((u) => u.ch);
    const tones = units.map((u) => (u.pinyin ? T.tonesOf(u.pinyin)[0] || 5 : 5));
    const plan = T.spoken(chars, tones);
    const notes = [...new Set(plan.map((p) => p.note).filter(Boolean))];
    if (!canRecord()) {
      el.innerHTML = `<p class="soft small">Speaking practice needs a microphone and a browser that can record (most phones and computers can).</p>`;
      return;
    }
    el.innerHTML = `
      <div class="row speak-row">
        <button type="button" class="btn primary" data-rec>🎙 Say it</button>
        ${say ? `<button type="button" class="btn quiet" data-model>🔊 Hear it first</button>` : ""}
        <span class="soft small" data-status>Your tones are checked on this device. Nothing is uploaded.</span>
      </div>
      <div class="speak-bar" hidden><i></i></div>
      <div data-out></div>
      ${notes.length ? `<p class="soft small sp-notes">${notes.map(esc).join(". ")}.</p>` : ""}
      ${Recognition ? `<details class="sp-words"><summary>Check the words too</summary>
        <p class="soft small">This uses your browser's speech recognition, which sends the audio to the browser maker (Google in Chrome, Apple in Safari). Nothing is sent until you tap.</p>
        <button type="button" class="btn quiet" data-words>🎙 Say it for the word check</button>
        <div data-words-out></div></details>` : ""}`;
    const status = el.querySelector("[data-status]"), bar = el.querySelector(".speak-bar"), out = el.querySelector("[data-out]");
    const rec = el.querySelector("[data-rec]");
    if (say) el.querySelector("[data-model]").onclick = () => say(text);
    let recorder = null, stopTimer = null, lastUrl = null;

    rec.onclick = async () => {
      if (recorder && recorder.state === "recording") { recorder.stop(); return; }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) {
        status.textContent = "The microphone isn't available. Allow it for this site in the browser's settings, then try again.";
        return;
      }
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const seconds = Math.min(8, 1.4 + 0.6 * units.length);
      recorder.onstop = async () => {
        clearTimeout(stopTimer);
        stream.getTracks().forEach((t) => t.stop());
        rec.textContent = "🎙 Say it again";
        bar.hidden = true;
        status.textContent = "Listening back…";
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (lastUrl) URL.revokeObjectURL(lastUrl);
          lastUrl = URL.createObjectURL(blob);
          const AC = root.AudioContext || root.webkitAudioContext;
          const ctx = new AC();
          const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
          ctx.close && ctx.close();
          const { samples, rate } = downsample(buffer);
          show(T.check(samples, rate, plan.map((p) => p.tone)), lastUrl);
        } catch (e) {
          status.textContent = "That recording couldn't be read. Try again.";
        }
      };
      recorder.start();
      rec.textContent = "■ Stop";
      status.textContent = `Say ${text} now.`;
      bar.hidden = false;
      const i = bar.querySelector("i");
      i.style.transition = "none"; i.style.width = "0";
      void i.offsetWidth;
      i.style.transition = `width ${seconds}s linear`; i.style.width = "100%";
      stopTimer = setTimeout(() => recorder.state === "recording" && recorder.stop(), seconds * 1000);
    };

    function show(r, url) {
      if (!r.heard) {
        status.textContent = "I couldn't hear a voice. Hold the phone a little closer and try again.";
        out.innerHTML = "";
        return;
      }
      const scored = r.results.filter((x) => !x.neutral);
      const right = scored.filter((x) => x.ok).length, close = scored.filter((x) => x.close).length;
      const head = !scored.length ? "Recorded." : right === scored.length ? "Every tone right!" : right + close >= scored.length * 0.6 ? "Nearly there." : "Good try. Compare the shapes:";
      status.textContent = "";
      out.innerHTML = `
        <p class="sp-head"><strong>${head}</strong> ${scored.length ? `<span class="soft">${right} of ${scored.length} tones${close ? `, ${close} close` : ""}.</span>` : ""}
          <button type="button" class="linkish" data-mine>▶ Hear yourself</button></p>
        <div class="sp-cards">${r.results.map((x, k) => {
          const cls = x.neutral ? "neutral" : x.ok ? "ok" : x.close ? "close" : "off";
          const verdict = x.neutral ? "light, short" : x.ok ? `✓ ${NAMES[x.want]}` : `sounded ${NAMES[x.got] || "unclear"}${x.close ? " (close)" : ""}`;
          return `<div class="sp-card ${cls}"><span class="zh">${esc(units[k].ch)}</span><span class="pinyin">${esc(units[k].pinyin || "")}</span>
            ${shapeSvg(x.neutral ? 5 : x.want, x.points, x.ok || x.neutral, r.range)}
            <span class="sp-verdict">${esc(verdict)}</span>${!x.neutral && !x.ok ? `<span class="soft sp-want-name">should be ${esc(NAMES[x.want])}</span>` : ""}</div>`;
        }).join("")}</div>
        <p class="soft small">Dashed: the tone's shape. Solid: your voice. Pitch checks are a guide, not a judge: a cold, a whisper or background noise can confuse them.</p>`;
      out.querySelector("[data-mine]").onclick = () => new Audio(url).play();
      if (onResult) onResult({ right, total: scored.length });
    }

    const words = el.querySelector("[data-words]");
    if (words) words.onclick = () => {
      const box = el.querySelector("[data-words-out]");
      const sr = new Recognition();
      sr.lang = "zh-CN"; sr.interimResults = false; sr.maxAlternatives = 3;
      words.disabled = true;
      box.innerHTML = `<p class="soft small">Listening… say ${esc(text)}</p>`;
      sr.onresult = (e) => {
        const alts = Array.from(e.results[0]).map((a) => a.transcript);
        const best = alts.map((a) => ({ a, m: matchChars(chars, a) })).sort((x, y) => y.m.count - x.m.count)[0];
        const all = best.m.count === chars.length;
        box.innerHTML = `<p><strong>${all ? "Every word came through." : `${best.m.count} of ${chars.length} came through.`}</strong></p>
          <p class="sp-heard">${chars.map((c, k) => `<span class="zh ${best.m.hit[k] ? "hit" : "miss"}">${esc(c)}</span>`).join("")}</p>
          <p class="soft small">Heard: <span class="zh">${esc(best.a || "nothing")}</span></p>`;
      };
      sr.onerror = (e) => { box.innerHTML = `<p class="soft small">${e.error === "not-allowed" ? "The microphone or speech service isn't allowed here." : "The speech service didn't answer. Try again, or use the tone check above."}</p>`; };
      sr.onend = () => { words.disabled = false; };
      try { sr.start(); } catch (e) { words.disabled = false; }
    };
  }

  /** Which target characters appear, in order, in what was heard (longest common subsequence). */
  function matchChars(target, heard) {
    const h = Array.from(heard || "");
    const n = target.length, m = h.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let a = n - 1; a >= 0; a--) for (let b = m - 1; b >= 0; b--) L[a][b] = target[a] === h[b] ? L[a + 1][b + 1] + 1 : Math.max(L[a + 1][b], L[a][b + 1]);
    const hit = new Array(n).fill(false);
    let a = 0, b = 0;
    while (a < n && b < m) {
      if (target[a] === h[b]) { hit[a] = true; a++; b++; } else if (L[a + 1][b] >= L[a][b + 1]) a++; else b++;
    }
    return { hit, count: hit.filter(Boolean).length };
  }

  root.JiesuoSpeak = { panel, matchChars, canRecord };
})(typeof self !== "undefined" ? self : this);
