from __future__ import annotations

import importlib
import json
import sys
from dataclasses import is_dataclass, fields as dataclass_fields
from pathlib import Path
from typing import Any

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = REPO_ROOT.parent / "config" / "model_feature_catalog.yaml"

if str(REPO_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT.parent))


def load_catalog() -> dict[str, Any]:
    raw = yaml.safe_load(CATALOG_PATH.read_text(encoding="utf-8"))
    assert isinstance(raw, dict), "Catalog root must be a mapping"
    return raw


def _load_json_schema(path: str) -> dict[str, Any]:
    schema_path = (REPO_ROOT.parent / path).resolve()
    if not schema_path.exists():
        raise AssertionError(f"JSON schema not found: {schema_path}")
    with schema_path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _load_pydantic_model(path: str):
    module_part, class_name = path.split("::", 1)
    if module_part.endswith(".py"):
        module_part = module_part[:-3]
    module_name = module_part.replace("/", ".")
    module = importlib.import_module(module_name)
    model = getattr(module, class_name)
    if not hasattr(model, "model_fields"):
        raise AssertionError(f"{path} does not expose pydantic model_fields")
    return model


def _load_dataclass(path: str):
    module_part, class_name = path.split("::", 1)
    if module_part.endswith(".py"):
        module_part = module_part[:-3]
    module_name = module_part.replace("/", ".")
    module = importlib.import_module(module_name)
    cls = getattr(module, class_name)
    if not is_dataclass(cls):
        raise AssertionError(f"{path} is not a dataclass")
    return cls


@pytest.mark.parametrize("category", load_catalog()["categories"])
def test_catalog_entries_have_consistent_shape(category: dict[str, Any]) -> None:
    assert "id" in category and category["id"], "Category requires an id"
    assert "label" in category and category["label"], "Category requires a label"
    entries = category.get("entries")
    assert isinstance(entries, list) and entries, f"Category {category['id']} must include entries"

    for entry in entries:
        for key in ("id", "signal", "status", "owner", "description"):
            assert entry.get(key), f"Entry {entry} missing {key}"
        status = entry["status"]
        if status == "available":
            sources = entry.get("sources")
            assert isinstance(sources, list) and sources, f"Available entry {entry['id']} must define sources"
            for source in sources:
                kind = source.get("kind")
                assert kind in {"json_schema", "pydantic_model", "dataclass"}, f"Unsupported source kind {kind}"
                fields = source.get("fields")
                assert isinstance(fields, list) and fields, f"Source {source} must list fields"
                if kind == "json_schema":
                    schema = _load_json_schema(source["path"])
                    properties = schema.get("properties", {})
                    missing = [field for field in fields if field not in properties]
                    assert not missing, f"{source['path']} missing fields: {missing}"
                elif kind == "pydantic_model":
                    model = _load_pydantic_model(source["path"])
                    model_fields = getattr(model, "model_fields")
                    missing = [field for field in fields if field not in model_fields]
                    assert not missing, f"{source['path']} missing pydantic fields: {missing}"
                elif kind == "dataclass":
                    cls = _load_dataclass(source["path"])
                    cls_fields = {field.name for field in dataclass_fields(cls)}
                    missing = [field for field in fields if field not in cls_fields]
                    assert not missing, f"{source['path']} missing dataclass fields: {missing}"
            apis = entry.get("apis")
            assert isinstance(apis, list) and apis, f"Available entry {entry['id']} must include API references"
        else:
            target_apis = entry.get("target_apis")
            assert isinstance(target_apis, list) and target_apis, f"Gap entry {entry['id']} must specify target_apis"
            roadmap = entry.get("roadmap")
            assert isinstance(roadmap, str) and roadmap.strip(), f"Gap entry {entry['id']} must include roadmap reference"
