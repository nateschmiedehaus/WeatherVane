# STRATEGIZE — FIX-DRIFT-DETECTION-IMP24

**Task**: Automate attestation hash drift detection (IMP-35 follow-up)
**Date**: 2025-10-30
**Strategist**: Claude (Autopilot)

---

## Problem Reframing

### Surface Problem
"Detect when eval prompts differ from production prompts via attestation hash comparison"

### Deeper Problem
**Eval-production misalignment erodes confidence in quality gates**

When evals test different prompts than production uses:
- ✅ Eval may pass, but production uses untested prompt (false confidence)
- ✅ Changes to PromptCompiler don't trigger eval re-runs (silent drift)
- ✅ Persona/overlay updates bypass eval validation (unvalidated quality)
- ✅ Quality gate decisions based on stale data (wrong signals)

### Root Cause
**Prompt evolution without eval coupling**

1. PromptCompiler generates prompts dynamically (IMP-21)
2. Overlays inject domain knowledge (IMP-23)
3. Personas modify tone/focus (IMP-22)
4. Production uses latest compiled prompt
5. Evals test prompts from when baseline was captured
6. **Gap**: No mechanism detects when #4 ≠ #5

**Why this matters**: Trust in eval results depends on "are we testing what we're running?"

### Is This the Right Problem?
**Yes, but with caveats**

**Right problem because**:
- Quality gates (AC5 from IMP-35) block PRs based on eval results
- If evals test old prompts, quality gates give false signals
- Drift detection enables "recapture baseline" workflow

**Caveats**:
- Detection is reactive (drift already happened)
- Doesn't prevent drift, just alerts on it
- Manual remediation still required (recapture baseline)

**Deeper question**: Should we prevent drift instead of detecting it?

---

## Alternative Approaches

### Alternative 1: Manual Hash Checking (Status Quo)
**What**: Human manually compares attestation hashes between baseline and current runs

**Pros**:
- ✅ Zero implementation cost (already have hashes in results)
- ✅ Flexible (human can judge "acceptable drift" vs "must recapture")
- ✅ Tier 2 sufficient (IMP-35 accepted this)

**Cons**:
- ❌ Requires discipline (easy to forget)
- ❌ Time-consuming (jq commands, mental comparison)
- ❌ Error-prone (might miss subtle drift)
- ❌ Doesn't scale (30 tasks × multiple variants = 100+ hashes)

**Verdict**: Acceptable for Tier 2, insufficient for Tier 3 (production hardening)

---

### Alternative 2: Automated Hash Comparison (Proposed)
**What**: Script compares baseline hashes vs current run hashes, alerts on mismatch >10%

**Pros**:
- ✅ Automated (no human discipline needed)
- ✅ Fast (seconds, not minutes)
- ✅ Actionable output ("task STRATEGIZE-001 drifted: recapture baseline")
- ✅ Scales (handles 100s of hashes)
- ✅ CI-friendly (can gate PRs on drift check)

**Cons**:
- ⚠️ Requires 3 hours implementation
- ⚠️ Threshold tuning needed (10% too strict? too lenient?)
- ⚠️ Doesn't prevent drift (reactive, not preventive)

**Verdict**: Good for Tier 3 (automated detection + actionable alerts)

---

### Alternative 3: Immutable Prompt Snapshots
**What**: Eval runs snapshot the exact prompt used, baseline locks to that snapshot

**How it would work**:
1. Baseline capture creates `baseline_prompts.json` (full text + hash)
2. Future eval runs load baseline prompts (not recompile)
3. Drift is impossible (evals always test exact same prompt)

**Pros**:
- ✅ Prevents drift (not just detects)
- ✅ Reproducibility (can re-run exact baseline eval)
- ✅ Clear semantics ("testing frozen prompt")

**Cons**:
- ❌ Can't test new prompts without recapture (rigidity)
- ❌ Doesn't validate "current production prompt" (tests old snapshot)
- ❌ Storage overhead (29 tasks × full prompt text × variants)
- ❌ Misses the point: we WANT to detect when production diverged from baseline

**Verdict**: Wrong problem - we want drift detection, not drift prevention

---

