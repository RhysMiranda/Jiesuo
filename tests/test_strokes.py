"""Stroke files for the Write panel (run python -m jiesuo.export_strokes first)."""
import json
from pathlib import Path

from jiesuo.export_strokes import OUT, PARTS, path_for, top_level_parts

ROOT = Path(__file__).resolve().parent.parent


def load(ch):
    return json.loads(path_for(ch).read_text(encoding="utf8"))


def test_top_level_parts_of_ids():
    assert top_level_parts("⿰女子") == ["女", "子"]
    assert top_level_parts("⿱⿰木木心") == ["⿰木木", "心"]
    assert top_level_parts("⿲彳亍？") == ["彳", "亍", "？"]
    assert top_level_parts("？") == []


def test_parts_cover_strokes():
    parts = json.loads(PARTS.read_text(encoding="utf8"))["parts"]
    assert parts["好"] == [["女", [0, 1, 2]], ["子", [3, 4, 5]]]
    assert "一" not in parts
    for f in OUT.glob("*.json"):
        d = json.loads(f.read_text(encoding="utf8"))
        assert set(d) == {"strokes", "medians"}, f.name
        assert len(d["strokes"]) == len(d["medians"]) > 0, f.name
    for ch, groups in parts.items():
        n = len(load(ch)["strokes"])
        seen = [s for _, idx in groups for s in idx]
        assert len(seen) == len(set(seen)) and all(0 <= s < n for s in seen), ch


def test_every_app_glyph_has_strokes_except_known_gaps():
    items = json.loads((ROOT / "app/data/dict.json").read_text(encoding="utf8"))["items"]
    missing = [x[1] for x in items if x[0] in "cp" and not path_for(x[1]).exists()]
    assert missing == ["祂"]
