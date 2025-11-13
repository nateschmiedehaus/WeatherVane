# Plan: TODO/Stub Implementation Prevention

**Task ID:** AFP-TODO-STUB-PREVENTION-20251113
**Date:** 2025-11-13

## Implementation Approach

### Layer 1: Pre-Commit TODO Detection

**File:** `.githooks/pre-commit` (existing hook, add new check)

**Location in hook:** Add after credential leak detection, before phase validation

**Implementation:**
```bash
# Add after line ~200 (credential leak section)

echo -e "${YELLOW}🔍 Detecting TODO/FIXME markers in production code...${NC}"

# Get current branch name
BRANCH=$(git branch --show-current)

# Skip check for WIP branches
if [[ "$BRANCH" =~ ^(wip/|WIP) ]]; then
  echo -e "${GREEN}✅ WIP branch detected, skipping TODO detection${NC}"
else
  # Get staged .ts, .js, .mjs files (exclude test files)
  STAGED_CODE=$(git diff --cached --name-only --diff-filter=ACM | \
    grep -E '\.(ts|js|mjs)$' | \
    grep -v -E '(\.test\.|\.spec\.|__tests__|test/)')

  if [ -n "$STAGED_CODE" ]; then
    TODO_VIOLATIONS=""

    while IFS= read -r file; do
      # Search for TODO/FIXME/XXX/HACK markers (case-insensitive)
      # Exclude string literals and allow "Not a TODO" style comments
      MARKERS=$(git diff --cached "$file" | \
        grep -n -i -E '^\+.*//\s*(TODO|FIXME|XXX|HACK)' | \
        grep -v -i 'not a TODO' | \
        grep -v -i 'string' || true)

      if [ -n "$MARKERS" ]; then
        TODO_VIOLATIONS="$TODO_VIOLATIONS\n${file}:\n${MARKERS}"
      fi
    done <<< "$STAGED_CODE"

    if [ -n "$TODO_VIOLATIONS" ]; then
      echo -e "${RED}❌ BLOCKED: TODO/FIXME markers found in production code${NC}"
      echo -e "${TODO_VIOLATIONS}"
      echo ""
      echo -e "  ${YELLOW}Options:${NC}"
      echo -e "  1. Complete the implementation before committing"
      echo -e "  2. Use a WIP branch: git checkout -b wip/my-feature"
      echo -e "  3. Move TODOs to GitHub issues and remove from code"
      echo ""
      exit 1
    fi
  fi

  echo -e "${GREEN}✅ No TODO markers detected${NC}"
fi
```

**LOC:** ~40 lines

### Layer 2: DesignReviewer Enhancement

**File:** `tools/wvo_mcp/src/critics/design_reviewer.ts` (existing critic)

**Changes:**

1. Add new validation method `validateDesignCompleteness()`:

```typescript
// Add after existing concern detection methods

interface DesignCompletenessIssues {
  tooShort: boolean;
  missingAlgorithmSpec: boolean;
  missingDataStructures: boolean;
  missingApiContracts: boolean;
  missingAcceptanceCriteria: boolean;
  templateContent: boolean;
}

private validateDesignCompleteness(
  designContent: string,
  taskContext: { isAlgorithmTask: boolean; isImplementationTask: boolean; estimatedLOC: number }
): DesignCompletenessIssues {
  const lines = designContent.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const lineCount = lines.length;

  const issues: DesignCompletenessIssues = {
    tooShort: false,
    missingAlgorithmSpec: false,
    missingDataStructures: false,
    missingApiContracts: false,
    missingAcceptanceCriteria: false,
    templateContent: false
  };

  // Check 1: Minimum length for implementation tasks
  if (taskContext.estimatedLOC > 50 && lineCount < 50) {
    issues.tooShort = true;
  }

  // Check 2: Template content detection
  const templatePhrases = [
    'based on strategy, spec, and plan',
    'this design has been evaluated',
    'design approved with score'
  ];

  const lowerContent = designContent.toLowerCase();
  if (templatePhrases.some(phrase => lowerContent.includes(phrase)) && lineCount < 20) {
    issues.templateContent = true;
  }

  // Check 3: Algorithm specification for algorithm tasks
  if (taskContext.isAlgorithmTask) {
    const hasAlgorithmSection = /##\s*algorithm\s*(specification)?/i.test(designContent);
    const hasPseudocode = /```|pseudocode|steps?:/i.test(designContent);

    if (!hasAlgorithmSection && !hasPseudocode) {
      issues.missingAlgorithmSpec = true;
    }
  }

  // Check 4: Data structures for implementation tasks
  if (taskContext.isImplementationTask) {
    const hasDataStructures = /##\s*data\s*structures/i.test(designContent);
    const hasTypes = /interface|type\s+\w+|class\s+\w+/i.test(designContent);

    if (!hasDataStructures && !hasTypes) {
      issues.missingDataStructures = true;
    }
  }

  // Check 5: API contracts for public API changes
  const hasApiSection = /##\s*api\s*(contracts?|design)/i.test(designContent);
  const hasPublicApi = /export\s+(function|class|interface)/i.test(designContent);

  if (hasPublicApi && !hasApiSection) {
    issues.missingApiContracts = true;
  }

  // Check 6: Acceptance criteria mapping
  const hasAcceptanceMapping = /##\s*acceptance\s*criteria/i.test(designContent);
  if (!hasAcceptanceMapping && taskContext.estimatedLOC > 30) {
    issues.missingAcceptanceCriteria = true;
  }

  return issues;
}
```

2. Integrate into existing `reviewDesign()` method:

```typescript
// In reviewDesign() method, after loading design.md and before AFP scoring

