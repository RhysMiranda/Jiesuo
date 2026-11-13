"""Pictures for concrete words. Run: python -m jiesuo.export_pictures

A word or character gets a picture when its first English meaning is exactly the name of an emoji
(Unicode CLDR names, from emojibase-data), minus the hand-checked wrong senses in
data/pictures/exclude.txt (飞 "to fly" is not the insect), plus the everyday words in
data/pictures/add.tsv that the name match misses. Pictures are OpenMoji 17.0.0 SVGs
(CC BY-SA 4.0), downloaded once into data/raw/openmoji/ and copied to app/pictures/.

Writes app/data/pictures.json: {"licence": ..., "pictures": {"w:学校": "1F3EB", "h:马": "1F40E"}}.
Only emoji groups that show things are used: people, animals and nature, food, places,
activities, objects, and faces. Flags and symbols are left out.
"""
import json
import re
import shutil
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
    known_forms = {x[1] for x in items}
    missing = [f for f in add if f not in known_forms]
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
        shutil.copyfile(src, OUT / src.name)
        pictures[key] = src.stem
    INDEX.write_text(json.dumps({"licence": "Word-to-picture list: MIT, Jiesuo. Pictures in pictures/: OpenMoji 17.0.0, CC BY-SA 4.0",
                                 "pictures": pictures}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    size = sum(f.stat().st_size for f in OUT.glob("*.svg"))
    print(f"{len(pictures)} words with pictures, {len(list(OUT.glob('*.svg')))} files, {size / 1e6:.2f} MB; no OpenMoji file for {skipped}")


if __name__ == "__main__":
    main()
