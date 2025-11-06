# Design: AFP-W0-WAVE0-STATUS-CLI-20251106

---

## Context

Wave 0 remains the forced verification loop for autopilot work, yet there is no first-class way to see whether it is actually running. Every time a reviewer or Atlas needs proof, they hand-run `ps`, open multiple JSONL files, and mentally correlate timestamps. This is brittle (permission issues on `ps`, stale locks) and wastes minutes per inquiry. Goal: provide a repo-native CLI that aggregates lock + telemetry data and surfaces it in both textual and JSON formats so humans and scripts can answer the question immediately.

---

## Five Forces Check

### COHERENCE
- Searched for similar patterns:
  1. `plan_next` (root script invoking MCP tooling).
  2. `autopilot_status` (root script calling MCP CLI).
  3. `tools/wvo_mcp/scripts/run_wave0.mjs` (existing automation around Wave 0).
- Pattern reused: lightweight root-level executable + helper functions exported for tests. Deviates slightly because logic lives in the same file (CommonJS) rather than TypeScript -> dist, keeping footprint minimal.

### ECONOMY
- Via negativa considered (see section below). Cannot delete existing commands because none aggregate telemetry; new addition limited to ~130 LOC + one test file.
- LOC estimate: `+130` (CLI) + `+150` (tests/docs/evidence) ≈ net `+200` including documentation (code delta ≤150 as required).

### LOCALITY
- All executable logic resides in the new `wave0_status` script and matching test under `tests/`. Documentation change confined to a single workflow guide.
- Dependencies limited to Node core modules (fs, path, os). No spreading across unrelated modules.

### VISIBILITY
- CLI prints explicit status enums (running/stale_lock/idle) and warnings; JSON mode exposes structured data for automation.
- Errors (missing files, parse failures) are surfaced in output rather than swallowed.

### EVOLUTION
- Pattern classification: **medium leverage** utility—script is user-facing but not a critical API. Testing covers happy path + stale lock.
- Success measured by adoption in docs and ability to paste CLI output into evidence.

**Commit message stub**
```
Pattern: repo-cli-wave0-status
Deleted: replaced manual ps/tail instructions in docs with single command
```

---

## Via Negativa Analysis

- Reviewed `docs/workflows/AFP_REVIEWER_ROUTINE.md` and `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md`. Only solution today is textual guidance (“run ps, tail logs”). Nothing to delete that would yield an automated answer.
- Considered enhancing `autopilot_status` MCP tool, but that requires reviving a broken server path (`plan_next` currently failing) and still forces CLI -> MCP hop.
- Therefore addition is justified: we are *removing* duplicated manual instructions by centralising them into one script.

---

## Refactor vs Repair Analysis

This is a refactor-level fix: addressing the systemic lack of instrumentation rather than adding yet another troubleshooting doc. No large modules (>200 LOC) modified; new module introduced. Minimal tech debt: script may later migrate into MCP or dashboards, but current solution remains simple and testable.

---

## Alternatives Considered

### 1. **Documentation-only reminder**
- **What:** Expand docs with step-by-step instructions (ps + tail).
- **Pros:** Zero code, immediate.
- **Cons:** Still manual, still requires elevated `ps`, still error‑prone.
- **Rejected:** Does not solve root cause (no automation).

### 2. **Extend MCP `autopilot_status` tool**
- **What:** Teach MCP server to read telemetry and surface via `autopilot_status`.
- **Pros:** Uniform interface, works from any MCP client.
- **Cons:** Requires MCP worker health (currently flaky), adds latency, doesn’t help when MCP cannot start (exact scenario we faced). More complex to test.
- **Rejected:** Overkill for immediate need; CLI offers faster iteration and fewer dependencies.

### 3. **Selected – Standalone CLI + tests**
- **What:** Add repo-local executable aggregating lock + telemetry files with JSON/text output.
- **Why:** Small footprint, no external dependencies, works even when MCP is down, fits existing pattern of root helpers (`plan_next`, `autopilot_status`).
- **AFP alignment:** Via negativa (removes manual workflow), locality (single module), visibility (clear status), evolution (measurable adoption through doc references).

---

## Complexity Analysis

- **Increase:** +1 CLI + +1 test file. Complexity justified because it eliminates an O(minutes) manual process and provides structured data.
- **Decrease:** Operational workflow now one command instead of multiple manual steps; documentation simplified.
- **Mitigation:** Keep implementation under 150 LOC, avoid dependencies, export helper for tests to prevent duplicated parsing logic.

---

## Implementation Plan

- **Files:** `wave0_status` (new), `tests/wave0_status.test.js` (new), `docs/workflows/AFP_REVIEWER_ROUTINE.md` (update), evidence docs (this folder).
- **PLAN-authored tests:** `tests/wave0_status.test.js` covering:
  - collects healthy status when lock + runs exist.
  - flags stale lock when PID dead.
  - handles missing telemetry gracefully.
- **Autopilot scope:** N/A (read-only telemetry; no Wave 0 code touched).
- **Estimated LOC:** ~130 (CLI) + ~100 (test) + doc delta (~20). Within ≤150 LOC net for executable code; doc/evidence excluded from guardrail.
- **Micro-batching:** ≤3 code/docs files (plus evidence).

**Risks & mitigations**
- Stale lock false positives → include lock age + human guidance.
- PID permission errors → catch EPERM, mark status `unknown`.
- Large files → limit to tail of JSONL (read last ~200 lines) to keep CLI quick.

**Assumptions**
- Node ≥18 available; repo path accessible via `__dirname`.
- Wave 0 lock uses `{ pid, startTime }`; JSON lines well-formed most of the time.
- Operators run CLI from repo root (or use `--root` override).

---

## Review Checklist

- [x] Explored via negativa (docs-only fix) and explained why insufficient.
- [x] Described alternatives (docs vs MCP vs CLI).
- [x] Scope within limits (≤5 files, ≤150 LOC code).
- [x] Documented tests to be authored now (`tests/wave0_status.test.js`) and VERIFY commands (`node --test …`, `./wave0_status --json`).
- [x] Considered edge cases/failure modes (missing files, stale lock, PID reuse, permissions).
- [x] Locality maintained (new script + test only).

---

## Notes

- CLI will emit ISO timestamps + relative ages to make evidence copy/paste friendly.
- JSON schema intentionally flat to keep future automation simple (`status`, `lock`, `recentRuns`, `warnings`).
- Future enhancement path: MCP tool can simply shell out to this CLI or reuse shared helper.

**Design Date:** 2025-11-06  
**Author:** Codex

---

## GATE Review Tracking

| Review | Date | Result | Notes |
|--------|------|--------|-------|
| 1 | _pending_ | _pending_ | Will run `npm run gate:review AFP-W0-WAVE0-STATUS-CLI-20251106` after filling docs |
