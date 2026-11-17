"""Course order, grammar placement and examples, on toy data (the real-data checks are in test_yue_content.py)."""
import re

from jiesuo.yue import course
from jiesuo.yue.lexicon import Word
from jiesuo.yue.sources import WordsHK


def W(form, jp, freq=1.0, alt=(), status="agree", en="x"):
    return Word(form, jp, list(alt), status, freq=freq, en=en)


def lexi(*rows):
    return {w.form: w for w in rows}


STAGE1 = ["你好", "早晨", "我"]


def test_order_starts_with_stage1_in_order_without_duplicates():
    lex = lexi(W("你好", "nei5 hou2", 1), W("早晨", "zou2 san4", 1), W("我", "ngo5", 50), W("食", "sik6", 40),
               W("飯", "faan6", 30))
    order = course.order_words(lex, STAGE1)
    assert order[:3] == STAGE1 and order[0] == "你好"
    assert len(order) == len(set(order))
    assert set(order) == set(lex)


def test_a_word_comes_after_its_character_words():
    lex = lexi(W("我", "ngo5", 5), W("哋", "dei6", 1), W("我哋", "ngo5 dei6", 100), W("食", "sik6", 50))
    order = course.order_words(lex, [])
    assert order.index("我哋") > order.index("我") and order.index("我哋") > order.index("哋")


def test_a_character_that_is_not_a_word_gets_no_unit():
    lex = lexi(W("我哋", "ngo5 dei6", 100), W("食", "sik6", 50))  # 我 and 哋 are not words
    order = course.order_words(lex, [])
    assert set(order) == {"我哋", "食"}


def test_words_without_a_meaning_for_their_reading_are_not_ordered():
    lex = lexi(W("食", "sik6", 9), W("行", "haang4", 8, en=""), W("行街", "haang4 gaai1", 7), W("飯", "faan6", 5))
    assert "行" not in course.order_words(lex, [])
    assert "行街" in course.order_words(lex, [])  # 行 is not a teachable word, so it is no prerequisite
    lex["行"].whk_eng = True  # a published reviewed words.hk gloss keeps it teachable
    assert "行" in course.order_words(lex, [])
    assert course.order_words(lex, ["行"])[0] == "行"  # Stage 1 content carries its own meaning


def test_only_headword_forms_are_ordered():
    lex = lexi(W("食", "sik6", 9), W("𡃉", "gaa3", 8), W("囖", "lo1", 7))
    assert course.order_words(lex, [], headwords={"食", "囖"}) == ["食", "囖"]
    assert course.order_words(lex, [], headwords={"食"}) == ["食"]
    srcs = {"rime": {"食": []}, "rime_words": {"飯堂": []}, "cccanto": {}, "cccanto_words": {"食飯": []},
            "wordshk": [_whk(1, [], forms=(("喇", "laa3"), ("啦", "laa1"))), _whk(2, [], reviewed=False, forms=(("佢", "keoi5"),))]}
    assert course.headword_forms(srcs) == {"食", "飯堂", "食飯", "喇"}  # variant 啦 and unreviewed 佢 are not headwords


def test_order_is_truncated():
    lex = lexi(*(W(c, "aa1", i + 1) for i, c in enumerate("一二三四五")))
    assert len(course.order_words(lex, [], n=3)) == 3
    assert course.order_words(lex, ["五"], n=2)[0] == "五"


FORMS = {"的士", "他", "在", "坐", "我", "家", "食", "咗", "飯", "佢"}


def test_formal_hits():
    assert course.formal_hits("他在家", FORMS)
    assert course.formal_hits("我坐的士", FORMS) == []  # 的士 is one token
    assert course.formal_hits("我沒有飯", FORMS) == ["沒有"]
    assert course.formal_hits("我食咗飯", lambda t: list(t)) == []  # a segmenting function works too


