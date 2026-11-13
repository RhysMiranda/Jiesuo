"""Meanings shown in the app start with the everyday sense."""
from jiesuo.glosses import clean, match_senses, ranked_senses, reading_weights, short_gloss

JIA = [
    {"pinyin": "jia1", "english": ["used in 傢伙|家伙[jia1 huo5] and 傢俱|家俱[jia1 ju4]"]},
    {"pinyin": "jia1", "english": ["home", "family", "(polite) my (sister, uncle etc)"]},
]
LI = [
    {"pinyin": "chi1", "english": ["mythical beast (archaic)"]},
    {"pinyin": "Li2", "english": ["surname Li"]},
    {"pinyin": "li2", "english": ["to leave", "to part from", "to be away from"]},
]
DOU = [
    {"pinyin": "Du1", "english": ["surname Du"]},
    {"pinyin": "dou1", "english": ["all; both; entirely"]},
    {"pinyin": "du1", "english": ["capital city", "metropolis"]},
]


def test_cross_references_and_archaic_senses_are_not_shown_first():
    assert short_gloss(ranked_senses(JIA)) == "home; family"
    assert short_gloss(ranked_senses(LI)) == "to leave; to part from"


def test_the_reading_words_use_most_comes_first_unless_hand_checked():
    weights = {"dū": 50.0, "dōu": 1.0}  # 首都, 成都 outweigh the words with dōu
    assert ranked_senses(DOU, weights)[0] == "capital city"
    assert ranked_senses(DOU, weights, main="dōu")[0] == "all; both; entirely"


def test_reading_weights_count_each_character_by_word_frequency():
    items = [["w", "首都", "shǒu dū", "", 40.0], ["w", "都是", "dōu shì", "", 10.0], ["c", "都", "dōu, dū", "", 900.0]]
    w = reading_weights(items)
    assert w["都"] == {"dū": 40.0, "dōu": 10.0}


def test_clean_keeps_simplified_and_drops_pinyin_and_labels():
    assert clean("used with 得[de2] after a verb") == "used with 得 after a verb"
    assert clean("see 傢伙|家伙[jia1 huo5]") == "see 家伙"
    assert clean("(bound form) up; upper") == "up; upper"
    assert clean("with (Taiwan pr. [han4])") == "with"


def test_match_senses_lists_the_senses_after_the_shown_two():
    senses = ["to; for", "for the benefit of", "to give", "to allow (sb to do sth)"]
    assert match_senses(senses) == "to give;to allow"