const taskContext = {
  isAlgorithmTask: /algorithm|implement|calculate|compute|sort|search/i.test(taskTitle),
  isImplementationTask: estimatedLOC > 50,
  estimatedLOC
};

const completenessIssues = this.validateDesignCompleteness(designContent, taskContext);

// Add critical concerns for completeness issues
if (completenessIssues.tooShort) {
  concerns.push({
    severity: 'critical' as const,
    category: 'design_depth' as const,
    message: `Design is too short (${lines.length} lines) for ${estimatedLOC} LOC task. Provide detailed design with architecture, data structures, and acceptance criteria mapping.`,
    remediation: 'Expand design.md to at least 50 lines with concrete implementation details.'
  });
}

if (completenessIssues.templateContent) {
  concerns.push({
    severity: 'critical' as const,
    category: 'design_depth' as const,
    message: 'Design appears to be template content without actual design decisions.',
    remediation: 'Replace template phrases with actual design specification: algorithm steps, data structures, API contracts.'
  });
}

if (completenessIssues.missingAlgorithmSpec) {
  concerns.push({
    severity: 'critical' as const,
    category: 'design_depth' as const,
    message: 'Algorithm task missing algorithm specification section. Provide pseudocode or step-by-step logic.',
    remediation: 'Add "## Algorithm Specification" section with pseudocode showing how the algorithm works.'
  });
}

if (completenessIssues.missingDataStructures) {
  concerns.push({
    severity: 'major' as const,
    category: 'design_depth' as const,
    message: 'Implementation task missing data structures section.',
    remediation: 'Add "## Data Structures" section with TypeScript interfaces or class definitions.'
  });
}

if (completenessIssues.missingAcceptanceCriteria) {
  concerns.push({
    severity: 'major' as const,
    category: 'design_depth' as const,
    message: 'Design missing acceptance criteria mapping showing how it satisfies requirements.',
    remediation: 'Add "## Acceptance Criteria" section mapping design decisions to roadmap requirements.'
  });
}
```

**LOC:** ~120 lines added

### Layer 3: ProcessCritic Enhancement - Test-Acceptance Validation

**File:** `tools/wvo_mcp/src/critics/process.ts` (existing critic)

**Changes:**

1. Add helper to extract acceptance criteria from roadmap:

```typescript
// Add near top of file with other helpers

private async extractAcceptanceCriteria(taskId: string): Promise<string[]> {
  try {
    const roadmapPath = join(this.workspaceRoot, 'state/roadmap.yaml');
    const roadmapContent = await fs.readFile(roadmapPath, 'utf-8');

    // Parse YAML and find task
    const roadmap = yaml.parse(roadmapContent);
    const task = roadmap.tasks?.find((t: any) => t.id === taskId);

    if (!task || !task.acceptance) {
      return [];
    }

    // Extract acceptance criteria (array of strings)
    return Array.isArray(task.acceptance) ? task.acceptance : [];
  } catch (error) {
    // If can't load roadmap, return empty (don't block)
    return [];
  }
}

private extractTestDescriptions(planContent: string): string[] {
  // Extract test descriptions from PLAN-authored Tests section
  const testSection = planContent.match(/##\s*PLAN-authored Tests([\s\S]*?)(?=##|$)/i);
  if (!testSection) {
    return [];
  }

  const testText = testSection[1];
  const descriptions: string[] = [];

  // Extract test descriptions from bullet points
  const testLines = testText.split('\n');
  for (const line of testLines) {
    if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
      descriptions.push(line.trim().substring(1).trim());
    }
  }

  return descriptions;
}

