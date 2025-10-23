# Auto-Critique System Design

**Goal:** Make autopilot automatically detect scope-reality gaps, missing dependencies, implementation drift, and conceptual errors for ALL roadmap items.

**Date:** 2025-10-19

---

## Problem Statement

Current autopilot can execute tasks but **cannot critique its own work**:
- Docs say "LSTM model", code has `elasticity = 0.15`
- Roadmap says "inventory constraints", code doesn't implement them
- Plans assume data exists, never verifies
- No detection of over-engineering vs under-engineering

**Solution:** Multi-layer critic system that automatically:
1. Compares code vs docs vs roadmap
2. Verifies assumptions (data, APIs, dependencies)
3. Detects conceptual errors (wrong causal inference method)
4. Rates implementation maturity (placeholder vs production-ready)

---

## Critic Architecture

### Layer 1: Reality Check Critic

**Purpose:** Detect implementation vs documentation gaps

**Inputs:**
- Roadmap task descriptions (YAML)
- Code files (Python, TypeScript)
- Documentation (Markdown)

**Analysis:**
```python
def reality_check(task: Task) -> Critique:
    claims = extract_claims_from_docs(task.docs)
    implementation = analyze_code(task.files)

    gaps = []
    for claim in claims:
        if not verify_claim(claim, implementation):
            gaps.append({
                "claim": claim.text,
                "reality": implementation.status,
                "severity": rate_severity(claim, implementation)
            })

    return Critique(gaps, recommendations)
```

**Example claims to verify:**
- Docs: "Uses hierarchical Bayesian model" → Code: Check for `pymc` or `stan` imports
- Docs: "Gradient boosting" → Code: Check for `xgboost` or `lightgbm`
- Docs: "Inventory constraints" → Code: Check for constraint logic in optimizer
- Docs: "Time-series cross-validation" → Code: Check for `TimeSeriesSplit`

**Output:**
```json
{
  "task": "T2.2.1 - Implement MMM",
  "gaps": [
    {
      "claim": "Uses Robyn or LightweightMMM for media mix modeling",
      "reality": "Code has hardcoded elasticity = 0.15",
      "severity": "CRITICAL",
      "recommendation": "Replace placeholder with actual Robyn/LightweightMMM implementation"
    },
    {
      "claim": "Includes adstock transformation",
      "reality": "No adstock logic found in code",
      "severity": "HIGH",
      "recommendation": "Add adstock carryover: adstocked[t] = spend[t] + decay * adstocked[t-1]"
    }
  ]
}
```

---

### Layer 2: Dependency Critic

**Purpose:** Verify all dependencies are satisfied before marking task complete

**Inputs:**
- Task metadata (dependencies, prerequisites)
- Code imports
- Data availability
- API connectivity

**Analysis:**
```python
def check_dependencies(task: Task) -> DependencyCritique:
    required = task.metadata.get("dependencies", [])

    checks = {
        "code_imports": verify_imports(task.files),
        "data_available": verify_data_exists(task.data_requirements),
        "api_reachable": verify_api_connectivity(task.apis),
        "upstream_tasks": verify_upstream_complete(required),
    }

    blocking = [k for k, v in checks.items() if not v.satisfied]

    return DependencyCritique(blocking, checks)
```

**Dependency types to check:**

1. **Code dependencies:**
   ```python
   # Task: Implement gradient boosting
   required_imports = ["lightgbm", "xgboost"]
   check: import lightgbm  # Does this work?
   ```

2. **Data dependencies:**
   ```python
   # Task: Train MMM
   required_data = [
       "sales_daily.csv (90+ days)",
       "weather_daily.csv (90+ days)",
       "ad_spend_daily.csv (90+ days)"
   ]
   check: len(pd.read_csv("sales_daily.csv")) >= 90
   ```

3. **API dependencies:**
   ```python
   # Task: Ingest weather data
   required_apis = ["https://api.open-meteo.com"]
   check: requests.get(url).status_code == 200
   ```

4. **Upstream task dependencies:**
   ```python
   # Task: Product-level allocation
   requires = ["T1.1.3: Product taxonomy classifier"]
   check: Does taxonomy classifier code exist?
   ```

