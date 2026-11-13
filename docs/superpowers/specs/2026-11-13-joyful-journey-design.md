# Jiesuo: a joyful learning journey — design

Date: 2026-11-13. Builds on branch `round4-accuracy-and-test-sets`.

## Intent

HelloChinese and Duolingo teach recognition: see a character, tap the right answer. They do not
teach you to **write** characters, or **how characters are built from each other**. Jiesuo's data
already models exactly that (parts → characters → words → grammar → sentences), but today the
app only shows it as text and lets you tick "I know this" on trust.

The goal is a feeling. When someone opens Jiesuo they should be happy and think *"I'm excited
to learn something new today"*, and every part of the app should keep bringing them back to
that feeling, through good visuals and positive reinforcement.

## Goals

1. **Daily journey.** Opening the app leads straight into a short, satisfying session: meet a
   few new things, see how they are built, write them, review earlier ones, and finish on a
   moment of progress you can feel.
2. **Writing.** Learn every character by writing it stroke by stroke, starting from parts you
   already know.
3. **Links you can see.** Every new character is shown being assembled from its parts, and
   every new word from its characters.
4. **Comfortable on phone and desktop.** Easy to navigate, readable, thumb-friendly; uses the
   space on a wide screen.

## Non-goals

- Accounts, sync between devices, servers, push notifications (the app stays static and offline).
- Leaderboards or social features.
- Handwriting recognition of free text (we check strokes of a known character only).
- Changing the learning order or the evaluation.

## Anti-goals (failure even if it works)

- **Guilt mechanics:** streaks that break, hearts or lives, "you missed a day" nagging, sad mascots.
- **Punishment for mistakes:** red crosses, buzzers, losing progress. Mistakes get a hint, never a penalty.
- **Busywork:** sessions padded with taps that teach nothing. Every step either teaches,
  practises or shows real progress.
- **Losing the identity:** the exercise-book look (田字格 squares, pen-blue ink, paper) stays.
  This must not become a Duolingo clone.

## Approaches considered

### Writing

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **Hanzi Writer** (MIT, 3.7.3, vendored) with stroke data from Make Me a Hanzi's `graphics.txt` | Proven stroke animation and stroke-by-stroke checking with hints. Data covers 3,799 of the app's 3,800 characters and parts, and 1,215 of 1,230 Hong Kong forms. Data is Arphic Public Licence, which allows redistribution but must stay under that licence in its own file. About 2.6 KB a character, 10 MB in all, so it loads per character. |
| B | Free drawing in the square, self-graded against an overlay | No new data or licence, but no real feedback on stroke order, so it does not teach writing. |
| C | Own stroke matcher on the same data | Same data and licence as A, much more work, likely worse. |

### Journey

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **A "Today" session as the new home screen**: a short guided flow, then a celebration built on what Jiesuo uniquely knows (which real sentences you can now read) | Most work, but it is the experience the goal describes, and the "unlock" payoff is something competitors cannot offer. |
| B | XP, levels and a daily streak | Familiar, but copies the competitors and brings the guilt mechanics we ruled out. |
| C | Add practice buttons to the existing Next list | Cheap, but no sense of a journey and nothing pulls you back. |

### Usability

One sensible way: fix the specific problems found in review (below). No alternatives worth listing.

## Design

### 1. Usability fixes (phone and desktop)

Problems found when walking through the app at 375 px and desktop widths, and the fix for each:

- **No way back** from an item page, which matters most when installed to the home screen
  (no browser back). Add a back control at the top of item and pattern pages that goes to the
  previous screen (history back when there is history in the app, else to Today).
- **Next list rows** are tall and the character box sits low while text starts at the top.
  Align the box to the top, tighten spacing, and show more rows per screen.
- **Audio.** Add a speaker button next to pinyin on item pages and in lessons, using the
  browser's built-in Chinese voice (`speechSynthesis`, zh-CN, or zh-HK/zh-TW in Traditional
  mode). Hide the button when no Chinese voice exists. No audio files are shipped.
- **Desktop.** At ≥ 1000 px, item pages use two columns (the character, writing and audio on
  the left; meaning, parts, words and examples on the right), and the lesson flow is centred
  in a wider card. Phone layout stays one column.
- **Tap targets** at least 44 px; the bottom tab bar stays on phones.

### 2. Writing

A **Write** panel on every character page and inside lessons, in the app's own 田字格 square:

1. **Watch.** The character draws itself stroke by stroke (Hanzi Writer animation), in pen-blue
   ink. Replay button.
2. **Trace.** A faint outline; you draw each stroke over it. A correct stroke inks in blue. After
   two misses on a stroke, the next stroke's start point gently pulses as a hint. No red.
3. **From memory.** Empty square, no outline. Same gentle hinting.

Building from parts: when a character's parts are already known, the panel says so ("You already
know 女 and 子") and draws those strokes in the known-ink colour first, so you see them combine.
On a word page, writing goes character by character.

