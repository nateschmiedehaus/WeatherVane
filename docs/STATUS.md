# WeatherVane Status Digest
_Generated: 2025-10-12T04:53:53.681Z (profile: medium)_

## Recent Context Highlights
## Current Focus
- Phase 4 polish: ship Claude↔Codex coordinator resilience, harden guardrails, keep telemetry actionable.

## Key Decisions
- Roadmap writes funnel through the SQLite state machine; legacy YAML sink stays read-only unless manually toggled for incident response.
- All MCP entrypoints stamp correlation IDs so telemetry, SQLite events, and operator tooling stay traceable end-to-end.
- AgentPool parses provider CLI footers to capture real token counts and emits promotion/demotion events; operations snapshots include coordinator type, availability, reason, and token pressure.
- Execution summaries in `state/telemetry/executions.jsonl` persist coordinator fields plus critic outcomes so we can audit failovers retrospectively.
- Guardrails enforce a curated allow-list for shell execution (with `which`/`nl` exceptions). `runCommand` invokes guardrails before spawning, locking the behaviour via Vitest.
- Compact evidence packs default to JSON mode; use `ts-node tools/wvo_mcp/scripts/live_flags.ts set PROMPT_MODE verbose` to recover the legacy markdown format when debugging.
- Guardrail critic `failover_guardrail` runs `scripts/check_failover_guardrail.mjs` to enforce Codex share ≤50 %, sustained failover <15 min, Claude downtime <10 min, and telemetry freshness ≤5 min.

## Risks
- Provider CLI footers may change format; add a smoke check around AgentPool parsing to avoid silent telemetry regressions.
- TypeScript build is not exercised in this environment—run `npm run build --prefix tools/wvo_mcp` before packaging releases.
- Token pressure heuristics use rolling averages; sudden prompt spikes may exceed limits until the window stabilises.
- Sandbox network restrictions block live Codex/Claude calls; coordinator reports `network_offline` until outbound access returns.

## Next Actions
- Build dashboards summarising `executions.jsonl` (token burn, coordinator mix, critic failures).
- Extend `orchestrator_status` visualisation with queue batch summaries plus token pressure history.
- Schedule nightly geocoding coverage validation to detect regressions automatically.
- Document the compact evidence-pack rollout plan in `context_assembler` before flipping defaults in production.

## Task Notes
- **T8.2.2 – Coordinator failover**: Orchestrator status, operations snapshots, and execution telemetry all emit `coordinator.type|available|reason`. Guardrail script enforces the SLO and is wired into the critic registry (`failover_guardrail`). Docs updated in `docs/OBSERVABILITY.md` with quick checks and rollback guidance. Critics (`tests`, `manager_self_check`) pass.
- **T8.1.2 – Guardrail allow-list**: `ensureAllowedCommand` protects `runCommand`, Vitest `command_allowlist` suite covers the behaviour, and critic `tests` runs remain green.
- **T8.2.1 – Compact evidence pack**: `composePrompt` defaults to JSON payloads; flip the live flag (`ts-node tools/wvo_mcp/scripts/live_flags.ts set PROMPT_MODE verbose`) to restore the old prompt. Vitest `context_assembler_prompt` suite passes alongside build + manager critics.
- **T4.1.5 – Non-linear allocator**: Trust-constr + differential-evolution solvers enforce ROAS floors and spend caps. `pytest tests/test_allocator.py` and `critic:allocator` stay green (skipped under medium profile but reported).
- **T4.1.6 – Intraday allocator**: Hourly ROI curves under `apps/allocator/hf_response.py` with canonical run saved to `experiments/allocator/hf_response.json`. Tests `tests/test_allocator_hf_response.py` pass; allocator critic skip acknowledged.

## Telemetry Reminders
- Operations snapshots live at `state/telemetry/operations.jsonl`; guardrail reads the latest 400 lines and fails if stale or out of SLO.
- Execution telemetry accrues in `state/telemetry/executions.jsonl`; older entries pre-2025-10-12 may miss coordinator fields.
- `orchestrator_status` remains the fastest check for current coordinator and failover reason.

### 2025-10-13
- Revalidated coordinator failover guardrail via critics (`tests`, `manager_self_check`) and confirmed orchestration telemetry/doc updates remain current.
- Trimmed `state/context.md` to focused summary (<1000 words) while preserving guardrail and allocator learnings.

