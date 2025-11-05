import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Stash Manager
 *
 * Utilities for managing git stash operations.
 * Ensures clean working tree before git operations (pull, rebase, etc).
 *
 * Part of: AFP-S2-GIT-HYGIENE-AUTOPUSH
 */

export interface StashResult {
  stashed: boolean;
  message?: string;
}

/**
 * Ensure working tree is clean by stashing uncommitted changes if needed
 */
export async function ensureCleanTree(cwd: string = process.cwd()): Promise<StashResult> {
  try {
    // Check if tree is clean
    const { stdout } = await execAsync('git status --porcelain', { cwd });

    if (stdout.trim() === '') {
      // Already clean
      return { stashed: false };
    }

    // Stash uncommitted changes
    const timestamp = new Date().toISOString();
    await execAsync(`git stash push -m "Auto-stash before pull/push - ${timestamp}"`, { cwd });

    console.log('✓ Uncommitted changes stashed');
    return { stashed: true, message: `Auto-stash - ${timestamp}` };

  } catch (error) {
    throw new Error(`Failed to ensure clean tree: ${error}`);
  }
}

/**
 * Restore stashed changes if they were stashed
 */
export async function popStashIfNeeded(
  stashed: boolean,
  cwd: string = process.cwd()
): Promise<void> {
  if (!stashed) {
    return;  // Nothing to restore
  }

  try {
    await execAsync('git stash pop', { cwd });
    console.log('✓ Stashed changes restored');

  } catch (error) {
    // Stash pop conflict - requires manual intervention
    console.warn('⚠️  Stash pop conflict detected');
    console.warn('   Manual resolution needed:');
    console.warn('   1. Run: git status');
    console.warn('   2. Resolve conflicts');
    console.warn('   3. Run: git add <files>');
    console.warn('   4. Run: git stash drop  (if conflicts resolved)');
    throw new Error('Stash pop conflict - manual intervention required');
  }
}

/**
 * Check if stash has changes (useful for diagnostics)
 */
export async function hasStashedChanges(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git stash list', { cwd });
    return stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}
