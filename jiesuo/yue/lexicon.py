"""Word lexicon: one resolved Jyutping reading per word, changed tones, spoken frequency, meanings.

Reading order for a word of two or more characters (spec section 6):
0. A row of data/yue/overrides.tsv (a hand decision with its reason and source) wins: "override".
1. rime words, CC-Canto and reviewed words.hk (the available sources) give one distinct reading: "agree". A reading
   that only one source lists, with a syllable that is neither its character's main reading nor a shipped alternative
   of it (唔會 m4 wui2, 朝朝 ciu4 ciu4), is accepted only when an attestation (below) supports it; else "unresolved".
2. Otherwise the HKCanCor train-split majority (at least MIN_TOKENS tokens, a unique top): "corpus".
3. Otherwise the reviewed words.hk reading: "wordshk".
4. Otherwise "unresolved".
Attestations are the form's HKCanCor train tokens and the spans of reviewed words.hk examples that spell the form,
each with its own Jyutping. When a strict majority of them gives a reading other than the one chosen above, the
attested reading is used instead ("attested"): it is how people were heard, or written down, saying the word.
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
MIN_ATTESTED = 3  # attestations (HKCanCor train tokens + words.hk example spans) before their majority counts
CODE_VERSION = 4  # bump when a cached loader's result shape changes
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
    labels: dict = field(default_factory=dict)  # alternative reading -> "literary" / "citation" (overrides.tsv col 5)


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


_TAIL_JP = re.compile(r"^(.*?)\s*\(([a-z0-9 ,.!?;:~'…-]*[1-6][a-z0-9 ,.!?;:~'…-]*)\)\s*$", re.S)


def split_example_jp(text, jp):
    """(text, jp). The words.hk loader only takes a parenthetical of bare syllables as the reading; one with
    punctuation inside ("ngo5 zi1 dou3, ...") is left on the text. Take it off here."""
    if jp:
        return text, jp
    m = _TAIL_JP.match(text.strip())
    if m and m.group(1):
        return m.group(1), re.sub(r"[,.!?;:~'…-]+", " ", m.group(2))
    return text, jp


def example_runs(text, jp):
    """A words.hk example's Han runs as [[(char, syllable), ...], ...], aligned on its own Jyutping (one syllable
    per Han character), or None when it does not align (Latin letters or digits in the text, a bad syllable)."""
    text, jp = split_example_jp(text, jp)
    syls = jyutping.split(jp or "")
    if not syls or "".join(syls) != (jp or "").lower().replace(" ", "") or re.search(r"[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]", text):
        return None
    for x in syls:
        try:
            jyutping.parse(x)
        except ValueError:
            return None
    if sum(1 for c in text if is_han(c)) != len(syls):
        return None
    runs, cur, k = [], [], 0
    for c in text:
        if is_han(c):
            cur.append((c, syls[k]))
            k += 1
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return runs


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


def _example_spans(srcs) -> dict:
    """form -> Counter(reading): every 2-4 character span of a reviewed words.hk example that spells a form some
    source lists, with the example's own Jyutping for it."""
    if "_whk_spans" not in srcs:
        want = set(srcs.get("rime_words", {})) | set(srcs.get("cccanto_words", {})) | set(_wordshk_index(srcs))
        want |= set(_word_counts(srcs))
        want = {f for f in want if 2 <= len(f) <= 4}
        out: dict = {}
        for e in srcs.get("wordshk", []):
            if not e.reviewed:
                continue
            for ex in e.examples:
                for run in example_runs(ex[0], ex[1]) or ():
                    for i in range(len(run)):
                        for L in range(2, min(4, len(run) - i) + 1):
                            piece = "".join(c for c, _ in run[i:i + L])
                            if piece in want:
                                out.setdefault(piece, Counter())[" ".join(x for _, x in run[i:i + L])] += 1
        srcs["_whk_spans"] = out
    return srcs["_whk_spans"]


def attestations(form, srcs) -> Counter:
    """Readings people were heard or written with: the form's HKCanCor train tokens, plus (two or more characters)
    the spans of reviewed words.hk examples that spell it."""
    out = Counter()
    for rd, n in (_word_counts(srcs).get(form) or {}).items():
        r = _norm(rd, form)
        if r:
            out[r] += n
    if len(form) > 1:
        out.update(_example_spans(srcs).get(form) or {})
    return out


