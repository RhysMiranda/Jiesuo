"""Write the Cantonese app's stage 0 data. Run: python -m jiesuo.yue.export_app

Reads the authored units in data/yue/content/stage0.json and the audio inventory in
app/yue/data/audio.json, and writes one file per licence:
    app/yue/data/stage0.json    MIT           the units, with generated syllables and minimal sets
    app/yue/data/readings.json  CC BY-SA 4.0  the resolved reading of every character stage0.json uses

Each unit's `syllables` and `minimalSets` are generated here, from syllables that at least
MIN_VOICES shipped voices have recorded:
    tones-six   the anchors, grouped by toneless syllable (si1..si6, fan1..fan6)
    tones-hear  every non-checked syllable recorded in all six tones, one set per syllable
    checked     the anchors (sik1 sek3 sik6), then every -p/-t/-k syllable recorded in tones 1, 3 and 6
    initials    pairs that differ only in aspiration (b/p d/t g/k gw/kw z/c), then ng- vs no initial
    finals      long aa vs short a; -m/-n/-ng; -p/-t/-k; unrounded vs rounded vowels (i/yu, e/oe, ...)
    jyutping    every syllable of the units before it, for reading and dictation (no sets)
    say         the tone and checked anchors; minimalSets holds two-syllable pairs to say, si + fan
                in every tone combination
Syllabic m4 and ng5 have no recordings in Cantone, so they are taught in text only.
"""
import json
import re
from pathlib import Path

from . import jyutping
from .readings import load_sources, resolve_char

ROOT = Path(__file__).resolve().parent.parent.parent
CONTENT = ROOT / "data" / "yue" / "content" / "stage0.json"
APP = ROOT / "app" / "yue" / "data"
AUDIO = APP / "audio.json"

STAGE0_LICENCE = "MIT: Jiesuo"
READINGS_LICENCE = ("CC BY-SA 4.0: readings from rime-cantonese (CC BY 4.0), checked against "
                    "CC-Canto (CC BY-SA 3.0), Unihan, HKCanCor (CC BY 4.0)")
MIN_VOICES = 2
HAN = re.compile(r"[㐀-鿿\U00020000-\U0003ffff]")

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
    tones = _by_base(have)
    full = sorted(b for b, ts in tones.items() if ts >= {1, 3, 6} and jyutping.is_checked(b + "1"))
    return [list(anchors)] + [[f"{b}{t}" for t in (1, 3, 6)] for b in full]


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
    return [[f"si{a}", f"fan{b}"] for a in range(1, 7) for b in range(1, 7)
            if f"si{a}" in have and f"fan{b}" in have]


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
    out["checked"] = (_flat(chk), chk)
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
    content = content or json.loads(CONTENT.read_text(encoding="utf8"))
    audio = audio or json.loads(AUDIO.read_text(encoding="utf8"))
    srcs = srcs or load_sources()
    gen = generate(content["units"], recorded(audio))
    units = []
    for u in content["units"]:
        syls, sets = gen[u["id"]]
        units.append({**u, "syllables": syls, "minimalSets": sets})
    stage0 = {"licence": STAGE0_LICENCE, "sources": content["sources"], "units": units}

    chars = {}
    for ch in sorted(set(HAN.findall(json.dumps(stage0, ensure_ascii=False)))):
        r = resolve_char(ch, srcs)
        if r.status == "unresolved":
            raise ValueError(f"{ch}: reading unresolved, cannot be taught")
        chars[ch] = [r.main, *r.others]
    for u in units:
        for ch, syl in u["anchors"]:
            if chars[ch][0] != syl and syl not in chars[ch]:
                raise ValueError(f"{u['id']}: {ch} {syl} is not a reading of {ch} ({chars[ch]})")
    return stage0, {"licence": READINGS_LICENCE, "chars": chars}


def _write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")


def main():
    stage0, readings = build()
    _write(APP / "stage0.json", stage0)
    _write(APP / "readings.json", readings)
    for u in stage0["units"]:
        print(f"{u['id']}: {len(u['syllables'])} syllables, {len(u['minimalSets'])} sets")
    print(f"readings: {len(readings['chars'])} characters")


if __name__ == "__main__":
    main()
