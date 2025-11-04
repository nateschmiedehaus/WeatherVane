/**
 * File Lock Manager - Advisory file locking for concurrent writes
 *
 * Provides exclusive locks for file operations to prevent race conditions
 * in multi-process scenarios (e.g., JSONL append operations).
 *
 * Design:
 * - Uses lock files (path.lock) for advisory locking
 * - Atomic lock acquisition via fs.writeFile with 'wx' flag
 * - Automatic timeout and cleanup
 * - Retry logic for lock contention
 */

import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { logWarning, logError } from '../telemetry/logger.js';

/**
 * Lock acquisition options
 */
export interface LockOptions {
  /** Maximum time to wait for lock (ms) */
  timeout?: number;
  /** Time between retry attempts (ms) */
  retryDelay?: number;
  /** Maximum number of retry attempts */
  maxRetries?: number;
}

/**
 * Default lock options
 */
const DEFAULT_LOCK_OPTIONS: Required<LockOptions> = {
  timeout: 5000,      // 5 seconds
  retryDelay: 50,     // 50ms
  maxRetries: 100     // Up to 5 seconds total (100 * 50ms)
};

/**
 * Lock metadata stored in lock file
 */
interface LockMetadata {
  pid: number;
  hostname: string;
  acquiredAt: string;
}

/**
 * Acquire exclusive lock on a file
 *
 * @param lockPath - Path to lock file
 * @param options - Lock acquisition options
 * @returns True if lock acquired, false if timeout
 */
export async function acquireLock(
  lockPath: string,
  options?: LockOptions
): Promise<boolean> {
  const opts = { ...DEFAULT_LOCK_OPTIONS, ...options };
  const startTime = Date.now();

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      // Check timeout
      if (Date.now() - startTime > opts.timeout) {
        logWarning('Lock acquisition timeout', {
          lockPath,
          attemptedFor: Date.now() - startTime
        });
        return false;
      }

      // Try to acquire lock atomically
      const metadata: LockMetadata = {
        pid: process.pid,
        hostname: process.env.HOSTNAME || 'unknown',
        acquiredAt: new Date().toISOString()
      };

      await fsPromises.mkdir(path.dirname(lockPath), { recursive: true });
      await fsPromises.writeFile(
        lockPath,
        JSON.stringify(metadata, null, 2),
        { flag: 'wx', mode: 0o600 }  // Exclusive create, fail if exists
      );

      // Lock acquired successfully
      return true;

    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;

      if (error.code === 'EEXIST') {
        // Lock held by another process - check if stale
        try {
          const content = await fsPromises.readFile(lockPath, 'utf-8');
          const metadata: LockMetadata = JSON.parse(content);
          const age = Date.now() - new Date(metadata.acquiredAt).getTime();

          // If lock is older than 30 seconds, consider it stale and remove
          if (age > 30000) {
            logWarning('Removing stale lock file', {
              lockPath,
              age,
              holder: metadata
            });
            await fsPromises.unlink(lockPath).catch(() => {});
            continue;  // Retry immediately
          }
        } catch {
          // Invalid lock file - remove and retry
          await fsPromises.unlink(lockPath).catch(() => {});
          continue;
        }

        // Valid lock held by another process - wait and retry
        await sleep(opts.retryDelay);
        continue;
      }

      // Unexpected error
      logError('Lock acquisition error', {
        lockPath,
        error: error.message
      });
      return false;
    }
  }

  logWarning('Lock acquisition failed after max retries', {
    lockPath,
    maxRetries: opts.maxRetries
  });
  return false;
}

/**
 * Release lock on a file
 *
 * @param lockPath - Path to lock file
 */
export async function releaseLock(lockPath: string): Promise<void> {
  try {
    await fsPromises.unlink(lockPath);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') {
      logWarning('Failed to release lock', {
        lockPath,
        error: error.message
      });
    }
  }
}

/**
 * Execute operation with exclusive file lock
 *
 * Acquires lock, executes operation, releases lock.
 * Lock is released even if operation throws.
 *
 * @param lockPath - Path to lock file
 * @param operation - Operation to execute under lock
 * @param options - Lock acquisition options
 * @returns Result of operation
 */
export async function withFileLock<T>(
  lockPath: string,
  operation: () => Promise<T>,
  options?: LockOptions
): Promise<T> {
  const acquired = await acquireLock(lockPath, options);

  if (!acquired) {
    throw new Error(`Failed to acquire lock: ${lockPath}`);
  }

  try {
    return await operation();
  } finally {
    await releaseLock(lockPath);
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