def attested_majority(form, srcs):
    """The reading a strict majority of the form's attestations give (at least MIN_ATTESTED of them), else None."""
    att = attestations(form, srcs)
    if sum(att.values()) < MIN_ATTESTED:
        return None
    rd, n = att.most_common(1)[0]
    return rd if 2 * n > sum(att.values()) else None


def _plain(form, jp, srcs) -> bool:
    """Every syllable is its character's main reading or one of its alternatives that ship (2 or more sources)."""
    for ch, syl in zip(form, jp.split()):
        r = _char_res(ch, srcs)
        if r is None or not r.main:
            return False
        known = {r.main} | {o for o in r.others if len([x for x in r.evidence.get(o, ()) if x != "override"]) >= 2}
        if syl not in known:
            return False
    return True


def _same_word(form, srcs) -> list:
    """[(reading, label)]: other readings of the same word, from overrides.tsv column 5."""
    return list(srcs.get("same_word", {}).get(form, ()))


def _labels(form, jp, srcs) -> dict:
    return {rd: lab for rd, lab in _same_word(form, srcs) if lab and rd != jp}


def _meaning(form, jp, srcs, alt=()) -> str:
    """_english for the reading, else (a word of two or more characters) for another reading of the same word
    (overrides.tsv column 5). A single character's readings often carry different senses (平 peng4 cheap, ping4
    flat), so a character only ever takes the meanings of its own reading."""
    en = _english(form, jp, srcs, alt)
    for rd, _lab in (_same_word(form, srcs) if len(form) > 1 else ()):
        if en:
            break
        en = _english(form, rd, srcs, alt)
    return en


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


_OTHER_VARIETY = re.compile(r"beijing dialect|\((?:[^()]*[\s;,/])?(?:taiwan|tw|mainland|archaic|old|literary|classical)(?:[\s;,/][^()]*)?\)",
                            re.I)


def _split_gloss(en: str) -> list:
    """A CC-Canto gloss split on "/" outside brackets ("(phrase / adverb) no" is one sense)."""
    out, depth, cur = [], 0, ""
    for c in en:
        depth += (c in "([") - (c in ")]")
        if c == "/" and depth <= 0:
            out.append(cur)
            cur = ""
        else:
            cur += c
    return [*out, cur]


def _balanced(t: str) -> str:
    """Drop the brackets that have no partner."""
    for open_, close in ("()", "[]"):
        keep, stack = [True] * len(t), []
        for i, c in enumerate(t):
            if c == open_:
                stack.append(i)
            elif c == close:
                if stack:
                    stack.pop()
                else:
                    keep[i] = False
        for i in stack:
            keep[i] = False
        t = "".join(c for c, k in zip(t, keep) if k)
    return t


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


_POS = (r"(?:verb|adverb|adjective|noun|phrase|pronoun|plural|conjunction|preposition|prep\.|interjection|particle|"
        r"classifier|measure word|idiom|expression|adj\.|adv\.|n\.|v\.)")
_POS_TAG = re.compile(r"^\(\s*" + _POS + r"(?:[\s;,/–-]+" + _POS + r")*\s*\)\s*", re.I)
_POS_MID = re.compile(r"(^|;\s*)\(\s*" + _POS + r"(?:[\s;,/–-]+" + _POS + r")*\s*\)\s*", re.I)
_ENUM = re.compile(r"(?:^|\s)\d+\.\s+")


_OF_ENUM = re.compile(r"^(\((?:of|of a|of an|of the)\s[^()]*\))\s*(1\.\s.*)$", re.I)
_TAG_WORDS = re.compile(r"^\(\s*(?:" + _POS + r"|appellation|attributive|bound form|coll\.|colloquial|literally|"
                        r"lit\.|fig\.|figurative|onom\.)(?:\s*[/;,]\s*(?:" + _POS + r"|appellation|attributive|"
                        r"bound form|coll\.|colloquial|literally|lit\.|fig\.|figurative|onom\.))+\s*\)\s*", re.I)


