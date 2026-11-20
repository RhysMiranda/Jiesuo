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


FORMS = {"的士", "他", "在", "坐", "我", "家", "食", "咗", "飯", "佢", "現在", "目的", "其他", "在乎"}


def test_formal_hits():
    assert course.formal_hits("他在家", FORMS) == ["他", "在"]
    assert course.formal_hits("我坐的士", FORMS) == []  # 的士 is one token
    assert course.formal_hits("佢現在喺屋企", FORMS) == []  # 現在 is a colloquial word, not 在 alone
    assert course.formal_hits("其他人", FORMS) == []  # 他 inside 其他
    assert course.formal_hits("佢嘅目的", FORMS) == []
    assert course.formal_hits("我的飯", FORMS) == ["的"]
    assert course.formal_hits("我沒有飯", FORMS) == ["沒有"]
    assert course.formal_hits("我食咗飯", lambda t: list(t)) == []  # a segmenting function works too
    assert course.formal_hits("他食咗飯", lambda t: list(t)) == ["他"]


def test_colloquial():
    assert course.colloquial("我食咗飯", FORMS)
    assert course.colloquial("佢現在食緊", FORMS)  # 現在 is fine
    assert not course.colloquial("我食飯", FORMS)  # no marker
    assert not course.colloquial("佢在家", FORMS)  # marker, but a formal form
    assert not course.colloquial("佢沒有食", FORMS)  # the substring 沒有
    assert not course.colloquial("我的佢", FORMS)


def test_formal_only_items_are_never_taught_on_their_own():
    lex = lexi(W("不", "bat1", 99), W("不過", "bat1 gwo3", 50), W("是", "si6", 98), W("是但", "si6 daan6", 40),
               W("還", "waan4", 97), W("在", "zoi6", 96), W("現在", "jin6 zoi6", 30), W("沒有", "mut6 jau5", 95),
               W("食", "sik6", 10))
    order = course.order_words(lex, [])
    assert not set(order) & course.FORMAL_ONLY_ITEMS
    assert {"不過", "是但", "現在", "食"} <= set(order)
    assert {"不", "他", "她", "它", "們", "這", "那", "沒", "沒有", "的", "是", "了", "在", "說", "看", "吃", "給", "很",
            "什麼", "怎麼", "還"} == course.FORMAL_ONLY_ITEMS


def test_a_character_is_taught_alone_only_if_it_is_a_free_word():
    lex = lexi(W("咖", "gaa3", 5), W("啡", "fe1", 5), W("咖啡", "gaa3 fe1", 50), W("食", "sik6", 9))
    order = course.order_words(lex, [], free={"食"})
    assert order == ["咖啡", "食"]  # 咖 and 啡 are bound: no item of their own, and no prerequisite
    train = [[("食", "V", "sik6")]] * 5 + [[("咖", "N", "gaa3")]] * 4 + [[("來", "V", "lai4")]] * 5
    free = course.free_chars(train)
    assert "食" in free and "咖" not in free
    assert "嚟" in free and "來" not in free  # HKCanCor writes 嚟 lai4 as 來


def test_variant_only_forms_are_not_headwords():
    srcs = {"rime": {"囖": [], "囉": []}, "rime_words": {}, "cccanto": {}, "cccanto_words": {},
            "wordshk": [_whk(1, [], forms=(("囉", "lo1"), ("囖", "lo1")))]}
    assert course.headword_forms(srcs) == {"囉"}  # 囖 is in rime, but words.hk files it as a variant of 囉


def test_reads_as_rejects_another_word_or_reading():
    lex = lexi(W("你呢", "nei5 ne1"), W("排", "paai4"), W("地下", "dei6 haa2", alt=["dei6 haa6"]))
    other = {"toks": [["你呢", "nei5 ni1"], ["排", "paai4"]], "id": "wordshk:1#1"}
    same = {"toks": [["你呢", "nei5 ne1"]], "id": "wordshk:2#1"}
    tone = {"toks": [["地下", "dei6 haa6"]], "id": "wordshk:3#1"}
    hk = {"toks": [["你呢", "nei5 ne1"]], "hk": [["你", "nei5"], ["呢", "ne1"]], "id": "hkcancor:f#1"}
    assert not course.reads_as(other, "你呢", lex) and course.reads_as(same, "你呢", lex)
    assert course.reads_as(tone, "地下", lex)  # a recorded alternative that differs only in tone (a changed tone)
    assert not course.reads_as(dict(tone, toks=[["地下", "dei6 haa1"]]), "地下", lex)
    assert not course.reads_as(hk, "你呢", lex)  # HKCanCor's own tokens are 你 + 呢
    order = ["你呢", "排"]
    exs = [dict(_ex("a", "你呢排點呀", ["你呢", "排"]), toks=other["toks"])]
    assert course.lesson_sentences(order, exs, (), lex) == {}



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


