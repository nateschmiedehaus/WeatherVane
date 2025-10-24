#!/usr/bin/env python3
"""
Fix all task descriptions to be thorough and specific
"""

import yaml
from pathlib import Path

roadmap_path = Path('/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/state/roadmap.yaml')

# Read roadmap
with open(roadmap_path, 'r') as f:
    roadmap = yaml.safe_load(f)

updates = []

# Specific task descriptions templates
TASK_DESCRIPTIONS = {
    'REMEDIATION-ALL-MCP-SERVER': """
AUDIT all MCP server code for quality issues.

**WHAT TO AUDIT**:
- tools/wvo_mcp/src/orchestrator/*.ts (UnifiedOrchestrator, QualityGateOrchestrator, etc.)
- tools/wvo_mcp/src/model_router/*.ts (ModelRouter, capacity tracking)
- tools/wvo_mcp/src/state/*.ts (StateMachine, RoadmapTracker)
- tools/wvo_mcp/src/telemetry/*.ts (logging, metrics)
- tools/wvo_mcp/src/critics/*.ts (critic implementations)

**VERIFICATION STEPS**:
1. Run build: cd tools/wvo_mcp && npm run build (must show 0 errors)
2. Run tests: npm test (must show ALL passing, currently 985+)
3. Run audit: npm audit (must show 0 vulnerabilities)
4. Check test coverage: npm run test:coverage (target: 80%+ on new code)
5. Run adversarial detector on ALL modules
6. Verify runtime: Start orchestrator and let it run 1 task end-to-end
7. Check decision log: state/analytics/quality_gate_decisions.jsonl has real decisions

**EXIT CRITERIA**:
- Build: 0 errors ✅
- Tests: ALL passing (985/985 or more)
- Audit: 0 vulnerabilities ✅
- Coverage: 80%+ on orchestrator code
- Adversarial detector: APPROVED
- Runtime evidence: Screenshot/logs of orchestrator running task
- Decision log: Contains real decisions from real autopilot run (not just demos)
""",

    'REMEDIATION-ALL-TESTING-INFRASTRUCTURE': """
VERIFY testing infrastructure actually works and tests are meaningful.

**WHAT TO VERIFY**:
- Test quality (not just passing, but testing the right things)
- Test coverage (is critical code actually tested?)
- Test assertions (are tests checking real behavior or just running code?)
- Integration tests (do they test actual integration or just mocks?)
- Runtime tests (do critical systems have end-to-end runtime tests?)

**AUDIT FOCUS**:
1. Review test files in tools/wvo_mcp/src/**/*.test.ts
2. Check for superficial tests (tests that pass but don't verify behavior)
3. Verify adversarial_bullshit_detector tests are comprehensive
4. Verify quality_gate_orchestrator tests cover all 5 gates
5. Check integration tests actually run orchestrator end-to-end
6. Verify tests fail when code is broken (test with intentional bugs)

**SPECIFIC CHECKS**:
- adversarial_bullshit_detector.test.ts: 15+ tests covering all 6 detection categories
- quality_gate_orchestrator.test.ts: Tests for all 5 gates + consensus decision
- unified_orchestrator.test.ts: End-to-end task execution tests
- domain_expert_reviewer.test.ts: Multi-domain review tests with real prompts
- state_machine.test.ts: State transitions and concurrent access tests

**VERIFICATION STEPS**:
1. Run all tests: npm test (must pass)
2. Check test coverage: npm run test:coverage (show coverage report)
3. Intentionally break a critical function, verify tests FAIL
4. Fix the break, verify tests PASS again
5. Review test assertions: Are they checking behavior or just running code?
6. Add missing tests for untested critical code

**EXIT CRITERIA**:
- All tests passing (985+)
- Test coverage report generated
- Critical code has 80%+ coverage
- Tests demonstrate they catch real bugs (tested by breaking code)
- No superficial tests (all tests verify behavior)
- Integration tests run orchestrator end-to-end
""",

    'REMEDIATION-ALL-QUALITY-GATES-DOGFOOD': """
INTEGRATE multi-domain genius-level reviews as GATE 5 in quality gate orchestrator.

Transform quality gates from checkbox thinking to expert-level domain analysis.

**WHAT TO BUILD**:
1. Import DomainExpertReviewer into quality_gate_orchestrator.ts
2. Add GATE 5: Multi-domain expert review (after GATE 4: Peer review)
3. Update QualityGateDecision interface to include domainExpert review results
4. Extend makeConsensusDecision() to check domain expert approval
5. Update TaskEvidence interface to include title + description (needed for domain identification)

**IMPLEMENTATION STEPS**:
1. Add import: DomainExpertReviewer, MultiDomainReview, ModelRouter
2. Instantiate DomainExpertReviewer in constructor with stub ModelRouter
3. In verifyTaskCompletion(), add GATE 5 execution after peer review
4. Call domainExpertReviewer.reviewTaskWithMultipleDomains(evidence)
5. Update consensus decision to reject if ANY domain expert rejects
6. Add domain expert summary to final reasoning

**INTEGRATION POINTS**:
- quality_gate_orchestrator.ts:20-25: Import statements
- quality_gate_orchestrator.ts:71: Update QualityGateDecision interface
- quality_gate_orchestrator.ts:105: Instantiate DomainExpertReviewer
- quality_gate_orchestrator.ts:255-258: Execute GATE 5
- quality_gate_orchestrator.ts:397-421: Update consensus decision

**VERIFICATION**:
- Build: 0 errors
- Tests: ALL passing (985+)
- Audit: 0 vulnerabilities
- Integration test: Quality gates execute all 5 gates in sequence
- Domain expert reviews appear in decision logs
- Tasks rejected when domain experts find issues

**EXIT CRITERIA**:
- ✅ GATE 5 integrated and executing
- ✅ Build: 0 errors
- ✅ Tests: 985/985 passing
- ✅ Audit: 0 vulnerabilities
- ✅ Domain expert reviews in logs (3+ experts per task)
- ✅ Evidence document created showing integration points
""",
}

