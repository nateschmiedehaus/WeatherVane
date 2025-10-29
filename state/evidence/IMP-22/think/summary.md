# THINK Summary — IMP-22

## Edge Cases & Failure Modes
- **Unordered Input:** PersonaSpec consumers may supply arrays in arbitrary order (skill packs, overlays). Canonicalization must sort deterministically (alphabetical domain names, skill pack IDs) or hash will drift.
- **Partial Specs / Legacy Data:** Some workflows may not yet populate persona metadata. Enforcer must handle `undefined` gracefully (warn + skip hashing when flag disabled).
- **Overlay Weight Validation:** Invalid weights should fail fast before hashing; re-use existing validation to avoid canon/hashing inconsistent states.
- **Large Persona Payloads:** Extreme persona definitions (many overlays/skills) shouldn’t explode hash runtime; measure and ensure <1ms.

## Oracles & Verification
- Deterministic canonicalization test set with permutations -> expect identical hash (Vitest).
- Attestation integration test verifying `persona_hash` presence and diff detection when persona input changes.
- Ledger unit test ensuring new field persists and remains backward compatible (older entries without field parse).
- Telemetry smoke update: `prompt_drift_detected` metadata includes persona hash; verify via jq assertions.

## Observability & Instrumentation
- Add structured log (`PERSONA DRIFT DETECTED`) at warning level referencing task + phase.
- Reuse existing tracers; add span attributes `persona.hash` when available.
- Counter naming: reuse `prompt_drift_detected` with metadata `{dimension: 'persona'}` or add `persona_drift_detected`; confirm with telemetry team.

## Determinism & Performance
- Canonicalization to use `JSON.stringify` on sorted structure; ensure timezone/locale not involved.
- Benchmark canonicalization in tests (≥1000 iterations) to confirm <1ms average.

## Open Questions
- Best location for compiler adapter export (shared module vs new file) — pending Claude alignment.
- Should persona hash be included in evidence bundles for PR reviewers? Might extend evidence collector.
