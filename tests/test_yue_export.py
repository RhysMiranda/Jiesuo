"""Phase 2 export: one file per licence (toy data, then the shipped files)."""
import json
from pathlib import Path

import pytest

from jiesuo.yue import export_app as ex
from jiesuo.yue.lexicon import Word
from jiesuo.yue.sources import WordsHK

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app" / "yue" / "data"
WHK_EN = "to eat food secretly"
WHK_YUE = "將嘢食物放入口"


def _entry(id_, form, jp, published=True, reviewed=True, eng=WHK_EN):
    return WordsHK(id_, [(form, jp)], [], [], [WHK_YUE], [eng], [], reviewed, published)


def _pool(id_, text, jp, en, words, author=None, hk=None):
    e = {"id": id_, "text": text, "jp": jp, "en": en, "source": id_, "words": words}
    if author:
        e["author"] = author
        e["en_id"], e["en_author"] = 77, "bob"
    if hk:
        e["hk"] = hk
    return e


def toy():
    lex = {
        "我": Word("我", "ngo5", [], "agree", 9, "I"),
        "食": Word("食", "sik6", [], "agree", 8, "eat"),
        "偷食": Word("偷食", "tau1 sik6", [], "agree", 7, ""),
        "好": Word("好", "hou2", ["hou3"], "agree", 6, "good", changed=["x"]),
        "點": Word("點", "", [], "unresolved", 0, ""),
    }
    pool = [
        _pool("tatoeba:1", "我食", "ngo5 sik6", "I eat.", ["我", "食"], "amy"),
        _pool("wordshk:5#1", "我偷食", "ngo5 tau1 sik6", "I snack.", ["我", "偷食"]),
        _pool("hkcancor:f#3", "我好食", "ngo5 hou2 sik6", None, ["我", "好", "食"], hk=[["我", "ngo5"]]),
    ]
    point = {"id": "p1", "title": "T", "explain": "E", "pattern": "食", "needs": ["食"], "cite": "食:sik6",
             "group": "g", "licence": "x", "entries": [1], "exclude": [], "_examples": pool[:3]}
    b = {"lex": lex, "order": ["我", "食", "偷食", "好"], "placed": ["我", "食", "g:p1", "偷食", "好"], "pool": pool,
         "points": [point], "lesson": {"我": "tatoeba:1", "食": "tatoeba:1", "偷食": "wordshk:5#1", "好": None},
         "stage1": {"licence": "MIT: Jiesuo", "lessons": []}}
    whk = [_entry(5, "偷食", "tau1 sik6"), _entry(6, "食", "sik6", published=False),
           _entry(7, "好", "hou3", eng="to like"), _entry(8, "食", "sik6", reviewed=False)]
    return b, whk


def build():
    b, whk = toy()
    return ex.build_phase2(b, whk, lambda ch: {"好": ["hou2", "hou3"]}.get(ch, ["x1"]), notice=NOTICE,
                           meanings={"items": {}})


NOTICE = {"notice": "N", "disclaimer": "D", "credits": ["C"], "link": "https://words.hk"}


def test_every_file_has_a_licence_and_wordshk_is_marked():
    out = build()
    assert set(out) == {"lexicon", "course", "sentences", "hkcancor", "wordshk"}
    for name, d in out.items():
        assert list(d)[0] == "licence", name
    w = out["wordshk"]
    assert (w["notice"], w["disclaimer"], w["credits"], w["link"]) == ("N", "D", ["C"], "https://words.hk")
    assert "Non-Commercial" in w["licence"]


def test_wordshk_holds_only_published_reviewed_entries_matching_form_and_reading():
    w = build()["wordshk"]
    assert w["entries"]["偷食"] == [5, WHK_EN, WHK_YUE]
    assert "食" not in w["entries"]  # unpublished and unreviewed only
    assert "好" not in w["entries"]  # the entry's reading hou3 is not the word's hou2


def test_no_wordshk_text_outside_wordshk_json():
    out = build()
    for name in ("lexicon", "course", "sentences", "hkcancor"):
        s = json.dumps(out[name], ensure_ascii=False)
        assert WHK_EN not in s and WHK_YUE not in s, name
    assert [r for r in out["lexicon"]["words"] if r[0] == "偷食"][0][2] == ""


def test_course_order_forms_and_example_words_are_in_the_lexicon():
    out = build()
    forms = {r[0] for r in out["lexicon"]["words"]}
    assert all(f in forms for f in out["course"]["order"] if not f.startswith("g:"))
    assert {"我", "食", "偷食", "好"} <= forms
    assert "點" not in forms
    assert out["lexicon"]["chars"]["好"] == ["hou2", "hou3"]


def test_flags_and_alts():
    lex = build()["lexicon"]
    row = [r for r in lex["words"] if r[0] == "好"][0]
    assert row[4] == 3 and lex["alts"]["好"] == ["hou3"]


def test_checked_meaning_replaces_the_gloss_and_sets_flag_8():
    b, whk = toy()
    chars = lambda ch: ["x1"]
    m = {"items": {"食": {"jp": "sik6", "en": "to eat; to take (medicine)", "src": "x"}}}
    rows = {r[0]: r for r in ex.build_phase2(b, whk, chars, notice=NOTICE, meanings=m)["lexicon"]["words"]}
    assert rows["食"][2] == "to eat; to take (medicine)" and rows["食"][4] & 8
    assert rows["我"][2] == "I" and not rows["我"][4] & 8
    with pytest.raises(ValueError):  # a table checked for another reading never ships
        ex.build_phase2(b, whk, chars, notice=NOTICE, meanings={"items": {"食": {"jp": "sik1", "en": "x", "src": "x"}}})


