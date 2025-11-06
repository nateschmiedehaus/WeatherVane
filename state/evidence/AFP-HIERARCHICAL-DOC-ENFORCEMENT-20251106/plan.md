# Plan: Hierarchical Documentation Enforcement

**Task ID:** AFP-HIERARCHICAL-DOC-ENFORCEMENT-20251106
**Phase:** PLAN
**Date:** 2025-11-06

## Implementation Approach

**Strategy:** Extend existing directory README automation to support hierarchical templates (epic, milestone, task group). Reuse 95% of existing code, add 3 templates + template selection logic + validation script.

**Core Principle:** Minimal new code, maximum pattern reuse

## Files to Create/Modify

### New Files (3 templates + 1 validation script)

#### 1. `docs/templates/epic_readme_template.md` (~60 LOC)

**Purpose:** Template for epic-level strategic documentation

**Content Structure:**
```markdown
---
type: "epic_readme"
epic_id: "{{EPIC_ID}}"
status: "in-progress"
last_updated: "{{CURRENT_DATE}}"
owner: "Director Dana"
domain: "{{DOMAIN}}"
milestones: []
dependencies: []
---

# Epic: {{EPIC_ID}} - {{EPIC_NAME}}

**Status:** In Progress
**Last Updated:** {{CURRENT_DATE}}
**Owner:** Director Dana

## Purpose

<!-- WHY does this epic exist? WHAT problem does it solve at strategic level? -->
[TODO: Describe the strategic goal in 2-3 sentences]

**Example (good):**
> Stabilize autopilot foundation to enable autonomous self-improvement. Addresses
> fragility in proof validation and lack of continuous improvement loops. Target:
> <4 week path to full autonomy.

**Example (bad):**
> This epic is important work.

## Recent Changes

### {{TASK_ID}} - Initial epic README setup
- Files: README.md
- Impact: low
- Date: {{CURRENT_DATE}}
- See: state/evidence/{{TASK_ID}}/

## Success Criteria

<!-- WHAT does "done" mean for this epic? -->
[TODO: List 3-5 measurable criteria]

**Example:**
- Autopilot can self-improve (create + execute improvement tasks)
- Proof system validates all changes (100% coverage)
- Wave 0 runs autonomously for 1 week without failures

## Architecture Decisions

<!-- High-level technical choices that affect all milestones -->
[TODO: List 2-4 key architectural decisions]

**Example:**
1. **Proof System:** Three layers (structural, critic, production feedback)
2. **Self-Improvement:** 30-day cadence, max 3 concurrent improvements
3. **Integration:** Wave 0 integrated with proof validation at task boundaries

## Milestones

[TODO: List milestones with status and links]

- **M1** - [Milestone Title]
  - Status: in_progress
  - See: [state/milestones/M1/README.md](../../milestones/M1/README.md)

## Dependencies

<!-- Other epics that must complete first -->
[TODO: List epic dependencies]

**Example:**
- None (foundational epic)

## Risks

<!-- Epic-level risks and mitigation strategies -->
[TODO: List 2-3 key risks with mitigations]

**Example:**
1. **Risk:** Proof system too complex, slows development
   - **Mitigation:** Phase rollout (structural → critic → production feedback)
2. **Risk:** Self-improvement creates infinite loops
   - **Mitigation:** Max 3 per cycle, loop detection, human approval for risky changes

## Navigation

- **Milestones:** [M1](../../milestones/M1/README.md)
- **Roadmap:** [state/roadmap.yaml](../../roadmap.yaml)

---

⚠️ **AUTOMATION NOTICE**

This README is partially automated:
- **"Recent Changes"** section is auto-managed by `scripts/readme_update.sh`
- **YAML frontmatter** is machine-parsable (do not remove)
- **Required sections** must not be deleted (breaks validation)

Safe to edit: Purpose, Success Criteria, Architecture Decisions, Milestones, Dependencies, Risks
```

**Variables to Replace:**
- `{{EPIC_ID}}` - Epic identifier (e.g., "WAVE-0")
- `{{EPIC_NAME}}` - Epic title (e.g., "Wave 0 Foundation Stabilisation")
- `{{CURRENT_DATE}}` - Today's date (YYYY-MM-DD)
- `{{TASK_ID}}` - Task creating this README
- `{{DOMAIN}}` - Epic domain ("mcp" or "product")

**LOC Estimate:** 60 lines

#### 2. `docs/templates/milestone_readme_template.md` (~60 LOC)

**Purpose:** Template for milestone-level tactical planning

