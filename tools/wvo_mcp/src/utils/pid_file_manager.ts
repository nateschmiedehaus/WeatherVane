/**
 * PID File Manager - Atomic process locking and cleanup
 *
 * Prevents multiple autopilot instances from running simultaneously
 * Handles stale PID files from crashed processes
 * Verifies process identity to prevent killing wrong processes
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface PidFileMetadata {
  pid: number;
  started_at: string;
  workspace: string;
  process_name?: string;
  command_line?: string;
}

export interface ProcessIdentity {
  name: string;
  commandLine: string;
  startTime?: number;
}

/**
 * Check if a process is alive
 * Returns true if process exists, false if not
 */
export function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 checks existence without killing
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ESRCH') {
      // No such process
      return false;
    }
    if (error.code === 'EPERM') {
      // Process exists but we don't have permission (different user)
      // This counts as "alive" for our purposes
      return true;
    }
    // Unknown error, assume alive to be safe
    return true;
  }
}

/**
 * Get process identity (name and command line)
 * Used to verify we're killing the right process
 */
export async function getProcessIdentity(pid: number): Promise<ProcessIdentity | null> {
  try {
    if (process.platform === 'darwin') {
      // macOS: use ps
      const { stdout } = await execAsync(`ps -p ${pid} -o comm=,command=`);
      const lines = stdout.trim().split('\n');
      if (lines.length === 0) {
        return null;
      }
      const parts = lines[0].trim().split(/\s+/, 2);
      return {
        name: parts[0] || '',
        commandLine: parts[1] || '',
      };
    } else if (process.platform === 'linux') {
      // Linux: read /proc
      const cmdline = await fsPromises.readFile(`/proc/${pid}/cmdline`, 'utf-8');
      const args = cmdline.split('\0').filter(Boolean);
      return {
        name: path.basename(args[0] || ''),
        commandLine: args.join(' '),
      };
    } else {
      // Unsupported platform
      return null;
    }
  } catch {
    // Process doesn't exist or can't read
    return null;
  }
}

/**
 * Verify that a process matches expected identity
 * Prevents killing wrong process if PID is reused
 */
export async function verifyProcessIdentity(
  pid: number,
  expectedName: string,
  expectedCommandPattern: RegExp,
): Promise<boolean> {
  const identity = await getProcessIdentity(pid);
  if (!identity) {
    return false;
  }

  // Check process name matches (e.g., "node")
  if (!identity.name.includes(expectedName)) {
    return false;
  }

  // Check command line contains expected pattern (e.g., "unified_orchestrator")
  if (!expectedCommandPattern.test(identity.commandLine)) {
    return false;
  }

  return true;
}

/**
 * Read PID file and parse metadata
 * Returns null if file doesn't exist or is invalid
 */
export async function readPidFile(pidFilePath: string): Promise<PidFileMetadata | null> {
  try {
    const content = await fsPromises.readFile(pidFilePath, 'utf-8');
    const data = JSON.parse(content);

    if (typeof data.pid !== 'number') {
      return null;
    }

    return {
      pid: data.pid,
      started_at: data.started_at || new Date().toISOString(),
      workspace: data.workspace || process.cwd(),
      process_name: data.process_name,
      command_line: data.command_line,
    };
  } catch {
    return null;
  }
}

/**
 * Write PID file atomically with metadata
 * Uses exclusive write flag to prevent race conditions
 */
export async function writePidFile(
  pidFilePath: string,
  metadata: Omit<PidFileMetadata, 'started_at'> & { started_at?: string },
): Promise<void> {
  const fullMetadata: PidFileMetadata = {
    ...metadata,
    started_at: metadata.started_at || new Date().toISOString(),
  };

  const content = JSON.stringify(fullMetadata, null, 2);

  // Ensure parent directory exists
  await fsPromises.mkdir(path.dirname(pidFilePath), { recursive: true });

  try {
    // Use 'wx' flag for exclusive write - fails if file exists
    await fsPromises.writeFile(pidFilePath, content, { flag: 'wx', mode: 0o600 });
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EEXIST') {
      throw new Error(`PID file already exists: ${pidFilePath}`);
    }
    throw error;
  }
}

/**
 * Clean up PID file if process is dead
 * Returns true if cleaned up, false if process is still alive
 */
export async function cleanupPidFileIfDead(pidFilePath: string): Promise<boolean> {
  const metadata = await readPidFile(pidFilePath);
  if (!metadata) {
    // File doesn't exist or is invalid, nothing to clean
    return true;
  }

  if (!isProcessAlive(metadata.pid)) {
    // Process is dead, safe to delete PID file
    try {
      await fsPromises.unlink(pidFilePath);
      return true;
    } catch {
      // Ignore errors (file might have been deleted by another process)
      return true;
    }
  }

  // Process is still alive
  return false;
}

/**
 * Acquire lock by writing PID file
 * Throws if another process is already running
 */
export async function acquireLock(
  pidFilePath: string,
  workspace: string,
): Promise<void> {
  // First, try to clean up stale PID file
  await cleanupPidFileIfDead(pidFilePath);

  // Try to write our PID
  try {
    await writePidFile(pidFilePath, {
      pid: process.pid,
      workspace,
      process_name: 'node',
      command_line: process.argv.join(' '),
    });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message.includes('already exists')) {
      // Another process beat us to it
      const existing = await readPidFile(pidFilePath);
      if (existing) {
        throw new Error(
          `Autopilot already running (PID ${existing.pid}, started ${existing.started_at})\n` +
          `To kill: bash tools/wvo_mcp/scripts/kill_autopilot.sh`,
        );
      }
    }
    throw error;
  }
}

/**
 * Release lock by deleting PID file
 * Safe to call multiple times (idempotent)
 */
export async function releaseLock(pidFilePath: string): Promise<void> {
  try {
    // Verify PID file contains our PID before deleting
    const metadata = await readPidFile(pidFilePath);
    if (metadata && metadata.pid === process.pid) {
      await fsPromises.unlink(pidFilePath);
    }
  } catch {
    // Ignore errors (file might not exist or already deleted)
  }
}

/**
 * Register cleanup handlers to ensure PID file is deleted on exit
 * Handles uncaught exceptions, unhandled rejections, and signals
 */
export function registerCleanupHandlers(pidFilePath: string): void {
  const cleanup = () => {
    try {
      const metadata = readPidFileSync(pidFilePath);
      if (metadata && metadata.pid === process.pid) {
        fs.unlinkSync(pidFilePath);
      }
    } catch {
      // Ignore errors during cleanup
    }
  };

  // Clean up on normal exit
  process.on('exit', cleanup);

  // Clean up on uncaught exception
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    cleanup();
    process.exit(1);
  });

  // Clean up on unhandled rejection
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
    cleanup();
    process.exit(1);
  });

  // Clean up on signals
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGHUP', () => {
    cleanup();
    process.exit(0);
  });
}

/**
 * Synchronous version of readPidFile for use in cleanup handlers
 */
function readPidFileSync(pidFilePath: string): PidFileMetadata | null {
  try {
    const content = fs.readFileSync(pidFilePath, 'utf-8');
    const data = JSON.parse(content);

    if (typeof data.pid !== 'number') {
      return null;
    }

    return {
      pid: data.pid,
      started_at: data.started_at || new Date().toISOString(),
      workspace: data.workspace || process.cwd(),
      process_name: data.process_name,
      command_line: data.command_line,
    };
  } catch {
    return null;
  }
}
