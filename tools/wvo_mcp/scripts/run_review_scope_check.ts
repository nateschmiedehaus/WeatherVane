#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const workspaceRoot = process.cwd();
  const scopePath = path.join(workspaceRoot, 'state', 'evidence', 'META-AUDIT-02', 'strategize', 'scope.md');
  try {
    const content = await fs.readFile(scopePath, 'utf-8');
    if (content.trim().length === 0) {
      throw new Error('Scope document is empty');
    }
    console.log(`Scope document located at ${scopePath} (bytes=${content.length})`);
  } catch (error) {
    console.error('Failed to validate audit scope:', error);
    process.exitCode = 1;
  }
}

main();
