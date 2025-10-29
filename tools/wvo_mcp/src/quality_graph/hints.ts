/**
 * Quality Graph - Planning Hints
 *
 * Queries similar tasks and formats hints for planner context.
 * Integrates with PLAN phase to provide context from past tasks.
 *
 * Design:
 * - Non-blocking: Failures return empty hints, don't crash
 * - Graceful degradation: Works without quality graph
 * - Formatted hints: Human-readable context for planner
 *
 * Verification Checklist:
 * - [x] Queries similar tasks via Python script
 * - [x] Formats hints for planner consumption
 * - [x] Handles empty corpus gracefully
 * - [x] Handles query failures gracefully
 * - [x] Returns empty hints on error (non-blocking)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { withSpan } from '../telemetry/tracing.js';
import { ensureQualityGraphPython } from './python_env.js';

/**
 * Similar task from quality graph
 */
export interface SimilarTask {
  taskId: string;
  title?: string;
  description?: string;
  filesTouched?: string[];
  outcome: {
    status: 'success' | 'failure' | 'abandoned';
  };
  durationMs?: number;
  quality?: 'high' | 'medium' | 'low';
  complexityScore?: number;
  similarity: number;
  isConfident: boolean;
}

/**
 * Query result from Python script
 */
interface QueryResult {
  success: boolean;
  count: number;
  similar_tasks: Array<{
    task_id: string;
    title?: string;
    description?: string;
    files_touched?: string[];
    outcome: { status: string };
    duration_ms?: number;
    quality?: string;
    complexity_score?: number;
    similarity: number;
    is_confident: boolean;
  }>;
  error?: string;
}

/**
 * Query options
 */
export interface QueryOptions {
  /** Number of similar tasks to return (default: 5) */
  k?: number;

  /** Minimum similarity threshold 0.0-1.0 (default: 0.3) */
  minSimilarity?: number;

  /** Only return successful tasks (default: false) */
  successOnly?: boolean;

  /** Exclude abandoned tasks (default: true) */
  excludeAbandoned?: boolean;

  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;

