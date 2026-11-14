# Jiesuo 粵 Phase 1 (Sounds and Tones) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/yue/` Cantonese app's foundation:
- the Jyutping and reading pipeline with its correctness checks
- recorded syllable audio
- stage 0 (tones, hearing drills, checked tones, initials, finals, reading and typing Jyutping)
- voice calibration and a Cantonese tone check, evaluated on labelled audio
- the Sounds screen

At the end of this phase the learner can start learning.

**Architecture:** A sister static app in `app/yue/` that loads language-neutral modules from `app/`
(`../tone.js` for pitch tracking, `../journey.js` for dates and Leitner boxes). Python
(`jiesuo/yue/`) builds verified data into `app/yue/data/` (one JSON file per licence) and
compressed syllable audio into `app/yue/audio/`. Pure logic lives in UMD modules tested with
`node --test`; DOM code stays in screen files.

**Tech Stack:** Python 3.10 (stdlib + `lameenc` for MP3, `fontTools` for the glyph check), plain
browser JS (no build step), `node --test`, `pytest`.

**Spec:** `docs/superpowers/specs/2026-11-14-cantonese-design.md` (phase 1 of §10). Later phases
get their own plans. Word readings, per-skill learner state (hear/read/type), word audio (Azure) and
words.hk use are phase 2, not this plan.

## Global Constraints

- **Leave the Mandarin app alone.** The only change is `app/sw.js` cache cleanup (Task 9),
  `app/tone.js` exporting `runs` (Task 4), and the cross-app link and file guard (Task 9). This
  must keep passing: `pytest && node --test tests/app.test.js tests/tone.test.js tests/handwriting.test.js`
- **Hong Kong Cantonese only:** Traditional characters in Hong Kong forms, Jyutping only, no 简 switch.
- **Storage and caches:** storage keys start with `jiesuo-yue-`; the service worker cache is
  `jiesuo-yue-v1`; the progress file carries `"lang": "yue"`.
- **Licences:** one JSON file per licence, each with a top-level `"licence"` string, as in
  `jiesuo/export_app.py`. Every new source is listed in `LICENSES.md` and `app/yue/licences/`.
- **Raw inputs:** go in `data/raw/yue/` (gitignored), with hashes in `data/yue/manifest.json`.
  The words.hk CSVs stay in `data/raw/wordshk/`; phase 1 does not read them.
- **Stage 0 soft gate:** words unlock at ≥ 85% on a 40-item mixed tone-identification check
  (34 of 40). "Move on anyway" is always offered.
- **Tone check labelling:** called a **check** only if, on held-out voices:
  - accuracy on decided items is ≥ 90%
  - no single confusion (want → got) is above 10% of that tone's items
  - "not sure" is said on ≤ 20% of items

  Otherwise it is a **guide**. The report says the voices are synthetic, so the result is an upper bound.
