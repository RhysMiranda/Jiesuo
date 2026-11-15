/* Today screen: the daily stage 0 lesson, plus #today/practise/<a>-<b> for one tone pair.
   Screens register on window.JyutScreens and are called as screen(ctx). Lesson planning is in lesson.js. */
(function () {
  "use strict";
  window.JyutScreens = window.JyutScreens || {};

  const sylsOf = (d) => (Array.isArray(d.target) ? d.target : [d.target]).concat((d.options || []).filter((o) => typeof o === "string" && o !== "same" && o !== "different"));

  function render(ctx) {
    const L = window.JyutLesson, J = window.JyutJyutping, A = window.JyutAudio;
    const esc = ctx.esc, data = ctx.data, view = ctx.view;
    const D = ctx.drills.createDrills({ stage0: data.stage0, audio: data.audio });
    A.init(data.audio);
    const pm = /^today\/practise\/([1-6])-([1-6])$/.exec((location.hash || "").slice(1));
    const rng = Math.random;
    const day = () => ctx.journey.dayKey();
    const before = JSON.parse(JSON.stringify(ctx.state.stats));
    let steps = [], total = 0, idx = 0, answered = 0, answeredNow = false, keyOff = null;

    function build() {
      const stats = ctx.state.stats;
      if (pm) {
        const ds = L.practise(data.stage0, data.audio, stats, Number(pm[1]), Number(pm[2]), rng, 10);
        steps = ds.map((d) => ({ kind: "drill", drill: d })).concat([{ kind: "done" }]);
      } else {
        const lesson = L.compose(data.stage0, stats, {
          hasMic: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
          calibrated: ctx.state.profile != null,
          audio: data.audio,
        }, rng);
        for (const s of lesson.steps) {
          if (s.kind === "gate") {
            s.drills.forEach((d, i) => steps.push({ kind: "drill", drill: d, gate: { i: i + 1, n: s.drills.length } }));
            steps.push({ kind: "gateResult" });
          } else steps.push(s);
        }
      }
      total = steps.filter((s) => s.kind === "drill").length;
    }

    const shell = (inner) => { view.innerHTML = `<section class="stack today">${inner}</section>`; };
    const progressLine = (step) => {
      const n = steps.slice(0, idx + 1).filter((s) => s.kind === "drill").length;
      return step.gate ? `Tone check ${step.gate.i} of ${step.gate.n}` : `Question ${n} of ${total}`;
    };

    function go() {
      if (keyOff) { keyOff(); keyOff = null; }
      const step = steps[idx];
      if (!step) return;
      if (step.kind === "teach") return teach(step);
      if (step.kind === "drill") return step.drill.type === "say" ? sayCard(step) : drillCard(step);
      if (step.kind === "calibrate") return calibrate();
      if (step.kind === "gateResult") return gateResult();
      return done();
    }
    const next = () => { idx++; go(); window.scrollTo(0, 0); };

    // Playback: A.play is called straight from the tap handler so audio unlocks on the gesture.
    // A clip that will not play skips the drill unscored.
    const say = (syl, voice) => A.play(syl, { voice }).then((r) => ({ r, after: A.afterPlay(r) }));
    function playBtnHandler(b, voice, skipOnFail) {
      b.addEventListener("click", () => say(b.dataset.syl, voice).then(({ after }) => {
        if (!after.skip) return;
        ctx.toast(after.message);
        if (skipOnFail && !answeredNow) next();
      }));
    }
    async function playSeq(list, voice) {
      for (const s of [].concat(list)) { const { after } = await say(s, voice); if (after.skip) { ctx.toast(after.message); return; } }
    }

    // ---- teach
    function teach(step) {
      const lines = step.lines.map((l) => `<p>${esc(l.text)}</p>`).join("");
      const anchors = (step.anchors || []).filter((a) => A.voicesFor(a[1]).length).map((a) =>
        `<button type="button" class="btn small-btn playbtn" data-syl="${esc(a[1])}" aria-label="Play ${esc(a[1])}">&#9654; ${esc(a[0])} <span class="soft">${esc(a[1])}</span></button>`).join("");
      shell(`<h1>${esc(step.title)}</h1>${lines}${anchors ? `<p class="soft small">Tap to hear examples.</p><div class="row">${anchors}</div>` : ""}
        <div class="row"><button type="button" class="btn primary" id="go">Start practising</button></div>`);
      view.querySelectorAll(".playbtn").forEach((b) => playBtnHandler(b, ctx.state.voice, false));
      const g = document.getElementById("go"); g.onclick = next; g.focus();
    }

    // ---- speaking and calibration (JyutSpeak is built in Task 12; without it these are skippable cards)
    function sayCard(step) {
      const d = step.drill, exp = [].concat(d.target).join(" ");
      shell(`<p class="soft small">${progressLine(step)}</p><h2>Say it</h2><p class="prompt big">${esc(exp)}</p>
        <div class="row"><button type="button" class="btn" id="hear">&#9654; Hear it</button></div><div id="panel"></div>
        <div class="row"><button type="button" class="btn quiet" id="skip">${window.JyutSpeak ? "Skip" : "Continue"}</button></div>`);
      document.getElementById("hear").onclick = () => playSeq(d.target, d.voice);
      const panel = document.getElementById("panel");
      if (window.JyutSpeak) {
        window.JyutSpeak.sayPanel(panel, {
          expected: d.target, profile: ctx.state.profile, mode: data.tonecheck.mode,
          onResult(res) {
            const v = res && res.verdict;
            if (v === "right" || v === "wrong") { ctx.state.stats = D.record(ctx.state.stats, d, v, day()); answered++; ctx.save(); }
            next();
          },
        });
      } else panel.innerHTML = `<p class="soft">Speaking practice comes next. For now, listen and say it aloud to yourself.</p>`;
      document.getElementById("skip").onclick = next;
    }
    function calibrate() {
      shell(`<h2>Set up speaking practice</h2><div id="panel"></div><div class="row"><button type="button" class="btn quiet" id="skip">${window.JyutSpeak ? "Skip for now" : "Continue"}</button></div>`);
      const panel = document.getElementById("panel");
      if (window.JyutSpeak) window.JyutSpeak.calibrationPanel(panel, { onDone(profile) { ctx.state.profile = profile; ctx.save(); next(); } });
      else panel.innerHTML = `<p class="soft">Speaking practice comes next. You can carry on without it.</p>`;
      document.getElementById("skip").onclick = next;
    }

    // ---- drill cards
    function drillCard(step) {
      const d = step.drill;
      answeredNow = false;
      const playBtn = (syl, label, id) => `<button type="button" class="btn playbtn" data-syl="${esc(syl)}"${id ? ` id="${id}"` : ""}>&#9654; ${esc(label)}</button>`;
      let prompt = "", body = "";
      if (d.type === "tone-id") {
        prompt = "Which tone do you hear?";
        body = `<div class="row">${playBtn(d.target, "Play", "p1")}</div>
          <div class="row" role="group" aria-label="Tone choices">${d.options.map((t) => `<button type="button" class="btn choice" data-a="${t}" aria-label="Tone ${t}">${t}</button>`).join("")}</div>
          <p class="soft small">Press 1 to 6 to answer, P to play again.</p>`;
      } else if (d.type === "same-diff") {
        prompt = "Same or different?";
        body = `<div class="row">${playBtn(d.target[0], "Play first", "p1")}${playBtn(d.target[1], "Play second", "p2")}</div>
          <div class="row" role="group"><button type="button" class="btn choice" data-a="same">Same</button><button type="button" class="btn choice" data-a="different">Different</button></div>
          <p class="soft small">Press S for same, D for different.</p>`;
      } else if (d.type === "syl-id") {
        prompt = "Which one do you hear?";
        body = `<div class="row">${playBtn(d.target, "Play", "p1")}</div>
          <div class="row" role="group">${d.options.map((o) => `<button type="button" class="btn choice" data-a="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
      } else if (d.type === "read") {
        prompt = `Which sound is <strong>${esc(d.target)}</strong>?`;
        body = d.options.map((o, i) => `<div class="row">${playBtn(o, "Sound " + (i + 1))}<button type="button" class="btn choice" data-a="${esc(o)}" aria-label="Sound ${i + 1} is ${esc(d.target)}">This one</button></div>`).join("");
      } else if (d.type === "dictation") {
        prompt = "Type what you hear";
        body = `<div class="row">${playBtn(d.target, "Play", "p1")}</div>
          <form class="row" id="dict"><label class="soft small" for="ans">Jyutping with the tone number, such as si1</label>
          <input id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" style="font:inherit;padding:6px 8px;max-width:12em"><button class="btn primary" type="submit">Check</button></form>`;
      }
      shell(`<p class="soft small">${progressLine(step)}</p><h2 class="prompt">${prompt}</h2>${body}<div id="fb" class="fb" aria-live="polite"></div>`);

      view.querySelectorAll(".playbtn").forEach((b) => playBtnHandler(b, d.voice, true));
      let locked = false;
      const answer = (a) => {
        if (locked) return;
        const verdict = D.score(d, a);
        if (verdict === "needTone") { document.getElementById("fb").innerHTML = `<p class="hint">Add the tone number, such as si1.</p>`; return; }
        locked = true; answeredNow = true;
        view.querySelectorAll(".choice, #dict button, #ans").forEach((b) => { b.disabled = true; });
        ctx.state.stats = D.record(ctx.state.stats, d, { verdict, answer: a }, day());
        answered++;
        ctx.save();
        feedback(d, a, verdict);
      };
      view.querySelectorAll("button.choice").forEach((b) => b.addEventListener("click", () => answer(b.dataset.a)));
      const form = document.getElementById("dict");
      if (form) { form.addEventListener("submit", (e) => { e.preventDefault(); answer(document.getElementById("ans").value); }); document.getElementById("ans").focus(); }

      const onKey = (e) => {
        if (!document.getElementById("fb") || locked || e.ctrlKey || e.metaKey || e.altKey || (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return;
        const k = e.key.toLowerCase();
        if (d.type === "tone-id" && d.options.map(String).includes(k)) answer(k);
        else if (d.type === "same-diff" && (k === "s" || k === "d")) answer(k === "s" ? "same" : "different");
        else if (k === "p" && document.getElementById("p1")) document.getElementById("p1").click();
      };
      document.addEventListener("keydown", onKey);
      keyOff = () => document.removeEventListener("keydown", onKey);
    }

    function feedback(d, a, verdict) {
      const fb = document.getElementById("fb");
      const pb = (syl, label) => `<button type="button" class="btn small-btn playbtn" data-syl="${esc(syl)}">&#9654; ${esc(label)}</button>`;
      let html;
      if (verdict === "right") html = `<p class="ok">Yes, that is it.</p>`;
      else {
        let side;
        if (d.type === "tone-id") {
          const p = J.parse(d.target), chosen = p[0] + p[1] + a;
          side = pb(d.target, "Right: tone " + p[2]) + (A.voicesFor(chosen).includes(d.voice) ? pb(chosen, "Yours: tone " + a) : "");
          html = `<p class="hint">That one was tone ${p[2]}. Listen to the two side by side.</p>`;
        } else if (d.type === "same-diff") {
          side = pb(d.target[0], "First") + pb(d.target[1], "Second");
          html = `<p class="hint">These two were ${d.target[0] === d.target[1] ? "the same" : "different"}. Listen again.</p>`;
        } else if (d.type === "dictation") {
          side = pb(d.target, "Hear it again");
          html = `<p class="hint">It was ${esc(d.target)}. Listen once more.</p>`;
        } else {
          side = pb(d.target, "Right: " + d.target) + (a && a !== d.target && A.voicesFor(a).includes(d.voice) ? pb(a, "Yours: " + a) : "");
          html = `<p class="hint">That one was ${esc(d.target)}. Listen to the two side by side.</p>`;
        }
        html += `<div class="row">${side}</div>`;
      }
      fb.innerHTML = html + `<div class="row"><button type="button" class="btn primary" id="next">Next</button></div>`;
      fb.querySelectorAll(".playbtn").forEach((b) => playBtnHandler(b, d.voice, false));
      const n = document.getElementById("next"); n.onclick = next; n.focus();
    }

    // ---- gate and done
    function gateResult() {
      const g = D.gate(ctx.state.stats);
      shell(`<h1>Tone check</h1><p>${esc(L.gateSummary(ctx.state.stats, g.passed))}</p>
        <div class="row"><button type="button" class="btn primary" id="go">${g.passed ? "Continue" : "Move on anyway"}</button></div>`);
      const b = document.getElementById("go"); b.onclick = next; b.focus();
    }

    function done() {
      const text = L.summarise(before, ctx.state.stats, answered);
      if (!pm) { // warm the cache for exactly next lesson's drawn drills
        try {
          const nl = L.compose(data.stage0, ctx.state.stats, { hasMic: false, calibrated: true, audio: data.audio }, rng);
          const byVoice = {};
          const add = (d) => sylsOf(d).forEach((x) => { (byVoice[d.voice] = byVoice[d.voice] || new Set()).add(x); });
          nl.steps.forEach((s) => { if (s.kind === "drill") add(s.drill); });
          Object.keys(byVoice).forEach((v) => A.prefetch(Array.from(byVoice[v]), Number(v)));
        } catch (e) { /* prefetch is optional */ }
      }
      const links = pm
        ? `<a class="btn" href="#sounds">Back to Sounds</a><button type="button" class="btn primary" id="again">Practise again</button>`
        : `<a class="btn" href="#sounds">Open Sounds</a><button type="button" class="btn primary" id="again">Keep practising</button>`;
      shell(`<h1>${answered ? "Nicely done" : "All done"}</h1><p>${esc(text)}</p><div class="row">${links}</div>`);
      const again = document.getElementById("again"); again.onclick = () => ctx.route(); again.focus();
    }

    build();
    if (!steps.length || (!total && !steps.some((s) => s.kind === "teach"))) {
      shell(`<h1>Today</h1><p class="soft">No sounds are available to practise yet. Try <a href="#sounds">Sounds</a>.</p>`);
      return;
    }
    go();
  }

  window.JyutScreens.today = render;
})();
