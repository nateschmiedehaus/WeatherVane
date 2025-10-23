# Unified Autopilot Enhancement Plan

Date: 2025-10-22  
Author: Codex (on behalf of Atlas & Director Dana)  
Scope: Hardening UnifiedOrchestrator so the MCP stack behaves like a world-class product & engineering organization every run.

---

## 1. Objective

Deliver a resilient, policy-aware orchestration loop that:

1. Preserves proven guardrails from the legacy bash autopilot.
2. Embeds expert planning lanes (Sonnet 4.5 + Codex 5-high) with historical awareness for architectural work.
3. Routes roadmap intake, prioritization, and dependency logic automatically—no manual intervention.
4. Provides auditable traces (policy history, memos, telemetry) that match executive expectations.

Success is measured when a fresh autopilot run can:

- Accept new intake proposals without human edits.
- Spin up the dual high-end architecture track with up-to-date context.
- Record every guardrail bump in policy state/history and throttle failing critics.
- Respect rate limits, clean worktree gates, and task memos automatically.
- Demonstrate priority-aware scheduling and verification-backed task completion.

---

## 2. Current Gaps & Justification

| Gap | Evidence | Why It Matters |
| --- | --- | --- |
| **Intake proposals ignored** | `start()` only calls `syncRoadmapFile` (`tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts:320-325`); `state/roadmap_inbox.json` never read | Atlas/Dana cannot promote new work (including the Sonnet/Codex lane) during autopilot runs, breaking “agents-only” workflow |
| **No dual high-end planner/reviewer** | Agent spawning always creates a single orchestrator (`unified_orchestrator.ts:340-362`) plus generic workers/critics | Architecture definition remains a single-threaded task without the Sonnet 4.5 planner + Codex 5-high review lane the user mandated |
| **Policy controller parity missing** | `executeTask` writes roadmap status (`unified_orchestrator.ts:560-618`) but never updates policy state or escalations | Supervisors lose guardrail visibility; breaches aren’t logged to `state/policy/autopilot_policy.json` or `state/analytics/autopilot_policy_history.jsonl` |
| **Critic fatigue guard absent** | `AgentHierarchy` can load/save `autopilot_critics_backoff.json` (`agent_hierarchy.ts:153-183,389-414`), but orchestrator never records runs | Failing critics re-fire every cycle, causing noise and token waste |
| **Usage-limit thrash** | `CodexExecutor.exec` returns errors directly (`unified_orchestrator.ts:566-582`) and `TaskVerifier` doesn’t handle quotas | When Codex/Claude hit ceilings, the orchestrator keeps issuing jobs instead of respecting the legacy `USAGE_LIMIT_BACKOFF` sleep |
| **Task memos lost** | Legacy loop wrote `state/task_memos/*`; Unified mode emits only context entries (`roadmap_tracker.ts:73-149`) | Agents lack the “running diary” that accelerates hand-offs, violating the world-class team expectation |
| **Clean worktree gate removed** | `autopilot_unified.sh` never checks `git status`, unlike `autopilot.sh` which guarded via `.clean_worktree` | Running with hundreds of local edits (see `git status -sb`) risks corrupting change history and stacking diffs |
| **Priority/dependency handling naive** | `prefetchTasks` pulls any ready task (`unified_orchestrator.ts:398-420`) and `runContinuous` assigns FIFO | High-value or dependent tasks may starve; violates recommendations in `docs/orchestration/AUTOPILOT_AUDIT_2025-10-21.md:200-275` |
| **Historical awareness limited** | Context assembler looks back 24h by default (`context_assembler.ts:143-165`) | The architecture duo won’t see older experiments or docs the user wants considered (“don’t lose touch with earlier attempts”) |
| **Idle manager produces generic AUTO-* tasks** | `idle_manager.ts:98-118` adds placeholder tasks | Without the new planning lane, idle moments won’t trigger architecture refinement or backlog grooming |
| **Credentials & telemetry assumptions** | `autopilot_unified.sh` assumes CLI invocations bypass sandbox; network approvals are still manual in this environment | Runs may hang waiting for approvals; plan must consider fallback or explicit guidance |

---

## 3. Proposed Initiatives

### 3.1 Guardrail Restoration (Immediate)

1. **Policy Controller Port**
   - Hook `TaskVerifier` failure and queue starvation events to `tools/wvo_mcp/scripts/autopilot_policy.py`.
   - Update `executeTask` to log escalations, latest policy state, and append to `state/analytics/autopilot_policy_history.jsonl`.
   - Justification: Restores visibility into guardrail breaches; matches bash autopilot behaviour (requested by leadership).