def _expand(sense: str) -> list:
    """One sense without its leading part-of-speech tag; "1. x; 2. y" becomes separate senses, and
    "(of X) 1. a; 2. b" becomes "(of X) a", "(of X) b"."""
    t = _TAG_WORDS.sub("", _POS_TAG.sub("", sense.strip()))
    m = _OF_ENUM.match(t)
    if m:
        return [f"{m.group(1)} {x.strip(' ;,')}" for x in _ENUM.split(m.group(2)) if x.strip(" ;,")]
    if re.match(r"1\.\s", t) or re.search(r";\s*2\.\s", t):  # "1. a; 2. b", or "a; 2. b" with the 1. left out
        return [x.strip(" ;,") for x in _ENUM.split(t) if x.strip(" ;,")]
    return [t]


def clean_senses(senses, limit=3, follow=None) -> str:
    """Dictionary senses with the Mandarin taken out (Ruling 12): no classifier / surname / variant / cross-reference
    senses, no pinyin, no Simplified forms. At most `limit` senses joined with "; "; "" if nothing is left.
    If every sense was a reference ("see X[..]", "variant of X") and `follow(form)` gives senses for the traditional
    X, those are used instead (followed once)."""
    senses = list(senses or [])
    out = []
    for sense in [x for raw in senses for x in _expand(raw)]:
        t = sense.strip()
        if t.lower().startswith(_DROP_START) or "surname " in t.lower():
            continue
        k = t.lower().find("also pr.")
        if k != -1:
            t = t[:k].strip()
        t = _PR_LABEL.sub("", t)
        if _OTHER_VARIETY.search(t):
            continue
        t = _HAN_PAREN.sub("", t)
        t = _HAN_PAIR.sub(r"\1", t)
        t = _PY_BRACKET.sub("", t)
        if re.search(_HAN.pattern + r"\[", t) or "|" in t or _PY_TONE.search(t):
            continue
        t = _tidy(_balanced(t))
        t = _POS_MID.sub(r"\1", t)  # a tag after a ";" inside a sense ("that time; (adverb) then")
        t = _tidy(_POS_TAG.sub("", t))  # a tag that only became leading, or alone, after the removals
        t = "; ".join(dict.fromkeys(x for x in t.split("; ") if x))  # "Tutor; Tutor" within one sense
        if t and t.lower() not in {x.lower() for x in out}:  # ... or as two senses
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
                if not _proper(e):
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
            got = clean_senses(_split_gloss(en), follow=follow)
            if got:
                return got
        return clean_senses(cedict, follow=follow)
    # A single character has many minor senses in CC-Canto ("(verb) to catch"): the dictionary's own come first,
    # then the CC-Canto glosses, up to 3 senses in all. CC-CEDICT senses reached through a pinyin that maps to several
    # readings (平 ping2 -> ping4 and peng4) may belong to the other reading, so they come last.
    out = []
    if not cedict:  # CC-CEDICT marks Cantonese-only senses "(dialect)" under a pinyin the readings file lacks (睇)
        cedict = [x[len("(dialect)"):].strip() for x in _cedict_by_form(srcs).get(form, [])
                  if x.lower().startswith("(dialect)")]
    canto = [x for en in glosses for x in _split_gloss(en)]
    if (form, jp) in srcs.get("cedict_ambiguous", ()):
        # the senses may belong to the other reading: they count only for the dictionaries' own main reading
        main = readings._rime_main(srcs.get("rime", {}).get(form, []), set(srcs.get("cccanto", {}).get(form, ())))
        cedict = cedict if jp == main else []
    order = [*cedict, *canto]
    for sense in order:
        if _NOT_A_CHAR_SENSE.search(sense):
            continue
        c = clean_senses([sense], 1, follow=follow)
        if c and c not in out:
            out.append(c)
    return "; ".join(out[:3])


