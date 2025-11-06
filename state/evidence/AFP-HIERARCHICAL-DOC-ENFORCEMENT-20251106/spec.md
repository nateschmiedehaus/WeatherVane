# Specification: Hierarchical Documentation Enforcement

**Task ID:** AFP-HIERARCHICAL-DOC-ENFORCEMENT-20251106
**Phase:** SPEC
**Date:** 2025-11-06
**Depends On:** AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106

## Overview

This specification defines requirements for extending the distributed knowledge base automation to organizational hierarchy (epics, milestones, task groups). The system will provide README directories for each hierarchical level with machine-parsable YAML frontmatter and automated enforcement.

**Pattern:** Reuse existing directory README automation with hierarchical templates

## Functional Requirements

### FR1: Epic README Directories

**Requirement:** Every epic in roadmap.yaml SHALL have a corresponding README directory at `state/epics/[EPIC-ID]/README.md`

**Acceptance Criteria:**
- Epic directory structure: `state/epics/[EPIC-ID]/`
- README.md file with YAML frontmatter
- Template-based initialization via `scripts/readme_init.sh`
- Template: `docs/templates/epic_readme_template.md`

**YAML Frontmatter Fields (Required):**
```yaml
---
type: "epic_readme"
epic_id: "WAVE-0"
status: "in-progress" | "blocked" | "done"
last_updated: "YYYY-MM-DD"
owner: "Director Dana"
domain: "mcp" | "product"
milestones: ["W0.M1", "W0.M2"]
dependencies: []
---
```

**Required Sections:**
1. **Purpose** - Strategic goal (WHY epic exists, WHAT problem it solves)
2. **Recent Changes** - Task-level updates (auto-managed by scripts)
3. **Success Criteria** - What "done" means for this epic
4. **Architecture Decisions** - High-level technical choices affecting all milestones
5. **Milestones** - List of milestones with status and links
6. **Dependencies** - Other epics that must complete first
7. **Risks** - Epic-level risks and mitigation strategies
8. **Navigation** - Links to milestones, roadmap

**Initialization Command:**
```bash
scripts/readme_init.sh state/epics/WAVE-0 AFP-CREATE-WAVE-0
```

**Test:**
```bash
# Create epic README
scripts/readme_init.sh state/epics/WAVE-0 AFP-TEST-001

# Verify directory exists
test -d state/epics/WAVE-0

# Verify README exists
test -f state/epics/WAVE-0/README.md

# Verify YAML frontmatter is parsable
python3 -c "
import yaml
with open('state/epics/WAVE-0/README.md') as f:
    content = f.read()
    parts = content.split('---')
    frontmatter = yaml.safe_load(parts[1])
    assert frontmatter['type'] == 'epic_readme'
    assert frontmatter['epic_id'] == 'WAVE-0'
"

# Verify all required sections present
grep -q "## Purpose" state/epics/WAVE-0/README.md
grep -q "## Recent Changes" state/epics/WAVE-0/README.md
grep -q "## Success Criteria" state/epics/WAVE-0/README.md
grep -q "## Architecture Decisions" state/epics/WAVE-0/README.md
grep -q "## Milestones" state/epics/WAVE-0/README.md
grep -q "## Dependencies" state/epics/WAVE-0/README.md
grep -q "## Risks" state/epics/WAVE-0/README.md
grep -q "## Navigation" state/epics/WAVE-0/README.md
```

### FR2: Milestone README Directories

**Requirement:** Every milestone in roadmap.yaml SHALL have a corresponding README directory at `state/milestones/[MILESTONE-ID]/README.md`

**Acceptance Criteria:**
- Milestone directory structure: `state/milestones/[MILESTONE-ID]/`
- README.md file with YAML frontmatter
- Template-based initialization via `scripts/readme_init.sh`
- Template: `docs/templates/milestone_readme_template.md`

**YAML Frontmatter Fields (Required):**
```yaml
---
type: "milestone_readme"
milestone_id: "W0.M1"
epic_id: "WAVE-0"
status: "in-progress" | "blocked" | "done"
last_updated: "YYYY-MM-DD"
owner: "Atlas"
tasks: ["AFP-W0-M1-TASK-001", "AFP-W0-M1-TASK-002"]
---
```

**Required Sections:**
1. **Purpose** - Capability delivered (WHAT users/system can do after completion)
2. **Recent Changes** - Task-level updates (auto-managed by scripts)
3. **Phase Plan** - Timeline, sequencing, integration points
4. **Tasks** - List of tasks with status and links to evidence bundles
5. **Integration Requirements** - How this milestone integrates with others
6. **Acceptance Criteria** - How we know milestone is truly complete
7. **Navigation** - Links to epic, tasks, roadmap

