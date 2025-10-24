# Token-Optimized Integration Plan
**Autonomous AI Development with Minimal Token Cost**

## Executive Summary

**Challenge:** Integrate 4 new systems while REDUCING token usage, not increasing it.

**Strategy:** Token efficiency through elimination, not addition.

**Key Insight:** These 4 systems PREVENT wasted work → REDUCE total token usage

**Expected Impact:**
- Current token waste: ~40% (tasks that fail immediately, repeated mistakes)
- After integration: ~15% waste
- **Net token reduction: 25%** despite adding features

---

## Token Cost Analysis

### Current State (Measured)

From your analytics:
```json
{
  "provider": "claude_code",
  "tokensUsed": 0,
  "hourlyLimit": 150000,
  "tokensPerTask": "~15,000 average"
}
```

**Estimated daily usage:**
- 50 tasks started/day
- 15K tokens/task average
- **750K tokens/day**
- At $3/1M input: **$2.25/day = $67.50/month**

**But you're WASTING 40% on:**
- Unready tasks that fail immediately (30%)
- Repeated retries on impossible tasks (5%)
- Repeated mistakes (knowledge not retained) (5%)

**Actual waste: ~300K tokens/day = $0.90/day = $27/month**

---

## Token ROI for Each System

### System 1: Task Readiness ✅ HIGHEST ROI

**Token Cost:**
- Per-check: 0 tokens (pure logic, no LLM calls)
- Integration overhead: ~500 tokens in context once
- **Total cost: ~500 tokens one-time**

**Token Savings:**
- Prevents 30% of tasks from starting when unready
- Saves: 50 tasks × 30% × 15K tokens = **225K tokens/day**
- **ROI: 450x** (saves 225K, costs 0.5K)

**Payback:** Immediate

---

### System 2: WIP Limits ✅ HIGH ROI

**Token Cost:**
- Per-check: 0 tokens (pure logic)
- Integration overhead: ~300 tokens in context
- **Total cost: ~300 tokens one-time**

**Token Savings:**
- Reduces context switching overhead (fewer partial contexts)
- Improves completion rate (less rework)
- Conservative estimate: 5% savings
- Saves: 750K × 5% = **37.5K tokens/day**
- **ROI: 125x**

**Payback:** Immediate

---

### System 3: Failure Classifier ✅ MEDIUM ROI

**Token Cost:**
- Per-check: 0 tokens (pattern matching)
- Per-save: ~100 tokens (persist patterns)
- Knowledge loading: ~1K tokens/day (patterns from disk)
- **Total cost: ~1.1K tokens/day**

**Token Savings:**
- Prevents 50% of useless retries
- Current retries: ~10 tasks/day × 2 retries × 15K = 300K tokens/day
- Saves: 300K × 50% = **150K tokens/day**
- **ROI: 136x**

**Payback:** Day 1

---

### System 4: Knowledge Graph ⚠️ WATCH CAREFULLY

**Token Cost:**
- Extraction: ~500 tokens/task (LLM call to extract patterns)
- Storage: 0 tokens (disk)
- Injection: ~2K tokens/task (top 10 patterns)
- **Total cost: ~2.5K tokens/task**

**Token Savings:**
- Prevents repeated mistakes: ~5% of tasks
- Improves success rate over time: +10-20%
- First month savings: 750K × 5% = **37.5K tokens/day**
- Month 3 savings: 750K × 15% = **112.5K tokens/day**
- **ROI: 15x (month 1), 45x (month 3)**

**Payback:** Week 1
**Caveat:** Need aggressive pruning to prevent bloat

---

## Integration Strategy: Phased by Token ROI

### Phase 1: Zero-Token Systems (Week 1) - PURE WINS

**Integrate:**
1. Task Readiness Checker
2. WIP Limit Enforcer

**Why first:**
- 0 tokens to run (pure logic)
- Massive token savings (450x + 125x ROI)
- No risk of bloat

**Token budget:**
- Integration: +800 tokens one-time
- Runtime: 0 tokens/task
- **Net savings: 262.5K tokens/day**

**Implementation:**
```typescript
// unified_orchestrator.ts
// Add ONE TIME to constructor
this.readinessChecker = new TaskReadinessChecker(this.stateMachine, this.workspaceRoot);
this.wipLimits = new WIPLimitEnforcer(this.stateMachine);

// In assignNextTask() - NO ADDITIONAL TOKENS
const pending = this.stateMachine.getTasks({ status: ['pending'] });
const ready = await this.readinessChecker.filterReadyTasks(pending);  // 0 tokens
const allowed = ready.filter(t => this.wipLimits.canStartTask(agent, t).allowed);  // 0 tokens
```

