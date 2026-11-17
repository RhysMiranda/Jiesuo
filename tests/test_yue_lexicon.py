import re
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


def test_real_overrides_keep_alternatives(real):
    assert real["呀"].jp == "aa3" and real["呀"].status == "override" and "aa4" in real["呀"].alt
    assert real["返"].jp == "faan1" and real["返"].status == "override" and "faan2" in real["返"].alt


def test_segment_is_lossless():
    t = "佢 feed 緊😂 123，我哋Go!？龘去。 ｜x"
    assert "".join(segment(t, {"佢", "我哋", "去"})) == t


def _en_srcs(canto, chars):
    return {"rime_words": {}, "cccanto_words": {"行": canto}, "wordshk": [], "train": [], "overrides": {},
            "chars": chars}


def test_meaning_matches_the_reading():
    canto = [("hang4", "to walk"), ("hong4", "row; profession")]
    w = resolve_word("行", _en_srcs(canto, _chars(行=("hong4", ["hang4"]))))
    assert (w.jp, w.en) == ("hong4", "row; profession")


def test_mismatched_gloss_is_not_used_for_a_polyphonic_char():
    w = resolve_word("行", _en_srcs([("hang4", "to walk")], _chars(行=("hong4", ["hang4"]))))
    assert (w.jp, w.en) == ("hong4", "")
    one = resolve_word("行", _en_srcs([("hang4", "to walk")], _chars(行=("hang4", []))))
    assert one.en == "to walk"


def test_cedict_sense_is_taken_through_the_pinyin_that_maps_to_the_reading():
    srcs = _en_srcs([], _chars(行=("hong4", ["hang4"])))
    srcs["cedict_jp"] = {("行", "hong4"): ["row", "profession", "firm", "extra"], ("行", "hang4"): ["to walk"]}
    w = resolve_word("行", srcs)
    assert w.en == "row; profession; firm"  # only the hong4 senses, at most three
    srcs["cedict_jp"] = {("行", "hang4"): ["to walk"]}
    assert resolve_word("行", srcs).en == ""


def test_pinyin_key_and_cedict_mapping():
    from jiesuo.yue.lexicon import _pinyin_key
    assert _pinyin_key("Lu:4") == _pinyin_key("lü4") == _pinyin_key("lv4") == "lu:4"
    assert _pinyin_key("yi1 lu:4") == "yi1lu:4"


def test_published_reviewed_wordshk_gloss_makes_a_form_teachable_without_copying_it():
    from jiesuo.yue.sources import WordsHK
    def e(id_, rev, pub, eng):
        return WordsHK(id_, [("行", "hong4")], [], [], [], eng, [], rev, pub)
    base = _en_srcs([], _chars(行=("hong4", ["hang4"])))
    for ent, flag in ((e(1, True, True, ["row"]), True), (e(2, True, False, ["row"]), False),
                      (e(3, False, True, ["row"]), False), (e(4, True, True, [""]), False)):
        w = resolve_word("行", {**base, "wordshk": [ent]})
        assert w.whk_eng is flag and w.en == ""


def test_cccanto_y_reading_gives_the_word_its_gloss():
    from jiesuo.yue import sources
    srcs = {"rime_words": {"成日": ["seng4 jat6"]}, "wordshk": [], "train": [], "overrides": {},
            "chars": _chars(成=("seng4", []), 日=("jat6", [])),
            "cccanto_words": {"成日": [(sources.fix_reading("seng4 yat6"), "always")]}}
    w = resolve_word("成日", srcs)
    assert (w.jp, w.status, w.en) == ("seng4 jat6", "agree", "always")


def test_clean_senses_removes_the_mandarin_from_real_cedict_senses():
    from jiesuo.yue.lexicon import clean_senses
    assert clean_senses(["early morning", "CL:個|个[ge4]", "also pr. [zao3chen5]"]) == "early morning"
    assert clean_senses(["surname San", "three", "3"]) == "three; 3"
    assert clean_senses(["you (informal, as opposed to courteous 您[nin2])"]) == "you"
    assert clean_senses(["person", "people", "CL:個|个[ge4],位[wei4]"]) == "person; people"
    assert clean_senses(["(loanword) bye-bye; also pr. [bai1 bai1] etc"]) == "(loanword) bye-bye"
    assert clean_senses(["a", "b", "c", "d"]) == "a; b; c"
    assert clean_senses(["see 你[ni3]", "variant of x", "(Tw) y"]) == ""


def test_no_shipped_meaning_has_mandarin_in_it():
    import json, re
    p = ROOT / "app" / "yue" / "data" / "lexicon.json"
    if not p.exists():
        pytest.skip("no lexicon.json")
    bad = re.compile(r"\[[a-z]+[1-5]|CL:|\||also pr\.|surname |[\x00-\x1f]|Taiwan pr\.|\(\s*\)|, ;|\(;")
    data = json.loads(p.read_text(encoding="utf8"))
    hits = [w for w in data["words"] if bad.search(w[2])]
    assert data["words"] and not hits, hits[:5]


def test_clean_senses_keeps_the_traditional_form_of_a_pair_and_tidies():
    from jiesuo.yue.lexicon import clean_senses
    got = clean_senses(["Taitung County 臺東縣|台东县[Tai2 dong1 Xian4], x"])
    assert "臺東縣" in got and not re.search(r"[\x00-\x1f]", got)
    assert clean_senses(["harmony (Taiwan pr. [he2]) here"]) == "harmony here"
    assert "()" not in clean_senses(["to sign (Taiwan pr. [shu3])"])
    fol = lambda f: ["Guangzhou", "capital of Guangdong"] if f == "廣州" else None
    assert clean_senses(["see 廣州[Guang3 zhou1]"], follow=fol) == "Guangzhou; capital of Guangdong"
    assert clean_senses(["see 廣州[Guang3 zhou1]"]) == ""
