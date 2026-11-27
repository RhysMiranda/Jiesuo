"""Build-time Azure Speech audio for words and sentences, with exact Jyutping via SSML.

    python -m jiesuo.yue.tts --dry-run
    python -m jiesuo.yue.tts --run [--limit N] [--voice V] [--pace S]     (needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION)
    python -m jiesuo.yue.tts --publish                          (write speech.json; needs node scripts/yue_clip_check.js first)

The key is read only from the environment. It is never printed, logged or written.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import wave
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape

from .export_audio import encode

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "app" / "yue" / "data"
SPEECH_DIR = ROOT / "app" / "yue" / "audio" / "speech"
SPEECH_JSON = DATA / "speech.json"
RAW_TTS = ROOT / "data" / "raw" / "yue" / "tts"
MANIFEST = RAW_TTS / "manifest.json"  # every generated clip: text, jp, voice (the clip check reads this)
CHECK_RESULT = RAW_TTS / "check.json"  # written by scripts/yue_clip_check.js: {"mismatched": [key...]}
CALIB_DIR = RAW_TTS / "calib"  # <voice>/<syllable>.wav: the clip check fits each voice's profile from these
# The voiced six-tone sets (the ji series is the first) that scripts/yue_tone_eval.js fits profiles from.
CALIB_SETS = ["ji", "jau", "jan", "wai", "maa", "ngaa", "lou"]
CALIB_FALLBACK_CHAR = "啊"  # the ph attribute decides the reading, so any Han character will do
REPORT_PUBLISH = ROOT / "reports" / "yue_tts_publish.md"
ONESYL = ROOT / "data" / "yue" / "tts_onesyl.json"  # written by scripts/yue_azure_onesyl.js: {"pass": [key...], "fail": {...}}
TTS_OK = ROOT / "data" / "yue" / "tts_ok.txt"  # keys, or "voice:<name>" lines, the learner listened to and accepted

VOICES = ["zh-HK-HiuMaanNeural", "zh-HK-WanLungNeural"]
DEFAULT_VOICE = VOICES[0]
SENTENCE_RATES = ["0%", "-25%"]
WAV_RATE = 24000
OUTPUT_FORMAT = "riff-24khz-16bit-mono-pcm"
LICENCE = ("Generated with Azure Speech (zh-HK neural voice HiuMaan) from our own Jyutping readings. "
           "The sentence texts keep their own licences (see sentences.json).")
MAX_TRIES = 5

_HAN = re.compile("[㐀-䶿一-鿿豈-﫿\U00020000-\U0002fa1f]+")
_SYL = re.compile(r"^([a-z]+)([1-6])$")


@dataclass(frozen=True)
class Job:
    key: str
    text: str
    jp: str
    voice: str
    rate: str
    kind: str  # "word", "sentence" or "calib"
    f: str  # the form, or the example id


def clip_key(text, jp, voice, rate) -> str:
    return hashlib.sha1(f"{text}|{jp}|{voice}|{rate}".encode("utf8")).hexdigest()[:16]


def _ph(syllables) -> str:
    out = []
    for s in syllables:
        m = _SYL.match(s.lower())
        if not m:
            raise ValueError(f"not a Jyutping syllable: {s!r}")
        out.append(f"{m.group(1)} {m.group(2)}")
    return " ".join(out)


def ssml(text: str, jp: str, voice: str, rate: str = "0%") -> str:
    """One <phoneme> per maximal Han run, taking that run's syllables in order; other text stays plain."""
    syls = jp.split()
    body, pos, k = [], 0, 0
    for m in _HAN.finditer(text):
        if m.start() > pos:
            body.append(escape(text[pos:m.start()]))
        n = len(m.group())
        if k + n > len(syls):
            raise ValueError(f"not enough syllables for {text!r}: {jp!r}")
        body.append(f'<phoneme alphabet="sapi" ph="{_ph(syls[k:k + n])}">{escape(m.group())}</phoneme>')
        k += n
        pos = m.end()
    if k != len(syls):
        raise ValueError(f"{len(syls)} syllables for {k} Han characters in {text!r}")
    if pos < len(text):
        body.append(escape(text[pos:]))
    return ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-HK">'
            f'<voice name="{voice}"><prosody rate="{rate}">{"".join(body)}</prosody></voice></speak>')


def _load(path):
    return json.loads(Path(path).read_text(encoding="utf8"))


def _examples(data_dir):
    """{example id: (text, jp)} from the three example files."""
    out = {}
    for name in ("sentences", "hkcancor"):
        for i, v in _load(Path(data_dir) / f"{name}.json")["items"].items():
            out[i] = (v[0], v[1])
    for i, v in _load(Path(data_dir) / "wordshk.json")["examples"].items():
        out[i] = (v[0], v[1])
    return out


