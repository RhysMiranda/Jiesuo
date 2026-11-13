#!/usr/bin/env python3
"""Write reports/phase1_checkpoint.md from the built graph. Reads graph files only."""
import json
import random
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from jiesuo.grammar import PATTERNS, compile_detector  # noqa: E402
from jiesuo.sources import is_han  # noqa: E402

G, RAW = ROOT / "data" / "graph", ROOT / "data" / "raw"
nodes = {n["id"]: n for n in map(json.loads, open(G / "nodes.jsonl", encoding="utf8"))}
edges = [line.rstrip("\n").split("\t") for line in open(G / "edges.tsv", encoding="utf8")]
stats = json.loads((G / "build_stats.json").read_text(encoding="utf8"))
prereq = defaultdict(list)
for a, b, kind, role in edges:
    if kind != "simp_trad":
        prereq[b].append((a, kind, role))
out = []
w = out.append


def closure(nid, memo={}):
    if nid not in memo:
        found = set()
        for p, _, _ in prereq[nid]:
            found |= {p} | closure(p)
        memo[nid] = found
    return memo[nid]


def table(head, rows):
    w("| " + " | ".join(head) + " |")
    w("|" + "---|" * len(head))
    for r in rows:
        w("| " + " | ".join(str(c) for c in r) + " |")
    w("")


w("# Phase 1 checkpoint\n")
w("## Nodes\n")
tc = Counter((n["type"], n.get("script", "-")) for n in nodes.values())
rows = []
for t in ("component", "character", "word", "pattern", "sentence"):
    per = {s: c for (ty, s), c in tc.items() if ty == t}
    rows.append((t, f"{sum(per.values()):,}", per.get("S", "-"), per.get("T", "-"), per.get("B", "-")))
rows.append(("**total**", f"{len(nodes):,}", "", "", ""))
table(("type", "count", "Simplified only", "Traditional only", "both scripts"), rows)
w("## Edges\n")
ec = Counter(k for _, _, k, _ in edges)
table(("type", "count"), [(k, f"{v:,}") for k, v in ec.most_common()] + [("**total**", f"{len(edges):,}")])

w("## Vocabulary selection\n")
chars = [n for n in nodes.values() if n["type"] == "character" and n.get("rank")]
words = [n for n in nodes.values() if n["type"] == "word"]
for k in ("words_top_by_frequency", "words_added_from_hsk_1_6", "words_added_for_grammar",
          "words_skipped_not_in_cedict_before_cutoff", "chars_skipped_as_traditional"):
    w(f"- {k}: {stats.get(k, 0):,}")
w(f"- graph words with no CC-CEDICT entry (HSK or grammar only): {sum(1 for n in words if not n.get('in_cedict')):,}")
w(f"- wordfreq probability mass on non-Han tokens, ignored: {stats['wordfreq_non_han_mass']:.1%}\n")

w("## Messy cases\n")
top = Counter(n.get("decomposition") for n in chars)
allh = [n for n in nodes.values() if n["type"] in ("character", "component")]
every = Counter(n.get("decomposition") for n in allh)
labels = [("full", "fully decomposed"), ("partial", "partly decomposed (`？` in the IDS, like 发 = ⿸？又)"),
          ("atomic", "no parts given (`？`), treated as a root (人, 一)"),
          ("pictograph_root", "pictograph, parts ignored on purpose (木 is not 十+八)"),
          ("missing", "not in Make Me a Hanzi at all")]
table(("decomposition status", "top 3,500", "all glyphs"), [(lab, top[k], every[k]) for k, lab in labels])
roles = Counter(r for _, _, k, r in edges if k == "component")
table(("component edge role", "count"), [(k, f"{v:,}") for k, v in roles.most_common()])
w(f"- Component edges dropped from pictographs: {stats['pictograph_edges_dropped']:,}")
w(f"- Self-loops dropped: {stats.get('self_loops_dropped', 0)}")
w(f"- Cycle edges removed from the dependency graph: {len(stats['cycle_edges_removed'])} {stats['cycle_edges_removed'][:10]}")
miss = stats["chars_not_in_mmh"]
w(f"- Glyphs missing from Make Me a Hanzi: {len(miss)}, of which {sum(1 for c in miss if nodes['h:'+c].get('script') != 'T')} are needed in Simplified: "
  f"{[c for c in miss if nodes['h:'+c].get('script') != 'T']}")
real = [n for n in words if n["script"] != "T" and n.get("max_char_rank")]
for cut in (1500, 2500, 3000, 3500):
    k = sum(1 for n in real if n["max_char_rank"] > cut)
    w(f"- Words containing a character rarer than rank {cut:,}: {k:,}")
