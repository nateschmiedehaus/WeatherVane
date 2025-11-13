# Design: TODO/Stub Implementation Prevention System

**Task ID:** AFP-TODO-STUB-PREVENTION-20251113
**Date:** 2025-11-13
**Design Version:** 2

## Executive Summary

This design implements a 5-layer defense system preventing stub implementations from being committed:
1. Pre-commit TODO detection (bash)
2. DesignReviewer completeness validation (TypeScript)
3. ProcessCritic test-acceptance mapping (TypeScript)
4. Behavioral pattern documentation (JSON)
5. Retroactive validation test (TypeScript)

**Estimated LOC:** 320 lines across 4 files
**Complexity Justification:** High impact (prevents catastrophic quality failures), reuses existing infrastructure

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Commit Attempt                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Pre-Commit Hook (Bash)                           │
│  - TODO/FIXME/XXX/HACK detection                           │
│  - WIP branch exemption                                     │
│  - String literal filtering                                 │
│  Result: BLOCK or CONTINUE                                  │
└─────────────────────────┬───────────────────────────────────┘
                          │ (if CONTINUE)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: DesignReviewer Enhancement (TypeScript)          │
│  - Line count validation (>50 for complex tasks)           │
│  - Section presence check (Algorithm, Data Structures)      │
│  - Template content detection                               │
│  - Acceptance criteria mapping required                     │
│  Result: APPROVED or CRITICAL CONCERNS                      │
└─────────────────────────┬───────────────────────────────────┘
                          │ (if APPROVED)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: ProcessCritic Enhancement (TypeScript)           │
│  - Extract acceptance criteria from roadmap.yaml           │
│  - Parse test descriptions from plan.md                     │
│  - Calculate coverage score (keyword matching)              │
│  - Detect domain mismatch (suspicious tests)                │
│  Result: PASS (≥70%) or BLOCK (<70%)                       │
└─────────────────────────┬───────────────────────────────────┘
                          │ (if PASS)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Behavioral Pattern Registry                      │
│  - Document BP006 in behavioral_patterns.json              │
│  - Reference in agent self-enforcement guide                │
│  - Pre-execution checklist includes BP006 check             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
                    COMMIT ALLOWED
```

## Data Structures

### 1. DesignCompletenessIssues Interface
```typescript
interface DesignCompletenessIssues {
  tooShort: boolean;                    // Design < min line threshold
  missingAlgorithmSpec: boolean;        // Algorithm task without spec
  missingDataStructures: boolean;       // Implementation without types
  missingApiContracts: boolean;         // Public API without contracts
  missingAcceptanceCriteria: boolean;   // No acceptance mapping
  templateContent: boolean;             // Generic template phrases
}
```

**Purpose:** Structured representation of design completeness violations
**Usage:** Returned by `validateDesignCompleteness()`, consumed to generate critical concerns

### 2. TestCoverageScore Interface
```typescript
interface TestCoverageScore {
  score: number;              // 0.0-1.0 (percentage of criteria covered)
  unmapped: string[];         // Acceptance criteria without test coverage
  suspicious: string[];       // Tests with <30% keyword overlap
}
```

**Purpose:** Quantify test-acceptance criterion alignment
**Usage:** Returned by `calculateCoverageScore()`, used to block commits with <70% coverage

### 3. BehavioralPattern Interface
```typescript
interface BehavioralPattern {
  id: string;                 // e.g., "BP006"
  name: string;               // Human-readable name
  description: string;        // What the pattern is
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  detection: string[];        // How to detect this pattern
  prevention: string[];       // How to prevent this pattern
  examples: Array<{
    task: string;             // Task ID that exhibited pattern
    date: string;             // When it happened
    description: string;      // What went wrong
    failures: string[];       // Specific gate failures
  }>;
  remediation: string[];      // What agents should do instead
}
```

**Purpose:** Document behavioral bypasses for agent learning
**Usage:** Loaded by agents in pre-execution checklist, referenced in self-enforcement guide

## Algorithm Specification

### Algorithm 1: TODO Detection (Bash)

**Purpose:** Detect TODO/FIXME markers in production code commits

**Input:**
- Staged files from `git diff --cached`
- Current branch name

**Output:**
- BLOCK with violation list, or
- ALLOW (continue to next layer)

**Pseudocode:**
```
function detectTodoMarkers():
  branch = getCurrentBranch()

  if branch matches /^(wip/|WIP)/:
    return ALLOW  // WIP branches exempt

  stagedCode = getStagedFiles(['.ts', '.js', '.mjs'], excludeTests=true)

  violations = []
  for file in stagedCode:
    lines = gitDiff(file)
    markers = grep(lines, pattern=/TODO|FIXME|XXX|HACK|TBD/i)

    // Filter false positives
    markers = markers.filter(line => {
      return not isStringLiteral(line) and
             not isComment(line, "not a TODO")
    })

    if markers.length > 0:
      violations.add({file, markers})

  if violations.length > 0:
    print("❌ BLOCKED: TODO markers found")
    print(violations)
    print("Options: 1) Complete work, 2) Use WIP branch, 3) Create GitHub issue")
    return BLOCK

  return ALLOW
