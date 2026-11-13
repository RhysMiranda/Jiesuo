"""Loaders: one small function per raw file, returning plain Python data."""
import json
import re
from collections import defaultdict
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
IDC = set("⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻")
UNKNOWN = "？"  # Make Me a Hanzi's marker for a part it could not identify
HAN = re.compile(r"^[㐀-䶿一-鿿\U00020000-\U0002ffff]+$")
HAN_CHAR = re.compile(r"[㐀-䶿一-鿿\U00020000-\U0002ffff]")
LEVELS = dict(zip("一二三四五六七", [1, 2, 3, 4, 5, 6, 7]))  # 七一九 = bands 7-9


def is_han(s):
    return bool(HAN.match(s))


def load_mmh():
    with open(RAW / "mmh_dictionary.txt", encoding="utf8") as f:
        return {e["character"]: e for e in map(json.loads, f)}


def load_cedict():
    """Two indexes over the same entries: by Simplified form and by Traditional form."""
    by_simp, by_trad = defaultdict(list), defaultdict(list)
    for e in json.loads((RAW / "cedict.json").read_text(encoding="utf8")):
        by_simp[e["simplified"]].append(e)
        by_trad[e["traditional"]].append(e)
    return dict(by_simp), dict(by_trad)


def _hsk_lines(name):
    level = None
    for line in (RAW / name).read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if not line[0].isdigit():
            # Section headings are the only unnumbered lines. Words can end in 表 too (手表),
            # so the text of a line cannot tell them apart. The char file ends with
            # separate handwriting lists, which have no 级 and are ignored.
            level = LEVELS.get(line[0]) if "级" in line else None
            continue
        if level is not None:
            yield level, re.split(r"\s+", line, maxsplit=1)[-1]


def load_hsk_words():
    """word -> lowest HSK 3.0 band. '爸爸｜爸' gives both forms; '（…）' notes are dropped."""
    out = {}
    for level, text in _hsk_lines("hsk30_wordlist.txt"):
        for form in re.sub(r"（[^）]*）", "", text).split("｜"):
            form = form.strip()
            if form:
                out[form] = min(level, out.get(form, 99))
    return out


def load_hsk_chars():
    out = {}
    for level, text in _hsk_lines("hsk30_charlist.txt"):
        out[text] = min(level, out.get(text, 99))
    return out


def load_tatoeba():
    """id -> (text, first English translation). Pairs are repeated per translation."""
    out = {}
    for sid, text, _eid, english in json.loads((RAW / "tatoeba_cmn_eng.json").read_text(encoding="utf8")):
        out.setdefault(sid, (text, english))
    return out