**Output:**
```json
{
  "task": "T2.2.1 - Train MMM",
  "dependencies": {
    "code_imports": {
      "status": "FAILED",
      "missing": ["lightgbm", "robyn"]
    },
    "data_available": {
      "status": "FAILED",
      "missing": ["weather_daily.csv only has 30 days, need 90+"]
    },
    "api_reachable": {
      "status": "PASSED"
    },
    "upstream_tasks": {
      "status": "FAILED",
      "blocking": ["T1.2.1: Weather data pipeline not complete"]
    }
  },
  "recommendation": "BLOCK this task until dependencies satisfied"
}
```

---

### Layer 3: Data Availability Critic

**Purpose:** Verify data assumptions before model training

**Inputs:**
- Task data requirements
- Actual data in database/files
- Data quality metrics

**Analysis:**
```python
def check_data(task: Task) -> DataCritique:
    requirements = task.metadata.get("data_requirements", {})

    checks = {
        "volume": check_row_count(requirements.min_rows),
        "coverage": check_date_range(requirements.date_range),
        "completeness": check_missing_rate(requirements.max_missing),
        "quality": check_outliers(requirements.outlier_threshold),
    }

    return DataCritique(checks, data_summary)
```

**Data checks:**

1. **Volume:**
   ```python
   # MMM needs 90+ days
   check: len(sales_df) >= 90
   ```

2. **Coverage:**
   ```python
   # Need all 90 days, no gaps
   date_range = pd.date_range(start, end, freq='D')
   check: all(date in sales_df.date for date in date_range)
   ```

3. **Completeness:**
   ```python
   # Max 10% missing data
   missing_rate = sales_df.isnull().sum() / len(sales_df)
   check: missing_rate < 0.10
   ```

4. **Quality:**
   ```python
   # Detect outliers (>3 std dev)
   outliers = sales_df[sales_df.sales > mean + 3*std]
   check: len(outliers) < 0.05 * len(sales_df)
   ```

5. **Join-ability:**
   ```python
   # Can weather data join to sales?
   check: all(sales_df.zip_code.isin(weather_df.zip_code))
   ```

**Output:**
```json
{
  "task": "T2.2.1 - Train MMM",
  "data_checks": {
    "volume": {
      "status": "PASSED",
      "actual": 120,
      "required": 90
    },
    "coverage": {
      "status": "FAILED",
      "gaps": ["2025-09-15 to 2025-09-20 missing"]
    },
    "completeness": {
      "status": "WARNING",
      "missing_rate": 0.12,
      "threshold": 0.10
    },
    "quality": {
      "status": "FAILED",
      "outliers": 15,
      "description": "Black Friday sales 10x normal, will skew model"
    }
  },
  "recommendation": "Clean outliers and fill gaps before training"
}
```

---

### Layer 4: Conceptual Correctness Critic

**Purpose:** Detect conceptual/methodological errors (wrong algorithm for problem)

**Inputs:**
- Task description
- Problem type (classification, regression, causal inference, optimization)
- Code implementation

**Analysis:**
```python
def check_methodology(task: Task) -> MethodologyCritique:
    problem_type = classify_problem(task.description)
    method_used = extract_method_from_code(task.files)

    is_correct = validate_method(problem_type, method_used)

    if not is_correct:
        return MethodologyCritique(
            problem=problem_type,
            method_used=method_used,
            correct_methods=get_correct_methods(problem_type),
            severity="CRITICAL"
        )
```

**Conceptual error patterns:**

1. **Wrong causal inference method:**
   ```python
   # WRONG: Propensity scoring for observational weather data
   if "propensity" in code and problem == "weather_causal":
       error = "Can't randomize weather, use DID or synthetic control"
   ```

2. **Missing key transformation:**
   ```python
   # WRONG: MMM without adstock
   if problem == "media_mix_modeling" and "adstock" not in code:
       error = "MMM requires adstock transformation for carryover effects"
   ```