worst = sorted((n for n in real if n.get("rank")), key=lambda n: n["rank"])
worst = [n["form"] + f" ({n['max_char_rank']})" for n in worst if n["max_char_rank"] > 3000][:12]
w(f"- Most frequent words with a character rarer than rank 3,000 (character's rank): {', '.join(worst)}")
s2t = defaultdict(set)
for a, b, k, _ in edges:
    if k == "simp_trad" and a.startswith("h:") and nodes[a]["script"] != "T":
        s2t[a].add(b)
multi = [k for k, v in s2t.items() if len(v) > 1 and nodes[k].get("rank")]
ex = sorted(multi, key=lambda k: nodes[k]["rank"])[:10]
w(f"- Simplified characters with more than one Traditional form: {len(multi)}, e.g. " + ", ".join(k[2:] + "→" + "/".join(x[2:] for x in sorted(s2t[k])) for k in ex))
w("")
w("## Sentences (Tatoeba, Mandarin with an English translation)\n")
table(("step", "count"), [(k, f"{v:,}") for k, v in stats["sentences"].items()])

w("## Prerequisite depth\n")
rows = []
for t, pick in (("character (top 3,500)", chars), ("word (frequency top 10,000)", [n for n in words if n.get("rank")]),
                ("sentence", [n for n in nodes.values() if n["type"] == "sentence"])):
    sizes = sorted(len(closure(n["id"])) for n in pick)
    rows.append((t, statistics.median(sizes), sizes[int(len(sizes) * 0.9)], sizes[-1]))
table(("item", "median transitive prerequisites", "90th percentile", "max"), rows)

subtlex = RAW / "eval_only_subtlex_chr.json"
if subtlex.exists():
    w("## Coverage of SUBTLEX-CH (evaluation only, never shipped)\n")
    chr_rows = json.loads(subtlex.read_text(encoding="utf8"))["data"]
    chr_count = {r["Character"]: r["CHRCount"] for r in chr_rows}
    total = sum(chr_count.values())
    ours = sorted(chars, key=lambda n: n["rank"])
    best = sorted(chr_count.values(), reverse=True)
    rows = []
    for n in (100, 500, 1000, 2000, 3000, 3500):
        rows.append((f"{n:,}", f"{sum(chr_count.get(c['form'], 0) for c in ours[:n]) / total:.2%}", f"{sum(best[:n]) / total:.2%}"))
    w(f"Characters: {total:,} tokens, {len(chr_count):,} types.\n")
    table(("top-N characters", "our order", "SUBTLEX's own order (ceiling)"), rows)
    wf_rows = json.loads((RAW / "eval_only_subtlex_wf.json").read_text(encoding="utf8"))["data"]
    wf_count = {str(r["Word"]): r["WCount"] for r in wf_rows if is_han(str(r["Word"]))}
    total_w = sum(wf_count.values())
    ranked_w = sorted((n for n in words if n.get("rank")), key=lambda n: n["rank"])
    best_w = sorted(wf_count.values(), reverse=True)
    rows = [(f"{n:,}", f"{sum(wf_count.get(x['form'], 0) for x in ranked_w[:n]) / total_w:.2%}", f"{sum(best_w[:n]) / total_w:.2%}")
            for n in (100, 500, 1000, 2000, 5000, 10000)]
    w(f"Words: {total_w:,} Han tokens, {len(wf_count):,} types.\n")
    table(("top-N words", "our order", "SUBTLEX's own order (ceiling)"), rows)

w("## Ten random nodes with direct prerequisites (seed 2026)\n")
rng = random.Random(2026)
by_type = defaultdict(list)
for n in sorted(nodes.values(), key=lambda n: n["id"]):
    by_type[n["type"]].append(n)
plan = [("component", 1), ("character", 3), ("word", 3), ("pattern", 1), ("sentence", 2)]
for t, k in plan:
    for n in rng.sample(by_type[t], k):
        w(f"**{n['id']}** ({t}" + (f", script {n['script']}" if n.get("script") else "") + (f", rank {n['rank']}" if n.get("rank") else "")
          + (f", HSK {n['hsk']}" if n.get("hsk") else "") + ")  ")
        if t != "sentence" and (n.get("pinyin") or n.get("en")):
            en = n["en"] if isinstance(n.get("en"), str) else "; ".join(n.get("en") or [])
            w(f"{n.get('pinyin', '')} — {en}  ")
        if t == "sentence":
            w(f"{n['original']} — {n['en']}  ")
        pre = sorted(prereq[n["id"]], key=lambda x: x[1])
        shown = ", ".join(f"{p}" + (f" ({r})" if r else "") for p, _, r in pre) or "none (root)"
        w(f"needs: {shown}  ")
        links = sorted(b for a, b, k2, _ in edges if a == n["id"] and k2 == "simp_trad")
        if links:
            w(f"same item as: {', '.join(links)}  ")
        w("")
(ROOT / "reports").mkdir(exist_ok=True)
(ROOT / "reports" / "phase1_checkpoint.md").write_text("\n".join(out) + "\n", encoding="utf8")
print("\n".join(out))
