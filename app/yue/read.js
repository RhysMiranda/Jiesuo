/* Read 讀: paste Cantonese, see each word over its Jyutping, tap one for its word page. Registers on window.JyutScreens. */
(function () {
  "use strict";
  window.JyutScreens = window.JyutScreens || {};
  const KEY = "jiesuo-yue-read";
  const wordHref = (f) => "#word/" + encodeURIComponent(f);

  function render(ctx) {
    const esc = ctx.esc, view = ctx.view, K = ctx.content;
    if (!K) { view.innerHTML = `<section class="stack"><h1>Read 讀</h1><p class="soft">The word data did not load, so this screen is not ready. Reload when you are online.</p></section>`; return; }
    let text = "";
    try { text = localStorage.getItem(KEY) || ""; } catch (e) { text = ""; }
    view.innerHTML = `<section class="stack readscreen">
      <h1>Read 讀</h1>
      <label class="small soft" for="read-in">Paste some Cantonese text</label>
      <textarea id="read-in" lang="zh-HK" rows="4" spellcheck="false" placeholder="你食咗飯未呀？">${esc(text)}</textarea>
      <p id="read-sum" role="status"></p>
      <div id="read-out" class="readout" lang="zh-HK"></div>
    </section>`;
    const input = view.querySelector("#read-in"), sum = view.querySelector("#read-sum"), out = view.querySelector("#read-out");
    function paint() {
      const segs = K.lex.segment(input.value), rep = K.lex.readReport(segs, ctx.state.words);
      const links = rep.learnNext.map((f) => `<a class="zh" href="${wordHref(f)}">${esc(f)}</a>`).join(", ");
      sum.innerHTML = rep.total
        ? `You know ${rep.known} of ${rep.total} words.${links ? " Learn next: " + links + "." : ""}`
        : `<span class="soft">Nothing to read yet.</span>`;
      out.innerHTML = segs.map((s) => {
        if (s.kind !== "han") return `<span class="tok-other">${esc(s.t)}</span>`;
        const known = !!(ctx.state.words && ctx.state.words[s.t]);
        const cls = "tok " + (known ? "known" : "new");
        const body = `<ruby><span class="zh">${esc(s.t)}</span><rt>${s.jp ? esc(s.jp) : '<span class="soft">not in the app yet</span>'}</rt></ruby>`;
        return s.word ? `<a class="${cls}" href="${wordHref(s.t)}">${body}</a>` : `<span class="${cls} nolink">${body}</span>`;
      }).join("");
    }
    input.addEventListener("input", () => { try { localStorage.setItem(KEY, input.value); } catch (e) { /* storage is optional */ } paint(); });
    paint();
  }
  window.JyutScreens.read = render;
})();
