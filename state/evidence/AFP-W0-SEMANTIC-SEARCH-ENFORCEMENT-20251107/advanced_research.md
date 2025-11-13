# Advanced Research: Cutting-Edge Quality Techniques

**Task ID:** AFP-W0-SEMANTIC-SEARCH-ENFORCEMENT-20251107
**Date:** 2025-11-07
**Phase:** ADVANCED RESEARCH

---

## Executive Summary

This research incorporates cutting-edge quality enforcement techniques that complement our stigmergic + semantic search system. These techniques focus on creating **tension** between steps, forcing **real verification**, and ensuring tests **fight back** instead of rubber-stamping.

---

## 1. Chain-of-Verification (CoVe) Integration

### The Problem It Solves
Agents rush to implement without verifying assumptions, leading to "confidently wrong" outputs.

### Implementation in Our System

```typescript
// Add to each phase executor
interface VerificationPlan {
  assumptions: string[];
  invariants: string[];
  edgeCases: string[];
  verificationQuestions: string[];
  assertions: string[];
}

// In PLAN phase
const verificationPlan: VerificationPlan = {
  assumptions: ["ADR-123 still applies", "No breaking API changes"],
  invariants: ["User count never negative", "Timestamps always increasing"],
  edgeCases: ["Empty input", "Max size", "Concurrent access"],
  verificationQuestions: [
    "What if the database is down?",
    "Does this handle Unicode correctly?",
    "Can this create a race condition?"
  ],
  assertions: [
    "assert(result.length > 0)",
    "assert(timestamp > lastTimestamp)"
  ]
};

// In VERIFY phase - must answer all questions with tests
for (const question of verificationPlan.verificationQuestions) {
  const test = generateTestForQuestion(question);
  if (!test.passes()) {
    return { approved: false, reason: `Verification failed: ${question}` };
  }
}
```

### Integration Points
- **PLAN:** Generate verification questions
- **IMPLEMENT:** Convert questions to assertions
- **VERIFY:** Answer questions with actual tests
- **Enforcement:** Block if questions unanswered

---

## 2. Symmetry-Guided Adversarial Testing (SGAT)

### The Concept
Use symmetries and invariants to auto-generate counterexamples that should yield transformable outputs.

### Symmetry Types for Our Codebase

```typescript
enum SymmetryType {
  INVERTIBLE = "encode/decode, add/remove",
  IDEMPOTENT = "apply twice = apply once",
  COMMUTATIVE = "order doesn't matter",
  PERMUTATION = "shuffle preserves result",
  ROUND_TRIP = "serialize/deserialize"
}

// Symmetry test generator
class SymmetryTestGenerator {
  generateSymmetryTests(func: Function, type: SymmetryType): Test[] {
    switch(type) {
      case SymmetryType.INVERTIBLE:
        return [
          test(`${func.name} inverts correctly`, () => {
            const input = generateInput();
            const encoded = func.encode(input);
            const decoded = func.decode(encoded);
            expect(decoded).toEqual(input);
          })
        ];

      case SymmetryType.IDEMPOTENT:
        return [
          test(`${func.name} is idempotent`, () => {
            const input = generateInput();
            const once = func(input);
            const twice = func(func(input));
            expect(twice).toEqual(once);
          })
        ];
      // ... other symmetries
    }
  }
}
```

### Required Symmetries Per Phase
- **IMPLEMENT:** At least 3 symmetry tests
- **VERIFY:** All applicable symmetries tested
- **Enforcement:** Block if symmetry tests missing

---

## 3. Mutation Testing Integration

### Lightweight Mutation Strategy

```typescript
// Mutation prioritizer using LLM
class MutationPrioritizer {
  async prioritizeMutants(diff: string, spec: string): Promise<Mutant[]> {
    // Use semantic search to find likely fault spots
    const criticalPaths = await semanticSearch.find(
      "error handling, edge cases, boundary conditions",
      { in: diff }
    );

    // Generate targeted mutants (max 30 for M1 Mac)
    return generateMutants(criticalPaths, { limit: 30 });
  }
}

// In VERIFY phase
const mutants = await prioritizer.prioritizeMutants(implementDiff, spec);
const mutationScore = await runMutationTests(mutants, tests);

if (mutationScore < 0.7) {
  return {
    approved: false,
    reason: `Tests too weak: only killed ${mutationScore * 100}% of mutants`
  };
}
```

### Tools for Each Language
- **TypeScript:** Stryker with limited mutants
- **Python:** mutmut with prioritization
- **Resource limit:** Max 30 mutants per PR

---

## 4. Property-Based Testing (PBT) Requirements

### Mandatory Properties Per Component

