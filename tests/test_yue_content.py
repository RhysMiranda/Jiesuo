"""Stage 0 content (spec section 3) and the verified app data written from it."""
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if not (ROOT / "data" / "raw" / "yue").exists():
    pytest.skip("data/raw/yue absent", allow_module_level=True)

from jiesuo.yue import jyutping
from jiesuo.yue.readings import load_sources, resolve_char

APP = ROOT / "app" / "yue" / "data"
FONT = ROOT / "data" / "raw" / "yue" / "NotoSerifHK.ttf"
ORDER = ["tones-six", "tones-hear", "checked", "initials", "finals", "jyutping", "say"]
DRILLS = {"tone-id", "same-diff", "syl-id", "dictation", "read", "say"}
HAN = re.compile(r"[㐀-鿿\U00020000-\U0003ffff]")


def _json(name):
    return json.loads((APP / name).read_text(encoding="utf8"))


STAGE0 = _json("stage0.json") if (APP / "stage0.json").exists() else {"units": [], "sources": {}}
READINGS = _json("readings.json") if (APP / "readings.json").exists() else {"chars": {}}
UNITS = {u["id"]: u for u in STAGE0["units"]}
CLIPS = _json("audio.json")["clips"]
SRCS = load_sources()


def _text(unit):
    return " ".join(t["text"] for t in unit["teach"])


def _all_syllables(unit):
    return [*unit["syllables"], *(s for ms in unit["minimalSets"] for s in ms), *(s for _, s in unit["anchors"])]


def test_files_and_licences():
    assert STAGE0.get("licence") == "MIT: Jiesuo"
    assert READINGS.get("licence") == ("CC BY-SA 4.0: readings from rime-cantonese (CC BY 4.0), checked against "
                                       "CC-Canto (CC BY-SA 3.0), Unihan, HKCanCor (CC BY 4.0)")


def test_units_are_in_spec_order():
    assert [u["id"] for u in STAGE0["units"]] == ORDER


def test_unit_shape():
    for u in STAGE0["units"]:
        assert set(u) == {"id", "title", "teach", "anchors", "tones", "drills", "syllables", "minimalSets"}, u["id"]
        assert u["title"] and u["teach"] and u["drills"], u["id"]
        assert set(u["drills"]) <= DRILLS, u["id"]
        assert set(u["tones"]) <= {1, 2, 3, 4, 5, 6}, u["id"]
        assert len(u["syllables"]) == len(set(u["syllables"])), u["id"]
        for ms in u["minimalSets"]:
            assert len(ms) >= 2 and set(ms) <= set(u["syllables"]), (u["id"], ms)


def test_every_teach_line_cites_a_known_source():
    assert set(STAGE0["sources"]) == {"matthews-yip-2011", "lshk-1997", "bauer-benedict-1997"}
    assert "Comprehensive Grammar" in STAGE0["sources"]["matthews-yip-2011"]
    assert "Jyutping" in STAGE0["sources"]["lshk-1997"]
    assert "Modern Cantonese Phonology" in STAGE0["sources"]["bauer-benedict-1997"]
    for u in STAGE0["units"]:
        for line in u["teach"]:
            assert set(line) == {"text", "source"}, (u["id"], line)
            assert line["text"].strip(), u["id"]
            assert line["source"] in STAGE0["sources"], (u["id"], line)


def test_tone_facts_present():
    six = _text(UNITS["tones-six"])
    for chao in ("55 (53)", "35", "33", "21 (11)", "23", "22"):
        assert chao in six, chao
    assert "tone 1 is the highest tone" in six and "older" in six
    hear = _text(UNITS["tones-hear"])
    assert "tone 4 is the lowest tone" in hear and "Tone 5 starts where tone 6 sits" in hear
    checked = _text(UNITS["checked"])
    assert "1, 3 and 6" in checked and "short" in checked and "basic form" in checked
    assert "tone 7 matches tone 1, tone 8 matches tone 3, and tone 9 matches tone 6" in checked
    assert "愛 oi3" in _text(UNITS["initials"])
    assert "u\" of English \"cut\"" in _text(UNITS["finals"])
    assert "differs as well as the length" in _text(UNITS["finals"]) and "main cue" not in _text(UNITS["finals"])
    assert "The initial is optional" in _text(UNITS["jyutping"])
    assert 'Jyutping b sounds like an unaspirated English "p"' in _text(UNITS["initials"])
    finals = _text(UNITS["finals"])
    assert "unreleased" in finals and "-p, -t and -k" in finals