3. **Wrong train/test split:**
   ```python
   # WRONG: Random split for time series
   if problem == "time_series" and "train_test_split" in code:
       error = "Use TimeSeriesSplit, not random split (leaks future data)"
   ```

4. **Over-engineering:**
   ```python
   # WRONG: Deep learning for small data
   if "LSTM" in code and data_volume < 10000:
       error = "Insufficient data for deep learning, use gradient boosting"
   ```

5. **Under-engineering:**
   ```python
   # WRONG: Linear model for non-linear problem
   if problem == "non_linear_effects" and method == "LinearRegression":
       error = "Use gradient boosting or neural network for non-linearity"
   ```

**Output:**
```json
{
  "task": "T3.1.1 - Causal inference for weather effects",
  "methodology_errors": [
    {
      "error": "Using propensity scoring for observational weather data",
      "severity": "CRITICAL",
      "explanation": "Propensity scoring requires randomized treatment. Weather is not randomized.",
      "correct_methods": [
        "Difference-in-Differences (DID)",
        "Synthetic control",
        "Regression discontinuity"
      ],
      "recommendation": "Replace propensity scoring with DID comparing cold vs warm weeks"
    }
  ]
}
```

---

### Layer 5: Documentation Drift Critic

**Purpose:** Detect when docs and code diverge

**Inputs:**
- Documentation files (Markdown)
- Code files (Python, TypeScript)
- Test files

**Analysis:**
```python
def check_drift(task: Task) -> DriftCritique:
    doc_claims = extract_claims(task.docs)
    code_reality = analyze_code(task.files)
    test_coverage = analyze_tests(task.tests)

    drift = []
    for claim in doc_claims:
        code_match = verify_in_code(claim, code_reality)
        test_match = verify_in_tests(claim, test_coverage)

        if not code_match or not test_match:
            drift.append({
                "claim": claim,
                "in_docs": True,
                "in_code": code_match,
                "in_tests": test_match,
            })

    return DriftCritique(drift)
```

**Drift patterns:**

1. **Docs claim feature, code doesn't have it:**
   ```
   Docs: "Implements hierarchical Bayesian model"
   Code: elasticity = 0.15  # hardcoded
   Drift: CRITICAL
   ```

2. **Code has feature, docs don't mention it:**
   ```
   Code: Uses XGBoost gradient boosting
   Docs: Only mentions "linear regression"
   Drift: MEDIUM (docs outdated)
   ```

3. **Tests described, but don't exist:**
   ```
   Docs: "Validates with time-series cross-validation"
   Tests: No test file found
   Drift: HIGH
   ```

4. **Version mismatch:**
   ```
   Docs: "Uses Robyn v3.11"
   Code: import robyn  # v2.5
   Drift: MEDIUM
   ```

**Output:**
```json
{
  "task": "T2.2.1 - Implement MMM",
  "drift_detected": [
    {
      "type": "DOCS_AHEAD_OF_CODE",
      "claim": "Uses hierarchical Bayesian model with PyMC",
      "in_docs": true,
      "in_code": false,
      "severity": "CRITICAL",
      "recommendation": "Either implement PyMC model or update docs to match reality"
    },
    {
      "type": "MISSING_TESTS",
      "claim": "Validates with 5-fold time-series cross-validation",
      "in_docs": true,
      "in_tests": false,
      "severity": "HIGH",
      "recommendation": "Add TimeSeriesSplit test to validate generalization"
    }
  ]
}
```

---

### Layer 6: Scope-Reality Gap Critic

**Purpose:** Detect when planned scope vastly exceeds implementation maturity

**Inputs:**
- Roadmap scope (all planned features)
- Code implementation (actual features)
- Time estimates vs actual time

**Analysis:**
```python
def check_scope_gap(epic: Epic) -> ScopeGapCritique:
    planned_features = extract_features(epic.milestones)
    implemented_features = scan_codebase(epic.files)

    completion_rate = len(implemented_features) / len(planned_features)

    maturity = {
        "placeholder": count_placeholders(epic.files),
        "partial": count_partial_implementations(epic.files),
        "complete": count_complete_implementations(epic.files),
    }

    gap_severity = rate_gap(completion_rate, maturity)

    return ScopeGapCritique(
        planned=planned_features,
        implemented=implemented_features,
        gap_severity=gap_severity,
        maturity=maturity
    )
```