def test_rows_carry_the_reading_status_code():
    rows = {r[0]: r for r in build()["lexicon"]["words"]}
    assert rows["好"][5] == "a" and all(len(r) == 6 for r in rows.values())
    assert ex.STATUS_CODE == {"agree": "a", "corpus": "c", "attested": "e", "wordshk": "w", "override": "o"}


def test_shipped_rows_have_a_known_status_code():
    rows = _load("lexicon.json")["words"]
    assert all(len(r) == 6 and r[5] in ("a", "c", "e", "w", "o", "") for r in rows)
    assert all(r[5] for r in rows if not r[4] & 4)  # every checked word has a resolved status


def test_every_referenced_example_id_is_in_exactly_one_file():
    out = build()
    where = {}
    for name, items in (("sentences", out["sentences"]["items"]), ("hkcancor", out["hkcancor"]["items"]),
                        ("wordshk", out["wordshk"]["examples"])):
        for i in items:
            where.setdefault(i, []).append(name)
    refs = [i for i in out["course"]["lessonSentence"].values()]
    for g in out["course"]["grammar"].values():
        refs += g["examples"]
    assert refs and all(len(where.get(i, [])) == 1 for i in refs)
    assert out["sentences"]["items"]["tatoeba:1"] == ["我食", "ngo5 sik6", "I eat.", "amy", "bob", 77]
    assert out["hkcancor"]["items"]["hkcancor:f#3"][2] is None
    assert list(out["sentences"]["items"]) == ["tatoeba:1"]
    assert out["course"]["grammar"]["p1"]["group"] == "g"
    assert "pattern" not in out["course"]["grammar"]["p1"]


# ---- the shipped files
def _load(name):
    p = APP / name
    if not p.exists():
        pytest.skip(f"{name} not built")
    return json.loads(p.read_text(encoding="utf8"))


BUDGET = {"lexicon.json": 1_200_000, "course.json": 400_000, "sentences.json": 1_000_000, "wordshk.json": 2_000_000,
          "hkcancor.json": 300_000}


@pytest.mark.parametrize("name", list(BUDGET))
def test_shipped_file_size_and_licence(name):
    d = _load(name)
    assert list(d)[0] == "licence"
    assert (APP / name).stat().st_size <= BUDGET[name]


def test_shipped_references_resolve_once():
    lex, course = _load("lexicon.json"), _load("course.json")
    forms = {r[0] for r in lex["words"]}
    assert all(f in forms for f in course["order"] if not f.startswith("g:"))
    homes = [set(_load("sentences.json")["items"]), set(_load("hkcancor.json")["items"]),
             set(_load("wordshk.json")["examples"])]
    assert not (homes[0] & homes[1] or homes[0] & homes[2] or homes[1] & homes[2])
    allids = homes[0] | homes[1] | homes[2]
    refs = [i for i in course["lessonSentence"].values()]
    for g in course["grammar"].values():
        refs += g["examples"]
    assert all(i in allids for i in refs)
    assert all(i.startswith("tatoeba:") for i in homes[0]) and all(i.startswith("hkcancor:") for i in homes[1])
    assert all(len(v) == 6 and v[3] and v[4] and v[5] for v in _load("sentences.json")["items"].values())
    assert all(isinstance(v, list) for v in lex["chars"].values())


def test_shipped_wordshk_text_is_only_in_wordshk_json():
    """Every lexicon meaning is exactly what lexicon._english computes from CC-Canto / CC-CEDICT, so no words.hk
    text can have been copied in; the other files hold no words.hk gloss or definition either."""
    from jiesuo.yue import lexicon
    w = _load("wordshk.json")
    assert w["notice"] and w["disclaimer"] and w["credits"] and w["link"] == "https://words.hk"
    srcs = lexicon.load_sources()
    checked = json.loads((ROOT / "data" / "yue" / "content" / "meanings.json").read_text(encoding="utf8"))["items"]
    for form, jp, en, _r, flags, _s in _load("lexicon.json")["words"]:
        if flags & 8:  # the hand-checked table, written by Jiesuo
            assert en == checked[form]["en"], form
            assert not any(len(e[1]) > 25 and e[1] in en for e in w["entries"].values()), form
        else:
            assert en == lexicon._meaning(form, jp, srcs), form
    for name in ("course.json", "sentences.json", "hkcancor.json"):
        s = (APP / name).read_text(encoding="utf8")
        assert not any(len(e[2]) > 12 and e[2] in s for e in w["entries"].values()), name  # shorter ones occur by chance
        assert not any(len(e[1]) > 25 and e[1] in s for e in w["entries"].values()), name


def test_keyboards_export_keeps_licence_first_and_every_item_cited():
    d = ex.build_keyboards()
    assert list(d)[0] == "licence"
    assert d["items"] and all(it["url"].startswith("https://") and it["steps"] and it["checked"] for it in d["items"])
    assert any("Weasel" in it["name"] and "rime-cantonese" in it["name"] for it in d["items"])
    with pytest.raises(ValueError):
        ex.build_keyboards({"items": [{"name": "x", "steps": [], "url": "https://x", "checked": "2026-11-17"}]})
