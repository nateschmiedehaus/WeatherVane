# Hierarchical Work Process Templates

Templates for creating epic and set documentation following the 5-level hierarchy (META/PROJECT/EPIC/SET/TASK).

## Overview

These templates support the hierarchical work process established in AFP-ROADMAP-HIERARCHY-BOOTSTRAP-20251106.

## Epic Templates

Use these for wave-level (epic) documentation:

- **`epic_strategy_template.md`** - Epic strategic thinking (problem/goal/AFP alignment)
- **`epic_spec_template.md`** - Epic acceptance criteria and requirements
- **`epic_plan_template.md`** - Epic execution approach (placeholder - use WAVE-0/plan.md as reference)
- **`epic_think_template.md`** - Epic edge cases and failure modes (placeholder - use WAVE-0/think.md as reference)
- **`epic_design_template.md`** - See `docs/templates/design_template.md` (already exists)

## Set Templates

Use these for task group (set) documentation:

- **`set_strategy_template.md`** - Set strategic thinking (problem/goal/clustering rationale)
- **`set_spec_template.md`** - Set acceptance criteria
- **`set_plan_template.md`** - Set execution approach with PLAN-authored tests

## Usage

### Creating Epic Documentation

1. Copy epic templates to `state/epics/[EPIC-ID]/`
2. Rename to `strategy.md`, `spec.md`, `plan.md`, `think.md`, `design.md`
3. Fill in all placeholders marked with `[PLACEHOLDER]`
4. Follow all 5 phases before implementation
5. Ensure AFP/SCAS score ≥40/50 (target 45/50)

### Creating Set Documentation

1. Copy set templates to `state/task_groups/[set-id]/`
2. Rename to `strategy.md`, `spec.md`, `plan.md`
3. Fill in all placeholders marked with `[PLACEHOLDER]`
4. Follow all 3 phases before task implementation
5. Ensure clear clustering rationale and PLAN-authored tests

## Example Usage

**Epic Example:**
```bash
cp docs/templates/hierarchical/epic_strategy_template.md state/epics/WAVE-6/strategy.md
cp docs/templates/hierarchical/epic_spec_template.md state/epics/WAVE-6/spec.md
# Fill in templates...
```

**Set Example:**
```bash
cp docs/templates/hierarchical/set_strategy_template.md state/task_groups/w6m1-new-set/strategy.md
cp docs/templates/hierarchical/set_spec_template.md state/task_groups/w6m1-new-set/spec.md
cp docs/templates/hierarchical/set_plan_template.md state/task_groups/w6m1-new-set/plan.md
# Fill in templates...
```

## Reference Implementations

**Best examples to follow:**

### Epic Level
- **WAVE-0:** `state/epics/WAVE-0/` - Most comprehensive, reference standard
- **WAVE-1:** `state/epics/WAVE-1/` - Excellent governance strategy

### Set Level
- **w0m1-supervisor-agent-integration:** `state/task_groups/w0m1-supervisor-agent-integration/` - Detailed example
- **w0m1-supporting-infrastructure:** `state/task_groups/w0m1-supporting-infrastructure/` - Clear clustering

## Template Quality Standards

### Epic Templates
- **Strategy:** 800-3000 words (WAVE-0 reference: 3000+)
- **Spec:** 500-1500 words
- **Plan:** 500-1500 words
- **Think:** 400-1000 words
- **Design:** 600-2000 words, AFP/SCAS 45/50+

### Set Templates
- **Strategy:** 500-1500 words (W0.M1 sets), 150-500 words (later waves)
- **Spec:** 200-500 words
- **Plan:** 200-500 words, must include PLAN-authored tests

## AFP/SCAS Compliance

All templates enforce AFP/SCAS Five Forces:

1. **ECONOMY (Via Negativa):** What are we deleting/simplifying?
2. **COHERENCE (Match Terrain):** What proven patterns reused?
3. **LOCALITY (Related Near):** How are concepts grouped?
4. **VISIBILITY (Important Obvious):** What's explicitly documented?
5. **EVOLUTION (Fitness):** How does this enable future growth?

## Mandatory Sections

### Epic Strategy Must Include:
- Problem Analysis
- Root Cause
- Goal / Desired Outcome
- Success Criteria
- AFP/SCAS Alignment (all 5 forces)
- Risks and Mitigations
- Milestones Overview

### Set Strategy Must Include:
- Problem
- Goal
- Rationale for Clustering
- Success Criteria
- Tasks in This Set
- AFP/SCAS Considerations

### Set Plan Must Include:
- Execution Approach
- Task Breakdown
- **PLAN-authored Tests** (MANDATORY per ProcessCritic)
- Via Negativa Analysis
- Refactor vs Repair

## Review and Reform Tasks

After completing epic or set documentation, add review/reform tasks:

- **Review Task:** Antagonistically review work, seek improvements
- **Reform Task:** Research-based AFP/SCAS reform proposals

These are learning loops for continuous improvement.

## Questions?

- See `MANDATORY_WORK_CHECKLIST.md` for full AFP 10-phase lifecycle
- See `docs/concepts/afp_work_phases.md` for phase details
- See `state/evidence/AFP-ROADMAP-HIERARCHY-BOOTSTRAP-20251106/` for complete bootstrap evidence

---

**Templates extracted from:** WAVE-0 documentation (AFP-ROADMAP-HIERARCHY-BOOTSTRAP-20251106)
**Last updated:** 2025-11-06
**Maintainer:** Claude Council


<!-- BEGIN DOCSYNC -->

## Local Knowledge (generated 2025-11-06T21:41:12.271Z)

**Hierarchy:**
- Parent: `docs/templates`
- Key children: none

**What it is:**
- Path: `docs/templates/hierarchical`
- Languages: n/a
- Children: 0
- Files: 6

**Key files:**
- `epic_strategy_template.md` (5.5 KB)
- `set_strategy_template.md` (4.4 KB)
- `epic_spec_template.md` (3.6 KB)
- `set_plan_template.md` (2.7 KB)
- `set_spec_template.md` (1.1 KB)

**Upstream dependencies:**
- none detected

**Downstream consumers:**
- none detected

**Guardrails & tests:**
- Test files: 0
- Critic configs: 0
- TODO/FIXME markers: 0

**AFP/SCAS summary (5 = healthy):**
- Coherence: 5.0
- Economy/Via Negativa: 5.0
- Locality: 5.0
- Visibility: 5.0
- Evolution: 5.0

**Critical evaluation:**
- ✅ Healthy — no outstanding structural risks detected.

<!-- END DOCSYNC -->