def test_lesson_sentence_contains_the_item_and_uses_only_earlier_words():
    order = ["我", "食", "飯", "佢"]
    exs = [_ex("long", "我食飯我食飯", ["我", "食", "飯"]), _ex("short", "我食我食", ["我", "食"]),
           _ex("noen", "我我我我", ["我"], en=None), _ex("tiny", "我食", ["我", "食"]),
           _ex("late", "佢佢佢佢", ["佢"]), _ex("other", "佢食飯食", ["佢", "食", "飯"])]
    got = course.lesson_sentences(order, exs)
    assert "我" not in got  # the only sentence on 我 has no English
    assert got["食"] == "short"  # "tiny" has fewer than 4 Han characters
    assert got["飯"] == "long"
    assert got["佢"] == "late"  # 佢 is last: "other" also qualifies and "late" is shorter


def test_lesson_sentence_never_maps_an_item_to_a_sentence_without_it():
    order = ["拜拜", "再見", "唔使"]
    exs = [_ex("bye", "拜拜拜拜", ["拜拜"])]
    got = course.lesson_sentences(order, exs)
    assert got == {"拜拜": "bye"}  # 再見 and 唔使 have none of their own, so no entry
    exs.append(_ex("see", "再見再見", ["再見"]))
    assert course.lesson_sentences(order, exs)["再見"] == "see"


def test_lesson_sentence_for_a_grammar_item_is_one_of_its_examples():
    order = ["我", "食", "g:zo2"]
    pts = [{"id": "zo2", "_examples": [_ex("a", "我食咗", ["我", "食"]), _ex("b", "我食咗飯", ["我", "食"]),
                                       _ex("c", "我食", ["我", "食"]), _ex("d", "我食咗飯嗎", ["我", "食", "x"])]}]
    got = course.lesson_sentences(order, [_ex("z", "我食我食", ["我", "食"])], pts)
    assert got["g:zo2"] == "b"  # a is too short, c too short, d has a word outside the order


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


def test_examples_tatoeba_drops_a_single_character_token_with_alt_readings():
    tat = [{"id": 1, "text": "我食好飯", "author": "a", "eng": [(9, "x", "b")]}]  # 好 has alt hou3
    assert course.examples(LEX, tat, [], []) == []
    sure = [("f", 1, [("好", "ADJ", "hou2")] * 500)]  # no exemption, however clear the corpus is
    assert course.examples(LEX, tat, [], sure) == []
    assert len(course.examples(lexi(W("我", "ngo5"), W("食", "sik6"), W("好", "hou2"), W("飯", "faan6")), tat, [], [])) == 1


def test_examples_tatoeba_drops_a_multi_character_token_without_spoken_evidence():
    lex = lexi(W("我", "ngo5"), W("離開", "lei4 hoi1"), W("間房", "gaan3 fong2"), W("間", "gaan1"), W("房", "fong2"))
    tat = [{"id": 1, "text": "我離開間房", "author": "a", "eng": [(9, "x", "b")]}]
    train = [("f", i, [("離開", "V", "lei4 hoi1")] * 1) for i in range(3)]
    assert course.examples(lex, tat, [], train) == []  # 間房 is fused and has no train tokens
    train += [("f", 9 + i, [("間房", "N", "gaan3 fong2")]) for i in range(3)]
    assert len(course.examples(lex, tat, [], train)) == 1


def test_examples_hkcancor_use_its_reading_only_when_it_is_a_known_alternative():
    keep = [("f1", 5, [("我", "R", "ngo5"), ("食", "V", "sik6"), ("飯", "N", "faan6"), ("呢", "Y", "ni1"), ("我", "R", "ngo5")])]
    bad = [("f1", 6, [("我", "R", "ngo5"), ("食", "V", "sik6"), ("飯", "N", "faan1"), ("呢", "Y", "ne1"), ("我", "R", "ngo5")])]
    pool = course.examples(LEX, [], [], keep + bad)
    assert [x["id"] for x in pool] == ["hkcancor:f1#5"]
    assert pool[0]["jp"] == "ngo5 sik6 faan6 ni1 ngo5" and pool[0]["en"] is None


def test_examples_drop_formal_forms_and_short_hkcancor_fragments():
    lex = dict(LEX)
    lex["他"] = W("他", "taa1")
    pool = course.examples(lex, [{"id": 1, "text": "他食飯", "author": "a", "eng": [(9, "x", "b")]}], [], [])
    assert pool == []
    frag = [("f", 1, [("我", "R", "ngo5"), ("食", "V", "sik6")])]
    assert course.examples(LEX, [], [], frag) == []  # fewer than 5 characters


def test_examples_are_kept_short():
    tat = [{"id": 1, "text": "我" * 21, "author": "a", "eng": [(9, "x", "b")]}]
    assert course.examples(LEX, tat, [], []) == []