**Scope gap detection:**

1. **Massive planning, minimal implementation:**
   ```python
   Planned: 50 features (LSTM, Attention, Hierarchical Bayesian, etc.)
   Implemented: 2 features (hardcoded elasticity, heuristic allocation)
   Gap: 96% unimplemented → CRITICAL
   ```

2. **Placeholder ratio:**
   ```python
   Total functions: 20
   Placeholder functions: 15 (contain "TODO", "FIXME", hardcoded values)
   Maturity: 25% → WARNING
   ```

3. **Time estimate accuracy:**
   ```python
   Estimated: 40 hours
   Actual: 200 hours (5x over)
   Reason: Underestimated dependencies, data pipeline work
   ```

**Output:**
```json
{
  "epic": "E2 - ML & Causality",
  "scope_gap": {
    "planned_features": 50,
    "implemented_features": 5,
    "completion_rate": 0.10,
    "gap_severity": "CRITICAL"
  },
  "maturity": {
    "placeholder": 12,
    "partial": 3,
    "complete": 0,
    "maturity_score": 0.15
  },
  "recommendation": "Reduce scope by 80% or increase implementation effort 10x"
}
```

---

## Meta-Critic Orchestrator

**Purpose:** Coordinate all critics and generate comprehensive critique

```python
class MetaCritic:
    def __init__(self):
        self.critics = [
            RealityCheckCritic(),
            DependencyCritic(),
            DataAvailabilityCritic(),
            ConceptualCorrectnessCritic(),
            DocumentationDriftCritic(),
            ScopeGapCritic(),
        ]

    def critique_task(self, task: Task) -> ComprehensiveCritique:
        results = []
        for critic in self.critics:
            result = critic.analyze(task)
            results.append(result)

        # Aggregate severity
        critical_issues = [r for r in results if r.severity == "CRITICAL"]
        high_issues = [r for r in results if r.severity == "HIGH"]

        # Generate overall recommendation
        if critical_issues:
            status = "BLOCK"
            recommendation = "Fix critical issues before proceeding"
        elif high_issues:
            status = "WARNING"
            recommendation = "Address high-priority issues soon"
        else:
            status = "OK"
            recommendation = "Task appears sound"

        return ComprehensiveCritique(
            task=task,
            status=status,
            results=results,
            recommendation=recommendation
        )

    def critique_epic(self, epic: Epic) -> EpicCritique:
        task_critiques = [self.critique_task(t) for t in epic.tasks]

        # Rollup: If any task is BLOCKED, epic is at risk
        blocked_tasks = [c for c in task_critiques if c.status == "BLOCK"]

        return EpicCritique(
            epic=epic,
            task_critiques=task_critiques,
            blocked_count=len(blocked_tasks),
            overall_status="AT_RISK" if blocked_tasks else "ON_TRACK"
        )
```

---

## Roadmap Metadata Schema

To enable auto-critique, roadmap tasks need **structured metadata**:

```yaml
# Example task with critique-friendly metadata
- id: T2.2.1
  name: Implement Media Mix Model
  description: Replace placeholder MMM with production Robyn or LightweightMMM

  # Metadata for critics
  metadata:
    # What claims are made in docs?
    claims:
      - "Uses Robyn or LightweightMMM"
      - "Includes adstock transformation"
      - "Includes saturation curves"
      - "Validates with time-series cross-validation"

    # What dependencies must be satisfied?
    dependencies:
      code_imports:
        - robyn  # or lightweight_mmm
        - numpy
        - pandas
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
          required_columns: [date, spend, campaign_id]
      upstream_tasks:
        - T1.2.1  # Weather data pipeline
        - T1.3.1  # Ad data ingestion

    # What's the problem type?
    problem_type: media_mix_modeling

    # Correct methods for this problem
    correct_methods:
      - Robyn
      - LightweightMMM
      - PyMC-Marketing

    # Red flags (methods that would be wrong)
    wrong_methods:
      - LinearRegression (too simple, no adstock)
      - PropensityScoreMatching (wrong causal method)

    # Expected maturity
    maturity_requirements:
      min_test_coverage: 0.70
      max_placeholder_ratio: 0.10
      required_tests:
        - test_mmm_runs
        - test_adstock_transformation
        - test_time_series_cv

    # Verification checks
    verification:
      - check: import robyn
        error_message: "Robyn package not installed"
      - check: len(pd.read_csv('data/sales_daily.csv')) >= 90
        error_message: "Insufficient sales data (need 90+ days)"
      - check: "'adstock' in open('apps/model/mmm.py').read()"
        error_message: "Adstock transformation not found in code"
```

