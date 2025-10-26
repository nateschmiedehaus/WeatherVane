/**
 * Integration tests for Quality Gate System
 *
 * These tests verify that quality gates are ACTUALLY USED by autopilot,
 * not just that they work in isolation.
 *
 * CRITICAL: These tests fail if quality gates are not integrated into
 * the task execution flow.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { QualityGateOrchestrator } from './quality_gate_orchestrator.js';
import type { TaskEvidence } from './adversarial_bullshit_detector.js';
import { Verifier, type ToolRunner } from './verifier.js';
import type { TaskEnvelope } from './task_envelope.js';
import type { PlannerAgent } from './planner_agent.js';
import type { ThinkerAgent } from './thinker_agent.js';
import type { ImplementerAgent } from './implementer_agent.js';
import type { ReviewerAgent } from './reviewer_agent.js';
import type { CriticalAgent } from './critical_agent.js';
import type { SupervisorAgent } from './supervisor.js';
import type { ModelRouter } from './model_router.js';
import type { DecisionJournal } from '../memory/decision_journal.js';
import type { RunEphemeralMemory } from '../memory/run_ephemeral.js';
import type { ContextAssembler } from '../context/context_assembler.js';
import { IncidentReporter } from './incident_reporter.js';
import { ComplexityRouter } from './complexity_router.js';
import { StateGraph } from './state_graph.js';
import type { StateGraphDependencies } from './state_graph.js';
import * as specifyRunner from './state_runners/specify_runner.js';
import * as planRunner from './state_runners/plan_runner.js';
import * as implementRunner from './state_runners/implement_runner.js';
import * as verifyRunner from './state_runners/verify_runner.js';
import * as reviewRunner from './state_runners/review_runner.js';
import * as prRunner from './state_runners/pr_runner.js';
import * as monitorRunner from './state_runners/monitor_runner.js';

describe('Quality Gate Integration Tests', () => {
  let testWorkspace: string;
  let decisionLogPath: string;

  beforeEach(async () => {
    testWorkspace = path.join(process.cwd(), 'test-workspace-integration');
    await fs.mkdir(testWorkspace, { recursive: true });
    await fs.mkdir(path.join(testWorkspace, 'state/analytics'), { recursive: true });

    decisionLogPath = path.join(testWorkspace, 'state/analytics/quality_gate_decisions.jsonl');

    // Create config
    await fs.writeFile(
      path.join(testWorkspace, 'state/quality_gates.yaml'),
      `quality_gates:
  automated:
    build_required: true
    tests_required: true
    audit_required: true
    no_exceptions: true
  post_task:
    required_reviewers: ["automated", "orchestrator", "adversarial"]
    consensus_rule: "unanimous"
`
    );
  });

describe('Verifier gate enforcement', () => {
  const baseTask: TaskEnvelope = {
    id: 'TASK-VRF',
    title: 'Verifier enforcement task',
  };

  it('blocks transitions when a required gate fails', async () => {
    const failingRunner: ToolRunner = {
      async run(toolName: string) {
        const success = toolName !== 'tests.run';
        return {
          success,
          output: `${toolName} ${success ? 'ok' : 'failed'}`,
        };
      },
    };
    const verifier = new Verifier(0.05, failingRunner);
    const result = await verifier.verify({
      task: baseTask,
      patchHash: 'abc123',
      coverageHint: 0.2,
      coverageTarget: 0.05,
    });
    expect(result.success).toBe(false);
    expect(result.gateResults.some((gate) => !gate.success && gate.name === 'tests.run')).toBe(true);
  });

  it('blocks transitions when coverage delta is below target', async () => {
    const verifier = new Verifier(0.05);
    const result = await verifier.verify({
      task: baseTask,
      patchHash: 'def456',
      coverageHint: 0.01,
      coverageTarget: 0.05,
    });
    expect(result.success).toBe(false);
    expect(result.coverageDelta).toBeLessThan(result.coverageTarget);
  });
});

  afterEach(async () => {
    await fs.rm(testWorkspace, { recursive: true, force: true });
  });

  describe('CRITICAL: Verify Quality Gates Are Actually Called', () => {
    const cwd = process.cwd();
    const repoRoot = cwd.endsWith(`${path.sep}tools${path.sep}wvo_mcp`)
      ? path.resolve(cwd, '..', '..')
      : cwd;
    const orchestratorPath = path.join(
      repoRoot,
      'tools',
      'wvo_mcp',
      'src',
      'orchestrator',
      'unified_orchestrator.ts'
    );

    it('should fail if QualityGateOrchestrator is not imported by unified_orchestrator', async () => {
      // This test MUST fail if quality gates are not integrated
      const content = await fs.readFile(orchestratorPath, 'utf-8');

      // Check for import
      const hasImport = content.includes('QualityGateOrchestrator') ||
                       content.includes('quality_gate_orchestrator');

      expect(hasImport).toBe(true);
      expect(hasImport,
        '❌ CRITICAL: unified_orchestrator.ts does not import QualityGateOrchestrator. Quality gates are NOT integrated!'
      ).toBe(true);
    });

    it('should fail if unified_orchestrator does not instantiate QualityGateOrchestrator', async () => {
      const content = await fs.readFile(orchestratorPath, 'utf-8');

      // Check for instantiation
      const hasInstantiation = content.includes('new QualityGateOrchestrator') ||
                               content.includes('qualityGate') ||
                               content.includes('qualityOrchestrator');

      expect(hasInstantiation,
        '❌ CRITICAL: unified_orchestrator does not create QualityGateOrchestrator instance. Quality gates are NOT integrated!'
      ).toBe(true);
    });

    it('should fail if task completion does not call quality gate verification', async () => {
      const content = await fs.readFile(orchestratorPath, 'utf-8');

      // Check for verification call in task completion flow
      const hasVerificationCall = content.includes('verifyTaskCompletion') ||
                                  content.includes('qualityGate.verify') ||
                                  content.includes('runQualityGates');

      expect(hasVerificationCall,
        '❌ CRITICAL: Task completion does not call quality gate verification. Tasks can be marked done without verification!'
      ).toBe(true);
    });

    it('should fail if pre-task review is not called before task execution', async () => {
      const content = await fs.readFile(orchestratorPath, 'utf-8');

      // Check for pre-task review
      const hasPreTaskReview = content.includes('reviewTaskPlan') ||
                              content.includes('preTaskReview') ||
                              content.includes('qualityGate.review');

      expect(hasPreTaskReview,
        '❌ CRITICAL: Pre-task review is not called. Tasks start without quality gate approval!'
      ).toBe(true);
    });
  });

  describe('CRITICAL: Verify Decision Logging Actually Happens', () => {
    it('should fail if decision log directory is not created during autopilot startup', async () => {
      // This simulates what should happen when autopilot starts
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
        runtimeEvidence: [{ type: 'screenshot', path: 'evidence/screenshot.png' }],
      };

      // Create evidence
      await fs.mkdir(path.join(testWorkspace, 'evidence'), { recursive: true });
      await fs.writeFile(path.join(testWorkspace, 'evidence/screenshot.png'), 'fake');
      await fs.writeFile(path.join(testWorkspace, 'feature.ts'), 'export function test() {}');
      await fs.writeFile(path.join(testWorkspace, 'feature.test.ts'), 'test("works", () => {})');

      // Run verification
      await orchestrator.verifyTaskCompletion('T1', evidence);

      // Check decision log exists
      const logExists = await fs.access(decisionLogPath).then(() => true).catch(() => false);
      expect(logExists,
        '❌ CRITICAL: Decision log does not exist after verification. No transparency!'
      ).toBe(true);

      // Check log has content
      const logContent = await fs.readFile(decisionLogPath, 'utf-8');
      const entries = logContent.trim().split('\n').filter(Boolean);
      expect(entries.length,
        '❌ CRITICAL: Decision log is empty. No decisions are being recorded!'
      ).toBeGreaterThan(0);
    });

    it('should fail if decisions are not logged with complete information', async () => {
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      const evidence: TaskEvidence = {
        taskId: 'T-test',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      await orchestrator.verifyTaskCompletion('T-test', evidence);

      // Read and parse decision
      const logContent = await fs.readFile(decisionLogPath, 'utf-8');
      const decision = JSON.parse(logContent.trim().split('\n')[0]);

      // Verify complete decision structure
      expect(decision.taskId).toBe('T-test');
      expect(decision.decision).toBeDefined();
      expect(decision.timestamp).toBeDefined();
      expect(decision.reviews).toBeDefined();
      expect(decision.reviews.automated).toBeDefined();
      expect(decision.reviews.orchestrator).toBeDefined();
      expect(decision.reviews.adversarial).toBeDefined();
      expect(decision.finalReasoning).toBeDefined();
      expect(decision.consensusReached).toBeDefined();

      expect(decision.reviews.automated,
        '❌ CRITICAL: Automated review not recorded in decision'
      ).toBeDefined();
      expect(decision.reviews.orchestrator,
        '❌ CRITICAL: Orchestrator review not recorded in decision'
      ).toBeDefined();
      expect(decision.reviews.adversarial,
        '❌ CRITICAL: Adversarial review not recorded in decision'
      ).toBeDefined();
    });
  });

  describe('CRITICAL: Verify Tasks Cannot Bypass Quality Gates', () => {
    it('should fail if build errors do not block task completion', async () => {
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      const evidence: TaskEvidence = {
        taskId: 'T-broken',
        buildOutput: 'error TS2304: Cannot find name "Foo"\\nCompilation failed',
        testOutput: '✓ Tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T-broken', evidence);

      expect(decision.decision).toBe('REJECTED');
      expect(decision.decision,
        '❌ CRITICAL: Task with build errors was not rejected! Quality gates can be bypassed!'
      ).toBe('REJECTED');
    });

    it('should fail if test failures do not block task completion', async () => {
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      const evidence: TaskEvidence = {
        taskId: 'T-failing-tests',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: 'FAIL src/feature.test.ts\\n  ✗ should work\\n\\n5 failed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T-failing-tests', evidence);

      expect(decision.decision).toBe('REJECTED');
      expect(decision.decision,
        '❌ CRITICAL: Task with test failures was not rejected! Quality gates can be bypassed!'
      ).toBe('REJECTED');
    });

    it('should fail if missing runtime evidence does not block task completion', async () => {
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      const evidence: TaskEvidence = {
        taskId: 'T-no-evidence',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
        // NO runtime evidence
      };

      const decision = await orchestrator.verifyTaskCompletion('T-no-evidence', evidence);

      expect(decision.decision).toBe('REJECTED');
      expect(decision.decision,
        '❌ CRITICAL: Task without runtime evidence was not rejected! Verification loop can be bypassed!'
      ).toBe('REJECTED');
    });

    it('should fail if config allows bypassing automated checks', async () => {
      // Create config with no_exceptions: false (dangerous!)
      await fs.writeFile(
        path.join(testWorkspace, 'state/quality_gates.yaml'),
        `quality_gates:
  automated:
    build_required: true
    tests_required: true
    audit_required: true
    no_exceptions: false  # DANGEROUS!
  post_task:
    required_reviewers: ["automated"]
    consensus_rule: "unanimous"
`
      );

      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      const evidence: TaskEvidence = {
        taskId: 'T-bypass-attempt',
        buildOutput: 'error TS2304: Build failed',
        testOutput: 'Tests failed',
        changedFiles: ['feature.ts'],
        testFiles: [],
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T-bypass-attempt', evidence);

      // Should still reject (but might not with no_exceptions: false)
      expect(decision.decision,
        '⚠️ WARNING: Config allows exceptions. Quality gates are not enforced!'
      ).toBe('REJECTED');
    });
  });

  describe('CRITICAL: Verify Adversarial Detector Integration', () => {
    it('should fail if adversarial detector is not invoked during verification', async () => {
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      // Create fake evidence that should trigger bullshit detection
      await fs.writeFile(path.join(testWorkspace, 'README.md'), 'Use `fakeFunction()` to process');
      // Don't create the function - should trigger documentation-code mismatch

      const evidence: TaskEvidence = {
        taskId: 'T-fake-docs',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: ['README.md'],
      };

      await fs.writeFile(path.join(testWorkspace, 'feature.ts'), 'export function other() {}');
      await fs.writeFile(path.join(testWorkspace, 'feature.test.ts'), 'test("ok", () => {})');

      const decision = await orchestrator.verifyTaskCompletion('T-fake-docs', evidence);

      // Check that adversarial review ran
      expect(decision.reviews.adversarial).toBeDefined();
      expect(decision.reviews.adversarial,
        '❌ CRITICAL: Adversarial detector was not invoked! Bullshit can slip through!'
      ).toBeDefined();

      // Check that decision log includes adversarial findings
      const logContent = await fs.readFile(decisionLogPath, 'utf-8');
      const loggedDecision = JSON.parse(logContent.trim().split('\n').slice(-1)[0]);
      expect(loggedDecision.reviews.adversarial,
        '❌ CRITICAL: Adversarial review not logged in decision!'
      ).toBeDefined();
    });

    it('should fail if superficial completion is not detected', async () => {
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      // Create empty data file - classic superficial completion
      await fs.writeFile(path.join(testWorkspace, 'metrics.json'), '{}');

      const evidence: TaskEvidence = {
        taskId: 'T-empty-metrics',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 5 tests passed',
        changedFiles: ['metrics.json'],
        testFiles: ['metrics.test.ts'],
        documentation: [],
      };

      await fs.writeFile(path.join(testWorkspace, 'metrics.test.ts'), 'test("ok", () => {})');

      const decision = await orchestrator.verifyTaskCompletion('T-empty-metrics', evidence);

      // Should detect superficial completion
      const superficialDetection = decision.reviews.adversarial?.report?.detections?.find(
        d => d.category === 'superficial_completion'
      );

      expect(superficialDetection,
        '❌ CRITICAL: Superficial completion (empty data file) was not detected!'
      ).toBeDefined();
    });
  });

  describe('CRITICAL: Verify Unanimous Consensus Is Enforced', () => {
    it('should fail if any single gate can be ignored', async () => {
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      const evidence: TaskEvidence = {
        taskId: 'T-mixed-results',
        buildOutput: 'Compiled successfully. 0 errors.',  // Automated: PASS
        testOutput: '✓ 10 tests passed',                  // Automated: PASS
        changedFiles: ['feature.ts'],
        testFiles: [],  // Orchestrator will REJECT: no test files
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T-mixed-results', evidence);

      // Unanimous consensus means ONE rejection = task rejected
      expect(decision.decision).toBe('REJECTED');
      expect(decision.decision,
        '❌ CRITICAL: Task passed despite orchestrator rejection! Unanimous consensus not enforced!'
      ).toBe('REJECTED');
    });

    it('should fail if consensus can be overridden', async () => {
      // This tests that the config cannot weaken consensus
      await fs.writeFile(
        path.join(testWorkspace, 'state/quality_gates.yaml'),
        `quality_gates:
  automated:
    build_required: true
    tests_required: true
    audit_required: true
    no_exceptions: true
  post_task:
    required_reviewers: ["automated", "orchestrator", "adversarial"]
    consensus_rule: "majority"  # Weaker than unanimous!
`
      );

      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      const evidence: TaskEvidence = {
        taskId: 'T-majority',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: [],  // Will fail orchestrator
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T-majority', evidence);

      // Even with "majority" rule, should still reject with blockers
      expect(decision.decision,
        '⚠️ WARNING: Majority consensus is weaker than unanimous. Should use unanimous!'
      ).toBe('REJECTED');
    });
  });

  describe('CRITICAL: Verify Pre-Task Questionnaire Prevents Bad Work', () => {
    it('should fail if tasks can start without answering pre-task questions', async () => {
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      // Try to review task plan with missing required answers
      const review = await orchestrator.reviewTaskPlan('T-incomplete', {
        title: 'Implement feature',
        description: 'Add new feature',
        filesAffected: ['feature.ts'],
        estimatedComplexity: 'medium',
        answers: {
          // Missing verification_plan
          // Missing rollback_plan
        },
      });

      expect(review.approved).toBe(false);
      expect(review.approved,
        '❌ CRITICAL: Task approved without required pre-task answers! Pre-task review can be bypassed!'
      ).toBe(false);
    });

    it('should fail if task can proceed despite pre-task rejection', async () => {
      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      const review = await orchestrator.reviewTaskPlan('T-rejected', {
        title: 'Risky change',
        description: 'Make risky change',
        filesAffected: ['critical.ts'],
        estimatedComplexity: 'complex',
        answers: {
          verification_plan: 'manual testing only',  // Should trigger concern
          rollback_plan: 'none',  // Should trigger rejection
        },
      });

      expect(review.approved).toBe(false);
      expect(review.concerns.length).toBeGreaterThan(0);

      // In real autopilot, this task should NOT execute
      // This test documents the expected behavior
      expect(review.reasoning,
        '❌ CRITICAL: Pre-task review rejected, but no mechanism prevents task execution!'
      ).toContain('concerns');
    });
  });

  describe('End-to-End Integration Test', () => {
    it('should document the complete quality gate flow that MUST exist', async () => {
      /**
       * This test documents what the complete integration MUST look like.
       * If any step is missing, the quality gate system is not fully integrated.
       */

      const orchestrator = new QualityGateOrchestrator(testWorkspace);

      // STEP 1: Pre-task review (before task starts)
      const preReview = await orchestrator.reviewTaskPlan('T-complete', {
        title: 'Complete flow test',
        description: 'Test complete flow',
        filesAffected: ['feature.ts', 'feature.test.ts'],
        estimatedComplexity: 'medium',
        answers: {
          verification_plan: 'npm run build && npm test',
          rollback_plan: 'git revert',
          integration_surface: 'API endpoints, database schema',
          affected_tests: 'feature.test.ts, integration.test.ts',
        },
      });

      // Should approve good plan
      expect(preReview.approved).toBe(true);

      // STEP 2: Task execution (simulated - would happen in worker)
      // ... worker does the work ...

      // STEP 3: Post-task verification (after task completes)
      await fs.writeFile(path.join(testWorkspace, 'feature.ts'), 'export function process() { return true; }');
      await fs.writeFile(path.join(testWorkspace, 'feature.test.ts'), 'test("works", () => expect(process()).toBe(true))');
      await fs.mkdir(path.join(testWorkspace, 'evidence'), { recursive: true });
      await fs.writeFile(path.join(testWorkspace, 'evidence/screenshot.png'), 'evidence data');

      const evidence: TaskEvidence = {
        taskId: 'T-complete',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ feature.test.ts (1 test) 5ms\\n\\nTest Files  1 passed (1)',
        changedFiles: ['feature.ts', 'feature.test.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
        runtimeEvidence: [{ type: 'screenshot', path: 'evidence/screenshot.png' }],
      };

      const postReview = await orchestrator.verifyTaskCompletion('T-complete', evidence);

      // STEP 4: Verify decision
      expect(postReview.decision).toBe('APPROVED');
      expect(postReview.reviews.automated?.passed).toBe(true);
      expect(postReview.reviews.orchestrator?.approved).toBe(true);
      expect(postReview.reviews.adversarial?.passed).toBe(true);

      // STEP 5: Verify decision logged
      const logContent = await fs.readFile(decisionLogPath, 'utf-8');
      const decisions = logContent.trim().split('\n').map(line => JSON.parse(line));

      const preTaskDecision = decisions.find(d => d.taskId === 'T-complete' && d.reviews.orchestrator && !d.reviews.adversarial);
      const postTaskDecision = decisions.find(d => d.taskId === 'T-complete' && d.reviews.adversarial);

      expect(preTaskDecision, '❌ CRITICAL: Pre-task decision not logged').toBeDefined();
      expect(postTaskDecision, '❌ CRITICAL: Post-task decision not logged').toBeDefined();

      // Document what unified_orchestrator MUST do
      const requiredIntegrationSteps = `
        unified_orchestrator.ts MUST:
        1. Import QualityGateOrchestrator
        2. Instantiate it during constructor
        3. Call reviewTaskPlan() BEFORE starting task execution
        4. Block task execution if pre-review rejected
        5. Call verifyTaskCompletion() AFTER task completes
        6. Mark task "done" ONLY if verification approved
        7. Create remediation task if verification rejected
        8. Log all decisions to quality_gate_decisions.jsonl
        9. Make quality gates MANDATORY (no bypass mechanism)
        10. Enforce unanimous consensus (all gates must pass)
      `;

      expect(requiredIntegrationSteps).toBeDefined();
    });
  });

  describe('Resolution + incident integration', () => {
    const pipelineTask: TaskEnvelope = {
      id: 'TASK-PIPELINE',
      title: 'Quality gate pipeline regression',
      priorityTags: ['p1'],
      metadata: {
        files: ['apps/web/src/pages/demo-weather-analysis.tsx'],
      },
    };

    const specifySpy = vi.spyOn(specifyRunner, 'runSpecify');
    const planSpy = vi.spyOn(planRunner, 'runPlan');
    const implementSpy = vi.spyOn(implementRunner, 'runImplement');
    const verifySpy = vi.spyOn(verifyRunner, 'runVerify');
    const reviewSpy = vi.spyOn(reviewRunner, 'runReview');
    const prSpy = vi.spyOn(prRunner, 'runPr');
    const monitorSpy = vi.spyOn(monitorRunner, 'runMonitor');

    beforeEach(() => {
      specifySpy.mockReset();
      planSpy.mockReset();
      implementSpy.mockReset();
      verifySpy.mockReset();
      reviewSpy.mockReset();
      prSpy.mockReset();
      monitorSpy.mockReset();
    });

    afterAll(() => {
      specifySpy.mockRestore();
      planSpy.mockRestore();
      implementSpy.mockRestore();
      verifySpy.mockRestore();
      reviewSpy.mockRestore();
      prSpy.mockRestore();
      monitorSpy.mockRestore();
    });

    it('retries plan after verify failure and resolution loop closes', async () => {
      specifySpy.mockResolvedValue({
        success: true,
        nextState: 'plan',
        artifacts: { specify: { acceptanceCriteria: ['demo'], initialRisks: [] } },
        notes: ['spec'],
        modelSelection: undefined,
      });

      planSpy
        .mockImplementationOnce(async (context) => {
          expect(context.requirePlanDelta).toBe(false);
          return {
            success: true,
            nextState: 'implement',
            artifacts: {
              plan: {
                planHash: 'hash-1',
                requiresThinker: false,
                summary: 'Plan attempt 1',
                planDeltaToken: 'delta-1',
                coverageTarget: 0.2,
              },
            },
            notes: ['plan attempt 1'],
            modelSelection: undefined,
          };
        })
        .mockImplementationOnce(async (context) => {
          expect(context.requirePlanDelta).toBe(true);
          return {
            success: true,
            nextState: 'implement',
            artifacts: {
              plan: {
                planHash: 'hash-2',
                requiresThinker: false,
                summary: 'Plan attempt 2',
                planDeltaToken: 'delta-2',
                coverageTarget: 0.2,
              },
            },
            notes: ['plan attempt 2'],
            modelSelection: undefined,
          };
        });

      implementSpy
        .mockResolvedValueOnce({
          success: true,
          nextState: 'verify',
          artifacts: {
            implement: {
              success: true,
              patchHash: 'patch-1',
              notes: [],
              coverageHint: 0.2,
              changedFiles: [],
              changedLinesCoverage: 0.85,
              touchedFilesDelta: 0.2,
            },
          },
          notes: ['implement-1'],
          modelSelection: undefined,
        })
        .mockResolvedValueOnce({
          success: true,
          nextState: 'verify',
          artifacts: {
            implement: {
              success: true,
              patchHash: 'patch-2',
              notes: [],
              coverageHint: 0.2,
              changedFiles: [],
              changedLinesCoverage: 0.9,
              touchedFilesDelta: 0.2,
            },
          },
          notes: ['implement-2'],
          modelSelection: undefined,
        });

      verifySpy
        .mockResolvedValueOnce({
          success: false,
          nextState: 'plan',
          artifacts: {
            verify: {
              success: false,
              coverageDelta: 0.01,
              coverageTarget: 0.2,
              gateResults: [{ name: 'tests.run', success: false, output: 'failed' }],
              artifacts: {},
            },
            resolution: {
              label: 'missing_dependency',
              steps: ['install deps'],
              planDelta: 'delta-required',
              actionables: ['update requirements'],
              requiresThinker: false,
            },
          },
          notes: ['verify failed'],
          requirePlanDelta: true,
          modelSelection: undefined,
        })
        .mockResolvedValueOnce({
          success: true,
          nextState: 'review',
          artifacts: {
            verify: {
              success: true,
              coverageDelta: 0.85,
              coverageTarget: 0.2,
              gateResults: [{ name: 'tests.run', success: true, output: 'ok' }],
              artifacts: {},
            },
          },
          notes: ['verify success'],
          modelSelection: undefined,
        });

      reviewSpy.mockResolvedValue({
        success: true,
        nextState: 'pr',
        artifacts: {
          review: {
            review: {
              approved: true,
              rubric: {
                resolution_proof: 4,
                design: 4,
                performance_security: 4,
                maintainability: 4,
                executive_quality: 4,
              },
              report: '{}',
              model: undefined,
            },
            critical: {
              issues: [],
              requiresEscalation: false,
            },
          },
        },
        notes: ['review'],
        modelSelection: undefined,
      });

      prSpy.mockResolvedValue({
        success: true,
        nextState: 'monitor',
        artifacts: { pr: { checklist: ['ready'] } },
        notes: ['pr'],
        modelSelection: undefined,
      });

      monitorSpy.mockResolvedValue({
        success: true,
        nextState: null,
        artifacts: { monitor: { smoke: { success: true } } },
        notes: ['monitor'],
        modelSelection: undefined,
      });

      const deps = createStateGraphDeps();
      const graph = new StateGraph(deps, { workspaceRoot: graphWorkspaceRoot });

      const result = await graph.run(pipelineTask);

      expect(result.success).toBe(true);
      expect(result.finalState).toBe('monitor');
      expect(planSpy).toHaveBeenCalledTimes(2);
      expect(verifySpy).toHaveBeenCalledTimes(2);
      expect(deps.supervisor.requirePlanDelta).toHaveBeenCalledWith(pipelineTask.id);
    });

    it('invokes incident reporter when plan retries exceed ceiling', async () => {
      specifySpy.mockResolvedValue({
        success: true,
        nextState: 'plan',
        artifacts: { specify: { acceptanceCriteria: ['demo'], initialRisks: [] } },
        notes: ['spec'],
        modelSelection: undefined,
      });

      planSpy.mockImplementation(async () => ({
        success: true,
        nextState: 'plan',
        artifacts: {
          plan: {
            planHash: `hash-${Math.random().toString(36).slice(2, 8)}`,
            requiresThinker: false,
            summary: 'Looping plan',
            planDeltaToken: 'delta-loop',
            coverageTarget: 0.2,
          },
        },
        notes: ['plan retry'],
        modelSelection: undefined,
      }));

      const incidentReporter = new IncidentReporter({ workspaceRoot: graphWorkspaceRoot });
      const reportMock = vi.spyOn(incidentReporter, 'report').mockResolvedValue({
        prBranch: 'incident/task-pipeline',
        mrfcPath: path.join(graphWorkspaceRoot, 'repro', pipelineTask.id),
        requireHuman: true,
      });

      const deps = createStateGraphDeps();
      const graph = new StateGraph(deps, {
        workspaceRoot: graphWorkspaceRoot,
        incidentReporter,
      });

      const result = await graph.run(pipelineTask);

      expect(result.success).toBe(false);
      expect(result.finalState).toBe('plan');
      expect(reportMock).toHaveBeenCalledTimes(1);
      expect(reportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          task: pipelineTask,
          state: 'plan',
          attempt: 3,
        })
      );
    });
  });
});