```typescript
// Example PBT for our enforcement system
describe('Enforcement Properties', () => {
  property('enforcement is monotonic',
    fc.array(fc.record({
      wordCount: fc.nat({max: 10000}),
      duration: fc.nat({max: 180})
    })),
    (evidences) => {
      // More evidence should never reduce quality score
      const scores = evidences.map(e => enforcer.score(e));
      for (let i = 1; i < scores.length; i++) {
        if (evidences[i].wordCount >= evidences[i-1].wordCount) {
          expect(scores[i]).toBeGreaterThanOrEqual(scores[i-1]);
        }
      }
    }
  );

  property('bypass detection is consistent',
    fc.record({
      lowQuality: fc.constant(true),
      rushed: fc.constant(true)
    }),
    (context) => {
      // Same context should always produce same bypass detection
      const result1 = enforcer.detectBypass(context);
      const result2 = enforcer.detectBypass(context);
      expect(result1).toEqual(result2);
    }
  );
});
```

### PBT Requirements
- Every non-trivial module: ≥1 property test
- Properties from spec, not implementation
- Focus on invariants and boundaries

---

## 5. Multi-Agent Role Gates

### Enhanced AFP Phases with Hard Gates

```typescript
interface PhaseGate {
  requiredArtifacts: string[];
  requiredCitations: number;
  requiredTests: TestRequirements;
  blockers: string[];
}

const PHASE_GATES: Record<string, PhaseGate> = {
  PLAN: {
    requiredArtifacts: ['cited_plan.md', 'verification_plan.json'],
    requiredCitations: 5,
    requiredTests: { unit: 0, property: 1, symmetry: 2 },
    blockers: ['No ADR citations', 'Missing verification questions']
  },

  IMPLEMENT: {
    requiredArtifacts: ['implementation.ts', 'verify.sh'],
    requiredCitations: 7,
    requiredTests: { unit: 5, property: 1, symmetry: 3 },
    blockers: ['Failing verification script', 'No docstrings']
  },

  VERIFY: {
    requiredArtifacts: ['test_results.json', 'mutation_score.json'],
    requiredCitations: 3,
    requiredTests: { unit: 10, property: 2, symmetry: 5 },
    blockers: ['Mutation score < 70%', 'Symmetry failures']
  },

  REVIEW: {
    requiredArtifacts: ['review_objections.json', 'round_trip_summary.md'],
    requiredCitations: 5,
    requiredTests: { regression: 1 },
    blockers: ['Unresolved objections', 'Round-trip mismatch']
  }
};

// Enforce gates
function enforceGate(phase: string, context: PhaseContext): GateResult {
  const gate = PHASE_GATES[phase];

  for (const artifact of gate.requiredArtifacts) {
    if (!fs.existsSync(artifact)) {
      return { passed: false, blocker: `Missing ${artifact}` };
    }
  }

  if (context.citations.length < gate.requiredCitations) {
    return { passed: false, blocker: 'Insufficient citations' };
  }

  // Check all blockers
  for (const blocker of gate.blockers) {
    if (checkBlocker(blocker, context)) {
      return { passed: false, blocker };
    }
  }

  return { passed: true };
}
```

---

## 6. Live-Fire Verification

### Real Execution Requirements

```typescript
// Every implementation must include verify.sh
#!/bin/bash
# verify.sh - Live execution test

# 1. Start in isolated environment
docker run --rm -v $(pwd):/app node:18 bash -c "
  cd /app

  # 2. Install and build
  npm install
  npm run build

  # 3. Run actual execution (not just compile)
  node -e 'const m = require(\"./dist/index.js\"); m.main()'

  # 4. Run integration test
  npm run test:integration

  # 5. Check resource usage
  /usr/bin/time -v npm run test:load 2>&1 | grep 'Maximum resident'

  # 6. Run mutation tests (limited)
  npx stryker run --mutate src/core/*.ts --maxTestRunnerReuse 3
"

# Fail if any step fails
if [ $? -ne 0 ]; then
  echo "Live-fire verification FAILED"
  exit 1
fi

echo "Live-fire verification PASSED"
```

### Requirements
- Must execute code, not just import
- Must measure resources (memory, time)
- Must run limited mutations
- Must pass integration tests

---

## 7. Decision Lineage Enforcement

### ADR/Spec as Dependencies

```typescript
interface DecisionDependency {
  adrId: string;
  specId: string;
  constraint: string;
  mustCite: boolean;
}

// In semantic enforcer
async enforceDecisionLineage(
  task: Task,
  evidence: string
): Promise<boolean> {
  // Find relevant decisions
  const decisions = await semanticSearch.search(
    `ADR spec constraint for ${task.title}`,
    { types: ['adr', 'spec'], k: 10 }
  );

  // Check if cited
  const cited = decisions.filter(d =>
    evidence.includes(d.metadata.id)
  );

  if (cited.length < decisions.length * 0.5) {
    return false; // Must cite at least 50% of relevant decisions
  }

  // Check for contradictions
  for (const decision of decisions) {
    if (contradictsDecision(evidence, decision)) {
      return false;
    }
  }

  return true;
}
```

---

## 8. CI/CD Quality Gates

### Complete Gate Pipeline