---

## Auto-Critique Workflow

### When to run critics?

**1. Pre-task execution:**
```python
# Before autopilot starts task
critique = meta_critic.critique_task(task)

if critique.status == "BLOCK":
    log.error(f"Task {task.id} has blocking issues:")
    for issue in critique.critical_issues:
        log.error(f"  - {issue.message}")
    log.error("Resolve these before proceeding")
    exit(1)
```

**2. Post-task execution:**
```python
# After autopilot completes task
critique = meta_critic.critique_task(task)

if critique.status == "BLOCK":
    log.warning(f"Task {task.id} marked complete but has critical gaps:")
    for gap in critique.gaps:
        log.warning(f"  - {gap.claim} (docs) vs {gap.reality} (code)")

    # Mark task as incomplete
    task.status = "in_progress"
    task.blockers.append(critique.critical_issues)
```

**3. Periodic epic review:**
```python
# Weekly: Review entire epic
critique = meta_critic.critique_epic(epic)

if critique.overall_status == "AT_RISK":
    notify_director_dana({
        "epic": epic.id,
        "risk": "HIGH",
        "blocked_tasks": critique.blocked_count,
        "issues": critique.summary,
        "recommendation": "Consider descoping or adding resources"
    })
```

---

## Integration with Autopilot

### Add critic to autopilot loop:

```bash
# In autopilot.sh, after task execution:

# 1. Get task metadata from roadmap
TASK_METADATA=$(yq eval ".tasks[] | select(.id == \"$TASK_ID\") | .metadata" state/roadmap.yaml)

# 2. Run critics
CRITIQUE_RESULT=$(python tools/wvo_mcp/scripts/run_critics.py \
  --task "$TASK_ID" \
  --metadata "$TASK_METADATA" \
  --code-files "apps/model/*.py" \
  --docs "docs/*.md" \
  --tests "tests/*.py")

# 3. Parse critique
CRITIQUE_STATUS=$(echo "$CRITIQUE_RESULT" | jq -r '.status')
CRITICAL_ISSUES=$(echo "$CRITIQUE_RESULT" | jq -r '.critical_issues | length')

# 4. Handle critique
if [ "$CRITIQUE_STATUS" = "BLOCK" ]; then
  log "❌ CRITICAL: Task $TASK_ID has $CRITICAL_ISSUES blocking issues"
  echo "$CRITIQUE_RESULT" | jq -r '.critical_issues[] | "  - \(.message)"'

  # Add to blockers
  echo "$CRITIQUE_RESULT" > "state/critiques/${TASK_ID}_critique.json"

  # Update context
  cat >> state/context.md <<EOF

## Task $TASK_ID - Critique Blockers

$(echo "$CRITIQUE_RESULT" | jq -r '.critical_issues[] | "- **\(.type):** \(.message) → \(.recommendation)"')

EOF

  # Mark task blocked
  python tools/wvo_mcp/scripts/update_roadmap.py \
    --task "$TASK_ID" \
    --status "blocked" \
    --blocker "Critique found critical issues (see state/critiques/${TASK_ID}_critique.json)"
fi
```

---

## Example Critique Report

