/* Map 圖: the course order in bands of 50, one cell per item, coloured new / learning / strong.
   Screen: map (#map). Registers on window.JyutScreens. Tapping a cell opens its word page; grammar items carry a 文 mark. */
(function () {
  "use strict";
  window.JyutScreens = window.JyutScreens || {};
  const STATE_LABEL = { new: "new", learning: "learning", strong: "strong" };

  function map(ctx) {
    const esc = ctx.esc, view = ctx.view, K = ctx.content;
    if (!K) { view.innerHTML = `<section class="stack"><h1>Map 圖</h1><p class="soft">The word data did not load, so the map is not ready. Reload when you are online.</p><p><a href="#progress">&larr; Progress</a></p></section>`; return; }
    const lib = window.JyutCourse.library(K.course, ctx.state.words, ctx.journey.dayKey());
    const grammar = K.course.grammar || {};
    const cell = (c) => {
      const isG = c.grammar;
      const g = isG ? grammar[c.item.slice(2)] : null;
      const form = isG ? (g && String(g.cite || "").split(":")[0]) || "" : c.item;
      const label = isG ? (g ? g.title : c.item) : c.item;
      const cls = `mapcell ${c.state}${c.due ? " due" : ""}${isG ? " gram" : ""}`;
      const text = isG ? `<span class="gmark" aria-hidden="true">文</span>` : `<span class="zh">${esc(c.item)}</span>`;
      const title = `${label}: ${STATE_LABEL[c.state]}${c.due ? ", due today" : ""}`;
      return form ? `<a class="${cls}" href="#word/${encodeURIComponent(form)}" title="${esc(title)}" aria-label="${esc(title)}">${text}</a>`
        : `<span class="${cls}" title="${esc(title)}" role="img" aria-label="${esc(title)}">${text}</span>`;
    };
    const bands = lib.bands.map((b) => `<section class="mapband"><h2>${b.from}&ndash;${b.to} <span class="soft small">${b.learned} of ${b.to - b.from + 1} started${b.due ? `, ${b.due} due` : ""}</span></h2><div class="mapgrid">${b.cells.map(cell).join("")}</div></section>`).join("");
    view.innerHTML = `<section class="stack mapscreen">
      <p><a href="#progress">&larr; Progress</a></p>
      <h1>Map 圖</h1>
      <p class="soft small">Every word and grammar point in the order the course teaches it. <span class="legend"><i class="mapcell new"></i> new <i class="mapcell learning"></i> learning <i class="mapcell strong"></i> strong (box 4 or more in hearing, reading and typing) <i class="mapcell new gram"><span class="gmark">文</span></i> grammar. A dot marks what is due today.</span></p>
      ${bands || `<p class="soft">Nothing in the course yet.</p>`}
    </section>`;
  }
  window.JyutScreens.map = map;
})();
