#!/usr/bin/env python3
"""
Final verification that all ML tasks meet T-MLR-0.2 exit criteria.

Per T-MLR-0.2, every ML task (T12.*, T13.*) must have:
1. metric:out_of_sample_r2 > 0.50 (or metric:r2 > 0.50)
2. metric:beats_baseline > 1.10 (or beats_*_baseline*)
3. critic:modeling_reality_v2
"""

import yaml
from pathlib import Path
from typing import List, Dict, Tuple


def is_ml_modeling_task(task_id: str, title: str) -> bool:
    """Determine if task is an ML modeling task that needs strict criteria."""
    if not (task_id.startswith("T12.") or task_id.startswith("T13.")):
        return False

    title_lower = title.lower()

    # These are modeling tasks
    modeling_keywords = ["train", "model", "mmm", "backtest", "elasticity", "allocation", "fit"]
    return any(kw in title_lower for kw in modeling_keywords)


def check_required_criteria(task_id: str, title: str, exit_criteria: List[str]) -> Tuple[bool, List[str]]:
    """Check if task has the 3 required criteria from T-MLR-0.2."""

    missing = []

    # Only check modeling tasks
    if not is_ml_modeling_task(task_id, title):
        return True, []

    # 1. Check for R² criterion
    has_r2 = any(
        ("r2" in str(c).lower() and ">" in str(c))
        for c in exit_criteria
    )
    if not has_r2:
        missing.append("metric:r2 > 0.50")

    # 2. Check for baseline comparison criterion
    has_baseline = any(
        ("baseline" in str(c).lower() and ">" in str(c))
        for c in exit_criteria
    )
    if not has_baseline:
        missing.append("metric:beats_baseline > 1.10")

    # 3. Check for modeling_reality_v2 critic
    has_critic = "critic:modeling_reality_v2" in exit_criteria
    if not has_critic:
        missing.append("critic:modeling_reality_v2")

    return len(missing) == 0, missing


def check_for_loopholes(roadmap_path: Path) -> List[str]:
    """
    Manual inspection for loopholes per T-MLR-0.2:
    - Tasks without validation artifacts
    - Tasks without model artifacts (for training tasks)
    - Tasks with vague/subjective criteria
    """

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

                if not is_ml_modeling_task(task_id, title):
                    continue

                title_lower = title.lower()

                # Check 1: Training tasks should have model artifacts
                if "train" in title_lower:
                    has_model_artifact = any(
                        (".pkl" in str(c) or ".json" in str(c) or "model" in str(c))
                        and str(c).startswith("artifact:")
                        for c in exit_criteria
                    )
                    if not has_model_artifact:
                        loopholes.append(f"{task_id}: Training task missing model artifact")

                # Check 2: All modeling tasks should have validation artifact
                has_validation = any(
                    "validation" in str(c).lower() and str(c).startswith("artifact:")
                    for c in exit_criteria
                )
                if not has_validation:
                    loopholes.append(f"{task_id}: Missing validation artifact (validation_report.json)")

                # Check 3: Check for weather elasticity sign check
                has_elasticity_check = any(
                    "elasticity" in str(c) and "correct" in str(c)
                    for c in exit_criteria
                )
                if not has_elasticity_check:
                    loopholes.append(f"{task_id}: Missing weather_elasticity_sign_correct check")

                # Check 4: Check for multiple baseline comparisons
                baseline_count = sum(
                    1 for c in exit_criteria
                    if "baseline" in str(c).lower() and str(c).startswith("metric:")
                )
                if baseline_count < 2:
                    loopholes.append(
                        f"{task_id}: Should have multiple baseline comparisons "
                        "(naive, seasonal, linear)"
                    )

    return loopholes


def verify_t_mlr_0_2_compliance(roadmap_path: Path) -> Dict:
    """Verify full T-MLR-0.2 compliance."""

    with open(roadmap_path, 'r') as f:
        roadmap = yaml.safe_load(f)

    results = {
        'total_ml_tasks': 0,
        'tasks_passed': 0,
        'tasks_failed': [],
        'loopholes': []
    }

    print("Checking T-MLR-0.2 required criteria:")
    print("1. metric:r2 > 0.50")
    print("2. metric:beats_baseline > 1.10")
    print("3. critic:modeling_reality_v2")
    print(f"{'='*80}\n")

    for epic in roadmap.get('epics', []):
        epic_id = epic.get('id', '')

        if epic_id not in ['E12', 'E13']:
            continue

        for milestone in epic.get('milestones', []):
            for task in milestone.get('tasks', []):
                task_id = task.get('id', '')
                title = task.get('title', '')
                exit_criteria = task.get('exit_criteria', [])

                if not is_ml_modeling_task(task_id, title):
                    continue

                results['total_ml_tasks'] += 1

                passed, missing = check_required_criteria(task_id, title, exit_criteria)

                if passed:
                    results['tasks_passed'] += 1
                    print(f"✅ {task_id}: {title}")
                else:
                    print(f"❌ {task_id}: {title}")
                    print(f"   Missing: {', '.join(missing)}")
                    results['tasks_failed'].append({
                        'task_id': task_id,
                        'title': title,
                        'missing': missing
                    })

    # Check for loopholes
    print(f"\n{'='*80}")
    print("Checking for loopholes...")
    print(f"{'='*80}\n")

    loopholes = check_for_loopholes(roadmap_path)
    results['loopholes'] = loopholes

    return results


def main():
    """Main entry point."""
    roadmap_path = Path(__file__).parent.parent / "state" / "roadmap.yaml"

    print(f"T-MLR-0.2 COMPLIANCE VERIFICATION")
    print(f"{'='*80}")
    print(f"Roadmap: {roadmap_path}")
    print(f"{'='*80}\n")

    results = verify_t_mlr_0_2_compliance(roadmap_path)

    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print(f"Total ML modeling tasks: {results['total_ml_tasks']}")
    print(f"Tasks passed: {results['tasks_passed']}")
    print(f"Tasks failed: {len(results['tasks_failed'])}")
    print(f"Loopholes detected: {len(results['loopholes'])}")

    if results['tasks_failed']:
        print(f"\n❌ FAILED TASKS:")
        for task in results['tasks_failed']:
            print(f"  {task['task_id']}: {task['title']}")
            for missing in task['missing']:
                print(f"    - Missing: {missing}")

    if results['loopholes']:
        print(f"\n⚠️  LOOPHOLES DETECTED:")
        for loophole in results['loopholes']:
            print(f"  - {loophole}")

    print(f"\n{'='*80}")

    # Final verdict
    all_passed = (len(results['tasks_failed']) == 0)
    no_critical_loopholes = (len(results['loopholes']) == 0)

    if all_passed and no_critical_loopholes:
        print("✅ T-MLR-0.2 VERIFICATION PASSED")
        print("All ML tasks have objective exit criteria per specification.")
        return 0
    elif all_passed:
        print("⚠️  T-MLR-0.2 VERIFICATION PASSED WITH WARNINGS")
        print("Required criteria present, but some loopholes detected.")
        print("Review loopholes above and decide if acceptable.")
        return 0
    else:
        print("❌ T-MLR-0.2 VERIFICATION FAILED")
        print("Some tasks missing required criteria.")
        return 1


if __name__ == "__main__":
    exit(main())
