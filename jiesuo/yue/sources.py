"""Loaders for the raw Cantonese reading sources in data/raw/yue/ (never extracted)."""
import re
import zipfile
from pathlib import Path

from . import jyutping

RAW = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "yue"


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
