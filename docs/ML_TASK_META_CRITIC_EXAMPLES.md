# ML Task Meta-Critic: Usage Examples

## Quick Start

### Running the Meta-Critic

```typescript
import { MLTaskMetaCriticCritic } from "tools/wvo_mcp/src/critics/ml_task_meta_critic";

const critic = new MLTaskMetaCriticCritic(process.cwd());
const result = await critic.run("default");

if (result.passed) {
  console.log("✅ Task completion quality is excellent");
  console.log(result.stdout);
} else {
  console.log("⚠️ Critical issues detected");
  console.log(result.stderr);
}
```

### Using the Aggregator Directly

```typescript
import { MLTaskAggregator } from "tools/wvo_mcp/src/critics/ml_task_aggregator";

const aggregator = new MLTaskAggregator(workspaceRoot, stateRoot);

// Get all completed tasks
const tasks = await aggregator.getCompletedMLTasks();
console.log(`Found ${tasks.length} completed tasks`);

// Analyze specific task
const report = await aggregator.analyzeCompletedTask("T12.0.1");
if (report) {
  console.log(`Task: ${report.title}`);
  console.log(`Tests Passed: ${report.tests_passed}`);
  console.log(`Coverage Dimensions: ${report.coverage_dimensions}/7`);
}

// Generate comprehensive report
const aggregatedReport = await aggregator.generateAggregatedReport();
console.log(`Completion Rate: ${aggregatedReport.average_completion_rate.toFixed(1)}%`);
console.log(`Blockers: ${aggregatedReport.blockers_detected.length}`);
```

## Example Scenarios

### Scenario 1: Post-Task Batch Analysis

After completing a batch of ML tasks, review the quality:

```bash
# Complete tasks T12.0.1, T12.0.2, T12.1.1
# ... (work on tasks)

# Review batch quality
npm run critic:ml_task_meta
```

**Expected Output:**

```
═══════════════════════════════════════════════════════════
ML TASK META-CRITIC ANALYSIS REPORT
═══════════════════════════════════════════════════════════

SUMMARY:
  • Total Tasks Analyzed: 3
  • Completed: 3
  • In Progress: 0
  • Failed: 0
  • Completion Rate: 100.0%

KEY INSIGHTS:
  Task Completion: 100% of 3 tasks completed successfully
  Quality Distribution: 3 high-quality, 0 low-quality completions

RECOMMENDATIONS:
  (None - all tasks meet quality standards)
```

### Scenario 2: Detecting Quality Regression

If recent tasks show declining quality:

```bash
npm run critic:ml_task_meta
```

**Warning Output:**

```
═══════════════════════════════════════════════════════════
ML TASK META-CRITIC ANALYSIS REPORT
═══════════════════════════════════════════════════════════

SUMMARY:
  • Total Tasks Analyzed: 15
  • Completed: 12
  • In Progress: 2
  • Failed: 1
  • Completion Rate: 80.0%

CRITICAL BLOCKERS DETECTED:
  - Task T12.1.2 failed checks: build, tests
  - Task T12.1.3 failed checks: documentation
  - 2 tasks lack documented artifacts

KEY PATTERNS:
  - Low completion rate: 80.0% of tasks passing
  - Limited test coverage: average 3.5/7 dimensions
  - Recurring verification failures: tests verification

RECOMMENDATIONS:
  → Improve test coverage: Average is 3.5/7 dimensions. Target: 6+
  → Enforce artifact documentation: 2 tasks lack documented artifacts
  → Strengthen quality gates: 2 tasks failed verification checks
```

### Scenario 3: Team Training Assessment

Use meta-critic output to identify training needs:

```bash
npm run critic:ml_task_meta
```

**Analysis Result:**

The meta-critic identifies:
- Consistent pattern of missing security testing (1/7 dimensions)
- Documentation gaps across multiple tasks
- Limited architectural review coverage

**Action Items:**

1. Schedule security testing workshop
2. Improve documentation templates
3. Implement architectural review checklist

### Scenario 4: Epic-Level Analysis

Analyze completion quality for a specific epic:

```bash
# Set filter for specific epic
export WVO_ML_TASK_FILTER="epic_ML_MODELING"

npm run critic:ml_task_meta
```

This generates a report focused only on tasks within the ML Modeling epic.

### Scenario 5: Continuous Integration

Include in delivery pipeline:

```bash
#!/bin/bash
set -e

# Build and test
npm run build
npm run test

# Quality gates
npm run critic:ml_task_meta  # Meta-critic
npm run critic:security       # Security
npm run critic:audit          # Dependencies

echo "✅ All quality gates passed"
```

## Integration Examples

### With Atlas (Orchestrator)

When Atlas detects quality issues, it can:

```typescript
// In orchestrator
const criticResult = await mlTaskMetaCritic.run("default");

if (!criticResult.passed) {
  // Create follow-up tasks for blockers
  const blockers = report.blockers_detected;
  for (const blocker of blockers) {
    await createFollowUpTask({
      title: `Address quality blocker: ${blocker}`,
      description: "Resolve critical quality issue detected by meta-critic",
      assigned_to: "QA",
      priority: "high"
    });
  }
}
```

### With Analytics Dashboard

Track quality metrics over time:

```typescript
// Weekly analysis
const report = await aggregator.generateAggregatedReport();

// Log to analytics
analyticsDB.recordMetrics({
  timestamp: Date.now(),
  metric: "ml_task_completion_rate",
  value: report.average_completion_rate,
  tasks_analyzed: report.total_tasks_analyzed,
  blockers: report.blockers_detected.length
});
```

### With Policy Approval

Enforce quality gates before task approval:

