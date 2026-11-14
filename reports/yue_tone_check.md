# Cantonese tone check: held-out evaluation

**Result: the tone feedback is a GUIDE.**

These voices are synthetic; real voices, especially in a noisy room, will do worse. The numbers below are an upper bound.

Rule: a check needs, on held-out voices, accuracy on decided items >= 90%, no single confusion above 10% of that tone's items, and "not sure" on <= 20% of items. Otherwise it is a guide.

| measure | held-out | needed | met |
|---|---|---|---|
| accuracy on decided items | 85.1% | >= 90% | NO |
| largest single confusion | 2 -> 5, 14.6% | <= 10% | NO |
| "not sure" rate | 12.1% | <= 20% | yes |

Held-out items: 7304 clips from googleC, googleD (6420 decided). This includes the 84 calibration clips (the 42 clips of the seven calibration sets per voice), which the profiles were built from.

## Chosen parameters

shift 0.25 st, step 0.25 st, unsure 0.1 st. Chosen by grid search over shift [0.25,0.5] x unsure [0.1,0.15,0.25,0.35,0.5] on the tuning voices only (googleA, googleB, amazonHiuJin), maximising decided-accuracy x (1 - unsure rate). Shift values at or above half the smallest tuning-voice tone 3-6 gap (1.35 st) were not tried, because drift of half the gap makes tones 3 and 6 confusable.

| shift | unsure | accuracy | not sure | objective |
|---|---|---|---|---|
| 0.25 | 0.1 | 78.8% | 14.0% | 0.6773 (chosen) |
| 0.25 | 0.15 | 79.8% | 16.4% | 0.6676 |
| 0.25 | 0.25 | 82.6% | 21.8% | 0.6459 |
| 0.25 | 0.35 | 83.9% | 25.7% | 0.6234 |
| 0.25 | 0.5 | 85.4% | 31.8% | 0.5829 |
| 0.5 | 0.1 | 79.2% | 15.1% | 0.6723 |
| 0.5 | 0.15 | 80.4% | 17.9% | 0.6600 |
| 0.5 | 0.25 | 83.1% | 23.5% | 0.6357 |
| 0.5 | 0.35 | 84.4% | 27.9% | 0.6087 |
| 0.5 | 0.5 | 85.7% | 34.1% | 0.5644 |

## Voices

| voice | role | tone 3-6 gap (st) | items | accuracy | not sure |
|---|---|---|---|---|---|
| googleA | tuning | 2.08 | 3652 | 72.1% | 9.2% |
| googleB | tuning | 3.18 | 3652 | 92.7% | 25.3% |
| microsoftHiuGaai | tuning | - | - | excluded: profile invalid, redo ji3 | - |
| amazonHiuJin | tuning | 1.35 | 3884 | 74.4% | 8.0% |
| googleC | held-out | 2.07 | 3652 | 90.3% | 11.6% |
| googleD | held-out | 3.24 | 3652 | 79.9% | 12.6% |
| microsoftHiuMaan | held-out | - | - | excluded: profile invalid, redo ji2 | - |
| microsoftWanLung | held-out | - | - | excluded: profile invalid, redo ji2 | - |

Calibration profiles (semitones re 55 Hz): per field, the median over the seven voiced six-tone sets (ji, jau, jan, wai, maa, ngaa, lou) of the voice's own clips; spread = max minus min of the per-set values:

