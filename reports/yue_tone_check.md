# Cantonese tone check: held-out evaluation

**Result: the tone feedback is a GUIDE.**

These voices are synthetic; real voices, especially in a noisy room, will do worse. The numbers below are an upper bound.

Rule: a check needs, on held-out voices, accuracy on decided items >= 90%, no single confusion above 10% of that tone's items, and "not sure" on <= 20% of items. Otherwise it is a guide.

| measure | held-out | needed | met |
|---|---|---|---|
| accuracy on decided items | 79.2% | >= 90% | NO |
| largest single confusion | 5 -> 6, 21.3% | <= 10% | NO |
| "not sure" rate | 16.4% | <= 20% | yes |

Held-out items: 7000 clips from googleC, microsoftHiuMaan (5851 decided). This includes the 12 anchor clips (si1 si3 si6 si4 si2 si5 of each voice), which the profiles were built from.

## Chosen parameters

shift 0.5 st, step 0.25 st, unsure 0.15 st. Chosen by grid search over shift [0.5] x unsure [0.15,0.25,0.35,0.5] on the tuning voices only (googleB, microsoftHiuGaai), maximising decided-accuracy x (1 - unsure rate). Shift values at or above half the smallest tuning-voice tone 3-6 gap (1.57 st) were not tried, because drift of half the gap makes tones 3 and 6 confusable.

| shift | unsure | accuracy | not sure | objective |
|---|---|---|---|---|
| 0.5 | 0.15 | 81.4% | 25.0% | 0.6106 (chosen) |
| 0.5 | 0.25 | 83.2% | 29.0% | 0.5907 |
| 0.5 | 0.35 | 84.6% | 33.2% | 0.5649 |
| 0.5 | 0.5 | 87.0% | 39.3% | 0.5281 |

## Voices

| voice | role | tone 3-6 gap (st) | items | accuracy | not sure |
|---|---|---|---|---|---|
| googleA | tuning | - | - | excluded: profile invalid, redo si3 | - |
| googleB | tuning | 3.25 | 3652 | 95.2% | 23.5% |
| microsoftHiuGaai | tuning | 1.57 | 3348 | 65.7% | 26.5% |
| amazonHiuJin | tuning | - | - | excluded: profile invalid, redo si2 | - |
| googleC | held-out | 1.92 | 3652 | 90.7% | 13.7% |
| googleD | held-out | - | - | excluded: profile invalid, redo si1 | - |
| microsoftHiuMaan | held-out | 1.60 | 3348 | 65.7% | 19.4% |
| microsoftWanLung | held-out | - | - | excluded: profile invalid, redo si1 | - |

Calibration profiles from each voice's own anchor clips (semitones re 55 Hz; NaN means no voiced frames):

| voice | t1 | t3 | t6 | t4 end | t2 end | t5 end | valid |
|---|---|---|---|---|---|---|---|
| googleA | 29.85 | 25.45 | 35.11 | 18.47 | 28.99 | 24.79 | NO: profile invalid, redo si3 |
| googleB | 20.31 | 16.26 | 13.02 | 7.56 | 19.59 | 15.83 | yes |
| microsoftHiuGaai | 27.53 | 24.49 | 22.92 | 19.54 | 27.83 | 24.57 | yes |
| amazonHiuJin | 28.92 | 23.45 | 20.84 | 17.01 | 23.51 | 22.59 | NO: profile invalid, redo si2 |
| googleC | 25.86 | 21.88 | 19.95 | 15.53 | 25.20 | 21.21 | yes |
| googleD | 22.07 | 30.61 | 15.62 | 10.69 | 33.81 | 21.86 | NO: profile invalid, redo si1 |
| microsoftHiuMaan | 30.94 | 27.81 | 26.21 | 22.57 | 27.92 | 26.84 | yes |
| microsoftWanLung | 15.81 | 13.52 | 12.25 | 7.63 | NaN | 11.79 | NO: profile invalid, redo si1 |

Excluded from tuning and held-out metrics:

- appleAasing: no si5 clip (the dataset removed all Apple tone-5 clips), so it cannot be calibrated.
- appleSinji: no si5 clip (the dataset removed all Apple tone-5 clips), so it cannot be calibrated.
- googleA: profile invalid, redo si3.
- amazonHiuJin: profile invalid, redo si2.
- googleD: profile invalid, redo si1.
- microsoftWanLung: profile invalid, redo si1.

## Confusion matrix, all held-out voices

Rows: the tone the file says. Columns: the tone heard, as a share of that tone's items.

| want \ heard | 1 | 2 | 3 | 4 | 5 | 6 | not sure | items |
|---|---|---|---|---|---|---|---|---|
| 1 | 91.6% | 0.0% | 5.0% | 0.0% | 0.0% | 0.0% | 3.5% | 1302 |
| 2 | 0.5% | 31.0% | 1.0% | 13.9% | 0.1% | 18.0% | 35.5% | 1303 |
| 3 | 4.8% | 0.8% | 75.4% | 0.0% | 0.0% | 10.3% | 8.7% | 1303 |
| 4 | 0.0% | 0.0% | 0.0% | 98.7% | 0.0% | 0.4% | 0.9% | 895 |
| 5 | 0.3% | 2.6% | 0.0% | 18.6% | 18.9% | 21.3% | 38.2% | 892 |
| 6 | 1.6% | 0.0% | 2.9% | 4.9% | 0.0% | 76.9% | 13.7% | 1305 |

