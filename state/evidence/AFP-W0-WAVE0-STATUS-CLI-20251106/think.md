# Deep Thinking Analysis — AFP-W0-WAVE0-STATUS-CLI-20251106

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)

---

## Edge Cases

1. **Missing telemetry files** – Fresh clones or repos with no Wave 0 run yet will lack `state/analytics/wave0_runs.jsonl` and/or `supervisor_lifecycle.jsonl`. CLI must report “no runs yet” instead of throwing ENOENT.
2. **Stale lock** – `.wave0.lock` may remain after a crash. Detect by (a) failing `kill(pid,0)` and (b) lock age > rate limit (e.g., >5 minutes). Output should recommend removing lock once operator confirms no process.
3. **PID reuse** – Another program could reuse the recorded PID. Combine PID liveness check with lock timestamp to reduce false positives.
4. **Large JSONL** – Files can grow to thousands of lines; avoid loading entire file by tailing only the last ~200 lines before parsing.
5. **Corrupt JSON** – Partial writes could leave a trailing brace. Parser should skip bad lines and continue rather than failing the entire report.
6. **Permission errors** – `kill(pid, 0)` may throw `EPERM` (process owned by another user). Treat as “unknown state” and warn rather than failing.
7. **Timezone clarity** – Display ISO timestamps + relative age (“5m ago”) to avoid confusion when comparing evidence across timezones.
8. **Automated use** – `--json` consumers rely on stable schema; include explicit `status` enum plus arrays for `recentRuns` and `events` so future tooling can parse without string splitting.

---

## Failure Modes

1. **False healthy** – PID check passes even though Wave 0 hung earlier (no new runs). Mitigation: also show age of most recent run; if > rate limit (default 5 min), flag as “no recent executions”.
2. **False unhealthy** – Script misreports due to permission errors. Mitigation: treat EPERM as “unknown” and instruct to rerun with sudo rather than claiming failure.
3. **Performance degradation** – Reading entire JSONL each run could slow down CLI; mitigate via manual tail (read last N bytes) and limit results to user-provided `--limit`.
4. **Test brittleness** – Relying on actual PIDs/time could flake. Use current process PID for “alive” scenario and guarantee stale scenario by referencing a definitely invalid PID (-1) or terminated child.
5. **Docs drift** – If docs keep referencing old manual steps, adoption stalls. Ensure workflow doc updates highlight new command prominently.

---

## AFP/SCAS Validation

- **Via negativa:** Replace multi-step manual process (ps + tail + manual diff) with a single CLI, effectively deleting redundant work.
- **Refactor not repair:** We’re not adding another checklist reminder; we’re providing instrumentation to fix the root cause (lack of visibility).
- **Complexity:** Net reduction. Implementation adds <150 LOC and one test file while removing repeated instructions across tasks.

---

## Assumptions

1. Node ≥18 available (per repo engines) so `fs.promises`/`Intl.RelativeTimeFormat` features exist.
2. Operators execute CLI from repo root; script will derive default root via `__dirname`.
3. Wave 0 lock is JSON with `{ pid, startTime }` (validated on current file).
4. `wave0_runs.jsonl` entries contain ISO timestamps; script can parse with `Date`.
5. `state` directory is writable so tests can create temporary fixtures.

---

## Mitigations & Observability

- Provide exit code 0 even when reporting issues, but include `status: "stale_lock"` etc. in JSON; this keeps script usable inside VERIFY pipelines without triggering false failures.
- When JSON parsing fails for a line, log it under `warnings` array so operators know to inspect telemetry.
- Document sample usage in `docs/workflows/AFP_REVIEWER_ROUTINE.md` including `--json` capturing instructions; encourage pasting CLI output into evidence.
- Tests cover each major branch; manual smoke reuses live repo state to ensure formatting looks good.

---

**Thinking complete:** 2025-11-06
