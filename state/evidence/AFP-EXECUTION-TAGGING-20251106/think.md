# THINK — AFP-EXECUTION-TAGGING-20251106

**Date:** 2025-11-06  
**Author:** Codex

---

## Edge Cases & Failure Modes

1. **Metadata already exists with other fields**
   - Need to merge rather than overwrite; adopt simple read/modify/write strategy.

2. **Wave 0 crash before metadata write**
   - Handle in try/finally near status update so even failed runs set `execution_mode`.

3. **Manual CLI run on non-existent task**
   - Script should exit non-zero and print clear guidance.

4. **Multiple modes set (manual + autopilot)**
   - Latest update wins; include `lastUpdatedBy` and timestamp for audit.

5. **Autopilot tasks retroactively retagged manually**
   - Acceptable; metadata file is source of truth. Guardrails can later enforce who is allowed to override.

---

## Assumptions

- Evidence directories already exist before tagging; if not, CLI can create them (matching TaskExecutor behaviour).
- Node environment available for CLI usage.

---

## Remediation Commitments

- If tagging script reveals missing evidence directories, create follow-up tasks to clean up.
- Log future work item for guardrail monitor to validate execution metadata once adoption confirmed.