def make_description_thorough(task_id, current_description, title):
    """Make a task description thorough and specific"""

    # Check if we have a specific template
    if task_id in TASK_DESCRIPTIONS:
        return TASK_DESCRIPTIONS[task_id].strip()

    # For REM-* tasks (individual remediation)
    if task_id.startswith('REM-'):
        original_task = task_id.replace('REM-', '')
        return f"""
VERIFY task {original_task} was completed correctly.

**VERIFICATION STEPS**:
1. Locate implementation files for task {original_task}
2. Check if code exists and matches documentation
3. Run build: npm run build or python build script (must pass)
4. Run tests: npm test or pytest (must pass)
5. Run end-to-end: Actually execute the feature with real data
6. Check documentation: Does it match actual implementation?
7. Run adversarial detector: Check for superficial completion

**WHAT TO CHECK**:
- Code exists and is not empty/stub
- Tests exist and are meaningful (not just running code)
- Documentation matches implementation (no feature claims without code)
- Runtime evidence: Feature actually works end-to-end
- No TODO/FIXME comments indicating incomplete work
- No commented-out critical code
- No empty catch blocks hiding errors

**EXIT CRITERIA**:
- Build passes with 0 errors
- Tests pass (100%)
- Audit: 0 vulnerabilities
- Runtime evidence provided (screenshot/logs showing feature working)
- Documentation matches code
- Adversarial detector: APPROVED
- No critical issues found
""".strip()

    # For other tasks, keep existing but warn
    if not current_description or len(current_description) < 200:
        print(f"⚠️  WARNING: Task {task_id} has short/missing description")
        print(f"   Title: {title}")
        print(f"   Description length: {len(current_description or '')}")

    return current_description


# Update all tasks
for epic in roadmap['epics']:
    for milestone in epic.get('milestones', []):
        for task in milestone.get('tasks', []):
            task_id = task.get('id', 'UNKNOWN')
            title = task.get('title', '')
            current_desc = task.get('description', '')

            new_desc = make_description_thorough(task_id, current_desc, title)

            if new_desc != current_desc:
                task['description'] = new_desc
                updates.append({
                    'task_id': task_id,
                    'title': title,
                    'old_length': len(current_desc or ''),
                    'new_length': len(new_desc or ''),
                })
                print(f"✓ Updated {task_id}: {len(current_desc or '')} → {len(new_desc or '')} chars")

# Write back
with open(roadmap_path, 'w') as f:
    yaml.dump(roadmap, f, default_flow_style=False, allow_unicode=True, width=120)

print(f"\n✅ Updated {len(updates)} task descriptions")
print(f"✅ Roadmap updated: {roadmap_path}")

if updates:
    print("\nUpdated tasks:")
    for u in updates[:10]:  # Show first 10
        print(f"  {u['task_id']}: {u['old_length']} → {u['new_length']} chars")
    if len(updates) > 10:
        print(f"  ... and {len(updates) - 10} more")
