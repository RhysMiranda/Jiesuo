"""Meanings for the app, chosen from CC-CEDICT so that a learner sees the everyday sense first.

CC-CEDICT lists readings in alphabetical order and often starts with a cross-reference
("used in 傢伙"), a variant note or an archaic sense, so taking its first senses gives 家
"used in 傢伙…" and 离 "mythical beast". Here:
  - surnames, variant notes, cross-references and pronunciation notes are dropped;
  - archaic, literary, dialect and Taiwan-only senses go last;
  - for a character, the reading its words use most (weighted by word frequency) goes first,
    the same rule the app uses for the main reading, so 着 means "zhe" before "zhāo".

`short_gloss` is the shown meaning (two senses). `match_senses` is the longer list Read uses
to check a guessed translation; it ships in its own file, senses.json, loaded only when needed.

Run `python -m jiesuo.glosses` to refresh app/data/dict.json's meanings and write
app/data/senses.json without rebuilding the graph. Needs data/raw/cedict.json (fetch_data.py).
"""
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app" / "data"

DROP = ("CL:", "variant of", "old variant", "unofficial variant", "archaic variant", "erhua variant",
        "used in ", "surname ", "Taiwan pr.", "also pr.", "see ", "see also", "abbr. for ", "also written ")
LATER = ("(archaic)", "(literary)", "(dialect)", "(old)", "(Tw)", "(classical)", "(slang)", "(onom.)",
         "mythical", "(Buddhism)", "(Cantonese)", "(loanword)", "(math.)", "(chemistry)", "(physics)")
# Characters whose everyday reading is used mostly on its own, so the words containing them point
# the wrong way (首都 and 成都 outweigh 都 dōu "all"). Hand-checked against a learner's dictionary.
MAIN = {"都": "dōu", "长": "cháng", "为": "wèi", "与": "yǔ", "吗": "ma", "吧": "ba", "啊": "a", "呀": "ya",
        "哦": "ò", "嘛": "ma", "啦": "la", "差": "chà", "藏": "cáng"}
MARKS = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}


def clean(sense):
    """Readable English: no pinyin in brackets, Simplified only, no classifier notes or jargon labels."""
    s = re.sub(r"\s*\(?CL:[^)]*\)?", "", sense)
    s = re.sub(r"\[[^\]]*\]", "", s)                      # 家伙[jia1 huo5] -> 家伙
    s = re.sub(r"[^\s|();,\"]+\|([^\s|();,\"]+)", r"\1", s)  # 傢伙|家伙 -> 家伙
    s = re.sub(r"\((bound form|Tw|coll\.)\)\s*", "", s)
    s = re.sub(r"\s*\((?:Taiwan|also|colloquial) pr\.[^)]*\)", "", s)
    shorter = re.sub(r"\s*\([^()]{25,}\)", "", s)                # long asides: "(since the early 20th century…)"
    s = shorter if shorter.strip(" ;,") else s
    return re.sub(r"\s+", " ", s).strip(" ;,")


def syllables(pinyin):
    return [p.strip().lower() for p in re.split(r"[\s,]+", pinyin) if p.strip()]


def tone_syllable(syl):
    m = re.fullmatch(r"([a-zA-Zü:]*?)([1-5])", syl)
    if not m:
        return syl.replace("u:", "ü")
    body, tone = m.group(1).replace("u:", "ü").replace("v", "ü"), int(m.group(2))
    if tone == 5:
        return body
    low = body.lower()
    if "a" in low:
        at = low.index("a")
    elif "e" in low:
        at = low.index("e")
    elif "ou" in low:
        at = low.index("o")
    else:
        spots = [i for i, c in enumerate(low) if c in MARKS]
        if not spots:
            return body
        at = spots[-1]
    return body[:at] + MARKS[low[at]][tone - 1] + body[at + 1:]


def tone_marks(pinyin):
    """'hai2, huan2' -> 'hái, huán'. Text already carrying marks passes through unchanged."""
    return re.sub(r"[a-zA-Zü:]+[1-5]", lambda m: tone_syllable(m.group(0)), pinyin)


def reading_weights(items):
    """{character: {marked syllable: weight}} from the words that contain it, weighted by frequency."""
    w = defaultdict(lambda: defaultdict(float))
    for kind, form, pinyin, _gloss, freq, *_ in items:
        if kind != "w":
            continue
        sy = syllables(pinyin.split(",")[0])
        if len(sy) != len(form):
            continue
        for ch, s in zip(form, sy):
            w[ch][s] += max(freq, 0.01)
    return w


def ranked_senses(entries, weights=None, main=None):
    """Every useful sense, everyday ones first. `weights` ranks a character's readings; `main` wins outright."""
    common = [e for e in entries if not e["pinyin"][:1].isupper()] or entries
    weights = weights or {}

    def rank(e):
        sy = tone_marks(e["pinyin"].lower())
        return -float("inf") if sy == main else -weights.get(sy, 0.0)

    order = sorted(range(len(common)), key=lambda k: (rank(common[k]), k))
    first, later = [], []
    for k in order:
        senses = common[k]["english"]
        aside = bool(senses) and any(tag in senses[0] for tag in LATER)  # "(onom.) dong", then "ding dong"
        for raw in senses:
            if raw.startswith(DROP) or raw.startswith("(same as"):
                continue
            s = clean(raw)
            if not s or s in first or s in later:
                continue
            (later if aside or any(tag in raw for tag in LATER) or len(s) > 70 else first).append(s)
    return first + later


def short_gloss(senses):
    """Up to two senses, cut at a word if long."""
    gloss = "; ".join(senses[:2])
    if len(gloss) > 80:
        gloss = gloss[:80].rsplit(" ", 1)[0].rstrip(";,(") + "…"
    return gloss


def match_senses(senses, limit=24, chars=240):
    """The senses after the shown two, for checking a guess. Short, so the file stays small."""
    out, size = [], 0
    for s in senses[2:limit]:
        s = re.sub(r"\([^)]*\)", "", s).strip()
        if s and size + len(s) <= chars:
            out.append(s)
            size += len(s) + 1
    return ";".join(out)


def main():
    from . import sources as src
    cedict, _ = src.load_cedict()
    path = APP / "dict.json"
    data = json.loads(path.read_text(encoding="utf8"))
    weights = reading_weights(data["items"])
    extra, changed = [], 0
    for it in data["items"]:
        entries = cedict.get(it[1], [])
        senses = ranked_senses(entries, weights.get(it[1]), MAIN.get(it[1])) if entries and it[0] != "w" else ranked_senses(entries) if entries else []
        gloss = short_gloss(senses) if entries else it[3]
        changed += gloss != it[3]
        it[3] = gloss
        extra.append(match_senses(senses) if it[0] != "p" else "")
    dump = lambda name, obj: (APP / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    data["main"] = MAIN
    dump("dict.json", data)
    dump("senses.json", {"licence": "CC BY-SA 4.0: CC-CEDICT. Further senses per dict.json item, for checking a guess", "senses": extra})
    print(changed, "meanings changed;", round((APP / "senses.json").stat().st_size / 1e3), "kB senses.json")


if __name__ == "__main__":
    main()
