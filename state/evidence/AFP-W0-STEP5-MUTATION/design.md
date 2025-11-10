phase: design
task_id: AFP-W0-STEP5-MUTATION

Title: SCAS Essentials in Step 16, Step 17 (CAS Gate Essentials), and Roadmap Entries

Problem Statement
- Stage-7 requires landing SCAS gate specifics and a resilient gate plan without bloating Step 16. The v3 plan mentions SCAS but lacks an explicit attestation schema, a crisp design.md trigger rule, and a CAS-for-gates follow-on step. Roadmap lacks discrete tasks for checker/policy/CI gate.

Goals
- Add minimal SCAS deltas to Step 16 (attestation contract, exceptions protocol, design.md trigger, parity notes).
- Introduce Step 17 (Orchestrated Quality — CAS Essentials for gates) as a lightweight scaffold.
- Add three roadmap tasks under Wave 0 to implement checker, policy, and CI gate.

Scope & Constraints (SCAS/AFP)
- ≤5 files changed; target 3 files: `AUTOPILOT_MASTER_PLAN_V3.md`, `state/roadmap.yaml`, and this `design.md`.
- ≤150 net LOC across edits; keep bullets concise, no duplication of existing content.
- Via negativa: link to existing sections rather than restating; add only missing contracts/anchors.

Via Negativa (What we avoid)
- No new DSLs or orchestration features in Step 16; defer broader CAS features.
- No duplicate policy text; reference the single SCAS policy doc once authored (tracked via roadmap) instead of inventing new files.
- No large rewrites; only append short subsections and roadmap items.

Alternatives Considered
- A) Put everything into Step 16: rejected (bloat, harder to review).
- B) Separate policy doc only, no v3 changes: rejected (discoverability gaps now).
- C) Minimal Step 16 deltas + new Step 17 scaffold + roadmap tasks: chosen for clarity and SCAS budgets.

Complexity Budget
- Files changed: 2 docs + 1 evidence (this file).
- Net LOC: aim ≤130 LOC total (Step 16 deltas ~35–45, Step 17 ~45–55, roadmap ~25–35).

Implementation Plan (Small diffs)
- Insert under Step 16 a new “SCAS Gate Summary” block with:
  - Source of truth path to `state/config/drqc.json` and budgets.
  - Attestation contract fields and path: `state/logs/<TASK>/attest/scas.json`.
  - Exceptions protocol: `scas.allow` and `attest/exceptions.json` note.
  - Design.md trigger rule (files>1 OR net_loc>20) and GATE requirement.
- Append a new “Step 17 — Orchestrated Quality (CAS Essentials)” section outlining scope, outcomes, acceptance, artifacts.
- Add three roadmap tasks in `state/roadmap.yaml` under `W0.M1` (set `w0m1-quality-automation`):
  - AFP-W0-SCAS-CHECKER, AFP-W0-SCAS-POLICY, AFP-W0-SCAS-CI-GATE with focused exit criteria.

Edge Cases & Risks
- Roadmap schema mismatch: align with existing `epics → milestones → tasks` structure; reuse `set_id`.
- Terminology collision CAS vs SCAS: include a small glossary line to avoid confusion.
- LOC overrun: keep bullets terse; avoid repeating existing Step 16 content.

Testing/Verification Plan (Docs-only)
- Link lint: verify referenced paths exist or are queued (policy doc noted as future).
- Render check: headings present; bullets read clearly.
- Roadmap YAML parses (basic YAML sanity by visual review); IDs unique.
- Evidence: this design.md archived; rationale captured.

Acceptance (for this change)
- Step 16 contains the SCAS Gate Summary, attestation fields, exceptions protocol, and design.md trigger.
- Step 17 section exists and is limited to gate resilience (CAS essentials) without repetition.
- Roadmap has three pending tasks under Wave 0 M1 to implement checker/policy/CI gate.

Appendix: CAS vs SCAS Glossary Line
- CAS: Complex Adaptive Systems (orchestrator behaviors and resilience patterns).
- SCAS: Small‑Change Approval System (repo budgets/gates/evidence).

---

## Design Extension — Phase 0–3 Hardening (2025-11-10)

Problem Statement
- Even with Step 16/17 scaffolding, Autopilot bypassed VERIFY/SCAS/End-Steps/TemplateDetector gates. We must harden the actual tooling (verify executor, SCAS/End-Steps scripts, template detector, CI workflows) while staying within two-phase, ≤5 file budgets.

Goals
- Produce deterministic `verify.log` (≥1 KB + SCAS trailer) and canonical coverage JSON via `tools/wvo_mcp/src/executor/verify.ts`.
- Pin Node 20.x in workflows, ensure `npm ci` runs root + tools, and upload verify artifacts (log, coverage, changed files).
- Fail-close SCAS with config-driven budgets + merge-base fallback and log `reasons[]`.
- Enforce End-Steps contracts (log size, SCAS line, canonical coverage/critics paths).
- Constrain TemplateDetector relaxation to body-only analysis plus `template_detector.relaxed_when` config in `state/config/drqc.json`.
- Ensure contract-tests workflow recomputes critics + SCAS, hash-compares, and runs under deterministic TZ/SOURCE_DATE_EPOCH.

