"""Course order, grammar placement and attested examples (phase 2, Task 3).

Order: Stage 1 forms first, then jiesuo.order.greedy over the spoken-frequency lexicon, where a multi-character
word needs the characters that are words themselves (spec section 3). A character is taught on its own only if it is
a free word: at least FREE_MIN one-character HKCanCor train tokens, or a reviewed, published words.hk entry of its own
with its reading and no written/classical label (Ruling 21); the others are shown on the meet card of the words that
use them. Formal-only forms (FORMAL_ONLY_ITEMS, Ruling 20) are never taught on their own;
colloquial words that contain them (不過, 是但, 現在) are. Forms that words.hk lists only as variants of another
form (囖, 嚹) are not taught either.

Examples are never written by hand. Each is a Tatoeba sentence, a published reviewed words.hk example, or a
HKCanCor train sentence, with Jyutping built per token from the lexicon (spec section 6):
* a token with no resolved reading, or an unknown character, drops the sentence;
* words.hk's own Jyutping for an example wins over the lexicon; the disagreement is recorded;
* a HKCanCor reading is used only when it is the lexicon's or one of its alternatives, else the sentence is dropped;
* Tatoeba sentences are also dropped when any one-character token has alternative readings in the lexicon (no
  exemption: HKCanCor labels everything with the main reading), or any multi-character token has fewer than 3
  HKCanCor train tokens (greedy segmentation can fuse words, e.g. 間房).
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

from jiesuo.order import Model, greedy

from . import jyutping, lexicon, sources
from .lexicon import is_han, segment

ROOT = lexicon.ROOT
CONTENT = ROOT / "data" / "yue" / "content"
REPORT = ROOT / "reports" / "yue_course.md"
COLLOQUIAL = "佢係喺嘅咗冇唔哋啲嚟乜咩嘢噉嗰睇畀俾㗎囉喎啦喇嘛"
FORMAL_TOKENS = ("他", "在", "的")
FORMAL_SUBSTRING = "沒有"
# Ruling 20: standalone items of written Chinese that speech replaces (佢, 唔, 呢, 嗰, 冇, 嘅, 係, 咗, 喺, 講, 睇, 食,
# 畀, 好, 乜嘢, 點, 仲). 還 is left out as a whole: its colloquial use ("still") is 仲.
FORMAL_ONLY_ITEMS = frozenset("不 他 她 它 們 這 那 沒 沒有 的 是 了 在 說 看 吃 給 很 什麼 怎麼 還".split())
# Also never items of their own (controller, refining Ruling 21): 之 (CC-CEDICT "him; her; it", the classical object
# pronoun) and 而 (a written conjunction; speech says 同, 但係), which HKCanCor has in semi-formal talk; and spellings
# of a taught word that the course does not use (俾 for 畀, 揾 for 搵, 啊 for 呀).
WRITTEN_ITEMS = frozenset("之 而".split())
ALT_SPELLINGS = {"俾": "畀", "揾": "搵", "啊": "呀"}
FREE_MIN = 5  # one-character HKCanCor train tokens for a character to be taught on its own (Ruling 21)
POOL_MAX_HAN = 20  # lesson sentences
GRAMMAR_MAX_HAN = 14  # grammar examples
HKCANCOR_MIN_HAN = 5  # fragments such as 未, 好啦 or 係關於嘅 teach nothing
TATOEBA_MIN_TRAIN = 3  # a multi-character token needs this many HKCanCor train tokens (spoken evidence it is a word)
PARTICLE_POINTS = {"laa3", "wo3", "lo1", "me1", "ge3fin", "bo3", "gwaa3"}  # the key character ends a clause
NOT_HK = "渠"  # Tatoeba yue sentences sometimes write 佢 as 渠 keoi4; not Hong Kong writing
GRAMMAR_WITHIN = 3000  # all words within this many items of the order
MIN_ATTESTED = 2
_TRAIL = "。？！?!.，,、~… \t　"
_PUNCT = _TRAIL + "「」『』（）"
_ALNUM = re.compile(r"[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]")


# ---------------------------------------------------------------- order

def headword_forms(srcs):
    """Forms that may be taught: rime characters and words, CC-Canto, or the first form of a reviewed words.hk entry.
    Forms seen only in HKCanCor are never taught, nor are forms that reviewed words.hk entries list only as a variant
    of another form (囖 for 囉, 嚹 for 喇), whatever rime or CC-Canto say."""
    out = set(srcs.get("rime", {})) | set(srcs.get("rime_words", {}))
    out |= set(srcs.get("cccanto", {})) | set(srcs.get("cccanto_words", {}))
    reviewed = [e for e in srcs.get("wordshk", []) if e.reviewed and e.forms]
    first = {e.forms[0][0] for e in reviewed}
    variant = {f for e in reviewed for f, _jp in e.forms[1:]}
    return (out | first) - (variant - first)


WRITTEN_LABELS = ("書面語", "文言", "古語", "專名")  # words.hk labels: written, classical, archaic; a proper name
# Parts of speech of a content word. words.hk leaves many written function words unlabelled (其 代詞, 而 連詞, 之 詞綴,
# 及 連詞, 雖 語素), so this path takes nouns, verbs, adjectives and measure words only; colloquial function words
# (佢, 同, 都, 就) are frequent enough in HKCanCor to pass FREE_MIN.
CONTENT_POS = ("名詞", "動詞", "形容詞", "量詞")


def wordshk_free_chars(wordshk, lex):
    """Characters with a reviewed AND published words.hk entry of their own, with the character's reading, a content
    word (CONTENT_POS) and not labelled written, classical or a name (Ruling 21 as refined: 雨 風 山 are words although
    HKCanCor rarely has them alone)."""
    out = set()
    for e in wordshk:
        if not (e.reviewed and e.published) or any(lab.strip() in WRITTEN_LABELS for lab in e.labels):
            continue
        if not any(x.strip() in CONTENT_POS for x in e.pos):
            continue
        for form, jp in e.forms:
            if len(form) == 1 and form in lex and lex[form].jp and lexicon._norm(jp, form) == lex[form].jp:
                out.add(form)
    return out


# HKCanCor writes some colloquial words with another character (checked on its one-character tokens: 來 lai4 x401,
# 嚟 x2; 俾 bei2 x390, 畀 x0; 重 zung6 x182, 仲 x1; 揾 x184, 搵 x0; 喇 laa1 x1400, 啦 x0; 嚹 laa3 x547; 囖 lo1 x1194,
# 囉 x3; 啊 aa3 x3373; 架 gaa3 x27). Those tokens count for the character the app teaches.
HKCANCOR_SPELLING = {("來", "lai4"): "嚟", ("俾", "bei2"): "畀", ("重", "zung6"): "仲", ("揾", "wan2"): "搵",
                     ("喇", "laa1"): "啦", ("嚹", "laa3"): "喇", ("囖", "lo1"): "囉", ("啊", "aa3"): "呀",
                     ("架", "gaa3"): "㗎"}


def free_chars(train, n=FREE_MIN, spelling=HKCANCOR_SPELLING):
    """Characters that are words of their own in speech: at least n one-character tokens in the HKCanCor train split
    (a token HKCanCor spells another way, `spelling`, counts for the app's character)."""
    c = Counter()
    for sent in train:
        for w, _p, jp in sent:
            if len(w) == 1:
                c[spelling.get((w, jp), w)] += 1
    return {ch for ch, k in c.items() if k >= n}


def order_words(lex, first, n=5000, headwords=None, free=None,
                exclude=FORMAL_ONLY_ITEMS | WRITTEN_ITEMS | frozenset(ALT_SPELLINGS), meant=frozenset()):
    """Stage 1 forms in content order, then greedy by spoken frequency, truncated to n.

    Only forms with a meaning for their reading (en, a published reviewed words.hk gloss, or a hand-checked one: a
    form in `meant`) and, when `headwords` is
    given, a headword form can be taught; never a form in `exclude`; and, when `free` is given, a single character
    only if it is in `free` (a free word in speech). A multi-character form needs the characters that are teachable
    words. Forms in `first` are known.
    """
    done = list(dict.fromkeys(first))
    known = set(done)
    ok = {f for f, w in lex.items() if (w.en or w.whk_eng or f in meant) and (headwords is None or f in headwords)
          and f not in exclude and (free is None or len(f) > 1 or f in free)}
    value = {f: lex[f].freq for f in ok if lex[f].freq > 0 and f not in known}
    prereq = {}
    for f in ok:
        if len(f) > 1 and f not in known:
            need = {c for c in f if c in ok and c not in known and c != f}
            if need:
                prereq[f] = need
    rest = greedy(Model(value=value, prereq=prereq), lookahead=0.0)
    out = list(done)
    for f in rest:
        if f not in known:
            known.add(f)
            out.append(f)
    return out[:n]


# ---------------------------------------------------------------- formal and colloquial

def _tokens(text, seg):
    """seg is a segmenting function, or a collection of lexicon forms."""
    return seg(text) if callable(seg) else segment(text, seg)


def formal_hits(text, seg):
    """Formal-only forms: 他 / 在 / 的 standing alone after segmentation, and the substring 沒有."""
    hits = [t for t in _tokens(text, seg) if t in FORMAL_TOKENS]
    if FORMAL_SUBSTRING in text:
        hits.append(FORMAL_SUBSTRING)
    return hits


def colloquial(text, seg):
    return any(c in text for c in COLLOQUIAL) and not formal_hits(text, seg)


# ---------------------------------------------------------------- example building

def han_len(text):
    return sum(1 for c in text if is_han(c))


def _strip(text):
    return text.strip().rstrip(_TRAIL)


def _align(text, syls, lex, forms, tol):
    """Per-token jp for text (all Han characters) against per-character syllables (or None).

    tol 'wordshk': the source's syllables win and a difference from the lexicon is recorded.
    tol 'alt': the source's syllables are used only when they are an alternative reading of the word.
    Returns (jp, words, diffs, toks) or None; toks is [[token, the reading used for it], ...] in text order.
    """
    jps, words, diffs, off = [], [], [], 0
    used_toks = []
    toks = []
    for run in re.split(r"[^㐀-鿿豈-﫿〇𠀀-𱍏]+", text):
        if run:  # segment each Han run alone: a word never spans punctuation
            toks += segment(run, forms)
    for tok in toks:
        if not is_han(tok[0]) or tok not in lex or not lex[tok].jp:
            return None
        w = lex[tok]
        L = len(tok)
        got = None if syls is None else " ".join(syls[off:off + L])
        if got is None or got == w.jp:
            use = w.jp
        elif tol == "wordshk" or got in w.alt:
            use = got
            diffs.append((tok, w.jp, got))
        else:
            return None
        jps.append(use)
        used_toks.append([tok, use])
        if tok not in words:
            words.append(tok)
        off += L
    return " ".join(jps), words, diffs, used_toks


def _split_valid(jp):
    syls = jyutping.split(jp or "")
    if not syls or "".join(syls) != (jp or "").lower().replace(" ", ""):
        return None
    for s in syls:
        try:
            jyutping.parse(s)
        except ValueError:
            return None
    return syls


split_example_jp = lexicon.split_example_jp


def _mk(id_, text, jp, en, source, words, author=None, en_id=None, en_author=None):
    ex = {"id": id_, "text": text, "jp": jp, "en": en or None, "source": source, "words": words}
    if author:
        ex["author"] = author
    if en_id:
        ex["en_id"] = en_id
        ex["en_author"] = en_author
    return ex


def examples(lex, tatoeba, wordshk, hkcancor, diffs=None):
    """Pool of examples {id, text, jp, en, source, words}, deduplicated by text (words.hk, Tatoeba, HKCanCor).

    hkcancor: (file, n, sentence) tuples of the TRAIN split. `diffs`, if a list, receives
    (source id, token, lexicon jp, used jp) for every disagreement kept or noted.
    """
    forms = set(lex)
    train_count = Counter(word for _f, _n, sent in hkcancor for word, _pos, _jp in sent)
    seen, out = set(), []

    def add(ex):
        if ex["text"] not in seen:
            seen.add(ex["text"])
            out.append(ex)

    def ok_text(text):
        if not text or _ALNUM.search(text) or not 1 <= han_len(text) <= POOL_MAX_HAN:
            return False
        return not formal_hits(text, forms) and not any(c in text for c in NOT_HK)

    for e in wordshk:
        if not (e.reviewed and e.published):
            continue
        for k, (text, jp, eng) in enumerate(e.examples, 1):
            text, jp = split_example_jp(text, jp)
            text = _strip(text)
            if not ok_text(text) or any(not (is_han(c) or c in _PUNCT) for c in text):
                continue
            syls = _split_valid(jp)
            if syls is not None and len(syls) != han_len(text):
                syls = None
            built = _align(text, syls, lex, forms, "wordshk")
            if built is None:
                continue
            sid = f"wordshk:{e.id}#{k}"
            for tok, lj, used in built[2]:
                if diffs is not None:
                    diffs.append((sid, tok, lj, used))
            ex = _mk(sid, text, built[0], eng.strip(), sid, built[1])
            ex["toks"] = built[3]
            ex["own"] = syls is not None  # the readings are the example's own (words.hk), not the lexicon's
            add(ex)

    for s in tatoeba:
        text = _strip(s["text"])
        if not s["author"] or not s["eng"]:  # CC BY needs the author's name
            continue
        if not ok_text(text) or any(not (is_han(c) or c in _PUNCT) for c in text):
            continue
        built = _align(text, None, lex, forms, "alt")
        if built is None:
            continue
        if any((len(t) == 1 and lex[t].alt) or (len(t) > 1 and train_count[t] < TATOEBA_MIN_TRAIN) for t in built[1]):
            continue
        owned = [e for e in s["eng"] if e[2]]  # CC BY needs the translation's author too
        if not owned:
            continue
        eid, etext, ea = owned[0]
        sid = f"tatoeba:{s['id']}"
        ex = _mk(sid, text, built[0], etext, sid, built[1], s["author"], eid, ea)
        ex["toks"] = built[3]
        add(ex)

    for fname, n, sent in hkcancor:
        text = "".join(w for w, _p, _j in sent)
        if not text or not all(is_han(c) for c in text) or not HKCANCOR_MIN_HAN <= len(text) <= POOL_MAX_HAN:
            continue
        syls, bad = [], False
        for w, _p, jp in sent:
            sy = jp.split()
            if len(sy) != len(w):
                bad = True
                break
            syls += sy
        if bad or formal_hits(text, forms) or any(c in text for c in NOT_HK):
            continue
        built = _align(text, syls, lex, forms, "alt")
        if built is None:
            continue
        sid = f"hkcancor:{fname}#{n}"
        for tok, lj, used in built[2]:
            if diffs is not None:
                diffs.append((sid, tok, lj, used))
        ex = _mk(sid, text, built[0], None, sid, built[1])
        ex["hk"] = [[w, jp] for w, _p, jp in sent]
        ex["toks"] = built[3]
        ex["own"] = True
        add(ex)
    return out


# ---------------------------------------------------------------- grammar

def parse_cite(cite):
    form, _, jp = cite.partition(":")
    return form, jp


def cited_entries(cite, wordshk):
    """Reviewed words.hk entries with exactly this form and Jyutping (published or not: ids may be cited)."""
    form, jp = parse_cite(cite)
    want = jp.split()
    return [e for e in wordshk if e.reviewed and any(f == form and _split_valid(j) == want for f, j in e.forms)]


def clause_final(text, key):
    """True if `key` occurs with no Han character right after it (punctuation or the end follows)."""
    k = text.find(key)
    while k != -1:
        j = k + len(key)
        if j >= len(text) or not is_han(text[j]):
            return True
        k = text.find(key, k + 1)
    return False


def _matches(point, ex, pos):
    t = _strip(ex["text"])
    if han_len(t) > GRAMMAR_MAX_HAN or not re.search(point["pattern"], t):
        return False
    if point["id"] in PARTICLE_POINTS and not clause_final(t, parse_cite(point["cite"])[0]):
        return False
    return all(pos.get(w, GRAMMAR_WITHIN) < GRAMMAR_WITHIN for w in ex["words"])


def own_syllables(ex):
    """The example's own per-Han-character syllables (words.hk or HKCanCor Jyutping), else None."""
    if not ex.get("own"):
        return None
    return " ".join(jp for _t, jp in ex.get("toks", ())).split()


PROFANE = frozenset("撚屌鳩閪")


def profane(text):
    """True if the text has one of the four vulgar characters 撚 屌 鳩 閪: never an example, never drilled."""
    return any(c in PROFANE for c in text)


def _aa_ok(point, ex):
    """A唔A half of an A唔A point: the example has verb唔verb whose Jyutping (the example's own) repeats the syllable
    around m4, so 去唔去 qualifies without having the cite key 有冇."""
    if point["id"] != "anota":
        return False
    syls = own_syllables(ex)
    han = [c for c in ex["text"] if is_han(c)]
    if syls is None or len(syls) != len(han):
        return False
    text = "".join(han)
    for k in range(len(text) - 2):
        if text[k + 1] == "唔" and text[k] == text[k + 2] and syls[k + 1] == "m4" and syls[k] == syls[k + 2]:
            return True
    return False


def _key_ok(point, ex, lex, wordshk_ids):
    """Provenance rule (R4b): a words.hk example from the cited entries, or (not for a sentence-final particle point)
    from any reviewed published entry when its own Jyutping gives the key word the cited reading; HKCanCor needs the cited reading on the key token;
    Tatoeba needs a key word with a single reading in the lexicon."""
    form, jp = parse_cite(point["cite"])
    src = ex["id"].split(":")[0]
    if src == "wordshk":
        if int(ex["id"].split(":")[1].split("#")[0]) in wordshk_ids:
            return True
        if point["id"] in PARTICLE_POINTS:  # 係我嘅 "it's mine" ends in 嘅 ge3 too: particles keep their own entries
            return False
        syls = own_syllables(ex)
        han = [c for c in ex["text"] if is_han(c)]
        if syls is None or len(syls) != len(han):
            return False
        text, want = "".join(han), jp.split()
        k = text.find(form)
        while k != -1:
            if syls[k:k + len(form)] == want:
                return True
            k = text.find(form, k + 1)
        return False
    if src == "hkcancor":
        want = jp.split()
        for w, sy in ex["hk"]:
            sy = sy.split()
            k = w.find(form)
            while k != -1:
                if sy[k:k + len(form)] == want:
                    return True
                k = w.find(form, k + 1)
        return False
    return form in ex["words"] and form in lex and not lex[form].alt


def grammar_examples(point, pool, pos, lex, wordshk):
    """Attested examples of one point, best first: words.hk (cited entries, then others with the cited reading),
    HKCanCor train, Tatoeba."""
    cited = {e.id for e in cited_entries(point["cite"], wordshk)}
    ids = set(point.get("entries") or cited) & cited  # the sense entries whose examples may be used
    skip = set(point.get("exclude") or ())
    rank = {"wordshk": 0, "hkcancor": 1, "tatoeba": 2}
    cands = [ex for ex in pool if ex["id"] not in skip and _matches(point, ex, pos)]
    found = [ex for ex in cands if _key_ok(point, ex, lex, ids)]
    aa = [ex for ex in cands if ex not in found and _aa_ok(point, ex)]

    def cited_first(ex):
        return 0 if ex["id"].startswith("wordshk:") and int(ex["id"].split(":")[1].split("#")[0]) in ids else 1
    srt = lambda xs: sorted(xs, key=lambda ex: (rank[ex["id"].split(":")[0]], cited_first(ex), han_len(ex["text"]), ex["id"]))
    found = srt(found)
    if not aa:
        return found
    # the cite key's examples and the A唔A half's alternate, so the few an app shows (English first) have both
    aa = srt(aa)
    out = []
    for i in range(max(len(found), len(aa))):
        out += found[i:i + 1] + aa[i:i + 1]
    return out


def attested(point, examples_, pos):
    """Examples for a point: its precomputed `_examples` if present, else any that match pattern, words and length."""
    if "_examples" in point:
        return point["_examples"]
    return [ex for ex in examples_ if _matches(point, ex, pos)]


def place_grammar(order, points, examples_, every=10):
    """Insert `g:<id>` right after the last of the point's `needs` appears, at most one per `every` words.

    Points with fewer than 2 attested examples, or with a need that is not in the order, are left out.
    Order of the table breaks ties.
    """
    pos = {f: i for i, f in enumerate(order)}
    waiting = []
    for p in points:
        if len(attested(p, examples_, pos)) < MIN_ATTESTED:
            continue
        if not all(n in pos for n in p["needs"]):
            continue
        waiting.append((max(pos[n] for n in p["needs"]), p))
    waiting.sort(key=lambda t: t[0])  # stable: table order among equals
    out, known_at, since = [], 0, every
    for i, f in enumerate(order):
        out.append(f)
        since += 1
        if since >= every:
            for k, (ready, p) in enumerate(waiting):
                if ready <= i:
                    out.append(f"g:{p['id']}")
                    del waiting[k]
                    since = 0
                    break
    for _ready, p in waiting:  # order ended first: still placed, spaced after the last word
        out.append(f"g:{p['id']}")
    return out


LESSON_MIN_HAN = 4


def _reading_ok(w, jp):
    """The word's own reading, or a tone-only alternative only when an overrides.tsv `same_word` row links it. A
    changed-tone word's own reading is the changed one: its base-tone alternative is another word (地下 dei6 haa2 is
    not 地下音樂 haa6; 氹 tam5 is not 氹佢 tam3)."""
    if jp == w.jp:
        return True
    return (jp in w.alt and jyutping.toneless(jp) == jyutping.toneless(w.jp)
            and jp in (w.labels or {}))


def reads_as(ex, form, lex):
    """True if the example says `form` as that word: every token equal to it is read with the word's reading (or a
    recorded alternative that differs only in tone, a changed tone), and, for HKCanCor, the corpus's own word
    boundaries have it as a token. 你呢 in 你呢排 (nei5 ni1, 你 + 呢排) or 地下 in 地下音樂 (haa6) are not 你呢 / 地下."""
    w = lex.get(form) if lex else None
    toks = ex.get("toks")
    if w is None or toks is None:
        return True
    got = [jp for t, jp in toks if t == form]
    if not got:
        return False
    for jp in got:
        if not _reading_ok(w, jp):
            return False
    if "hk" in ex and form not in {t for t, _jp in ex["hk"]}:
        return False
    return True


def read_right(ex, lex):
    """True if every word of the example is read with its own reading (or a recorded alternative that differs only
    in tone): a split that the source's own Jyutping contradicts (你呢|排 for 你|呢排, nei5 ni1) fails."""
    for tok, jp in ex.get("toks") or ():
        w = lex.get(tok)
        if w is not None and not _reading_ok(w, jp):
            return False
    return True


def known_at(pos, by_parts=()):
    """word -> its place in the order, for `lesson_sentences`. A form in `by_parts` (one the meaning table leaves out
    of the order, such as the particle cluster 㗎喇) counts as known once each of its characters is: at the place of
    the last of them. A bound character such as 以 has no place, so a sentence that segments it out teaches nothing."""
    out = dict(pos)
    for f in by_parts:
        ps = [pos.get(c) for c in f] if len(f) > 1 else [None]
        if None not in ps:
            out[f] = max(ps)
    return out


def lesson_sentences(order, examples_, points=(), lex=None, by_parts=()):
    """item -> id of its lesson sentence (Ruling 13); items without a qualifying example are left out.

    The sentence for a form X contains X as one of its segmented words, read as X and with every word read as itself
    (reads_as, read_right, given `lex`), has
    English and at least LESSON_MIN_HAN Han characters, and every word of it is at or before X in the order. For a
    grammar item `g:<id>` (in `order`, with `points`) it is one of that point's attested `_examples`, under the same
    rules. Prefer words.hk, then the shortest, then the id. Forms in `by_parts` are not items; they count as known
    as `known_at` says, and an item is never one of them."""
    pos = {f: i for i, f in enumerate(order)}
    at = known_at(pos, by_parts)
    parts = set(by_parts)
    key = lambda ex: (not ex["id"].startswith("wordshk"), han_len(ex["text"]), ex["id"])
    ok = lambda ex: bool(ex["en"]) and han_len(ex["text"]) >= LESSON_MIN_HAN
    best = {}
    for ex in examples_:
        if not ok(ex):
            continue
        ps = [pos.get(w) for w in ex["words"] if w not in parts]
        if not ps or None in ps or any(at.get(w, len(order)) > max(ps) for w in ex["words"] if w in parts):
            continue
        x = order[max(ps)]  # the one word of the example that comes last is the item it teaches
        if lex is not None and not (reads_as(ex, x, lex) and read_right(ex, lex)):
            continue
        if x not in best or key(ex) < key(best[x]):
            best[x] = ex
    out = {f: best[f]["id"] for f in order if f in best}
    for p in points:
        g = f"g:{p['id']}"
        if g not in pos:
            continue
        cands = [ex for ex in p.get("_examples", ()) if ok(ex) and (lex is None or read_right(ex, lex))
                 and all(at.get(w, len(order)) <= pos[g] for w in ex["words"])]
        if cands:
            out[g] = min(cands, key=key)["id"]
    return out


# ---------------------------------------------------------------- build and report

MEANINGS = CONTENT / "meanings.json"


def load_meanings(path=MEANINGS):
    """The hand-checked meaning table: {"items": {form: {jp, en, src}}, "skip": {form: reason}}. Empty when missing."""
    path = Path(path)
    m = json.loads(path.read_text(encoding="utf8")) if path.exists() else {}
    return {"items": m.get("items") or {}, "skip": m.get("skip") or {}}


def load_content():
    stage1 = json.loads((CONTENT / "stage1.json").read_text(encoding="utf8"))
    grammar = json.loads((CONTENT / "grammar.json").read_text(encoding="utf8"))
    return stage1, grammar


def build(srcs=None, located=None):
    """Everything Task 3 produces, from the real sources. Returns a dict."""
    srcs = srcs or lexicon.load_sources()
    lex = lexicon.build_lexicon(srcs)
    stage1, grammar = load_content()
    first = [it["form"] for les in stage1["lessons"] for it in les["items"]]
    located = located or sources.load_hkcancor_located()
    train = lexicon.split_heldout(located)[0]
    # a grammar point's key characters (緊, 開, 吓 ...) are taught with the point even when they are bound
    keys = {n for p in grammar["points"] for n in p["needs"] if len(n) == 1}
    # forms the content files name (Stage 1, grammar needs) were chosen by hand: 畀 and 係咪 stay although words.hk
    # files them as variants of 俾 and 係唔係
    named = set(first) | {n for p in grammar["points"] for n in p["needs"]}
    free = free_chars(srcs["train"]) | wordshk_free_chars(srcs["wordshk"], lex) | keys
    table = load_meanings()
    meant = {f for f, m in table["items"].items() if f in lex and m.get("jp") == lex[f].jp}
    order = order_words(lex, first, headwords=headword_forms(srcs) | named, free=free, meant=meant)
    # forms the meaning table rules out as items of their own (bound, a name, a fragment, a particle cluster) leave the
    # greedy order; the order of everything else is unchanged. Stage 1 and grammar needs were chosen by hand and stay.
    skip = set(table["skip"]) - named
    skipped = [f for f in order if f in skip]
    vulgar = [f for f in order if f not in skip and f not in named and profane(f)]
    order = [f for f in order if f not in skip and f not in vulgar]
    pos = {f: i for i, f in enumerate(order)}
    diffs = []
    pool = [e for e in examples(lex, srcs["tatoeba"], srcs["wordshk"], train, diffs) if not profane(e["text"])]
    points = []
    for p in grammar["points"]:
        q = dict(p)
        q["_examples"] = grammar_examples(p, pool, pos, lex, srcs["wordshk"])
        points.append(q)
    placed = place_grammar(order, points, pool)
    return {"lex": lex, "order": order, "placed": placed, "pool": pool, "points": points, "diffs": diffs,
            "lesson": lesson_sentences(placed, pool, points, lex, by_parts=skipped), "stage1": stage1,
            "skipped": skipped, "profane": vulgar}


def write_report(b, srcs, path=REPORT):
    order, placed, points = b["order"], b["placed"], b["points"]
    lex = b["lex"]
    where = {item: i for i, item in enumerate(placed)}
    lines = ["# Cantonese course order", "",
             f"Order: {len(order)} words (Stage 1 first, then greedy by HKCanCor train frequency). "
             f"Example pool: {len(b['pool'])} sentences "
             f"({Counter(e['id'].split(':')[0] for e in b['pool']).most_common()}).", "",
             "## First 100 items", ""]
    for i, item in enumerate(placed[:100], 1):
        w = lex.get(item)
        lines.append(f"{i}. {item}" + (f" ({w.jp})" if w else ""))
    skipped = b.get("skipped") or []
    lines += ["", "## Left out by the meaning table", "",
              f"{len(skipped)} form(s) the hand-checked meaning table (data/yue/content/meanings.json) marks as not a "
              "word to teach on its own: " + (", ".join(skipped) or "none") + "."]
    lines += ["", "## Grammar points", "",
              "| id | cite | position | attested | words.hk | HKCanCor | Tatoeba |", "|---|---|---|---|---|---|---|"]
    left = []
    for p in points:
        ex = p["_examples"]
        n = Counter(e["id"].split(":")[0] for e in ex)
        at = where.get(f"g:{p['id']}")
        if at is None:
            left.append(p)
        lines.append(f"| {p['id']} | {p['cite']} | {at + 1 if at is not None else 'left out'} | {len(ex)} | "
                     f"{n['wordshk']} | {n['hkcancor']} | {n['tatoeba']} |")
    lines += ["", "### Left out", ""]
    lines += [f"- {p['id']}: {len(p['_examples'])} attested example(s)" for p in left] or ["None."]
    lines += ["", "### Attested examples (first 6 per point)", ""]
    for p in points:
        lines.append(f"**{p['id']}** `{p['pattern']}`")
        for e in p["_examples"][:6]:
            lines.append(f"- {e['id']}: {e['text']} | {e['jp']} | {e['en']}")
        lines.append("")
    agg = Counter((tok, lj, used) for _sid, tok, lj, used in b["diffs"])
    first = {}
    for sid, tok, lj, used in b["diffs"]:
        first.setdefault((tok, lj, used), sid)
    lines += ["## words.hk / HKCanCor Jyutping that differs from the lexicon", "",
              f"{len(b['diffs'])} token(s), {len(agg)} distinct. words.hk's own Jyutping is kept in the example; "
              "HKCanCor's only when it is a recorded alternative of the word. Most frequent first (token, lexicon, "
              "example reading, count, first example).", ""]
    for (tok, lj, used), n in agg.most_common(400):
        lines.append(f"- {tok}: lexicon {lj}, example {used} x{n} ({first[(tok, lj, used)]})")
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf8")


def main():
    srcs = lexicon.load_sources()
    b = build(srcs)
    write_report(b, srcs)
    print(len(b["order"]), "words,", sum(1 for x in b["placed"] if x.startswith("g:")), "grammar points",
          file=sys.stderr)


if __name__ == "__main__":
    main()
