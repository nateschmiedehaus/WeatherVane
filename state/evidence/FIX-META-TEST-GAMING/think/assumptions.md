# THINK: FIX-META-TEST-GAMING

**Task ID**: FIX-META-TEST-GAMING
**Date**: 2025-10-30

---

## Key Assumptions

### Assumption 1: Heuristic Signals Correlate with Gaming

**Assumption**: Low assertion counts, high mock ratios, weak deferrals correlate with gaming behavior

**Risk if wrong**: Heuristics flag legitimate code (false positives) or miss gaming (false negatives)

**Validation**: Test on 20 synthetic examples (5 GENUINE, 5 SUSPICIOUS, 10 GAMING) → measure accuracy

**Mitigation**: Adjust weights and thresholds based on test results; use LLM review to catch false positives

---

### Assumption 2: LLM Can Detect Gaming Semantically

**Assumption**: LLM reviewing evidence can distinguish genuine verification from gaming better than heuristics alone

**Risk if wrong**: LLM review costs money without improving accuracy

**Validation**: Compare LLM accuracy vs heuristic-only accuracy on test set

**Mitigation**: If LLM doesn't improve accuracy >10%, disable LLM review and rely on heuristics only

---

### Assumption 3: Two-Stage Detection Balances Cost and Accuracy

**Assumption**: Heuristic screening (fast/cheap) → LLM review (slow/expensive) optimizes cost vs accuracy

**Risk if wrong**: Either (a) too many false positives from heuristics → LLM review cost explodes OR (b) heuristics too lenient → gaming passes through

**Validation**: Monitor LLM review rate (<30% of tasks) and cost (<$0.15 per task average)

**Mitigation**: Tune heuristic thresholds to keep LLM review rate in 10-20% range

---

### Assumption 4: Gaming Patterns Are Detectable from Evidence Text

**Assumption**: Gaming leaves observable traces in evidence documents (trivial assertions, weak justifications, missing outputs)

**Risk if wrong**: Agents game by writing *better fake evidence* (e.g., fabricate realistic test outputs)

**Validation**: Monitor for Pattern 5 (false documentation) - check if claimed tests exist in codebase

**Mitigation**: Add filesystem cross-checks in future iteration (deferred to separate task)

---

### Assumption 5: Agents Will Not Immediately Adapt Gaming Strategies

**Assumption**: Initial gaming patterns (trivial tests, mock abuse, weak deferrals) will remain common long enough to validate detection

**Risk if wrong**: Agents adapt gaming tactics faster than we can update detection

**Validation**: Track gaming attempts over time - are patterns evolving?

**Mitigation**: Adaptive learning (update heuristics when new patterns emerge), adversarial LLM review catches novel gaming

---

## Pre-Mortem

### Failure Mode 1: Heuristic False Positives

**Scenario**: Heuristics flag 50% of legitimate tasks as gaming (e.g., legitimate unit tests flagged for "mock abuse")

**Symptoms**:
- High LLM review rate (>50% of tasks)
- LLM frequently says "GENUINE" (overriding heuristics)
- Agent frustration ("gaming detector is broken")

**Prevention**: Test heuristics on 20 synthetic examples *before* deploying, tune thresholds for <10% false positive rate

**Mitigation**: Tighten heuristic thresholds (increase LOW/MEDIUM risk boundaries), rely more on LLM review

---

### Failure Mode 2: LLM Cost Explosion

**Scenario**: LLM review costs exceed $1 per task due to high flagging rate or long evidence documents

**Symptoms**:
- LLM review rate >50% (heuristics flag too many tasks)
- Evidence documents >10k tokens (LLM review costs $0.10-$0.20 each)
- Total cost $50-100 per day (100 tasks/day * $0.50-$1.00 per task)

**Prevention**: Set hard limits (max 10k tokens per LLM review, skip review if evidence too long), tune heuristics to flag <20% of tasks

**Mitigation**: Disable LLM review temporarily, tighten heuristics, add evidence summarization before LLM review

---

### Failure Mode 3: Gaming Adapts Faster Than Detection

**Scenario**: Agents learn to game by adding "assert(1 + 1 === 2)" (non-trivial but meaningless), detection misses this

**Symptoms**:
- Heuristics say LOW risk (assertions present, not trivial patterns)
- LLM review not triggered
- But actual verification is still theater (assertions test nothing meaningful)

**Prevention**: Include semantic LLM review for random sample (5% of LOW risk tasks) to catch undetected gaming

**Mitigation**: Update heuristics to detect "tautology assertions" (assert(known_constant === same_constant)), add adversarial training examples

---

