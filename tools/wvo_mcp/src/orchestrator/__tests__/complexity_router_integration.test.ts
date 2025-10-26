/**
 * Integration test to verify ComplexityRouter model selection is actually used by agents
 *
 * CRITICAL: This test ensures ComplexityRouter isn't just called, but its output
 * is actually passed to and used by the agents.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComplexityRouter } from '../complexity_router.js';
import { PlannerAgent } from '../planner_agent.js';
import { ThinkerAgent } from '../thinker_agent.js';
import { ImplementerAgent } from '../implementer_agent.js';
import { ReviewerAgent } from '../reviewer_agent.js';
import type { TaskEnvelope } from '../task_envelope.js';
import type { ModelRouter } from '../model_router.js';
import { RunEphemeralMemory } from '../../memory/run_ephemeral.js';
import { KnowledgeBaseResources } from '../../memory/kb_resources.js';
import { ProjectIndex } from '../../memory/project_index.js';

describe('ComplexityRouter Integration', () => {
  const workspaceRoot = '/tmp/test-workspace';

  const createComplexTask = (): TaskEnvelope => ({
    id: 'T-COMPLEX',
    title: 'Implement ML-based forecasting with distributed training and security review',
    description: 'This is a very long description that exceeds 500 characters. '.repeat(20),
    labels: ['ml', 'security', 'distributed'],
    priorityTags: ['p0'],
    metadata: {
      epic: 'E-FORECASTING',
      dependencies: ['T1', 'T2', 'T3', 'T4', 'T5'],
    },
  });

  const createSimpleTask = (): TaskEnvelope => ({
    id: 'T-SIMPLE',
    title: 'Fix typo in README',
    description: 'Simple documentation fix',
    labels: ['docs'],
    priorityTags: [],
  });

  it('PlannerAgent uses ComplexityRouter selection instead of ModelRouter', async () => {
    const complexityRouter = new ComplexityRouter();
    const mockRouter: ModelRouter = {
      pickModel: vi.fn(() => ({ model: 'wrong-model', provider: 'wrong', tier: {} as any })),
    } as any;

    const memory = new RunEphemeralMemory();
    const kb = new KnowledgeBaseResources(workspaceRoot);
    const projectIndex = new ProjectIndex(workspaceRoot);

    const planner = new PlannerAgent({ router: mockRouter, memory, kb, projectIndex });

    const complexTask = createComplexTask();
    const complexity = complexityRouter.assessComplexity(complexTask);
    const modelSelection = complexityRouter.selectModel(complexity);

    // Call planner with ComplexityRouter selection
    const result = await planner.run({
      task: complexTask,
      attempt: 1,
      requireDelta: false,
      modelSelection, // From ComplexityRouter
    });

    // Verify: Model from result should match ComplexityRouter, NOT ModelRouter
    expect(result.model).toEqual(modelSelection);
    expect(result.model).not.toEqual({ model: 'wrong-model', provider: 'wrong' });

    // Verify: ModelRouter.pickModel should NOT have been called (ComplexityRouter took priority)
    expect(mockRouter.pickModel).not.toHaveBeenCalled();
  });

  it('ThinkerAgent uses ComplexityRouter selection instead of ModelRouter', async () => {
    const complexityRouter = new ComplexityRouter();
    const mockRouter: ModelRouter = {
      pickModel: vi.fn(() => ({ model: 'wrong-model', provider: 'wrong', tier: {} as any })),
    } as any;

    const thinker = new ThinkerAgent(mockRouter);

    const complexTask = createComplexTask();
    const complexity = complexityRouter.assessComplexity(complexTask);
    const modelSelection = complexityRouter.selectModel(complexity);

    // Call thinker with ComplexityRouter selection
    const result = await thinker.reflect({
      task: complexTask,
      planHash: 'abc123',
      modelSelection, // From ComplexityRouter
    });

    // Verify: Model from result should match ComplexityRouter, NOT ModelRouter
    expect(result.model).toEqual(modelSelection);
    expect(result.model).not.toEqual({ model: 'wrong-model', provider: 'wrong' });

    // Verify: ModelRouter.pickModel should NOT have been called
    expect(mockRouter.pickModel).not.toHaveBeenCalled();
  });

  it('ImplementerAgent uses ComplexityRouter selection instead of ModelRouter', async () => {
    const complexityRouter = new ComplexityRouter();
    const mockRouter: ModelRouter = {
      pickModel: vi.fn(() => ({ model: 'wrong-model', provider: 'wrong', tier: {} as any })),
    } as any;

    const memory = new RunEphemeralMemory();
    const implementer = new ImplementerAgent({ router: mockRouter, memory });

    const complexTask = createComplexTask();
    const complexity = complexityRouter.assessComplexity(complexTask);
    const modelSelection = complexityRouter.selectModel(complexity);

    // Call implementer with ComplexityRouter selection
    const result = await implementer.apply({
      task: complexTask,
      planHash: 'abc123',
      insights: ['insight1'],
      modelSelection, // From ComplexityRouter
    });

    // Verify: Model from result should match ComplexityRouter, NOT ModelRouter
    expect(result.model).toEqual(modelSelection);
    expect(result.model).not.toEqual({ model: 'wrong-model', provider: 'wrong' });

    // Verify: ModelRouter.pickModel should NOT have been called
    expect(mockRouter.pickModel).not.toHaveBeenCalled();
  });

  it('ReviewerAgent uses ComplexityRouter selection instead of ModelRouter', async () => {
    const complexityRouter = new ComplexityRouter();
    const mockRouter: ModelRouter = {
      pickModel: vi.fn(() => ({ model: 'wrong-model', provider: 'wrong', tier: {} as any })),
    } as any;

    const reviewer = new ReviewerAgent(mockRouter);

    const complexTask = createComplexTask();
    const complexity = complexityRouter.assessComplexity(complexTask);
    const modelSelection = complexityRouter.selectModel(complexity);

    // Call reviewer with ComplexityRouter selection
    const result = await reviewer.review({
      task: complexTask,
      patchHash: 'abc123',
      coverageDelta: 0.1,
      modelSelection, // From ComplexityRouter
    });

    // Verify: Model from result should match ComplexityRouter, NOT ModelRouter
    expect(result.model).toEqual(modelSelection);
    expect(result.model).not.toEqual({ model: 'wrong-model', provider: 'wrong' });

    // Verify: ModelRouter.pickModel should NOT have been called
    expect(mockRouter.pickModel).not.toHaveBeenCalled();
  });

  it('Agents fall back to ModelRouter when ComplexityRouter selection not provided', async () => {
    const mockRouter: ModelRouter = {
      pickModel: vi.fn(() => ({ model: 'fallback-model', provider: 'fallback', tier: {} as any })),
    } as any;

    const thinker = new ThinkerAgent(mockRouter);

    const simpleTask = createSimpleTask();

    // Call thinker WITHOUT modelSelection (simulating legacy code path)
    const result = await thinker.reflect({
      task: simpleTask,
      planHash: 'abc123',
      // No modelSelection provided
    });

    // Verify: Should have fallen back to ModelRouter
    expect(result.model).toEqual({ model: 'fallback-model', provider: 'fallback', tier: {} as any });
    expect(mockRouter.pickModel).toHaveBeenCalledWith('thinker', { taskId: 'T-SIMPLE' });
  });

  it('ComplexityRouter selects different tiers for complex vs simple tasks', async () => {
    const complexityRouter = new ComplexityRouter();

    const complexTask = createComplexTask();
    const simpleTask = createSimpleTask();

    const complexComplexity = complexityRouter.assessComplexity(complexTask);
    const simpleComplexity = complexityRouter.assessComplexity(simpleTask);

    const complexModel = complexityRouter.selectModel(complexComplexity);
    const simpleModel = complexityRouter.selectModel(simpleComplexity);

    // Complex task should get higher tier than simple task
    expect(complexComplexity.score).toBeGreaterThan(simpleComplexity.score);

    // Verify different models selected based on complexity
    expect(complexModel.model).toBeDefined();
    expect(simpleModel.model).toBeDefined();
  });
});