**Content Structure:**
```markdown
---
type: "milestone_readme"
milestone_id: "{{MILESTONE_ID}}"
epic_id: "{{EPIC_ID}}"
status: "in-progress"
last_updated: "{{CURRENT_DATE}}"
owner: "Atlas"
tasks: []
---

# Milestone: {{MILESTONE_ID}} - {{MILESTONE_NAME}}

**Status:** In Progress
**Last Updated:** {{CURRENT_DATE}}
**Owner:** Atlas

## Purpose

<!-- WHAT capability is delivered after this milestone completes? -->
[TODO: Describe the capability in 2-3 sentences]

**Example (good):**
> Autopilot can autonomously select, execute, and verify tasks from the roadmap
> without human intervention. Implements task lifecycle (select → assign → execute
> → verify → monitor) with evidence capture.

**Example (bad):**
> Complete the milestone tasks.

## Recent Changes

### {{TASK_ID}} - Initial milestone README setup
- Files: README.md
- Impact: low
- Date: {{CURRENT_DATE}}
- See: state/evidence/{{TASK_ID}}/

## Phase Plan

<!-- Timeline, sequencing, integration points -->
[TODO: Describe the execution plan]

**Example:**
1. **Week 1:** Scaffold supervisor + agents
2. **Week 2:** Wire task lifecycle + telemetry
3. **Week 3:** Integration with Wave 0
4. **Week 4:** Testing + refinement

## Tasks

[TODO: List tasks with status and links]

- **TASK-001** - [Task Title]
  - Status: done
  - See: [state/evidence/TASK-001/](../../evidence/TASK-001/)

## Integration Requirements

<!-- How does this milestone integrate with others? -->
[TODO: Describe integration points]

**Example:**
- **M1 → M2:** Supervisor API contracts stable (no breaking changes)
- **M1 → M3:** Task lifecycle telemetry format agreed

## Acceptance Criteria

<!-- How do we know milestone is truly complete? -->
[TODO: List 3-5 measurable criteria]

**Example:**
- Wave 0 picks up and executes 10 consecutive tasks
- All lifecycle events emitted to telemetry
- Zero manual interventions during 48-hour test

## Navigation

- **Epic:** [{{EPIC_ID}}](../../epics/{{EPIC_ID}}/README.md)
- **Tasks:** [Evidence bundles](../../evidence/)
- **Roadmap:** [state/roadmap.yaml](../../roadmap.yaml)

---

⚠️ **AUTOMATION NOTICE**

This README is partially automated. Safe to edit all sections except:
- YAML frontmatter (machine-parsable, do not remove)
- "Recent Changes" section (auto-managed by `scripts/readme_update.sh`)
```

**Variables to Replace:**
- `{{MILESTONE_ID}}` - Milestone identifier (e.g., "W0.M1")
- `{{MILESTONE_NAME}}` - Milestone title
- `{{EPIC_ID}}` - Parent epic identifier
- `{{CURRENT_DATE}}` - Today's date
- `{{TASK_ID}}` - Task creating this README

**LOC Estimate:** 60 lines

#### 3. `docs/templates/task_group_readme_template.md` (~50 LOC)

**Purpose:** Template for task group shared context

**Content Structure:**
```markdown
---
type: "task_group_readme"
group_id: "{{GROUP_ID}}"
status: "in-progress"
last_updated: "{{CURRENT_DATE}}"
owner: "WeatherVane Autopilot"
tasks: []
milestone_id: "{{MILESTONE_ID}}"
---

# Task Group: {{GROUP_ID}} - {{GROUP_NAME}}

**Status:** In Progress
**Last Updated:** {{CURRENT_DATE}}
**Owner:** WeatherVane Autopilot

## Purpose

<!-- WHY are these tasks grouped together? -->
[TODO: Explain the grouping rationale in 1-2 sentences]

**Example:**
> Implements 3-layer proof system for code quality enforcement. Tasks are grouped
> because they share testing infrastructure and validation contracts.

## Recent Changes

### {{TASK_ID}} - Initial task group README setup
- Files: README.md
- Impact: low
- Date: {{CURRENT_DATE}}
- See: state/evidence/{{TASK_ID}}/

## Tasks

[TODO: List tasks with status]

- **TASK-001** - [Task Title] (done)
- **TASK-002** - [Task Title] (in-progress)
- **TASK-003** - [Task Title] (pending)

## Shared Context

<!-- WHAT context do all these tasks share? -->
[TODO: Describe shared dependencies, codebase area, integration points]

**Example:**
- **Codebase:** All tasks modify `tools/wvo_mcp/src/orchestrator/`
- **Dependencies:** All depend on `critics_runner.ts` infrastructure
- **Integration:** All integrate with pre-commit hook validation

## Execution Order

<!-- Dependencies within the group -->
[TODO: Describe task dependencies if any]

**Example:**
1. TASK-001 (structural proofs) - No dependencies
2. TASK-002 (critic proofs) - Depends on TASK-001
3. TASK-003 (production feedback) - Depends on TASK-002

## Group-Level Testing

<!-- Integration tests spanning multiple tasks -->
[TODO: Describe how to test the group as a whole]

**Example:**
```bash
# Run full proof system integration test
cd tools/wvo_mcp && npm test -- proof_system.integration.test.ts
```

## Navigation

- **Milestone:** [{{MILESTONE_ID}}](../../milestones/{{MILESTONE_ID}}/README.md)
- **Tasks:** [Evidence bundles](../../evidence/)

---

⚠️ **AUTOMATION NOTICE**

This README is partially automated. Safe to edit all sections except YAML frontmatter and "Recent Changes".
```

**Variables to Replace:**
- `{{GROUP_ID}}` - Group identifier (e.g., "proof-system")
- `{{GROUP_NAME}}` - Group title
- `{{CURRENT_DATE}}` - Today's date
- `{{TASK_ID}}` - Task creating this README
- `{{MILESTONE_ID}}` - Parent milestone (optional)

**LOC Estimate:** 50 lines

#### 4. `scripts/validate_roadmap_docs.sh` (~80 LOC)

**Purpose:** Validate that all epics/milestones in roadmap.yaml have READMEs

**Implementation:**

