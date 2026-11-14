"""Resolve one main Jyutping reading per character (spec section 6).

Rules, in order:
1. A character in data/yue/overrides.tsv takes that reading (status "override").
2. rime's main reading (the entry with no weight; with none unweighted, the heaviest entry; a tie
   or several unweighted entries is ambiguous and gives no rime main) is "agreed" if CC-Canto or
   Unihan also has it and HKCanCor does not contradict it.
3. Otherwise HKCanCor's top one-character reading ("corpus"), if the character occurs at least
   MIN_TOKENS times as a one-character word, the top is unique, and some dictionary source has it.
4. Otherwise "unresolved".
"""
import sys
from collections import Counter, namedtuple
from pathlib import Path

from . import jyutping, sources

ROOT = Path(__file__).resolve().parent.parent.parent
OVERRIDES = ROOT / "data" / "yue" / "overrides.tsv"
REPORT = ROOT / "reports" / "yue_readings.md"
MIN_TOKENS = 5

Resolution = namedtuple("Resolution", "form main others status evidence")


def load_overrides(path=OVERRIDES) -> dict:
    """form -> reading. Every line needs a reading that parses, a reason and a source."""
    out = {}
    lines = Path(path).read_text(encoding="utf8").splitlines()
    for n, line in enumerate(lines[1:], 2):
        if not line.strip() or line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) != 4 or not all(c.strip() for c in cols):
            raise ValueError(f"{path}:{n}: need form, reading, reason, source")
        jyutping.parse(cols[1])
        out[cols[0]] = cols[1]
    return out


def corpus_counts(hkcancor) -> dict:
    """char -> Counter(reading) over one-character, one-syllable HKCanCor tokens."""
    counts: dict = {}
    for sent in hkcancor:
        for word, _pos, jy in sent:
            if len(word) == 1 and " " not in jy:
                counts.setdefault(word, Counter())[jy] += 1
    return counts


def load_sources(overrides_path=OVERRIDES) -> dict:
    hk = sources.load_hkcancor()
    return {
        "rime": sources.load_rime_chars(),
        "cccanto": sources.load_cccanto_chars(),
        "unihan": sources.load_unihan(),
        "hkcancor": hk,
        "overrides": load_overrides(overrides_path),
    }


def _corpus(srcs) -> dict:
    # cached on the source dict so resolving every character stays fast
    if "_corpus" not in srcs:
        srcs["_corpus"] = corpus_counts(srcs["hkcancor"])
    return srcs["_corpus"]


def _rime_main(entries):
    if not entries:
        return None
    unweighted = [r for r, w in entries if w is None]
    if unweighted:
        return unweighted[0] if len(unweighted) == 1 else None
    top = max(w for _, w in entries)
    best = {r for r, w in entries if w == top}
    return best.pop() if len(best) == 1 else None


def _top(counter, min_tokens=MIN_TOKENS):
    """(top reading, tied top readings) of a corpus counter, or (None, set()) if too few tokens."""
    if not counter or sum(counter.values()) < min_tokens:
        return None, set()
    best = max(counter.values())
    tied = {r for r, c in counter.items() if c == best}
    return (next(iter(tied)) if len(tied) == 1 else None), tied


def resolve_char(ch, srcs) -> Resolution:
    rime = srcs["rime"].get(ch, [])
    canto = srcs["cccanto"].get(ch, set())
    uni = srcs["unihan"].get(ch, set())
    corpus = _corpus(srcs).get(ch, Counter())

    evidence: dict = {}
    for r, w in rime:
        evidence.setdefault(r, []).append("rime" if w is None else f"rime({w:g}%)")
    for name, rs in (("cccanto", canto), ("unihan", uni)):
        for r in rs:
            evidence.setdefault(r, []).append(name)
    for r, c in corpus.items():
        evidence.setdefault(r, []).append(f"hkcancor({c})")

    def sourcecount(r):
        return len(evidence[r])

    def finish(main, status):
        others = sorted((r for r in evidence if r != main), key=lambda r: (-sourcecount(r), r))
        return Resolution(ch, main, others, status, evidence)

    over = srcs.get("overrides", {}).get(ch)
    if over:
        evidence.setdefault(over, []).append("override")
        return finish(over, "override")

    top, tied = _top(corpus)
    in_dict = {r for r, _ in rime} | canto | uni

    main = _rime_main(rime)
    if main and (main in canto or main in uni):
        contradicted = top is not None and top != main or (top is None and tied and main not in tied)
        if not contradicted:
            return finish(main, "agreed")

    if top is not None and top in in_dict:
        return finish(top, "corpus")
    return finish(None, "unresolved")


def resolve_all(srcs) -> dict:
    forms = set(srcs["rime"]) | set(srcs["cccanto"]) | set(_corpus(srcs)) | set(srcs.get("overrides", {}))
    forms = {f for f in forms if len(f) == 1}
    return {f: resolve_char(f, srcs) for f in sorted(forms)}


def write_report(resolutions, path=REPORT, srcs=None):
    res = list(resolutions)
    counts = Counter(r.status for r in res)
    corpus = _corpus(srcs) if srcs is not None else {}

    def freq(r):
        return sum(corpus.get(r.form, {}).values())

    unresolved = sorted((r for r in res if r.status == "unresolved"), key=lambda r: (-freq(r), r.form))
    lines = ["# Cantonese character readings", "",
             f"Characters considered: {len(res)}", "", "## Counts per status", "",
             "| status | characters |", "|---|---|"]
    for status in ("agreed", "corpus", "override", "unresolved"):
        lines.append(f"| {status} | {counts.get(status, 0)} |")
    lines += ["", f"## Unresolved ({len(unresolved)} in total)", ""]
    if not unresolved:
        lines.append("None.")
    else:
        lines.append("Most frequent first (count = one-character HKCanCor tokens). "
                     "Each candidate shows which sources have it.")
        lines.append("")
        for r in unresolved:
            cands = "; ".join(f"{rd} [{', '.join(srcs_)}]" for rd, srcs_ in sorted(r.evidence.items()))
            lines.append(f"- {r.form} (hkcancor {freq(r)}): {cands or 'no readings'}")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf8")


def main():
    srcs = load_sources()
    res = resolve_all(srcs)
    write_report(res.values(), REPORT, srcs)
    print(Counter(r.status for r in res.values()), file=sys.stderr)


if __name__ == "__main__":
    main()