- **Mistakes:** they get a hint, never a penalty. No streaks, hearts, red crosses or "you missed a day".
- **Privacy:** recordings and calibration stay on the device.
- **No cloud audio in phase 1.** Word audio (Azure) is phase 2.
- **Commits:** no `Co-Authored-By` or other Claude attribution trailers (the learner's standing rule).

## Review Focus

1. **No microphone, permission denied, or a browser that can't record:** the say steps show a
   plain message and are skipped. Hearing and typing drills still work, and the lesson still
   completes (Task 11 test `lesson without a microphone still completes`).
2. **A syllable with no shipped clip, or a clip not yet cached while offline:**
   - drills never choose a syllable without a clip for the chosen voice, and fall back to another voice
   - offline, a failed play shows "this sound isn't downloaded yet" and skips the drill without
     counting it (Task 8 test `pick never returns a syllable without audio`; Task 10 test `failed playback skips without scoring`)
3. **Silence, noise, or a recording too short to judge:** the result is "didn't catch that, try
   again", never a tone verdict, and it doesn't count toward calibration or stats (Task 4 test `silence is not heard`; Task 12 test `unheard attempt is not recorded`).
4. **A calibration whose levels come out in the wrong order** (tone 1 not above 3, 3 not above 6,
   e.g. the learner said the anchors flat): it is rejected, the app names the anchor to redo, and the
   old profile is kept (Task 4 test `profile with levels out of order is rejected`).
5. **Typed Jyutping in odd shapes:** uppercase, extra spaces, tone digits stuck on or spaced
   (`Si 1`, `SI1`, ` si1 `) count as the same answer. A missing tone digit in a tone drill is
   marked "add the tone number", not wrong (Task 1 test `normalise accepts case and spacing`; Task 8 test `dictation without tone asks for the tone`).
6. **Progress files from the other app:** a Mandarin progress file loaded into `/yue/` (or the
   reverse) is refused with a message, and nothing is overwritten (Task 9 tests in both apps).

---

## File map

| File | Responsibility |
|---|---|
| `jiesuo/yue/__init__.py` | Package marker. |
| `jiesuo/yue/jyutping.py` | Parse, split and validate Jyutping. |
| `jiesuo/yue/sources.py` | Loaders for rime-cantonese, CC-Canto, CC-CEDICT readings, Unihan, HKCanCor. |
| `jiesuo/yue/readings.py` | Resolve character readings across sources, plus overrides and report. |
| `jiesuo/yue/export_audio.py` | Cantone WAV → MP3 for shipped voices, and `audio.json`. |
| `jiesuo/yue/export_app.py` | Write `app/yue/data/*.json` from the verified pipeline and the stage 0 content. |
| `scripts/fetch_yue_data.py` | Download raw inputs, record hashes. |
| `scripts/yue_tone_eval.js` | Tune and evaluate the tone check on Cantone, write the report, `tonecheck.json` and audio exclusions. |
| `data/yue/overrides.tsv` | Hand-kept reading decisions (form, reading, reason, source). |
| `data/yue/content/stage0.json` | Authored stage 0 units (text, anchors, sources). |
| `app/tone.js` | **Modified:** also export `runs(track, n)`. |
| `app/sw.js` | **Modified:** only delete caches named `jiesuo-v*`. |
| `app/yue/jyutping.js` | Browser twin of `jyutping.py`, plus answer matching. |
| `app/yue/tones.js` | Cantonese tone profile, classifier and check (pure). |
| `app/yue/drills.js` | Drill generation, scoring, adaptivity, unit pass and gate (pure). |
| `app/yue/lesson.js` | Stage 0 lesson composer (pure). |
| `app/yue/audio.js` | Play syllable clips, choose voices, prefetch (DOM). |
| `app/yue/speak.js` | Calibration and say panels (DOM). |
| `app/yue/sounds.js` | Sounds screen: tone ladder, chart, confusion picture (DOM). |
| `app/yue/today.js` | Today screen running stage 0 lessons (DOM). |
| `app/yue/app.js` | Shell: loading, state, routing, Progress screen, save and restore. |
| `app/yue/index.html`, `yue.css`, `sw.js`, `manifest.webmanifest`, `icons/`, `licences/` | App identity. |
| `tests/test_yue_*.py`, `tests/yue_*.test.js` | Tests. |

---

### Task 1: Jyutping (Python and JS twins)

**Files:**
- Create: `jiesuo/yue/__init__.py`, `jiesuo/yue/jyutping.py`, `app/yue/jyutping.js`
- Test: `tests/test_yue_jyutping.py`, `tests/yue_jyutping.test.js`

**Interfaces:**
- Produces (Python):
  - `INITIALS: tuple[str, ...]` (the 19 initials)
  - `FINALS: frozenset[str]`
  - `parse(syl: str) -> tuple[str, str, int]` returns (initial or `""`, final, tone 1–6) and raises `ValueError`
  - `split(text: str) -> list[str]` (`"mat1je5"` and `"mat1 je5"` both give `["mat1", "je5"]`)
  - `is_checked(syl) -> bool` (final ends in p/t/k)
  - `toneless(syl) -> str`
- Produces (JS, UMD global `JyutJyutping`, `module.exports` under node): the same functions in camelCase (`parse`, `split`, `isChecked`, `toneless`, `INITIALS`, `FINALS`), plus:
  - `normalise(text) -> string`: lowercase, trim, digits glued to the syllable, single spaces
  - `answerMatches(typed, target, {needTone}) -> "right" | "needTone" | "wrong"`

Exact values from spec §3:
- Initials: `b p m f d t n l g k ng h gw kw w z c s j`
- Finals, the full set:
  - `aa aai aau aam aan aang aap aat aak`
  - `a ai au am an ang ap at ak`
  - `e ei eu em en eng ep et ek`
  - `i iu im in ing ip it ik`
  - `o oi ou on ong ot ok`
  - `oe oen oeng oet oek eoi eon eot`
  - `u ui un ung ut uk`
  - `yu yun yut`
  - `m ng` (syllabic)
- `m` and `ng` with no initial are syllabic nasals (`m4`, `ng5`). `ng` followed by a final is the initial.

- [ ] **Step 1: Write the failing tests.** Python and JS share one table of cases.

```python
CASES = [("si1", ("s", "i", 1)), ("ngo5", ("ng", "o", 5)), ("ng5", ("", "ng", 5)), ("m4", ("", "m", 4)),
         ("gwong2", ("gw", "ong", 2)), ("jyut6", ("j", "yut", 6)), ("aa3", ("", "aa", 3)), ("sik6", ("s", "ik", 6))]
def test_parse_known_syllables(): assert all(parse(s) == want for s, want in CASES)
def test_parse_rejects_bad(): for bad in ["si7", "si", "xyz1", "sx1", ""]: pytest.raises(ValueError, parse, bad)
def test_split_glued_and_spaced(): assert split("mat1je5") == split("mat1 je5") == ["mat1", "je5"]
def test_checked(): assert is_checked("sik1") and is_checked("sek3") and not is_checked("si1")
def test_every_rime_syllable_parses():  # skipped when data/raw/yue is absent
    ...every reading in jyut6ping3.chars.dict.yaml parses
```

  JS: the same `CASES`, plus two more tests:
  - `normalise accepts case and spacing`: `normalise(" SI 1 ") === "si1"` and `normalise("Nei5  Hou2") === "nei5 hou2"`.
  - `answerMatches`: `("si", "si1", {needTone:true}) → "needTone"`, `("si3", "si1", …) → "wrong"`, `("SI1", "si1", …) → "right"`.
- [ ] **Step 2: Run them.** `pytest tests/test_yue_jyutping.py -v` and `node --test tests/yue_jyutping.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement both modules.** Parse by trying the two-letter initials (`gw kw ng`) before the one-letter ones, and accept only when the remainder is in `FINALS`.
- [ ] **Step 4: Run them again.** Expected: PASS (the rime test is skipped until Task 2).
- [ ] **Step 5: Commit.** `git add jiesuo/yue app/yue/jyutping.js tests/test_yue_jyutping.py tests/yue_jyutping.test.js && git commit -m "yue: Jyutping parsing in Python and JS"`

### Task 2: Fetch the Cantonese sources

**Files:**
- Create: `scripts/fetch_yue_data.py`, `data/yue/manifest.json` (generated, committed)
- Modify: `requirements.txt` (add `lameenc==1.8.1`, `fontTools==4.55.0`)
- Test: `tests/test_yue_fetch.py`

**Interfaces:**
- Produces: `data/raw/yue/` with these names. Later tasks rely on exactly these.

| Name in `data/raw/yue/` | URL (pinned) |
|---|---|
| `rime_chars.dict.yaml` | `https://raw.githubusercontent.com/rime/rime-cantonese/259f0e48bba840c3a2e0d117539e96937f3d89bc/jyut6ping3.chars.dict.yaml` |
| `rime_words.dict.yaml` | same commit, `jyut6ping3.words.dict.yaml` |
| `rime_LICENSE-CC-BY.txt` | same commit, `LICENSE-CC-BY` |
| `cccanto.zip` | `https://cantonese.org/cccanto-170202.zip` |
| `cccedict_canto_readings.zip` | `https://cantonese.org/cccedict-canto-readings-150923.zip` |
| `Unihan.zip` | `https://www.unicode.org/Public/16.0.0/ucd/Unihan.zip` |
| `hkcancor-utf8.zip` | `https://raw.githubusercontent.com/fcbond/hkcancor/39aeadf920e0b5ca93d0ad7792c59e740e7bdd65/data/hkcancor-utf8.zip` |
| `hkcancor_LICENSE.txt` | same commit, `data/LICENSE` |
| `cantone/<voice>/<syl>.wav` | every file listed in `https://huggingface.co/api/datasets/AlienKevin/cantone/revision/9ae2dec425f472255c1e146cd6b3f428e7c21e80` (`siblings`), from `https://huggingface.co/datasets/AlienKevin/cantone/resolve/9ae2dec425f472255c1e146cd6b3f428e7c21e80/<path>` |
| `NotoSerifHK.otf` | Noto Serif HK Regular from the Google Fonts GitHub repo (`ofl/notoserifhk`), pinned to the commit current when the task is done (record it in the script), for the glyph-coverage test |

- [ ] **Step 1: Write the failing test.** `test_manifest_lists_every_source`: every key in `SOURCES`, plus `"cantone"` and `"wordshk"`, is in `data/yue/manifest.json`, with `sha256` and `bytes`.
- [ ] **Step 2: Run it.** `pytest tests/test_yue_fetch.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `fetch_yue_data.py`, modelled on `scripts/fetch_data.py`.**
  - The `--check` flag works the same way.
  - Cantone is recorded as one manifest entry: `sha256` over the sorted lines `"<path> <sha256>"`, plus a `files` count. Existing files are skipped, so a rerun resumes. Use a pause of 0.05 s between requests.
  - The words.hk CSVs are not downloaded. The script hashes `data/raw/wordshk/all-*.csv` and `wordpos-*.csv` if present, records them as `"wordshk"`, and prints a clear note if they are missing.
- [ ] **Step 4: Run it.** `python scripts/fetch_yue_data.py`, then `pytest tests/test_yue_fetch.py tests/test_yue_jyutping.py -v`. Expected: PASS, including the rime syllable test.
- [ ] **Step 5: Commit** the script, manifest, requirements and test.

### Task 3: Resolve character readings

**Files:**
- Create: `jiesuo/yue/sources.py`, `jiesuo/yue/readings.py`, `data/yue/overrides.tsv` (header row only: `form\treading\treason\tsource`)
- Test: `tests/test_yue_readings.py`

**Interfaces:**
- Produces (`sources.py`):
  - `load_rime_chars() -> dict[str, list[tuple[str, float | None]]]`: char → [(jyutping, weight percent or None)]. None means a main reading in rime's own convention.
  - `load_cccanto_chars() -> dict[str, set[str]]`: single-character entries from both CC-Canto files, with Jyutping from `{...}`.
  - `load_unihan() -> dict[str, set[str]]`: from `kCantonese`.
  - `load_hkcancor() -> list[list[tuple[str, str, str]]]`: sentences of (word, pos, jyutping). Syllables are spaced via `jyutping.split`, so `"mat1je5"` becomes `"mat1 je5"`.
- Produces (`readings.py`):
  - `Resolution = namedtuple("Resolution", "form main others status evidence")`, where `status` is one of `"agreed"`, `"corpus"`, `"override"`, `"unresolved"`.
  - `resolve_char(ch, srcs) -> Resolution`
  - `load_sources() -> dict` (the four loaders)
  - `write_report(resolutions, path)` writes `reports/yue_readings.md`

Rules (spec §6):
1. If `ch` is in `overrides.tsv`, then `main` is that reading, with status `override`.
2. The rime main reading is the entry with no weight; if several have none, the highest-weight entry. If that reading also appears in CC-Canto or Unihan, and HKCanCor does not contradict it, the status is `agreed`.
   - "Contradict" means: `ch` occurs as a one-character word at least 5 times in HKCanCor, and its most frequent reading there differs.
3. Otherwise, if HKCanCor has at least 5 one-character tokens of `ch` and its top reading appears in at least one dictionary source, that reading is `main`, with status `corpus`.
4. Otherwise the status is `unresolved`.

`others` lists every other reading in any source, ordered by source count.

- [ ] **Step 1: Write the failing tests** with exact values verified in exploration.

```python
def test_tone_anchor_sets_resolve():  # spec §3 stage 0 anchors
    for ch, want in zip("詩史試時市事分粉訓墳奮份", ["si1","si2","si3","si4","si5","si6","fan1","fan2","fan3","fan4","fan5","fan6"]):
        r = resolve_char(ch, SRCS); assert r.main == want and r.status in ("agreed", "corpus", "override")
def test_colloquial_readings():
    assert resolve_char("佢", SRCS).main == "keoi5"; assert resolve_char("喺", SRCS).main == "hai2"
def test_two_readings_are_both_kept():
    r = resolve_char("生", SRCS); assert {r.main, *r.others} >= {"saang1", "sang1"}
def test_override_wins(tmp_path): ...a temp overrides file pointing 試 at si5 gives status "override"
def test_unresolved_is_reported(tmp_path): ...a synthetic source set with disagreement → "unresolved" and listed in the report
```

  - `SRCS` is loaded once per module. Skip the module if `data/raw/yue` is absent.
  - If a real anchor turns out `unresolved` (for example 奮 fan5, where rime's main reading needs checking), add an `overrides.tsv` line citing words.hk or CC-Canto, never a guess. Then the test passes through the override.
- [ ] **Step 2: Run them.** `pytest tests/test_yue_readings.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement the loaders and the resolver.** Read the zips with `zipfile`, without extracting them.
- [ ] **Step 4: Run them again.** Expected: PASS. `python -m jiesuo.yue.readings` writes `reports/yue_readings.md` with counts per status and the full unresolved list.
- [ ] **Step 5: Commit**, including the report and any overrides with their sources.

### Task 4: Cantonese tone classifier

**Files:**
- Modify: `app/tone.js` (extract `runs(track, n)` from `syllables`, export it; `syllables` uses it, with no behaviour change)
- Create: `app/yue/tones.js`
- Test: `tests/yue_tones.test.js` (and the existing `tests/tone.test.js` must still pass)

**Interfaces:**
- Consumes: `JiesuoTone.pitchTrack(samples, rate)` and `JiesuoTone.runs(track, n) -> [[startFrame, endFrame], …]`
- Produces (UMD global `JyutTones`):
  - `segmentsHz(track, n) -> number[][]`: voiced pitches in Hz per syllable.
  - `level(segHz) -> number`: semitones re 55 Hz, the median of the middle 60% of frames.
  - `profileFrom({si1, si3, si6, si4, si2, si5}: number[][]) -> Profile`. `Profile = {t1, t3, t6, t4lo, t2hi, t5hi}` in semitones re 55 Hz:
    - `t1`, `t3`, `t6`: `level` of each anchor
    - `t4lo`: median of the last 30% of `si4`
    - `t2hi`, `t5hi`: median of the last 30% of `si2` and `si5`
  - `validProfile(p) -> {ok: true} | {ok: false, redo: "si1" | "si3" | "si6" | "si4" | "si2" | "si5"}`. It requires:
    - `t1 - t3 ≥ 1`, `t3 - t6 ≥ 1`, `t6 - t4lo ≥ 0.5`
    - `t2hi - t5hi ≥ 1`, `t2hi > t3`
    - `redo` names the first anchor involved in a failed check
  - `classify(segHz, profile, {allowed = [1,2,3,4,5,6], params = DEFAULTS}) -> {tone, unsure, margin, scores, points}`
  - `check(samples, rate, expected: [{syl, tone}], profile, params) -> {heard, results: [{syl, want, got, ok, unsure, points}]}`
    - For checked syllables (`JyutJyutping.isChecked`), `allowed` is `[1, 3, 6]`. *(Plan-level call: spec §5 says checked tones are detected by duration and the final stop. Since the expected syllable is always known, restricting the choices is simpler and more robust than detecting stops from audio.)*
    - `heard` is false when voiced frames are under 5%, or a syllable has fewer than 8 voiced frames.
  - `DEFAULTS = {shift: 1.5, step: 0.25, unsure: 0.35}`: placeholder values, tuned in Task 5.

Templates (5 points, in profile terms; `mid(a, b) = (a + b) / 2`), following the Chao values in spec §3:
- 1: `[t1 ×5]`
- 2: `[t6, t6, mid(t6, t3), t3, t2hi]`
- 3: `[t3 ×5]`
- 4: `[t6, mid(t6, t4lo), t4lo, t4lo, t4lo]`
- 5: `[t6, t6, mid(t6, t5hi), t5hi, t5hi]`
- 6: `[t6 ×5]`

Score = minimum over a global shift `s ∈ [−shift, shift]` (in `step` increments) of the mean absolute
difference between the observed 5 points (`JiesuoTone.resample` of the semitone values) and
template + s. `margin` = second-best score − best score. `unsure` when `margin < params.unsure`.

**Why profile heights instead of contour alone:** tones 1, 3 and 6 differ only in height (spec Constraints).

- [ ] **Step 1: Write the failing tests.** Use synthetic voices, built with the same `syllable()` helper as `tests/tone.test.js` (copy it into the test file).

```js
// A voice with levels 55/33/22 at base 150 Hz: t1 = +6 st, t3 = +2, t6 = 0, t4 falls to -3, t2 rises to +6, t5 rises to +2.
test("level tones are told apart by height after calibration", …)          // si1/si3/si6 → 1/3/6
test("rising tones 2 and 5 are told apart by end height", …)
test("tone 4 low fall is recognised", …)
test("checked syllable only chooses among 1, 3, 6", …)                     // a falling contour on sik → never 4
test("profile with levels out of order is rejected", …)                    // t3 above t1 → {ok:false, redo:"si1"}
test("silence is not heard", …)                                            // zeros → heard:false
test("an ambiguous contour halfway between 3 and 6 is unsure", …)
test("a speaker drifting 1 semitone sharp is still classified", …)         // whole utterance +1 st
```

- [ ] **Step 2: Run them.** `node --test tests/yue_tones.test.js tests/tone.test.js`. Expected: yue FAIL, Mandarin PASS.
- [ ] **Step 3: Implement.** Do the `runs` extraction in `app/tone.js` first, then `app/yue/tones.js`.
- [ ] **Step 4: Run them again.** Expected: all PASS.
- [ ] **Step 5: Commit.**

### Task 5: Tune and evaluate the tone check on Cantone; flag bad clips

**Files:**
- Create: `scripts/yue_tone_eval.js`, writing:
  - `reports/yue_tone_check.md`
  - `app/yue/data/tonecheck.json` (licence `"MIT: Jiesuo (computed)"`)
  - `data/yue/audio_exclusions.json`
- Modify: `app/yue/tones.js` (`DEFAULTS` set to the tuned values)
- Test: `tests/yue_tone_eval.test.js` (checks the outputs' shape and the labelling rule)

**Interfaces:**
- Consumes: `JyutTones`, `JiesuoTone.pitchTrack`, WAVs in `data/raw/yue/cantone/` (16-bit PCM mono 16 kHz; parse the RIFF header in the script).
- Produces:
  - `tonecheck.json = {licence, mode: "check" | "guide", heldOutAccuracy, unsureRate, confusions: [[want, got, share], …], params: {shift, step, unsure}}`
  - `audio_exclusions.json = {"<voice>/<syl>": "<reason>"}`

Voice split:
- Tune on `googleA`, `googleB`, `microsoftHiuGaai` and `amazonHiuJin`.
- Hold out `googleC`, `googleD`, `microsoftHiuMaan`, `microsoftWanLung`, `appleSinji` and `appleAasing`.

Each voice's profile comes from its own `si1 si3 si6 si4 si2 si5` clips. Grid-search `shift ∈ {0.5, 1, 1.5, 2}` and `unsure ∈ {0.15, 0.25, 0.35, 0.5}` on the tuning voices only. The objective is decided-accuracy × (1 − unsureRate).

- **Labelling rule (Global Constraints):** the mode is `"check"` only when all three thresholds hold on held-out voices.
- **Exclusions:** a clip in a voice to be shipped (Task 6) is excluded when the classifier decides a different tone than its filename, with `margin ≥ 2 × unsure`. The reason records want, got and margin.

- [ ] **Step 1: Write the failing test.** Run `labelMode` (exported from the script) on fixed confusion tables:
  - 91% accuracy, max confusion 8%, 10% unsure → `"check"`
  - 91% accuracy with a 12% 3→6 confusion → `"guide"`
  - 95% accuracy, 25% unsure → `"guide"`

  The test also checks that `tonecheck.json`, if present, has every field listed above.
- [ ] **Step 2: Run it.** `node --test tests/yue_tone_eval.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the script.** The report gives:
  - the per-tone confusion matrix for held-out voices, plus one per voice family
  - the chosen parameters
  - the exclusions list
  - the sentence "These voices are synthetic; real voices, especially in a noisy room, will do worse."
- [ ] **Step 4: Run it.** `node scripts/yue_tone_eval.js && node --test tests/yue_tone_eval.test.js`. Expected: PASS. Read the report: whatever the mode comes out as is the honest result. Do not tune on held-out voices to reach `"check"`.
- [ ] **Step 5: Commit** the script, report, `tonecheck.json`, exclusions and tuned defaults.

### Task 6: Ship syllable audio

**Files:**
- Create: `jiesuo/yue/export_audio.py`, writing:
  - `app/yue/audio/<voice>/<syl>.mp3`
  - `app/yue/data/audio.json` (licence `"MIT: Cantone (AlienKevin/cantone), synthetic voices from Amazon, Google, Microsoft"`)
- Test: `tests/test_yue_audio.py`

**Interfaces:**
- Consumes: `data/raw/yue/cantone/`, `data/yue/audio_exclusions.json`, and `load_rime_chars()` (the syllable inventory).
- Produces: `audio.json = {licence, voices: [{id, label}], clips: {"<syl>": [voiceIndex, …]}}`.
  - Shipped voices, in this order: `googleA` ("Voice 1, female"), `googleB` ("Voice 2, male"), `microsoftHiuGaai` ("Voice 3, female").
  - A syllable is listed only if it is in rime's inventory and has at least one non-excluded clip.
  - MP3 encoding: mono, 16 kHz, 24 kbps (`lameenc`).

- [ ] **Step 1: Write the failing tests.**
  - `test_anchor_syllables_have_two_voices`: every syllable in `si1..si6` and `fan1..fan6` has ≥ 2 voices.
  - `test_no_excluded_clip_is_listed`
  - `test_every_listed_clip_exists_and_is_small`: each file exists, is < 12 KB, and the total of `app/yue/audio` is < 40 MB.
- [ ] **Step 2: Run them.** `pytest tests/test_yue_audio.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** Skip files that already exist, so a rerun is fast.
- [ ] **Step 4: Run them again.** `python -m jiesuo.yue.export_audio && pytest tests/test_yue_audio.py -v`. Expected: PASS.
- [ ] **Step 5: Commit** the code, the audio and `audio.json`.

### Task 7: Stage 0 content and verified app data

**Files:**
- Create: `data/yue/content/stage0.json` (authored), `jiesuo/yue/export_app.py`
- Writes:
  - `app/yue/data/stage0.json` (licence `"MIT: Jiesuo"`)
  - `app/yue/data/readings.json` (licence `"CC BY-SA 4.0: readings from rime-cantonese (CC BY 4.0), checked against CC-Canto (CC BY-SA 3.0), Unihan, HKCanCor (CC BY 4.0)"`)
- Test: `tests/test_yue_content.py`

**Interfaces:**
- Produces:

```
stage0.json = {licence, sources: {id: citation}, units: [Unit]}
Unit = {id, title, teach: [{text, source}], anchors: [[char, syl]], tones: [int], drills: [type],
        syllables: [syl], minimalSets: [[syl, …]]}
readings.json = {licence, chars: {char: [main, …others]}}   // only chars used in stage0.json
```

  - Unit ids, in order: `tones-six`, `tones-hear`, `checked`, `initials`, `finals`, `jyutping`, `say`.
  - Drill types (Task 8): `tone-id`, `same-diff`, `syl-id`, `dictation`, `read`, `say`.
  - Each unit's `syllables` and `minimalSets` are **generated** by `export_app.py` from the audio inventory. Only syllables with ≥ 2 shipped voices are used.
    - `tones-hear`: syllables that exist in all 6 tones, e.g. `si`, `fan`, `jau`, `se`.
    - `checked`: `sik1 sek3 sik6` and similar stop-final syllables.
    - `initials`: minimal sets that differ only in aspiration (`baa1/paa1`, `daa1/taa1`, `gaa1/kaa1`, `gwaa1/kwaa1`, `zaa1/caa1`) and in `ng-` vs no initial.
    - `finals`: `saam1/sam1` style long-short pairs, `-m/-n/-ng`, `-p/-t/-k`, `oe/eo/yu`, and syllabic `m4` and `ng5`.
- Authored text follows spec §3. Cite sources by id. Keep explanations short and factual:
  - `matthews-yip-2011`: Matthews & Yip, *Cantonese: A Comprehensive Grammar*, 2nd ed., ch. 1
  - `lshk-1997`: LSHK, *粵語拼音字表*, Jyutping scheme
  - `bauer-benedict-1997`: Bauer & Benedict, *Modern Cantonese Phonology*
- Facts that must appear: the Chao values `55 (53) / 35 / 33 / 21 (11) / 23 / 22`; checked tones 1/3/6 with short stops; Jyutping `b` sounds like an unaspirated English "p"; finals -p/-t/-k are unreleased.
- **Plan-level call:** voice calibration happens at the first say step (in unit `tones-six`), not in unit 7. Unit `say` practises whole syllables and two-syllable pairs. This resolves the spec's ordering of "saying drills" in every unit before calibration in unit 7.

- [ ] **Step 1: Write the failing tests.**

```python
def test_every_anchor_matches_its_resolved_reading(): # char's resolved main == syl, or syl in others with a teach note
def test_every_teach_line_cites_a_known_source():
def test_every_syllable_has_two_voices_of_audio():
def test_units_are_in_spec_order(): assert [u["id"] for u in UNITS] == ["tones-six","tones-hear","checked","initials","finals","jyutping","say"]
def test_tone_facts_present(): # "55", "35", "33", "21", "23", "22" in tones-six text; "unreleased" in finals text
def test_every_character_renders_in_the_font(): # fontTools cmap of data/raw/yue/NotoSerifHK.otf covers all chars in stage0 + readings
def test_no_unresolved_reading_is_taught():
```

- [ ] **Step 2: Run them.** `pytest tests/test_yue_content.py -v`. Expected: FAIL.
- [ ] **Step 3: Write `data/yue/content/stage0.json` and `export_app.py`.**
- [ ] **Step 4: Run them again.** `python -m jiesuo.yue.export_app && pytest tests/test_yue_content.py -v`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 8: Drills engine (pure)

**Files:**
- Create: `app/yue/drills.js`
- Test: `tests/yue_drills.test.js`

**Interfaces:**
- Consumes: `stage0.json`, `audio.json`, `JyutJyutping`.
- Produces (UMD `JyutDrills`):
  - `createDrills({stage0, audio}) -> D`
  - `D.pick(unitId, stats, rng, {review = false, offlineClips = null}) -> Drill`
    - `Drill = {type, unit, target, options, voice, gate}`
    - `target` is a syllable, or for `same-diff` a pair `[a, b]`
    - `options` are what the learner chooses among
    - `voice` is the index of a voice that has the target's clips
  - `D.score(drill, answer) -> "right" | "wrong" | "needTone"`
  - `record(stats, drill, verdict, day) -> stats`, immutable. `needTone` is not recorded.
  - `unitPassed(stats, unitId) -> boolean`: the unit's last 20 recorded drills are ≥ 80% right.
  - `gate(stats) -> {passed, right, count}`: over the last 40 drills with `gate: true` (mixed `tone-id`, all six tones, from `tones-hear` onward); passed when `count === 40 && right >= 34`.
  - `confusions(stats) -> [[want, got, count], …]`, most frequent first.
  - `emptyStats() -> {byUnit: {}, pairs: {}, gateLog: [], tonePairs: {}}`

Adaptivity: when choosing tone targets, weight each tone by `1 + 3 × errorRate` of the pairs it
appears in. The prior weight is 2 for the pairs `3-6, 2-5, 4-6, 1-3, 5-6` (spec §3), and 1 otherwise.

- [ ] **Step 1: Write the failing tests.**

```js
test("pick never returns a syllable without audio for the chosen voice", …)        // 500 picks, seeded rng
test("pick with offlineClips only uses cached clips", …)
test("confusable tone pairs come up more often", …)                               // 3-6 share > uniform share over 2000 picks
test("a learner who confuses 2 and 5 gets more 2/5 drills", …)
test("dictation without tone asks for the tone", …)                               // score → "needTone", record ignores it
test("unitPassed needs 20 drills at 80%", …)
test("gate passes at 34 of 40 and not at 33", …)
test("checked unit only offers tones 1, 3, 6", …)
```

- [ ] **Step 2: Run them.** `node --test tests/yue_drills.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** with a seeded `rng` parameter (`() => number`), so the tests are deterministic.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 9: App shell, identity and the cross-app guards

**Files:**
- Create:
  - `app/yue/index.html`, `app/yue/app.js`, `app/yue/yue.css`, `app/yue/sw.js`
  - `app/yue/manifest.webmanifest`, `app/yue/icons/*`
  - `app/yue/licences/index.html` plus licence texts (rime CC BY, CC-Canto CC BY-SA, HKCanCor CC BY, Unihan, Cantone MIT, Noto OFL)
- Modify:
  - `app/sw.js`: in `activate`, delete only keys matching `/^jiesuo-v\d+$/` that differ from `VERSION`
  - `app/app.js`: the import refuses `obj.lang === "yue"` with the message "This file is from the Cantonese app. Open it there."; a link to `../yue/` (or `yue/`) on the Progress screen
  - `scripts/make_icons.py`: takes `--glyph 粵 --out app/yue/icons`
- Test: `tests/yue_app.test.js`, plus one test added to `tests/app.test.js`

**Interfaces:**
- Consumes: `JiesuoJourney` (`dayKey`, `schedule`, `BOXES`) from `../journey.js`.
- Produces:
  - In `app/yue/app.js`, a pure, exported helper module section, `JyutState`:
    - `serialise(state) -> {lang: "yue", v: 1, …}`
    - `deserialise(obj) -> state | throws Error("not-yue")`
    - `emptyState() -> {stats: emptyStats(), profile: null, voice: 0, lesson: null, days: [], gate: null}`
  - Screens are routed by hash: `#today` (home), `#sounds`, `#progress`.
- Identity:
  - `<html lang="zh-HK">`, title "Jiesuo 粵"
  - the font comes from Google Fonts "Noto Serif HK" (400, 700); `yue.css` sets `--zh: "Noto Serif HK", serif` and imports `../style.css` for the exercise-book look
  - the manifest has `scope: "./"`, `start_url: "./"`, name "Jiesuo 粵"
  - the service worker caches the shell and data, and caches audio as it is used
  - storage key `jiesuo-yue-progress-v1`

- [ ] **Step 1: Write the failing tests.**
  - `serialise round-trips` and `a Mandarin progress file is refused` (`deserialise({known: []})` throws `not-yue`), in `tests/yue_app.test.js`.
  - In `tests/app.test.js`: `a Cantonese progress file is refused by the Mandarin app`.
  - A static check that `app/sw.js` no longer deletes caches that don't start with `jiesuo-v`: read the file text and assert the filter regex.
- [ ] **Step 2: Run them.** `node --test tests/yue_app.test.js tests/app.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the shell, the Progress screen and the guards.**
  - The Progress screen shows the stage 0 stats per unit, the gate result, "Save progress to a file", "Restore from a file", "Send to my other device" (share sheet, as in the Mandarin app) and a link to the Mandarin app.
- [ ] **Step 4: Run them again.** Expected: PASS. Then run `pytest && node --test tests/app.test.js tests/tone.test.js tests/handwriting.test.js`. Expected: all Mandarin tests pass.
- [ ] **Step 5: Add a preview config and open the app.** Add a `.claude/launch.json` entry `{"name": "jiesuo", "runtimeExecutable": "python", "runtimeArgs": ["-m", "http.server", "8000", "-d", "app"], "port": 8000}` and open `/yue/` in the preview. Expected: the shell loads, there are no console errors, and the Mandarin app at `/` still works.
- [ ] **Step 6: Commit.**

### Task 10: Audio player and the Sounds screen

**Files:**
- Create: `app/yue/audio.js`, `app/yue/sounds.js`
- Test: `tests/yue_audio_player.test.js` (pure parts only)

**Interfaces:**
- Produces (`audio.js`, global `JyutAudio`):
  - `init(audioJson)`
  - `clipUrl(syl, voice) -> string | null` (`"audio/<voiceId>/<syl>.mp3"`)
  - `voicesFor(syl) -> number[]`
  - `play(syl, {voice, rate = 1}) -> Promise<"played" | "failed">`
  - `prefetch(syls)`
  - `afterPlay(result, drill) -> {skip: boolean, message}`, pure: `"failed"` gives `{skip: true, message: "This sound isn't downloaded yet"}`
- `sounds.js` renders `#sounds`:
  - **Tone ladder:** an SVG with six lines at Chao heights. Each tone label plays `si1…si6` in the current voice.
  - **Chart:** initials (rows) × finals (columns). A cell exists only if some tone of it has audio; tapping a cell opens its six tones (missing ones greyed).
  - **Your mix-ups:** the top 3 `confusions(stats)`, in plain words ("You hear tone 6 as tone 3 most often"), each with a button that starts 10 drills on that pair.
  - **Voice:** a picker (Voice 1/2/3).

- [ ] **Step 1: Write the failing tests.** `clipUrl returns null when no clip`, `voicesFor follows audio.json`, and `failed playback skips without scoring` (`afterPlay`).
- [ ] **Step 2: Run them.** `node --test tests/yue_audio_player.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement both files.**
- [ ] **Step 4: Run them again.** Expected: PASS. In the preview, check that:
  - the ladder plays si1…si6
  - the chart cell `s × i` opens and plays all six tones
  - the console has no errors
  - a phone-width screenshot (375 px) has no horizontal scroll
- [ ] **Step 5: Commit.**

### Task 11: Today: stage 0 lessons

**Files:**
- Create: `app/yue/lesson.js` (pure), `app/yue/today.js` (DOM)
- Test: `tests/yue_lesson.test.js`

**Interfaces:**
- Consumes: `JyutDrills`, `JiesuoJourney.dayKey`.
- Produces (`JyutLesson`):
  - `compose(stage0, stats, {hasMic, calibrated}) -> {unit, steps}`
  - `Step = {kind: "teach", lines} | {kind: "drill", drill} | {kind: "calibrate"} | {kind: "gate"} | {kind: "done", summary}`

Lesson rules:
- **Current unit:** the first unit for which `unitPassed` is false.
- **Steps:** one teach block for the current unit (first time only), then about 30 drills: 70% current unit, 30% review of passed units.
- **Say steps:** 3 `say` drills when `hasMic`. If the mic is there but there is no calibration, a `calibrate` step comes first.
- **Gate:** after `tones-hear` passes, the next lesson includes the 40-item `gate`. When the gate fails, the summary names the most confused pair and offers "Move on anyway". The lesson continues either way.
- **End:** `done` with what was gained ("You can now tell tone 3 from tone 6 9 times in 10"). Missed days are never mentioned.
- **Unit `say`:** say steps use whole syllables and two-syllable pairs from the unit's `syllables`.

- [ ] **Step 1: Write the failing tests.**

```js
test("a new learner starts on tones-six with a teach block", …)
test("lesson has about 30 drills, 70% current unit once a unit has passed", …)
test("lesson without a microphone still completes", …)        // no say/calibrate steps, ends with done
test("calibration comes before the first say drill", …)
test("gate appears after tones-hear passes", …)
test("summary never mentions missed days", …)                  // no /miss|streak|lost/i in any summary text
```

- [ ] **Step 2: Run them.** `node --test tests/yue_lesson.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `lesson.js` and `today.js`.**
  - Each drill type gets one card layout: play button, choices or text box, a hint on a wrong answer (replay both sounds side by side), never a red cross.
  - Stats are saved after every drill, so closing mid-lesson keeps progress.
- [ ] **Step 4: Run them again.** Expected: PASS. In the preview, go through a full `tones-six` lesson with the keyboard and mouse, and confirm the done screen and the saved stats survive a reload.
- [ ] **Step 5: Commit.**

### Task 12: Say: calibration and the tone check panel

**Files:**
- Create: `app/yue/speak.js`
- Test: `tests/yue_speak.test.js` (pure helpers)

**Interfaces:**
- Consumes: `JyutTones`, `tonecheck.json`, `JyutAudio`.
- Produces (`JyutSpeak`):
  - `calibrationPanel(el, {onDone(profile)})`: records `si1, si3, si6, si4, si2, si5` one at a time, each after hearing the model clip. It runs `validProfile`; on `{ok: false, redo}` it asks only for that anchor again and keeps any old profile.
  - `sayPanel(el, {expected: [{syl, tone}], profile, mode, onResult})`
  - `verdictText(result, mode) -> string`, pure: `unsure` gives "Not sure, try once more"; `heard: false` gives "Didn't catch that, try again"; in mode `"guide"` the result is worded as a guide ("Sounded like tone 3").
  - `shouldRecord(result) -> boolean`: false when not heard or unsure.

Each attempt draws the learner's pitch over the tone template on the calibrated ladder (adapting the SVG from `app/speak.js`). Recording stays on the device; a line says so.

- [ ] **Step 1: Write the failing tests.** `verdictText` for every case above, and `unheard attempt is not recorded` (`shouldRecord({heard: false}) === false`).
- [ ] **Step 2: Run them.** `node --test tests/yue_speak.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Without a microphone, the panel shows "Speaking practice needs a microphone and a browser that can record." and calls `onResult({skipped: true})`.
- [ ] **Step 4: Run them again.** Expected: PASS. In the preview, check that the calibration screen walks through all six anchors and that a denied mic permission shows the message.
- [ ] **Step 5: Commit.**

### Task 13: Licences, README and final verification

**Files:**
- Modify: `LICENSES.md` (every new source and licence, including words.hk for later phases), `README.md` (a "Cantonese (`/yue/`)" section: what phase 1 teaches, the rebuild commands, the tone-check result in one line with a link to `reports/yue_tone_check.md`, and known limitations)
- Create: `app/yue/licences/` texts, if not finished in Task 9

- [ ] **Step 1: Document the rebuild order in the README.**

```
python scripts/fetch_yue_data.py
python -m jiesuo.yue.readings
node scripts/yue_tone_eval.js
python -m jiesuo.yue.export_audio
python -m jiesuo.yue.export_app
pytest && node --test tests/*.test.js
```

- [ ] **Step 2: Run the whole suite.** `pytest && node --test tests/*.test.js`. Expected: all pass.
- [ ] **Step 3: Check in the preview.** Phone width and desktop, light and dark: Today, Sounds and Progress at `/yue/`; offline after one visit (reload with the network off, and the shell and played clips still work); the Mandarin app at `/` unchanged.
- [ ] **Step 4: Commit.** `git commit -m "yue: phase 1 docs and licences"`