```json
{
  "task": "T2.2.1 - Implement MMM",
  "status": "BLOCK",
  "timestamp": "2025-10-19T10:30:00Z",

  "reality_check": {
    "gaps": [
      {
        "claim": "Uses Robyn or LightweightMMM for media mix modeling",
        "reality": "Code has hardcoded elasticity = 0.15",
        "severity": "CRITICAL",
        "file": "apps/model/mmm.py:52",
        "recommendation": "Replace placeholder with actual Robyn/LightweightMMM"
      }
    ]
  },

  "dependencies": {
    "code_imports": {
      "status": "FAILED",
      "missing": ["robyn", "lightweight_mmm"]
    },
    "data_available": {
      "status": "FAILED",
      "issues": ["sales_daily.csv only has 30 days, need 90+"]
    }
  },

  "conceptual_correctness": {
    "errors": [
      {
        "error": "MMM missing adstock transformation",
        "severity": "CRITICAL",
        "explanation": "Ad effects carry over time, need adstock[t] = spend[t] + decay * adstock[t-1]",
        "file": "apps/model/mmm.py"
      }
    ]
  },

  "documentation_drift": {
    "drift": [
      {
        "claim": "Implements hierarchical Bayesian model",
        "in_docs": true,
        "in_code": false,
        "severity": "CRITICAL"
      }
    ]
  },

  "scope_gap": {
    "planned_features": 10,
    "implemented_features": 1,
    "maturity_score": 0.10,
    "severity": "CRITICAL"
  },

  "critical_issues": [
    {
      "type": "PLACEHOLDER_CODE",
      "message": "MMM is hardcoded placeholder, not production model",
      "recommendation": "Implement Robyn or LightweightMMM with adstock/saturation"
    },
    {
      "type": "MISSING_DATA",
      "message": "Only 30 days of sales data, need 90+ for MMM training",
      "recommendation": "Backfill historical data or wait for more data to accumulate"
    },
    {
      "type": "DOCS_CODE_MISMATCH",
      "message": "Docs claim Bayesian model, code has simple linear regression",
      "recommendation": "Either implement Bayesian model or update docs to match reality"
    }
  ],

  "overall_recommendation": "BLOCK this task until critical issues resolved. Do NOT mark complete."
}
```

---

## Benefits

**1. Prevents "done but not done"**
- Task marked complete but is actually placeholder → Critic catches it

**2. Detects over-scoping early**
- Epic plans 50 features but only 5 implemented → Critic flags scope gap

**3. Catches conceptual errors**
- Using wrong causal inference method → Critic suggests correct method

**4. Ensures dependencies satisfied**
- Training model without sufficient data → Critic blocks task

**5. Maintains docs-code alignment**
- Docs drift from code → Critic detects divergence

**6. Provides evidence for decisions**
- Director Dana asks "Why is task blocked?" → Point to critique JSON

---

## Implementation Plan

### Week 1: Reality Check Critic (foundation)
- [ ] Parse roadmap YAML for task metadata
- [ ] Extract claims from docs
- [ ] Scan code for implementation
- [ ] Compare claims vs reality
- [ ] Generate gap report

### Week 2: Dependency Critic
- [ ] Verify code imports
- [ ] Check data availability
- [ ] Test API connectivity
- [ ] Validate upstream tasks complete

### Week 3: Data + Conceptual Critics
- [ ] Data volume/quality checks
- [ ] Methodology pattern matching
- [ ] Common error detection

### Week 4: Documentation Drift + Scope Gap Critics
- [ ] Diff docs vs code
- [ ] Calculate completion rates
- [ ] Maturity scoring

### Week 5: Integration
- [ ] Add to autopilot loop
- [ ] Test on real tasks
- [ ] Refine thresholds

---

## Success Metrics

**Critic effectiveness:**
- % of tasks where critic caught issue before production
- False positive rate (critic blocks valid task)
- Time saved by early issue detection

**Autopilot quality improvement:**
- % of tasks marked complete that are actually production-ready (before: 20%, target: 90%)
- Average task re-work cycles (before: 3, target: 1)
- Documentation accuracy (before: 50%, target: 95%)

---

**Status:** Design complete, ready for implementation
**Next:** Implement Reality Check Critic as PoC
