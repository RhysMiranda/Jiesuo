# Data licences

Checked on 2026-11-04 by reading each licence file or the publisher's own statement.
This is an engineer's reading, not legal advice.

The MIT licence in `LICENSE` covers this repo's code and the hand-written grammar list
in `jiesuo/grammar.py`. It does not cover the data below.

## Used and redistributable

| Source | Exact file | Licence (where it was read) | Used for | Attribution needed |
|---|---|---|---|---|
| [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) | `dictionary.txt` only (not `graphics.txt`) | LGPL-3.0-or-later ([COPYING](https://raw.githubusercontent.com/skishore/makemeahanzi/master/COPYING)) | Decompositions, phonetic and semantic roles | Ship the LGPL text; offer the modified data. Derived from Unihan and CJKlib |
| [CC-CEDICT](https://cc-cedict.org/wiki/) | `cedict.json` from npm [`cedict-json@1.3.20251213`](https://www.npmjs.com/package/cedict-json) | CC BY-SA 4.0 ([project wiki](https://cc-cedict.org/wiki/), and the licence file in the package) | Pinyin, English glosses, Traditional forms, the "is it a word" filter | Credit CC-CEDICT, link the licence, share derived data alike |
| [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1 | `large_zh.msgpack.gz` inside the wheel | Code Apache-2.0; data CC BY-SA 4.0 (package `METADATA`, License section) | Word and character frequency ranks | Credit wordfreq, and through it the SUBTLEX authors (Cai & Brysbaert 2010), OpenSubtitles and Google Books Ngrams. State that SUBTLEX is freely available data |
| [elkmovie/hsk30](https://github.com/elkmovie/hsk30) | `wordlist.txt`, `charlist.txt` | MIT, Pleco Inc. ([LICENSE](https://raw.githubusercontent.com/elkmovie/hsk30/main/LICENSE)) | HSK 3.0 bands | Keep the copyright notice. Its header warns it is OCR and not fully proofread. The official list behind it is a Chinese Ministry of Education publication with no stated licence |
| [Tatoeba](https://tatoeba.org/) | `sentences.json` from npm [`tatoeba-sentence-pairs-in-mandarin-chinese-english@0.20260520.0`](https://www.npmjs.com/package/tatoeba-sentence-pairs-in-mandarin-chinese-english) | CC BY 2.0 FR ([Tatoeba's help article](https://en.wiki.tatoeba.org/history/show-version/3364)) | Example sentences, held-out test text | Name each sentence's author. Met: every shipped sentence and translation names its Tatoeba author, from Tatoeba's own exports (see below) |
| [OpenCC](https://github.com/BYVoid/OpenCC) 1.4.2 | `s2hk` and `t2s` configs in the wheel | Apache-2.0 ([LICENSE](https://raw.githubusercontent.com/BYVoid/OpenCC/master/LICENSE)) | Simplified/Traditional conversion, Hong Kong forms | Keep the licence and notices |
| [jieba](https://github.com/fxsjy/jieba) 0.42.1 | Built-in dictionary | MIT ([LICENSE](https://raw.githubusercontent.com/fxsjy/jieba/master/LICENSE)) | Segmentation and POS tags | Keep the notice |

## Dropped or replaced

| Source | Decision | Why |
|---|---|---|
| SUBTLEX-CH raw tables | Not in the graph and never shipped. Used only to report coverage | [The paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC2880003) makes the frequencies "freely available for research purposes" and names no data licence. The article's CC BY covers the article. The npm copies say MIT, but the republisher cannot grant that. Replaced by wordfreq, whose author records e-mail permission from Marc Brysbaert for use beyond research |
| [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) | Replaced by elkmovie/hsk30 | Labelled MIT, but it merges CC-CEDICT definitions (CC BY-SA) and SUBTLEX-derived data, so the label does not hold for the whole file |
| Chinese Grammar Wiki and similar sites | Never consulted for text | Copyrighted. Grammar patterns here are original |

## Republished copies

mdbg.net (CC-CEDICT), downloads.tatoeba.org and ugent.be could not be reached from the
build environment, so the CC-CEDICT and Tatoeba files come from versioned npm packages.
`data/manifest.json` records URL and sha256. Licences above are from upstream, and the
`MIT` in the Tatoeba package's metadata is ignored. These copies have not been compared
with the upstream downloads.

## Licence texts shipped with the app

`app/licences/` is published with the app and linked from the Progress screen. It holds
the GNU LGPL 3 and GPL 3 texts (taken from R 4.4.2's copies, byte-identical to gnulib's,
because gnu.org was unreachable), the Make Me a Hanzi notice, and the MIT and Apache
licence files for Jiesuo, hsk30, OpenCC and jieba (same sha256 as in `data/manifest.json`).
Its `index.html` says which data file is under which licence and what was changed. The CC
licences are linked by URL, which both CC licences allow.

The icons in `app/icons/` are drawn by `scripts/make_icons.py` with LXGW WenKai TC
(SIL OFL 1.1). Pictures drawn with a font are not covered by the OFL's conditions.

## Tatoeba author names

The npm copy has sentence IDs but no usernames. `jiesuo/tatoeba_credits.py` (run by
`export_app`, or on its own) reads Tatoeba's weekly exports from downloads.tatoeba.org
(`cmn_sentences_detailed`, `cmn-eng_links`, `eng_sentences_detailed`, `sentences_CC0`;
hashes in `data/manifest.json`) and applies these rules to each shipped row:

- The Chinese sentence must still exist with the same text and have an owner, or the row is
  dropped. On 2026-11-13 this dropped 72 of 12,313 rows (1 deleted, 71 edited upstream).
- The English shown is the linked translation with the same text if it has an owner or is
  marked CC0, else another linked English sentence that does, else none. 548 rows ship
  Chinese only, because every linked English translation is unowned (mostly old Tanaka
  Corpus imports) and so has no author to name.

The app shows "Tatoeba #id by author, English #id by author" under each example, linking
both pages. Owners can change on Tatoeba, so rerun the step before each data release.

## Open issues before a public release

1. **Licence separation.** The app ships separate files in `app/data/`: `dict.json` (CC BY-SA 4.0),
   `parts.json` (LGPL), `sentences.json` (CC BY 2.0 FR), `hsk.json` and `grammar.json` (MIT).
   `order.json` holds only computed positions, derived from several of these, and is the file a
   licensing reviewer should look at first. `data/graph/` mixes everything and stays git-ignored.
   Whether this separation is enough is worth a second opinion from someone who does licensing.
