from jiesuo.yue import evaluate
from jiesuo.yue.lexicon import Word


def _lex(**kw):
    return {f: Word(form=f, jp=jp) for f, jp in kw.items()}


def test_reading_accuracy_half():
    lex = _lex(你好="nei5 hou2", 食="sik6")
    test = [[("你好", "x", "nei5 hou2"), ("食", "v", "sik9")]]
    assert evaluate.reading_accuracy(test, lex) == 0.5


def test_reading_accuracy_types_and_disagreements():
    lex = _lex(食="sik6")
    test = [[("食", "v", "sik6"), ("食", "v", "sik9"), ("食", "v", "sik9"), ("囧", "v", "x")]]
    r = evaluate.reading_report(test, lex)
    assert r["tokens"] == 3 and r["types"] == 1
    assert abs(r["token_share"] - 1 / 3) < 1e-9 and r["type_share"] == 0.0
    assert r["disagreements"][0] == ("食", "sik6", "sik9", 2)


def test_split_f1_identical_is_one():
    lex = _lex(你好="nei5 hou2", 食="sik6", 飯="faan6")
    test = [[("你好", "x", "nei5 hou2"), ("食", "v", "sik6"), ("飯", "n", "faan6")]]
    assert evaluate.split_f1(test, lex) == 1.0


def test_split_f1_partial():
    lex = _lex(你="nei5", 好="hou2")  # no 你好 in the lexicon: the segmenter splits it
    test = [[("你好", "x", "nei5 hou2")]]
    assert 0 < evaluate.split_f1(test, lex) < 1


def test_coverage_monotonic():
    order = ["a", "b", "c", "g:x", "d"]
    sents = [["a", "b", "c", "d", "z"], ["a", "a", "b"]]
    c = evaluate.coverage(order, sents, ns=(1, 2, 3, 4))
    vals = [c[n] for n in (1, 2, 3, 4)]
    assert vals == sorted(vals) and vals[0] > 0
    assert abs(c[4] - 7 / 8) < 1e-9
