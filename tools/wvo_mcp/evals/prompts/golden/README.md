# Golden Task Corpus - Prompt Evaluation

**Purpose**: Curated set of representative tasks for evaluating prompt quality across all work process phases.

---

## Schema

Each task in `tasks.jsonl` follows this format:

```json
{
  "id": "golden-strategize-001",
  "phase": "STRATEGIZE",
  "prompt": "A new feature request: Add support for...",
  "expected_output_criteria": [
    "problem_reframing_present",
    "alternatives_evaluated",
    "recommended_approach_justified",
    "risks_identified"
  ],
  "pass_threshold": 0.75,
  "tags": ["feature", "planning"],
  "description": "Tests if agent can reframe problem and evaluate alternatives"
}
```

### Fields

- **id** (required): Unique identifier, format: `golden-{phase}-{number}`
- **phase** (required): Work process phase (STRATEGIZE|SPEC|PLAN|THINK|IMPLEMENT|VERIFY|REVIEW|PR|MONITOR)
- **prompt** (required): Input prompt to test (string)
- **expected_output_criteria** (required): List of criteria that define success (array of strings)
- **pass_threshold** (required): Fraction of criteria that must be met (0.0-1.0)
- **tags** (optional): Categorization tags (array of strings)
- **description** (optional): Human-readable description of what this task tests

### Criteria Format

Criteria should be:
- **Objective**: Can be evaluated programmatically or by LLM judge
- **Specific**: Not "good quality" but "includes risk analysis with likelihood+impact"
- **Necessary**: Required for quality output, not nice-to-have

Examples:
- ✅ `"alternatives_evaluated"` - clear, checkable
- ✅ `"acceptance_criteria_with_verification"` - specific requirement
- ❌ `"good_strategy"` - too vague
- ❌ `"creative_thinking"` - subjective, hard to evaluate

---

## Coverage Requirements

Corpus MUST include (per AC1):
- **STRATEGIZE**: ≥3 tasks (problem reframing, alternatives, decision frameworks)
- **SPEC**: ≥3 tasks (acceptance criteria, schemas, verification mapping)
- **PLAN**: ≥3 tasks (step breakdown, time estimates, dependencies)
- **THINK**: ≥2 tasks (assumptions, edge cases, pre-mortem)
- **IMPLEMENT**: ≥4 tasks (code generation, integration, testing)
- **VERIFY**: ≥2 tasks (test writing, validation, measurement)
- **REVIEW**: ≥2 tasks (critique, gap finding, improvement suggestions)
- **PR**: ≥1 task (commit message, rollback plan, follow-ups)
- **MONITOR**: ≥1 task (metrics collection, trend analysis)
- **Total**: ≥20 tasks (target 20-30)

---

## Curation Process

### Adding New Tasks

1. **Identify representative work**: Review recent evidence directories (state/evidence/)
2. **Extract prompt**: The user request or phase requirement
3. **Define criteria**: What makes output "good" for this task?
4. **Set threshold**: Typically 0.75 (75% of criteria met)
5. **Add to tasks.jsonl**: Append as newline-delimited JSON
6. **Validate**: Run `jq -s '.' tasks.jsonl` to check parseability

### Task Selection Criteria

**Good golden tasks**:
- ✅ Representative of real work (from production evidence)
- ✅ Diverse (cover all phases, various task types)
- ✅ Stable (not dependent on ephemeral context)
- ✅ Objective (criteria can be evaluated consistently)

**Avoid**:
- ❌ Trivial tasks (too easy, all prompts pass)
- ❌ Impossible tasks (too hard, all prompts fail)
- ❌ Context-dependent (requires specific codebase knowledge)
- ❌ Flaky (pass/fail varies with same prompt)

### Maintenance Schedule

- **Monthly**: Review corpus for staleness (are tasks still relevant?)
- **Quarterly**: Add tasks from production incidents (what did evals miss?)
- **After major incidents**: Add task that would have caught the issue
- **Coverage analysis**: Ensure distribution matches real usage (not just easy tasks)