def calib_syllables():
    return [f"{x}{t}" for x in CALIB_SETS for t in range(1, 7)]


def plan(limit_words=2000, voice=DEFAULT_VOICE, speech_dir=None, data_dir=DATA, calib_dir=None):
    """Jobs for the first `limit_words` course words, Stage 1, lesson sentences and grammar examples, minus existing clips."""
    data_dir, speech_dir = Path(data_dir), Path(speech_dir or SPEECH_DIR)
    calib_dir = Path(calib_dir or CALIB_DIR)
    course = _load(data_dir / "course.json")
    jp_of = {}
    for w in _load(data_dir / "lexicon.json")["words"]:
        jp_of.setdefault(w[0], w[1])
    for les in course["stage1"]["lessons"]:
        for it in les["items"]:
            jp_of[it["form"]] = it["jp"]
    words = [x for x in course["order"] if not x.startswith("g:")][:limit_words]
    for les in course["stage1"]["lessons"]:
        words += [it["form"] for it in les["items"]]
    ex = _examples(data_dir)
    ids = list(dict.fromkeys(list(course["lessonSentence"].values())
                             + [e for g in course["grammar"].values() for e in g.get("examples", [])]))
    jobs, seen = [], set()
    # Calibration first: one clip per set syllable, each its own <phoneme>; the check fits the voice's profile from them.
    char_of = {}
    for c, readings in _load(data_dir / "lexicon.json")["chars"].items():
        for r in readings:
            char_of.setdefault(r, c)
    for syl in calib_syllables():
        if not (calib_dir / voice / f"{syl}.wav").exists():
            jobs.append(Job(clip_key(syl, syl, voice, "0%"), char_of.get(syl, CALIB_FALLBACK_CHAR), syl, voice, "0%", "calib", syl))

    def add(kind, f, text, jp, rate):
        key = clip_key(text, jp, voice, rate)
        if key in seen or (speech_dir / f"{key}.mp3").exists():
            return
        seen.add(key)
        jobs.append(Job(key, text, jp, voice, rate, kind, f))

    for form in dict.fromkeys(words):
        if form in jp_of:
            add("word", form, form, jp_of[form], "0%")
    for i in ids:
        if i in ex and ex[i][1]:
            for rate in SENTENCE_RATES:
                add("sentence", i, ex[i][0], ex[i][1], rate)
    return jobs


@dataclass
class _Resp:
    status_code: int
    content: bytes


class _UrllibSession:
    """The default HTTP session; tests pass a fake with the same post()."""

    def post(self, url, headers=None, data=None, timeout=60):
        req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return _Resp(r.status, r.read())
        except urllib.error.HTTPError as e:
            return _Resp(e.code, b"")


class FatalError(Exception):
    pass


def synthesise(session, region, key, job, sleep=None):
    """WAV bytes for a job, retrying 429 and 5xx with backoff. Messages never contain the key or headers."""
    sleep = sleep or time.sleep
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    headers = {"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
               "X-Microsoft-OutputFormat": OUTPUT_FORMAT, "User-Agent": "jiesuo-yue-tts"}
    body = ssml(job.text, job.jp, job.voice, job.rate).encode("utf8")
    for attempt in range(MAX_TRIES):
        try:
            r = session.post(url, headers=headers, data=body, timeout=60)
            status, note = r.status_code, r.status_code
        except Exception as e:  # transport trouble (even a malformed header): retry; say only the error class, never its text
            r, status, note = None, None, type(e).__name__
        if status == 200:
            return r.content
        if status in (401, 403):
            raise FatalError(f"Azure refused the key or region (HTTP {status}); check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION")
        if not (status is None or status == 429 or 500 <= status < 600):
            raise ValueError(f"HTTP {status}")
        if attempt == MAX_TRIES - 1:
            raise ValueError(f"gave up after {MAX_TRIES} tries (last: {note})")
        sleep(min(30, 2 ** attempt))


class NotChecked(Exception):
    pass


def _check_result():
    if not CHECK_RESULT.exists():
        raise NotChecked("no clip check yet: run node scripts/yue_clip_check.js data/raw/yue/tts first")
    r = _load(CHECK_RESULT)
    return set(r["mismatched"]), set(r.get("uncalibrated", [])), set(r.get("checked", []))


def _accepted():
    if not TTS_OK.exists():
        return set()
    lines = (ln.split("#")[0].strip() for ln in TTS_OK.read_text(encoding="utf8").splitlines())
    return {ln for ln in lines if ln}


def current_readings(data_dir=DATA) -> dict:
    """What each clip's `f` must say now: {form or example id: jp}. Stage 1 content first, then the lexicon, then the
    example files (sentences, HKCanCor, words.hk)."""
    data_dir = Path(data_dir)
    out = {}
    for i, (_text, jp) in _examples(data_dir).items():
        out[i] = jp
    for w in _load(data_dir / "lexicon.json")["words"]:
        out[w[0]] = w[1]
    for les in _load(data_dir / "course.json")["stage1"]["lessons"]:
        for it in les["items"]:
            out[it["form"]] = it["jp"]
    return out