**Initialization Command:**
```bash
scripts/readme_init.sh state/milestones/W0.M1 AFP-CREATE-W0-M1
```

**Test:**
```bash
# Create milestone README
scripts/readme_init.sh state/milestones/W0.M1 AFP-TEST-001

# Verify directory exists
test -d state/milestones/W0.M1

# Verify README exists
test -f state/milestones/W0.M1/README.md

# Verify YAML frontmatter is parsable
python3 -c "
import yaml
with open('state/milestones/W0.M1/README.md') as f:
    content = f.read()
    parts = content.split('---')
    frontmatter = yaml.safe_load(parts[1])
    assert frontmatter['type'] == 'milestone_readme'
    assert frontmatter['milestone_id'] == 'W0.M1'
    assert frontmatter['epic_id'] == 'WAVE-0'
"

# Verify all required sections present
grep -q "## Purpose" state/milestones/W0.M1/README.md
grep -q "## Recent Changes" state/milestones/W0.M1/README.md
grep -q "## Phase Plan" state/milestones/W0.M1/README.md
grep -q "## Tasks" state/milestones/W0.M1/README.md
grep -q "## Integration Requirements" state/milestones/W0.M1/README.md
grep -q "## Acceptance Criteria" state/milestones/W0.M1/README.md
grep -q "## Navigation" state/milestones/W0.M1/README.md
```

### FR3: Task Group README Directories

**Requirement:** Related tasks CAN be grouped with a shared README directory at `state/task_groups/[GROUP-ID]/README.md`

**Acceptance Criteria:**
- Task group directory structure: `state/task_groups/[GROUP-ID]/`
- README.md file with YAML frontmatter
- Template-based initialization via `scripts/readme_init.sh`
- Template: `docs/templates/task_group_readme_template.md`
- **Optional:** Created as-needed for related tasks (not enforced like epics/milestones)

**YAML Frontmatter Fields (Required):**
```yaml
---
type: "task_group_readme"
group_id: "proof-system"
status: "in-progress" | "blocked" | "done"
last_updated: "YYYY-MM-DD"
owner: "WeatherVane Autopilot"
tasks: ["AFP-PROOF-LAYER-1", "AFP-PROOF-LAYER-2", "AFP-PROOF-LAYER-3"]
milestone_id: "W0.M1"  # Optional: parent milestone
---
```

**Required Sections:**
1. **Purpose** - Why these tasks are grouped together
2. **Recent Changes** - Task-level updates (auto-managed by scripts)
3. **Tasks** - List of tasks with status and links
4. **Shared Context** - What context all tasks share (codebase area, dependencies, integration points)
5. **Execution Order** - Dependencies within the group
6. **Group-Level Testing** - Integration tests spanning multiple tasks
7. **Navigation** - Links to milestone, tasks

**Initialization Command:**
```bash
scripts/readme_init.sh state/task_groups/proof-system AFP-CREATE-PROOF-SYSTEM-GROUP
```

**Test:**
```bash
# Create task group README
scripts/readme_init.sh state/task_groups/proof-system AFP-TEST-001

# Verify directory exists
test -d state/task_groups/proof-system

# Verify README exists
test -f state/task_groups/proof-system/README.md

# Verify YAML frontmatter is parsable
python3 -c "
import yaml
with open('state/task_groups/proof-system/README.md') as f:
    content = f.read()
    parts = content.split('---')
    frontmatter = yaml.safe_load(parts[1])
    assert frontmatter['type'] == 'task_group_readme'
    assert frontmatter['group_id'] == 'proof-system'
"

# Verify all required sections present
grep -q "## Purpose" state/task_groups/proof-system/README.md
grep -q "## Recent Changes" state/task_groups/proof-system/README.md
grep -q "## Tasks" state/task_groups/proof-system/README.md
grep -q "## Shared Context" state/task_groups/proof-system/README.md
grep -q "## Execution Order" state/task_groups/proof-system/README.md
grep -q "## Group-Level Testing" state/task_groups/proof-system/README.md
grep -q "## Navigation" state/task_groups/proof-system/README.md
```

### FR4: Template Selection Logic

**Requirement:** `scripts/readme_init.sh` SHALL automatically select the appropriate template based on directory path

**Acceptance Criteria:**
- Path `state/epics/*` → Use `docs/templates/epic_readme_template.md`
- Path `state/milestones/*` → Use `docs/templates/milestone_readme_template.md`
- Path `state/task_groups/*` → Use `docs/templates/task_group_readme_template.md`
- All other paths → Use `docs/templates/readme_template.md` (default)

