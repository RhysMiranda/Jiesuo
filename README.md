# Jiesuo 解锁

An open-source Mandarin learning tool built on a dependency graph of the language:
components → characters → words → grammar patterns → sentences.

![Share of held-out text readable after N items, for three learning orders](reports/coverage.png)

Tokens readable after N items, every order paying for its prerequisites:

| Items learned | Tatoeba: Unlock | Tatoeba: HSK | Hong Kong: Unlock | Hong Kong: HSK | Wiki and news: Unlock | Wiki and news: HSK |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 40.1% | 38.9% | 32.1% | 30.0% | 29.0% | 24.9% |
| 500 | 58.8% | 56.2% | 53.7% | 44.7% | 45.1% | 32.0% |
| 1,000 | 66.7% | 65.7% | 64.5% | 58.8% | 55.5% | 43.2% |
| 2,000 | 75.9% | 74.7% | 77.8% | 69.6% | 68.3% | 56.4% |

- **Unlock against frequency:** unlock leads by about 1 to 4 points on Tatoeba and wiki/news. On
  Hong Kong text the lead disappears at 1,000 items.
- **Tatoeba is the odd one out:** HSK order is almost as good on its short learner sentences, and
  reads more whole sentences there. On the other two sets, unlock is far ahead and the
  whole-sentence advantage is gone.
- **Where the other two sets come from:** Hong Kong film subtitles and LegCo speech, and Wikipedia
  and news, all from Universal Dependencies treebanks never used for building or tuning.
- **A sentence-aware order (tried and rejected):** a variant that also rewards finishing whole
  sentences was tuned on training data and then failed its pre-registered test on Hong Kong text,
  so it is not used.

Confidence intervals and every comparison are in [reports/phase2_checkpoint.md](reports/phase2_checkpoint.md).
Accuracy checks on vocabulary, word splitting and grammar detection are in [reports/accuracy.md](reports/accuracy.md).

## Using the app

Open `app/index.html` through any static server (`python -m http.server -d app`), or publish
`app/` to GitHub Pages with the included workflow. After one visit it works offline, and on a
phone "Add to Home Screen" installs it with its own icon. There is no server and no account.

- **Next:** the next 10 things to learn and why each matters. Choose fastest reading or HSK focus.
- **Read:** paste Chinese text to see what you can read, and the smallest set of things to learn for the rest.
- **Map:** what you know, what is one step away, and the whole language as a grid.
- **Progress:** save your progress to a file and restore it.
- **简/繁:** switch script anywhere. Learning one form counts toward the other.

## Rebuilding the data

    python -m venv .venv && . .venv/bin/activate
    pip install -r requirements.txt
    python scripts/fetch_data.py        # downloads data/raw, writes data/manifest.json
    python -m jiesuo.build_graph        # writes data/graph (about 20 seconds)
    python -m jiesuo.evaluate --tune    # picks settings on training sentences only
    python -m jiesuo.order              # writes data/order
    python -m jiesuo.evaluate           # scores held-out sentences
    python -m jiesuo.export_app         # writes app/data, one file per licence
    python scripts/phase1_report.py && python scripts/phase2_report.py
    python scripts/segmentation_check.py      # word splitting against UD
    python scripts/grammar_audit.py score     # grammar detection, from the labelled sample
    pytest && node --test tests/app.test.js

## Licences

See [LICENSES.md](LICENSES.md). Each example sentence names its Tatoeba author and translator,
as CC BY 2.0 FR requires. To refresh the names alone: `python scripts/fetch_data.py && python -m jiesuo.tatoeba_credits`.

## Known limitations

- **Three test sets, all short.** Tatoeba, about 1,000 Hong Kong subtitle and LegCo sentences, and
  1,500 wiki and news sentences. Novels and social media are untested. The wiki and news set
  shares Wikipedia with our frequency source.
- **Equal cost.** A component, a character and a word all cost 1 item, which is not how hard they are.
- **Knowing a character means reading every use of it.** Senses are not modelled, so learning
  行 as xíng also counts for háng.
- **Traditional is free.** Knowing 学 counts as reading 學. The app marks these tokens and lets you
  confirm the other form per item, but the percentage still counts them.
- **Word splitting differs from the evaluation.** The app splits text its own way, not with jieba.
  On wiki and news text it splits names it doesn't know into single characters, which can make
  the Read percentage too high. Its accuracy is measured in reports/accuracy.md.
- **Script conversion in Read is per word.** Text typed in Traditional is shown as typed. When
  Simplified text is converted, a lone character with more than one Traditional form (发) gets a "?".
- **Grammar does not affect the percentage.** Read can only spot the 67 patterns made of fixed
  words. Detection is about 92% precise, and finds about 65% of real uses. Pattern HSK levels are
  the author's estimates.
- **The HSK word list is OCR** and not fully proofread.
