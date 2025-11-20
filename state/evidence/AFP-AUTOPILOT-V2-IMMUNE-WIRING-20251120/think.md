# THINK - AFP-AUTOPILOT-V2-IMMUNE-WIRING-20251120

## Edge Cases (5+)
- Missing branch name in hook -> block with guidance.
- Commit message multi-line or empty -> enforce first line, trim.
- CI command missing/timeout -> fail with clear error.
- Hook runs outside git repo -> warn and fail safe.
- Wave0 lock may block live check -> record; no lock deletion.

## Failure Modes
- Hook not invoked -> no enforcement. Mitigation: document integration point; guardrail confirmation.
- Overly strict regex blocks valid commits -> ensure conventional format; log guidance.
- CI gate hangs -> optional timeout; surface stderr.
- Protected branch list stale -> allow config/env.

## Assumptions
- Vitest available; no new deps.
- Conventional commits policy stands.
- Protected branches default to main.
- wave0 may be locked; do not delete lock.

## Testing Strategy
- Vitest gatekeeper tests (branch/commit/CI pass/fail).
- Guardrail monitor post-change.
- commit:check to capture hygiene.
- wave0 dry-run to log lock state.

## SCAS
- Feedback: gates + tests + guardrail.
- Redundancy: branch/commit/CI layers.
- Visibility: actionable logs.
- Adaptation: config for branches/CI command.
