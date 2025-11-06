# Daily Artifact Health Report — [YYYY-MM-DD]

## Commands
- `git status --short`
  - Result: [clean / untracked items → list actions]
- `node tools/wvo_mcp/scripts/rotate_overrides.mjs --dry-run`
  - Result: [noop / rotated N entries] (warnings if any)
- `node tools/wvo_mcp/scripts/rotate_overrides.mjs`
  - Result: [skipped / rotated N entries] (include archive path)

## Findings
- [ ] Untracked files identified? (list + resolution)
- [ ] Override archive created for today? (`state/analytics/override_history/<timestamp>-overrides.jsonl.gz`)
- [ ] AFP lifecycle artifacts complete for new tasks? (state any gaps)
- [ ] Guardrail monitor run? (`node tools/wvo_mcp/scripts/check_guardrails.mjs`)
- Additional notes:
  - [Observations or needed follow-ups]

## Remediation / Follow-up
- [ ] Follow-up task created? (ID / owner)
- [ ] Notifications sent (ProcessCritic owner, Autopilot Council)?
- Next scheduled audit timestamp:
