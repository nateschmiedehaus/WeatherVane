# REVIEW PREP — AFP-OVERRIDE-ROTATION-20251106

*(To be finalized post-implementation. Capturing expectations now so agents close the loop.)*

- Implementation must deliver: rotation script, critic enforcement, audit checklist/templates, documentation updates.
- Verification evidence expected: Vitest logs for rotation script, ProcessCritic unit output, manual rotation dry-run results.
- **Remediation TODO:** Schedule a retrospective after the first week of daily rotations/audits to confirm archives stay manageable and adjust thresholds if needed.
- Additional checks: ensure daily audit evidence is committed within ≤24h at review time and that ProcessCritic warnings surface if ledger or audit drift.
- Root cause captured: legacy plans predated PLAN-phase test guidance; updated templates/docs and backfilled each flagged plan with concrete commands so ProcessCritic now passes cleanly.
