#!/usr/bin/env python3
"""Word-splitting accuracy of jieba and of the app, against UD's hand-checked tokens.

Only Han characters are compared. UD splits more finely than a learner would (it often
separates 们 or 的), so the scores are for comparing the two splitters, not absolute.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import jieba  # noqa: E402

from jiesuo import corpora  # noqa: E402
from jiesuo.build_graph import T2S  # noqa: E402
from jiesuo.sources import HAN_CHAR  # noqa: E402


def spans(tokens):
    out, at = set(), 0
    for t in tokens:
        k = len(HAN_CHAR.findall(t))
        if k:
            out.add((at, at + k))
            at += k
    return out


def f1(gold, got):
    hit = sum(len(g & s) for g, s in zip(gold, got))
    p, r = hit / sum(map(len, got)), hit / sum(map(len, gold))
    return 2 * p * r / (p + r)


def main():
    jieba.setLogLevel(60)
    result = {}
    for key in corpora.CORPORA:
        sents = corpora.load(key)
        texts = [t for t, _ in sents]
        gold = [spans(g) for _, g in sents]
        jb = [spans(jieba.lcut(T2S.convert(t), HMM=False)) for t in texts]
        app = subprocess.run(["node", str(ROOT / "scripts" / "app_tokens.js")], input=json.dumps(texts),
                             capture_output=True, text=True, check=True)
        ap = [spans(t) for t in json.loads(app.stdout)]
        agree = f1(jb, ap)
        result[key] = {"jieba_f1": round(f1(gold, jb), 4), "app_f1": round(f1(gold, ap), 4), "app_vs_jieba_f1": round(agree, 4)}
        print(key, result[key])
    (ROOT / "reports" / "segmentation.json").write_text(json.dumps(result, indent=1) + "\n")


if __name__ == "__main__":
    main()
