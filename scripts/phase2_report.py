#!/usr/bin/env python3
"""Write reports/coverage.png and reports/phase2_checkpoint.md from phase2_results.json."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
R = json.loads((ROOT / "reports" / "phase2_results.json").read_text())
MODE = "explained"
NS = ("100", "500", "1000", "2000")
NAMES = {"unlock": "Unlock order", "frequency": "Frequency order", "hsk": "HSK order"}
ALL = {"unlock": "Unlock", "sentences": "Unlock + sentences", "frequency": "Frequency", "hsk": "HSK", "hsk_focus": "HSK focus (app)"}
COLORS = {"unlock": "#2a78d6", "frequency": "#eb6834", "hsk": "#1baf7a"}
INK, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#e6e5e0", "#fcfcfb"
PANELS = [("Tatoeba, held out", R["curves"][MODE], R["sentences"], R["tokens"])]
PANELS += [(v["label"].split(" (")[0], v["curves"], v["sentences"], v["tokens"]) for v in R["corpora"].values()]

# ---- Plot: one panel per corpus, same scale, labels at the line ends
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "axes.edgecolor": GRID, "text.color": INK,
                     "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": MUTED})
fig, axes = plt.subplots(1, len(PANELS), figsize=(13, 5.2), sharey=True, facecolor=SURFACE)
for ax, (title, c, n_s, n_t) in zip(axes, PANELS):
    ax.set_facecolor(SURFACE)
    ax.grid(axis="y", color=GRID, linewidth=1)
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.tick_params(length=0)
    for name in NAMES:
        ax.plot(c["n"], [v * 100 for v in c[name]], color=COLORS[name], linewidth=2, solid_capstyle="round")
    ax.set_xlim(0, 3000)
    ax.set_ylim(0, 100)
    ax.set_xticks([0, 1000, 2000, 3000])
    ax.set_title(f"{title}\n{n_s:,} sentences, {n_t:,} tokens", loc="left", fontsize=10.5, color=MUTED)
    last = c["n"].index(3000)
    ends = sorted(((c[name][last] * 100, name) for name in NAMES), reverse=True)
    y_prev = None
    for y, name in ends:  # keep labels at least 5 points apart
        y = min(y, y_prev - 5) if y_prev is not None else y
        ax.annotate(NAMES[name].split()[0], (3000, y), xytext=(4, 0), textcoords="offset points", fontsize=10,
                    color=INK, va="center", annotation_clip=False)
        y_prev = y
    ax.set_xlabel("Items learned")
axes[0].set_ylabel("Tokens readable (%)")
fig.suptitle("On real text, unlock order leads HSK order by 5 to 13 points from 500 items", x=0.06, ha="left",
             fontsize=14, fontweight="bold", y=0.99)
fig.text(0.06, 0.905, "On Tatoeba's short learner sentences the gap is about 1 point. Every order pays for its prerequisites; "
         "grammar patterns are not counted.", fontsize=10.5, color=MUTED)
fig.tight_layout(rect=(0, 0, 0.97, 0.9))
fig.savefig(ROOT / "reports" / "coverage.png", dpi=200, facecolor=SURFACE)

# ---- Report
pct = lambda x: f"{x:.1%}"
ci = lambda pair: f"{pair[0] * 100:+.1f} to {pair[1] * 100:+.1f}"
out = ["# Phase 2 checkpoint (updated 2026-11-13)\n", "![Coverage plot](coverage.png)\n",
       f"Settings chosen on training sentences only: lookahead {R['lookahead']}, sentence bonus {R['sentence_bonus']}. "
       "Everything below was run once on text that played no part in building or tuning.\n"]


def section(title, t, info, note=""):
    lines = [f"## {title}\n"]
    if note:
        lines.append(note + "\n")
    kinds = info["token_kinds"]
    lines.append(f"{info['sentences']:,} sentences, {info['tokens']:,} Han tokens ({kinds['exact']:,} graph words, "
                 f"{kinds['split']:,} readable only by splitting, {kinds['unknown']:,} with a character outside the graph).\n")
    lines += ["| Items | " + " | ".join(ALL.values()) + " |", "|---:|" + "---:|" * len(ALL)]
    lines += [f"| {int(n):,} | " + " | ".join(pct(t[k][n]["tokens"]) for k in ALL) + " |" for n in NS]
    lines += ["", "Differences in percentage points, 95% bootstrap intervals by sentence:\n",
              "| Items | Unlock − Frequency | Unlock − HSK | Unlock + sentences − Unlock |", "|---:|---:|---:|---:|"]
    lines += [f"| {int(n):,} | {ci(t['unlock_minus_frequency'][n])} | {ci(t['unlock_minus_hsk'][n])} | {ci(t['sentences_minus_unlock'][n])} |" for n in NS]
    lines += ["", "Whole sentences readable start to finish:\n", "| Items | " + " | ".join(ALL.values()) + " | HSK − Unlock (95% CI) |",
              "|---:|" + "---:|" * (len(ALL) + 1)]
    lines += [f"| {int(n):,} | " + " | ".join(pct(t[k][n]["sentences"]) for k in ALL) + f" | {ci(t['whole_sentences_hsk_minus_unlock'][n])} |" for n in NS]
    return lines + [""]


out += section("Tatoeba, held out (primary mode)", R["modes"][MODE], R,
               "Short sentences, many written for learners. 汤姆 and 玛丽 alone are "
               f"{R['name_share_tom_mary']:.1%} of tokens.")
for v in R["corpora"].values():
    note = ("Independent of everything used to build the graph. " +
            ("wordfreq includes Wikipedia, so this set shares a source with our frequencies, which favours the unlock and frequency orders."
             if "wiki" in v["label"].lower() else "Not drawn from any source we use, as far as we know."))
    out += section(v["label"], v["table"], v, note)

d = R["decision"]
out += ["## Should the sentence-aware order become the default?\n",
        "The rule was fixed in `jiesuo/evaluate.py` before the held-out run. It needed all three of these:\n",
        f"- Tatoeba tokens within 0.5 points of unlock at every checkpoint: {'yes' if d['tatoeba_tokens_ok'] else 'no'}",
        f"- Tatoeba whole sentences higher at 1,000 and 2,000: {'yes' if d['tatoeba_sentences_better'] else 'no'}",
        f"- UD tokens within 1 point of unlock at every checkpoint: {'yes' if d['ud_tokens_ok'] else 'no'}",
        f"\nResult: **{'adopt it' if d['use_sentence_order'] else 'keep plain unlock'}**. It learns Tatoeba's style: 玛丽 comes at item "
        f"{R['name_positions']['玛丽']['sentences']:,} instead of {R['name_positions']['玛丽']['unlock']:,}.\n"]

for mode, label in (("all", "Sensitivity: every component edge required"), ("none", "Sensitivity: no component required")):
    t = R["modes"][mode]
    out += [f"## {label} (Tatoeba)\n", "| Items | Unlock | Frequency | HSK |", "|---:|---:|---:|---:|"]
    out += [f"| {int(n):,} | {pct(t['unlock'][n]['tokens'])} | {pct(t['frequency'][n]['tokens'])} | {pct(t['hsk'][n]['tokens'])} |" for n in NS]
    out.append("")
if R.get("subtlex_not_held_out"):
    s = R["subtlex_not_held_out"]
    out += ["## SUBTLEX-CH subtitle word counts (not held out: wordfreq includes SUBTLEX)\n", "| Items | Unlock | Frequency | HSK |", "|---:|---:|---:|---:|"]
    out += [f"| {int(n):,} | {pct(s['unlock'][n])} | {pct(s['frequency'][n])} | {pct(s['hsk'][n])} |" for n in NS]
    out.append("")
(ROOT / "reports" / "phase2_checkpoint.md").write_text("\n".join(out), encoding="utf8")
print("\n".join(out))
