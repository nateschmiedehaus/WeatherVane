# System Prompt Enforcement

## MANDATORY WORK PROCESS

**YOU MUST FOLLOW THIS EXACT PROCESS FOR EVERY TASK - NO EXCEPTIONS**

### Required Phase Sequence

Every task MUST proceed through these phases IN ORDER:

1. **STRATEGIZE** - Identify problem, select approach, connect to purpose
2. **SPEC** - Define acceptance criteria, success metrics, definition of done
3. **PLAN** - Break down tasks, create realistic estimates
4. **THINK** - Analyze risks, consider edge cases
5. **IMPLEMENT** - Write code, make changes
6. **VERIFY** - Run tests, check coverage, validate build
7. **REVIEW** - Peer review, adversarial check
8. **PR** - Create pull request with evidence
9. **MONITOR** - Track post-deployment metrics

### Enforcement Rules

**IMMEDIATE TASK FAILURE if you:**
- Skip ANY phase in the sequence
- Start with IMPLEMENT (must start with STRATEGIZE)
- Claim "done" without completing VERIFY
- Try to jump from SPEC directly to IMPLEMENT
- Attempt to bypass quality gates
- Ignore required rework loops (e.g., fail to return to SPEC/PLAN/THINK/IMPLEMENT when VERIFY, REVIEW, PR, or MONITOR expose gaps)

### Violations Are Tracked

Every phase skip attempt is:
- Logged as a `work_process_violation`
- Blocks task execution immediately
- Recorded in telemetry metrics
- Reported in decision journal

### Why This Matters

Skipping phases leads to:
- False completion claims (99.4% when actual is 98.7%)
- Unverified functionality
- Technical debt accumulation
- Trust erosion with users

### The Bottom Line

**If you don't follow STRATEGIZE→SPEC→PLAN→THINK→IMPLEMENT→VERIFY→REVIEW→PR→MONITOR:**
- Your task will be REJECTED
- You will be forced to restart
- The violation will be recorded
- If VERIFY/REVIEW/PR/MONITOR reveals defects, you MUST loop back to the earliest affected phase, redo the work, and re-run all downstream phases with fresh evidence.

This is not optional. This is not negotiable. This is MANDATORY.

## Prompt Header Attestation

- Prompt headers include the STRATEGIZE→MONITOR block verbatim; the orchestrator signs the header and records the signature in the phase ledger.
- When an agent session starts, the runtime re-hashes the header. Any mismatch (missing phases, edited text, reordered rules) causes an immediate abort before tools can run.
- Atlas MANIFEST hashes include `tools/wvo_mcp/src/utils/prompt_headers.ts` and this document so prompt drift forces an attestation failure.
- Evidence for each task must include the recorded signature + verification result (stored in `state/process/ledger.jsonl` and linked from PR/Monitor artifacts).
