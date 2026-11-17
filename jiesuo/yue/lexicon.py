"""Word lexicon: one resolved Jyutping reading per word, changed tones, spoken frequency, meanings.

Reading order for a word (spec section 6):
1. rime words, CC-Canto and reviewed words.hk (the available sources) give one distinct reading: "agree".
2. Otherwise the HKCanCor train-split majority (at least MIN_TOKENS tokens, a unique top): "corpus".
3. Otherwise the reviewed words.hk reading: "wordshk".
4. Otherwise a row of data/yue/overrides.tsv: "override".
5. Otherwise "unresolved".
Single characters take their reading from readings.resolve_char.
"""
import json
import pickle
import re
import sys
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from . import jyutping, readings, sources

ROOT = readings.ROOT
CACHE = sources.RAW / "cache"
CEDICT = ROOT / "data" / "raw" / "cedict.json"
MIN_TOKENS = 3
CODE_VERSION = 3  # bump when a cached loader's result shape changes
SECONDARY_WEIGHT = 0.5
REPORT_TOP = 6000

_HAN = re.compile("[㐀-䶿一-鿿豈-﫿〇\U00020000-\U0003134f]")
_COLLOQUIAL = re.compile("[佢係喺嘅咗冇唔哋啲嚟乜咩嘢噉嗰睇畀俾㗎囉喎啦喇嘛]")


@dataclass
class Word:
    form: str
    jp: str
    alt: list = field(default_factory=list)
    status: str = "unresolved"
    freq: float = 0.0
    en: str = ""
    changed: list = field(default_factory=list)
    wordshk_id: int | None = None
    whk_eng: bool = False  # a reviewed, published words.hk entry with this form and reading has an English gloss


def is_han(ch: str) -> bool:
    return bool(_HAN.fullmatch(ch))


def split_heldout(hkcancor):
    """(train, test): every 5th sentence (index 4, 9, ...) is test. Readings and frequencies use train only."""
    train = [s for i, s in enumerate(hkcancor) if i % 5 != 4]
    test = [s for i, s in enumerate(hkcancor) if i % 5 == 4]
    return train, test


def segment(text, lexicon_forms, maxlen=4):
    """Longest match first; unknown Han characters are single tokens; a non-Han run is one token."""
    out = []
    i, n = 0, len(text)
    while i < n:
        if not is_han(text[i]):
            j = i
            while j < n and not is_han(text[j]):
                j += 1
            out.append(text[i:j])
            i = j
            continue
        for k in range(min(maxlen, n - i), 0, -1):
            piece = text[i:i + k]
            if k == 1 or (all(is_han(c) for c in piece) and piece in lexicon_forms):
                out.append(piece)
                i += k
                break
    return out


def _norm(jp: str, form: str):
    """Normalised, validated reading with one syllable per character, else None."""
    syls = jyutping.split(jp or "")
    if len(syls) != len(form) or "".join(syls) != (jp or "").lower().replace(" ", ""):
        return None
    for s in syls:
        try:
            jyutping.parse(s)
        except ValueError:
            return None
    return " ".join(syls)


def _wordshk_index(srcs) -> dict:
    """form -> [(reading, entry id)] over reviewed words.hk entries only."""
    if "_whk" not in srcs:
        idx: dict = {}
        for e in srcs.get("wordshk", []):
            if not e.reviewed:
                continue
            for form, jp in e.forms:
                r = _norm(jp, form)
                if r and (r, e.id) not in idx.setdefault(form, []):
                    idx[form].append((r, e.id))
        srcs["_whk"] = idx
    return srcs["_whk"]


def _train(srcs):
    if "train" in srcs:
        return srcs["train"]
    return split_heldout(srcs.get("hkcancor", []))[0]


def _word_counts(srcs) -> dict:
    """form -> Counter(reading) over HKCanCor train tokens."""
    if "_wc" not in srcs:
        wc: dict = {}
        for sent in _train(srcs):
            for word, _pos, jp in sent:
                wc.setdefault(word, Counter())[jp] += 1
        srcs["_wc"] = wc
    return srcs["_wc"]


def _char_res(ch, srcs):
    if "chars" in srcs:
        return srcs["chars"].get(ch)
    return readings.resolve_char(ch, srcs)


def _changed(form, jp, srcs):
    out = []
    for i, (ch, syl) in enumerate(zip(form, jp.split())):
        r = _char_res(ch, srcs)
        if r is None:
            continue
        known = {x for x in [r.main, *r.others] if x}
        if syl not in known and any(jyutping.toneless(syl) == jyutping.toneless(k) for k in known):
            out.append(i)
    return out


def _pinyin_key(py: str) -> str:
    """Pinyin normalised the same way on both sides: lower case, no spaces, ü / v as u:."""
    return re.sub(r"\s+", "", py.lower().replace("ü", "u:").replace("v", "u:"))


