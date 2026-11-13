"""Word pictures (run python -m jiesuo.export_pictures first)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PICS = json.loads((ROOT / "app/data/pictures.json").read_text(encoding="utf8"))["pictures"]
ITEMS = json.loads((ROOT / "app/data/dict.json").read_text(encoding="utf8"))["items"]


def test_every_picture_has_a_word_and_a_file():
    keys = {("w:" if x[0] == "w" else "h:") + x[1] for x in ITEMS}
    assert {k for k in PICS if not k.startswith("m:")} <= keys
    for code in set(PICS.values()):
        assert (ROOT / "app/pictures" / f"{code}.svg").exists(), code


def test_concrete_words_get_the_right_picture():
    assert PICS["h:马"] == "1F40E"
    assert PICS["w:学校"] == "1F3EB"
    assert PICS["w:苹果"] == "1F34E"
    assert "w:熊猫" in PICS


def test_wrong_senses_are_left_out():
    for key in ["h:飞", "h:负", "w:训练", "w:解雇", "w:土耳其", "w:鼠标", "h:瀑", "w:主播", "h:站"]:
        assert key not in PICS, key


def test_enough_words_to_matter():
    assert len(PICS) >= 350


def test_meaning_parts_have_pictures_and_appear_in_characters():
    parts = json.loads((ROOT / "app/data/parts.json").read_text(encoding="utf8"))["parts"]
    used = {part for rec in parts.values() for part, role in rec.get("p", []) if role == "semantic"}
    assert PICS["m:氵"] == PICS["m:水"] == "1F4A7"
    assert PICS["m:扌"] == "270B"
    missing = [k[2:] for k in PICS if k.startswith("m:") and k[2:] not in used]
    assert not missing, missing
