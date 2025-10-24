#!/usr/bin/env python3
"""
Unblock all tasks and epics in roadmap
"""

import yaml
from pathlib import Path

# Read roadmap
roadmap_path = Path('/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/state/roadmap.yaml')
with open(roadmap_path, 'r') as f:
    roadmap = yaml.safe_load(f)

unblocked_count = 0

# Unblock all epics
for epic in roadmap['epics']:
    if epic.get('status') == 'blocked':
        # Set to pending if not started, or in_progress if it has tasks in progress
        epic['status'] = 'pending'
        unblocked_count += 1
        print(f"✓ Unblocked epic: {epic['id']}")

    # Special: Set E-REMEDIATION to highest priority
    if epic['id'] == 'E-REMEDIATION':
        epic['priority'] = 'critical'  # Add priority field
        epic['status'] = 'in_progress'
        print(f"✓ Set E-REMEDIATION to CRITICAL priority")

    # Unblock all milestones
    for milestone in epic.get('milestones', []):
        if milestone.get('status') == 'blocked':
            milestone['status'] = 'pending'
            unblocked_count += 1
            print(f"  ✓ Unblocked milestone: {milestone['id']}")

        # Unblock all tasks
        for task in milestone.get('tasks', []):
            if task.get('status') == 'blocked':
                task['status'] = 'pending'
                unblocked_count += 1
                print(f"    ✓ Unblocked task: {task['id']}")

            # Remove blocked_reason if present
            if 'blocked_reason' in task:
                del task['blocked_reason']

# Write back
with open(roadmap_path, 'w') as f:
    yaml.dump(roadmap, f, default_flow_style=False, allow_unicode=True, width=120)

print(f"\n✅ Unblocked {unblocked_count} items")
print(f"✅ E-REMEDIATION priority set to CRITICAL")
print(f"✅ Roadmap updated: {roadmap_path}")