```yaml
# .github/workflows/quality-gates.yml
name: Quality Enforcement

on: [pull_request]

jobs:
  quality-gates:
    runs-on: ubuntu-latest
    steps:
      # 1. Semantic Index Update
      - name: Update Semantic Index
        run: |
          npm run index:diff -- ${{ github.event.pull_request.base.sha }}

      # 2. Chain of Verification
      - name: Check Verification Plan
        run: |
          npm run check:verification-plan
          test -f verification_plan.json || exit 1

      # 3. Unit + Property Tests
      - name: Run Tests
        run: |
          npm test -- --coverage
          npm run test:properties

      # 4. Symmetry Tests
      - name: Run Symmetry Pack
        run: |
          npm run test:symmetry -- --min 5

      # 5. Mutation Testing
      - name: Run Mutation Tests
        run: |
          npm run mutation:test -- --budget 30
          mutation_score=$(cat mutation_report.json | jq .score)
          [ "$mutation_score" -ge "0.7" ] || exit 1

      # 6. Live-Fire Verification
      - name: Live Execution Test
        run: |
          bash verify.sh

      # 7. Security + Linting
      - name: Static Analysis
        run: |
          npm run lint
          npm run security:check

      # 8. Round-Trip Review
      - name: Round-Trip Verification
        run: |
          npm run review:round-trip
          test -f round_trip_summary.md || exit 1

      # 9. Check Citations
      - name: Verify Citations
        run: |
          citations=$(cat evidence/*.md | grep -c '\[ADR\|SPEC\|TEST\]')
          [ "$citations" -ge "5" ] || exit 1

      # 10. Final Gate Decision
      - name: Quality Gate Decision
        run: |
          npm run gate:decide
```

---

## 9. Metrics That Matter

### Quality Metrics to Track

```typescript
interface QualityMetrics {
  // Per PR
  mutationScore: number;        // Target: >0.7
  symmetryTestCount: number;     // Target: >5
  propertyTestCount: number;     // Target: >2
  citationCount: number;         // Target: >5
  verificationQuestions: number; // Target: >3
  reviewerObjections: number;    // Target: 0 after loop

  // Per Epic
  defectEscapeRate: number;      // Target: <0.1
  retrievalPrecision: number;    // Target: >0.8
  roundTripAccuracy: number;     // Target: >0.9

  // System Health
  avgEnforcementTime: number;    // Target: <2s
  falsePositiveRate: number;     // Target: <0.05
  bypassDetectionRate: number;   // Target: >0.95
}

// Track in telemetry
async function recordQualityMetrics(
  taskId: string,
  metrics: QualityMetrics
): Promise<void> {
  await telemetry.record('quality_metrics', {
    taskId,
    timestamp: Date.now(),
    ...metrics
  });

  // Alert if below thresholds
  if (metrics.mutationScore < 0.7) {
    await alert('Low mutation score', { taskId, score: metrics.mutationScore });
  }
}
```

---

## 10. Integration with Our System

### How This Enhances Our Quality Control

1. **Stigmergic (L1-L4):** Reactive bypass detection ✓
2. **Semantic (L5-L6):** Proactive context retrieval ✓
3. **Verification (L7):** CoVe questions → tests
4. **Symmetry (L8):** SGAT adversarial testing
5. **Mutation (L9):** Test strength validation
6. **Property (L10):** Invariant verification

### Combined Enforcement Stack

```typescript
async function enforceQuality(
  task: Task,
  phase: string,
  context: PhaseContext
): Promise<QualityResult> {
  // Layer 1-4: Stigmergic
  const stigmergicResult = await stigmergicEnforcer.enforce(task, phase, context);

  // Layer 5-6: Semantic
  const semanticResult = await semanticEnforcer.enforce(task, phase, context);

  // Layer 7: Verification
  const verificationResult = await enforceVerificationPlan(task, phase, context);

  // Layer 8: Symmetry
  const symmetryResult = await enforceSymmetryTests(task, phase, context);

  // Layer 9: Mutation
  const mutationResult = await enforceMutationScore(task, phase, context);

  // Layer 10: Property
  const propertyResult = await enforcePropertyTests(task, phase, context);

  // Aggregate decision
  return {
    approved: all([
      stigmergicResult.approved,
      semanticResult.approved,
      verificationResult.passed,
      symmetryResult.passed,
      mutationResult.passed,
      propertyResult.passed
    ]),
    layers: { /* all results */ },
    metrics: calculateMetrics(/* all results */)
  };
}
```

---

## Conclusion

These cutting-edge techniques address our exact pain points:

1. **"Agents write tests to pass"** → Mutation testing + SGAT ensures tests fight back
2. **"No tension between steps"** → CoVe + role gates create mandatory verification
3. **"Coherence across project"** → Decision lineage + semantic impact sets
4. **"Live-fire > compile"** → verify.sh + resource monitoring

The combination of our stigmergic enforcement, semantic search, and these advanced techniques creates a **10-layer quality control system** that is both comprehensive and practical for M1 Mac deployment.

**Next Step:** Implement CoVe verification questions in our AFP phases.