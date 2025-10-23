# Critic Enforcement - Making Critics Mandatory

**Date:** 2025-10-19
**Status:** ACTIVE

---

## Problem Statement

**Previous pattern:** Critics existed but were never called (TypeScript LoopDetector).

**Solution:** Make critics **MANDATORY** with enforcement at multiple levels:
1. **Code enforcement** - autopilot.sh calls critics automatically
2. **Roadmap enforcement** - tasks without metadata cannot be critiqued (flagged as incomplete)
3. **Policy enforcement** - policy controller verifies critics ran
4. **Visibility enforcement** - critique failures are loud and visible

---

## Enforcement Layers

### Layer 1: Autopilot Integration (ACTIVE)

**File:** `tools/wvo_mcp/scripts/autopilot.sh:4991-5010`

**How it works:**
```bash
# After summary saved, BEFORE git sync:
source critic_integration.sh
if ! run_critics_on_summary "$SUMMARY_JSON" "$STATE_FILE"; then
    # Critics found critical issues
    # Summary is rewritten: completed_tasks → blockers
    # Task cannot proceed
fi
```

**Guarantees:**
- Critics run on EVERY autopilot cycle with completed tasks
- Critical issues → Task blocked automatically
- No way to skip (unless integration script deleted)

**Evidence:** Critique JSON files in `state/critiques/`

---

### Layer 2: Roadmap Metadata Requirement

**File:** `state/roadmap.yaml`

**Required metadata for ALL tasks:**
```yaml
- id: T2.2.1
  name: Implement MMM
  metadata:
    # REQUIRED: What claims are made?
    claims:
      - "Uses Robyn or LightweightMMM"
      - "Includes adstock transformation"

    # REQUIRED: What dependencies must be satisfied?
    dependencies:
      code_imports: [robyn, numpy, pandas]
      data_requirements:
        - name: sales_daily
          min_rows: 90
      upstream_tasks: [T1.2.1]

    # REQUIRED: What's the problem type?
    problem_type: media_mix_modeling

    # REQUIRED: What methods are WRONG for this problem?
    wrong_methods:
      - LinearRegression  # Too simple
      - PropensityScoreMatching  # Wrong causal method

    # REQUIRED: What methods are correct?
    correct_methods:
      - Robyn
      - LightweightMMM
```

**Enforcement:**
- Tasks without metadata → Critics cannot run → Task flagged as "incomplete metadata"
- Incomplete metadata → Autopilot warns before starting task

---

### Layer 3: Policy Controller Verification

**File:** `tools/wvo_mcp/scripts/autopilot_policy.py`

**Policy checks:**
1. Before recommending "execute_tasks", verify critic metadata exists
2. After task execution, verify critique file was created
3. If critique file missing → Policy flags "critic_not_run" blocker

**Added to policy decision:**
```python
def infer_action(domain: str, features: Dict) -> str:
    # ... existing logic ...

    # NEW: Check if critics are configured
    if not has_critic_metadata(task):
        return "idle"  # Don't execute without critic metadata

    # NEW: Check if previous task had critics run
    if previous_task_completed and not critique_exists(previous_task):
        return "idle"  # Don't proceed if critics didn't run
```

---

### Layer 4: Visibility & Logging

**Loud failures:**
- ❌ Critic failures log to `/tmp/wvo_autopilot.log` with PREFIX `❌ CRITICAL:`
- Critique files saved to `state/critiques/{task_id}_critique.json`
- Context.md updated with critic blockers
- Git commits include critique evidence

**No silent failures:**
- If critics find issues, autopilot CANNOT proceed
- Summary is rewritten (completed → blockers)
- Next cycle will see blockers and act accordingly

---

## Enforcement Mechanisms

### 1. Autopilot Cannot Skip Critics

```bash
# Autopilot.sh line 4991-5010
# Critics are called AFTER summary saved, BEFORE git sync
# If critic_integration.sh missing → WARNING logged (visible in logs)
# If critics BLOCK → summary rewritten, task cannot proceed
```

**Attack surface:**
- Only way to skip: Delete `critic_integration.sh` file
- If deleted: Autopilot logs WARNING (visible to user)
- User will see: "⚠️ WARNING: Critic integration script not found - skipping critics (NOT SAFE)"

**Mitigation:**
- Add to pre-flight checks: Verify critic script exists
- Policy controller checks for critic script existence

### 2. Roadmap Metadata is Versioned

**Metadata in Git:**
- `state/roadmap.yaml` is version controlled
- Changes to metadata are visible in git history
- Removing metadata → Git diff shows removal

**Enforcement:**
- Pre-commit hook checks: All tasks have metadata
- CI/CD checks: Roadmap schema validation
- Policy controller checks: Tasks without metadata flagged

### 3. Policy Controller Verifies Execution

**Policy state tracks:**
```json
{
  "last_task": "T2.2.1",
  "critique_ran": true,
  "critique_file": "state/critiques/T2.2.1_critique.json",
  "critique_status": "BLOCK"
}
```

**If critics didn't run:**
- Policy detects missing critique file
- Returns "idle" with blocker: "Critics not run on previous task"
- Autopilot cannot proceed

