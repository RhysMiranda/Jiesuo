/* Jiesuo Cantonese: the word and grammar lesson shown inside Today. Renders the steps JyutCourse.planDay makes.
   Pure helpers (labels, feedback, credits, step checks) first; the DOM part is run(). All teaching text comes from data files. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./lexicon.js"));
  else root.JyutWordLesson = factory(root.JyutLex);
})(typeof self !== "undefined" ? self : this, function (Lex) {
  "use strict";
  const G = typeof self !== "undefined" ? self : globalThis;
  const isStr = (x) => typeof x === "string" && x.length > 0;
  const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const isGrammar = (item) => typeof item === "string" && item.startsWith("g:");

  /** words.hk text carries "#" link markers (such as "#舐嘢"); show it without them. */
  const clean = (s) => String(s == null ? "" : s).replace(/#/g, "");

  const SKILL_WORD = { hear: "hearing", read: "reading", type: "typing" };

  /** "New word", "Review: hearing", "New word: hearing" (fresh: the item was met in this lesson), "Closing sentence". */
  function stepLabel(step, fresh) {
    const t = step && step.type;
    if (t === "meet") return step.grammar ? "New grammar" : "New word";
    if (t === "sentence") return "Closing sentence";
    const what = SKILL_WORD[t];
    if (!what) return "Practice";
    if (!fresh) return "Review: " + what;
    return (isGrammar(step.item) ? "New grammar" : "New word") + ": " + what;
  }

  /** One line about an answer. For a typed step it names the syllable that is wrong; "" is never returned. */
  function feedbackFor(step, given, answer) {
    if (!step || step.type !== "type") return String(given) === String(answer) ? "Yes, that is it." : "It was " + clean(answer) + ".";
    const a = Lex.normalise(String(given == null ? "" : given)), b = Lex.normalise(String(answer == null ? "" : answer));
    if (!b) return "It was " + answer + ".";
    if (!a) return "That is not Jyutping I can read. It is " + b.syls.map((s) => s.base + s.tone).join(" ") + ".";
    const want = b.syls;
    if (a.syls.length !== want.length) {
      return "You typed " + a.syls.length + " syllable" + (a.syls.length === 1 ? "" : "s") + ", it has " + want.length + ": " + want.map((s) => s.base + s.tone).join(" ");
    }
    const notes = [];
    want.forEach((w, i) => {
      const t = a.syls[i];
      if (t.base !== w.base) notes.push("syllable " + (i + 1) + ": you typed " + t.base + ", it's " + w.base);
      else if (t.tone == null) notes.push(w.base + ": add the tone number, it's tone " + w.tone);
      else if (t.tone !== w.tone) notes.push(w.base + ": you typed tone " + t.tone + ", it's tone " + w.tone);
    });
    return notes.length ? notes.join("; ") : "Yes, that is it.";
  }

  /** "This word changes 名 ming4 → meng2" from the character's main reading (chars[c][0]) and the word's syllable; "" if none differ. */
  function changedNote(form, jp, chars) {
    const cs = Array.from(String(form || "")), syls = String(jp || "").split(/\s+/).filter(Boolean);
    if (cs.length !== syls.length) return "";
    const out = [];
    cs.forEach((c, i) => {
      const r = chars && Object.prototype.hasOwnProperty.call(chars, c) ? chars[c] : null;
      const main = Array.isArray(r) ? r[0] : r;
      if (main && main !== syls[i]) out.push(c + " " + main + " → " + syls[i]);
    });
    return out.length ? "This word changes " + out.join("; ") : "";
  }

  /** The credit line as [{t, href?}] parts. formOf(entryId) gives the words.hk headword for a link, or null. */
  function creditParts(ex, id, formOf) {
    const src = ex && ex.source;
    if (src === "tatoeba") {
      const tid = String(id).replace(/^tatoeba:/, "");
      const link = (n) => "https://tatoeba.org/en/sentences/show/" + encodeURIComponent(n);
      const parts = [{ t: "Tatoeba #" + tid, href: link(tid) }, { t: " by " + (ex.author || "unknown") }];
      if (ex.enId != null) parts.push({ t: "; English " }, { t: "#" + ex.enId, href: link(ex.enId) }, { t: " by " + (ex.enAuthor || "unknown") });
      parts.push({ t: " (CC BY 2.0 FR)" });
      return parts;
    }
    if (src === "wordshk") {
      const m = /^wordshk:(\d+)/.exec(String(id));
      let form = null;
      try { form = m && formOf ? formOf(m[1]) : null; } catch (e) { form = null; }
      return [{ t: "words.hk", href: form ? "https://words.hk/zidin/" + encodeURIComponent(form) : "https://words.hk/" },
        { t: " (" }, { t: "Non-Commercial Open Data Licence", href: "https://words.hk/base/hoifong/" }, { t: ")" }];
    }
    if (src === "hkcancor") return [{ t: "HKCanCor (CC BY 4.0)" }];
    return [];
  }

  /** Steps kept in storage, made safe to run: the same list, or null if anything is damaged. */
  function usableSteps(steps) {
    if (!Array.isArray(steps)) return null;
    for (const s of steps) {
      if (!isObj(s) || !isStr(s.type)) return null;
      if (s.type === "meet") {
        if (!isStr(s.item)) return null;
        if (s.grammar) { if (!isStr(s.title) || !isStr(s.explain) || !Array.isArray(s.examples)) return null; }
        else if (!isStr(s.form) || !isStr(s.jp) || !isStr(s.en)) return null;
      } else if (s.type === "hear" || s.type === "read" || s.type === "type") {
        if (!isStr(s.item) || !isObj(s.prompt) || !Array.isArray(s.options) || s.options.length < 2 || !s.options.every(isStr) || !isStr(s.answer)) return null;
        if (s.type === "type" && !isStr(s.answerForm)) return null;
        if (!["h", "r", "t"].includes(s.skill)) return null;
      } else if (s.type === "sentence") { if (!isStr(s.id)) return null; }
      else return null;
    }
    return steps;
  }

  // ---- the lesson on screen -------------------------------------------------------------------------------------

  /**
   * run(ctx, plan, done): draws plan.steps one at a time into ctx.view.
   * ctx: view, esc, toast, save, state (getter), content {course, lex, speech, chars, formOf}, day() -> "YYYY-MM-DD".
   * plan: {steps, pos?, onPos?(pos)}. done({answered, right, fresh}) is called after the last step.
   * Returns {stop()}, which removes the keyboard listener.
   */
  function run(ctx, plan, done) {
    const C = G.JyutCourse, A = G.JyutAudio;
    const K = ctx.content, view = ctx.view, esc = ctx.esc;
    const steps = plan.steps;
    const freshItems = new Set(steps.filter((s) => s.type === "meet").map((s) => s.item));
    let pos = Math.max(0, Math.min(steps.length, Number.isInteger(plan.pos) ? plan.pos : 0));
    let keyOff = null, token = 0, lastNext = 0, stopped = false;
    const tally = { answered: 0, right: 0, fresh: freshItems.size };

    const clearKeys = () => { if (keyOff) { keyOff(); keyOff = null; } };
    const setKeys = (fn) => {
      clearKeys();
      document.addEventListener("keydown", fn);
      keyOff = () => document.removeEventListener("keydown", fn);
    };
    const typing = (e) => !!(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    const plainKey = (e) => !(e.ctrlKey || e.metaKey || e.altKey);

    const shell = (inner) => { view.innerHTML = `<section class="stack today wordlesson">${inner}</section>`; };
    const head = (step) => `<p class="soft small">${esc(stepLabel(step, step.type !== "meet" && step.type !== "sentence" && freshItems.has(step.item)))} &middot; ${pos + 1} of ${steps.length}</p>`;
    const nextLabel = () => (pos >= steps.length - 1 ? "Finish" : "Next");
    const credit = (ex, id) => {
      const parts = creditParts(ex, id, K.formOf);
      if (!parts.length) return "";
      return `<p class="credit soft small">${parts.map((p) => (p.href ? `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.t)}</a>` : esc(p.t))).join("")}</p>`;
    };
    const playBtn = (id, label, slow) => `<button type="button" class="btn small-btn playbtn" data-play="${esc(id)}"${slow ? ' data-slow="1"' : ""}>&#9654; ${esc(label)}</button>`;
    const audioMsg = `<p class="soft small audiomsg" id="audiomsg" role="status" aria-live="polite"></p>`;

    const noAudio = (id) => { try { return K.speech.source(id, { voice: ctx.state.voice }).kind === "none"; } catch (e) { return true; } };

    /** Plays from the tap itself so audio unlocks on the gesture. */
    function playIt(id, slow) {
      const my = token, msg = () => (my === token ? document.getElementById("audiomsg") : null);
      const say = (t) => { const m = msg(); if (m) m.textContent = t; };
      const o = { slow: !!slow, voice: ctx.state.voice };
      let src;
      try { src = K.speech.source(id, o); } catch (e) { src = { kind: "none" }; }
      if (src.kind === "none") { say("No audio for this yet"); return; }
      say(slow && src.slow === false ? "Slow version not available yet" : "");
      Promise.resolve(K.speech.play(id, o)).then((r) => {
        if (r === "failed" || r === "blocked") say(A.afterPlay(r).message);
      }, () => say("This sound would not play"));
    }
    function wirePlay(scope) {
      (scope || view).querySelectorAll("[data-play]").forEach((b) => {
        if (b.dataset.wired) return;
        b.dataset.wired = "1";
        b.addEventListener("click", () => playIt(b.dataset.play, !!b.dataset.slow));
      });
    }

    function next() {
      const t = Date.now();
      if (t - lastNext < 300) return;
      lastNext = t;
      pos++;
      if (plan.onPos) plan.onPos(pos);
      go();
      window.scrollTo(0, 0);
    }

    const record = (step, correct) => {
      ctx.state.words = C.record(ctx.state.words, step.item, step.skill, correct, ctx.day());
      tally.answered++; if (correct) tally.right++;
      ctx.save();
    };

    function go() {
      token++;
      clearKeys();
      if (stopped) return;
      const step = steps[pos];
      if (!step) { done({ answered: tally.answered, right: tally.right, fresh: tally.fresh }); return; }
      if (step.type === "meet") return meet(step);
      if (step.type === "sentence") return sentence(step);
      return question(step);
    }

    // The primary button is focused (Enter and Space use it natively). Nothing else listens for those keys.
    function focusPrimary(id) { const b = document.getElementById(id); if (b) b.focus(); }

    function exampleBlock(ex, id) {
      return `<div class="example"><p class="zh ex-text">${esc(ex.text)}</p><p class="soft ex-jp">${esc(ex.jp)}</p>${ex.en ? `<p class="ex-en">${esc(clean(ex.en))}</p>` : ""}${credit(ex, id)}</div>`;
    }

    // ---- meet
    function meet(step) {
      if (step.grammar) {
        const exs = (step.examples || []).map((ex) => `<li>${exampleBlock(ex, ex.id)}<div class="row">${playBtn(ex.id, "Play")}</div></li>`).join("");
        shell(`${head(step)}<h1>${esc(clean(step.title))}</h1><p>${esc(clean(step.explain))}</p>
          ${exs ? `<h2>Heard in real sentences</h2><ul class="examples">${exs}</ul>` : ""}${audioMsg}
          <div class="row"><button type="button" class="btn primary" id="go">${nextLabel() === "Finish" ? "Finish" : "Got it"}</button></div>`);
      } else {
        const changed = step.changed ? changedNote(step.form, step.jp, K.chars) : "";
        shell(`${head(step)}<p class="hanzi zh" lang="zh-HK">${esc(step.form)}</p><p class="jp big">${esc(step.jp)}</p><p class="meaning">${esc(clean(step.en))}</p>
          <div class="row">${playBtn(step.form, "Play")}${playBtn(step.form, "Slower", true)}</div>${audioMsg}
          ${step.note ? `<p class="hint">${esc(clean(step.note))}</p>` : ""}${changed ? `<p class="hint changed">${esc(changed)}</p>` : ""}
          <div class="row"><button type="button" class="btn primary" id="go">${nextLabel() === "Finish" ? "Finish" : "Got it"}</button></div>`);
      }
      wirePlay();
      if (step.markSeen) { ctx.state.words = C.markSeen(ctx.state.words, step.item, ctx.day()); ctx.save(); }
      const g = document.getElementById("go"); g.onclick = next; g.focus();
      setKeys((e) => {
        if (!plainKey(e) || typing(e) || e.target !== document.body) return;
        if (e.key === " ") { const p = view.querySelector("[data-play]"); if (p) { e.preventDefault(); p.click(); } }
        else if (e.key === "Enter") { e.preventDefault(); next(); }
      });
    }

    // ---- hear, read, type
    function question(step) {
      let locked = false;
      const my = pos;
      const hearId = step.type === "hear" ? (isGrammar(step.item) ? step.prompt.id : step.item) : step.type === "type" ? step.item : null;
      const showOptions = (opts, label, big) => `<div class="options" role="group" aria-label="${esc(label)}">${opts.map((o, i) =>
        `<button type="button" class="btn opt${big ? " optform zh" : ""}" data-i="${i}"><span class="num">${i + 1}</span> ${esc(clean(o))}</button>`).join("")}</div>
        <p class="soft small">Press 1 to ${opts.length} to answer, Space to hear it again.</p>`;
      const finish = (html) => {
        const fb = document.getElementById("fb");
        fb.innerHTML = html + `<div class="row"><button type="button" class="btn primary" id="next">${nextLabel()}</button></div>`;
        document.getElementById("next").onclick = next;
        fb.tabIndex = -1; fb.focus(); // Space then replays and Enter goes on
      };
      const reveal = () => {
        if (step.type === "hear" && isGrammar(step.item)) {
          const ex = K.lex.example(step.prompt.id);
          return ex ? exampleBlock(ex, step.prompt.id) : "";
        }
        const inf = C.info(K.course, K.lex, step.item);
        return inf ? `<p><span class="zh">${esc(inf.form)}</span> <span class="soft">${esc(inf.jp)}</span> ${esc(clean(inf.en))}</p>` : "";
      };
      const lockOptions = (chosen, right) => {
        view.querySelectorAll("button.opt").forEach((b, i) => {
          b.disabled = true;
          const v = step.options[i];
          if (v === right) b.classList.add("right"); else if (i === chosen) b.classList.add("wrong");
        });
      };

      if (step.type === "type") {
        shell(`${head(step)}<h2>Type the Jyutping</h2><p class="meaning big">${esc(clean(step.prompt.en))}</p>
          <div class="row">${playBtn(step.item, "Play")}${playBtn(step.item, "Slower", true)}</div>${audioMsg}
          <form class="row" id="typed"><label class="soft small" for="ans">Jyutping with tone numbers, such as nei5 hou2</label>
          <input id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" style="font:inherit;padding:6px 8px;max-width:14em"><button class="btn primary" type="submit">Check</button></form>
          <div id="opts"></div><div id="fb" class="fb" aria-live="polite"></div>`);
      } else if (step.type === "hear") {
        const none = noAudio(hearId);
        shell(`${head(step)}<h2>${isGrammar(step.item) ? "What does this sentence mean?" : "What does this mean?"}</h2>
          <div class="row">${playBtn(hearId, "Play")}${playBtn(hearId, "Slower", true)}</div>${audioMsg}
          ${none ? `<p class="hint">No audio for this yet.</p><div class="row"><button type="button" class="btn quiet" id="skip">Skip this one</button></div>` : showOptions(step.options, "Meanings")}
          <div id="fb" class="fb" aria-live="polite"></div>`);
        if (none) { document.getElementById("skip").onclick = next; focusPrimary("skip"); }
      } else {
        shell(`${head(step)}<h2>What does this mean?</h2><p class="hanzi zh" lang="zh-HK">${esc(step.prompt.text)}</p>
          ${showOptions(step.options, "Meanings")}<div id="fb" class="fb" aria-live="polite"></div>`);
      }
      wirePlay();

      const onPick = (i) => {
        if (locked || my !== pos) return;
        locked = true;
        const given = step.options[i], right = given === step.answer;
        record(step, right);
        lockOptions(i, step.answer);
        finish(`<p class="${right ? "ok" : "hint"}">${esc(feedbackFor(step, given, step.answer))}</p>${reveal()}`);
      };

      if (step.type === "type") {
        let stage = "typing", typedOk = false;
        const form = document.getElementById("typed"), inp = document.getElementById("ans");
        inp.focus();
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          if (stage !== "typing") return;
          const val = inp.value;
          if (!val.trim()) { document.getElementById("fb").innerHTML = `<p class="hint">Type the Jyutping with tone numbers, such as ${esc(step.answer)}.</p>`; return; }
          stage = "pick";
          typedOk = C.checkTyped(step, val);
          inp.disabled = true; form.querySelector("button").disabled = true;
          document.getElementById("fb").innerHTML = typedOk
            ? `<p class="ok">Yes: ${esc(step.answer)}</p>`
            : `<p class="hint">${esc(feedbackFor(step, val, step.answer))}. It is ${esc(step.answer)}.</p>`;
          const o = document.getElementById("opts");
          o.innerHTML = `<h2>Which characters?</h2>` + showOptions(step.options, "Characters", true);
          o.querySelectorAll("button.opt").forEach((b) => b.addEventListener("click", () => pickForm(Number(b.dataset.i))));
          const p = view.querySelector("[data-play]"); if (p) p.focus();
        });
        const pickForm = (i) => {
          if (stage !== "pick" || my !== pos) return;
          stage = "done";
          const formOk = step.options[i] === step.answerForm;
          record(step, typedOk && formOk);
          lockOptions(i, step.answerForm);
          const fb = document.getElementById("fb");
          fb.insertAdjacentHTML("beforeend", `<p class="${formOk ? "ok" : "hint"}">${formOk ? "Right characters." : "The characters are " + esc(step.answerForm) + "."}</p>`);
          const nb = document.createElement("div");
          nb.className = "row"; nb.innerHTML = `<button type="button" class="btn primary" id="next">${nextLabel()}</button>`;
          fb.appendChild(nb);
          document.getElementById("next").onclick = next;
          fb.tabIndex = -1; fb.focus();
        };
        setKeys((e) => {
          if (!plainKey(e) || typing(e)) return;
          if (stage === "pick" && /^[1-9]$/.test(e.key) && Number(e.key) <= step.options.length) { e.preventDefault(); pickForm(Number(e.key) - 1); }
          else if (e.key === " " && (!e.target || e.target === document.body || e.target.id === "fb")) { const p = view.querySelector("[data-play]"); if (p) { e.preventDefault(); p.click(); } }
          else if (e.key === "Enter" && stage === "done" && (e.target === document.body || e.target.id === "fb")) { e.preventDefault(); next(); }
        });
        return;
      }

      view.querySelectorAll("button.opt").forEach((b) => b.addEventListener("click", () => onPick(Number(b.dataset.i))));
      const first = view.querySelector("[data-play]"); if (first) first.focus();
      setKeys((e) => {
        if (!plainKey(e) || typing(e)) return;
        if (!locked && /^[1-9]$/.test(e.key) && Number(e.key) <= step.options.length && !document.getElementById("skip")) { e.preventDefault(); onPick(Number(e.key) - 1); }
        else if (e.key === " " && (e.target === document.body || e.target.id === "fb")) { const p = view.querySelector("[data-play]"); if (p) { e.preventDefault(); p.click(); } }
        else if (e.key === "Enter" && locked && (e.target === document.body || e.target.id === "fb")) { e.preventDefault(); next(); }
      });
    }

    // ---- the closing sentence: hear it, then the characters and Jyutping, then the English, then the credit
    function sentence(step) {
      const ex = K.lex.example(step.id);
      if (!ex) { next(); return; }
      const none = noAudio(step.id);
      shell(`${head(step)}<h1>One more sentence</h1><p class="soft">Listen first, then look.</p>
        <div class="row">${playBtn(step.id, "Play")}${playBtn(step.id, "Slower", true)}</div>${audioMsg}
        ${none ? `<p class="hint">No audio for this yet.</p>` : ""}
        <div id="reveal" class="reveal" aria-live="polite"></div>
        <div class="row"><button type="button" class="btn primary" id="more">Show the characters and Jyutping</button></div>`);
      wirePlay();
      let stage = 0;
      const more = document.getElementById("more"), r = document.getElementById("reveal");
      const advance = () => {
        if (stage === 0) {
          r.innerHTML = `<p class="zh ex-text big" lang="zh-HK">${esc(ex.text)}</p><p class="soft ex-jp">${esc(ex.jp)}</p>`;
          more.textContent = ex.en ? "Show the English" : nextLabel();
          stage = ex.en ? 1 : 2;
          if (!ex.en) r.insertAdjacentHTML("beforeend", credit(ex, step.id));
        } else if (stage === 1) {
          r.insertAdjacentHTML("beforeend", `<p class="ex-en">${esc(clean(ex.en))}</p>${credit(ex, step.id)}`);
          more.textContent = nextLabel(); stage = 2;
        } else next();
      };
      more.onclick = advance;
      const p = view.querySelector("[data-play]"); if (p) p.focus();
      setKeys((e) => {
        if (!plainKey(e) || typing(e) || e.target !== document.body) return;
        if (e.key === " ") { if (p) { e.preventDefault(); p.click(); } }
        else if (e.key === "Enter") { e.preventDefault(); advance(); }
      });
    }

    go();
    return { stop() { stopped = true; token++; clearKeys(); } };
  }

  return { run, stepLabel, feedbackFor, changedNote, creditParts, usableSteps, clean };
});
