import bz2
import zipfile

import pytest

from jiesuo.yue import sources

WORDSHK_DIR = sources.WORDSHK_DIR


def test_load_rime_words(tmp_path):
    (tmp_path / "rime_words.dict.yaml").write_text(
        "# c\n---\nname: x\n...\n"
        "你好\tnei5 hou2\n三文治\tsaam1 man4\n你好\tnei5 hou3\n壞\tfoo9\n",
        encoding="utf8",
    )
    assert sources.load_rime_words(tmp_path) == {"你好": ["nei5 hou2", "nei5 hou3"]}


def test_load_cccanto_words(tmp_path):
    with zipfile.ZipFile(tmp_path / "cccanto.zip", "w") as z:
        z.writestr("a.txt", "# comment\n唔該 唔该 [m2 gai1] {m4 goi1} /thank you/please/\n")
    with zipfile.ZipFile(tmp_path / "cccedict_canto_readings.zip", "w") as z:
        z.writestr("b.txt", "你 你 [ni3] {nei5} /you/\n")
    assert sources.load_cccanto_words(tmp_path) == {
        "唔該": [("m4 goi1", "thank you/please")],
        "你": [("nei5", "you")],
    }


ROW = [
    "102955",
    "列:laat6",
    "(pos:名詞)(label:口語)\n<explanation>\nyue:成一條橫線嘅嘢。\neng:row\n<eg>\nyue:離行離列 (lei4 hong4 lei4 laat6)\neng:inconnected\n"
    "----\n<explanation>\nyue:第二義 (測試)\neng:second\n<eg>\nyue:喺度 (hai2 dou6)\neng:here",
    "",
    "OK",
    "未公開",
]


def _write_csv(path, rows):
    import csv
    with open(path, "w", encoding="utf8", newline="") as f:
        f.write("--- Generated notice\n\n")
        csv.writer(f).writerows(rows)


def test_load_wordshk(tmp_path):
    _write_csv(tmp_path / "all-1.csv", [ROW, ["2", "冇:mou5,有:jau5", "未有內容 NO DATA", "", "UNREVIEWED", "已公開"]])
    entries = sources.load_wordshk(tmp_path)
    e = entries[0]
    assert e.id == 102955
    assert e.forms == [("列", "laat6")]
    assert e.pos == ["名詞"] and e.labels == ["口語"]
    assert e.yue == ["成一條橫線嘅嘢。", "第二義 (測試)"]
    assert e.eng == ["row", "second"]
    assert e.examples == [("離行離列", "lei4 hong4 lei4 laat6", "inconnected"), ("喺度", "hai2 dou6", "here")]
    assert e.reviewed is True and e.published is False
    f = entries[1]
    assert f.forms == [("冇", "mou5"), ("有", "jau5")]
    assert f.yue == f.eng == f.examples == [] and not f.reviewed and f.published


def test_load_wordshk_picks_newest_and_missing(tmp_path):
    with pytest.raises(FileNotFoundError, match="words.hk CSV missing"):
        sources.load_wordshk(tmp_path)
    _write_csv(tmp_path / "all-1.csv", [ROW])
    _write_csv(tmp_path / "all-2.csv", [ROW, ROW])
    assert len(sources.load_wordshk(tmp_path)) == 2
    assert len(sources.load_wordshk(tmp_path / "all-1.csv")) == 1


def _bz(path, text):
    path.write_bytes(bz2.compress(text.encode("utf8")))


def test_load_tatoeba_yue(tmp_path):
    d = tmp_path / "tatoeba"
    d.mkdir()
    _bz(d / "yue_sentences_detailed.tsv.bz2",
        "1\tyue\t你好\talice\t2020\t2020\n2\tyue\t冇翻譯\tbob\t\\N\t\\N\n3\tyue\t多譯\t\\N\t\\N\t\\N\n")
    _bz(d / "yue-eng_links.tsv.bz2", "1\t10\n1\t11\n3\t10\n9\t10\n")
    _bz(d / "eng_sentences_detailed.tsv.bz2",
        "10\teng\tHello\tcarol\t\\N\t\\N\n11\teng\tHi\tdave\t\\N\t\\N\n")
    out = sources.load_tatoeba_yue(tmp_path)
    assert [s["id"] for s in out] == [1, 3]
    assert out[0] == {"id": 1, "text": "你好", "author": "alice",
                      "eng": [(10, "Hello", "carol"), (11, "Hi", "dave")]}
    assert out[1]["author"] == ""


@pytest.mark.skipif(not list(WORDSHK_DIR.glob("all-*.csv")), reason="no real words.hk CSV")
def test_real_wordshk():
    entries = sources.load_wordshk()
    assert len(entries) == 59467
    assert sum(e.reviewed for e in entries) == 28964


@pytest.mark.parametrize("line,want", [
    ("風流韻事(fung1 lau4 wan5 si6) 舊指文人吟詩唱歌", ("風流韻事", "fung1 lau4 wan5 si6")),
    ("科技上嘅突破 (fo1 gei6 soeng6 ge3 dat6 po3))", ("科技上嘅突破", "fo1 gei6 soeng6 ge3 dat6 po3")),
    ("佢好開心 (笑)", ("佢好開心 (笑)", "")),
    ("用黑旋風（牌子）就得 (jung6 hak1 zau6 dak1)", ("用黑旋風（牌子）就得", "jung6 hak1 zau6 dak1")),
    ("我 (eks1)", ("我", "eks1")),
])
def test_example_split(line, want):
    block = "<eg>\nyue:" + line + "\neng:x"
    assert sources._parse_definitions(block)[4] == [(want[0], want[1], "x")]


def test_cccanto_y_for_j_is_normalised(tmp_path):
    with zipfile.ZipFile(tmp_path / "cccanto.zip", "w") as z:
        z.writestr("a.txt", "成日 成日 [cheng2 ri4] {seng4 yat6} /always; all the time/\n"
                            "油 油 [you2] {yau4} /oil/\n日 日 [ri4] {yat6} /sun/\n")
    with zipfile.ZipFile(tmp_path / "cccedict_canto_readings.zip", "w") as z:
        z.writestr("b.txt", "")
    got = sources.load_cccanto_words(tmp_path)
    assert got["成日"] == [("seng4 jat6", "always; all the time")]
    assert got["油"] == [("jau4", "oil")]
    assert sources.load_cccanto_chars(tmp_path)["日"] == {"jat6"}


def test_fix_syllable_only_changes_what_becomes_valid():
    assert sources.fix_syllable("yat6") == "jat6"
    assert sources.fix_syllable("yu5") == "yu5"  # already a Jyutping syllable
    assert sources.fix_syllable("yx9") == "yx9"
    assert sources.fix_reading("seng4 yat6") == "seng4 jat6"
