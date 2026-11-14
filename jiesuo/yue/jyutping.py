"""Jyutping syllables: initial, final, tone. Twin of app/yue/jyutping.js."""
import re

INITIALS = ("b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "ng", "h", "gw", "kw", "w", "z", "c", "s", "j")

FINALS = frozenset(
    "aa aai aau aam aan aang aap aat aak "
    "a ai au am an ang ap at ak "
    "e ei eu em en eng ep et ek "
    "i iu im in ing ip it ik "
    "o oi ou on ong ot ok "
    "oe oen oeng oet oek eoi eon eot "
    "u ui un ung ut uk "
    "yu yun yut "
    "m ng".split()
)

# two-letter initials first
_BY_LENGTH = sorted(INITIALS, key=len, reverse=True)


def parse(syl: str) -> tuple[str, str, int]:
    """Return (initial or "", final, tone 1-6). Raises ValueError."""
    m = re.fullmatch(r"([a-z]+)([1-6])", syl or "")
    if not m:
        raise ValueError(f"not a Jyutping syllable: {syl!r}")
    body, tone = m.group(1), int(m.group(2))
    for ini in _BY_LENGTH:
        if body.startswith(ini) and body[len(ini):] in FINALS:
            return ini, body[len(ini):], tone
    if body in FINALS:
        return "", body, tone
    raise ValueError(f"not a Jyutping syllable: {syl!r}")


def split(text: str) -> list[str]:
    """Split "mat1je5" or "mat1 je5" into syllables."""
    text = re.sub(r"\s+(?=[0-9])", "", text.lower())
    return re.findall(r"[a-z]+[0-9]*", text)


def is_checked(syl: str) -> bool:
    return parse(syl)[1][-1] in "ptk"


def toneless(syl: str) -> str:
    return re.sub(r"[0-9]+$", "", syl)
