"""Build-time Azure Speech audio for words and sentences, with exact Jyutping via SSML.

    python -m jiesuo.yue.tts --dry-run
    python -m jiesuo.yue.tts --run [--limit N] [--voice V]     (needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION)
    python -m jiesuo.yue.tts --publish                          (rebuild speech.json after node scripts/yue_clip_check.js)

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
TTS_OK = ROOT / "data" / "yue" / "tts_ok.txt"  # keys the learner listened to and accepted despite a mismatch

VOICES = ["zh-HK-HiuMaanNeural", "zh-HK-WanLungNeural"]
DEFAULT_VOICE = VOICES[0]
SENTENCE_RATES = ["0%", "-25%"]
WAV_RATE = 24000
OUTPUT_FORMAT = "riff-24khz-16bit-mono-pcm"
LICENCE = ("Generated with Azure Speech (zh-HK neural voices: HiuMaan, WanLung) from our own Jyutping readings. "
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
    kind: str  # "word" or "sentence"
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


def plan(limit_words=2000, voice=DEFAULT_VOICE, speech_dir=None, data_dir=DATA):
    """Jobs for the first `limit_words` course words, Stage 1, lesson sentences and grammar examples, minus existing clips."""
    data_dir, speech_dir = Path(data_dir), Path(speech_dir or SPEECH_DIR)
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
        except OSError as e:  # network trouble: retry; say only the error class
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


def _mismatched():
    return set(_load(CHECK_RESULT)["mismatched"]) if CHECK_RESULT.exists() else set()


def _accepted():
    if not TTS_OK.exists():
        return set()
    lines = (ln.split("#")[0].strip() for ln in TTS_OK.read_text(encoding="utf8").splitlines())
    return {ln for ln in lines if ln}


def publish(manifest=None, speech_json=None, speech_dir=None, mismatched=None, accepted=None):
    """Write speech.json from the manifest: only clips whose MP3 exists, minus mismatched clips not in tts_ok.txt."""
    speech_json, speech_dir = Path(speech_json or SPEECH_JSON), Path(speech_dir or SPEECH_DIR)
    if manifest is None:
        manifest = _load(MANIFEST) if MANIFEST.exists() else {}
    bad = (_mismatched() if mismatched is None else set(mismatched)) - (_accepted() if accepted is None else set(accepted))
    clips = {k: {"f": v["f"], "r": v["r"], "v": v["voice"]} for k, v in sorted(manifest.items())
             if k not in bad and (speech_dir / f"{k}.mp3").exists()}
    speech_json.parent.mkdir(parents=True, exist_ok=True)
    speech_json.write_text(json.dumps({"licence": LICENCE, "clips": clips}, ensure_ascii=False, indent=0) + "\n", encoding="utf8")
    return clips


def run(jobs, session, region, key, speech_dir=None, raw_dir=None, sleep=None, out=print):
    raw_dir, speech_dir = Path(raw_dir or RAW_TTS), Path(speech_dir or SPEECH_DIR)
    raw_dir.mkdir(parents=True, exist_ok=True)
    speech_dir.mkdir(parents=True, exist_ok=True)
    mpath = raw_dir / "manifest.json"
    manifest = json.loads(mpath.read_text(encoding="utf8")) if mpath.exists() else {}
    done = failed = 0
    try:
        for n, job in enumerate(jobs, 1):
            try:
                wav = synthesise(session, region, key, job, sleep)
            except ValueError as e:
                failed += 1
                out(f"skip {job.f} ({job.rate}): {e}")
                continue
            wp = raw_dir / f"{job.key}.wav"
            wp.write_bytes(wav)
            (speech_dir / f"{job.key}.mp3").write_bytes(encode(wp, WAV_RATE))
            manifest[job.key] = {"f": job.f, "r": job.rate, "voice": job.voice, "text": job.text, "jp": job.jp}
            done += 1
            if n % 25 == 0:
                mpath.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf8")
                out(f"{n}/{len(jobs)}")
    finally:
        mpath.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf8")
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
    a = ap.parse_args(argv)
    env = os.environ if env is None else env
    if a.publish:
        out(f"speech.json: {len(publish())} clips")
        return 0
    jobs = plan(a.words, a.voice)
    if a.dry_run:
        out(f"{len(jobs)} jobs, {sum(len(j.text) for j in jobs)} characters")
        return 0
    key, region = env.get("AZURE_SPEECH_KEY"), env.get("AZURE_SPEECH_REGION")
    missing = [n for n, v in (("AZURE_SPEECH_KEY", key), ("AZURE_SPEECH_REGION", region)) if not v]
    if missing:
        out("missing environment variable(s): " + ", ".join(missing))
        return 2
    if a.limit is not None:
        jobs = jobs[:a.limit]
    try:
        done, failed, manifest = run(jobs, session or _UrllibSession(), region, key, out=out)
    except FatalError as e:
        out(str(e))
        return 1
    out(f"made {done} clips, {failed} failed; speech.json: {len(publish(manifest))} clips")
    out("next: node scripts/yue_clip_check.js data/raw/yue/tts, then python -m jiesuo.yue.tts --publish")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
