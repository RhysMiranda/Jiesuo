"""A small stroke index for "write to search". Run: python -m jiesuo.export_handwriting

Reads the stroke medians already exported to app/strokes/ (Make Me a Hanzi graphics.txt, Arphic
Public Licence) and keeps, for every character the app teaches, each stroke's start, middle and
end point on a 32-step grid, in writing order. The app compares a drawing with these.

Writes app/data/handwriting.json (Arphic Public Licence, like its source):
    {"licence": ..., "chars": "好学…", "strokes": ["<6 letters per stroke>", ...]}
Each stroke is six base-32 letters: start x, y, middle x, y, end x, y, with y pointing down.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STROKES = ROOT / "app" / "strokes"
OUT = ROOT / "app" / "data" / "handwriting.json"
DIGITS = "0123456789abcdefghijklmnopqrstuv"


def encode(medians):
    """Each median as start, middle and end, on a 32-step grid with y down (Make Me a Hanzi has y up)."""
    out = []
    for m in medians:
        pts = [m[0], m[len(m) // 2], m[-1]]
        for x, y in pts:
            out.append(DIGITS[max(0, min(31, int(x) // 32))])
            out.append(DIGITS[max(0, min(31, (900 - int(y)) // 32))])
    return "".join(out)


def main():
    items = json.loads((ROOT / "app" / "data" / "dict.json").read_text(encoding="utf8"))["items"]
    items = sorted((x for x in items if x[0] == "c"), key=lambda x: -x[4])  # most frequent first
    chars, strokes = [], []
    for x in items:
        path = STROKES / f"{ord(x[1]):x}.json"
        if len(x[1]) != 1 or not path.exists():
            continue
        medians = json.loads(path.read_text(encoding="utf8")).get("medians") or []
        if medians:
            chars.append(x[1])
            strokes.append(encode(medians))
    OUT.write_text(json.dumps({"licence": "Arphic Public Licence: stroke medians from Make Me a Hanzi graphics.txt (see licences/)",
                               "chars": "".join(chars), "strokes": strokes}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(len(chars), "characters,", round(OUT.stat().st_size / 1e3), "kB")


if __name__ == "__main__":
    main()
