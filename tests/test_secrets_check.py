import os

from apps.worker.maintenance.secrets import check_secrets


def test_check_secrets_detects_missing(monkeypatch):
    monkeypatch.delenv("SHOPIFY_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("SHOPIFY_SHOP_DOMAIN", raising=False)
    report = check_secrets()
    assert "SHOPIFY_ACCESS_TOKEN" in report["missing"]
    assert "SHOPIFY_SHOP_DOMAIN" in report["missing"]


def test_check_secrets_optional(monkeypatch):
    monkeypatch.setenv("SHOPIFY_ACCESS_TOKEN", "token")
    monkeypatch.setenv("SHOPIFY_SHOP_DOMAIN", "store")
    monkeypatch.delenv("META_ACCESS_TOKEN", raising=False)
    report = check_secrets()
    assert not report["missing"]
    assert "META_ACCESS_TOKEN" in report["optional_missing"]
