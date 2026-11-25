"""Write the Cantonese app's stage 0 data. Run: python -m jiesuo.yue.export_app

Reads the authored units in data/yue/content/stage0.json and the audio inventory in
app/yue/data/audio.json, and writes one file per licence:
    app/yue/data/stage0.json    MIT           the units, with generated syllables and minimal sets
    app/yue/data/readings.json  CC BY-SA 4.0  every character the units use: main reading, then the
                                              other readings at least MIN_SOURCES sources list

Each unit's `syllables` and `minimalSets` are generated here, from syllables that at least
MIN_VOICES shipped voices have recorded:
    tones-six   the anchors, grouped by toneless syllable (si1..si6, fu1..fu6)
    tones-hear  every non-checked syllable recorded in all six tones, one set per syllable
    checked     every -p/-t/-k syllable recorded in tones 1, 3 and 6 (sik first); anchors kept as syllables
    initials    pairs that differ only in aspiration (b/p d/t g/k gw/kw z/c), then ng- vs no initial
    finals      long aa vs short a; -m/-n/-ng; -p/-t/-k; unrounded vs rounded vowels (i/yu, e/oe, ...)
    jyutping    every syllable of the units before it, for reading and dictation (no sets)
    say         the tone and checked anchors; minimalSets holds two-syllable pairs to say, si + fan
                in every tone combination
Syllabic m4 and ng5 have no recordings in Cantone, so they are taught in text only.

Phase 2 (words and grammar), one file per licence, from the course build (course.build):
    lexicon.json    CC BY-SA 4.0  words [form, jp, en, freqRank, flags, status], flags 1 changed / 2 alternatives /
                                  4 unresolved / 8 meaning hand-checked (en from data/yue/content/meanings.json), status a/c/e/w/o = agree/corpus/attested (HKCanCor + words.hk examples)/words.hk/override, alts, labels {form: {alt jp: "literary"|"citation"}}, chars {char: [jp, main first]}
    course.json    CC BY-SA 4.0  order, stage1, grammar points with example ids, lessonSentence
    sentences.json  CC BY 2.0 FR  Tatoeba sentences with their authors and translation authors
    hkcancor.json   CC BY 4.0     HKCanCor sentences
    keyboards.json  MIT: Jiesuo   setup guide for typing Jyutping (items: platform, name, steps, url, checked)
    wordshk.json    words.hk Non-Commercial Open Data Licence 1.0: notice, disclaimer, credits, entries, examples
"""
import json
import re
from pathlib import Path

from . import course, jyutping, lexicon
from .readings import load_sources, resolve_char

ROOT = Path(__file__).resolve().parent.parent.parent
CONTENT = ROOT / "data" / "yue" / "content" / "stage0.json"
APP = ROOT / "app" / "yue" / "data"
AUDIO = APP / "audio.json"
KEYBOARDS = ROOT / "data" / "yue" / "content" / "keyboards.json"
KEYBOARDS_LICENCE = "MIT: Jiesuo (setup steps summarised from the pages cited on each item)"

STAGE0_LICENCE = "MIT: Jiesuo"
READINGS_LICENCE = ("CC BY-SA 4.0: readings from rime-cantonese (CC BY 4.0), checked against "
                    "CC-Canto (CC BY-SA 3.0), Unihan, HKCanCor (CC BY 4.0)")
MIN_VOICES = 1  # one checked voice (googleB) since the tone audit; see jiesuo/yue/export_audio.py
MIN_SOURCES = 2  # an "other" reading ships only if at least this many sources list it
HAN = re.compile(r"[㐀-鿿\U00020000-\U0003ffff]")

STATUS_CODE = {"agree": "a", "corpus": "c", "attested": "e", "wordshk": "w", "override": "o"}  # how the reading was settled (lexicon row[5])
ASPIRATION = [("b", "p"), ("d", "t"), ("g", "k"), ("gw", "kw"), ("z", "c")]
ENDINGS = [("m", "n", "ng"), ("p", "t", "k")]
ROUNDED = [("i", "yu"), ("in", "yun"), ("it", "yut"), ("e", "oe"), ("eng", "oeng"), ("ek", "oek"), ("ei", "eoi")]


def recorded(audio) -> set:
    return {s for s, voices in audio["clips"].items() if len(voices) >= MIN_VOICES}


def _syl(initial, final, tone):
    return f"{initial}{final}{tone}"


def _grouped(syls):
    """Group syllables by toneless form, in first-seen order; groups of one are dropped."""
    groups: dict = {}
    for s in syls:
        groups.setdefault(jyutping.toneless(s), []).append(s)
    return [g for g in groups.values() if len(g) > 1]


