# IMP-22 — Strategy

## Reality Check
- Prompt compiler (IMP-21) remains standalone; prompts executed in production still rely on ad-hoc string assembly without persona awareness.
- `PromptAttestation` persists only the canonical prompt hash and severity metadata; persona selections are opaque to reviewers and drift detection.
- Persona definitions live in `persona_router/persona_spec.ts`, but there is no canonical serialization or hashing, so tool allowlist and rubric decisions cannot be audited.
- Downstream roadmap items (IMP-24/25/26/35) expect a PersonaSpec hash in ledger, telemetry, and tool-router guards; without this integration they cannot enforce variants or trace drift.

## Objectives
1. Canonicalize PersonaSpec data (phase role, overlays, skill packs, capabilities) into a deterministic JSON form and derive a stable SHA-256 hash.
2. Surface persona metadata and hash alongside prompt hash in attestation history, telemetry counters, and the phase ledger so drift can be detected and audited.
3. Provide compiler-facing helpers (or adapters) that allow IMP-21 to inject persona content into prompt slots without duplicating serialization logic.

## Success Criteria
- Hash stability: repeated canonicalization of the same PersonaSpec produces identical output across processes and restarts (covered by unit tests).
- Attestation records include `persona_hash` and relevant metadata for ≥99% transitions; auditors can diff persona changes alongside prompt changes.
- Minimal integration footprint: existing persona router modules remain source of truth; no runtime dependency on external services.

## Constraints & Assumptions
- IMP-21 is still in progress; interface changes will be coordinated (expect exported `compilePrompt` to accept persona payloads).
- Canonicalization must be deterministic, ASCII-only, and independent of object key insertion order (use sorted keys/arrays).
- Hashing must avoid double-work: reuse existing crypto utilities where possible (PromptAttestation).
- Work must remain flag-guarded so we can stage persona hashing without breaking current runs.

## Risks
- Dependency drift if IMP-21 adjusts slot schema; mitigate by syncing with Claude before implementation and writing adapter tests.
- Increased attestation payload size; ensure serialization stays lightweight (<1 KB typical) and fails open if persona data missing.
- Potential mismatch between persona definitions and tool router expectations; coordinate with IMP-25 owner to document shared schema.

## Stakeholders
- Claude (IMP-21 owner) — interface and prompt slot alignment.
- Atlas/Observability teams — need persona hash in telemetry dashboards.
- Tool Router/Policy owners — rely on persona metadata to enforce allowlists in later tasks.

## Go / No-Go
- ✅ Proceed: Work addresses a blocking dependency for IMP-24/25/26, fits Phase 1 priorities, and can be staged safely behind flags.
