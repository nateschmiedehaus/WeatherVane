#!/usr/bin/env python3
"""
Update all ML task exit criteria with objective metrics.
Task: T-MLR-0.2
Purpose: Add comprehensive quantitative exit criteria to all T12.* and T13.* ML modeling tasks
"""

import yaml
import re
from pathlib import Path

# Define objective exit criteria templates based on task type
def get_modeling_exit_criteria(task_id: str, existing_criteria: list) -> list:
    """Generate comprehensive exit criteria for modeling tasks."""

    # Core modeling metrics required for all ML tasks
    core_metrics = [
        "metric:out_of_sample_r2 > 0.50",
        "metric:weather_elasticity_sign_correct = true",
        "metric:beats_naive_baseline_mape > 1.10",
        "metric:beats_seasonal_baseline_mape > 1.10",
        "metric:no_overfitting_detected = true",
        "critic:modeling_reality_v2",
        "critic:academic_rigor",
    ]

    # Keep existing artifacts
    existing_artifacts = [c for c in existing_criteria if c.startswith("artifact:")]
    existing_critics = [c for c in existing_criteria if c.startswith("critic:") and c not in core_metrics]

    # Build comprehensive criteria list
    new_criteria = existing_artifacts.copy()

    # Add validation report if not present
    if not any("validation" in str(c) for c in new_criteria):
        new_criteria.append(f"artifact:experiments/{extract_epic(task_id)}/validation_report.json")

    # Add model artifact if not present and this is a training task
    if "train" in task_id.lower() or "model" in task_id.lower():
        if not any(".pkl" in str(c) or "model" in str(c) for c in new_criteria):
            new_criteria.append(f"artifact:experiments/{extract_epic(task_id)}/model.pkl")

    # Add core metrics
    new_criteria.extend(core_metrics)

    # Add back existing critics that aren't duplicates
    new_criteria.extend(existing_critics)

    # Remove duplicates while preserving order
    seen = set()
    final_criteria = []
    for item in new_criteria:
        if item not in seen:
            seen.add(item)
            final_criteria.append(item)

    return final_criteria


def get_data_generation_exit_criteria(task_id: str, existing_criteria: list) -> list:
    """Generate exit criteria for synthetic data generation tasks."""

    existing_artifacts = [c for c in existing_criteria if c.startswith("artifact:")]

    new_criteria = existing_artifacts.copy()

    # Add data quality metrics
    data_metrics = [
        "metric:extreme_tenant_correlation >= 0.80",
        "metric:high_tenant_correlation >= 0.65",
        "metric:medium_tenant_correlation >= 0.35",
        "metric:none_tenant_correlation < 0.15",
        "metric:data_completeness = 1.0",
        "metric:no_missing_dates = true",
        "critic:data_quality",
        "critic:modeling_reality_v2",
    ]

    new_criteria.extend(data_metrics)

    # Remove duplicates
    seen = set()
    final_criteria = []
    for item in new_criteria:
        if item not in seen:
            seen.add(item)
            final_criteria.append(item)

    return final_criteria


def get_validation_exit_criteria(task_id: str, existing_criteria: list) -> list:
    """Generate exit criteria for validation tasks."""

    existing_artifacts = [c for c in existing_criteria if c.startswith("artifact:")]
    existing_critics = [c for c in existing_criteria if c.startswith("critic:")]

    new_criteria = existing_artifacts.copy()

    # Add validation metrics
    validation_metrics = [
        "metric:out_of_sample_r2 > 0.50",
        "metric:weather_elasticity_sign_correct = true",
        "metric:beats_naive_baseline_mape > 1.10",
        "metric:beats_seasonal_baseline_mape > 1.10",
        "metric:test_mape < 0.20",
        "metric:no_overfitting_detected = true",
    ]

    new_criteria.extend(validation_metrics)
    new_criteria.extend(["critic:modeling_reality_v2", "critic:academic_rigor", "critic:causal"])

    # Add back existing critics
    for critic in existing_critics:
        if critic not in new_criteria:
            new_criteria.append(critic)

    # Remove duplicates
    seen = set()
    final_criteria = []
    for item in new_criteria:
        if item not in seen:
            seen.add(item)
            final_criteria.append(item)

    return final_criteria


