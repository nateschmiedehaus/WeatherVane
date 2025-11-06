import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { collectRepositoryDirectories, MAX_TRACKED_DIRECTORIES } from './analyzer.js';
import type { DirectoryEntry } from './types.js';

const repoRoot = path.resolve(__dirname, '..', '..');

let allEntries: Map<string, DirectoryEntry>;

beforeAll(async () => {
  allEntries = await collectRepositoryDirectories({
    repoRoot,
    mode: 'all',
    dryRun: true,
    verbose: false,
  });
});

describe('docsync guardrails', () => {
  test('tracked directory count stays within limit', () => {
    expect(allEntries.size).toBeLessThanOrEqual(MAX_TRACKED_DIRECTORIES);
  });

  test('tracked directories exclude banned segments', () => {
    const bannedPatterns = [/node_modules/, /(^|\/)tests(\/|$)/, /(^|\/)fixtures(\/|$)/, /(^|\/)tmp(\/|$)/];
    for (const key of allEntries.keys()) {
      for (const pattern of bannedPatterns) {
        expect(pattern.test(key)).toBe(false);
      }
    }
  });
});
