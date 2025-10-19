# WeatherVane Orchestrator Refactor — Implementation Guide

_Last updated: 2025-10-17_

This guide documents the live plan for the WeatherVane MCP orchestrator refactor (“Genius Mode” runtime). It tracks the zero-downtime upgrade harness, blue/green worker flow, and validation gates that keep Autopilot safe while code evolves. Update this file whenever milestones complete or assumptions change.

---

## 1. Objectives
- **Zero-downtime upgrades** – promote staged workers without interrupting the active session, with automatic rollback on failure.
- **Deterministic state & telemetry** – dual-write staging state, keep parity checks green, surface shadow diffs in operator dashboards.
- **Stronger guardrails** – ensure DRY_RUN safeguards, command allow-lists, and critic coverage hold across active and canary lanes.

---

## 2. Current Status Snapshot
- `tools/wvo_mcp/scripts/mcp_safe_upgrade.mjs` provisions a staging workspace (`tmp/wv-upgrade-*`), mirrors `state/`, builds/tests the staged copy, and runs structured shadow validation.
- The harness writes artifacts to `experiments/mcp/upgrade/<timestamp>/` and records a lightweight summary at `state/analytics/upgrade_shadow.json`.
- `OperationsManager` reads the summary and exposes `.queue.shadow_diffs` (count, recorded timestamp, diff path) so `orchestrator_status` and telemetry streams can highlight drift.
- Unit coverage ties the loop together:
  - `operations_manager_shadow.test.ts` checks that snapshots surface shadow metadata.
  - `orchestrator_status.test.ts` verifies worker tool responses include the diff summary.

---

## 3. Phase Plan

| Phase | Theme | Key Deliverables | Exit Criteria |
| ----- | ----- | ---------------- | ------------- |
| **P0** | Alignment & scaffolding | Roadmap audit, baseline metrics, guide linked from repo | Stakeholders sign-off, metrics stored under `state/analytics/` |
| **P1** | State & storage | SQLite schema consolidation, parity checker, `WVO_STATE_ROOT` overrides | 72 h clean dual-write, parity script green |
| **P2** | Orchestration core | `WorkerManager` blue/green lanes, IPC proxying, DRY_RUN canary | Canary handles `plan/dispatch/report.mo`, swap+rollback proven |
| **P3** | Quality & safety | Executor allow-list, strict DSL, critic reputation tracking | Integrity suite (`tools/wvo_mcp/scripts/run_integrity_tests.sh`) green |
| **P4** | Observability & ops | Shadow diff surfacing, upgrade harness automation, telemetry dashboards | `orchestrator_status` publishes queue diffs, Grafana/CLI views wired |
| **P5** | Rollout & adoption | Canary promotion SOP, flag flip sequencing, operator training | Runbook signed, rollback drill executed, ops comfortable |

---

## 4. Upgrade Harness Deep Dive

### 4.1 Staging Workflow
1. **Preflight** – fails fast on dirty worktrees or missing sqlite binaries (skippable via `--allow-dirty`).
2. **Stage copy** – copies `tools/wvo_mcp/` and `state/` into `tmp/wv-upgrade-<id>/`.
3. **Build/Test** – runs `npm run build` (both roots) and optionally `npm test`. Tests can be skipped (e.g., `--skip-tests`) during triage but must pass before promotion.
4. **Shadow validation** – spawns active worker (live state) plus dry-run canary (staged state, `WVO_DRY_RUN=1`), executes `dispatch`, `verify`, `plan_next`, `orchestrator_status`, `autopilot_status`, and diffs results.
5. **Summary logging** – writes diff metadata to:
   - `experiments/mcp/upgrade/<id>/shadow.json` (full detail)
   - `state/analytics/upgrade_shadow.json` (count, relative path, ISO timestamp)

### 4.2 Step Status Semantics
- Steps emit `status: "ok" | "skipped" | "warning"` in `steps.json`.
- Shadow validation now uses `"warning"` (not `"failed"`) when differences exist so we can proceed with analysis while still highlighting the drift.
- CLI output reflects the highest severity:
  - No warnings → `[upgrade] All checks passed.`
  - Warnings present → `[upgrade] Completed with warnings (review noted shadow differences).`
- Any hard failure (build/test/preflight) throws and stops the run; the summary is not emitted.

### 4.3 Promotion Checklist (manual `--promote`)
1. Rerun harness without `--skip-tests`.
2. Start live canary (`WVO_DRY_RUN=0`, state snapshot) and call `WorkerManager.switchToCanary()`.
3. Observe metrics ≥10 minutes (queue parity, critics, token pressure).
4. Flip feature flags one at a time (`PROMPT_MODE`, `SANDBOX_MODE`, `SELECTIVE_TESTS`, …).
5. Record promotion summary under `experiments/mcp/upgrade/<id>/promotion_plan.json`.

---

## 5. Regression Watchlist

| Area | Risk | Mitigation |
| ---- | ---- | ---------- |
| Shadow parity | Queues/tasks diverge because staging lacks real-time context | Copy full `state/` snapshot, run harness promptly, review `shadow_diffs` before promotion |
| State drift | Stage snapshot missing WAL files | Use `fs.cp` recursive copy; if sqlite errors persist, re-run harness after a clean shutdown or `VACUUM` |
| Workspace lock | `state/upgrade.lock` left behind on crash | Harness removes lock in `finally`; operators should manually delete stale lock before reruns |
| Telemetry gaps | Ops dashboards unaware of diffs | `OperationsManager` surfaces `.queue.shadow_diffs`; add monitoring to alert when `count > 0` for >2 runs |

---

## 6. Testing & Evidence
- `npm run build --prefix tools/wvo_mcp`
- `npm test -- --runInBand` (Vitest suite, includes autopilot E2E harness)
- Targeted harness rehearsal:\
  `node tools/wvo_mcp/scripts/mcp_safe_upgrade.mjs --skip-tests --allow-dirty`\
  Artifacts: `experiments/mcp/upgrade/<timestamp>/`
- Manual review: open `shadow.json`, confirm diffs match expectations before promotion.

---

## 7. Next Steps
1. Remove `--skip-tests` from rehearsals once workspace cleanliness is restored; require green tests before any live promotion.
2. Wire `upgrade_shadow.json` into dashboards/alerts so operators see drift without running the harness.
3. Integrate harness into nightly CI (warn-only on shadow diffs, fail on build/test errors).
4. Extend `mcp_safe_upgrade.mjs` with configurable shadow check suites (e.g., allow custom tool lists).

---

## Appendix
- **Harness usage**: `node tools/wvo_mcp/scripts/mcp_safe_upgrade.mjs --workspace .. --allow-dirty --skip-tests`
- **Artifacts**: `experiments/mcp/upgrade/<timestamp>/`
- **Shadow summary**: `state/analytics/upgrade_shadow.json`
- **Telemetry**: `state/analytics/worker_manager.json`, `experiments/mcp/upgrade/<timestamp>/steps.json`

Keep this guide in sync with code and operational learnings. When the refactor reaches new milestones (e.g., promotion automation or telemetry dashboards), add evidence links and updated exit criteria.
