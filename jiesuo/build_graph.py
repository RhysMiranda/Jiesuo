"""Build the Jiesuo dependency graph. Run: python -m jiesuo.build_graph

Design decisions a reviewer may question:

* One glyph, one node. 木 is both a character and a component. Two nodes would
  charge the learner twice for one thing, so type is "character" when a glyph
  has its own frequency rank (or is needed by a word), with is_component=True.
  "component" means a glyph used only as a part (氵).
* Pictographs do not depend on their parts. Make Me a Hanzi splits 木 into 十+八,
  which is a statement about strokes, not about how anyone learns 木. Characters
  it labels pictographic become roots and the dropped edges are counted.
* Traditional forms are separate nodes joined by symmetric simp_trad edges, not
  a field on the Simplified node, because the mapping is many-to-many (发 -> 發, 髮)
  and because a Traditional glyph has its own decomposition (學 is not 学).
* Sentences are held out before anything else looks at them. The split is a hash
  of the Simplified text, so a Traditional duplicate cannot leak across it.
* Sentence tokens jieba finds outside the vocabulary back off to the longest
  known words, then to single characters. That is how a reader would attack a
  word they have not seen, and it keeps sentence->word edges from dangling.
"""
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

import jieba
import jieba.posseg
import networkx as nx
import opencc
import wordfreq

from . import sources as src
from .grammar import PATTERNS, compile_detector

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "graph"
N_CHARS, N_WORDS = 3500, 10000
HSK_FORCED_MAX = 6  # keep bands 1-6 in the graph so Phase 2 can run an HSK order
HOLDOUT_MOD = 10  # 1 in 10 sentences is held out
MAX_SENTENCE_CHARS = 40
SENTENCE_WORD_MIN = 2  # a word must appear in this many training sentences to be added

S2HK, T2S = opencc.OpenCC("s2hk"), opencc.OpenCC("t2s")


def rank_vocabulary():
    """Word frequencies, and character frequencies derived from them.

    wordfreq has no character table, so a character's frequency is the summed
    frequency of the Han-only words containing it. Ties are common because
    wordfreq stores rounded values, so the tiebreak is the string itself.
    """
    raw = wordfreq.get_frequency_dict("zh", "large")
    words = {w: f for w, f in raw.items() if src.is_han(w)}
    chars = Counter()
    for w, f in words.items():
        for c in w:
            chars[c] += f
    order = lambda d: sorted(d, key=lambda k: (-d[k], k))
    return words, chars, order(words), order(chars), sum(raw.values()) - sum(words.values())


def clean_senses(entries, limit=3):
    """Prefer common-noun senses over surname and place-name entries."""
    common = [e for e in entries if not e["pinyin"][:1].isupper()]
    chosen = common or entries
    senses = [s for e in chosen for s in e["english"] if not s.startswith(("surname ", "variant of ", "old variant of "))]
    readings = list(dict.fromkeys(e["pinyin"].lower() for e in chosen))  # 还 is both hai2 and huan2
    return (senses or [s for e in chosen for s in e["english"]])[:limit], ", ".join(readings)


def select_words(ranked, cedict, hsk, stats):
    chosen, no_dict = [], 0
    for w in ranked:
        if len(chosen) >= N_WORDS:
            break
        if w in cedict:
            chosen.append(w)
        else:
            no_dict += 1
    stats["words_skipped_not_in_cedict_before_cutoff"] = no_dict
    in_top = set(chosen)
    hsk_extra = sorted(w for w, l in hsk.items() if l <= HSK_FORCED_MAX and w not in in_top and src.is_han(w))
    grammar_extra = sorted({w for p in PATTERNS for w in p.requires} - in_top - set(hsk_extra))
    stats["words_top_by_frequency"] = len(chosen)
    stats["words_added_from_hsk_1_6"] = len(hsk_extra)
    stats["words_added_for_grammar"] = len(grammar_extra)
    return chosen + hsk_extra + grammar_extra


def is_variant_entry(entry):
    """CC-CEDICT lists obscure spellings as entries whose only sense is 'variant of X'."""
    return all(s.startswith(("variant of", "old variant of", "archaic variant of", "Japanese variant of")) for s in entry["english"])


def traditional_forms(word, cedict):
    """All Traditional spellings: CC-CEDICT's, plus OpenCC's Hong Kong form (裏 alongside 裡).

    May include the word itself (后 is written 后 in the sense of empress). Callers
    must skip it when making edges, but need it to know the form is shared.
    """
    entries = [e for e in cedict.get(word, []) if not is_variant_entry(e)]
    common = [e for e in entries if not e["pinyin"][:1].isupper()]
    forms = {e["traditional"] for e in common or entries}
    hk = S2HK.convert(word)
    forms.add(hk)
    if not forms - {hk}:
        forms.add(word) if hk == word else None
    return {f for f in forms if len(f) == len(word)}