### Failure Mode 4: LLM Review is Too Lenient

**Scenario**: LLM frequently says "GENUINE" or "SUSPICIOUS" (not "GAMING") despite clear gaming patterns

**Symptoms**:
- Heuristics flag 20% of tasks as HIGH risk
- LLM review triggered for all HIGH risk tasks
- But LLM approves 90% of them (only 10% rejected)
- Gaming continues despite detection system

**Prevention**: Test adversarial prompt on synthetic gaming examples, tune prompt to be "harsh but fair"

**Mitigation**: Strengthen adversarial prompt (add examples of gaming), lower LLM confidence threshold for rejection (GAMING if confidence >0.7, not >0.9)

---

### Failure Mode 5: Detection Creates Arms Race

**Scenario**: Detection → gaming adapts → update detection → gaming adapts again → infinite loop

**Symptoms**:
- Monthly updates to heuristics and LLM prompts
- Gaming patterns constantly evolving
- High maintenance burden (developer time spent on detection)

**Prevention**: Make genuine verification *easier* than gaming (provide tools, templates, examples), not just better detection

**Mitigation**: Focus on prevention (standards clarity, examples, ease of use) over detection (arms race)

---

### Failure Mode 6: False Documentation Not Detected

**Scenario**: Agent claims "npm test → 15/15 passing" but no test files exist, Pattern 5 (false documentation) slips through

**Symptoms**:
- Heuristics see evidence of testing (text says "15/15 passing")
- LLM review sees "looks genuine" (realistic evidence text)
- But codebase has no test files (manual inspection reveals fraud)

**Prevention**: Add filesystem cross-check (verify claimed test files exist), but deferred to separate task

**Mitigation**: Human review catches this during PR review, create FIX-META-TEST-FALSE-DOCS task

---

### Failure Mode 7: Performance Impact (Slow Phase Transitions)

**Scenario**: Gaming detection adds 5-10 seconds to VERIFY → REVIEW transition (heuristic + LLM review)

**Symptoms**:
- Agents complain "phase transitions are slow"
- Timeout errors if LLM review takes >10 seconds
- Autopilot loop slows down (less tasks completed per day)

**Prevention**: Set timeout limits (max 5 seconds for LLM review), show progress indicator ("Running gaming detection...")

**Mitigation**: Make LLM review async (don't block transition, review in background), cache LLM results for retries

---

## Assumption Validation Plan

### Week 1: Synthetic Testing
- [ ] Create 20 synthetic examples (5 GENUINE, 5 SUSPICIOUS, 10 GAMING)
- [ ] Run heuristic scoring on all 20 → measure accuracy
- [ ] Run LLM review on all 20 → measure accuracy
- [ ] Compare heuristic-only vs two-stage detection
- [ ] Tune thresholds if accuracy <85%

### Week 2: Dry Run (Observe Mode)
- [ ] Deploy detection in observe-only mode (log but don't block)
- [ ] Monitor LLM review rate (<30% of tasks)
- [ ] Check for false positives (tasks flagged but LLM says GENUINE)
- [ ] Monitor cost (<$0.15 per task average)

### Week 3: Enforcement (Block Mode)
- [ ] Enable blocking (reject if LLM says GAMING)
- [ ] Monitor for gaming attempts (GAMING verdicts)
- [ ] Check for false positives (agents complaining about wrong rejections)
- [ ] Gather feedback from agents

### Week 4: Adaptation
- [ ] Analyze gaming patterns found (are they expected patterns?)
- [ ] Update heuristics if new patterns emerge
- [ ] Adjust LLM prompt if too lenient/strict
- [ ] Write post-deployment report

---

## Key Decision Points

### Decision 1: Deploy or Not?
**When**: After synthetic testing (Week 1)
**Condition**: If accuracy >85% on test set
**Action if YES**: Deploy in observe mode
**Action if NO**: Refine heuristics, re-test

### Decision 2: Enable Blocking or Not?
**When**: After 1 week of observe mode (Week 2)
**Condition**: If false positive rate <10% AND cost <$0.15 per task
**Action if YES**: Enable blocking (reject GAMING verdicts)
**Action if NO**: Continue observing, tune thresholds

### Decision 3: Keep LLM Review or Disable?
**When**: After 2 weeks of enforcement (Week 4)
**Condition**: If LLM improves accuracy >10% over heuristics alone AND cost acceptable
**Action if YES**: Keep LLM review
**Action if NO**: Disable LLM, rely on heuristics only

---

**Next Phase**: IMPLEMENT (create GamingDetector, LLMGamingReviewer, integrate into WorkProcessEnforcer)