_DROP_START = ("cl:", "surname ", "variant of", "old variant of", "see ", "also pr.", "also written", "taiwan pr.",
               "abbr. for", "used in", "(tw)")
_HAN_PAREN = re.compile(r"\([^()]*" + _HAN.pattern + r"[^()]*\)")
_HAN_PAIR = re.compile("(" + _HAN.pattern + r"+)\|" + _HAN.pattern + "+")
_PY_BRACKET = re.compile(r"\[[^\[\]]*[a-zA-Z:]+[1-5][^\[\]]*\]")
_PY_TONE = re.compile(r"[a-zA-Z:]+[1-5]\b")


_PR_LABEL = re.compile(r"\b(?:Taiwan|colloquial|also) pr\.\s*(?:\[[^\]]*\])?", re.I)
_REF = re.compile(r"^(?:old variant of|variant of|see)\s+(" + _HAN.pattern + r"+)", re.I)


def _tidy(t: str) -> str:
    """Punctuation left dangling by the removals: empty brackets, ', ;', trailing commas."""
    for _ in range(4):
        t = re.sub(r"\(\s*\)|\[\s*\]", "", t)
        t = re.sub(r"\(\s*[;,]\s*", "(", t)
        t = re.sub(r"\s*[;,]\s*([;,)])", r"\1", t)
        t = re.sub(r"\s+", " ", t).strip(" \t;,:/")
        t = re.sub(r"\s*\($", "", t).strip(" \t;,:/")
        if t.count("(") > t.count(")") and t.endswith(("(", ",")):
            t = t.rstrip("(, ")
    return t


def clean_senses(senses, limit=3, follow=None) -> str:
    """Dictionary senses with the Mandarin taken out (Ruling 12): no classifier / surname / variant / cross-reference
    senses, no pinyin, no Simplified forms. At most `limit` senses joined with "; "; "" if nothing is left.
    If every sense was a reference ("see X[..]", "variant of X") and `follow(form)` gives senses for the traditional
    X, those are used instead (followed once)."""
    senses = list(senses or [])
    out = []
    for sense in senses:
        t = sense.strip()
        if t.lower().startswith(_DROP_START) or "surname " in t.lower():
            continue
        k = t.lower().find("also pr.")
        if k != -1:
            t = t[:k].strip()
        t = _PR_LABEL.sub("", t)
        t = _HAN_PAREN.sub("", t)
        t = _HAN_PAIR.sub(r"\1", t)
        t = _PY_BRACKET.sub("", t)
        if re.search(_HAN.pattern + r"\[", t) or "|" in t or _PY_TONE.search(t):
            continue
        t = _tidy(t)
        if t and t not in out:
            out.append(t)
    if not out and follow:
        for sense in senses:
            m = _REF.match(sense.strip())
            if m:
                got = follow(m.group(1))
                return clean_senses(got, limit) if got else ""
    return "; ".join(out[:limit])


def _cedict_by_form(srcs) -> dict:
    """traditional form -> every CC-CEDICT sense of it, for following a "see X" reference once."""
    if "_cedict_trad" not in srcs:
        out: dict = {}
        if CEDICT.exists():
            for e in json.loads(CEDICT.read_text(encoding="utf8")):
                out.setdefault(e["traditional"], []).extend(e["english"])
        srcs["_cedict_trad"] = out
    return srcs["_cedict_trad"]


def _english(form, jp, srcs, alt=()) -> str:
    """A meaning that belongs to this reading, from the first source that has one: a CC-Canto gloss with the same
    reading, then CC-CEDICT senses whose pinyin the CC-Canto readings file maps to this reading (up to 3); for a single
    character the order is the other way round (Ruling 14). Every
    sense goes through clean_senses, so no Mandarin reaches the app. Otherwise "". `alt` is not used: a gloss never
    has to guess between readings."""
    if not jp:
        return ""
    follow = lambda f: _cedict_by_form(srcs).get(f)
    glosses = [en for rd, en in srcs.get("cccanto_words", {}).get(form, []) if rd == jp and en]
    cedict = srcs.get("cedict_jp", {}).get((form, jp)) or []
    if len(form) > 1:
        for en in glosses:
            got = clean_senses(en.split("/"), follow=follow)
            if got:
                return got
        return clean_senses(cedict, follow=follow)
    # A single character has many minor senses in CC-Canto ("(verb) to catch"): the dictionary's own come first,
    # then the CC-Canto glosses, up to 3 senses in all.
    out = []
    if not cedict:  # CC-CEDICT marks Cantonese-only senses "(dialect)" under a pinyin the readings file lacks (睇)
        cedict = [x[len("(dialect)"):].strip() for x in _cedict_by_form(srcs).get(form, [])
                  if x.lower().startswith("(dialect)")]
    for sense in [*cedict, *(x for en in glosses for x in en.split("/"))]:
        c = clean_senses([sense], 1, follow=follow)
        if c and c not in out:
            out.append(c)
    return "; ".join(out[:3])