def test_grammar_examples_follow_the_provenance_rule():
    point = {"id": "zo2", "pattern": "咗", "cite": "咗:zo2", "needs": []}
    pos = {w: i for i, w in enumerate(LEX)}
    ent = _whk(7, [("我食咗飯", "ngo5 sik6 zo2 faan6", "I ate")])
    other = _whk(8, [("佢食咗飯", "keoi5 sik6 zo2 faan6", "He ate"), ("佢食咗粥", "keoi5 sik6 zo3 zuk1", "x")],
                 forms=(("喇", "laa3"),))
    tat = [{"id": 1, "text": "我食咗", "author": "a", "eng": [(9, "I ate", "b")]}]
    hk = [("f", 1, [("我", "R", "ngo5"), ("食", "V", "sik6"), ("咗", "U", "zo2"), ("飯", "N", "faan6"), ("呢", "Y", "ne1")]),
          ("f", 2, [("我", "R", "ngo5"), ("食", "V", "sik6"), ("咗", "U", "zo3"), ("飯", "N", "faan6"), ("呢", "Y", "ne1")])]
    lex = dict(LEX)
    lex["咗"] = W("咗", "zo2", alt=["zo3"])
    wk = [ent, other]
    pool = course.examples(lex, tat, wk, hk)
    got = [x["id"] for x in course.grammar_examples(point, pool, pos, lex, wk)]
    # the cited entry first, then another entry whose own Jyutping gives 咗 zo2 (not zo3); HKCanCor only with zo2
    assert got == ["wordshk:7#1", "wordshk:8#1", "hkcancor:f#1"]
    lex["咗"] = W("咗", "zo2")  # a single reading: Tatoeba may be used
    pool = course.examples(lex, tat, wk, hk)
    got = [x["id"] for x in course.grammar_examples(point, pool, pos, lex, wk)]
    assert got[0] == "wordshk:7#1" and got[-1] == "tatoeba:1"
    point["exclude"] = ["tatoeba:1"]
    assert "tatoeba:1" not in [x["id"] for x in course.grammar_examples(point, pool, pos, lex, wk)]
    point["entries"] = [8]  # an entry that is not a citation of this point gives no free pass: the reading rule applies
    assert [x["id"] for x in course.grammar_examples(point, pool, pos, lex, wk) if x["id"].startswith("wordshk")] == [
        "wordshk:7#1", "wordshk:8#1"]
    ex8 = next(x for x in pool if x["id"] == "wordshk:8#1")
    assert course._key_ok({"id": "zo2", "cite": "咗:zo2"}, ex8, lex, {7})
    # a particle point uses its own entries only (係我嘅 ends in ge3 too, but is possessive)
    assert not course._key_ok({"id": "laa3", "cite": "咗:zo2"}, ex8, lex, {7})


def test_lesson_sentence_prefers_wordshk_over_tatoeba():
    order = ["我", "食"]
    exs = [_ex("tatoeba:1", "我食", ["我", "食"]), _ex("tatoeba:2", "我食我食", ["我", "食"]),
           _ex("wordshk:2#1", "我食我食我食", ["我", "食"])]
    assert course.lesson_sentences(order, exs)["食"] == "wordshk:2#1"


def test_particle_points_need_the_key_character_at_the_end_of_a_clause():
    assert course.clause_final("你係咩", "咩") and course.clause_final("你係咩，好", "咩")
    assert not course.clause_final("咩事呀", "咩")
    point = {"id": "me1", "pattern": "咩", "cite": "咩:me1"}
    assert course._matches(point, _ex("a", "你係咩", ["我"]), {"我": 0})
    assert not course._matches(point, _ex("a", "咩事呀", ["我"]), {"我": 0})
    assert course._matches({**point, "id": "zo2"}, _ex("a", "咩事呀", ["我"]), {"我": 0})


def test_pattern_helper_strips_final_punctuation():
    assert re.search("嘅$", "我嘅。".rstrip("。")) and course._strip("我嘅。 ") == "我嘅"


def test_examples_tatoeba_carries_the_translation_author_and_skips_ownerless_translations():
    lex = lexi(W("我", "ngo5"), W("食", "sik6"), W("飯", "faan6"))
    tat = [{"id": 1, "text": "我食飯", "author": "a", "eng": [(8, "x", ""), (9, "I eat.", "bob")]},
           {"id": 2, "text": "我食", "author": "a", "eng": [(8, "x", "")]}]
    pool = course.examples(lex, tat, [], [])
    assert [(x["id"], x["en"], x["en_id"], x["en_author"]) for x in pool] == [("tatoeba:1", "I eat.", 9, "bob")]


def test_wordshk_free_chars_need_a_published_reviewed_spoken_entry_with_the_reading():
    lex = lexi(W("雨", "jyu5"), W("其", "kei4"), W("風", "fung1"), W("火", "fo2"))
    ents = [WordsHK(1, [("雨", "jyu5")], ["名詞"], [], [], ["rain"], [], True, True),
            WordsHK(2, [("其", "kei4")], ["名詞"], ["書面語"], [], ["its"], [], True, True),  # labelled written
            WordsHK(5, [("其", "kei4")], ["代詞"], [], [], ["its"], [], True, True),  # a function word
            WordsHK(3, [("風", "fung1")], ["名詞"], [], [], ["wind"], [], True, False),  # not published
            WordsHK(4, [("火", "fo1")], ["名詞"], [], [], ["fire"], [], True, True)]  # another reading
    assert course.wordshk_free_chars(ents, lex) == {"雨"}
