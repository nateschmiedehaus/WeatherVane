#!/usr/bin/env python3
"""Capture enforcement metrics snapshot."""

from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TELEMETRY_DIR = ROOT / "state" / "telemetry"
METRICS_FILE = TELEMETRY_DIR / "metrics.jsonl"
LEDGER_FILE = ROOT / "state" / "process" / "ledger.jsonl"
OUTPUT_DIR = ROOT / "state" / "analytics" / "process_monitoring"

COUNTER_KEYS = [
    "phase_skips_attempted",
    "phase_validations_failed",
    "evidence_gate_failed",
    "prompt_drift_detected",
    "phase_backtracks",
]


def parse_metrics() -> Counter:
    counts: Counter = Counter()
    if not METRICS_FILE.exists():
        return counts

    for line in METRICS_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        name = (
            data.get("metric")
            or data.get("metric_name")
            or data.get("counter")
            or data.get("name")
        )
        if not isinstance(name, str):
            continue
        if name in COUNTER_KEYS:
            value = data.get("value", 1)
            try:
                counts[name] += int(value)
            except (TypeError, ValueError):
                counts[name] += 1
    return counts


def ledger_stats() -> dict[str, int]:
    if not LEDGER_FILE.exists():
        return {"total_entries": 0, "unique_tasks": 0}

    total = 0
    tasks: set[str] = set()
    for line in LEDGER_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        total += 1
        task_id = data.get("task_id")
        if isinstance(task_id, str):
            tasks.add(task_id)
    return {"total_entries": total, "unique_tasks": len(tasks)}


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y-%m-%dT%H-%M-%SZ", time.gmtime())

    metrics = parse_metrics()
    stats = ledger_stats()

    snapshot = {
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "metrics": {key: int(metrics.get(key, 0)) for key in COUNTER_KEYS},
        "ledger": stats,
    }

    out_file = OUTPUT_DIR / f"snapshot-{timestamp}.json"
    out_file.write_text(json.dumps(snapshot, indent=2))

    print(f"[process-snapshot] wrote {out_file.relative_to(ROOT)}")
    print(json.dumps(snapshot, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
