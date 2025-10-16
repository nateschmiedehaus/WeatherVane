# Director Dana Escalation – Critic Capability Restoration (2025-10-16)

## Summary
- MCP runtime still launches with `WVO_CAPABILITY=medium` unless uplifted manually; extended critics (`design_system`, `allocator`, `exec_review`) remain disabled as a result.
- Impacted critics: `design_system`, `exec_review`, and `allocator` (all skipping with “skipped due to capability profile” per `state/critics/*.json`).
- Impacted product roadmap: T4.1.8, T4.1.9, T4.1.10, T11.2.1, T11.2.2 remain blocked because the required critics cannot produce exit evidence.

## Evidence
- `state/critics/designsystem.json` – last run 2025-10-13, skipped by capability gate.
- `state/critics/execreview.json` – last run 2025-10-13, skipped by capability gate.
- `state/critics/allocator.json` – last run 2025-10-15, skipped by capability gate; critic escalations logged in `state/escalations.log`.
- `state/task_memos/label-coordinate-with-director-dana-to-restore-high-ca.json` – Autopilot loop repeatedly surfaces this blocker after `plan_next(product, minimal=true)`.

## Latest Update (2025-10-16)
- Autopilot harness now emits a warning whenever MCP is not high-capability and exits gracefully on manual interrupts; no change to critic availability yet.
- Atlas cannot progress product slices until the critics above run; MCP enablement work continues while we await a decision.

## Requested Actions
1. Flip MCP capability to high (`WVO_CAPABILITY=high` or equivalent infrastructure uplift) so `design_system`, `exec_review`, and `allocator` can execute.
2. Optionally provide a written waiver if critics must remain offline; Atlas will record that waiver before moving blocked tasks.
3. Once uplift or waiver is complete, notify Atlas/Autopilot so we can re-run `plan_next(domain='product')` and resume product roadmap slices.
4. Confirm closure by capturing fresh critic timestamps in `state/critics/*.json` (or documenting the waiver) and clearing the escalations in `state/escalations.log`.

## Next Checks for Atlas
- Immediately re-run `plan_next(product, minimal=true)` after uplift to select the next product slice.
- Trigger `critics_run` for the recovered critics to capture exit evidence before moving blocked tasks back to `in_progress`.