Data: a build step reads `graphics.txt` (downloaded by `fetch_data.py` into `data/raw/`) and
writes one small file per glyph at `app/data/strokes/<codepoint>.json` (`{strokes, medians}`),
for the app's characters, parts and Hong Kong forms. They are licensed Arphic Public Licence;
`ARPHICPL.TXT` goes into `app/licences/`, and the licences page and LICENSES.md list it. Hanzi
Writer is vendored at `app/vendor/hanzi-writer.min.js` with its MIT notice (no CDN, so it works
offline). The service worker caches stroke files as they are used, and the Today screen
prefetches the strokes for the next few days' items while online.

The one character without data (祂) shows the character large with "Writing practice isn't
available for this one yet."

### 3. The daily journey

A new first tab, **Today** (今), becomes the home screen. Next, Read, Map and Progress stay.

**Opening (the "excited" moment).** A warm greeting and a teaser card: today's first new
character in a softly glowing square, its meaning, and "built from 女 + 子". Then one line of
what's in the session ("3 new things · a quick review · about 8 minutes") and a big **Start**
button. Returning after days away: "Welcome back" and the same teaser. No mention of missed days.

**Session flow** (each step is one screen, with a slim progress bar across the top):

1. **Meet** (×3 new items, taken from the user's chosen order, Fastest reading or HSK focus):
   - *See it built:* the parts animate together into the character (or the characters into the
     word). Parts you already know are shown in pen blue: "You know these already."
   - *Hear it:* pinyin, audio, meaning.
   - *Write it:* Watch → Trace (from memory comes later, in review).
   - *Meet it in use:* one example word or sentence, with author credit.
2. **Review** (up to 5 items due, spaced repetition): mixed questions that stay positive.
   - Write from memory (characters), or
   - Pick the meaning (words), or
   - Read a short sentence aloud and reveal (sentences).
   A miss shows the answer kindly and brings the item back sooner; nothing is lost.
3. **Unlock** (the payoff): a real Tatoeba sentence that the user can now read **in full for the
   first time**, made readable by today's items, shown with every character in pen blue and its
   English and credit. Then: "You can now read about X% of everyday Chinese (+Y% today)". If no
   new sentence becomes fully readable, show the word count unlocked instead ("Today's three open
   up 41 new words").
4. **Tomorrow:** a curiosity hook: "Tomorrow: 妈, built from 女 + 马. You already know 女." A
   **Keep going** button offers one more new item for people on a roll, and **Done** ends warmly.

**Positive reinforcement, used sparingly so it stays meaningful:**
- Varied, specific praise on real achievements (first character written from memory, first
  sentence read in full), not on every tap.
- Gentle motion: ink spreading, parts sliding together, a soft glow on unlocks. All respect
  `prefers-reduced-motion`.
- **Days learned** count (total, never reset) instead of a streak.

**The journey map.** On Today, under the Start button, a path of milestones drawn as a line of
practice squares: first character, first word written, first full sentence, 50 characters, HSK 1
complete, 25% of everyday Chinese, and so on. Reached milestones are inked in; the next one shows
how close it is ("4 more characters until you can read 我爱你").

**Spaced repetition:** a simple Leitner schedule (boxes 1, 2, 4, 8, 16, 32 days). "I know this"
on the Next list still marks items known without practice, as now.

### State and storage

New state, saved in `localStorage` with the existing state and in the progress file:
- `review`: per item, `[box, dueDay]`.
- `days`: the set of dates with a finished session (for days learned and the welcome-back text).
- `milestones`: reached milestone keys with dates.
- `lesson`: today's in-progress session, so closing the app mid-session resumes it.

The progress file gets `version: 2`. Version 1 files still import (new fields default empty).

## Constraints

- Static site on GitHub Pages; works offline after the first visit; no accounts, no server.
- Vanilla JS, as now (`app.js`, `core.js`, `style.css`); no build step. Hanzi Writer is the
  only new library, vendored.
- Every shipped data file keeps its own licence, listed on the licences page.
- Accessible: keyboard usable on desktop; writing practice is optional for people who cannot
  draw (a "Skip writing" link on each writing step).
- Existing tests keep passing; new logic (scheduling, unlock sentence choice, progress file
  version 2) gets unit tests in `tests/app.test.js`.

## Order of work

1. Usability fixes (independent, ship first).
2. Writing (stroke data build step, vendored library, Write panel on character pages).
3. Daily journey (Today tab, session flow, review, unlock, journey map), using the Write panel.

Each is a separate commit series on a new branch off `round4-accuracy-and-test-sets`.

## Calls made by Claude (please check)

- Hanzi Writer + Make Me a Hanzi stroke data (Arphic licence) for writing.
- Today becomes the home screen; Next stays as the full list.
- 3 new items and up to 5 reviews per session, about 8 minutes; "Keep going" for more.
- Days-learned count instead of a streak; no hearts, no red marks for mistakes.
- Browser voices for audio rather than shipped recordings.
- Leitner boxes for review rather than a more complex algorithm.

## Left to the builder

Exact copy and praise wording, animation timings, the milestone list beyond those named, the
icon for the Today tab, desktop breakpoint details, and how the unlock sentence is chosen when
several qualify (prefer shortest).
