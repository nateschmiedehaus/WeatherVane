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
**Epic:** [{{EPIC_ID}}](../../epics/{{EPIC_ID}}/README.md)

## Purpose

<!-- WHAT capability is delivered after this milestone completes? -->

[TODO: Describe the capability in 2-3 sentences]

**Good Example:**
> Autopilot can autonomously select, execute, and verify tasks from the roadmap
> without human intervention. Implements complete task lifecycle (select → assign
> → execute → verify → monitor) with evidence capture and telemetry.

**Bad Example:**
> Complete all the milestone tasks.

## Recent Changes

### {{TASK_ID}} - Initial milestone README setup
- Files: README.md
- Impact: low
- Date: {{CURRENT_DATE}}
- See: state/evidence/{{TASK_ID}}/

## Phase Plan

<!-- Timeline, sequencing, integration points -->

[TODO: Describe the execution plan with timeline]

**Example:**
1. **Week 1:** Scaffold supervisor + core agents (planner, builder, reviewer)
2. **Week 2:** Wire task lifecycle + telemetry hooks
3. **Week 3:** Integration testing with Wave 0
4. **Week 4:** Refinement, documentation, deployment

## Tasks

[TODO: List tasks with status and links to evidence bundles]

**Example:**
- **AFP-W0-M1-TASK-001** - MVP supervisor scaffold
  - Status: done
  - See: [state/evidence/AFP-W0-M1-TASK-001/](../../evidence/AFP-W0-M1-TASK-001/)
- **AFP-W0-M1-TASK-002** - MVP agents scaffold
  - Status: in-progress
  - See: [state/evidence/AFP-W0-M1-TASK-002/](../../evidence/AFP-W0-M1-TASK-002/)

## Integration Requirements

<!-- How does this milestone integrate with others? -->

[TODO: Describe integration points with other milestones or systems]

**Example:**
- **M1 → M2:** Supervisor API contracts must be stable (no breaking changes)
- **M1 → M3:** Task lifecycle telemetry format agreed and documented
- **External:** Integrates with existing MCP tools (plan_next, plan_update)

## Acceptance Criteria

<!-- How do we know milestone is truly complete? -->

[TODO: List 3-5 measurable acceptance criteria]

**Example:**
- Wave 0 picks up and executes 10 consecutive tasks without errors
- All lifecycle events emitted to supervisor_lifecycle.jsonl
- Zero manual interventions during 48-hour continuous run
- Evidence bundles created for all completed tasks
- Integration tests pass (100% success rate)

## Navigation

- **Epic:** [{{EPIC_ID}}](../../epics/{{EPIC_ID}}/README.md)
- **Tasks:** [Evidence bundles](../../evidence/)
- **Roadmap:** [state/roadmap.yaml](../../roadmap.yaml)

---

⚠️ **AUTOMATION NOTICE**

This README is partially automated. Do not:
- Remove YAML frontmatter (breaks machine parsing and validation)
- Delete required sections (breaks structure validation)
- Edit "Recent Changes" manually (use `scripts/readme_update.sh`)

Safe to edit:
- Purpose section (capability delivered - WHAT users can do)
- Phase Plan (timeline and sequencing - WHEN and HOW)
- Tasks list (keep status current)
- Integration Requirements (dependencies on other milestones)
- Acceptance Criteria (measurable success metrics)