```bash
#!/usr/bin/env bash
# Validate hierarchical documentation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/readme_lib.sh"

ROADMAP="${ROADMAP:-state/roadmap.yaml}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_error() {
  echo -e "${RED}❌ $1${NC}" >&2
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_info() {
  echo -e "${YELLOW}🔍 $1${NC}"
}

# Check roadmap exists
if [[ ! -f "$ROADMAP" ]]; then
  log_error "Roadmap not found: $ROADMAP"
  exit 1
fi

# Check for yq or fallback to grep/awk
if command -v yq >/dev/null 2>&1; then
  EPIC_IDS=$(yq '.epics[].id' "$ROADMAP" 2>/dev/null)
  MILESTONE_IDS=$(yq '.epics[].milestones[].id' "$ROADMAP" 2>/dev/null)
else
  # Fallback to grep/awk
  log_info "yq not found, using grep fallback"
  EPIC_IDS=$(grep -A 2 "^epics:" "$ROADMAP" | grep "id:" | grep -v "epic_id" | awk '{print $2}' | sort -u)
  MILESTONE_IDS=$(grep "id:" "$ROADMAP" | grep -v "^epics:" | grep -v "epic_id:" | grep -v "milestone_id:" | awk '{print $2}' | grep -E "^[A-Z0-9]" | sort -u)
fi

ERRORS=0

# Validate epics
log_info "Validating epics..."

for epic_id in $EPIC_IDS; do
  epic_dir="state/epics/$epic_id"
  epic_readme="$epic_dir/README.md"

  if [[ ! -d "$epic_dir" ]]; then
    log_error "Missing epic directory: $epic_dir"
    echo "  → Run: scripts/readme_init.sh $epic_dir [TASK-ID]"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  if [[ ! -f "$epic_readme" ]]; then
    log_error "Missing epic README: $epic_readme"
    echo "  → Run: scripts/readme_init.sh $epic_dir [TASK-ID]"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Validate YAML frontmatter
  if ! validate_yaml_frontmatter "$epic_readme" 2>/dev/null; then
    log_error "Invalid YAML in $epic_readme"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Validate required sections
  if ! validate_readme_structure "$epic_readme" 2>/dev/null; then
    log_error "Invalid structure in $epic_readme"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  log_success "Epic $epic_id"
done

# Validate milestones
log_info "Validating milestones..."

for milestone_id in $MILESTONE_IDS; do
  milestone_dir="state/milestones/$milestone_id"
  milestone_readme="$milestone_dir/README.md"

  if [[ ! -d "$milestone_dir" ]]; then
    log_error "Missing milestone directory: $milestone_dir"
    echo "  → Run: scripts/readme_init.sh $milestone_dir [TASK-ID]"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  if [[ ! -f "$milestone_readme" ]]; then
    log_error "Missing milestone README: $milestone_readme"
    echo "  → Run: scripts/readme_init.sh $milestone_dir [TASK-ID]"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Validate YAML frontmatter
  if ! validate_yaml_frontmatter "$milestone_readme" 2>/dev/null; then
    log_error "Invalid YAML in $milestone_readme"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Validate required sections
  if ! validate_readme_structure "$milestone_readme" 2>/dev/null; then
    log_error "Invalid structure in $milestone_readme"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  log_success "Milestone $milestone_id"
done

# Summary
echo ""
if [[ $ERRORS -eq 0 ]]; then
  log_success "All hierarchical documentation valid"
  exit 0
else
  log_error "$ERRORS validation error(s) found"
  exit 1
fi
```

**LOC Estimate:** 80 lines

### Modified Files (2 files, minimal changes)

#### 5. `scripts/readme_init.sh` (+15 LOC for template selection)

**Change:** Add template selection logic based on directory path

**Implementation:**

```bash
# BEFORE (line ~10):
TEMPLATE="${TEMPLATE:-docs/templates/readme_template.md}"

# AFTER (replace above with):
# Detect template based on directory path
if [[ "$DIRECTORY" =~ ^state/epics/ ]]; then
  TEMPLATE="docs/templates/epic_readme_template.md"
  TYPE="epic"
  ID=$(basename "$DIRECTORY")
  EPIC_ID="$ID"
  # Extract epic name from roadmap.yaml if available
  if [[ -f "state/roadmap.yaml" ]] && command -v yq >/dev/null 2>&1; then
    EPIC_NAME=$(yq ".epics[] | select(.id == \"$EPIC_ID\") | .title" state/roadmap.yaml 2>/dev/null || echo "Epic Title")
  else
    EPIC_NAME="Epic Title"
  fi
  DOMAIN=$(yq ".epics[] | select(.id == \"$EPIC_ID\") | .domain" state/roadmap.yaml 2>/dev/null || echo "mcp")

elif [[ "$DIRECTORY" =~ ^state/milestones/ ]]; then
  TEMPLATE="docs/templates/milestone_readme_template.md"
  TYPE="milestone"
  ID=$(basename "$DIRECTORY")
  MILESTONE_ID="$ID"
  # Extract milestone name and epic from roadmap.yaml
  if [[ -f "state/roadmap.yaml" ]] && command -v yq >/dev/null 2>&1; then
    MILESTONE_NAME=$(yq ".epics[].milestones[] | select(.id == \"$MILESTONE_ID\") | .title" state/roadmap.yaml 2>/dev/null || echo "Milestone Title")
    EPIC_ID=$(yq ".epics[] | select(.milestones[].id == \"$MILESTONE_ID\") | .id" state/roadmap.yaml 2>/dev/null || echo "EPIC-ID")
  else
    MILESTONE_NAME="Milestone Title"
    EPIC_ID="EPIC-ID"
  fi

elif [[ "$DIRECTORY" =~ ^state/task_groups/ ]]; then
  TEMPLATE="docs/templates/task_group_readme_template.md"
  TYPE="task_group"
  ID=$(basename "$DIRECTORY")
  GROUP_ID="$ID"
  GROUP_NAME=$(echo "$GROUP_ID" | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2));}1')
  MILESTONE_ID="MILESTONE-ID"  # Placeholder, user fills in

else
  TEMPLATE="docs/templates/readme_template.md"
  TYPE="directory"
fi

# Additional variable replacements for hierarchical templates
if [[ "$TYPE" == "epic" ]]; then
  # Replace {{EPIC_ID}}, {{EPIC_NAME}}, {{DOMAIN}}
  sed -i.bak \
    -e "s|{{EPIC_ID}}|$EPIC_ID|g" \
    -e "s|{{EPIC_NAME}}|$EPIC_NAME|g" \
    -e "s|{{DOMAIN}}|$DOMAIN|g" \
    "$DIRECTORY/README.md"
elif [[ "$TYPE" == "milestone" ]]; then
  # Replace {{MILESTONE_ID}}, {{MILESTONE_NAME}}, {{EPIC_ID}}
  sed -i.bak \
    -e "s|{{MILESTONE_ID}}|$MILESTONE_ID|g" \
    -e "s|{{MILESTONE_NAME}}|$MILESTONE_NAME|g" \
    -e "s|{{EPIC_ID}}|$EPIC_ID|g" \
    "$DIRECTORY/README.md"
elif [[ "$TYPE" == "task_group" ]]; then
  # Replace {{GROUP_ID}}, {{GROUP_NAME}}, {{MILESTONE_ID}}
  sed -i.bak \
    -e "s|{{GROUP_ID}}|$GROUP_ID|g" \
    -e "s|{{GROUP_NAME}}|$GROUP_NAME|g" \
    -e "s|{{MILESTONE_ID}}|$MILESTONE_ID|g" \
    "$DIRECTORY/README.md"
fi
```

