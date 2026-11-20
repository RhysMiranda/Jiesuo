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
    lex = _lex(你="nei5", 好="hou2", 食="sik6")  # no 你好 in the lexicon: the segmenter splits it
    test = [[("你好", "x", "nei5 hou2"), ("食", "v", "sik6")]]
    assert abs(evaluate.split_f1(test, lex) - 2 / 3) < 1e-9  # inner boundaries: gold {2}, split {1, 2}


def test_coverage_monotonic():
    order = ["a", "b", "c", "g:x", "d"]
    sents = [["a", "b", "c", "d", "z"], ["a", "a", "b"]]
    c = evaluate.coverage(order, sents, ns=(1, 2, 3, 4))
    vals = [c[n] for n in (1, 2, 3, 4)]
    assert vals == sorted(vals) and vals[0] > 0
    assert abs(c[4] - 7 / 8) < 1e-9


def test_split_f1_does_not_count_the_sentence_end():
    lex = _lex(食="sik6", 飯="faan6")
    assert evaluate.split_f1([[("食飯", "v", "sik6 faan6")]], lex) == 0.0  # one wrong inner boundary, nothing right


def test_shipped_lexicon_reads_like_the_app():
    lex = evaluate.Shipped([["你好", "nei5 hou2", "", 1, 0, "a"], ["食", "sik6", "", 2, 0, "a"]], {"飯": ["faan6"]})
    test = [[("你好", "x", "nei5 hou2"), ("食飯", "v", "sik6 faan6"), ("囧", "x", "gwing2")]]
    r = evaluate.reading_report(test, lex)
    assert r["tokens"] == 2 and r["token_share"] == 1.0  # 食飯: shipped 食 + 飯's character reading; 囧 unreadable


def test_tone_line_reads_the_result_and_measures(tmp_path):
    p = tmp_path / "t.md"
    p.write_text("**Result: GUIDE**\n\n| accuracy on decided items | 85% | >= 90% |\n| \"not sure\" rate | 12% | <= 20% |\n",
                 encoding="utf8")
    line = evaluate.tone_line(p)
    assert "Result: GUIDE" in line and "accuracy on decided items 85% (needed >= 90%)" in line and "rate 12%" in line
    assert "not found" in evaluate.tone_line(tmp_path / "missing.md")


def test_write_report_has_every_section_and_the_notes(tmp_path):
    r = {"reading": {"tokens": 4, "types": 2, "token_share": 0.75, "type_share": 0.5,
                     "disagreements": [("到", "dou3", "dou2", 1)]},
         "f1": 0.9, "sets": {"HKCanCor test": [["到"]]}, "n_test": 1, "n_train": 4, "course_len": 3,
         "cov": {"HKCanCor test": {"course": {n: 0.5 for n in evaluate.NS}, "frequency": {n: 0.6 for n in evaluate.NS}}}}
    out = tmp_path / "acc.md"
    evaluate.write_report(r, out, notes={"到": "a word on its own"}, tone="TONE")
    text = out.read_text(encoding="utf8")
    for want in ("## Readings", "## Word splitting", "## Coverage", "| 到 | dou3 | dou2 | 1 | a word on its own |",
                 "TONE", "75.0%", "90.0%", "by design", "HKCanCor's own writing conventions"):
        assert want in text, want
    assert "not errors" not in text