def _by_base(have):
    tones: dict = {}
    for s in have:
        tones.setdefault(jyutping.toneless(s), set()).add(jyutping.parse(s)[2])
    return tones


def tones_hear(have, anchors):
    tones = _by_base(have)
    full = {b for b, ts in tones.items() if ts >= {1, 2, 3, 4, 5, 6} and not jyutping.is_checked(b + "1")}
    first = list(dict.fromkeys(jyutping.toneless(s) for s in anchors if jyutping.toneless(s) in full))
    return [[f"{b}{t}" for t in range(1, 7)] for b in first + sorted(full - set(first))]


def checked(have, anchors):
    """Tone-only sets (same syllable in tones 1, 3, 6). The anchors' own syllables come first;
    the anchor trio itself (sik1 sek3 sik6) differs in vowel too, so it is not a set."""
    tones = _by_base(have)
    full = {b for b, ts in tones.items() if ts >= {1, 3, 6} and jyutping.is_checked(b + "1")}
    first = list(dict.fromkeys(jyutping.toneless(s) for s in anchors if jyutping.toneless(s) in full))
    return [[f"{b}{t}" for t in (1, 3, 6)] for b in first + sorted(full - set(first))]


def initials(have):
    sets = []
    for plain, aspirated in ASPIRATION:
        for s in sorted(have):
            i, f, t = jyutping.parse(s)
            if i == plain and _syl(aspirated, f, t) in have:
                sets.append([s, _syl(aspirated, f, t)])
    for s in sorted(have):
        i, f, t = jyutping.parse(s)
        if i == "ng" and _syl("", f, t) in have:
            sets.append([s, _syl("", f, t)])
    return sets


def _parsed(have):
    return sorted(jyutping.parse(s) for s in have)


def finals(have):
    sets = []
    for i, f, t in _parsed(have):  # long aa vs short a, same ending
        if f.startswith("aa") and _syl(i, f[1:], t) in have:
            sets.append([_syl(i, f, t), _syl(i, f[1:], t)])
    for ending in ENDINGS:  # same vowel, every ending in the group
        for i, f, t in _parsed(have):
            if f.endswith(ending[0]):
                vowel = f[: -len(ending[0])]
                group = [_syl(i, vowel + e, t) for e in ending]
                if vowel and all(s in have for s in group):
                    sets.append(group)
    for plain, rounded in ROUNDED:
        for i, f, t in _parsed(have):
            if f == plain and _syl(i, rounded, t) in have:
                sets.append([_syl(i, plain, t), _syl(i, rounded, t)])
    return sets


def say_pairs(have):
    return [[f"si{a}", f"fu{b}"] for a in range(1, 7) for b in range(1, 7)
            if f"si{a}" in have and f"fu{b}" in have]


def _flat(sets):
    return list(dict.fromkeys(s for ms in sets for s in ms))


def generate(units, have):
    """unit id -> (syllables, minimalSets)."""
    anchors = {u["id"]: [s for _, s in u["anchors"]] for u in units}
    out = {}
    six = _grouped(anchors["tones-six"])
    out["tones-six"] = (list(anchors["tones-six"]), six)
    hear = tones_hear(have, anchors["tones-six"])
    out["tones-hear"] = (_flat(hear), hear)
    chk = checked(have, anchors["checked"])
    out["checked"] = (list(dict.fromkeys([*anchors["checked"], *_flat(chk)])), chk)
    ini = initials(have)
    out["initials"] = (_flat(ini), ini)
    fin = finals(have)
    out["finals"] = (list(dict.fromkeys([*anchors["finals"], *_flat(fin)])), fin)
    before = [s for uid in ("tones-six", "tones-hear", "checked", "initials", "finals") for s in out[uid][0]]
    out["jyutping"] = (list(dict.fromkeys(before)), [])
    pairs = say_pairs(have)
    out["say"] = (list(dict.fromkeys([*anchors["tones-six"], *anchors["checked"], *_flat(pairs)])), pairs)
    for uid, (syls, _) in out.items():
        missing = [s for s in syls if s not in have]
        if missing:
            raise ValueError(f"{uid}: no audio in {MIN_VOICES} voices for {missing}")
    return out