def _whk_eng_index(srcs) -> set:
    """(form, reading) of reviewed AND published words.hk entries that have an English gloss."""
    if "_whk_eng" not in srcs:
        out = set()
        for e in srcs.get("wordshk", []):
            if e.reviewed and e.published and any(x.strip() for x in e.eng):
                for form, jp in e.forms:
                    r = _norm(jp, form)
                    if r:
                        out.add((form, r))
        srcs["_whk_eng"] = out
    return srcs["_whk_eng"]


def _candidates(form, srcs):
    """Source readings: (rime, cccanto, [(reading, id)] reviewed words.hk), each validated."""
    rime = [r for r in (_norm(x, form) for x in srcs.get("rime_words", {}).get(form, [])) if r]
    canto = [r for r in (_norm(x, form) for x, _e in srcs.get("cccanto_words", {}).get(form, [])) if r]
    return rime, canto, _wordshk_index(srcs).get(form, [])


def resolve_word(form, srcs) -> Word:
    if len(form) == 1:
        r = _char_res(form, srcs)
        whk = _wordshk_index(srcs).get(form, [])
        if r is None or not r.main:
            return Word(form, "", list(r.others) if r else [], "unresolved")
        status = "agree" if r.status == "agreed" else r.status
        wid = next((i for rd, i in whk if rd == r.main), None)
        return Word(form, r.main, list(r.others), status, en=_english(form, r.main, srcs, r.others), wordshk_id=wid,
                    whk_eng=(form, r.main) in _whk_eng_index(srcs))

    rime, canto, whk = _candidates(form, srcs)
    whk_readings = [rd for rd, _i in whk]
    cands: list = []
    for rd in rime + canto + whk_readings:
        if rd not in cands:
            cands.append(rd)

    def make(jp, status):
        wid = next((i for rd, i in whk if rd == jp), None)
        alt = [c for c in cands if c != jp]
        return Word(form, jp, alt, status, en=_english(form, jp, srcs, alt), changed=_changed(form, jp, srcs),
                    wordshk_id=wid, whk_eng=(form, jp) in _whk_eng_index(srcs))

    if len(cands) == 1:
        return make(cands[0], "agree")
    counts = _word_counts(srcs).get(form)
    if counts and sum(counts.values()) >= MIN_TOKENS:
        best = max(counts.values())
        tied = [r for r, c in counts.items() if c == best]
        if len(tied) == 1 and _norm(tied[0], form):
            return make(tied[0], "corpus")
    if whk_readings:
        return make(whk_readings[0], "wordshk")
    over = srcs.get("overrides", {}).get(form)
    if over and _norm(over, form):
        return make(_norm(over, form), "override")
    return make("", "unresolved")


def _secondary_texts(srcs):
    for e in srcs.get("wordshk", []):
        if e.reviewed:
            for ex in e.examples:
                yield ex[0]
    for s in srcs.get("tatoeba", []):
        if _COLLOQUIAL.search(s["text"]):
            yield s["text"]


def build_lexicon(srcs) -> dict:
    wc = _word_counts(srcs)
    if "chars" not in srcs:
        srcs["chars"] = readings.resolve_all(srcs)
    chars = srcs["chars"]

    def ok(form):
        return (1 <= len(form) <= 4 and all(is_han(c) for c in form)
                and all((chars.get(c) is not None and chars[c].main) for c in form))

    forms = {f for f in wc if ok(f)}
    forms |= {f for f in _wordshk_index(srcs) if ok(f)}
    forms |= {f for f in srcs.get("cccanto_words", {}) if ok(f)}

    hk_freq = {f: sum(c.values()) for f, c in wc.items()}
    sec: Counter = Counter()
    for text in _secondary_texts(srcs):
        for tok in segment(text, forms):
            if tok in forms:
                sec[tok] += 1

    lex = {}
    for f in sorted(forms):
        w = resolve_word(f, srcs)
        w.freq = hk_freq.get(f, 0) + SECONDARY_WEIGHT * sec.get(f, 0)
        lex[f] = w
    return lex


def _cached(name, files, fn):
    """Pickle fn()'s result under data/raw/yue/cache/, keyed by the files' sizes and mtimes."""
    key = [CODE_VERSION] + [(p.name, p.stat().st_size, p.stat().st_mtime_ns) for p in files]
    path = CACHE / f"lexicon_{name}.pickle"
    try:
        with open(path, "rb") as f:
            k, data = pickle.load(f)
        if k == key:
            return data
    except Exception:
        pass
    data = fn()
    try:
        CACHE.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump((key, data), f)
    except OSError:
        pass
    return data


