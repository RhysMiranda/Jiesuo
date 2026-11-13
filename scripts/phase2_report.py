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
COLORS = {"unlock": "#2a78d6", "frequency": "#eb6834", "hsk": "#1baf7a"}
INK, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#e6e5e0", "#fcfcfb"

c = R["curves"][MODE]
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "axes.edgecolor": GRID, "text.color": INK,
                     "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": MUTED})
fig, (a, b) = plt.subplots(2, 1, figsize=(8.5, 7), sharex=True, height_ratios=[3, 1.25], facecolor=SURFACE)
for ax in (a, b):
    ax.set_facecolor(SURFACE)
    ax.grid(axis="y", color=GRID, linewidth=1)
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.tick_params(length=0)
for name in NAMES:
    a.plot(c["n"], [v * 100 for v in c[name]], color=COLORS[name], linewidth=2, label=NAMES[name], solid_capstyle="round")
a.set_ylim(0, 100)
a.set_xlim(0, 3000)
a.set_ylabel("Held-out tokens readable (%)")
a.legend(frameon=False, loc="lower right")
fig.suptitle("Unlock order leads both baselines by 1 to 3 points from 1,000 items", x=0.08, ha="left", fontsize=13.5, fontweight="bold", y=0.97)
a.set_title(f"{R['sentences']:,} held-out Tatoeba sentences, {R['tokens']:,} tokens. Every order pays for its prerequisites.",
            loc="left", fontsize=10.5, color=MUTED, pad=10)
last = c["n"].index(3000)
offsets = {"unlock": 3.0, "frequency": -0.6, "hsk": -4.2}
for name in NAMES:
    a.annotate(NAMES[name].replace(" order", ""), (3000, c[name][last] * 100 + offsets[name]), xytext=(4, 0),
               textcoords="offset points", fontsize=10, color=INK, va="center", annotation_clip=False)
for base in ("frequency", "hsk"):
    b.plot(c["n"], [(u - v) * 100 for u, v in zip(c["unlock"], c[base])], color=COLORS[base], linewidth=2, label=f"Unlock minus {NAMES[base].split()[0]}")
b.axhline(0, color=MUTED, linewidth=1)
b.set_ylabel("Lead (points)")
b.set_xlabel("Items learned (components, characters and words; grammar patterns not counted)")
b.set_ylim(-5, 8)
b.legend(frameon=False, loc="upper right", ncol=2)
fig.tight_layout(rect=(0, 0, 0.97, 0.97))
fig.savefig(ROOT / "reports" / "coverage.png", dpi=200, facecolor=SURFACE)

out = ["# Phase 2 checkpoint\n", "![Coverage plot](coverage.png)\n",
       f"Held-out: {R['sentences']:,} sentences, {R['tokens']:,} Han tokens, of which {R['token_kinds']['exact']:,} are graph words, "
       f"{R['token_kinds']['split']:,} are readable only by splitting into smaller units, and {R['token_kinds']['unknown']:,} use a character outside the graph. "
       f"Lookahead weight, chosen on training sentences: {R['lookahead']}.\n"]
for mode, label in (("explained", "Primary: a component is required only when the data explains why it is there"),
                    ("all", "Sensitivity: every component edge required"), ("none", "Sensitivity: no component required")):
    t = R["modes"][mode]
    out += [f"## {label}\n", "| Items | Unlock | Frequency | HSK | Lead over frequency (95% CI) | Lead over HSK (95% CI) |", "|---:|---:|---:|---:|---:|---:|"]
    for n in NS:
        f = lambda name: f"{t[name][n]['tokens']:.1%}"
        ci = lambda k: f"{t[k][n][0] * 100:+.1f} to {t[k][n][1] * 100:+.1f}"
        out.append(f"| {int(n):,} | {f('unlock')} | {f('frequency')} | {f('hsk')} | {ci('unlock_minus_frequency')} | {ci('unlock_minus_hsk')} |")
    out.append("")
t = R["modes"][MODE]
out += ["## Whole sentences readable (primary mode)\n", "| Items | Unlock | Frequency | HSK | HSK minus unlock (95% CI) |", "|---:|---:|---:|---:|---:|"]
out += [f"| {int(n):,} | " + " | ".join(f"{t[k][n]['sentences']:.1%}" for k in NAMES) + f" | {t['whole_sentences_hsk_minus_unlock'][n][0] * 100:+.1f} to {t['whole_sentences_hsk_minus_unlock'][n][1] * 100:+.1f} |" for n in NS]
out += ["", "## HSK focus, the app's alternative order (primary mode)\n", "| Items | Tokens readable | Whole sentences readable |", "|---:|---:|---:|"]
out += [f"| {int(n):,} | {t['hsk_focus'][n]['tokens']:.1%} | {t['hsk_focus'][n]['sentences']:.1%} |" for n in NS]
out += ["", "## Counting only tokens that are graph words (no splitting)\n", "| Items | Unlock | Frequency | HSK |", "|---:|---:|---:|---:|"]
out += [f"| {int(n):,} | " + " | ".join(f"{t[k]['exact_tokens_only'][n]:.1%}" for k in NAMES) + " |" for n in NS]
if R.get("subtlex_not_held_out"):
    s = R["subtlex_not_held_out"]
    out += ["", "## SUBTLEX-CH subtitle tokens (not held out: wordfreq includes SUBTLEX)\n", "| Items | Unlock | Frequency | HSK |", "|---:|---:|---:|---:|"]
    out += [f"| {int(n):,} | " + " | ".join(f"{s[k][n]:.1%}" for k in NAMES) + " |" for n in NS]
out += ["", f"汤姆 and 玛丽 alone are {R['name_share_tom_mary']:.1%} of held-out tokens.", ""]
(ROOT / "reports" / "phase2_checkpoint.md").write_text("\n".join(out), encoding="utf8")
print("\n".join(out))
