/* Jiesuo 粵: the shell. Loads the data, keeps progress, routes #today / #sounds / #progress.
   Screens register on window.JyutScreens (see today.js); the Progress screen lives here. */
(async function () {
  "use strict";
  const STORE_KEY = "jiesuo-yue-progress-v1";
  const BACKUP_KEY = "jiesuo-yue-progress-backup"; // the last save before a forced fresh start
  const HOME = "today";
  const SCREENS = ["today", "sounds", "progress"];
  const view = document.getElementById("view");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Storage may throw (private windows, blocked site data). The app works without it.
  let storageOk = true;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { storageOk = false; return null; } },
    set(k, v) { try { localStorage.setItem(k, v); storageOk = true; } catch (e) { storageOk = false; } },
  };

  const fetchJson = async (name) => {
    const r = await fetch("data/" + name);
    if (!r.ok) throw new Error(name + " returned " + r.status);
    return r.json();
  };

  let data;
  try {
    const [stage0, audio, readings, tonecheck] = await Promise.all(["stage0.json", "audio.json", "readings.json", "tonecheck.json"].map(fetchJson));
    data = { stage0, audio, readings, tonecheck };
  } catch (e) {
    view.innerHTML = `<p class="warn">The data did not load (${esc(e.message)}). Serve the app folder over http and reload; it cannot open from a file:// address.</p>`;
    return;
  }

  const loaded = JyutState.load(store.get(STORE_KEY));
  let state = loaded.state; // a damaged or foreign save starts fresh

  const FRESH_MSG = "Your saved progress could not be read, so the app started fresh. Restore from a file if you have one.";
  const BACKUP_MSG = "Something in your progress stopped this screen from drawing, so the app started fresh. A backup of your old progress was kept: you can restore it on the Progress screen.";
  function save() {
    store.set(STORE_KEY, JSON.stringify(JyutState.serialise(state)));
    document.getElementById("storage-warning").hidden = storageOk;
  }

  let toastTimer;
  function toast(text) {
    const t = document.getElementById("toast");
    t.innerHTML = `<span>${esc(text)}</span>`;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
  }

  // What every screen gets. `state` is replaced on restore, so read it through ctx.state each time.
  const ctx = {
    view, esc, data, store, toast, save, route: () => route(),
    drills: JyutDrills, journey: JiesuoJourney,
    get state() { return state; },
    get storageOk() { return storageOk; },
  };

  // ---- Progress
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
  function unitRows() {
    return data.stage0.units.map((u) => {
      const log = (state.stats.byUnit[u.id] || []).slice(-20);
      const right = log.reduce((n, e) => n + e.r, 0);
      const passed = JyutDrills.unitPassed(state.stats, u.id);
      const status = passed ? `<span class="done-mark">Passed</span>` : log.length ? `<span class="soft">${right} of your last ${log.length} right</span>` : `<span class="soft">Not started</span>`;
      return `<div class="unit-row"><div class="row" style="justify-content:space-between"><span class="name">${esc(u.title)}</span>${status}</div><div class="bar" aria-hidden="true"><i style="width:${pct(right, 20)}%"></i></div></div>`;
    }).join("");
  }

  function renderProgress() {
    const g = JyutDrills.gate(state.stats);
    const gateLine = g.passed
      ? JyutLesson.gateSummary(state.stats, true) // "N of the M questions you answered" when fewer than 40
      : g.count ? `So far you have ${g.right} of ${g.count} on the tone check. The words open at 34 of 40, or you can move on whenever you like.`
        : "The 40-question tone check opens the words at 34 right. You can move on whenever you like.";
    const guideLine = window.JyutSpeak && JyutSpeak.guideText ? JyutSpeak.guideText(data.tonecheck) : "";
    const guide = guideLine ? `<p class="soft small">${esc(guideLine)}</p>` : "";
    const backup = store.get(BACKUP_KEY);
    const json = JSON.stringify(JyutState.serialise(state), null, 1);
    const fileName = () => `jiesuo-yue-progress-${new Date().toISOString().slice(0, 10)}.json`;
    view.innerHTML = `
      <section class="stack">
        <h1>Your progress</h1>
        ${storageOk ? "" : `<p class="warn">This browser is blocking storage, so save a file before you close this page.</p>`}
        <h2>Stage 0: the sounds</h2>
        <div>${unitRows()}</div>
        <p>${esc(gateLine)}</p>
        ${guide}
      </section>
      <details class="whole" open>
        <summary>Save, restore or move your progress</summary>
        <div class="stack">
          <p class="soft small">Your progress is kept in this browser only, with no account and no server. Recordings and calibration never leave your device.</p>
          <section class="stack">
            <h2>On another device</h2>
            <p class="soft small">Send your progress file to your phone, tablet or computer (by AirDrop, messages or email to yourself), then open Jiesuo 粵 there and choose <strong>Restore from a file</strong>.</p>
            <div class="row"><button type="button" class="btn primary" id="share">Send to my other device</button></div>
          </section>
          <section class="stack">
            <div class="row"><button type="button" class="btn primary" id="download">Save progress to a file</button></div>
          </section>
          <section class="stack">
            <label class="btn quiet" for="import-file" style="width:fit-content;display:inline-flex;align-items:center">Restore from a file</label>
            <input id="import-file" type="file" accept="application/json,.json" hidden>
            <label for="import-text" class="soft small">Or paste the text of one:</label>
            <textarea id="import-text" style="min-height:72px;font:400 .9rem/1.4 var(--ui)"></textarea>
            <div class="row"><button type="button" class="btn" id="import-go">Restore pasted text</button>${backup ? `<button type="button" class="btn quiet" id="import-backup">Restore the backup kept in this browser</button>` : ""}</div>
            <p id="import-msg" role="status"></p>
          </section>
        </div>
      </details>
      <section class="credits">
        <p>Learning Mandarin too? <a href="../">Open Jiesuo 解锁</a>. It keeps its own progress.</p>
        <p><a href="licences/">Licences and where the data comes from</a></p>
      </section>`;

    const download = () => {
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    document.getElementById("download").onclick = () => { download(); toast("Download started."); };
    document.getElementById("share").onclick = async () => {
      const file = new File([json], fileName(), { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "Jiesuo 粵 progress" }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      download();
      toast("This browser cannot share files, so the file was downloaded instead. Send it to your other device yourself.");
    };
    const restore = (text) => {
      const msg = document.getElementById("import-msg");
      try {
        const got = JyutState.deserialise(JSON.parse(text));
        const old = state;
        state = got;
        // Draw first: if the new state cannot be drawn, keep the old state and storage untouched.
        try { renderProgress(); } catch (err) { state = old; renderProgress(); throw new Error("bad-file"); }
        save();
        toast("Progress restored.");
      } catch (e) {
        msg.innerHTML = e instanceof SyntaxError ? "That text is not valid JSON. Check that you copied the whole file."
          : e.message === "not-yue" ? `This file is from the Mandarin app. <a href="../">Open it there.</a>`
            : e.message === "bad-file" ? "That file is damaged, so it was not restored. Your progress is unchanged." : esc(e.message);
      }
    };
    document.getElementById("import-go").onclick = () => restore(document.getElementById("import-text").value);
    if (backup) document.getElementById("import-backup").onclick = () => restore(backup);
    document.getElementById("import-file").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => restore(r.result);
      r.onerror = () => { document.getElementById("import-msg").textContent = "That file could not be read. Try choosing it again."; };
      r.readAsText(f);
    };
  }

  // ---- Routing: a plain #name, the only hash form every host preserves
  function route() {
    const h = (location.hash || "#" + HOME).slice(1);
    const tab = SCREENS.includes(h) ? h : HOME;
    document.querySelectorAll(".tabs a").forEach((a) => (a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    const screens = window.JyutScreens || {};
    const draw = () => {
      if (tab === "progress") renderProgress();
      else if (typeof screens[tab] === "function") screens[tab](ctx);
      else view.innerHTML = `<p class="soft">This screen is not ready yet.</p>`;
    };
    // A kept lesson is the likeliest culprit and costs nothing to drop, so that is tried first. Never leave the
    // app unusable, but never lose progress silently: the old save is kept as a backup before a fresh start.
    let old = null;
    const outcome = JyutState.drawSafely(draw, () => { state.lesson = null; save(); }, () => {
      old = store.get(STORE_KEY);
      if (old) store.set(BACKUP_KEY, old);
      state = JyutState.emptyState();
      save();
    });
    if (outcome === "broken") view.innerHTML = `<p class="warn">Something went wrong drawing this screen.</p>`;
    if (outcome === "reset" || outcome === "broken") toast(old ? BACKUP_MSG : FRESH_MSG);
  }
  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
  store.set("jiesuo-yue-test", "1"); // probe only; remove the junk key again
  try { localStorage.removeItem("jiesuo-yue-test"); } catch (e) { /* already flagged by the probe */ }
  document.getElementById("storage-warning").hidden = storageOk;
  route();
  if (loaded.fresh) toast(FRESH_MSG);

  // Offline support where the host allows service workers (GitHub Pages does).
  try {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (e) { /* offline caching is optional */ }
})();
