"""The hand-checked meaning table (data/yue/content/meanings.json) and what the export makes of it."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app" / "yue" / "data"
TABLE = json.loads((ROOT / "data" / "yue" / "content" / "meanings.json").read_text(encoding="utf8"))
FIRST = 1000
HAN = re.compile(r"[\u3400-\u9fff\U00020000-\U0003ffff]")
TONE = re.compile(r"[a-z][1-6]\b")
POS = re.compile(r"\((?:n|v|adj|adv|noun|verb|adjective|adverb|pronoun|conjunction|preposition|particle|classifier|"
                 r"determiner|interjection|onom|prep|conj|pron|cl)\.?\)|^(?:noun|verb|adj)\b|"
                 r"\bCL:", re.I)


def _load(name):
    return json.loads((APP / name).read_text(encoding="utf8"))


def _stage1():
    s = json.loads((ROOT / "data" / "yue" / "content" / "stage1.json").read_text(encoding="utf8"))
    return {it["form"] for les in s["lessons"] for it in les["items"]}


def test_table_shape():
    assert list(TABLE)[0] == "licence" and "words.hk" in TABLE["licence"]
    assert TABLE["items"] and all(set(v) == {"jp", "en", "src"} and v["src"] for v in TABLE["items"].values())
    assert all(isinstance(r, str) and r for r in TABLE["skip"].values())
    assert not set(TABLE["items"]) & set(TABLE["skip"])
    assert not set(TABLE["items"]) & _stage1()  # Stage 1 has its own table


def test_checked_meanings_are_plain_english():
    for form, v in TABLE["items"].items():
        en = v["en"]
        assert en and not HAN.search(en) and "[" not in en and "|" not in en, form
        assert not TONE.search(en) and not POS.search(en), form
        senses = en.split("; ")
        assert len(senses) <= 3 and all(s.strip() and len(s.split()) <= 8 for s in senses), form


def test_first_1000_word_items_are_checked_and_skips_left_the_order():
    order = _load("course.json")["order"]
    rows = {r[0]: r for r in _load("lexicon.json")["words"]}
    first = [f for f in order if not f.startswith("g:")][:FIRST]
    s1 = _stage1()
    missing = [f for f in first if f not in s1 and f not in TABLE["items"]]
    assert not missing, missing[:20]
    for f in first:
        if f not in s1:
            assert rows[f][4] & 8 and rows[f][2] == TABLE["items"][f]["en"], f
    assert not set(TABLE["skip"]) & set(order)


def test_table_reading_is_the_lexicon_reading():
    rows = {r[0]: r for r in _load("lexicon.json")["words"]}
    for form, v in TABLE["items"].items():
        if form in rows:
            assert v["jp"] == rows[form][1], form
    flagged = {f for f, r in rows.items() if r[4] & 8}
    assert flagged == set(TABLE["items"]) & set(rows)
