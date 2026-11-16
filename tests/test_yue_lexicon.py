from pathlib import Path

import pytest

from jiesuo.yue.lexicon import Word, resolve_word, segment, split_heldout
from jiesuo.yue.readings import Resolution

ROOT = Path(__file__).resolve().parent.parent


def _chars(**kw):
    return {ch: Resolution(ch, main, others, "agreed", {}) for ch, (main, others) in kw.items()}


def test_all_sources_agree():
    srcs = {"rime_words": {"你好": ["nei5 hou2"]}, "cccanto_words": {"你好": [("nei5 hou2", "hello")]},
            "wordshk": [], "train": [], "overrides": {}, "chars": {}}
    w = resolve_word("你好", srcs)
    assert isinstance(w, Word)
    assert (w.jp, w.status, w.alt, w.en) == ("nei5 hou2", "agree", [], "hello")


def test_corpus_majority_and_changed_tone():
    srcs = {"rime_words": {"個名": ["go3 meng2"]}, "cccanto_words": {"個名": [("go3 ming4", "x")]},
            "wordshk": [], "overrides": {},
            "train": [[("個名", "N", "go3 meng2")]] * 5,
            "chars": _chars(個=("go3", []), 名=("ming4", ["meng4"]))}
    w = resolve_word("個名", srcs)
    assert (w.jp, w.status, w.alt, w.changed) == ("go3 meng2", "corpus", ["go3 ming4"], [1])


def test_wordshk_then_override_then_unresolved():
    from jiesuo.yue.sources import WordsHK
    e = WordsHK(7, [("甲乙", "gaap3 jyut6")], [], [], [], [], [], True, True)
    base = {"rime_words": {"甲乙": ["gaap3 jyut6"]}, "cccanto_words": {"甲乙": [("gaap3 jyut3", "")]},
            "train": [], "overrides": {}, "chars": {}}
    w = resolve_word("甲乙", {**base, "wordshk": [e]})
    assert (w.jp, w.status, w.wordshk_id) == ("gaap3 jyut6", "wordshk", 7)
    w = resolve_word("甲乙", {**base, "wordshk": [], "overrides": {"甲乙": "gaap3 jyut6"}})
    assert (w.jp, w.status) == ("gaap3 jyut6", "override")
    w = resolve_word("甲乙", {**base, "wordshk": []})
    assert (w.jp, w.status) == ("", "unresolved") and w.alt  # candidates kept


def test_unreviewed_wordshk_is_not_a_source():
    from jiesuo.yue.sources import WordsHK
    e = WordsHK(8, [("甲乙", "gaap3 jyut3")], [], [], [], [], [], False, True)
    srcs = {"rime_words": {"甲乙": ["gaap3 jyut6"]}, "cccanto_words": {}, "wordshk": [e], "train": [],
            "overrides": {}, "chars": {}}
    assert resolve_word("甲乙", srcs).status == "agree"


def test_single_character_uses_character_reading():
    srcs = {"chars": _chars(好=("hou2", ["hou3"])), "rime_words": {}, "cccanto_words": {}, "wordshk": [],
            "train": [], "overrides": {}}
    w = resolve_word("好", srcs)
    assert (w.jp, w.alt, w.status) == ("hou2", ["hou3"], "agree")


def test_segment():
    assert segment("佢 feed 緊😂", {"佢", "緊"}) == ["佢", " feed ", "緊", "😂"]
    assert segment("我哋去", {"我", "我哋", "去"}) == ["我哋", "去"]
    assert segment("嘅x", set()) == ["嘅", "x"]


def test_split_heldout():
    sents = list(range(12))
    train, test = split_heldout(sents)
    assert test == [4, 9] and len(train) == 10 and set(train) | set(test) == set(sents)


STAGE1 = ("你好 早晨 喂 拜拜 再見 唔該 多謝 唔該晒 唔使 對唔住 唔好意思 係 唔 唔係 有 冇 好 我 你 佢 我哋 "
          "你哋 佢哋 零 一 二 三 四 五 六 七 八 九 十 百 千 萬 兩 個 呀 啦").split()


@pytest.fixture(scope="module")
def real():
    if not (ROOT / "data" / "raw" / "yue" / "rime_words.dict.yaml").exists() or not (ROOT / "data" / "raw" / "cedict.json").exists():
        pytest.skip("raw data missing")
    from jiesuo.yue.lexicon import build_lexicon, load_sources
    srcs = load_sources()
    return build_lexicon(srcs)


def test_real_stage1_resolves(real):
    bad = [f for f in STAGE1 if f not in real or real[f].status == "unresolved"]
    assert not bad, bad


def test_real_known_readings(real):
    assert real["唔該"].jp == "m4 goi1"
    assert real["我哋"].jp == "ngo5 dei6"
    assert real["喺"].jp == "hai2"
    assert real["係"].jp == "hai6"