2. **Critic Backoff Reinforcement**
   - After each critic run, call `agentHierarchy.recordCriticRun` and skip critics in `assignNextTaskIfAvailable` when `isCriticInBackoff` is true.
   - Persist backoff file updates; expose telemetry badges to operators.
   - Justification: Prevents runaway critic loops; reuses proven fatigue suppression.

3. **Usage-Limit Cooldowns**
   - Parse known quota errors (CLI exit codes/strings) inside `CodexExecutor.exec` & `ClaudeExecutor.exec`.
   - Implement exponential backoff (baseline `USAGE_LIMIT_BACKOFF` from bash loop) with telemetry & context notes.
   - Justification: Stops thrash when providers throttle, keeps system honest about downtime.

4. **Task Memo Trail**
   - Emit memo files `state/task_memos/<task_id>/<timestamp>.md` after every completion or block.
   - Link latest memo paths into context assembly (e.g., add “Recent memos” section).
   - Justification: Reintroduces breadcrumbing that accelerates agent hand-offs.

5. **Clean Worktree Gate**
   - Before orchestrator launch, mirror `autopilot.sh` guard: abort (or require `--allow-dirty`) if tracked files are modified, ignoring `.clean_worktree`.
   - Justification: Prevents accidental stacking of diffs; aligns with disciplined workflow.

### 3.2 Planning Excellence (High Priority)

6. **Dual High-End Architecture Lane**
   - Extend agent spawning to create:
     - `architecture-planner`: Sonnet 4.5 (strategic planner).
     - `architecture-reviewer`: Codex 5-high (review & refinement).
   - Route architecture tasks (`domain === 'product' && title includes 'architecture'`, or new task type) through a coordinated loop (planner produces plan, reviewer critiques, results stored as artifacts).
   - Justification: Matches user directive for concurrent, high-talent planning & review.

7. **Historical Context Registry**
   - Build an index of prior docs, experiments, and legacy code spikes (e.g., `docs/UNIFIED_AUTOPILOT_IMPLEMENTATION.md`, `apps/web/src/demo/*`).
   - Extend `ContextAssembler` options to surface curated “Historical guidance” when tasks touch architecture or web domains.
   - Justification: Ensures planners stay aware of earlier attempts; avoids reinventing past work.

8. **Idle Manager Upgrade**
   - Replace generic AUTO tasks with targeted actions:
     - Kick off architecture duo when lane idle.
     - Trigger backlog grooming or historical-context refreshing.
   - Justification: Keeps high-end planners productive rather than generating filler tickets.

### 3.3 Autonomous Intake & Prioritisation

9. **Intake Processing Pipeline**
   - On startup (and periodically), load `state/roadmap_inbox.json`, run it through Atlas/Dana policy hooks, and promote accepted items to the StateMachine + `state/roadmap.yaml`.
   - Record decisions in context and mark inbox entries `accepted/rejected`.
   - Justification: Enables end-to-end autonomy—no manual review required.

10. **Priority & Dependency Engine**
    - Implement scoring based on critical path, business value, effort, deadlines (per audit guidance).
    - Ensure `prefetchTasks` pulls highest priority ready tasks; `assignNextTaskIfAvailable` respects dependency DAG and forms execution batches.
    - Justification: Matches executive standard for “world’s best product team”; ensures critical work lands first.

### 3.4 Operational Excellence

11. **Quota-Aware Scheduling & Telemetry**
    - Surface usage-limit events in telemetry UI (`format_telemetry.mjs`) and `state/telemetry/usage.jsonl`.
    - When backoff engaged, annotate context so agents know why work paused.
    - Justification: Transparency for supervisors; prevents misinterpreting idle time as bug.

12. **Verification & Testing**
    - Expand `TaskVerifier` coverage beyond modeling tasks to include new architecture artifacts (e.g., require plan doc references).
    - Re-run consolidated integrity tests (`bash tools/wvo_mcp/scripts/run_integrity_tests.sh`) as part of acceptance.
    - Justification: Confirms environment stability post-changes.

13. **Sandbox Awareness**
    - Document (and optionally detect) when environment requires manual approvals; provide guidance or automation hooks for requesting them.
    - Justification: Avoid autopilot stalls due to sandbox restrictions.

---

## 4. Implementation Roadmap

