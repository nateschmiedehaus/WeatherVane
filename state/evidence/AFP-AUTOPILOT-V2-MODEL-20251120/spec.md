# SPEC - AFP-AUTOPILOT-V2-MODEL-20251120

**Created:** 2025-11-20T01:25:16Z
**Phase:** SPEC

## Acceptance Criteria (Must)
- Registry supports providers Claude, Codex, Gemini, o3 with capability tags and latest models seeded.
- Lane helpers return correct model IDs for Fast (speed), Standard (balanced), Deep (reasoning/context) with fallback order.
- Scout/discovery hook present to refresh models (stub acceptable if no API).
- Unit tests for lane selection and registry defaults pass.
- Evidence + critics captured for all AFP phases; branch committed/pushed.

## Should
- Keep changes ≤5 files and ≤150 net LOC per batch; no new deps.
- Clear errors/logs for missing models/registry issues.

## Could
- Allow config of lane preferences via env/overrides.

## Functional Requirements
- FR1: Registry exposes getModelsByCapability/capability-based sort across providers.
- FR2: ModelManager exposes getFastLane/getStandardLane/getDeepLane (best IDs).
- FR3: Scout hook to refresh registry (discoverAll/forceRefresh entry point).

## Non-Functional Requirements
- No new dependencies; unit tests via Vitest.
- Minimal surface area; defaults embedded or in existing config locations.
