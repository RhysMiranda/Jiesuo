"""Jyutping parsing: initial, final, tone."""
from pathlib import Path

import pytest

from jiesuo.yue.jyutping import FINALS, INITIALS, is_checked, parse, split, toneless

CASES = [("si1", ("s", "i", 1)), ("ngo5", ("ng", "o", 5)), ("ng5", ("", "ng", 5)), ("m4", ("", "m", 4)),
         ("gwong2", ("gw", "ong", 2)), ("jyut6", ("j", "yut", 6)), ("aa3", ("", "aa", 3)), ("sik6", ("s", "ik", 6))]


def test_parse_known_syllables():
    for s, want in CASES:
        assert parse(s) == want


def test_parse_rejects_bad():
    for bad in ["si7", "si", "xyz1", "sx1", ""]:
        with pytest.raises(ValueError):
            parse(bad)


def test_split_glued_and_spaced():
    assert split("mat1je5") == split("mat1 je5") == ["mat1", "je5"]


def test_checked():
    assert is_checked("sik1") and is_checked("sek3") and not is_checked("si1")


def test_toneless_and_sets():
    assert toneless("nei5") == "nei"
    assert len(INITIALS) == 19 and "ng" in FINALS


RIME = Path(__file__).resolve().parent.parent / "data" / "raw" / "yue" / "rime_chars.dict.yaml"


def test_every_rime_syllable_parses():
    if not RIME.exists():
        pytest.skip("data/raw/yue/rime_chars.dict.yaml absent (Task 2 downloads it)")
    started, bad = False, set()
    for line in RIME.read_text(encoding="utf-8").splitlines():
        if not started:
            started = line.strip() == "..."
            continue
        parts = line.split("\t")
        if len(parts) < 2 or line.startswith("#"):
            continue
        try:
            parse(parts[1].strip())
        except ValueError:
            bad.add(parts[1].strip())
    assert not bad, sorted(bad)[:20]
