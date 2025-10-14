from __future__ import annotations

import json
from datetime import datetime, timezone
from apps.worker.maintenance import secrets


def test_compile_catalog_includes_metadata(monkeypatch):
    for requirement in secrets.REQUIRED_SECRETS:
        monkeypatch.delenv(requirement.name, raising=False)

    monkeypatch.setenv("SHOPIFY_ACCESS_TOKEN", "token-test")

    timestamp = datetime(2025, 1, 1, tzinfo=timezone.utc)
    catalog = secrets.compile_catalog(now=timestamp)

    assert catalog["generated_at"] == timestamp.isoformat()
    assert catalog["stats"]["total"] == len(secrets.REQUIRED_SECRETS)
    assert catalog["stats"]["present"] == 1

    shopify_entry = next(item for item in catalog["secrets"] if item["name"] == "SHOPIFY_ACCESS_TOKEN")
    assert shopify_entry["present"] is True
    assert shopify_entry["service"] == "shopify"
    assert shopify_entry["owner"]
    assert shopify_entry["storage"]

    meta_entry = next(item for item in catalog["secrets"] if item["name"] == "META_ACCESS_TOKEN")
    assert meta_entry["optional"] is True
    assert meta_entry["present"] is False
    assert meta_entry["notes"]


def test_write_catalog_creates_parent_directories(tmp_path):
    catalog = {
        "generated_at": "2025-01-01T00:00:00+00:00",
        "secrets": [],
        "stats": {"total": 0, "present": 0, "missing": 0, "optional_missing": 0},
    }
    destination = tmp_path / "state" / "security" / "catalog.json"
    written = secrets.write_catalog(catalog, destination)

    assert written == destination
    assert destination.exists()
    payload = json.loads(destination.read_text())
    assert payload == catalog


def test_main_writes_catalog_with_custom_path(tmp_path, monkeypatch, capsys):
    for requirement in secrets.REQUIRED_SECRETS:
        monkeypatch.delenv(requirement.name, raising=False)

    output_path = tmp_path / "catalog.json"
    secrets.main(["--write-catalog", "--catalog-path", str(output_path)])

    captured = capsys.readouterr()
    assert "Credential catalog saved" in captured.out
    assert output_path.exists()
    payload = json.loads(output_path.read_text())
    assert payload["stats"]["total"] == len(secrets.REQUIRED_SECRETS)
