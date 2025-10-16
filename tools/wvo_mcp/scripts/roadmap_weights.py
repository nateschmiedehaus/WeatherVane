#!/usr/bin/env python3
"""
Roadmap Weight Summariser

Scan state/roadmap.yaml, combine optional task-level weights with sensible
defaults, and write a machine-readable summary to state/roadmap_weights.json.

The summary aggregates remaining and completed weight by domain (e.g., product,
MCP) and highlights the heaviest outstanding tasks so the autopilot can bias
execution toward the most valuable work.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml

DEFAULT_DOMAIN_WEIGHTS = {
    "product": 8.0,
    "mcp": 4.0,
}

PRODUCT_EPICS = {"E1", "E2", "E3", "E4", "E5", "E7", "E8", "E9", "E10", "E11"}
MCP_EPICS = {"E6", "E12"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--roadmap",
        default="state/roadmap.yaml",
        help="Path to the roadmap YAML file (default: state/roadmap.yaml)",
    )
    parser.add_argument(
        "--output",
        default="state/roadmap_weights.json",
        help="Where to write the JSON summary (default: state/roadmap_weights.json)",
    )
    parser.add_argument(
        "--default-product",
        type=float,
        default=DEFAULT_DOMAIN_WEIGHTS["product"],
        help="Default weight applied to product tasks without explicit weights.",
    )
    parser.add_argument(
        "--default-mcp",
        type=float,
        default=DEFAULT_DOMAIN_WEIGHTS["mcp"],
        help="Default weight applied to MCP tasks without explicit weights.",
    )
    return parser.parse_args()


def determine_domain(epic: Dict[str, Any], task: Dict[str, Any]) -> str:
    if isinstance(task.get("domain"), str):
        return task["domain"].strip().lower()
    if isinstance(epic.get("domain"), str):
        return epic["domain"].strip().lower()
    task_id = (task.get("id") or "").upper()
    epic_id = (epic.get("id") or "").upper()
    if task_id.startswith("T6") or epic_id in MCP_EPICS:
        return "mcp"
    return "product"


def weight_for_domain(task: Dict[str, Any], domain: str, defaults: Dict[str, float]) -> float:
    weights = task.get("weights")
    if isinstance(weights, dict) and domain in weights:
        try:
            return float(weights[domain])
        except (TypeError, ValueError):
            pass
    return defaults.get(domain, defaults.get("product", 1.0))


def collect_tasks(
    data: Dict[str, Any],
    defaults: Dict[str, float],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    domains: Dict[str, Dict[str, Any]] = {}
    epics_summary: Dict[str, Dict[str, Any]] = {}

    for epic in data.get("epics", []):
        epic_id = epic.get("id", "unknown_epic")
        epic_summary = epics_summary.setdefault(
            epic_id,
            {
                "title": epic.get("title", ""),
                "domain": epic.get("domain", ""),
                "remaining_weight": 0.0,
                "completed_weight": 0.0,
                "tasks": [],
            },
        )

        for milestone in epic.get("milestones", []):
            for task in milestone.get("tasks", []):
                status = (task.get("status") or "").lower()
                if status not in {"done", "pending", "in_progress", "blocked", "needs_review"}:
                    continue

                domain = determine_domain(epic, task)
                domain_entry = domains.setdefault(
                    domain,
                    {
                        "remaining_weight": 0.0,
                        "completed_weight": 0.0,
                        "blocked_weight": 0.0,
                        "tasks": [],
                    },
                )

                weight = weight_for_domain(task, domain, defaults)
                task_info = {
                    "id": task.get("id"),
                    "title": task.get("title"),
                    "status": status,
                    "weight": weight,
                    "epic": epic_id,
                    "milestone": milestone.get("id"),
                }

                epic_summary["tasks"].append(task_info)

                if status == "done":
                    domain_entry["completed_weight"] += weight
                    epic_summary["completed_weight"] += weight
                else:
                    domain_entry["remaining_weight"] += weight
                    epic_summary["remaining_weight"] += weight
                    if status == "blocked":
                        domain_entry["blocked_weight"] += weight

                    domain_entry["tasks"].append(task_info)

    # Sort tasks within each domain by descending weight to highlight priorities
    for domain_entry in domains.values():
        domain_entry["tasks"].sort(key=lambda item: (-item["weight"], item.get("id", "")))
        top_tasks = domain_entry["tasks"][:5]
        domain_entry["top_tasks"] = top_tasks

    for epic_summary in epics_summary.values():
        epic_summary["tasks"].sort(key=lambda item: (-item["weight"], item.get("id", "")))

    return domains, epics_summary


def main() -> int:
    args = parse_args()
    roadmap_path = Path(args.roadmap)
    output_path = Path(args.output)

    defaults = {
        "product": float(args.default_product),
        "mcp": float(args.default_mcp),
    }

    if not roadmap_path.exists():
        raise SystemExit(f"Roadmap file not found: {roadmap_path}")

    data = yaml.safe_load(roadmap_path.read_text(encoding="utf-8")) or {}
    domains, epics_summary = collect_tasks(data, defaults)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "defaults": defaults,
        "domains": domains,
        "epics": epics_summary,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