def build(srcs=None, content=None, audio=None):
    """(stage0.json, readings.json) as dicts."""
    if content is None:
        content = json.loads(CONTENT.read_text(encoding="utf8"))
    if audio is None:
        audio = json.loads(AUDIO.read_text(encoding="utf8"))
    if srcs is None:
        srcs = load_sources()
    gen = generate(content["units"], recorded(audio))
    units = []
    for u in content["units"]:
        syls, sets = gen[u["id"]]
        units.append({**u, "syllables": syls, "minimalSets": sets})
    stage0 = {"licence": STAGE0_LICENCE, "sources": content["sources"], "units": units}

    chars = {}
    for ch in sorted(set(HAN.findall(json.dumps(units, ensure_ascii=False)))):  # not the citations
        r = resolve_char(ch, srcs)
        if r.status == "unresolved":
            raise ValueError(f"{ch}: reading unresolved, cannot be taught")
        chars[ch] = [r.main, *(o for o in r.others if len(r.evidence[o]) >= MIN_SOURCES)]
    for u in units:
        for ch, syl in u["anchors"]:
            if syl not in chars[ch]:  # the shipped readings, not every candidate
                raise ValueError(f"{u['id']}: {ch} {syl} is not a shipped reading of {ch} ({chars[ch]})")
    return stage0, {"licence": READINGS_LICENCE, "chars": chars}


LEXICON_LICENCE = ("CC BY-SA 4.0: Jyutping from rime-cantonese (CC BY 4.0) checked against CC-Canto (CC BY-SA 3.0), "
                   "CC-CEDICT (CC BY-SA 4.0), Unihan and HKCanCor (CC BY 4.0); meanings hand-checked by Jiesuo against "
                   "words.hk, CC-Canto and CC-CEDICT (flag 8), else from CC-Canto and CC-CEDICT")
COURSE_LICENCE = "CC BY-SA 4.0: Jiesuo course order and grammar notes, built on the lexicon's sources"
SENTENCES_LICENCE = "CC BY 2.0 FR: Tatoeba (https://tatoeba.org/), each sentence with its author"
HKCANCOR_LICENCE = "CC BY 4.0: HKCanCor, the Hong Kong Cantonese Corpus (https://github.com/fcbond/hkcancor)"
WORDSHK_LICENCE = ("words.hk Non-Commercial Open Data Licence 1.0 (https://words.hk/base/hoifong/): non-commercial use "
                   "only, no sublicensing; not covered by this repository's MIT licence")
NOTICE = ROOT / "data" / "yue" / "content" / "wordshk_notice.json"
MAX_WORDS = 5000
GRAMMAR_DROP = {"pattern", "licence", "entries", "exclude", "_examples"}


def _wordshk_entries(words, wordshk):
    """form -> [id, eng, yue_def] from reviewed AND published entries whose form AND jp equal the word's.

    Several such entries: most examples first, then lowest id. The top entry gives the id and yue_def; `eng` is the
    first English sense of each of up to 3 entries, joined with "; "."""
    want = {(w[0], w[1]) for w in words if w[1]}
    found = {}
    for e in wordshk:
        if not (e.reviewed and e.published):
            continue
        for form, jp in e.forms:
            if (form, lexicon._norm(jp, form)) in want:
                found.setdefault(form, {})[e.id] = e
    out = {}
    for form, es in found.items():
        ranked = sorted(es.values(), key=lambda e: (-len(e.examples), e.id))
        firsts = []
        for e in ranked:
            sense = next((x.strip() for x in e.eng if x.strip()), "")
            if sense and sense not in firsts:
                firsts.append(sense)
        top = ranked[0]
        out[form] = [top.id, "; ".join(firsts[:3]), "; ".join(x.strip() for x in top.yue if x.strip())]
    return out


