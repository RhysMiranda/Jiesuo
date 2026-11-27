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
    return tts.plan(n, speech_dir=tmp_path, calib_dir=tmp_path / "calib", raw_dir=tmp_path / "raw", **k)


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
    monkeypatch.setattr(tts, "REPORT_PUBLISH", tmp_path / "pub.md")
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
    manifest_keys = list(json.loads((tmp_path / "raw" / "manifest.json").read_text(encoding="utf8")))
    (tmp_path / "raw" / "check.json").write_text(json.dumps({"mismatched": [], "uncalibrated": [], "checked": manifest_keys}))
    assert tts.main(["--publish"], env={}) == 0
    sp = json.loads((tmp_path / "speech.json").read_text(encoding="utf8"))
    assert len(sp["clips"]) == 2 and "Azure Speech" in sp["licence"] and "zh-HK" in sp["licence"]
    assert "calib" not in json.dumps(sp)
    for k, v in sp["clips"].items():
        assert (tmp_path / "speech" / f"{k}.mp3").stat().st_size > 0 and v["f"] and v["r"]
    assert "SECRET123" not in (tmp_path / "speech.json").read_text(encoding="utf8")
    assert "SECRET123" not in (tmp_path / "raw" / "manifest.json").read_text(encoding="utf8")


CUR = {"f": "x", "a": "x", "b": "x", "c": "x", "d": "x"}


def test_publish_ships_only_clips_that_say_the_current_reading(tmp_path):
    for k in "abc":
        (tmp_path / f"{k}.mp3").write_bytes(b"x")
    man = {"a": {"f": "唔會", "r": "0%", "voice": HIU, "jp": "m4 wui5"},
           "b": {"f": "唔會", "r": "0%", "voice": HIU, "jp": "m4 wui2"},  # made before the reading was fixed
           "c": {"f": "gone", "r": "0%", "voice": HIU, "jp": "x"}}  # no longer in the data
    stats = {}
    c = tts.publish(man, tmp_path / "s.json", tmp_path, mismatched=set(), uncalibrated=set(), accepted=set(),
                    checked={"a", "b", "c"}, stats=stats, current={"唔會": "m4 wui5"})
    assert set(c) == {"a"} and stats["held"]["stale reading"] == 2


def test_current_readings_prefer_stage1_then_lexicon_then_examples(tmp_path):
    w = lambda name, d: (tmp_path / name).write_text(json.dumps(d, ensure_ascii=False), encoding="utf8")
    w("lexicon.json", {"words": [["好", "hou2", "", 1, 0, "a"], ["ex1", "lexicon", "", 1, 0, "a"]], "chars": {}})
    w("course.json", {"stage1": {"lessons": [{"items": [{"form": "好", "jp": "hou2 stage1"}]}]}})
    w("sentences.json", {"items": {"ex1": ["t", "example"]}})
    w("hkcancor.json", {"items": {}})
    w("wordshk.json", {"examples": {"ex2": ["t", "whk"]}})
    cur = tts.current_readings(tmp_path)
    assert cur["好"] == "hou2 stage1" and cur["ex1"] == "lexicon" and cur["ex2"] == "whk"


def test_publish_holds_back_mismatches_until_ok(tmp_path):
    (tmp_path / "a.mp3").write_bytes(b"x"), (tmp_path / "b.mp3").write_bytes(b"x")
    man = {k: {"f": "f", "r": "0%", "voice": HIU, "jp": "x"} for k in ("a", "b", "c")}
    out = tmp_path / "s.json"
    c = tts.publish(man, out, tmp_path, mismatched={"b"}, uncalibrated=set(), accepted=set(), checked={"a", "b", "c"}, current=CUR)
    assert set(c) == {"a"}  # b mismatched, c has no mp3
    c = tts.publish(man, out, tmp_path, mismatched={"b"}, uncalibrated=set(), accepted={"b"}, checked={"a", "b", "c"}, current=CUR)
    assert set(c) == {"a", "b"}


