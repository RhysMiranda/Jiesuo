/* Today screen: the daily stage 0 lesson, plus #today/practise/<a>-<b> for one tone pair.
   Screens register on window.JyutScreens and are called as screen(ctx). Lesson planning is in lesson.js. */
(function () {
  "use strict";
  window.JyutScreens = window.JyutScreens || {};

  let staleKeyOff = null; // the previous render's keydown listener, removed when Today is drawn again
  let cachedMap = null; // {syl: [voice]} the audio cache holds, refreshed on every render (async)
  const sylsOf = (d) => (Array.isArray(d.target) ? d.target : [d.target]).concat((d.options || []).filter((o) => typeof o === "string" && o !== "same" && o !== "different"));

  function render(ctx) {
    const L = window.JyutLesson, J = window.JyutJyutping, A = window.JyutAudio;
    const esc = ctx.esc, data = ctx.data, view = ctx.view;
    const D = ctx.drills.createDrills({ stage0: data.stage0, audio: data.audio });
    A.init(data.audio);
    A.cachedClips().then((m) => { cachedMap = m && Object.keys(m).length ? m : null; });
    const offline = () => (typeof navigator !== "undefined" && navigator.onLine === false ? cachedMap : null);
    if (staleKeyOff) { staleKeyOff(); staleKeyOff = null; }
    const pm = /^today\/practise\/([1-6])-([1-6])$/.exec((location.hash || "").slice(1));
    const rng = Math.random;
    const day = () => ctx.journey.dayKey();
    const before = JSON.parse(JSON.stringify(ctx.state.stats));
    let steps = [], total = 0, idx = 0, answered = 0, answeredNow = false, keyOff = null;
    // Once the words open (and the content loaded), Today is: sound practice, the word lesson, a closing sentence.
    const C = window.JyutCourse, W = window.JyutWordLesson;
    const wordsOn = !pm && !!(ctx.content && C && W && C.wordsUnlocked(ctx.state, D));
    let wordSummary = null;

    const lessonOpts = () => ({
      hasMic: !!(window.JyutSpeak && window.JyutSpeak.canRecord()), // the same test the say panel uses
      calibrated: ctx.state.profile != null,
      audio: data.audio,
      gateLast: ctx.state.gate && typeof ctx.state.gate.offered === "string" ? ctx.state.gate.offered : null,
      today: day(),
      drills: D,
      offlineClips: offline(), // offline, draw only what is cached
    });
    // Sound practice before the words: 10 drills from the unit in progress while stage 0 is unfinished,
    // then 6 tone review drills (tone drills keep returning). Say drills are left out: they need a microphone.
    function soundDrills() {
      const stats = ctx.state.stats, units = data.stage0.units;
      const cur = units.find((u) => !D.unitPassed(stats, u.id));
      const sayOnly = cur && cur.drills.every((x) => x === "say");
      const unit = cur && !sayOnly ? cur : units.find((u) => u.id === "tones-hear") || units[0];
      const n = cur && !sayOnly ? 10 : 6, review = !(cur && !sayOnly);
      const out = [], seen = new Set();
      for (let t = 0; out.length < n && t < n * 12; t++) {
        const d = D.pick(unit.id, stats, rng, { review, offlineClips: offline() });
        if (!d || d.type === "say") continue;
        const k = JSON.stringify([d.type, d.target]);
        if (seen.has(k) && t < n * 8) continue;
        seen.add(k); out.push(d);
      }
      return out.map((d) => ({ kind: "drill", drill: d }));
    }
    // The kept words lesson stores its steps with any gate step unexpanded (so its drills still count toward the gate),
    // the day, the position, and `ans`: the position already graded, so a refresh never grades it twice.
    let base = [], lessonDay = null, ansIdx = -1;
    const persist = () => {
      ctx.state.lesson = { words: true, day: lessonDay, steps: base, idx, ans: ansIdx };
      ctx.save();
    };
    function buildWords() {
      const kept = ctx.state.lesson;
      const ks = kept && kept.words && kept.day === day() && Array.isArray(kept.steps) ? kept.steps : null; // an earlier day's lesson is dropped
      const ws = ks ? ks.filter((s) => s && s.kind === "words") : [];
      const rest = ks ? ks.filter((s) => s && s.kind !== "words") : [];
      const restOk = ks && (rest.length === 0 || L.usableSteps(rest));
      const wsSteps = ws.length === 1 && ws[0].plan && Array.isArray(ws[0].plan.steps) ? W.usableSteps(ws[0].plan.steps) : null;
      if (ks && restOk && wsSteps && ks[ks.length - 1] === ws[0] && ks.length === rest.length + 1) {
        ws[0].plan.steps = wsSteps;
        base = (rest.length ? L.usableSteps(rest) : []).concat([ws[0]]);
        steps = W.expandGate(base).concat([{ kind: "done" }]);
        idx = Number.isInteger(kept.idx) ? Math.max(0, Math.min(steps.length - 1, kept.idx)) : 0;
        ansIdx = Number.isInteger(kept.ans) ? kept.ans : -1;
        if (ansIdx === idx && steps[idx].kind === "drill") idx++; // already graded: go on, never grade twice
        lessonDay = kept.day;
      } else {
        // The tone check stays reachable after moving on: the phase 1 rule (once a day, stage 0 tones-hear passed) decides.
        const gate = L.withGate(data.stage0, [], ctx.state.stats, lessonOpts(), rng);
        if (gate.some((s) => s.kind === "gate")) ctx.state.gate = Object.assign({}, ctx.state.gate, { offered: day() });
        const plan = C.planDay({ course: ctx.content.course, lex: ctx.content.lex, words: ctx.state.words, today: day(), rng });
        base = gate.concat(soundDrills(), [{ kind: "words", plan: { steps: plan.steps, pos: 0 } }]); // kept even when empty, so a refresh does not redraw
        steps = W.expandGate(base).concat([{ kind: "done" }]);
        idx = 0; ansIdx = -1; lessonDay = day();
        persist();
      }
    }
    function build() {
      const stats = ctx.state.stats;
      if (wordsOn) buildWords();
      else if (pm) {
        const ds = L.practise(data.stage0, data.audio, stats, Number(pm[1]), Number(pm[2]), rng, 10);
        steps = ds.map((d) => ({ kind: "drill", drill: d })).concat([{ kind: "done" }]);
      } else {
        const kept = ctx.state.lesson && !ctx.state.lesson.words ? ctx.state.lesson : null; // a words lesson is not a sound lesson
        const keptSteps = kept ? L.usableSteps(kept.steps) : null; // a damaged kept lesson is dropped and composed fresh
        // a kept lesson carries its prefetched gate step; whether the gate is due is decided now, as it starts
        const lesson = keptSteps ? { steps: L.withGate(data.stage0, keptSteps, stats, lessonOpts(), rng) } : L.compose(data.stage0, stats, lessonOpts(), rng);
        if (ctx.state.lesson) { ctx.state.lesson = null; ctx.save(); } // used once, so the next lesson is composed fresh
        if (lesson.steps.some((s) => s.kind === "gate")) { // note the offer, so the gate comes at most once a day
          ctx.state.gate = Object.assign({}, ctx.state.gate, { offered: day() });
          ctx.save();
        }
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
      if (step.kind === "words") return wordsPart(step);
      if (step.kind === "drill" && step.gate && step.gate.i === 1 && !step.started) { // a new gate starts from an empty log
        step.started = true;
        ctx.state.stats = Object.assign({}, ctx.state.stats, { gateLog: [] });
        ctx.save();
      }
      if (step.kind === "drill") return step.drill.type === "say" ? sayCard(step) : drillCard(step);
      if (step.kind === "calibrate") return calibrate();
      if (step.kind === "gateResult") return gateResult();
      return done();
    }
    let lastNext = 0;
    const advance = () => { idx++; if (wordsOn) persist(); go(); window.scrollTo(0, 0); };
    const next = () => { const t = Date.now(); if (t - lastNext < 300) return; lastNext = t; advance(); };

    // The word lesson draws itself; its position is kept in state.lesson so a refresh resumes it.
    function wordsPart(step) {
      const plan = step.plan;
      if (!plan.steps.length) { advance(); return; } // nothing new or due today: straight on
      const mine = idx;
      const run = W.run(Object.assign(Object.create(ctx), { day }), {
        steps: plan.steps, pos: plan.pos, ans: plan.ans,
        onPos(p) { plan.pos = p; persist(); },
        onAnswer(p) { plan.ans = p; persist(); },
      }, (summary) => { wordSummary = summary; Promise.resolve().then(() => { if (idx === mine && keyOff) advance(); }); }); // after run() returns, so keyOff is set
      keyOff = () => run.stop();
      staleKeyOff = keyOff;
    }

    // Playback: A.play is called straight from the tap handler so audio unlocks on the gesture.
    // A clip that will not play skips the drill unscored.
    const say = (syl, voice) => A.play(syl, { voice }).then((r) => ({ r, after: A.afterPlay(r) }));
    let swaps = 0; // gate questions replaced this lesson, capped so an offline gate cannot loop
    function playBtnHandler(b, voice, skipOnFail) {
      const at = idx; // late results belong to the card that was tapped
      const v = b.dataset.voice != null && b.dataset.voice !== "" ? Number(b.dataset.voice) : voice;
      b.addEventListener("click", () => say(b.dataset.syl, v).then(({ r, after }) => {
        if (!after.skip || at !== idx) return;
        if (r === "failed" && skipOnFail && !answeredNow) {
          const step = steps[idx];
          // A gate question that will not play is swapped for another, so the gate can still reach 40.
          const nd = step && step.gate && swaps < 20 ? L.replaceGateDrill(D, ctx.state.stats, step.drill, rng, cachedMap) : null; // cached clips first
          if (nd) { swaps++; steps[idx] = Object.assign({}, step, { drill: nd }); ctx.toast("That sound would not play, so here is another one."); go(); return; }
          ctx.toast(after.message);
          next();
          return;
        }
        ctx.toast(after.message); // blocked: stay and tap again
      }));
    }
    async function playSeq(list, voice) {
      for (const s of [].concat(list)) { const { after } = await say(s, voice); if (after.skip) { ctx.toast(after.message); return; } }
    }

    // ---- teach
    function teach(step) {
      const lines = step.lines.map((l) => `<p>${esc(l.text)}</p>`).join("");
      const list = (step.anchors || []).filter((a) => Array.isArray(a) && A.voicesFor(a[1]).length);
      // Examples are compared with each other, so they share one voice: one for the whole block if a voice has
      // them all, else one per set (si1..si6, fan1..fan6). The learner's chosen voice wins when it has the set.
      const pref = ctx.state.voice, syls = list.map((a) => a[1]);
      const whole = A.voiceForAll(syls, pref);
      const voiceOf = (syl) => {
        if (whole != null) return whole;
        const v = A.voiceForAll(syls.filter((x) => J.toneless(x) === J.toneless(syl)), pref);
        return v == null ? pref : v;
      };
      const anchors = list.map((a) =>
        `<button type="button" class="btn small-btn playbtn" data-syl="${esc(a[1])}" data-voice="${voiceOf(a[1])}" aria-label="Play ${esc(a[1])}">&#9654; ${esc(a[0])} <span class="soft">${esc(a[1])}</span></button>`).join("");
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
      document.getElementById("skip").onclick = next;
      const panel = document.getElementById("panel"), myIdx = idx;
      let finished = false;
      if (window.JyutSpeak) {
        const expected = [].concat(d.target).map((syl) => ({ syl, tone: J.parse(syl)[2] }));
        window.JyutSpeak.sayPanel(panel, {
          expected, profile: ctx.state.profile, mode: data.tonecheck.mode, voice: d.voice,
          onProfile(p) { ctx.state.profile = p; ctx.save(); },
          onResult(res) {
            const v = L.sayVerdict(res, window.JyutSpeak.shouldRecord);
            if (v === "retry" || finished || myIdx !== idx) return; // not heard or unsure: the panel lets them try again or skip
            finished = true;
            if (v === "right" || v === "wrong") {
              ctx.state.stats = D.record(ctx.state.stats, d, v, day()); answered++; ctx.save();
              const again = panel.querySelector("[data-rec]");
              if (again) again.hidden = true; // recorded: Next is the way forward
            }
            // The panel keeps its verdict and pitch drawing on screen; the learner moves on when ready.
            const b = document.getElementById("skip");
            if (b && view.contains(b)) { b.textContent = v === "skip" ? "Continue" : "Next"; b.className = "btn primary"; b.focus(); }
          },
        });
      } else panel.innerHTML = `<p class="soft">Speaking practice comes next. For now, listen and say it aloud to yourself.</p>`;
    }
    function calibrate() {
      shell(`<h2>Set up speaking practice</h2><div id="panel"></div><div class="row"><button type="button" class="btn quiet" id="skip">${window.JyutSpeak ? "Skip for now" : "Continue"}</button></div>`);
      const panel = document.getElementById("panel");
      document.getElementById("skip").onclick = next;
      if (window.JyutSpeak) window.JyutSpeak.calibrationPanel(panel, { onDone(profile) { ctx.state.profile = profile; ctx.save(); next(); } });
      else panel.innerHTML = `<p class="soft">Speaking practice comes next. You can carry on without it.</p>`;
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
      const card = document.getElementById("fb"), myIdx = idx;
      const answer = (a) => {
        if (locked) return;
        const verdict = D.score(d, a);
        if (verdict === "needTone") { document.getElementById("fb").innerHTML = `<p class="hint">Add the tone number, such as si1.</p>`; return; }
        locked = true; answeredNow = true;
        view.querySelectorAll(".choice, #dict button, #ans").forEach((b) => { b.disabled = true; });
        ctx.state.stats = D.record(ctx.state.stats, d, { verdict, answer: a }, day());
        answered++;
        ctx.save();
        if (wordsOn) { ansIdx = idx; persist(); } // graded: a refresh goes on from here, never grading it again
        feedback(d, a, verdict);
      };
      view.querySelectorAll("button.choice").forEach((b) => b.addEventListener("click", () => answer(b.dataset.a)));
      const form = document.getElementById("dict");
      if (form) { form.addEventListener("submit", (e) => { e.preventDefault(); answer(document.getElementById("ans").value); }); document.getElementById("ans").focus(); }

      const onKey = (e) => {
        if (!document.getElementById("fb") || !view.contains(card) || myIdx !== idx || locked || e.ctrlKey || e.metaKey || e.altKey || (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return;
        const k = e.key.toLowerCase();
        if (d.type === "tone-id" && d.options.map(String).includes(k)) answer(k);
        else if (d.type === "same-diff" && (k === "s" || k === "d")) answer(k === "s" ? "same" : "different");
        else if (k === "p" && document.getElementById("p1")) document.getElementById("p1").click();
      };
      document.addEventListener("keydown", onKey);
      keyOff = () => document.removeEventListener("keydown", onKey);
      staleKeyOff = keyOff;
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
      ctx.state.gate = Object.assign({}, ctx.state.gate, { result: { right: g.right, count: g.count, passed: g.passed, day: day() } });
      ctx.save();
      shell(`<h1>Tone check</h1><p>${esc(L.gateSummary(ctx.state.stats, g.passed))}</p>
        <div class="row"><button type="button" class="btn primary" id="go">${g.passed ? "Continue" : "Move on anyway"}</button></div>`);
      const b = document.getElementById("go");
      b.onclick = () => { if (!g.passed) { ctx.state.gate = Object.assign({}, ctx.state.gate, { movedOn: true }); ctx.save(); } next(); };
      b.focus();
    }

    function done() {
      const text = wordsOn
        ? (wordSummary && wordSummary.answered ? "You answered " + wordSummary.right + " of " + wordSummary.answered + " word questions right." + (wordSummary.fresh ? " " + wordSummary.fresh + " new item" + (wordSummary.fresh === 1 ? "" : "s") + " today." : "") + (answered ? " " + L.summarise(before, ctx.state.stats, answered) : "") : L.summarise(before, ctx.state.stats, answered))
        : L.summarise(before, ctx.state.stats, answered);
      if (wordsOn) { ctx.state.lesson = null; ctx.save(); } // the day's lesson is finished; the next visit plans a fresh one
      if (!pm && !wordsOn) { // compose the next lesson now, keep it, and warm the cache for exactly its drills
        try {
          // keep the gate step whatever the day (withGate decides at the start), so its clips are prefetched now
          const nl = L.compose(data.stage0, ctx.state.stats, Object.assign(lessonOpts(), { gate: "keep" }), rng);
          ctx.state.lesson = { steps: nl.steps };
          ctx.save();
          const byVoice = {};
          const add = (d) => sylsOf(d).forEach((x) => { (byVoice[d.voice] = byVoice[d.voice] || new Set()).add(x); });
          nl.steps.forEach((s) => { if (s.kind === "drill") add(s.drill); if (s.kind === "gate") s.drills.forEach(add); });
          Object.keys(byVoice).forEach((v) => A.prefetch(Array.from(byVoice[v]), Number(v)));
        } catch (e) { /* prefetch is optional */ }
      }
      const links = pm
        ? `<a class="btn" href="#sounds">Back to Sounds</a><button type="button" class="btn primary" id="again">Practise again</button>`
        : `<a class="btn" href="#sounds">Open Sounds</a><button type="button" class="btn primary" id="again">Keep practising</button>`;
      shell(`<h1>${answered || (wordSummary && wordSummary.answered) ? "Nicely done" : "All done"}</h1><p>${esc(text)}</p><div class="row">${links}</div>`);
      const again = document.getElementById("again"); again.onclick = () => ctx.route(); again.focus();
    }

    build();
    if (!steps.length || (!total && !steps.some((s) => s.kind === "teach" || s.kind === "words"))) {
      shell(`<h1>Today</h1><p class="soft">No sounds are available to practise yet. Try <a href="#sounds">Sounds</a>.</p>`);
      return;
    }
    go();
  }

  window.JyutScreens.today = render;
})();
