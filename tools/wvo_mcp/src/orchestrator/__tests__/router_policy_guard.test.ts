import { promises as fs } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

const HARD_CODED_MODEL_PATTERN = /\b(gpt-[\w.-]+|claude[\w.-]*|sonnet[\w.-]*|haiku[\w.-]*|gemini[\w.-]*|grok[\w.-]*)\b/i;
const GUARDED_FILES = [
  'planner_agent.ts',
  'thinker_agent.ts',
  'implementer_agent.ts',
  'reviewer_agent.ts',
  'critical_agent.ts',
  'supervisor.ts',
  'state_graph.ts',
  'state_graph.test.ts',
  'verifier.ts',
  'resolution_engine.ts',
  'context_assembler.ts',
];

describe('router policy guard', () => {
  it('selected orchestrator files must not hard-code provider model names', async () => {
    const orchestratorDir = path.resolve(__dirname, '..');
    const offenders: Array<{ file: string; match: string }> = [];
    for (const relativeFile of GUARDED_FILES) {
      const filePath = path.join(orchestratorDir, relativeFile);
      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        continue;
      }
      const match = content.match(HARD_CODED_MODEL_PATTERN);
      if (match) {
        offenders.push({
          file: path.relative(process.cwd(), filePath),
          match: match[0],
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