**LOC Change:** +15 lines (conditional template selection + variable replacement)

#### 6. `MANDATORY_WORK_CHECKLIST.md` (+30 LOC)

**Change:** Add "Hierarchical README Workflow" section

**Implementation:**

```markdown
## Hierarchical README Workflow

### When Creating New Epic

**Action:** Initialize epic README before starting epic work

```bash
scripts/readme_init.sh state/epics/[EPIC-ID] [TASK-ID]
# Example: scripts/readme_init.sh state/epics/WAVE-1 AFP-CREATE-WAVE-1
```

**Checklist:**
- [ ] I ran `scripts/readme_init.sh state/epics/[EPIC-ID] [TASK-ID]`
- [ ] I edited the Purpose section (WHY this epic exists)
- [ ] I listed Success Criteria (3-5 measurable)
- [ ] I documented Architecture Decisions (2-4 key choices)
- [ ] I listed Risks with mitigations
- [ ] I staged `state/epics/[EPIC-ID]/README.md` for commit

### When Creating New Milestone

**Action:** Initialize milestone README before starting milestone work

```bash
scripts/readme_init.sh state/milestones/[MILESTONE-ID] [TASK-ID]
# Example: scripts/readme_init.sh state/milestones/W1.M1 AFP-CREATE-W1-M1
```

**Checklist:**
- [ ] I ran `scripts/readme_init.sh state/milestones/[MILESTONE-ID] [TASK-ID]`
- [ ] I edited the Purpose section (WHAT capability is delivered)
- [ ] I documented Phase Plan (timeline, sequencing)
- [ ] I listed Integration Requirements
- [ ] I listed Acceptance Criteria (3-5 measurable)
- [ ] I staged `state/milestones/[MILESTONE-ID]/README.md` for commit

### When Creating Task Group (Optional)

**Action:** Initialize task group README for related tasks

```bash
scripts/readme_init.sh state/task_groups/[GROUP-ID] [TASK-ID]
# Example: scripts/readme_init.sh state/task_groups/proof-system AFP-PROOF-GROUP
```

**Checklist:**
- [ ] I ran `scripts/readme_init.sh state/task_groups/[GROUP-ID] [TASK-ID]`
- [ ] I edited the Purpose section (WHY tasks are grouped)
- [ ] I listed all Tasks in the group
- [ ] I documented Shared Context
- [ ] I described Execution Order (if dependencies exist)
- [ ] I staged `state/task_groups/[GROUP-ID]/README.md` for commit
```

**LOC Change:** +30 lines

## Total LOC Estimate

| File | Type | LOC | Notes |
|------|------|-----|-------|
| `docs/templates/epic_readme_template.md` | New | 60 | Epic template |
| `docs/templates/milestone_readme_template.md` | New | 60 | Milestone template |
| `docs/templates/task_group_readme_template.md` | New | 50 | Task group template |
| `scripts/validate_roadmap_docs.sh` | New | 80 | Validation script |
| `scripts/readme_init.sh` | Modified | +15 | Template selection |
| `MANDATORY_WORK_CHECKLIST.md` | Modified | +30 | Workflow docs |
| **Total** | **4 new, 2 modified** | **295** | **Within estimate (~150-300)** |

## Implementation Plan

### Step 1: Create Templates (60 + 60 + 50 = 170 LOC)

1. Copy `docs/templates/readme_template.md` to `epic_readme_template.md`
2. Modify for epic-specific sections (Purpose, Success Criteria, Architecture Decisions, Risks)
3. Add examples of good vs bad documentation
4. Add epic-specific variables (`{{EPIC_ID}}`, `{{EPIC_NAME}}`, `{{DOMAIN}}`)
5. Repeat for milestone and task group templates

**Estimated Time:** 30 min (mostly adapting existing template)