**Implementation:**
```bash
# In scripts/readme_init.sh
DIRECTORY="$1"
TASK_ID="${2:-$(detect_current_task)}"

# Detect template based on path
if [[ "$DIRECTORY" =~ ^state/epics/ ]]; then
  TEMPLATE="docs/templates/epic_readme_template.md"
  TYPE="epic"
elif [[ "$DIRECTORY" =~ ^state/milestones/ ]]; then
  TEMPLATE="docs/templates/milestone_readme_template.md"
  TYPE="milestone"
elif [[ "$DIRECTORY" =~ ^state/task_groups/ ]]; then
  TEMPLATE="docs/templates/task_group_readme_template.md"
  TYPE="task_group"
else
  TEMPLATE="docs/templates/readme_template.md"
  TYPE="directory"
fi

# Extract ID from path
if [[ "$TYPE" == "epic" ]]; then
  ID=$(basename "$DIRECTORY")
  EPIC_ID="$ID"
elif [[ "$TYPE" == "milestone" ]]; then
  ID=$(basename "$DIRECTORY")
  MILESTONE_ID="$ID"
elif [[ "$TYPE" == "task_group" ]]; then
  ID=$(basename "$DIRECTORY")
  GROUP_ID="$ID"
fi
```

**Test:**
```bash
# Test epic template selection
TEMPLATE=$(scripts/readme_init.sh state/epics/TEST --dry-run | grep "Template:")
test "$TEMPLATE" == "Template: docs/templates/epic_readme_template.md"

# Test milestone template selection
TEMPLATE=$(scripts/readme_init.sh state/milestones/TEST --dry-run | grep "Template:")
test "$TEMPLATE" == "Template: docs/templates/milestone_readme_template.md"

# Test task group template selection
TEMPLATE=$(scripts/readme_init.sh state/task_groups/TEST --dry-run | grep "Template:")
test "$TEMPLATE" == "Template: docs/templates/task_group_readme_template.md"

# Test default template selection
TEMPLATE=$(scripts/readme_init.sh apps/api --dry-run | grep "Template:")
test "$TEMPLATE" == "Template: docs/templates/readme_template.md"
```

### FR5: Hierarchical README Validation

**Requirement:** `scripts/validate_roadmap_docs.sh` SHALL validate that all epics and milestones in roadmap.yaml have corresponding README directories

**Acceptance Criteria:**
- Parse roadmap.yaml to extract epic and milestone IDs
- Check that `state/epics/[EPIC-ID]/README.md` exists for each epic
- Check that `state/milestones/[MILESTONE-ID]/README.md` exists for each milestone
- Validate YAML frontmatter is parsable (using `validate_yaml_frontmatter` from readme_lib.sh)
- Validate required sections exist
- Exit code 0 if all valid, 1 if any missing/invalid
- Task groups are optional (not validated)

**Implementation:**
```bash
#!/usr/bin/env bash
# scripts/validate_roadmap_docs.sh

set -euo pipefail

source "$(dirname "$0")/readme_lib.sh"

ROADMAP="state/roadmap.yaml"

if [[ ! -f "$ROADMAP" ]]; then
  echo "❌ Roadmap not found: $ROADMAP"
  exit 1
fi

# Extract epic IDs
echo "🔍 Checking epics..."
EPIC_IDS=$(yq '.epics[].id' "$ROADMAP" 2>/dev/null || grep -A 1 "^epics:" "$ROADMAP" | grep "id:" | awk '{print $2}')

for epic_id in $EPIC_IDS; do
  epic_dir="state/epics/$epic_id"
  epic_readme="$epic_dir/README.md"

  if [[ ! -d "$epic_dir" ]]; then
    echo "❌ Missing epic directory: $epic_dir"
    exit 1
  fi

  if [[ ! -f "$epic_readme" ]]; then
    echo "❌ Missing epic README: $epic_readme"
    exit 1
  fi

  # Validate YAML frontmatter
  if ! validate_yaml_frontmatter "$epic_readme"; then
    echo "❌ Invalid YAML in $epic_readme"
    exit 1
  fi

  # Validate required sections
  if ! validate_readme_structure "$epic_readme"; then
    echo "❌ Invalid structure in $epic_readme"
    exit 1
  fi

  echo "✅ Epic $epic_id validated"
done

# Extract milestone IDs
echo "🔍 Checking milestones..."
MILESTONE_IDS=$(yq '.epics[].milestones[].id' "$ROADMAP" 2>/dev/null || grep "id:" "$ROADMAP" | grep -v "^epics:" | grep -v "epic_id" | awk '{print $2}')

for milestone_id in $MILESTONE_IDS; do
  milestone_dir="state/milestones/$milestone_id"
  milestone_readme="$milestone_dir/README.md"

  if [[ ! -d "$milestone_dir" ]]; then
    echo "❌ Missing milestone directory: $milestone_dir"
    exit 1
  fi

  if [[ ! -f "$milestone_readme" ]]; then
    echo "❌ Missing milestone README: $milestone_readme"
    exit 1
  fi

  # Validate YAML frontmatter
  if ! validate_yaml_frontmatter "$milestone_readme"; then
    echo "❌ Invalid YAML in $milestone_readme"
    exit 1
  fi

  # Validate required sections
  if ! validate_readme_structure "$milestone_readme"; then
    echo "❌ Invalid structure in $milestone_readme"
    exit 1
  fi

  echo "✅ Milestone $milestone_id validated"
done

echo "✅ All hierarchical documentation valid"
```

