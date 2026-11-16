"""Loaders for the raw Cantonese reading sources in data/raw/yue/ (never extracted)."""
import bz2
import csv
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

from . import jyutping

RAW = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "yue"
WORDSHK_DIR = RAW.parent / "wordshk"


def _valid(syl: str) -> bool:
    try:
        jyutping.parse(syl)
        return True
    except ValueError:
        return False


def _one_syllable(text: str):
    """The single valid syllable in text, else None."""
    parts = jyutping.split(text)
    if len(parts) == 1 and _valid(parts[0]):
        return parts[0]
    return None


def load_rime_chars(raw: Path = RAW) -> dict:
    """char -> [(jyutping, weight percent or None)]. None = main reading (rime's convention).

    Multi-syllable readings (unit characters such as 兡) are skipped.
    """
    out: dict = {}
    in_body = False
    with open(raw / "rime_chars.dict.yaml", encoding="utf8") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if not in_body:
                in_body = line == "..."
                continue
            if not line or line.startswith("#"):
                continue
            cols = line.split("\t")
            if len(cols) < 2 or len(cols[0]) != 1:
                continue
            syl = _one_syllable(cols[1])
            if syl is None or len(jyutping.split(cols[1])) != 1:
                continue
            weight = None
            if len(cols) > 2 and cols[2].strip():
                m = re.fullmatch(r"([0-9.]+)%", cols[2].strip())
                if not m:
                    continue
                weight = float(m.group(1))
            entry = (syl, weight)
            lst = out.setdefault(cols[0], [])
            if entry not in lst:
                lst.append(entry)
    return out


_CANTO_LINE = re.compile(r"^(\S+) (\S+) \[[^\]]*\] \{([^}]*)\}")


def load_cccanto_chars(raw: Path = RAW) -> dict:
    """Single-character entries (traditional form) from both CC-Canto files, with Jyutping from {...}."""
    out: dict = {}
    for name in ("cccanto.zip", "cccedict_canto_readings.zip"):
        with zipfile.ZipFile(raw / name) as z:
            for member in z.namelist():
                if member.endswith("/"):
                    continue
                for line in z.read(member).decode("utf8").splitlines():
                    if line.startswith("#"):
                        continue
                    m = _CANTO_LINE.match(line)
                    if not m or len(m.group(1)) != 1:
                        continue
                    syl = _one_syllable(m.group(3))
                    if syl is not None and len(jyutping.split(m.group(3))) == 1:
                        out.setdefault(m.group(1), set()).add(syl)
    return out


def load_unihan(raw: Path = RAW) -> dict:
    """char -> set of Jyutping from kCantonese."""
    out: dict = {}
    with zipfile.ZipFile(raw / "Unihan.zip") as z:
        text = z.read("Unihan_Readings.txt").decode("utf8")
    for line in text.splitlines():
        if line.startswith("#") or "\tkCantonese\t" not in line:
            continue
        code, _, value = line.split("\t")
        ch = chr(int(code[2:], 16))
        for syl in value.split():
            syl = syl.lower()
            if _valid(syl):
                out.setdefault(ch, set()).add(syl)
    return out


def load_hkcancor(raw: Path = RAW) -> list:
    """Sentences of (word, pos, jyutping), syllables spaced ("mat1je5" -> "mat1 je5").

    Tokens whose jyutping is not made of valid syllables (punctuation codes such as VQ1) are skipped.
    """
    sentences = []
    with zipfile.ZipFile(raw / "hkcancor-utf8.zip") as z:
        for member in sorted(z.namelist()):
            if not member.startswith("utf8/") or member.endswith("/"):
                continue
            text = z.read(member).decode("utf8", errors="replace")
            if "<sent_tag>" not in text:
                continue  # README, LICENSE, PDFs
            for block in re.findall(r"<sent_tag>(.*?)</sent_tag>", text, flags=re.S):
                sent = []
                for line in block.splitlines():
                    parts = line.strip().split("/")
                    if len(parts) < 3 or not parts[0]:
                        continue
                    word, pos, jy = parts[0], parts[1], parts[2]
                    syls = jyutping.split(jy)
                    if not syls or not all(_valid(s) for s in syls) or "".join(syls) != jy.lower().replace(" ", ""):
                        continue
                    sent.append((word, pos, " ".join(syls)))
                if sent:
                    sentences.append(sent)
    return sentences


def load_rime_words(raw: Path = RAW) -> dict:
    """form -> [space-joined Jyutping readings] in file order.

    Skips entries whose syllable count differs from the character count, or with an invalid syllable.
    """
    out: dict = {}
    in_body = False
    with open(raw / "rime_words.dict.yaml", encoding="utf8") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if not in_body:
                in_body = line == "..."
                continue
            if not line or line.startswith("#"):
                continue
            cols = line.split("\t")
            if len(cols) < 2 or not cols[0]:
                continue
            syls = jyutping.split(cols[1])
            if len(syls) != len(cols[0]) or not all(_valid(s) for s in syls):
                continue
            reading = " ".join(syls)
            lst = out.setdefault(cols[0], [])
            if reading not in lst:
                lst.append(reading)
    return out


