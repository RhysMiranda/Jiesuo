"""Encode the Cantone syllable WAVs to small MP3s and write app/yue/data/audio.json."""
import json
import wave
from pathlib import Path

import lameenc

from .sources import RAW, load_rime_chars

ROOT = Path(__file__).resolve().parent.parent.parent
OUT_AUDIO = ROOT / "app" / "yue" / "audio"
OUT_JSON = ROOT / "app" / "yue" / "data" / "audio.json"
EXCLUSIONS = ROOT / "data" / "yue" / "audio_exclusions.json"

LICENCE = "MIT: Cantone (AlienKevin/cantone), a synthetic voice from Google"
# Only googleB is shipped: googleA and amazonHiuJin often say tone 5 (and googleA tones 2 and 6) as another
# tone, so they taught wrong tones. Each googleB clip must also pass scripts/yue_audio_strict.js.
VOICES = [
    {"id": "googleB", "label": "Male voice"},
]
STRICT = ROOT / "data" / "yue" / "audio_strict.json"
BITRATE = 24
RATE = 16000


def encode(wav_path: Path, rate: int = RATE) -> bytes:
    with wave.open(str(wav_path), "rb") as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2 and w.getframerate() == rate, wav_path
        pcm = w.readframes(w.getnframes())
    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE)
    enc.set_in_sample_rate(rate)
    enc.set_out_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm) + enc.flush())


def inventory() -> set:
    return {s for readings in load_rime_chars().values() for s, _ in readings}


def main() -> None:
    # The direct shape check is the authority now; the phase 1 list (EXCLUSIONS) came from a classifier
    # calibrated on the same synthetic voices, with googleA and amazonHiuJin among the vouching voices.
    excluded = json.loads(STRICT.read_text(encoding="utf8"))
    syllables = inventory()
    clips: dict = {}
    made = 0
    for vi, voice in enumerate(VOICES):
        src = RAW / "cantone" / voice["id"]
        for wav in sorted(src.glob("*.wav")):
            syl = wav.stem
            if syl not in syllables or f"{voice['id']}/{syl}" in excluded:
                continue
            dest = OUT_AUDIO / voice["id"] / f"{syl}.mp3"
            if not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(encode(wav))
                made += 1
            clips.setdefault(syl, []).append(vi)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    data = {"licence": LICENCE, "voices": VOICES, "clips": dict(sorted(clips.items()))}
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(f"{made} new MP3s; {len(clips)} syllables")


if __name__ == "__main__":
    main()
