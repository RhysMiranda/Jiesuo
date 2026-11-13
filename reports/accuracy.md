# Accuracy fixes and measurements (2026-11-13)

## Everyday words missing from the vocabulary

wordfreq leans towards web and news text, so household words such as 橙子, 抽屉, 胡萝卜 and 洋葱
fell below the top-10,000 cutoff. Two changes in `jiesuo/build_graph.py`:

- **Words from training sentences.** A dictionary word made of graph characters is added if it
  appears in at least 2 training sentences. Names are excluded. This added 2,519 words. Held-out
  sentences are never looked at.
- **Splitting down to characters.** A token like 桌上 can now split into 桌 + 上 even though 桌
  is not a word on its own.

| | Before | After |
|---|---:|---:|
| Training sentences in the graph | 51,826 | 56,068 |
| Training sentences dropped for an unreadable token | 4,842 | 600 |

The 600 still dropped contain a character outside the graph (烟囱, 蟑螂). All orders share the
same vocabulary, so the comparison between orders stays fair. Coverage figures moved by under
1 point, because some tokens that used to be split are now whole words with their own cost.

## Traditional text in Read

Before: Read converted each word separately, so a pasted 髮 was shown as 發, the form for "to issue".

Now:

- **Text typed in Traditional:** it is shown exactly as typed.
- **Text typed in Simplified:** it is converted word by word.
- **A lone character with more than one Traditional form (发, 干):** it gets a small "?" that lists
  the other forms. Characters the conversion leaves unchanged, such as 了, are not flagged.

Regression tests are in `tests/app.test.js`.

## Word splitting, against hand-checked UD tokens

| Corpus | jieba F1 | App F1 | App against jieba F1 |
|---|---:|---:|---:|
| Hong Kong subtitles and LegCo | 0.828 | 0.824 | 0.862 |
| Wikipedia and news | 0.795 | 0.737 | 0.781 |

- **The app's splitter:** it is as good as jieba on Hong Kong speech, but worse on wiki and news.
  Names and technical terms it doesn't know fall apart into single characters.
- **What that does to Read:** it can overstate how much you can read on encyclopaedic text,
  because it counts 奥巴马 as three known characters.
- **Why both scores are below 1:** UD splits more finely than a learner would, so neither splitter
  can match it exactly.

Reproduce with `python scripts/segmentation_check.py`.

## Grammar detection

Sample of 200 detected examples and 200 sentences where a detector did not fire, though every
word the pattern needs was present. Seed 20261113. The labels are mine, in
`reports/grammar_audit.tsv`. Change any you disagree with and rerun
`python scripts/grammar_audit.py score`.

| | Estimate | 95% interval |
|---|---:|---:|
| Precision (detected examples that are real) | 91.5% | 86.8% to 94.6% |
| Recall (real uses that are detected) | 65% | 59% to 70% |

- **Precision:** about 1 in 12 example sentences shown for a pattern is wrong. The worst offenders:
  - clock-time matches 一点 meaning "a little".
  - guo-experience matches directional 过 (跳过).
  - zhe-state matches 试着.
  - The two 在 location patterns match verb + 在 (住在, 困在).
- **Recall:** most misses come from three patterns:
  - **Descriptive 的:** 14 of 65 misses, when the describer isn't a noun or pronoun (同样的服务员).
  - **Sentence-final verb + 了:** 10 misses (他死了).
  - **是 before a measure word:** 5 misses (这是个副词).
- **What the recall covers:** only sentences that contain the pattern's required words. For a pattern
  whose required word isn't strictly necessary, real recall is lower.

I left the detectors unchanged after measuring, so these figures describe what the app ships.
Fixing the patterns above would need a fresh sample to re-measure.
