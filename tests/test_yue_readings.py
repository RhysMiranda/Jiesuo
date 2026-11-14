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


def test_corpus_beats_contradicted_rime(tmp_path):
    sent = [("甲", "n", "baa1")] * 6
    srcs = {
        "rime": {"甲": [("baa3", None)]},
        "cccanto": {"甲": {"baa1", "baa3"}},
        "unihan": {},
        "hkcancor": [sent],
        "overrides": {},
    }
    r = resolve_char("甲", srcs)
    assert r.main == "baa1" and r.status == "corpus" and "baa3" in r.others