## Confusion matrix, google voices (googleC)

Accuracy on decided 90.7%, not sure 13.7%, largest confusion 5 -> 6 16.8%.

| want \ heard | 1 | 2 | 3 | 4 | 5 | 6 | not sure | items |
|---|---|---|---|---|---|---|---|---|
| 1 | 96.8% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 3.2% | 679 |
| 2 | 1.0% | 59.0% | 1.6% | 2.6% | 0.0% | 6.0% | 29.7% | 680 |
| 3 | 8.4% | 1.6% | 86.0% | 0.0% | 0.0% | 0.3% | 3.7% | 680 |
| 4 | 0.0% | 0.0% | 0.0% | 98.7% | 0.0% | 0.2% | 1.1% | 466 |
| 5 | 0.6% | 4.5% | 0.0% | 3.9% | 36.0% | 16.8% | 38.1% | 464 |
| 6 | 2.5% | 0.0% | 1.2% | 0.0% | 0.0% | 86.1% | 10.2% | 683 |

## Confusion matrix, microsoft voices (microsoftHiuMaan)

Accuracy on decided 65.7%, not sure 19.4%, largest confusion 5 -> 4 34.6%.

| want \ heard | 1 | 2 | 3 | 4 | 5 | 6 | not sure | items |
|---|---|---|---|---|---|---|---|---|
| 1 | 85.9% | 0.0% | 10.4% | 0.0% | 0.0% | 0.0% | 3.7% | 623 |
| 2 | 0.0% | 0.5% | 0.3% | 26.2% | 0.2% | 31.0% | 41.9% | 623 |
| 3 | 1.0% | 0.0% | 63.7% | 0.0% | 0.0% | 21.2% | 14.1% | 623 |
| 4 | 0.0% | 0.0% | 0.0% | 98.6% | 0.0% | 0.7% | 0.7% | 429 |
| 5 | 0.0% | 0.5% | 0.0% | 34.6% | 0.5% | 26.2% | 38.3% | 428 |
| 6 | 0.6% | 0.0% | 4.8% | 10.3% | 0.0% | 66.7% | 17.5% | 622 |

## Largest confusions, held-out

- 5 -> 6: 21.3%
- 5 -> 4: 18.6%
- 2 -> 6: 18.0%
- 2 -> 4: 13.9%
- 3 -> 6: 10.3%
- 1 -> 3: 5.0%
- 6 -> 4: 4.9%
- 3 -> 1: 4.8%

## Excluded clips

Shipped voices (googleA, googleB, microsoftHiuGaai) lose a clip when the classifier decides a different tone than the filename with margin >= 2 x unsure (0.30 st). 773 clips excluded.

- googleA: 0
- googleB: 112
- microsoftHiuGaai: 661

Full list with reasons: data/yue/audio_exclusions.json.

- googleB/bo5: classifier decides tone 6 but the file says tone 5: want 5, got 6, margin 0.46 st
- googleB/buk2: classifier decides tone 6 but the file says tone 2: want 2, got 6, margin 1.01 st
- googleB/but2: classifier decides tone 6 but the file says tone 2: want 2, got 6, margin 0.85 st
- googleB/caam2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 1.41 st
- googleB/caan2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.07 st
- googleB/caang5: classifier decides tone 3 but the file says tone 5: want 5, got 3, margin 0.34 st
- googleB/cam2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.12 st
- googleB/ceng2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.56 st
- googleB/ceng5: classifier decides tone 3 but the file says tone 5: want 5, got 3, margin 0.49 st
- googleB/ceon2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.90 st
- googleB/cing2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.74 st
- googleB/cing5: classifier decides tone 3 but the file says tone 5: want 5, got 3, margin 1.00 st
- googleB/coeng2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.42 st
- googleB/coeng5: classifier decides tone 3 but the file says tone 5: want 5, got 3, margin 0.68 st
- googleB/cok2: classifier decides tone 6 but the file says tone 2: want 2, got 6, margin 0.65 st
- googleB/cyun2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.77 st
- googleB/din2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.55 st
- googleB/do5: classifier decides tone 6 but the file says tone 5: want 5, got 6, margin 0.37 st
- googleB/doe5: classifier decides tone 6 but the file says tone 5: want 5, got 6, margin 1.40 st
- googleB/dut2: classifier decides tone 6 but the file says tone 2: want 2, got 6, margin 0.67 st
- googleB/fang5: classifier decides tone 3 but the file says tone 5: want 5, got 3, margin 0.99 st
- googleB/fing2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 2.83 st
- googleB/fing5: classifier decides tone 3 but the file says tone 5: want 5, got 3, margin 0.87 st
- googleB/fok2: classifier decides tone 6 but the file says tone 2: want 2, got 6, margin 0.65 st
- googleB/fuk2: classifier decides tone 6 but the file says tone 2: want 2, got 6, margin 0.65 st
- googleB/fut2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 3.62 st
- googleB/go5: classifier decides tone 6 but the file says tone 5: want 5, got 6, margin 1.40 st
- googleB/goe5: classifier decides tone 6 but the file says tone 5: want 5, got 6, margin 0.59 st
- googleB/gut2: classifier decides tone 6 but the file says tone 2: want 2, got 6, margin 0.55 st
- googleB/gwaan2: classifier decides tone 1 but the file says tone 2: want 2, got 1, margin 1.63 st
- ... and 743 more

Run time (including any pitch tracking not yet cached): 0 s.