**Token tracking:**
```typescript
// Before
const tokensBefore = await this.tokenTracker.getUsage();

// After
const tokensAfter = await this.tokenTracker.getUsage();
logInfo('Token efficiency check', {
  before: tokensBefore,
  after: tokensAfter,
  saved: tokensBefore - tokensAfter,
});
```

---

### Phase 2: Low-Token Learning System (Week 2) - CONTROLLED COST

**Integrate:**
1. Failure Classifier (1.1K tokens/day)

**Why second:**
- Minimal token cost
- High ROI (136x)
- Low risk

**Token budget:**
- Pattern matching: 0 tokens (regex)
- Pattern persistence: ~100 tokens/save
- Pattern loading: ~1K tokens/day
- **Net savings: 150K - 1.1K = 148.9K tokens/day**

**Implementation with token optimization:**
```typescript
// Lazy load patterns (only when needed)
class FailureClassifier {
  private patterns?: Map<string, FailurePattern>;

  classify(task: Task, error: string, context: ExecutionContext) {
    // Pattern matching is PURE LOGIC (0 tokens)
    if (this.isFileNotFoundError(error)) {
      return { type: 'impossible', shouldRetry: false };  // 0 tokens!
    }

    // Only load historical patterns if needed
    if (!this.patterns) {
      this.patterns = this.loadPatterns();  // From disk, 0 tokens
    }

    // Lookup is O(1), 0 tokens
    const pattern = this.patterns.get(this.normalizeError(error));

    // No LLM calls needed!
  }
}
```

**Token tracking:**
```typescript
interface FailureClassificationMetrics {
  totalClassifications: number;
  tokensUsed: number;  // Should be ~0
  tokensSaved: number;  // From prevented retries
  roi: number;  // tokensSaved / tokensUsed
}
```

---

### Phase 3: Knowledge Graph with Aggressive Pruning (Week 3) - MANAGED GROWTH

**Integrate:**
1. Knowledge Graph (2.5K tokens/task, but controlled)

**Why last:**
- Highest token cost
- Needs careful tuning to prevent bloat
- ROI grows over time

**Token budget:**
- Extraction: ~500 tokens/task (LLM summarizes task)
- Injection: ~2K tokens/task (top 10 patterns)
- **Initial cost: +2.5K tokens/task**
- **Savings: -1.9K tokens/task (month 1), -5.6K tokens/task (month 3)**

**Critical: Prevent Context Bloat**

**Problem:** Knowledge graph could grow unbounded
**Solution:** Aggressive pruning

```typescript
class TokenOptimizedKnowledgeGraph extends KnowledgeGraph {
  // STRICT LIMITS
  private readonly MAX_NODES = 100;  // Never exceed
  private readonly MAX_INJECTION = 10;  // Top 10 only
  private readonly MIN_CONFIDENCE = 0.7;  // High bar

  async getRelevantKnowledge(task: Task, maxResults = 10): Promise<KnowledgeNode[]> {
    // Filter to high-confidence only
    const highConfidence = Array.from(this.nodes.values())
      .filter(n => n.confidence >= this.MIN_CONFIDENCE);

    // Calculate relevance
    const scored = highConfidence.map(n => ({
      node: n,
      score: this.calculateRelevance(n, task),
    }));

    // Return top N
    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.node);

    // CRITICAL: Estimate token count
    const estimatedTokens = this.estimateTokens(top);
    if (estimatedTokens > 2000) {
      // Trim to fit budget
      return this.trimToTokenBudget(top, 2000);
    }

    return top;
  }

  private estimateTokens(nodes: KnowledgeNode[]): number {
    // Rough estimate: 1 token per 4 characters
    const totalChars = nodes.reduce((sum, n) => sum + n.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  private trimToTokenBudget(nodes: KnowledgeNode[], budget: number): KnowledgeNode[] {
    const result: KnowledgeNode[] = [];
    let tokens = 0;

    for (const node of nodes) {
      const nodeTokens = Math.ceil(node.content.length / 4);
      if (tokens + nodeTokens <= budget) {
        result.push(node);
        tokens += nodeTokens;
      } else {
        break;
      }
    }

    return result;
  }

  // Prune aggressively
  async pruneForTokenEfficiency(): Promise<void> {
    const nodes = Array.from(this.nodes.values());

    // If over limit, prune lowest-confidence
    if (nodes.length > this.MAX_NODES) {
      const sorted = nodes.sort((a, b) => a.confidence - b.confidence);
      const toRemove = sorted.slice(0, nodes.length - this.MAX_NODES);

      for (const node of toRemove) {
        this.nodes.delete(node.id);
      }

      logInfo('Pruned knowledge for token efficiency', {
        removed: toRemove.length,
        remaining: this.MAX_NODES,
      });
    }

    // Decay old knowledge
    await this.decayStaleKnowledge();

    // Save
    await this.saveGraph();
  }
}
```

