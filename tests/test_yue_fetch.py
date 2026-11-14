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
