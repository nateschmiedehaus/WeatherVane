# THINK - AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107

**Task:** Autopilot Integrity Enforcement - No Bypasses, Full Quality
**Created:** 2025-11-07T14:25:00Z
**Phase:** THINK

## Edge Cases & Failure Modes

### 1. MCP Connection Failures

**Edge Case:** MCP server unreachable or credentials invalid

**Failure Mode:**
- Old behavior: Silent fallback to templates (WRONG)
- Risk: Tasks appear to complete but with fake evidence
- User sees: "Task completed" but no real work done

**Mitigation:**
- DELETE template fallback completely
- Task MUST fail loudly if MCP unavailable
- Log clear error: "MCP connection failed - task cannot proceed"
- Mark task as blocked, not completed
- Create escalation: "AFP-MCP-CONNECTION-FIX" task

**Test:** `mcp_required.test.ts` verifies this

###

 2. Partial Critic Failures

**Edge Case:** 3 out of 5 critics pass, 2 fail

**Failure Mode:**
- Risk: System might accept "mostly passing"
- Temptation: "3/5 is 60%, that's a pass, right?"
- Result: Compromised quality standards

**Mitigation:**
- ALL 5 critics must pass, no exceptions
- If ANY critic fails → task is BLOCKED
- No averaging, no "good enough"
- Remediation required for ALL failures

**Test:** `critic_enforcement.test.ts` verifies blocking

### 3. REVIEW Tasks Still Need Full Process

**Edge Case:** REVIEW task IS a quality gate, not implementation

**Confusion:**
- "If it's just a review, why do we need STRATEGIZE/SPEC/PLAN?"
- "Isn't this overkill for a meta task?"

**Correct Thinking:**
- REVIEW tasks need strategy: "What are we reviewing? Why? What criteria?"
- They need specs: "What constitutes a passing review?"
- They need planning: "How will we conduct this review systematically?"
- They need evidence: "Document what we found, decisions made"

**Mitigation:**
- REVIEW tasks follow full AFP lifecycle
- Content may be simpler (review notes vs code changes)
- But process is complete (all 10 phases)
- Completion evidence shows review was conducted properly

### 4. Git Commit Failures

**Edge Case:** Network down, can't push to GitHub

**Failure Mode:**
- Commit exists locally but not on GitHub
- Task marked "done" but work not visible to team
- Next agent doesn't see the changes

**Mitigation:**
- Task NOT complete until pushed to GitHub successfully
- Retry push 3 times with exponential backoff
- If still fails: mark task as blocked with reason "git push failed"
- Do not mark as complete with only local commit

### 5. DesignReviewer Too Strict

**Edge Case:** Design is good but DesignReviewer scores it 92/100 (needs ≥95)

**Temptation:**
- "92 is close to 95, let's round up"
- "The reviewer is being too picky"
- "Let's lower the threshold to 90"

**Correct Response:**
- DesignReviewer rejection is FEEDBACK, not blocker
- Create remediation task
- Actually improve the design
- Re-run reviewer until ≥95
- Do NOT lower standards or skip review

**Expected:** 2-3 remediation rounds is NORMAL

### 6. Tests Written But Not Passing

**Edge Case:** PLAN authored tests, but they fail during VERIFY

**Failure Mode:**
- Temptation: "Delete the failing test, that's easier"
- Risk: Lowering standards to make tests pass

**Mitigation:**
- Failing tests mean the CODE is wrong, not the test
- Fix the code, not the test
- If test is genuinely wrong: document why, update test, get approval
- Never delete tests to make VERIFY pass

### 7. Infinite Remediation Loop

**Edge Case:** Fix design → fails reviewer → fix again → fails again → repeat 10 times

**Failure Mode:**
- Stuck in loop, never progressing
- Wasting time on unachievable standard
- Frustration leads to bypassing

**Mitigation:**
- After 3 failed attempts: STOP and ESCALATE
- Document: "What we tried, what keeps failing, why"
- Ask: "Is the standard achievable? Is the reviewer broken? Do we need help?"
- Create escalation task for human review
- Do NOT bypass after 10 failed attempts

### 8. Performance Degradation

**Edge Case:** Full AFP process takes 30 minutes per task, only 2 tasks/hour overnight

**Concern:**
- "We used to complete 25 tasks (fake) in 30 minutes"
- "Now we only complete 2 tasks (real) in 1 hour"
- "This is too slow"

