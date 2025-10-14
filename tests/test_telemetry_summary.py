from __future__ import annotations

import json
from pathlib import Path

from shared.observability.telemetry_summary import summarize_telemetry, write_summary


def _write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=True) + "\n")


def test_summarize_telemetry_aggregates_execution_and_operations(tmp_path: Path) -> None:
    telemetry_dir = tmp_path / "telemetry"
    executions = [
        {
            "timestamp_iso": "2025-10-11T00:00:00Z",
            "task_id": "T-alpha",
            "success": True,
            "final_status": "complete",
            "quality_score": 0.9,
            "duration_seconds": 120,
            "prompt_tokens": 200,
            "completion_tokens": 50,
            "token_cost_usd": 0.01,
            "agent_type": "codex",
            "codex_preset": "gpt-5-codex-medium",
            "issues": [],
            "critics_failed": [],
        },
        {
            "timestamp_iso": "2025-10-11T01:00:00Z",
            "task_id": "T-beta",
            "success": False,
            "final_status": "needs_improvement",
            "quality_score": 0.6,
            "duration_seconds": 60,
            "prompt_tokens": 150,
            "completion_tokens": 30,
            "token_cost_usd": 0.008,
            "agent_type": "claude_code",
            "codex_preset": None,
            "issues": ["execution_failed"],
            "critics_failed": ["tests"],
        },
    ]
    operations = [
        {
            "timestamp": "2025-10-11T00:30:00Z",
            "mode": "balance",
            "avgQuality": 0.6,
            "failureRate": 0.1,
            "queueLength": 4,
            "blockedTasks": 0,
            "codexUsagePercent": 60,
            "claudeUsagePercent": 40,
            "totalTasks": 12,
        },
        {
            "timestamp": "2025-10-11T02:00:00Z",
            "mode": "stabilize",
            "avgQuality": 0.75,
            "failureRate": 0.0,
            "queueLength": 2,
            "blockedTasks": 0,
            "codexUsagePercent": 55,
            "claudeUsagePercent": 45,
            "totalTasks": 18,
        },
    ]
    usage = [
        {
            "status": "invalid_summary",
            "attempt": 1,
            "duration_seconds": 300,
            "model": "gpt-5-codex",
            "capability": "medium",
        },
        {
            "status": "ok",
            "attempt": 1,
            "duration_seconds": 120,
            "model": "gpt-5-codex",
            "capability": "medium",
        },
    ]

    _write_jsonl(telemetry_dir / "executions.jsonl", executions)
    _write_jsonl(telemetry_dir / "operations.jsonl", operations)
    _write_jsonl(telemetry_dir / "usage.jsonl", usage)

    summary = summarize_telemetry(telemetry_dir, recent_limit=2)

    execution_summary = summary["executions"]
    assert execution_summary["total_runs"] == 2
    assert execution_summary["successes"] == 1
    assert execution_summary["failures"] == 1
    assert execution_summary["by_agent_type"]["codex"] == 1
    assert execution_summary["issues"]["execution_failed"] == 1
    assert execution_summary["critics_failed"]["tests"] == 1
    assert execution_summary["top_failed_tasks"][0]["task_id"] == "T-beta"
    assert len(execution_summary["recent_runs"]) == 2
    assert execution_summary["tokens"]["prompt"] == 350
    assert round(execution_summary["total_token_cost_usd"], 3) == 0.018

    operations_summary = summary["operations"]
    assert operations_summary["total_snapshots"] == 2
    assert operations_summary["latest_snapshot"]["mode"] == "stabilize"
    assert operations_summary["max_queue_length"] == 4
    assert operations_summary["modes_seen"]["balance"] == 1

    usage_summary = summary["usage"]
    assert usage_summary["total_records"] == 2
    assert usage_summary["statuses"]["invalid_summary"] == 1
    assert usage_summary["statuses"]["ok"] == 1
    assert usage_summary["models"]["gpt-5-codex"] == 2
    assert usage_summary["capabilities"]["medium"] == 2

    output_path = tmp_path / "metrics_summary.json"
    write_summary(summary, output_path)
    assert output_path.exists()
    decoded = json.loads(output_path.read_text(encoding="utf-8"))
    assert decoded["version"] == 1


def test_summarize_telemetry_handles_missing_files(tmp_path: Path) -> None:
    telemetry_dir = tmp_path / "telemetry"
    telemetry_dir.mkdir(parents=True)

    summary = summarize_telemetry(telemetry_dir)

    assert summary["executions"]["total_runs"] == 0
    assert summary["operations"]["total_snapshots"] == 0
    assert summary["usage"]["total_records"] == 0
