# PLAN — AFP-OVERRIDE-ROTATION-20251106

## Approach

1. **Rotation Tooling**
   - Implement a Node/TypeScript script under `tools/wvo_mcp/scripts/rotate_overrides.mjs` (or reuse existing CLI) to:
     - Read `state/overrides.jsonl`.
     - Move entries older than configurable cutoff (e.g., 30 days) into an archive file under `state/analytics/override_history/`.
     - Leave recent entries in the main file.
   - Add unit coverage (Vitest) verifying rotation behavior and archival naming.

2. **Daily Audit Artifact**
   - Create `docs/checklists/daily_artifact_health.md` describing the sub-24-hour audit steps.
   - Provide a template in `docs/templates/daily_artifact_health_template.md` for daily runs (short-form to keep overhead reasonable).
   - Add guidance to AGENTS/claude + `MANDATORY_WORK_CHECKLIST.md` emphasizing daily execution.

3. **Critic Enforcement**
   - Extend ProcessCritic (or introduce dedicated `artifactRotationCritic`) to:
     - Parse override ledger size + last archive timestamp.
     - Detect absence of daily audit evidence within the past 24 hours.
     - Emit actionable failure messages.
   - Update CLI/pre-commit integration to call the critic.

4. **Ownership & Roadmap**
   - Record responsibility in documentation (e.g., Autopilot Council) and create TaskFlow/Wave0 prompts to trigger daily audits (automation preferred).
   - Optionally link to roadmap entry ensuring rolling daily task creation if automation lags.

## Files to Change

- `tools/wvo_mcp/scripts/rotate_overrides.mjs` (new)
- `tools/wvo_mcp/src/critics/process.ts` (enhancement) + tests
- `.githooks/pre-commit` (invoke critic if necessary)
- `docs/checklists/daily_artifact_health.md` (new)
- `docs/templates/daily_artifact_health_template.md` (new)
- `AGENTS.md`, `claude.md`, `MANDATORY_WORK_CHECKLIST.md`
- `docs/MANDATORY_VERIFICATION_LOOP.md` (reference audits)
- Roadmap/TaskFlow configuration if needed

## PLAN-authored Tests

- `npm --prefix tools/wvo_mcp run test -- rotate_overrides` — covers rotation script (happy path, threshold, idempotency).
- `npm --prefix tools/wvo_mcp run test -- process_critic` — exercises new enforcement logic for daily audits/ledger freshness.
- `node tools/wvo_mcp/scripts/rotate_overrides.mjs --dry-run` followed by `node tools/wvo_mcp/scripts/rotate_overrides.mjs` — manual smoke: confirm archives + ledger rewrite.
- `node tools/wvo_mcp/scripts/run_process_critic.mjs --check overrides` — ensure CLI integration surfaces actionable guidance on staged changes.
- Daily audit template execution: fill `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/summary.md` and commit as evidence.
- Manual autopilot regression: `npm run wave0 -- --audit-check` to verify overrides rotation does not break Wave 0 live loop telemetry.

## Sequence

1. Prototype rotation script + tests.
2. Update docs/templates + ownership notes.
3. Enhance ProcessCritic + hook, add tests.
4. Backfill initial archive + create first daily audit artifact as seed (e.g., for current date).
5. Run critic/vitest, document results in VERIFY.

## Risks & Mitigations

- **Archive bloat:** compress archives or institute size cap.
- **Critic false positives:** allow override w/ documented rotation evidence; add clear messaging.
- **Concurrency:** guard rotation script with file locks or atomic rename (document in DESIGN).