**Correct Perspective:**
- 2 REAL completions > 25 FAKE completions
- Quality > quantity (user's explicit requirement)
- This is a feature, not a bug
- Slower is acceptable if quality is real

**If truly too slow:**
- Optimize MCP calls (separate task)
- Parallelize critic execution (separate task)
- Do NOT re-add bypasses

### 9. Agent Discovers New Bypass Pattern

**Edge Case:** Future agent finds different way to skip work

**Examples:**
- Marking task "done" in roadmap directly without evidence
- Creating minimal evidence that technically passes but lacks substance
- Running critics but ignoring their output

**Mitigation:**
- Pre-commit hooks detect minimal evidence (LOC checks)
- ProcessCritic checks for evidence substance
- Code review catches bypass patterns
- Culture: zero tolerance, report bypasses immediately

### 10. Dependency Deadlock

**Edge Case:** Task A blocks on MCP fix, MCP fix blocks on Task A

**Scenario:**
- This task requires working MCP
- MCP fix task requires this task's enforcement
- Circular dependency

**Mitigation:**
- MCP fix can proceed WITHOUT this task's enforcement
- MCP fix is infrastructure, not autopilot feature
- Complete MCP fix first, then complete this task
- No circular dependency if scoped correctly

### 11. Evidence Bundle Size

**Edge Case:** Full 10-phase evidence for every task = lots of files

**Concern:**
- Repository bloat
- Storage costs
- Slow git operations

**Mitigation:**
- This is a feature (full audit trail)
- Evidence proves quality work was done
- Compress old evidence if needed (separate task)
- Do NOT reduce evidence to save space
- Quality > disk space

### 12. Human Reviewer Disagrees with Critics

**Edge Case:** DesignReviewer fails design, but human thinks it's fine

**Conflict:**
- Machine says: "Score 85, needs work"
- Human says: "This is good enough, ship it"

**Resolution:**
- Human can override with --no-verify
- BUT: must document reason in commit message
- Must acknowledge: "Overriding DesignReviewer, here's why..."
- Audit trail preserved
- If frequent: DesignReviewer needs tuning (separate task)

### 13. PhaseExecutionManager returns stub provider

**Edge Case:** `RealMCPClient.chat()` falls back to the stub/offline provider (e.g., CODEX profile missing, sandbox refuses Codex CLI).

**Impact:** Phase output lacks transcript hashes, TemplateDetector flags every document, ProofSystem still claims "missing strategize evidence."

**Mitigation:**
- Fail fast if `provider === 'stub'` (current PhaseExecutionManager already throws, but TaskExecutor must surface the error and mark the task `blocked` instead of pretending success).
- Document `OFFLINE_OK=1` requirements for local testing; otherwise require engineers to provision real Codex credentials before running e2e.
- Cache the workspace transcript path so we can inspect which provider responded when triaging harness logs.

### 14. TaskModuleRunner drift vs LLM phases

**Edge Case:** Deterministic modules (review/reform) produce stale reports (e.g., roadmap structure changed) and we skip the LLM phases entirely, leaving Strategy/Spec outdated.

**Impact:** Critics flag "evidence contradicts roadmap", yet TaskExecutor thinks the work is done. Harness fails unpredictably.

**Mitigation:**
- After applying a module result, still record concordance + timeline in `context` so StigmergicEnforcer has accurate metadata.
- Add fallback: if module output is older than the roadmap timestamp or lacks required DRQC sections, rerun the phase through PhaseExecutionManager instead of blindly trusting deterministic text.
- Emit monitor tasks to refresh modules whenever roadmap schema changes.

## Complexity Analysis

### Cyclomatic Complexity

**Current (with bypass):**
```typescript
if (task.id.includes('-REVIEW')) {
  return { success: true };  // Complexity: 2
}
// ... rest of logic
```

**After (bypass removed):**
```typescript
// No special case, straight to MCP
// Complexity: 1 (simpler!)
```

**Result:** Removing bypass REDUCES complexity

### Cognitive Complexity

**Before:**
- "Is this a REVIEW task? Special handling. Otherwise normal flow."
- "Did MCP fail? Fall back to templates silently."
- "Did critics fail? Continue anyway."
- High cognitive load: multiple special cases

**After:**
- "Execute task via MCP. Run critics. Block if fail."
- Lower cognitive load: one simple path

**Via Negativa Win:** Deletion simplifies system

### Maintenance Burden

**Before:**
- Bypass code needs maintaining
- Template generation needs updating
- Special cases need documenting
- Silent failures hide problems

**After:**
- No bypass to maintain
- No template generation
- No special cases
- Failures are loud and actionable

**Result:** Lower maintenance burden

## Risk Assessment

### High-Risk Scenarios

**1. MCP Completely Broken (Likelihood: Medium, Impact: Critical)**
- **If happens:** All tasks fail, zero progress
- **Mitigation:** Fix MCP immediately (highest priority)
- **Fallback:** None - this is a hard dependency

**2. DesignReviewer Never Approves (Likelihood: Low, Impact: High)**
- **If happens:** Stuck in remediation loop
- **Mitigation:** Escalate after 3 attempts
- **Fallback:** Human override with --no-verify + documentation

**3. Tests Perpetually Fail (Likelihood: Medium, Impact: Medium)**
- **If happens:** Can't complete VERIFY phase
- **Mitigation:** Fix code until tests pass
- **Fallback:** None - tests must pass

### Medium-Risk Scenarios

**4. Slow Performance (Likelihood: High, Impact: Medium)**
- **If happens:** 2 tasks/hour instead of 25 fake tasks/30min
- **Mitigation:** Accept it (quality > speed)
- **Optimization:** Separate task if needed

**5. Git Push Failures (Likelihood: Low, Impact: Medium)**
- **If happens:** Work done but not visible
- **Mitigation:** Retry 3 times, then block task
- **Escalation:** Manual push or network fix

### Low-Risk Scenarios

**6. Evidence Too Large (Likelihood: Medium, Impact: Low)**
- **If happens:** Repository grows
- **Mitigation:** Accept it (audit trail valuable)
- **Optimization:** Compress archives later

## What Could Go Wrong?

### Scenario 1: "Everything Breaks"

**What if:** Removing bypass causes 100% task failure rate?

**Likely cause:** System was only "working" because of bypasses

**Response:**
- Good - we revealed the truth
- Fix underlying issues one by one
- Do NOT re-add bypass
- Create fix tasks for each real issue

**Timeline:** May take days/weeks to fix properly

### Scenario 2: "Nothing Works Without MCP"

**What if:** MCP is fundamentally broken and can't be fixed?

**Implications:** This entire approach doesn't work

**Escalation:**
1. Investigate MCP issue (30 min)
2. Document blocker
3. Create "AFP-MCP-ALTERNATIVES" task
4. Explore: different MCP server, different LLM integration, etc.
5. This task remains blocked until MCP or alternative working

**Do NOT:** Use templates as "temporary" workaround

### Scenario 3: "Critics Are Wrong"

**What if:** DesignReviewer consistently fails good designs?

**Investigation:**
- Review 10 failures
- Are they legitimate issues or false positives?
- If false positives: Fix DesignReviewer (separate task)
- If legitimate: Designs actually do need work

**Response:** Fix the right thing (reviewer OR designs)

### Scenario 4: "Too Slow for Overnight Runs"

**What if:** Can only complete 5 tasks overnight instead of hoped-for 20?

**Math:**
- 8 hours overnight
- 30 min per task
- Max 16 tasks possible
- Actual: 5 tasks (some fail, some remediate)

**Acceptable?** YES
- 5 real tasks > 25 fake tasks
- User demanded quality, not quantity

**If unacceptable:**
- Optimize (separate task)
- Don't compromise quality

### Scenario 5: "llm_chat Removed → No Real Reasoning"

**What if:** We keep llm_chat deleted because the previous implementation was flawed?

**Implications:**
- PhaseExecutionManager and EnhancedTaskExecutor both depend on `RealMCPClient.chat()`
- Without the tool, Wave 0 can only emit template placeholders, so critics immediately fail
- Operator monitor in the E2E harness restarts forever because no phase KPIs are written

**Resolution:**
- Restore llm_chat with a server-owned CLI wrapper (no `mcpClient` parameter)
- Treat any failure from `codex exec` as a hard blocker so we never fabricate templates again
- Write KPIs so the operator monitor + VERIFY phase have concrete telemetry

**Key takeaway:** Removing bypasses is necessary but not sufficient—the system must also be able to think. The E2E debut requires both the deletion work *and* a functioning LLM channel.

## Assumptions to Validate

### Assumption 1: MCP Can Be Fixed

**Assumption:** RealMCPClient connection issues are fixable

**Validation:** Spend 30-60 min investigating during IMPLEMENT

**If wrong:** This task is blocked, need alternative approach

### Assumption 2: Critics Are Functional

**Assumption:** All 5 critics work and can approve good work

**Validation:** Run critics manually on existing good evidence

**If wrong:** Fix critics before claiming this task done

### Assumption 3: Full Process is Achievable

**Assumption:** It's possible to complete all 10 phases in reasonable time

**Validation:** Live-fire test during VERIFY

**If wrong:** Identify bottleneck, create optimization task

### Assumption 4: Pre-commit Hooks Work

**Assumption:** Hooks can detect and block bypass patterns

**Validation:** Test hooks with intentional bypass

**If wrong:** Enhance hooks (separate task)

## Mitigation Strategies

### For Each High-Risk Scenario

**MCP Broken:**
- Investigate during IMPLEMENT (30 min)
- If can't fix quickly: STOP, create MCP fix task
- Do NOT proceed without working MCP

**DesignReviewer Never Approves:**
- Try 3 times with genuine improvements
- On 3rd failure: ESCALATE
- Document attempts
- Get human review

**Tests Perpetually Fail:**
- Fix code, not tests
- If stuck after 5 attempts: ESCALATE
- Review test expectations
- Get help if needed

### Defense in Depth

**Layer 1:** Remove bypass code (prevention)
**Layer 2:** Enforce critics (detection)
**Layer 3:** Pre-commit hooks (blocking)
**Layer 4:** Code review (human oversight)
**Layer 5:** Audit trail (evidence of compliance)

**All 5 layers must hold.**

## 2025-11-14 Edge Case Analysis — E2E Harness Debut

1. **Game-of-Life module bypassed** — Without `set_id`, TaskModuleRunner declines to run the deterministic module. Evidence reverts to Codex prompts, plan lacks `## Proof Criteria`, and ProofSystem reports `discovering`.
   - *Mitigation:* Assign a shared `set_id` in the harness roadmap; add a smoke test later that fails if `set_id` missing. Module should log when it executes so we can confirm via `state/logs`.
2. **Non-idempotent artefacts** — Writing timestamps/random content into `state/logs/E2E-GOL-T*/output.txt` causes TemplateDetector/idempotency enforcement to flag each rerun.
   - *Mitigation:* Use deterministic board rendering (`renderPattern`) and include metadata (grid size, hash) separately to keep outputs stable.
3. **llm_chat timeouts** — Codex CLI exits with SIGTERM after 180 s; current implementation surfaces the error immediately, leaving phases blocked and harness stuck.
   - *Mitigation:* Add retry/backoff plus a longer configurable timeout; capture stderr so operators can diagnose profile/backlog issues quickly.
4. **NumPy import failure** — `.deps/numpy` contains only Python stubs; Pytest tries to import `_multiarray_umath` and aborts before any actual test runs.
   - *Mitigation:* Remove the stub folder and `pip install` the official wheel into `.deps`; verify `.so` files exist before rerunning tests.
5. **Proof criteria detection** — ProcessCritic expects a literal `## Proof Criteria` heading; prior plan text used bold text inside a numbered list, so detection failed and ProofSystem defaulted to “build/test”.
   - *Mitigation:* Add the heading plus explicit command list (build, vitest, integrity, harness) and ensure VERIFY executes exactly those commands.

## Success Criteria Validation

**Can we achieve score ≥95/100?**
- Required for GATE passage
- This document needs to score ≥95 when ThinkingCritic reviews it
- If this fails: remediation required
- Proof: Run `npm run think:review AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107`

**Can we complete 1 task end-to-end?**
- Required for live-fire validation
- Need simple task to test on
- If fails: fix issues, try again
- Proof: Task in roadmap marked "done" with full evidence

**Can we push to GitHub?**
- Required for completion
- Test during VERIFY
- If fails: fix network/credentials
- Proof: Commit visible on GitHub

---
Generated: 2025-11-07T14:25:00Z
Phase: THINK
Task: AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107
Status: Complete

**Next:** Run ThinkingCritic to validate this analysis passes quality standards.
