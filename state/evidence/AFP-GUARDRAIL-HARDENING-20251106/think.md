# THINK — AFP-GUARDRAIL-HARDENING-20251106

**Date:** 2025-11-06  
**Author:** Codex

---

## Edge Cases & Failure Modes

1. **Monitor Noise / Flapping**
   - Rapid successive runs might report transient failures (e.g., audit run mid-day).
   - Mitigation: Allow cached results with TTL (e.g., reuse audit within 12h) and clearly label “stale” vs “missing”.

2. **CI Secrets / Env Dependencies**
   - Wave 0 run may require credentials.
   - Mitigation: Provide smoke mode for CI, require full run only in trusted environments, and escalate if smoke fails.

3. **Task Flooding**
   - Auto-remediation could spam new tasks each failure.
   - Mitigation: Debounce (one remediation task per day per guardrail) and append to followups instead of new tasks when existing one open.

4. **Local Skip Attempt**
   - Agents might set env to skip monitor.
   - Mitigation: process/CI jobs must run on PR; local script can warn but merge blocked by CI.

5. **Telemetry Growth**
   - JSONL log could grow large.
   - Mitigation: rotate (e.g., daily file) or include pruning script triggered weekly.

6. **Race Conditions**
   - Monitor run might clash with ongoing manual audit.
   - Mitigation: lock file or skip when audit currently running, but fail if missing at end.

7. **Docs Regression Tests False Positive**
   - Template wording may evolve legitimately.
   - Mitigation: tests should check for semantic presence (regex) not exact text.

---

## Assumptions to Validate

- TaskFlow automation available to open remediation tasks programmatically.
- CI environment can run node scripts and has enough time budget (<5 minutes).
- ProcessCritic / rotation scripts exit with proper codes we can map to JSON.

---

## Remediation Commitments

- If monitor surfaces persistent failures, create meta follow-up `AFP-GUARDRAIL-OPS-<date>` describing root cause and fix timeline.
- Document on-call / rotation for reviewing guardrail telemetry daily.

---

## Complexity Reflection

- Monitor script adds moderate complexity but centralises checks—better than ad-hoc enforcement.
- Need to guard against log/artefact accumulation; rotate telemetry as part of monitor.

---

## Unknowns

1. Should guardrail monitor run before every Wave 0 task automatically? Consider hooking into runner later.
2. Do we need summarised dashboards beyond JSONL? Maybe in future iteration.
