# Data licences

Checked on 2026-11-04 by reading each licence file or the publisher's own statement.
This is an engineer's reading, not legal advice.

The MIT licence in `LICENSE` covers this repo's code and the hand-written grammar list
in `jiesuo/grammar.py`. It does not cover the data below.

## Used and redistributable

| Source | Exact file | Licence (where it was read) | Used for | Attribution needed |
|---|---|---|---|---|
| [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) | `dictionary.txt` | LGPL-3.0-or-later ([COPYING](https://raw.githubusercontent.com/skishore/makemeahanzi/master/COPYING)) | Decompositions, phonetic and semantic roles (`parts.json`); which strokes belong to which part (`stroke-parts.json`) | Ship the LGPL text; offer the modified data. Derived from Unihan and CJKlib |
| [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) | `graphics.txt` | Arphic Public License ([COPYING](https://raw.githubusercontent.com/skishore/makemeahanzi/master/COPYING), [ARPHICPL.TXT](https://raw.githubusercontent.com/skishore/makemeahanzi/master/APL/english/ARPHICPL.TXT)) | Stroke outlines and medians for writing practice, one file per glyph in `app/strokes/`; start, middle and end points of each stroke in `app/data/handwriting.json` for handwriting search | Ship the licence text with the files; modified versions stay under the same licence. Derived from Arphic PL KaitiM GB and UKai |
| [OpenMoji](https://openmoji.org/) 17.0.0 | Colour SVGs, fetched one by one from jsDelivr | CC BY-SA 4.0 (`LICENSE.txt` in the package; graphics only, the code is LGPL) | Pictures for about 480 concrete words, unmodified, in `app/pictures/` | Credit OpenMoji in the app (Progress screen and licences page) and keep the licence; the word-to-picture list in `app/data/pictures.json` is this project's, MIT |
| [emojibase-data](https://github.com/milesj/emojibase) 16.0.3 | `en/data.json` (Unicode CLDR emoji names) | MIT | Build time only: suggests a picture when a word's first meaning is an emoji's name; hand-checked through `data/pictures/` | None in the app; not shipped |
| [Hanzi Writer](https://github.com/chanind/hanzi-writer) 3.7.3 | `dist/hanzi-writer.min.js` from npm | MIT (licence file in the package) | Stroke animation and stroke checking in the Write panel | Keep the notice |
| [CC-CEDICT](https://cc-cedict.org/wiki/) | `cedict.json` from npm [`cedict-json@1.3.20251213`](https://www.npmjs.com/package/cedict-json) | CC BY-SA 4.0 ([project wiki](https://cc-cedict.org/wiki/), and the licence file in the package) | Pinyin, English glosses, Traditional forms, the "is it a word" filter | Credit CC-CEDICT, link the licence, share derived data alike |
| [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1 | `large_zh.msgpack.gz` inside the wheel | Code Apache-2.0; data CC BY-SA 4.0 (package `METADATA`, License section) | Word and character frequency ranks | Credit wordfreq, and through it the SUBTLEX authors (Cai & Brysbaert 2010), OpenSubtitles and Google Books Ngrams. State that SUBTLEX is freely available data |
| [elkmovie/hsk30](https://github.com/elkmovie/hsk30) | `wordlist.txt`, `charlist.txt` | MIT, Pleco Inc. ([LICENSE](https://raw.githubusercontent.com/elkmovie/hsk30/main/LICENSE)) | HSK 3.0 bands | Keep the copyright notice. Its header warns it is OCR and not fully proofread. The official list behind it is a Chinese Ministry of Education publication with no stated licence |
| [Tatoeba](https://tatoeba.org/) | `sentences.json` from npm [`tatoeba-sentence-pairs-in-mandarin-chinese-english@0.20260520.0`](https://www.npmjs.com/package/tatoeba-sentence-pairs-in-mandarin-chinese-english) | CC BY 2.0 FR ([Tatoeba's help article](https://en.wiki.tatoeba.org/history/show-version/3364)) | Example sentences, held-out test text | Name each sentence's author. Met: every shipped sentence and translation names its Tatoeba author, from Tatoeba's own exports (see below) |
| [OpenCC](https://github.com/BYVoid/OpenCC) 1.4.2 | `s2hk` and `t2s` configs in the wheel | Apache-2.0 ([LICENSE](https://raw.githubusercontent.com/BYVoid/OpenCC/master/LICENSE)) | Simplified/Traditional conversion, Hong Kong forms | Keep the licence and notices |
| [jieba](https://github.com/fxsjy/jieba) 0.42.1 | Built-in dictionary | MIT ([LICENSE](https://raw.githubusercontent.com/fxsjy/jieba/master/LICENSE)) | Segmentation and POS tags | Keep the notice |

## Cantonese app (`app/yue/`)

| Source | Licence | Used for | Attribution needed |
|---|---|---|---|
| [rime-cantonese](https://github.com/rime/rime-cantonese) | CC BY 4.0 (`app/yue/licences/rime-cantonese-LICENSE-CC-BY.txt`) | Jyutping readings in `readings.json` | Credit, link the licence |
| [CC-Canto](https://cantonese.org/download.html) and CC-CEDICT Cantonese readings | CC BY-SA 3.0 | Checking readings; `readings.json` is shared as CC BY-SA 4.0 | Credit, link the licence, share alike |
| [HKCanCor](https://github.com/fcbond/hkcancor) | CC BY 4.0 (`app/yue/licences/HKCanCor-LICENSE.txt`) | Checking readings | Credit, link the licence |
| [Unihan](https://www.unicode.org/charts/unihan.html) | Unicode Terms of Use | Checking readings | Link the licence |
| [Cantone](https://huggingface.co/datasets/AlienKevin/cantone) | MIT (`app/yue/licences/Cantone-LICENSE.txt`) | Synthetic syllable audio in `app/yue/audio/`; voices googleA, googleB, amazonHiuJin (synthetic voices from Google and Amazon) | Keep the notice; say the voices are synthetic |
| Noto Serif HK | SIL OFL 1.1 (`app/yue/licences/NotoSerifHK-OFL.txt`) | Page font (Google Fonts) and the app icon | Keep the licence |

Note: rime-cantonese's ODbL `.maps` file is not used; only the CC BY 4.0 data is.

### Phase 2 (words and grammar), shipped in `app/yue/data/`

| Source | Licence | Used for | Conditions |
|---|---|---|---|
| [Tatoeba](https://tatoeba.org/) yue sentences with English translations | CC BY 2.0 FR (`app/yue/licences/tatoeba-NOTICE.txt`) | Example sentences in `sentences.json`, Jyutping added by us | Name each sentence's author and its translation's author: `sentences.json` items are `[text, jp, en, author, en_author, en_id]`; a sentence whose translation has no named author is not shipped |
| [words.hk](https://words.hk/) | Non-Commercial Open Data Licence 1.0 (`app/yue/licences/wordshk-NOTICE.txt`, text from https://words.hk/base/hoifong/) | Published, reviewed entries and examples in `wordshk.json`; reviewed readings for checking | Not covered by this repo's MIT licence. Non-commercial use only; no sublicensing; ship the copyright notice, disclaimer and credits list and link https://words.hk (all in `wordshk.json` and the licences page) |
| HKCanCor sentences | CC BY 4.0 (`app/yue/licences/HKCanCor-LICENSE.txt`) | Spoken example sentences in `hkcancor.json` | Credit, link the licence |
| Jiesuo word list and course (this project) | CC BY-SA 4.0 | `lexicon.json` and `course.json`, built on the readings sources above and CC-CEDICT / CC-Canto meanings; the hand-checked meanings of the first 1000 words (`data/yue/content/meanings.json`) are written by Jiesuo, checked against words.hk, CC-Canto and CC-CEDICT | Credit, link the licence, share alike. They hold no words.hk text |
| Azure Speech zh-HK neural voices (HiuMaan, WanLung) | Generated audio, no licence claim beyond that | `speech.json` and `audio/speech/` (optional; made by `python -m jiesuo.yue.tts`), generated with Azure Speech zh-HK neural voices | Say that the clips are generated with Azure Speech from our own Jyutping; the sentence texts they speak keep their own licences |
| This project | MIT | `keyboards.json` (keyboard setup steps, summarised from the pages cited on each item) | None |

`lexicon.json` and `course.json` are CC BY-SA 4.0 and hold no words.hk text. Meanings that only words.hk supplies are
in `wordshk.json`, never in the lexicon. The hand-checked meanings are Jiesuo's own words, not copied from words.hk.

Shown to the learner at `app/yue/licences/`.

## Evaluation only, never shipped

| Source | Exact files | Licence (where it was read) | Used for | Attribution needed |
|---|---|---|---|---|
| [Universal Dependencies](https://universaldependencies.org/) Chinese-HK, Chinese-GSDSimp, Chinese-PUD | `zh_hk-ud-test.conllu`, `zh_gsdsimp-ud-test.conllu`, `zh_pud-ud-test.conllu` | CC BY-SA 4.0 (HK, GSDSimp) and CC BY-SA 3.0 (PUD), from each treebank's README and LICENSE.txt | Second and third test sets, and hand-checked word boundaries | Credit the treebanks and their authors when publishing results |

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

1. **Licence separation.** The app ships separate files in `app/data/`: `dict.json` and `senses.json` (CC BY-SA 4.0),
   `parts.json` (LGPL), `sentences.json` (CC BY 2.0 FR), `hsk.json` and `grammar.json` (MIT).
   `order.json` holds only computed positions, derived from several of these, and is the file a
   licensing reviewer should look at first. `data/graph/` mixes everything and stays git-ignored.
   Whether this separation is enough is worth a second opinion from someone who does licensing.
