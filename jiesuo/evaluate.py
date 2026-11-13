"""Measure orders on text. Two separate steps, so settings cannot see the test set:

    python -m jiesuo.evaluate --tune   # training sentences only; writes settings.json
    python -m jiesuo.evaluate          # held-out sentences, using the locked settings
"""
import hashlib
import json
import sys

import numpy as np

from . import sources as src
from .build_graph import HOLDOUT_MOD, MAX_SENTENCE_CHARS, T2S, segment
from .order import GRAPH, OUT, PRIMARY_MODE, HARD_ROLES, RAW_SUBTLEX, ROOT, Data, back_off, greedy, word_unit
import jieba

CHECKPOINTS = (100, 500, 1000, 2000)
LOOKAHEADS = (0.0, 0.1, 0.25, 0.5, 1.0, 2.0)
TUNE_SENTENCES = 8000
BOOTSTRAPS = 2000


def training_sentences():
    """Same filter as the graph build, but keeps sentences the graph dropped for unknown tokens."""
    texts, seen = [], set()
    for sid, (text, _) in sorted(src.load_tatoeba().items(), key=lambda kv: int(kv[0])):
        simp = T2S.convert(text)
        han = src.HAN_CHAR.findall(simp)
        if not han or len(han) > MAX_SENTENCE_CHARS or any(c.isascii() and c.isalpha() for c in simp) or simp in seen:
            continue
        seen.add(simp)
        if int(hashlib.sha1(simp.encode()).hexdigest(), 16) % HOLDOUT_MOD:
            texts.append(simp)
    return texts


def tokenise(texts, data):
    """Each Han token becomes (sentence index, the units needed to read it, how it resolved)."""
    rows = []
    for i, text in enumerate(texts):
        for tok, _ in segment(text):
            if not src.is_han(tok):
                continue
            if tok in data.words:
                rows.append((i, [word_unit(tok)], "exact"))
            else:
                parts = back_off(tok, data.words, data.chars)
                rows.append((i, [word_unit(p) for p in parts] if parts else None, "split" if parts else "unknown"))
    return rows


def learned_at(rows, order):
    """For each token, the number of items after which it becomes readable (inf if never)."""
    pos = {u: i + 1 for i, u in enumerate(order)}
    return np.array([max((pos.get(u, np.inf) for u in units), default=np.inf) if units else np.inf for _, units, _ in rows])


def score(when, sentence, n, n_sentences, boots=None):
    """Token coverage at n. boots is an optional matrix of sentence weights per resample."""
    hit = np.bincount(sentence, weights=when <= n, minlength=n_sentences)
    total = np.bincount(sentence, minlength=n_sentences)
    if boots is None:
        return hit.sum() / total.sum()
    return boots @ hit / (boots @ total)


def tune(data):
    rng = np.random.default_rng(2026)
    texts = training_sentences()
    sample = [texts[i] for i in rng.choice(len(texts), TUNE_SENTENCES, replace=False)]
    rows = tokenise(sample, data)
    sentence = np.array([r[0] for r in rows])
    model = data.model(PRIMARY_MODE)
    results = {}
    grid = np.arange(50, 2001, 50)
    for lam in LOOKAHEADS:
        when = learned_at(rows, greedy(model, lam))
        cov = [score(when, sentence, n, len(sample)) for n in grid]
        results[lam] = {"mean_coverage_to_2000": float(np.mean(cov)),
                        **{str(n): float(score(when, sentence, n, len(sample))) for n in CHECKPOINTS}}
        print(lam, {k: round(v, 4) for k, v in results[lam].items()})
    best = max(results, key=lambda l: results[l]["mean_coverage_to_2000"])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "settings.json").write_text(json.dumps({"lookahead": best, "chosen_on": "training sentences", "grid": results}, indent=1) + "\n")
    print("locked lookahead", best)


