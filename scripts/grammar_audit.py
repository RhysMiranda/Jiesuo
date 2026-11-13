#!/usr/bin/env python3
"""Draw samples for checking grammar detection by hand.

    python scripts/grammar_audit.py draw    # writes reports/grammar_audit.tsv with an empty label column
    python scripts/grammar_audit.py score   # reads the labels and reports precision and recall

Precision: a uniform sample of detected (pattern, sentence) pairs.
Recall: a uniform sample of pairs where the sentence contains every word the pattern
requires but the detector did not fire. Requiring the words is necessary for most
patterns, so missed uses are estimated as (number of such pairs) x (share labelled true).
"""
import csv
import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from jiesuo.grammar import PATTERNS  # noqa: E402

G, OUT = ROOT / "data" / "graph", ROOT / "reports" / "grammar_audit.tsv"
N_PRECISION, N_RECALL = 200, 200


def load():
    nodes = {n["id"]: n for n in map(json.loads, open(G / "nodes.jsonl", encoding="utf8"))}
    words, matched = defaultdict(set), set()
    for line in open(G / "edges.tsv", encoding="utf8"):
        a, b, kind, _ = line.rstrip("\n").split("\t")
        if kind in ("word_sentence", "char_sentence"):
            words[b].add(a[2:])
        elif kind == "pattern_sentence":
            matched.add((a[2:], b))
    return nodes, words, matched


def draw():
    nodes, words, matched = load()
    rng = random.Random(20261113)
    missed = [(p.key, s) for p in PATTERNS for s, ws in words.items() if set(p.requires) <= ws and (p.key, s) not in matched]
    prec = rng.sample(sorted(matched), N_PRECISION)
    rec = rng.sample(sorted(missed), N_RECALL)
    by_key = {p.key: p for p in PATTERNS}
    with open(OUT, "w", encoding="utf8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["sample", "pattern", "form", "sentence_id", "sentence", "label"])
        for name, rows in (("precision", prec), ("recall", rec)):
            for key, s in rows:
                w.writerow([name, key, by_key[key].pattern, s, nodes[s]["text"], ""])
    meta = {"matched_pairs": len(matched), "unmatched_candidate_pairs": len(missed)}
    (ROOT / "reports" / "grammar_audit_meta.json").write_text(json.dumps(meta) + "\n")
    print(meta)


def wilson(k, n, z=1.96):
    if not n:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    r = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - r) / d, (c + r) / d)


def score():
    meta = json.loads((ROOT / "reports" / "grammar_audit_meta.json").read_text())
    rows = list(csv.DictReader(open(OUT, encoding="utf8"), delimiter="\t"))
    out = {}
    for name in ("precision", "recall"):
        lab = [r["label"] for r in rows if r["sample"] == name]
        assert all(x in ("0", "1") for x in lab), f"unlabelled rows in {name}"
        k = sum(x == "1" for x in lab)
        out[name] = {"labelled": len(lab), "true": k, "share": k / len(lab), "ci95": wilson(k, len(lab))}
    p, miss = out["precision"]["share"], out["recall"]["share"]
    tp = meta["matched_pairs"] * p
    fn = meta["unmatched_candidate_pairs"] * miss
    out["estimated_recall"] = tp / (tp + fn)
    lo_tp, hi_tp = (meta["matched_pairs"] * x for x in out["precision"]["ci95"])
    lo_fn, hi_fn = (meta["unmatched_candidate_pairs"] * x for x in out["recall"]["ci95"])
    out["estimated_recall_range"] = (lo_tp / (lo_tp + hi_fn), hi_tp / (hi_tp + lo_fn))
    out.update(meta)
    (ROOT / "reports" / "grammar_audit.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    {"draw": draw, "score": score}[sys.argv[1]]()