| voice | t1 | t3 | t6 | t4 end | t2 end | t5 end | 3-6 gap | valid |
|---|---|---|---|---|---|---|---|---|
| googleA | 29.24 (spread 1.11) | 25.42 (spread 0.93) | 23.34 (spread 0.84) | 18.69 (spread 0.51) | 28.10 (spread 8.61) | 24.97 (spread 12.44) | 2.08 | yes |
| googleB | 19.56 (spread 11.71) | 15.52 (spread 0.70) | 12.34 (spread 1.28) | 7.56 (spread 6.28) | 25.52 (spread 12.62) | 15.14 (spread 4.66) | 3.18 | yes |
| microsoftHiuGaai | 25.58 (spread 4.59) | 23.29 (spread 2.32) | 22.53 (spread 2.76) | 20.26 (spread 2.49) | 26.69 (spread 6.86) | 23.57 (spread 3.90) | 0.75 | NO: profile invalid, redo ji3 |
| amazonHiuJin | 26.76 (spread 3.33) | 21.83 (spread 1.90) | 20.48 (spread 1.35) | 17.54 (spread 1.77) | 24.76 (spread 4.52) | 22.10 (spread 2.17) | 1.35 | yes |
| googleC | 24.99 (spread 2.46) | 21.51 (spread 0.75) | 19.43 (spread 1.60) | 15.64 (spread 0.74) | 24.76 (spread 9.09) | 20.62 (spread 3.85) | 2.07 | yes |
| googleD | 21.75 (spread 12.50) | 18.07 (spread 13.01) | 14.83 (spread 18.84) | 10.38 (spread 0.53) | 33.19 (spread 22.49) | 18.08 (spread 4.32) | 3.24 | yes |
| microsoftHiuMaan | 29.90 (spread 1.79) | 26.24 (spread 3.62) | 24.82 (spread 2.47) | 21.95 (spread 1.59) | 24.18 (spread 5.53) | 24.48 (spread 1.68) | 1.42 | NO: profile invalid, redo ji2 |
| microsoftWanLung | 15.06 (spread 2.06) | 13.03 (spread 1.75) | 11.03 (spread 0.72) | 7.16 (spread 3.35) | 9.50 (spread 0.71) | 10.76 (spread 3.61) | 2.00 | NO: profile invalid, redo ji2 |

Excluded from tuning and held-out metrics:

- appleAasing: no si5 clip (the dataset removed all Apple tone-5 clips), so it cannot be calibrated.
- appleSinji: no si5 clip (the dataset removed all Apple tone-5 clips), so it cannot be calibrated.
- microsoftHiuGaai: profile invalid, redo ji3.
- microsoftHiuMaan: profile invalid, redo ji2.
- microsoftWanLung: profile invalid, redo ji2.

## Confusion matrix, all held-out voices

Rows: the tone the file says. Columns: the tone heard, as a share of that tone's items.

| want \ heard | 1 | 2 | 3 | 4 | 5 | 6 | not sure | items |
|---|---|---|---|---|---|---|---|---|
| 1 | 97.6% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 2.4% | 1358 |
| 2 | 7.2% | 37.4% | 1.8% | 2.4% | 14.6% | 4.4% | 32.1% | 1360 |
| 3 | 10.8% | 0.7% | 85.4% | 0.0% | 0.0% | 0.0% | 3.1% | 1360 |
| 4 | 0.9% | 0.0% | 0.6% | 91.4% | 1.1% | 0.6% | 5.4% | 932 |
| 5 | 3.1% | 2.7% | 3.2% | 2.4% | 64.0% | 10.2% | 14.3% | 928 |
| 6 | 2.4% | 1.4% | 6.8% | 0.0% | 0.7% | 74.7% | 13.9% | 1366 |

## Confusion matrix, google voices (googleC, googleD)

Accuracy on decided 85.1%, not sure 12.1%, largest confusion 2 -> 5 14.6%.

| want \ heard | 1 | 2 | 3 | 4 | 5 | 6 | not sure | items |
|---|---|---|---|---|---|---|---|---|
| 1 | 97.6% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 2.4% | 1358 |
| 2 | 7.2% | 37.4% | 1.8% | 2.4% | 14.6% | 4.4% | 32.1% | 1360 |
| 3 | 10.8% | 0.7% | 85.4% | 0.0% | 0.0% | 0.0% | 3.1% | 1360 |
| 4 | 0.9% | 0.0% | 0.6% | 91.4% | 1.1% | 0.6% | 5.4% | 932 |
| 5 | 3.1% | 2.7% | 3.2% | 2.4% | 64.0% | 10.2% | 14.3% | 928 |
| 6 | 2.4% | 1.4% | 6.8% | 0.0% | 0.7% | 74.7% | 13.9% | 1366 |