def test_every_syllable_has_two_voices_of_audio():
    for u in STAGE0["units"]:
        for syl in _all_syllables(u):
            jyutping.parse(syl)
            assert len(CLIPS.get(syl, [])) >= 2, (u["id"], syl)
            assert jyutping.parse(syl)[2] in u["tones"], (u["id"], syl)


def test_every_anchor_matches_its_resolved_reading():
    for u in STAGE0["units"]:
        for ch, syl in u["anchors"]:
            r = resolve_char(ch, SRCS)
            if r.main == syl:
                continue
            assert syl in r.others, (u["id"], ch, syl, r)
            assert syl in READINGS["chars"][ch], (u["id"], ch, syl)  # the app must know the taught reading
            # a non-main reading is taught only with a note naming both character and reading
            assert any(ch in t["text"] and syl in t["text"] and r.main in t["text"] for t in u["teach"]), (ch, syl)


def test_no_unresolved_reading_is_taught():
    used = set(HAN.findall(json.dumps(STAGE0["units"], ensure_ascii=False)))  # citations are not taught
    assert used, "stage0.json has no characters"
    assert set(READINGS["chars"]) == used
    for ch in used:
        r = resolve_char(ch, SRCS)
        assert r.status != "unresolved", (ch, r)
        # main, then only the other readings at least two sources list
        assert READINGS["chars"][ch] == [r.main, *(o for o in r.others if len(r.evidence[o]) >= 2)], ch
    assert READINGS["chars"]["份"] == ["fan6", "fan2"]  # rime 0% ban1 dropped
    assert READINGS["chars"]["錫"] == ["sek3", "sik3"]  # sek6 (rime only) and sik1 (CC-Canto only) dropped


def test_every_character_renders_in_the_font():
    from fontTools.ttLib import TTFont
    cmap = TTFont(FONT).getBestCmap()
    text = json.dumps(STAGE0, ensure_ascii=False) + json.dumps(READINGS, ensure_ascii=False)
    missing = sorted({ch for ch in HAN.findall(text) if ord(ch) not in cmap})
    assert not missing, missing


def test_teaching_anchors_follow_the_spec():
    assert UNITS["tones-six"]["anchors"] == [list(p) for p in zip(
        "詩史試時市事分粉訓墳奮份",
        ["si1", "si2", "si3", "si4", "si5", "si6", "fan1", "fan2", "fan3", "fan4", "fan5", "fan6"])]
    assert UNITS["checked"]["anchors"] == [["色", "sik1"], ["錫", "sek3"], ["食", "sik6"]]
    calib = "衣 ji1, 椅 ji2, 意 ji3, 兒 ji4, 耳 ji5, 二 ji6"  # voice calibration anchors (ruling R10)
    assert calib in _text(UNITS["tones-six"])
    for ch, syl in zip("衣椅意兒耳二", ["ji1", "ji2", "ji3", "ji4", "ji5", "ji6"]):
        assert READINGS["chars"][ch][0] == syl
    assert ["三", "saam1"] in UNITS["finals"]["anchors"] and ["心", "sam1"] in UNITS["finals"]["anchors"]


