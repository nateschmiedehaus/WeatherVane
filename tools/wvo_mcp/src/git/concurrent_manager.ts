import { exec } from 'child_process';
import { promisify } from 'util';
import { ensureCleanTree, popStashIfNeeded } from './stash_manager.js';

const execAsync = promisify(exec);

/**
 * Concurrent Agent Manager
 *
 * Coordinates multiple agents working on the same repository.
 * Handles pull, rebase, conflict detection, and auto-resolution.
 *
 * Part of: AFP-S2-GIT-HYGIENE-AUTOPUSH
 */

export interface PullResult {
  success: boolean;
  conflicts: boolean;
  conflictedFiles?: string[];
  message: string;
}

export interface ConflictResolutionResult {
  resolved: boolean;
  manualIntervention: boolean;
  message: string;
}

/**
 * Pull latest changes and rebase local commits on top
 */
export async function pullAndRebase(
  branch: string = 'main',
  cwd: string = process.cwd()
): Promise<PullResult> {
  let stashed = false;

  try {
    // 1. Ensure clean tree (stash if needed)
    const stashResult = await ensureCleanTree(cwd);
    stashed = stashResult.stashed;

    // 2. Fetch latest from remote
    await execAsync('git fetch origin', { cwd });

    // 3. Rebase on origin/<branch>
    await execAsync(`git rebase origin/${branch}`, { cwd });

    // 4. Check for conflicts
    const { stdout: status } = await execAsync('git status', { cwd });

    if (status.includes('both modified') || status.includes('both added')) {
      // Conflicts detected
      const conflictedFiles = await getConflictedFiles(cwd);

      return {
        success: false,
        conflicts: true,
        conflictedFiles,
        message: `Rebase conflicts detected (${conflictedFiles.length} files)`
      };
    }

    // 5. Success - restore stash if needed
    await popStashIfNeeded(stashed, cwd);

    return {
      success: true,
      conflicts: false,
      message: 'Pull and rebase successful'
    };

  } catch (error) {
    // Rebase failed - abort and restore stash
    try {
      await execAsync('git rebase --abort', { cwd });
    } catch {
      // Ignore abort errors
    }

    if (stashed) {
      try {
        await popStashIfNeeded(stashed, cwd);
      } catch {
        // Ignore stash pop errors (already logged)
      }
    }

    return {
      success: false,
      conflicts: false,
      message: `Pull/rebase failed: ${error}`
    };
  }
}

/**
 * Get list of conflicted files
 */
async function getConflictedFiles(cwd: string): Promise<string[]> {
  const { stdout } = await execAsync('git status --porcelain', { cwd });

  return stdout
    .split('\n')
    .filter(line => line.startsWith('UU ') || line.startsWith('AA ') || line.startsWith('DD '))
    .map(line => line.substring(3).trim());
}

/**
 * Attempt to auto-resolve conflicts
 */
export async function resolveConflicts(cwd: string = process.cwd()): Promise<ConflictResolutionResult> {
  try {
    const conflictedFiles = await getConflictedFiles(cwd);

    if (conflictedFiles.length === 0) {
      return {
        resolved: true,
        manualIntervention: false,
        message: 'No conflicts to resolve'
      };
    }

    let autoResolved = 0;
    let manualNeeded = 0;

    for (const file of conflictedFiles) {
      const strategy = getResolutionStrategy(file);

      if (strategy === 'ours') {
        // Accept our version
        await execAsync(`git checkout --ours "${file}"`, { cwd });
        await execAsync(`git add "${file}"`, { cwd });
        autoResolved++;

      } else if (strategy === 'theirs') {
        // Accept their version
        await execAsync(`git checkout --theirs "${file}"`, { cwd });
        await execAsync(`git add "${file}"`, { cwd });
        autoResolved++;

        // Special case: package-lock.json - run npm install after
        if (file === 'package-lock.json') {
          console.log('  Running npm install to sync dependencies...');
          await execAsync('npm install', { cwd });
        }

      } else {
        // Manual intervention needed
        manualNeeded++;
      }
    }

    if (manualNeeded > 0) {
      return {
        resolved: false,
        manualIntervention: true,
        message: `Auto-resolved ${autoResolved}/${conflictedFiles.length} conflicts. ${manualNeeded} require manual intervention.`
      };
    }

    // All conflicts auto-resolved - continue rebase
    await execAsync('git rebase --continue', { cwd });

    return {
      resolved: true,
      manualIntervention: false,
      message: `All ${autoResolved} conflicts auto-resolved`
    };

  } catch (error) {
    return {
      resolved: false,
      manualIntervention: true,
      message: `Conflict resolution failed: ${error}`
    };
  }
}

/**
 * Determine resolution strategy for a file
 */
function getResolutionStrategy(file: string): 'ours' | 'theirs' | 'manual' {
  // Generated files: accept ours (local is authoritative)
  if (file.match(/\.(gen|generated)\.(ts|js|json)$/)) {
    return 'ours';
  }

  // Package locks: accept theirs (will npm install after)
  if (file === 'package-lock.json' || file === 'yarn.lock' || file === 'pnpm-lock.yaml') {
    return 'theirs';
  }

  // Everything else: manual intervention
  return 'manual';
}

/**
 * Check if rebase is in progress
 */
export async function isRebaseInProgress(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git status', { cwd });
    return stdout.includes('rebase in progress') || stdout.includes('You are currently rebasing');
  } catch {
    return false;
  }
}
