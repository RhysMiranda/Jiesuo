"""Run after building the graph."""
import pytest

from jiesuo.order import HARD_ROLES, Data, Model, add_patterns, back_off, from_targets, greedy, word_unit


@pytest.fixture(scope="module")
def data():
    return Data()


@pytest.mark.parametrize("mode", list(HARD_ROLES))
def test_prerequisites_always_come_first(data, mode):
    model = data.model(mode)
    for name, order in data.orders(mode).items():
        pos = {u: i for i, u in enumerate(order)}
        assert len(pos) == len(order), f"{name} repeats an item"
        for u in order:
            for p in model.prereq.get(u, ()):
                assert pos[p] < pos[u], (name, p, u)


def test_every_word_is_reachable_in_every_order(data):
    wanted = {word_unit(f) for f in data.words}
    for name, order in data.orders().items():
        assert wanted <= set(order), name


def test_no_traditional_only_words_in_orders(data):
    for order in data.orders().values():
        assert not [u for u in order if u.startswith("w:") and data.nodes[u]["script"] == "T"]


def test_structural_edges_are_not_hard_in_primary_mode(data):
    assert "h:白" not in data.model("explained").prereq.get("h:的", ())  # no etymology
    assert "h:白" in data.model("all").prereq.get("h:的", ())
    assert "h:女" in data.model("explained").prereq.get("h:好", ())  # hint names 女


def test_greedy_prefers_cheap_value_over_expensive_value():
    m = Model({"a": 2.0, "b": 3.0}, {"b": {"x", "y", "z"}})
    assert greedy(m)[0] == "a"
    assert greedy(m) == ["a", "x", "y", "z", "b"]


def test_greedy_reuses_shared_prerequisites():
    # After paying for s via w1, w2 costs only itself and beats the standalone v.
    m = Model({"w1": 10.0, "w2": 4.0, "v": 3.0}, {"w1": {"s"}, "w2": {"s"}})
    assert greedy(m) == ["s", "w1", "w2", "v"]


def test_from_targets_pays_for_prerequisites_once():
    m = Model({}, {"a": {"p"}, "b": {"p", "q"}})
    assert from_targets(m, ["a", "b"]) == ["p", "a", "q", "b"]


def test_back_off_falls_back_to_characters():
    assert back_off("桌上", {"上"}, {"桌", "上"}) == ["桌", "上"]
    assert back_off("学生们", {"学生", "们"}, {"学", "生", "们"}) == ["学生", "们"]
    assert back_off("鱻", {"上"}, {"上"}) is None


def test_patterns_follow_their_words(data):
    order = data.orders()["unlock"]
    merged = add_patterns(order, data.nodes, data.edges)
    pos = {u: i for i, u in enumerate(merged)}
    assert len(merged) - len(order) == sum(1 for n in data.nodes.values() if n["type"] == "pattern")
    assert [u for u in merged if not u.startswith("g:")] == order
    for a, b, kind, _ in data.edges:
        if kind == "word_pattern":
            assert pos[word_unit(a[2:])] < pos[b], (a, b)
