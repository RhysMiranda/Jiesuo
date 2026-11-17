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


def _plan(tmp_path, n, **k):
    return tts.plan(n, speech_dir=tmp_path, calib_dir=tmp_path / "calib", **k)


def test_plan_skips_existing(tmp_path):
    jobs = [j for j in _plan(tmp_path, 5) if j.kind != "calib"]
    assert jobs and all(j.rate in ("0%", "-25%") for j in jobs)
    assert {j.rate for j in jobs if j.kind == "word"} == {"0%"}
    assert {j.rate for j in jobs if j.kind == "sentence"} == {"0%", "-25%"}
    assert len({j.key for j in jobs}) == len(jobs)
    (tmp_path / f"{jobs[0].key}.mp3").write_bytes(b"x")
    again = [j for j in _plan(tmp_path, 5) if j.kind != "calib"]
    assert len(again) == len(jobs) - 1 and jobs[0].key not in {j.key for j in again}


def test_plan_covers_stage1_and_sentences(tmp_path):
    jobs = _plan(tmp_path, 0)
    forms = {j.f for j in jobs if j.kind == "word"}
    assert {"你好", "唔該", "我哋"} <= forms
    assert any(j.kind == "sentence" for j in jobs)
    for j in jobs:
        tts.ssml(j.text, j.jp, j.voice, j.rate)  # every planned job builds valid SSML


def test_plan_includes_calibration_per_voice(tmp_path):
    jobs = [j for j in _plan(tmp_path, 0) if j.kind == "calib"]
    assert len(jobs) == 42 and {j.f for j in jobs} >= {"ji1", "ji3", "ji6", "ji4", "ji2", "ji5"}
    assert all(j.rate == "0%" and j.voice == HIU for j in jobs)
    assert 'ph="ji 1"' in tts.ssml(jobs[0].text, jobs[0].jp, HIU)
    wan = [j for j in _plan(tmp_path, 0, voice="zh-HK-WanLungNeural") if j.kind == "calib"]
    assert len(wan) == 42 and {j.key for j in wan}.isdisjoint({j.key for j in jobs})
    (tmp_path / "calib" / HIU).mkdir(parents=True)
    (tmp_path / "calib" / HIU / "ji1.wav").write_bytes(b"x")  # incremental
    assert len([j for j in _plan(tmp_path, 0) if j.kind == "calib"]) == 41


def test_dry_run_no_network(capsys, tmp_path):
    class Boom:
        def post(self, *a, **k):
            raise AssertionError("network")
    assert tts.main(["--dry-run"], env={}, session=Boom()) == 0
    out = capsys.readouterr().out
    assert "jobs" in out and "characters" in out and "calibration" in out


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
    monkeypatch.setattr(tts, "CALIB_DIR", tmp_path / "raw" / "calib")
    monkeypatch.setattr(tts, "MANIFEST", tmp_path / "raw" / "manifest.json")
    monkeypatch.setattr(tts, "CHECK_RESULT", tmp_path / "raw" / "check.json")
    monkeypatch.setattr(tts, "TTS_OK", tmp_path / "ok.txt")
    sess = FakeSession([429, 503], _wav_bytes(tmp_path))
    sleeps = []
    monkeypatch.setattr(tts.time, "sleep", lambda s: sleeps.append(s))
    rc = tts.main(["--run", "--limit", "44", "--words", "2"],
                  env={"AZURE_SPEECH_KEY": "SECRET123", "AZURE_SPEECH_REGION": "eastasia"}, session=sess)
    cap = capsys.readouterr()
    assert rc == 0
    assert "SECRET123" not in cap.out + cap.err
    assert sess.calls[0][0] == "https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1"
    assert sess.calls[0][1]["X-Microsoft-OutputFormat"] == "riff-24khz-16bit-mono-pcm"
    assert len(sess.calls) == 46  # two retries then success; 42 calibration clips come first, then 2 clips
    assert len(list((tmp_path / "raw" / "calib" / HIU).glob("*.wav"))) == 42
    (tmp_path / "raw" / "check.json").write_text('{"mismatched": [], "uncalibrated": []}')
    assert tts.main(["--publish"], env={}) == 0
    sp = json.loads((tmp_path / "speech.json").read_text(encoding="utf8"))
    assert len(sp["clips"]) == 2 and "Azure Speech" in sp["licence"] and "zh-HK" in sp["licence"]
    assert "calib" not in json.dumps(sp)
    for k, v in sp["clips"].items():
        assert (tmp_path / "speech" / f"{k}.mp3").stat().st_size > 0 and v["f"] and v["r"]
    assert "SECRET123" not in (tmp_path / "speech.json").read_text(encoding="utf8")
    assert "SECRET123" not in (tmp_path / "raw" / "manifest.json").read_text(encoding="utf8")


