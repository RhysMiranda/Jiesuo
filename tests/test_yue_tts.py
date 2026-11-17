import json
import struct
import wave

import pytest

from jiesuo.yue import tts

HIU = "zh-HK-HiuMaanNeural"


def test_ssml_exact_phonemes():
    s = tts.ssml("你好", "nei5 hou2", HIU)
    assert 'alphabet="sapi"' in s
    assert 'ph="nei 5 hou 2"' in s
    assert 'xml:lang="zh-HK"' in s and f'<voice name="{HIU}">' in s and '<prosody rate="0%">' in s


def test_ssml_keeps_english_plain():
    s = tts.ssml("佢 feed 緊", "keoi5 gan2", HIU)
    assert 'ph="keoi 5"' in s and 'ph="gan 2"' in s
    assert "feed" in s and s.count("<phoneme") == 2
    assert "<phoneme" not in s.split("feed")[0].split("</phoneme>")[-1]  # nothing wraps the English


def test_ssml_escapes_and_rate():
    s = tts.ssml("你 & <好>", "nei5 hou2", HIU, "-25%")
    assert "&amp;" in s and "&lt;" in s and "&gt;" in s and "& <" not in s
    assert 'rate="-25%"' in s


def test_ssml_syllable_mismatch_raises():
    with pytest.raises(ValueError):
        tts.ssml("你好", "nei5", HIU)


def test_clip_key():
    a = tts.clip_key("你好", "nei5 hou2", HIU, "0%")
    assert a == tts.clip_key("你好", "nei5 hou2", HIU, "0%") and len(a) == 16
    assert a != tts.clip_key("你好", "nei5 hou2", HIU, "-25%")


def test_plan_skips_existing(tmp_path):
    jobs = tts.plan(5, speech_dir=tmp_path)
    assert jobs and all(j.rate in ("0%", "-25%") for j in jobs)
    assert {j.rate for j in jobs if j.kind == "word"} == {"0%"}
    assert {j.rate for j in jobs if j.kind == "sentence"} == {"0%", "-25%"}
    assert len({j.key for j in jobs}) == len(jobs)
    (tmp_path / f"{jobs[0].key}.mp3").write_bytes(b"x")
    again = tts.plan(5, speech_dir=tmp_path)
    assert len(again) == len(jobs) - 1 and jobs[0].key not in {j.key for j in again}


def test_plan_covers_stage1_and_sentences(tmp_path):
    jobs = tts.plan(0, speech_dir=tmp_path)
    forms = {j.f for j in jobs if j.kind == "word"}
    assert {"你好", "唔該", "我哋"} <= forms
    assert any(j.kind == "sentence" for j in jobs)
    for j in jobs:
        tts.ssml(j.text, j.jp, j.voice, j.rate)  # every planned job builds valid SSML


def test_dry_run_no_network(capsys, tmp_path):
    class Boom:
        def post(self, *a, **k):
            raise AssertionError("network")
    assert tts.main(["--dry-run"], env={}, session=Boom()) == 0
    out = capsys.readouterr().out
    assert "jobs" in out and "characters" in out


def test_run_needs_env(capsys):
    assert tts.main(["--run"], env={}, session=object()) != 0
    assert "AZURE_SPEECH_KEY" in capsys.readouterr().out
    assert tts.main(["--run"], env={"AZURE_SPEECH_KEY": "k"}, session=object()) != 0
    assert "AZURE_SPEECH_REGION" in capsys.readouterr().out


def _wav_bytes(tmp_path):
    p = tmp_path / "t.wav"
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(24000)
        w.writeframes(struct.pack("<2400h", *([1000, -1000] * 1200)))
    return p.read_bytes()


class FakeSession:
    def __init__(self, statuses, wav):
        self.statuses, self.wav, self.calls = list(statuses), wav, []

    def post(self, url, headers=None, data=None, timeout=60):
        self.calls.append((url, dict(headers), data))
        st = self.statuses.pop(0) if self.statuses else 200
        return tts._Resp(st, self.wav if st == 200 else b"")


def test_run_mocked_never_leaks_key(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(tts, "SPEECH_DIR", tmp_path / "speech")
    monkeypatch.setattr(tts, "SPEECH_JSON", tmp_path / "speech.json")
    monkeypatch.setattr(tts, "RAW_TTS", tmp_path / "raw")
    monkeypatch.setattr(tts, "MANIFEST", tmp_path / "raw" / "manifest.json")
    monkeypatch.setattr(tts, "CHECK_RESULT", tmp_path / "raw" / "check.json")
    monkeypatch.setattr(tts, "TTS_OK", tmp_path / "ok.txt")
    sess = FakeSession([429, 503, 200, 200], _wav_bytes(tmp_path))
    sleeps = []
    monkeypatch.setattr(tts.time, "sleep", lambda s: sleeps.append(s))
    rc = tts.main(["--run", "--limit", "2", "--words", "2"],
                  env={"AZURE_SPEECH_KEY": "SECRET123", "AZURE_SPEECH_REGION": "eastasia"}, session=sess)
    cap = capsys.readouterr()
    assert rc == 0
    assert "SECRET123" not in cap.out + cap.err
    assert sess.calls[0][0] == "https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1"
    assert sess.calls[0][1]["X-Microsoft-OutputFormat"] == "riff-24khz-16bit-mono-pcm"
    assert len(sess.calls) == 4  # two retries then success, then the second clip
    sp = json.loads((tmp_path / "speech.json").read_text(encoding="utf8"))
    assert len(sp["clips"]) == 2 and "Azure Speech" in sp["licence"] and "zh-HK" in sp["licence"]
    for k, v in sp["clips"].items():
        assert (tmp_path / "speech" / f"{k}.mp3").stat().st_size > 0 and v["f"] and v["r"]
    assert "SECRET123" not in (tmp_path / "speech.json").read_text(encoding="utf8")
    assert "SECRET123" not in (tmp_path / "raw" / "manifest.json").read_text(encoding="utf8")


def test_publish_holds_back_mismatches_until_ok(tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x"), (tmp_path / "b.mp3").write_bytes(b"x")
    man = {k: {"f": "f", "r": "0%", "voice": HIU} for k in ("a", "b", "c")}
    out = tmp_path / "s.json"
    c = tts.publish(man, out, tmp_path, mismatched={"b"}, accepted=set())
    assert set(c) == {"a"}  # b mismatched, c has no mp3
    c = tts.publish(man, out, tmp_path, mismatched={"b"}, accepted={"b"})
    assert set(c) == {"a", "b"}


def test_fatal_on_bad_key(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(tts, "RAW_TTS", tmp_path / "raw")
    monkeypatch.setattr(tts, "SPEECH_DIR", tmp_path / "speech")
    rc = tts.main(["--run", "--limit", "1"], env={"AZURE_SPEECH_KEY": "SECRET123", "AZURE_SPEECH_REGION": "r"},
                  session=FakeSession([401], b""))
    out = capsys.readouterr().out
    assert rc != 0 and "SECRET123" not in out and "AZURE_SPEECH_KEY" in out
