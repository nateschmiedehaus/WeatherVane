# PLAN: FIX-META-TEST-GAMING

**Task ID**: FIX-META-TEST-GAMING
**Date**: 2025-10-30
**Scope**: Two-stage gaming detection (heuristic scoring + LLM review)

---

## Implementation Tasks

### Task 1: Create GamingDetector Class (AC1)
**File**: `tools/wvo_mcp/src/quality/gaming_detector.ts`
**Time**: 3 hours

**Implementation**:
- `scoreEvidence(evidencePath: string, level: number): GamingScore` method
- Parse evidence files (implement/*.md, verify/*.md, review/*.md)
- Calculate 4 scoring dimensions:
  - **Assertion Quality**: Count assertions (expect, assert, should), detect trivial patterns (assert(true))
  - **Mock Ratio**: Count mocks vs real API calls (only for Level 3 tasks)
  - **Evidence Completeness**: Check for test outputs, error cases, multiple files
  - **Deferral Quality**: Analyze justification length, specificity, risk analysis (only if Level 3 deferred)
- Calculate weighted overall score (0-10)
- Determine risk level (LOW/MEDIUM/HIGH) and flagging decision

**Scoring Logic**:
```typescript
// Assertion Quality (0-10)
const assertionCount = countPattern(content, /expect\(|assert\(|should\./g);
const trivialCount = countPattern(content, /assert\(true\)|expect\(true\)\.toBe\(true\)/g);
const testCount = countPattern(content, /it\(|test\(|describe\(/g);

let assertion_score = Math.min(10, (assertionCount / Math.max(1, testCount)) * 5);
if (trivialCount / Math.max(1, assertionCount) > 0.5) {
  assertion_score -= 5;  // Penalty for >50% trivial assertions
}

// Mock Ratio (0-10, only if Level 3)
const mockCount = countPattern(content, /jest\.fn|sinon\.stub|mock|stub/gi);
const realAPICount = countPattern(content, /fetch\(|http\.get|axios\./gi);
const mock_ratio = mockCount / Math.max(1, mockCount + realAPICount);
let mock_score = 10 * (1 - mock_ratio);
if (mock_ratio > 0.8 && level === 3) {
  mock_score = 0;  // Claiming Level 3 but >80% mocked
}

// Evidence Completeness (0-10)
const hasOutputs = content.includes('Output:') || content.includes('```\n');
const hasErrors = /error|failure|edge case/i.test(content);
const fileCount = fs.readdirSync(evidencePath).filter(f => f.endsWith('.md')).length;
const completeness_score = ((hasOutputs ? 1 : 0) + (hasErrors ? 1 : 0) + Math.min(fileCount / 3, 1)) / 3 * 10;

// Deferral Quality (0-10, only if Level 3 deferred)
const deferralMatch = content.match(/Level 3.*DEFERRED.*Reason:(.*?)Justification:(.*?)\n\n/s);
if (deferralMatch) {
  const justification = deferralMatch[1] + deferralMatch[2];
  const wordCount = justification.split(/\s+/).length;
  const hasSpecifics = /because|blocked by|requires|waiting for/i.test(justification);
  const hasRiskAnalysis = /risk|mitigation|impact/i.test(justification);
  deferral_score = Math.min(10, wordCount / 30 + (hasSpecifics ? 3 : 0) + (hasRiskAnalysis ? 4 : 0));
}

// Weighted Average
const weights = level === 3
  ? {assertion: 0.3, mock: 0.2, completeness: 0.3, deferral: deferralMatch ? 0.2 : 0}
  : {assertion: 0.4, mock: 0, completeness: 0.4, deferral: deferralMatch ? 0.2 : 0};

overall_score = weighted_average([...]);
risk_level = overall_score > 7 ? 'LOW' : overall_score > 5 ? 'MEDIUM' : 'HIGH';
flagged_for_llm_review = risk_level === 'HIGH' || (risk_level === 'MEDIUM' && Math.random() < 0.5);
```

---

### Task 2: Create LLMGamingReviewer Class (AC2)
**File**: `tools/wvo_mcp/src/quality/llm_gaming_reviewer.ts`
**Time**: 2 hours

**Implementation**:
- `async review(evidencePath: string, level: number): Promise<LLMReviewResult>` method
- Read all evidence files (implement/*.md, verify/*.md, review/*.md)
- Construct adversarial prompt with evidence content
- Call LLM API (Claude or Codex via ModelRouter)
- Parse JSON response (verdict, confidence, reasoning, patterns, recommendation)
- Track token usage and cost
- Return structured result

**Adversarial Prompt Template**:
```typescript
const prompt = `You are an adversarial code reviewer detecting "verification theater".

Review this evidence and assess: Is this GENUINE verification or GAMING?

Evidence:
${evidenceContent}

Verification Level Claimed: Level ${level}

Gaming Patterns to Check:
1. Trivial Tests: Are assertions meaningful or just assert(true)?
2. Mock Abuse: If claiming Level 3, are real dependencies tested or all mocked?
3. Weak Deferrals: If Level 3 deferred, is justification specific and reasonable?
4. Cherry-Picking: Does evidence feel complete or selectively shown?

Respond with JSON:
{
  "verdict": "GENUINE" | "SUSPICIOUS" | "GAMING",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "gaming_patterns_found": ["pattern1", "pattern2"],
  "recommendation": "APPROVE" | "REQUEST_BETTER_EVIDENCE" | "REJECT"
}

Be harsh but fair. Genuine verification with minor issues should be SUSPICIOUS, not GAMING.`;

const response = await this.modelRouter.call({model: 'claude-sonnet-4', prompt});
const result = JSON.parse(response.content);
return {
  ...result,
  tokens_used: response.usage.total_tokens,
  cost_usd: response.usage.total_tokens * 0.012 / 1000
};
```

---

### Task 3: Create Test Suite for Detection (AC4, AC8)
**File**: `tools/wvo_mcp/src/quality/__tests__/gaming_detector.test.ts`
**Time**: 2.5 hours

**Tests**:
- Unit tests for GamingDetector (15 test cases):
  - Assertion quality scoring (5 tests: 0 assertions, trivial assertions, good assertions, mixed, edge cases)
  - Mock ratio scoring (3 tests: no mocks, some mocks, all mocks)
  - Evidence completeness (3 tests: minimal, partial, complete)
  - Deferral quality (3 tests: weak, reasonable, excellent)
  - Overall scoring (1 test: weighted average calculation)

- Integration tests with 20 synthetic examples:
  - Create fixture directories: `__tests__/fixtures/gaming_examples/`
  - 5 GENUINE examples (real verification)
  - 5 SUSPICIOUS examples (borderline cases)
  - 10 GAMING examples (clear gaming patterns):
    - trivial_tests_1: No assertions
    - trivial_tests_2: assert(true) only
    - mock_abuse_1: Level 3 with 100% mocks
    - mock_abuse_2: Level 3 with 90% mocks
    - weak_deferral_1: "Don't have time" (<10 words)
    - weak_deferral_2: No risk analysis
    - cherry_picked_1: Shows 2/20 tests
    - cherry_picked_2: No error cases documented
    - no_evidence_1: Empty verify/*.md
    - no_evidence_2: Only "Build passed" documented

- Test accuracy metrics:
  - Heuristic >70% recall on GAMING cases
  - LLM >90% precision (mocked LLM responses)
  - Combined >85% accuracy

**File**: `tools/wvo_mcp/src/quality/__tests__/llm_gaming_reviewer.test.ts`
**Tests** (10 test cases):
- Mock LLM calls with predefined responses
- Test verdict parsing (GENUINE/SUSPICIOUS/GAMING)
- Test confidence scoring (0.0-1.0)
- Test pattern identification
- Test recommendation mapping
- Test token/cost tracking

---

### Task 4: Integrate into WorkProcessEnforcer (AC3)
**File**: `tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts`
**Time**: 1.5 hours

**Integration**:
- Add `checkGamingPatterns(taskId, level)` method
- Call before VERIFY → REVIEW transition
- Two-stage detection:
  - Stage 1: Run heuristic scoring (always)
  - Stage 2: Run LLM review (conditional based on risk level)
- Return result: `{allowed, message, gaming_detected}`
- Log to analytics (both heuristic and LLM results)

**Implementation**:
```typescript
async checkGamingPatterns(
  taskId: string,
  level: number
): Promise<{allowed: boolean, message: string, gaming_detected: boolean}> {
  const evidencePath = `state/evidence/${taskId}`;

  // Stage 1: Heuristic Scoring (fast, cheap)
  const gamingDetector = new GamingDetector();
  const score = gamingDetector.scoreEvidence(evidencePath, level);

  // Log heuristic scores
  await this.logGamingAnalytics({
    timestamp: new Date().toISOString(),
    taskId,
    level_claimed: level,
    heuristic_score: score,
    risk_level: score.risk_level,
    llm_review: null,
    blocked: false
  });

  // Stage 2: LLM Review (slow, expensive, conditional)
  if (score.flagged_for_llm_review) {
    const llmReviewer = new LLMGamingReviewer();
    const llmResult = await llmReviewer.review(evidencePath, level);

    // Update analytics with LLM result
    await this.logGamingAnalytics({
      timestamp: new Date().toISOString(),
      taskId,
      level_claimed: level,
      heuristic_score: score,
      risk_level: score.risk_level,
      llm_review: llmResult,
      blocked: llmResult.recommendation === 'REJECT'
    });

    // Reject if LLM says GAMING
    if (llmResult.recommendation === 'REJECT') {
      return {
        allowed: false,
        message: this.buildGamingMessage(llmResult, score),
        gaming_detected: true
      };
    }

    // Request better evidence if LLM says SUSPICIOUS
    if (llmResult.recommendation === 'REQUEST_BETTER_EVIDENCE') {
      return {
        allowed: false,
        message: this.buildSuspiciousMessage(llmResult, score),
        gaming_detected: false
      };
    }
  }

  // Approve (low risk or LLM said GENUINE)
  return {allowed: true, message: '', gaming_detected: false};
}
```

---

### Task 5: Create Gaming Message Templates (AC5)
**Time**: 1 hour

**Implementation**:
- `buildGamingMessage(llmResult, score)` method
- `buildSuspiciousMessage(llmResult, score)` method
- Templates with:
  - Pattern name
  - Specific issue
  - What's wrong (detailed explanation)
  - How to fix (actionable steps)
  - Link to good examples
  - BLOCKER note

**Example**:
```typescript
buildGamingMessage(llmResult: LLMReviewResult, score: GamingScore): string {
  const pattern = llmResult.gaming_patterns_found[0] || 'general_gaming';
  const templates = {
    trivial_tests: {
      issue: 'Tests exist but contain no meaningful assertions',
      wrong: [
        `- Found tests but assertion quality score: ${score.dimensions.assertion_quality}/10`,
        '- Tests call functions but don\'t validate outputs',
        '- This is "execution theater" - code runs but isn\'t verified'
      ],
      fix: [
        'Add assertions: expect(result).toBe(expected)',
        'Test meaningful properties (outputs, side effects, errors)',
        'Cover edge cases (not just happy path)'
      ],
      example: 'docs/autopilot/examples/verification/api_integration_good.md'
    },
    // ... other patterns
  };

  const template = templates[pattern] || templates.trivial_tests;

  return `⚠️ Verification Gaming Detected

**Gaming Pattern**: ${pattern.replace(/_/g, ' ').toUpperCase()}

**Issue**: ${template.issue}

**What's Wrong**:
${template.wrong.map(w => w).join('\n')}

**How to Fix**:
${template.fix.map((f, i) => `${i+1}. ${f}`).join('\n')}

**Example of Genuine Verification**:
See: ${template.example}

**LLM Reviewer Reasoning**: ${llmResult.reasoning}

**This is a BLOCKER** - You must fix this before proceeding to REVIEW.

See: docs/autopilot/VERIFICATION_LEVELS.md for full standards`;
}
```

---

### Task 6: Add Analytics Tracking (AC6)
**Time**: 30 minutes

**Implementation**:
- Create analytics file: `state/analytics/gaming_detections.jsonl`
- `logGamingAnalytics(entry)` method
- Append each detection as single JSONL line
- Fields: timestamp, taskId, heuristic_score, llm_review (if triggered), blocked

**Format**:
```typescript
interface GamingAnalyticsEntry {
  timestamp: string;
  taskId: string;
  level_claimed: number;
  heuristic_score: GamingScore;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  llm_review: LLMReviewResult | null;
  blocked: boolean;
}

async logGamingAnalytics(entry: GamingAnalyticsEntry): Promise<void> {
  const analyticsFile = 'state/analytics/gaming_detections.jsonl';
  await fs.appendFile(analyticsFile, JSON.stringify(entry) + '\n');
}
```

---

### Task 7: Create 20 Synthetic Test Examples (AC4)
**Time**: 2 hours

**Implementation**:
- Create fixture directories: `tools/wvo_mcp/src/quality/__tests__/fixtures/gaming_examples/`
- For each example, create evidence structure:
  - `{example_name}/implement/implementation_summary.md`
  - `{example_name}/verify/verification_summary.md`
  - (optional) `{example_name}/review/adversarial_review.md`

**5 GENUINE Examples**:
1. `genuine_api_client`: Good Level 2 (tests with assertions, error cases)
2. `genuine_integration`: Good Level 3 (real API, auth, error handling)
3. `genuine_ml_model`: Good Level 2 (test predictions, accuracy validation)
4. `genuine_ui_feature`: Good Level 2 (user interaction tests)
5. `genuine_deferred`: Good Level 2 + valid Level 3 deferral (specific reason, risk analysis)

**5 SUSPICIOUS Examples**:
1. `suspicious_few_assertions`: Level 2 with only 2 assertions (borderline)
2. `suspicious_partial_mock`: Level 3 with 60% mocks (borderline)
3. `suspicious_short_deferral`: Level 3 deferred with 25-word justification (borderline)
4. `suspicious_incomplete_evidence`: Level 2 with test output but no error cases
5. `suspicious_minimal_coverage`: Level 2 with 2/10 functions tested

**10 GAMING Examples** (as listed in Task 3)

---

### Task 8: Add Cost Tracking and Efficiency Checks (AC7)
**Time**: 30 minutes

**Implementation**:
- Track LLM token usage and cost in `LLMReviewResult`
- Calculate average cost per task
- Add efficiency metrics to analytics
- Create cost report script

**Cost Report**:
```bash
#!/bin/bash
# scripts/gaming_cost_report.sh

cat state/analytics/gaming_detections.jsonl | \
  jq -s '
    map(select(.llm_review != null)) |
    {
      total_reviews: length,
      total_cost: map(.llm_review.cost_usd) | add,
      avg_cost_per_review: (map(.llm_review.cost_usd) | add) / length,
      total_tokens: map(.llm_review.tokens_used) | add,
      gaming_detected: map(select(.blocked == true)) | length
    }
  '
```

---

## Total Estimated Time: 12.5 hours

**Breakdown**:
- GamingDetector class: 3 hours
- LLMGamingReviewer class: 2 hours
- Test suite (unit + integration): 2.5 hours
- WorkProcessEnforcer integration: 1.5 hours
- Gaming message templates: 1 hour
- Analytics tracking: 30 minutes
- Synthetic test examples: 2 hours
- Cost tracking: 30 minutes

---

## Dependencies

**Internal**:
- VerificationLevelDetector (from FIX-META-TEST-ENFORCEMENT) - for Level detection
- ModelRouter - for LLM API calls
- WorkProcessEnforcer - for integration
- VERIFICATION_LEVELS.md - for standards reference

**External**:
- LLM API access (Claude or Codex via ModelRouter)
- Filesystem access (read evidence directories)

---

## Risks

**Risk 1: LLM cost higher than expected**
- Mitigation: Start with conservative flagging (only HIGH risk), tune thresholds based on cost data

**Risk 2: Heuristic scoring too strict (false positives)**
- Mitigation: Test on 20 synthetic examples first, adjust weights before deploying

**Risk 3: LLM review takes too long (>5 seconds)**
- Mitigation: Use streaming responses, show progress indicator, allow timeout

---

**Next Phase**: THINK (assumptions, pre-mortem)