```typescript
// In policy engine
async function approveTaskBatch(taskIds: string[]): Promise<boolean> {
  // First, run meta-critic
  const metacriticResult = await mlTaskMetaCritic.run("default");

  // Require meta-critic to pass
  if (!metacriticResult.passed) {
    return false; // Block approval until quality improves
  }

  // Continue with other approval checks...
  return true;
}
```

## Testing Examples

### Unit Test: Detecting Low Coverage

```typescript
it("should detect low test coverage", async () => {
  const report = {
    coverage_dimensions: 2, // Only 2/7 dimensions
    tests_passed: false
  };

  const aggregatedReport = {
    tasks: [report],
    blockers_detected: []
  };

  const insights = critic.generateInsights(aggregatedReport);

  expect(insights.some(i => i.includes("Limited test coverage"))).toBe(true);
});
```

### Integration Test: Full Analysis Pipeline

```typescript
it("should analyze complete task batch", async () => {
  // Setup: Create 5 completion reports
  // - 3 high-quality
  // - 1 medium-quality
  // - 1 low-quality

  const report = await aggregator.generateAggregatedReport();

  expect(report.total_tasks_analyzed).toBe(5);
  expect(report.average_completion_rate).toBe(80); // 4/5 passing
  expect(report.blockers_detected.length).toBeGreaterThan(0);
  expect(report.patterns_observed.length).toBeGreaterThan(0);
});
```

## Troubleshooting

### Issue: No Completion Reports Found

```bash
# Verify completion reports exist in docs/
ls -la docs/*COMPLETION*.md

# Check completion report format
grep -l "## Deliverables\|## Tests\|## Verification" docs/*COMPLETION*.md
```

### Issue: Low Coverage Dimensions Detected

**Problem:** Meta-critic reports "only 2/7 dimensions covered"

**Solution:**

1. Check completion report covers all dimensions:
   - Code Elegance tests ✓
   - Architecture tests ✓
   - UX tests ✓
   - Communication (docs) ✓
   - Scientific rigor ✓
   - Performance tests ✓
   - Security tests ✓

2. Update completion report to document coverage:

```markdown
## Test Coverage Dimensions

- ✅ Code Elegance: Tested with linter and code review
- ✅ Architecture: Validated with integration tests
- ✅ User Experience: Verified with end-to-end tests
- ✅ Communication: Documentation completed and reviewed
- ✅ Scientific Rigor: Cross-validation with 3 datasets
- ✅ Performance: Benchmarked against baseline
- ⚠️ Security: Basic checks done, need advanced audit
```

### Issue: Meta-Critic Reports High Blocker Count

**Problem:** More than 5 blockers detected

**Diagnosis:**

```bash
# Get detailed blocker list
npm run critic:ml_task_meta 2>&1 | grep -A 10 "CRITICAL BLOCKERS"
```

**Common Blockers:**

1. **Build failures** - Fix compilation errors
2. **Test failures** - Increase test coverage
3. **Missing artifacts** - Document deliverables
4. **Low coverage dimensions** - Add tests for missing dimensions
5. **Verification failures** - Run required checks

## Advanced Usage

### Custom Analysis

Create custom analysis using the aggregator:

```typescript
const aggregator = new MLTaskAggregator(workspaceRoot, stateRoot);
const report = await aggregator.generateAggregatedReport();

// Custom filtering
const recentTasks = report.tasks.filter(t => {
  const age = Date.now() - t.extracted_at;
  return age < 7 * 24 * 60 * 60 * 1000; // Last 7 days
});

// Custom metrics
const avgTestsPerTask = recentTasks.reduce((sum, t) => {
  return sum + (t.test_count || 0);
}, 0) / recentTasks.length;

console.log(`Average tests per task: ${avgTestsPerTask.toFixed(0)}`);
```

### Integration with External Systems

Send meta-critic insights to external systems:

```typescript
// Send to Slack
const report = await aggregator.generateAggregatedReport();

const slackMessage = {
  text: "📊 ML Task Quality Report",
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Completion Rate:* ${report.average_completion_rate.toFixed(1)}%\n*Tasks Analyzed:* ${report.total_tasks_analyzed}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Blockers:* ${report.blockers_detected.length}\n*Patterns:* ${report.patterns_observed.length}`
      }
    }
  ]
};

await slack.send(slackMessage);
```

## Performance Considerations

### Analyzing Large Task Volumes

For > 100 tasks:

```typescript
// Use pagination to avoid memory issues
const pageSize = 20;
let offset = 0;
let allInsights = [];

while (true) {
  const tasks = await aggregator.getCompletedMLTasks();
  const page = tasks.slice(offset, offset + pageSize);

  if (page.length === 0) break;

  // Process page
  for (const task of page) {
    const report = await aggregator.analyzeCompletedTask(task.id);
    // ... process report
  }

  offset += pageSize;
}
```

### Caching Results

Cache reports to avoid re-analysis:

```typescript
const cache = new Map<string, MLTaskCompletionReport>();

async function getTaskReportCached(taskId: string) {
  if (cache.has(taskId)) {
    return cache.get(taskId)!;
  }

  const report = await aggregator.analyzeCompletedTask(taskId);
  if (report) {
    cache.set(taskId, report);
  }
  return report;
}
```

## Best Practices

1. **Run regularly** - Include in automated pipelines
2. **Act on recommendations** - Implement suggested improvements
3. **Track trends** - Monitor quality metrics over time
4. **Share insights** - Communicate findings to team
5. **Iterate** - Refine analysis based on feedback
6. **Document** - Keep completion reports complete and accurate
7. **Escalate** - Follow up on critical blockers immediately

## Related Features

- **META_CRITIQUE_FRAMEWORK.md** - Deep analysis methodology
- **Task completion reports** - Input format for meta-critic
- **Critic framework** - Integration point
- **State machine** - Task tracking system
- **Policy approval** - Quality gates for task approval