def ids_parts(ids):
    return [c for c in ids if c not in src.IDC and c != src.UNKNOWN]


def edge_role(part, entry, closure):
    """How a part relates to the character.

    semantic, phonetic, both: from a pictophonetic etymology.
    meaning: an ideographic etymology names this part in its hint (好: woman 女, son 子).
    form: an etymology exists but does not mention this part.
    no_etymology, unmatched: the data gives no reason for this part being here.
    """
    ety = entry.get("etymology") or {}
    if ety.get("type") != "pictophonetic":
        if not ety:
            return "no_etymology"
        return "meaning" if part in (ety.get("hint") or "") else "form"
    sem, pho = ety.get("semantic"), ety.get("phonetic")
    hit_sem = part == sem or (sem in closure(part) if sem else False)
    hit_pho = part == pho or (pho in closure(part) if pho else False)
    if hit_sem and hit_pho:
        return "both"
    return "semantic" if hit_sem else "phonetic" if hit_pho else "unmatched"


def segment(text):
    return [(p.word, p.flag) for p in jieba.posseg.cut(text, HMM=False)]


def back_off(token, vocab, chars=()):
    """Split an out-of-vocabulary token into the longest known words, greedily.

    With `chars`, a single character that is not a word can still be a piece (桌上 -> 桌 + 上).
    Returns None if some character is in neither set.
    """
    out, i = [], 0
    while i < len(token):
        for j in range(len(token), i, -1):
            if token[i:j] in vocab or (j == i + 1 and token[i] in chars):
                out.append(token[i:j])
                i = j
                break
        else:
            return None
    return out


class Graph:
    def __init__(self):
        self.nodes, self.edges = {}, set()

    def add_node(self, nid, **attrs):
        self.nodes.setdefault(nid, {"id": nid}).update(attrs)

    def add_edge(self, src_id, dst_id, kind, role=""):
        self.edges.add((src_id, dst_id, kind, role))


def add_hanzi_tree(g, roots, mmh, stats):
    """Add each glyph and, recursively, the parts it is built from."""
    closure_cache = {}

    def closure(c):
        if c not in closure_cache:
            closure_cache[c] = set()  # guards against cycles while recursing
            found = set()
            for p in ids_parts(mmh.get(c, {}).get("decomposition", "")):
                if p != c:
                    found |= {p} | closure(p)
            closure_cache[c] = found
        return closure_cache[c]

    seen, stack = set(), list(roots)
    while stack:
        c = stack.pop()
        if c in seen:
            continue
        seen.add(c)
        entry = mmh.get(c)
        nid = f"h:{c}"
        if nid not in g.nodes:
            g.add_node(nid, type="component", form=c)
        if entry is None:
            g.nodes[nid]["decomposition"] = "missing"
            stats["chars_not_in_mmh"].append(c)
            continue
        ids = entry["decomposition"]
        ety_type = (entry.get("etymology") or {}).get("type")
        g.nodes[nid].update(ids=ids, etymology=ety_type, radical=entry.get("radical"))
        parts = ids_parts(ids)
        if ety_type == "pictographic" and parts:
            g.nodes[nid]["decomposition"] = "pictograph_root"
            stats["pictograph_edges_dropped"] += len(set(parts))
            continue
        status = "atomic" if ids == src.UNKNOWN else "partial" if src.UNKNOWN in ids else "full"
        g.nodes[nid]["decomposition"] = status
        for part in set(parts):
            if part == c:
                stats["self_loops_dropped"] += 1
                continue
            g.add_edge(f"h:{part}", nid, "component", edge_role(part, entry, closure))
            stack.append(part)
    return seen


def break_cycles(g, stats):
    """Break any cycle in the dependency edges and record what was removed."""
    dep = nx.DiGraph((a, b) for a, b, k, _ in g.edges if k != "simp_trad")
    removed = []
    for scc in [s for s in nx.strongly_connected_components(dep) if len(s) > 1]:
        sub = dep.subgraph(scc).copy()
        while not nx.is_directed_acyclic_graph(sub):
            a, b = nx.find_cycle(sub)[-1][:2]
            sub.remove_edge(a, b)
            removed.append((a, b))
    drop = set(removed)
    g.edges = {e for e in g.edges if (e[0], e[1]) not in drop}
    stats["cycle_edges_removed"] = [f"{a}->{b}" for a, b in removed]


