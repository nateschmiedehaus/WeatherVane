# Worthiness & Alignment — IMP-22

- **Epic / Objective:** Prompting Reliability — Persona & Overlay Integration (Phase 1 roadmap)
- **Primary KPI:** Prompt drift false-negative rate → target 0% for persona changes (baseline currently untracked); secondary KPI is audit latency for prompt/persona discrepancies (<15 min via telemetry dashboards).
- **Why Now:** IMP-05 elevated attestation policy but lacks persona provenance; downstream tasks (IMP-24/25/26/35) require persona hashing to enforce tool allowlists, variants, and eval gates. Without this work, prompt variance remains invisible and gates cannot fire.
- **Alternatives Considered:**
  1. _Deferring until IMP-24:_ rejected — IMP-24 would be blocked waiting on persona hash semantics.
  2. _Embedding persona metadata directly in prompts without hashing:_ rejected — loses drift detection, increases diff noise, and breaks ledger linkage.
- **Kill / Pivot Triggers:**
  - If IMP-21 changes scope to include persona canonicalization internally, reassess ownership (merge or adjust surface).
  - If attestation storage footprint exceeds 5 MB per 1k entries post-integration, consider compressed format before proceeding.
- **Risks / Mitigations:**
  - Schema drift between persona router and prompt compiler → maintain TypeScript types in shared module, add cross-package unit tests.
  - Coordination timing with Claude → schedule interface handshake before SPEC sign-off; track as dependency in PLAN.
