# Cantonese phase 2: held-out evaluation

Test set: every 5th HKCanCor sentence (2151 sentences; 8604 train). The lexicon, its readings, the word frequencies and the course order used the train split only, so none of this was seen when they were made.

Tone check (phase 1, held-out voices, read from reports/yue_tone_check.md): Result: the tone feedback is a GUIDE. accuracy on decided items 85.1% (needed >= 90%); largest single confusion 2 -> 5, 14.6% (needed <= 10%); "not sure" rate 12.1% (needed <= 20%).

## Readings

For each test token whose form is in the lexicon, the lexicon's Jyutping against HKCanCor's annotation.

| measure | count | share equal |
|---|---|---|
| per token | 24584 | 93.4% |
| per token type (unique forms; right only if every token agrees) | 2370 | 93.2% |

### 20 most frequent disagreements

Many are learning points (a changed tone in speech, or a word with two readings), not errors.

| form | app | HKCanCor | count |
|---|---|---|---|
| 喇 | laa3 | laa1 | 293 |
| 喀 | haak3 | haak6 | 145 |
| 到 | dou3 | dou2 | 103 |
| 來 | loi4 | lai4 | 101 |
| 呀 | aa3 | aa4 | 88 |
| 下 | haa6 | haa5 | 69 |
| 哦 | o4 | o5 | 64 |
| 嗯 | ng6 | m6 | 61 |
| 嘩 | waa1 | waa3 | 56 |
| 哩 | lei5 | ni1 | 52 |
| 出來 | ceot1 loi4 | ceot1 lai4 | 28 |
| 驚 | ging1 | geng1 | 28 |
| 唉 | aai1 | aai5 | 27 |
| 哦 | o4 | o3 | 23 |
| 嗱 | naa4 | laa4 | 21 |
| 成 | sing4 | seng4 | 19 |
| 使 | si2 | sai2 | 16 |
| 着 | zoek6 | zoek3 | 15 |
| 請 | cing2 | ceng2 | 15 |
| 啱 | ngaam1 | aam1 | 14 |

## Word splitting

Boundary F1 of the longest-match segmenter (over the lexicon forms) against HKCanCor's word boundaries on the test sentences, taken as text with no spaces.

| measure | value |
|---|---|
| boundary F1 | 94.3% |

## Coverage

Share of Han tokens whose word is among the first n form items (`g:` grammar items are not counted). `course` is the shipped order (5000 words); `frequency` is a plain HKCanCor train-count order.

### HKCanCor test (25049 tokens)

| n | course | frequency |
|---|---|---|
| 100 | 55.6% | 66.5% |
| 300 | 72.9% | 80.8% |
| 1000 | 82.7% | 90.0% |
| 3000 | 88.5% | 95.1% |

### Tatoeba yue, colloquial (122460 tokens)

| n | course | frequency |
|---|---|---|
| 100 | 36.2% | 35.6% |
| 300 | 52.9% | 47.3% |
| 1000 | 70.6% | 58.7% |
| 3000 | 84.7% | 70.0% |
