# ML Task Meta-Critic

## Overview

The ML Task Meta-Critic is a specialized critic that reviews completed ML tasks to identify patterns, blockers, and opportunities for improvement. It helps maintain high quality standards across ML task completions by analyzing success rates, validation practices, and common issues.

## Key Features

- Aggregates and analyzes completed ML task results
- Tracks task completion rates and success metrics
- Identifies common patterns and blockers
- Generates recommendations for improvement
- Monitors test coverage and validation practices
- Integrates with both Python and TypeScript analysis pipelines

## Usage

To run the ML Task Meta-Critic:

```typescript
import { SessionContext } from '../session';

// Initialize session
const session = new SessionContext();

// Run meta-critic
const results = await session.runCritics(['ml_task_meta']);
```

Or via the command line:

```bash
# Run with default settings
npm run critics -- --critic ml_task_meta

# Run with epic filter
WVO_ML_TASK_FILTER="ML-*" npm run critics -- --critic ml_task_meta
```

## Configuration

The meta-critic supports both Python and TypeScript analysis paths:

1. **Python Analysis**: Primary analysis path when Python ML pipeline is available
   - Location: `tools/wvo_mcp/scripts/ml_task_meta_critic.py`
   - Outputs JSON-formatted analysis

2. **TypeScript Analysis**: Fallback analysis using TypeScript aggregator
   - Location: `tools/wvo_mcp/src/critics/ml_task_meta_critic.ts`
   - Provides equivalent analysis capabilities

## Task Analysis

The meta-critic analyzes several aspects of ML tasks:

1. **Task Completion**
   - Total tasks analyzed
   - Completion rate
   - Success/failure breakdown
   - Delivery velocity

2. **Quality Metrics**
   - Model performance (R², MAPE)
   - Test coverage across 7 dimensions
   - Validation practice compliance
   - Artifact documentation

3. **Validation Practices**
   - Cross-validation usage
   - Holdout set testing
   - Data quality checks
   - Methodology compliance

## Output Format

The critic generates a detailed analysis report with sections:

```
═══════════════════════════════════════════════════════════
ML TASK META-CRITIC ANALYSIS REPORT
═══════════════════════════════════════════════════════════

SUMMARY:
  • Total Tasks Analyzed: <count>
  • Completed: <count>
  • In Progress: <count>
  • Failed: <count>
  • Completion Rate: <percentage>%

KEY INSIGHTS:
  [List of key findings]

RECOMMENDATIONS:
  → [Actionable recommendations]

DETAILED TASK ANALYSIS:
  [Details for up to 5 recent tasks]
```

## Escalation

The meta-critic automatically escalates issues when:

- Completion rate falls below 60%
- More than 5 recurring blockers detected
- Test coverage below 3/7 dimensions
- Failure count exceeds half of completed tasks

## Best Practices

1. **Regular Reviews**: Run the meta-critic after completing clusters of ML tasks
2. **Epic Filtering**: Use `WVO_ML_TASK_FILTER` to focus analysis on specific task groups
3. **Validation**: Ensure tasks include:
   - Cross-validation results
   - Holdout set testing
   - Data quality checks
4. **Documentation**: Maintain detailed completion reports with:
   - Performance metrics
   - Validation evidence
   - Generated artifacts
   - Test coverage details

## Integration

The meta-critic is integrated with:

- WeatherVane's critic infrastructure
- ML task completion reporting
- Quality monitoring systems
- Performance tracking
- Escalation pathways

## Troubleshooting

Common issues and solutions:

1. **Missing Task Results**
   - Ensure completion reports are in docs directory
   - Check file naming follows pattern: `*COMPLETION*.md`
   - Verify task IDs are correctly formatted

2. **Analysis Failures**
   - Check Python ML pipeline availability
   - Verify JSON output formatting
   - Check file permissions and paths

3. **False Positives**
   - Review task completion criteria
   - Adjust validation thresholds if needed
   - Update completion report format

## Contributing

To extend or modify the meta-critic:

1. Update test suite in `ml_task_meta_critic.test.ts`
2. Add new metrics to `MLTaskCompletionReport` interface
3. Extend analysis in Python script or TypeScript aggregator
4. Update documentation with new capabilities

## Contact

For issues or suggestions:
- File an issue in the WeatherVane repository
- Tag with "critic: ml_task_meta"