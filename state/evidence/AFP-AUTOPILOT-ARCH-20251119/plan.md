# PLAN - AFP-AUTOPILOT-ARCH-20251119

**Date:** 2025-11-19  
**Author:** Codex  
**Phase:** PLAN

## Approach
- Draft a concise architecture doc in `docs/orchestration/` that maps each AFP phase to concrete automated roles/tools (agents, critics, sandboxes, telemetry). Include inputs/outputs, RAG/context needs, and how to integrate existing guardrails (DesignReviewer, ProcessCritic, TestsCritic, Wave0 live checks).
- Build a comparison table: ideal full-autonomy web-dev stack vs current instituted AFP/guardrail process; highlight prioritized gaps with recommended actions/owners/time horizons.
- Emphasize via negativa: identify manual ceremonies that can be deleted once automation is in place, and guardrail controls that should be automated instead of manual checklists.
- Keep changes small: add one doc, update evidence files, update `state/context.md`, and rerun guardrail monitor after audit.

## Files to Change
- `docs/orchestration/autopilot_afp_alignment.md` (new architecture/alignment doc)
- `state/context.md` (brief update for current task progress + new doc reference)
- Evidence: `state/evidence/AFP-AUTOPILOT-ARCH-20251119/*` (phase docs, design, validation)

## Verification Plan (authored now)
- **PLAN-authored tests (to run in VERIFY):**  
  - `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` (transparency; capture failures in verify.md).  
  - `node tools/wvo_mcp/scripts/check_guardrails.mjs` (post-audit).  
  - Manual doc review vs acceptance criteria (architecture mapping, gaps/actions, rollout).  
  - No additional tests beyond the above; docs-only scope, so this list is complete.
- Guardrails: Document daily audit execution; ensure guardrail monitor rerun captured.
- Autopilot live loop: Not applicable to this docs-only task; autopilot code tasks must list Wave0 steps in their own PLAN.
- Note: Monitor updates track follow-ups (MCP STRATEGIZE instrumentation, integrity remediation, clean-room snapshot handling) and do not add new implementation scope.

## Risks / Mitigations
- **Risk:** Guardrail monitor continues to fail if audit not recognized. **Mitigation:** Ensure audit summary staged and rerun monitor; adjust summary if needed.
- **Risk:** LOC/file limits exceeded by evidence proliferation. **Mitigation:** Keep architecture doc concise; avoid touching extra files.
- **Risk:** Recommendations too theoretical. **Mitigation:** Anchor gaps/actions to existing tooling and commands; include near-term, actionable steps.

## Dependencies
- Templates for design phase: `docs/templates/design_template.md`.
- Existing guardrail scripts available and runnable in current environment.
- Context from `docs/orchestration/unified_autopilot_enhancement_plan.md` and AGENTS.md.

## Exit Criteria for IMPLEMENT
- design.md approved by DesignReviewer.
- Architecture doc + comparison table authored and aligned to spec.
- Verification commands executed and logged in verify.md.