## Roadmap Snapshot (truncated)
```yaml
epics:
  - id: E1
    title: Epic 1 — Ingest & Weather Foundations
    description: Stand up weather + marketing ingestion, harmonise geo/time, and
      validate data quality.
    milestones:
      - id: M1.1
        title: Connector scaffolding
        tasks:
          - id: T1.1.1
            title: Design Open-Meteo + Shopify connectors and data contracts
            owner: WVO
            estimate_hours: 6
            status: done
            exit_criteria:
              - critic: build
              - critic: tests
              - doc: docs/INGESTION.md
          - id: T1.1.2
            title: Implement ingestion Prefect flow with checkpointing
            owner: WVO
            estimate_hours: 8
            status: done
            dependencies:
              - T1.1.1
            exit_criteria:
              - critic: data_quality
              - critic: org_pm
              - artifact: experiments/ingest/dq_report.json
      - id: M1.2
        title: Weather harmonisation
        tasks:
          - id: T1.2.1
            title: Blend historical + forecast weather, enforce timezone alignment
            owner: WVO
            estimate_hours: 6
            status: done
            exit_criteria:
              - critic: forecast_stitch
              - doc: docs/weather/blending.md
          - id: T1.2.2
            title: Add leakage guardrails to feature builder
            owner: WVO
            estimate_hours: 4
            status: done
            dependencies:
              - T1.2.1
            exit_criteria:
              - critic: leakage
              - critic: tests
  - id: E2
    title: Epic 2 — Features & Modeling Baseline
    description: Ship lagged features, baseline models, and evaluation harness.
    milestones:
      - id: M2.1
        title: Feature pipeline
        tasks:
          - id: T2.1.1
            title: Build lag/rolling feature generators with deterministic seeds
            owner: WVO
            estimate_hours: 6
            status: done
            exit_criteria:
              - critic: build
              - critic: tests
              - critic: data_quality
      - id: M2.2
        title: Baseline modeling
        tasks:
          - id: T2.2.1
            title: Train weather-aware GAM baseline and document methodology
            owner: WVO
            estimate_hours: 8
            status: done
            exit_criteria:
              - critic: causal
              - critic: academic_rigor
              - doc: docs/models/baseline.md
  - id: E3
    title: Epic 3 — Allocation & UX
    description: Allocator robustness checks, dashboards, and UI polish.
    milestones:
      - id: M3.1
        title: Allocator guardrails
        tasks:
          - id: T3.1.1
            title: Implement budget allocator stress tests and regret bounds
            owner: WVO
            estimate_hours: 7
            status: done
            exit_criteria:
              - critic: allocator
              - critic: cost_perf
              - artifact: experiments/policy/regret.json
      - id: M3.2
        title: Dashboard + UX review
        tasks:
          - id: T3.2.1
            title: Run design system critic and ensure accessibility coverage
            owner: WVO
            estimate_hours: 5
            status: done
            exit_criteria: null
          - critic: design_system
            id: T3.2.2
            title: Elevate dashboard storytelling & UX
            status: done
            exit_criteria:
              - critic: design_system
              - doc: docs/UX_CRITIQUE.md
          - critic: exec_review
            id: T3.2.2
            title: Elevate dashboard storytelling & UX
            status: done
            exit_criteria:
              - critic: design_system
              - doc: docs/UX_CRITIQUE.md
  - id: E4
    title: Epic 4 — Operational Excellence
    description: Maintain velocity while hardening performance and delivery processes.
    milestones:
      - id: M4.1
        title: Optimization sprint
        tasks:
          - id: T4.1.3
            title: Causal uplift modeling & incremental lift validation
            status: done
            exit_criteria:
              - critic: causal
              - artifact: experiments/causal/uplift_report.json
          - id: T4.1.4
            title: Multi-horizon ensemble forecasting
            status: done
            exit_criteria:
              - critic: forecast_stitch
              - artifact: experiments/forecast/ensemble_metrics.json
          - id: T4.1.5
            title: Non-linear allocation optimizer with constraints (ROAS, spend caps)
            status: pending
            exit_criteria:
              - critic: allocator
              - tests: tests/test_allocator.py
          - id: T4.1.6
            title: High-frequency spend response modeling (intraday adjustments)
            status: pending
            exit_criteria:
              - critic: allocator
              - artifact: experiments/allocator/hf_response.json
          - id: T4.1.7
            title: Marketing mix budget solver (multi-channel, weather-aware)
            status: done
            exit_criteria:
              - critic: allocator
              - tests: tests/test_marketing_mix_solver.py
          - id: T4.1.8
            title: Reinforcement-learning shadow mode (safe exploration)
            status: pending
            exit_criteria:
              - critic: allocator
              - artifact: experiments/rl/shadow_mode.json
          - id: T4.1.9
            title: Creative-level response modeling with brand safety guardrails
            status: pending
            exit_criteria:
              - critic: design_system
              - artifact: experiments/creative/response_scores.json
          - id: T4.1.10
            title: Cross-market saturation optimization (fairness-aware)
            status: pending
            exit_criteria:
              - critic: allocator
              - artifact: experiments/allocator/saturation_report.json
  - id: E11
    title: Resource-Aware Intelligence & Personalisation
    description: Auto-detect hardware, adapt workloads, and guarantee great
      performance on constrained machines.
    milestones:
      - id: M11.1
        title: Capability Detection
        description: Detect CPU/GPU/RAM at runtime and store device profiles.
        tasks:
          - id: T11.1.1
            title: Implement hardware probe & profile persistence
            status: done
            exit_criteria:
              - critic: build
              - doc: docs/ROADMAP.md
          - id: T11.1.2
            title: Adaptive scheduling for heavy tasks
            status: pending
            exit_criteria:
              - critic: tests
              - artifact: state/device_profiles.json
      - id: M11.2
        title: Falcon Design System & Award-ready UX
        description: Deliver the visual polish required for design award recognition.
        tasks:
          - id: T11.2.1
            title: Design system elevation (motion, typography, theming)
            status: pending
```
