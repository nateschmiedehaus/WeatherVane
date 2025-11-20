# THINK - AFP-AUTOPILOT-V2-MODEL-SCOUT-20251120

## Edge Cases (8)
1) Provider returns empty list → no new models; ensure no deletion occurs.  
2) Duplicate model IDs with different versions → choose latest by release/observed_at.  
3) Missing mandatory fields (context, provider) → reject candidate with error.  
4) Capability tags incomplete → assign “unknown” but do not break router.  
5) Registry file missing/corrupt → fallback to empty baseline with backup.  
6) Clock skew on observed_at → favor semantic version when available; otherwise keep existing.  
7) New lane appears (e.g., multimodal) → treat as optional tags, don’t crash.  
8) Concurrent writes to registry → keep write atomic (temp file + rename if feasible) or document single-writer expectation.

## Failure Modes (5)
- Overwrite good entry with worse/older model → recency/version guard; keep better entry.  
- Registry growth unbounded → cap optional; at minimum do not delete; consider limit in future.  
- Router reads stale data after scout → ensure write flush and deterministic merge.  
- Scout produces malformed JSON → validate before write; fail fast.  
- Tests rely on live network (not allowed) → use deterministic stubs.

## Assumptions (10)
1) We can run Scout locally on demand (cron later).  
2) Registry path writable.  
3) Providers expose identifiable model/version strings.  
4) We have at least stub data for Gemini/Claude/Codex/o-series.  
5) Capability tags: {reasoning, coding, speed, context} suffice for routing.  
6) No new deps; use built-in/fs only.  
7) Router already consumes registry interface.  
8) Semver-ish ordering works for Claude/Gemini IDs; otherwise fallback to observed_at.  
9) Tests run via Vitest.  
10) No concurrent scout writers right now.

## Complexity Analysis
- Essential: merge logic + candidate generation.  
- Accidental: version comparison, file IO safety; keep simple.  
- Cyclomatic low; cognitive low if helpers separated.

## Mitigation Strategies
- Prevention: schema validation for candidates; recency guard; defaults for missing optional fields.  
- Detection: logs of added/updated/skipped; tests for merge outcomes.  
- Recovery: keep prior registry backup copy before write; fail without overwriting on validation errors.

## Testing Strategy
- Unit: merge adds new model; merge upgrades version; merge skips older; rejects missing fields.  
- Unit: scout stub yields expected candidate set with tags.  
- Integration: registry read/write round-trip preserves existing entries.  
- Guardrail: run check_guardrails to ensure no regression.

## Paranoid Scenarios (5)
1) Scout wipes registry due to empty set + overwrite → refuse write when input empty and existing non-empty unless forced.  
2) Malicious/poisoned model entry → require provider allowlist.  
3) Version strings incomparable → fallback to observed_at to avoid downgrade.  
4) Disk full → detect/fs error, abort write, keep backup.  
5) Future provider renames lanes → treat as optional tags, don’t crash router.
