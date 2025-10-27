#!/usr/bin/env python3
"""
Synchronise ML task exit criteria stored in the orchestrator database with the
objective metrics defined by T-MLR-0.2.

This script reuses the same helpers as the roadmap updater to guarantee the DB
mirrors the canonical specification in state/roadmap.yaml.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import List, Tuple

from update_ml_task_exit_criteria import (
    get_data_generation_exit_criteria,
    get_modeling_exit_criteria,
    get_validation_exit_criteria,
    should_update_task,
)


def build_exit_criteria(task_id: str, title: str, existing: List[str]) -> List[str]:
    """Return the updated exit criteria for a task based on its type."""

    task_type = should_update_task(task_id, title)

    if task_type == "data_generation":
        return get_data_generation_exit_criteria(task_id, existing)

    if task_type == "validation":
        return get_validation_exit_criteria(task_id, existing)

    if task_type == "modeling":
        return get_modeling_exit_criteria(task_id, existing)

    # Task is outside the ML scope we manage; keep criteria untouched.
    return existing


def update_ml_task_criteria(db_path: str) -> Tuple[int, List[str]]:
    """Update all relevant ML tasks inside orchestrator.db."""

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    updated_count = 0
    updated_tasks: List[str] = []

    cursor.execute(
        """
        SELECT id, title, metadata
        FROM tasks
        WHERE (id LIKE 'T12.%' OR id LIKE 'T13.%')
        AND id NOT LIKE 'T13.0.%'
        ORDER BY id
        """
    )

    for task_id, title, metadata_json in cursor.fetchall():
        try:
            metadata = json.loads(metadata_json) if metadata_json else {}
        except json.JSONDecodeError:
            metadata = {}

        existing = metadata.get("exit_criteria", [])
        if not isinstance(existing, list):
            existing = []

        new_criteria = build_exit_criteria(task_id, title or "", existing)

        if new_criteria == existing:
            continue

        metadata["exit_criteria"] = new_criteria
        cursor.execute(
            "UPDATE tasks SET metadata = ? WHERE id = ?",
            (json.dumps(metadata), task_id),
        )

        updated_count += 1
        updated_tasks.append(task_id)
        print(f"✅ {task_id}: exit criteria updated ({len(existing)} → {len(new_criteria)})")

    conn.commit()
    conn.close()

    return updated_count, updated_tasks


def main() -> int:
    db_path = Path("state/orchestrator.db")

    if not db_path.exists():
        print(f"❌ Database not found: {db_path}", file=sys.stderr)
        return 1

    print(f"Updating ML task exit criteria in {db_path}...")
    updated_count, updated_tasks = update_ml_task_criteria(str(db_path))

    print(f"\nSummary: {updated_count} task(s) updated.")
    if updated_tasks:
        print("Updated tasks:")
        for task_id in updated_tasks:
            print(f"  - {task_id}")
    else:
        print("All tasks already compliant.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
