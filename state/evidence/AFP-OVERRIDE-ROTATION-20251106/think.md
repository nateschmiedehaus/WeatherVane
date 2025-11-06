# THINK — AFP-OVERRIDE-ROTATION-20251106

**Date:** 2025-11-06  
**Author:** Codex

---

## Edge Cases & Failure Modes

1. **Concurrent Rotation Invocations**
   - Scenario: Multiple agents run the rotation script simultaneously (manual + hook).
   - Risk: File corruption or lost entries.
   - Mitigation: Use atomic rename (`fs.renameSync`) on temp files; add file-lock guard (e.g., flock or advisory lock).

2. **Ledger Already Empty**
   - Scenario: Script runs when no entries older than cutoff exist.
   - Risk: False failure or truncated file.
   - Mitigation: Ensure script exits gracefully without modifying files.

3. **Archive Growth**
   - Scenario: Daily archival creates many small files or a few archives become huge.
   - Risk: Repo bloat, diff noise.
   - Mitigation: Compress archives (`.jsonl.gz`) and roll into monthly folders once counts exceed threshold; document retention strategy.

4. **Critic Enforcement Drift**
   - Scenario: Critic requires audit evidence but 24-hour window calculation misfires.
   - Risk: False positives blocking work.
   - Mitigation: Use timestamp comparisons (`Date.now()` minus audit timestamp) and allow emergency override with documented reasoning.

5. **Audit Checklist Neglect**
   - Scenario: Agents ignore daily checklist due to perceived overhead.
   - Risk: Process drift returns.
   - Mitigation: ProcessCritic enforcement + TaskFlow reminder ensures evidence is required before coding tasks; keep template succinct (<5 checks).

---

## Assumptions to Validate

- File system supports atomic rename operations (macOS/Linux).
- Agents can run Node scripts locally (already dependency in repo).
- Compression tooling can rely on built-in `zlib`.
- Autopilot pipeline can execute daily audit script (Wave0 integration possible).

---

## Remediation Commitments

- **Remediation Action:** Create follow-up roadmap item `AFP-OVERRIDE-ROTATION-DAILY-AUTOMATION` to implement automation (script + critic) before end of week. Ownership: Autopilot Council.
- **Remediation Action:** Ensure daily audit template includes section for “Untracked artifact delta” and assign reviewer (ProcessCritic owner) responsible for spot-checking at least once per day.

---

## Complexity Reflection

- Rotation script introduces moderate complexity but centralizes logic; preferable to ad-hoc manual edits.
- Critic enhancement complexity justified by compliance requirements.

---

## Unknowns / Questions

1. Should archives be stored in Git LFS to avoid repo weight? (Probably not necessary yet.)
2. Who runs daily audit (dedicated bot vs rotating human)? Decide in documentation.
3. Interaction with Wave 0 autopilot—can we delegate daily audit execution to autopilot pipeline automatically?
