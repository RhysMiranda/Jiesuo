"""Write the app's data. Run: python -m jiesuo.export_app

One JSON file per licence, so the app ships an aggregation of separately licensed
files, not one merged database (see LICENSES.md):
    dict.json       CC BY-SA 4.0   CC-CEDICT pinyin and glosses, wordfreq frequencies
    senses.json     CC BY-SA 4.0   CC-CEDICT further senses, for checking a guess in Read
    parts.json      LGPL-3.0+      Make Me a Hanzi decompositions, hints, definitions
    sentences.json  CC BY 2.0 FR   Tatoeba sentences
    hsk.json        MIT            HSK bands (Pleco's list)
    grammar.json    MIT            this project's patterns
    order.json      computed       positions in the two learning orders
Held-out sentences are left out, so they stay usable for later evaluation.
"""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

from .build_graph import S2HK
from .grammar import PATTERNS
from .order import OUT, ROOT, Data, word_unit
from . import sources as src
from . import tatoeba_credits
from .glosses import MAIN, match_senses, ranked_senses, reading_weights, short_gloss, tone_marks

APP = ROOT / "app" / "data"
PER_UNIT = 2  # example sentences kept per item
PER_PATTERN = 3


def main():
    data = Data()
    cedict, _ = src.load_cedict()
    mmh = src.load_mmh()
    nodes, edges = data.nodes, data.edges
    orders = {name: json.loads((OUT / f"{name}_order.json").read_text(encoding="utf8")) for name in ("unlock", "hsk_focus")}
    units = [u for u in orders["unlock"] if not u.startswith("g:")]
    index = {u: i for i, u in enumerate(units)}
    patterns = {f"g:{p.key}": len(units) + i for i, p in enumerate(PATTERNS)}
    total = {**index, **patterns}

    trad = defaultdict(list)
    for a, b, kind, _ in edges:
        if kind == "simp_trad":
            trad[a].append(b[2:])

    items = []
    for u in units:
        n = nodes[u]
        form = n["form"]
        forms = trad.get(u, [])
        hk = S2HK.convert(form)  # what Traditional mode shows: 后 -> 後, but 才 stays 才
        entries = cedict.get(form, [])
        pinyin = tone_marks(", ".join(dict.fromkeys(e["pinyin"].lower() for e in entries if not e["pinyin"][:1].isupper()))
                            or ", ".join(dict.fromkeys(e["pinyin"].lower() for e in entries)))
        kind = "w" if u.startswith("w:") else ("c" if n["type"] == "character" else "p")
        items.append([kind, form, pinyin, entries,
                      round(data.value.get(u, 0.0) * 1e6, 1), sorted(set(forms) - {form, hk}), hk if hk != form else ""])
    # Meanings last, so a character's everyday reading can be ranked by the words that use it.
    weights = reading_weights([[it[0], it[1], it[2], "", it[4]] for it in items])
    extra = []
    for it in items:
        senses = (ranked_senses(it[3], weights.get(it[1]), MAIN.get(it[1])) if it[0] != "w" else ranked_senses(it[3])) if it[3] else []
        it[3] = short_gloss(senses)
        extra.append(match_senses(senses) if it[0] != "p" else "")

    parts = {}
    for u, n in nodes.items():
        if not u.startswith("h:") or n["form"] not in mmh:
            continue
        e = mmh[n["form"]]
        ety = e.get("etymology") or {}
        hint = unicodedata.normalize("NFKC", ety.get("hint") or "") if ety else ""
        parts[n["form"]] = {"h": hint, "e": (ety.get("type") or "")[:1], "d": (e.get("definition") or "")[:80],
                            "y": ", ".join(e.get("pinyin") or []), "p": []}
    for a, b, kind, role in edges:
        if kind == "component" and b[2:] in parts:
            parts[b[2:]]["p"].append([a[2:], role])
    for rec in parts.values():
        rec["p"].sort()
        for k in ("h", "e", "d", "y", "p"):
            if not rec[k]:
                del rec[k]

    # Example sentences: for each item, the ones readable soonest, then shortest.
    pos = {u: i for i, u in enumerate(units)}
    words_of = defaultdict(list)
    for a, b, kind, _ in edges:
        if kind in ("word_sentence", "char_sentence"):
            words_of[b].append(word_unit(a[2:]))
    hardness = {s: max(pos.get(w, 10**6) for w in ws) for s, ws in words_of.items()}
    sentences = {u: n for u, n in nodes.items() if n["type"] == "sentence" and 4 <= len(src.HAN_CHAR.findall(n["text"])) <= 24}
    rank = sorted(sentences, key=lambda s: (hardness.get(s, 10**6), len(sentences[s]["text"]), s))
    chosen, count = defaultdict(list), defaultdict(int)
    for s in rank:
        for w in words_of[s]:
            if count[w] < PER_UNIT:
                count[w] += 1
                chosen[s].append(total[w])
        for c in set(sentences[s]["text"]):
            u = f"h:{c}"
            if u in index and count[u] < PER_UNIT:
                count[u] += 1
                if index[u] not in chosen[s]:
                    chosen[s].append(index[u])
    for a, b, kind, _ in edges:
        if kind == "pattern_sentence" and b in sentences:
            count[("candidates", a)] = count.get(("candidates", a), [])
            count[("candidates", a)].append(b)
    pattern_count = defaultdict(int)
    for a, b, kind, _ in edges:
        if kind == "pattern_sentence":
            pattern_count[a] += 1
    for p in patterns:
        for s in sorted(count.get(("candidates", p), []), key=lambda s: (hardness.get(s, 10**6), len(sentences[s]["text"])))[:PER_PATTERN]:
            chosen[s].append(patterns[p])

    rows = []
    for s, ill in sorted(chosen.items(), key=lambda kv: int(kv[0][2:])):
        n = sentences[s]
        t = n["original"] if n["script"] == "T" else S2HK.convert(n["text"])
        rows.append([s[2:], n["text"], t if t != n["text"] else 0, n["en"], ill])
    rows, credit_stats = tatoeba_credits.credit(rows, *tatoeba_credits.load())
    print(dict(credit_stats))

    grammar = []
    for p in PATTERNS:
        literal = "" if p.detect.startswith("re:") or "/" in p.detect else p.detect
        grammar.append([p.key, p.level, p.pattern, p.explanation, [index[word_unit(w)] for w in p.requires], literal, pattern_count[f"g:{p.key}"]])

    hsk = [0] * len(units)
    for u in units:
        n = nodes[u]
        form = n["form"]
        band = (data.words.get(form) or {}).get("hsk") or n.get("hsk") or 0
        hsk[index[u]] = band

    APP.mkdir(parents=True, exist_ok=True)
    dump = lambda name, obj: (APP / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    dump("dict.json", {"licence": "CC BY-SA 4.0: CC-CEDICT, wordfreq", "items": items, "main": MAIN})
    dump("senses.json", {"licence": "CC BY-SA 4.0: CC-CEDICT. Further senses per dict.json item, for checking a guess", "senses": extra})
    dump("parts.json", {"licence": "LGPL-3.0-or-later: Make Me a Hanzi", "parts": parts})
    dump("sentences.json", {"licence": "CC BY 2.0 FR: Tatoeba. Row: id, simplified, traditional, English, items, author, English id, English author", "sentences": rows})
    dump("hsk.json", {"licence": "MIT: Pleco Inc., elkmovie/hsk30", "bands": hsk})
    dump("grammar.json", {"licence": "MIT: Jiesuo", "patterns": grammar})
    dump("order.json", {"unlock": [total[u] for u in orders["unlock"]], "hsk": [total[u] for u in orders["hsk_focus"]]})
    sizes = {f.name: f.stat().st_size for f in APP.glob("*.json")}
    print(sizes, round(sum(sizes.values()) / 1e6, 2), "MB", len(units), "units", len(rows), "sentences",
          sum(1 for g in grammar if g[5]), "literal patterns")


if __name__ == "__main__":
    main()