def test_colloquial():
    assert course.colloquial("我食咗飯", FORMS)
    assert not course.colloquial("我食飯", FORMS)  # no marker
    assert not course.colloquial("佢在家", FORMS)  # marker, but a formal form


def _ex(id_, text, words, en="x"):
    return {"id": id_, "text": text, "jp": "", "en": en, "source": id_, "words": words}


def _order():
    return [f"w{i}" for i in range(80)] + ["咗", "食", "飯"]


def test_place_grammar_after_needs_and_spaced():
    order = [f"w{i}" for i in range(15)] + ["咗", "食"] + [f"v{i}" for i in range(40)]
    exs = [_ex("a", "食咗", ["食", "咗"]), _ex("b", "食咗飯", ["食", "咗"]),
           _ex("c", "w1嘅", ["w1"]), _ex("d", "w2嘅", ["w2"])]
    pts = [{"id": "zo2", "pattern": "咗", "needs": ["咗", "食"]}, {"id": "ge3", "pattern": "嘅", "needs": ["w1"]},
           {"id": "early", "pattern": "嘅", "needs": ["w2"]}]
    out = course.place_grammar(order, pts, exs)
    assert out.index("g:zo2") > out.index("咗") and out.index("g:zo2") > out.index("食")
    gs = [i for i, x in enumerate(out) if x.startswith("g:")]
    assert len(gs) == 3
    for a, b in zip(gs, gs[1:]):
        assert b - a - 1 >= 10  # at least 10 words between two points
    assert [x for x in out if not x.startswith("g:")] == order


def test_place_grammar_leaves_out_thin_points():
    order = ["咗", "食"] + [f"v{i}" for i in range(30)]
    exs = [_ex("a", "食咗", ["食", "咗"]), _ex("b", "好長好長好長好長好長好長好長好長食咗", ["食", "咗"]),
           _ex("c", "食咗", ["食", "late"])]  # too long, and a word outside the order
    pts = [{"id": "zo2", "pattern": "咗", "needs": ["咗"]}]
    assert course.place_grammar(order, pts, exs) == order  # only one valid example
    exs.append(_ex("d", "飲咗", ["咗"]))
    assert "g:zo2" in course.place_grammar(order, pts, exs)


def test_place_grammar_skips_a_point_whose_need_is_not_in_the_order():
    exs = [_ex("a", "咗", ["咗"]), _ex("b", "咗咗", ["咗"])]
    pts = [{"id": "zo2", "pattern": "咗", "needs": ["咗", "nowhere"]}]
    assert course.place_grammar(["咗"], pts, exs) == ["咗"]


def test_place_grammar_uses_precomputed_examples():
    pts = [{"id": "zo2", "pattern": "咗", "needs": ["咗"], "_examples": [_ex("a", "x", []), _ex("b", "y", [])]}]
    assert "g:zo2" in course.place_grammar(["咗"] + ["v"] * 12, pts, [])


def test_lesson_sentence_is_the_shortest_with_english_using_known_words():
    order = ["我", "食", "飯", "佢"]
    exs = [_ex("long", "我食飯", ["我", "食", "飯"]), _ex("short", "我食", ["我", "食"]),
           _ex("noen", "我", ["我"], en=None), _ex("late", "佢", ["佢"])]
    got = course.lesson_sentences(order, exs)
    assert got["我"] is None  # the only sentence on 我 has no English
    assert got["食"] == "short"
    assert got["飯"] == "long"  # contains today's word, though "short" is shorter
    assert got["佢"] == "late"


def test_split_example_jp_takes_a_punctuated_reading_off_the_text():
    assert course.split_example_jp("我哋食飯，你呢？ (ngo5 dei6 sik6 faan6, nei5 ne1?)", "") == (
        "我哋食飯，你呢？", "ngo5 dei6 sik6 faan6  nei5 ne1 ")
    assert course.split_example_jp("你好", "") == ("你好", "")  # no reading
    assert course.split_example_jp("你好", "nei5 hou2") == ("你好", "nei5 hou2")