private calculateCoverageScore(
  acceptanceCriteria: string[],
  testDescriptions: string[]
): { score: number; unmapped: string[]; suspicious: string[] } {
  if (acceptanceCriteria.length === 0) {
    // No criteria to validate, pass
    return { score: 1.0, unmapped: [], suspicious: [] };
  }

  const unmapped: string[] = [];
  let mappedCount = 0;

  // Check each criterion for keyword overlap with tests
  for (const criterion of acceptanceCriteria) {
    const criterionKeywords = criterion
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3); // Ignore short words

    const hasCoverage = testDescriptions.some(test => {
      const testLower = test.toLowerCase();
      return criterionKeywords.some(keyword => testLower.includes(keyword));
    });

    if (hasCoverage) {
      mappedCount++;
    } else {
      unmapped.push(criterion);
    }
  }

  // Detect suspicious tests (mention concepts not in criteria)
  const criteriaText = acceptanceCriteria.join(' ').toLowerCase();
  const suspicious: string[] = [];

  for (const test of testDescriptions) {
    const testKeywords = test
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4);

    const overlap = testKeywords.filter(kw => criteriaText.includes(kw)).length;
    const overlapRatio = overlap / testKeywords.length;

    // If <30% keyword overlap, possibly testing wrong thing
    if (overlapRatio < 0.3 && testKeywords.length > 3) {
      suspicious.push(test);
    }
  }

  const score = mappedCount / acceptanceCriteria.length;
  return { score, unmapped, suspicious };
}
```

2. Integrate into `checkPlanCompleteness()`:

```typescript
// In checkPlanCompleteness() after loading plan.md

if (stagedChanges.plans.length > 0) {
  for (const taskId of stagedChanges.plans) {
    const planPath = join(this.workspaceRoot, `state/evidence/${taskId}/plan.md`);
    const planContent = await fs.readFile(planPath, 'utf-8');

    // Existing test presence check...

    // NEW: Test-acceptance validation
    const acceptanceCriteria = await this.extractAcceptanceCriteria(taskId);
    if (acceptanceCriteria.length > 0) {
      const testDescriptions = this.extractTestDescriptions(planContent);
      const { score, unmapped, suspicious } = this.calculateCoverageScore(
        acceptanceCriteria,
        testDescriptions
      );

      if (score < 0.7) {
        concerns.push({
          severity: 'critical' as const,
          phase: 'PLAN' as const,
          message: `Only ${Math.round(score * 100)}% of acceptance criteria covered by tests`,
          details: `Unmapped criteria:\n${unmapped.map(c => `  - ${c}`).join('\n')}`,
          remediation: 'Add tests that validate each acceptance criterion before IMPLEMENT'
        });
      }

      if (suspicious.length > 0) {
        concerns.push({
          severity: 'major' as const,
          phase: 'PLAN' as const,
          message: 'CRITICAL: Possible task confusion detected',
          details: `Tests mention concepts not in acceptance criteria:\n${suspicious.map(s => `  - ${s}`).join('\n')}`,
          remediation: 'Verify tests validate THIS task requirements, not infrastructure/plumbing'
        });
      }
    }
  }
}
```

**LOC:** ~90 lines added

### Layer 4: Behavioral Pattern Documentation

**File:** `state/analytics/behavioral_patterns.json` (create if doesn't exist)

**Content:**
```json
{
  "patterns": [
    {
      "id": "BP001",
      "name": "Partial Phase Completion",
      "description": "Completing only some AFP phases, marking task done without all 10 phases",
      "severity": "CRITICAL"
    },
    {
      "id": "BP002",
      "name": "Template Evidence",
      "description": "Copy-paste boilerplate instead of real AI reasoning",
      "severity": "CRITICAL"
    },
    {
      "id": "BP003",
      "name": "Speed Over Quality",
      "description": "Done fast is better than done right - rushing without deep analysis",
      "severity": "CRITICAL"
    },
    {
      "id": "BP004",
      "name": "Skipping Self-Checks",
      "description": "Not performing mid-execution validation at phase boundaries",
      "severity": "HIGH"
    },
    {
      "id": "BP005",
      "name": "Claiming Without Proof",
      "description": "Trust me instead of verified evidence",
      "severity": "CRITICAL"
    },
    {
      "id": "BP006",
      "name": "Stub Implementation Bypass",
      "description": "Completing all AFP phases with TODO/stub implementation instead of actual work",
      "severity": "CRITICAL",
      "detection": [
        "Code contains TODO/FIXME/XXX/HACK comments",
        "Implementation is <30 LOC with placeholder logic",
        "Tests only validate build, not behavior",
        "Design lacks algorithm specification",
        "Task confusion (tests validate different domain)",
        "Design.md < 50 lines for >50 LOC task"
      ],
      "prevention": [
        "Pre-commit TODO detection (blocks commits)",
        "DesignReviewer blocks superficial designs (critical concern)",
        "ProcessCritic validates test-acceptance mapping (<70% = block)",
        "Test quality validator blocks build-only tests",
        "Agent self-check: 'Did I implement the actual requirement?'"
      ],
      "examples": [
        {
          "task": "AUTO-GOL-T1",
          "date": "2025-11-10",
          "description": "26-line stub with TODO comment passed all gates",
          "failures": [
            "Tests validated Wave0 plumbing instead of GOL algorithm",
            "Design.md only 4 lines, no algorithm spec",
            "Zero acceptance criteria coverage",
            "Pre-commit didn't detect TODO markers",
            "All critics passed despite no real work"
          ]
        }
      ],
      "remediation": [
        "If you find yourself writing TODO comments, STOP",
        "If your design is <50 lines for a complex task, EXPAND IT",
        "If your tests only check build success, ADD BEHAVIOR TESTS",
        "If your implementation is a stub, DO THE ACTUAL WORK",
        "Always ask: 'Would this pass if a human reviewed it?'"
      ]
    }
  ]
}
```

**LOC:** ~70 lines (JSON)

## Files to Modify

1. `.githooks/pre-commit` - Add TODO detection (~40 LOC)
2. `tools/wvo_mcp/src/critics/design_reviewer.ts` - Add completeness validation (~120 LOC)
3. `tools/wvo_mcp/src/critics/process.ts` - Add test-acceptance validation (~90 LOC)
4. `state/analytics/behavioral_patterns.json` - Document BP006 (~70 LOC)

**Total:** 4 files, ~320 LOC

## Via Negativa Analysis

Before implementing:
- ✅ Can we enhance existing critics instead of creating new ones? YES - enhancing DesignReviewer and ProcessCritic
- ✅ Can we delete ambiguous requirements? YES - will add clear section requirements to design template
- ✅ Can we simplify? YES - using keyword matching instead of AI semantic analysis

## PLAN-Authored Tests

Tests will be created during PLAN phase and must pass before IMPLEMENT.

**File:** `tools/wvo_mcp/src/__tests__/stub_prevention.test.ts`

**Tests:**

1. **Unit: TODO Detection**
   - Given code with `// TODO: implement` staged
   - When pre-commit hook runs
   - Then commit is BLOCKED with violation at specific line

