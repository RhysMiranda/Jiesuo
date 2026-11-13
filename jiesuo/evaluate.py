"""Measure orders on text. Two separate steps, so settings cannot see the test set:

    python -m jiesuo.evaluate --tune   # training sentences only; writes settings.json
    python -m jiesuo.evaluate          # held-out sentences, using the locked settings

Decision rule for the app's default order, fixed before the held-out run (see decide()):
the sentence-aware order replaces plain unlock as "Fastest reading" only if
  * on held-out Tatoeba, its token coverage is at most 0.5 points below unlock at every
    checkpoint, and its whole-sentence coverage is higher at 1,000 and 2,000 items; and
  * on each Universal Dependencies corpus, its token coverage is at most 1 point below
    unlock at every checkpoint.
"""
import hashlib
import json
import sys

import numpy as np

from . import sources as src
from .build_graph import HOLDOUT_MOD, MAX_SENTENCE_CHARS, T2S, segment
from .order import GRAPH, OUT, PRIMARY_MODE, HARD_ROLES, RAW_SUBTLEX, ROOT, Data, back_off, greedy, word_unit
from . import corpora
import jieba

CHECKPOINTS = (100, 500, 1000, 2000)
LOOKAHEADS = (0.0, 0.1, 0.25, 0.5, 1.0, 2.0)
TUNE_SENTENCES = 8000
BONUSES = (0.0, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0)
VALIDATE_MOD = 5  # 1 in 5 training sentences validates the sentence bonus
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
    bonus, bonus_grid = tune_bonus(data, best)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "settings.json").write_text(json.dumps({"lookahead": best, "chosen_on": "training sentences", "grid": results,
                                                   "sentence_bonus": bonus, "bonus_grid": bonus_grid}, indent=1) + "\n")
    print("locked lookahead", best, "sentence bonus", bonus)


def is_validation(text):
    return int(hashlib.sha1(("validate:" + text).encode()).hexdigest(), 16) % VALIDATE_MOD == 0


def ready_at(when, sentence, n_s):
    """For each sentence, the number of items after which every token in it is readable."""
    out = np.zeros(n_s)
    np.maximum.at(out, sentence, when)
    return out, np.bincount(sentence, minlength=n_s) > 0


def tune_bonus(data, lookahead):
    """Fit sentence bundles on 4/5 of the training sentences, score on the other 1/5.

    Rule, fixed before running: the largest whole-sentence coverage (mean over 50..2,000
    items) among bonuses whose mean token coverage is within 0.5 points of bonus 0.
    """
    model = data.model(PRIMARY_MODE)
    texts = sorted({n["text"] for n in data.nodes.values() if n["type"] == "sentence" and is_validation(n["text"])})
    fit = data.sentence_bundles(keep=lambda t: not is_validation(t))
    rows = tokenise(texts, data)
    sentence = np.array([r[0] for r in rows])
    grid = np.arange(50, 2001, 50)
    out = {}
    for b in BONUSES:
        when = learned_at(rows, greedy(model, lookahead, fit, b))
        ready, has = ready_at(when, sentence, len(texts))
        out[b] = {"tokens": float(np.mean([score(when, sentence, n, len(texts)) for n in grid])),
                  "sentences": float(np.mean([(ready[has] <= n).mean() for n in grid]))}
        print("bonus", b, {k: round(v, 4) for k, v in out[b].items()})
    allowed = [b for b in BONUSES if out[b]["tokens"] >= out[0.0]["tokens"] - 0.005]
    return max(allowed, key=lambda b: out[b]["sentences"]), {str(b): v for b, v in out.items()}


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


PAIRS_TOKENS = (("unlock", "frequency"), ("unlock", "hsk"), ("sentences", "unlock"), ("sentences", "hsk"))
PAIRS_SENTENCES = (("hsk", "unlock"), ("sentences", "unlock"), ("sentences", "hsk"))


