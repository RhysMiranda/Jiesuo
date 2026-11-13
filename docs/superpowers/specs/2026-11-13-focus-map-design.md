# Focus map — design

Date: 2026-11-13. Builds on the joyful-journey work (now on `main`).

## Intent

The Map should show **what can actually be unlocked and how things are related**. Today it shows
a sample of unconnected squares for a new learner, and a cramped random sample later; it never
shows what learning something opens up.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **Focus map**: one item in the middle, what it is made of on the left, what it unlocks on the right, lines between; tap any square to move it to the middle | Always readable on a phone, always has real links, answers "what does this open?" directly. Shows one neighbourhood at a time. |
| B | Growing tree of everything known | Big picture, but crowded past ~30 items and unreadable on a phone past ~100. |
| C | Unlock list per next item | Compact, but no lines, so relations are told rather than shown. |

The person compared mockups of A and B with real data and picked A.

## Design

**Map screen, top to bottom:** progress line; the focus map; "Closest next steps" chips; the
whole-language grid (unchanged). The old sample graph is removed.

**Focus map.**
- **Centre:** the item in practice squares, pinyin, short meaning, and a status line:
  "You know this", "Ready to learn: you know everything it needs", or "First learn 亻".
  Buttons: open its page, and Learn it / Hear it where they apply.
- **Left, "Made of":** its parts (characters and parts) or, for a word, its characters.
- **Right, "Unlocks":** what is built from it, ready ones first, then by frequency. Each says
  "ready now" / "ready once you learn 他" or "needs 们". Top 8, with "Show all N".
- **Lines** join each left square to the centre and the centre to each right item, in pen blue
  where the link is already lit (both ends known).
- **Summary:** "Learning 他 opens 1 word now and 4 more later" or, if known, "他 has helped open 5
  items; 1 is ready to learn".
- **Square states** as everywhere in the app: known (blue wash), ready (dashed blue), not yet (grey).
- **Tap a square** to move it to the centre. A short trail of the last few centres lets you step back.
- **Starts on** your next item (from your chosen order); the map remembers the last centre.

**Ways in.** `#m<id>` opens the map centred on an item. Item pages get "See it on the map";
tapping a square in the whole-language grid offers the same.

## Calls made by Claude

- Map focus lives in the hash (`#m123`), so Back works and the item is shareable on the same device.
- Grammar patterns appear in "Unlocks" as text chips, not squares.
- Up to 8 unlocks shown before "Show all"; lines drawn for every visible item.

## Not doing

Zooming whole-graph views, physics layouts, or a separate graph library.