### Step 2: Modify readme_init.sh (+15 LOC)

1. Add template selection logic (if/elif chain based on path regex)
2. Extract epic/milestone metadata from roadmap.yaml (if yq available)
3. Add variable replacements for hierarchical-specific fields
4. Test with all 4 template types

**Estimated Time:** 15 min

### Step 3: Create Validation Script (80 LOC)

1. Source `readme_lib.sh` for existing helpers
2. Parse roadmap.yaml to extract epic/milestone IDs (with yq or grep fallback)
3. Check each epic/milestone has README directory
4. Validate YAML frontmatter (reuse `validate_yaml_frontmatter`)
5. Validate structure (reuse `validate_readme_structure`)
6. Provide helpful error messages with fix commands
7. Make executable: `chmod +x scripts/validate_roadmap_docs.sh`

**Estimated Time:** 25 min

### Step 4: Update Documentation (+30 LOC)

1. Add "Hierarchical README Workflow" section to `MANDATORY_WORK_CHECKLIST.md`
2. Document epic creation workflow
3. Document milestone creation workflow
4. Document task group creation workflow (optional)
5. Provide command examples

**Estimated Time:** 10 min

### Step 5: Initialize WAVE-0 Example

1. Create `state/epics/WAVE-0/` directory
2. Run `scripts/readme_init.sh state/epics/WAVE-0 AFP-HIERARCHICAL-DOC-ENFORCEMENT-20251106`
3. Fill in Purpose, Success Criteria, Architecture Decisions manually
4. Create `state/milestones/W0.M1/` directory
5. Run `scripts/readme_init.sh state/milestones/W0.M1 AFP-HIERARCHICAL-DOC-ENFORCEMENT-20251106`
6. Fill in Purpose, Phase Plan, Acceptance Criteria manually

**Estimated Time:** 20 min

**Total Implementation Time:** ~100 min (1.5-2 hours)

## Tests Designed BEFORE Implementation

**CRITICAL:** Following user requirement to design tests BEFORE implementation

### Test 1: Epic README Initialization

**Purpose:** Verify epic README can be created from template

**Prerequisites:**
- Templates created
- Script modifications complete

**Test Steps:**
```bash
# Clean slate
rm -rf state/epics/TEST-EPIC

# Initialize epic README
scripts/readme_init.sh state/epics/TEST-EPIC AFP-TEST-001

# Verify directory created
test -d state/epics/TEST-EPIC || {
  echo "FAIL: Epic directory not created"
  exit 1
}

# Verify README created
test -f state/epics/TEST-EPIC/README.md || {
  echo "FAIL: Epic README not created"
  exit 1
}

# Verify YAML frontmatter
python3 -c "
import yaml
with open('state/epics/TEST-EPIC/README.md') as f:
    content = f.read()
    parts = content.split('---')
    if len(parts) < 3:
        print('FAIL: YAML frontmatter not found')
        exit(1)
    frontmatter = yaml.safe_load(parts[1])
    assert frontmatter['type'] == 'epic_readme', f\"Expected epic_readme, got {frontmatter['type']}\"
    assert frontmatter['epic_id'] == 'TEST-EPIC', f\"Expected TEST-EPIC, got {frontmatter['epic_id']}\"
    print('PASS: YAML frontmatter valid')
"

# Verify required sections exist
for section in "Purpose" "Recent Changes" "Success Criteria" "Architecture Decisions" "Milestones" "Dependencies" "Risks" "Navigation"; do
  if ! grep -q "## $section" state/epics/TEST-EPIC/README.md; then
    echo "FAIL: Missing section: $section"
    exit 1
  fi
done

echo "✅ Test 1 PASS: Epic README initialization"
```

**Expected Outcome:** Epic README created with valid YAML and all required sections

**Cleanup:**
```bash
rm -rf state/epics/TEST-EPIC
```

### Test 2: Milestone README Initialization

**Purpose:** Verify milestone README can be created from template

**Test Steps:**
```bash
# Clean slate
rm -rf state/milestones/TEST-M1

# Initialize milestone README
scripts/readme_init.sh state/milestones/TEST-M1 AFP-TEST-002

# Verify directory created
test -d state/milestones/TEST-M1 || {
  echo "FAIL: Milestone directory not created"
  exit 1
}

# Verify README created
test -f state/milestones/TEST-M1/README.md || {
  echo "FAIL: Milestone README not created"
  exit 1
}

# Verify YAML frontmatter
python3 -c "
import yaml
with open('state/milestones/TEST-M1/README.md') as f:
    content = f.read()
    parts = content.split('---')
    frontmatter = yaml.safe_load(parts[1])
    assert frontmatter['type'] == 'milestone_readme'
    assert frontmatter['milestone_id'] == 'TEST-M1'
    print('PASS: YAML frontmatter valid')
"

# Verify required sections
for section in "Purpose" "Recent Changes" "Phase Plan" "Tasks" "Integration Requirements" "Acceptance Criteria" "Navigation"; do
  if ! grep -q "## $section" state/milestones/TEST-M1/README.md; then
    echo "FAIL: Missing section: $section"
    exit 1
  fi
done

echo "✅ Test 2 PASS: Milestone README initialization"
```

**Expected Outcome:** Milestone README created with valid YAML and all required sections

**Cleanup:**
```bash
rm -rf state/milestones/TEST-M1
```

### Test 3: Task Group README Initialization

**Purpose:** Verify task group README can be created from template