### Phase A – Guardrail Restoration (Days 0–2)
1. Port policy controller integration (Task A1).
2. Wire critic backoff and memo trail (Tasks A2-A3).
3. Add usage-limit cooldown + telemetry (Task A4).
4. Reinstate clean worktree gate (Task A5).
5. Validate with targeted unit tests + dry-run autopilot (Task A6).

### Phase B – Planning Excellence (Days 3–5)
1. Extend agent spawning + scheduler for architecture duo (Task B1).
2. Implement coordination loop & artifact logging (Task B2).
3. Build historical context registry and prompt integration (Task B3).
4. Upgrade idle manager to trigger planning/backlog tasks (Task B4).
5. Run architecture lane smoke exercise; capture artifacts (Task B5).

### Phase C – Intake & Prioritisation (Days 5–7)
1. Implement inbox processing & promotion (Task C1).
2. Add priority scoring + dependency batching (Task C2).
3. Update telemetry & context with priority info (Task C3).
4. Regression test with staged roadmap + inbox fixture (Task C4).

### Phase D – Operational Hardening (Days 7–8)
1. Expand verification coverage (Task D1).
2. Re-run `run_integrity_tests.sh`, address failures (Task D2).
3. Document sandbox workflow, update runbooks (`docs/AUTOPILOT_RUNBOOK.md`) (Task D3).
4. Final autopilot dress rehearsal with Sonnet/Codex lane and verify outputs (Task D4).

---

## 5. Deliverables

- Updated orchestrator code (`tools/wvo_mcp/src/orchestrator/*.ts`) reflecting guardrails, planning lanes, and scheduling upgrades.
- Policy history files populated during test run (`state/policy/autopilot_policy.json`, `state/analytics/autopilot_policy_history.jsonl`).
- Architecture artifacts generated by Sonnet 4.5 planner & Codex 5-high reviewer (e.g., `state/artifacts/architecture/`).
- Historical context registry (new index under `state/context_registry.json` or similar).
- Revised runbook documenting sandbox handling and new workflows.
- Integrity test report confirming pass/fail state.

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Incorrect quota detection causes false backoff | Idle time increases | Start with conservative pattern matching; log raw errors; add feature flag |
| Architecture lane swamps token budget | Excess cost | Use policy controller to track usage; allow Dana to throttle via live flags |
| Intake automation mislabels proposals | Roadmap drift | Begin with “audit mode” logging before auto-promote; require confirmations from Atlas/Dana agents |
| Historical registry bloats prompts | Model context overflow | Provide top-N curated list with summaries; respect size limits in `ContextAssembler` |
| Clean worktree gate blocks legitimate dev runs | Developer friction | Offer `--allow-dirty` flag and log explicit warning; document best practices |
| Sandbox approvals stall autopilot | Run appears hung | Add detection + log instructions; optionally integrate approval hooks when available |

---

## 7. Acceptance Criteria

1. **Guardrail Signal**: Simulated policy breach writes entries to `state/policy/autopilot_policy.json` and `state/analytics/autopilot_policy_history.jsonl`.
2. **Critic Cooldown**: Forcing a critic failure triggers backoff & skip for at least one cycle; telemetry displays status.
3. **Quota Handling**: Mocked 429 response results in logged backoff event and delay before retry.
4. **Memo Availability**: Completed tasks produce memo files accessible to subsequent agents via prompt context.
5. **Clean Start**: Launch aborts with descriptive error when worktree dirty (unless override).
6. **Architecture Duo Output**: Dual planner generates plan + review artifacts stored in repo; prompts show historical references.
7. **Intake Promotion**: Pre-seeded inbox entries result in roadmap updates during autopilot run without manual edits.
8. **Priority Execution**: Task logs show priority score ordering; dependent tasks wait until prerequisites done.
9. **Tests Green**: `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` completes with documented status.

---

## 8. Follow-Up Considerations

- Once stable, evaluate extending policy controller to incorporate cost ceilings and token efficiency manager hooks.
- Consider resuming disabled critic/test suites under `tools/wvo_mcp/src/tests/*.disabled` for regression coverage.
- Explore automatic sandbox approval integration if infrastructure allows (future roadmap item).

---

Prepared for Atlas & Director Dana review. Once accepted, these initiatives should be promoted from intake (`state/roadmap_inbox.json`) into the formal roadmap and scheduled for implementation. During execution, capture memo entries and policy events to validate guardrails in situ.
