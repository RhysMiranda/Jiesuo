# Jiesuo 粵: Hong Kong Cantonese, from the tones up — design

Date: 2026-11-14. Builds on `main` at 1e87599.

## Intent

The learner wants to become a fluent **Hong Kong Cantonese** speaker and writer. They will use it:

- in **League of Legends voice chat** with Hong Kong friends: fast, overlapping, noisy speech, full
  of slang, with English game words mixed into Cantonese sentences;
- in **online work**: meetings and typed messages.

So the skills, in priority order:

1. understanding fast, casual speech;
2. speaking with correct tones;
3. typing colloquial written Cantonese in Traditional characters (佢喺邊呀, not 他在哪裡);
4. reading what friends and colleagues type.

They know Mandarin to about HSK 2 but chose to **start fresh**: the course assumes no Mandarin.
It must start from the very basics (sounds and tones) and teach only correct material. Learning
something wrong is the main failure to avoid.

This is a personal tool. The learner is the only intended user, but the repo stays public and
open-source like the Mandarin app.

## Goals

1. **Sound foundation first.** Before any vocabulary, the learner can hear and say the 6 tones
   (and the 3 short "checked" tones), the 19 initials and the finals, and can read and type
   Jyutping.
2. **Listening to real speech.** Natural-speed phrases, sentence-final particles (呀 啦 喎 囉 咩 㗎 …),
   which carry most of the attitude in casual Cantonese, and recognition of "lazy sounds" (懶音).
3. **Speaking with feedback.** A tone check calibrated to the learner's own voice.
4. **Typing and reading colloquial written Cantonese** in Hong Kong Traditional forms.
5. **Vocabulary and grammar in a useful order.** Spoken Hong Kong frequency first, plus topic
   tracks for gaming, online work and casual chat.
6. **Correctness you can trust.** Every reading is checked against independent sources. Every
   example sentence is either found in a real source or visibly marked as unchecked.
7. **The Jiesuo feel.** A daily lesson, no guilt mechanics, mistakes get a hint and never a
   penalty, and progress you can see. The same standard as the 2026-11-13 joyful-journey design.

## Non-goals

- Bridging from Mandarin ("you know 我 in Mandarin…"). The learner chose to start fresh.
- Guangzhou Cantonese or Simplified characters. There is no 简 switch.
- Yale or other romanizations. Jyutping only.
- A full formal written Chinese (書面語) track. Word pages show the formal equivalent (佢 ↔ 他),
  and nothing more for now.
- Handwriting as a required skill. It is optional, and only for characters with stroke data.
- Accounts, servers, sync, push notifications. The app stays static and offline, like the Mandarin app.
- Changing the Mandarin app. It must keep working exactly as it does now.
- A research-grade coverage evaluation like the Mandarin phase reports. A light evaluation is enough (see Evaluation).

## Anti-goals (failure even if it works)

- **Wrong content taught confidently:** a wrong tone, an invented phrase, or slang no one uses.
- **Mandarin-shaped Cantonese:** teaching formal written Chinese (他是, 在, 沒有) as if it were
  speech, instead of 佢係, 喺, 冇.
- **Textbook-stiff Cantonese:** phrases that are correct but that a Hong Kong 20-something would never say.
- **A tone check that lies:** confidently marking a right tone wrong, or a wrong tone right. When
  the check is unsure, it must say so.
- **Guilt and punishment:** streaks, hearts, red crosses, "you missed a day".
- **Busywork:** taps that teach nothing.

## Constraints (found while exploring)

- **Hosting:** GitHub Pages publishes `app/` (`.github/workflows/pages.yml`). The app is static
  and must work offline after one visit (service worker).
- **Licences:** app data ships as one JSON file per licence (see `jiesuo/export_app.py` and
  `LICENSES.md`). The Cantonese app follows the same rule.
- **No Cantonese voice on the learner's PC.** Today this Windows machine has only English voices.
  A Hong Kong voice can be added (Windows speech language pack, Edge's online voices, or a phone's
  built-in voice), but the app cannot assume one.
- **Stroke data gaps.** Make Me a Hanzi has no strokes for 19 of 34 core colloquial characters
  tested: 咗 啲 喺 嚟 哋 冇 佢 啱 噉 嗰 嘥 攞 搵 諗 攰 餸 癐 咁 冚. animCJK's Traditional set lacks
  them too. This is why handwriting is optional.
- **Same browser origin as the Mandarin app.** Both apps share localStorage and service worker
  space, so every key and cache name must be distinct.