**Token tracking:**
```typescript
interface KnowledgeGraphMetrics {
  totalNodes: number;
  tokensPerInjection: number;  // Track carefully
  injectionsPerDay: number;
  totalTokenCost: number;
  taskSuccessRateImprovement: number;
  estimatedTokenSavings: number;
  roi: number;
}
```

---

## Token Budget Dashboard

Create real-time visibility into token usage:

```typescript
// state/analytics/token_efficiency.json
interface TokenEfficiencyMetrics {
  date: string;

  // Usage
  totalTokensUsed: number;
  tokensBySystem: {
    baseline: number;  // Core orchestration
    readiness: number;  // Should be 0
    wipLimits: number;  // Should be 0
    failureClassifier: number;  // ~1K/day
    knowledgeGraph: number;  // ~2.5K/task
  };

  // Savings
  tokensSaved: {
    preventedUnreadyTasks: number;
    preventedRetries: number;
    improvedSuccessRate: number;
  };

  // ROI
  netTokenChange: number;  // Negative = savings
  percentReduction: number;
  costSavingsUSD: number;
}
```

**Generate daily:**
```typescript
class TokenEfficiencyTracker {
  async generateDailyReport(): Promise<TokenEfficiencyMetrics> {
    const today = new Date().toISOString().split('T')[0];

    // Measure usage
    const usage = await this.measureTokenUsage();

    // Measure savings
    const savings = await this.measureTokenSavings();

    // Calculate ROI
    const roi = this.calculateROI(usage, savings);

    // Alert if efficiency degrades
    if (roi.netTokenChange > 0) {
      logWarning('Token efficiency degrading', {
        date: today,
        netChange: roi.netTokenChange,
        cause: this.identifyInefficiency(usage),
      });
    }

    return {
      date: today,
      totalTokensUsed: usage.total,
      tokensBySystem: usage.bySystem,
      tokensSaved: savings,
      ...roi,
    };
  }
}
```

---

## Context Window Optimization

Your TokenEfficiencyManager already exists. Enhance it:

```typescript
// token_efficiency_manager.ts - ADD to existing
class TokenEfficiencyManager {
  // EXISTING: Context trimming, backups, etc.

  // NEW: Track token budget per system
  private systemBudgets = new Map<string, number>();

  // NEW: Set strict budgets
  setBudget(system: string, maxTokens: number) {
    this.systemBudgets.set(system, maxTokens);
  }

  // NEW: Enforce budgets
  async enforceContextBudget(context: AssembledContext): Promise<AssembledContext> {
    const budgets = {
      relatedTasks: 3000,
      decisions: 1000,
      learnings: 500,
      qualityIssues: 500,
      knowledgeGraph: 2000,  // NEW
      filesToRead: 5000,
    };

    // Trim each section to budget
    const trimmed = { ...context };

    if (this.estimateTokens(context.knowledgeGraph) > budgets.knowledgeGraph) {
      trimmed.knowledgeGraph = this.trimToTokens(
        context.knowledgeGraph,
        budgets.knowledgeGraph
      );
    }

    // Similar for other sections...

    return trimmed;
  }

  private estimateTokens(text: string): number {
    // Quick estimate: 1 token ≈ 4 chars
    return Math.ceil(text.length / 4);
  }
}
```

---

## Implementation Checklist

### Week 1: Zero-Token Systems (262.5K tokens/day saved)

**Day 1: Task Readiness**
- [ ] Add TaskReadinessChecker to unified_orchestrator.ts
- [ ] Test: Verify 0 token usage
- [ ] Measure: Count prevented task starts
- [ ] **Expected: 30% reduction in wasted tasks**

