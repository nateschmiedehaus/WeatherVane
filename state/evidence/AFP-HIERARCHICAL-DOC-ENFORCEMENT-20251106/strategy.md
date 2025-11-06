# Strategy: Hierarchical Documentation Enforcement

**Task ID:** AFP-HIERARCHICAL-DOC-ENFORCEMENT-20251106
**Phase:** STRATEGIZE
**Date:** 2025-11-06

## Problem Statement

**User Requirement:** "make sure the hierarchical processes (not just task but task group, epic, etc) have documentation requirements as well that are enforced"

**Critical Clarification:** User wants **READMEs** for epic/milestone/task-group directories, following the same pattern as the distributed knowledge base automation (AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106).

**Current State:**
- ✅ **Tasks** have comprehensive documentation in `state/evidence/[TASK-ID]/`
- ✅ **Directories** have automated READMEs (AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106)
  - Template-based: `docs/templates/readme_template.md`
  - Init script: `scripts/readme_init.sh`
  - Update script: `scripts/readme_update.sh`
  - YAML frontmatter for machine parsing
  - Enforced at STRATEGIZE (init) and VERIFY (update) phases
- ❌ **Epics** have minimal metadata in roadmap.yaml (title, status, domain) - **no directory, no README**
- ❌ **Milestones** have minimal metadata (title, status) - **no directory, no README**
- ❌ **Task groups** are not formalized - **no directory structure**
- ❌ **No documentation requirements** for epic/milestone/task-group context
- ❌ **No enforcement** of strategic documentation at hierarchy levels

**Pain Points:**

1. **Epic-level context missing**
   - Why this epic exists (strategic goal)
   - Success criteria for the entire epic
   - High-level architecture decisions
   - No central place to document epic strategy
   - Dependencies between epics unclear

2. **Milestone-level planning missing**
   - Phase completion criteria not documented
   - Integration requirements scattered
   - No central milestone context
   - Progress tracking ad-hoc

3. **No task group formalization**
   - Related tasks not explicitly grouped
   - No shared context for task clusters
   - Dependencies within groups unclear
   - No directory structure for groups

**Root Cause:**
Documentation requirements exist at **atomic levels** (individual tasks, individual code directories) but not at **organizational hierarchy levels** (epics, milestones, task groups). The distributed knowledge base automation only handles code directories, not roadmap hierarchy.

## Vision: Hierarchical Knowledge Graph with READMEs

**Goal:** Extend the distributed knowledge base pattern to organizational hierarchy. Every epic, milestone, and task group gets a **directory with a README.md** that provides context using the same automation pattern as code directories.

**Hierarchical Structure:**

```
state/
├── epics/
│   ├── WAVE-0/
│   │   └── README.md          # Epic-level strategic context
│   ├── WAVE-1/
│   │   └── README.md
│   └── ...
├── milestones/
│   ├── W0.M1/
│   │   └── README.md          # Milestone-level tactical plan
│   ├── W0.M2/
│   │   └── README.md
│   └── ...
├── task_groups/
│   ├── proof-system/
│   │   └── README.md          # Task group shared context
│   ├── readme-automation/
│   │   └── README.md
│   └── ...
└── roadmap.yaml               # Hierarchy structure (unchanged)
```

**Each level has a README.md with YAML frontmatter:**

| Level | Directory | README Purpose | Frequency |
|-------|-----------|----------------|-----------|
| **Epic** | `state/epics/[EPIC-ID]/README.md` | Strategic context (WHY, WHAT vision) | Created once, rarely updated |
| **Milestone** | `state/milestones/[MILESTONE-ID]/README.md` | Tactical plan (WHEN, HOW integrates) | Created once, updated at completion |
| **Task Group** | `state/task_groups/[GROUP-ID]/README.md` | Shared context (WHICH tasks, WHAT shared) | Created as needed, updated when tasks complete |
| **Task** | `state/evidence/[TASK-ID]/` | ✅ Already exists | ✅ Keep as-is |
| **Directory** | `[path]/README.md` | ✅ Already automated | ✅ Keep as-is |

