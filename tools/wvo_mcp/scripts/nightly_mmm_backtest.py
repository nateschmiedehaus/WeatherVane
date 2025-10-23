#!/usr/bin/env python3
"""Post MMM backtest deltas to the roadmap inbox."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .roadmap_inbox import load_inbox, save_inbox


DEFAULT_ARTIFACT = Path("artifacts/modeling/mmm_backtest.json")
DEFAULT_SNAPSHOT = Path("state/analytics/mmm_backtest_snapshot.json")
DEFAULT_INBOX = Path("state/roadmap_inbox.json")
DEFAULT_THRESHOLD = 0.01


def load_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
            if isinstance(payload, dict):
                return payload
    except json.JSONDecodeError:
        return None
    return None


def store_snapshot(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def compute_delta(
    current: Dict[str, Any],
    previous: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if previous is None:
        return {
            "type": "initial",
            "relative_improvement_delta": current["metrics"]["relative_mae_improvement"],
            "mae_mmm": current["metrics"]["mae_mmm"],
            "mae_baseline": current["metrics"]["mae_baseline"],
        }

    current_metrics = current.get("metrics", {})
    prev_metrics = previous.get("metrics", {})
    if not current_metrics or not prev_metrics:
        return None

    improvement_delta = (
        current_metrics.get("relative_mae_improvement", 0.0)
        - prev_metrics.get("relative_mae_improvement", 0.0)
    )
    mae_delta = current_metrics.get("mae_mmm", 0.0) - prev_metrics.get("mae_mmm", 0.0)
    baseline_delta = (
        current_metrics.get("mae_baseline", 0.0)
        - prev_metrics.get("mae_baseline", 0.0)
    )

    return {
        "type": "update",
        "relative_improvement_delta": improvement_delta,
        "mae_mmm_delta": mae_delta,
        "mae_baseline_delta": baseline_delta,
        "relative_mae_improvement": current_metrics.get(
            "relative_mae_improvement", 0.0
        ),
        "mae_mmm": current_metrics.get("mae_mmm", 0.0),
        "mae_baseline": current_metrics.get("mae_baseline", 0.0),
    }


def should_post(delta: Dict[str, Any], threshold: float) -> bool:
    if delta["type"] == "initial":
        return True
    return abs(delta.get("relative_improvement_delta", 0.0)) >= threshold


def record_inbox_entry(
    inbox_path: Path,
    delta: Dict[str, Any],
    generated_at: str,
) -> None:
    entries = load_inbox(inbox_path)
    summary = (
        "Initial MMM backtest baseline captured."
        if delta["type"] == "initial"
        else (
            "MMM backtest improvement shifted by "
            f"{delta['relative_improvement_delta'] * 100:.2f} percentage points."
        )
    )
    notes = (
        f"Latest MMM MAE: {delta.get('mae_mmm', 0.0):.2f}, "
        f"Baseline MAE: {delta.get('mae_baseline', 0.0):.2f}."
    )
    entries.append(
        {
            "id": f"mmm-backtest-{len(entries) + 1}",
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "title": "MMM backtest regression delta",
            "summary": summary,
            "domain": "product",
            "source": "atlas",
            "status": "pending_review",
            "notes": notes,
            "blockers": "",
            "signals": generated_at,
            "layers": ["surface", "product"],
            "integration": "modeling",
            "weights": {"product": 8},
        }
    )
    save_inbox(inbox_path, entries[-200:])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--artifact",
        default=str(DEFAULT_ARTIFACT),
        help="Path to the MMM backtest artifact JSON.",
    )
    parser.add_argument(
        "--snapshot",
        default=str(DEFAULT_SNAPSHOT),
        help="Path to the stored snapshot for delta comparisons.",
    )
    parser.add_argument(
        "--inbox",
        default=str(DEFAULT_INBOX),
        help="Path to the roadmap inbox JSON file.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help="Minimum relative improvement delta required to post an update.",
    )
    args = parser.parse_args(argv)

    artifact_path = Path(args.artifact)
    snapshot_path = Path(args.snapshot)
    inbox_path = Path(args.inbox)

    current = load_json(artifact_path)
    if current is None:
        raise SystemExit(f"MMM artifact not found or invalid at {artifact_path}")

    previous = load_json(snapshot_path)
    delta = compute_delta(current, previous)
    if delta and should_post(delta, args.threshold):
        record_inbox_entry(
            inbox_path=inbox_path,
            delta=delta,
            generated_at=current.get("generated_at", ""),
        )

    store_snapshot(snapshot_path, current)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
