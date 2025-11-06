# Implementation Notes

## Code Changes
- Added `tools/wvo_mcp/src/executor/command_runner.ts` implementing guardrailed `runCommand` using `execa`, telemetry spans, and live-flag aware validation.
- Updated Autopilot imports/tests (`tools/wvo_mcp/src/critics/base.ts`, `tools/wvo_mcp/src/critics/base.test.ts`, `tools/wvo_mcp/src/critics/ml_task_meta_critic.ts`, `tools/wvo_mcp/src/session.ts`) to use the restored helper without `.js` suffix drift.
- Extended `tools/wvo_mcp/scripts/generate_module_index.ts` to run `tsc` for TS2307 diagnostics, aggregate them hierarchically, and persist `state/analytics/inventory/missing_modules.{json,md}` (Autopilot-only scope).
- Recorded active follow-up in `state/evidence/AFP-MODULE-REMEDIATION-20251105/followups.md` so the remediation tracker reflects task G.

## Automation Impact
- `runCommand` enforces guardrails before execution, preserving Autopilot safety.
- Inventory generation groups diagnostics by subsystem to drive AFP follow-ups without WeatherVane noise. Initial execution blocked (tsx EPERM); documented under verification.
