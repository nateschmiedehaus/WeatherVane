import os
from datetime import datetime, timedelta

import json

import pytest

from apps.worker.maintenance.retention import (
    purge_lake_data,
    discover_tenants,
    run_retention_sweep,
    load_retention_summary,
)
from shared.libs.storage.state import JsonStateStore
from shared.observability import metrics


def _call(task_or_fn, *args, **kwargs):
    target = getattr(task_or_fn, "fn", task_or_fn)
    return target(*args, **kwargs)


def test_purge_lake_data_removes_only_expired_files(tmp_path):
    tenant_id = "tenant_demo"
    dataset_dir = tmp_path / f"{tenant_id}_orders"
    dataset_dir.mkdir(parents=True)

    old_file = dataset_dir / "old.parquet"
    old_file.write_text("old")
    ancient = datetime.utcnow() - timedelta(days=400)
    os.utime(old_file, (ancient.timestamp(), ancient.timestamp()))

    fresh_file = dataset_dir / "fresh.parquet"
    fresh_file.write_text("fresh")

    removed = _call(purge_lake_data, tenant_id, retention_days=365, lake_root=str(tmp_path))

    assert str(old_file) in removed
    assert fresh_file.exists()


def test_discover_tenants(tmp_path):
    (tmp_path / "tenant-a_orders").mkdir(parents=True)
    (tmp_path / "tenant-b_shopify_products").mkdir(parents=True)
    tenants = _call(discover_tenants, str(tmp_path))
    assert tenants == ["tenant-a", "tenant-b"]


def test_run_retention_sweep_multiple_tenants(tmp_path, monkeypatch):
    lake_root = tmp_path / "lake"
    (lake_root / "tenant-a_orders").mkdir(parents=True)
    (lake_root / "tenant-b_orders").mkdir(parents=True)
    old = lake_root / "tenant-a_orders" / "old.parquet"
    old.write_text("old")
    ancient = datetime.utcnow() - timedelta(days=400)
    os.utime(old, (ancient.timestamp(), ancient.timestamp()))

    monkeypatch.setenv("PREFECT__LOGGING__LEVEL", "WARNING")

    captured: list[dict[str, object]] = []

    def stub_webhook(url: str, payload: dict[str, object]) -> None:
        captured.append({"url": url, "payload": payload})

    monkeypatch.setattr("apps.worker.maintenance.retention._post_webhook", stub_webhook)

    summary_root = tmp_path / "state"
    context_root = tmp_path / "context"
    context_root.mkdir(parents=True, exist_ok=True)
    ts_a = datetime.utcnow().isoformat()
    (context_root / f"tenant-a_{ts_a.replace(':', '-')}.json").write_text(
        json.dumps(
            {
                "tenant_id": "tenant-a",
                "created_at": ts_a,
                "dataset_profiles": [],
                "tags": ["geo.partial", "history.short"],
                "metadata": {},
            },
            indent=2,
        )
    )
    ts_b = datetime.utcnow().isoformat()
    (context_root / f"tenant-b_{ts_b.replace(':', '-')}.json").write_text(
        json.dumps(
            {
                "tenant_id": "tenant-b",
                "created_at": ts_b,
                "dataset_profiles": [],
                "tags": ["geo.missing"],
                "metadata": {},
            },
            indent=2,
        )
    )
    metrics_dir = metrics.configure_run(base_dir=str(tmp_path / "metrics"), ensure_clean=True)
    try:
        result = run_retention_sweep(
            tenant_ids=["tenant-a", "tenant-b"],
            retention_days=365,
            lake_root=str(lake_root),
            webhook_url="https://example.test/hook",
            summary_root=str(summary_root),
            context_root=str(context_root),
        )
    finally:
        metrics.reset_run_directory()

    assert len(result["summaries"]) == 2
    summary_a = next(item for item in result["summaries"] if item["tenant_id"] == "tenant-a")
    assert str(old) in summary_a["removed"]
    assert summary_a["removed_count"] == 1
    assert summary_a["context_tags"] == ["geo.partial", "history.short"]
    assert summary_a["context_warnings"] == [
        {
            "code": "history_short",
            "message": "Order history is short; Autopilot should stay in assist while coverage improves.",
            "severity": "warning",
            "tags": ["history.short"],
        }
    ]
    assert result["total_removed"] == 1
    assert result["tenant_count"] == 2
    assert "timestamp" in result
    assert result["tag_counts"] == {"geo.missing": 1, "geo.partial": 1, "history.short": 1}
    assert result["warning_counts"] == {"warning": 1}
    assert result["warning_codes"] == {"history_short": 1}

    assert len(captured) == 2
    per_tenant = next(payload for payload in captured if payload["payload"]["event"] == "retention.sweep.completed")
    assert per_tenant["payload"]["removed_count"] == 1
    summary_event = next(payload for payload in captured if payload["payload"]["event"] == "retention.sweep.summary")
    assert summary_event["payload"]["total_removed"] == 1
    assert summary_event["payload"]["warning_counts"] == {"warning": 1}

    store = JsonStateStore(root=summary_root)
    latest = store.load("retention", "latest")
    assert latest["total_removed"] == 1
    assert latest["tag_counts"] == {"geo.missing": 1, "geo.partial": 1, "history.short": 1}
    assert latest["warning_codes"] == {"history_short": 1}
    history = store.load("retention-history", result["timestamp"].split("T", 1)[0])
    assert history["tenant_count"] == 2
    assert history["warning_counts"] == {"warning": 1}

    latest_summary = load_retention_summary(str(summary_root))
    assert latest_summary["total_removed"] == 1
    specific_summary = load_retention_summary(
        str(summary_root), day=result["timestamp"].split("T", 1)[0]
    )
    assert specific_summary["warning_codes"] == {"history_short": 1}
    with pytest.raises(FileNotFoundError):
        load_retention_summary(str(summary_root), day="1999-01-01")

    metrics_file = metrics_dir / "metrics.jsonl"
    assert metrics_file.exists()
    records = [json.loads(line) for line in metrics_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    tenant_events = [record for record in records if record["event"] == "retention.tenant_sweep"]
    assert len(tenant_events) == 2
    assert any(event["tags"]["removed"] == "yes" for event in tenant_events)
    summary_event = next(record for record in records if record["event"] == "retention.sweep_summary")
    assert summary_event["payload"]["total_removed"] == 1
    assert summary_event["tags"]["webhook"] == "enabled"