def test_generated_tone_sets():
    six = UNITS["tones-six"]
    assert ["si1", "si2", "si3", "si4", "si5", "si6"] in six["minimalSets"]
    assert "say" in six["drills"]  # calibration happens at the first say step, in this unit
    hear = UNITS["tones-hear"]
    for ms in hear["minimalSets"]:
        assert [jyutping.parse(s)[2] for s in ms] == [1, 2, 3, 4, 5, 6], ms
        assert len({jyutping.toneless(s) for s in ms}) == 1, ms
    bases = {jyutping.toneless(ms[0]) for ms in hear["minimalSets"]}
    assert {"si", "fan", "jau", "se"} <= bases
    checked = UNITS["checked"]
    assert checked["tones"] == [1, 3, 6]
    assert checked["minimalSets"][0] == ["sik1", "sik3", "sik6"]  # tone-only set first
    assert ["sik1", "sek3", "sik6"] not in checked["minimalSets"]  # differs in vowel too
    assert all(jyutping.is_checked(s) for s in checked["syllables"])
    assert len(checked["minimalSets"]) > 1


def test_generated_initial_and_final_sets():
    sets = [tuple(ms) for ms in UNITS["initials"]["minimalSets"]]
    for pair in [("baa1", "paa1"), ("daa1", "taa1"), ("gaa1", "kaa1"), ("gwaa1", "kwaa1"), ("zaa1", "caa1")]:
        assert pair in sets, pair
    assert any(a.startswith("ng") and b == a[2:] for a, b in sets)
    for ms in sets:  # each set differs only in its initial
        assert len({jyutping.parse(s)[1:] for s in ms}) == 1, ms
    finals = [tuple(ms) for ms in UNITS["finals"]["minimalSets"]]
    assert ("saam1", "sam1") in finals
    assert ("sam1", "san1", "sang1") in finals
    assert ("sap1", "sat1", "sak1") in finals
    assert ("si1", "syu1") in finals
    assert any(jyutping.parse(a)[1] == "e" and jyutping.parse(b)[1] == "oe" for a, b, *_ in finals)
    assert any(jyutping.parse(a)[1] == "ei" and jyutping.parse(b)[1] == "eoi" for a, b, *_ in finals)
    for ms in finals:  # each set keeps initial and tone
        assert len({(jyutping.parse(s)[0], jyutping.parse(s)[2]) for s in ms}) == 1, ms


def test_say_unit_has_syllables_and_pairs():
    say = UNITS["say"]
    assert say["drills"] == ["say"]
    assert say["syllables"] and say["minimalSets"]
    assert all(len(p) == 2 for p in say["minimalSets"])
    jy = UNITS["jyutping"]
    assert {"read", "dictation"} <= set(jy["drills"]) and jy["syllables"]


def test_export_is_current():
    from jiesuo.yue import export_app
    stage0, readings = export_app.build(SRCS)
    assert stage0 == STAGE0
    assert readings == READINGS


def test_build_uses_given_inputs_even_when_empty():
    from jiesuo.yue import export_app
    with pytest.raises(KeyError):
        export_app.build(SRCS, content={})


def test_anchor_must_be_a_shipped_reading():
    import copy
    from jiesuo.yue import export_app
    content = copy.deepcopy(json.loads(export_app.CONTENT.read_text(encoding="utf8")))
    unit = next(u for u in content["units"] if u["id"] == "checked")
    unit["anchors"].append(["錫", "sek6"])  # rime only, so not shipped in readings.json
    with pytest.raises(ValueError, match="not a shipped reading"):
        export_app.build(SRCS, content=content)


# ---- phase 2, Task 3: Stage 1, grammar and attested examples (real data) ----

from jiesuo.yue import course as _course  # noqa: E402
from jiesuo.yue import lexicon as _lexicon  # noqa: E402

STAGE1_FORMS = (
    "你好 早晨 喂 拜拜 再見 唔該 多謝 唔該晒 唔使 對唔住 唔好意思 係 唔 唔係 有 冇 好 我 你 佢 我哋 你哋 佢哋 "
    "零 一 二 三 四 五 六 七 八 九 十 百 千 萬 兩 個 呀 啦").split()


@pytest.fixture(scope="module")
def built():
    srcs = _lexicon.load_sources()
    return srcs, _course.build(srcs)


def _stage1():
    return json.loads((ROOT / "data" / "yue" / "content" / "stage1.json").read_text(encoding="utf8"))