**Test Steps:**
```bash
# Clean slate
rm -rf state/task_groups/test-group

# Initialize task group README
scripts/readme_init.sh state/task_groups/test-group AFP-TEST-003

# Verify directory created
test -d state/task_groups/test-group || {
  echo "FAIL: Task group directory not created"
  exit 1
}

# Verify README created
test -f state/task_groups/test-group/README.md || {
  echo "FAIL: Task group README not created"
  exit 1
}

# Verify YAML frontmatter
python3 -c "
import yaml
with open('state/task_groups/test-group/README.md') as f:
    content = f.read()
    parts = content.split('---')
    frontmatter = yaml.safe_load(parts[1])
    assert frontmatter['type'] == 'task_group_readme'
    assert frontmatter['group_id'] == 'test-group'
    print('PASS: YAML frontmatter valid')
"

# Verify required sections
for section in "Purpose" "Recent Changes" "Tasks" "Shared Context" "Execution Order" "Group-Level Testing" "Navigation"; do
  if ! grep -q "## $section" state/task_groups/test-group/README.md; then
    echo "FAIL: Missing section: $section"
    exit 1
  fi
done

echo "✅ Test 3 PASS: Task group README initialization"
```

**Expected Outcome:** Task group README created with valid YAML and all required sections

**Cleanup:**
```bash
rm -rf state/task_groups/test-group
```

### Test 4: Template Selection Logic

**Purpose:** Verify scripts/readme_init.sh selects correct template based on path

**Test Steps:**
```bash
# Test epic path detection
rm -rf state/epics/TEST-EPIC
scripts/readme_init.sh state/epics/TEST-EPIC AFP-TEST-004
grep -q "type: \"epic_readme\"" state/epics/TEST-EPIC/README.md || {
  echo "FAIL: Epic template not selected for state/epics/ path"
  exit 1
}

# Test milestone path detection
rm -rf state/milestones/TEST-M1
scripts/readme_init.sh state/milestones/TEST-M1 AFP-TEST-004
grep -q "type: \"milestone_readme\"" state/milestones/TEST-M1/README.md || {
  echo "FAIL: Milestone template not selected for state/milestones/ path"
  exit 1
}

# Test task group path detection
rm -rf state/task_groups/test-group
scripts/readme_init.sh state/task_groups/test-group AFP-TEST-004
grep -q "type: \"task_group_readme\"" state/task_groups/test-group/README.md || {
  echo "FAIL: Task group template not selected for state/task_groups/ path"
  exit 1
}

# Test default template for other paths
rm -rf test_dir_default
scripts/readme_init.sh test_dir_default AFP-TEST-004
grep -q "type: \"directory_readme\"" test_dir_default/README.md || {
  echo "FAIL: Default template not selected for other paths"
  exit 1
}

echo "✅ Test 4 PASS: Template selection logic"
```

**Expected Outcome:** Correct template selected based on directory path

**Cleanup:**
```bash
rm -rf state/epics/TEST-EPIC state/milestones/TEST-M1 state/task_groups/test-group test_dir_default
```

### Test 5: Validation Script - All Valid

**Purpose:** Verify validation passes when all epics/milestones have READMEs

**Prerequisites:**
- Real roadmap.yaml with epics and milestones
- All corresponding READMEs exist

**Test Steps:**
```bash
# Create READMEs for all epics in roadmap
for epic_id in $(yq '.epics[].id' state/roadmap.yaml 2>/dev/null || grep -A 1 "^epics:" state/roadmap.yaml | grep "id:" | awk '{print $2}'); do
  if [[ ! -f "state/epics/$epic_id/README.md" ]]; then
    scripts/readme_init.sh "state/epics/$epic_id" AFP-TEST-005
  fi
done

# Create READMEs for all milestones in roadmap
for milestone_id in $(yq '.epics[].milestones[].id' state/roadmap.yaml 2>/dev/null || grep "id:" state/roadmap.yaml | grep -v "^epics:" | awk '{print $2}' | grep -E "^W"); do
  if [[ ! -f "state/milestones/$milestone_id/README.md" ]]; then
    scripts/readme_init.sh "state/milestones/$milestone_id" AFP-TEST-005
  fi
done

# Run validation
scripts/validate_roadmap_docs.sh

if [[ $? -ne 0 ]]; then
  echo "FAIL: Validation failed when all READMEs present"
  exit 1
fi

echo "✅ Test 5 PASS: Validation script - all valid"
```

**Expected Outcome:** Validation exits 0, no errors

### Test 6: Validation Script - Missing Epic README

**Purpose:** Verify validation fails when epic README missing

**Test Steps:**
```bash
# Create test epic in roadmap.yaml (simulate)
# For testing, temporarily remove one epic README
FIRST_EPIC=$(yq '.epics[0].id' state/roadmap.yaml)
mv "state/epics/$FIRST_EPIC/README.md" "state/epics/$FIRST_EPIC/README.md.backup"

# Run validation - should fail
scripts/validate_roadmap_docs.sh

if [[ $? -eq 0 ]]; then
  echo "FAIL: Validation passed when epic README missing"
  mv "state/epics/$FIRST_EPIC/README.md.backup" "state/epics/$FIRST_EPIC/README.md"
  exit 1
fi

# Check error message suggests fix
scripts/validate_roadmap_docs.sh 2>&1 | grep -q "scripts/readme_init.sh" || {
  echo "FAIL: Error message doesn't suggest fix command"
  mv "state/epics/$FIRST_EPIC/README.md.backup" "state/epics/$FIRST_EPIC/README.md"
  exit 1
}

# Restore
mv "state/epics/$FIRST_EPIC/README.md.backup" "state/epics/$FIRST_EPIC/README.md"

echo "✅ Test 6 PASS: Validation script - missing epic README"
```

