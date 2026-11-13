"""Unlock orders. Run: python -m jiesuo.order

Why greedy over prerequisite closures: choosing the best set of N items under
precedence constraints is NP-hard (precedence-constrained knapsack), and the usual
practical heuristic is density: repeatedly take the item whose whole unknown
closure gives the most value per item learned.

Plain density is myopic, because it ignores that 学 also makes 学习 cheaper later.
LOOKAHEAD adds a share of the value of the words a character helps with. Its
weight is chosen on training sentences only (jiesuo.evaluate --tune).

Modelling choices:
* A learning unit is a Simplified or shared form. Traditional forms cost nothing
  extra, so N does not depend on script. This is generous; see the report.
* A single-character word and its character are one unit. Knowing 好 is both.
* Value is wordfreq frequency. Frequent tokens outside the vocabulary (一个) give
  their mass to the parts they split into, so that mass is not simply lost.
* Grammar patterns have no effect on token coverage, so they are excluded from N
  and interleaved afterwards by a simple rule (add_patterns).
"""
import heapq
import json
from collections import defaultdict
from pathlib import Path

import wordfreq

from . import sources as src

ROOT = Path(__file__).resolve().parent.parent
GRAPH, OUT = ROOT / "data" / "graph", ROOT / "data" / "order"
RAW_SUBTLEX = ROOT / "data" / "raw" / "eval_only_subtlex_wf.json"  # evaluation only, never shipped

# Which component edges are hard prerequisites.
HARD_ROLES = {
    "all": {"semantic", "phonetic", "both", "meaning", "form", "no_etymology", "unmatched"},
    "explained": {"semantic", "phonetic", "both", "meaning"},  # the data says why the part is there
    "none": set(),
}
PRIMARY_MODE = "explained"
PATTERN_EVERY = 10  # at most one grammar pattern per this many items


class Model:
    """Units, their prerequisites and their value, for one prerequisite mode."""

    def __init__(self, value, prereq, future=None):
        self.value, self.prereq = value, prereq
        self.future = future or {}

    def closure(self, unit, known=()):
        """Unknown ancestors of unit, then unit, prerequisites always first."""
        out, seen = [], set(known)

        def visit(u):
            if u in seen:
                return
            seen.add(u)
            for p in sorted(self.prereq.get(u, ())):
                visit(p)
            out.append(u)

        visit(unit)
        return out


def greedy(model, lookahead=0.0):
    """Density greedy: take the target whose unknown closure has the best value per item."""
    worth = lambda u: model.value.get(u, 0.0) + lookahead * model.future.get(u, 0.0)
    targets = [u for u in set(model.value) | set(model.future) if worth(u) > 0]
    remaining = {t: set(model.closure(t)) for t in targets}
    gain = {t: sum(worth(u) for u in remaining[t]) for t in targets}
    used_by = defaultdict(list)
    for t, members in remaining.items():
        for u in members:
            used_by[u].append(t)
    heap = [(-gain[t] / len(remaining[t]), t, len(remaining[t])) for t in targets]
    heapq.heapify(heap)
    known, order = set(), []
    while heap:
        _, t, size = heapq.heappop(heap)
        if t in known or size != len(remaining[t]):
            continue  # stale entry
        for u in model.closure(t, known):
            known.add(u)
            order.append(u)
            for other in used_by[u]:
                if u in remaining[other]:
                    remaining[other].discard(u)
                    gain[other] -= worth(u)
                    if remaining[other] and other not in known:
                        heapq.heappush(heap, (-gain[other] / len(remaining[other]), other, len(remaining[other])))
    return order


def from_targets(model, targets):
    """Baseline orders: learn targets in the given order, paying for prerequisites as they come up."""
    known, order = set(), []
    for t in targets:
        for u in model.closure(t, known):
            known.add(u)
            order.append(u)
    return order


def word_unit(form):
    return f"h:{form}" if len(form) == 1 else f"w:{form}"


def back_off(token, vocab, chars):
    """Longest known words first, then single characters. None if a character is not in the graph."""
    out, i = [], 0
    while i < len(token):
        for j in range(len(token), i, -1):
            if token[i:j] in vocab or (j == i + 1 and token[i] in chars):
                out.append(token[i:j])
                i = j
                break
        else:
            return None
    return out


