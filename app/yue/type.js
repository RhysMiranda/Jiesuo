/* Type screen (打): practise typing Jyutping the way an input method works, plus a keyboard setup guide.
   Candidates come from JyutLex (numbered 1-9). Space picks the first; a digit picks that candidate unless it is
   a tone (a digit straight after letters is a tone). Free mode is not graded. Registers on window.JyutScreens. */
(function () {
  "use strict";
  window.JyutScreens = window.JyutScreens || {};

  let mode = "practise"; // survives a redraw within the page
  let keyboards; // undefined = not asked, null = failed, else the parsed file

  function render(ctx) {
    const esc = ctx.esc, view = ctx.view, K = ctx.content;
    const C = window.JyutCourse;
    const lex = K && K.lex;
    if (!lex) {
      view.innerHTML = `<section class="stack"><h1>Type 打</h1><p class="soft">The word data did not load, so typing practice is not available. Reload when you are online.</p></section>`;
      return;
    }
    const day = () => ctx.journey.dayKey();
    // met words: the ones you have heard or read (an h or r entry), never grammar items
    const met = () => Object.keys(ctx.state.words || {}).filter((it) => !it.startsWith("g:") && ctx.state.words[it] && (ctx.state.words[it].h || ctx.state.words[it].r) && C.info(K.course, lex, it));
    let target = null, tried = false, done = false, shown = false, missed = false;
    let field = "", picked = []; // picked: [{form, jp}]
    let cands = [];

    const pickTarget = () => {
      const all = met();
      const pool = all.length > 1 ? all.filter((x) => x !== target) : all;
      target = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      field = ""; picked = []; tried = false; done = false; shown = false; missed = false;
    };
    pickTarget();

    function play(item) {
      try { Promise.resolve(K.speech.play(item, { voice: ctx.state.voice })).catch(() => {}); } catch (e) { /* silent */ }
    }

    function setField(v) {
      field = v;
      cands = field ? lex.candidates(field, 9, { ime: true }) : [];
    }

    function pick(i) {
      const c = cands[i];
      if (!c) return;
      const r = lex.consume(field, c.form);
      picked.push(c);
      setField(r ? r.rest : "");
      tried = false;
      paint();
    }

    function check() {
      if (!target || done || !picked.length) return;
      const got = picked.map((p) => p.form).join("");
      if (got === target) {
        done = true;
        if (!shown && !missed) { ctx.state.words = C.record(ctx.state.words, target, "t", true, day()); ctx.save(); } // a peeked answer does not count
        play(target);
      } else {
        tried = true;
        if (mode === "practise" && !shown && !missed) { // one result per word: the first wrong answer counts as a miss
          missed = true;
          ctx.state.words = C.record(ctx.state.words, target, "t", false, day());
          ctx.save();
        }
      }
      paint();
    }

    function wrongNote() {
      const info = C.info(K.course, lex, target);
      const sc = window.JyutLex.scoreTyping(info.jp, picked.map((p) => p.jp).join(" "));
      if (sc.wrongSyls.length) return "Not quite. Some of the sounds are different from the word you were asked for.";
      if (sc.wrongTones.length) return "Close: the sounds are right but a tone is different (" + sc.wrongTones.map((i) => "syllable " + (i + 1)).join(", ") + ").";
      return "Not quite: those characters are not the word you were asked for. Try another candidate.";
    }

    function candList() {
      return cands.length
        ? cands.map((c, i) => `<button type="button" class="btn opt cand" data-i="${i}"><span class="num">${i + 1}</span><span class="zh">${esc(c.form)}</span><span class="soft small">${esc(c.jp)}</span></button>`).join("")
        : field ? `<p class="soft small">No match. Check the spelling; tones are the numbers 1 to 6.</p>` : "";
    }

    function paint() {
      const info = target ? C.info(K.course, lex, target) : null;
      const candHtml = candList();
      const out = picked.map((p) => p.form).join("");
      const practise = mode === "practise";
      let top;
      if (!practise) {
        top = `<p class="soft">Type any Jyutping, for example <b>neihou</b>, and see the words it gives. Nothing here is marked.</p>`;
      } else if (!info) {
        top = `<p class="soft">Practice uses words you have met in Today. Do a words lesson first, or try Free typing.</p>`;
      } else {
        top = `<div class="card"><p class="small soft">Type this word</p>
          <p class="big">${esc(info.en)}</p>
          <div class="row"><button type="button" class="btn" id="hear">Hear it</button>
          <button type="button" class="btn" id="reveal">${shown ? "Hide" : "Show"} the answer</button></div>
          ${shown ? `<p><span class="zh">${esc(info.form)}</span> <span class="soft">${esc(info.jp)}</span></p>` : ""}</div>`;
      }
      const result = !practise || !info ? "" : done
        ? `<p class="done-mark" role="status">Right: <span class="zh">${esc(info.form)}</span> <span class="soft">${esc(info.jp)}</span></p><div class="row"><button type="button" class="btn primary" id="next">Next word</button></div>`
        : tried ? `<p class="warn" role="status">${esc(wrongNote())}</p>` : "";
      const ready = !(practise && !info);
      view.innerHTML = `
      <section class="stack typescreen">
        <h1>Type 打</h1>
        <div class="row" role="group" aria-label="Mode">
          <button type="button" class="btn${practise ? " primary" : ""}" data-mode="practise" aria-pressed="${practise}">Practise</button>
          <button type="button" class="btn${practise ? "" : " primary"}" data-mode="free" aria-pressed="${!practise}">Free typing</button>
        </div>
        ${top}
        ${ready ? `<label class="small soft" for="ime">Jyutping</label>
        <input id="ime" type="text" value="${esc(field)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" lang="en" aria-describedby="imehelp">
        <p id="imehelp" class="small soft">Space picks the first word. A number picks that word, except straight after letters, where it is a tone (nei5).</p>
        <div class="cands" role="listbox" aria-label="Candidates">${candHtml}</div>
        <p class="outline" aria-label="Your text"><span class="zh big">${esc(out) || "&nbsp;"}</span></p>
        <div class="row">
          ${practise && info && !done ? `<button type="button" class="btn primary" id="check"${out ? "" : " disabled"}>Check</button>` : ""}
          <button type="button" class="btn" id="clear">Clear</button>
        </div>` : ""}
        ${result}
        <div id="setup"></div>
      </section>`;
      wire();
      drawSetup();
    }

    function wire() {
      view.querySelectorAll("[data-mode]").forEach((b) => { b.onclick = () => { mode = b.dataset.mode; pickTarget(); setField(""); paint(); }; });
      view.querySelectorAll(".cand").forEach((b) => { b.onclick = () => { pick(Number(b.dataset.i)); refocus(); }; });
      const $ = (id) => view.querySelector("#" + id);
      if ($("hear")) $("hear").onclick = () => play(target);
      if ($("reveal")) $("reveal").onclick = () => { shown = !shown; paint(); };
      if ($("next")) $("next").onclick = () => { pickTarget(); setField(""); paint(); };
      if ($("check")) $("check").onclick = check;
      if ($("clear")) $("clear").onclick = () => { field = ""; picked = []; tried = false; setField(""); paint(); const f = view.querySelector("#ime"); if (f) f.focus(); };
      const f = $("ime");
      if (!f) return;
      f.oninput = () => {
        setField(f.value);
        const box = view.querySelector(".cands");
        box.innerHTML = candList();
        box.querySelectorAll(".cand").forEach((b) => { b.onclick = () => { pick(Number(b.dataset.i)); refocus(); }; });
      };
      f.onkeydown = (e) => {
        if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
        const afterLetter = /[a-z]$/i.test(f.value);
        if (e.key === " ") {
          e.preventDefault();
          if (cands.length) { pick(0); refocus(); }
        } else if (/^[1-9]$/.test(e.key) && !afterLetter && cands.length) {
          e.preventDefault();
          if (Number(e.key) <= cands.length) { pick(Number(e.key) - 1); refocus(); }
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (cands.length) { pick(0); refocus(); } else if (mode === "practise") check();
        } else if (e.key === "Backspace" && !f.value && picked.length) {
          picked.pop(); tried = false; paint(); refocus();
        }
      };
    }
    function refocus() { const f = view.querySelector("#ime"); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }

    // ---- setup guide
    function drawSetup() {
      const box = view.querySelector("#setup");
      if (!box) return;
      const draw = (kb) => {
        if (!kb || !Array.isArray(kb.items) || !kb.items.length) {
          box.innerHTML = `<h2>Set up a Jyutping keyboard</h2><p class="soft">The setup guide did not load. Reload when you are online.</p>`;
          return;
        }
        box.innerHTML = `<h2>Set up a Jyutping keyboard</h2>
          <p class="soft small">Type Jyutping on your own device. Each guide below follows the page linked under it.</p>
          ${kb.items.map((it) => `<div class="card kbd"><p class="small soft">${esc(it.platform)}</p><h3>${esc(it.name)}</h3>
            <ol>${(it.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
            <p class="small"><a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.url)}</a>
            ${(it.sources || []).filter((s) => s.url !== it.url).map((s) => ` · <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.url.replace(/^https:\/\//, ""))}</a>`).join("")}
            <span class="soft"> · checked ${esc(it.checked || "")}</span></p></div>`).join("")}`;
      };
      if (keyboards !== undefined) { draw(keyboards); return; }
      box.innerHTML = `<h2>Set up a Jyutping keyboard</h2><p class="soft">Loading…</p>`;
      fetch("data/keyboards.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((j) => { keyboards = j; }, () => { keyboards = null; })
        .then(() => { if (view.querySelector("#setup") === box) draw(keyboards); });
    }

    paint();
  }

  window.JyutScreens.type = render;
})();