def test_publish_holds_back_mismatches_until_ok(tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x"), (tmp_path / "b.mp3").write_bytes(b"x")
    man = {k: {"f": "f", "r": "0%", "voice": HIU} for k in ("a", "b", "c")}
    out = tmp_path / "s.json"
    c = tts.publish(man, out, tmp_path, mismatched={"b"}, uncalibrated=set(), accepted=set())
    assert set(c) == {"a"}  # b mismatched, c has no mp3
    c = tts.publish(man, out, tmp_path, mismatched={"b"}, uncalibrated=set(), accepted={"b"})
    assert set(c) == {"a", "b"}


def test_publish_skips_uncalibrated_voice_unless_accepted(tmp_path):
    wan = "zh-HK-WanLungNeural"
    for k in "abc":
        (tmp_path / f"{k}.mp3").write_bytes(b"x")
    man = {"a": {"f": "f", "r": "0%", "voice": HIU}, "b": {"f": "f", "r": "0%", "voice": wan}, "c": {"f": "f", "r": "0%", "voice": wan}}
    out = tmp_path / "s.json"
    assert set(tts.publish(man, out, tmp_path, mismatched=set(), uncalibrated={wan}, accepted=set())) == {"a"}
    assert set(tts.publish(man, out, tmp_path, mismatched=set(), uncalibrated={wan}, accepted={"c"})) == {"a"}  # a clip line is not a voice line
    assert set(tts.publish(man, out, tmp_path, mismatched=set(), uncalibrated={wan}, accepted={f"voice:{wan}"})) == {"a", "b", "c"}


def test_publish_reads_tts_ok_file_and_needs_check(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(tts, "CHECK_RESULT", tmp_path / "check.json")
    monkeypatch.setattr(tts, "TTS_OK", tmp_path / "ok.txt")
    monkeypatch.setattr(tts, "MANIFEST", tmp_path / "m.json")
    monkeypatch.setattr(tts, "SPEECH_DIR", tmp_path)
    monkeypatch.setattr(tts, "SPEECH_JSON", tmp_path / "s.json")
    assert tts.main(["--publish"], env={}) == 1  # nothing ships before the check ran
    assert "clip check" in capsys.readouterr().out and not (tmp_path / "s.json").exists()
    (tmp_path / "m.json").write_text(json.dumps({k: {"f": "f", "r": "0%", "voice": HIU} for k in ("a", "b")}))
    for k in "ab":
        (tmp_path / f"{k}.mp3").write_bytes(b"x")
    (tmp_path / "check.json").write_text(json.dumps({"mismatched": ["a", "b"], "uncalibrated": []}))
    (tmp_path / "ok.txt").write_text("b  # listened, fine" + chr(10))
    assert tts.main(["--publish"], env={}) == 0
    assert set(json.loads((tmp_path / "s.json").read_text())["clips"]) == {"b"}


def test_fatal_on_bad_key(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(tts, "RAW_TTS", tmp_path / "raw")
    monkeypatch.setattr(tts, "SPEECH_DIR", tmp_path / "speech")
    monkeypatch.setattr(tts, "CALIB_DIR", tmp_path / "raw" / "calib")
    rc = tts.main(["--run", "--limit", "1"], env={"AZURE_SPEECH_KEY": "SECRET123", "AZURE_SPEECH_REGION": "r"},
                  session=FakeSession([401], b""))
    out = capsys.readouterr().out
    assert rc != 0 and "SECRET123" not in out and "AZURE_SPEECH_KEY" in out
