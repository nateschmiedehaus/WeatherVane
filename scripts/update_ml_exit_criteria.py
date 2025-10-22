#!/usr/bin/env python3
"""
Update all ML task exit criteria with objective metrics.
Implements T-MLR-0.2: Add R² thresholds, baseline improvement, and modeling_reality_v2 critic to all ML tasks.
"""

import sqlite3
import json
import sys
from pathlib import Path

def update_ml_task_criteria(db_path: str) -> tuple[int, list[str]]:
    """Update all ML task exit criteria with objective metrics."""

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    updated_count = 0
    updated_tasks = []

    # Tasks to update: T12.* and T13.* (but not T13.0.*)
    cursor.execute("""
        SELECT id, metadata FROM tasks
        WHERE (id LIKE 'T12.%' OR id LIKE 'T13.%')
        AND id NOT LIKE 'T13.0.%'
        ORDER BY id
    """)

    tasks = cursor.fetchall()

    for task_id, metadata_json in tasks:
        try:
            # Parse existing metadata
            if metadata_json:
                metadata = json.loads(metadata_json)
            else:
                metadata = {}

            # Get current exit criteria
            exit_criteria = metadata.get('exit_criteria', [])
            if not isinstance(exit_criteria, list):
                exit_criteria = []

            # Determine which metrics to add based on task type
            new_criteria = []

            # Keep existing artifacts and critics
            for criterion in exit_criteria:
                if criterion.startswith('artifact:') or (criterion.startswith('critic:') and 'modeling_reality' not in criterion):
                    new_criteria.append(criterion)

            # Add objective metrics for modeling tasks (exclude data generation and demo tasks)
            if any(x in task_id for x in ['PoC', 'MMM', 'allocation', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '3.1', '3.2', '3.3', '4.1', '4.2', '5.1', '5.2', '5.3']):
                if 'metric:r2 > 0.50' not in new_criteria:
                    new_criteria.append('metric:r2 > 0.50')
                if 'metric:beats_baseline > 1.10' not in new_criteria:
                    new_criteria.append('metric:beats_baseline > 1.10')
                if 'critic:modeling_reality_v2' not in new_criteria:
                    new_criteria.append('critic:modeling_reality_v2')

            # Add data quality checks for data generation tasks
            if any(x in task_id for x in ['0.1', '0.2', '0.3', '1.1', '1.2', '1.3']):
                if 'critic:data_quality' not in new_criteria:
                    new_criteria.append('critic:data_quality')

            # Add causal/academic rigor critics for validation tasks
            if any(x in task_id for x in ['2.1', '2.2', '3.1', '3.2', '3.3', '5.1', '5.2']):
                if 'critic:causal' not in new_criteria:
                    new_criteria.append('critic:causal')

            # Update metadata
            metadata['exit_criteria'] = new_criteria
            new_metadata_json = json.dumps(metadata)

            # Update database
            cursor.execute(
                "UPDATE tasks SET metadata = ? WHERE id = ?",
                (new_metadata_json, task_id)
            )

            updated_count += 1
            updated_tasks.append(task_id)

            print(f"✅ {task_id}: Updated with {len(new_criteria)} exit criteria")

        except Exception as e:
            print(f"❌ {task_id}: Error - {e}", file=sys.stderr)

    conn.commit()
    conn.close()

    return updated_count, updated_tasks


if __name__ == '__main__':
    db_path = 'state/orchestrator.db'

    if not Path(db_path).exists():
        print(f"❌ Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Updating ML task exit criteria in {db_path}...")
    updated_count, updated_tasks = update_ml_task_criteria(db_path)

    print(f"\n✅ Updated {updated_count} tasks with objective metrics")
    print(f"\nUpdated tasks:")
    for task_id in updated_tasks:
        print(f"  - {task_id}")

    sys.exit(0)
