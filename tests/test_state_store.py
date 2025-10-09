from shared.libs.storage.state import JsonStateStore


def test_state_store_roundtrip(tmp_path):
    store = JsonStateStore(root=tmp_path / "state")
    payload = {"cursor": "abc", "updated_at": "2024-01-01T00:00:00Z"}
    store.save("shopify", "tenant_orders", payload)
    loaded = store.load("shopify", "tenant_orders")
    assert loaded == payload


def test_state_store_missing_returns_empty(tmp_path):
    store = JsonStateStore(root=tmp_path / "state")
    assert store.load("shopify", "missing") == {}
