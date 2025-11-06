# Strategy: AFP-COGNITIVE-MODEL-ROUTING-20251106

## Problem Analysis

**Current State:**
- Model selection is task-based (complexity, keywords, context)
- No phase-aware routing for AFP 10-phase lifecycle
- Claude doesn't use extended thinking for cognitive work
- Codex doesn't consistently use high-reasoning for strategy/design

**Root Cause:**
The orchestrator lacks phase detection and cognitive vs. implementation distinction. All phases use the same model selection logic, leading to:
- Shallow strategic thinking (Claude not using extended thinking)
- Inconsistent reasoning depth (Codex not reliably using gpt-5-high for STRATEGIZE/PLAN/THINK)
- Waste on implementation phases (using expensive reasoning when not needed)

**Goal:**
Route model selection based on AFP phase type:
- **Cognitive phases** (1-5, 8): Use deep reasoning (Claude extended thinking, Codex gpt-5-high)
- **Implementation phases** (6-7): Use balanced models (Claude Sonnet, Codex medium/low)
- **Remediation**: Use fast models for quick fixes

## AFP/SCAS Alignment

**Via Negativa:**
- Don't add new task types or statuses
- Don't create phase-specific task prefixes (use metadata instead)
- Don't duplicate model selection logic (extend existing)

**Refactor vs. Repair:**
This is a refactor - we're restructuring model selection to align with AFP phases, not patching individual selection bugs.

**Coherence:**
- Leverages existing model_selector.ts pattern
- Uses task metadata for phase detection (no schema changes)
- Aligns with evidence folder structure (strategy.md, plan.md, etc.)

## Research Findings

**Claude Extended Thinking (Nov 2025):**
- Available in Claude 3.7 Sonnet and Claude 4 models
- Controlled via `thinking` parameter with `budget_tokens`
- Minimum 1024 tokens, up to 128K tokens
- Triggers: "think" keyword allocates ~4K tokens
- Interleaved thinking: thinks between tool calls (Claude 4)

**Codex Reasoning Levels:**
- Already supported: minimal, low, medium, high
- gpt-5-high: Deep reasoning for strategy/documentation
- gpt-5-codex-high: Maximum reasoning for complex coding

## Strategic Decision

**Phase Detection Strategy:**
1. **Evidence-based**: Check if task has evidence folder with phase artifacts
2. **Metadata-based**: Add `current_phase` to task metadata
3. **Name-based fallback**: Parse task title for phase keywords

**Model Routing Strategy:**

| AFP Phase | Type | Claude Model | Claude Thinking Budget | Codex Model | Codex Reasoning |
|-----------|------|--------------|------------------------|-------------|-----------------|
| 1. STRATEGIZE | Cognitive | Opus 4 | 8K-16K tokens | gpt-5 | high |
| 2. SPEC | Cognitive | Opus 4 | 4K-8K tokens | gpt-5 | high |
| 3. PLAN | Cognitive | Opus 4 | 8K-16K tokens | gpt-5 | high |
| 4. THINK | Cognitive | Opus 4 | 16K-32K tokens | gpt-5-codex | high |
| 5. GATE | Cognitive | Opus 4 | 8K-16K tokens | gpt-5 | high |
| 6. IMPLEMENT | Implementation | Sonnet 4.5 | Standard | gpt-5-codex | medium |
| 7. VERIFY | Implementation | Sonnet 4.5 | Standard | gpt-5-codex | medium |
| 8. REVIEW | Cognitive | Opus 4 | 8K-16K tokens | gpt-5 | high |
| 9. PR | Handoff | Sonnet 4.5 | Standard | gpt-5-codex | low |
| 10. MONITOR | Observation | Sonnet 4 | Standard | gpt-5 | minimal |
| REMEDIATION | Fix | Sonnet 4 | Standard | gpt-5-codex | low |

**Reasoning:**
- **STRATEGIZE/PLAN**: High budget for exploring alternatives, root cause analysis
- **THINK**: Highest budget for edge case analysis, failure modes
- **GATE**: Medium-high for design validation
- **IMPLEMENT/VERIFY**: Standard mode (implementation doesn't need deep reasoning about WHY)
- **REVIEW**: High budget for quality assessment, AFP/SCAS validation
- **REMEDIATION**: Fast models for quick iteration loops

## Autopilot vs. Manual Mode

**Autopilot Mode:**
- Auto-detect phase from evidence folder or task metadata
- Default to cognitive models if phase uncertain
- Log phase detection reasoning to telemetry

**Manual Mode (Claude Code CLI):**
- Respect explicit model selection in MCP tools
- Add optional `phase` parameter to tool calls
- Fall back to task-based heuristics if no phase specified

## Success Metrics

1. **Cognitive Quality:** StrategyReviewer/ThinkingCritic approval rate >85%
2. **Cost Efficiency:** 20-30% reduction in total tokens (avoid extended thinking for IMPLEMENT)
3. **Phase Detection Accuracy:** >95% correct phase identification
4. **Autopilot Stability:** No regressions in Wave 0 task completion rate

## Next Steps

1. Implement phase detection module
2. Extend model_selector.ts with phase-aware routing
3. Add Claude extended thinking support
4. Update agent_coordinator.ts to pass phase context
5. Test with AFP task lifecycle