**Expected Outcome:** Validation exits 1, error message suggests fix command

### Test 7: Validation Script - Invalid YAML

**Purpose:** Verify validation fails when README has invalid YAML frontmatter

**Test Steps:**
```bash
# Create test README with invalid YAML
mkdir -p state/epics/TEST-INVALID
cat > state/epics/TEST-INVALID/README.md <<EOF
---
type: "epic_readme
epic_id: "TEST-INVALID"
this is not valid yaml: [unclosed
---

# Epic: TEST-INVALID
EOF

# Add to roadmap.yaml temporarily (simulate)
# For this test, we'll just test the validation function directly
source scripts/readme_lib.sh
if validate_yaml_frontmatter "state/epics/TEST-INVALID/README.md" 2>/dev/null; then
  echo "FAIL: validate_yaml_frontmatter accepted invalid YAML"
  rm -rf state/epics/TEST-INVALID
  exit 1
fi

rm -rf state/epics/TEST-INVALID

echo "✅ Test 7 PASS: Validation script - invalid YAML"
```

**Expected Outcome:** Validation detects invalid YAML

### Test 8: Idempotency - Running Init Twice

**Purpose:** Verify running readme_init.sh twice on same directory is safe (no overwrite)

**Test Steps:**
```bash
# Create epic README
rm -rf state/epics/TEST-IDEMPOTENT
scripts/readme_init.sh state/epics/TEST-IDEMPOTENT AFP-TEST-008-FIRST

# Modify README (simulate user edits)
echo "<!-- USER EDIT: This should not be lost -->" >> state/epics/TEST-IDEMPOTENT/README.md

# Run init again with different task ID
scripts/readme_init.sh state/epics/TEST-IDEMPOTENT AFP-TEST-008-SECOND

# Verify original content preserved
if ! grep -q "AFP-TEST-008-FIRST" state/epics/TEST-IDEMPOTENT/README.md; then
  echo "FAIL: Original task ID lost (README was overwritten)"
  exit 1
fi

if ! grep -q "USER EDIT" state/epics/TEST-IDEMPOTENT/README.md; then
  echo "FAIL: User edits lost (README was overwritten)"
  exit 1
fi

# Verify second run succeeded (exit code 0)
scripts/readme_init.sh state/epics/TEST-IDEMPOTENT AFP-TEST-008-THIRD
if [[ $? -ne 0 ]]; then
  echo "FAIL: Idempotent run returned non-zero exit code"
  exit 1
fi

rm -rf state/epics/TEST-IDEMPOTENT

echo "✅ Test 8 PASS: Idempotency - running init twice"
```

**Expected Outcome:** Second run doesn't overwrite existing README, exits 0

### Test 9: Cross-Platform Compatibility

**Purpose:** Verify scripts work on both macOS and Linux

**Test Steps:**
```bash
# Detect platform
if [[ "$OSTYPE" == "darwin"* ]]; then
  PLATFORM="macOS"
else
  PLATFORM="Linux"
fi

echo "Testing on: $PLATFORM"

# Test bash version compatibility
BASH_VERSION_MAJOR=$(bash --version | head -1 | grep -oE '[0-9]+\.[0-9]+' | cut -d. -f1)
if [[ $BASH_VERSION_MAJOR -lt 3 ]]; then
  echo "FAIL: Bash version too old (need 3.2+)"
  exit 1
fi

# Test sed_inplace helper (platform-specific)
source scripts/readme_lib.sh
TEST_FILE=$(mktemp)
echo "original" > "$TEST_FILE"
sed_inplace 's/original/replaced/' "$TEST_FILE"
if ! grep -q "replaced" "$TEST_FILE"; then
  echo "FAIL: sed_inplace doesn't work on $PLATFORM"
  rm "$TEST_FILE"
  exit 1
fi
rm "$TEST_FILE"

# Test date formatting
CURRENT_DATE=$(current_date)
if [[ ! "$CURRENT_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "FAIL: current_date format incorrect on $PLATFORM"
  exit 1
fi

echo "✅ Test 9 PASS: Cross-platform compatibility ($PLATFORM)"
```

**Expected Outcome:** All platform-specific helpers work correctly

**Note:** This test should be run on BOTH macOS and Linux

### Test 10: Integration - Full Workflow

**Purpose:** Verify complete workflow from epic creation to validation

**Test Steps:**
```bash
# Clean slate
rm -rf state/epics/TEST-INTEGRATION
rm -rf state/milestones/TEST-INTEGRATION-M1

# Step 1: Create epic README
scripts/readme_init.sh state/epics/TEST-INTEGRATION AFP-TEST-010

# Step 2: Manually fill in required sections (simulate user work)
sed -i.bak 's/\[TODO: Describe the strategic goal in 2-3 sentences\]/Test epic for integration testing/' state/epics/TEST-INTEGRATION/README.md

# Step 3: Create milestone README
scripts/readme_init.sh state/milestones/TEST-INTEGRATION-M1 AFP-TEST-010

# Step 4: Fill in milestone sections
sed -i.bak 's/\[TODO: Describe the capability in 2-3 sentences\]/Test milestone capability/' state/milestones/TEST-INTEGRATION-M1/README.md

# Step 5: Validate YAML frontmatter is parsable
python3 -c "
import yaml
with open('state/epics/TEST-INTEGRATION/README.md') as f:
    content = f.read()
    parts = content.split('---')
    epic_frontmatter = yaml.safe_load(parts[1])
    assert epic_frontmatter['type'] == 'epic_readme'

with open('state/milestones/TEST-INTEGRATION-M1/README.md') as f:
    content = f.read()
    parts = content.split('---')
    milestone_frontmatter = yaml.safe_load(parts[1])
    assert milestone_frontmatter['type'] == 'milestone_readme'

print('PASS: Integration workflow YAML valid')
"

# Step 6: Validate structure
source scripts/readme_lib.sh
validate_readme_structure state/epics/TEST-INTEGRATION/README.md || {
  echo "FAIL: Epic README structure invalid"
  exit 1
}

validate_readme_structure state/milestones/TEST-INTEGRATION-M1/README.md || {
  echo "FAIL: Milestone README structure invalid"
  exit 1
}

# Cleanup
rm -rf state/epics/TEST-INTEGRATION state/milestones/TEST-INTEGRATION-M1

echo "✅ Test 10 PASS: Integration - full workflow"
```