def _whk(id_, examples, reviewed=True, published=True, forms=(("咗", "zo2"),)):
    return WordsHK(id_, list(forms), [], [], [], [], examples, reviewed, published)


LEX = lexi(W("我", "ngo5"), W("食", "sik6"), W("咗", "zo2"), W("飯", "faan6"), W("好", "hou2", alt=["hou3"]),
           W("佢", "keoi5"), W("呢", "ne1", alt=["ni1"]), W("喇", "laa3", alt=["laa1"]))


def test_examples_wordshk_own_jyutping_wins_and_is_recorded():
    e = _whk(1, [("我食咗飯", "ngo5 sik6 zo2 faan6", "I have eaten."), ("呢飯", "ni1 faan6", "this rice")])
    diffs = []
    pool = course.examples(LEX, [], [e], [], diffs)
    by = {x["id"]: x for x in pool}
    assert by["wordshk:1#1"]["jp"] == "ngo5 sik6 zo2 faan6" and by["wordshk:1#1"]["en"] == "I have eaten."
    assert by["wordshk:1#2"]["jp"] == "ni1 faan6"  # words.hk says ni1, the lexicon says ne1
    assert ("wordshk:1#2", "呢", "ne1", "ni1") in diffs
    assert by["wordshk:1#2"]["words"] == ["呢", "飯"]


def test_examples_wordshk_unpublished_or_unreviewed_are_not_shipped():
    ex = [("我食咗飯", "ngo5 sik6 zo2 faan6", "x")]
    assert course.examples(LEX, [], [_whk(1, ex, published=False)], []) == []
    assert course.examples(LEX, [], [_whk(2, ex, reviewed=False)], []) == []


def test_examples_wordshk_bad_jyutping_falls_back_to_the_lexicon():
    e = _whk(1, [("我食咗飯", "ngo5 sik6 zo2", "x"), ("我食咗飯", "xx5 sik6 zo2 faan6", "x")])
    pool = course.examples(LEX, [], [e], [])
    assert len(pool) == 1 and pool[0]["jp"] == "ngo5 sik6 zo2 faan6"  # two copies of one text are one example


def test_examples_tatoeba_without_an_author_is_dropped():
    tat = [{"id": 1, "text": "我食飯", "author": "", "eng": [(9, "x", "b")]}]
    assert course.examples(LEX, tat, [], []) == []


def test_examples_drop_unresolved_and_unknown_tokens():
    lex = dict(LEX)
    lex["佢"] = Word("佢", "", [], "unresolved")
    tat = [{"id": 1, "text": "佢食飯", "author": "a", "eng": [(9, "He eats.", "b")]},
           {"id": 2, "text": "我食龘", "author": "a", "eng": [(9, "x", "b")]},
           {"id": 3, "text": "我食飯", "author": "a", "eng": [(9, "I eat.", "b")]}]
    pool = course.examples(lex, tat, [], [])
    assert [x["id"] for x in pool] == ["tatoeba:3"]
    assert pool[0]["author"] == "a" and pool[0]["jp"] == "ngo5 sik6 faan6" and pool[0]["en"] == "I eat."


def test_examples_tatoeba_drops_a_character_with_two_reviewed_readings():
    tat = [{"id": 1, "text": "我食好飯", "author": "a", "eng": [(9, "x", "b")]}]
    two = [_whk(1, [], forms=(("好", "hou2"),)), _whk(2, [], forms=(("好", "hou3"),))]
    assert course.examples(LEX, tat, two, []) == []
    assert len(course.examples(LEX, tat, [two[0]], [])) == 1  # one reading only
    sure = [[("好", "ADJ", "hou2")] * 200 + [("好", "ADJ", "hou3")]]  # 99.5% hou2 over 200 tokens
    assert len(course.examples(LEX, tat, two, [("f", 1, s) for s in sure])) == 1
    unsure = [[("好", "ADJ", "hou2")] * 150 + [("好", "ADJ", "hou3")] * 100]
    assert course.examples(LEX, tat, two, [("f", 1, s) for s in unsure]) == []


