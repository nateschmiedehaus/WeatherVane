#!/usr/bin/env python3
"""
Fix remaining issues in ML task exit criteria.
"""

import yaml
from pathlib import Path

def fix_remaining_issues(roadmap_path: Path):
    """Fix the remaining criteria issues."""

    with open(roadmap_path, 'r') as f:
        roadmap = yaml.safe_load(f)

    fixes_made = []

    for epic in roadmap.get('epics', []):
        epic_id = epic.get('id', '')

        if epic_id not in ['E12', 'E13']:
            continue

        for milestone in epic.get('milestones', []):
            for task in milestone.get('tasks', []):
                task_id = task.get('id', '')
                title = task.get('title', '')
                exit_criteria = task.get('exit_criteria', [])

                # Fix specific tasks
                if task_id == "T12.3.1":
                    # Add validation artifact
                    if "artifact:experiments/t12/validation_report.json" not in exit_criteria:
                        # Find position to insert (after existing artifacts)
                        insert_pos = 0
                        for i, c in enumerate(exit_criteria):
                            if c.startswith("artifact:"):
                                insert_pos = i + 1
                        exit_criteria.insert(insert_pos, "artifact:experiments/t12/validation_report.json")
                        task['exit_criteria'] = exit_criteria
                        fixes_made.append(f"{task_id}: Added validation artifact")

    # Write updates
    with open(roadmap_path, 'w') as f:
        yaml.dump(roadmap, f, default_flow_style=False, sort_keys=False, width=100)

    return fixes_made


def main():
    roadmap_path = Path(__file__).parent.parent / "state" / "roadmap.yaml"

    print("Fixing remaining ML exit criteria issues...")
    print(f"{'='*80}\n")

    fixes = fix_remaining_issues(roadmap_path)

    if fixes:
        print("✅ Fixes applied:")
        for fix in fixes:
            print(f"  - {fix}")
    else:
        print("✅ No fixes needed")

    return 0


if __name__ == "__main__":
    exit(main())
