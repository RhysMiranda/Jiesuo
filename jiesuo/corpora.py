"""Second test corpora: Universal Dependencies Chinese treebanks (CC BY-SA, evaluation only).

None of these texts is used to build the graph, choose words or tune settings. wordfreq
includes Wikipedia, so the two wiki-based sets share a source with our frequencies; the
Hong Kong set (student films and LegCo proceedings) does not, as far as we know.
"""
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
CORPORA = {
    "ud_hk": ("Hong Kong film subtitles and LegCo speech (UD Chinese-HK, Traditional)", ["eval_only_ud_hk_test.conllu"]),
    "ud_wiki_news": ("Wikipedia and news (UD Chinese-GSDSimp test and Chinese-PUD)", ["eval_only_ud_gsdsimp_test.conllu", "eval_only_ud_pud_test.conllu"]),
}


def read_conllu(name):
    """Sentences as (text, gold tokens)."""
    out, text, toks = [], None, []
    for line in (RAW / name).read_text(encoding="utf8").splitlines():
        if line.startswith("# text = "):
            text = line[9:].strip()
        elif not line.strip():
            if text is not None:
                out.append((text, toks))
            text, toks = None, []
        elif not line.startswith("#"):
            cols = line.split("\t")
            if cols[0].isdigit():  # skip multiword ranges and empty nodes
                toks.append(cols[1])
    if text is not None:
        out.append((text, toks))
    return out


def load(corpus):
    return [s for f in CORPORA[corpus][1] for s in read_conllu(f)]
