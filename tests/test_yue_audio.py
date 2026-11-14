import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "app" / "yue" / "audio"
AUDIO_JSON = ROOT / "app" / "yue" / "data" / "audio.json"
EXCLUSIONS = ROOT / "data" / "yue" / "audio_exclusions.json"

SHIPPED = ["googleA", "googleB", "amazonHiuJin"]


def _audio():
    return json.loads(AUDIO_JSON.read_text(encoding="utf8"))


def test_voices_and_licence():
    a = _audio()
    assert [v["id"] for v in a["voices"]] == SHIPPED
    assert [v["label"] for v in a["voices"]] == ["Voice 1, female", "Voice 2, male", "Voice 3, female"]
    assert a["licence"] == "MIT: Cantone (AlienKevin/cantone), synthetic voices from Amazon and Google"


def test_anchor_syllables_have_two_voices():
    clips = _audio()["clips"]
    for base in ("si", "fan"):
        for t in range(1, 7):
            assert len(clips.get(f"{base}{t}", [])) >= 2, f"{base}{t}"


def test_calibration_anchors_have_two_voices():
    clips = _audio()["clips"]
    for t in range(1, 7):
        assert len(clips.get(f"ji{t}", [])) >= 2, f"ji{t}"


def test_no_excluded_clip_is_listed():
    a = _audio()
    excluded = json.loads(EXCLUSIONS.read_text(encoding="utf8"))
    ids = [v["id"] for v in a["voices"]]
    for syl, idxs in a["clips"].items():
        for i in idxs:
            assert f"{ids[i]}/{syl}" not in excluded


def test_clips_are_in_rime_inventory():
    from jiesuo.yue.sources import load_rime_chars
    inventory = {s for readings in load_rime_chars().values() for s, _ in readings}
    assert set(_audio()["clips"]) <= inventory


def test_every_listed_clip_exists_and_is_small():
    a = _audio()
    assert a["clips"]
    for syl, idxs in a["clips"].items():
        assert idxs and idxs == sorted(set(idxs))
        for i in idxs:
            p = AUDIO / a["voices"][i]["id"] / f"{syl}.mp3"
            assert p.is_file(), p
            assert p.stat().st_size < 12 * 1024, p
    total = sum(f.stat().st_size for f in AUDIO.rglob("*") if f.is_file())
    assert total < 40 * 1024 * 1024
