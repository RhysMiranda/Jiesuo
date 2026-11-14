from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if not (ROOT / "data" / "raw" / "yue").exists():
    pytest.skip("data/raw/yue absent", allow_module_level=True)

from jiesuo.yue import jyutping
from jiesuo.yue.readings import load_overrides, load_sources, resolve_char, write_report

SRCS = load_sources()


def test_tone_anchor_sets_resolve():  # spec section 3 stage 0 anchors
    wants = ["si1", "si2", "si3", "si4", "si5", "si6", "fan1", "fan2", "fan3", "fan4", "fan5", "fan6"]
    for ch, want in zip("詩史試時市事分粉訓墳奮份", wants):
        r = resolve_char(ch, SRCS)
        assert r.main == want, (ch, r)
        assert r.status in ("agreed", "corpus", "override"), (ch, r)


def test_colloquial_readings():
    assert resolve_char("佢", SRCS).main == "keoi5"
    assert resolve_char("喺", SRCS).main == "hai2"


def test_two_readings_are_both_kept():
    r = resolve_char("生", SRCS)
    assert {r.main, *r.others} >= {"saang1", "sang1"}


def test_loaders_shapes():
    assert ("keoi5", None) in SRCS["rime"]["佢"]
    assert "keoi5" in SRCS["unihan"]["佢"]
    assert all(len(jyutping.split(j)) == 1 for rs in SRCS["rime"].values() for j, _ in rs)
    sent = SRCS["hkcancor"][0]
    assert all(len(t) == 3 for t in sent)
    assert any(" " in j for s in SRCS["hkcancor"][:50] for _, _, j in s)  # syllables spaced


def test_override_wins(tmp_path):
    p = tmp_path / "o.tsv"
    p.write_text("form\treading\treason\tsource\n試\tsi5\ttest\ttest\n", encoding="utf8")
    srcs = dict(SRCS, overrides=load_overrides(p))
    r = resolve_char("試", srcs)
    assert r.main == "si5" and r.status == "override"


def test_unresolved_is_reported(tmp_path):
    srcs = {
        "rime": {"蚊": [("man1", None)]},
        "cccanto": {"蚊": {"man4"}},
        "unihan": {"蚊": {"man4"}},
        "hkcancor": [],
        "overrides": {},
    }
    r = resolve_char("蚊", srcs)
    assert r.status == "unresolved" and r.main is None
    assert {"man1", "man4"} <= set(r.others)
    out = tmp_path / "r.md"
    write_report({"蚊": r}.values(), out, srcs)
    text = out.read_text(encoding="utf8")
    assert "蚊" in text and "man1" in text and "man4" in text and "unresolved" in text


def test_dictionary_agreed_citation_readings_are_not_demoted():
    for ch, want in zip("到位友樣來嘩", ["dou3", "wai6", "jau5", "joeng6", "loi4", "waa1"]):
        r = resolve_char(ch, SRCS)
        assert r.main == want and r.status == "agreed", (ch, r.main, r.status)


def test_speech_reading_recorded_in_evidence():
    r = resolve_char("到", SRCS)
    assert r.main == "dou3"
    reading, count = r.evidence["speech_top"]
    assert reading == "dou2" and count >= 5


def test_sheng_keeps_both_readings():
    r = resolve_char("生", SRCS)
    assert {r.main, *r.others} >= {"saang1", "sang1"}


def _synthetic(rime, canto, unihan, tokens):
    sent = [("甲", "n", t) for t in tokens]
    return {"rime": {"甲": rime}, "cccanto": {"甲": canto} if canto else {},
            "unihan": {"甲": unihan} if unihan else {}, "hkcancor": [sent], "overrides": {}}


def test_corpus_decides_only_without_confirmed_rime_main():
    # rime main baa3 confirmed by CC-Canto: corpus (baa1 x8) must not override it
    r = resolve_char("甲", _synthetic([("baa3", None)], {"baa3", "baa1"}, None, ["baa1"] * 8))
    assert r.main == "baa3" and r.status == "agreed" and r.evidence["speech_top"] == ("baa1", 8)
    # rime main unconfirmed: corpus decides
    r = resolve_char("甲", _synthetic([("baa3", None)], {"baa1"}, None, ["baa1"] * 8))
    assert r.main == "baa1" and r.status == "corpus"


def test_five_tokens_count_four_do_not():
    args = ([("baa3", None)], {"baa1"}, None)
    assert resolve_char("甲", _synthetic(*args, ["baa1"] * 4)).status == "unresolved"
    assert resolve_char("甲", _synthetic(*args, ["baa1"] * 5)).status == "corpus"
