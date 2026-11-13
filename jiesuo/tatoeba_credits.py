"""Name the Tatoeba author of every shipped sentence and its English translation.

CC BY 2.0 FR requires naming each sentence's author. The npm copy we build from has
no usernames, so this reads Tatoeba's own weekly exports (downloaded by
scripts/fetch_data.py into data/raw/tatoeba/) and rewrites app/data/sentences.json.

Rules, applied per row:
- The Chinese sentence must still exist on Tatoeba with the same text and have an
  owner. Otherwise the row is dropped: we cannot name who wrote what we ship.
- The English translation is the linked sentence with the same text if it has an
  owner (or is marked CC0). Failing that, another linked English sentence with an
  owner. Failing that, the row keeps its Chinese sentence and ships no English.

Row layout written to sentences.json:
    [zh_id, simplified, traditional or 0, english or 0, units,
     zh_author, en_id or 0, en_author or 0]
en_author is "" for a CC0 English sentence with no owner.

Run on its own: python -m jiesuo.tatoeba_credits   (also called by export_app)
"""
import bz2
import json
import tarfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "tatoeba"
APP_SENTENCES = ROOT / "app" / "data" / "sentences.json"
NO_OWNER = r"\N"


def _tsv(name):
    with bz2.open(RAW / name, "rt", encoding="utf8", newline="") as f:
        for line in f:
            yield line.rstrip("\n").split("\t")


def load():
    """Return (cmn, links, eng, cc0) from Tatoeba's exports."""
    cmn = {r[0]: (r[2], r[3]) for r in _tsv("cmn_sentences_detailed.tsv.bz2")}
    links = defaultdict(list)
    for a, b in _tsv("cmn-eng_links.tsv.bz2"):
        links[a].append(b)
    wanted = {b for bs in links.values() for b in bs}
    eng = {r[0]: (r[2], r[3]) for r in _tsv("eng_sentences_detailed.tsv.bz2") if r[0] in wanted}
    cc0 = set()
    with tarfile.open(RAW / "sentences_CC0.tar.bz2") as tar:
        for line in tar.extractfile("sentences_CC0.csv"):
            sid = line.split(b"\t", 1)[0].decode()
            if sid in wanted:
                cc0.add(sid)
    return cmn, links, eng, cc0


def credit(rows, cmn, links, eng, cc0):
    """rows: [zh_id, simplified, traditional or 0, english, units]. Returns (rows, stats)."""
    out, stats = [], Counter()
    for sid, simp, trad, english, units, *_ in rows:
        current = cmn.get(sid)
        if current is None:
            stats["dropped: deleted on Tatoeba"] += 1
            continue
        text, zh_author = current
        if text not in (simp, trad):
            stats["dropped: edited on Tatoeba since our copy"] += 1
            continue
        if zh_author == NO_OWNER:
            stats["dropped: Chinese sentence has no owner"] += 1
            continue

        def usable(e):
            return e in eng and (eng[e][1] != NO_OWNER or e in cc0)

        linked = [e for e in links.get(sid, []) if usable(e)]
        same = [e for e in linked if eng[e][0] == english]
        pick = (same or sorted(linked, key=int) or [None])[0]
        if pick is None:
            stats["kept without English (no named translator)"] += 1
            out.append([sid, simp, trad, 0, units, zh_author, 0, 0])
            continue
        en_text, en_author = eng[pick]
        stats["kept" if same else "kept with a different English translation"] += 1
        out.append([sid, simp, trad, en_text, units, zh_author, int(pick), "" if en_author == NO_OWNER else en_author])
    return out, stats


def main():
    doc = json.loads(APP_SENTENCES.read_text(encoding="utf8"))
    rows, stats = credit(doc["sentences"], *load())
    doc = {"licence": "CC BY 2.0 FR: Tatoeba. Row: id, simplified, traditional, English, items, author, English id, English author",
           "sentences": rows}
    APP_SENTENCES.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    for k, v in sorted(stats.items()):
        print(f"{v:>6}  {k}")


if __name__ == "__main__":
    main()
