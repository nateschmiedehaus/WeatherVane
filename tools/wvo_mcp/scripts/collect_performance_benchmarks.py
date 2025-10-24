#!/usr/bin/env python3
"""Generate consolidated MCP performance benchmarks from telemetry logs."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


REPO_ROOT = Path(__file__).resolve().parents[3]
TELEMETRY_LOCATIONS = [
    REPO_ROOT / "tools" / "wvo_mcp" / "state" / "telemetry",
    REPO_ROOT / "state" / "telemetry",
]


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    records: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return records


def load_telemetry_records(
    primary_path: Path, prefix: str, max_archives: int = 5
) -> Tuple[List[Dict[str, Any]], List[Path]]:
    filename = primary_path.name
    records: List[Dict[str, Any]] = []
    sources: List[Path] = []
    seen: set[Path] = set()

    def add_source(path: Path) -> bool:
        resolved = path.resolve()
        if resolved in seen:
            return False
        data = load_jsonl(path)
        if not data:
            return False
        records.extend(data)
        sources.append(resolved)
        seen.add(resolved)
        return True

    search_roots: List[Path] = []
    seen_roots: set[Path] = set()
    for root in [primary_path.parent, *TELEMETRY_LOCATIONS]:
        resolved_root = root.resolve()
        if resolved_root in seen_roots:
            continue
        seen_roots.add(resolved_root)
        search_roots.append(resolved_root)

    for root in search_roots:
        candidate = root / filename
        if candidate.exists():
            add_source(candidate)

    archive_candidates: List[Path] = []
    for root in search_roots:
        archive_dir = root / "archives"
        if not archive_dir.exists():
            continue
        for candidate in archive_dir.glob(f"{prefix}_*.jsonl"):
            if candidate.is_file():
                archive_candidates.append(candidate)

    archive_candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)

    archives_used = 0
    for candidate in archive_candidates:
        if archives_used >= max_archives:
            break
        if add_source(candidate):
            archives_used += 1

    return records, sources


def quantile(values: Iterable[float], q: float) -> float:
    data = sorted(v for v in values if isinstance(v, (int, float)))
    if not data:
        return 0.0
    idx = (len(data) - 1) * min(max(q, 0.0), 1.0)
    lower = math.floor(idx)
    upper = math.ceil(idx)
    if lower == upper:
        return float(data[lower])
    weight = idx - lower
    return float(data[lower] * (1 - weight) + data[upper] * weight)


def safe_sum(values: Iterable[Any]) -> float:
    total = 0.0
    for value in values:
        if isinstance(value, (int, float)):
            total += float(value)
    return total


def compute_execution_metrics(executions: List[Dict[str, Any]]) -> Dict[str, Any]:
    durations = [float(rec.get("duration_seconds", 0.0)) for rec in executions]
    total_runs = len(executions)
    successes = [rec for rec in executions if rec.get("success")]
    tokens_prompt = [rec.get("prompt_tokens", 0) for rec in executions]
    tokens_completion = [rec.get("completion_tokens", 0) for rec in executions]
    tokens_total = [rec.get("total_tokens", 0) for rec in executions]

    agent_metrics: Dict[str, Dict[str, Any]] = {}
    agent_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in executions:
        agent_groups[rec.get("agent_type", "unknown")].append(rec)

    for agent, records in agent_groups.items():
        agent_durations = [float(r.get("duration_seconds", 0.0)) for r in records]
        agent_tokens = [r.get("total_tokens", 0) for r in records]
        agent_metrics[agent] = {
            "runs": len(records),
            "avg_duration_seconds": round(float(sum(agent_durations) / len(agent_durations)), 3)
            if records
            else 0.0,
            "max_duration_seconds": round(max(agent_durations, default=0.0), 3),
            "avg_total_tokens": round(
                float(sum(agent_tokens) / len(agent_tokens)), 3
            )
            if records
            else 0.0,
            "max_total_tokens": int(max(agent_tokens, default=0)),
            "success_rate": round(
                len([r for r in records if r.get("success")]) / len(records), 4
            )
            if records
            else 0.0,
        }

    return {
        "total_runs": total_runs,
        "success_rate": round(len(successes) / total_runs, 4) if total_runs else 0.0,
        "avg_duration_seconds": round(
            float(sum(durations) / total_runs), 3
        )
        if total_runs
        else 0.0,
        "p95_duration_seconds": round(quantile(durations, 0.95), 3),
        "max_duration_seconds": round(max(durations, default=0.0), 3),
        "avg_prompt_tokens": round(
            float(sum(tokens_prompt) / total_runs), 3
        )
        if total_runs
        else 0.0,
        "avg_completion_tokens": round(
            float(sum(tokens_completion) / total_runs), 3
        )
        if total_runs
        else 0.0,
        "avg_total_tokens": round(
            float(sum(tokens_total) / total_runs), 3
        )
        if total_runs
        else 0.0,
        "max_total_tokens": int(max(tokens_total, default=0)),
        "agent_breakdown": agent_metrics,
    }


def compute_token_usage(executions: List[Dict[str, Any]]) -> Dict[str, Any]:
    per_agent_prompt: Dict[str, float] = defaultdict(float)
    per_agent_completion: Dict[str, float] = defaultdict(float)
    per_agent_cost: Dict[str, float] = defaultdict(float)

    for rec in executions:
        agent = rec.get("agent_type", "unknown")
        per_agent_prompt[agent] += float(rec.get("prompt_tokens", 0) or 0)
        per_agent_completion[agent] += float(rec.get("completion_tokens", 0) or 0)
        per_agent_cost[agent] += float(rec.get("token_cost_usd", 0) or 0.0)

    total_prompt = safe_sum(per_agent_prompt.values())
    total_completion = safe_sum(per_agent_completion.values())
    total_cost = safe_sum(per_agent_cost.values())

    agents: Dict[str, Dict[str, Any]] = {}
    for agent in sorted(per_agent_prompt.keys()):
        agents[agent] = {
            "prompt_tokens": int(per_agent_prompt[agent]),
            "completion_tokens": int(per_agent_completion[agent]),
            "total_tokens": int(
                per_agent_prompt[agent] + per_agent_completion[agent]
            ),
            "token_cost_usd": round(per_agent_cost[agent], 6),
        }

    return {
        "total_prompt_tokens": int(total_prompt),
        "total_completion_tokens": int(total_completion),
        "total_tokens": int(total_prompt + total_completion),
        "total_token_cost_usd": round(total_cost, 6),
        "per_agent": agents,
    }


def compute_queue_metrics(operations: List[Dict[str, Any]]) -> Dict[str, Any]:
    queue_lengths = [float(op.get("queueLength", 0) or 0) for op in operations]
    blocked = [float(op.get("blockedTasks", 0) or 0) for op in operations]
    heavy_limits: List[float] = []
    active_heavy: List[float] = []
    queued_heavy: List[float] = []

    for op in operations:
        resource = op.get("queueResource") or op.get("queue_resource") or {}
        heavy_limits.append(float(resource.get("heavy_limit") or resource.get("heavyLimit") or 0))
        active_heavy.append(float(resource.get("active_heavy") or resource.get("activeHeavy") or 0))
        queued_heavy.append(float(resource.get("queued_heavy") or resource.get("queuedHeavy") or 0))

    modes = defaultdict(int)
    for op in operations:
        modes[str(op.get("mode", "unknown"))] += 1

    return {
        "snapshots": len(operations),
        "avg_queue_length": round(
            float(sum(queue_lengths) / len(queue_lengths)), 3
        )
        if queue_lengths
        else 0.0,
        "max_queue_length": int(max(queue_lengths, default=0)),
        "max_blocked_tasks": int(max(blocked, default=0)),
        "heavy_concurrency_limit": int(max(heavy_limits, default=0)),
        "max_active_heavy": int(max(active_heavy, default=0)),
        "max_queued_heavy": int(max(queued_heavy, default=0)),
        "modes_observed": modes,
    }


def load_failover_summary(failover_path: Path) -> Dict[str, Any]:
    if not failover_path.exists():
        return {}
    try:
        with failover_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
            return {
                "generated_at": data.get("generated_at"),
                "summary": data.get("summary"),
                "steps": data.get("samples"),
                "scenario": data.get("scenario"),
            }
    except json.JSONDecodeError:
        return {}


def load_device_profile(profile_path: Path) -> Tuple[float, float, float]:
    if not profile_path.exists():
        return 0.0, 0.0, 0.0
    try:
        with profile_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError:
        return 0.0, 0.0, 0.0

    # Use the most recently collected profile.
    records = list(data.values()) if isinstance(data, dict) else []
    records.sort(key=lambda rec: rec.get("collected_at", ""), reverse=True)
    if not records:
        return 0.0, 0.0, 0.0
    latest = records[0]
    total_bytes = float(latest.get("memory_total_bytes") or 0.0)
    recommended = float(
        (latest.get("capabilities") or {}).get("recommended_concurrency") or 0.0
    )
    if recommended <= 0:
        recommended = 1.0
    per_worker_budget = total_bytes / recommended if total_bytes > 0 else 0.0
    return total_bytes, recommended, per_worker_budget


def compute_resource_limits(
    execution_metrics: Dict[str, Any],
    queue_metrics: Dict[str, Any],
    profile_path: Path,
) -> Dict[str, Any]:
    timeout_budget = 30.0
    max_duration = execution_metrics.get("max_duration_seconds", 0.0)
    total_memory_bytes, recommended_concurrency, per_worker_budget = load_device_profile(
        profile_path
    )
    max_active_heavy = queue_metrics.get("max_active_heavy", 0)
    estimated_rss = (
        (per_worker_budget * max_active_heavy) / (1024 * 1024)
        if per_worker_budget and max_active_heavy
        else 0.0
    )
    return {
        "timeout_budget_seconds": timeout_budget,
        "max_observed_duration_seconds": max_duration,
        "timeouts_within_budget": bool(max_duration <= timeout_budget),
        "heavy_concurrency_limit": queue_metrics.get("heavy_concurrency_limit", 0),
        "max_observed_active_heavy": queue_metrics.get("max_active_heavy", 0),
        "heavy_concurrency_within_limit": bool(
            queue_metrics.get("max_active_heavy", 0)
            <= queue_metrics.get("heavy_concurrency_limit", 0)
        ),
        "rss_budget_mb": round(total_memory_bytes / (1024 * 1024), 2)
        if total_memory_bytes
        else 0.0,
        "estimated_rss_per_worker_mb": round(
            per_worker_budget / (1024 * 1024), 2
        )
        if per_worker_budget
        else 0.0,
        "estimated_max_observed_rss_mb": round(estimated_rss, 2),
        "rss_within_budget": bool(
            estimated_rss <= (total_memory_bytes / (1024 * 1024)) if total_memory_bytes else True
        ),
        "recommended_concurrency": recommended_concurrency,
    }


def compute_checkpoint_metrics() -> Dict[str, Any]:
    checkpoint_path = REPO_ROOT / "state" / "checkpoint.json"
    orchestrator_db_path = REPO_ROOT / "tools" / "wvo_mcp" / "state" / "orchestrator.db"

    checkpoint_bytes = (
        checkpoint_path.stat().st_size if checkpoint_path.exists() else 0
    )
    orchestrator_db_bytes = (
        orchestrator_db_path.stat().st_size if orchestrator_db_path.exists() else 0
    )

    checkpoint_timestamp = None
    if checkpoint_path.exists():
        try:
            with checkpoint_path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
                checkpoint_timestamp = payload.get("timestamp")
        except json.JSONDecodeError:
            checkpoint_timestamp = None

    return {
        "checkpoint_json_bytes": checkpoint_bytes,
        "orchestrator_db_bytes": orchestrator_db_bytes,
        "latest_checkpoint_timestamp": checkpoint_timestamp,
    }


def build_report() -> Dict[str, Any]:
    executions_path = REPO_ROOT / "tools" / "wvo_mcp" / "state" / "telemetry" / "executions.jsonl"
    operations_path = REPO_ROOT / "tools" / "wvo_mcp" / "state" / "telemetry" / "operations.jsonl"
    failover_path = REPO_ROOT / "experiments" / "mcp" / "failover_test.json"
    profile_path = REPO_ROOT / "state" / "device_profiles.json"

    executions, execution_sources = load_telemetry_records(executions_path, "executions")
    operations, operation_sources = load_telemetry_records(operations_path, "operations")
    execution_metrics = compute_execution_metrics(executions)
    token_usage = compute_token_usage(executions)
    queue_metrics = compute_queue_metrics(operations)
    resource_limits = compute_resource_limits(execution_metrics, queue_metrics, profile_path)
    failover_summary = load_failover_summary(failover_path)
    checkpoints = compute_checkpoint_metrics()

    def relative_sources(paths: List[Path]) -> List[str]:
        results: List[str] = []
        for path in paths:
            try:
                results.append(str(path.relative_to(REPO_ROOT)))
            except ValueError:
                results.append(str(path))
        return results

    execution_source_list = relative_sources(execution_sources)
    operation_source_list = relative_sources(operation_sources)
    default_execution_source = str(executions_path.relative_to(REPO_ROOT))
    default_operation_source = str(operations_path.relative_to(REPO_ROOT))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "executions_jsonl": execution_source_list[0]
            if execution_source_list
            else default_execution_source,
            "operations_jsonl": operation_source_list[0]
            if operation_source_list
            else default_operation_source,
            "executions_jsonl_additional": execution_source_list[1:]
            if len(execution_source_list) > 1
            else [],
            "operations_jsonl_additional": operation_source_list[1:]
            if len(operation_source_list) > 1
            else [],
            "failover_summary": str(failover_path.relative_to(REPO_ROOT))
            if failover_summary
            else None,
        },
        "execution_metrics": execution_metrics,
        "token_usage": token_usage,
        "queue_metrics": queue_metrics,
        "resource_limits": resource_limits,
        "worker_swap": failover_summary,
        "checkpoint_state": checkpoints,
    }


def main() -> None:
    report = build_report()
    output_path = REPO_ROOT / "experiments" / "mcp" / "performance_benchmarks.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"Wrote {output_path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