def split_sentences(tatoeba, stats):
    """Filter, deduplicate and hold out Tatoeba sentences, and segment the training ones once."""
    held, train, seen_text = [], [], set()
    counts = Counter()
    for sid, (text, english) in sorted(tatoeba.items(), key=lambda kv: int(kv[0])):
        simp = T2S.convert(text)
        han = src.HAN_CHAR.findall(simp)
        if not han or any(ch.isascii() and ch.isalpha() for ch in simp):
            counts["dropped_no_han_or_latin"] += 1
            continue
        if len(han) > MAX_SENTENCE_CHARS:
            counts["dropped_too_long"] += 1
            continue
        if simp in seen_text:
            counts["dropped_duplicate"] += 1
            continue
        seen_text.add(simp)
        if int(hashlib.sha1(simp.encode()).hexdigest(), 16) % HOLDOUT_MOD == 0:
            held.append({"id": sid, "text": simp, "original": text, "en": english})
            counts["held_out"] += 1
            continue
        train.append((sid, simp, text, english, segment(simp)))
    stats["sentences"] = counts
    return train, held


def sentence_words(train, cedict, chars, already, stats):
    """Everyday words the frequency list misses (橙子, 抽屉): dictionary words, not names,
    made of graph characters, seen in at least SENTENCE_WORD_MIN training sentences.
    Held-out sentences are never looked at."""
    seen = Counter()
    for *_, tagged in train:
        for w in {tok for tok, _ in tagged}:
            if len(w) > 1 and w not in already and src.is_han(w) and w in cedict and all(c in chars for c in w):
                seen[w] += 1
    names = lambda w: all(e["pinyin"][:1].isupper() for e in cedict[w])
    extra = sorted(w for w, k in seen.items() if k >= SENTENCE_WORD_MIN and not names(w))
    stats["words_added_from_training_sentences"] = len(extra)
    return extra


def add_sentences(g, train, vocab, chars, stats):
    detectors = [(p.key, compile_detector(p.detect)) for p in PATTERNS]
    counts = stats["sentences"]
    for sid, simp, text, english, tagged in train:
        needed, ok = [], True
        for tok, _ in tagged:
            if not src.is_han(tok):
                continue
            counts["tokens"] += 1
            if tok in vocab:
                needed.append(tok)
                continue
            parts = back_off(tok, vocab, chars)
            if parts is None:
                ok = False
                counts["tokens_unresolvable"] += 1
            else:
                needed += parts
                counts["tokens_backed_off"] += 1
        if not ok or not needed:
            counts["dropped_unresolvable_token"] += 1
            continue
        nid = f"s:{sid}"
        g.add_node(nid, type="sentence", text=simp, original=text, en=english, script="T" if simp != text else "S")
        for w in set(needed):
            if w in vocab:
                g.add_edge(f"w:{w}", nid, "word_sentence")
            else:  # a character that is not a word on its own
                g.add_edge(f"h:{w}", nid, "char_sentence")
        line = " ".join(f"{w}/{f}" for w, f in tagged) + " "
        for key, rx in detectors:
            if rx.search(line):
                g.add_edge(f"g:{key}", nid, "pattern_sentence")
        counts["kept"] += 1
    stats["sentences"] = dict(counts)


