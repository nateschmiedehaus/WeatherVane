#!/usr/bin/env node

/**
 * Post-commit hook to extract knowledge from code.
 *
 * Runs automatically after each commit to keep the knowledge graph current.
 * Non-blocking: if extraction fails, commit still succeeds.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

async function main() {
  try {
    // Check if knowledge system is enabled
    const enabledFlagPath = path.join(workspaceRoot, 'state', 'knowledge', '.enabled');

    try {
      await fs.access(enabledFlagPath);
    } catch {
      // Not enabled yet, skip silently
      console.log('[Knowledge] System not enabled yet. Run: npm run knowledge:enable');
      process.exit(0);
    }

    // Import knowledge modules
    const { KnowledgeStorage, KnowledgeExtractor } = await import(
      '../tools/wvo_mcp/dist/intelligence/index.js'
    );

    // Initialize
    const storage = new KnowledgeStorage(workspaceRoot);
    await storage.initialize();

    const extractor = new KnowledgeExtractor(workspaceRoot, storage);

    // Extract from staged files (committed files are now HEAD)
    console.log('[Knowledge] Extracting from commit...');
    const log = await extractor.extractFromStagedFiles();

    // Log results
    const logPath = path.join(workspaceRoot, 'state', 'analytics', 'knowledge_extraction.jsonl');
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, JSON.stringify(log) + '\n');

    if (log.success) {
      console.log(`[Knowledge] ✓ Extracted ${log.functionsExtracted} functions, ${log.edgesExtracted} edges (${log.durationMs}ms)`);
    } else {
      console.warn(`[Knowledge] ✗ Extraction failed: ${log.error}`);
    }

    // Get statistics
    const stats = storage.getStatistics();
    console.log(`[Knowledge] Total: ${stats.functions} functions, ${stats.edges} edges`);

    storage.close();
    process.exit(0);
  } catch (error) {
    // Non-blocking: log error but don't fail commit
    console.error('[Knowledge] Extraction error (non-blocking):', error);
    process.exit(0);
  }
}

main();