def publish(manifest=None, speech_json=None, speech_dir=None, mismatched=None, uncalibrated=None, accepted=None,
            checked=None, stats=None, current=None, onesyl_pass=None):
    """Write speech.json from the manifest. A clip ships only if the clip check covered it (matched, unsure or
    unsegmented; mismatched only when its key is in tts_ok.txt), its MP3 exists, and it says what the data says now:
    its `jp` equals the current reading of its `f` (`current`, default current_readings()), so a clip made before a
    reading was corrected never speaks the old reading. Voices that could not be calibrated ship only with a
    `voice:<name>` line in tts_ok.txt. `stats` (a dict) receives the counts of what was withheld."""
    if current is None:
        current = current_readings()
    speech_json, speech_dir = Path(speech_json or SPEECH_JSON), Path(speech_dir or SPEECH_DIR)
    if manifest is None:
        manifest = _load(MANIFEST) if MANIFEST.exists() else {}
    if mismatched is None or uncalibrated is None or checked is None:
        m, u, c = _check_result()
        mismatched = m if mismatched is None else mismatched
        uncalibrated = u if uncalibrated is None else uncalibrated
        checked = c if checked is None else checked
    ok = _accepted() if accepted is None else set(accepted)
    if onesyl_pass is None:
        onesyl_pass = set(_load(ONESYL)["pass"]) if ONESYL.exists() else set()
    bad = set(mismatched) - ok
    voice_ok = {v for v in uncalibrated if f"voice:{v}" in ok}
    clips, held = {}, {"stale reading": 0, "one syllable": 0, "mismatched": 0, "uncalibrated voice": 0, "not checked": 0, "no mp3": 0}
    for k, v in sorted(manifest.items()):
        if v.get("jp") is None or current.get(v["f"]) != v["jp"]:
            held["stale reading"] += 1  # the reading changed since the clip was made, or the item is gone
        elif _SYL.match(v["jp"].strip()) and k not in onesyl_pass:
            held["one syllable"] += 1  # a lone syllable often comes out with a flattened tone; only clips that pass the strict shape check ship
        elif k in bad:
            held["mismatched"] += 1
        elif v["voice"] in uncalibrated and v["voice"] not in voice_ok:
            held["uncalibrated voice"] += 1
        elif k not in checked and v["voice"] not in voice_ok:
            held["not checked"] += 1  # generated after the check, a voice added later, or its WAV was missing
        elif not (speech_dir / f"{k}.mp3").exists():
            held["no mp3"] += 1
        else:
            clips[k] = {"f": v["f"], "r": v["r"], "v": v["voice"]}
    speech_json.parent.mkdir(parents=True, exist_ok=True)
    speech_json.write_text(json.dumps({"licence": LICENCE, "clips": clips}, ensure_ascii=False, indent=0) + chr(10), encoding="utf8")
    if stats is not None:
        stats["held"] = held
        stats["unreferenced"] = sorted(p.name for p in speech_dir.glob("*.mp3") if p.stem not in clips) if speech_dir.exists() else []
    return clips


def _save_manifest(mpath, manifest):
    """Atomic: write a temporary file, then replace, so a killed run never leaves a half-written manifest."""
    tmp = mpath.with_suffix(".tmp")
    tmp.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf8")
    os.replace(tmp, mpath)