def _grammar():
    return json.loads((ROOT / "data" / "yue" / "content" / "grammar.json").read_text(encoding="utf8"))


def test_stage1_has_five_lessons_in_the_planned_order():
    s = _stage1()
    assert [les["id"] for les in s["lessons"]] == ["hello", "thanks", "is-has", "people", "numbers"]
    assert [it["form"] for les in s["lessons"] for it in les["items"]] == STAGE1_FORMS
    for les in s["lessons"]:
        for it in les["items"]:
            assert set(it) <= {"form", "jp", "en", "note", "group", "changed"}, it
            assert it["jp"] and it["en"], it
    tail = s["lessons"][4]["items"][-2:]
    assert [it["form"] for it in tail] == ["呀", "啦"] and all(it.get("group") for it in tail)


def test_stage1_readings_equal_the_lexicon(built):
    _srcs, b = built
    for les in _stage1()["lessons"]:
        for it in les["items"]:
            w = b["lex"][it["form"]]
            assert w.status != "unresolved", it["form"]
            if not it.get("changed"):  # a recorded changed tone is the one exception
                assert it["jp"] == w.jp, (it["form"], it["jp"], w.jp)


def test_order_starts_with_stage1(built):
    _srcs, b = built
    assert b["order"][:len(STAGE1_FORMS)] == STAGE1_FORMS
    # 5000 greedy items, less the forms the meaning table leaves out (data/yue/content/meanings.json "skip")
    assert len(b["order"]) == len(set(b["order"])) and len(b["order"]) + len(b["skipped"]) == 5000
    assert not set(b["skipped"]) & set(b["order"]) and not set(b["skipped"]) & set(STAGE1_FORMS)


def test_overrides_for_the_three_character_readings_name_a_reviewed_entry(built):
    srcs, b = built
    rows = [ln.split("\t") for ln in (ROOT / "data" / "yue" / "overrides.tsv").read_text(encoding="utf8").splitlines()[1:]]
    by = {r[0]: r for r in rows}
    for ch, reading in (("撈", "lou1"), ("褪", "tan3"), ("當", "dong1")):
        assert by[ch][1] == reading and b["lex"][ch].jp == reading and b["lex"][ch].status == "override"
        ids = [int(x) for x in re.findall(r"wordshk:(\d+)", by[ch][3])]
        assert ids and all(any(e.id == i and e.reviewed and (ch, reading) in e.forms for e in srcs["wordshk"]) for i in ids)


def test_every_grammar_cite_is_a_reviewed_words_hk_entry(built):
    srcs, _b = built
    points = _grammar()["points"]
    assert len(points) == 28 and not {"aa1", "maa3"} & {p["id"] for p in points}
    assert len({p["id"] for p in points}) == 28
    for p in points:
        form, jp = _course.parse_cite(p["cite"])
        hits = _course.cited_entries(p["cite"], srcs["wordshk"])
        assert hits, p["cite"]
        assert all(e.reviewed for e in hits)
        assert set(p["entries"]) <= {e.id for e in hits}, p["id"]
        assert p["title"] and p["explain"] and p["needs"], p["id"]


def test_every_grammar_pattern_compiles_and_needs_are_words(built):
    _srcs, b = built
    for p in _grammar()["points"]:
        re.compile(p["pattern"])
        for n in p["needs"]:
            assert n in b["lex"], (p["id"], n)


def test_every_grammar_pattern_is_clean_and_matches_its_own_illustration():
    """I2: a pattern compiles, has no control character (anota once held a literal U+0001 for \\1), and finds at least
    one of the Cantonese phrases its own `explain` gives as an illustration."""
    for p in _grammar()["points"]:
        pat = p["pattern"]
        assert not re.search(r"[\x00-\x1f\x7f]", pat), p["id"]
        rx = re.compile(pat)
        runs = re.findall(r"[\u3400-\u9fff]+", p["explain"])
        if runs:
            assert any(rx.search(r) for r in runs), (p["id"], pat, runs)
    anota = next(p for p in _grammar()["points"] if p["id"] == "anota")
    assert anota["pattern"] == "([^唔\\s])唔\\1|有冇"
    assert re.search(anota["pattern"], "去唔去") and not re.search(anota["pattern"], "去唔食")


