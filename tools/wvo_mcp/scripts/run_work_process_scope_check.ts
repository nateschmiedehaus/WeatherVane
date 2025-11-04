#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const scopePath = path.join(process.cwd(), 'state', 'evidence', 'META-AUDIT-WP', 'strategize', 'scope.md');
  try {
    const content = await fs.readFile(scopePath, 'utf-8');
    if (!content.trim()) {
      throw new Error('Scope document is empty.');
    }
    console.log(`Work-process scope document located at ${scopePath} (bytes=${content.length})`);
  } catch (error) {
    console.error('Failed to validate work-process scope:', error);
    process.exitCode = 1;
  }
}

main();
