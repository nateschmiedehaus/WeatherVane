# Spec: AFP-COGNITIVE-MODEL-ROUTING-20251106

## Success Criteria

### Functional Requirements

**Phase Detection:**
- [x] Detect AFP phase from task metadata (`current_phase` field)
- [x] Fall back to evidence folder inspection (presence of strategy.md, plan.md, etc.)
- [x] Parse task title for phase keywords as final fallback
- [x] Return phase type: cognitive, implementation, remediation, or unknown

**Model Routing:**
- [x] Route Claude to Opus 4 with extended thinking for cognitive phases
- [x] Route Claude to Sonnet 4.5 (standard) for implementation phases
- [x] Route Codex to gpt-5-high for cognitive phases
- [x] Route Codex to gpt-5-codex-medium for implementation phases
- [x] Support thinking budget configuration per phase

**Integration:**
- [x] Extend model_selector.ts with phase-aware routing
- [x] Add extended thinking support to agent_coordinator.ts
- [x] Maintain backward compatibility (non-AFP tasks use existing logic)
- [x] Log phase detection and model selection reasoning

### Non-Functional Requirements

**Performance:**
- Phase detection: <50ms
- No additional API calls for phase detection
- Thinking budget overhead: acceptable (deep thinking worth the cost)

**Observability:**
- Log phase detection method (metadata, evidence, title, unknown)
- Log model selection rationale including phase context
- Track thinking token usage in telemetry

**Maintainability:**
- Single source of truth for phase→model mapping
- Configuration-driven thinking budgets
- No hardcoded phase detection in multiple places

## Acceptance Criteria

### Core Functionality
1. Given a task with `metadata.current_phase = "STRATEGIZE"`, system routes to:
   - Claude Opus 4 with 8K-16K thinking budget
   - Codex gpt-5-high reasoning level

2. Given a task with `metadata.current_phase = "IMPLEMENT"`, system routes to:
   - Claude Sonnet 4.5 (standard, no extended thinking)
   - Codex gpt-5-codex-medium reasoning level

3. Given a task with evidence folder containing `strategy.md`, system infers phase = STRATEGIZE

4. Given a task titled "REMEDIATION: Fix test failures", system routes to fast models

### Edge Cases
5. Given a task with no phase metadata, system falls back to existing task-based heuristics

6. Given autopilot mode with phase="GATE", system uses cognitive models even if task complexity is low

7. Given manual mode (Claude Code CLI) with explicit model override, system respects user choice

### Quality Gates
8. StrategyReviewer approval rate ≥85% for STRATEGIZE phase tasks
9. ThinkingCritic approval rate ≥85% for THINK phase tasks
10. Build verification passes for all changes
11. No regressions in existing model selection tests

## Out of Scope

- Automatic phase progression (task stays in same phase until explicitly updated)
- Phase-specific prompt templates (handled separately)
- Multi-phase tasks (use first phase encountered)
- Historical phase tracking (future: task phase history timeline)
