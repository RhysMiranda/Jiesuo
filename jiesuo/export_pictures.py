"""Pictures for concrete words. Run: python -m jiesuo.export_pictures

A word or character gets a picture when its first English meaning is exactly the name of an emoji
(Unicode CLDR names, from emojibase-data), minus the hand-checked wrong senses in
data/pictures/exclude.txt (飞 "to fly" is not the insect), plus the everyday words in
data/pictures/add.tsv that the name match misses. Pictures are OpenMoji 17.0.0 SVGs
(CC BY-SA 4.0), downloaded once into data/raw/openmoji/ and copied to app/pictures/.

Meaning parts get pictures too, from data/pictures/parts.tsv (氵 water, 扌 hand), keyed "m:氵".

Writes app/data/pictures.json: {"licence": ..., "pictures": {"w:学校": "1F3EB", "h:马": "1F40E", "m:氵": "1F4A7"}}.
Only emoji groups that show things are used: people, animals and nature, food, places,
activities, objects, and faces. Flags and symbols are left out.
"""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
SRC = ROOT / "data" / "pictures"
OUT = ROOT / "app" / "pictures"
INDEX = ROOT / "app" / "data" / "pictures.json"
OPENMOJI = "https://cdn.jsdelivr.net/npm/openmoji@17.0.0/color/svg"
GROUPS = {0, 1, 3, 4, 5, 6, 7}


def first_meaning(gloss):
    s = re.sub(r"\([^)]*\)|\[[^]]*\]", "", gloss.split(";")[0]).strip().lower()
    return re.sub(r"^(to|a|an|the) ", "", s)


def hexcode(emoji):
    return "-".join(f"{ord(c):X}" for c in emoji)


def candidates(code):
    """OpenMoji file names usually drop FE0F; a few ZWJ sequences keep it."""
    plain = "-".join(p for p in code.split("-") if p != "FE0F")
    return list(dict.fromkeys([plain, code]))


def fetch_svg(code):
    cache = RAW / "openmoji"
    cache.mkdir(parents=True, exist_ok=True)
    for name in candidates(code):
        path = cache / f"{name}.svg"
        if path.exists():
            return path
        try:
            with urllib.request.urlopen(f"{OPENMOJI}/{name}.svg", timeout=60) as r:
                path.write_bytes(r.read())
            return path
        except Exception:
            continue
    return None


def minify(svg):
    """Same drawing, fewer bytes: no indentation, comments or the editor's group ids."""
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    svg = re.sub(r'\s(id)="[^"]*"', "", svg)
    svg = re.sub(r">\s+<", "><", svg)
    svg = re.sub(r"\s{2,}", " ", svg)
    # Coordinates to one decimal: on a 72-unit box shown at 64 px or less, that is under 0.05 px.
    svg = re.sub(r'\s(d|points)="([^"]*)"', lambda a: f' {a.group(1)}="{round_path(a.group(2))}"', svg)
    return svg.strip() + "\n"


NUMBER = r"-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"


def round_path(d):
    """Path data with every number to one decimal. SVG lets numbers run together ("5.3.04" is 5.3 and
    .04, "-1-2" is -1 and -2), so the numbers are re-joined with a space wherever they would merge."""
    out, prev = [], None
    for tok in re.findall(rf"[A-Za-z]|{NUMBER}", d):
        if not re.match(NUMBER, tok):
            out.append(tok)
            prev = None
            continue
        v = round(float(tok), 1)
        s = str(int(v)) if v == int(v) else f"{v:.1f}"
        s = s.replace("-0.", "-.") if s.startswith("-0.") else s[1:] if s.startswith("0.") else s
        if s == "-0":
            s = "0"
        if prev is not None and not s.startswith("-") and not (s.startswith(".") and "." in prev):
            out.append(" ")
        out.append(s)
        prev = s
    return "".join(out)


def read_list(path):
    rows = []
    for line in path.read_text(encoding="utf8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            rows.append(line.split("\t"))
    return rows


def main():
    items = json.loads((ROOT / "app" / "data" / "dict.json").read_text(encoding="utf8"))["items"]
    names = {}
    for e in json.loads((RAW / "emojibase_en.json").read_text(encoding="utf8")):
        if e.get("group") in GROUPS:
            names.setdefault(e["label"].lower(), e["emoji"])
    exclude = {row[0] for row in read_list(SRC / "exclude.txt")}
    add = {row[0]: row[1].strip() for row in read_list(SRC / "add.tsv")}
    chosen = {}
    for kind, form, _py, gloss, *_ in items:
        if kind not in "wc" or not gloss or form in exclude:
            continue
        key = ("w:" if kind == "w" else "h:") + form
        if form in add:
            chosen[key] = add[form]
        elif first_meaning(gloss) in names:
            chosen[key] = names[first_meaning(gloss)]
    for form, emoji in ((row[0], row[1].strip()) for row in read_list(SRC / "parts.tsv")):
        chosen["m:" + form] = emoji
    known_forms = {x[1] for x in items}
    missing = [f for f in add if f not in known_forms and f not in exclude]
    if missing:
        print("add.tsv forms not in the dictionary:", missing)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.svg"):
        old.unlink()
    pictures, skipped = {}, []
    for key, emoji in sorted(chosen.items()):
        src = fetch_svg(hexcode(emoji))
        if src is None:
            skipped.append(key)
            continue
        (OUT / src.name).write_text(minify(src.read_text(encoding="utf8")), encoding="utf8")
        pictures[key] = src.stem
    INDEX.write_text(json.dumps({"licence": "Word-to-picture list: MIT, Jiesuo. Pictures in pictures/: OpenMoji 17.0.0, CC BY-SA 4.0",
                                 "pictures": pictures}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    size = sum(f.stat().st_size for f in OUT.glob("*.svg"))
    print(f"{sum(not k.startswith('m:') for k in pictures)} words and {sum(k.startswith('m:') for k in pictures)} meaning parts with pictures, {len(list(OUT.glob('*.svg')))} files, {size / 1e6:.2f} MB; no OpenMoji file for {skipped}")


if __name__ == "__main__":
    main()