_CANTO_FULL = re.compile(r"^(\S+) (\S+) \[[^\]]*\] \{([^}]*)\} /(.*)/\s*$")


def load_cccanto_words(raw: Path = RAW) -> dict:
    """traditional form -> [(jyutping, english)] from both CC-Canto files, any length."""
    out: dict = {}
    for name in ("cccanto.zip", "cccedict_canto_readings.zip"):
        with zipfile.ZipFile(raw / name) as z:
            for member in z.namelist():
                if member.endswith("/"):
                    continue
                for line in z.read(member).decode("utf8").splitlines():
                    if line.startswith("#"):
                        continue
                    m = _CANTO_FULL.match(line)
                    if not m:
                        continue
                    entry = (" ".join(jyutping.split(m.group(3))), m.group(4).strip("/"))
                    lst = out.setdefault(m.group(1), [])
                    if entry not in lst:
                        lst.append(entry)
    return out


@dataclass
class WordsHK:
    id: int
    forms: list  # (form, jyutping)
    pos: list
    labels: list
    yue: list
    eng: list
    examples: list  # (yue text, jyutping, eng)
    reviewed: bool
    published: bool


_EG_YUE = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")


def _parse_definitions(block: str):
    pos, labels, yue, eng, examples = [], [], [], [], []
    if block.strip().startswith("未有內容"):
        return pos, labels, yue, eng, []
    for sense in re.split(r"^----\s*$", block, flags=re.M):
        mode = None
        cur = None
        for line in sense.split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("(pos:") or line.startswith("(label:"):
                pos += re.findall(r"\(pos:([^)]*)\)", line)
                labels += re.findall(r"\(label:([^)]*)\)", line)
            elif line == "<explanation>":
                mode = "exp"
            elif line == "<eg>":
                mode = "eg"
                cur = ["", "", ""]
                examples.append(cur)
            elif line.startswith("yue:"):
                text = line[4:].strip()
                if mode == "eg" and cur is not None:
                    m = _EG_YUE.match(text)
                    cur[0], cur[1] = (m.group(1), m.group(2)) if m else (text, "")
                else:
                    yue.append(text)
            elif line.startswith("eng:"):
                text = line[4:].strip()
                if mode == "eg" and cur is not None:
                    cur[2] = text
                else:
                    eng.append(text)
    return pos, labels, yue, eng, [tuple(e) for e in examples]


def load_wordshk(path=None) -> list:
    """Entries of the newest words.hk all-*.csv (path: a file, or a directory holding them)."""
    path = Path(path) if path is not None else WORDSHK_DIR
    if path.is_file():
        files = [path]
    else:
        files = sorted(path.glob("all-*.csv"), key=lambda p: (int(re.sub(r"\D", "", p.stem) or 0), p.name))
    if not files:
        raise FileNotFoundError("words.hk CSV missing: put all-*.csv in data/raw/wordshk/")
    out = []
    with open(files[-1], encoding="utf8", newline="") as f:
        f.readline()
        f.readline()
        for row in csv.reader(f):
            if len(row) < 6:
                continue
            forms = []
            for part in row[1].split(","):
                form, _, jp = part.rpartition(":")
                if form:
                    forms.append((form, jp))
            pos, labels, yue, eng, examples = _parse_definitions(row[2])
            out.append(WordsHK(int(row[0]), forms, pos, labels, yue, eng, examples,
                               row[4] == "OK", row[5] == "已公開"))
    return out


def _tsv_bz2(path: Path):
    with bz2.open(path, "rt", encoding="utf8", newline="") as f:
        for line in f:
            yield line.rstrip("\r\n").split("\t")


def _author(cols) -> str:
    a = cols[3] if len(cols) > 3 else ""
    return "" if a == "\\N" else a


def load_tatoeba_yue(raw: Path = RAW) -> list:
    """[{id, text, author, eng: [(id, text, author)]}] for yue sentences with an English translation."""
    d = raw / "tatoeba"
    eng = {int(c[0]): (int(c[0]), c[2], _author(c)) for c in _tsv_bz2(d / "eng_sentences_detailed.tsv.bz2") if len(c) > 2}
    links: dict = {}
    for c in _tsv_bz2(d / "yue-eng_links.tsv.bz2"):
        if len(c) >= 2 and int(c[1]) in eng:
            links.setdefault(int(c[0]), []).append(eng[int(c[1])])
    out = []
    for c in _tsv_bz2(d / "yue_sentences_detailed.tsv.bz2"):
        if len(c) > 2 and int(c[0]) in links:
            out.append({"id": int(c[0]), "text": c[2], "author": _author(c), "eng": links[int(c[0])]})
    return out
