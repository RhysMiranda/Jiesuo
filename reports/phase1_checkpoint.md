# Phase 1 checkpoint

## Nodes

| type | count | Simplified only | Traditional only | both scripts |
|---|---|---|---|---|
| component | 420 | - | - | - |
| character | 4,955 | 1168 | 1454 | 2333 |
| word | 21,233 | 7490 | 8009 | 5734 |
| pattern | 152 | - | - | - |
| sentence | 56,068 | 30741 | 25327 | - |
| **total** | 82,828 |  |  |  |

## Edges

| type | count |
|---|---|
| word_sentence | 362,705 |
| pattern_sentence | 70,551 |
| char_word | 43,344 |
| simp_trad | 18,958 |
| component | 10,251 |
| char_sentence | 2,724 |
| word_pattern | 227 |
| **total** | 508,760 |

## Vocabulary selection

- words_top_by_frequency: 10,000
- words_added_from_hsk_1_6: 704
- words_added_for_grammar: 1
- words_skipped_not_in_cedict_before_cutoff: 566
- chars_skipped_as_traditional: 1
- graph words with no CC-CEDICT entry (HSK or grammar only): 15
- wordfreq probability mass on non-Han tokens, ignored: 4.5%

## Messy cases

| decomposition status | top 3,500 | all glyphs |
|---|---|---|
| fully decomposed | 3197 | 4796 |
| partly decomposed (`？` in the IDS, like 发 = ⿸？又) | 151 | 251 |
| no parts given (`？`), treated as a root (人, 一) | 27 | 61 |
| pictograph, parts ignored on purpose (木 is not 十+八) | 124 | 180 |
| not in Make Me a Hanzi at all | 1 | 87 |

| component edge role | count |
|---|---|
| semantic | 3,279 |
| phonetic | 3,129 |
| meaning | 2,390 |
| no_etymology | 806 |
| form | 299 |
| unmatched | 269 |
| both | 79 |

- Component edges dropped from pictographs: 334
- Self-loops dropped: 0
- Cycle edges removed from the dependency graph: 0 []
- Glyphs missing from Make Me a Hanzi: 87, of which 1 are needed in Simplified: ['祂']
- Words containing a character rarer than rank 1,500: 2,540
- Words containing a character rarer than rank 2,500: 453
- Words containing a character rarer than rank 3,000: 104
- Words containing a character rarer than rank 3,500: 1
- Most frequent words with a character rarer than rank 3,000 (character's rank): 咦 (3047), 捅 (3012), 渲染 (3005), 昵称 (3010), 诶 (3103), 傀儡 (3069), 揍 (3022)
- Simplified characters with more than one Traditional form: 81, e.g. 发→發/髮, 说→說/説, 里→裏/裡, 当→噹/當, 面→麪/麵, 只→秖/隻, 并→並/併, 系→係/繫, 别→別/彆, 向→嚮/曏

## Sentences (Tatoeba, Mandarin with an English translation)

| step | count |
|---|---|
| dropped_no_han_or_latin | 1,120 |
| held_out | 6,362 |
| dropped_duplicate | 435 |
| dropped_too_long | 318 |
| tokens | 352,918 |
| kept | 56,068 |
| tokens_backed_off | 24,797 |
| tokens_unresolvable | 632 |
| dropped_unresolvable_token | 600 |

## Prerequisite depth

| item | median transitive prerequisites | 90th percentile | max |
|---|---|---|---|
| character (top 3,500) | 4.0 | 8 | 15 |
| word (frequency top 10,000) | 8.0 | 13 | 36 |
| sentence | 39.0 | 64 | 165 |

## Coverage of SUBTLEX-CH (evaluation only, never shipped)

Characters: 46,841,097 tokens, 5,936 types.

| top-N characters | our order | SUBTLEX's own order (ceiling) |
|---|---|---|
| 100 | 51.14% | 58.17% |
| 500 | 81.03% | 85.02% |
| 1,000 | 91.41% | 93.97% |
| 2,000 | 98.10% | 98.86% |
| 3,000 | 99.70% | 99.81% |
| 3,500 | 99.87% | 99.92% |

Words: 33,526,201 Han tokens, 90,706 types.

| top-N words | our order | SUBTLEX's own order (ceiling) |
|---|---|---|
| 100 | 50.76% | 56.12% |
| 500 | 68.33% | 74.95% |
| 1,000 | 75.24% | 81.56% |
| 2,000 | 81.68% | 87.35% |
| 5,000 | 89.52% | 93.36% |
| 10,000 | 94.02% | 96.57% |

## Ten random nodes with direct prerequisites (seed 2026)

**h:侌** (component)  
needs: h:云 (unmatched), h:今 (phonetic)  

**h:獸** (character, script T)  
shou4 — beast; animal; beastly  
needs: h:嘼 (phonetic), h:犬 (semantic)  
same item as: h:兽  

**h:躯** (character, script S, rank 2827, HSK 7)  
qu1 — human body  
needs: h:区 (phonetic), h:身 (semantic)  
same item as: h:軀  

**h:迎** (character, script B, rank 933, HSK 2)  
ying2 — to welcome; to meet; to forge ahead (esp. in the face of difficulties); to meet face to face  
needs: h:卬 (phonetic), h:辶 (semantic)  

**w:鼓吹** (word, script B, rank 8086)  
gu3 chui1 — to agitate for; to enthusiastically promote  
needs: h:吹, h:鼓  

**w:募集** (word, script B, rank 8004)  
mu4 ji2 — to raise; to collect  
needs: h:募, h:集  

**w:平静** (word, script S, rank 4489, HSK 4)  
ping2 jing4 — tranquil; undisturbed; serene  
needs: h:平, h:静  
same item as: w:平靜  

**g:zai-xia** (pattern, HSK 4)  
 — Under certain conditions or help.  
needs: w:下, w:在  

**s:469410** (sentence, script S)  
你想成为什么？ — What do you want to be?  
needs: g:shenme, g:xiang-want, w:什么, w:你, w:想, w:成为  

**s:8905162** (sentence, script S)  
汤姆今晚不在这里。 — Tom isn't here tonight.  
needs: g:zai-location, w:不, w:今晚, w:在, w:汤姆, w:这里  

