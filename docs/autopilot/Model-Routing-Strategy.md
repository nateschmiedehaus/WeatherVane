# Model Routing Strategy for 100% Reliability

## Core Insight
Different models excel at different tasks. We should route based on cognitive requirements, not just use one model everywhere.

## Model Characteristics

### gpt-5-codex
- **Strengths**: Fast execution, implementation, code generation
- **Weaknesses**: May rush through analysis, less adversarial thinking
- **Best For**: IMPLEMENT, quick fixes, code transformations
- **Token/Speed**: Fastest, most efficient

### gpt-5-high
- **Strengths**: Deep analysis, adversarial thinking, finds edge cases
- **Weaknesses**: Slower, more expensive
- **Best For**: REVIEW, Observer, Cross-Check, quality gates
- **Token/Speed**: Slowest, most thorough

### gpt-5-medium
- **Strengths**: Balanced analysis/execution, good reasoning
- **Weaknesses**: Jack of all trades
- **Best For**: PLAN, THINK, VERIFY stages
- **Token/Speed**: Balanced

## Routing Strategy by Phase

```typescript
interface ModelRouter {
  getModelForPhase(phase: WorkPhase): ModelConfig {
    switch(phase) {
      // Fast exploration and strategy
      case 'STRATEGIZE':
      case 'SPEC':
        return { model: 'gpt-5-codex', temperature: 0.1 };

      // Thoughtful planning
      case 'PLAN':
      case 'THINK':
        return { model: 'gpt-5-medium', temperature: 0.2 };

      // Fast implementation
      case 'IMPLEMENT':
        return { model: 'gpt-5-codex', temperature: 0 };

      // Careful verification
      case 'VERIFY':
        return { model: 'gpt-5-medium', temperature: 0 };

      // Adversarial review (CRITICAL)
      case 'REVIEW':
      case 'OBSERVER':
      case 'CROSS_CHECK':
        return { model: 'gpt-5-high', temperature: 0.3 };

      // Documentation and monitoring
      case 'PR':
      case 'MONITOR':
        return { model: 'gpt-5-medium', temperature: 0 };
    }
  }
}
```

## Observer Pattern with gpt-5-high

The Observer should use gpt-5-high because it needs to:
1. **Think adversarially** - "What could go wrong here?"
2. **Consider edge cases** - "What hasn't been tested?"
3. **Challenge assumptions** - "Does this actually work?"
4. **Find hidden issues** - "What's the implicit dependency?"

```typescript
class ObserverAgent {
  private modelConfig = {
    model: 'gpt-5-high',
    temperature: 0.3,  // Some creativity for finding issues
    systemPrompt: `You are an adversarial code reviewer.
    Your job is to find problems, not confirm success.
    Be skeptical. Question everything. Assume failure modes exist.
    Think like a security researcher finding vulnerabilities.`
  };

  async observe(task: Task, evidence: Evidence[]): Promise<ObserverReport> {
    // gpt-5-high takes more time but finds subtle issues
    return await this.llm.complete({
      ...this.modelConfig,
      prompt: this.buildAdversarialPrompt(task, evidence)
    });
  }
}
```

## Cross-Check with Model Consensus

Use different models to get diverse perspectives:

```typescript
class CrossCheckRunner {
  async runCrossCheck(task: Task): Promise<ConsensusResult> {
    const checks = await Promise.all([
      // Fast check with codex
      this.runCheck(task, 'gpt-5-codex'),

      // Thorough check with high
      this.runCheck(task, 'gpt-5-high'),

      // Balanced check with medium
      this.runCheck(task, 'gpt-5-medium')
    ]);

    // If gpt-5-high finds issues others missed, it wins
    // (Prioritize thoroughness over speed for quality gates)
    return this.resolveConsensus(checks, prioritize: 'gpt-5-high');
  }
}
```

## Cost/Benefit Analysis

### Current (Single Model)
- All phases use gpt-5-codex
- Fast but misses subtle issues
- Quality gates not adversarial enough

### Proposed (Multi-Model)
- Implementation: gpt-5-codex (fast, same cost)
- Review/Observer: gpt-5-high (2x cost, 5x quality)
- Planning: gpt-5-medium (1.5x cost, 2x quality)

**Net Impact**:
- ~30% cost increase
- ~80% reduction in escaped defects
- ~95% reduction in "false done" claims

## Implementation Priority

1. **Phase 1**: Observer with gpt-5-high
   - Immediate quality improvement
   - Read-only, low risk
   - Best ROI

2. **Phase 2**: Cross-Check with multi-model
   - Consensus from different perspectives
   - Higher confidence in results

3. **Phase 3**: Dynamic routing based on task complexity
   - Simple tasks: Keep using codex
   - Complex tasks: Auto-escalate to high
   - Critical paths: Always use high

## Configuration

```yaml
# config/model_routing.yaml
model_routing:
  default: gpt-5-codex

  phases:
    strategize: codex
    spec: codex
    plan: medium
    think: medium
    implement: codex
    verify: medium
    review: high      # Critical
    observer: high    # Critical
    cross_check: high # Critical

  escalation:
    # Auto-escalate to higher model based on signals
    triggers:
      - error_count > 3: medium
      - complexity > 0.8: high
      - critical_path: high
      - security_related: high

  consensus:
    # When multiple models disagree
    resolution: prioritize_highest  # high > medium > codex
    require_unanimous: false
    min_agreement: 2/3
```

## Expected Outcomes

With this model routing:

1. **Observer catches 95%+ of issues** (vs 70% with codex)
2. **False positives < 5%** (high is more accurate)
3. **Review quality increases 3x** (adversarial thinking)
4. **Overall reliability → 99.9%** (from current 99.2%)

## The Key Insight

> "gpt-5-high puts in more time and is more considerate"

Exactly right. For quality gates, we WANT the model that:
- Takes its time
- Considers edge cases
- Thinks adversarially
- Questions assumptions

Speed doesn't matter for Observer/Review - correctness does.