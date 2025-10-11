# WeatherVane Status Digest
_Generated: 2025-10-11T00:51:06.437Z (profile: medium)_

## Recent Context Highlights
## Current Focus
T7.1.1 – Complete geocoding integration and caching across Shopify orders.

## Decisions
- Normalised merchant-provided latitude/longitude hints before calling the geocoder so we reuse coordinates already present on payloads.
- Derived geohashes from those hints (or decoded existing hashes) with the geocoder precision, letting us bypass redundant lookups and keep cache hits hot.
- Documented the behaviour in `docs/INGESTION.md` so connector authors understand the precedence order.
- Encode geohashes when city lookups only return latitude/longitude so cache serialisation stays deterministic across backends.

## Risks
- Shopify occasionally emits stale coordinate pairs; we presently trust hints, so coverage monitors must flag suspicious drifts.
- If upstream geohashes are malformed we silently fall back to lookups, which could hide systematic data-entry issues until validation runs.

## Next actions
1. Exercise the geocoding coverage harness on a fresh demo snapshot to confirm the new encoding path keeps ratios above the 0.8 floor.
2. Capture a short design note for connector owners outlining the geohash fallback so they can mirror the precedence order.
3. Revisit T7.1.2 weather join validation once geocoding ratios stabilise across tenants.

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
            status: pending
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
