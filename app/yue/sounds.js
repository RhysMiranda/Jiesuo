/* Sounds screen: tone ladder, syllable chart, your mix-ups, voice picker. UMD so the pure helpers can be tested. */
(function (root, factory) {
  const J = typeof module === "object" && module.exports ? require("./jyutping.js") : root.JyutJyutping;
  const api = factory(J);
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.JyutScreens = root.JyutScreens || {};
    root.JyutScreens.sounds = api.render;
  }
})(typeof self !== "undefined" ? self : this, function (J) {
  "use strict";
  // Drawn Chao heights [start, end]: 4 is the lowest tone (level, a slight fall), 6 level a step higher, 5 starts where 6 sits.
  const CHAO = { 1: [5, 5], 2: [3, 5], 3: [3, 3], 4: [1.5, 1], 5: [2, 3], 6: [2, 2] };
  const NAMES = { 1: "high level", 2: "high rising", 3: "mid level", 4: "lowest, level or slightly falling", 5: "low rising", 6: "low level" };

  /** Rows = initials (zero initial first, ""), columns = finals; only those with audio. */
  function buildChart(audio) {
    const cells = new Map();
    for (const [syl, vs] of Object.entries(audio.clips || {})) {
      if (!vs || !vs.length) continue;
      let p;
      try { p = J.parse(syl); } catch (e) { continue; }
      const key = p[0] + "|" + p[1];
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(p[2]);
    }
    const rowsHave = new Set(), colsHave = new Set();
    for (const key of cells.keys()) { const [i, f] = key.split("|"); rowsHave.add(i); colsHave.add(f); }
    const initials = [""].concat(J.INITIALS).filter((i) => rowsHave.has(i));
    const finals = Array.from(J.FINALS).filter((f) => colsHave.has(f));
    return {
      initials, finals,
      cell(i, f) { const t = cells.get(i + "|" + f); return t ? t.slice().sort((a, b) => a - b) : null; },
    };
  }

  /** Checked finals (-p -t -k) only ever carry tones 1, 3 and 6. */
  function tonesShown(fin) { return "ptk".includes(fin.slice(-1)) ? [1, 3, 6] : [1, 2, 3, 4, 5, 6]; }

  function confusionText(want, got, top) {
    return "You hear tone " + want + " as tone " + got + (top === false ? " sometimes" : " most often");
  }

  // ---- DOM from here down
  function render(ctx) {
    const A = window.JyutAudio;
    const esc = ctx.esc, data = ctx.data;
    A.init(data.audio);
    const voiceIdx = () => ctx.state.voice;
    const model = buildChart(data.audio);
    const mix = ctx.drills.confusions(ctx.state.stats).slice(0, 3);
    let selected = null; // [initial, final]

    // Chao heights 1..5 -> y in the drawing
    const y = (h) => 52 - (h - 1) * 11;
    const ladder = [1, 2, 3, 4, 5, 6].map((t, i) => {
      const ch = CHAO[t];
      const x0 = 14 + i * 56, x1 = x0 + 32, syl = "si" + t;
      return `<g class="lad" tabindex="0" role="button" data-syl="${syl}" aria-label="Tone ${t}, ${NAMES[t]}, say ${syl}">
        <rect x="${x0 - 8}" y="0" width="52" height="114" fill="transparent"/>
        <line x1="${x0}" y1="${y(ch[0])}" x2="${x1}" y2="${y(ch[1])}" class="lad-line"/>
        <circle cx="${x0}" cy="${y(ch[0])}" r="3.5" class="lad-dot"/>
        <text x="${x0 + 16}" y="82" text-anchor="middle" class="lad-n">${t}</text>
        <text x="${x0 + 16}" y="104" text-anchor="middle" class="lad-s">${syl}</text></g>`;
    }).join("");

    const head = model.finals.map((f) => `<th scope="col">${esc(f)}</th>`).join("");
    const rows = model.initials.map((i) => `<tr><th scope="row">${i ? esc(i) : "&ndash;"}</th>${model.finals.map((f) => {
      const t = model.cell(i, f);
      return t ? `<td><button type="button" class="cell" data-i="${esc(i)}" data-f="${esc(f)}" aria-label="${esc(i + f)}, ${t.length} tones">${esc(i + f)}</button></td>` : `<td class="empty"></td>`;
    }).join("")}</tr>`).join("");

    const mixHtml = mix.length
      ? mix.map((m) => `<div class="row mixrow"><span>${esc(confusionText(m[0], m[1], true))}</span><a class="btn small-btn" href="#today/practise/${m[0]}-${m[1]}">Practise tones ${m[0]} and ${m[1]}</a></div>`).join("")
      : `<p class="soft">Nothing here yet. Once you have tried some tone questions, the pairs you mix up will show here, and you can practise them.</p>`;

    const voices = data.audio.voices.map((v, k) => `<label class="voice"><input type="radio" name="voice" value="${k}"${k === voiceIdx() ? " checked" : ""}> ${esc(v.label)}</label>`).join("");

    ctx.view.innerHTML = `
      <section class="stack sounds">
        <h1>Sounds</h1>
        <p class="soft">Tap anything to hear it. Cantonese has six tones, and the same syllable changes meaning with each.</p>
        <h2>The six tones</h2>
        <svg class="ladder" viewBox="0 0 350 114" role="group" aria-label="The six tones. Tap one to hear it.">${ladder}</svg>
        <p class="soft small">Tone 1 stays high, tone 2 climbs high, tone 3 stays in the middle. Tones 4, 5 and 6 are the low ones: 4 is the lowest (level or slightly falling), 6 sits a step above it and stays flat, 5 starts where 6 sits and rises a little.</p>
        <h2>Every syllable</h2>
        <p class="soft small">Rows start the syllable, columns end it. Tap a cell to hear its tones.</p>
        <div class="chart-box" tabindex="0" aria-label="Syllable chart"><table class="chart"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
        <div id="tones" class="tone-panel" aria-live="polite"></div>
        <h2>Your mix-ups</h2>
        <div class="stack">${mixHtml}</div>
        <h2>Voice</h2>
        <div class="row" role="radiogroup" aria-label="Voice">${voices}</div>
      </section>`;

    const say = (syl) => A.play(syl, { voice: voiceIdx() }).then((r) => {
      const a = A.afterPlay(r);
      if (a.message) ctx.toast(a.message);
      return r;
    });

    ctx.view.querySelectorAll(".lad").forEach((g) => {
      const go = () => say(g.dataset.syl);
      g.addEventListener("click", go);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });

    const panel = document.getElementById("tones");
    function showTones() {
      const i = selected[0], f = selected[1], have = model.cell(i, f) || [], show = tonesShown(f);
      panel.innerHTML = `<p class="small"><strong>${esc(i + f)}</strong>${show.length < 6 ? ` <span class="soft">(this ending only has tones 1, 3 and 6)</span>` : ""}</p>
        <div class="row">${show.map((t) => `<button type="button" class="btn tonebtn" data-syl="${esc(i + f + t)}"${have.includes(t) ? "" : " disabled"}>${esc(i + f)}<b>${t}</b></button>`).join("")}</div>`;
      panel.querySelectorAll(".tonebtn").forEach((b) => b.addEventListener("click", () => say(b.dataset.syl)));
    }
    ctx.view.querySelectorAll(".cell").forEach((b) => b.addEventListener("click", () => {
      selected = [b.dataset.i, b.dataset.f];
      ctx.view.querySelectorAll(".cell").forEach((c) => c.classList.toggle("on", c === b));
      showTones();
      const first = (model.cell(selected[0], selected[1]) || [])[0];
      if (first) say(selected[0] + selected[1] + first);
    }));

    ctx.view.querySelectorAll('input[name="voice"]').forEach((r) => r.addEventListener("change", () => {
      ctx.state.voice = Number(r.value);
      ctx.save();
      say("si1");
    }));
  }

  return { buildChart, tonesShown, confusionText, render };
});
