import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ContextAssembler } from '../context/context_assembler.js';

import { PlannerAgent } from './planner_agent.js';
import { ThinkerAgent } from './thinker_agent.js';
import { ImplementerAgent } from './implementer_agent.js';
import { Verifier, type ToolRunner } from './verifier.js';
import { ReviewerAgent } from './reviewer_agent.js';
import { CriticalAgent } from './critical_agent.js';
import { SupervisorAgent } from './supervisor.js';
import { StateGraph } from './state_graph.js';
import type { ModelRouter, ModelSelection } from './model_router.js';
import { ComplexityRouter } from './complexity_router.js';
import { RunEphemeralMemory } from '../memory/run_ephemeral.js';
import { KnowledgeBaseResources } from '../memory/kb_resources.js';
import { ProjectIndex } from '../memory/project_index.js';
import { DecisionJournal } from '../memory/decision_journal.js';

type ContextEmitFn = OmitThisParameter<ContextAssembler['emit']>;
type ContextEmitArgs = Parameters<ContextEmitFn>;

const cwd = process.cwd();
const repoRoot = cwd.endsWith(`${path.sep}tools${path.sep}wvo_mcp`)
  ? path.resolve(cwd, '..', '..')
  : cwd;

const task = {
  id: 'TASK-1',
  title: 'Bootstrap state graph',
  priorityTags: ['p0'],
};

describe('StateGraph', () => {
  const createRouterStub = (): ModelRouter => {
    const selection: ModelSelection = {
      model: 'codex-5-high',
      provider: 'anthropic',
      capabilityTags: ['reasoning_high'],
      source: 'policy',
      reason: 'test',
    };
    return {
      pickModel: vi.fn(() => selection),
      noteVerifyFailure: vi.fn(),
      clearTask: vi.fn(),
      setDecisionLogger: vi.fn(),
    } as unknown as ModelRouter;
  };

  const createComplexityRouterStub = (): ComplexityRouter => {
    return new ComplexityRouter();
  };

  it('emits context packs during a nominal run', async () => {
    const workspaceRoot = repoRoot;
    const router = createRouterStub();
    const complexityRouter = createComplexityRouterStub();
    const memory = new RunEphemeralMemory();
    const kb = new KnowledgeBaseResources(workspaceRoot);
    const projectIndex = new ProjectIndex(workspaceRoot);
    const journal = new DecisionJournal({ workspaceRoot, runId: 'test', disabled: true });
    const emitSpy = vi.fn(async () => 'resources://runs/test/context/Planner.lcp.json');
    const graph = new StateGraph(
      {
        planner: new PlannerAgent({ router, memory, kb, projectIndex }),
        thinker: new ThinkerAgent(router),
        implementer: new ImplementerAgent({ router, memory }),
        verifier: new Verifier(0.05),
        reviewer: new ReviewerAgent(router),
        critical: new CriticalAgent(),
        supervisor: new SupervisorAgent(router),
        router,
        complexityRouter,
        journal,
        memory,
        contextAssembler: { emit: emitSpy },
      },
      { workspaceRoot, runId: 'test' }
    );
    const result = await graph.run(task);
    expect(result.success).toBe(false);
    expect(result.finalState).toBe('plan');
    expect(emitSpy).toHaveBeenCalled();
    const sawPlannerPack = (emitSpy.mock.calls as unknown as ContextEmitArgs[]).some(([payload]) => {
      return payload && payload.agent === 'Planner' && payload.taskId === task.id;
    });
    expect(sawPlannerPack).toBe(true);
  });

  it('requires plan delta when verifier keeps failing', async () => {
    const workspaceRoot = repoRoot;
    const router = createRouterStub();
    const complexityRouter = createComplexityRouterStub();
    const memory = new RunEphemeralMemory();
    const kb = new KnowledgeBaseResources(workspaceRoot);
    const projectIndex = new ProjectIndex(workspaceRoot);
    const journal = new DecisionJournal({ workspaceRoot, runId: 'test', disabled: true });
    const failingRunner: ToolRunner = {
      async run() {
        return { success: false, output: 'simulated gate failure' };
      },
    };
    const graph = new StateGraph(
      {
        planner: new PlannerAgent({ router, memory, kb, projectIndex }),
        thinker: new ThinkerAgent(router),
        implementer: new ImplementerAgent({ router, memory }),
        verifier: new Verifier(0.05, failingRunner),
        reviewer: new ReviewerAgent(router),
        critical: new CriticalAgent(),
        supervisor: new SupervisorAgent(router),
        router,
        complexityRouter,
        journal,
        memory,
        contextAssembler: { emit: vi.fn(async () => '') },
      },
      { workspaceRoot, runId: 'test' }
    );
    const result = await graph.run({ ...task, priorityTags: [] });
    expect(result.success).toBe(false);
    expect(result.finalState).toBe('plan');
    expect(result.notes.some(note => note.includes('plan failed'))).toBe(true);
  });

  it('records context pack URIs in memory and artifacts', async () => {
    const workspaceRoot = repoRoot;
    const router = createRouterStub();
    const complexityRouter = createComplexityRouterStub();
    const memory = new RunEphemeralMemory();
    const kb = new KnowledgeBaseResources(workspaceRoot);
    const projectIndex = new ProjectIndex(workspaceRoot);
    const journal = new DecisionJournal({ workspaceRoot, runId: 'test', disabled: true });
    const emitSpy = vi.fn(async () => 'resources://runs/test/context/Planner.lcp.json');
    const graph = new StateGraph(
      {
        planner: new PlannerAgent({ router, memory, kb, projectIndex }),
        thinker: new ThinkerAgent(router),
        implementer: new ImplementerAgent({ router, memory }),
        verifier: new Verifier(0.05),
        reviewer: new ReviewerAgent(router),
        critical: new CriticalAgent(),
        supervisor: new SupervisorAgent(router),
        router,
        complexityRouter,
        journal,
        memory,
        contextAssembler: { emit: emitSpy },
      },
      { workspaceRoot, runId: 'test' }
    );
    const result = await graph.run(task);
    expect(result.success).toBe(false);
    const storedUri = memory.get<string>(task.id, 'planner', 'context_pack_uri');
    expect(storedUri).toBe('resources://runs/test/context/Planner.lcp.json');
    const contextPacks = result.artifacts.contextPacks as Record<string, string> | undefined;
    expect(contextPacks?.Planner).toBe('resources://runs/test/context/Planner.lcp.json');
  });
});
