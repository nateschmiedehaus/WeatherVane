# Specification — IMP-22 PersonaSpec canonicalize/hash + attestation integration

## Acceptance Criteria
1. **Deterministic Persona Canonicalization**
   - Provide a helper (`canonicalizePersonaSpec` or equivalent) that produces a stable JSON string for any `PersonaSpec`.
   - Sorting rules: object keys alphabetical, array elements sorted deterministically (phase role first, then domain overlays by domain name, etc.).
   - SHA-256 hash helper returns same value across processes; unit tests cover representative specs and fuzzed permutations.

2. **Attestation & Ledger Integration**
   - `PromptAttestation` records include `persona_hash` (and optional persona metadata summary) for ≥99% attested phases.
   - Phase ledger entries capture persona hash alongside prompt hash; WorkProcessEnforcer logs high-severity persona drift when hashes change unexpectedly.
   - Telemetry counters (`prompt_persona_drift` or reuse existing) emit severity-tagged events.

3. **Compiler / Runtime Adapter**
   - Export persona serialization helper for IMP-21’s compiler to consume (even if feature-flagged until IMP-21 lands).
   - Provide TypeScript types/shared module so compiler and router reference the same interface.
   - Feature flag guards ensure existing production runs continue if persona data missing (fail-open warning).

4. **Documentation & Runbook**
   - Update `docs/autopilot/WORK_PROCESS.md` (or relevant prompt README) to describe persona hashing workflow, attestation fields, and audit commands.
   - Telemetry sinks doc includes persona hash queries similar to prompt drift guidance.

## Non-Goals
- Implementing prompt compiler persona slot population (handled by IMP-21/IMP-24).
- Tool router enforcement changes (IMP-25).
- Observer or dashboard visualization beyond listing persona hash (future IMP-26).

## Constraints
- Keep runtime dependencies local (Node stdlib only); no external canonicalization packages.
- Hash computation must add <1ms per phase on average — enforce via micro-benchmarks or measurement.
- Backward compatible: legacy attestation entries without `persona_hash` must continue to parse.

## Verification Plan
| Requirement | Verification |
|-------------|--------------|
| Deterministic canonicalization | New unit tests in `persona_spec.test.ts` with permutation fuzzing (Vitest). |
| Hash stability across runs | Repeat hash calculation in test suite and optional benchmark. |
| Attestation integration | Update `prompt_attestation.test.ts` + new integration test in `work_process_acceptance.test.ts` ensuring hash recorded and warnings emitted on drift. |
| Ledger persistence | Add assertion in ledger tests verifying persona hash column populated. |
| Telemetry emit | Extend tracing smoke or dedicated test to confirm counters/logs include persona info. |
| Docs updated | Manual verification + link in REVIEW artefacts. |

## Dependencies / Open Questions
- Coordinate with Claude on IMP-21 to agree on persona slot input format before implementation.
- Decide whether persona summary string (for logs) should include domain overlays or just hash (lean minimal for now).
- Confirm telemetry naming convention (`persona_hash` vs `personaHash`) with Observability team.