- **The existing tone check cannot be reused as is.** `app/tone.js` classifies by contour shape,
  after normalising height. Cantonese tones 1, 3 and 6 are all level and differ only in height,
  so they need a new classifier. The YIN pitch tracker (`pitchTrack`, `smooth`, `syllables`) is
  language-neutral and is reused.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Language switch inside the current app | Every improvement reaches both. But every screen must handle both languages, Cantonese-only screens get squeezed into Mandarin-shaped ones, and the working Mandarin app could break. |
| **B (chosen)** | **Sister Cantonese app in the same repo, reusing language-neutral modules** | Mandarin stays untouched, and each app is shaped by its language. Some code is adapted copies rather than shared. |
| C | New app from scratch | Full freedom, but throws away working, tested pieces (scheduler, writer, map, search, progress). |

The learner chose **B**.

## Design

### 1. Layout

- **App:** `app/yue/`, served at `/yue/` by the existing Pages workflow (no workflow change needed).
  It loads unchanged shared modules straight from the parent folder: `../journey.js`, `../writer.js`,
  `../vendor/hanzi-writer.min.js`, `../handwriting.js` where useful, and the pitch tracker from
  `../tone.js`. Language-specific modules are new files in `app/yue/` (core, tones, lessons, screens).
  Where a shared module needs a small language-neutral change to be reusable, make that change and
  keep the Mandarin tests passing.
