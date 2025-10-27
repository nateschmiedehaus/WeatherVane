/**
 * Process Cleanup Utility - Kill process trees reliably
 *
 * Handles killing parent process and all children
 * Supports graceful shutdown with timeout → force kill
 * Works on macOS and Linux
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { isProcessAlive } from './pid_file_manager.js';

const execAsync = promisify(exec);

export interface KillOptions {
  signal?: NodeJS.Signals;
  gracefulTimeoutMs?: number;
  forceSignal?: NodeJS.Signals;
}

const DEFAULT_KILL_OPTIONS: Required<KillOptions> = {
  signal: 'SIGTERM',
  gracefulTimeoutMs: 5000,
  forceSignal: 'SIGKILL',
};

/**
 * Wait for process to die, polling with timeout
 * Returns true if process died, false if still alive after timeout
 */
export async function waitForProcessDeath(
  pid: number,
  timeoutMs: number,
  pollIntervalMs: number = 100,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}

/**
 * Kill a single process with signal
 * Returns true if kill signal was sent, false if process doesn't exist
 */
export function killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ESRCH') {
      // Process doesn't exist
      return false;
    }
    // Process exists but we can't kill it (EPERM) - still count as alive
    return true;
  }
}

/**
 * Kill process tree (parent + all children)
 * Uses process group on macOS/Linux
 */
export async function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = 'SIGTERM',
): Promise<void> {
  try {
    if (process.platform === 'win32') {
      // Windows: use taskkill
      await execAsync(`taskkill /pid ${pid} /T /F`);
    } else {
      // macOS/Linux: kill process group
      // Negative PID kills the entire process group
      process.kill(-pid, signal);
    }
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ESRCH') {
      // Process/group doesn't exist, already dead
      return;
    }
    // Log but don't throw - process might be dead already
    console.warn(`Failed to kill process tree ${pid}:`, error.message);
  }
}

/**
 * Ensure process is dead - send SIGTERM, wait, then SIGKILL if needed
 * Returns true if process was killed, false if already dead
 */
export async function ensureProcessDead(
  pid: number,
  options: KillOptions = {},
): Promise<boolean> {
  const opts = { ...DEFAULT_KILL_OPTIONS, ...options };

  // Check if already dead
  if (!isProcessAlive(pid)) {
    return false;
  }

  // Try graceful kill first
  killProcess(pid, opts.signal);

  // Wait for graceful shutdown
  const diedGracefully = await waitForProcessDeath(pid, opts.gracefulTimeoutMs);

  if (diedGracefully) {
    return true;
  }

  // Process didn't die, force kill
  killProcess(pid, opts.forceSignal);

  // Wait up to 1 second for force kill
  const diedForced = await waitForProcessDeath(pid, 1000);

  return diedForced;
}

/**
 * Get all child PIDs of a process
 * Returns array of child PIDs
 */
export async function getChildProcesses(parentPid: number): Promise<number[]> {
  try {
    if (process.platform === 'darwin') {
      // macOS: use pgrep
      const { stdout } = await execAsync(`pgrep -P ${parentPid}`);
      return stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(pid => parseInt(pid, 10));
    } else if (process.platform === 'linux') {
      // Linux: read /proc
      const { stdout } = await execAsync(
        `ps -o pid= --ppid ${parentPid}`,
      );
      return stdout
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(pid => parseInt(pid, 10));
    } else {
      // Unsupported platform
      return [];
    }
  } catch {
    // No children or error
    return [];
  }
}

/**
 * Kill all child processes recursively
 * Walks process tree depth-first
 */
export async function killChildProcessesRecursive(
  parentPid: number,
  options: KillOptions = {},
): Promise<number> {
  const children = await getChildProcesses(parentPid);
  let killedCount = 0;

  // Recursively kill children's children first (depth-first)
  for (const childPid of children) {
    killedCount += await killChildProcessesRecursive(childPid, options);
  }

  // Then kill direct children
  for (const childPid of children) {
    const killed = await ensureProcessDead(childPid, options);
    if (killed) {
      killedCount++;
    }
  }

  return killedCount;
}

/**
 * Clean up all child processes of current process
 * Use before process exit to ensure no orphans
 */
export async function cleanupChildProcesses(options: KillOptions = {}): Promise<void> {
  const killedCount = await killChildProcessesRecursive(process.pid, options);

  if (killedCount > 0) {
    console.log(`Cleaned up ${killedCount} child processes`);
  }
}

/**
 * Find processes by name/pattern
 * Returns array of PIDs
 */
export async function findProcessesByPattern(
  namePattern: RegExp,
  commandPattern?: RegExp,
): Promise<number[]> {
  try {
    let stdout: string;

    if (process.platform === 'darwin') {
      // macOS: use ps
      const result = await execAsync('ps -A -o pid=,comm=,command=');
      stdout = result.stdout;
    } else if (process.platform === 'linux') {
      // Linux: use ps
      const result = await execAsync('ps -A -o pid=,comm=,cmd=');
      stdout = result.stdout;
    } else {
      return [];
    }

    const lines = stdout.trim().split('\n');
    const pids: number[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) {
        continue;
      }

      const pid = parseInt(parts[0], 10);
      const comm = parts[1];
      const cmd = parts.slice(2).join(' ');

      // Match name pattern
      if (!namePattern.test(comm)) {
        continue;
      }

      // Match command pattern if provided
      if (commandPattern && !commandPattern.test(cmd)) {
        continue;
      }

      pids.push(pid);
    }

    return pids;
  } catch {
    return [];
  }
}

/**
 * Kill all autopilot processes (emergency cleanup)
 * Finds processes by name/command pattern
 */
export async function killAllAutopilotProcesses(options: KillOptions = {}): Promise<number> {
  // Find all node processes running unified_orchestrator
  const pids = await findProcessesByPattern(
    /node/,
    /unified_orchestrator/,
  );

  let killedCount = 0;

  for (const pid of pids) {
    // Don't kill ourselves!
    if (pid === process.pid) {
      continue;
    }

    const killed = await ensureProcessDead(pid, options);
    if (killed) {
      killedCount++;
    }
  }

  return killedCount;
}
