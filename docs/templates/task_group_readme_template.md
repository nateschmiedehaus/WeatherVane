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
**Milestone:** [{{MILESTONE_ID}}](../../milestones/{{MILESTONE_ID}}/README.md)

## Purpose

<!-- WHY are these tasks grouped together? -->

[TODO: Explain the grouping rationale in 1-2 sentences]

**Good Example:**
> Implements 3-layer proof system for code quality enforcement. Tasks are grouped
> because they share testing infrastructure, validation contracts, and integrate
> with the same pre-commit hook mechanism.

**Bad Example:**
> These tasks are related.

## Recent Changes

### {{TASK_ID}} - Initial task group README setup
- Files: README.md
- Impact: low
- Date: {{CURRENT_DATE}}
- See: state/evidence/{{TASK_ID}}/

## Tasks

[TODO: List all tasks in this group with current status]

**Example:**
- **AFP-PROOF-LAYER-1** - Structural proofs (done)
  - See: [state/evidence/AFP-PROOF-LAYER-1/](../../evidence/AFP-PROOF-LAYER-1/)
- **AFP-PROOF-LAYER-2** - Critic proofs (done)
  - See: [state/evidence/AFP-PROOF-LAYER-2/](../../evidence/AFP-PROOF-LAYER-2/)
- **AFP-PROOF-LAYER-3** - Production feedback (in-progress)
  - See: [state/evidence/AFP-PROOF-LAYER-3/](../../evidence/AFP-PROOF-LAYER-3/)

## Shared Context

<!-- WHAT context do all these tasks share? -->

[TODO: Describe shared dependencies, codebase area, integration points]

**Example:**
- **Codebase:** All tasks modify `tools/wvo_mcp/src/orchestrator/proof_system/`
- **Dependencies:** All depend on `critics_runner.ts` infrastructure
- **Integration:** All integrate with pre-commit hook validation at `.git/hooks/pre-commit`
- **Testing:** All share test fixtures in `tools/wvo_mcp/src/tests/fixtures/proof_cases/`

## Execution Order

<!-- Dependencies within the group -->

[TODO: Describe task dependencies if any, or state "No strict ordering"]

**Example (with dependencies):**
1. **AFP-PROOF-LAYER-1** (structural proofs) - No dependencies, start first
2. **AFP-PROOF-LAYER-2** (critic proofs) - Depends on LAYER-1 (uses structural proof contracts)
3. **AFP-PROOF-LAYER-3** (production feedback) - Depends on LAYER-2 (extends critic infrastructure)

**Example (parallel):**
- No strict ordering required
- All tasks can be executed in parallel
- Integrate in any order

## Group-Level Testing

<!-- Integration tests spanning multiple tasks -->

[TODO: Describe how to test the group as a whole]

**Example:**
```bash
# Run full proof system integration test
cd tools/wvo_mcp
npm test -- proof_system.integration.test.ts

# Expected: All 3 layers validated end-to-end
# - Structural proofs check file structure
# - Critic proofs check AFP/SCAS compliance
# - Production feedback validates real-world use
```

## Navigation

- **Milestone:** [{{MILESTONE_ID}}](../../milestones/{{MILESTONE_ID}}/README.md)
- **Tasks:** [Evidence bundles](../../evidence/)
- **Roadmap:** [state/roadmap.yaml](../../roadmap.yaml)

---

⚠️ **AUTOMATION NOTICE**

This README is partially automated. Do not:
- Remove YAML frontmatter (breaks machine parsing and validation)
- Delete required sections (breaks structure validation)
- Edit "Recent Changes" manually (use `scripts/readme_update.sh`)

Safe to edit:
- Purpose section (WHY tasks are grouped)
- Tasks list (keep status current as tasks progress)
- Shared Context (document common dependencies and integration points)
- Execution Order (update if dependencies change)
- Group-Level Testing (add integration tests as they're created)
