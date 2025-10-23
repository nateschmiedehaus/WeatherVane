# Model Review Template

## Overview

**Model Name**: [name]
**Version**: [version]
**Last Review**: [date]
**Reviewer(s)**: [names]

## Meta-Evaluation Results

### Quality Score Breakdown
- Data Integrity: [score]/100
- Model Performance: [score]/100
- Robustness: [score]/100
- Observability: [score]/100
- Responsible AI: [score]/100

**Overall Quality Score**: [score]/100
**Status**: [excellent/good/needs_improvement/at_risk/critical]

### Critical Issues
[List critical issues found by meta-evaluation]

### High Priority Issues
[List high priority issues found by meta-evaluation]

### Recommendations
[List recommended actions from meta-evaluation]

## Detailed Assessment

### 1. Data Quality and Integrity
- Missing data rate: [rate]%
- Outlier rate: [rate]%
- Data freshness: [metric]
- Key findings:
  - [finding 1]
  - [finding 2]

### 2. Model Performance
- R² Score: [score]
- MAPE: [score]%
- Pass rate: [rate]%
- Performance breakdown by segment:
  - [segment 1]: [metrics]
  - [segment 2]: [metrics]

### 3. Model Robustness
- Cross-validation stability:
  - R² std: [value]
  - MAPE std: [value]
- Synthetic data recovery:
  - Weather correlation error: [value]
  - Feature importance recovery: [metrics]

### 4. Observability
- Telemetry coverage: [metric]
- Artifact completeness: [metric]
- Monitoring dashboards: [status]
- Alert configuration: [status]

### 5. Responsible AI Assessment
- Bias analysis status: [complete/incomplete]
- Feature importance documentation: [complete/incomplete]
- Model cards status: [complete/incomplete]
- Ethics review status: [complete/incomplete]

## Verification Results

### Build Status
```
[build output]
```

### Test Results
```
[test output]
```

### Audit Results
```
[audit output]
```

### Runtime Verification
- Memory usage: [metric]
- CPU utilization: [metric]
- Response times: [metric]
- Error rates: [metric]

## Review Decision

**Status**: [Approved/Needs Work/Rejected]
**Rationale**: [Explanation of decision]

### Required Actions Before Approval
1. [action 1]
2. [action 2]

### Follow-up Tasks
1. [task 1]
2. [task 2]

## Sign-off

Reviewers:
- [ ] [Name 1]
- [ ] [Name 2]

## Next Review
Scheduled for: [date]