def test_examples_hkcancor_use_its_reading_only_when_it_is_a_known_alternative():
    keep = [("f1", 5, [("我", "R", "ngo5"), ("食", "V", "sik6"), ("飯", "N", "faan6"), ("呢", "Y", "ni1")])]
    bad = [("f1", 6, [("我", "R", "ngo5"), ("食", "V", "sik6"), ("飯", "N", "faan1"), ("呢", "Y", "ne1")])]
    pool = course.examples(LEX, [], [], keep + bad)
    assert [x["id"] for x in pool] == ["hkcancor:f1#5"]
    assert pool[0]["jp"] == "ngo5 sik6 faan6 ni1" and pool[0]["en"] is None


def test_examples_drop_formal_forms_and_short_hkcancor_fragments():
    lex = dict(LEX)
    lex["他"] = W("他", "taa1")
    pool = course.examples(lex, [{"id": 1, "text": "他食飯", "author": "a", "eng": [(9, "x", "b")]}], [], [])
    assert pool == []
    frag = [("f", 1, [("我", "R", "ngo5"), ("食", "V", "sik6")])]
    assert course.examples(LEX, [], [], frag) == []  # fewer than 4 characters


def test_examples_are_kept_short():
    tat = [{"id": 1, "text": "我" * 21, "author": "a", "eng": [(9, "x", "b")]}]
    assert course.examples(LEX, tat, [], []) == []


def test_grammar_examples_follow_the_provenance_rule():
    point = {"id": "zo2", "pattern": "咗", "cite": "咗:zo2", "needs": []}
    pos = {w: i for i, w in enumerate(LEX)}
    ent = _whk(7, [("我食咗飯", "ngo5 sik6 zo2 faan6", "I ate")])
    other = _whk(8, [("佢食咗飯", "keoi5 sik6 zo2 faan6", "He ate")], forms=(("喇", "laa3"),))
    tat = [{"id": 1, "text": "我食咗", "author": "a", "eng": [(9, "I ate", "b")]}]
    hk = [("f", 1, [("我", "R", "ngo5"), ("食", "V", "sik6"), ("咗", "U", "zo2"), ("飯", "N", "faan6"), ("呢", "Y", "ne1")]),
          ("f", 2, [("我", "R", "ngo5"), ("食", "V", "sik6"), ("咗", "U", "zo3"), ("飯", "N", "faan6"), ("呢", "Y", "ne1")])]
    lex = dict(LEX)
    lex["咗"] = W("咗", "zo2", alt=["zo3"])
    wk = [ent, other]
    pool = course.examples(lex, tat, wk, hk)
    got = [x["id"] for x in course.grammar_examples(point, pool, pos, lex, wk)]
    assert got == ["wordshk:7#1", "hkcancor:f#1"]  # words.hk entry first, only the cited entry; zo3 is not the cited reading
    lex["咗"] = W("咗", "zo2")  # a single reading: Tatoeba may be used
    pool = course.examples(lex, tat, wk, hk)
    got = [x["id"] for x in course.grammar_examples(point, pool, pos, lex, wk)]
    assert got[0] == "wordshk:7#1" and got[-1] == "tatoeba:1"
    point["exclude"] = ["tatoeba:1"]
    assert "tatoeba:1" not in [x["id"] for x in course.grammar_examples(point, pool, pos, lex, wk)]
    point["entries"] = [8]  # an entry that is not a citation of this point is ignored
    assert not any(x["id"].startswith("wordshk") for x in course.grammar_examples(point, pool, pos, lex, wk))


def test_pattern_helper_strips_final_punctuation():
    assert re.search("嘅$", "我嘅。".rstrip("。")) and course._strip("我嘅。 ") == "我嘅"