### Alternative 4: Version-Aware Eval Runs
**What**: Evals test multiple prompt versions (baseline + current), compare results

**How it would work**:
1. Run eval with baseline prompts (frozen snapshot)
2. Run eval with current prompts (recompiled)
3. Compare success rates: if divergence >5%, flag drift

**Pros**:
- ✅ Detects functional drift (not just hash changes)
- ✅ Validates "current prompt still performs well"
- ✅ Catches regressions from prompt changes

**Cons**:
- ❌ 2x eval cost (run twice)
- ❌ 2x latency (sequential runs)
- ❌ Complex semantics ("which version is baseline?")
- ❌ Overkill for "did prompt change" question

**Verdict**: Interesting for future (functional drift detection), overkill for this task

---

### Alternative 5: Do Nothing
**What**: Accept manual hash checking indefinitely

**Pros**:
- ✅ Zero cost

**Cons**:
- ❌ Tier 2 only (blocks Tier 3 achievement)
- ❌ Drift likely to be missed (human error)
- ❌ Wastes time on manual comparison

**Verdict**: Not acceptable for production hardening

---

## Recommended Approach

**Alternative 2: Automated Hash Comparison**

**Why**:
1. **Right scope**: Solves the immediate problem (automated drift detection)
2. **Right effort**: 3 hours (proportional to value)
3. **Right semantics**: "Did prompt change since baseline?" is the right question
4. **Right timing**: IMP-35 Tier 2 → Tier 3 promotion requires this
5. **Extensible**: Can add Alternative 4 (version-aware) later if needed

**Strategy**:
- Build simple, focused tool: `bash tools/wvo_mcp/scripts/check_drift.sh`
- Compare baseline hashes vs latest run
- Alert if mismatch >10% of tasks (configurable threshold)
- Output: Which tasks drifted, recommended action (recapture baseline)
- CI-friendly: exit code 0 = no drift, 1 = drift detected

**Non-goals** (for this task):
- ❌ Drift prevention (different problem)
- ❌ Automated baseline recapture (requires user approval)
- ❌ Functional drift detection (Alternative 4 - future work)

---

## Strategic Alignment

### Autopilot Functionality Impact
**Which autopilot behavior changes**:
- Quality gate decisions (AC5 from IMP-35) become more reliable
- Eval-driven prompt tuning becomes trustworthy
- Persona/overlay rollout has validation feedback loop

**How this improves autonomy**:
- Autopilot can self-detect "evals are stale, need recapture"
- Quality gates give accurate signals (no false passes)
- Prompt evolution observable and controllable

### Worthiness
**Why now**:
- IMP-35 just completed (Tier 2) - natural follow-up
- Drift detection was explicitly deferred from IMP-35 (Review phase, Gap #1)
- Tier 3 hardening requires automated monitoring
- Low effort (3h), high value (unlocks Tier 3)

**Alternatives considered**: 5 alternatives evaluated above
- Manual checking: Insufficient for Tier 3
- Immutable snapshots: Wrong problem
- Version-aware: Overkill
- Do nothing: Unacceptable
- **Automated comparison: Right balance**

**Kill criteria**:
- If implementation exceeds 5 hours → stop, defer to epic
- If threshold tuning becomes complex → simplify (always alert, no threshold)
- If CI integration breaks existing workflow → make optional

**Pivot triggers**:
- If user wants drift prevention instead → Alternative 3
- If functional drift more important → Alternative 4

---

## Autopilot Ledger Entry

**Task**: FIX-DRIFT-DETECTION-IMP24
**Phase**: STRATEGIZE
**Timestamp**: 2025-10-30
**Decision**: Proceed with automated hash comparison (Alternative 2)
**Rationale**: Right scope, right effort, right timing for Tier 3 promotion
**Related Work**: IMP-35 (parent task), IMP-24 (attestation hashes)

---

## Next Phase

**SPEC**: Define acceptance criteria for drift detection:
- AC1: Load baseline hashes from eval results
- AC2: Load current run hashes
- AC3: Compare - alert if mismatch >10%
- AC4: Output which tasks drifted
- AC5: Recommend recapture baseline with justification
