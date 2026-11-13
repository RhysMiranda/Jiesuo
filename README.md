# Jiesuo 解锁

An open-source Mandarin learning tool built on a dependency graph of the language:
components → characters → words → grammar patterns → sentences.

![Share of held-out text readable after N items, for three learning orders](reports/coverage.png)

On 6,362 held-out Tatoeba sentences, with every order paying for its prerequisites:

| Items learned | Unlock order | Frequency order | HSK order |
|---:|---:|---:|---:|
| 100 | 40.1% | 37.0% | 38.9% |
| 500 | 59.1% | 57.5% | 56.4% |
| 1,000 | 67.0% | 66.0% | 66.0% |
| 2,000 | 76.8% | 75.8% | 75.5% |

The unlock order leads on individual words, by 1 to 3 points from 1,000 items on. HSK order
wins on whole sentences you can read start to finish: 11.5% against 8.7% at 1,000 items, and
22.1% against 20.4% at 2,000. The app offers both. Confidence intervals and sensitivity checks are in
[reports/phase2_checkpoint.md](reports/phase2_checkpoint.md).

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
    pytest && node --test tests/app.test.js

## Licences

See [LICENSES.md](LICENSES.md). Each example sentence names its Tatoeba author and translator,
as CC BY 2.0 FR requires. To refresh the names alone: `python scripts/fetch_data.py && python -m jiesuo.tatoeba_credits`.

## Known limitations

- **One test corpus.** Held-out text is Tatoeba: short sentences, many written for learners.
  Results on novels or news may differ.
- **Equal cost.** A component, a character and a word all cost 1 item, which is not how hard they are.
- **Knowing a character means reading every use of it.** Senses are not modelled, so learning
  行 as xíng also counts for háng.
- **Traditional is free.** Knowing 学 counts as reading 學. The app marks these tokens and lets you
  confirm the other form per item, but the percentage still counts them.
- **Word splitting differs from the evaluation.** The app splits text with its own frequency-based
  method, not jieba. On held-out text its coverage runs up to about 1 point higher than the figures above.
- **Script conversion in Read is per word.** A lone 发 always shows as 發, even where 髮 is meant.
- **Grammar does not affect the percentage.** Read can only spot the 67 patterns made of fixed
  words. Pattern detection is heuristic, and pattern HSK levels are the author's estimates.
- **The HSK word list is OCR** and not fully proofread.
