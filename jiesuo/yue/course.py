"""Course order, grammar placement and attested examples (phase 2, Task 3).

Order: Stage 1 forms first, then jiesuo.order.greedy over the spoken-frequency lexicon, where a multi-character
word needs the characters that are words themselves (spec section 3). Characters that are not words get no unit.

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
    Forms seen only in HKCanCor or only as words.hk variants are never taught."""
    out = set(srcs.get("rime", {})) | set(srcs.get("rime_words", {}))
    out |= set(srcs.get("cccanto", {})) | set(srcs.get("cccanto_words", {}))
    out |= {e.forms[0][0] for e in srcs.get("wordshk", []) if e.reviewed and e.forms}
    return out


def order_words(lex, first, n=5000, headwords=None):
    """Stage 1 forms in content order, then greedy by spoken frequency, truncated to n.

    Only forms with a meaning for their reading (en, or a published reviewed words.hk gloss) and, when `headwords` is given, a headword form can be
    taught. A multi-character form needs the characters that are teachable words. Forms in `first` are known.
    """
    done = list(dict.fromkeys(first))
    known = set(done)
    ok = {f for f, w in lex.items() if (w.en or w.whk_eng) and (headwords is None or f in headwords)}
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
    Returns (jp, words, diffs) or None.
    """
    jps, words, diffs, off = [], [], [], 0
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
        if tok not in words:
            words.append(tok)
        off += L
    return " ".join(jps), words, diffs


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
            add(_mk(sid, text, built[0], eng.strip(), sid, built[1]))

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
        add(_mk(sid, text, built[0], etext, sid, built[1], s["author"], eid, ea))

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


def _key_ok(point, ex, lex, wordshk_ids):
    """Provenance rule (R4b): words.hk examples come from the cited entries; HKCanCor needs the cited reading on
    the key token; Tatoeba needs a key word with a single reading in the lexicon."""
    form, jp = parse_cite(point["cite"])
    src = ex["id"].split(":")[0]
    if src == "wordshk":
        return int(ex["id"].split(":")[1].split("#")[0]) in wordshk_ids
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
    """Attested examples of one point, best first: words.hk (cited entries), HKCanCor train, Tatoeba."""
    cited = {e.id for e in cited_entries(point["cite"], wordshk)}
    ids = set(point.get("entries") or cited) & cited  # the sense entries whose examples may be used
    skip = set(point.get("exclude") or ())
    rank = {"wordshk": 0, "hkcancor": 1, "tatoeba": 2}
    found = [ex for ex in pool if ex["id"] not in skip and _matches(point, ex, pos) and _key_ok(point, ex, lex, ids)]
    return sorted(found, key=lambda ex: (rank[ex["id"].split(":")[0]], han_len(ex["text"]), ex["id"]))


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


def lesson_sentences(order, examples_):
    """item -> id of the shortest example with English whose words are all at or before the item (words.hk first).

    Examples containing the item win when there are any (the day's lesson sentence should use today's word)."""
    pos = {f: i for i, f in enumerate(order)}
    ready = {}
    for ex in examples_:
        if not ex["en"]:
            continue
        ps = [pos.get(w) for w in ex["words"]]
        if not ps or None in ps:
            continue
        ready.setdefault(max(ps), []).append(ex)
    key = lambda ex: (not ex["id"].startswith("wordshk"), han_len(ex["text"]), ex["id"])  # words.hk first
    best, with_item, out = None, {}, {}
    for i, f in enumerate(order):
        for ex in ready.get(i, ()):
            if best is None or key(ex) < key(best):
                best = ex
            for w in ex["words"]:
                cur = with_item.get(w)
                if cur is None or key(ex) < key(cur):
                    with_item[w] = ex
        pick = with_item.get(f) or best
        out[f] = pick["id"] if pick else None
    return out


# ---------------------------------------------------------------- build and report

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
    order = order_words(lex, first, headwords=headword_forms(srcs))
    pos = {f: i for i, f in enumerate(order)}
    located = located or sources.load_hkcancor_located()
    train = lexicon.split_heldout(located)[0]
    diffs = []
    pool = examples(lex, srcs["tatoeba"], srcs["wordshk"], train, diffs)
    points = []
    for p in grammar["points"]:
        q = dict(p)
        q["_examples"] = grammar_examples(p, pool, pos, lex, srcs["wordshk"])
        points.append(q)
    placed = place_grammar(order, points, pool)
    return {"lex": lex, "order": order, "placed": placed, "pool": pool, "points": points, "diffs": diffs,
            "lesson": lesson_sentences(order, pool), "stage1": stage1}


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
