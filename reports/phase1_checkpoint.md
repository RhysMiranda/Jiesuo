# Phase 1 checkpoint

## Nodes

| type | count | Simplified only | Traditional only | both scripts |
|---|---|---|---|---|
| component | 420 | - | - | - |
| character | 4,952 | 1168 | 1451 | 2333 |
| word | 17,084 | 5956 | 6379 | 4749 |
| pattern | 152 | - | - | - |
| sentence | 51,826 | 28725 | 23101 | - |
| **total** | 74,434 |  |  |  |

## Edges

| type | count |
|---|---|
| word_sentence | 338,483 |
| pattern_sentence | 65,213 |
| char_word | 33,221 |
| simp_trad | 15,688 |
| component | 10,247 |
| word_pattern | 227 |
| **total** | 463,079 |

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
| fully decomposed | 3197 | 4794 |
| partly decomposed (`？` in the IDS, like 发 = ⿸？又) | 151 | 251 |
| no parts given (`？`), treated as a root (人, 一) | 27 | 61 |
| pictograph, parts ignored on purpose (木 is not 十+八) | 124 | 180 |
| not in Make Me a Hanzi at all | 1 | 86 |

| component edge role | count |
|---|---|
| semantic | 3,277 |
| phonetic | 3,127 |
| meaning | 2,390 |
| no_etymology | 806 |
| form | 299 |
| unmatched | 269 |
| both | 79 |

- Component edges dropped from pictographs: 334
- Self-loops dropped: 0
- Cycle edges removed from the dependency graph: 0 []
- Glyphs missing from Make Me a Hanzi: 86, of which 1 are needed in Simplified: ['祂']
- Words containing a character rarer than rank 1,500: 1,665
- Words containing a character rarer than rank 2,500: 204
- Words containing a character rarer than rank 3,000: 11
- Words containing a character rarer than rank 3,500: 1
- Most frequent words with a character rarer than rank 3,000 (character's rank): 咦 (3047), 捅 (3012), 渲染 (3005), 昵称 (3010), 诶 (3103), 傀儡 (3069), 揍 (3022)
- Simplified characters with more than one Traditional form: 80, e.g. 发→發/髮, 说→說/説, 里→裏/裡, 当→噹/當, 面→麪/麵, 只→秖/隻, 并→並/併, 系→係/繫, 别→別/彆, 向→嚮/曏

## Sentences (Tatoeba, Mandarin with an English translation)

| step | count |
|---|---|
| tokens | 352,918 |
| kept | 51,826 |
| dropped_no_han_or_latin | 1,120 |
| tokens_backed_off | 29,563 |
| held_out | 6,362 |
| tokens_unresolvable | 5,460 |
| dropped_unresolvable_token | 4,842 |
| dropped_duplicate | 435 |
| dropped_too_long | 318 |

## Prerequisite depth

| item | median transitive prerequisites | 90th percentile | max |
|---|---|---|---|
| character (top 3,500) | 4.0 | 8 | 15 |
| word (frequency top 10,000) | 8.0 | 13 | 36 |
| sentence | 39.0 | 62 | 166 |

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

**h:獻** (character, script T)  
xian4 — to offer; to present; to dedicate  
needs: h:犬 (semantic), h:鬳 (phonetic)  
same item as: h:献  

**h:軀** (character, script T)  
qu1 — human body  
needs: h:區 (phonetic), h:身 (semantic)  
same item as: h:躯  

**h:返** (character, script B, rank 1411, HSK 5)  
fan3 — to return (to)  
needs: h:反 (meaning), h:辶 (meaning)  

**w:另類** (word, script T)  
ling4 lei4 — offbeat; alternative; avant-garde  
needs: h:另, h:類  
same item as: w:另类  

**w:投身** (word, script B, rank 9643, HSK 7)  
tou2 shen1 — to throw oneself into sth  
needs: h:投, h:身  

**w:观赏** (word, script S, rank 5837, HSK 7)  
guan1 shang3 — to look at sth with pleasure; to watch (sth marvelous); ornamental  
needs: h:观, h:赏  
same item as: w:觀賞  

**g:zhengzai** (pattern, HSK 2)  
 — Stresses that the action is under way right now.  
needs: w:正在  

**s:762004** (sentence, script T)  
我喜歡你。 — I like you.  
needs: w:你, w:喜欢, w:我  

**s:8933583** (sentence, script S)  
恶劣的天气对他的健康带来了影响。 — The bad weather affected his health.  
needs: g:dui-toward, w:了, w:他, w:健康, w:天气, w:对, w:带来, w:影响, w:恶劣, w:的  