## Largest confusions, held-out

- 2 -> 5: 14.6%
- 3 -> 1: 10.8%
- 5 -> 6: 10.2%
- 2 -> 1: 7.2%
- 6 -> 3: 6.8%
- 2 -> 6: 4.4%
- 5 -> 3: 3.2%
- 5 -> 1: 3.1%

## Excluded clips

Shipped voices (googleA, googleB, microsoftHiuGaai) lose a clip when the classifier decides a different tone than the filename with margin >= 2 x unsure (0.20 st). 988 clips excluded.

- googleA: 840
- googleB: 148
- microsoftHiuGaai: 0

Full list with reasons: data/yue/audio_exclusions.json.

- googleA/aa2: classifier decides tone 6 but the file says tone 2: want 2, got 6, margin 0.81 st
- googleA/aa5: classifier decides tone 6 but the file says tone 5: want 5, got 6, margin 0.44 st
- googleA/aai2: classifier decides tone 4 but the file says tone 2: want 2, got 4, margin 0.79 st
- googleA/aai5: classifier decides tone 2 but the file says tone 5: want 5, got 2, margin 0.49 st
- googleA/aai6: classifier decides tone 2 but the file says tone 6: want 6, got 2, margin 0.33 st
- googleA/aau2: classifier decides tone 4 but the file says tone 2: want 2, got 4, margin 0.69 st
- googleA/aau5: classifier decides tone 2 but the file says tone 5: want 5, got 2, margin 0.33 st
- googleA/ai5: classifier decides tone 2 but the file says tone 5: want 5, got 2, margin 0.67 st
- googleA/ai6: classifier decides tone 2 but the file says tone 6: want 6, got 2, margin 0.59 st
- googleA/au2: classifier decides tone 6 but the file says tone 2: want 2, got 6, margin 0.37 st
- googleA/au5: classifier decides tone 2 but the file says tone 5: want 5, got 2, margin 0.65 st
- googleA/au6: classifier decides tone 2 but the file says tone 6: want 6, got 2, margin 0.67 st
- googleA/baa2: classifier decides tone 4 but the file says tone 2: want 2, got 4, margin 0.90 st
- googleA/baa5: classifier decides tone 6 but the file says tone 5: want 5, got 6, margin 0.64 st
- googleA/baai5: classifier decides tone 2 but the file says tone 5: want 5, got 2, margin 0.33 st
- googleA/baau2: classifier decides tone 4 but the file says tone 2: want 2, got 4, margin 1.38 st
- googleA/baau5: classifier decides tone 2 but the file says tone 5: want 5, got 2, margin 0.28 st
- googleA/bai5: classifier decides tone 2 but the file says tone 5: want 5, got 2, margin 0.43 st
- googleA/bai6: classifier decides tone 2 but the file says tone 6: want 6, got 2, margin 0.67 st
- googleA/bau5: classifier decides tone 2 but the file says tone 5: want 5, got 2, margin 0.67 st
- googleA/bau6: classifier decides tone 2 but the file says tone 6: want 6, got 2, margin 0.33 st
- googleA/be5: classifier decides tone 6 but the file says tone 5: want 5, got 6, margin 0.49 st
- googleA/bei5: classifier decides tone 2 but the file says tone 5: want 5, got 2, margin 0.76 st
- googleA/bin2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.99 st
- googleA/bin6: classifier decides tone 3 but the file says tone 6: want 6, got 3, margin 0.70 st
- googleA/bit2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.68 st
- googleA/bit6: classifier decides tone 1 but the file says tone 6: want 6, got 1, margin 3.82 st
- googleA/biu2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 3.82 st
- googleA/biu3: classifier decides tone 1 but the file says tone 3: want 3, got 1, margin 1.07 st
- googleA/biu4: classifier decides tone 1 but the file says tone 4: want 4, got 1, margin 0.76 st
- ... and 958 more

Run time (including any pitch tracking not yet cached): 1 s.
