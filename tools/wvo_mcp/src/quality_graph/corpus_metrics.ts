import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Get the current size of the quality graph corpus
 *
 * Counts the number of task vectors in the corpus by reading task_vectors.jsonl
 * and counting non-empty lines.
 *
 * @param workspaceRoot - Workspace root directory
 * @returns Number of task vectors in corpus (0 if corpus doesn't exist)
 *
 * @example
 * ```typescript
 * const size = await getCorpusSize('/path/to/workspace');
 * console.log(`Corpus contains ${size} vectors`);
 * ```
 */
export async function getCorpusSize(workspaceRoot: string): Promise<number> {
  const corpusPath = path.join(workspaceRoot, 'state', 'quality_graph', 'task_vectors.jsonl');

  try {
    const content = await fs.readFile(corpusPath, 'utf-8');
    const lines = content.trim().split('\n');
    // Return 0 if file is empty (single empty string after split)
    return lines.length > 0 && lines[0] !== '' ? lines.length : 0;
  } catch (error) {
    // File doesn't exist (empty corpus) or read error
    return 0;
  }
}
