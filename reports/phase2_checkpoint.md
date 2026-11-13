# Phase 2 checkpoint (updated 2026-11-13)

![Coverage plot](coverage.png)

Settings chosen on training sentences only: lookahead 0.0, sentence bonus 4.0. Everything below was run once on text that played no part in building or tuning.

## Tatoeba, held out (primary mode)

Short sentences, many written for learners. 汤姆 and 玛丽 alone are 1.5% of tokens.

6,362 sentences, 39,652 Han tokens (36,448 graph words, 3,140 readable only by splitting, 64 with a character outside the graph).

| Items | Unlock | Unlock + sentences | Frequency | HSK | HSK focus (app) |
|---:|---:|---:|---:|---:|---:|
| 100 | 40.1% | 40.0% | 37.0% | 38.9% | 39.7% |
| 500 | 58.8% | 59.6% | 57.4% | 56.2% | 56.2% |
| 1,000 | 66.7% | 67.6% | 65.7% | 65.7% | 65.8% |
| 2,000 | 75.9% | 76.7% | 75.1% | 74.7% | 74.8% |

Differences in percentage points, 95% bootstrap intervals by sentence:

| Items | Unlock − Frequency | Unlock − HSK | Unlock + sentences − Unlock |
|---:|---:|---:|---:|
| 100 | +2.9 to +3.4 | +0.9 to +1.5 | -0.1 to -0.0 |
| 500 | +1.2 to +1.7 | +2.3 to +3.1 | +0.7 to +0.9 |
| 1,000 | +0.8 to +1.2 | +0.6 to +1.4 | +0.7 to +1.1 |
| 2,000 | +0.6 to +1.0 | +0.8 to +1.7 | +0.5 to +0.9 |

Whole sentences readable start to finish:

| Items | Unlock | Unlock + sentences | Frequency | HSK | HSK focus (app) | HSK − Unlock (95% CI) |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.3% | 0.3% | 0.2% | 0.3% | 0.3% | -0.1 to +0.1 |
| 500 | 3.6% | 4.0% | 3.3% | 4.6% | 4.9% | +0.4 to +1.5 |
| 1,000 | 8.5% | 9.1% | 7.9% | 11.0% | 11.1% | +1.8 to +3.3 |
| 2,000 | 19.0% | 20.7% | 18.2% | 20.5% | 20.9% | +0.5 to +2.5 |

## Hong Kong film subtitles and LegCo speech (UD Chinese-HK, Traditional)

Independent of everything used to build the graph. Not drawn from any source we use, as far as we know.

1,004 sentences, 7,679 Han tokens (6,855 graph words, 787 readable only by splitting, 37 with a character outside the graph).

| Items | Unlock | Unlock + sentences | Frequency | HSK | HSK focus (app) |
|---:|---:|---:|---:|---:|---:|
| 100 | 32.1% | 32.2% | 30.6% | 30.0% | 30.6% |
| 500 | 53.7% | 54.5% | 51.9% | 44.7% | 44.3% |
| 1,000 | 64.5% | 64.7% | 65.0% | 58.8% | 58.6% |
| 2,000 | 77.8% | 76.2% | 74.3% | 69.6% | 69.6% |

Differences in percentage points, 95% bootstrap intervals by sentence:

| Items | Unlock − Frequency | Unlock − HSK | Unlock + sentences − Unlock |
|---:|---:|---:|---:|
| 100 | +1.0 to +2.0 | +1.5 to +2.8 | -0.1 to +0.1 |
| 500 | +1.2 to +2.4 | +7.8 to +10.2 | +0.6 to +1.1 |
| 1,000 | -1.1 to +0.1 | +4.7 to +6.9 | -0.2 to +0.5 |
| 2,000 | +2.9 to +4.1 | +7.0 to +9.3 | -2.1 to -1.0 |

Whole sentences readable start to finish:

| Items | Unlock | Unlock + sentences | Frequency | HSK | HSK focus (app) | HSK − Unlock (95% CI) |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1.6% | 1.6% | 1.9% | 2.0% | 1.7% | +0.0 to +0.9 |
| 500 | 9.7% | 10.3% | 8.0% | 8.9% | 8.8% | -2.4 to +0.9 |
| 1,000 | 15.4% | 16.1% | 14.3% | 16.2% | 16.6% | -1.1 to +2.7 |
| 2,000 | 26.7% | 27.5% | 23.5% | 24.8% | 24.9% | -4.6 to +0.7 |

## Wikipedia and news (UD Chinese-GSDSimp test and Chinese-PUD)

Independent of everything used to build the graph. wordfreq includes Wikipedia, so this set shares a source with our frequencies, which favours the unlock and frequency orders.

1,500 sentences, 26,388 Han tokens (22,429 graph words, 3,855 readable only by splitting, 104 with a character outside the graph).

| Items | Unlock | Unlock + sentences | Frequency | HSK | HSK focus (app) |
|---:|---:|---:|---:|---:|---:|
| 100 | 29.0% | 28.9% | 27.3% | 24.9% | 25.3% |
| 500 | 45.1% | 45.0% | 42.7% | 32.0% | 32.0% |
| 1,000 | 55.5% | 55.0% | 54.2% | 43.2% | 43.4% |
| 2,000 | 68.3% | 67.7% | 66.9% | 56.4% | 56.4% |

Differences in percentage points, 95% bootstrap intervals by sentence:

| Items | Unlock − Frequency | Unlock − HSK | Unlock + sentences − Unlock |
|---:|---:|---:|---:|
| 100 | +1.5 to +2.0 | +3.8 to +4.5 | -0.2 to -0.1 |
| 500 | +2.0 to +2.7 | +12.6 to +13.6 | -0.3 to +0.0 |
| 1,000 | +0.9 to +1.6 | +11.8 to +12.8 | -0.7 to -0.2 |
| 2,000 | +1.1 to +1.7 | +11.4 to +12.4 | -0.9 to -0.3 |

Whole sentences readable start to finish:

| Items | Unlock | Unlock + sentences | Frequency | HSK | HSK focus (app) | HSK − Unlock (95% CI) |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | +0.0 to +0.0 |
| 500 | 0.2% | 0.2% | 0.1% | 0.1% | 0.1% | -0.2 to +0.0 |
| 1,000 | 0.5% | 0.5% | 0.5% | 0.2% | 0.3% | -0.7 to +0.0 |
| 2,000 | 1.8% | 1.9% | 1.5% | 0.5% | 0.7% | -1.9 to -0.7 |

## Should the sentence-aware order become the default?

The rule was fixed in `jiesuo/evaluate.py` before the held-out run. It needed all three of these:

- Tatoeba tokens within 0.5 points of unlock at every checkpoint: yes
- Tatoeba whole sentences higher at 1,000 and 2,000: yes
- UD tokens within 1 point of unlock at every checkpoint: no

Result: **keep plain unlock**. It learns Tatoeba's style: 玛丽 comes at item 4,568 instead of 7,156.

## Sensitivity: every component edge required (Tatoeba)

| Items | Unlock | Frequency | HSK |
|---:|---:|---:|---:|
| 100 | 37.6% | 35.3% | 35.4% |
| 500 | 58.1% | 56.9% | 55.8% |
| 1,000 | 66.4% | 65.4% | 65.0% |
| 2,000 | 75.7% | 75.0% | 74.6% |

## Sensitivity: no component required (Tatoeba)

| Items | Unlock | Frequency | HSK |
|---:|---:|---:|---:|
| 100 | 46.1% | 45.1% | 44.9% |
| 500 | 61.6% | 60.5% | 57.6% |
| 1,000 | 68.6% | 67.5% | 67.6% |
| 2,000 | 77.1% | 76.4% | 75.9% |

## SUBTLEX-CH subtitle word counts (not held out: wordfreq includes SUBTLEX)

| Items | Unlock | Frequency | HSK |
|---:|---:|---:|---:|
| 100 | 44.1% | 41.2% | 43.3% |
| 500 | 65.8% | 63.8% | 61.6% |
| 1,000 | 73.5% | 72.3% | 71.2% |
| 2,000 | 81.6% | 80.8% | 79.2% |
