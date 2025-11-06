# SPEC — AFP-OVERRIDE-ROTATION-20251106

## Acceptance Criteria

1. **Override Rotation Workflow**
   - A documented + scripted process rotates `state/overrides.jsonl` into timestamped archives (e.g., `state/analytics/override_history/YYYY-MM-DD.jsonl`) once the primary file exceeds a configurable threshold or monthly cadence, retaining full history.
   - Rotation script/hook updates docs and is referenced by ProcessCritic so commits fail if rotation evidence is missing.

2. **Daily Artifact Audit**
   - Establish a reusable checklist/template (`docs/checklists/daily_artifact_health.md`) capturing steps to verify no untracked artifacts at least once every 24 hours.
   - Record audit results in committed evidence (`state/evidence/AFP-ARTIFACT-AUDIT-<YYYY-MM-DD>/summary.md` or similar).

3. **Enforcement & Visibility**
   - ProcessCritic (or companion critic) validates that:
     - Override ledger size ≤ threshold OR latest rotation artifact exists.
     - A daily artifact audit evidence file exists covering the last 24-hour window.
   - CI/pre-commit hook mirrors enforcement to prevent bypass.

4. **Documentation & Ownership**
   - Update AGENTS/claude docs and `MANDATORY_WORK_CHECKLIST.md` to reference rotation/audit duties.
   - Define ownership (team/role) responsible for running rotations and audits; captured in documentation.

## Non-Functional Requirements

- Rotation must be idempotent and safe to run multiple times.
- Archives stored under Git control for diffs but small enough to keep repo healthy (e.g., compress or split by month/week).
- Implementation respects AFP micro-batching (split across commits if needed).

## Out of Scope

- Building a full scheduling daemon; acceptable to rely on documented cadence + critic enforcement.
- Rewriting overall override logging mechanism (beyond rotation + visibility enhancements).
