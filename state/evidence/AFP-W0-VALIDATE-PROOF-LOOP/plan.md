# PLAN — AFP-W0-VALIDATE-PROOF-LOOP

## Objective
- Execute the proof-driven Wave 0 loop once to produce verify.md, telemetry, and achievement stats.

## Proof Criteria
- Manual verification only; automated checks happen via targeted Vitest suites.

### Manual Verification
- Wave 0 run produces summary.md + verify.md for this task.
- Lifecycle telemetry updated (`state/analytics/wave0_runs.jsonl`).
- Achievement stats appended (if thresholds met).

## PLAN-authored Tests
- `npm --prefix tools/wvo_mcp run build` — baseline compilation before execution.
- `npm --prefix tools/wvo_mcp run test -- prove` — ensure proof system unit tests pass.
- `npm --prefix tools/wvo_mcp run test -- wave0` — validate integration hooks.
- Live run: `WAVE0_RATE_LIMIT_MS=100 WAVE0_EMPTY_RETRY_LIMIT=1 npm run wave0` (captures proof evidence and updates roadmap status).

## Implementation Notes
- No code changes required; this task triggers the live validation run and records artefacts in verify.md.
- Ensure `state/evidence/AFP-W0-VALIDATE-PROOF-LOOP/verify.md` and telemetry logs are committed after execution.