def extract_epic(task_id: str) -> str:
    """Extract epic prefix from task ID (e.g., T12.0.1 -> t12)."""
    match = re.match(r'T(\d+)', task_id)
    if match:
        return f"t{match.group(1)}"
    return "unknown"


def should_update_task(task_id: str, title: str) -> str:
    """Determine if task needs ML exit criteria updates and return type."""

    # T12.* and T13.* tasks
    if not (task_id.startswith("T12.") or task_id.startswith("T13.")):
        return None

    title_lower = title.lower()

    # Data generation tasks
    if any(kw in title_lower for kw in ["generate", "synthetic data", "dataset"]):
        return "data_generation"

    # Validation tasks
    if any(kw in title_lower for kw in ["validate", "validation", "verify"]):
        return "validation"

    # Modeling/training tasks
    if any(kw in title_lower for kw in ["train", "model", "mmm", "backtest", "elasticity", "allocation"]):
        return "modeling"

    # Default to modeling for T12/T13 tasks
    return "modeling"


def update_roadmap(roadmap_path: Path):
    """Update the roadmap YAML file with objective exit criteria."""

    with open(roadmap_path, 'r') as f:
        roadmap = yaml.safe_load(f)

    updates_made = 0
    tasks_updated = []

    # Iterate through epics
    for epic in roadmap.get('epics', []):
        epic_id = epic.get('id', '')

        # Skip if not E12 or E13
        if epic_id not in ['E12', 'E13']:
            continue

        # Iterate through milestones
        for milestone in epic.get('milestones', []):
            # Iterate through tasks
            for task in milestone.get('tasks', []):
                task_id = task.get('id', '')
                title = task.get('title', '')

                task_type = should_update_task(task_id, title)

                if not task_type:
                    continue

                # Get existing exit criteria
                existing_criteria = task.get('exit_criteria', [])

                # Generate new criteria based on task type
                if task_type == "data_generation":
                    new_criteria = get_data_generation_exit_criteria(task_id, existing_criteria)
                elif task_type == "validation":
                    new_criteria = get_validation_exit_criteria(task_id, existing_criteria)
                else:  # modeling
                    new_criteria = get_modeling_exit_criteria(task_id, existing_criteria)

                # Update if criteria changed
                if new_criteria != existing_criteria:
                    task['exit_criteria'] = new_criteria
                    updates_made += 1
                    tasks_updated.append(f"{task_id}: {title}")
                    print(f"✅ Updated {task_id}: {title}")
                    print(f"   Added {len(new_criteria) - len(existing_criteria)} new criteria")

    # Write updated roadmap
    with open(roadmap_path, 'w') as f:
        yaml.dump(roadmap, f, default_flow_style=False, sort_keys=False, width=100)

    # Print summary
    print(f"\n{'='*80}")
    print(f"Summary: Updated {updates_made} tasks")
    print(f"{'='*80}")
    print("\nUpdated tasks:")
    for task in tasks_updated:
        print(f"  - {task}")

    return updates_made, tasks_updated


def main():
    """Main entry point."""
    roadmap_path = Path(__file__).parent.parent / "state" / "roadmap.yaml"

    if not roadmap_path.exists():
        print(f"❌ Error: Roadmap not found at {roadmap_path}")
        return 1

    print(f"Updating ML task exit criteria in: {roadmap_path}")
    print(f"{'='*80}\n")

    try:
        updates_made, tasks_updated = update_roadmap(roadmap_path)

        if updates_made > 0:
            print(f"\n✅ Success! Updated {updates_made} ML tasks with objective exit criteria.")
            print(f"\nNext steps:")
            print(f"1. Review the updated roadmap: {roadmap_path}")
            print(f"2. Verify all metrics are appropriate for each task")
            print(f"3. Run manual inspection for loopholes")
            return 0
        else:
            print(f"\n✅ No updates needed - all tasks already have objective criteria.")
            return 0

    except Exception as e:
        print(f"\n❌ Error updating roadmap: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
