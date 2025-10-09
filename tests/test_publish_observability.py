from pathlib import Path

from apps.worker.maintenance import publish_observability


def test_publish_dry_run(tmp_path):
    summary_root = tmp_path / "state"
    (summary_root / "retention").mkdir(parents=True)
    (summary_root / "geocoding").mkdir(parents=True)
    (summary_root / "retention" / "latest.json").write_text(
        """
        {
            "summaries": [],
            "total_removed": 0,
            "tenant_count": 0,
            "warning_counts": {},
            "tag_counts": {}
        }
        """
    )
    (summary_root / "geocoding" / "tenant.json").write_text(
        """
        {
            "ratio": 1.0,
            "status": "ok"
        }
        """
    )

    retention_path, geocoding_path = publish_observability.publish(
        dataset="analytics.telemetry",
        retention_table="retention",
        geocoding_table="geocoding",
        summary_root=str(summary_root),
        output_dir=str(tmp_path / "out"),
        bq_binary="bq",
        dry_run=True,
    )
    assert retention_path.exists()
    assert geocoding_path.exists()


def test_publish_executes_bq(monkeypatch, tmp_path):
    summary_root = tmp_path / "state"
    (summary_root / "retention").mkdir(parents=True)
    (summary_root / "geocoding").mkdir(parents=True)
    (summary_root / "retention" / "latest.json").write_text(
        """{"summaries": [], "total_removed": 0, "tenant_count": 0, "warning_counts": {}, "tag_counts": {}}"""
    )
    (summary_root / "geocoding" / "tenant.json").write_text("""{"ratio": 0.9, "status": "ok"}""")

    calls = []

    def fake_run(cmd, check):
        calls.append(cmd)

    monkeypatch.setattr(publish_observability, "_run_bq", lambda bq, table, path: calls.append([bq, table, str(path)]))

    publish_observability.publish(
        dataset="analytics.telemetry",
        retention_table="retention",
        geocoding_table="geocoding",
        summary_root=str(summary_root),
        output_dir=str(tmp_path / "out"),
        bq_binary="bq",
        dry_run=False,
    )

    assert len(calls) == 2
    assert calls[0][0] == "bq"
    assert "retention.ndjson" in calls[0][2]