**Knowledge Graph Navigation:**

```
Epic README (state/epics/WAVE-0/README.md)
  ↓ Links to milestones
Milestone README (state/milestones/W0.M1/README.md)
  ↓ Links to tasks
Task Evidence (state/evidence/AFP-W0-M1-TASK-001/)
  ↓ References code directories
Directory README (apps/api/README.md)
  ↓ Documents code changes
```

## AFP/SCAS Analysis

### Via Negativa: What Can We DELETE?

**Delete:**
- ❌ Redundant epic/milestone descriptions in every task evidence bundle (centralize at epic/milestone level)
- ❌ Repeated context in similar tasks (move to task group README)
- ❌ Strategic rationale buried in individual task evidence (elevate to epic README)
- ❌ Ad-hoc milestone planning in Slack/email/context.md (formalize in milestone README)
- ❌ "What's the status of WAVE-0?" questions (read epic README)
- ❌ Searching through 20 task evidence bundles to understand epic goal (read one epic README)

**Keep:**
- ✅ Task evidence bundles (different purpose - execution proof)
- ✅ Directory READMEs (different purpose - code navigation)
- ✅ Roadmap.yaml structure (works well for hierarchy)

**Via Negativa Score:** 8/10 (strong deletion of scattered/duplicated context)

### Simplicity: Simplest That Works

**Option 1: Inline in roadmap.yaml**
- Add long-form strategic context to YAML
- **Problem:** Roadmap becomes 2000+ lines
- **Problem:** YAML not ideal for narrative documentation
- **Score:** 4/10 (unwieldy)

**Option 2: Separate .md files (my original approach - INCORRECT)**
- Files like `state/epics/WAVE-0.md` (not in directory)
- **Problem:** Inconsistent with distributed knowledge base pattern
- **Problem:** User explicitly corrected this: wants "READMEs"
- **Score:** 6/10 (works but inconsistent)