---

## Running Evals

```bash
# Full corpus (all tasks, ~10 min)
bash tools/wvo_mcp/scripts/run_prompt_evals.sh --mode full

# Quick mode (5 tasks, <2 min)
bash tools/wvo_mcp/scripts/run_prompt_evals.sh --mode quick

# Compare vs baseline
bash tools/wvo_mcp/scripts/run_prompt_evals.sh --mode full --compare state/evidence/IMP-35/verify/prompt_eval_baseline.json
```

---

## Interpreting Results

### Success Rate

```json
{
  "success_rate_golden": 0.75,
  "tasks_passed": 15,
  "tasks_failed": 5,
  "total_tasks": 20
}
```

- **≥70%**: Acceptable baseline
- **≥75%**: Production-ready
- **≥80%**: High quality
- **<50%**: Prompts too broken (spec failure criteria)

### Failure Analysis

When tasks fail, eval output includes:
- Which criteria were NOT met
- Example output that failed
- Suggested improvements

Use failure analysis to:
1. Debug prompt changes (which criteria regressed?)
2. Improve corpus (are criteria too strict?)
3. Identify patterns (do all STRATEGIZE tasks fail?)

---

## Examples

### Good Task: STRATEGIZE (Problem Reframing)

```json
{
  "id": "golden-strategize-001",
  "phase": "STRATEGIZE",
  "prompt": "User request: 'Add support for neural embeddings in quality graph'. Create strategy.",
  "expected_output_criteria": [
    "problem_reframed",
    "alternatives_listed",
    "recommended_approach",
    "integration_points_identified",
    "risks_assessed"
  ],
  "pass_threshold": 0.8,
  "tags": ["feature", "integration"],
  "description": "Tests strategic thinking and problem reframing"
}
```

**Why good**: Real task, clear criteria, objective evaluation.

### Good Task: IMPLEMENT (Code Generation)

```json
{
  "id": "golden-implement-001",
  "phase": "IMPLEMENT",
  "prompt": "Implement function to calculate coefficient of variation from array of numbers.",
  "expected_output_criteria": [
    "function_defined",
    "handles_empty_array",
    "calculates_mean_correctly",
    "calculates_stddev_correctly",
    "returns_cv_formula",
    "includes_tests"
  ],
  "pass_threshold": 0.83,
  "tags": ["code", "statistics"],
  "description": "Tests code generation with edge cases and testing"
}
```

**Why good**: Focused task, verifiable output, includes edge cases.

### Bad Task (Avoid)

```json
{
  "id": "golden-bad-001",
  "phase": "STRATEGIZE",
  "prompt": "Make the system better.",
  "expected_output_criteria": ["good_ideas"],
  "pass_threshold": 0.5,
  "tags": ["vague"]
}
```

**Why bad**: Vague prompt, subjective criteria, no clear success definition.

---

## Corpus Evolution

### Version History

- **v1.0 (2025-10-30)**: Initial corpus, 20 tasks from recent evidence
- **Future**: Document corpus changes in this section

### Adding Tasks from Incidents

When production bug NOT caught by evals:
1. Create task that WOULD have caught it
2. Add to corpus with tag `"incident_YYYY-MM-DD"`
3. Document in quarterly review

### Removing Tasks

Remove task if:
- Task becomes obsolete (feature removed)
- Task is redundant (covered by other tasks)
- Task is flaky (inconsistent pass/fail)
- Coverage analysis shows over-representation

---

## See Also

- **Robustness Corpus**: `tools/wvo_mcp/evals/prompts/robustness/` (garak integration)
- **Eval Runner**: `tools/wvo_mcp/scripts/run_prompt_evals.sh`
- **Policy**: `docs/autopilot/PROMPT_EVAL_POLICY.md`
- **SPEC**: `state/evidence/IMP-35/spec/spec.md`
