#!/usr/bin/env python3
"""
Create comprehensive remediation tasks for ALL completed work.

Assumption: ALL tasks completed before quality gates were integrated
likely have quality issues and need verification/fixing.
"""

import yaml
from pathlib import Path

roadmap_path = Path("state/roadmap.yaml")

with open(roadmap_path) as f:
    roadmap = yaml.safe_load(f)

# Find all epics with done tasks
epic_done_tasks = {}
for task in roadmap.get('tasks', []):
    if task.get('status') == 'done':
        epic_id = task.get('epic_id', 'unknown')
        if epic_id not in epic_done_tasks:
            epic_done_tasks[epic_id] = []
        epic_done_tasks[epic_id].append(task)

print(f"Found {len(epic_done_tasks)} epics with completed work:")
for epic_id, tasks in sorted(epic_done_tasks.items(), key=lambda x: -len(x[1])):
    print(f"  {epic_id}: {len(tasks)} done tasks")

# Create remediation tasks for each epic
remediation_tasks = []

for epic_id, tasks in epic_done_tasks.items():
    task_count = len(tasks)
    sample_tasks = tasks[:3]  # Sample first 3 for details

    remediation = {
        'id': f'REMEDIATION-{epic_id}',
        'title': f'[CRITICAL] Quality audit and fixes for {epic_id}',
        'status': 'pending',
        'priority': 'critical',
        'epic_id': 'E-GENERAL',
        'milestone_id': 'E-GENERAL-backlog',
        'dependencies': [],
        'domain': 'product',
        'description': f"""CRITICAL REMEDIATION: {task_count} tasks in {epic_id} completed WITHOUT quality gates.

**Assumption**: All completed work likely has quality issues:
- Missing tests
- No runtime verification
- Superficial completion
- Documentation-code mismatch
- Technical debt

**Sample Tasks to Audit**:
{chr(10).join(f"- {t.get('id')}: {t.get('title', 'No title')}" for t in sample_tasks)}

**Required Work**:

1. Run quality gate adversarial detector on each completed task
2. Verify builds still pass
3. Verify tests exist and cover all 7 dimensions
4. Verify runtime evidence exists
5. Check for documentation-code mismatches
6. Fix ALL identified issues
7. Provide evidence ALL checks pass

**Exit Criteria**:
- Quality gate review APPROVED for representative sample (≥10 tasks)
- Build passes (0 errors)
- Tests pass (≥80% coverage)
- Runtime evidence provided (screenshots, logs, metrics)
- No superficial completion detected
- No documentation lies detected
- Decision logged to quality_gate_decisions.jsonl
""",
        'exit_criteria': [
            'Quality gates pass on ≥10 sampled tasks',
            'Build passes with 0 errors',
            'Tests exist and pass',
            'Runtime evidence provided',
            'Adversarial detector finds no critical issues',
            'Decisions logged with APPROVED status'
        ]
    }

    remediation_tasks.append(remediation)

print(f"\nCreated {len(remediation_tasks)} remediation tasks")
print("\nSample remediation task:")
print(yaml.dump([remediation_tasks[0]], default_flow_style=False, sort_keys=False))

# Add to roadmap
for task in remediation_tasks:
    # Find E-GENERAL epic
    for epic in roadmap['epics']:
        if epic['id'] == 'E-GENERAL':
            for milestone in epic['milestones']:
                if milestone['id'] == 'E-GENERAL-backlog':
                    # Check if task already exists
                    existing_ids = {t.get('id') for t in milestone.get('tasks', [])}
                    if task['id'] not in existing_ids:
                        if 'tasks' not in milestone:
                            milestone['tasks'] = []
                        milestone['tasks'].insert(0, task)  # Add at top (high priority)
                        print(f"Added {task['id']} to roadmap")

# Write back
with open(roadmap_path, 'w') as f:
    yaml.dump(roadmap, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

print(f"\n✅ Roadmap updated with {len(remediation_tasks)} CRITICAL remediation tasks")
print("   Priority: CRITICAL (will be picked up by autopilot)")
print("   Location: E-GENERAL-backlog (top of list)")