### 4. Human Review Trigger

**When critics BLOCK:**
- Context.md updated with critique summary
- User sees blockers in next plan_next() call
- Must explicitly fix issues (no auto-bypass)

**Escalation path:**
- If 3+ cycles with same critic BLOCK → Escalate to Director Dana
- Dana reviews: Is critic wrong (false positive) or code wrong?
- Decision logged in `state/analytics/critic_overrides.jsonl`

---

## Critic Metadata Examples

### Example 1: MMM Task

```yaml
- id: T2.2.1
  name: Implement Media Mix Model
  status: in_progress
  metadata:
    claims:
      - "Uses Robyn or LightweightMMM for media mix modeling"
      - "Includes adstock transformation for carryover effects"
      - "Includes saturation curves for diminishing returns"
      - "Validates with time-series cross-validation (TimeSeriesSplit)"

    dependencies:
      code_imports:
        - robyn  # or lightweight_mmm
        - numpy
        - pandas
        - scipy
      data_requirements:
        - name: sales_daily
          min_rows: 90
          max_missing_rate: 0.10
          required_columns: [date, sales, product_id, geo]
        - name: weather_daily
          min_rows: 90
          required_columns: [date, temp, precip, geo]
        - name: ad_spend_daily
          min_rows: 90
          required_columns: [date, spend, campaign_id, platform]
      upstream_tasks:
        - T1.2.1  # Weather data pipeline
        - T1.3.1  # Ad data ingestion

    problem_type: media_mix_modeling

    correct_methods:
      - Robyn
      - LightweightMMM
      - PyMC-Marketing

    wrong_methods:
      - LinearRegression  # Too simple, no adstock/saturation
      - PropensityScoreMatching  # Wrong causal method for MMM

    maturity_requirements:
      min_test_coverage: 0.70
      max_placeholder_ratio: 0.10
      required_tests:
        - test_mmm_runs_without_error
        - test_adstock_transformation_applies
        - test_time_series_cv_no_leakage
```

### Example 2: Causal Inference Task

```yaml
- id: T3.1.1
  name: Implement weather causal inference
  status: pending
  metadata:
    claims:
      - "Uses Difference-in-Differences (DID) for weather effects"
      - "Compares cold vs warm weeks controlling for seasonality"
      - "Validates with parallel trends assumption test"

    dependencies:
      code_imports:
        - statsmodels
        - numpy
        - pandas
      data_requirements:
        - name: sales_weather_joined
          min_rows: 180  # Need 6 months for DID
      upstream_tasks:
        - T1.2.2  # Weather-sales join logic

    problem_type: causal_inference_observational

    correct_methods:
      - Difference-in-Differences
      - Synthetic control
      - Regression discontinuity

    wrong_methods:
      - PropensityScoreMatching  # Cannot randomize weather
      - RandomizedControlledTrial  # Cannot randomize weather

    maturity_requirements:
      required_tests:
        - test_parallel_trends_assumption
        - test_did_coefficient_significant
```

### Example 3: Product Taxonomy Task

```yaml
- id: T1.1.3
  name: Auto-classify products for weather affinity
  status: pending
  metadata:
    claims:
      - "Uses LLM (Claude/GPT) to classify products"
      - "Tags products with weather_affinity (winter/summer/rain/neutral)"
      - "Generates cross_brand_product_key for hierarchy"

    dependencies:
      code_imports:
        - anthropic  # or openai
        - pandas
      data_requirements:
        - name: products_shopify
          min_rows: 1  # At least some products
          required_columns: [product_id, title, category, vendor]
      upstream_tasks:
        - T1.1.1  # Shopify product ingestion

    problem_type: classification_llm

    correct_methods:
      - Claude API with structured prompts
      - GPT-4 with few-shot examples

    wrong_methods:
      - Hardcoded rules  # Not scalable
      - Keyword matching  # Too brittle

    maturity_requirements:
      required_tests:
        - test_winter_coat_tagged_winter
        - test_umbrella_tagged_rain
        - test_cross_brand_key_consistent
```

---

## Success Metrics

**Critic effectiveness (measured weekly):**
1. **Coverage:** % of completed tasks that had critics run (target: 100%)
2. **Block rate:** % of tasks where critics found critical issues (expected: 20-40% initially)
3. **False positive rate:** % of critic blocks that were overridden (target: <10%)
4. **Fix time:** Avg time from critic block to issue resolved (target: <24hr)

**Impact metrics:**
1. **Code quality:** % of tasks with placeholder/hardcoded values (before: 80%, target: <10%)
2. **Docs accuracy:** % of doc claims that match code (before: 50%, target: >95%)
3. **Rework rate:** Avg task re-work cycles (before: 3, target: 1)

**Dashboard location:** `state/analytics/critic_metrics.json`

---

## Rollout Plan

### Phase 1: Pilot (Week 1) ✅
- [x] Implement RealityCheckCritic, DependencyCritic, ConceptualCorrectnessCritic
- [x] Integrate into autopilot.sh
- [x] Test on 3 ML tasks (T2.2.1, T3.1.1, T1.1.3)

