/**
 * Quality Graph - Task Vector Recorder
 *
 * Records completed tasks as vectors in the quality graph.
 * Integrates with state machine MONITOR phase.
 *
 * Design:
 * - Non-blocking: Executes Python script asynchronously
 * - Graceful degradation: Logs warnings on failure, doesn't crash
 * - Telemetry: Records span events for observability
 *
 * Verification Checklist:
 * - [x] Validates inputs before calling Python
 * - [x] Spawns Python process correctly
 * - [x] Handles errors gracefully (logs, doesn't throw)
 * - [x] Records telemetry span events
 * - [x] Respects timeout (default 30s)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { withSpan } from '../telemetry/tracing.js';
import { ensureQualityGraphPython } from './python_env.js';

/**
 * Task metadata for recording
 */
export interface TaskRecordingMetadata {
  /** Task identifier */
  taskId: string;

  /** Task title (optional) */
  title?: string;

  /** Task description (optional) */
  description?: string;

  /** Files touched during task (optional) */
  filesTouched?: string[];

  /** Task outcome */
  outcome: 'success' | 'failure' | 'abandoned';

  /** Task duration in milliseconds (optional) */
  durationMs?: number;

  /** Quality assessment (optional) */
  quality?: 'high' | 'medium' | 'low';

  /** Complexity score 0.0-1.0 (optional) */
  complexityScore?: number;
}

/**
 * Recording result
 */
export interface RecordingResult {
  /** Whether recording succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Python script exit code */
  exitCode?: number;
}

/**
 * Options for recording
 */
export interface RecordingOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;

  /** Python executable (default: 'python3') */
  pythonPath?: string;

  /** Embedding backend override (default: live flag/env) */
  embeddingMode?: 'tfidf' | 'neural';
}

/**
 * Default options
 */
const DEFAULT_OPTIONS = {
  timeoutMs: 30000,
  pythonPath: 'python3',
} as const;

/**
 * Record a completed task as a vector in the quality graph
 *
 * This function is designed to be non-blocking and fault-tolerant.
 * If recording fails, it logs a warning but does not throw.
 *
 * @param workspaceRoot - Workspace root directory
 * @param metadata - Task metadata
 * @param options - Recording options
 * @returns Recording result
 *
 * Usage:
 * ```typescript
 * const result = await recordTaskVector(workspaceRoot, {
 *   taskId: 'IMP-ADV-01',
 *   title: 'Quality Graph Integration',
 *   outcome: 'success',
 *   durationMs: 3600000,
 * });
 *
 * if (!result.success) {
 *   logWarning('Quality graph recording failed', { error: result.error });
 * }
 * ```
 */
export async function recordTaskVector(
  workspaceRoot: string,
  metadata: TaskRecordingMetadata,
  options: RecordingOptions = {}
): Promise<RecordingResult> {
  return withSpan('quality_graph.record_task_vector', async (span) => {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Set span attributes
    span?.setAttribute('taskId', metadata.taskId);
    span?.setAttribute('outcome', metadata.outcome);
    if (metadata.durationMs !== undefined) {
      span?.setAttribute('durationMs', metadata.durationMs);
    }

    // Validate inputs
    if (!metadata.taskId || metadata.taskId.trim().length === 0) {
      const error = 'Task ID is required';
      logError('Quality graph recording failed', { error });
      span?.setAttribute('error', error);
      return { success: false, error };
    }

    if (!metadata.title && !metadata.description && !metadata.filesTouched?.length) {
      const error =
        'At least one of title, description, or filesTouched must be provided for embedding';
      logWarning('Quality graph recording skipped', { error, taskId: metadata.taskId });
      span?.setAttribute('error', error);
      return { success: false, error };
    }

    let pythonExecutable = opts.pythonPath;

    if (!options.pythonPath || options.pythonPath === DEFAULT_OPTIONS.pythonPath) {
      try {
        pythonExecutable = await ensureQualityGraphPython(workspaceRoot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarning('Quality graph Python environment unavailable', {
          taskId: metadata.taskId,
          error: message,
        });
        span?.setAttribute('error', message);
        return { success: false, error: message };
      }
    }

    span?.setAttribute('pythonPath', pythonExecutable);

    // Build Python script path
    const scriptPath = path.join(
      workspaceRoot,
      'tools/wvo_mcp/scripts/quality_graph/record_task_vector.py'
    );

    // Build arguments
    const args = [scriptPath, workspaceRoot, metadata.taskId, '--outcome', metadata.outcome];

    if (opts.embeddingMode) {
      args.push('--embedding-mode', opts.embeddingMode);
    }

    if (metadata.title) {
      args.push('--title', metadata.title);
    }

    if (metadata.description) {
      args.push('--description', metadata.description);
    }

    if (metadata.filesTouched && metadata.filesTouched.length > 0) {
      args.push('--files', metadata.filesTouched.join(','));
    }

    if (metadata.durationMs !== undefined) {
      args.push('--duration_ms', metadata.durationMs.toString());
    }

    if (metadata.quality) {
      args.push('--quality', metadata.quality);
    }

    if (metadata.complexityScore !== undefined) {
      args.push('--complexity_score', metadata.complexityScore.toString());
    }

    logInfo('Recording task vector', {
      taskId: metadata.taskId,
      outcome: metadata.outcome,
      pythonPath: pythonExecutable,
      scriptPath,
    });

    // Execute Python script
    return new Promise<RecordingResult>((resolve) => {
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
        const error = `Recording timed out after ${opts.timeoutMs}ms`;
        logWarning('Quality graph recording timeout', {
          taskId: metadata.taskId,
          timeout: opts.timeoutMs,
        });
        span?.setAttribute('error', error);
        span?.setAttribute('timeout', true);
        resolve({ success: false, error });
      }, opts.timeoutMs);

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        const error = `Failed to spawn Python process: ${err.message}`;
        logError('Quality graph recording error', {
          taskId: metadata.taskId,
          error: err.message,
        });
        span?.setAttribute('error', error);
        resolve({ success: false, error });
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code === 0) {
          logInfo('Task vector recorded successfully', { taskId: metadata.taskId });
          span?.setAttribute('success', true);
          resolve({ success: true, exitCode: code ?? undefined });
        } else {
          const error = `Python script exited with code ${code}`;
          logWarning('Quality graph recording failed', {
            taskId: metadata.taskId,
            exitCode: code,
            stderr: stderr.trim(),
          });
          span?.setAttribute('error', error);
          span?.setAttribute('exitCode', code);
          resolve({ success: false, error, exitCode: code ?? undefined });
        }
      });
    });
  });
}

/**
 * Extract recording metadata from task and result artifacts
 *
 * Helper function to convert state machine artifacts into recording metadata.
 *
 * @param task - Task envelope
 * @param artifacts - State machine artifacts
 * @param durationMs - Task duration in milliseconds
 * @returns Recording metadata
 */
export function extractRecordingMetadata(
  task: { id: string; title: string; description?: string },
  artifacts: Record<string, unknown>,
  durationMs?: number
): TaskRecordingMetadata {
  const metadata: TaskRecordingMetadata = {
    taskId: task.id,
    title: task.title,
    description: task.description,
    outcome: 'success', // Default, can be overridden
    durationMs,
  };

  // Extract files touched from implement result
  const implement = artifacts.implement as any;
  if (implement?.filesModified) {
    metadata.filesTouched = Array.isArray(implement.filesModified)
      ? implement.filesModified
      : [implement.filesModified];
  }

  // Extract quality from review result
  const review = artifacts.review as any;
  if (review?.quality) {
    metadata.quality = review.quality;
  }

  return metadata;
}