def test_formal_only_items_are_not_in_the_order_but_colloquial_words_with_them_are(built):
    _srcs, b = built
    assert not set(b["order"]) & _course.FORMAL_ONLY_ITEMS
    assert "不過" in b["order"]  # 現在 is rarer in speech (而家) than the first 5000


def test_shipped_lesson_sentences_say_their_item_as_that_word(built):
    """I1: the item is read with its own reading, every word of the sentence is read as itself, and HKCanCor's own
    word boundaries have the item as a token."""
    _srcs, b = built
    pool = {e["id"]: e for e in b["pool"]}
    bad = [(f, i) for f, i in b["lesson"].items() if not f.startswith("g:")
           and not (_course.reads_as(pool[i], f, b["lex"]) and _course.read_right(pool[i], b["lex"]))]
    assert not bad, bad[:10]
    for f, i in b["lesson"].items():
        if f in ("你呢", "地下", "造"):
            assert pool[i]["text"].find(f) != -1


def test_single_characters_in_the_order_are_free_words_or_named_by_the_content(built):
    srcs, b = built
    free = _course.free_chars(srcs["train"]) | _course.wordshk_free_chars(srcs["wordshk"], b["lex"])
    named = {it for it in STAGE1_FORMS} | {n for p in _grammar()["points"] for n in p["needs"]}
    bad = [f for f in b["order"] if len(f) == 1 and f not in free and f not in named]
    assert not bad, bad[:20]
    assert "嚟" in b["order"] and "囖" not in b["order"] and "嚹" not in b["order"]


def test_placed_grammar_points_have_two_attested_examples(built):
    _srcs, b = built
    placed = [x[2:] for x in b["placed"] if x.startswith("g:")]
    assert len(placed) == len(set(placed)) and placed
    for p in b["points"]:
        n = len(p["_examples"])
        needs_ok = all(w in b["order"] for w in p["needs"])
        assert (p["id"] in placed) == (n >= 2 and needs_ok), (p["id"], n, needs_ok)
    gs = [i for i, x in enumerate(b["placed"]) if x.startswith("g:")]
    assert all(b - a > 10 for a, b in zip(gs, gs[1:]))


def test_every_shipped_example_has_a_source_and_no_formal_hits(built):
    _srcs, b = built
    forms = set(b["lex"])
    for p in b["points"]:
        for ex in p["_examples"]:
            assert ex["source"] or ex.get("unchecked"), ex["id"]
            assert re.match(r"(tatoeba:\d+|wordshk:\d+#\d+|hkcancor:[\w\-]+#\d+)$", ex["source"]), ex["source"]
            assert not _course.formal_hits(ex["text"], forms), ex["id"]
            assert _course.han_len(ex["text"]) <= 14 and ex["jp"] and ex["words"]
            assert len(ex["jp"].split()) == _course.han_len(ex["text"]), ex["id"]
            if ex["id"].startswith("hkcancor"):
                assert ex["en"] is None
            else:
                assert ex["en"], ex["id"]
            if ex["id"].startswith("tatoeba"):
                assert ex["author"], ex["id"]


def test_every_example_syllable_is_valid_jyutping(built):
    _srcs, b = built
    for ex in b["pool"]:
        for s in ex["jp"].split():
            jyutping.parse(s)


def test_lesson_sentences_teach_their_item(built):
    _srcs, b = built
    pos = _course.known_at({f: i for i, f in enumerate(b["placed"])}, b["skipped"])
    pool = {e["id"]: e for e in b["pool"]}
    pts = {f"g:{p['id']}": {e["id"] for e in p["_examples"]} for p in b["points"]}
    assert not set(b["lesson"]) & set(b["skipped"])
    got = 0
    for item, sid in b["lesson"].items():
        got += 1
        ex = pool[sid]
        assert ex["en"] and _course.han_len(ex["text"]) >= 4, (item, sid)
        assert max(pos[w] for w in ex["words"]) <= pos[item], (item, sid)
        if item.startswith("g:"):
            assert sid in pts[item], (item, sid)
        else:
            assert item in ex["words"], (item, sid)
    assert got > 500
    assert b["lesson"].get("再見") is None or "再見" in pool[b["lesson"]["再見"]]["words"]