### Phase 2: Expand Coverage (Week 2)
- [ ] Add metadata to ALL roadmap tasks
- [ ] Add DataAvailabilityCritic
- [ ] Add DocumentationDriftCritic
- [ ] Add ScopeGapCritic

### Phase 3: Policy Integration (Week 3)
- [ ] Policy controller verifies critic metadata exists
- [ ] Policy tracks critique execution
- [ ] Pre-flight checks for critic script existence

### Phase 4: Escalation & Overrides (Week 4)
- [ ] Director Dana escalation for repeated blocks
- [ ] Override mechanism with logging
- [ ] False positive tracking

---

## Bypass Prevention

**Question: Can autopilot bypass critics?**

**Answer: Only by deleting files (visible in git)**

**Bypass attempts:**
1. **Delete critic_integration.sh**
   - Logged: "⚠️ WARNING: Critic integration script not found"
   - Visible in autopilot logs
   - Git diff shows deletion

2. **Delete run_critics.py**
   - Same as above
   - Warning logged every cycle

3. **Remove metadata from roadmap**
   - Git diff shows metadata removal
   - Policy controller flags task as "incomplete metadata"
   - Autopilot refuses to execute

4. **Modify critic thresholds**
   - Changes visible in git history
   - Code review would catch lowering of standards

**Detection:**
- Pre-flight checks verify critic files exist
- Policy controller checks critic execution
- Git history audit shows any bypasses

**Enforcement:**
- If critics bypassed → Next cycle detects and blocks
- Manual intervention required to fix

---

## Example Critic Execution

### Successful Critique (Task OK)

```bash
$ ./tools/wvo_mcp/scripts/autopilot.sh

[Cycle 47] Summary saved to state/checkpoint.json
Running reality-checking critics on completed tasks...
Task ID for critique: T2.2.1
Critique status: OK (critical issues: 0)
✅ Critics passed - implementation verified
Critique saved to: state/critiques/T2.2.1_critique.json
```

**Critique file:**
```json
{
  "task_id": "T2.2.1",
  "status": "OK",
  "critics": [
    {
      "critic_name": "RealityCheckCritic",
      "status": "PASSED",
      "issues": [],
      "summary": "Code matches documentation"
    }
  ],
  "critical_issues": [],
  "overall_recommendation": "Task appears sound, safe to proceed"
}
```

### Failed Critique (Task BLOCKED)

```bash
$ ./tools/wvo_mcp/scripts/autopilot.sh

[Cycle 48] Summary saved to state/checkpoint.json
Running reality-checking critics on completed tasks...
Task ID for critique: T2.2.1
Critique status: BLOCK (critical issues: 3)
❌ CRITICAL: Critics found 3 blocking issues!
   Critique saved to: state/critiques/T2.2.1_critique.json
Critical issues found:
   1. [CLAIM_NOT_IMPLEMENTED] Docs claim 'Uses Robyn or LightweightMMM' but code doesn't implement it
   2. [HARDCODED_VALUE] Hardcoded elasticity (should be learned from data): elasticity = 0.15
   3. [MISSING_TRANSFORMATION] MMM missing adstock transformation (ad effects carry over time)
Summary rewritten: completed tasks converted to blockers
❌ Critics BLOCKED task - critical issues found
   Review critique files in state/critiques/
   Fix issues before task can be marked complete
```

**Updated summary (critics rewrote it):**
```json
{
  "completed_tasks": [],  // Cleared by critics
  "in_progress": ["T2.2.1"],
  "blockers": [
    "CRITIC_BLOCK: Task T2.2.1 has critical issues (see state/critiques/T2.2.1_critique.json)",
    "Task 'Implement MMM with adstock/saturation' not production-ready (see critique)"
  ],
  "notes": "❌ CRITIC BLOCKED: 1 task(s) failed reality check. See state/critiques/T2.2.1_critique.json for details."
}
```

**Context.md updated:**
```markdown
## Critic Blocked: T2.2.1

**Critique File:** `state/critiques/T2.2.1_critique.json`

**Critical Issues Found:** 3

1. [CLAIM_NOT_IMPLEMENTED] Docs claim 'Uses Robyn or LightweightMMM' but code doesn't implement it
2. [HARDCODED_VALUE] Hardcoded elasticity (should be learned from data): elasticity = 0.15
3. [MISSING_TRANSFORMATION] MMM missing adstock transformation

**Action Required:** Fix critical issues before task can be marked complete.
```

---

## Maintenance

**Weekly:**
- Review critic metrics dashboard
- Adjust thresholds if false positive rate >15%
- Add new critic patterns based on common errors

**Monthly:**
- Audit critique overrides (any pattern of bypasses?)
- Update roadmap metadata based on lessons learned
- Expand critic coverage to new problem types

**Quarterly:**
- Review critic effectiveness (did it catch real issues?)
- User satisfaction (are critics helpful or annoying?)
- ROI analysis (critic development cost vs bugs prevented)

---

**Status:** Enforcement active, monitoring effectiveness
**Next:** Expand critic coverage to all roadmap tasks
