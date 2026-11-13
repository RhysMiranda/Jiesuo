# Joyful journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Jiesuo a daily, joyful learning journey: phone/desktop usability fixes, stroke-by-stroke writing, and a Today session that ends on a sentence you can newly read.

**Architecture:** Static vanilla-JS app in `app/`. Pure, node-testable logic lives in UMD modules (`core.js`, new `journey.js`). DOM code: `app.js` (screens, routing), new `writer.js` (Write panel and "see it built" animation over Hanzi Writer), new `today.js` (Today screen and session). Stroke data is built by Python into one JSON file per glyph in `app/strokes/`, loaded on demand and cached by the service worker.

**Tech Stack:** Vanilla JS (no build step), Hanzi Writer 3.7.3 (MIT, vendored), Python 3.10 build scripts, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-13-joyful-journey-design.md`

## Global Constraints

- Static site on GitHub Pages; works offline after first visit; no accounts, no server.
- No new libraries except Hanzi Writer, vendored at `app/vendor/hanzi-writer.min.js`; no CDN scripts.
- Keep the exercise-book identity: 田字格 squares, pen-blue ink (`--pen`), paper colours. Mistakes never shown in red.
- No streaks, hearts, lives, or missed-day messages. "Days learned" never resets.
- Every shipped data file keeps its own licence, listed on `app/licences/index.html` and `LICENSES.md`.
- All motion respects `prefers-reduced-motion`.
- Tap targets ≥ 44 px. Phone layout one column; ≥ 1000 px item pages use two columns.
- Progress file `version: 2`; version 1 files still import.
- Existing `node --test tests/app.test.js` keeps passing.

## Review Focus

1. **No Chinese voice installed** (common on desktop Linux/Windows without packs): the speaker button must not appear, and nothing errors.
2. **Character without stroke data** (祂, some Hong Kong forms): Write panel shows the fallback text; a session that includes it still completes.
3. **Closing the app mid-session**: reopening resumes at the same step; a session started yesterday and resumed today is finished, not lost.
4. **Everything already known / end of order**: Today shows reviews only, or a "you've learned everything in the order" message, never an empty Start.
5. **Offline after first visit**: Today works with cached data; a stroke file that was never fetched shows the fallback, not a hang.

---

### Task 1: Usability fixes

**Files:** Modify `app/app.js`, `app/style.css`, `app/index.html`.

- [ ] Back control: a `.back` button at the top of item and pattern pages. In-app navigation depth counter incremented on each `hashchange` after load; click → `history.back()` if depth > 0, else `location.hash = "today"` (or `"next"` until Task 6 lands).
- [ ] `speak(text)` and `canSpeak()` in `app.js`: `speechSynthesis` with a voice whose `lang` starts with `zh-CN`, else `zh-TW`, else any `zh` except `zh-HK` (Cantonese). Re-check on `voiceschanged`. Speaker button `.say` beside pinyin on item pages; hidden when `!canSpeak()`.
- [ ] Next list rows: `align-items: start` on `.item`, first-row square 72 px, tighter padding.
- [ ] Desktop: item page wraps sections in `.cols` with `.col-a` (squares, write panel, audio, known button) and `.col-b` (meaning, parts, words, examples); at ≥ 1000 px `main.wide` max-width 1080 px and `.cols` becomes two columns.
- [ ] Verify at 375 px and 1280 px in the browser pane; run `node --test tests/app.test.js` → all pass.
- [ ] Commit `Usability: back button, audio, tidier rows, two-column item page`.

### Task 2: Stroke data build and licences

**Files:** Create `jiesuo/export_strokes.py`, `app/strokes/*.json`, `app/licences/ARPHICPL.TXT`. Modify `scripts/fetch_data.py`, `data/manifest.json`, `app/licences/index.html`, `LICENSES.md`. Test: `tests/test_strokes.py`.

**Interfaces — Produces:** `app/strokes/<hex codepoint, lowercase>.json` = `{"strokes": [svg path], "medians": [[[x,y],…]], "parts": [[component char, [stroke indices]], …]}` in Make Me a Hanzi coordinates (1024 box, y up, baseline offset 900).

- [ ] `fetch_data.py` gains `mmh_graphics.txt` and `mmh_ARPHICPL.TXT` (from `APL/english/ARPHICPL.TXT`); `mmh_dictionary.txt` already listed.
- [ ] Test `test_parts_cover_strokes`: for 好, `parts` is `[["女",[0,1,2]],["子",[3,4,5]]]`; for every exported file, stroke indices across parts are disjoint and within range; 一 has `parts == []`.
- [ ] `export_strokes.py` `main()`: glyphs = dict items of kind c/p plus their `hk` forms; `parts` from `dictionary.txt` `matches` (first element of each stroke's match path → top-level component of the IDS `decomposition`; components that are `？` or unmatched strokes omitted).
- [ ] Licences page row for `strokes/` (Arphic Public Licence, from Make Me a Hanzi `graphics.txt`, changes: split per character, added part membership from `dictionary.txt`); LICENSES.md row.
- [ ] Run `python -m jiesuo.export_strokes` and `pytest tests/test_strokes.py` → pass. Commit.

### Task 3: Write panel and "see it built"

**Files:** Create `app/writer.js`, `app/vendor/hanzi-writer.min.js`, `app/licences/hanzi-writer-LICENSE.txt`. Modify `app/app.js` (item page), `app/index.html`, `app/style.css`, `app/sw.js`.

**Interfaces — Produces** (global `JiesuoWriter`):
- `loadStrokes(char) -> Promise<data|null>` (cached in a Map; null on 404/offline).
- `mountWriter(el, char, {mode: "watch"|"trace"|"memory", knownParts: Set<string>, size, onDone({mistakes})}) -> {replay(), destroy()}` — draws the 田字格 grid behind; known-part strokes coloured `--pen` via `radStrokes`; hints after 2 misses (`showHintAfterMisses: 2`); no outline in memory mode until 3 misses on a stroke.
- `buildAnimation(el, char, {knownParts}) -> Promise<void>` — SVG of the character with one `<g>` per part; each group starts offset outward from the character centre (by its bbox centre, 35%) and faded, then transitions into place; known parts drawn in `--pen`. Reduced motion: no transition.
- `writePanel(el, forms: string[], {knownParts, onDone})` — Watch / Trace / From memory segmented control; for words, one character at a time.

- [ ] Vendor Hanzi Writer 3.7.3 from the npm tarball (`package/dist/hanzi-writer.min.js`) with its LICENSE.
- [ ] Item page: "Write it" section (characters and parts; words get per-character panel); "How it is built" gets the build animation above the parts list.
- [ ] Missing data: panel shows "Writing practice isn't available for this one yet."
- [ ] sw.js: add `writer.js`, `vendor/hanzi-writer.min.js` to FILES; bump VERSION.
- [ ] Verify in browser: 好 animates, trace accepts strokes, mistakes hint without red; 祂 shows fallback. Commit.

### Task 4: Review scheduling, milestones, progress v2

**Files:** Create `app/journey.js`. Modify `app/core.js` (serialise/deserialise), `tests/app.test.js`.

**Interfaces — Produces** (UMD `JiesuoJourney`):
- `dayKey(date: Date) -> "YYYY-MM-DD"` (local), `addDays(day, n) -> day`, `daysBetween(a, b) -> int`.
- `BOXES = [1, 2, 4, 8, 16, 32]`; `schedule(entry: [box, due]|undefined, correct: bool, today) -> [box, due]`: correct → box `min(6, box+1)` (new → 1), due `today + BOXES[box-1]`; wrong → `[1, today+1]`.
- `dueReviews(review: Map<unit,[box,due]>, today, limit=5) -> unit[]` by due, then lower box.
- `pickNew(core, order, known, k=3) -> unit[]` — `core.next(order, known, k, 0)` (no grammar).
- `unlockSentence(core, rows, knownBefore, knownAfter) -> row|null` — shortest row whose Han tokens are all in `knownAfter` and not all in `knownBefore`; only rows containing a character of a newly known item are tokenised.
- `MILESTONES` and `milestones(ctx) -> [{key, label, reached, hint}]` where `ctx = {chars, words, written, unlocked, days, coverage, hsk1Done}`; `hint` like "6 more characters".
- core `serialise` adds `version: 2`, `review` (id → [box, due]), `days` (sorted dates), `milestones` (key → date), `stats` ({written, unlocked}), `lesson` (or null, units as ids); `deserialise` defaults all to empty for v1.

- [ ] Tests: `schedule(undefined,true,"2026-11-13")` → `[1,"2026-11-14"]`; `schedule([3,…],true,d)` → `[4, d+8]`; `schedule([5,…],false,d)` → `[1, d+1]`; box caps at 6; `dueReviews` ordering and limit; `pickNew` returns no grammar and only unknown items; `unlockSentence` finds 我是学生 when 学生 is the new word and returns null when nothing new is readable; milestone hints; v2 round-trip and v1 import defaults.
- [ ] Implement, run `node --test tests/app.test.js` → pass. Commit.

### Task 5: Today screen and session

**Files:** Create `app/today.js`. Modify `app/app.js` (route `today` default, tab), `app/index.html` (tab 今 Today, script tags), `app/style.css`, `app/sw.js`.

**Interfaces — Consumes:** Task 3 `JiesuoWriter`, Task 4 `JiesuoJourney`, app context `{core, state, save, disp, esc, fmt, speak, canSpeak, markKnown, loadSentences, sentenceHtml, currentOrder, bands}`.
**Produces:** `JiesuoToday.create(ctx) -> {renderToday(), renderLesson()}`; routes `#today` and `#lesson`.

- [ ] Today: greeting by time of day; "Welcome back" when last day < yesterday; teaser card (first new item in a glowing square, meaning, "built from" chips with known parts in blue); summary line "N new things · M to review · about X minutes"; Start / Continue; done-today state with "Learn one more"; days learned count; journey path of milestones (Task 6).
- [ ] Lesson steps built once and stored in `state.lesson = {day, items, reviews, step, added: [], before: {coverage}}`: per new item `meet` (build animation, pinyin, speaker, meaning, example word or sentence) and `write` (watch then trace; words: memory per character), then `review` per due item (chars/parts: write from memory with pinyin+meaning prompt; words: pick the meaning of 4, distractors from other known words), then `finish`. A slim progress bar; "Skip writing" link on writing steps.
- [ ] Completing `write` of a new item → `markKnown`, add to `added`, `review[u] = schedule(undefined, true, today)`. Review result → `schedule(entry, mistakes <= 2 / first pick right, today)`. Miss copy: show the answer kindly.
- [ ] A lesson whose `day` is before today is resumed (not discarded); its finish counts for today.
- [ ] sw.js: add `journey.js`, `today.js`; bump VERSION. Verify a full session in the browser at 375 px. Commit.

### Task 6: Unlock moment, tomorrow, journey path

**Files:** Modify `app/today.js`, `app/style.css`.

- [ ] Finish screen: unlock sentence (all tokens pen blue, English, credit) via `unlockSentence`; else "Today's N open up M new words" (frontier growth); "+Y% of everyday Chinese" from `core.estimatedCoverage`; newly reached milestones celebrated once; tomorrow teaser (`pickNew` on the new known set, with known parts); "Keep going" (one more new item: meet + write) and "Done".
- [ ] `days` gets today on finish; `stats.unlocked` += 1 when a sentence unlocked; `stats.written` += new items written.
- [ ] Journey path on Today: milestones as a vertical line of small 田字格 squares, reached ones inked, the next one with its hint.
- [ ] Prefetch strokes for the next 9 new items when online.
- [ ] Verify finish screen and path in browser; tests pass. Commit.

### Task 7: Final verification

- [ ] Phone 375 px and desktop 1280 px walkthrough: Today → full session → finish → Today done state → item page back button → Map/Read unchanged.
- [ ] Offline: reload with network blocked after a visit; Today and a learned character's Write panel work.
- [ ] `node --test tests/app.test.js`, `pytest tests/test_strokes.py`.
- [ ] README "Using the app" updated (Today, writing, audio).
