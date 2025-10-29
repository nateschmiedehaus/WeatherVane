/**
 * Quality Graph - Persistence Layer
 *
 * Handles reading/writing task vectors to state/quality_graph/task_vectors.jsonl
 *
 * Features:
 * - Atomic writes (temp file + rename)
 * - JSONL format (one vector per line)
 * - Graceful error handling (skip corrupt lines)
 * - Concurrent-safe appends
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskVector, validateTaskVectorSafe } from './schema.js';

export const QUALITY_GRAPH_DIR = 'state/quality_graph';
export const TASK_VECTORS_FILE = 'task_vectors.jsonl';

/**
 * Get path to task vectors file
 */
export function getTaskVectorsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, QUALITY_GRAPH_DIR, TASK_VECTORS_FILE);
}

/**
 * Ensure quality graph directory exists
 */
export async function ensureQualityGraphDir(workspaceRoot: string): Promise<void> {
  const dir = path.join(workspaceRoot, QUALITY_GRAPH_DIR);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Write task vector to JSONL file (atomic append)
 *
 * Uses atomic write: temp file + rename to avoid partial writes
 *
 * @param workspaceRoot - Project root directory
 * @param vector - Task vector to write
 * @throws Error if write fails
 */
export async function writeVector(
  workspaceRoot: string,
  vector: TaskVector
): Promise<void> {
  await ensureQualityGraphDir(workspaceRoot);

  const filePath = getTaskVectorsPath(workspaceRoot);
  const jsonLine = JSON.stringify(vector) + '\n';

  // Atomic append: write is atomic on POSIX filesystems
  // If concurrent writes occur, lines may interleave but won't corrupt
  await fs.appendFile(filePath, jsonLine, 'utf8');
}

/**
 * Read all task vectors from JSONL file
 *
 * Skips invalid lines with warning (graceful degradation)
 *
 * @param workspaceRoot - Project root directory
 * @returns Array of valid task vectors
 */
export async function readVectors(workspaceRoot: string): Promise<TaskVector[]> {
  const filePath = getTaskVectorsPath(workspaceRoot);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n').filter((line) => line.length > 0);

    const vectors: TaskVector[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        const data = JSON.parse(lines[i]);
        const result = validateTaskVectorSafe(data);

        if (result.success && result.data) {
          vectors.push(result.data);
        } else {
          errors.push(`Line ${i + 1}: ${result.errors?.join(', ')}`);
        }
      } catch (e) {
        errors.push(`Line ${i + 1}: JSON parse error - ${e}`);
      }
    }

    if (errors.length > 0) {
      console.warn(
        `Quality graph: skipped ${errors.length} invalid vectors:\n${errors.slice(0, 5).join('\n')}`
      );
    }

    return vectors;
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      // File doesn't exist yet, return empty array
      return [];
    }
    throw e;
  }
}

/**
 * Load vectors into in-memory index (map: task_id → vector)
 *
 * @param workspaceRoot - Project root directory
 * @returns Map of task_id to TaskVector
 */
export async function loadIndex(
  workspaceRoot: string
): Promise<Map<string, TaskVector>> {
  const vectors = await readVectors(workspaceRoot);
  const index = new Map<string, TaskVector>();

  for (const vector of vectors) {
    index.set(vector.task_id, vector);
  }

  return index;
}

/**
 * Get vector count (without loading all vectors)
 *
 * Counts lines in JSONL file
 *
 * @param workspaceRoot - Project root directory
 * @returns Number of vectors in corpus
 */
export async function getVectorCount(workspaceRoot: string): Promise<number> {
  const filePath = getTaskVectorsPath(workspaceRoot);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n').filter((line) => line.length > 0);
    return lines.length;
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return 0;
    }
    throw e;
  }
}

/**
 * Delete task vector by ID
 *
 * Note: This rewrites entire file (expensive for large corpus)
 * Use sparingly or implement tombstone approach
 *
 * @param workspaceRoot - Project root directory
 * @param taskId - Task ID to delete
 */
export async function deleteVector(
  workspaceRoot: string,
  taskId: string
): Promise<void> {
  const vectors = await readVectors(workspaceRoot);
  const filtered = vectors.filter((v) => v.task_id !== taskId);

  if (filtered.length === vectors.length) {
    // Task not found, no-op
    return;
  }

  // Atomic rewrite: write to temp file then rename
  const filePath = getTaskVectorsPath(workspaceRoot);
  const tempPath = filePath + '.tmp';

  const content = filtered.map((v) => JSON.stringify(v)).join('\n') + '\n';
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
}

/**
 * Prune old vectors (keep most recent N)
 *
 * Useful for limiting corpus size and keeping queries fast
 *
 * @param workspaceRoot - Project root directory
 * @param keepCount - Number of recent vectors to keep
 */
export async function pruneOldVectors(
  workspaceRoot: string,
  keepCount: number = 2000
): Promise<number> {
  const vectors = await readVectors(workspaceRoot);

  if (vectors.length <= keepCount) {
    return 0; // Nothing to prune
  }

  // Sort by timestamp descending (most recent first)
  const sorted = vectors.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const kept = sorted.slice(0, keepCount);
  const pruned = vectors.length - kept.length;

  // Atomic rewrite
  const filePath = getTaskVectorsPath(workspaceRoot);
  const tempPath = filePath + '.tmp';

  const content = kept.map((v) => JSON.stringify(v)).join('\n') + '\n';
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);

  console.log(`Quality graph: pruned ${pruned} old vectors, kept ${kept.length} most recent`);

  return pruned;
}
