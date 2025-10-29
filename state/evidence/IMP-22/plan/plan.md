# Implementation Plan — IMP-22

## Seam & High-Level Approach
- Extend the existing persona router module (`tools/wvo_mcp/src/persona_router/persona_spec.ts`) with canonicalization + hashing helpers exported for reuse.
- Update `PromptAttestationManager` to accept optional persona metadata, persist `persona_hash`, and surface it in JSONL logs and `getDriftStats`.
- Modify WorkProcessEnforcer to pass persona data into attestation calls (feature-flagged) and record persona hash in the phase ledger/telemetry.
- Provide compiler-facing adapter (likely `tools/wvo_mcp/src/prompt/compiler_adapters.ts` or an extension to the PersonaSpec module) so IMP-21 code can import and call the canonicalization helper once ready.
- Document workflow in prompt README + telemetry sinks; add delta note guidance if persona data missing.

## Change Budget
- Allowed dirs: `tools/wvo_mcp/src/persona_router`, `tools/wvo_mcp/src/orchestrator/prompt_attestation.ts`, `tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts`, `tools/wvo_mcp/src/orchestrator/phase_ledger.ts`, `tools/wvo_mcp/src/telemetry`, `tools/wvo_mcp/scripts`, `docs/telemetry/TELEMETRY_SINKS.md`, `docs/autopilot/IMPROVEMENT_BATCH_PLAN.md`.
- Tests: new/updated Vitest suites under `tools/wvo_mcp/src/persona_router/__tests__/` and attestation/enforcer test folders.
- Diff budget: ≤ 600 LOC net (heavy test additions expected); raise flag if exceeding.
- Feature Flags: introduce `PERSONA_HASHING_ENABLED` (default observe/off) to guard runtime behavior until IMP-21 integration validated.

## Work Breakdown
1. **Canonicalization Helper**
   - Implement `canonicalizePersonaSpec` + `hashPersonaSpec`.
   - Add unit tests covering permutations, invalid input, and hash stability.
2. **Attestation Integration**
   - Extend `PromptAttestation` interface to include persona fields.
   - Update record writer/readers and drift stats.
   - Backfill legacy JSON entries gracefully (default `persona_hash` undefined).
3. **Ledger & Telemetry Updates**
   - Persist persona hash in `PhaseLedger.appendTransition`.
   - Emit counter or structured log on persona drift (reuse `prompt_drift_detected` with severity? or add dedicated field).
   - Update tracing smoke/test to assert persona metadata present when flag on.
4. **WorkProcessEnforcer wiring**
   - Thread persona info (initially stub placeholder until IMP-21 finalizes) into attestation call.
   - Under flag, call canonicalization helper; otherwise skip with warning.
5. **Documentation & Runbook**
   - Update telemetry sinks doc with persona queries.
   - Note new attestation field in improvement plan status.
6. **Coordination / Handshake**
   - Sync with Claude to confirm compiler persona slot API; adjust helper exports accordingly before implementation coding.

## Rollback Plan
- Feature flag default `off/observe` ensures no immediate production change; rollback by flipping flag off and reverting persona hash writes (guard writes when disabled).
- Code rollback: revert modified files; remove persona hash columns from ledger entries; purge new telemetry fields (safe as additive).

## Outstanding Questions
- Final name/location for compiler adapter — align with IMP-21 branch before coding.
- Should persona hash be included in telemetry counters or separate JSON lines? (lean: augment existing `prompt_drift_detected` metadata).
- Storage schema for ledger: confirm JSON structure can accept new field without migration (likely yes).
