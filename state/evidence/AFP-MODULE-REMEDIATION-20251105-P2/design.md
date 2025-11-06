# Design: AFP-MODULE-REMEDIATION-20251105-P2

> Integrate spec/plan reviewers into daily routines, run the full test suite, and document the workflow for other agents.

## Scope
- Update daily artifact checklist to include `spec:review` / `plan:review` before gate transitions.
- Re-run the entire `tools/wvo_mcp` test suite after reviewer rollout and record outstanding failures.
- Add documentation describing the reviewer command flow and log locations.

## Constraints
- Keep documentation changes concise; avoid duplicating information across multiple files.
- Do not attempt to fix unrelated failing tests; record them for follow-up instead.

## Plan
1. Modify `docs/checklists/daily_artifact_health.md` to add the new reviewer commands.
2. Execute `npm run test --prefix tools/wvo_mcp`; capture any failing suites (expected baseline issues) and note them in verification docs.
3. Update `docs/MANDATORY_VERIFICATION_LOOP.md`, `docs/agent_library/common/processes/task_lifecycle.md`, and `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md` with reviewer instructions.
4. Verify TypeScript build where applicable and capture evidence.
