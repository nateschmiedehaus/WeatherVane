"""Summarise MCP telemetry JSONL feeds into a concise metrics snapshot."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


DEFAULT_RECENT_LIMIT = 5


def summarize_telemetry(
    telemetry_dir: Path,
    *,
    recent_limit: int = DEFAULT_RECENT_LIMIT,
) -> dict[str, Any]:
    """Summarise the telemetry directory into a structured metrics payload."""

    executions_path = telemetry_dir / "executions.jsonl"
    operations_path = telemetry_dir / "operations.jsonl"
    usage_path = telemetry_dir / "usage.jsonl"

    executions = list(_read_jsonl(executions_path))
    operations = list(_read_jsonl(operations_path))
    usage = list(_read_jsonl(usage_path))

    generated_at = datetime.now(timezone.utc).isoformat()

    summary: dict[str, Any] = {
        "version": 1,
        "generated_at": generated_at,
        "sources": {
            "telemetry_dir": str(telemetry_dir),
            "files": {
                "executions": _source_meta(executions_path, len(executions)),
                "operations": _source_meta(operations_path, len(operations)),
                "usage": _source_meta(usage_path, len(usage)),
            },
        },
        "executions": _summarize_executions(executions, recent_limit),
        "operations": _summarize_operations(operations),
        "usage": _summarize_usage(usage),
    }

    return summary


def write_summary(summary: Mapping[str, Any], output_path: Path) -> None:
    """Persist the telemetry summary to disk."""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=True)
    output_path.write_text(encoded + "\n", encoding="utf-8")


def _read_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    if not path.exists():
        return []

    def _iter() -> Iterable[dict[str, Any]]:
        with path.open(encoding="utf-8") as stream:
            for raw in stream:
                line = raw.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    yield record

    return _iter()


def _source_meta(path: Path, count: int) -> dict[str, Any]:
    return {
        "path": str(path),
        "exists": path.exists(),
        "records": count,
    }


def _summarize_executions(
    executions: Sequence[Mapping[str, Any]],
    recent_limit: int,
) -> dict[str, Any]:
    total_runs = len(executions)
    successes = sum(1 for record in executions if bool(record.get("success")))
    failures = total_runs - successes

    quality_scores = [
        float(score)
        for record in executions
        if (score := record.get("quality_score")) is not None
    ]
    durations = [
        float(duration)
        for record in executions
        if (duration := record.get("duration_seconds")) is not None
    ]
    prompt_tokens = sum(
        int(tokens) for record in executions if (tokens := record.get("prompt_tokens")) is not None
    )
    completion_tokens = sum(
        int(tokens)
        for record in executions
        if (tokens := record.get("completion_tokens")) is not None
    )
    total_tokens = prompt_tokens + completion_tokens
    total_cost_usd = sum(
        float(cost) for record in executions if (cost := record.get("token_cost_usd")) is not None
    )

    by_agent_type = Counter(str(record.get("agent_type", "unknown")) for record in executions)
    by_final_status = Counter(str(record.get("final_status", "unknown")) for record in executions)

    issues = Counter(
        issue
        for record in executions
        for issue in record.get("issues", [])
        if isinstance(issue, str)
    )

    critics_failed = Counter(
        critic
        for record in executions
        for critic in record.get("critics_failed", [])
        if isinstance(critic, str)
    )

    failures_by_task = Counter(
        str(record.get("task_id"))
        for record in executions
        if not bool(record.get("success"))
    )

    recent_runs = sorted(
        (
            _execution_snapshot(record)
            for record in executions
        ),
        key=lambda entry: entry.get("timestamp", ""),
        reverse=True,
    )[:recent_limit]

    return {
        "total_runs": total_runs,
        "successes": successes,
        "failures": failures,
        "success_rate": _ratio(successes, total_runs),
        "average_quality_score": _mean(quality_scores),
        "average_duration_seconds": _mean(durations),
        "tokens": {
            "prompt": prompt_tokens,
            "completion": completion_tokens,
            "total": total_tokens,
        },
        "total_token_cost_usd": round(total_cost_usd, 6),
        "by_agent_type": dict(by_agent_type),
        "by_final_status": dict(by_final_status),
        "issues": dict(issues),
        "critics_failed": dict(critics_failed),
        "top_failed_tasks": [
            {"task_id": task_id, "failures": count}
            for task_id, count in failures_by_task.most_common(5)
        ],
        "recent_runs": recent_runs,
    }


def _execution_snapshot(record: Mapping[str, Any]) -> dict[str, Any]:
    timestamp = _resolve_timestamp(
        record.get("timestamp_iso") or record.get("timestamp")
    )
    return {
        "task_id": record.get("task_id"),
        "success": bool(record.get("success")),
        "final_status": record.get("final_status"),
        "quality_score": record.get("quality_score"),
        "duration_seconds": record.get("duration_seconds"),
        "token_cost_usd": record.get("token_cost_usd"),
        "agent_type": record.get("agent_type"),
        "codex_preset": record.get("codex_preset"),
        "issues": record.get("issues", []),
        "critics_failed": record.get("critics_failed", []),
        "timestamp": timestamp,
    }


def _summarize_operations(
    operations: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    total = len(operations)
    if total == 0:
        return {
            "total_snapshots": 0,
            "latest_snapshot": None,
            "average_queue_length": 0.0,
            "max_queue_length": 0,
            "average_failure_rate": 0.0,
            "modes_seen": {},
        }

    queue_lengths = [
        float(snapshot.get("queueLength", 0.0)) for snapshot in operations
    ]
    failure_rates = [
        float(snapshot.get("failureRate", 0.0)) for snapshot in operations
    ]

    modes = Counter(
        str(snapshot.get("mode", "unknown")) for snapshot in operations
    )

    latest_snapshot = max(
        operations,
        key=lambda snapshot: _resolve_timestamp(snapshot.get("timestamp") or "") or "",
    )

    condensed_latest = {
        "timestamp": _resolve_timestamp(latest_snapshot.get("timestamp")),
        "mode": latest_snapshot.get("mode"),
        "avgQuality": latest_snapshot.get("avgQuality"),
        "failureRate": latest_snapshot.get("failureRate"),
        "queueLength": latest_snapshot.get("queueLength"),
        "blockedTasks": latest_snapshot.get("blockedTasks"),
        "codexUsagePercent": latest_snapshot.get("codexUsagePercent"),
        "claudeUsagePercent": latest_snapshot.get("claudeUsagePercent"),
        "totalTasks": latest_snapshot.get("totalTasks"),
    }

    return {
        "total_snapshots": total,
        "latest_snapshot": condensed_latest,
        "average_queue_length": _mean(queue_lengths),
        "max_queue_length": int(max(queue_lengths, default=0)),
        "average_failure_rate": _mean(failure_rates),
        "modes_seen": dict(modes),
    }


def _summarize_usage(
    usage: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    total = len(usage)
    statuses = Counter(str(record.get("status", "unknown")) for record in usage)
    models = Counter(str(record.get("model", "unknown")) for record in usage)

    durations = [
        float(record.get("duration_seconds", 0.0)) for record in usage
    ]

    capability_profiles = Counter(
        str(record.get("capability", "unknown")) for record in usage
    )

    return {
        "total_records": total,
        "statuses": dict(statuses),
        "models": dict(models),
        "capabilities": dict(capability_profiles),
        "average_duration_seconds": _mean(durations),
    }


def _resolve_timestamp(source: Any) -> str | None:
    if not source or not isinstance(source, str):
        return None
    candidate = source
    if candidate.endswith("Z"):
        candidate = candidate.replace("Z", "+00:00")
    try:
        resolved = datetime.fromisoformat(candidate)
    except ValueError:
        return source
    if resolved.tzinfo is None:
        resolved = resolved.replace(tzinfo=timezone.utc)
    return resolved.astimezone(timezone.utc).isoformat()


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _ratio(numerator: int, denominator: int) -> float:
    return float(numerator) / float(denominator) if denominator else 0.0


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarise MCP telemetry JSONL feeds into metrics_summary.json",
    )
    parser.add_argument(
        "--telemetry-dir",
        type=Path,
        default=Path("state/telemetry"),
        help="Directory containing telemetry JSONL files",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("state/telemetry/metrics_summary.json"),
        help="Destination for the generated summary JSON",
    )
    parser.add_argument(
        "--recent-limit",
        type=int,
        default=DEFAULT_RECENT_LIMIT,
        help="Number of recent execution runs to include in the summary",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    summary = summarize_telemetry(
        args.telemetry_dir,
        recent_limit=max(1, args.recent_limit),
    )
    write_summary(summary, args.output)
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
