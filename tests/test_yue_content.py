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
    checked = _text(UNITS["checked"])
    assert "1, 3 and 6" in checked and "short" in checked
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
            # a non-main reading is taught only with a note naming both character and reading
            assert any(ch in t["text"] and syl in t["text"] and r.main in t["text"] for t in u["teach"]), (ch, syl)


def test_no_unresolved_reading_is_taught():
    used = set(HAN.findall(json.dumps(STAGE0, ensure_ascii=False)))
    assert used, "stage0.json has no characters"
    assert set(READINGS["chars"]) == used
    for ch in used:
        r = resolve_char(ch, SRCS)
        assert r.status != "unresolved", (ch, r)
        assert READINGS["chars"][ch] == [r.main, *r.others], ch


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
    assert ["sik1", "sek3", "sik6"] in checked["minimalSets"]
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
