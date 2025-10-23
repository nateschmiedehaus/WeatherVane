#!/usr/bin/env python3
"""
Verify that all ML tasks have the required objective exit criteria.
Task: T-MLR-0.2 verification step
"""

import yaml
from pathlib import Path
from typing import List, Dict, Tuple

# Required criteria per T-MLR-0.2
REQUIRED_MODELING_CRITERIA = [
    "metric:out_of_sample_r2 > 0.50",
    "metric:weather_elasticity_sign_correct = true",
    "metric:beats_naive_baseline_mape > 1.10",
    "metric:beats_seasonal_baseline_mape > 1.10",
    "critic:modeling_reality_v2",
]

REQUIRED_DATA_CRITERIA = [
    "critic:data_quality",
]


def check_task_criteria(task_id: str, title: str, exit_criteria: List[str]) -> Tuple[bool, List[str]]:
    """Check if a task has all required criteria."""

    title_lower = title.lower()
    missing = []

    # Determine task type
    is_modeling_task = any(kw in title_lower for kw in [
        "train", "model", "mmm", "backtest", "elasticity", "allocation", "fit"
    ])

    is_data_task = any(kw in title_lower for kw in [
        "generate", "synthetic", "data", "validate", "quality"
    ])

    # Check for required modeling criteria
    if is_modeling_task:
        for required in REQUIRED_MODELING_CRITERIA:
            # Handle flexible matching for metrics
            if required.startswith("metric:"):
                metric_name = required.split(":")[1].split(" ")[0]
                if not any(metric_name in str(c) for c in exit_criteria):
                    missing.append(required)
            elif required not in exit_criteria:
                missing.append(required)

    # Check for required data criteria
    if is_data_task:
        for required in REQUIRED_DATA_CRITERIA:
            if required not in exit_criteria:
                missing.append(required)

    # All tasks should have modeling_reality_v2 critic
    if "critic:modeling_reality_v2" not in exit_criteria:
        if "critic:modeling_reality_v2" not in missing:
            missing.append("critic:modeling_reality_v2")

    return len(missing) == 0, missing


def verify_roadmap(roadmap_path: Path) -> Tuple[int, int, List[Dict]]:
    """Verify all ML tasks have required criteria."""

    with open(roadmap_path, 'r') as f:
        roadmap = yaml.safe_load(f)

    total_tasks = 0
    passed_tasks = 0
    issues = []

    # Iterate through epics
    for epic in roadmap.get('epics', []):
        epic_id = epic.get('id', '')

        # Only check E12 and E13
        if epic_id not in ['E12', 'E13']:
            continue

        # Iterate through milestones
        for milestone in epic.get('milestones', []):
            # Iterate through tasks
            for task in milestone.get('tasks', []):
                task_id = task.get('id', '')
                title = task.get('title', '')

                # Only check T12.* and T13.* tasks
                if not (task_id.startswith("T12.") or task_id.startswith("T13.")):
                    continue

                total_tasks += 1
                exit_criteria = task.get('exit_criteria', [])

                passed, missing = check_task_criteria(task_id, title, exit_criteria)

                if passed:
                    passed_tasks += 1
                    print(f"✅ {task_id}: {title}")
                else:
                    print(f"❌ {task_id}: {title}")
                    print(f"   Missing criteria: {', '.join(missing)}")
                    issues.append({
                        'task_id': task_id,
                        'title': title,
                        'missing': missing
                    })

    return total_tasks, passed_tasks, issues


def check_for_loopholes(roadmap_path: Path) -> List[str]:
    """Manual inspection for potential loopholes."""

    with open(roadmap_path, 'r') as f:
        roadmap = yaml.safe_load(f)

    loopholes = []

    for epic in roadmap.get('epics', []):
        epic_id = epic.get('id', '')

        if epic_id not in ['E12', 'E13']:
            continue

        for milestone in epic.get('milestones', []):
            for task in milestone.get('tasks', []):
                task_id = task.get('id', '')
                title = task.get('title', '')
                exit_criteria = task.get('exit_criteria', [])

                if not (task_id.startswith("T12.") or task_id.startswith("T13.")):
                    continue

                # Check for potential loopholes
                # 1. Tasks with only critics, no metrics
                has_metrics = any(c.startswith("metric:") for c in exit_criteria)
                has_critics = any(c.startswith("critic:") for c in exit_criteria)

                if has_critics and not has_metrics:
                    title_lower = title.lower()
                    if any(kw in title_lower for kw in ["model", "train", "mmm"]):
                        loopholes.append(f"{task_id}: Has critics but no quantitative metrics")

                # 2. Tasks without validation artifacts
                title_lower = title.lower()
                if any(kw in title_lower for kw in ["model", "train", "mmm"]):
                    has_validation = any("validation" in str(c) for c in exit_criteria)
                    if not has_validation:
                        loopholes.append(f"{task_id}: No validation artifact specified")

                # 3. Tasks without baseline comparison
                if any(kw in title_lower for kw in ["model", "train", "mmm"]):
                    has_baseline = any("baseline" in str(c) for c in exit_criteria)
                    if not has_baseline:
                        loopholes.append(f"{task_id}: No baseline comparison required")

    return loopholes


def main():
    """Main entry point."""
    roadmap_path = Path(__file__).parent.parent / "state" / "roadmap.yaml"

    print(f"Verifying ML task exit criteria in: {roadmap_path}")
    print(f"{'='*80}\n")

    print("STEP 1: Checking required criteria")
    print(f"{'='*80}")

    total_tasks, passed_tasks, issues = verify_roadmap(roadmap_path)

    print(f"\n{'='*80}")
    print(f"Summary: {passed_tasks}/{total_tasks} tasks passed")
    print(f"{'='*80}\n")

    if issues:
        print("⚠️  Issues found:")
        for issue in issues:
            print(f"  {issue['task_id']}: {issue['title']}")
            for missing in issue['missing']:
                print(f"    - Missing: {missing}")
        print()

    print("\nSTEP 2: Checking for loopholes")
    print(f"{'='*80}")

    loopholes = check_for_loopholes(roadmap_path)

    if loopholes:
        print("⚠️  Potential loopholes found:")
        for loophole in loopholes:
            print(f"  - {loophole}")
    else:
        print("✅ No loopholes detected")

    print(f"\n{'='*80}")

    if passed_tasks == total_tasks and not loopholes:
        print("✅ VERIFICATION PASSED: All ML tasks have objective exit criteria")
        return 0
    else:
        print("❌ VERIFICATION FAILED: Some tasks need updates")
        return 1


if __name__ == "__main__":
    exit(main())
