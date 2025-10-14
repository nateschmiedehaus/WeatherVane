import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AcademicSearchClient } from '../intelligence/academic_search.js';
import { AlternativeGenerator } from '../intelligence/alternative_generator.js';
import { PatternMiningClient } from '../intelligence/pattern_mining.js';
import { ResearchManager } from '../intelligence/research_manager.js';
import type {
  AlternativeOption,
  PatternInsight,
  ResearchFinding,
} from '../intelligence/research_types.js';
import { ResearchOrchestrator } from '../orchestrator/research_orchestrator.js';
import { TaskScheduler, type ResearchTriggerPayload } from '../orchestrator/task_scheduler.js';
import { StateMachine } from '../orchestrator/state_machine.js';

class DeterministicAcademicSearch extends AcademicSearchClient {
  constructor(private readonly results: ResearchFinding[]) {
    super({ enabled: true });
  }

  override async search(): Promise<ResearchFinding[]> {
    return this.results;
  }
}

class DeterministicPatternMining extends PatternMiningClient {
  constructor(private readonly results: PatternInsight[]) {
    super({ enabled: true });
  }

  override async findPatterns(): Promise<PatternInsight[]> {
    return this.results;
  }
}

class DeterministicAlternativeGenerator extends AlternativeGenerator {
  constructor(private readonly results: AlternativeOption[]) {
    super({ enabled: true });
  }

  override async suggestAlternatives(): Promise<AlternativeOption[]> {
    return this.results;
  }
}

describe('ResearchOrchestrator', () => {
  let workspaceRoot: string;
  let stateMachine: StateMachine;
  let scheduler: TaskScheduler;
  let orchestrator: ResearchOrchestrator;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wvo-research-orchestrator-'));
    stateMachine = new StateMachine(workspaceRoot);
    scheduler = new TaskScheduler(stateMachine, {
      researchSignalsEnabled: true,
      researchSensitivity: 0.5,
    });

    const researchManager = new ResearchManager({
      academicSearch: new DeterministicAcademicSearch([
        {
          id: 'finding-1',
          title: 'Efficient cache invalidation strategies',
          summary: 'Survey of cache invalidation techniques.',
          source: 'arxiv',
          confidence: 0.8,
          url: 'https://example.com/finding-1',
        },
      ]),
      patternMining: new DeterministicPatternMining([
        {
          id: 'pattern-1',
          title: 'CompanyX cache pipeline',
          summary: 'Open-source cache pipeline for reference.',
          url: 'https://example.com/pattern-1',
        },
      ]),
      alternativeGenerator: new DeterministicAlternativeGenerator([
        {
          id: 'alt-1',
          title: 'Incremental cache warmer',
          summary: 'Use incremental updates instead of full rebuilds.',
          pros: ['Reduces token usage'],
          cons: ['Requires tracking metadata'],
          confidence: 0.7,
        },
      ]),
    });

    orchestrator = new ResearchOrchestrator(scheduler, researchManager, stateMachine, {
      maxConcurrent: 1,
      queueDebounceMs: 0,
    });
  });

  afterEach(() => {
    orchestrator.dispose();
    scheduler.destroy();
    stateMachine.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('records research findings as context entries when triggered', async () => {
    const task = stateMachine.createTask({
      id: 'task-research',
      title: 'Design cache refresh strategy',
      description: 'Need better approach for refreshing caches across services.',
      type: 'task',
      status: 'pending',
    });

    const completion = new Promise((resolve) => {
      orchestrator.once('research:completed', resolve);
    });

    scheduler.emit('research:trigger', {
      taskId: task.id,
      taskTitle: task.title,
      reason: 'requires_follow_up',
      triggerType: 'complexity',
      confidence: 0.8,
      hints: ['High complexity rating (8)'],
    } satisfies ResearchTriggerPayload);

    await completion;

    const entries = stateMachine.getContextEntries({ type: 'learning' });
    const relevant = entries.find((entry) => entry.related_tasks?.includes(task.id));
    expect(relevant).toBeDefined();
    const metadata = relevant?.metadata as
      | { counts?: { findings?: number; patterns?: number; alternatives?: number } }
      | undefined;
    expect(metadata?.counts?.findings).toBe(1);
    expect(metadata?.counts?.patterns).toBe(1);
    expect(metadata?.counts?.alternatives).toBe(1);
    expect(relevant?.content).toContain('Research Findings');
    expect(relevant?.content).toContain('Industry Patterns');
    expect(relevant?.content).toContain('Alternative Approaches');
  });
});
