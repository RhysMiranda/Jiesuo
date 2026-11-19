"""Held-out evaluation (phase 2, Task 13): readings, word splitting and course-order coverage.

The test split is every 5th HKCanCor sentence (lexicon.split_heldout). The lexicon, its readings, the word
frequencies and the course order were built from the train split only, so nothing here was seen when they were made.
"""
import json
import sys
from collections import Counter
from pathlib import Path

from . import course as coursemod
from . import lexicon
from .lexicon import is_han, segment

ROOT = lexicon.ROOT
REPORT = ROOT / "reports" / "yue_accuracy.md"
TONE_REPORT = ROOT / "reports" / "yue_tone_check.md"
COURSE = ROOT / "app" / "yue" / "data" / "course.json"
NS = (100, 300, 1000, 3000)


def _norm(jp):
    return " ".join((jp or "").lower().split())


def reading_report(test, lex):
    """Tokens whose form is in the lexicon, compared with HKCanCor's annotation.

    Returns tokens, types, token_share, type_share (a type is right only if every one of its tokens is) and
    disagreements: (form, lexicon jp, HKCanCor jp, count), most frequent first."""
    n = right = 0
    per = {}
    bad = Counter()
    for sent in test:
        for word, _pos, jp in sent:
            w = lex.get(word)
            if w is None or not w.jp:
                continue
            n += 1
            ok = _norm(jp) == _norm(w.jp)
            right += ok
            per.setdefault(word, []).append(ok)
            if not ok:
                bad[(word, _norm(w.jp), _norm(jp))] += 1
    types_ok = sum(all(v) for v in per.values())
    dis = [(f, a, b, c) for (f, a, b), c in sorted(bad.items(), key=lambda kv: (-kv[1], kv[0]))]
    return {"tokens": n, "types": len(per), "token_share": right / n if n else 0.0,
            "type_share": types_ok / len(per) if per else 0.0, "disagreements": dis}


def reading_accuracy(test, lex):
    return reading_report(test, lex)["token_share"]


def _bounds(tokens):
    out, i = set(), 0
    for t in tokens:
        i += len(t)
        out.add(i)
    return out


def split_f1(test, lex):
    """Boundary F1 of lexicon.segment (over the lexicon forms) against HKCanCor's word boundaries."""
    forms = set(lex)
    tp = fp = fn = 0
    for sent in test:
        gold = [w for w, _p, _j in sent]
        g, p = _bounds(gold), _bounds(segment("".join(gold), forms))
        tp += len(g & p)
        fp += len(p - g)
        fn += len(g - p)
    d = 2 * tp + fp + fn
    return 2 * tp / d if d else 0.0


def coverage(order, sentences, ns=NS):
    """{n: share of tokens (sentences are lists of tokens) among the first n form items of `order`}.
    `g:` grammar items are ignored."""
    first = {}
    for f in (x for x in order if not x.startswith("g:")):
        first.setdefault(f, len(first))
    ranks = [first.get(t) for s in sentences for t in s]
    total = len(ranks)
    return {n: (sum(1 for r in ranks if r is not None and r < n) / total if total else 0.0) for n in ns}


def frequency_order(train):
    """Plain order: Han words of the HKCanCor train split by count."""
    c = Counter(w for s in train for w, _p, _j in s if w and is_han(w[0]))
    return [f for f, _ in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))]


def _han_tokens(tokens):
    return [t for t in tokens if t and is_han(t[0])]


def tone_line(path=TONE_REPORT):
    """The phase 1 tone-check result and its measures, read from reports/yue_tone_check.md."""
    if not Path(path).exists():
        return "Tone check (phase 1): report not found."
    lines = Path(path).read_text(encoding="utf8").splitlines()
    res = next((x.strip("* ") for x in lines if x.startswith("**Result")), "")
    rows = [[c.strip() for c in x.strip("|").split("|")] for x in lines if x.startswith("| ") and
            any(k in x for k in ("accuracy on decided", "largest single", "rate"))]
    meas = "; ".join(f"{r[0]} {r[1]} (needed {r[2]})" for r in rows if len(r) >= 3)
    return f"Tone check (phase 1, held-out voices, read from reports/yue_tone_check.md): {res} {meas}."