def build():
    stats = defaultdict(int, chars_not_in_mmh=[])
    cedict, cedict_trad = src.load_cedict()
    mmh, hsk_w, hsk_c = src.load_mmh(), src.load_hsk_words(), src.load_hsk_chars()
    freq_w, freq_c, ranked_w, ranked_c, non_han_mass = rank_vocabulary()
    stats["wordfreq_non_han_mass"] = round(non_han_mass, 4)
    g = Graph()

    # Characters: top N canonical Simplified forms. A glyph OpenCC would convert
    # to something else is a Traditional spelling and does not take a rank slot.
    top_chars = []
    for c in ranked_c:
        if len(top_chars) == N_CHARS:
            break
        if T2S.convert(c) == c:
            top_chars.append(c)
        else:
            stats["chars_skipped_as_traditional"] += 1
    top_set = set(top_chars)

    jieba.setLogLevel(60)
    train, held = split_sentences(src.load_tatoeba(), stats)
    words = select_words(ranked_w, cedict, hsk_w, stats)
    words += sentence_words(train, cedict, top_set, set(words), stats)
    word_set = set(words)

    # Traditional forms of every word.
    word_forms = {w: traditional_forms(w, cedict) for w in words}
    word_trad = {w: forms - {w} for w, forms in word_forms.items()}
    needed = set(top_chars) | {c for w in words for c in w if src.is_han(c)}
    trad_chars = {c for forms in word_trad.values() for f in forms for c in f if src.is_han(c)}
    char_trad = defaultdict(set)
    for w, forms in word_trad.items():
        for f in forms:
            for a, b in zip(w, f):
                if a != b:
                    char_trad[a].add(b)
    char_forms = {c: traditional_forms(c, cedict) for c in needed}
    for c, forms in char_forms.items():
        char_trad[c] |= forms - {c}
    trad_chars |= {t for ts in char_trad.values() for t in ts}

    add_hanzi_tree(g, needed | trad_chars, mmh, stats)

    # Annotate character nodes and promote them from "component".
    rank_of = {c: i + 1 for i, c in enumerate(top_chars)}
    for c in needed | trad_chars:
        node = g.nodes[f"h:{c}"]
        is_simp = c in needed
        senses, pinyin = clean_senses(cedict.get(c, []) if is_simp else cedict_trad.get(c, []))
        node.update(
            type="character",
            # B: the same glyph is correct in both scripts. S: only ever Simplified.
            script="T" if not is_simp else "B" if c in trad_chars or c in char_forms[c] else "S",
            rank=rank_of.get(c),
            freq=freq_c.get(c, 0.0),
            pinyin=pinyin or " ".join((mmh.get(c) or {}).get("pinyin", [])),
            en=senses or ([mmh[c]["definition"]] if c in mmh and mmh[c].get("definition") else []),
            hsk=hsk_c.get(c),
            rare=c not in top_set and c in needed,
        )
    component_sources = {a for a, _, k, _ in g.edges if k == "component"}
    for nid, node in g.nodes.items():
        node["is_component"] = nid in component_sources

    # Character Simplified <-> Traditional.
    for s, ts in char_trad.items():
        for t in ts:
            g.add_edge(f"h:{s}", f"h:{t}", "simp_trad")
            g.add_edge(f"h:{t}", f"h:{s}", "simp_trad")

    # Words and their Traditional forms.
    for rank, w in enumerate(words, 1):
        senses, pinyin = clean_senses(cedict.get(w, []))
        g.add_node(
            f"w:{w}", type="word", form=w, script="B" if w in word_forms[w] else "S",
            rank=rank if rank <= stats["words_top_by_frequency"] else None,
            freq=freq_w.get(w, 0.0), pinyin=pinyin, en=senses, hsk=hsk_w.get(w),
            single_char=len(w) == 1, in_cedict=w in cedict,
            proper=bool(cedict.get(w)) and all(e["pinyin"][:1].isupper() for e in cedict[w]),
            max_char_rank=max((rank_of.get(c, N_CHARS + 1) for c in w), default=None),
        )
        for c in set(w):
            g.add_edge(f"h:{c}", f"w:{w}", "char_word")
        for t in word_trad[w]:
            tid = f"w:{t}"
            if t in word_set:
                # A form that is also a Simplified word, like 干 and 乾: one node, both scripts.
                g.nodes.setdefault(tid, {"id": tid})
            else:
                t_senses, t_pinyin = clean_senses(cedict_trad.get(t, [])) if t in cedict_trad else (senses, pinyin)
                g.add_node(tid, type="word", form=t, script="T", rank=None, freq=0.0, pinyin=t_pinyin, en=t_senses,
                           hsk=None, single_char=len(t) == 1, in_cedict=True, proper=False)
            for c in set(t):
                g.add_edge(f"h:{c}", tid, "char_word")
            g.add_edge(f"w:{w}", tid, "simp_trad")
            g.add_edge(tid, f"w:{w}", "simp_trad")
    trad_word_nodes = {t for forms in word_trad.values() for t in forms}
    for w in words:
        if w in trad_word_nodes:
            g.nodes[f"w:{w}"]["script"] = "B"

    # Grammar patterns need their words.
    for p in PATTERNS:
        g.add_node(f"g:{p.key}", type="pattern", form=p.pattern, hsk=p.level, en=p.explanation, detect=p.detect)
        for w in p.requires:
            g.add_edge(f"w:{w}", f"g:{p.key}", "word_pattern")

    # Sentences last. jieba keeps its own dictionary, so segmentation stays independent of our choices.
    chars = {n["form"] for n in g.nodes.values() if n.get("type") == "character" and n.get("script") != "T"}
    add_sentences(g, train, word_set, chars, stats)

    break_cycles(g, stats)
    return g, held, stats


def write(g, held, stats):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "nodes.jsonl", "w", encoding="utf8") as f:
        for nid in sorted(g.nodes):
            f.write(json.dumps(g.nodes[nid], ensure_ascii=False) + "\n")
    with open(OUT / "edges.tsv", "w", encoding="utf8") as f:
        for a, b, k, r in sorted(g.edges):
            f.write(f"{a}\t{b}\t{k}\t{r}\n")
    with open(OUT / "holdout_sentences.jsonl", "w", encoding="utf8") as f:
        for row in held:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    (OUT / "build_stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1) + "\n", encoding="utf8")


if __name__ == "__main__":
    graph, held_out, build_stats = build()
    write(graph, held_out, build_stats)
    print(len(graph.nodes), "nodes", len(graph.edges), "edges", len(held_out), "held out")