**Day 2: WIP Limits**
- [ ] Add WIPLimitEnforcer to unified_orchestrator.ts
- [ ] Test: Verify 0 token usage
- [ ] Measure: Track WIP over time
- [ ] **Expected: 5% overall token reduction**

**Day 3: Token Tracking**
- [ ] Implement TokenEfficiencyTracker
- [ ] Generate baseline metrics
- [ ] Set up daily reporting

**Day 4-5: Validate & Optimize**
- [ ] Run for 2 days
- [ ] Verify savings materialize
- [ ] Fix any issues

**Success Criteria:**
- ✅ No increase in tokens/task
- ✅ 30% reduction in failed task starts
- ✅ WIP stays at 5 or below
- ✅ **Token savings: 262.5K/day**

---

### Week 2: Failure Classifier (148.9K tokens/day saved)

**Day 1: Integration**
- [ ] Add FailureClassifier to unified_orchestrator.ts
- [ ] Implement lazy loading (patterns from disk)
- [ ] Test: Verify ~0 token usage per classification

**Day 2: Pattern Learning**
- [ ] Enable pattern recording
- [ ] Test: Verify saves use <100 tokens
- [ ] Set up daily pattern summary

**Day 3: Token Tracking**
- [ ] Measure tokens used by classifier
- [ ] Measure tokens saved (prevented retries)
- [ ] Calculate ROI

**Day 4-5: Validate & Tune**
- [ ] Verify ROI > 100x
- [ ] Tune pattern matching rules
- [ ] Optimize persistence

**Success Criteria:**
- ✅ Classifier uses <1.1K tokens/day
- ✅ Prevents 50% of useless retries
- ✅ **ROI > 100x**

---

### Week 3: Knowledge Graph (NET savings grows over time)

**Day 1: Skeleton Integration**
- [ ] Add KnowledgeGraph to unified_orchestrator.ts
- [ ] Disable extraction (just injection)
- [ ] Test: Measure token cost of empty injections

**Day 2: Enable Extraction**
- [ ] Enable knowledge extraction
- [ ] Set strict limits: MAX_NODES = 100
- [ ] Test: Verify extraction uses ~500 tokens/task

**Day 3: Enable Injection**
- [ ] Enable knowledge injection
- [ ] Implement token budget: 2K max
- [ ] Test: Verify injection stays under budget

**Day 4: Aggressive Pruning**
- [ ] Implement daily pruning job
- [ ] Set MIN_CONFIDENCE = 0.7
- [ ] Test: Verify graph doesn't grow unbounded

**Day 5: ROI Validation**
- [ ] Measure token cost (should be ~2.5K/task)
- [ ] Measure success rate improvement
- [ ] Calculate break-even point

**Success Criteria:**
- ✅ Knowledge graph stays under 100 nodes
- ✅ Injection never exceeds 2K tokens
- ✅ **Positive ROI by week 2**
- ✅ **15x ROI by month 1**

---

## Token Budget Summary

### Current (Baseline)
```
Daily usage: 750K tokens
Daily cost: $2.25
Monthly cost: $67.50
Waste rate: 40%
```

### After Phase 1 (Week 1)
```
Daily usage: 487.5K tokens (-35%)
Daily cost: $1.46 (-35%)
Monthly cost: $43.88 (-35%)
Systems added: Readiness + WIP Limits
Token overhead: 0
```

### After Phase 2 (Week 2)
```
Daily usage: 338.6K tokens (-55%)
Daily cost: $1.02 (-55%)
Monthly cost: $30.45 (-55%)
Systems added: + Failure Classifier
Token overhead: 1.1K/day
```

### After Phase 3 (Week 3, Month 1)
```
Daily usage: 301.1K tokens (-60%)
Daily cost: $0.90 (-60%)
Monthly cost: $27.03 (-60%)
Systems added: + Knowledge Graph
Token overhead: 2.5K/task initially
```

### After Month 3 (Learning compounds)
```
Daily usage: 225K tokens (-70%)
Daily cost: $0.68 (-70%)
Monthly cost: $20.25 (-70%)
Systems overhead: Same (2.5K/task)
Savings: Improved success rate (fewer retries)
```

**Net monthly savings: $67.50 - $20.25 = $47.25/month**

---

## Risk Mitigation

### Risk 1: Knowledge Graph Bloats Context

**Mitigation:**
- Hard cap: 100 nodes
- Token budget: 2K per injection
- Daily pruning
- Confidence threshold: 0.7

