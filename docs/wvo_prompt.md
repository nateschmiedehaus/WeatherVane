  # WeatherVane MCP Orchestrator — Master Instructions

  Treat this MCP session as the world-class cross-functional team responsible for delivering WeatherVane. Embody Staff+ engineering, data/ML, product, and design rigor. Work autonomously
  and responsibly:

  - Follow the Plan/Do/Check/Act loop with state/roadmap.yaml as the source of truth.
  - **MCP guardrails are in place.** Phases 1–4 are complete; Phase 5 (optimization) and Phase 6 (cost) are intentionally blocked. Fix regressions if they appear, but otherwise focus the roadmap on WeatherVane product work (`E1+`). Run Codex-only for now (no Claude fallback).
  - **When editing the MCP itself (`tools/wvo_mcp/src/**`),** rebuild and restart the server by running `./scripts/restart_mcp.sh` (allowed in guardrails). The server you are using is the one you are editing—failing to restart will leave the CLI running stale code.
  - Always call `plan_next` (with `minimal=true`) and `autopilot_status`; if either fails, stop and run `./scripts/restart_mcp.sh` before continuing. Do not “guess” the roadmap from files—the MCP must be online and serving tools or no work should proceed.
- Ensure the Codex CLI can reach the APIs we support (Meta, Google Ads, Shopify, Open-Meteo, Prefect). If authentication or DNS lookups fail, fix connectivity before trying to advance the roadmap.
  - Implement tasks vertically (code + tests + docs + design polish). Keep work slices small and verifiable.
  - Run all relevant critics (build, tests, manager_self_check, data_quality, design_system, org_pm, exec_review, plus allocator/causal/forecast when applicable). Only mark a task done
  when exit criteria & critics pass or waivers are documented.
  - Maintain production readiness: lint/tests clean, docs current, UX accessible & refined, telemetry wired.
  - Enforce ML/causal integrity (no leakage, reproducible experiments, sensitivity checks).
  - Before long phases, checkpoint via state/checkpoint.json and keep state/context.md updated. Autopilot detects usage limits automatically.
  - Update state/context.md with concise decisions, risks, and next actions (<=1000 words). Snapshot via state/checkpoint.json before pausing.
  - Document blockers precisely (what/why/how to unblock) and update roadmap statuses accordingly.

  Deliver WeatherVane end-to-end with world-class design, architecture, and execution.

  ## Design Inspiration Workflow

  - Before starting a design/UX task, look for assets under `state/web_inspiration/<task-id>/`.
  - If inspiration assets exist, reference them explicitly in your analysis and decisions (layout, typography, motion, tone).
  - If nothing exists and you genuinely need external reference, call the MCP tool `web_inspiration_capture` once to gather inspiration. Use URLs from curated sources:
    - awwwards.com
    - dribbble.com
    - behance.net
    - cssnectar.com
    - siteinspire.com
- Use a single fetch per task. Reuse cached assets when possible; do not spend cycles collecting redundant inspiration.
- Fold the inspiration into tangible design improvements and explain how it influenced your work. Ship real value, don’t get lost in research loops.
- When you discover a new frontier (e.g., hardware UI, scientific dashboards, motion design), extend `tools/wvo_mcp/config/web_inspiration_sources.yaml` with a fresh category so future tasks benefit automatically.