def measure(texts, data, orders, seed=2026):
    """Coverage of every order on one set of texts, with bootstrap intervals by sentence."""
    rows = tokenise(texts, data)
    sentence = np.array([r[0] for r in rows])
    n_s = len(texts)
    rng = np.random.default_rng(seed)
    boots = rng.multinomial(n_s, np.ones(n_s) / n_s, size=BOOTSTRAPS).astype(float)
    when = {name: learned_at(rows, order) for name, order in orders.items()}
    ready = {name: ready_at(w, sentence, n_s) for name, w in when.items()}
    exact = np.array([r[2] == "exact" for r in rows])
    table = {}
    for name in orders:
        r, has = ready[name]
        table[name] = {str(n): {"tokens": float(score(when[name], sentence, n, n_s)), "sentences": float((r[has] <= n).mean())}
                       for n in CHECKPOINTS}
        table[name]["length"] = len(orders[name])
        table[name]["exact_tokens_only"] = {str(n): float(((when[name] <= n) & exact).sum() / len(rows)) for n in CHECKPOINTS}
    ci = lambda d: [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]
    for a, b in PAIRS_TOKENS:
        if a in orders and b in orders:
            table[f"{a}_minus_{b}"] = {str(n): ci(score(when[a], sentence, n, n_s, boots) - score(when[b], sentence, n, n_s, boots))
                                       for n in CHECKPOINTS}
    for a, b in PAIRS_SENTENCES:
        if a in orders and b in orders:
            has = boots @ ready[a][1].astype(float)
            table[f"whole_sentences_{a}_minus_{b}"] = {
                str(n): ci((boots @ ((ready[a][0] <= n) & ready[a][1]) - boots @ ((ready[b][0] <= n) & ready[b][1])) / has)
                for n in CHECKPOINTS}
    grid = np.unique(np.concatenate([np.arange(0, 201, 10), np.arange(200, 3001, 25)]))
    curves = {"n": grid.tolist(), **{name: [float(score(when[name], sentence, n, n_s)) for n in grid] for name in orders}}
    kinds = {k: int(sum(1 for r in rows if r[2] == k)) for k in ("exact", "split", "unknown")}
    return table, curves, {"sentences": n_s, "tokens": len(rows), "token_kinds": kinds}, rows


def decide(report):
    """Apply the decision rule in the module docstring."""
    t = report["modes"][PRIMARY_MODE]
    tat = all(t["sentences"][n]["tokens"] >= t["unlock"][n]["tokens"] - 0.005 for n in map(str, CHECKPOINTS))
    tat_s = all(t["sentences"][n]["sentences"] > t["unlock"][n]["sentences"] for n in ("1000", "2000"))
    ud = all(c["table"]["sentences"][n]["tokens"] >= c["table"]["unlock"][n]["tokens"] - 0.01
             for c in report["corpora"].values() for n in map(str, CHECKPOINTS))
    return {"tatoeba_tokens_ok": tat, "tatoeba_sentences_better": tat_s, "ud_tokens_ok": ud, "use_sentence_order": tat and tat_s and ud}


def evaluate(data):
    settings = json.loads((OUT / "settings.json").read_text())
    lam, bonus = settings["lookahead"], settings["sentence_bonus"]
    held = [json.loads(line)["text"] for line in open(GRAPH / "holdout_sentences.jsonl", encoding="utf8")]
    report = {"lookahead": lam, "sentence_bonus": bonus, "modes": {}, "curves": {}, "corpora": {}}
    for mode in HARD_ROLES:
        orders = data.orders(mode, lam, bonus)
        table, curves, info, rows = measure(held, data, orders)
        report["modes"][mode], report["curves"][mode] = table, curves
        if mode == PRIMARY_MODE:
            report.update(info)
            primary, held_rows = orders, rows
    for key, (label, _) in corpora.CORPORA.items():
        texts = [T2S.convert(t) for t, _ in corpora.load(key)]
        table, curves, info, _ = measure(texts, data, primary)
        report["corpora"][key] = {"label": label, "table": table, "curves": curves, **info}
    report["subtlex_not_held_out"] = subtlex_view(data, primary)
    tom = sum(1 for r in held_rows if r[1] and r[1][0] in ("w:汤姆", "w:玛丽"))
    report["name_share_tom_mary"] = tom / len(held_rows)
    pos = {name: {u: i + 1 for i, u in enumerate(o)} for name, o in primary.items()}
    report["name_positions"] = {w: {name: p.get(f"w:{w}") for name, p in pos.items()} for w in ("汤姆", "玛丽")}
    report["decision"] = decide(report)
    (ROOT / "reports" / "phase2_results.json").write_text(json.dumps(report, indent=1) + "\n")
    return report


if __name__ == "__main__":
    jieba.setLogLevel(60)
    d = Data()
    if "--tune" in sys.argv:
        tune(d)
    else:
        r = evaluate(d)
        print(json.dumps(r["decision"]), r["name_positions"])
