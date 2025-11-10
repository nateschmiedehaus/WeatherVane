---
phase: design
task_id: AFP-W0-STEP5-MUTATION
timestamp: 2025-11-10T00:10:00Z
citations:
  - file: tools/wvo_mcp/scripts/check_scas.mjs
    start_line: 1
    end_line: 40
    sha256: 6b15ace0d35401b530da9ae362800656073fc2dbd0361ca0cb594b18cdc159df
  - file: .github/workflows/quality_gates.yml
    start_line: 1
    end_line: 80
    sha256: d3ec218717bcec0770048cca1badc3f4a347b7860607cc7adf5c9128d9e7cd86
  - file: scripts/rollback.mjs
    start_line: 1
    end_line: 20
    sha256: db345902d04cf55d1d28673bc99ec381172476819cb6f1221fc32cbaa1cd0237
---

# Stage 16/17 SCAS + Governance Design

## Objectives
- Seal Step 16 by wiring a deterministic SCAS attestation command (`check_scas.mjs`) and CI gate (`quality_gates.yml`).
- Prepare Step 17 by documenting how roadmap trackers and release automation consume those SCAS outputs and rollback scripts.

## Approach
1. `check_scas.mjs` writes `state/logs/<TASK>/attest/scas.json` with the coverage/template/docsync/prompt/attestation summary. CI runs it on every PR.
2. `quality_gates.yml` executes VERIFY → ProcessCritic → SCAS; artifacts uploaded for auditors.
3. `scripts/rollback.mjs` prints the exact commands to reset default to the last safety tag; dry-run transcripts are stored under `state/logs/<TASK>/release/`.
4. Roadmap entries will reference these artifacts so Steps 8-17 have traceable KPIs.

## Risks
- Missing critic files for Steps 2-7 keep later KPIs red. Mitigation: coverage report (steps_coverage.md) highlights gaps.
- CI drift. Mitigation: gates workflow is path-scoped and uses `npm --prefix tools/wvo_mcp ci` only for the MCP package.

## Evidence Plan
- Design doc stored at `state/evidence/AFP-W0-STEP5-MUTATION/design.md`.
- Coverage report + roadmap commits link Step statuses to artifacts.
