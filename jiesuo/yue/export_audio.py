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

LICENCE = "MIT: Cantone (AlienKevin/cantone), synthetic voices from Amazon and Google"
VOICES = [
    {"id": "googleA", "label": "Voice 1, female"},
    {"id": "googleB", "label": "Voice 2, male"},
    {"id": "amazonHiuJin", "label": "Voice 3, female"},
]
BITRATE = 24
RATE = 16000


def encode(wav_path: Path) -> bytes:
    with wave.open(str(wav_path), "rb") as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2 and w.getframerate() == RATE, wav_path
        pcm = w.readframes(w.getnframes())
    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE)
    enc.set_in_sample_rate(RATE)
    enc.set_out_sample_rate(RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm) + enc.flush())


def inventory() -> set:
    return {s for readings in load_rime_chars().values() for s, _ in readings}


def main() -> None:
    excluded = json.loads(EXCLUSIONS.read_text(encoding="utf8"))
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
