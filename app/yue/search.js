/* Search 搵 and word pages. Screens: search, word (#word/<encoded form>). Registers on window.JyutScreens. */
(function () {
  "use strict";
  window.JyutScreens = window.JyutScreens || {};
  const wordHref = (f) => "#word/" + encodeURIComponent(f);
  const SOURCE = { agree: "reading: all sources agree", corpus: "reading: from speech corpus", attested: "reading: how it is said in the speech corpus and words.hk examples", wordshk: "reading: words.hk", override: "reading: hand-checked" };
  const SKILLS = [["h", "Hearing"], ["r", "Reading"], ["t", "Typing"]];
  let lastQuery = "";

  const noData = (ctx, title) => { ctx.view.innerHTML = `<section class="stack"><h1>${title}</h1><p class="soft">The word data did not load, so this screen is not ready. Reload when you are online.</p></section>`; };

  function search(ctx) {
    const esc = ctx.esc, view = ctx.view, K = ctx.content;
    if (!K) return noData(ctx, "Search 搵");
    view.innerHTML = `<section class="stack searchscreen">
      <h1>Search 搵</h1>
      <label class="small soft" for="q">Characters, Jyutping (ngo dei) or English</label>
      <input id="q" type="search" value="${esc(lastQuery)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <ul id="results" class="results" aria-live="polite"></ul></section>`;
    const q = view.querySelector("#q"), box = view.querySelector("#results");
    function paint() {
      lastQuery = q.value;
      const res = K.lex.search(q.value);
      box.innerHTML = res.length ? res.map((r) => `<li><a class="result" href="${wordHref(r.form)}"><span class="zh big">${esc(r.form)}</span> <span class="jp">${esc(r.jp)}</span> <span class="soft">${esc(r.en)}</span></a></li>`).join("")
        : q.value.trim() ? `<li class="soft">Nothing found. Try characters, Jyutping with or without tones, or English.</li>` : "";
    }
    q.addEventListener("input", paint);
    paint();
    q.focus();
  }

  function word(ctx, hash) {
    const esc = ctx.esc, view = ctx.view, K = ctx.content;
    if (!K) return noData(ctx, "Word");
    let form = "";
    try { form = decodeURIComponent(String(hash || "").split("/").slice(1).join("/")); } catch (e) { form = ""; }
    const W = window.JyutWordLesson;
    const w = K.lex.word(form);
    const charRead = K.chars && Object.prototype.hasOwnProperty.call(K.chars, form) ? K.chars[form] : null;
    const back = `<p><a href="#search">&larr; Search</a></p>`;
    if (!w) {
      const jp = Array.isArray(charRead) ? charRead[0] : charRead;
      view.innerHTML = `<section class="stack wordpage">${back}<h1 class="zh hanzi" lang="zh-HK">${esc(form)}</h1>${jp ? `<p class="jp">${esc(jp)}</p>` : ""}<p class="soft">Not in the app yet.</p></section>`;
      return;
    }
    const whkLink = "https://words.hk/zidin/" + encodeURIComponent(form);
    const def = w.wordshk && w.wordshk.def ? W.clean(w.wordshk.def) : "";
    const note = w.changed ? W.changedNote(form, w.jp, K.chars) : "";
    const grammar = Object.values((K.course && K.course.grammar) || {}).filter((g) => {
      const c = String(g.cite || "").split(":")[0];
      return c === form || (g.needs && g.needs[0] === form) || g.pattern === form;
    });
    const ids = K.lex.examplesFor(form, 3);
    const entry = (ctx.state.words && ctx.state.words[form]) || {};
    const mem = SKILLS.map(([k, label]) => `<li>${label}: ${Array.isArray(entry[k]) ? `box ${esc(entry[k][0])}, next review ${esc(entry[k][1])}` : "not practised yet"}</li>`).join("");
    const play = (id, label, slow) => `<button type="button" class="btn small-btn playbtn" data-play="${esc(id)}"${slow ? ' data-slow="1"' : ""}>&#9654; ${label}</button>`;
    const credit = (ex, id) => {
      const parts = W.creditParts(ex, id, K.formOf);
      return parts.length ? `<p class="credit soft small">${parts.map((p) => (p.href ? `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.t)}</a>` : esc(p.t))).join("")}</p>` : "";
    };
    const exHtml = ids.map((id) => {
      const ex = K.lex.example(id);
      return ex ? `<li class="example"><p class="zh ex-text" lang="zh-HK">${esc(ex.text)}</p><p class="soft ex-jp">${esc(ex.jp)}</p>${ex.en ? `<p class="ex-en">${esc(W.clean(ex.en))}</p>` : ""}<div class="row">${play(id, "Play")}${play(id, "Slower", true)}</div>${credit(ex, id)}</li>` : "";
    }).join("");
    view.innerHTML = `<section class="stack wordpage">${back}
      <h1 class="zh hanzi" lang="zh-HK">${esc(form)}</h1>
      <p class="jp">${esc(w.jp)}</p>
      ${w.alts.length ? `<p class="soft small">Other reading${w.alts.length > 1 ? "s" : ""}: ${w.alts.map((a) => esc(a) + (w.labels && w.labels[a] ? ` (${esc(w.labels[a])})` : "")).join(", ")}</p>` : ""}
      <div class="row">${play(form, "Play")}</div><p class="soft small audiomsg" id="audiomsg" role="status" aria-live="polite"></p>
      ${w.unchecked ? `<p class="hint small">Not yet confirmed by a source.</p>` : ""}
      ${w.en ? `<p class="meaning">${esc(W.clean(w.en))}</p>` : ""}
      ${w.whkEn && w.whkEn !== w.en ? `<p class="meaning soft">words.hk: ${esc(W.clean(w.whkEn))}</p>` : ""}
      ${def ? `<p lang="zh-HK">${esc(def)} <a class="small" href="${esc(whkLink)}" target="_blank" rel="noopener">words.hk</a></p>` : ""}
      ${note ? `<p class="hint small">${esc(note)}</p>` : ""}
      ${exHtml ? `<h2>Examples</h2><ul class="examples">${exHtml}</ul>` : ""}
      ${grammar.length ? `<h2>Grammar</h2>${grammar.map((g) => `<div class="card"><h3>${esc(g.title)}</h3><p>${esc(g.explain)}</p></div>`).join("")}` : ""}
      <h2>Your memory</h2><ul class="mem">${mem}</ul>
      ${SOURCE[w.status] ? `<p class="soft small">${SOURCE[w.status]}</p>` : ""}
    </section>`;
    const say = (t) => { const m = document.getElementById("audiomsg"); if (m) m.textContent = t; };
    view.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.play, o = { slow: !!b.dataset.slow, voice: ctx.state.voice };
      let src;
      try { src = K.speech.source(id, o); } catch (e) { src = { kind: "none" }; }
      if (src.kind === "none") { say("No audio for this yet"); return; }
      say(o.slow && src.slow === false ? "Slow version not available yet" : "");
      Promise.resolve(K.speech.play(id, o)).then((r) => { if (r === "failed" || r === "blocked") say(window.JyutAudio.afterPlay(r).message); }, () => say("This sound would not play"));
    }));
  }
  window.JyutScreens.search = search;
  window.JyutScreens.word = word;
})();