_NOT_A_CHAR_SENSE = re.compile(
    r"\b(?:dynasty|dynasties|kingdom|state of|warring states|province|county|prefecture|city|district|surname|"
    r"place name|country|river in|mountain in|short (?:name|for)|abbr\.)", re.I)


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
        return Word(form, r.main, list(r.others), status, en=_meaning(form, r.main, srcs, r.others), wordshk_id=wid,
                    whk_eng=(form, r.main) in _whk_eng_index(srcs), labels=_labels(form, r.main, srcs))

    rime, canto, whk = _candidates(form, srcs)
    whk_readings = [rd for rd, _i in whk]
    listed = list(dict.fromkeys(rime + canto + whk_readings))
    att = attestations(form, srcs)
    total = sum(att.values())

    def supported(rd):
        """A listed reading worth showing as an alternative: speech and examples do not contradict it (at least 1 in
        20 of 10 or more attestations), and two sources list it, or it is attested, or its syllables are usual."""
        if total >= 10 and att[rd] * 20 < total:
            return False
        return (rd in rime) + (rd in canto) + (rd in whk_readings) >= 2 or att[rd] > 0 or _plain(form, rd, srcs)

    cands = [rd for rd in listed if supported(rd)]
    cands += [rd for rd, n in att.most_common() if rd not in cands and n >= MIN_ATTESTED and n * 4 >= total]

    def make(jp, status):
        wid = next((i for rd, i in whk if rd == jp), None)
        alt = [c for c in (cands if jp else list(dict.fromkeys(listed + cands))) if c != jp]  # unresolved: every candidate
        labels = _labels(form, jp, srcs)
        alt += [rd for rd in labels if rd not in alt]  # a labelled reading is always shown
        return Word(form, jp, alt, status, en=_meaning(form, jp, srcs, alt), changed=_changed(form, jp, srcs),
                    wordshk_id=wid, whk_eng=(form, jp) in _whk_eng_index(srcs), labels=labels)

    over = srcs.get("overrides", {}).get(form)
    if over and _norm(over, form):
        jp = _norm(over, form)
        cands = list(dict.fromkeys(cands + [jp]))
        return make(jp, "override")
    major = attested_majority(form, srcs)

    def settle(jp, status):
        return make(major, "attested") if major and major != jp else make(jp, status)

    if len(listed) == 1:
        rd = listed[0]
        if major and major != rd:
            return make(major, "attested")
        if supported(rd):
            return make(rd, "agree")
        return make("", "unresolved")  # one source, an unusual syllable and nothing attested: not taught
    counts = _word_counts(srcs).get(form)
    if counts and sum(counts.values()) >= MIN_TOKENS:
        best = max(counts.values())
        tied = [r for r, c in counts.items() if c == best]
        if len(tied) == 1 and _norm(tied[0], form):
            return settle(_norm(tied[0], form), "corpus")
    if whk_readings:
        return settle(whk_readings[0], "wordshk")
    if major:
        return make(major, "attested")
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


def _proper(entry) -> bool:
    """A CC-CEDICT entry for a proper noun: its pinyin starts with a capital (Cheng2 Du1, Ming2, Bo1)."""
    return entry["pinyin"][:1].isupper()


def _cedict_jp():
    """((traditional form, Jyutping) -> CC-CEDICT senses, set of the keys whose senses came through a pinyin that the
    readings file maps to several Jyutping readings), matched through CC-Canto's readings file (lines like
    `食 食 [shi2] {sik6}`) on the pinyin of each CEDICT entry. Proper-noun entries are skipped."""
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
    ambiguous = set()
    for e in json.loads(CEDICT.read_text(encoding="utf8")):
        if _proper(e):
            continue
        jps = sorted(jp_of.get((e["traditional"], _pinyin_key(e["pinyin"])), ()))
        for jp in jps:
            if len(jps) > 1:
                ambiguous.add((e["traditional"], jp))
            for sense in e["english"]:
                lst = out.setdefault((e["traditional"], jp), [])
                if sense not in lst:
                    lst.append(sense)
    return out, ambiguous


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
    srcs["cedict_jp"], srcs["cedict_ambiguous"] = _cached("cedict_jp", [CEDICT, CANTO_READINGS], _cedict_jp)
    srcs["train"], srcs["test"] = split_heldout(srcs["hkcancor"])
    # character readings for the lexicon see the train split only (phase 1's readings.json is unchanged)
    srcs["chars"] = readings.resolve_all({**srcs, "hkcancor": srcs["train"]})
    srcs["same_word"] = readings.load_same_word(overrides_path)
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
    for s in ("agree", "corpus", "attested", "wordshk", "override", "unresolved"):
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