  /** Python executable (default: 'python3') */
  pythonPath?: string;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<QueryOptions> = {
  k: 5,
  minSimilarity: 0.3,
  successOnly: false,
  excludeAbandoned: true,
  timeoutMs: 30000,
  pythonPath: 'python3',
};

/**
 * Query similar tasks from quality graph
 *
 * This function is designed to be non-blocking and fault-tolerant.
 * If query fails, it returns empty array and logs warning.
 *
 * @param workspaceRoot - Workspace root directory
 * @param task - Task metadata for similarity query
 * @param options - Query options
 * @returns Array of similar tasks (empty on error)
 */
export async function querySimilarTasks(
  workspaceRoot: string,
  task: {
    title: string;
    description?: string;
    filesHinted?: string[];
  },
  options: QueryOptions = {}
): Promise<SimilarTask[]> {
  return withSpan('quality_graph.query_similar_tasks', async (span) => {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    span?.setAttribute('task.title', task.title);
    span?.setAttribute('k', opts.k);
    span?.setAttribute('minSimilarity', opts.minSimilarity);

    // Build Python script path
    const scriptPath = path.join(
      workspaceRoot,
      'tools/wvo_mcp/scripts/quality_graph/query_similar_tasks.py'
    );

    // Build arguments
    const args = [
      scriptPath,
      workspaceRoot,
      '--title',
      task.title,
      '--k',
      opts.k.toString(),
      '--min-similarity',
      opts.minSimilarity.toString(),
    ];

    if (task.description) {
      args.push('--description', task.description);
    }

    if (task.filesHinted && task.filesHinted.length > 0) {
      args.push('--files', task.filesHinted.join(','));
    }

    if (opts.successOnly) {
      args.push('--success-only');
    }

    if (opts.excludeAbandoned) {
      args.push('--exclude-abandoned');
    }

    let pythonExecutable = opts.pythonPath;

    if (!options.pythonPath || options.pythonPath === DEFAULT_OPTIONS.pythonPath) {
      try {
        pythonExecutable = await ensureQualityGraphPython(workspaceRoot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarning('Quality graph Python environment unavailable for hints', {
          title: task.title,
          error: message,
        });
        span?.setAttribute('error', message);
        return [];
      }
    }

    span?.setAttribute('pythonPath', pythonExecutable);

    logInfo('Querying similar tasks', {
      title: task.title,
      k: opts.k,
      minSimilarity: opts.minSimilarity,
      pythonPath: pythonExecutable,
    });

    // Execute Python script
    return new Promise<SimilarTask[]>((resolve) => {
      const proc = spawn(pythonExecutable ?? opts.pythonPath, args, {
        cwd: workspaceRoot,
        timeout: opts.timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      // Timeout handler
      const timeoutId = setTimeout(() => {
        proc.kill('SIGTERM');
        logWarning('Similar tasks query timed out', {
          timeout: opts.timeoutMs,
        });
        span?.setAttribute('timeout', true);
        resolve([]);
      }, opts.timeoutMs);

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        logError('Failed to spawn Python process for similar tasks', {
          error: err.message,
        });
        span?.setAttribute('error', err.message);
        resolve([]);
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code !== 0) {
          logWarning('Similar tasks query failed', {
            exitCode: code,
            stderr: stderr.trim(),
          });
          span?.setAttribute('error', `Exit code ${code}`);
          resolve([]);
          return;
        }

        // Parse JSON output
        try {
          const result: QueryResult = JSON.parse(stdout);

          if (!result.success) {
            logWarning('Similar tasks query returned error', {
              error: result.error,
            });
            span?.setAttribute('error', result.error);
            resolve([]);
            return;
          }

          // Convert to SimilarTask format
          const similarTasks: SimilarTask[] = result.similar_tasks.map((t) => ({
            taskId: t.task_id,
            title: t.title,
            description: t.description,
            filesTouched: t.files_touched,
            outcome: {
              status: t.outcome.status as 'success' | 'failure' | 'abandoned',
            },
            durationMs: t.duration_ms,
            quality: t.quality as 'high' | 'medium' | 'low' | undefined,
            complexityScore: t.complexity_score,
            similarity: t.similarity,
            isConfident: t.is_confident,
          }));

          logInfo('Similar tasks found', {
            count: similarTasks.length,
            avgSimilarity:
              similarTasks.length > 0
                ? (similarTasks.reduce((sum, t) => sum + t.similarity, 0) / similarTasks.length).toFixed(3)
                : 'N/A',
          });

          span?.setAttribute('count', similarTasks.length);
          span?.setAttribute('success', true);

          resolve(similarTasks);
        } catch (err) {
          logError('Failed to parse similar tasks JSON', {
            error: err instanceof Error ? err.message : String(err),
            stdout: stdout.slice(0, 500),
          });
          span?.setAttribute('error', 'JSON parse failed');
          resolve([]);
        }
      });
    });
  });
}

/**
 * Format similar tasks as hints for planner
 *
 * Creates human-readable context summarizing similar past tasks.
 *
 * @param similarTasks - Array of similar tasks
 * @returns Formatted hints text (empty string if no tasks)
 */
export function formatPlanningHints(similarTasks: SimilarTask[]): string {
  if (similarTasks.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Similar Past Tasks (Quality Graph Hints)');
  lines.push('');
  lines.push('The following similar tasks may provide useful context:');
  lines.push('');

  for (let i = 0; i < similarTasks.length; i++) {
    const task = similarTasks[i];
    const confidence = task.isConfident ? '(high confidence)' : '(moderate)';

    lines.push(`### ${i + 1}. ${task.title || task.taskId} ${confidence}`);
    lines.push('');
    lines.push(`- **Similarity**: ${(task.similarity * 100).toFixed(1)}%`);
    lines.push(`- **Outcome**: ${task.outcome.status}`);

    if (task.quality) {
      lines.push(`- **Quality**: ${task.quality}`);
    }

    if (task.durationMs !== undefined) {
      const hours = (task.durationMs / 3600000).toFixed(1);
      lines.push(`- **Duration**: ${hours}h`);
    }

    if (task.complexityScore !== undefined) {
      lines.push(`- **Complexity**: ${(task.complexityScore * 100).toFixed(0)}%`);
    }

    if (task.description) {
      lines.push(`- **Description**: ${task.description}`);
    }

    if (task.filesTouched && task.filesTouched.length > 0) {
      lines.push(`- **Files**: ${task.filesTouched.slice(0, 3).join(', ')}${task.filesTouched.length > 3 ? '...' : ''}`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('**Note**: Use these hints to inform your plan but adapt to the specific requirements of this task.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get planning hints for a task
 *
 * Convenience function that queries similar tasks and formats hints.
 *
 * @param workspaceRoot - Workspace root directory
 * @param task - Task metadata
 * @param options - Query options
 * @returns Formatted hints text (empty string on error)
 */
export async function getPlanningHints(
  workspaceRoot: string,
  task: {
    title: string;
    description?: string;
    filesHinted?: string[];
  },
  options: QueryOptions = {}
): Promise<string> {
  const similarTasks = await querySimilarTasks(workspaceRoot, task, options);
  return formatPlanningHints(similarTasks);
}