def subtlex_view(data, orders):
    """Subtitle word counts, as a second view. Not independent: wordfreq includes SUBTLEX-CH."""
    if not RAW_SUBTLEX.exists():
        return None
    rows, counts = [], []
    for r in json.loads(RAW_SUBTLEX.read_text(encoding="utf8"))["data"]:
        form = str(r["Word"])
        if not src.is_han(form):
            continue
        parts = [form] if form in data.words else back_off(form, data.words, data.chars)
        rows.append((0, [word_unit(p) for p in parts] if parts else None, ""))
        counts.append(r["WCount"])
    counts = np.array(counts, dtype=float)
    return {name: {str(n): float(counts[learned_at(rows, o) <= n].sum() / counts.sum()) for n in CHECKPOINTS}
            for name, o in orders.items()}


def evaluate(data):
    settings = json.loads((OUT / "settings.json").read_text())
    lam = settings["lookahead"]
    held = [json.loads(line)["text"] for line in open(GRAPH / "holdout_sentences.jsonl", encoding="utf8")]
    rows = tokenise(held, data)
    sentence = np.array([r[0] for r in rows])
    n_s = len(held)
    kinds = {k: sum(1 for r in rows if r[2] == k) for k in ("exact", "split", "unknown")}
    rng = np.random.default_rng(2026)
    boots = rng.multinomial(n_s, np.ones(n_s) / n_s, size=BOOTSTRAPS).astype(float)
    report = {"lookahead": lam, "sentences": n_s, "tokens": len(rows), "token_kinds": kinds, "modes": {}, "curves": {}}
    for mode in HARD_ROLES:
        orders = data.orders(mode, lam)
        when = {name: learned_at(rows, order) for name, order in orders.items()}
        table = {}
        for name in orders:
            sent_ready = np.zeros(n_s)
            np.maximum.at(sent_ready, sentence, when[name])
            has_tokens = np.bincount(sentence, minlength=n_s) > 0
            table[name] = {str(n): {"tokens": float(score(when[name], sentence, n, n_s)),
                                    "sentences": float((sent_ready[has_tokens] <= n).mean())} for n in CHECKPOINTS}
            table[name]["length"] = len(orders[name])
            exact = np.array([r[2] == "exact" for r in rows])
            table[name]["exact_tokens_only"] = {str(n): float(((when[name] <= n) & exact).sum() / len(rows)) for n in CHECKPOINTS}
        ready = {}
        for name in ("unlock", "hsk", "hsk_focus", "frequency"):
            sr = np.zeros(n_s)
            np.maximum.at(sr, sentence, when[name])
            ready[name] = (sr, np.bincount(sentence, minlength=n_s) > 0)
        table["whole_sentences_hsk_minus_unlock"] = {}
        for n in CHECKPOINTS:
            a = (ready["hsk"][0] <= n) & ready["hsk"][1]
            b = (ready["unlock"][0] <= n) & ready["unlock"][1]
            has = boots @ ready["hsk"][1].astype(float)
            d = (boots @ a.astype(float) - boots @ b.astype(float)) / has
            table["whole_sentences_hsk_minus_unlock"][str(n)] = [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]
        for base in ("frequency", "hsk"):
            table[f"unlock_minus_{base}"] = {}
            for n in CHECKPOINTS:
                d = score(when["unlock"], sentence, n, n_s, boots) - score(when[base], sentence, n, n_s, boots)
                table[f"unlock_minus_{base}"][str(n)] = [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]
        report["modes"][mode] = table
        grid = np.unique(np.concatenate([np.arange(0, 201, 10), np.arange(200, 3001, 25)]))
        report["curves"][mode] = {"n": grid.tolist(), **{name: [float(score(when[name], sentence, n, n_s)) for n in grid] for name in orders}}
    report["subtlex_not_held_out"] = subtlex_view(data, data.orders(PRIMARY_MODE, lam))
    tom = sum(1 for r in rows if r[1] and r[1][0] in ("w:汤姆", "w:玛丽"))
    report["name_share_tom_mary"] = tom / len(rows)
    (ROOT / "reports" / "phase2_results.json").write_text(json.dumps(report, indent=1) + "\n")
    return report


if __name__ == "__main__":
    jieba.setLogLevel(60)
    d = Data()
    if "--tune" in sys.argv:
        tune(d)
    else:
        print(json.dumps({k: v for k, v in evaluate(d).items() if k != "curves"}, indent=1))
