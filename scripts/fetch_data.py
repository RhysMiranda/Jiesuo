#!/usr/bin/env python3
"""Download the raw inputs into data/raw/ and record sha256 hashes.

Nothing here is executed from the downloads: npm tarballs are only unpacked
for their data file. data/raw/ is not committed; the manifest is.

Usage: python scripts/fetch_data.py [--check]
"""
import hashlib
import io
import json
import sys
import tarfile
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
MANIFEST = RAW.parent / "manifest.json"
GH = "https://raw.githubusercontent.com"
NPM = "https://registry.npmjs.org"
TATOEBA = "https://downloads.tatoeba.org/exports"

# name -> (url, member inside the tarball or None)
SOURCES = {
    "mmh_dictionary.txt": (f"{GH}/skishore/makemeahanzi/master/dictionary.txt", None),
    "mmh_COPYING.txt": (f"{GH}/skishore/makemeahanzi/master/COPYING", None),
    "hsk30_wordlist.txt": (f"{GH}/elkmovie/hsk30/main/wordlist.txt", None),
    "hsk30_charlist.txt": (f"{GH}/elkmovie/hsk30/main/charlist.txt", None),
    "hsk30_LICENSE.txt": (f"{GH}/elkmovie/hsk30/main/LICENSE", None),
    "opencc_STCharacters.txt": (f"{GH}/BYVoid/OpenCC/master/data/dictionary/STCharacters.txt", None),
    "opencc_TSCharacters.txt": (f"{GH}/BYVoid/OpenCC/master/data/dictionary/TSCharacters.txt", None),
    "opencc_HKVariants.txt": (f"{GH}/BYVoid/OpenCC/master/data/dictionary/HKVariants.txt", None),
    "opencc_LICENSE.txt": (f"{GH}/BYVoid/OpenCC/master/LICENSE", None),
    "jieba_LICENSE.txt": (f"{GH}/fxsjy/jieba/master/LICENSE", None),
    # CC-CEDICT and Tatoeba: their home hosts were not reachable from the build
    # environment, so we use versioned republications from the npm registry.
    # The licence comes from upstream, not the npm "license" field. See LICENSES.md.
    "cedict.json": (f"{NPM}/cedict-json/-/cedict-json-1.3.20251213.tgz", "package/cedict.json"),
    "cedict_LICENSE.txt": (f"{NPM}/cedict-json/-/cedict-json-1.3.20251213.tgz", "package/LICENSE"),
    "tatoeba_cmn_eng.json": (
        f"{NPM}/tatoeba-sentence-pairs-in-mandarin-chinese-english/-/"
        "tatoeba-sentence-pairs-in-mandarin-chinese-english-0.20260520.0.tgz",
        "package/sentences.json",
    ),
    # Tatoeba's own exports, for author names (CC BY 2.0 FR needs them). Refreshed
    # weekly upstream, so the hashes in the manifest record the copy actually used.
    "tatoeba/cmn_sentences_detailed.tsv.bz2": (f"{TATOEBA}/per_language/cmn/cmn_sentences_detailed.tsv.bz2", None),
    "tatoeba/cmn-eng_links.tsv.bz2": (f"{TATOEBA}/per_language/cmn/cmn-eng_links.tsv.bz2", None),
    "tatoeba/eng_sentences_detailed.tsv.bz2": (f"{TATOEBA}/per_language/eng/eng_sentences_detailed.tsv.bz2", None),
    "tatoeba/sentences_CC0.tar.bz2": (f"{TATOEBA}/sentences_CC0.tar.bz2", None),
}

# Evaluation only: used to report coverage, never shipped or joined into the
# graph, because upstream offers the raw tables "for research purposes".
EVAL_ONLY = {
    "eval_only_subtlex_chr.json": (f"{NPM}/subtlex-ch-chr/-/subtlex-ch-chr-0.0.0.tgz", "package/SUBTLEX-CH-CHR.json"),
    "eval_only_subtlex_wf.json": (f"{NPM}/subtlex-ch-wf/-/subtlex-ch-wf-0.0.0.tgz", "package/SUBTLEX-CH-WF.json"),
    # Second test corpora (Universal Dependencies, CC BY-SA). Evaluation only, never shipped.
    "eval_only_ud_gsdsimp_test.conllu": (f"{GH}/UniversalDependencies/UD_Chinese-GSDSimp/master/zh_gsdsimp-ud-test.conllu", None),
    "eval_only_ud_hk_test.conllu": (f"{GH}/UniversalDependencies/UD_Chinese-HK/master/zh_hk-ud-test.conllu", None),
    "eval_only_ud_pud_test.conllu": (f"{GH}/UniversalDependencies/UD_Chinese-PUD/master/zh_pud-ud-test.conllu", None),
}


def fetch(url, member):
    with urllib.request.urlopen(url, timeout=120) as r:
        body = r.read()
    if member is None:
        return body
    with tarfile.open(fileobj=io.BytesIO(body)) as tar:
        return tar.extractfile(member).read()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    everything = {**SOURCES, **EVAL_ONLY}
    if "--check" in sys.argv:
        expected = json.loads(MANIFEST.read_text())
        bad = [n for n, e in expected.items() if sha256(RAW / n) != e["sha256"]]
        print("OK" if not bad else f"MISMATCH: {bad}")
        sys.exit(bool(bad))
    manifest = {}
    for name, (url, member) in everything.items():
        path = RAW / name
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(fetch(url, member))
        manifest[name] = {"url": url, "member": member, "sha256": sha256(path), "bytes": path.stat().st_size}
        print(f"{name:34} {path.stat().st_size:>10,}")
    MANIFEST.write_text(json.dumps(manifest, indent=1) + "\n")
    # wordfreq and jieba ship their data inside the pip packages pinned in
    # requirements.txt, so they are not downloaded here.


if __name__ == "__main__":
    main()