**Test:**
```bash
# With valid READMEs
scripts/validate_roadmap_docs.sh
test $? -eq 0

# With missing epic README
rm -rf state/epics/WAVE-0
scripts/validate_roadmap_docs.sh
test $? -eq 1

# With missing milestone README
rm -rf state/milestones/W0.M1
scripts/validate_roadmap_docs.sh
test $? -eq 1

# With invalid YAML frontmatter
echo "invalid yaml" > state/epics/WAVE-0/README.md
scripts/validate_roadmap_docs.sh
test $? -eq 1
```

## Non-Functional Requirements

### NFR1: Performance

**Requirement:** README initialization SHALL complete in <2 seconds per README

**Rationale:** Epic and milestone creation is rare (2-4 per quarter), so performance is not critical. However, should not block workflow.

**Test:**
```bash
time scripts/readme_init.sh state/epics/TEST AFP-TEST-001
# Expected: <2 seconds
```

### NFR2: Compatibility

**Requirement:** All scripts SHALL work on macOS and Linux without modification

**Rationale:** Team uses both macOS and Linux. Cross-platform compatibility is essential.

**Implementation:**
- Use POSIX-compliant bash
- Use `sed_inplace` helper (handles macOS vs Linux sed differences)
- Use `current_date` helper (handles macOS vs Linux date differences)
- Test on both platforms before committing

**Test:**
```bash
# On macOS
bash --version  # Should work on bash 3.2+
scripts/readme_init.sh state/epics/TEST AFP-TEST-001

# On Linux
bash --version  # Should work on bash 4.0+
scripts/readme_init.sh state/epics/TEST AFP-TEST-001
```

### NFR3: Machine Parsability

**Requirement:** All YAML frontmatter SHALL be parsable by Python's yaml.safe_load() and yq

**Rationale:** Future automation may need to read/modify READMEs programmatically

**Implementation:**
- Valid YAML syntax in frontmatter
- No special characters requiring escaping
- Consistent field types (strings, arrays)

**Test:**
```python
import yaml

# Test epic README
with open('state/epics/WAVE-0/README.md') as f:
    content = f.read()
    parts = content.split('---')
    frontmatter = yaml.safe_load(parts[1])

    assert isinstance(frontmatter['epic_id'], str)
    assert isinstance(frontmatter['milestones'], list)
    assert isinstance(frontmatter['status'], str)
    assert frontmatter['status'] in ['in-progress', 'blocked', 'done']
```

### NFR4: Idempotency

**Requirement:** Running `scripts/readme_init.sh` on existing README directory SHALL be safe (no data loss)

**Rationale:** Agents may run init command multiple times (e.g., at task start)

**Implementation:**
- Check if README exists before creating
- If exists, display summary and exit 0 (success)
- Never overwrite existing README

**Test:**
```bash
# Create README
scripts/readme_init.sh state/epics/TEST AFP-TEST-001

# Run again - should not overwrite
scripts/readme_init.sh state/epics/TEST AFP-TEST-002
test -f state/epics/TEST/README.md
grep -q "AFP-TEST-001" state/epics/TEST/README.md  # Original content preserved
```

### NFR5: Extensibility

**Requirement:** Directory structure SHALL support future additions without breaking existing READMEs

**Rationale:** May need to add artifacts to epic/milestone directories (diagrams, meeting notes, etc.)

**Implementation:**
- Use directory structure (not single file)
- README.md is primary document
- Future: can add epic-name-diagram.png, epic-name-notes.md, etc. to same directory

**Example Future Structure:**
```
state/epics/WAVE-0/
├── README.md           # Primary documentation
├── architecture.png    # Future: architecture diagram
├── meeting-notes.md    # Future: epic kickoff notes
└── decisions/          # Future: ADR-style decisions
```