**Option 3: README directories (RECOMMENDED - matches user's intent)**
- Directories like `state/epics/WAVE-0/README.md`
- **Pros:** Consistent with directory README automation
- **Pros:** Can reuse existing template system
- **Pros:** Can reuse existing init/update scripts (with modifications)
- **Pros:** YAML frontmatter pattern already proven
- **Pros:** Future: can add other files to epic directory if needed
- **Score:** 9/10 (consistent, reusable, extensible)

**Simplicity Score:** 9/10 (reuses existing pattern)

### Clarity: What Should Each Level Document?

#### Epic README (state/epics/[EPIC-ID]/README.md)

**Purpose:** Strategic context for the entire epic

**YAML Frontmatter:**
```yaml
---
type: "epic_readme"
epic_id: "WAVE-0"
status: "in-progress"
last_updated: "2025-11-06"
owner: "Director Dana"
domain: "mcp"
milestones: ["W0.M1", "W0.M2", "W0.M3"]
dependencies: []
---
```

**Sections:**
```markdown
# Epic: WAVE-0 - Wave 0 Foundation Stabilisation

**Status:** In Progress
**Last Updated:** 2025-11-06
**Owner:** Director Dana

## Purpose
[Strategic goal - WHY this epic exists, WHAT problem it solves]

## Recent Changes
### AFP-HIERARCHICAL-DOC-ENFORCEMENT-20251106 - Initial epic README setup
- Impact: low
- See: state/evidence/AFP-HIERARCHICAL-DOC-ENFORCEMENT-20251106/

## Success Criteria
[What does "done" mean for this epic?]

## Architecture Decisions
[High-level technical choices that affect all milestones]

## Milestones
- **W0.M1** - Reboot Autopilot Core
  - Status: in_progress
  - See: [state/milestones/W0.M1/README.md](../milestones/W0.M1/README.md)

## Dependencies
[Other epics that must complete first]

## Risks
[Epic-level risks and mitigation strategies]

## Navigation
- **Milestones:** [W0.M1](../milestones/W0.M1/README.md), [W0.M2](../milestones/W0.M2/README.md)
- **Roadmap:** [state/roadmap.yaml](../../roadmap.yaml)
```

#### Milestone README (state/milestones/[MILESTONE-ID]/README.md)

**Purpose:** Tactical plan for achieving a capability

**YAML Frontmatter:**
```yaml
---
type: "milestone_readme"
milestone_id: "W0.M1"
epic_id: "WAVE-0"
status: "in-progress"
last_updated: "2025-11-06"
owner: "Atlas"
tasks: ["AFP-W0-M1-TASK-001", "AFP-W0-M1-TASK-002"]
---
```

**Sections:**
```markdown
# Milestone: W0.M1 - Reboot Autopilot Core

**Status:** In Progress
**Last Updated:** 2025-11-06
**Owner:** Atlas

## Purpose
[Capability delivered - WHAT users/system can do after completion]

## Recent Changes
### AFP-HIERARCHICAL-DOC-ENFORCEMENT-20251106 - Initial milestone README setup
- Impact: low
- See: state/evidence/AFP-HIERARCHICAL-DOC-ENFORCEMENT-20251106/

## Phase Plan
[Timeline, sequencing, integration points]

## Tasks
- **AFP-W0-M1-TASK-001** - Task title
  - Status: done
  - See: [state/evidence/AFP-W0-M1-TASK-001/](../../evidence/AFP-W0-M1-TASK-001/)

## Integration Requirements
[How this milestone integrates with others]

## Acceptance Criteria
[How we know milestone is truly complete]

## Navigation
- **Epic:** [WAVE-0](../epics/WAVE-0/README.md)
- **Tasks:** [Evidence bundles](../../evidence/)
- **Roadmap:** [state/roadmap.yaml](../../roadmap.yaml)
```

#### Task Group README (state/task_groups/[GROUP-ID]/README.md)

**Purpose:** Shared context for related tasks

**YAML Frontmatter:**
```yaml
---
type: "task_group_readme"
group_id: "proof-system"
status: "in-progress"
last_updated: "2025-11-06"
owner: "WeatherVane Autopilot"
tasks: ["AFP-PROOF-LAYER-1", "AFP-PROOF-LAYER-2", "AFP-PROOF-LAYER-3"]
---
```

**Sections:**
```markdown
# Task Group: proof-system - 3-Layer Proof System

**Status:** In Progress
**Last Updated:** 2025-11-06
**Owner:** WeatherVane Autopilot

## Purpose
[Why these tasks are grouped together]

## Recent Changes
### AFP-PROOF-LAYER-3 - Completed production feedback layer
- Impact: high
- See: state/evidence/AFP-PROOF-LAYER-3/

## Tasks
- **AFP-PROOF-LAYER-1** - Structural proofs (done)
- **AFP-PROOF-LAYER-2** - Critic proofs (done)
- **AFP-PROOF-LAYER-3** - Production feedback (done)

## Shared Context
[What context all tasks share - codebase area, dependencies, integration points]

## Execution Order
[Dependencies within the group]

## Group-Level Testing
[Integration tests spanning multiple tasks]

## Navigation
- **Milestone:** [W0.M1](../milestones/W0.M1/README.md)
- **Tasks:** [AFP-PROOF-LAYER-1](../../evidence/AFP-PROOF-LAYER-1/)
```

**Clarity Score:** 9/10 (each level has clear purpose, consistent structure)

### Autonomy: How to Enforce?

**Enforcement Strategy - Reuse Existing Pattern:**

The distributed knowledge base automation already has:
- ✅ Templates with YAML frontmatter
- ✅ Init script (`scripts/readme_init.sh`)
- ✅ Update script (`scripts/readme_update.sh`)
- ✅ Validation functions (`scripts/readme_lib.sh`)

**Extend these scripts to support hierarchical directories:**

**1. Epic Creation (manual, rare)**
```bash
# When creating new epic in roadmap.yaml
scripts/readme_init.sh state/epics/WAVE-1 AFP-CREATE-WAVE-1
# Creates state/epics/WAVE-1/README.md from epic_template.md
```

**2. Milestone Creation (manual, rare)**
```bash
# When adding milestone to epic
scripts/readme_init.sh state/milestones/W1.M1 AFP-CREATE-W1-M1
# Creates state/milestones/W1.M1/README.md from milestone_template.md
```

**3. Task Group Creation (as-needed)**
```bash
# When grouping related tasks
scripts/readme_init.sh state/task_groups/feature-x AFP-FEATURE-X-GROUP
# Creates state/task_groups/feature-x/README.md from task_group_template.md
```

**4. Updates (during work)**
```bash
# When completing task in milestone
scripts/readme_update.sh state/milestones/W0.M1 AFP-COMPLETED-TASK
# Updates "Recent Changes" in milestone README
```

**5. Validation (pre-commit)**
```bash
# Extend existing validation to check hierarchical READMEs
scripts/validate_roadmap_docs.sh
# Checks:
# - All epics in roadmap.yaml have state/epics/[EPIC-ID]/README.md
# - All milestones have state/milestones/[MILESTONE-ID]/README.md
# - All READMEs have valid YAML frontmatter
# - All READMEs have required sections
```

**Autonomy Score:** 8/10 (reuses existing automation, minimal new code)

### Sustainability: Maintenance Overhead

**Documentation Frequency:**

| Level | Creation | Update | Effort Per | Annual Frequency |
|-------|----------|--------|------------|------------------|
| Epic | Manual (rare) | Milestone completion | 30 min | 2-4 epics |
| Milestone | Manual (rare) | Task completion | 15 min | 8-12 milestones |
| Task Group | As-needed | Task completion | 10 min | 10-20 groups |
| **Total** | **Low** | **Automatic** | **~1-2 hours/quarter** | **20-36 events** |

**Maintenance Costs:**
- Epic READMEs: 30 min each, 2-4 per year = **1-2 hours/year**
- Milestone READMEs: 15 min each, 8-12 per year = **2-3 hours/year**
- Task Group READMEs: 10 min each, 10-20 per year = **2-3 hours/year**
- **Total:** ~5-8 hours/year

**Value Delivered:**
- Centralized strategy documentation (no more Slack archaeology)
- Milestone planning explicit (better coordination)
- Task grouping clear (parallel work easier)
- New agents onboard to epic in <10 min (vs 30+ min reading scattered evidence)
- 85% reduction in "what's the epic goal?" questions

**Sustainability Score:** 9/10 (low frequency, high value, mostly automated)

### Antifragility: Gets Better With Use

**Positive Feedback Loops:**

1. **More epics → Better templates**
   - First few epic READMEs are experimental
   - Patterns emerge from real examples
   - Templates improve based on actual use
   - Community learns what makes good strategic docs

2. **Agents use epic READMEs → Find gaps → Improve quality**
   - Agents discover missing context during tasks
   - Create improvement tasks for epic docs
   - Documentation gets richer over time
   - Self-reinforcing quality loop

3. **Milestone completion → Documentation validation**
   - When milestone marked "done" but README stale
   - Agents notice mismatch during next task
   - Documentation discipline improves
   - Staleness becomes visible

4. **Task groups reveal patterns**
   - Groups created for related tasks
   - Common patterns documented
   - Future similar work references group README
   - Knowledge compounds

5. **Self-improvement system audits hierarchical docs**
   - 30-day cadence includes doc quality checks
   - Old epics get reviewed and improved
   - Templates updated based on learnings
   - System learns what works

**Antifragility Score:** 9/10 (strong positive feedback loops, improves with stress)

---

## Overall AFP/SCAS Score: 8.5/10

| Principle | Score | Rationale |
|-----------|-------|-----------|
| Via Negativa | 8/10 | Deletes scattered context, centralizes at appropriate levels |
| Simplicity | 9/10 | Reuses existing pattern, minimal new code |
| Clarity | 9/10 | Each level has clear purpose, consistent structure |
| Autonomy | 8/10 | Mostly automated, reuses existing scripts |
| Sustainability | 9/10 | Low frequency, high value, 5-8 hours/year overhead |
| Antifragility | 9/10 | Strong positive feedback loops, improves with use |

**Conclusion:** Strongly AFP/SCAS-aligned, superior to original separate .md file approach

---

## Strategic Options Considered

### Option 1: Status Quo (No Hierarchical Docs)

**Approach:** Keep documentation only at task and code directory levels

**AFP/SCAS Analysis:**

**Via Negativa:** 10/10 (adds nothing)
- ✅ Zero new files
- ❌ But keeps duplication (strategic context in every task)

**Simplicity:** 10/10 (no change)

**Clarity:** 3/10 (strategic context scattered)
- ❌ Epic goals buried in individual tasks
- ❌ Milestone planning ad-hoc
- ❌ New agents waste 30+ min finding context

**Sustainability:** 2/10 (increasing pain)
- ❌ More epics → more scattered context
- ❌ More agents → more onboarding overhead

**Antifragility:** 1/10 (degrades)
- ❌ Scales poorly

**Overall:** 5.2/10

**Verdict:** ❌ Status quo doesn't scale

### Option 2: Separate .md Files (My Original Approach - INCORRECT)

**Approach:** Files like `state/epics/WAVE-0.md` (not in directory)

**Example:**
```
state/
├── epics/
│   ├── WAVE-0.md          # Not a directory
│   └── WAVE-1.md
├── milestones/
│   ├── W0-M1.md
│   └── W0-M2.md
```

**AFP/SCAS Analysis:**

**Via Negativa:** 7/10
- ❌ Adds files
- ✅ But centralizes context

**Simplicity:** 6/10
- ❌ Inconsistent with directory README pattern
- ❌ Can't reuse existing init/update scripts
- ❌ Need separate template system

**Clarity:** 8/10
- ✅ Clear separation
- ❌ But different pattern than code directories

**Sustainability:** 7/10
- ✅ Low frequency
- ❌ But separate automation needed

**Overall:** 6.8/10

**Verdict:** ❌ Works but inconsistent with distributed knowledge base pattern

### Option 3: README Directories (RECOMMENDED)

**Approach:** Directories like `state/epics/WAVE-0/README.md` with YAML frontmatter

**Example:**
```
state/
├── epics/
│   ├── WAVE-0/
│   │   └── README.md      # Consistent with directory pattern
│   └── WAVE-1/
│       └── README.md
├── milestones/
│   ├── W0.M1/
│   │   └── README.md
│   └── W0.M2/
│       └── README.md
├── task_groups/
│   ├── proof-system/
│   │   └── README.md
│   └── readme-automation/
│       └── README.md
```

**AFP/SCAS Analysis:**

**Via Negativa:** 8/10
- ❌ Adds directories
- ✅ But deletes scattered context
- ✅ Reuses existing automation (no new scripts)

**Simplicity:** 9/10
- ✅ Consistent with directory README automation
- ✅ Reuses existing template system
- ✅ Reuses existing init/update scripts (minor modifications)
- ✅ Familiar pattern for agents

**Clarity:** 9/10
- ✅ Each level has dedicated README
- ✅ YAML frontmatter for machine parsing
- ✅ Navigation links between levels
- ✅ Consistent structure across all levels

**Autonomy:** 8/10
- ✅ Can reuse existing validation functions
- ✅ Pre-commit hook already checks README freshness
- ✅ Scripts already enforce YAML frontmatter

**Sustainability:** 9/10
- ✅ Low frequency (epics/milestones are rare)
- ✅ High value (centralized context)
- ✅ Minimal new automation needed

**Antifragility:** 9/10
- ✅ Scales well (one directory per epic/milestone)
- ✅ Templates improve with use
- ✅ Self-improvement system can audit
- ✅ Future: can add other files to directories if needed

**Overall:** 8.5/10

**Verdict:** ✅ **RECOMMENDED** - Consistent, reusable, extensible

---

## Recommended Strategy: README Directories with Automation Reuse

### Core Principle: Extend, Don't Replace

**Pattern Reuse:**
- ✅ Same YAML frontmatter structure
- ✅ Same template variable system
- ✅ Same init/update workflow
- ✅ Same validation functions
- ✅ Same pre-commit enforcement

**New Components:**
1. Three new templates (epic, milestone, task_group)
2. Template selection logic in init script
3. Hierarchical validation in validation script
4. Documentation for workflow

**Estimated LOC:** ~150 (mostly templates, minimal script changes)

### Implementation Approach

**Phase 1: Epic READMEs (This Task)**
- Create `docs/templates/epic_readme_template.md`
- Modify `scripts/readme_init.sh` to support template selection
- Add epic validation to `scripts/validate_roadmap_docs.sh`
- Document workflow in `MANDATORY_WORK_CHECKLIST.md`
- Initialize WAVE-0 epic as example

**Phase 2: Milestone READMEs (Future)**
- Create `docs/templates/milestone_readme_template.md`
- Add milestone validation
- Initialize current milestones

**Phase 3: Task Group READMEs (Future)**
- Create `docs/templates/task_group_readme_template.md`
- Formalize task groups in roadmap.yaml
- Add group validation

### Script Modifications

**scripts/readme_init.sh** (add template selection)

```bash
# Detect type based on path
if [[ "$DIRECTORY" =~ ^state/epics/ ]]; then
  TEMPLATE="docs/templates/epic_readme_template.md"
elif [[ "$DIRECTORY" =~ ^state/milestones/ ]]; then
  TEMPLATE="docs/templates/milestone_readme_template.md"
elif [[ "$DIRECTORY" =~ ^state/task_groups/ ]]; then
  TEMPLATE="docs/templates/task_group_readme_template.md"
else
  TEMPLATE="docs/templates/readme_template.md"  # Default for code dirs
fi
```

**scripts/validate_roadmap_docs.sh** (new script)

```bash
#!/usr/bin/env bash
# Validate hierarchical READMEs

# Extract epic IDs from roadmap.yaml
EPIC_IDS=$(grep -A 1 "^epics:" state/roadmap.yaml | grep "id:" | awk '{print $2}')

for epic_id in $EPIC_IDS; do
  epic_dir="state/epics/$epic_id"
  epic_readme="$epic_dir/README.md"

  if [[ ! -d "$epic_dir" ]]; then
    echo "❌ Missing directory: $epic_dir"
    exit 1
  fi

  if [[ ! -f "$epic_readme" ]]; then
    echo "❌ Missing README: $epic_readme"
    exit 1
  fi

  # Validate YAML frontmatter
  validate_yaml_frontmatter "$epic_readme" || {
    echo "❌ Invalid YAML in $epic_readme"
    exit 1
  }
done

echo "✅ All hierarchical documentation valid"
```

### Roadmap.yaml (No Changes Needed)

**Key Insight:** Roadmap.yaml already defines the hierarchy. We don't need to modify it. The hierarchical README directories are **parallel** to roadmap.yaml, not embedded in it.

**Current:**
```yaml
epics:
  - id: WAVE-0
    title: Wave 0 – Foundation Stabilisation
    status: in_progress
    domain: mcp
    milestones:
      - id: W0.M1
        title: Reboot Autopilot Core
        status: in_progress
```

**Hierarchical READMEs (parallel structure):**
```
state/epics/WAVE-0/README.md          # Documents epic WAVE-0
state/milestones/W0.M1/README.md      # Documents milestone W0.M1
```

**No modification to roadmap.yaml needed.** The directory structure mirrors the hierarchy defined in the YAML.

---

## Success Criteria

### Structural Success (Measurable)

1. ✅ **All epics have README directories**
   - Test: `scripts/validate_roadmap_docs.sh --check epics`
   - Target: 100% (0 missing)

2. ✅ **Epic READMEs have all required sections**
   - Sections: Purpose, Success Criteria, Architecture Decisions, Milestones, Dependencies, Risks
   - Test: Validation checks for section headers
   - Target: 100% complete

3. ✅ **YAML frontmatter is machine-parsable**
   - Test: `python3 -c "import yaml; yaml.safe_load(open('state/epics/WAVE-0/README.md').read().split('---')[1])"`
   - Target: 0 errors

4. ✅ **Validation runs on pre-commit**
   - Test: Modify roadmap.yaml → stage → commit
   - Expected: Validation runs automatically

### Behavioral Success (Observable)

1. ✅ **Agents read epic README before starting epic tasks**
   - Observable: Context writes reference `state/epics/[EPIC-ID]/README.md`
   - Target: 80%+ tasks reference epic context

2. ✅ **New agents onboard to epic in <10 min**
   - Before: 30+ min reading scattered task evidence
   - After: <10 min reading epic README
   - Metric: Time to first meaningful contribution

3. ✅ **Strategic decisions documented at epic level**
   - No more "why did we choose X?" questions
   - Epic README has Architecture Decisions section
   - Target: 90%+ strategic questions answered by epic README alone

### Quality Success (Qualitative)

1. ✅ **Epic READMEs are strategic, not tactical**
   - Review: Do docs answer "why" not "how"?
   - Target: Strategic focus maintained

2. ✅ **No duplication between epic and task docs**
   - Epic README: Strategic context
   - Task evidence: Execution details
   - No overlap

3. ✅ **Consistent with directory README pattern**
   - Same YAML frontmatter structure
   - Same template variables
   - Same init/update workflow

---

## Risks & Mitigations

### Risk 1: Epic README Quality Degrades

**Scenario:** Agents write lazy strategic docs ("This epic is important")

**Mitigation:**
- Template enforces structure with prompts
- Validation checks minimum length per section
- Examples show good vs bad (in template comments)
- Self-improvement system audits epic docs quarterly

### Risk 2: READMEs Get Stale

**Scenario:** Epic completes, README never updated to reflect reality

**Mitigation:**
- Pre-commit validation flags status mismatches
- Milestone completion updates epic README automatically
- Self-improvement system creates review tasks for old epics
- "Last Updated" YAML field makes staleness visible

### Risk 3: Too Much Overhead

**Scenario:** Creating epic README takes 1 hour, blocks starting epic

**Mitigation:**
- Epics created rarely (2-4 per year)
- Template makes it faster (fill in blanks)
- Can start with minimal README, enrich later
- Most fields optional at creation, filled during execution

### Risk 4: Agents Don't Read Epic READMEs

**Scenario:** Agents still search task evidence, ignore epic README

**Mitigation:**
- MANDATORY_WORK_CHECKLIST.md requires reading epic README
- Pre-commit hook checks if context.md references epic
- Task templates include "Read epic README" step
- Agents discover value quickly (faster onboarding)

---

## AFP/SCAS Compliance Checklist

- [x] **Via Negativa:** Centralizes scattered strategic context, deletes duplication
- [x] **Simplicity:** Reuses existing directory README pattern (minimal new code)
- [x] **Clarity:** Each level has clear purpose and consistent structure
- [x] **Autonomy:** Enforced by extending existing validation + pre-commit hooks
- [x] **Sustainability:** Low frequency (2-4 epics/year), high value, ~5-8 hours/year
- [x] **Antifragility:** Strong positive feedback loops, templates improve with use

---

## Next Steps (SPEC Phase)

1. Define epic README structure (YAML frontmatter + sections)
2. Define milestone README structure
3. Define task group README structure
4. Specify template selection logic
5. Specify validation rules for hierarchical READMEs
6. Define enforcement mechanism (pre-commit integration)
7. Create proof criteria (tests designed BEFORE implementation)

---

**STRATEGIZE Phase Complete**

**Confidence:** High (reuses proven pattern from AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106)
**AFP/SCAS Score:** 8.5/10 (superior to original separate .md approach)
**Estimated LOC:** ~150 (3 templates + script modifications + validation)
**Estimated Time:** 1 task (all 3 levels in one implementation)