class Data:
    """The built graph, read once and shared by all modes."""

    def __init__(self):
        with open(GRAPH / "nodes.jsonl", encoding="utf8") as f:
            self.nodes = {n["id"]: n for n in map(json.loads, f)}
        self.edges = []
        with open(GRAPH / "edges.tsv", encoding="utf8") as f:
            for line in f:
                self.edges.append(tuple(line.rstrip("\n").split("\t")))
        self.words = {n["form"]: n for n in self.nodes.values() if n["type"] == "word" and n["script"] != "T"}
        self.chars = {n["form"] for n in self.nodes.values() if n["type"] == "character" and n["script"] != "T"}
        self.value = self._values()

    def _values(self):
        value = defaultdict(float)
        for form, n in self.words.items():
            value[word_unit(form)] += n["freq"]
        for form, f in wordfreq.get_frequency_dict("zh", "large").items():
            if form in self.words or not src.is_han(form):
                continue
            parts = back_off(form, self.words, self.chars)
            for p in parts or ():
                value[word_unit(p)] += f / len(parts)
        return dict(value)

    def model(self, mode=PRIMARY_MODE):
        prereq = defaultdict(set)
        for a, b, kind, role in self.edges:
            if kind == "component" and role in HARD_ROLES[mode]:
                prereq[b].add(a)
            elif kind == "char_word" and b[2:] in self.words and len(b[2:]) > 1:
                prereq[b].add(a)
        future = defaultdict(float)
        for form in self.words:
            if len(form) > 1:
                for c in set(form):
                    future[f"h:{c}"] += self.value.get(f"w:{form}", 0.0) / len(form)
        return Model(self.value, dict(prereq), dict(future))

    def frequency_targets(self):
        return [word_unit(f) for f in sorted(self.words, key=lambda f: (-self.words[f]["freq"], f))]

    def hsk_targets(self):
        """HSK bands in order. Within a band, most frequent first, which helps this baseline."""
        key = lambda f: (self.words[f].get("hsk") or 99, -self.words[f]["freq"], f)
        return [word_unit(f) for f in sorted(self.words, key=key)]

    def hsk_focus(self, model, rest):
        """The app's HSK focus: finish each band with the same greedy, then carry on with `rest`."""
        known, order = set(), []
        for band in sorted({n["hsk"] for n in self.words.values() if n.get("hsk")}):
            value = {word_unit(f): max(n["freq"], 1e-9) for f, n in self.words.items() if n.get("hsk") == band and word_unit(f) not in known}
            left = {u: ps - known for u, ps in model.prereq.items() if u not in known}
            for u in greedy(Model(value, left)):
                if u not in known:
                    known.add(u)
                    order.append(u)
        return order + [u for u in rest if u not in known]

    def orders(self, mode=PRIMARY_MODE, lookahead=0.0):
        m = self.model(mode)
        unlock = greedy(m, lookahead)
        # Words with no frequency data have no value to chase; they go last, by HSK band.
        known = set(unlock)
        for t in self.hsk_targets():
            for u in m.closure(t, known):
                known.add(u)
                unlock.append(u)
        return {
            "hsk_focus": self.hsk_focus(m, unlock),
            "unlock": unlock,
            "frequency": from_targets(m, self.frequency_targets()),
            "hsk": from_targets(m, self.hsk_targets()),
        }


def add_patterns(order, nodes, edges, every=PATTERN_EVERY, by_level=False):
    """Interleave patterns: at most one per `every` items, once its words are known.

    Commonest first, or lowest HSK level first when by_level is set.
    """
    needs, count = defaultdict(set), defaultdict(int)
    for a, b, kind, _ in edges:
        if kind == "word_pattern":
            needs[b].add(word_unit(a[2:]))
        elif kind == "pattern_sentence":
            count[a] += 1
    waiting = sorted(needs, key=lambda p: (nodes[p]["hsk"] if by_level else 0, -count[p], p))
    known, out = set(), []
    for i, u in enumerate(order, 1):
        out.append(u)
        known.add(u)
        if i % every == 0:
            ready = next((p for p in waiting if needs[p] <= known), None)
            if ready:
                waiting.remove(ready)
                out.append(ready)
    return out + waiting


def main():
    settings = json.loads((OUT / "settings.json").read_text())
    data = Data()
    orders = data.orders(PRIMARY_MODE, settings["lookahead"])
    merged = add_patterns(orders["unlock"], data.nodes, data.edges)
    focus = add_patterns(orders["hsk_focus"], data.nodes, data.edges, by_level=True)
    (OUT / "unlock_order.json").write_text(json.dumps(merged, ensure_ascii=False) + "\n", encoding="utf8")
    (OUT / "hsk_focus_order.json").write_text(json.dumps(focus, ensure_ascii=False) + "\n", encoding="utf8")
    print(len(orders["unlock"]), "items,", len(merged) - len(orders["unlock"]), "patterns")


if __name__ == "__main__":
    main()