const graphWorkspaceRoot = path.resolve(__dirname, '../../../../..');

function createStateGraphDeps(overrides: Partial<StateGraphDependencies> = {}): StateGraphDependencies {
  const supervisor = {
    monitor: vi.fn(() => ({ status: 'complete', model: undefined })),
    requirePlanDelta: vi.fn(),
  } as unknown as SupervisorAgent;

  const deps: StateGraphDependencies = {
    planner: {} as PlannerAgent,
    thinker: {} as ThinkerAgent,
    implementer: {} as ImplementerAgent,
    verifier: {} as Verifier,
    reviewer: {} as ReviewerAgent,
    critical: {} as CriticalAgent,
    supervisor,
    router: {
      noteVerifyFailure: vi.fn(),
      clearTask: vi.fn(),
    } as unknown as ModelRouter,
    journal: {
      record: vi.fn(() => Promise.resolve()),
    } as unknown as DecisionJournal,
    memory: {
      set: vi.fn(),
      get: vi.fn(() => undefined),
      clearTask: vi.fn(),
    } as unknown as RunEphemeralMemory,
    contextAssembler: {
      emit: vi.fn(() => Promise.resolve('resources://runs/demo/context/Planner.lcp.json')),
    } as unknown as ContextAssembler,
    checkpoint: {
      save: vi.fn(() => Promise.resolve()),
    },
    complexityRouter: new ComplexityRouter(),
    ...overrides,
  };
  return deps;
}
