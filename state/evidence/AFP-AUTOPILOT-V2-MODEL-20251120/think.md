# THINK - AFP-AUTOPILOT-V2-MODEL-20251120

## Edge Cases (expanded)
1) Stale on-disk registry overrides seeds (lastUpdated 2025-10-16). Mitigation: allow forceRefresh; log staleness; snapshot seeds stamped with now when used.
2) Capability overlaps (speed/balanced/reasoning) cause ambiguous scores. Mitigation: explicit lane weights; deterministic scoring order.
3) Missing providers (e.g., no gemini/o3) → undefined lane. Mitigation: return undefined with log; caller can reroute to available provider.
4) Discovery/Scout unavailable (no API/CLI). Mitigation: seed defaults; mergeExternalProvider when data appears; preserve last-good.
5) Cost/context missing → poor scoring. Mitigation: fallback costScore/context=0; keep seeds with defaults.
6) Registry corruption on disk. Mitigation: fallback to embedded seeds, log warning.
7) Wave0 lock blocks live check. Mitigation: record block; do not delete lock.
8) Daily audit stale -> guardrail fail. Mitigation: run new audit before VERIFY.
9) commit:check noise from external dirtiness. Mitigation: document; avoid touching owner files.

## Failure Modes (expanded)
1) Wrong lane selection (fast returns Sonnet). Mit: tune weights, include capability tags, tests on fallback.
2) Schema/API break for legacy providers. Mit: additive changes only; keep old methods untouched.
3) Bad Scout data (duplicates, wrong costs). Mit: merge by ID, keep last-good, log anomalies.
4) Staleness never refreshed. Mit: TTL check + discoverAll; allow forceRefresh in manager.
5) Missing lane returns undefined silently. Mit: log visibility; caller handles reroute.
6) Tests rely on disk registry state. Mit: tests accept seed-based selections; avoid hard assertions on names.
7) Live audit/guardrail gaps hide issues. Mit: rerun audit; capture guardrail output in VERIFY.

## Assumptions
- No new deps; Vitest available.
- Lane intent: Fast= speed/low cost; Standard= balanced + reasoning; Deep= reasoning + large context.
- Seeds are placeholders; Scout/agent will update to real latest models externally.
- Wave0 dry-run may be locked; do not clear lock manually.

## Testing Strategy
- `npx vitest run src/models/model_registry.test.ts` (lane selection basic expectation).
- `node tools/wvo_mcp/scripts/check_guardrails.mjs` after audit refresh.
- `npm run commit:check` to capture hygiene (document external dirtiness).
- `npm run wave0 -- --once --epic=WAVE-0 --dry-run` to observe lock state.

## SCAS mapping
- Feedback: lane scoring + tests + guardrail logs.
- Adaptation: mergeExternalProvider + TTL refresh + Scout hook.
- Redundancy: seeds + external merges; last-good preserved.
- Visibility: logs for staleness, missing lanes, and provider gaps.

## Paranoid / Worst Case
- Malicious/incorrect Scout data nukes registry → merge by ID preserves last-good; log anomalies; forceRefresh from seeds if corrupted.
- Hooks bypassed → guardrail monitor/test plan catch; remediation task if needed.
- Stale audit keeps failing guardrail → perform fresh audit each day.

## Metrics / Signals
- Registry last_updated vs TTL;_lane selection returns non-undefined; guardrail monitor status; audit freshness; commit:check hygiene counts; presence of wave0 lock.
