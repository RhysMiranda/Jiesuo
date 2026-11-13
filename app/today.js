/* Today: the home screen and the daily lesson. Pure scheduling lives in journey.js; this file is the DOM.
   The aim is a feeling: opening Jiesuo should feel like "something new to unlock today". So the screen
   leads with what's next, never with what was missed, and every session ends on real progress. */
(function () {
  "use strict";
  const J = window.JiesuoJourney;

  function create(ctx) {
    const { core, state, save, view, esc, fmt, disp, sayButton, glossOf, pinyinOf, knowsGlyph, learn } = ctx;
    const W = () => window.JiesuoWriter;
    const short = (g) => (g || "").split(";")[0].trim();
    const KIND = { p: "part", c: "character", w: "word" };
    const today = () => J.dayKey();

    // ---- Shared pieces
    /** The parts a glyph is built from (characters, parts), or the characters of a word. */
    function builtFrom(i) {
      const it = core.get(i);
      if (it.kind === "w") return Array.from(disp(i));
      // Same order as the build animation when the stroke-parts file is in.
      const fromStrokes = W() && W().partNames(it.form);
      if (fromStrokes && fromStrokes.length > 1) return fromStrokes;
      const rec = core.partsData[it.form] || {};
      return [...new Set((rec.p || []).map(([p]) => p))].filter((p) => p !== it.form);
    }
    function builtLine(i, { lead = "Built from" } = {}) {
      const parts = builtFrom(i);
      if (!parts.length) return "";
      const known = parts.filter(knowsGlyph);
      const chips = parts.map((p) => `<span class="zh ${knowsGlyph(p) ? "tok-known" : ""}">${esc(p)}</span>`).join(" + ");
      const already = known.length ? ` <span class="soft">You already know ${known.map((p) => `<span class="zh tok-known">${esc(p)}</span>`).join(" and ")}.</span>` : "";
      return `<p class="built-from">${lead} ${chips}.${already}</p>`;
    }
    const squares = (i, cls = "") => `<span class="word ${cls}">${Array.from(disp(i)).map((c, k, all) => `<span class="ge" style="--k:${k};--n:${all.length}"><b>${esc(c)}</b></span>`).join("")}</span>`;

    function statsNow(known = state.known) {
      let chars = 0, words = 0;
      for (const u of known) if (u < core.n) { const k = core.get(u).kind; if (k === "c") chars++; else if (k === "w") words++; }
      const hsk1 = core.items.filter((it) => ctx.bands[it.i] === 1 && it.kind !== "p");
      return {
        chars, words, written: state.stats.written, unlocked: state.stats.unlocked, days: state.days.size,
        coverage: core.estimatedCoverage(known), hsk1Done: hsk1.length > 0 && hsk1.every((it) => known.has(it.i)),
      };
    }

    function prefetchStrokes() {
      if (!navigator.onLine || !W()) return;
      const next = J.pickNew(core, ctx.currentOrder(), state.known, 9);
      next.flatMap((u) => Array.from(disp(u))).forEach((c) => W().loadStrokes(c));
      W().loadStrokeParts();
    }

    // ---- Lesson state
    function newLesson(k = 3, withReviews = true, maxReviews = 5) {
      const items = J.pickNew(core, ctx.currentOrder(), state.known, k);
      const reviews = withReviews ? J.dueReviews(state.review, today(), maxReviews).filter((u) => !items.includes(u)) : [];
      state.lesson = { day: today(), items, reviews, added: [], step: 0, before: { coverage: core.estimatedCoverage(state.known) } };
      save();
    }
    function steps(l) {
      const out = [];
      for (const u of l.items) out.push({ t: "meet", u }, { t: "write", u });
      for (const u of l.reviews) out.push({ t: "review", u });
      out.push({ t: "finish" });
      return out;
    }
    function advance() { state.lesson.step++; save(); renderLesson(); }

    // ---- Today
    function niceDay(day) {
      if (day === today()) return "Today";
      if (day === J.addDays(today(), -1)) return "Yesterday";
      const [y, m, d] = day.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    }
    function greeting() {
      const h = new Date().getHours();
      return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    }

    function renderToday() {
      document.body.classList.remove("in-lesson");
      const t = today();
      let l = state.lesson;
      if (l && l.finished && l.day !== t) { state.lesson = l = null; save(); }
      const doneToday = state.days.has(t);
      const days = [...state.days].sort();
      const last = days[days.length - 1];
      const away = last && last !== t ? J.daysBetween(last, t) : 0;
      const items = l && !l.finished ? l.items : J.pickNew(core, ctx.currentOrder(), state.known, 3);
      const due = l && !l.finished ? l.reviews.length : J.dueReviews(state.review, t, 5).length;
      const first = items[0];
      const mins = Math.max(2, Math.round(items.length * 2.3 + due * 0.6));
      const dayNo = state.days.size + (doneToday ? 0 : 1);

      let headline, lead;
      if (l && l.finished) { headline = "You unlocked something today."; lead = "Here's what you did, and what's next."; }
      else if (l) { headline = "Your lesson is waiting where you left it."; lead = ""; }
      else if (away >= 2) { headline = "Welcome back. Something new is ready for you."; lead = "Pick up right where you were. You remember more than you think."; }
      else if (!state.days.size) { headline = "Your first thing to unlock"; lead = "Every lesson is a few new things, how they are built, and writing them yourself."; }
      else if (doneToday) { headline = "There's always one more to unlock."; lead = "You've finished today's lesson. Keep going if you're enjoying it."; }
      else { headline = "Something new to unlock today"; lead = ""; }

      const teaser = first === undefined ? "" : `
        <section class="teaser" aria-label="Next to learn">
          <div class="teaser-glyph">${squares(first, "glow")}</div>
          <div class="teaser-text">
            <span class="soft">Next ${KIND[core.get(first).kind]}</span>
            <span class="pinyin-big">${esc(pinyinOf(core.get(first)))}</span>
            <span>${esc(short(glossOf(core.get(first))))}</span>
            ${builtLine(first)}
          </div>
        </section>`;

      // Words added from search (or due again) can be reviewed straight away once today's lesson is done.
      const reviewNow = !l || l.finished ? J.dueReviews(state.review, t, 10).length : 0;
      const reviewBtn = (primary) => reviewNow ? `<button type="button" class="btn ${primary ? "primary" : ""} big" data-review-only>Review ${reviewNow} ${reviewNow === 1 ? "word" : "words"}</button>` : "";
      let action;
      if (l && l.finished) action = finishSummary(l) + `<div class="row">${reviewBtn(true)}<button type="button" class="btn ${reviewNow ? "" : "primary"} big" data-one-more>Learn one more</button></div>`;
      else if (first === undefined && !due) action = `<p>You've learned everything in this learning order. Paste real Chinese into Read to keep going.</p>`;
      else if (doneToday && !l) action = `<div class="row">${reviewBtn(true)}<button type="button" class="btn ${reviewNow ? "" : "primary"} big" data-one-more>Learn one more</button></div>`;
      else {
        const what = [items.length ? `${items.length} new ${items.length === 1 ? "thing" : "things"}` : "", due ? `${due} to review` : "", `about ${mins} minutes`].filter(Boolean).join(" · ");
        action = `<p class="soft">${what}</p><div class="row"><button type="button" class="btn primary big" data-start>${l ? `Continue (${l.step + 1} of ${steps(l).length})` : "Start today's lesson"}</button></div>`;
      }

      view.innerHTML = `
        <section class="today-hero">
          <p class="soft">${greeting()}${state.days.size || !doneToday ? ` · day ${fmt(dayNo)} of learning` : ""}</p>
          <h1>${headline}</h1>
          ${lead ? `<p class="soft">${lead}</p>` : ""}
        </section>
        ${l && l.finished ? "" : teaser}
        <section class="stack">${action}</section>
        <section class="stack"><h2>Your journey</h2>${journeyPath()}</section>`;
      const start = view.querySelector("[data-start]");
      if (start) start.onclick = () => { if (!state.lesson) newLesson(3, true); location.hash = "lesson"; };
      const more = view.querySelector("[data-one-more]");
      if (more) more.onclick = () => { newLesson(1, false); location.hash = "lesson"; };
      const rev = view.querySelector("[data-review-only]");
      if (rev) rev.onclick = () => { newLesson(0, true, 10); location.hash = "lesson"; };
      prefetchStrokes();
    }

    /** Milestones as a line of practice squares: reached ones inked, the next one says how close it is. */
    function journeyPath() {
      const all = J.milestones(statsNow());
      let changed = false;
      for (const m of all) if (m.reached && !state.milestones[m.key]) { state.milestones[m.key] = today(); changed = true; }
      if (changed) save();
      const reached = all.filter((m) => m.reached);
      const ahead = all.filter((m) => !m.reached);
      const shown = [...reached.slice(-2), ...ahead.slice(0, 3)];
      const row = (m, k) => {
        const isNext = m === ahead[0];
        const when = state.milestones[m.key];
        return `<li class="${m.reached ? "done" : isNext ? "next" : ""}"><span class="ge ge-s">${m.reached ? "<b>✓</b>" : ""}</span><span><strong>${esc(m.label)}</strong>${m.reached && when ? `<br><span class="soft small">${esc(niceDay(when))}</span>` : m.hint ? `<br><span class="soft small">${esc(m.hint)}</span>` : ""}</span></li>`;
      };
      return `<ol class="path">${reached.length > 2 ? `<li class="done more"><span class="ge ge-s"><b>${reached.length - 2}</b></span><span class="soft">more reached</span></li>` : ""}${shown.map(row).join("")}</ol>`;
    }

    // ---- Lesson
    function renderLesson() {
      const l = state.lesson;
      if (!l) { location.hash = "today"; return; }
      document.body.classList.add("in-lesson");
      const all = steps(l);
      const s = all[Math.min(l.step, all.length - 1)];
      const progress = Math.round((Math.min(l.step, all.length - 1) / (all.length - 1)) * 100);
      view.innerHTML = `
        <div class="lesson-top">
          <button type="button" class="close" data-leave aria-label="Leave the lesson. It will wait for you." title="Leave (it will wait for you)">×</button>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${progress}%"></i></div>
        </div>
        <div class="lesson-body" id="step"></div>`;
      view.querySelector("[data-leave]").onclick = () => { location.hash = "today"; };
      const box = document.getElementById("step");
      ({ meet: stepMeet, write: stepWrite, review: stepReview, finish: stepFinish })[s.t](box, s.u);
    }

    function stepMeet(box, u) {
      const it = core.get(u);
      box.innerHTML = `
        <p class="soft">New ${KIND[it.kind]}</p>
        <div class="meet-glyph" id="meet-glyph">${it.kind === "w" ? squares(u, "slide") : ""}</div>
        <div class="stack meet-text">
          <span class="say-row"><span class="pinyin-big">${esc(pinyinOf(it))}</span>${it.kind !== "p" ? sayButton(it.form) : ""}</span>
          <span class="meaning">${esc(glossOf(it) || "")}</span>
          ${builtLine(u, { lead: it.kind === "w" ? "Made of" : "Built from" })}
        </div>
        <div class="stack" id="meet-use"></div>
        <div class="row lesson-actions"><button type="button" class="btn primary big" data-next>Now write it</button></div>`;
      if (it.kind !== "w" && W()) W().buildAnimation(document.getElementById("meet-glyph"), disp(u), { isKnown: knowsGlyph }).then((ok) => {
        if (!ok) document.getElementById("meet-glyph").innerHTML = squares(u);
      });
      showUse(u);
      box.querySelector("[data-next]").onclick = advance;
    }

    /** One way the item is used: a common word for a character, an example sentence for a word. */
    async function showUse(u) {
      const el = document.getElementById("meet-use");
      const it = core.get(u);
      if (it.kind !== "w") {
        const words = core.children[u].filter((c) => c < core.n && core.get(c).kind === "w").sort((a, b) => core.get(b).freq - core.get(a).freq);
        const w = words.find((c) => core.prereq[c].every((p) => p === u || state.known.has(p))) ?? words[0];
        if (w !== undefined) el.innerHTML = `<h2>You'll see it in</h2><p class="use-word"><span class="zh">${esc(disp(w))}</span> <span class="soft">${esc(pinyinOf(core.get(w)))}</span> ${esc(short(glossOf(core.get(w))))}</p>`;
        return;
      }
      try {
        const map = await ctx.loadSentences();
        const list = map.get(u) || [];
        if (!list.length || !document.body.contains(el)) return;
        const best = [...list].sort((a, b) => a[1].length - b[1].length)[0];
        el.innerHTML = `<h2>In a sentence</h2>${ctx.sentenceHtml(best)}`;
      } catch (e) { /* examples are a bonus */ }
    }

    function stepWrite(box, u) {
      const it = core.get(u);
      const isWord = it.kind === "w";
      box.innerHTML = `
        <p class="soft">${isWord ? "Write the word, one character at a time" : "Watch, then trace it yourself"}</p>
        <div class="write-head"><span class="zh big-form">${esc(disp(u))}</span><span><span class="pinyin">${esc(pinyinOf(it))}</span> ${esc(short(glossOf(it)))}</span></div>
        <div id="lesson-write"></div>
        <div class="row lesson-actions">
          <button type="button" class="btn primary big" data-next hidden>Continue</button>
          <button type="button" class="linkish" data-skip>Skip writing</button>
        </div>`;
      const next = box.querySelector("[data-next]"), skip = box.querySelector("[data-skip]");
      const done = (wrote) => {
        const l = state.lesson;
        if (!l.added.includes(u)) {
          learn(u).forEach((x) => { if (!l.added.includes(x)) l.added.push(x); });
          state.review.set(u, J.schedule(undefined, true, today()));
          if (wrote) state.stats.written++;
        }
        save();
        next.hidden = false; skip.hidden = true;
        next.focus({ preventScroll: true });
      };
      next.onclick = advance;
      skip.onclick = () => { done(false); advance(); };
      if (!W()) { done(false); return; }
      W().writePanel(document.getElementById("lesson-write"), Array.from(disp(u)), {
        isKnown: knowsGlyph,
        modes: isWord ? ["memory", "trace"] : ["watch", "trace"],
        start: isWord ? "memory" : "watch",
        autoTrace: !isWord,
        onDone: ({ skipped }) => done(!skipped),
      });
    }

    async function stepReview(box, u) {
      const it = core.get(u);
      // Characters are reviewed by writing them; without stroke data (or offline before it was fetched),
      // and for words, by meaning. An item with neither is skipped rather than counted as a miss.
      const glyphs = Array.from(disp(u));
      const canWrite = it.kind !== "w" && glyphs.length === 1 && !!W() && !!(await W().loadStrokes(glyphs[0]));
      if (!canWrite && !glossOf(it)) { advance(); return; }
      if (!document.body.contains(box)) return;
      const finish = (correct, answerHtml) => {
        state.review.set(u, J.schedule(state.review.get(u), correct, today()));
        state.lesson.reviewed = (state.lesson.reviewed || 0) + 1;
        if (correct) state.lesson.remembered = (state.lesson.remembered || 0) + 1;
        if (correct && canWrite) state.stats.written++;
        save();
        box.querySelector("[data-result]").innerHTML = answerHtml;
        const next = box.querySelector("[data-next]");
        next.hidden = false;
        next.focus({ preventScroll: true });
      };
      if (canWrite) {
        box.innerHTML = `
          <p class="soft">Remember this one?</p>
          <div class="write-head"><span><span class="pinyin-big">${esc(pinyinOf(it))}</span><br>${esc(short(glossOf(it)))}</span>${it.kind !== "p" ? sayButton(it.form) : ""}</div>
          <p>Write it from memory.</p>
          <div id="lesson-write"></div>
          <div data-result></div>
          <div class="row lesson-actions"><button type="button" class="btn primary big" data-next hidden>Continue</button><button type="button" class="linkish" data-show>Show me</button></div>`;
        const reveal = (correct) => finish(correct, `<p class="${correct ? "yay" : ""}">${correct ? "You remembered it." : "Here it is. It will come back soon, so it sticks."} <span class="zh big-inline tok-known">${esc(disp(u))}</span></p>`);
        let answered = false;
        box.querySelector("[data-show]").onclick = (e) => { if (answered) return; answered = true; e.target.hidden = true; reveal(false); };
        W().writePanel(document.getElementById("lesson-write"), Array.from(disp(u)), {
          isKnown: knowsGlyph, modes: ["memory"], start: "memory",
          onDone: ({ mistakes, skipped }) => { if (answered) return; answered = true; box.querySelector("[data-show]").hidden = true; reveal(!skipped && mistakes <= 2); },
        });
      } else {
        // Meaning check: four choices from the same kind of item, no penalty for a miss.
        const same = (x) => x !== u && x < core.n && core.get(x).kind === it.kind && glossOf(core.get(x));
        const pool = [...state.known].filter(same);
        const extra = ctx.currentOrder().filter(same).slice(0, 40);
        const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
        const right = short(glossOf(it));
        const wrong = [...new Set(shuffle(pool.length >= 3 ? pool : extra).map((x) => short(glossOf(core.get(x)))))].filter((g) => g && g !== right).slice(0, 3);
        const options = shuffle([right, ...wrong]);
        box.innerHTML = `
          <p class="soft">Remember this one?</p>
          <div class="meet-glyph">${squares(u)}</div>
          <p>What does it mean?</p>
          <div class="options">${options.map((o) => `<button type="button" class="option" data-opt="${esc(o)}">${esc(o)}</button>`).join("")}</div>
          <div data-result></div>
          <div class="row lesson-actions"><button type="button" class="btn primary big" data-next hidden>Continue</button></div>`;
        let answered = false;
        box.querySelectorAll("[data-opt]").forEach((b) => (b.onclick = () => {
          if (answered) return;
          answered = true;
          const ok = b.dataset.opt === right;
          box.querySelectorAll("[data-opt]").forEach((o) => { o.disabled = true; if (o.dataset.opt === right) o.classList.add("right"); else if (o === b) o.classList.add("chosen"); });
          finish(ok, `<p class="${ok ? "yay" : ""}">${ok ? "Yes, that's it." : `It means “${esc(right)}”. You'll see it again soon.`} <span class="soft">${esc(pinyinOf(it))}</span></p>`);
        }));
      }
      box.querySelector("[data-next]").onclick = advance;
    }

    // ---- Finish: the moment of progress
    async function stepFinish(box) {
      const l = state.lesson;
      box.innerHTML = `<p class="soft">Putting today together…</p>`;
      if (!l.finished) {
        const after = new Set(state.known);
        const before = new Set([...after].filter((u) => !l.added.includes(u)));
        let rows = [];
        try { rows = await ctx.loadSentenceRows(); } catch (e) { rows = []; }
        const unlock = J.unlockSentence(core, rows, before, after);
        const order = ctx.currentOrder();
        const opened = core.frontier(order, after).filter((w) => w < core.n && core.get(w).kind === "w" && !core.prereq[w].every((p) => before.has(p))).length;
        state.days.add(today());
        if (unlock) state.stats.unlocked++;
        const was = new Set(Object.keys(state.milestones));
        const fresh = J.milestones(statsNow()).filter((m) => m.reached && !was.has(m.key));
        fresh.forEach((m) => (state.milestones[m.key] = today()));
        l.finished = true;
        l.result = {
          learned: l.items.map((u) => disp(u)), unlock: unlock ? unlock[0] : null, opened,
          gain: Math.max(0, core.estimatedCoverage(after) - l.before.coverage), coverage: core.estimatedCoverage(after),
          milestones: fresh.map((m) => m.label),
          reviewed: l.reviewed || 0, remembered: l.remembered || 0,
        };
        save();
      }
      const rows = await ctx.loadSentenceRows().catch(() => []);
      const r = l.result;
      const unlockRow = r.unlock ? rows.find((x) => x[0] === r.unlock) : null;
      const next = J.pickNew(core, ctx.currentOrder(), state.known, 1)[0];
      box.innerHTML = `
        <section class="finish">
          <p class="soft">${r.learned.length ? "Lesson complete" : "Reviews complete"}</p>
          <h1>${unlockRow ? "You can read this now." : r.learned.length ? "Look what you unlocked." : r.remembered ? "Your memory is getting stronger." : "Every review makes it stick."}</h1>
          ${r.reviewed ? `<p class="big-number"><strong>${fmt(r.remembered)}</strong> of ${fmt(r.reviewed)} remembered${r.remembered < r.reviewed ? ". The others come back soon, so they stick" : ""}.</p>` : ""}
          ${unlockRow ? `<div class="unlocked">${inkSentence(unlockRow)}</div>` : r.opened ? `<p class="big-number"><strong>${fmt(r.opened)}</strong> new ${r.opened === 1 ? "word is" : "words are"} now one step away.</p>` : ""}
          <p class="gain">You can now read about <strong>${(r.coverage * 100).toFixed(1)}%</strong> of everyday Chinese${r.gain >= 0.0005 ? ` <span class="up">+${(r.gain * 100).toFixed(1)}% today</span>` : ""}.</p>
          ${r.learned.length ? `<p>Learned today: ${r.learned.map((f) => `<span class="zh tok-known big-inline">${esc(f)}</span>`).join(" ")}</p>` : ""}
          ${r.milestones.length ? `<div class="stamps">${r.milestones.map((m) => `<p class="stamp"><span class="ge ge-s"><b>✓</b></span> ${esc(m)}</p>`).join("")}</div>` : ""}
        </section>
        ${next !== undefined ? `<section class="teaser small-teaser"><div class="teaser-glyph">${squares(next, "glow")}</div><div class="teaser-text"><span class="soft">Tomorrow</span><span><span class="pinyin">${esc(pinyinOf(core.get(next)))}</span> ${esc(short(glossOf(core.get(next))))}</span>${builtLine(next)}</div></section>` : ""}
        <div class="row lesson-actions">
          <button type="button" class="btn primary big" data-done>Done</button>
          ${next !== undefined ? `<button type="button" class="btn big" data-more>Keep going</button>` : ""}
        </div>`;
      box.querySelector("[data-done]").onclick = () => { location.hash = "today"; };
      const more = box.querySelector("[data-more]");
      if (more) more.onclick = () => { newLesson(1, false); renderLesson(); window.scrollTo(0, 0); };
    }

    /** The unlocked sentence, each character inking in turn. */
    function inkSentence(row) {
      const text = state.script === "t" ? row[2] || row[1] : row[1];
      let k = 0;
      const line = Array.from(text).map((c) => (/\p{Script=Han}/u.test(c) ? `<span class="ink" style="--k:${k++}">${esc(c)}</span>` : esc(c))).join("");
      const html = ctx.sentenceHtml(row);
      // Reuse the credit and translation lines from the standard sentence block.
      const tail = html.replace(/^<div class="sentence"><p class="line"[^>]*>.*?<\/p>/, "").replace(/<\/div>$/, "");
      return `<div class="sentence"><p class="line ink-line" lang="${state.script === "t" ? "zh-HK" : "zh-Hans"}">${line}</p>${tail}</div>`;
    }

    function finishSummary(l) {
      const r = l.result || {};
      return `<div class="done-card">
        <p>${r.learned && r.learned.length ? `Today you learned ${r.learned.map((f) => `<span class="zh tok-known big-inline">${esc(f)}</span>`).join(" ")}.` : "Today's lesson is done."}</p>
        <p class="soft">You can read about ${(core.estimatedCoverage(state.known) * 100).toFixed(1)}% of everyday Chinese.</p>
      </div>`;
    }

    return { renderToday, renderLesson };
  }

  window.JiesuoToday = { create };
})();
