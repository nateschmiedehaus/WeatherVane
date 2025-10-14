import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ResearchManager } from '../intelligence/research_manager.js';
import { AcademicSearchClient } from '../intelligence/academic_search.js';
import type { ResearchFinding, ResearchQuery } from '../intelligence/research_types.js';
import { StateMachine } from '../orchestrator/state_machine.js';

class CountingAcademicSearch extends AcademicSearchClient {
  public calls = 0;

  constructor(private readonly response: ResearchFinding[]) {
    super({ enabled: true });
  }

  override async search(_query: ResearchQuery): Promise<ResearchFinding[]> {
    this.calls += 1;
    return this.response;
  }
}

describe('ResearchManager persistence', () => {
  let workspaceRoot: string;
  let stateMachine: StateMachine;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wvo-research-manager-'));
    stateMachine = new StateMachine(workspaceRoot);
  });

  afterEach(() => {
    stateMachine.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('persists research findings across manager instances', async () => {
    const query: ResearchQuery = {
      topic: 'cache warm strategy',
      keywords: ['cache', 'warming'],
      domains: ['arxiv'],
      recency: 'latest',
    };

    const initialResponse: ResearchFinding[] = [
      {
        id: 'finding-1',
        title: 'Efficient cache warming',
        summary: 'Demonstrates 40% reduction in latency via incremental warming.',
        source: 'arxiv',
        confidence: 0.9,
        url: 'https://example.com/cache-warm',
      },
    ];

    const searchA = new CountingAcademicSearch(initialResponse);
    const managerA = new ResearchManager({
      academicSearch: searchA,
      stateMachine,
    });

    const first = await managerA.query(query);
    expect(searchA.calls).toBe(1);
    expect(first).toEqual(initialResponse);

    // Instantiate a new manager with a fresh search client that would throw if called.
    const searchB = new CountingAcademicSearch([
      {
        id: 'finding-should-not-be-returned',
        title: 'Unexpected result',
        summary: 'Should not be used because cache should hit first.',
        source: 'arxiv',
        confidence: 0.1,
      },
    ]);
    const managerB = new ResearchManager({
      academicSearch: searchB,
      stateMachine,
    });

    const second = await managerB.query(query);
    expect(searchB.calls).toBe(0);
    expect(second).toEqual(initialResponse);
  });
});
