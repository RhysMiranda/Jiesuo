#!/usr/bin/env python3
"""Download the Cantonese raw inputs into data/raw/yue/ and record sha256 hashes.

Nothing here is executed from the downloads. data/raw/ is not committed; the
manifest (data/yue/manifest.json) is. Every URL is pinned to a commit or a
dated release. The words.hk CSVs are not downloaded: they are hashed from
data/raw/wordshk/ if present.

Usage: python scripts/fetch_yue_data.py [--check | --update]
"""
import hashlib
import http.client
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "yue"
WORDSHK = ROOT / "data" / "raw" / "wordshk"
MANIFEST = ROOT / "data" / "yue" / "manifest.json"
GH = "https://raw.githubusercontent.com"
RIME = f"{GH}/rime/rime-cantonese/259f0e48bba840c3a2e0d117539e96937f3d89bc"
HKC = f"{GH}/fcbond/hkcancor/39aeadf920e0b5ca93d0ad7792c59e740e7bdd65"
FONTS = f"{GH}/google/fonts/29b4ec6df2522a8aee279414b78a07910b065874/ofl/notoserifhk"
CANTONE_REV = "9ae2dec425f472255c1e146cd6b3f428e7c21e80"
CANTONE_API = f"https://huggingface.co/api/datasets/AlienKevin/cantone/revision/{CANTONE_REV}"
CANTONE_FILE = f"https://huggingface.co/datasets/AlienKevin/cantone/resolve/{CANTONE_REV}"

SOURCES = {
    "rime_chars.dict.yaml": f"{RIME}/jyut6ping3.chars.dict.yaml",
    "rime_words.dict.yaml": f"{RIME}/jyut6ping3.words.dict.yaml",
    "rime_LICENSE-CC-BY.txt": f"{RIME}/LICENSE-CC-BY",
    "cccanto.zip": "https://cantonese.org/cccanto-170202.zip",
    "cccedict_canto_readings.zip": "https://cantonese.org/cccedict-canto-readings-150923.zip",
    "Unihan.zip": "https://www.unicode.org/Public/16.0.0/ucd/Unihan.zip",
    "hkcancor-utf8.zip": f"{HKC}/data/hkcancor-utf8.zip",
    "hkcancor_LICENSE.txt": f"{HKC}/data/LICENSE",
    # Variable font (google/fonts ships no static Regular), for the glyph-coverage test.
    "NotoSerifHK.ttf": f"{FONTS}/NotoSerifHK%5Bwght%5D.ttf",
    "NotoSerifHK_OFL.txt": f"{FONTS}/OFL.txt",
}

WORKERS = 12
RETRIES = 10


def get(url):
    """GET with exponential backoff on 429 and 5xx."""
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                body = r.read()
                want = r.headers.get("Content-Length")
            if want is not None and want.isdigit() and int(want) != len(body):
                raise http.client.IncompleteRead(body, int(want) - len(body))
            return body
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500 or attempt == RETRIES - 1:
                raise
            ra = e.headers.get("Retry-After", "")
            if ra.isdigit():
                time.sleep(min(int(ra), 120))
                continue
        except (urllib.error.URLError, http.client.HTTPException, OSError):
            if attempt == RETRIES - 1:
                raise
        time.sleep(min(2 ** attempt, 60))


def write_atomic(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    tmp.write_bytes(body)
    tmp.replace(path)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cantone_paths():
    siblings = json.loads(get(CANTONE_API))["siblings"]
    return sorted(s["rfilename"] for s in siblings if s["rfilename"] not in ("README.md", ".gitattributes"))


def fetch_cantone_one(rel):
    path = RAW / "cantone" / rel
    if not path.exists():
        write_atomic(path, get(f"{CANTONE_FILE}/{rel}"))
    return rel


def cantone_entry(paths):
    lines = [f"{rel} {sha256(RAW / 'cantone' / rel)}" for rel in paths]
    total = sum((RAW / "cantone" / rel).stat().st_size for rel in paths)
    digest = hashlib.sha256("\n".join(lines).encode()).hexdigest()
    return {"url": CANTONE_API, "files": len(paths), "sha256": digest, "bytes": total}


def wordshk_entry():
    files = sorted([*WORDSHK.glob("all-*.csv"), *WORDSHK.glob("wordpos-*.csv")])
    if not files:
        print("NOTE: data/raw/wordshk/ has no all-*.csv or wordpos-*.csv; skipping 'wordshk'.")
        return None
    lines = [f"{p.name} {sha256(p)}" for p in files]
    return {
        "files": [p.name for p in files],
        "sha256": hashlib.sha256("\n".join(lines).encode()).hexdigest(),
        "bytes": sum(p.stat().st_size for p in files),
    }


def mismatches(existing, fresh):
    """Names whose fresh hash differs from the manifest entry already recorded."""
    return [n for n, e in fresh.items() if n in existing and existing[n]["sha256"] != e["sha256"]]


def merge_manifest(path, fresh, update=False):
    """Write fresh entries. Entries already in the manifest must match unless update.
    Returns the list of mismatched names (nothing is written if any, without update)."""
    existing = json.loads(path.read_text()) if path.exists() else {}
    bad = mismatches(existing, fresh)
    if bad and not update:
        return bad
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({**existing, **fresh}, indent=1) + "\n")
    return bad


def check():
    expected = json.loads(MANIFEST.read_text())
    bad = []
    for name in SOURCES:
        if sha256(RAW / name) != expected[name]["sha256"]:
            bad.append(name)
    paths = sorted(
        str(p.relative_to(RAW / "cantone")).replace("\\", "/") for p in (RAW / "cantone").rglob("*.wav")
    )
    if cantone_entry(paths)["sha256"] != expected["cantone"]["sha256"]:
        bad.append("cantone")
    w = wordshk_entry()
    if w and w["sha256"] != expected["wordshk"]["sha256"]:
        bad.append("wordshk")
    print("OK" if not bad else f"MISMATCH: {bad}")
    sys.exit(bool(bad))


def main():
    if "--check" in sys.argv:
        check()
    RAW.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, url in SOURCES.items():
        path = RAW / name
        if not path.exists():
            write_atomic(path, get(url))
        manifest[name] = {"url": url, "sha256": sha256(path), "bytes": path.stat().st_size}
        print(f"{name:34} {path.stat().st_size:>10,}")
    paths = cantone_paths()
    todo = [p for p in paths if not (RAW / "cantone" / p).exists()]
    print(f"cantone: {len(paths)} files, {len(todo)} to download")
    with ThreadPoolExecutor(WORKERS) as pool:
        for i, _ in enumerate(pool.map(fetch_cantone_one, todo), 1):
            if i % 2000 == 0:
                print(f"  {i}/{len(todo)}", flush=True)
    manifest["cantone"] = cantone_entry(paths)
    w = wordshk_entry()
    if w:
        manifest["wordshk"] = w
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=1) + "\n")


if __name__ == "__main__":
    main()
