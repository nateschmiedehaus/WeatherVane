#!/usr/bin/env python3
"""
Add Phase 0 and Phase 1 tasks to the roadmap
"""

import yaml
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
ROADMAP_PATH = ROOT / "state" / "roadmap.yaml"

# Load current roadmap
with open(ROADMAP_PATH) as f:
    roadmap = yaml.safe_load(f)

# Find or create PHASE-0 and PHASE-1 epics
phase0_epic = None
phase1_epic = None

for epic in roadmap['epics']:
    if epic['id'] == 'E-PHASE0':
        phase0_epic = epic
    elif epic['id'] == 'E-PHASE1':
        phase1_epic = epic

# Create Phase 0 epic if it doesn't exist
if not phase0_epic:
    phase0_epic = {
        'id': 'E-PHASE0',
        'title': 'Phase 0: Measurement & Confidence',
        'status': 'pending',
        'domain': 'product',
        'milestones': []
    }
    roadmap['epics'].insert(0, phase0_epic)

# Create Phase 1 epic if it doesn't exist
if not phase1_epic:
    phase1_epic = {
        'id': 'E-PHASE1',
        'title': 'Phase 1: Experience Delivery',
        'status': 'pending',
        'domain': 'product',
        'milestones': []
    }
    roadmap['epics'].insert(1, phase1_epic)

# Phase 0 tasks
phase0_tasks = [
    {
        'id': 'T0.1.1',
        'title': 'Implement geo holdout plumbing',
        'status': 'pending',
        'dependencies': [],
        'exit_criteria': [
            'artifact:state/analytics/experiments/geo_holdouts/*.json',
            'artifact:state/telemetry/experiments/geo_holdout_runs.jsonl',
            'critic:data_quality'
        ],
        'domain': 'product',
        'description': 'Wire apps/validation/incrementality.py into ingestion runs with nightly job execution'
    },
    {
        'id': 'T0.1.2',
        'title': 'Build lift & confidence UI surfaces',
        'status': 'pending',
        'dependencies': ['T0.1.1'],
        'exit_criteria': [
            'artifact:apps/api/schemas/plan.py',
            'artifact:apps/web/src/pages/plan.tsx',
            'critic:tests',
            'critic:design_system'
        ],
        'domain': 'product',
        'description': 'Plan API surfaces experiment payloads; Plan UI renders lift/confidence cards with download'
    },
    {
        'id': 'T0.1.3',
        'title': 'Generate forecast calibration report',
        'status': 'pending',
        'dependencies': [],
        'exit_criteria': [
            'artifact:docs/modeling/forecast_calibration_report.md',
            'artifact:state/telemetry/calibration/*.json',
            'critic:forecast_stitch'
        ],
        'domain': 'product',
        'description': 'Quantile calibration metrics with summary published to docs'
    }
]

# Phase 1 tasks
phase1_tasks = [
    {
        'id': 'T1.1.1',
        'title': 'Build scenario builder MVP',
        'status': 'pending',
        'dependencies': [],
        'exit_criteria': [
            'artifact:apps/web/src/pages/scenarios.tsx',
            'artifact:apps/api/routes/scenarios.py',
            'critic:tests',
            'critic:design_system'
        ],
        'domain': 'product',
        'description': 'Interactive scenario flows with API endpoints for scenario snapshots and storybook coverage'
    },
    {
        'id': 'T1.1.2',
        'title': 'Implement visual overlays & exports',
        'status': 'pending',
        'dependencies': ['T1.1.1'],
        'exit_criteria': [
            'artifact:apps/web/src/components/ScenarioOverlays.tsx',
            'artifact:apps/api/routes/exports.py',
            'critic:tests',
            'critic:design_system'
        ],
        'domain': 'product',
        'description': 'Map + chart overlays with export service (PPT/CSV)'
    },
    {
        'id': 'T1.1.3',
        'title': 'Wire onboarding progress API',
        'status': 'pending',
        'dependencies': [],
        'exit_criteria': [
            'artifact:apps/api/routes/onboarding.py',
            'artifact:apps/web/src/hooks/useOnboardingProgress.ts',
            'critic:tests'
        ],
        'domain': 'product',
        'description': 'Implement GET/POST /onboarding/progress routes with telemetry instrumentation'
    }
]

# Add tasks to Phase 0 milestone
if not phase0_epic['milestones']:
    phase0_epic['milestones'] = [{
        'id': 'M0.1',
        'title': 'Measurement & Confidence Foundations',
        'status': 'pending',
        'tasks': []
    }]

# Clear existing tasks and add new ones
phase0_epic['milestones'][0]['tasks'] = phase0_tasks

# Add tasks to Phase 1 milestone
if not phase1_epic['milestones']:
    phase1_epic['milestones'] = [{
        'id': 'M1.1',
        'title': 'Experience Delivery MVP',
        'status': 'pending',
        'tasks': []
    }]

# Clear existing tasks and add new ones
phase1_epic['milestones'][0]['tasks'] = phase1_tasks

# Write updated roadmap
with open(ROADMAP_PATH, 'w') as f:
    yaml.dump(roadmap, f, default_flow_style=False, sort_keys=False)

print(f"✅ Added {len(phase0_tasks)} Phase 0 tasks and {len(phase1_tasks)} Phase 1 tasks to roadmap")
print(f"📝 Roadmap updated: {ROADMAP_PATH}")