def run(jobs, session, region, key, speech_dir=None, raw_dir=None, sleep=None, out=print, calib_dir=None, pace=0.0, deadline=None):
    """`pace`: seconds to wait after each request (the free F0 tier allows about 20 requests a minute).
    `deadline`: a time.time() after which the run stops cleanly, saving the manifest (a later run resumes)."""
    raw_dir, speech_dir = Path(raw_dir or RAW_TTS), Path(speech_dir or SPEECH_DIR)
    raw_dir.mkdir(parents=True, exist_ok=True)
    speech_dir.mkdir(parents=True, exist_ok=True)
    mpath = raw_dir / "manifest.json"
    manifest = json.loads(mpath.read_text(encoding="utf8")) if mpath.exists() else {}
    done = failed = 0
    try:
        for n, job in enumerate(jobs, 1):
            if deadline is not None and time.time() >= deadline:
                out(f"time limit reached after {n - 1}/{len(jobs)} jobs; a later --run resumes from here")
                break
            try:
                wav = synthesise(session, region, key, job, sleep)
                if pace:
                    (sleep or time.sleep)(pace)
                if not wav:
                    raise ValueError("empty audio in the response")
            except ValueError as e:  # our own messages only; they never carry transport text, the key or headers
                failed += 1
                out(f"skip {job.f} ({job.rate}): {e}")
                continue
            if job.kind == "calib":
                cp = (calib_dir or raw_dir / "calib") / job.voice / f"{job.f}.wav"
                cp.parent.mkdir(parents=True, exist_ok=True)
                cp.write_bytes(wav)
                done += 1
                continue
            wp = raw_dir / f"{job.key}.wav"
            wp.write_bytes(wav)
            try:
                mp3 = encode(wp, WAV_RATE)
            except (AssertionError, wave.Error, EOFError) as e:  # not the 24 kHz mono 16-bit WAV we asked for
                failed += 1
                out(f"skip {job.f} ({job.rate}): unusable audio ({type(e).__name__})")
                wp.unlink()
                continue
            (speech_dir / f"{job.key}.mp3").write_bytes(mp3)
            manifest[job.key] = {"f": job.f, "r": job.rate, "voice": job.voice, "text": job.text, "jp": job.jp}
            done += 1
            # Saved after every clip: a killed run must not leave MP3s the manifest does not know (a resume would skip them).
            _save_manifest(mpath, manifest)
            if n % 25 == 0:
                out(f"{n}/{len(jobs)}")
    finally:
        _save_manifest(mpath, manifest)
    return done, failed, manifest


def main(argv=None, env=None, session=None, out=print):
    ap = argparse.ArgumentParser(prog="python -m jiesuo.yue.tts")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--run", action="store_true")
    g.add_argument("--publish", action="store_true")
    ap.add_argument("--limit", type=int, default=None, help="at most N clips this run")
    ap.add_argument("--words", type=int, default=2000, help="how many course words to cover")
    ap.add_argument("--voice", default=DEFAULT_VOICE, choices=VOICES)
    ap.add_argument("--minutes", type=float, default=None, help="stop cleanly after this many minutes")
    ap.add_argument("--pace", type=float, default=0.0, help="seconds between requests (3.1 keeps the free tier's 20 a minute)")
    a = ap.parse_args(argv)
    env = os.environ if env is None else env
    if a.publish:
        stats = {}
        try:
            n = len(publish(stats=stats))
        except NotChecked as e:
            out(str(e))
            return 1
        out(f"speech.json: {n} clips")
        for why, c in stats["held"].items():
            if c:
                out(f"withheld {c} clips: {why}" + (" - not checked, rerun the clip check (node scripts/yue_clip_check.js data/raw/yue/tts)" if why == "not checked" else ""))
        if stats["unreferenced"]:
            out(f"{len(stats['unreferenced'])} MP3s in app/yue/audio/speech/ are not in speech.json (do not commit them); listed in reports/yue_tts_publish.md")
        nl = chr(10)
        REPORT_PUBLISH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PUBLISH.write_text("# Azure clips publish" + nl + nl + "".join(f"- withheld, {w}: {c}" + nl for w, c in stats["held"].items())
                                  + nl + "MP3s in app/yue/audio/speech/ not referenced by speech.json (do not commit):" + nl + nl
                                  + "".join(f"- {u}" + nl for u in stats["unreferenced"]), encoding="utf8")
        return 0
    jobs = plan(a.words, a.voice)
    if a.dry_run:
        out(f"{len(jobs)} jobs ({sum(j.kind == 'calib' for j in jobs)} calibration), {sum(len(j.text) for j in jobs)} characters")
        return 0
    key, region = env.get("AZURE_SPEECH_KEY"), env.get("AZURE_SPEECH_REGION")
    missing = [n for n, v in (("AZURE_SPEECH_KEY", key), ("AZURE_SPEECH_REGION", region)) if not v]
    if missing:
        out("missing environment variable(s): " + ", ".join(missing))
        return 2
    key, region = key.strip(), region.strip()
    if not re.fullmatch(r"[\x21-\x7e]+", key):  # no whitespace, control or non-ASCII characters in a header value
        out("AZURE_SPEECH_KEY contains characters that are not allowed in a key (whitespace or control characters); re-set the variable")
        return 2
    if not re.fullmatch(r"[A-Za-z0-9-]+", region):
        out("AZURE_SPEECH_REGION is not a plain region name such as eastasia; re-set the variable")
        return 2
    if a.limit is not None:
        jobs = jobs[:a.limit]
    try:
        done, failed, manifest = run(jobs, session or _UrllibSession(), region, key, out=out, pace=a.pace,
                                     deadline=None if a.minutes is None else time.time() + a.minutes * 60)
    except FatalError as e:
        out(str(e))
        return 1
    out(f"made {done} clips, {failed} failed; speech.json is only written by --publish, after the clip check")
    out("next: node scripts/yue_clip_check.js data/raw/yue/tts, then python -m jiesuo.yue.tts --publish")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