Constraints & Via Negativa
- Keep edits surgical: reuse existing helper modules; no new dependency trees.
- Prefer deletion/simplification (e.g., remove legacy rename logic from template detector script).
- Avoid expanding VERIFY scope beyond required vitest suite; instrumentation must not introduce asynchronous flakiness.
- Maintain ≤150 net LOC per commit; stage files by phase (0–3 + CI sweep).

Alternatives Considered
1. **Monolithic refactor** — rewrite verify/critics/gates in a single PR. Rejected: exceeds budgets, risky to review.
2. **CI-only enforcement** — rely on GitHub workflows without local gating. Rejected: violates "close bypasses" requirement; dev workflow would stay weak.
3. **Phased surgical diffs (chosen)** — align with user instructions: commit after each phase, ensure evidence/logs updated incrementally.

Implementation Plan (Phases)
- **Phase 0:**  
  - Add `npm run verify` script (node dist/executor/verify.js).  
  - Update `.github/workflows/verify.yml` with Node 20, `npm ci` root + tools, `npm run build`, `npm run verify -- --task CI-VERIFY`, artifact uploads.  
  - Enhance `verify.ts` to run vitest verify suite before writing artifacts, normalize coverage to `coverage/coverage.json`, pad/annotate `verify.log`, append SCAS trailer when available. To keep complexity manageable, split logging/coverage helpers into `verify_log.ts`, `verify_coverage.ts`, `verify_coverage_utils.ts`, and shared `verify_types.ts`.
- **Phase 1:**  
  - Update `tools/wvo_mcp/scripts/check_scas.mjs` to treat git diff errors as fatal, fall back to `git merge-base` when base invalid, read budgets (`max_files`, `max_net_loc`, `allow`) from `state/config/drqc.json` with env overrides.  
  - Emit structured JSON: `{task,pass,files_changed,net_loc,reasons}` under `state/logs/<TASK>/attest/scas.json`.
- **Phase 2:**  
  - Tighten `tools/wvo_mcp/scripts/check_end_steps.mjs` to require `verify/verify.log` ≥1024 bytes, final SCAS line, canonical `coverage/coverage.json`, and both critics outputs under `critics/`.  
  - Fail with actionable message when artifacts missing or log too small.
- **Phase 3:**  
  - Modify `tools/wvo_mcp/src/critics/template_detector.ts` to strip front-matter (yaml fences) before tokenization/trigram analysis.  
  - Update `tools/wvo_mcp/scripts/run_template_detector.mjs` to always write `state/logs/<TASK>/critics/template_detector.json` (remove rename/move), reusing deterministic ordering.  
  - Move relax configuration into `state/config/drqc.json` under `template_detector.relaxed_when`.  
  - Rebuild + run template detector to refresh artifacts.
  - Ensure the KB ledger (`state/logs/<TASK>/kb/<TASK>.json`) stores the reranker context referenced by TemplateDetector relax mode so doc guard/watchdogs can audit citations.
- **CI Sweep / Deprecation Fixes:**  
  - Pin Node 20.x in `.github/workflows/{verify.yml,end_steps_contract.yml,contract-tests.yml}`; set `TZ=UTC`, `SOURCE_DATE_EPOCH=1700000000`, `actions/checkout` `fetch-depth: 0`.  
  - Extend contract tests to recompute critics & SCAS, hash-compare outputs.  
  - Address `inflight` / `@humanwhocodes/config-array` warnings via package overrides or ESLint 9 migration (guarded by compatibility check).  
  - Document these steps in plan/tests + ledger.

Testing/Verification (per Phase)
- Run `npm --prefix tools/wvo_mcp run build` before/after modifications.  
- Execute `WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION` to populate artifacts (Phase 0).  
- For Phase 1–3, run `node tools/wvo_mcp/scripts/check_scas.mjs`, `check_end_steps.mjs`, and `scripts/run_template_detector.mjs` with `TASK_ID` env.  
- Confirm `verify/verify.log` size via `stat -f%z`.  
- Validate JSON determinism with `jq -S . file > tmp && mv` if needed.

Risks
- Node version mismatch (package engine currently >=24.10). Need to evaluate whether pinning workflows to 20.x conflicts; may require `.nvmrc` update or dual support shim. Document resolution in VERIFY instructions.  
- Coverage normalization may reorder keys; ensure stable sort to prevent diff churn.  
- Template detector changes could flag existing evidence; plan for rerun/regenerate before commit.  
- Deprecation remediation (ESLint 9) might require additional config; fallback is to isolate issue and open follow-up.

Acceptance (Phase 0–3 Addendum)
- Verify workflow produces canonical artifacts and SCAS trailer; `verify.log` ≥1 KB.  
- SCAS + End-Steps scripts fail closed with budgets + artifact checks.  
- TemplateDetector uses body-only analysis + new config; critics outputs stored under `critics/`.  
- CI workflows pinned to Node 20, contract tests recompute critics + SCAS.  
- Deprecation warnings addressed or documented (with follow-up issue if migration blocked).