## Success Criteria

### Measurable Success

1. **100% epic coverage**
   - Target: Every epic in roadmap.yaml has `state/epics/[EPIC-ID]/README.md`
   - Test: `scripts/validate_roadmap_docs.sh` passes

2. **100% milestone coverage**
   - Target: Every milestone in roadmap.yaml has `state/milestones/[MILESTONE-ID]/README.md`
   - Test: `scripts/validate_roadmap_docs.sh` passes

3. **Machine-parsable YAML frontmatter**
   - Target: All READMEs have valid YAML frontmatter parsable by Python and yq
   - Test: Python yaml.safe_load() succeeds on all frontmatter

4. **Required sections present**
   - Target: All READMEs have required sections (Purpose, Recent Changes, Navigation, etc.)
   - Test: Grep checks for section headers pass

5. **Validation integrated into pre-commit**
   - Target: Modifying roadmap.yaml triggers validation automatically
   - Test: Stage roadmap.yaml → commit → validation runs

### Observable Success

1. **Agents reference epic READMEs**
   - Target: 80%+ tasks include reference to `state/epics/[EPIC-ID]/README.md` in context.md
   - Measurement: Grep state/context.md for epic README references

2. **Faster onboarding**
   - Target: New agents onboard to epic in <10 min (vs 30+ min previously)
   - Measurement: Time from "start epic task" to "first meaningful contribution"

3. **Reduced "why" questions**
   - Target: 85% reduction in "why did we choose X?" questions
   - Measurement: Slack/discussion references to architecture decisions

### Qualitative Success

1. **Strategic focus maintained**
   - Epic READMEs answer "why" not "how"
   - Milestone READMEs answer "when" and "what integrates"
   - Task groups answer "which" and "what shared"

2. **No duplication**
   - Epic README: Strategic context
   - Milestone README: Tactical plan
   - Task evidence: Execution proof
   - No overlap between levels

3. **Consistency with directory pattern**
   - Same YAML frontmatter structure
   - Same template variable system
   - Same init/update workflow
   - Familiar pattern for agents

## Dependencies

### Existing Infrastructure (Must Exist)

1. **AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106** (COMPLETE)
   - `docs/templates/readme_template.md`
   - `scripts/readme_lib.sh`
   - `scripts/readme_init.sh`
   - `scripts/readme_update.sh`

2. **Roadmap Structure**
   - `state/roadmap.yaml` with epics and milestones defined

3. **Pre-Commit Hook**
   - `.git/hooks/pre-commit` for validation

### New Components (To Be Created)

1. **Templates**
   - `docs/templates/epic_readme_template.md`
   - `docs/templates/milestone_readme_template.md`
   - `docs/templates/task_group_readme_template.md`

2. **Validation Script**
   - `scripts/validate_roadmap_docs.sh`

3. **Documentation**
   - Update `MANDATORY_WORK_CHECKLIST.md`
   - Update `docs/workflows/README_SYNC.md`

## Out of Scope

The following are explicitly OUT OF SCOPE for this task:

1. **Roadmap.yaml modification** - No changes to roadmap structure
2. **Docsync integration** - Docsync handles code directories, not hierarchy
3. **Automated epic creation** - Epics are manually created (rare)
4. **Task group enforcement** - Task groups are optional, not enforced
5. **Historical migration** - Only new epics/milestones get READMEs (backfill is future task)

## Risk Analysis

### Risk 1: Validation Blocks Legitimate Commits

**Scenario:** Agent modifies roadmap.yaml to add epic, but forgets to create README, commit blocked

**Mitigation:**
- Validation script provides clear error message with exact command to run
- MANDATORY_WORK_CHECKLIST.md documents workflow
- Error message includes: "Run: scripts/readme_init.sh state/epics/[EPIC-ID] [TASK-ID]"

### Risk 2: YAML Parsing Fails

**Scenario:** yq not installed on system, validation script fails

**Mitigation:**
- Fallback to grep/awk if yq not available
- Validation script checks for yq, uses grep as backup
- Both methods tested

### Risk 3: Template Quality

**Scenario:** Templates have poor examples, agents write low-quality docs

**Mitigation:**
- Templates include good vs bad examples
- Templates have prompts for each section
- Self-improvement system audits doc quality quarterly

---

**SPEC Phase Complete**

**Estimated LOC:** ~150 (3 templates ~60 LOC, validation script ~50 LOC, script modifications ~30 LOC, docs ~10 LOC)

**Next Phase:** PLAN (implementation design)