def test_publish_skips_uncalibrated_voice_unless_accepted(tmp_path):
    wan = "zh-HK-WanLungNeural"
    for k in "abc":
        (tmp_path / f"{k}.mp3").write_bytes(b"x")
    man = {"a": {"f": "f", "r": "0%", "voice": HIU, "jp": "x"}, "b": {"f": "f", "r": "0%", "voice": wan, "jp": "x"}, "c": {"f": "f", "r": "0%", "voice": wan, "jp": "x"}}
    out = tmp_path / "s.json"
    assert set(tts.publish(man, out, tmp_path, mismatched=set(), uncalibrated={wan}, accepted=set(), checked={"a"}, current=CUR)) == {"a"}
    assert set(tts.publish(man, out, tmp_path, mismatched=set(), uncalibrated={wan}, accepted={"c"}, checked={"a"}, current=CUR)) == {"a"}  # a clip line is not a voice line
    assert set(tts.publish(man, out, tmp_path, mismatched=set(), uncalibrated={wan}, accepted={f"voice:{wan}"}, checked={"a"}, current=CUR)) == {"a", "b", "c"}


def test_publish_reads_tts_ok_file_and_needs_check(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(tts, "CHECK_RESULT", tmp_path / "check.json")
    monkeypatch.setattr(tts, "REPORT_PUBLISH", tmp_path / "pub.md")
    monkeypatch.setattr(tts, "TTS_OK", tmp_path / "ok.txt")
    monkeypatch.setattr(tts, "MANIFEST", tmp_path / "m.json")
    monkeypatch.setattr(tts, "SPEECH_DIR", tmp_path)
    monkeypatch.setattr(tts, "SPEECH_JSON", tmp_path / "s.json")
    monkeypatch.setattr(tts, "current_readings", lambda *a: CUR)
    assert tts.main(["--publish"], env={}) == 1  # nothing ships before the check ran
    assert "clip check" in capsys.readouterr().out and not (tmp_path / "s.json").exists()
    (tmp_path / "m.json").write_text(json.dumps({k: {"f": "f", "r": "0%", "voice": HIU, "jp": "x"} for k in ("a", "b")}))
    for k in "ab":
        (tmp_path / f"{k}.mp3").write_bytes(b"x")
    (tmp_path / "check.json").write_text(json.dumps({"mismatched": ["a", "b"], "uncalibrated": [], "checked": ["a", "b"]}))
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


def test_publish_withholds_clips_the_check_did_not_cover(tmp_path):
    wan = "zh-HK-WanLungNeural"
    for k in "abcd":
        (tmp_path / f"{k}.mp3").write_bytes(b"x")
    (tmp_path / "orphan.mp3").write_bytes(b"x")
    man = {k: {"f": k, "r": "0%", "voice": HIU, "jp": "x"} for k in "abc"}
    man["d"] = {"f": "d", "r": "0%", "voice": wan, "jp": "x"}  # a voice added after the check
    stats = {}
    c = tts.publish(man, tmp_path / "s.json", tmp_path, mismatched={"b"}, uncalibrated=set(), accepted=set(), checked={"a", "b"}, stats=stats, current=CUR)
    assert set(c) == {"a"}  # b mismatched, c generated after the check, d a later voice
    assert stats["held"]["mismatched"] == 1 and stats["held"]["not checked"] == 2
    assert stats["unreferenced"] == ["b.mp3", "c.mp3", "d.mp3", "orphan.mp3"]
    c = tts.publish(man, tmp_path / "s.json", tmp_path, mismatched={"b"}, uncalibrated=set(), accepted={"b"}, checked={"a", "b"}, current=CUR)
    assert set(c) == {"a", "b"}


def test_publish_cli_says_rerun_check(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(tts, "CHECK_RESULT", tmp_path / "check.json")
    monkeypatch.setattr(tts, "REPORT_PUBLISH", tmp_path / "pub.md")
    monkeypatch.setattr(tts, "TTS_OK", tmp_path / "ok.txt")
    monkeypatch.setattr(tts, "MANIFEST", tmp_path / "m.json")
    monkeypatch.setattr(tts, "SPEECH_DIR", tmp_path)
    monkeypatch.setattr(tts, "SPEECH_JSON", tmp_path / "s.json")
    monkeypatch.setattr(tts, "current_readings", lambda *a: CUR)
    (tmp_path / "m.json").write_text(json.dumps({"a": {"f": "f", "r": "0%", "voice": HIU, "jp": "x"}}))
    (tmp_path / "a.mp3").write_bytes(b"x")
    (tmp_path / "check.json").write_text(json.dumps({"mismatched": [], "uncalibrated": [], "checked": []}))
    assert tts.main(["--publish"], env={}) == 0
    out = capsys.readouterr().out
    assert "withheld 1 clips: not checked" in out and "rerun the clip check" in out
    assert json.loads((tmp_path / "s.json").read_text())["clips"] == {}


def test_malformed_key_never_printed(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(tts, "RAW_TTS", tmp_path / "raw")
    monkeypatch.setattr(tts, "SPEECH_DIR", tmp_path / "speech")
    monkeypatch.setattr(tts, "CALIB_DIR", tmp_path / "raw" / "calib")
    monkeypatch.setattr(tts.time, "sleep", lambda s: None)

    class Bad:
        def post(self, url, headers=None, data=None, timeout=60):
            raise ValueError("Invalid header value b'SECRET123\n'")

    rc = tts.main(["--run", "--limit", "3"], env={"AZURE_SPEECH_KEY": "SECRET123\n", "AZURE_SPEECH_REGION": "r"}, session=Bad())
    cap = capsys.readouterr()
    assert "SECRET123" not in cap.out + cap.err and rc != 0 and "ValueError" in cap.out
    rc = tts.main(["--run"], env={"AZURE_SPEECH_KEY": "SEC\nRET123", "AZURE_SPEECH_REGION": "r"}, session=Bad())
    cap = capsys.readouterr()
    assert rc != 0 and "AZURE_SPEECH_KEY" in cap.out and "RET123" not in cap.out + cap.err


def test_bad_audio_is_a_skip_not_an_abort(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(tts, "RAW_TTS", tmp_path / "raw")
    monkeypatch.setattr(tts, "SPEECH_DIR", tmp_path / "speech")
    monkeypatch.setattr(tts, "CALIB_DIR", tmp_path / "raw" / "calib")
    jobs = [j for j in tts.plan(2, speech_dir=tmp_path / "speech", calib_dir=tmp_path / "c") if j.kind == "word"][:3]
    wavs = [b"", b"not a wav", _wav_bytes(tmp_path)]

    class S:
        def post(self, *a, **k):
            return tts._Resp(200, wavs.pop(0))

    done, failed, manifest = tts.run(jobs, S(), "r", "k", raw_dir=tmp_path / "raw", speech_dir=tmp_path / "speech")
    assert (done, failed) == (1, 2) and len(manifest) == 1
    assert not list((tmp_path / "raw").glob("*.wav")) or len(list((tmp_path / "raw").glob("*.wav"))) == 1


def test_publish_holds_one_syllable_clips(tmp_path):
    for k in "ab":
        (tmp_path / f"{k}.mp3").write_bytes(b"x")
    man = {"a": {"f": "唔會", "r": "0%", "voice": HIU, "jp": "m4 wui5"}, "b": {"f": "會", "r": "0%", "voice": HIU, "jp": "wui5"}}
    stats = {}
    kw = dict(mismatched=set(), uncalibrated=set(), accepted=set(), checked={"a", "b"}, current={"唔會": "m4 wui5", "會": "wui5"})
    c = tts.publish(man, tmp_path / "s.json", tmp_path, stats=stats, onesyl_pass=set(), **kw)
    assert set(c) == {"a"} and stats["held"]["one syllable"] == 1
    assert set(tts.publish(man, tmp_path / "s.json", tmp_path, onesyl_pass={"b"}, **kw)) == {"a", "b"}  # passed the strict check
    kw.update(uncalibrated={HIU}, checked=set())  # the strict check stands in for the voice profile, for one syllable only
    assert set(tts.publish(man, tmp_path / "s.json", tmp_path, onesyl_pass={"b"}, **kw)) == {"b"}


def test_plan_skips_clips_made_but_not_shipped_and_can_do_one_syllable_words_only(tmp_path):
    all_jobs = [j for j in _plan(tmp_path, 50) if j.kind != "calib"]
    one = [j for j in _plan(tmp_path, 50, one_syllable=True) if j.kind != "calib"]
    assert one and all(len(j.jp.split()) == 1 and j.kind == "word" for j in one)
    assert {j.key for j in one} < {j.key for j in all_jobs}
    (tmp_path / "raw").mkdir()
    (tmp_path / "raw" / f"{one[0].key}.wav").write_bytes(b"x")  # made earlier, held back from the app
    assert one[0].key not in {j.key for j in _plan(tmp_path, 50)}
