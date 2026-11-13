/* Writing practice and the "see it built" animation. Uses Hanzi Writer (vendor/, MIT) with stroke
   data from strokes/ (Arphic Public Licence) and data/stroke-parts.json (LGPL), loaded on demand. */
(function () {
  "use strict";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const single = (s) => Array.from(s).length === 1;

  const strokeCache = new Map(), unreachable = new Set();
  /** Stroke data for one glyph, or null when there is none (or we are offline and never fetched it). */
  function loadStrokes(ch) {
    if (!strokeCache.has(ch)) {
      const url = `strokes/${ch.codePointAt(0).toString(16)}.json`;
      strokeCache.set(ch, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => {
        unreachable.add(ch);
        strokeCache.delete(ch); // try again when back online
        return null;
      }));
    }
    return strokeCache.get(ch);
  }
  const noStrokesText = (ch) => (unreachable.has(ch)
    ? "Writing practice for this one downloads the first time you're online."
    : "Writing practice isn't available for this one yet.");
  let partsPromise = null, partsLoaded = null;
  function loadStrokeParts() {
    if (!partsPromise) partsPromise = fetch("data/stroke-parts.json").then((r) => (r.ok ? r.json() : { parts: {} })).then((j) => (partsLoaded = j.parts)).catch(() => ({}));
    return partsPromise;
  }
  /** Top-level part names of a glyph in stroke order, if the stroke-parts file has loaded already. */
  const partNames = (ch) => (partsLoaded && partsLoaded[ch] ? partsLoaded[ch].map(([n]) => n).filter(single) : null);

  /** Indices of strokes that belong to parts the learner already knows. */
  async function knownStrokes(ch, isKnown) {
    const parts = (await loadStrokeParts())[ch] || [];
    return parts.filter(([name]) => single(name) && isKnown(name)).flatMap(([, idx]) => idx);
  }

  const PRAISE_CLEAN = ["Perfect strokes.", "Beautifully written.", "Lovely, every stroke in order.", "That's it, exactly right."];
  const PRAISE_DONE = ["Done. It gets easier every time.", "There it is. Your hand is learning it.", "Nicely done.", "Written. Well done."];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  /**
   * One practice square. mode: "watch" | "trace" | "memory".
   * onDone({mistakes}) fires when a trace or memory quiz is finished, or when a watch animation ends.
   */
  async function mountWriter(el, ch, { mode = "watch", isKnown = () => false, size, onDone = () => {}, onMessage = () => {} } = {}) {
    const data = await loadStrokes(ch);
    if (!data || !window.HanziWriter) {
      el.innerHTML = `<p class="soft small">${esc(noStrokesText(ch))}</p>`;
      onMessage("");
      return null;
    }
    const known = await knownStrokes(ch, isKnown);
    el.innerHTML = "";
    const px = size || Math.min(280, Math.round(el.clientWidth || 260));
    const ink = css("--ink"), pen = css("--pen");
    const writer = HanziWriter.create(el, ch, {
      width: px, height: px, padding: Math.round(px * 0.06), renderer: "svg",
      charDataLoader: (c, onLoad) => onLoad({ ...data, radStrokes: known }),
      strokeColor: ink, radicalColor: known.length ? pen : null, outlineColor: css("--grid-faint"),
      highlightColor: pen, drawingColor: pen, drawingWidth: Math.max(14, Math.round(px / 14)),
      showOutline: mode !== "memory", showCharacter: false,
      strokeAnimationSpeed: reduceMotion() ? 3 : 1, delayBetweenStrokes: reduceMotion() ? 50 : 260,
      showHintAfterMisses: 2, highlightOnComplete: true, leniency: 1.2,
    });
    let missesOnStroke = 0;
    const startQuiz = () => {
      missesOnStroke = 0;
      writer.quiz({
        onMistake: (s) => {
          missesOnStroke = s.mistakesOnStroke;
          if (mode === "memory" && s.mistakesOnStroke === 3) writer.showOutline();
          onMessage(s.mistakesOnStroke >= 2 ? "Follow the glowing stroke." : "Not quite. Try that stroke again.");
        },
        onCorrectStroke: () => { if (missesOnStroke) onMessage("That's it. Keep going."); missesOnStroke = 0; },
        onComplete: (sum) => {
          onMessage(sum.totalMistakes === 0 ? pick(PRAISE_CLEAN) : pick(PRAISE_DONE));
          onDone({ mistakes: sum.totalMistakes });
        },
      });
    };
    if (mode === "watch") {
      writer.showOutline();
      writer.animateCharacter({ onComplete: () => onDone({ mistakes: 0 }) });
    } else startQuiz();
    return {
      replay() {
        if (mode === "watch") { writer.hideCharacter(); writer.animateCharacter({ onComplete: () => onDone({ mistakes: 0 }) }); }
        else { if (mode === "memory") writer.hideOutline(); startQuiz(); }
      },
    };
  }

  /**
   * The character appears as its parts sliding together. Parts the learner knows are in pen blue.
   * Returns false when there is no stroke data.
   */
  async function buildAnimation(el, ch, { isKnown = () => false } = {}) {
    const [data, allParts] = await Promise.all([loadStrokes(ch), loadStrokeParts()]);
    if (!data) { el.innerHTML = ""; return false; }
    const parts = allParts[ch] || [];
    const used = new Set(parts.flatMap(([, idx]) => idx));
    const groups = parts.map(([name, idx]) => ({ name, idx, known: single(name) && isKnown(name) }));
    const rest = data.strokes.map((_, k) => k).filter((k) => !used.has(k));
    if (rest.length) groups.push({ name: "", idx: rest, known: false, still: true });
    // Centre of each group from its stroke medians, in Make Me a Hanzi coordinates (y up).
    const centre = (idx) => {
      const pts = idx.flatMap((k) => data.medians[k]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    };
    const [cx, cy] = [512, 388];
    const motion = !reduceMotion() && groups.length > 1;
    const svgGroups = groups.map((g, k) => {
      const [gx, gy] = centre(g.idx);
      const dx = g.still || !motion ? 0 : Math.round((gx - cx) * 0.7), dy = g.still || !motion ? 0 : Math.round((gy - cy) * 0.7);
      const paths = g.idx.map((s) => `<path d="${data.strokes[s]}"/>`).join("");
      return `<g class="bp ${g.known ? "known" : ""}" data-k="${k}" style="transform:translate(${dx}px,${dy}px);opacity:${motion && !g.still ? 0.25 : 1}">${paths}</g>`;
    }).join("");
    const named = groups.filter((g) => g.name && single(g.name));
    const label = named.length > 1
      ? `<p class="built-label zh">${named.map((g) => `<span class="${g.known ? "tok-known" : ""}">${esc(g.name)}</span>`).join(" + ")} → <span>${esc(ch)}</span></p>` : "";
    el.innerHTML = `<div class="built"><svg class="built-svg ge" viewBox="0 0 1024 1024" role="img" aria-label="${esc(ch)} being put together from its parts"><g transform="translate(0,900) scale(1,-1)">${svgGroups}</g></svg>${label}</div>`;
    if (motion) {
      const gs = el.querySelectorAll(".bp");
      requestAnimationFrame(() => requestAnimationFrame(() => gs.forEach((g, k) => {
        g.style.transitionDelay = `${300 + k * 180}ms`;
        g.style.transform = "translate(0px,0px)";
        g.style.opacity = "1";
      })));
    }
    return true;
  }

  /**
   * Watch / Trace / From memory for one or more glyphs (a word goes one character at a time).
   * onDone({mistakes}) fires once every glyph has been written in trace or memory mode.
   */
  function writePanel(el, glyphs, { isKnown = () => false, start = "watch", modes = ["watch", "trace", "memory"], autoTrace = false, onDone = () => {} } = {}) {
    const names = { watch: "Watch", trace: "Trace", memory: "From memory" };
    let mode = start, at = 0, total = 0;
    el.innerHTML = `
      <div class="write">
        ${modes.length > 1 ? `<div class="choice" role="group" aria-label="Writing mode">${modes.map((m) => `<button type="button" data-mode="${m}">${names[m]}</button>`).join("")}</div>` : ""}
        <div class="write-pad-wrap"><div class="write-pad"></div></div>
        <p class="write-msg" role="status" aria-live="polite"></p>
        <div class="row write-actions">
          <button type="button" class="btn quiet" data-again>Again</button>
          ${glyphs.length > 1 ? `<span class="soft small" data-pos></span>` : ""}
        </div>
      </div>`;
    const pad = el.querySelector(".write-pad"), msg = el.querySelector(".write-msg");
    let ctl = null;
    const hint = { watch: "Watch the order of the strokes.", trace: "Trace each stroke over the outline, in order.", memory: "Write it from memory. The outline appears if you need it." };
    async function show() {
      el.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === mode));
      const pos = el.querySelector("[data-pos]");
      if (pos) pos.textContent = `Character ${at + 1} of ${glyphs.length}`;
      msg.textContent = hint[mode];
      ctl = await mountWriter(pad, glyphs[at], {
        mode, isKnown,
        onMessage: (t) => { if (t) msg.textContent = t; },
        onDone: ({ mistakes }) => {
          if (mode === "watch") {
            if (autoTrace && modes.includes("trace")) { msg.textContent = "Your turn."; setTimeout(() => { if (mode === "watch") { mode = "trace"; show(); } }, 900); }
            else if (modes.includes("trace")) msg.innerHTML = `${esc(hint.watch)} <button type="button" class="linkish" data-mode="trace">Now trace it</button>`;
            return;
          }
          total += mistakes;
          if (at < glyphs.length - 1) { at++; setTimeout(show, 900); return; }
          onDone({ mistakes: total });
        },
      });
      if (!ctl) {
        msg.textContent = "";
        el.querySelectorAll(".choice, .write-actions").forEach((x) => (x.hidden = true));
        if (mode !== "watch") onDone({ mistakes: 0, skipped: true });
        else if (autoTrace) onDone({ mistakes: 0, skipped: true });
      }
    }
    el.onclick = (e) => {
      const m = e.target.closest("[data-mode]");
      if (m) { mode = m.dataset.mode; at = 0; total = 0; show(); }
      if (e.target.closest("[data-again]") && ctl) { msg.textContent = hint[mode]; ctl.replay(); }
    };
    show();
  }

  window.JiesuoWriter = { loadStrokes, loadStrokeParts, partNames, mountWriter, buildAnimation, writePanel };
})();
