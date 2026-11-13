/* Jiesuo screens. All logic that can be tested without a browser lives in core.js. */
(async function () {
  "use strict";
  const STORE_KEY = "jiesuo-progress-v1";
  const DRAFT_KEY = "jiesuo-draft-v1";
  const HOME = "today";
  const SAMPLE = "我家离学校不远，所以我每天走路去上课。今天下雨了，虽然我带了雨伞，但是衣服还是湿了。到了学校以后，老师说明天有考试，大家都有点紧张。";
  const view = document.getElementById("view");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("en");

  // Storage may throw (private windows, blocked site data). The app works without it.
  let storageOk = true;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { storageOk = false; return null; } },
    set(k, v) { try { localStorage.setItem(k, v); storageOk = true; } catch (e) { storageOk = false; } },
  };

  async function fetchJson(name) {
    const r = await fetch("data/" + name);
    if (!r.ok) throw new Error(name + " returned " + r.status);
    return r.json();
  }

  let core, order, bands, sentences = null;
  if (window.JiesuoWriter) JiesuoWriter.loadStrokeParts(); // small, and gives "built from" its stroke order
  try {
    const [dict, parts, grammar, ord, hsk, pics] = await Promise.all(["dict.json", "parts.json", "grammar.json", "order.json", "hsk.json"].map(fetchJson)
      .concat(fetchJson("pictures.json").catch(() => ({ pictures: {} }))));
    core = JiesuoCore.createCore({ dict, parts, grammar });
    core.partsData = parts.parts;
    // Word pictures (OpenMoji, CC BY-SA 4.0), keyed by unit.
    core.pictures = new Map();
    for (const it of core.items) { const code = pics.pictures[(it.kind === "w" ? "w:" : "h:") + it.form]; if (code && it.kind !== "p") core.pictures.set(it.i, code); }
    order = ord;
    bands = hsk.bands;
  } catch (e) {
    view.innerHTML = `<p class="warn">The word data did not load (${esc(e.message)}). Serve this folder over http and reload; it cannot open from a file:// address.</p>`;
    return;
  }

  const freshJourney = () => ({ review: new Map(), days: new Set(), milestones: {}, stats: { written: 0, unlocked: 0 }, lesson: null, seen: new Map(), dictations: [] });
  const state = { known: new Set(), tradSeen: new Set(), script: "s", focus: "unlock", ...freshJourney() };
  try {
    const saved = store.get(STORE_KEY);
    if (saved) Object.assign(state, JiesuoCore.deserialise(JSON.parse(saved), core));
  } catch (e) { /* a damaged save starts fresh */ }
  let undo = null;

  function save() {
    state.savedAt = new Date().toISOString();
    store.set(STORE_KEY, JSON.stringify(JiesuoCore.serialise(state, core)));
    document.getElementById("storage-warning").hidden = storageOk;
  }

  function snapshot(label) {
    const before = { known: new Set(state.known), tradSeen: new Set(state.tradSeen) };
    undo = () => { state.known = before.known; state.tradSeen = before.tradSeen; save(); route(); };
    showToast(label);
  }

  let toastTimer;
  function showToast(text) {
    const t = document.getElementById("toast");
    t.innerHTML = `<span>${esc(text)}</span>` + (undo ? `<button type="button" id="undo">Undo</button>` : "");
    t.hidden = false;
    const b = document.getElementById("undo");
    if (b) b.onclick = () => { const u = undo; undo = null; t.hidden = true; u && u(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
  }

  /** Knowing an item implies its prerequisites. Forgetting one also forgets what was built on it. */
  function markKnown(i) {
    const added = core.closure(i, state.known);
    snapshot(added.length > 1 ? `Marked ${disp(i)} and ${added.length - 1} ${added.length === 2 ? "part" : "parts"} as known` : `Marked ${disp(i)} as known`);
    added.forEach((u) => state.known.add(u));
    save();
  }
  /** Learning in a lesson: like markKnown, without the undo toast. Returns what was added. */
  function learn(i) {
    const added = core.closure(i, state.known);
    added.forEach((u) => state.known.add(u));
    save();
    return added;
  }
  function markUnknown(i) {
    snapshot(`Marked ${disp(i)} as not known`);
    const stack = [i];
    while (stack.length) {
      const u = stack.pop();
      if (!state.known.delete(u)) continue;
      core.children[u].forEach((c) => stack.push(c));
    }
    save();
  }

  // Display helpers
  const disp = (i) => { const it = core.get(i); return state.script === "t" && it.hk ? it.hk : it.form; };
  const KIND = { p: "Part", c: "Character", w: "Word", g: "Grammar" };
  const stateClass = (i, fr) => (state.known.has(i) ? "is-known" : fr && fr.has(i) ? "is-frontier" : "");
  function cells(i, size = "", extra = "") {
    const form = Array.from(disp(i));
    return `<a class="word" href="#i${i}" aria-label="${esc(disp(i))}">` + form.map((c) => `<span class="ge ${size} ${extra}"><b>${esc(c)}</b></span>`).join("") + "</a>";
  }
  const chip = (i, cls = "") => {
    const it = core.get(i);
    const label = it.kind === "g" ? esc(it.form) : `<span class="zh">${esc(disp(i))}</span>`;
    return `<a class="chip ${cls}" href="#i${i}">${label}${it.pinyin ? `<span class="soft">${esc(mainReading(it))}</span>` : ""}</a>`;
  };
  const firstReading = (p) => p.split(",")[0];
  /** A word's picture, if it has one. Decorative: the meaning is always written next to it. */
  const picture = (i, cls = "") => (core.pictures.has(i) ? `<img class="pic ${cls}" src="pictures/${core.pictures.get(i)}.svg" alt="" loading="lazy" draggable="false">` : "");

  // ---- Audio: the browser's own Mandarin voice, where one exists. zh-HK voices speak Cantonese, so they are skipped.
  let voice = null;
  function pickVoice() {
    try {
      const vs = speechSynthesis.getVoices();
      const by = (re) => vs.find((v) => re.test((v.lang || "").replace("_", "-")));
      voice = by(/^zh-CN/i) || by(/^cmn/i) || by(/^zh-TW/i) || by(/^zh(?!-HK)/i) || null;
    } catch (e) { voice = null; }
    document.querySelectorAll("[data-say]").forEach((b) => (b.hidden = !voice));
  }
  try {
    if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.addEventListener("voiceschanged", pickVoice); }
  } catch (e) { /* no audio */ }
  const canSpeak = () => !!voice;
  function speak(text) {
    if (!voice) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang; u.rate = 0.8;
      speechSynthesis.speak(u);
    } catch (e) { /* audio is optional */ }
  }
  const SPEAKER = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const sayButton = (text, small = false) => `<button type="button" class="say${small ? " say-s" : ""}" data-say="${esc(text)}" aria-label="Hear ${esc(text)}" title="Hear ${esc(text)}"${voice ? "" : " hidden"}>${SPEAKER}</button>`;
  const backButton = () => `<button type="button" class="back" data-back>‹ Back</button>`;
  view.addEventListener("click", (e) => {
    const say = e.target.closest("[data-say]");
    if (say) speak(say.dataset.say);
    if (e.target.closest("[data-back]")) goBack();
  });
  const glossOf = (it) => it.gloss || (core.partsData[it.form] || {}).d || "";
  const pinyinOf = (it) => it.pinyin || (core.partsData[it.form] || {}).y || "";
  /** The reading most words use (好 -> hǎo), for display wherever one reading is shown. */
  const mainReading = (it) => { const r = it.kind !== "w" && it.i < core.n ? core.readings(it.i) : []; return r.length ? r[0].reading : firstReading(pinyinOf(it)); };
  /**
   * Pinyin with audio that matches it. One reading: the speaker says the item. Several: the main
   * reading's speaker says a word that uses it ("hǎo, as in 最好"), and each other reading is listed
   * with its own example word and speaker, since a voice reading the character alone picks a reading itself.
   */
  function readingBlock(i, big = true) {
    const it = core.get(i);
    const cls = big ? "pinyin-big" : "pinyin";
    const rs = it.kind === "w" ? [] : core.readings(i);
    if (rs.length < 2) return `<span class="say-row"><span class="${cls}">${esc(mainReading(it))}</span>${it.kind !== "p" ? sayButton(it.form) : ""}</span>`;
    const ex = (r) => (r.example === null ? null : core.get(r.example));
    const [main, ...rest] = rs;
    const asIn = ex(main) ? ` <span class="soft small">as in <a class="zh" href="#i${main.example}">${esc(disp(main.example))}</a></span>` : "";
    const alt = (r) => `<span class="reading-alt"><span class="pinyin">${esc(r.reading)}</span>${ex(r) ? ` <a class="zh" href="#i${r.example}">${esc(disp(r.example))}</a>${sayButton(ex(r).form, true)}` : ""}</span>`;
    return `<span class="say-row"><span class="${cls}">${esc(main.reading)}</span>${sayButton(ex(main) ? ex(main).form : it.form)}${asIn}</span>
      <span class="also"><span class="soft small">Also read</span> ${rest.map(alt).join("")}</span>`;
  }

  function perWords(freq) {
    if (!freq) return "";
    const k = 1e6 / freq;
    if (k < 1.5) return "";
    const nice = k < 100 ? Math.round(k) : k < 1000 ? Math.round(k / 10) * 10 : k < 10000 ? Math.round(k / 100) * 100 : Math.round(k / 1000) * 1000;
    return `About 1 in ${fmt(nice)} words you will read.`;
  }

  /** "Why it matters" for an item, from the graph. */
  function why(i) {
    const it = core.get(i);
    const kids = core.children[i];
    const chars = kids.filter((c) => c < core.n && core.get(c).kind !== "w");
    const words = kids.filter((c) => c < core.n && core.get(c).kind === "w");
    const grammar = kids.filter((c) => c >= core.n);
    const bits = [];
    if (it.kind === "g") {
      return `Seen in ${fmt(it.count)} example ${it.count === 1 ? "sentence" : "sentences"}. HSK ${it.level}, by our estimate.`;
    }
    const unlocks = [];
    if (words.length) unlocks.push(`${fmt(words.length)} ${words.length === 1 ? "word" : "words"}`);
    if (chars.length) unlocks.push(`${fmt(chars.length)} ${chars.length === 1 ? "character" : "characters"}`);
    if (unlocks.length) bits.push(`Unlocks ${unlocks.join(" and ")}.`);
    const f = perWords(it.freq);
    if (f) bits.push(f);
    if (grammar.length) bits.push(`Needed for ${grammar.length} grammar ${grammar.length === 1 ? "pattern" : "patterns"}.`);
    const finishes = kids.filter((c) => !state.known.has(c) && core.prereq[c].every((p) => p === i || state.known.has(p))).sort((a, b) => core.get(b).freq - core.get(a).freq).slice(0, 2);
    if (finishes.length && it.kind !== "w") bits.push(`Next you can learn ${finishes.map((c) => `<span class="zh">${esc(disp(c))}</span>`).join(", ")}.`);
    return bits.join(" ") || "Needed to build later items.";
  }

  const currentOrder = () => (state.focus === "hsk" ? order.hsk : order.unlock);

  // ---- What next
  function renderNext() {
    const seq = currentOrder();
    const list = core.next(seq, state.known, 10);
    const known = [...state.known].filter((i) => i < core.n).length;
    const cov = core.estimatedCoverage(state.known);
    const fr = new Set(core.frontier(seq, state.known));
    view.innerHTML = `
      <section class="intro">
        <h1>${known ? `You know ${fmt(known)} ${known === 1 ? "item" : "items"}` : "Start here: the next 10 things to learn"}</h1>
        <p class="soft">${known ? `That covers roughly ${(cov * 100).toFixed(0)}% of the words in everyday Chinese text, by frequency. Paste real text into Read for a true figure.` : "Each one is chosen to open up the most real Chinese for the least effort. Tick what you know already and the list moves on."}</p>
      </section>
      <section class="stack">
        <div class="choice" role="group" aria-label="Learning order">
          <button type="button" id="focus-unlock" aria-pressed="${state.focus === "unlock"}">Fastest reading</button>
          <button type="button" id="focus-hsk" aria-pressed="${state.focus === "hsk"}">HSK focus</button>
        </div>
        <p class="soft small">${state.focus === "hsk" ? "Finishes each HSK level in turn, starting with the lowest. Best for exam preparation. On real Hong Kong and news text it lets you read 5 to 13% fewer words for the same effort." : "Picks whatever adds the most readable words next, whatever its HSK level. Best for reading real Chinese."}</p>
        ${state.focus === "hsk" ? bandBars() : ""}
      </section>
      ${known < 50 ? `<section class="stack"><h2>Already studying?</h2>
        <div class="row"><span>Mark everything up to</span>${[1, 2, 3].map((b) => `<button type="button" class="btn quiet" data-bulk="${b}">HSK ${b}</button>`).join("")}</div></section>` : ""}
      <section aria-label="Next items">
        ${list.map((i) => itemRow(i, fr)).join("") || `<p>You have marked everything as known.</p>`}
      </section>`;
    document.getElementById("focus-unlock").onclick = () => setFocus("unlock");
    document.getElementById("focus-hsk").onclick = () => setFocus("hsk");
    view.querySelectorAll("[data-bulk]").forEach((b) => (b.onclick = () => bulk(+b.dataset.bulk)));
    view.querySelectorAll("[data-tick]").forEach((b) => (b.onclick = () => { markKnown(+b.dataset.tick); renderNext(); }));
  }

  function setFocus(f) { state.focus = f; save(); renderNext(); }

  function bandBars() {
    const rows = [];
    for (let b = 1; b <= 6; b++) {
      const members = core.items.filter((it) => bands[it.i] === b && it.kind !== "p");
      const have = members.filter((it) => state.known.has(it.i)).length;
      rows.push(`<div class="band"><span>HSK ${b}</span><span class="bar"><i style="width:${members.length ? (have / members.length) * 100 : 0}%"></i></span><span class="count">${fmt(have)} of ${fmt(members.length)}</span></div>`);
    }
    return `<div class="bands" aria-label="Progress by HSK level">${rows.join("")}</div>`;
  }

  function bulk(level) {
    snapshot(level === 1 ? "Marked HSK 1 as known" : `Marked HSK 1 to ${level} as known`);
    core.items.forEach((it) => { if (bands[it.i] && bands[it.i] <= level) core.closure(it.i, state.known).forEach((u) => state.known.add(u)); });
    core.patterns.forEach((p) => { if (p.level <= level) core.closure(p.i, state.known).forEach((u) => state.known.add(u)); });
    save();
    renderNext();
  }

  function itemRow(i, fr) {
    const it = core.get(i);
    const tick = `<button type="button" class="tick" data-tick="${i}" aria-label="I know ${esc(disp(i))}" title="I know this">✓</button>`;
    if (it.kind === "g") {
      return `<article class="item"><div class="pattern-cell"><span class="kind">Grammar</span><a class="pattern-form" href="#i${i}">${esc(it.form)}</a><p>${esc(it.explanation)}</p><p class="why">${why(i)}</p></div>${tick}</article>`;
    }
    return `<article class="item">${cells(i, it.form.length > 2 ? "ge-m" : "", fr.has(i) ? "is-frontier" : "")}<div class="text">
      <span class="kind">${KIND[it.kind]}</span>
      <span><span class="pinyin">${esc(mainReading(it))}</span>${glossOf(it) ? ` ${esc(it.kind === "p" ? shortMeaning(it) : glossOf(it))}` : ""}</span>
      <p class="why">${why(i)}</p></div>${tick}</article>`;
  }

  // ---- Can I read this?
  let draft = store.get(DRAFT_KEY);
  function renderRead() {
    const text = draft === null ? SAMPLE : draft;
    view.innerHTML = `
      <section class="stack">
        <h1>Can I read this?</h1>
        <label for="text" class="soft">Paste any Chinese text, Simplified or Traditional.${draft === null ? " This one is an example." : ""}</label>
        <textarea id="text" lang="zh">${esc(text)}</textarea>
      </section>
      <div id="result" class="stack" style="gap:28px"></div>`;
    const area = document.getElementById("text");
    let timer;
    area.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { draft = area.value; store.set(DRAFT_KEY, draft); drawResult(draft); }, 150);
    };
    drawResult(text);
  }

  function drawResult(text) {
    const out = document.getElementById("result");
    const r = core.analyse(text, state.known);
    if (!r.total) {
      out.innerHTML = `<p class="soft">No Chinese characters found. Paste some text above to see what you can read.</p>`;
      return;
    }
    const pct = (x) => `${Math.round((x / r.total) * 100)}%`;
    const reading = r.tokens.map((t) => {
      if (!t.han) return esc(t.text);
      if (t.unit === null) return `<span class="tok-outside">${esc(t.text)}</span>`;
      const shown = core.shownForm(t, state.script);
      const known = state.known.has(t.unit);
      const via = known && t.text !== core.items[t.unit].form && !state.tradSeen.has(t.unit);
      const cls = !known ? "tok-unknown" : via ? "tok-via" : "tok-known";
      const alt = shown.alternatives.length ? ` title="Could also be ${esc(shown.alternatives.join(" or "))}"` : "";
      return `<a class="${cls}" href="#i${t.unit}"${alt}>${esc(shown.text)}${shown.alternatives.length ? `<sup class="alt">?</sup>` : ""}</a>`;
    }).join("");
    const grammar = r.patterns;
    out.innerHTML = `
      <section class="stack">
        <div class="row" style="align-items:baseline;gap:12px"><span class="score">${pct(r.readable)}</span><span>readable now: ${fmt(r.readable)} of ${fmt(r.total)} words</span></div>
        <div class="reading" lang="${state.script === "t" ? "zh-HK" : "zh-Hans"}">${reading}</div>
        <div class="legend">
          <span><span class="zh tok-known">知</span> known</span>
          <span><span class="zh tok-unknown">生</span> not known yet</span>
          <span><span class="zh tok-via">學</span> known in the other script</span>
          ${r.outside ? `<span><span class="zh tok-outside">罕</span> not in our data (${fmt(r.outside)})</span>` : ""}
          ${r.tokens.some((t) => t.han && t.unit !== null && core.shownForm(t, state.script).alternatives.length) ? `<span><span class="zh">发<sup class="alt">?</sup></span> has more than one Traditional form; tap for the others</span>` : ""}
        </div>
      </section>
      ${r.ladder.length ? `<section class="stack">
        <h2>Learn ${fmt(r.learn.length)} ${r.learn.length === 1 ? "item" : "items"} to read all of this</h2>
        <p class="soft small">The smallest set for this text, including the parts each word needs. Best value comes first; the figure is how much you could read after that step.</p>
        <ol class="ladder">${r.ladder.map((s) => `<li><div class="chips">${s.items.map((i) => chip(i, i === s.target ? "" : "need")).join("")}</div><span class="pct">${pct(s.reached)}</span></li>`).join("")}</ol>
        <div class="row"><button type="button" class="btn" id="learn-all">Mark all ${fmt(r.learn.length)} as known</button></div>
      </section>` : `<section><h2>You can read all of this${r.outside ? ", apart from the characters we have no data for" : ""}.</h2></section>`}
      ${grammar.length ? `<section class="stack"><h2>Grammar spotted</h2><div class="chips">${grammar.map((i) => chip(i, state.known.has(i) ? "" : "need")).join("")}</div><p class="soft small">Only patterns made of fixed words can be spotted here, so this list is incomplete. Grammar does not affect the percentage.</p></section>` : ""}`;
    const all = document.getElementById("learn-all");
    if (all) all.onclick = () => {
      snapshot(`Marked ${r.learn.length} items as known`);
      r.learn.forEach((i) => state.known.add(i));
      save();
      drawResult(text);
    };
  }

  // ---- My map: one item in the middle, what it is made of, and what it unlocks
  const MAP_KEY = "jiesuo-map-focus-v1";
  let mapTrail = [], mapShowAll = false, mapResize = null;

  function renderMap(focus) {
    const seq = currentOrder();
    const frList = core.frontier(seq, state.known);
    const known = state.known.size;
    if (focus === undefined || !core.get(focus)) {
      const saved = +store.get(MAP_KEY);
      focus = saved && core.get(saved) ? saved : (core.next(seq, state.known, 1, 0)[0] ?? seq[0]);
    }
    if (mapTrail[mapTrail.length - 1] !== focus) { mapTrail = [...mapTrail.filter((u) => u !== focus), focus].slice(-6); mapShowAll = false; }
    store.set(MAP_KEY, String(focus));
    view.innerHTML = `
      <section class="stack">
        <h1>My map</h1>
        <p class="soft">${known ? "See how what you know fits together, and what it opens up next." : "Every character is built from smaller parts. Start anywhere and follow the lines."} Tap any square to move it to the middle.</p>
      </section>
      <section class="stack" id="focus-map" aria-label="What it is made of and what it unlocks"></section>
      <section class="stack">
        <h2>Good next steps</h2>
        <div class="chips">${frList.filter((i) => i < core.n).slice(0, 8).map((i) => mapChip(i, "need")).join("")}</div>
      </section>
      <details class="whole" id="whole">
        <summary>See the whole language</summary>
        <div class="stack">
          <p class="soft small">${known ? `You know ${fmt(known)} of ${fmt(seq.length)} items. ` : ""}Every square is one item, in learning order. Tap one to see it on the map.</p>
          <canvas class="field" id="field" aria-label="Grid of all items, showing which are known and which are ready to learn"></canvas>
          <div class="key"><span><i class="k-known"></i>Known</span><span><i class="k-front"></i>Ready to learn</span><span><i></i>Further off</span></div>
          <div id="peek"></div>
        </div>
      </details>`;
    drawFocus(focus);
    const whole = document.getElementById("whole");
    whole.ontoggle = () => { if (whole.open) drawField(seq, new Set(frList)); };
  }

  /** A chip that moves the map's centre rather than opening the page. */
  const mapChip = (i, cls = "") => chip(i, cls).replace(`href="#i${i}"`, `href="#m${i}"`);

  /** "1 word", "2 characters and 3 words". */
  function countText(list) {
    const n = { c: 0, p: 0, w: 0, g: 0 };
    list.forEach((u) => n[core.get(u).kind]++);
    const names = { c: ["character", "characters"], p: ["part", "parts"], w: ["word", "words"], g: ["grammar pattern", "grammar patterns"] };
    const bits = Object.keys(n).filter((k) => n[k]).map((k) => `${fmt(n[k])} ${names[k][n[k] === 1 ? 0 : 1]}`);
    return bits.length > 1 ? bits.slice(0, -1).join(", ") + " and " + bits[bits.length - 1] : bits[0] || "nothing";
  }

  /** A few words of meaning: a part's own short name, else the first sense without its bracketed notes. */
  function shortMeaning(it) {
    const raw = (it.kind === "p" && (core.partsData[it.form] || {}).d) || glossOf(it) || "";
    const first = raw.split(";")[0].trim();
    return first.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim() || first;
  }

  function drawFocus(i) {
    const box = document.getElementById("focus-map");
    const it = core.get(i);
    const info = JiesuoJourney.focusInfo(core, i, state.known);
    const form = disp(i);
    const stateCls = (s) => (s === "known" ? "is-known" : s === "ready" ? "is-frontier" : "");
    const node = (u, s, note = "") => {
      const g = core.get(u);
      const inner = g.kind === "g"
        ? `<span class="fm-gram">${esc(g.form)}</span>`
        : `<span class="word">${Array.from(disp(u)).map((c) => `<span class="ge ge-s ${stateCls(s)}"><b>${esc(c)}</b></span>`).join("")}</span>`;
      const href = g.kind === "g" ? `#i${u}` : `#m${u}`;
      return `<a class="fm-node" href="${href}" data-u="${u}" data-state="${s}">${inner}${note ? `<span class="fm-note">${note}</span>` : ""}</a>`;
    };
    const shown = mapShowAll ? info.unlocks.slice(0, 60) : info.unlocks.slice(0, 5);
    const unlockNote = (x) => {
      if (x.state === "known") return "known";
      if (x.ready) return info.state === "known" ? "ready to learn" : `ready once you learn ${esc(form)}`;
      return `needs ${x.missing.slice(0, 2).map((m) => `<span class="zh">${esc(disp(m))}</span>`).join(" ")}${x.missing.length > 2 ? ` +${x.missing.length - 2}` : ""}`;
    };
    const status = info.state === "known" ? "You know this."
      : info.state === "ready" ? "Ready to learn: you know everything it needs."
      : `First learn ${info.needs.map((u) => `<a class="zh" href="#m${u}">${esc(disp(u))}</a>`).join(" ")}.`;
    const fresh = info.unlocks.filter((x) => x.ready && x.state !== "known").map((x) => x.u);
    const later = info.unlocks.filter((x) => !x.ready).map((x) => x.u);
    const summary = !info.unlocks.length ? `Nothing else in our data is built from <span class="zh">${esc(form)}</span>.`
      : info.state === "known"
        ? `<span class="zh">${esc(form)}</span> helps build ${countText(info.unlocks.map((x) => x.u))}. ${fresh.length ? `${countText(fresh)} ${fresh.length === 1 ? "is" : "are"} ready to learn now.` : ""}`
        : `Learning <span class="zh">${esc(form)}</span> opens ${fresh.length ? `${countText(fresh)} straight away` : "nothing straight away"}${later.length ? `, and helps with ${countText(later)} more` : ""}.`;
    box.innerHTML = `
      ${mapTrail.length > 1 ? `<nav class="trail" aria-label="Where you have been">${mapTrail.map((u) => u === i ? `<span class="zh" aria-current="true">${esc(disp(u))}</span>` : `<a class="zh" href="#m${u}">${esc(disp(u))}</a>`).join("<span aria-hidden=\"true\">›</span>")}</nav>` : ""}
      <div class="fmap" id="fmap">
        <svg class="fm-lines" aria-hidden="true"></svg>
        <div class="fm-col fm-left">
          <span class="fm-head">${it.kind === "w" ? "Made of" : "Built from"}</span>
          ${info.parts.map((p) => node(p.u, p.state, esc(mainReading(core.get(p.u)) || ""))).join("") || `<span class="soft small fm-empty">a basic shape</span>`}
        </div>
        <div class="fm-centre" data-centre>
          <span class="word fm-big">${Array.from(form).map((c) => `<span class="ge ${Array.from(form).length > 2 ? "ge-m" : ""} ${stateCls(info.state)}"><b>${esc(c)}</b></span>`).join("")}</span>
          <span class="pinyin">${esc(mainReading(it))}</span>
          <span class="small fm-gloss">${esc(shortMeaning(it))}</span>
        </div>
        <div class="fm-col fm-right">
          <span class="fm-head">Unlocks${info.unlocks.length ? ` (${fmt(info.unlocks.length)})` : ""}</span>
          ${shown.map((x) => node(x.u, x.ready && x.state !== "known" ? "ready" : x.state === "known" ? "known" : "locked", unlockNote(x))).join("") || `<span class="soft small fm-empty">nothing yet</span>`}
          ${info.unlocks.length > shown.length ? (mapShowAll
            ? `<span class="soft small">Showing the first ${fmt(shown.length)}. <a href="#i${i}">Open <span class="zh">${esc(form)}</span></a> for all ${fmt(info.unlocks.length)}.</span>`
            : `<button type="button" class="linkish" data-showall>Show ${info.unlocks.length > 60 ? "more" : `all ${fmt(info.unlocks.length)}`}</button>`) : ""}
        </div>
      </div>
      <div class="key fm-key"><span><i class="k-known"></i>You know it</span><span><i class="k-ready"></i>Ready to learn</span><span><i></i>Later</span></div>
      <p class="fm-status">${status}</p>
      <p>${summary}</p>
      <div class="row"><a class="btn" href="#i${i}">Open <span class="zh">${esc(form)}</span></a></div>`;
    const all = box.querySelector("[data-showall]");
    if (all) all.onclick = () => { mapShowAll = true; drawFocus(i); };
    drawFocusLines(info);
    if (mapResize) mapResize.disconnect();
    if (window.ResizeObserver) { mapResize = new ResizeObserver(() => drawFocusLines(info)); mapResize.observe(document.getElementById("fmap")); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (document.getElementById("fmap")) drawFocusLines(info); });
  }

  /** Lines from each part to the centre, and from the centre to each unlock. Blue where the link is lit. */
  function drawFocusLines(info) {
    const map = document.getElementById("fmap");
    if (!map) return;
    const svg = map.querySelector(".fm-lines"), base = map.getBoundingClientRect();
    const centre = map.querySelector("[data-centre] .word").getBoundingClientRect();
    const focusKnown = info.state === "known";
    const pt = (r, side) => [(side === "r" ? r.right : r.left) - base.left, r.top + r.height / 2 - base.top];
    const curve = ([x1, y1], [x2, y2], cls) => { const m = (x1 + x2) / 2; return `<path class="${cls}" d="M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}"/>`; };
    let paths = "";
    map.querySelectorAll(".fm-left .fm-node").forEach((n) => {
      const sq = n.querySelector(".word, .fm-gram").getBoundingClientRect();
      paths += curve(pt(sq, "r"), pt(centre, "l"), n.dataset.state === "known" && focusKnown ? "lit" : n.dataset.state === "known" ? "half" : "");
    });
    map.querySelectorAll(".fm-right .fm-node").forEach((n) => {
      const sq = n.querySelector(".word, .fm-gram").getBoundingClientRect();
      paths += curve(pt(centre, "r"), pt(sq, "l"), n.dataset.state === "known" ? "lit" : n.dataset.state === "ready" ? "ready" : "");
    });
    svg.setAttribute("width", base.width); svg.setAttribute("height", base.height);
    svg.innerHTML = paths;
  }

  function drawField(seq, fr) {
    const canvas = document.getElementById("field");
    const css = getComputedStyle(document.documentElement);
    const col = (n) => css.getPropertyValue(n).trim();
    const rows = [["Parts", (i) => i < core.n && core.get(i).kind === "p"], ["Characters", (i) => i < core.n && core.get(i).kind === "c"], ["Words", (i) => i < core.n && core.get(i).kind === "w"], ["Grammar", (i) => i >= core.n]];
    const W = canvas.clientWidth || 340, cell = W < 500 ? 4 : 6, pitch = cell + 1, perRow = Math.floor(W / pitch);
    let y = 0;
    const layout = [];
    const heads = [];
    for (const [name, test] of rows) {
      const members = seq.filter(test);
      heads.push([name, members.length, y + 16]);
      y += 24;
      members.forEach((i, k) => layout.push({ i, x: (k % perRow) * pitch, y: y + Math.floor(k / perRow) * pitch }));
      y += Math.ceil(members.length / perRow) * pitch + 12;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = y * dpr;
    canvas.style.height = y + "px";
    const c = canvas.getContext("2d");
    c.scale(dpr, dpr);
    const pen = col("--pen"), faint = col("--grid-faint"), near = col("--grid");
    c.font = `700 15px ${col("--ui")}`;
    c.fillStyle = col("--soft");
    heads.forEach(([name, count, hy]) => c.fillText(`${name} (${fmt(count)})`, 0, hy));
    for (const n of layout) {
      c.fillStyle = state.known.has(n.i) ? pen : fr.has(n.i) ? near : faint;
      c.fillRect(n.x, n.y, cell, cell);
    }
    canvas.onclick = (e) => {
      const b = canvas.getBoundingClientRect();
      const x = e.clientX - b.left, yy = e.clientY - b.top;
      let best = null, d = 200;
      for (const n of layout) {
        const dd = (n.x + cell / 2 - x) ** 2 + (n.y + cell / 2 - yy) ** 2;
        if (dd < d) { d = dd; best = n.i; }
      }
      if (best !== null) document.getElementById("peek").innerHTML = chip(best, state.known.has(best) ? "" : "need") + (core.get(best).gloss ? ` <span class="soft small">${esc(core.get(best).gloss)}</span>` : "") + ` <a class="small" href="#m${best}">See it on the map</a>`;
    };
  }

  // ---- Item page
  let sentenceRows = null;
  async function loadSentences() {
    if (sentences) return sentences;
    const j = await fetchJson("sentences.json");
    sentenceRows = j.sentences;
    sentences = new Map();
    for (const s of j.sentences) for (const u of s[4]) { if (!sentences.has(u)) sentences.set(u, []); sentences.get(u).push(s); }
    return sentences;
  }
  async function loadSentenceRows() { await loadSentences(); return sentenceRows; }

  const ROLE = { semantic: "gives the meaning", phonetic: "gives the sound", both: "gives the meaning and the sound", meaning: "part of the idea", form: "part of the shape", no_etymology: "part of the shape", unmatched: "part of the shape" };

  function renderItem(i) {
    const it = core.get(i);
    if (!it) { location.hash = "next"; return; }
    if (it.kind === "g") return renderPattern(it);
    const known = state.known.has(i);
    const rec = (state.script === "t" && it.hk && core.partsData[it.hk]) || core.partsData[it.form] || {};
    const forms = [it.form, it.hk, ...it.others].filter((f, k, all) => f && all.indexOf(f) === k);
    const kids = core.children[i];
    const words = kids.filter((c) => c < core.n && core.get(c).kind === "w").sort((a, b) => core.get(b).freq - core.get(a).freq);
    const chars = kids.filter((c) => c < core.n && core.get(c).kind !== "w");
    const patterns = kids.filter((c) => c >= core.n);
    const missing = core.closure(i, state.known).filter((u) => u !== i);
    const glyphs = it.kind === "w" ? core.prereq[i] : [];
    const partRows = (rec.p || []).map(([part, role]) => {
      const u = core.glyphUnit.get(part);
      const g = u === undefined ? `<span class="ge ge-m"><b>${esc(part)}</b></span>` : `<a class="ge ge-m ${state.known.has(u) ? "is-known" : ""}" href="#i${u}"><b>${esc(state.script === "t" ? part : part)}</b></a>`;
      const u2 = u === undefined ? null : core.get(u);
      return `<div class="part">${g}<div><strong>${esc(ROLE[role] || "part of the shape")}</strong>${u2 && glossOf(u2) ? `<br><span class="soft small">${esc(pinyinOf(u2))} ${esc(glossOf(u2))}</span>` : ""}</div></div>`;
    }).join("");
    view.innerHTML = `
      ${backButton()}
      <div class="cols">
        <div class="col-a">
          <section class="head">
            <div class="word">${Array.from(disp(i)).map((c) => `<span class="ge ${it.form.length > 2 ? "" : "ge-xl"} ${known ? "is-known" : ""}"><b>${esc(c)}</b></span>`).join("")}</div>
            <div class="text">
              <span class="soft">${KIND[it.kind]}${bands[i] ? `, HSK ${bands[i] === 7 ? "7–9" : bands[i]}` : ""}</span>
              ${readingBlock(i)}
              <span class="meaning-row">${picture(i, "pic-m")}<span>${esc(glossOf(it) || "No dictionary entry for this one.")}</span></span>
              ${forms.length > 1 ? `<span class="small soft">Also written <span class="zh">${forms.filter((f) => f !== disp(i)).map(esc).join(", ")}</span></span>` : ""}
            </div>
          </section>
          <section class="stack">
            <div class="row">
              <button type="button" class="btn ${known ? "quiet" : "primary"}" id="toggle-known">${known ? "Mark as not known" : "I know this"}</button>
              <span id="review-slot">${reviewButton(i)}</span>
              <a class="btn quiet" href="#m${i}">See it on the map</a>
            </div>
            ${missing.length && !known ? `<p class="small soft">Marking this also marks ${missing.length} ${missing.length === 1 ? "item" : "items"} it needs.</p>` : ""}
            ${(it.hk || it.others.length) && known ? `<label class="check"><input type="checkbox" id="trad-too" ${state.tradSeen.has(i) ? "checked" : ""}> I can read the other script's form too</label>` : ""}
            <p class="why soft">${why(i)}</p>
          </section>
          <section class="stack" id="write"></section>
        </div>
        <div class="col-b">
          ${rec.h || partRows ? `<section class="stack"><h2>How it is built</h2><div id="built"></div>${rec.h ? `<p class="zh" style="font-family:var(--ui)">${esc(rec.h)}</p>` : ""}<div class="part-list">${partRows}</div></section>` : ""}
          ${glyphs.length ? `<section class="stack"><h2>Characters in this word</h2><div class="chips">${glyphs.map((c) => chip(c, state.known.has(c) ? "" : "need")).join("")}</div></section>` : ""}
          <section class="stack" id="example"><h2>Example</h2><p class="soft small">Loading a sentence…</p></section>
          ${words.length ? `<section class="stack"><h2>Words using it</h2><div class="chips">${words.slice(0, 24).map((c) => chip(c, state.known.has(c) ? "" : "need")).join("")}</div>${words.length > 24 ? `<p class="soft small">And ${fmt(words.length - 24)} more.</p>` : ""}</section>` : ""}
          ${chars.length ? `<section class="stack"><h2>Characters built from it</h2><div class="chips">${chars.slice(0, 24).map((c) => chip(c, state.known.has(c) ? "" : "need")).join("")}</div>${chars.length > 24 ? `<p class="soft small">And ${fmt(chars.length - 24)} more.</p>` : ""}</section>` : ""}
          ${patterns.length ? `<section class="stack"><h2>Grammar that needs it</h2><div class="chips">${patterns.map((c) => chip(c)).join("")}</div></section>` : ""}
        </div>
      </div>`;
    document.getElementById("toggle-known").onclick = () => { known ? markUnknown(i) : markKnown(i); renderItem(i); };
    document.getElementById("review-slot").onclick = () => { toggleReview(i); document.getElementById("review-slot").innerHTML = reviewButton(i); };
    const t = document.getElementById("trad-too");
    if (t) t.onchange = () => { t.checked ? state.tradSeen.add(i) : state.tradSeen.delete(i); save(); };
    drawExample(i, it);
    drawWriting(i, it);
  }

  /** Is this written glyph (a character or part, either script) one the learner knows? */
  const knowsGlyph = (f) => { const u = core.glyphUnit.has(f) ? core.glyphUnit.get(f) : core.lookup.get(f); return u !== undefined && state.known.has(u); };
  const glyphsOf = (i) => Array.from(disp(i));

  function drawWriting(i, it) {
    const box = document.getElementById("write");
    if (!box || !window.JiesuoWriter) return;
    box.innerHTML = `<h2>Write it</h2><div id="write-panel"></div>`;
    JiesuoWriter.writePanel(document.getElementById("write-panel"), glyphsOf(i), { isKnown: knowsGlyph });
    const built = document.getElementById("built");
    if (built && it.kind !== "w") JiesuoWriter.buildAnimation(built, glyphsOf(i)[0], { isKnown: knowsGlyph });
  }

  function sentenceHtml(s) {
    const text = state.script === "t" ? s[2] || s[1] : s[1];
    const line = core.tokenise(text).map((t) => {
      if (!t.han || t.unit === null) return esc(t.text);
      return `<a class="${state.known.has(t.unit) ? "tok-known" : "tok-unknown"}" href="#i${t.unit}">${esc(t.text)}</a>`;
    }).join("");
    // Row: id, simplified, traditional, English, items, author, English id, English author (CC BY 2.0 FR).
    const link = (id, label) => `<a href="https://tatoeba.org/sentences/show/${esc(id)}" rel="noopener" target="_blank">${label}</a>`;
    const english = s[3] ? `<p>${esc(s[3])}</p>` : "";
    const enCredit = s[6] ? `, English ${link(s[6], `#${esc(s[6])}`)}${s[7] ? ` by ${esc(s[7])}` : " (CC0)"}` : "";
    return `<div class="sentence"><p class="line" lang="${state.script === "t" ? "zh-HK" : "zh-Hans"}">${line}</p>${english}<p class="small soft">Tatoeba ${link(s[0], `#${esc(s[0])}`)} by ${esc(s[5])}${enCredit}. CC BY 2.0 FR.</p></div>`;
  }

  async function drawExample(i, it) {
    const box = document.getElementById("example");
    try {
      const map = await loadSentences();
      const box2 = document.getElementById("example");
      if (!box2 || box2 !== box) return;
      const list = map.get(i) || [];
      if (!list.length) {
        box.innerHTML = it.kind === "p" ? "" : `<h2>Example</h2><p class="soft small">No short example sentence for this one yet.</p>`;
        return;
      }
      const unknownCount = (s) => core.tokenise(s[1]).filter((t) => t.han && t.unit !== null && !state.known.has(t.unit)).length;
      const best = [...list].sort((a, b) => unknownCount(a) - unknownCount(b))[0];
      box.innerHTML = `<h2>Example</h2>${sentenceHtml(best)}`;
    } catch (e) {
      box.innerHTML = `<h2>Example</h2><p class="soft small">Example sentences did not load. Reload to try again.</p>`;
    }
  }

  async function renderPattern(p) {
    const known = state.known.has(p.i);
    view.innerHTML = `
      ${backButton()}
      <section class="stack">
        <span class="soft">Grammar, HSK ${p.level} by our estimate</span>
        <h1 class="zh">${esc(p.form)}</h1>
        <p>${esc(p.explanation)}</p>
      </section>
      <section class="stack"><div class="row"><button type="button" class="btn ${known ? "quiet" : "primary"}" id="toggle-known">${known ? "Mark as not known" : "I know this"}</button></div></section>
      <section class="stack"><h2>Words it needs</h2><div class="chips">${p.requires.map((c) => chip(c, state.known.has(c) ? "" : "need")).join("")}</div></section>
      <section class="stack" id="example"><h2>Examples</h2><p class="soft small">Loading sentences…</p></section>`;
    document.getElementById("toggle-known").onclick = () => { known ? markUnknown(p.i) : markKnown(p.i); renderPattern(p); };
    const box = document.getElementById("example");
    try {
      const map = await loadSentences();
      if (document.getElementById("example") !== box) return;
      const list = map.get(p.i) || [];
      box.innerHTML = `<h2>Examples</h2>` + (list.map(sentenceHtml).join("") || `<p class="soft small">No short example for this pattern yet.</p>`) + `<p class="soft small">Examples are found automatically and can occasionally be wrong.</p>`;
    } catch (e) {
      box.innerHTML = `<h2>Examples</h2><p class="soft small">Example sentences did not load. Reload to try again.</p>`;
    }
  }

  // ---- Search, Pleco-style, and "add to my reviews"
  const SEARCH_KEY = "jiesuo-search-v1";
  let lastQuery = store.get(SEARCH_KEY) || "";
  const inReview = (i) => state.review.has(i);
  /** Add to (or take out of) the review schedule. Added items are due today, so they come up next lesson. */
  function toggleReview(i) {
    if (inReview(i)) {
      state.review.delete(i);
      showPlain(`Took ${disp(i)} out of your reviews.`);
    } else {
      state.review.set(i, [1, JiesuoJourney.dayKey()]);
      state.seen.set(i, JiesuoJourney.dayKey());
      showPlain(`Added ${disp(i)}. It comes up in your next lesson.`);
    }
    save();
  }
  const reviewButton = (i, cls = "") => `<button type="button" class="btn ${cls} review-btn" data-review="${i}" aria-pressed="${inReview(i)}">${inReview(i) ? "✓ In your reviews" : "+ Add to my reviews"}</button>`;

  function renderSearch() {
    view.innerHTML = `
      <section class="stack search-head">
        <h1 class="sr-only">Search</h1>
        <input id="q" type="search" lang="zh" placeholder="好, hao3, nihao or good" aria-label="Search by characters, pinyin or English"
          autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" value="${esc(lastQuery)}">
      </section>
      <section id="results" class="stack" aria-live="polite"></section>`;
    const input = document.getElementById("q");
    let timer;
    input.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { lastQuery = input.value; store.set(SEARCH_KEY, lastQuery); drawResults(); }, 80);
    };
    view.querySelector("#results").onclick = (e) => {
      const b = e.target.closest("[data-review]");
      if (!b) return;
      toggleReview(+b.dataset.review);
      b.outerHTML = reviewButton(+b.dataset.review, "small-btn");
    };
    drawResults();
    input.focus({ preventScroll: true });
    if (lastQuery) input.select();
  }

  function drawResults() {
    const box = document.getElementById("results");
    const q = lastQuery.trim();
    if (!q) {
      const reviewing = [...state.review.keys()].filter((i) => i < core.n);
      box.innerHTML = `
        <p class="soft">Type characters, pinyin with or without tones (<span class="zh">nihao</span>, <span class="zh">ni3hao</span>, <span class="zh">nǐ hǎo</span>), or English. Tap <strong>+ Add to my reviews</strong> on anything you want to practise; it comes up in your next lesson.</p>
        ${reviewing.length ? `<h2>In your reviews (${fmt(reviewing.length)})</h2><div class="chips">${reviewing.slice(0, 60).map((i) => chip(i, state.known.has(i) ? "" : "need")).join("")}</div>` : ""}`;
      return;
    }
    const hits = core.search(q, 60);
    if (!hits.length) { box.innerHTML = `<p class="soft">Nothing found for “${esc(q)}”. Try pinyin without tones, or a single English word.</p>`; return; }
    box.innerHTML = hits.map((i) => {
      const it = core.get(i);
      const other = state.script === "t" ? (it.hk ? it.form : "") : it.hk;
      return `<article class="result">
        <a class="result-main" href="#i${i}">
          <span class="zh result-form ${state.known.has(i) ? "tok-known" : ""}">${esc(disp(i))}</span>${other ? `<span class="zh soft small">${esc(other)}</span>` : ""}
          <span class="result-text">${picture(i, "pic-s")}<span class="pinyin">${esc(pinyinOf(it))}</span> <span class="soft small">${KIND[it.kind]}${state.known.has(i) ? " · known" : ""}</span><br><span>${esc(glossOf(it))}</span></span>
        </a>
        ${reviewButton(i, "small-btn")}
      </article>`;
    }).join("");
  }

  // ---- Progress and credits
  function renderMore() {
    const json = JSON.stringify(JiesuoCore.serialise(state, core), null, 1);
    view.innerHTML = `
      <section class="stack">
        <h1>Your progress</h1>
        <p>You have marked <strong>${fmt(state.known.size)}</strong> items as known. They are kept in this browser only, with no account and no server.</p>
        ${storageOk ? "" : `<p class="warn">This browser is blocking storage, so save a file before you close this page.</p>`}
      </section>
      <section class="stack">
        <h2>Save to a file</h2>
        <div class="row">
          <button type="button" class="btn primary" id="download">Download progress file</button>
          <button type="button" class="btn" id="copy">Copy as text</button>
        </div>
        <pre class="export" id="export-text">${esc(json)}</pre>
      </section>
      <section class="stack">
        <h2>Restore from a file</h2>
        <label class="btn quiet" for="import-file" style="width:fit-content;display:inline-flex;align-items:center">Choose progress file</label>
        <input id="import-file" type="file" accept="application/json,.json" hidden>
        <label for="import-text" class="soft small">Or paste the text of one:</label>
        <textarea id="import-text" style="min-height:72px;font:400 .9rem/1.4 var(--ui)"></textarea>
        <div class="row"><button type="button" class="btn" id="import-go">Restore pasted text</button></div>
        <p id="import-msg" role="status"></p>
      </section>
      <section class="stack">
        <h2>Start over</h2>
        <div class="row" id="reset-row"><button type="button" class="btn danger" id="reset">Clear all progress</button></div>
      </section>
      <section class="credits">
        <h2>Where the data comes from</h2>
        <p>Dictionary: <a href="https://cc-cedict.org/wiki/" rel="noopener" target="_blank">CC-CEDICT</a>, CC BY-SA 4.0.</p>
        <p>Frequencies: <a href="https://github.com/rspeer/wordfreq" rel="noopener" target="_blank">wordfreq</a> by Robyn Speer, CC BY-SA 4.0, which includes SUBTLEX-CH by Cai and Brysbaert (2010, freely available data), OpenSubtitles and Google Books Ngrams.</p>
        <p>Character parts: <a href="https://github.com/skishore/makemeahanzi" rel="noopener" target="_blank">Make Me a Hanzi</a>, LGPL-3.0-or-later. Derived from Unihan and CJKlib.</p>
        <p>Sentences: <a href="https://tatoeba.org" rel="noopener" target="_blank">Tatoeba</a>, <a href="https://creativecommons.org/licenses/by/2.0/fr/deed.en" rel="noopener" target="_blank">CC BY 2.0 FR</a>. Each example names its author and translator and links to its page.</p>
        <p>HSK lists: <a href="https://github.com/elkmovie/hsk30" rel="noopener" target="_blank">elkmovie/hsk30</a>, MIT, Pleco Inc. Script conversion: <a href="https://github.com/BYVoid/OpenCC" rel="noopener" target="_blank">OpenCC</a>, Apache-2.0. Word splitting while building the data: <a href="https://github.com/fxsjy/jieba" rel="noopener" target="_blank">jieba</a>, MIT.</p>
        <p>Pictures: all emojis designed by <a href="https://openmoji.org/" rel="noopener" target="_blank">OpenMoji</a>, the open-source emoji and icon project. License: <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener" target="_blank">CC BY-SA 4.0</a>.</p>
        <p>Grammar explanations were written for Jiesuo, and their HSK levels are our own estimates.</p>
        <p><a href="licences/">Full licence texts and notices</a></p>
      </section>`;
    document.getElementById("download").onclick = () => {
      const blob = new Blob([JSON.stringify(JiesuoCore.serialise(state, core), null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `jiesuo-progress-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      showPlain("Download started. If nothing arrives, use Copy as text.");
    };
    document.getElementById("copy").onclick = async () => {
      try { await navigator.clipboard.writeText(json); showPlain("Copied."); }
      catch (e) {
        const r = document.createRange(); r.selectNodeContents(document.getElementById("export-text"));
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        showPlain("Selected the text. Copy it with your device's copy command.");
      }
    };
    const restore = (text) => {
      const msg = document.getElementById("import-msg");
      try {
        const got = JiesuoCore.deserialise(JSON.parse(text), core);
        undo = null;
        const before = { known: new Set(state.known), tradSeen: new Set(state.tradSeen) };
        Object.assign(state, got);
        undo = () => { state.known = before.known; state.tradSeen = before.tradSeen; save(); route(); };
        save();
        renderMore();
        showToast(`Restored ${got.known.size} items` + (got.skipped ? `, skipped ${got.skipped} we no longer have` : ""));
      } catch (e) {
        msg.textContent = e instanceof SyntaxError ? "That text is not valid JSON. Check that you copied the whole file." : e.message;
      }
    };
    document.getElementById("import-go").onclick = () => restore(document.getElementById("import-text").value);
    document.getElementById("import-file").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => restore(r.result);
      r.onerror = () => { document.getElementById("import-msg").textContent = "That file could not be read. Try choosing it again."; };
      r.readAsText(f);
    };
    document.getElementById("reset").onclick = () => {
      const row = document.getElementById("reset-row");
      row.innerHTML = `<span>Clear ${fmt(state.known.size)} items?</span><button type="button" class="btn danger" id="reset-yes">Yes, clear all</button><button type="button" class="btn quiet" id="reset-no">Keep them</button>`;
      document.getElementById("reset-no").onclick = renderMore;
      document.getElementById("reset-yes").onclick = () => {
        snapshot("Cleared all progress");
        state.known = new Set(); state.tradSeen = new Set();
        Object.assign(state, freshJourney());
        save();
        renderMore();
      };
    };
  }
  function showPlain(text) { undo = null; showToast(text); }

  // ---- Routing: a plain #name, the only hash form every host preserves
  const today = JiesuoToday.create({
    core, state, save, view, esc, fmt, disp, sayButton, readingBlock, picture, glossOf, pinyinOf: mainReading, knowsGlyph: (f) => knowsGlyph(f), learn,
    bands, loadSentences, loadSentenceRows, sentenceHtml: (s) => sentenceHtml(s), currentOrder: () => currentOrder(), speak, canSpeak, SPEAKER,
  });

  function route() {
    const h = (location.hash || "#" + HOME).slice(1);
    const m = /^i(\d+)$/.exec(h);
    const onMap = /^m(\d+)$/.exec(h);
    const tab = m ? null : onMap ? "map" : ["today", "lesson", "search", "next", "read", "map", "more"].includes(h) ? h : HOME;
    const lit = tab === "lesson" ? "today" : tab;
    document.querySelectorAll(".tabs a, .search-btn").forEach((a) => a.dataset.tab === lit ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    document.documentElement.lang = state.script === "t" ? "zh-HK" : "zh-Hans";
    document.getElementById("script-s").setAttribute("aria-pressed", state.script === "s");
    document.getElementById("script-t").setAttribute("aria-pressed", state.script === "t");
    view.classList.toggle("wide", !!m);
    if (tab !== "lesson") document.body.classList.remove("in-lesson");
    if (m) renderItem(+m[1]);
    else if (onMap) renderMap(+onMap[1]);
    else ({ today: today.renderToday, lesson: today.renderLesson, search: renderSearch, next: renderNext, read: renderRead, map: renderMap, more: renderMore })[tab]();
  }
  // "/" opens search from anywhere on desktop, as in many dictionaries.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    if (location.hash === "#search") document.getElementById("q").focus(); else location.hash = "search";
  });
  function setScript(s) { state.script = s; save(); route(); }
  document.getElementById("script-s").onclick = () => setScript("s");
  document.getElementById("script-t").onclick = () => setScript("t");

  // Back goes to the previous screen inside the app. With no in-app history (opened from the
  // home screen straight onto an item), it goes home, so it never leaves the app.
  let depth = 0, goingBack = false;
  function goBack() {
    if (depth > 0) { goingBack = true; history.back(); }
    else location.hash = HOME;
  }
  window.addEventListener("hashchange", () => {
    if (goingBack) { depth = Math.max(0, depth - 1); goingBack = false; } else depth++;
    route(); window.scrollTo(0, 0);
  });
  store.set("jiesuo-test", "1");
  document.getElementById("storage-warning").hidden = storageOk;
  route();

  // Offline support where the host allows service workers (GitHub Pages does).
  try {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (e) { /* offline caching is optional */ }
})();
