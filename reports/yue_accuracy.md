# Cantonese phase 2: held-out evaluation

Test set: every 5th HKCanCor sentence (2151 sentences; 8604 train). The lexicon, its readings, the word frequencies and the course order used the train split only, so none of this was seen when they were made.

Tone check (phase 1, held-out voices, read from reports/yue_tone_check.md): Result: the tone feedback is a GUIDE. accuracy on decided items 85.1% (needed >= 90%); largest single confusion 2 -> 5, 14.6% (needed <= 10%); "not sure" rate 12.1% (needed <= 20%).

## Readings

For each test token the app can read (app/yue/data/lexicon.json: the shipped words, split as the app splits text, a character's own reading for the rest), the app's Jyutping against HKCanCor's annotation.

| measure | count | share equal |
|---|---|---|
| per token | 22162 | 95.0% |
| per token type (unique forms; right only if every token agrees) | 2434 | 91.5% |

### 20 most frequent disagreements

Three kinds. (1) HKCanCor's own writing conventions: it writes 啦 laa1 as 喇, 嚟 lai4 as 來, 呀 aa3 as 啊 and keeps 呀 for aa4, so its label for that character is another word; the app's reading is right for the app's spelling. (2) A word on its own against its use inside a phrase: 到 dou3 'arrive' against dou2 after a verb, taught with those words. Both kinds are hand-checked rows of data/yue/overrides.tsv, quoted in the last column. (3) Rows with no note were not reviewed by hand: they are left for review, not claimed correct. Readings that were teaching errors (驚 ging1, 唔會 m4 wui2 and the others in overrides.tsv) were fixed and no longer disagree.

| form | app | HKCanCor | count | note |
|---|---|---|---|---|
| 喇 | laa3 | laa1 | 293 | particle of a new situation: laa3 (words.hk); HKCanCor writes laa1 as 喇 and laa3 as 嚹 (x547), so its 喇 counts are 啦 |
| 到 | dou3 | dou2 | 103 | to arrive: dou3 as a word on its own; dou2 is the verb complement after another verb (搵到), taught with those words |
| 來 | loi4 | lai4 | 101 | to come: loi4 is the reading of 來; HKCanCor writes 嚟 lai4 as 來. The spoken word is 嚟 lai4, taught on its own |
| 呀 | aa3 | aa4 | 88 | default sentence-final particle; HKCanCor writes aa3 as 啊 and keeps 呀 for aa4, so its 呀 counts do not reflect usage |
| 下 | haa6 | haa5 | 69 | down, below, next: haa6 as a word on its own; haa5 is the measure 'a time' and the verb suffix (一下, 睇吓), taught with those words and the haa5 grammar point |
| 哦 | o5 | o3 | 23 | oh, I see: o5 (realisation) is the usual one in speech; o4 acknowledges, o3 criticises |
| 使 | si2 | sai2 | 16 |  |
| 啱 | ngaam1 | aam1 | 14 |  |
| 呃 | ngaak1 | aak3 | 12 |  |
| 以為 | ji5 wai6 | ji5 wai4 | 11 |  |
| 度 | dou6 | dou2 | 11 |  |
| 返來 | faan1 lai4 | faan1 lei4 | 11 | written form of 返嚟, said like it (嚟 lai4); faan1 lei4 is as common |
| 吓 | haa2 | haa5 | 10 |  |
| 英文 | jing1 man4 | jing1 man2 | 10 |  |
| 雀 | zoek3 | zoek2 | 10 |  |
| 㗎 | gaa3 | gaa4 | 9 | sentence-final particle: gaa3 is the usual one; HKCanCor writes gaa3 as 架 and keeps 㗎 for gaa4; words.hk examples write 㗎 with gaa3 636 times |
| 成 | seng4 | sing4 | 9 | whole, complete: seng4 in speech (成日, 成個); sing4 (to succeed, ten percent) is the literary reading (成功) |
| 上 | soeng5 | soeng6 | 8 |  |
| 樣 | joeng2 | joeng6 | 7 | look, appearance (個樣): joeng2; joeng6 is type, kind (一樣, 呢樣) |
| 裏邊 | leoi5 bin1 | leoi5 bin6 | 7 |  |

## Word splitting

Boundary F1 of the longest-match segmenter (over the lexicon forms) against HKCanCor's word boundaries on the test sentences, taken as text with no spaces.

| measure | value |
|---|---|
| boundary F1 | 93.2% |

## Coverage

Share of Han tokens whose word is among the first n form items (`g:` grammar items are not counted). `course` is the shipped order (5000 words); `frequency` is a plain HKCanCor train-count order.

The course order trails plain frequency on these numbers by design: it teaches only words with a checked reading and meaning, never formal-only forms or bound characters on their own, and puts a word after the characters it needs, while the frequency order counts every HKCanCor token, fillers and all.

### HKCanCor test (25049 tokens)

| n | course | frequency |
|---|---|---|
| 100 | 51.2% | 66.5% |
| 300 | 68.1% | 80.8% |
| 1000 | 77.2% | 90.0% |
| 3000 | 81.7% | 95.1% |

### Tatoeba yue, colloquial (128553 tokens)

| n | course | frequency |
|---|---|---|
| 100 | 36.3% | 35.1% |
| 300 | 53.5% | 47.5% |
| 1000 | 69.3% | 59.7% |
| 3000 | 79.9% | 71.6% |
