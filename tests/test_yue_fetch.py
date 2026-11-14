import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load():
    spec = importlib.util.spec_from_file_location("fetch_yue_data", ROOT / "scripts" / "fetch_yue_data.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_manifest_lists_every_source():
    mod = _load()
    manifest = json.loads((ROOT / "data" / "yue" / "manifest.json").read_text())
    for key in [*mod.SOURCES, "cantone", "wordshk"]:
        assert key in manifest, key
        assert manifest[key]["sha256"], key
        assert manifest[key]["bytes"] > 0, key
    assert manifest["cantone"]["files"] > 30000


class _Resp:
    def __init__(self, body, length):
        self._b, self.headers = body, {"Content-Length": str(length)}

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_get_retries_short_body(monkeypatch):
    mod = _load()
    monkeypatch.setattr(mod.time, "sleep", lambda s: None)
    replies = [_Resp(b"abc", 10), _Resp(b"0123456789", 10)]
    monkeypatch.setattr(mod.urllib.request, "urlopen", lambda *a, **k: replies.pop(0))
    assert mod.get("http://x") == b"0123456789"
    assert not replies


def test_get_raises_when_always_short(monkeypatch):
    import http.client
    import pytest
    mod = _load()
    monkeypatch.setattr(mod.time, "sleep", lambda s: None)
    monkeypatch.setattr(mod.urllib.request, "urlopen", lambda *a, **k: _Resp(b"abc", 10))
    with pytest.raises(http.client.IncompleteRead):
        mod.get("http://x")


def test_merge_manifest_detects_mismatch(tmp_path):
    mod = _load()
    m = tmp_path / "manifest.json"
    m.write_text(json.dumps({"a": {"sha256": "old", "bytes": 1}}))
    fresh = {"a": {"sha256": "new", "bytes": 2}, "b": {"sha256": "x", "bytes": 3}}
    assert mod.merge_manifest(m, fresh) == ["a"]
    assert json.loads(m.read_text())["a"]["sha256"] == "old"
    assert "b" not in json.loads(m.read_text())
    assert mod.merge_manifest(m, fresh, update=True) == ["a"]
    assert json.loads(m.read_text())["a"]["sha256"] == "new"
    assert "b" in json.loads(m.read_text())