def build_phase2(b, wordshk, chars_for, notice=None, meanings=None):
    """The five phase 2 data files as dicts, from a course.build() result `b`, the words.hk entries and
    `chars_for(char) -> [jp, ...]` (main reading first). A word in the hand-checked meaning table (`meanings`, default
    data/yue/content/meanings.json) ships the table's English and flag 8; the table's reading must be the word's."""
    if notice is None:
        notice = json.loads(NOTICE.read_text(encoding="utf8"))
    checked = (course.load_meanings() if meanings is None else meanings).get("items") or {}
    lex, pool = b["lex"], {e["id"]: e for e in b["pool"]}
    grammar = {}
    placed = set(b["placed"])
    for p in b["points"]:
        if f"g:{p['id']}" in placed:
            g = {k: v for k, v in p.items() if k not in GRAMMAR_DROP}
            g["examples"] = [e["id"] for e in p["_examples"]]
            cited = course.cited_entries(p["cite"], wordshk) if p.get("cite") else []
            ids = [e.id for e in cited]
            own = [i for i in (p.get("entries") or ()) if i in ids]  # the sense entry the point names, if it is one
            g["citeId"] = (own or ids or [None])[0]  # the reviewed words.hk entry, resolved at build time
            grammar[p["id"]] = g
    keep = set(b["order"][:MAX_WORDS]) | {f"g:{p}" for p in grammar}
    lesson = {f: i for f, i in b["lesson"].items() if i and f in keep}
    shipped = list(dict.fromkeys([*lesson.values(), *(i for g in grammar.values() for i in g["examples"])]))
    forms = list(dict.fromkeys([*b["order"][:MAX_WORDS], *(w for i in shipped for w in pool[i]["words"])]))
    forms = [f for f in forms if f in lex and lex[f].jp]
    ranked = sorted((f for f in forms if lex[f].freq > 0), key=lambda f: -lex[f].freq)
    rank = {f: i for i, f in enumerate(ranked, 1)}
    words, alts, labels = [], {}, {}
    for f in forms:
        w = lex[f]
        flags = (1 if w.changed else 0) | (2 if w.alt else 0) | (4 if w.status == "unresolved" else 0)
        en = w.en
        m = checked.get(f)
        if m is not None:
            if m.get("jp") != w.jp:
                raise ValueError(f"meanings.json: {f} is checked for {m.get('jp')} but the lexicon reads {w.jp}")
            en, flags = m["en"], flags | 8
        words.append([f, w.jp, en, rank.get(f, 0), flags, STATUS_CODE.get(w.status, "")])
        if w.alt:
            alts[f] = list(w.alt)
        lab = {rd: x for rd, x in (getattr(w, "labels", None) or {}).items() if rd in w.alt}
        if lab:
            labels[f] = lab
    chars = {}
    for ch in sorted({c for f in forms for c in f if lexicon.is_han(c)}):
        jps = list(chars_for(ch) or [])
        own = lex.get(ch)
        if own is not None and own.jp and own.jp not in jps:
            jps.append(own.jp)
        if jps:
            chars[ch] = jps
    tat, hkc, whk_ex = {}, {}, {}
    for i in shipped:
        e = pool[i]
        kind = i.split(":")[0]
        if kind == "tatoeba":
            tat[i] = [e["text"], e["jp"], e["en"], e.get("author", ""), e.get("en_author", ""), e.get("en_id", 0)]
        elif kind == "hkcancor":
            hkc[i] = [e["text"], e["jp"], None]
        else:
            whk_ex[i] = [e["text"], e["jp"], e["en"]]
    credits = ("Sentences from Tatoeba (https://tatoeba.org/), CC BY 2.0 FR. Each item is [Cantonese, Jyutping, "
               "English, author of the Cantonese sentence, author of the English translation, Tatoeba id of the "
               "translation]; Jyutping added by Jiesuo.")
    return {
        "lexicon": {"licence": LEXICON_LICENCE, "words": words, "alts": alts, "labels": labels, "chars": chars},
        "course": {"licence": COURSE_LICENCE, "order": list(b["placed"]), "stage1": b["stage1"],
                   "grammar": grammar, "lessonSentence": lesson},
        "sentences": {"licence": SENTENCES_LICENCE, "credits": credits, "items": tat},
        "hkcancor": {"licence": HKCANCOR_LICENCE, "items": hkc},
        "wordshk": {"licence": WORDSHK_LICENCE, "notice": notice["notice"], "disclaimer": notice["disclaimer"],
                    "credits": notice["credits"], "link": "https://words.hk",
                    "entries": _wordshk_entries(words, wordshk), "examples": whk_ex},
    }


def build_keyboards(content=None):
    """keyboards.json: the setup guide for the Type screen, licence key first. Every item cites the page it came from."""
    c = json.loads(KEYBOARDS.read_text(encoding="utf8")) if content is None else content
    for it in c["items"]:
        if not (it.get("steps") and it.get("url", "").startswith("https://") and re.fullmatch(r"\d{4}-\d\d-\d\d", it.get("checked", ""))):
            raise ValueError(f"keyboard item needs steps, an https url and a checked date: {it.get('name')}")
    return {"licence": KEYBOARDS_LICENCE, "items": c["items"]}


def _write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")


def main():
    stage0, readings = build()
    _write(APP / "stage0.json", stage0)
    _write(APP / "readings.json", readings)
    for u in stage0["units"]:
        print(f"{u['id']}: {len(u['syllables'])} syllables, {len(u['minimalSets'])} sets")
    print(f"readings: {len(readings['chars'])} characters")
    srcs = lexicon.load_sources()
    b = course.build(srcs)

    def chars_for(ch):
        r = lexicon._char_res(ch, srcs)
        return [r.main, *r.others] if r is not None and r.main else []

    if b.get("skipped"):
        print(f"left out by the meaning table: {len(b['skipped'])} form(s): {' '.join(b['skipped'])}")
    _write(APP / "keyboards.json", build_keyboards())
    for name, data in build_phase2(b, srcs["wordshk"], chars_for).items():
        _write(APP / f"{name}.json", data)
        print(f"{name}.json: {(APP / f'{name}.json').stat().st_size} bytes")


if __name__ == "__main__":
    main()