2. **Unit: TODO in WIP Branch**
   - Given code with `// TODO: implement` on `wip/my-feature` branch
   - When pre-commit hook runs
   - Then commit is ALLOWED

3. **Unit: DesignReviewer Blocks Short Design**
   - Given design.md with 4 lines for 100 LOC task
   - When DesignReviewer runs
   - Then CRITICAL concern: "Design too short"

4. **Unit: DesignReviewer Blocks Missing Algorithm Spec**
   - Given algorithm task with no algorithm section
   - When DesignReviewer runs
   - Then CRITICAL concern: "Missing algorithm specification"

5. **Unit: ProcessCritic Detects Low Coverage**
   - Given 5 acceptance criteria, tests covering 2
   - When ProcessCritic calculates coverage
   - Then score = 0.4, BLOCKED (< 0.7 threshold)

6. **Unit: ProcessCritic Detects Domain Mismatch**
   - Given acceptance criteria mentioning "GOL, game_of_life"
   - And tests mentioning "WAVE0, forced_execution"
   - When ProcessCritic calculates overlap
   - Then CRITICAL: "Task confusion detected"

7. **Integration: AUTO-GOL-T1 Retroactive Detection**
   - Given AUTO-GOL-T1 evidence directory
   - When all enhanced critics run
   - Then detect all 6 failures (TODO, short design, no algorithm, low coverage, domain mismatch, build-only tests)

**Coverage:** 7 tests covering all detection layers + retroactive validation

## Testing Strategy

1. **Unit Tests:** Each detection layer tested independently
2. **Integration Test:** Run against AUTO-GOL-T1 evidence, must catch all failures
3. **Manual Validation:** Create test commit with TODO, verify block
4. **Performance Test:** Ensure all checks complete in <5 seconds

## Implementation Order

1. Document BP006 in behavioral_patterns.json (foundation)
2. Add TODO detection to pre-commit hook (immediate protection)
3. Enhance DesignReviewer (catch superficial designs)
4. Enhance ProcessCritic (catch test-acceptance mismatch)
5. Write tests (validate all layers)
6. Run retroactive test against AUTO-GOL-T1 (proof of effectiveness)

## Constraints

- Must maintain backward compatibility with existing hooks
- Must complete all checks in <5 seconds
- Must provide actionable error messages
- Must not break existing passing commits

## Next Phase

Proceed to THINK to analyze edge cases and failure modes.