def _pct(x):
    return f"{100 * x:.1f}%"


def evaluate(srcs=None):
    srcs = srcs or lexicon.load_sources()
    lex = lexicon.build_lexicon(srcs)
    train, test = srcs["train"], srcs["test"]
    course = json.loads(COURSE.read_text(encoding="utf8"))["order"]
    forms = set(lex)
    sets = {"HKCanCor test": [_han_tokens([w for w, _p, _j in s]) for s in test],
            "Tatoeba yue, colloquial": [_han_tokens(segment(s["text"].strip(), forms))
                                        for s in srcs["tatoeba"] if coursemod.colloquial(s["text"], forms)]}
    plain = frequency_order(train)
    return {"reading": reading_report(test, lex), "f1": split_f1(test, lex), "sets": sets,
            "cov": {k: {"course": coverage(course, v), "frequency": coverage(plain, v)} for k, v in sets.items()},
            "n_test": len(test), "n_train": len(train),
            "course_len": len([x for x in course if not x.startswith("g:")])}


def write_report(r, path=REPORT):
    rd = r["reading"]
    L = ["# Cantonese phase 2: held-out evaluation", "",
         f"Test set: every 5th HKCanCor sentence ({r['n_test']} sentences; {r['n_train']} train). The lexicon, its "
         "readings, the word frequencies and the course order used the train split only, so none of this was seen "
         "when they were made.", "", tone_line(), "",
         "## Readings", "",
         "For each test token whose form is in the lexicon, the lexicon's Jyutping against HKCanCor's annotation.", "",
         "| measure | count | share equal |", "|---|---|---|",
         f"| per token | {rd['tokens']} | {_pct(rd['token_share'])} |",
         f"| per token type (unique forms; right only if every token agrees) | {rd['types']} | {_pct(rd['type_share'])} |",
         "", "### 20 most frequent disagreements", "",
         "Many are learning points (a changed tone in speech, or a word with two readings), not errors.", "",
         "| form | app | HKCanCor | count |", "|---|---|---|---|"]
    L += [f"| {f} | {a} | {b} | {c} |" for f, a, b, c in rd["disagreements"][:20]]
    L += ["", "## Word splitting", "",
          "Boundary F1 of the longest-match segmenter (over the lexicon forms) against HKCanCor's word boundaries "
          "on the test sentences, taken as text with no spaces.", "",
          "| measure | value |", "|---|---|", f"| boundary F1 | {_pct(r['f1'])} |", "",
          "## Coverage", "",
          "Share of Han tokens whose word is among the first n form items (`g:` grammar items are not counted). "
          f"`course` is the shipped order ({r['course_len']} words); `frequency` is a plain HKCanCor train-count order.", ""]
    for name, c in r["cov"].items():
        L += [f"### {name} ({sum(len(s) for s in r['sets'][name])} tokens)", "",
              "| n | course | frequency |", "|---|---|---|"]
        L += [f"| {n} | {_pct(c['course'][n])} | {_pct(c['frequency'][n])} |" for n in NS]
        L.append("")
    Path(path).write_text("\n".join(L), encoding="utf8")


def main():
    r = evaluate()
    write_report(r)
    rd = r["reading"]
    print(f"readings {_pct(rd['token_share'])} tokens / {_pct(rd['type_share'])} types; split F1 {_pct(r['f1'])}",
          file=sys.stderr)
    for k, c in r["cov"].items():
        print(k, {n: (_pct(c["course"][n]), _pct(c["frequency"][n])) for n in NS}, file=sys.stderr)


if __name__ == "__main__":
    main()