_READING_LINE = re.compile(r"^(\S+) \S+ \[([^\]]*)\] \{([^}]*)\}")
CANTO_READINGS = sources.RAW / "cccedict_canto_readings.zip"


def _cedict_jp() -> dict:
    """(traditional form, Jyutping) -> CC-CEDICT senses, matched through CC-Canto's readings file
    (lines like `食 食 [shi2] {sik6}`) on the pinyin of each CEDICT entry."""
    jp_of: dict = {}
    with zipfile.ZipFile(CANTO_READINGS) as z:
        for member in z.namelist():
            if member.endswith("/"):
                continue
            for line in z.read(member).decode("utf8").splitlines():
                m = _READING_LINE.match(line)
                if m:
                    jp = sources.fix_reading(m.group(3))
                    if jp:
                        jp_of.setdefault((m.group(1), _pinyin_key(m.group(2))), set()).add(jp)
    out: dict = {}
    for e in json.loads(CEDICT.read_text(encoding="utf8")):
        for jp in sorted(jp_of.get((e["traditional"], _pinyin_key(e["pinyin"])), ())):
            for sense in e["english"]:
                lst = out.setdefault((e["traditional"], jp), [])
                if sense not in lst:
                    lst.append(sense)
    return out


def load_sources(overrides_path=readings.OVERRIDES) -> dict:
    raw = sources.RAW
    srcs = readings.load_sources(overrides_path)
    srcs["rime_words"] = sources.load_rime_words()
    srcs["cccanto_words"] = sources.load_cccanto_words()
    whk_files = sorted(sources.WORDSHK_DIR.glob("all-*.csv"))
    srcs["wordshk"] = _cached("wordshk", whk_files[-1:], sources.load_wordshk)
    tat = [raw / "tatoeba" / n for n in ("eng_sentences_detailed.tsv.bz2", "yue-eng_links.tsv.bz2",
                                         "yue_sentences_detailed.tsv.bz2")]
    srcs["tatoeba"] = _cached("tatoeba", tat, sources.load_tatoeba_yue)
    srcs["cedict_jp"] = _cached("cedict_jp", [CEDICT, CANTO_READINGS], _cedict_jp)
    srcs["train"], srcs["test"] = split_heldout(srcs["hkcancor"])
    # character readings for the lexicon see the train split only (phase 1's readings.json is unchanged)
    srcs["chars"] = readings.resolve_all({**srcs, "hkcancor": srcs["train"]})
    return srcs


def _cand_text(w, srcs) -> str:
    rime, canto, whk = _candidates(w.form, srcs)
    whk_r = [r for r, _ in whk]
    parts = []
    for rd in dict.fromkeys(rime + canto + whk_r):
        names = [n for n, lst in (("rime", rime), ("cccanto", canto), ("wordshk", whk_r)) if rd in lst]
        parts.append(f"{rd} [{', '.join(names)}]")
    wc = _word_counts(srcs).get(w.form)
    if wc:
        parts.append("hkcancor " + ", ".join(f"{r} x{c}" for r, c in wc.most_common()))
    return "; ".join(parts) or "no readings"


def write_word_report(lex, srcs, path=readings.REPORT):
    """Append (or replace) the "## Words" section of reports/yue_readings.md."""
    counts = Counter(w.status for w in lex.values())
    top = sorted(lex.values(), key=lambda w: (-w.freq, w.form))[:REPORT_TOP]
    unresolved = [w for w in top if w.status == "unresolved"]
    lines = ["## Words", "", f"Words considered: {len(lex)}. Held-out split: every 5th HKCanCor sentence "
             "is test; readings and frequencies use train only.", "",
             "| status | words |", "|---|---|"]
    for s in ("agree", "corpus", "wordshk", "override", "unresolved"):
        lines.append(f"| {s} | {counts.get(s, 0)} |")
    lines += ["", f"### Unresolved among the top {REPORT_TOP} by frequency ({len(unresolved)})", ""]
    if not unresolved:
        lines.append("None.")
    for w in unresolved:
        lines.append(f"- {w.form} (freq {w.freq:g}): {_cand_text(w, srcs)}")
    p = Path(path)
    text = p.read_text(encoding="utf8") if p.exists() else "# Cantonese character readings\n"
    cut = text.find("\n## Words")
    if cut != -1:
        text = text[:cut + 1]
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text.rstrip("\n") + "\n\n" + "\n".join(lines) + "\n", encoding="utf8")


def main():
    srcs = load_sources()
    lex = build_lexicon(srcs)
    write_word_report(lex, srcs)
    print(dict(Counter(w.status for w in lex.values())), file=sys.stderr)


if __name__ == "__main__":
    main()