**Expected Outcome:** Complete workflow from creation to validation succeeds

### Test Summary

| Test | Purpose | Expected Outcome |
|------|---------|------------------|
| 1 | Epic README initialization | Epic README created with valid YAML and sections |
| 2 | Milestone README initialization | Milestone README created with valid YAML and sections |
| 3 | Task group README initialization | Task group README created with valid YAML and sections |
| 4 | Template selection logic | Correct template selected based on path |
| 5 | Validation - all valid | Validation passes when all READMEs present |
| 6 | Validation - missing README | Validation fails with helpful error |
| 7 | Validation - invalid YAML | Validation detects invalid YAML |
| 8 | Idempotency | Running init twice doesn't overwrite |
| 9 | Cross-platform | Works on macOS and Linux |
| 10 | Integration workflow | Full workflow succeeds |

**Test Execution Script:** Create `scripts/test_hierarchical_readme.sh` to run all tests:

```bash
#!/usr/bin/env bash
# Run all hierarchical README tests

TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
  local test_num="$1"
  local test_name="$2"

  echo ""
  echo "========================================="
  echo "Running Test $test_num: $test_name"
  echo "========================================="

  if eval "$3"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo "❌ Test $test_num FAILED"
  fi
}

# Run all 10 tests
run_test 1 "Epic README initialization" "test_epic_init"
run_test 2 "Milestone README initialization" "test_milestone_init"
run_test 3 "Task group README initialization" "test_task_group_init"
run_test 4 "Template selection logic" "test_template_selection"
run_test 5 "Validation - all valid" "test_validation_pass"
run_test 6 "Validation - missing README" "test_validation_fail"
run_test 7 "Validation - invalid YAML" "test_validation_yaml"
run_test 8 "Idempotency" "test_idempotency"
run_test 9 "Cross-platform" "test_cross_platform"
run_test 10 "Integration workflow" "test_integration"

echo ""
echo "========================================="
echo "Test Results"
echo "========================================="
echo "✅ Passed: $TESTS_PASSED"
echo "❌ Failed: $TESTS_FAILED"

if [[ $TESTS_FAILED -eq 0 ]]; then
  echo "✅ ALL TESTS PASSED"
  exit 0
else
  echo "❌ SOME TESTS FAILED"
  exit 1
fi
```

## Risk Mitigation

### Risk 1: Roadmap Parsing Fragility

**Scenario:** yq not installed, grep fallback fails on unexpected YAML format

**Mitigation:**
- Test both yq and grep approaches
- Provide clear error message if neither works
- Document yq as recommended (but optional)
- Handle edge cases (nested IDs, comments in YAML)

### Risk 2: Template Variable Extraction

**Scenario:** Epic/milestone names contain special characters that break sed replacement

**Mitigation:**
- Use sed with proper escaping
- Test with names containing spaces, dashes, parentheses
- Fallback to placeholder if extraction fails
- User can manually edit placeholder

### Risk 3: Validation Blocks Legitimate Work

**Scenario:** Validation script has false positives, blocks commits

**Mitigation:**
- Comprehensive testing before deployment
- Clear error messages with exact fix commands
- Escape hatch: user can skip validation with `git commit --no-verify`
- Document validation logic for debugging

### Risk 4: Users Don't Read Templates

**Scenario:** Users create epic READMEs but leave all TODOs, write low-quality docs

**Mitigation:**
- Templates have examples of good vs bad docs
- Validation checks for "TODO" strings (warning, not error)
- Self-improvement system audits doc quality quarterly
- Lead by example (fill in WAVE-0 epic README properly)

## Success Criteria (From SPEC)

### Structural Success

1. ✅ All templates created (3 files)
2. ✅ Validation script created and executable
3. ✅ Template selection logic added to init script
4. ✅ Documentation updated
5. ✅ WAVE-0 epic README initialized as example

### Behavioral Success

1. ✅ All 10 tests pass
2. ✅ Validation script runs without errors on current roadmap
3. ✅ Cross-platform compatibility verified (macOS and Linux)

### Quality Success

1. ✅ AFP/SCAS principles maintained (reuse existing pattern)
2. ✅ Minimal new code (~150 LOC)
3. ✅ No breaking changes to existing functionality
4. ✅ Documentation clear and actionable

---

**PLAN Phase Complete**

**Confidence:** High (reuses proven pattern, comprehensive tests designed upfront)
**Estimated Implementation Time:** 100 min (1.5-2 hours)
**Estimated Testing Time:** 30 min (run all 10 tests)
**Total:** ~2.5 hours

**Next Phase:** THINK (edge cases and complexity analysis)
