# Spec: AFP-ROADMAP-AUTONOMY-DOCSYNC-20251105

## Acceptance Criteria

### AC1: Wave Roadmap Narrative Reflects Autonomy Journey
- `docs/ROADMAP.md` rewritten to describe AFP "Wave" phases focused on autonomy scaffolding, self-knowledge, experimentation, and final autonomy proof.
- Each wave includes objective, key workstreams, and exit criteria tied to Autopilot capability.
- Document references AFP/SCAS principles and cross-links meta tasks (readme automation, guardrails).
- ✅ Verified via doc review (diff) and `rg "Wave 0" docs/ROADMAP.md`.

### AC2: Operational Roadmap Mirrors Wave Priorities
- `state/roadmap.yaml` milestones/tasks reorganised into wave-aligned structure.
- Critical tasks include: roadmap governance, README automation hardening, knowledge base curation, autonomy stress-tests (game/tool/program builds).
- Dependencies enforce “wave gating” (later waves blocked until prior exit criteria satisfied).
- ✅ `scripts/check_roadmap_parity.ts` passes (if applicable) and manual diff shows waves.

### AC3: Agent Instructions & Guardrails Updated
- `AGENTS.md` (and related roadmap rules, e.g., `docs/orchestration/roadmap_intake.md` if necessary) instruct agents to execute wave tasks first, define escalation when backlog conflicts, and highlight meta-task obligations.
- Policies include guidance for README automation upkeep (when to regenerate, how to evaluate critical warnings, requirement to update knowledge base when code changes cross boundaries).
- ✅ Manual diff confirms new directives.

### AC4: Docsync Scope & Guardrails Hardened
- `.docsyncignore` introduced/updated to exclude noisy directories (build outputs, caches, vendor data).
- `tools/docsync/analyzer.ts` refined allowlist (e.g., explicit curated directories, autop-run meta directories).
- Pre-commit guardrail `.githooks/pre-commit` updated (if necessary) to prevent non-curated bulk operations and log overrides.
- `state/analytics/readme_manifest.json` refreshed with new scope (≤120 entries) and includes metrics for all tracked directories.
- README template emphasises critical evaluation section (existing docsync output handles).
- ✅ `npm run readme:update -- --mode staged` followed by `npm run readme:check` passes.

### AC5: "Never Again" Safeguards for README Floods
- Automated check (unit test or script) asserts tracked directory count ≤ configured ceiling OR high-risk directories excluded.
- Documented procedure and policy in `docs/README_AUTOMATION.md` for running safe regenerations.
- State/log file (`state/analytics/readme_manifest.json`) records tracked count, with remediation task triggered when threshold crossed.
- ✅ Add test or script + instructions; demonstrate by running test/analysis command.

### AC6: README Knowledge Base Deployment Workflow
- README automation includes meta tasks for missing README detection, critical evaluation follow-up, and Module index/regeneration tasks (per Quick wins list).
- Module README template + index generation steps either implemented or scheduled in roadmap wave tasks with clear deliverables.
- ✅ Roadmap tasks list items: template, generation script, module index, dependency diagrams, first-time guides, auto-update mechanism.

### AC7: Evidence Artifacts
- AFP phases documented: `strategy.md`, `spec.md`, `plan.md`, `think.md`, `design.md`.
- DesignReviewer run recorded (if tooling available) OR reason documented if not.
- ✅ Files present in `state/evidence/AFP-ROADMAP-AUTONOMY-DOCSYNC-20251105/`.

---

## Non-Functional Requirements

- Changes stay within AFP micro-batching once guardrail adjustments accounted for (or override documented).
- Documentation is concise and actionable; avoids redundancy.
- Scripts/tests execute within CI budgets (<5 minutes).
- README generation deterministic across runs (manifest digest stable).

---

## Out of Scope

- Implementing the actual "make a game/tool" programs (those become future tasks).
- Creating a full DesignReviewer integration for README automation (document requirement and schedule via roadmap).
- Modifying third-party directories (e.g., vendor libs) beyond ignore lists.