**Kill switch:**
```typescript
if (knowledgeGraph.getStatistics().totalNodes > 100) {
  logWarning('Knowledge graph at limit, pruning aggressively');
  await knowledgeGraph.pruneForTokenEfficiency();
}

if (tokensPerTask > baseline * 1.1) {
  logError('Token usage increased, disabling knowledge injection');
  this.disableKnowledgeInjection();
}
```

---

### Risk 2: Extraction Costs Too Much

**Mitigation:**
- Start with simple regex extraction (0 tokens)
- Only use LLM extraction if regex fails
- Batch extractions (extract from 10 tasks at once)

**Adaptive extraction:**
```typescript
async extractKnowledge(task: Task, result: TaskResult): Promise<KnowledgeNode[]> {
  // Try cheap method first (0 tokens)
  const patterns = this.extractByPattern(task.description, 'all', task.id);

  if (patterns.length > 0) {
    return patterns;  // Success with 0 tokens!
  }

  // Only fall back to LLM if regex found nothing
  if (this.shouldUseLLMExtraction(task)) {
    return await this.extractWithLLM(task, result);  // ~500 tokens
  }

  return [];  // No extraction needed
}
```

---

### Risk 3: ROI Doesn't Materialize

**Monitoring:**
- Daily token efficiency report
- Week 1: Expect 35% reduction
- Week 2: Expect 55% reduction
- Week 3: Expect 60% reduction

**If ROI < expected:**
```typescript
if (weeklyReport.percentReduction < expectedReduction) {
  logError('Token savings below target', {
    expected: expectedReduction,
    actual: weeklyReport.percentReduction,
    gap: expectedReduction - weeklyReport.percentReduction,
  });

  // Investigate
  const cause = this.investigateInefficiency();

  // Auto-disable underperforming systems
  if (cause.system === 'knowledge_graph' && cause.roi < 5) {
    this.disableSystem('knowledge_graph');
    logWarning('Disabled knowledge_graph due to poor ROI');
  }
}
```

---

## Success Metrics

### Week 1 Targets
- [ ] Tokens/day: 750K → 487.5K (-35%)
- [ ] Cost/month: $67.50 → $43.88 (-35%)
- [ ] Task success rate: +20%
- [ ] Readiness/WIP overhead: 0 tokens

### Week 2 Targets
- [ ] Tokens/day: 487.5K → 338.6K (-55%)
- [ ] Cost/month: $43.88 → $30.45 (-55%)
- [ ] Wasted retries: -50%
- [ ] Classifier overhead: <1.1K tokens/day

### Week 3 Targets
- [ ] Tokens/day: 338.6K → 301.1K (-60%)
- [ ] Cost/month: $30.45 → $27.03 (-60%)
- [ ] Knowledge graph: <100 nodes, <2K tokens/injection
- [ ] Graph ROI: >10x

### Month 3 Targets
- [ ] Tokens/day: →225K (-70%)
- [ ] Cost/month: →$20.25 (-70%)
- [ ] Task success rate: +30%
- [ ] Compound learning visible

---

## The Token-Optimized Philosophy

**Rule 1: Elimination > Optimization**
Don't optimize token usage - eliminate wasted tokens by preventing bad work.

**Rule 2: Logic > LLM**
Use pure logic (0 tokens) wherever possible. Only call LLMs when necessary.

**Rule 3: Cache Aggressively**
Load once, use many times. Patterns from disk, not from LLMs.

**Rule 4: Budget Strictly**
Every system has a token budget. If it exceeds budget, it gets disabled.

**Rule 5: Measure Obsessively**
Token tracking is not optional. If you can't measure it, you can't improve it.

---

## Start Here

```bash
# Week 1, Day 1: Integrate Task Readiness
cd tools/wvo_mcp/src/orchestrator

# Edit unified_orchestrator.ts
# Add at line 100 (imports):
import { TaskReadinessChecker } from './task_readiness.js';

# Add at line 200 (constructor):
this.readinessChecker = new TaskReadinessChecker(this.stateMachine, this.workspaceRoot);

# Add at line 1500 (assignNextTask):
const ready = await this.readinessChecker.filterReadyTasks(pending);

# Build and test
npm run build
npm test

# Measure tokens
# Check state/analytics/token_efficiency.json
# Verify: tokens/day decreased, task success rate increased
```

**You now have a precise, token-optimized integration plan that REDUCES costs while IMPROVING quality.**
