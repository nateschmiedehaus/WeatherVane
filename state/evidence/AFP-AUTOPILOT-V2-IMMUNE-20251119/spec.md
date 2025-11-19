# SPEC - AFP-AUTOPILOT-V2-IMMUNE-20251119

**Task:** Autopilot V2 - Phase 4 Immune System (Git hygiene + SCAS alignment)  
**Created:** 2025-11-19T22:57:00Z  
**Phase:** SPEC

## Acceptance Criteria

### Must Have
- Branch protection: Gate blocks direct pushes to `main` (fail-fast with clear error message).
- Commit hygiene: Messages must match `^(feat|fix|docs|style|refactor|test|chore)(\\(.+\\))?: .+$`; invalid messages are rejected with guidance.
- CI gate: Gate runs configured test/check command and fails on non-zero exit; success path reports pass.
- Architecture V2 doc updated with Immune System implementation details and explicit SCAS characteristics coverage.
- Automated tests exist and pass for branch, commit, and CI gates (aligning with PLAN-authored tests).
- Evidence for AFP phases stored under `state/evidence/AFP-AUTOPILOT-V2-IMMUNE-20251119/`.

### Should Have
- Gatekeeper reusable API usable by CLI/hooks (no tight coupling to a single entrypoint).
- Clear mapping from SCAS traits to modules (immune, nervous, brain/body).
- Dry-run/simulation path that doesn’t mutate git history when running checks.

### Could Have
- Configurable allowed branches (default `main`).
- Pluggable CI command selection (default `npm test` or repo-defined check).

## Functional Requirements

- **FR1: Branch Gate** — Given branch `main`, validatePush returns false and emits "use PR" guidance; for non-main branches returns true.
- **FR2: Commit Message Gate** — validateCommitMessage enforces regex and returns false with actionable message on invalid input; true otherwise.
- **FR3: CI Gate** — runCiGate executes configured command, streams status, and returns true on exit code 0; false otherwise.
- **FR4: Documentation Alignment** — ARCHITECTURE_V2 reflects Immune System behavior and SCAS characteristics with module references.

## Non-Functional Requirements
- ≤5 files changed, ≤150 net LOC; prefer refactor over patch.
- No new dependencies added.
- Tests should run in <60s locally (fast subset acceptable for gate).
- Messages/logging clear and user-actionable.