- **Separate identity:** its own `index.html`, `manifest.webmanifest` (name "Jiesuo 粵", scope `/yue/`),
  icons, service worker (`app/yue/sw.js`, its own cache name), and storage keys prefixed `jiesuo-yue-`.
  The progress file export carries `"lang": "yue"`, and the Mandarin app refuses it (and vice versa).
  The Mandarin `app/sw.js` currently deletes every cache that is not its own on activate, which
  would wipe the Cantonese cache. Change it to delete only caches named `jiesuo-v*`, and give the
  Cantonese cache the prefix `jiesuo-yue-`. *(Designer's call, from the builder check.)*
- **Size:** `app/` is about 32 MB today, and Pages publishes all of it. Audio is fetched and cached
  as it is used, never precached in full. Keep `app/yue/` under about 150 MB so the whole site stays
  well under GitHub Pages' 1 GB limit.
- **Build:** a Python subpackage `jiesuo/yue/` and `scripts/fetch_yue_data.py`, downloading into
  `data/raw/yue/` with hashes in `data/yue/manifest.json`. App data goes to `app/yue/data/`.
- **Tests:** `tests/yue_*.py` and `tests/yue_*.test.js`, run by the same `pytest` and `node --test` commands.
- **Link between apps:** a small link on each app's Progress screen. Nothing else is shared in the UI.

### 2. Sources and licences

| Source | Licence | Used for |
|---|---|---|
| rime-cantonese (`jyut6ping3.chars`, `jyut6ping3.words`, phrase dictionaries) | CC BY 4.0 | First source for character and word Jyutping, and the main lexicon for word splitting. Not the `.maps` file (ODbL). |
| CC-Canto and its Cantonese readings for CC-CEDICT (cantonese.org, Pleco) | CC BY-SA 3.0 | Second source for Jyutping, and English meanings for Cantonese words. |
| CC-CEDICT (already in `data/raw/cedict.json`) | CC BY-SA 4.0 | English meanings for words shared with standard Chinese. |
| Unihan `kCantonese` | Unicode licence | Third source for character readings. |
| words.hk (粵典) | Non-Commercial Open Data Licence 1.0 | Checking that phrases exist; definitions and example sentences of colloquial words; formal equivalents. The licence allows copying, adapting and publishing derived works for non-commercial use, with no share-alike. Conditions: no sublicensing (so it must never fall under the repo's MIT licence), no ads or paid services built on it, and every copy carries the copyright notice, the disclaimer, the credits list and a prominent link to words.hk. Shipped in its own file with that notice, and listed in `LICENSES.md`. The learner downloaded the data (2026-11-14) into `data/raw/wordshk/`: `all-*.csv` (59,467 entries: id, forms with Jyutping, definitions with Jyutping-annotated examples, variants, review status, published status) and `wordpos-*.csv`. Only entries marked reviewed (`OK`, 28,964) count as a source for checking; unreviewed entries are a weak hint only. Only entries words.hk itself has published (`已公開`, 16,827) may contribute content to shipped files *(designer's call: the CSV header reserves all rights outside the licence, so ship only what words.hk already shows publicly)*. The build reads them from there, records their hashes, and fails with a clear message if they are missing. Phase 1 does not need it. |
| HKCanCor (Hong Kong Cantonese Corpus, via PyCantonese) | CC BY 4.0 | Spoken frequency, real spoken examples, and held-out test data. |
| Tatoeba Cantonese (`yue`) with English links | CC BY 2.0 FR | Example sentences with translations, with author credits as in the Mandarin app. |
| Cantone (AlienKevin/cantone) | MIT | Recorded audio for every syllable in every tone (3,904 syllables, 10 voices from 4 TTS engines, 16 kHz WAV). |
| Mozilla Common Voice, Cantonese (zh-HK) | CC0 | Real Hong Kong voices reading sentences, for listening practice (phase 4). |
| Make Me a Hanzi | LGPL / Arphic | Character decomposition and strokes, where present. |
| OpenMoji | CC BY-SA 4.0 | Word pictures, reusing the Mandarin picture list where the meaning matches. |
| A Hong Kong-forms font (for example Noto Sans HK, Noto Serif HK or Chiron Sung HK) | SIL OFL | Shows Hong Kong standard character forms and covers colloquial characters such as 嘅 咗 啲 喺. |

### 3. The course

Learning happens in three layers: stage 0 (sounds), stage 1 (first words), then a graph-ordered
main course with topic tracks woven in.

#### Stage 0: Sounds (no characters yet, except as labels)

Short daily lessons, about 15 minutes each, over roughly two to three weeks. Each unit has
hearing drills, then saying drills, then reading and typing Jyutping.

1. **What a tone is, and the six tones.** A "tone ladder" shows pitch height (Chao numbers):
   - tone 1 high level (55; a high falling 53 is also accepted, since some speakers use it)
   - tone 2 high rising (35)
   - tone 3 mid level (33)
   - tone 4 low falling (21, often heard as low level 11)
   - tone 5 low rising (23)
   - tone 6 low level (22)

   Anchor sets with recorded audio: 詩 si1, 史 si2, 試 si3, 時 si4, 市 si5, 事 si6, and
   分 fan1, 粉 fan2, 訓 fan3, 墳 fan4, 奮 fan5, 份 fan6.
2. **Hearing the tones.** "Which tone?" and "same or different?" drills. Extra weight goes to the
   pairs learners confuse most: 3/6, 2/5, 4/6, 1/3 and 5/6. Drills adapt to the learner's own
   mistakes.
3. **Checked tones.** Syllables ending in -p, -t or -k use tones 1, 3 and 6 but sound short
   (色 sik1, 錫 sek3, 食 sik6). Teach the "9 tones" idea, mapped onto 6.
4. **Initials (19):** b p m f d t n l g k ng h gw kw w z c s j. The focus is aspiration
   (b/p, d/t, g/k, gw/kw, z/c): Jyutping b is an unaspirated "p" to English ears. Also ng- at the
   start of a syllable.
5. **Finals:**
   - long aa vs short a (三 saam1 vs 心 sam1)
   - the rounded vowels oe/eo and yu
   - nasal endings -m -n -ng
   - unreleased stop endings -p -t -k
   - the syllabic nasals m and ng (唔 m4, 五 ng5)
6. **Reading and typing Jyutping.** See it and hear it. Hear it and type it (syllable dictation).
   This is the start of the typing skill.
7. **Saying it.** First a voice-range calibration (§5), then tone production with live feedback.

**Soft gate:** words unlock when the learner identifies tones in 85% or more of a 40-item mixed
check. The learner can always choose "move on anyway". Tone drills keep coming back in reviews
for the whole course.

#### Stage 1: First words

Survival Cantonese:
- greetings
- 係/唔係, 有/冇
- 我 你 佢 and 哋
- numbers
- 唔該 vs 多謝, and when to use each
- 呀 and 啦

Every item has audio, Jyutping and characters. Characters are taught for recognition and typing,
not handwriting.

#### Main course: graph-ordered

- **Unit of learning is the word**, not the character. This changes the Mandarin design, where
  parts are hard prerequisites of characters. For a speaking-first learner, a word can be learned
  as sound plus meaning before its characters' parts are known. Characters stay prerequisites of
  words for reading, so a word's characters are introduced with it. Parts are shown as reading
  help but are never prerequisites. *(Builder's note: this is a deliberate design call, not an
  oversight.)*
- **Order:** the greedy prerequisite-closure method of `jiesuo/order.py`, with value set to spoken
  Hong Kong frequency. Use HKCanCor counts, smoothed with a larger secondary frequency list (e.g.
  words.hk's public character and word frequency tables). Rime weights are a fallback.
- **Grammar patterns, Cantonese-specific, each with source-attested examples:**
  - aspect: 咗 緊 過 開 住 吓 埋 返
  - location 喺, possessive 嘅
  - comparison: 高過 (X 高過 Y)
  - giving order: 畀本書我
  - classifier as determiner: 隻貓好得意
  - negation: 唔 冇 未 咪
  - potential 得
  - questions: A唔A, 係咪, 咩, 未呀, 邊個, 乜嘢, 點解, 幾時, 幾多
  - directions: 嚟 去 返
  - the core sentence-final particles: 呀 啦 喎 囉 咩 㗎 嘅 噃 啩 嘛 喇 吖
- **Changed tones (變音)** and **colloquial vs literary readings (文白異讀)**: shown on word pages
  and taught when the first word that uses them comes up. Examples: 生 saang1 (colloquial) vs
  sang1 (literary), 名 meng2 vs ming4, and the tone-2 change in nicknames such as 阿陳 Can4 → Can2.

#### Topic tracks

Topic tracks are woven into the daily lesson once enough of their words are within reach. The
learner can also open a track directly.

- 🎮 **Gaming:** League calls and chat, with English game words inside Cantonese sentences on
  purpose ("去 bot", "幫手 gank", "佢 feed 緊", 送頭, 坑, 開 game, 等埋我, 推塔). Gaming slang is the
  riskiest content because corpora barely cover it (see §6).
- 💼 **Online work:** meetings, scheduling and polite requests (唔好意思, 麻煩你, 我遲啲覆你, 開會, 可唔可以…).
- 💬 **Chat and texting:** written colloquial Cantonese as typed in messages, plus common
  romanised or English bits ("hea", "chur", "add oil").

#### Lazy sounds (懶音)

A listening unit after stage 1 and a mark on affected words:
- n- → l- (你 nei5 → lei5)
- ng- dropped (我 ngo5 → o5)
- gw/kw before o → g/k (廣 gwong2 → gong2)
- -ng → -n and -k → -t endings

The learner is taught to **recognise** these, never to **produce** them as the standard form.
Variant audio comes from the Cantone syllable recordings.

### 4. Screens

Reuse the Mandarin app's look (exercise book, 田字格, pen-blue ink) with Hong Kong forms.

- **Today (今):**
  - the daily lesson: meet new items, hear them, say them (tone check), type them in Jyutping and
    pick the characters, then review
  - it finishes on a real sentence the learner can now **understand by ear** and read
  - during stage 0, lessons are sounds only
- **Sounds (聲):**
  - the tone ladder
  - an initials × finals chart where every cell plays its syllable in all tones
  - the drills, the calibration, and the learner's tone-confusion picture ("you mix up 3 and 6 most")
- **Listen (聽):**
  - hear a phrase and choose its meaning, or type what you heard (Jyutping or characters)
  - slower and normal speeds
  - particles and lazy-sound units
  - Common Voice real-speaker clips in phase 4
- **Type (打):**
  - a Jyutping keyboard trainer that behaves like a real input method: type Jyutping with or
    without tone numbers, then pick a character from the candidates (from the app's lexicon,
    ranked by frequency)
  - a setup page on getting a real Jyutping keyboard on Windows (e.g. Rime/Weasel) and on the
    learner's phone (e.g. Gboard Cantonese), so the skill carries into Discord, WhatsApp and League chat
- **Read (讀):**
  - paste Cantonese text (a friend's message) to see Jyutping, meanings, what is known, and what
    to learn next
  - guess-the-meaning, as in the Mandarin app
  - word splitting uses the app's own longest-match splitter over the Cantonese lexicon
- **Map, Progress and Search:** adapted from the Mandarin app.
  - Search takes characters, Jyutping with or without tones (`nei5hou2`, `neihou`) and English.
  - Word pages show Jyutping, meaning, formal written equivalent, audio, picture, source marks,
    and lazy-sound and changed-tone notes.
- **Write by hand:** optional, on character pages that have stroke data. Characters without stroke
  data show the large glyph and its parts.

### 5. Tone check for Cantonese

- **Calibration:** the learner says a few anchor syllables (e.g. si1 si3 si6, then si4 and
  si2/si5). These set their personal pitch range: where their high, mid and low levels sit, in
  semitones. Recalibrating is available at any time. The calibration is stored on the device.
- **Classifier:** pitch height relative to the calibrated range, plus contour (rise, fall, level).
  Tones 2 and 5 are told apart by the end height of the rise. Checked tones are detected by short
  duration and a final stop, and judged as 1, 3 or 6 by height.
  - In words and phrases, heights are also judged relative to the neighbouring syllables, because
    speakers drift during an utterance.
  - Every result carries a confidence. Below a threshold, the check says "not sure" instead of
    giving a verdict.
- **Evaluation before shipping:** the Cantone recordings are a labelled test set (10 voices,
  every syllable, known tones). Report a per-tone confusion matrix in `reports/yue_tone_check.md`.
  - If accuracy on held-out voices is high (target: 90% or more on the six tones, with no single
    confusion over 10%), the UI calls it a **check**.
  - Otherwise it is presented as a **guide**, with the confusions stated, like the Mandarin app's
    "The tone check is a guide."
  - The Cantone voices are synthetic, so this is an upper bound on accuracy. The report says so.
- Recording stays on the device, as in the Mandarin app.

### 6. Correctness pipeline

This is what "learning correct stuff" rests on.

- **Character readings:** compare rime-cantonese, CC-Canto/CC-CEDICT readings and Unihan.
  - If all available sources agree, accept the reading.
  - On disagreement, prefer the reading found in HKCanCor's Jyutping-annotated speech. If that
    doesn't settle it, list the case in `reports/yue_readings.md` and require an entry in a
    hand-kept override file (`data/yue/overrides.tsv`: form, reading, reason, source).
  - A test fails if any taught item's reading is unresolved.
- **Word readings:** rime-cantonese vs CC-Canto, same rules. Colloquial vs literary readings are
  both kept and labelled.
- **Authored content** (lesson text, grammar notes, topic-track phrases, stage 0 explanations)
  lives in data files, never in UI code. Each example sentence carries either:
  - a **source**: an exact or near-exact match in words.hk examples, HKCanCor or Tatoeba yue, with
    its id; or
  - an **`unchecked`** flag, shown in the app as a small mark ("not yet confirmed by a source").
- **Automatic checks (tests):**
  - every authored example has a source or the flag
  - every hand-written Jyutping in authored content matches what the lexicon gives (a mismatch
    fails the test, unless it is a recorded changed tone)
  - every character in taught content renders in the chosen font
  - no formal-only form (他, 在 as a location verb, 沒有, 的 as a possessive) appears in a
    colloquial example unless it is marked formal
- **Unchecked phrases are shown, never drilled (learner's decision).** Phrases with no source
  (mostly gaming and chat slang) can be seen and heard on their track and word pages, with the
  "not yet confirmed" mark. They never enter the scheduler or the daily lesson's reviews, and no
  sentence used to teach something else depends on them.
  - An **Ask a friend** list collects them, each with its Jyutping, audio and meaning, ready to
    paste into a chat.
  - The learner marks each one **confirmed by a friend** (it then joins the normal course and
    reviews like any checked item), **friends say it differently** (with a field for their
    version, which itself becomes a confirmed phrase), or **friends don't say this** (hidden).
  - Confirmations are stored with the learner's progress and included in the progress file.
  - Phase 3 therefore ships tracks that start small and grow as phrases are confirmed. Their
    attested core (words and phrases with a source) is taught normally from the start.
- **No outside reviewer (assumed).** The source-or-flag tests and the friend confirmations are the safety
  net for written content. Stage 0 and grammar explanations are kept short and factual, and any
  claim about pronunciation or usage cites a source in the content file.
- **Tatoeba yue filtering:** some sentences tagged Cantonese are really formal written Chinese.
  Keep only sentences with clear colloquial markers (佢 係 喺 嘅 咗 冇 唔 哋 …) for the colloquial
  track. Others can appear only as formal examples.

### 7. Learner state

- Per item, the learner's memory is tracked per **skill**:
  - **hear** (understand it by ear)
  - **read** (recognise the characters)
  - **type** (produce Jyutping and pick the characters)

  Each skill uses the Leitner scheduler in `journey.js`. **Say** is practice with feedback and is
  not scheduled.
- Stage 0 progress (tone identification accuracy per tone pair, initials, finals) is stored too,
  and feeds the drills' adaptivity.
- Saving to a file and restoring, and "Send to my other device", work as in the Mandarin app,
  with the `yue` marker.

### 8. Audio

- **Syllables (stage 0, Sounds chart, lazy-sound variants):** Cantone recordings. Ship 2 or 3
  voices (at least one female and one male; the builder picks among those without the documented
  tone-5 and vowel-onset problems), compressed (Opus or MP3, about 24 kbps). Cache them as they
  are used, with the next lesson's syllables prefetched, so the first load stays small.
- **Words and sentences (learner's decision):** generated once at build time with a neural
  Hong Kong voice from Azure Speech (e.g. zh-HK HiuMaan or WanLung), using SSML phoneme tags with
  the exact Jyutping from the reading pipeline. Changed tones and colloquial readings are spoken
  correctly because the reading is given, not guessed.
  - The learner creates the Azure account and key. The key lives only in an environment variable
    on the learner's machine (e.g. `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`), and is never
    committed, logged or shipped.
  - The generation script is incremental: it skips clips that already exist, keyed by text +
    Jyutping + voice, so reruns cost nothing. Clips are committed to `app/yue/audio/`.
  - Every generated clip is checked automatically. Its pitch track (`tone.js`) must match the
    expected tones with the same classifier as §5, and mismatches are listed in a report for a
    listen-through, not shipped silently.
  - Sentences get a normal and a slower version (SSML rate), for the Listen screen.
  - Until clips exist for an item, the app falls back to the device's Hong Kong voice if there is
    one. For items with more than one reading or a changed tone, it plays the Cantone syllable
    recordings in sequence instead, so a wrong tone is never played.
- **Real-speaker listening (phase 4):** Common Voice zh-HK clips whose sentences are colloquial and
  within the learner's known words.

### 9. Evaluation (light)

All held-out, never used to tune:
- **Reading accuracy:** the app's Jyutping for HKCanCor tokens vs HKCanCor's own annotation.
- **Word splitting:** the app's splitter vs HKCanCor's word boundaries.
- **Coverage:** share of held-out HKCanCor and Tatoeba yue tokens readable after N items, for the
  chosen order vs plain frequency order. One table, no phase reports.
- **Tone check:** the confusion matrix in §5.

All results go into `reports/yue_accuracy.md`, linked from the README.

### 10. Phases

1. **Foundation:**
   - the `/yue/` app shell
   - the fetch script and reading pipeline with the correctness checks
   - stage 0 complete (tone ladder, hearing drills, initials, finals, Jyutping reading and typing of syllables)
   - calibration and tone check with its evaluation
   - the Sounds screen

   The learner can start learning at the end of this phase.
2. **Words and grammar:**
   - lexicon, order, stage 1, the daily lesson with hear/read/type skills
   - Type trainer, Read, Search, Map, Progress
   - grammar patterns and particles with attested examples
3. **Real-life tracks:** gaming, online work, chat; the lazy-sounds unit; formal equivalents on
   word pages; the "Ask a friend" list.
4. **Real voices:** Common Voice listening and optional handwriting.

Each phase ends with the app working and the learner able to use what was built.

## Calls made by the designer (not decided by the learner)

- Jyutping as the only romanization.
- Typing over handwriting as the main writing skill; handwriting optional.
- Colloquial Cantonese as the main track; formal equivalents shown only on word pages.
- Words, not parts, as the unit of learning; parts never prerequisites.
- The 85% soft gate for stage 0.
- Tracking hear/read/type separately.
- `/yue/` inside `app/`, loading shared modules from `../`.
- Lazy sounds taught for recognition only.

## Left to the builder

- Exact screen layouts, as long as the Jiesuo look and the anti-goals hold.
- Which Cantone voices to ship, and the audio encoding.
- The font, within the Hong Kong forms and coverage constraint.
- Tuning numbers (drill weights, lesson sizes, confidence threshold), chosen on training data only.
- Icons for the `/yue/` app.

## Decisions by the learner

- **Approach B:** a sister app in the same repo.
- **Hong Kong Cantonese, Traditional characters.**
- **Start fresh:** no Mandarin assumed.
- **Word and sentence audio:** generated once with a neural Hong Kong voice and exact Jyutping
  (Azure Speech free tier). The learner creates the account and key (§8).
- **Unchecked phrases:** shown and heard, never drilled until a friend confirms them (§6).
- **No outside reviewer** for written content (assumed by the designer; the learner did not say. If a friend can skim lesson notes, add a review step before each phase goes live).
- **words.hk data:** the learner requests and downloads it. Needed from phase 2.