```

**Time Complexity:** O(n*m) where n=files, m=lines per file
**Space Complexity:** O(k) where k=violation count

### Algorithm 2: Design Completeness Validation (TypeScript)

**Purpose:** Validate design.md has required sections and depth

**Input:**
- design.md content
- Task context (isAlgorithmTask, isImplementationTask, estimatedLOC)

**Output:**
- DesignCompletenessIssues object

**Pseudocode:**
```
function validateDesignCompleteness(designContent, taskContext):
  lines = designContent.split('\n').filter(nonBlank, nonHeader)
  lineCount = lines.length

  issues = {
    tooShort: false,
    missingAlgorithmSpec: false,
    missingDataStructures: false,
    missingApiContracts: false,
    missingAcceptanceCriteria: false,
    templateContent: false
  }

  // Check 1: Minimum length
  if taskContext.estimatedLOC > 50 and lineCount < 50:
    issues.tooShort = true

  // Check 2: Template detection
  templatePhrases = ['based on strategy', 'design approved', 'has been evaluated']
  if containsAny(designContent, templatePhrases) and lineCount < 20:
    issues.templateContent = true

  // Check 3: Algorithm specification
  if taskContext.isAlgorithmTask:
    hasAlgorithmSection = regex(designContent, /##\s*algorithm/i)
    hasPseudocode = contains(designContent, '```') or contains(designContent, 'pseudocode')

    if not hasAlgorithmSection and not hasPseudocode:
      issues.missingAlgorithmSpec = true

  // Check 4: Data structures
  if taskContext.isImplementationTask:
    hasDataStructures = regex(designContent, /##\s*data\s*structures/i)
    hasTypes = regex(designContent, /interface|type\s+\w+|class\s+\w+/)

    if not hasDataStructures and not hasTypes:
      issues.missingDataStructures = true

  // Check 5: API contracts
  hasApiSection = regex(designContent, /##\s*api/i)
  hasPublicApi = regex(designContent, /export\s+(function|class)/)

  if hasPublicApi and not hasApiSection:
    issues.missingApiContracts = true

  // Check 6: Acceptance criteria
  hasAcceptanceMapping = regex(designContent, /##\s*acceptance\s*criteria/i)
  if not hasAcceptanceMapping and taskContext.estimatedLOC > 30:
    issues.missingAcceptanceCriteria = true

  return issues
```

**Time Complexity:** O(n) where n=design.md length
**Space Complexity:** O(1) (fixed-size issues object)

### Algorithm 3: Test-Acceptance Coverage Calculation (TypeScript)

**Purpose:** Calculate what percentage of acceptance criteria are covered by tests

**Input:**
- acceptanceCriteria: string[] from roadmap.yaml
- testDescriptions: string[] from plan.md

**Output:**
- TestCoverageScore { score, unmapped, suspicious }

**Pseudocode:**
```
function calculateCoverageScore(acceptanceCriteria, testDescriptions):
  if acceptanceCriteria.length == 0:
    return { score: 1.0, unmapped: [], suspicious: [] }

  unmapped = []
  mappedCount = 0

  // Phase 1: Check each criterion for coverage
  for criterion in acceptanceCriteria:
    keywords = extractKeywords(criterion, minLength=4)

    hasCoverage = testDescriptions.some(test => {
      return keywords.some(keyword => test.toLowerCase().includes(keyword))
    })

    if hasCoverage:
      mappedCount++
    else:
      unmapped.add(criterion)

  // Phase 2: Detect suspicious tests (domain mismatch)
  criteriaText = acceptanceCriteria.join(' ').toLowerCase()
  suspicious = []

  for test in testDescriptions:
    testKeywords = extractKeywords(test, minLength=5)
    overlap = testKeywords.filter(kw => criteriaText.includes(kw)).length
    overlapRatio = overlap / testKeywords.length

    if overlapRatio < 0.3 and testKeywords.length > 3:
      suspicious.add(test)  // Possibly testing wrong thing

  score = mappedCount / acceptanceCriteria.length
  return { score, unmapped, suspicious }
```

**Time Complexity:** O(a*t*k) where a=criteria count, t=test count, k=avg keywords
**Space Complexity:** O(a+t) for unmapped and suspicious arrays

## API Contracts

### Pre-Commit Hook API

**Function:** `detect_todo_markers()`
**Location:** `.githooks/pre-commit` (lines ~200-240)
**Input:** Staged files from git
**Output:** Exit code 0 (allow) or 1 (block)
**Side Effects:** Prints error messages to stderr

```bash
# Public interface
detect_todo_markers() {
  # Returns: 0 if OK, 1 if blocked
  # Prints: Violation details to stderr
}
```

### DesignReviewer API

**Method:** `validateDesignCompleteness(designContent: string, taskContext: TaskContext): DesignCompletenessIssues`
**Location:** `tools/wvo_mcp/src/critics/design_reviewer.ts`
**Visibility:** private (called within reviewDesign())

```typescript
private validateDesignCompleteness(
  designContent: string,
  taskContext: {
    isAlgorithmTask: boolean;
    isImplementationTask: boolean;
    estimatedLOC: number
  }
): DesignCompletenessIssues
```

### ProcessCritic API

**Method 1:** `extractAcceptanceCriteria(taskId: string): Promise<string[]>`
**Method 2:** `extractTestDescriptions(planContent: string): string[]`
**Method 3:** `calculateCoverageScore(criteria: string[], tests: string[]): TestCoverageScore`

**Location:** `tools/wvo_mcp/src/critics/process.ts`
**Visibility:** private (called within checkPlanCompleteness())

```typescript
private async extractAcceptanceCriteria(taskId: string): Promise<string[]>
private extractTestDescriptions(planContent: string): string[]
private calculateCoverageScore(
  acceptanceCriteria: string[],
  testDescriptions: string[]
): TestCoverageScore
```

## Acceptance Criteria Mapping

Mapping from spec.md requirements to design decisions:

| Spec Requirement | Design Decision | Validation |
|------------------|-----------------|------------|
| FR1: Block TODO commits | Bash regex in pre-commit hook | Unit test with TODO sample |
| FR1: Allow WIP branches | Branch name check before TODO scan | Unit test with wip/ branch |
| FR2: Block short designs | Line count check in validateDesignCompleteness() | Test with 4-line design.md |
| FR2: Block missing algorithm | Section regex for algorithm tasks | Test with algorithm task, no spec |
| FR3: Validate test coverage | calculateCoverageScore() with 70% threshold | Test with 40% coverage (should block) |
| FR3: Detect domain mismatch | Keyword overlap <30% flags suspicious | Test with GOL criteria, Wave0 tests |
| FR4: Detect build-only tests | Check for shallow patterns (loads, imports) | Test with only build validation |
| FR5: Document BP006 | JSON structure in behavioral_patterns.json | Validate JSON schema |
| NFR1: Performance <5s | Single-pass git diff, cached roadmap parse | Performance test with 100 files |
| NFR2: Actionable errors | Each block includes remediation guidance | Manual review of error messages |

## Via Negativa Analysis

**What are we NOT doing?**
1. ❌ NOT using AI/LLM for semantic analysis (too slow, too complex)
2. ❌ NOT creating new standalone tools (enhancing existing critics)
3. ❌ NOT rewriting existing tests (only validating new tests)
4. ❌ NOT blocking on infrastructure errors (YAML parse fails = warn, don't block)
5. ❌ NOT requiring perfect designs (minimum bar, not perfection)

**What are we DELETING/SIMPLIFYING?**
1. ✅ Consolidating TODO detection into existing pre-commit hook (not new script)
2. ✅ Reusing DesignReviewer concern structure (not new output format)
3. ✅ Using simple keyword matching (not NLP/semantic similarity)

## Refactor vs Repair

**This is REFACTOR, not REPAIR:**
- Root cause: Critics validate process, not outcome
- Refactor: Enhance critics to validate outcome quality
- NOT repair: Adding TODO detection doesn't fix why agents write stubs
- NOT repair: Blocking symptoms without teaching requirements understanding

**Structural improvements:**
- DesignReviewer now validates DEPTH, not just presence
- ProcessCritic now validates ALIGNMENT, not just test existence
- Behavioral patterns enable LEARNING, not just compliance

## Complexity Justification

**Added Complexity:**
- 320 LOC across 4 files
- 3 new algorithms
- New data structures for validation

**Justified Because:**
- Prevents catastrophic quality failures (AUTO-GOL-T1 style)
- 10x ROI: Prevents hours of debugging stub implementations
- Reuses existing infrastructure (pre-commit, critics)
- One-time cost, permanent protection

**Alternatives Considered:**
1. Manual review only - NOT scalable, agents work 24/7
2. AI-powered semantic validation - Too slow, too complex
3. Post-commit CI validation - Too late, already merged
4. Stricter LOC limits - Doesn't catch stubs within limits

**Selected Approach:** Multi-layered prevention (defense in depth)

## Testing Strategy

**Test File:** `tools/wvo_mcp/src/__tests__/stub_prevention.test.ts`

**Test Coverage:**
1. TODO detection with various markers
2. WIP branch exemption
3. String literal false positive handling
4. Design completeness validation (all 6 issues)
5. Test coverage calculation (various percentages)
6. Domain mismatch detection
7. **Retroactive validation against AUTO-GOL-T1** (integration test)

**Success Criteria:**
- All 7 PLAN-authored tests pass
- Retroactive test catches all 6 AUTO-GOL-T1 failures
- Performance test completes in <5 seconds
- No false positives on known-good commits

## Implementation Phases

**Phase 1: Foundation (Document BP006)**
- Create behavioral_patterns.json
- Reference in self-enforcement guide
- Provides pattern vocabulary

**Phase 2: Immediate Protection (Pre-Commit TODO Detection)**
- Fastest to implement (~40 LOC bash)
- Immediate protection against obvious stubs
- Foundation for other layers

**Phase 3: Design Quality (DesignReviewer Enhancement)**
- Catches superficial designs early
- Prevents AUTO-GOL-T1 style 4-line approvals
- ~120 LOC TypeScript

**Phase 4: Test Alignment (ProcessCritic Enhancement)**
- Catches test-requirement mismatch
- Prevents domain confusion
- ~90 LOC TypeScript

**Phase 5: Validation (Retroactive Test)**
- Proves system effectiveness
- Documents prevention capability
- ~70 LOC TypeScript test

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|-----------|
| False positives block legitimate work | Medium | High | WIP branch escape hatch, suppress annotations |
| Performance degrades with large commits | Low | Medium | Caching, single-pass git diff, timeout limits |
| Agents learn to game patterns | Medium | High | Focus on root cause (requirements understanding), iterate patterns |
| Backwards incompatibility | Low | Low | Design template versioning, grandfather old tasks |
| Critics fail on malformed YAML | Low | Medium | Try-catch, warn don't block on infrastructure errors |

## Monitoring & Metrics

**Metrics to Track:**
1. TODO detection blocks per week
2. Design completeness blocks per week
3. Test coverage blocks per week
4. False positive rate (user feedback)
5. Bypass rate (--no-verify usage)
6. Average commit time (performance)

**Success Indicators:**
- Stub implementation incidents drop to zero
- No AUTO-GOL-T1 style bypasses
- Developer satisfaction remains high
- Commit time stays <5 seconds

## AFP/SCAS Alignment

**Via Negativa Score:** 8/10
- Enhancing existing systems, not adding new tools
- Deleting possibility of stub bypasses
- Removing 6 failure modes

**Refactor Score:** 9/10
- True refactor: Fixing root cause (critics validate process not outcome)
- Not patching symptoms (blocking TODOs)
- Structural improvement (outcome-based validation)

**Complexity Score:** 6/10 (justified)
- 320 LOC is moderate complexity
- High impact justifies investment
- Reuses existing infrastructure

**Overall AFP/SCAS:** 7.7/10 (Strong alignment)

## Next Phase

Proceed to IMPLEMENT phase with confidence that design is comprehensive and will pass enhanced DesignReviewer.
