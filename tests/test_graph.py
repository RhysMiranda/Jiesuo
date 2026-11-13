"""Run after building: python -m jiesuo.build_graph && pytest"""
import json
from collections import defaultdict
from pathlib import Path

import networkx as nx
import pytest

from jiesuo import build_graph as bg
from jiesuo import sources as src
from jiesuo.grammar import PATTERNS, compile_detector

G = Path(__file__).resolve().parent.parent / "data" / "graph"


@pytest.fixture(scope="module")
def graph():
    nodes = {n["id"]: n for n in map(json.loads, open(G / "nodes.jsonl", encoding="utf8"))}
    edges = [tuple(line.rstrip("\n").split("\t")) for line in open(G / "edges.tsv", encoding="utf8")]
    return nodes, edges


def prereqs(edges, nid, kind=None):
    return {a for a, b, k, _ in edges if b == nid and (kind is None or k == kind)}


def test_no_dangling_edges(graph):
    nodes, edges = graph
    assert not [e for e in edges if e[0] not in nodes or e[1] not in nodes]


def test_every_node_is_typed(graph):
    nodes, _ = graph
    assert all(n.get("type") in {"component", "character", "word", "pattern", "sentence"} for n in nodes.values())


def test_word_edges_are_exactly_its_characters(graph):
    nodes, edges = graph
    got = defaultdict(set)
    for a, b, k, _ in edges:
        if k == "char_word":
            got[b].add(a[2:])
    for nid, n in nodes.items():
        if n["type"] == "word":
            assert got[nid] == set(n["form"]), nid


def test_every_word_character_exists(graph):
    nodes, _ = graph
    for n in nodes.values():
        if n["type"] == "word":
            assert all(f"h:{c}" in nodes for c in n["form"])


def test_simp_trad_is_symmetric_and_joins_like_with_like(graph):
    _, edges = graph
    st = {(a, b) for a, b, k, _ in edges if k == "simp_trad"}
    assert st
    assert not [(a, b) for a, b in st if (b, a) not in st]
    assert not [(a, b) for a, b in st if a == b or a[0] != b[0]]


def test_dependencies_are_acyclic(graph):
    _, edges = graph
    assert nx.is_directed_acyclic_graph(nx.DiGraph((a, b) for a, b, k, _ in edges if k != "simp_trad"))


def test_character_count_matches_target(graph):
    nodes, _ = graph
    ranks = sorted(n["rank"] for n in nodes.values() if n["type"] == "character" and n.get("rank"))
    assert ranks == list(range(1, bg.N_CHARS + 1))


def test_holdout_is_disjoint_from_graph(graph):
    nodes, _ = graph
    texts = {n["text"] for n in nodes.values() if n["type"] == "sentence"}
    held = [json.loads(line) for line in open(G / "holdout_sentences.jsonl", encoding="utf8")]
    assert len(held) > 3000
    assert not [h for h in held if h["text"] in texts or f"s:{h['id']}" in nodes]


@pytest.mark.parametrize("part,char", [("木", "林"), ("木", "森"), ("女", "好"), ("子", "好")])
def test_known_components(graph, part, char):
    assert f"h:{part}" in prereqs(graph[1], f"h:{char}", "component")


def test_pictograph_has_no_parts(graph):
    assert not prereqs(graph[1], "h:木", "component")


def test_phonetic_and_semantic_roles(graph):
    roles = {a: r for a, b, k, r in graph[1] if b == "h:妈" and k == "component"}
    assert roles == {"h:女": "semantic", "h:马": "phonetic"}


def test_word_depends_on_its_characters(graph):
    assert prereqs(graph[1], "w:学生", "char_word") == {"h:学", "h:生"}


@pytest.mark.parametrize("simp,trads", [("h:发", {"h:發", "h:髮"}), ("h:后", {"h:後"}), ("w:头发", {"w:頭髮"}), ("w:学生", {"w:學生"})])
def test_simp_trad_links(graph, simp, trads):
    assert {b for a, b, k, _ in graph[1] if a == simp and k == "simp_trad"} == trads


def test_hong_kong_forms_are_linked(graph):
    assert {"w:裏面", "w:裡面"} <= {b for a, b, k, _ in graph[1] if a == "w:里面" and k == "simp_trad"}


def test_shared_glyph_is_labelled_both(graph):
    nodes, _ = graph
    assert nodes["h:木"]["script"] == "B"
    assert nodes["h:后"]["script"] == "B"
    assert nodes["h:发"]["script"] == "S"
    assert nodes["h:發"]["script"] == "T"


def test_patterns_are_well_formed(graph):
    nodes, edges = graph
    assert 140 <= len(PATTERNS) <= 165
    assert len({p.key for p in PATTERNS}) == len(PATTERNS)
    for p in PATTERNS:
        assert p.level in (1, 2, 3, 4) and p.explanation and p.requires
        assert {f"w:{w}" for w in p.requires} <= prereqs(edges, f"g:{p.key}", "word_pattern")


def test_every_pattern_has_an_example_sentence(graph):
    _, edges = graph
    used = {a for a, _, k, _ in edges if k == "pattern_sentence"}
    assert not [p.key for p in PATTERNS if f"g:{p.key}" not in used]


@pytest.mark.parametrize("key,text,expected", [
    ("suiran-danshi", "虽然下雨,但是我去了。", True),
    ("suiran-danshi", "我去了。", False),
    ("ba-disposal", "他把书放在桌子上。", True),
    ("bi-compare", "他比我高。", True),
    ("ma-question", "你好吗?", True),
    ("ma-question", "吗你好。", False),
    ("le-change", "下雨了。", True),
    ("guo-experience", "我去过北京。", True),
    ("guo-experience", "不过他没来。", False),
    ("ji-count", "他几乎不来。", False),
    ("ji-count", "你有几个孩子?", True),
    ("number-measure", "我有三本书。", True),
])
def test_detectors(key, text, expected):
    rx = compile_detector(next(p for p in PATTERNS if p.key == key).detect)
    line = " ".join(f"{w}/{f}" for w, f in bg.segment(text)) + " "
    assert bool(rx.search(line)) is expected, line


def test_back_off_uses_longest_known_words():
    assert bg.back_off("学生们", {"学生", "们", "学", "生"}) == ["学生", "们"]
    assert bg.back_off("学生们", {"学"}) is None


def test_hsk_parser_keeps_every_band_whole():
    """Regression: a word ending in 表 was once read as a heading, dropping the rest of its band."""
    from collections import Counter
    words, chars = src.load_hsk_words(), src.load_hsk_chars()
    per_band = Counter(words.values())
    for band, listed in {1: 500, 2: 772, 3: 973, 4: 1000, 5: 1071, 6: 1140, 7: 5636}.items():
        # Duplicates across forms and variants move the count a little, never by much.
        assert listed * 0.9 <= per_band[band] <= listed * 1.1, (band, per_band[band])
    assert Counter(chars.values()) == {1: 300, 2: 300, 3: 300, 4: 300, 5: 300, 6: 300, 7: 1200}
    assert words["手表"] == 2 and words["虽然"] == 2 and words["已经"] == 2


def test_hsk_parser_strips_notes_and_keeps_variants():
    words = src.load_hsk_words()
    assert words["爸爸"] == 1 and words["爸"] == 1 and words["别"] == 1
    assert not [w for w in words if "（" in w or "｜" in w]
    assert set(words.values()) == {1, 2, 3, 4, 5, 6, 7}
