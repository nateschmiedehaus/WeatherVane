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

**Good Example:**
> Stabilize autopilot foundation to enable autonomous self-improvement. Addresses
> fragility in proof validation and lack of continuous improvement loops. Target:
> <4 week path to full autonomy.

**Bad Example:**
> This epic is important work that needs to be done.

## Recent Changes

### {{TASK_ID}} - Initial epic README setup
- Files: README.md
- Impact: low
- Date: {{CURRENT_DATE}}
- See: state/evidence/{{TASK_ID}}/

## Success Criteria

<!-- WHAT does "done" mean for this epic? List 3-5 measurable criteria -->

[TODO: List measurable success criteria]

**Example:**
- Autopilot can self-improve (create + execute improvement tasks autonomously)
- Proof system validates all changes (100% coverage across 3 layers)
- Wave 0 runs autonomously for 1 week without human intervention

## Architecture Decisions

<!-- High-level technical choices that affect all milestones -->

[TODO: List 2-4 key architectural decisions with rationale]

**Example:**
1. **Proof System:** Three layers (structural, critic, production feedback)
   - Rationale: Defense in depth, catches issues at different abstraction levels
2. **Self-Improvement:** 30-day cadence, max 3 concurrent improvements
   - Rationale: Prevents improvement loops, maintains system stability
3. **Integration:** Wave 0 integrated with proof validation at task boundaries
   - Rationale: Continuous validation, catches regressions early

## Milestones

[TODO: List milestones with status and links]

- **M1** - [Milestone Title]
  - Status: in_progress
  - See: [state/milestones/M1/README.md](../../milestones/M1/README.md)

## Dependencies

<!-- Other epics that must complete first -->

[TODO: List epic dependencies or state "None"]

**Example:**
- None (foundational epic)

OR

- **EPIC-X** must complete first (provides required infrastructure)

## Risks

<!-- Epic-level risks and mitigation strategies -->

[TODO: List 2-3 key risks with mitigations]

**Example:**
1. **Risk:** Proof system too complex, slows development velocity
   - **Probability:** Medium
   - **Impact:** High
   - **Mitigation:** Phased rollout (structural → critic → production), monitor cycle time
2. **Risk:** Self-improvement creates infinite loops or runaway changes
   - **Probability:** Low (with safeguards)
   - **Impact:** Critical
   - **Mitigation:** Max 3 per cycle, loop detection, human approval for risky changes

## Navigation

- **Milestones:** [M1](../../milestones/M1/README.md) | [M2](../../milestones/M2/README.md)
- **Roadmap:** [state/roadmap.yaml](../../roadmap.yaml)
- **Evidence:** [state/evidence/](../../evidence/)

---

⚠️ **AUTOMATION NOTICE**

This README is partially automated. Do not:
- Remove YAML frontmatter (breaks machine parsing and validation)
- Delete required sections (breaks structure validation)
- Edit "Recent Changes" manually (use `scripts/readme_update.sh`)

Safe to edit:
- Purpose section (strategic context - WHY this epic matters)
- Success Criteria (measurable outcomes - WHAT "done" means)
- Architecture Decisions (high-level technical choices)
- Milestones list (keep status current)
- Dependencies (other epics required)
- Risks (epic-level threats and mitigations)
