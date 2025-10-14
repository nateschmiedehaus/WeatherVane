import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { CodeSearchIndex } from '../utils/code_search.js';
import { StateMachine } from '../orchestrator/state_machine.js';

describe('CodeSearchIndex', () => {
  let workspaceRoot: string;
  let stateMachine: StateMachine;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'wvo-code-search-'));
    stateMachine = new StateMachine(workspaceRoot);
  });

  afterEach(async () => {
    stateMachine.close();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('indexes files and returns relevant matches', async () => {
    const srcDir = path.join(workspaceRoot, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    await fs.writeFile(
      path.join(srcDir, 'example.ts'),
      [
        'export function computeWeatherReport(data: number[]): string {',
        '  const total = data.reduce((acc, value) => acc + value, 0);',
        '  return `Weather report ready: ${total}`;',
        '}',
      ].join('\n')
    );

    await fs.writeFile(
      path.join(srcDir, 'notes.md'),
      '# Planning document\n\nCoordinate allocator changes with weather ingestion.'
    );

    const index = new CodeSearchIndex(stateMachine, workspaceRoot, {
      includeDirs: ['src'],
    });
    await index.refresh();

    const results = await index.search('weather report', { limit: 5 });
    const filePaths = results.map((hit) => hit.filePath);

    expect(filePaths).toContain('src/example.ts');
  });

  it('respects language filters when searching', async () => {
    const srcDir = path.join(workspaceRoot, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    await fs.writeFile(
      path.join(srcDir, 'pipeline.py'),
      'def build_weather_features(records):\n    return [record.temperature for record in records]'
    );

    await fs.writeFile(
      path.join(srcDir, 'planner.ts'),
      'export const WEATHER_PLAN = "allocate";'
    );

    const index = new CodeSearchIndex(stateMachine, workspaceRoot, {
      includeDirs: ['src'],
    });
    await index.refresh();

    const tsResults = await index.search('weather', { languages: ['ts'] });
    expect(tsResults).toHaveLength(1);
    expect(tsResults[0]?.filePath).toBe('src/planner.ts');
    expect(tsResults[0]?.language).toBe('ts');
  });
});
