# SPEC: AFP-LEGACY-ARTIFACTS-20251106

## Acceptance Criteria
- All legitimate project assets currently untracked are either committed with appropriate metadata or intentionally ignored with justification.
- No leftover untracked files remain after task completion (`git status` clean apart from staged work tied to this task).
- Updates documented in AGENTS/claude reinforcing “stage/commit/push everything” note already added remain consistent.

## Functional Requirements
- Inventory untracked files, classify into categories (source, generated, evidence).
- Commit project assets that should be versioned (schemas, supervisor TS sources, taskflow tool, evidence bundles, strategy/thinking artifacts).
- Introduce `.gitignore` entries if any generated artifacts should stay untracked (document rationale inside evidence). Preference remains to keep, so avoid ignoring unless clearly generated.

## Non-Functional Requirements
- Maintain AFP micro-batching (may require multiple commits if staging set too large).
- Preserve existing repository history context (no file overwrites with stale data).

## Out of Scope
- Deep refactors of the newly tracked code.
- Content review of every evidence document (add them as-is).
