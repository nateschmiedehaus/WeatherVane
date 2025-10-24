#!/usr/bin/env python3
"""
Fix REMEDIATION tasks to include explicit evidence collection requirements.

This script updates all REM-* task descriptions to clearly state that workers
MUST collect build/test/audit evidence and runtime proof to pass quality gates.
"""

import yaml
from pathlib import Path

ROADMAP_PATH = Path(__file__).parent.parent / "state" / "roadmap.yaml"

EVIDENCE_REQUIREMENTS = """

**MANDATORY EVIDENCE COLLECTION** (for quality gates):

1. **BUILD Evidence**:
   ```bash
   cd /Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/tools/wvo_mcp
   npm run build 2>&1
   ```
   - Capture FULL output
   - Must show "0 errors"
   - Provide output in verification report

2. **TEST Evidence**:
   ```bash
   npm test 2>&1
   ```
   - Capture FULL output
   - Must show "X/X passing" (all tests pass)
   - Provide output in verification report

3. **AUDIT Evidence**:
   ```bash
   npm audit 2>&1
   ```
   - Capture FULL output
   - Must show "0 vulnerabilities"
   - Provide output in verification report

4. **RUNTIME Evidence** (at least ONE of):
   - Screenshot of feature running in browser/CLI
   - Log file from feature execution
   - Artifact created by feature (JSON file, report, etc.)
   - Demonstration video/recording

5. **DOCUMENTATION Evidence**:
   - List files modified/created
   - Quote relevant documentation sections
   - Verify docs match implementation

**Quality Gate Checklist**:
- [ ] Build output collected (0 errors required)
- [ ] Test output collected (all passing required)
- [ ] Audit output collected (0 vulnerabilities required)
- [ ] Runtime evidence provided (artifacts/logs/screenshots)
- [ ] Documentation verified (no mismatches)

**NOTE**: Without ALL evidence above, quality gates will AUTOMATICALLY REJECT.
Do NOT skip evidence collection. Do NOT assume quality gates will pass without proof.
"""

def main():
    print("Loading roadmap...")
    with open(ROADMAP_PATH, 'r') as f:
        roadmap = yaml.safe_load(f)

    updated_count = 0

    # Find REMEDIATION epic
    for epic in roadmap.get('epics', []):
        if epic['id'] == 'E-REMEDIATION':
            print(f"Found REMEDIATION epic: {epic['id']}")

            for milestone in epic.get('milestones', []):
                for task in milestone.get('tasks', []):
                    if task['id'].startswith('REM-'):
                        # Check if evidence requirements already added
                        desc = task.get('description', '')
                        if 'MANDATORY EVIDENCE COLLECTION' not in desc:
                            print(f"  Updating {task['id']}: {task['title']}")
                            task['description'] = desc.rstrip() + EVIDENCE_REQUIREMENTS
                            updated_count += 1
                        else:
                            print(f"  Skipping {task['id']}: already has evidence requirements")

    if updated_count > 0:
        print(f"\nUpdating {updated_count} tasks...")
        with open(ROADMAP_PATH, 'w') as f:
            yaml.dump(roadmap, f, default_flow_style=False, sort_keys=False, width=120)
        print(f"✅ Updated {updated_count} REMEDIATION tasks with evidence requirements")
    else:
        print("✅ All REMEDIATION tasks already have evidence requirements")

if __name__ == '__main__':
    main()
