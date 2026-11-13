"""Write one stroke file per glyph for the app's Write panel. Run: python -m jiesuo.export_strokes

Input: Make Me a Hanzi graphics.txt (stroke outlines and medians, Arphic Public Licence) and
dictionary.txt (which stroke belongs to which component, LGPL), both from scripts/fetch_data.py.
Outputs, kept apart so each file has one licence:
    app/strokes/<codepoint in hex>.json   Arphic Public Licence, like graphics.txt
        {"strokes": [svg path], "medians": [[[x, y], ...]]}
    app/data/stroke-parts.json            LGPL-3.0-or-later, like dictionary.txt
        {"licence": ..., "parts": {glyph: [[component, [stroke index]], ...]}}
Coordinates are Make Me a Hanzi's: a 1024 box with y pointing up and the baseline at 900.
A component is a single character, or a nested description such as "⿰木木" when the
decomposition nests; strokes that match no component are left out of every part.
Files are loaded one at a time by the app, so they stay out of app/data/.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "app" / "strokes"
PARTS = ROOT / "app" / "data" / "stroke-parts.json"
TERNARY = {"⿲", "⿳"}
IDC = {chr(c) for c in range(0x2FF0, 0x2FFC)}


def path_for(ch):
    return OUT / f"{ord(ch):x}.json"


def _subtree(ids, k):
    """End index of the description starting at k."""
    c = ids[k]
    if c not in IDC:
        return k + 1
    k += 1
    for _ in range(3 if c in TERNARY else 2):
        k = _subtree(ids, k)
    return k


def top_level_parts(ids):
    """The top-level operands of an ideographic description, as strings."""
    if not ids or ids[0] not in IDC:
        return []
    out, k = [], 1
    for _ in range(3 if ids[0] in TERNARY else 2):
        end = _subtree(ids, k)
        out.append(ids[k:end])
        k = end
    return out


def _lines(name):
    with open(RAW / name, encoding="utf8") as f:
        for line in f:
            yield json.loads(line)


def main():
    items = json.loads((ROOT / "app" / "data" / "dict.json").read_text(encoding="utf8"))["items"]
    glyphs = {x[1] for x in items if x[0] in "cp"} | {x[6] for x in items if x[0] == "c" and x[6] and len(x[6]) == 1}
    decomposition = {e["character"]: e for e in _lines("mmh_dictionary.txt") if e["character"] in glyphs}
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    written, stroke_parts = 0, {}
    for g in _lines("mmh_graphics.txt"):
        ch = g["character"]
        if ch not in glyphs:
            continue
        d = decomposition.get(ch, {})
        names = top_level_parts(d.get("decomposition", ""))
        members = [[] for _ in names]
        for s, match in enumerate(d.get("matches") or []):
            if match and match[0] < len(names):
                members[match[0]].append(s)
        parts = [[name, idx] for name, idx in zip(names, members) if idx and name != "？"]
        rec = {"strokes": g["strokes"], "medians": g["medians"]}
        if parts:
            stroke_parts[ch] = parts
        path_for(ch).write_text(json.dumps(rec, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
        written += 1
    PARTS.write_text(json.dumps({"licence": "LGPL-3.0-or-later: Make Me a Hanzi", "parts": stroke_parts},
                                ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    size = sum(f.stat().st_size for f in OUT.glob("*.json"))
    print(f"{written} of {len(glyphs)} glyphs, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