def test_course_content_renders_in_the_font(built):
    from fontTools.ttLib import TTFont
    _srcs, b = built
    cmap = TTFont(FONT).getBestCmap()
    text = json.dumps(_stage1(), ensure_ascii=False) + json.dumps(_grammar(), ensure_ascii=False)
    text += "".join(ex["text"] for p in b["points"] for ex in p["_examples"])
    missing = sorted({ch for ch in HAN.findall(text) if ord(ch) not in cmap})
    assert not missing, missing


def test_placed_examples_carry_the_cited_reading_on_the_key_character(built):
    _srcs, b = built
    placed = {x[2:] for x in b["placed"] if x.startswith("g:")}
    spelling = {"吓": "吓下", "畀": "畀俾"}  # words.hk writes these as 下 and 俾
    checked = 0
    for p in b["points"]:
        if p["id"] not in placed:
            continue
        form, jp = _course.parse_cite(p["cite"])
        want = jp.split()
        for ex in p["_examples"]:
            han = "".join(c for c in ex["text"] if _lexicon.is_han(c))
            syl = ex["jp"].split()
            ks = [k for k in range(len(han)) if any(han.startswith(f, k) for f in [form] + [
                form.replace(form[0], v) for v in spelling.get(form[0], "") if len(form) == 1])]
            assert any(syl[k:k + len(want)] == want for k in ks), (p["id"], ex["id"], ex["text"], ex["jp"])
            checked += 1
    assert checked > 50


def test_no_tatoeba_example_rests_on_an_unsafe_token(built):
    srcs, b = built
    from collections import Counter
    train = Counter(w for sent in srcs["train"] for w, _p, _j in sent)
    lex = b["lex"]
    seen = 0
    for ex in b["pool"]:
        if not ex["id"].startswith("tatoeba"):
            continue
        seen += 1
        for t in ex["words"]:
            assert not (len(t) == 1 and lex[t].alt), (ex["id"], t)
            assert not (len(t) > 1 and train[t] < 3), (ex["id"], t)
    assert seen > 50


def test_particle_point_examples_end_a_clause_on_the_key_character(built):
    _srcs, b = built
    n = 0
    for p in b["points"]:
        if p["id"] in _course.PARTICLE_POINTS:
            key = _course.parse_cite(p["cite"])[0]
            for ex in p["_examples"]:
                assert _course.clause_final(ex["text"], key), (p["id"], ex["id"], ex["text"])
                n += 1
    assert n > 20


def test_known_bad_examples_are_not_shipped(built):
    _srcs, b = built
    bad = {"tatoeba:13107947", "tatoeba:5761094", "tatoeba:5735143", "tatoeba:12077986", "tatoeba:12099574",
           "hkcancor:FC-026_v2#379", "hkcancor:FC-R002a_v2#24"}
    shipped = {ex["id"] for p in b["points"] for ex in p["_examples"]}
    assert not bad & shipped
    assert not {i for i in bad if i.startswith("tatoeba")} & {ex["id"] for ex in b["pool"]}
    assert all(_course.han_len(ex["text"]) >= 5 for p in b["points"] for ex in p["_examples"] if ex["id"].startswith("hkcancor"))


def test_free_words_from_wordshk_come_back_and_bound_characters_stay_out(built):
    _srcs, b = built
    order = set(b["order"])
    assert {"雨", "風", "天", "山"} <= order  # words.hk entries of their own, though HKCanCor rarely has them alone
    assert "火" not in order  # its words.hk entries (71286) are reviewed but not published: the rule needs both
    assert not {"其", "之", "而", "己", "俾", "揾"} & order  # bound or written-only; spellings the course does not use
